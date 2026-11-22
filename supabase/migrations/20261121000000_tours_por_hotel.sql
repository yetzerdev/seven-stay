-- =============================================================================
-- Seven Stay · Tours propios del hotel
--
-- Cambio de planes: cada hotel elige qué tours ve el huésped en su portal.
--   hotels.modo_tours = 'seven_stay' → solo los tours de Seven Stay (como antes)
--                     = 'propios'    → solo los tours del propio hotel
--                     = 'ambos'      → los dos, cada uno con su etiqueta
--
--  * curated_tours.hotel_id: null = tour de Seven Stay; con valor = tour propio
--    de ese hotel. Los propios los crea y edita solo Supervisor / Gerente.
--  * tickets.tour_propio: la reserva de un tour propio entra al Centro de
--    Control del hotel (se paga en recepción). Los tours de Seven Stay siguen
--    fuera del panel y van al Agente Oficial por WhatsApp (tour_bookings).
--
-- Ejecutar después de 20261120000200_categorias_menu.sql.
-- =============================================================================

alter table public.hotels
  add column if not exists modo_tours text not null default 'seven_stay'
    check (modo_tours in ('seven_stay', 'propios', 'ambos'));

alter table public.curated_tours
  add column if not exists hotel_id uuid references public.hotels (id) on delete cascade;
create index if not exists curated_tours_hotel_idx on public.curated_tours (hotel_id);

alter table public.tickets
  add column if not exists tour_propio boolean not null default false;

-- -----------------------------------------------------------------------------
-- ¿El portal de este hotel ofrece este tour? (modo del hotel + dueño del tour)
-- -----------------------------------------------------------------------------

create or replace function public.tour_permitido(p_modo text, p_tour_hotel uuid, p_hotel uuid)
returns boolean language sql immutable as $$
  select case
    when p_tour_hotel is null then p_modo in ('seven_stay', 'ambos')
    else p_tour_hotel = p_hotel and p_modo in ('propios', 'ambos')
  end
$$;

-- -----------------------------------------------------------------------------
-- RLS y permisos de curated_tours
-- -----------------------------------------------------------------------------

-- Público: tours activos (el portal filtra por hotel y modo; crear_ticket lo exige).
-- Personal: además ve los tours propios de su hotel aunque estén inactivos.
-- Escritura: solo gerencia, solo tours de su hotel. Los de Seven Stay, solo service_role.
drop policy if exists tours_staff_select on public.curated_tours;
drop policy if exists tours_gerencia_write on public.curated_tours;
create policy tours_staff_select on public.curated_tours for select to authenticated
  using (hotel_id = public.mi_hotel_id());
create policy tours_gerencia_write on public.curated_tours for all to authenticated
  using (hotel_id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente')
  with check (hotel_id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente');

grant insert, update, delete on public.curated_tours to authenticated;

-- El modo de tours lo cambia gerencia (la política hotels_gerencia_update ya lo limita).
grant update (modo_tours) on public.hotels to authenticated;

-- -----------------------------------------------------------------------------
-- Tickets: el personal ve también las reservas de tours propios
-- -----------------------------------------------------------------------------

drop policy if exists tickets_staff_select on public.tickets;
create policy tickets_staff_select on public.tickets for select to authenticated
  using (hotel_id = public.mi_hotel_id() and (categoria <> 'tour' or tour_propio));

-- -----------------------------------------------------------------------------
-- crear_ticket (misma firma: conserva los permisos)
-- Cambios: el tour debe estar permitido por el modo del hotel; un tour propio
-- marca tour_propio, cuenta en el límite de abiertas y no crea tour_booking.
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
  v_uid         uuid := auth.uid();
  v_room        public.rooms;
  v_ticket      public.tickets;
  v_vigente     boolean;
  v_codigo      text;
  v_intentos    int := 0;
  v_idioma      text := case when p_idioma = 'en' then 'en' else 'es' end;
  v_nota        text := nullif(trim(coalesce(p_nota, '')), '');
  v_hk          jsonb := null;
  v_mant        jsonb := null;
  v_detalle     jsonb := null;
  v_hist        jsonb;
  v_item_id     text;
  v_cantidad    int;
  v_titulo      text;
  v_precio      numeric;
  v_moneda      text;
  v_sub         text;
  v_foto        text;
  v_modo        text;
  v_tour_hotel  uuid;
  v_tour_propio boolean := false;
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
      select modo_tours into v_modo from public.hotels where id = v_room.hotel_id;
      select case when v_idioma = 'en' then t.titulo_en else t.titulo_es end, t.precio, t.moneda, t.hotel_id
        into v_titulo, v_precio, v_moneda, v_tour_hotel
        from public.curated_tours t
        where t.id::text = v_item_id and t.activo
          and public.tour_permitido(v_modo, t.hotel_id, v_room.hotel_id);
      v_tour_propio := v_tour_hotel is not null;
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

  -- Anti-abuso 2: máx. 3 solicitudes abiertas a la vez por habitación.
  -- Los tours de Seven Stay no cuentan (quedan abiertos hasta que Seven Stay los
  -- gestiona); los tours propios sí, porque los atiende el hotel.
  if (p_categoria <> 'tour' or v_tour_propio) and (select count(*) from public.tickets
      where room_id = v_room.id and (categoria <> 'tour' or tour_propio)
        and estado in ('pendiente_validacion_hab', 'abierto', 'aceptado', 'pospuesto_silencio')) >= 3 then
    raise exception 'limite_abiertas';
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
    idioma_huesped, nota, detalle_housekeeping, detalle_mantenimiento, detalle_catalogo, historial, creado_por,
    tour_propio)
  values (
    v_room.hotel_id, v_room.id, v_room.numero, v_codigo, p_idempotency_key, p_categoria,
    case when v_vigente then 'abierto' else 'pendiente_validacion_hab' end, coalesce(p_urgente, false),
    v_idioma, v_nota, v_hk, v_mant, v_detalle, v_hist, v_uid, v_tour_propio)
  returning * into v_ticket;

  if not v_vigente and v_room.estadia_estado is distinct from 'pendiente_confirmacion' then
    update public.rooms
      set estadia_id = gen_random_uuid(), estadia_estado = 'pendiente_confirmacion', estadia_expira_at = null
      where id = v_room.id;
  end if;

  -- Solo los tours de Seven Stay se registran como reserva para Seven Stay (con el precio real).
  if p_categoria = 'tour' and not v_tour_propio then
    insert into public.tour_bookings (ticket_id, tour_id, hotel_id, habitacion_numero, personas, precio_unitario, moneda, voucher_codigo)
    values (v_ticket.id, v_item_id::uuid, v_room.hotel_id, v_room.numero, v_cantidad, v_precio, v_moneda,
            v_detalle ->> 'voucher_codigo');
  end if;

  return v_ticket;
end $$;

-- -----------------------------------------------------------------------------
-- Acciones del personal: los tours propios se atienden como cualquier solicitud
-- (misma firma: conservan los permisos)
-- -----------------------------------------------------------------------------

create or replace function public.staff_aceptar_ticket(p_ticket uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.tickets;
  v_nombre text;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' and not v.tour_propio then raise exception 'Los tours de Seven Stay los gestiona Seven Stay'; end if;
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
  if (v.categoria = 'tour' and not v.tour_propio)
     or v.estado in ('resuelto', 'rechazado', 'cancelado', 'pendiente_validacion_hab') then return; end if;
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
  if (v.categoria = 'tour' and not v.tour_propio)
     or v.estado in ('resuelto', 'rechazado', 'cancelado') or v.en_alerta_servicio then return; end if;
  update public.tickets
    set en_alerta_servicio = true, urgente = true,
        historial = historial || jsonb_build_array(public.evento('escalado', 'recepcion',
          case when nullif(trim(coalesce(p_motivo, '')), '') is not null then 'Motivo: ' || left(trim(p_motivo), 160) end))
  where id = p_ticket;
end $$;

create or replace function public.staff_rechazar_ticket(p_ticket uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if (v.categoria = 'tour' and not v.tour_propio) or v.estado in ('resuelto', 'rechazado', 'cancelado') then return; end if;
  update public.tickets
    set estado = 'rechazado', en_alerta_servicio = false,
        historial = historial || jsonb_build_array(public.evento('rechazado', 'recepcion',
          case when nullif(trim(coalesce(p_motivo, '')), '') is not null then 'Motivo: ' || left(trim(p_motivo), 160) end))
  where id = p_ticket;
end $$;

revoke execute on function public.tour_permitido(text, uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- El portal necesita el modo de tours del hotel (misma firma: conserva los permisos)
-- -----------------------------------------------------------------------------

create or replace function public.portal_por_codigo(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hotel', jsonb_build_object(
      'id', h.id, 'nombre', h.nombre, 'logo_url', h.logo_url, 'color_primario', h.color_primario,
      'telefono_recepcion', h.telefono_recepcion, 'wifi_ssid', h.wifi_ssid, 'wifi_password', h.wifi_password,
      'moneda_default', h.moneda_default, 'zona_horaria', h.zona_horaria, 'hora_checkout', to_char(h.hora_checkout, 'HH24:MI'),
      'hora_silencio_inicio', to_char(h.hora_silencio_inicio, 'HH24:MI'), 'hora_silencio_fin', to_char(h.hora_silencio_fin, 'HH24:MI'),
      'horario_desayuno', h.horario_desayuno, 'horario_piscina', h.horario_piscina,
      'notas_info_es', h.notas_info_es, 'notas_info_en', h.notas_info_en,
      'google_review_url', h.google_review_url, 'tripadvisor_url', h.tripadvisor_url,
      'modo_tours', h.modo_tours),
    'habitacion', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'codigo_placa', r.codigo_placa, 'estado_placa', r.estado_placa,
      'estadia_activa', case when r.estadia_estado is null then null else jsonb_build_object(
        'id', r.estadia_id, 'estado', r.estadia_estado, 'expira_at', r.estadia_expira_at) end))
  from public.rooms r join public.hotels h on h.id = r.hotel_id
  where r.codigo_placa = p_codigo
$$;

-- Realtime: el panel refresca los tours propios cuando cambian.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'curated_tours') then
    alter publication supabase_realtime add table public.curated_tours;
  end if;
end $$;
