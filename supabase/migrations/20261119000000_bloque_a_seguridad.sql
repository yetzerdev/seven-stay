-- =============================================================================
-- Seven Stay · Bloque A (pre-lanzamiento) · Seguridad y operación
--
--  1. Precios del lado del servidor: crear_ticket ignora precio/moneda/título
--     del cliente y los lee de curated_tours o menu_items.
--  2. Anti-abuso en crear_ticket: nota ≤ 300 caracteres, máx. 3 solicitudes
--     abiertas por habitación y máx. 10 por hora por sesión o habitación.
--  3. Fotos de mantenimiento en Supabase Storage (bucket privado, ≤ 2 MB,
--     solo imágenes). El ticket guarda la ruta, ya no la imagen en base64.
--  4. Estados nuevos: "Rechazar" (recepción/gerencia, spam o duplicado) y
--     "Cancelar" (huésped, solo mientras está abierta) → estado `cancelado`.
--  5. Permisos: solo Supervisor / Gerente edita el hotel; en hotel_staff
--     nadie puede cambiar rol, user_id ni hotel_id desde la app.
--
-- Ejecutar DESPUÉS de 20261118000000 y 20261118000100. Se puede correr una vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estado `cancelado`
-- -----------------------------------------------------------------------------

alter table public.tickets drop constraint if exists tickets_estado_check;
alter table public.tickets add constraint tickets_estado_check check (
  estado in ('pendiente_validacion_hab', 'abierto', 'aceptado', 'pospuesto_silencio', 'resuelto', 'rechazado', 'cancelado'));

create index if not exists tickets_room_creado_idx on public.tickets (room_id, creado_at desc);

-- -----------------------------------------------------------------------------
-- exigir_staff: un recurso inexistente (hotel null) también se rechaza
-- -----------------------------------------------------------------------------

create or replace function public.exigir_staff(p_hotel uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_hotel is null or public.mi_hotel_id() is distinct from p_hotel then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- crear_ticket (misma firma: conserva los permisos)
-- -----------------------------------------------------------------------------

create or replace function public.crear_ticket(
  p_codigo                text,
  p_categoria             text,
  p_idempotency_key       text,
  p_urgente               boolean default false,
  p_nota                  text default null,
  p_idioma                text default 'es',
  p_detalle_housekeeping  jsonb default null,
  p_detalle_mantenimiento jsonb default null,
  p_detalle_catalogo      jsonb default null
) returns public.tickets
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_room      public.rooms;
  v_ticket    public.tickets;
  v_vigente   boolean;
  v_codigo    text;
  v_intentos  int := 0;
  v_idioma    text := case when p_idioma = 'en' then 'en' else 'es' end;
  v_nota      text := nullif(trim(coalesce(p_nota, '')), '');
  v_hk        jsonb := null;
  v_mant      jsonb := null;
  v_detalle   jsonb := null;
  v_hist      jsonb;
  v_item_id   text;
  v_cantidad  int;
  v_titulo    text;
  v_precio    numeric;
  v_moneda    text;
  v_sub       text;
  v_foto      text;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (anónima) del huésped' using errcode = '42501';
  end if;

  -- Reenvío del mismo formulario por la misma sesión: mismo ticket.
  select * into v_ticket from public.tickets where idempotency_key = p_idempotency_key and creado_por = v_uid;
  if found then
    return v_ticket;
  end if;

  -- Validación de entrada
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'solicitud_invalida';
  end if;
  if p_categoria is null or p_categoria not in ('housekeeping', 'mantenimiento', 'tour', 'room_service') then
    raise exception 'solicitud_invalida';
  end if;
  if char_length(coalesce(v_nota, '')) > 300 then
    raise exception 'nota_muy_larga';
  end if;

  -- La fila de la habitación queda bloqueada: los límites se cuentan sin carreras.
  select * into v_room from public.rooms where codigo_placa = p_codigo for update;
  if not found then raise exception 'habitacion_no_encontrada'; end if;
  if v_room.estado_placa <> 'activa' then raise exception 'placa_no_activa'; end if;

  -- Anti-abuso 1: máx. 10 solicitudes por hora por sesión o por habitación.
  if (select count(*) from public.tickets
      where creado_at > now() - interval '1 hour'
        and (creado_por = v_uid or room_id = v_room.id)) >= 10 then
    raise exception 'limite_por_hora';
  end if;

  -- Anti-abuso 2: máx. 3 solicitudes abiertas a la vez por habitación.
  -- Los tours no cuentan: quedan abiertos hasta que Seven Stay los gestiona.
  if p_categoria <> 'tour' and (select count(*) from public.tickets
      where room_id = v_room.id and categoria <> 'tour'
        and estado in ('pendiente_validacion_hab', 'abierto', 'aceptado', 'pospuesto_silencio')) >= 3 then
    raise exception 'limite_abiertas';
  end if;

  -- Detalle según la categoría (solo se guarda lo que corresponde)
  if p_categoria = 'housekeeping' then
    if p_detalle_housekeeping is null or jsonb_typeof(p_detalle_housekeeping) <> 'object'
       or pg_column_size(p_detalle_housekeeping) > 2048 then
      raise exception 'solicitud_invalida';
    end if;
    v_hk := p_detalle_housekeeping;

  elsif p_categoria = 'mantenimiento' then
    v_sub := p_detalle_mantenimiento ->> 'subcategoria';
    if v_sub is null or v_sub not in ('aire_acondicionado', 'agua_bano', 'wifi_tv', 'luz_enchufes', 'cerradura', 'otro') then
      raise exception 'solicitud_invalida';
    end if;
    -- La foto vive en Storage: solo se acepta una ruta de ESTE hotel y ESTA sesión.
    v_foto := nullif(p_detalle_mantenimiento ->> 'foto_path', '');
    if v_foto is not null
       and v_foto !~ ('^' || v_room.hotel_id::text || '/' || v_uid::text || '/[A-Za-z0-9_-]{8,100}\.jpg$') then
      raise exception 'solicitud_invalida';
    end if;
    v_mant := jsonb_build_object('subcategoria', v_sub, 'foto_path', v_foto);

  else
    -- Tour o room service: precio, moneda y título salen de la base, nunca del cliente.
    v_item_id := p_detalle_catalogo ->> 'catalogo_item_id';
    v_cantidad := case when (p_detalle_catalogo ->> 'cantidad') ~ '^[0-9]{1,2}$'
                       then (p_detalle_catalogo ->> 'cantidad')::int end;
    if v_item_id is null or v_cantidad is null or v_cantidad not between 1 and 20 then
      raise exception 'solicitud_invalida';
    end if;

    if p_categoria = 'tour' then
      select case when v_idioma = 'en' then t.titulo_en else t.titulo_es end, t.precio, t.moneda
        into v_titulo, v_precio, v_moneda
        from public.curated_tours t where t.id::text = v_item_id and t.activo;
    else
      select case when v_idioma = 'en' then m.titulo_en else m.titulo_es end, m.precio, m.moneda
        into v_titulo, v_precio, v_moneda
        from public.menu_items m where m.id::text = v_item_id and m.hotel_id = v_room.hotel_id and m.activo;
    end if;
    if not found then raise exception 'item_no_disponible'; end if;

    v_detalle := jsonb_build_object(
      'catalogo_item_id', v_item_id, 'titulo', v_titulo, 'cantidad', v_cantidad,
      'precio', v_precio, 'moneda', v_moneda);
  end if;

  v_vigente := public.estadia_vigente(v_room);

  -- Código corto de 3 dígitos, único entre los activos del hotel.
  loop
    v_intentos := v_intentos + 1;
    v_codigo := (100 + floor(random() * 900))::int::text;
    exit when not exists (
      select 1 from public.tickets
      where hotel_id = v_room.hotel_id and codigo_corto = v_codigo
        and estado not in ('resuelto', 'rechazado', 'cancelado'));
    if v_intentos >= 50 then raise exception 'sin_codigo_disponible'; end if;
  end loop;

  if v_detalle is not null then
    v_detalle := v_detalle || jsonb_build_object('voucher_codigo', '7STAY-' || v_room.numero || '-' || v_codigo);
  end if;

  v_hist := jsonb_build_array(public.evento('creado', 'huesped', case when p_urgente then 'Marcado como urgente' end));
  if not v_vigente then
    v_hist := v_hist || jsonb_build_array(public.evento('pendiente_validacion', 'sistema', 'La habitación figuraba vacía'));
  end if;

  insert into public.tickets (
    hotel_id, room_id, habitacion_numero, codigo_corto, idempotency_key, categoria, estado, urgente,
    idioma_huesped, nota, detalle_housekeeping, detalle_mantenimiento, detalle_catalogo, historial, creado_por)
  values (
    v_room.hotel_id, v_room.id, v_room.numero, v_codigo, p_idempotency_key, p_categoria,
    case when v_vigente then 'abierto' else 'pendiente_validacion_hab' end, coalesce(p_urgente, false),
    v_idioma, v_nota, v_hk, v_mant, v_detalle, v_hist, v_uid)
  returning * into v_ticket;

  if not v_vigente and v_room.estadia_estado is distinct from 'pendiente_confirmacion' then
    update public.rooms
      set estadia_id = gen_random_uuid(), estadia_estado = 'pendiente_confirmacion', estadia_expira_at = null
      where id = v_room.id;
  end if;

  -- Los tours se registran también como reserva para Seven Stay (con el precio real).
  if p_categoria = 'tour' then
    insert into public.tour_bookings (ticket_id, tour_id, hotel_id, habitacion_numero, personas, precio_unitario, moneda, voucher_codigo)
    values (v_ticket.id, v_item_id::uuid, v_room.hotel_id, v_room.numero, v_cantidad, v_precio, v_moneda,
            v_detalle ->> 'voucher_codigo');
  end if;

  return v_ticket;
end $$;

-- -----------------------------------------------------------------------------
-- Funciones existentes: `cancelado` también es un estado final
-- -----------------------------------------------------------------------------

create or replace function public.escalar_ticket_huesped(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tickets
    set en_alerta_servicio = true, urgente = true,
        historial = historial || jsonb_build_array(public.evento('escalado', 'huesped', 'Demora notificada a Gerencia'))
  where id = p_ticket and creado_por = auth.uid()
    and estado not in ('resuelto', 'rechazado', 'cancelado') and not en_alerta_servicio;
end $$;

-- Cualquier persona de recepción o gerencia acepta: ya no depende de quién está "en turno".
-- Si no se elige a nadie, queda a nombre de quien aceptó.
create or replace function public.staff_aceptar_ticket(p_ticket uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.tickets;
  v_nombre text;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' then raise exception 'Los tours los gestiona Seven Stay'; end if;
  if v.estado not in ('abierto', 'pospuesto_silencio') then return; end if;
  v_nombre := left(coalesce(nullif(trim(coalesce(p_nombre, '')), ''),
                            (select nombre from public.hotel_staff where user_id = auth.uid() limit 1),
                            'Recepción'), 80);
  update public.tickets
    set estado = 'aceptado', aceptado_at = now(), asignado_a_nombre = v_nombre,
        historial = historial || jsonb_build_array(public.evento('aceptado', 'recepcion', 'Asignado a ' || v_nombre))
  where id = p_ticket;
end $$;

create or replace function public.staff_resolver_ticket(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' or v.estado in ('resuelto', 'rechazado', 'cancelado', 'pendiente_validacion_hab') then return; end if;
  update public.tickets
    set estado = 'resuelto', resuelto_at = now(), en_alerta_servicio = false,
        aceptado_at = coalesce(aceptado_at, now()),
        historial = historial || jsonb_build_array(public.evento('resuelto', 'recepcion',
          case when v.asignado_a_nombre is not null then 'Atendido por ' || v.asignado_a_nombre end))
  where id = p_ticket;
end $$;

create or replace function public.staff_escalar_ticket(p_ticket uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' or v.estado in ('resuelto', 'rechazado', 'cancelado') or v.en_alerta_servicio then return; end if;
  update public.tickets
    set en_alerta_servicio = true, urgente = true,
        historial = historial || jsonb_build_array(public.evento('escalado', 'recepcion',
          case when nullif(trim(coalesce(p_motivo, '')), '') is not null then 'Motivo: ' || left(trim(p_motivo), 160) end))
  where id = p_ticket;
end $$;

-- -----------------------------------------------------------------------------
-- Nuevas acciones
-- -----------------------------------------------------------------------------

-- Recepción / gerencia rechaza una solicitud (spam, duplicada, no procede).
create or replace function public.staff_rechazar_ticket(p_ticket uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' or v.estado in ('resuelto', 'rechazado', 'cancelado') then return; end if;
  update public.tickets
    set estado = 'rechazado', en_alerta_servicio = false,
        historial = historial || jsonb_build_array(public.evento('rechazado', 'recepcion',
          case when nullif(trim(coalesce(p_motivo, '')), '') is not null then 'Motivo: ' || left(trim(p_motivo), 160) end))
  where id = p_ticket;
end $$;

-- El huésped cancela su propia solicitud mientras nadie la ha tomado.
create or replace function public.cancelar_ticket_huesped(p_ticket uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  update public.tickets
    set estado = 'cancelado', en_alerta_servicio = false,
        historial = historial || jsonb_build_array(public.evento('cancelado', 'huesped', 'Cancelada por el huésped'))
  where id = p_ticket and creado_por = auth.uid() and estado = 'abierto'
  returning * into v;
  if not found then return false; end if;
  if v.categoria = 'tour' then
    update public.tour_bookings set estado = 'cancelado' where ticket_id = v.id and estado = 'pendiente_pago';
  end if;
  return true;
end $$;

-- Las funciones nuevas nacen ejecutables por todos: se cierran y se abre solo lo necesario.
revoke execute on function public.staff_rechazar_ticket(uuid, text) from public, anon, authenticated;
revoke execute on function public.cancelar_ticket_huesped(uuid) from public, anon, authenticated;
grant execute on function public.staff_rechazar_ticket(uuid, text) to authenticated;
grant execute on function public.cancelar_ticket_huesped(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos: hotel y personal
-- -----------------------------------------------------------------------------

-- Hotel: solo Supervisor / Gerente lo edita, y solo columnas de configuración.
drop policy if exists hotels_staff_update on public.hotels;
drop policy if exists hotels_gerencia_update on public.hotels;
create policy hotels_gerencia_update on public.hotels for update to authenticated
  using (id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente')
  with check (id = public.mi_hotel_id());

revoke update on public.hotels from authenticated;
grant update (
  nombre, logo_url, color_primario, telefono_recepcion, whatsapp_reception, wifi_ssid, wifi_password,
  moneda_default, zona_horaria, hora_checkout, hora_silencio_inicio, hora_silencio_fin,
  horario_desayuno, horario_piscina, notas_info_es, notas_info_en, google_review_url, tripadvisor_url
) on public.hotels to authenticated;

-- Personal: gerencia edita datos de turno y contacto; nunca rol, user_id ni hotel_id.
revoke update on public.hotel_staff from authenticated;
grant update (nombre, telefono_whatsapp, en_turno, turno_inicio_hora) on public.hotel_staff to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: fotos de mantenimiento
-- Ruta: {hotel_id}/{usuario_anonimo}/{clave}.jpg
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-mantenimiento', 'fotos-mantenimiento', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_huesped_subir on storage.objects;
drop policy if exists fotos_leer on storage.objects;

-- El huésped solo sube dentro de su propia carpeta.
create policy fotos_huesped_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-mantenimiento' and (storage.foldername(name))[2] = auth.uid()::text);

-- La ve quien la subió y el personal del hotel dueño de la carpeta.
create policy fotos_leer on storage.objects for select to authenticated
  using (bucket_id = 'fotos-mantenimiento' and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[1] = public.mi_hotel_id()::text));
