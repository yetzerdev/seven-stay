-- =============================================================================
-- Seven Stay · Las solicitudes pertenecen a una estadía
--
-- Al hacer check-out (o al vencer la estadía) el portal del huésped deja de
-- mostrar las solicitudes de esa estadía: quien llegue después a la habitación
-- nunca ve lo que pidió el huésped anterior, aunque use el mismo teléfono.
-- El panel del hotel conserva todo el historial.
--
--  * tickets.estadia_id: la estadía en la que se creó la solicitud.
--  * El huésped solo ve sus solicitudes de la estadía ACTUAL de la habitación
--    (vigente o esperando check-in). Lo exige la base de datos (RLS).
--  * Un check-in sobre una estadía vencida abre una estadía nueva.
--
-- Ejecutar después de 20261121000000_tours_por_hotel.sql.
-- =============================================================================

alter table public.tickets add column if not exists estadia_id uuid;
create index if not exists tickets_room_estadia_idx on public.tickets (room_id, estadia_id);

-- Solicitudes abiertas de estadías en curso: quedan en la estadía actual.
update public.tickets t
  set estadia_id = r.estadia_id
  from public.rooms r
  where t.room_id = r.id and t.estadia_id is null and r.estadia_id is not null
    and t.estado in ('pendiente_validacion_hab', 'abierto', 'aceptado', 'pospuesto_silencio');

-- -----------------------------------------------------------------------------
-- ¿La solicitud es de la estadía actual de su habitación?
-- (security definer: el huésped no puede leer la tabla rooms)
-- -----------------------------------------------------------------------------

create or replace function public.es_estadia_actual(p_room uuid, p_estadia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.estadia_id = p_estadia
      and (r.estadia_estado = 'pendiente_confirmacion'
           or (r.estadia_estado = 'activa' and (r.estadia_expira_at is null or r.estadia_expira_at > now())))
    from public.rooms r where r.id = p_room), false)
$$;

revoke execute on function public.es_estadia_actual(uuid, uuid) from public, anon, authenticated;
grant execute on function public.es_estadia_actual(uuid, uuid) to authenticated;

drop policy if exists tickets_huesped_select on public.tickets;
create policy tickets_huesped_select on public.tickets for select to authenticated
  using (creado_por = auth.uid() and estadia_id is not null and public.es_estadia_actual(room_id, estadia_id));

-- -----------------------------------------------------------------------------
-- crear_ticket (misma firma: conserva los permisos): guarda la estadía
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
  v_estadia     uuid;
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
  -- Estadía a la que pertenece la solicitud: la vigente, la que ya espera check-in,
  -- o una nueva (habitación vacía o con la estadía anterior vencida).
  v_estadia := case
    when (v_vigente or v_room.estadia_estado = 'pendiente_confirmacion') and v_room.estadia_id is not null then v_room.estadia_id
    else gen_random_uuid() end;

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
    tour_propio, estadia_id)
  values (
    v_room.hotel_id, v_room.id, v_room.numero, v_codigo, p_idempotency_key, p_categoria,
    case when v_vigente then 'abierto' else 'pendiente_validacion_hab' end, coalesce(p_urgente, false),
    v_idioma, v_nota, v_hk, v_mant, v_detalle, v_hist, v_uid, v_tour_propio, v_estadia)
  returning * into v_ticket;

  if not v_vigente and v_room.estadia_estado is distinct from 'pendiente_confirmacion' then
    update public.rooms
      set estadia_id = v_estadia, estadia_estado = 'pendiente_confirmacion', estadia_expira_at = null
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
-- Check-in: si la estadía anterior ya venció (nadie hizo check-out), se abre
-- una nueva; así el huésped nuevo no hereda las solicitudes del anterior.
-- -----------------------------------------------------------------------------

create or replace function public.staff_activar_estadia(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  perform public.exigir_staff(r.hotel_id);
  if r.estado_placa <> 'activa' then raise exception 'placa_no_activa'; end if;
  update public.rooms
    set estadia_id = case
          when r.estadia_id is not null and (r.estadia_estado = 'pendiente_confirmacion' or public.estadia_vigente(r)) then r.estadia_id
          else gen_random_uuid() end,
        estadia_estado = 'activa',
        estadia_expira_at = public.vencimiento_estadia(r.hotel_id)
  where id = p_room;
  update public.tickets
    set estado = 'abierto', historial = historial || jsonb_build_array(public.evento('validacion_aprobada', 'recepcion'))
  where room_id = p_room and estado = 'pendiente_validacion_hab';
end $$;
