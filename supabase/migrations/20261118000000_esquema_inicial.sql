-- =============================================================================
-- Seven Stay · Fase 1 · Esquema inicial (Supabase / PostgreSQL)
--
-- Modelo de acceso:
--   * Huésped: inicio de sesión ANÓNIMO de Supabase (cada teléfono = un usuario
--     anónimo). Solo ve las solicitudes que él creó (tickets.creado_por).
--   * Personal del hotel: usuario con correo, vinculado en hotel_staff.user_id
--     con su rol. Ve solo su hotel y nunca los tours (son de Seven Stay).
--   * Seven Stay: usa la service_role (salta RLS) para tours, reservas y placas.
--
-- Los cambios de estado pasan por funciones SECURITY DEFINER para que las
-- reglas (Opción C, idempotencia, historial/trazabilidad) no se puedan saltar
-- desde el navegador.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

create table public.hotels (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  logo_url              text not null default '',
  color_primario        text not null default '#0E7490',
  telefono_recepcion    text not null default '',
  whatsapp_reception    text,                                  -- Fase 2: bot de WhatsApp
  wifi_ssid             text not null default '',
  wifi_password         text not null default '',
  moneda_default        text not null default 'HNL' check (moneda_default in ('HNL', 'USD')),
  zona_horaria          text not null default 'America/Tegucigalpa',
  hora_checkout         time not null default '12:00',
  hora_silencio_inicio  time not null default '22:00',
  hora_silencio_fin     time not null default '06:00',
  horario_desayuno      text not null default '',
  horario_piscina       text not null default '',
  notas_info_es         text not null default '',
  notas_info_en         text not null default '',
  google_review_url     text not null default '',
  tripadvisor_url       text not null default '',
  creado_at             timestamptz not null default now()
);

create table public.rooms (
  id                 uuid primary key default gen_random_uuid(),
  hotel_id           uuid not null references public.hotels (id) on delete cascade,
  numero             text not null,
  -- Código impreso en la placa QR/NFC: es la URL /p/{codigo_placa}. Único en todo
  -- Seven Stay (en producción conviene un código no adivinable, no el número).
  codigo_placa       text not null unique,
  estado_placa       text not null default 'activa' check (estado_placa in ('activa', 'en_stock', 'danada')),
  estadia_id         uuid,
  estadia_estado     text check (estadia_estado in ('pendiente_confirmacion', 'activa', 'finalizada')),
  estadia_expira_at  timestamptz,
  unique (hotel_id, numero)
);

create table public.hotel_staff (
  id                 uuid primary key default gen_random_uuid(),
  hotel_id           uuid not null references public.hotels (id) on delete cascade,
  -- Solo quien entra al panel tiene usuario; el personal operativo puede no tenerlo.
  user_id            uuid unique references auth.users (id) on delete set null,
  nombre             text not null,
  rol                text not null check (rol in ('recepcion', 'supervisor_gerente', 'ama_de_llaves', 'mantenimiento')),
  telefono_whatsapp  text not null default '',
  en_turno           boolean not null default false,
  turno_inicio_hora  time
);

create table public.tickets (
  id                     uuid primary key default gen_random_uuid(),
  hotel_id               uuid not null references public.hotels (id) on delete cascade,
  room_id                uuid not null references public.rooms (id) on delete cascade,
  habitacion_numero      text not null,
  codigo_corto           text not null,
  idempotency_key        text not null unique,
  categoria              text not null check (categoria in ('housekeeping', 'mantenimiento', 'tour', 'room_service')),
  estado                 text not null check (estado in ('pendiente_validacion_hab', 'abierto', 'aceptado', 'pospuesto_silencio', 'resuelto', 'rechazado')),
  urgente                boolean not null default false,
  en_alerta_servicio     boolean not null default false,
  creado_at              timestamptz not null default now(),
  aceptado_at            timestamptz,
  resuelto_at            timestamptz,
  asignado_a_nombre      text,
  idioma_huesped         text not null default 'es' check (idioma_huesped in ('es', 'en')),
  nota                   text,
  detalle_housekeeping   jsonb,
  detalle_mantenimiento  jsonb,   -- la foto viaja como data URL; Fase 2: Supabase Storage
  detalle_catalogo       jsonb,
  historial              jsonb not null default '[]'::jsonb,
  creado_por             uuid references auth.users (id) on delete set null
);

create index tickets_hotel_estado_idx on public.tickets (hotel_id, estado);
create index tickets_creado_por_idx on public.tickets (creado_por);

-- Menú del restaurante del hotel (room service).
create table public.menu_items (
  id                     uuid primary key default gen_random_uuid(),
  hotel_id               uuid not null references public.hotels (id) on delete cascade,
  titulo_es              text not null,
  titulo_en              text not null,
  descripcion_es         text not null default '',
  descripcion_en         text not null default '',
  precio                 numeric(10, 2) not null check (precio >= 0),
  moneda                 text not null default 'HNL' check (moneda in ('HNL', 'USD')),
  horario_o_duracion_es  text not null default '',
  horario_o_duracion_en  text not null default '',
  activo                 boolean not null default true,
  imagen_url             text
);

-- Tours curados por Seven Stay (no por el hotel).
create table public.curated_tours (
  id                     uuid primary key default gen_random_uuid(),
  titulo_es              text not null,
  titulo_en              text not null,
  descripcion_es         text not null default '',
  descripcion_en         text not null default '',
  precio                 numeric(10, 2) not null check (precio >= 0),
  moneda                 text not null default 'USD' check (moneda in ('HNL', 'USD')),
  horario_o_duracion_es  text not null default '',
  horario_o_duracion_en  text not null default '',
  activo                 boolean not null default true,
  imagen_url             text,
  whatsapp_destino       text not null default '50495197142'
);

-- Reservas de tours (las gestiona Seven Stay).
create table public.tour_bookings (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null unique references public.tickets (id) on delete cascade,
  tour_id          uuid references public.curated_tours (id) on delete set null,
  hotel_id         uuid not null references public.hotels (id) on delete cascade,
  habitacion_numero text not null,
  personas         int not null check (personas between 1 and 20),
  precio_unitario  numeric(10, 2) not null,
  moneda           text not null check (moneda in ('HNL', 'USD')),
  voucher_codigo   text not null unique,
  estado           text not null default 'pendiente_pago' check (estado in ('pendiente_pago', 'pagado', 'cancelado', 'completado')),
  creado_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Hotel del usuario del panel (null si no es personal).
create or replace function public.mi_hotel_id()
returns uuid language sql stable security definer set search_path = public as $$
  select hotel_id from public.hotel_staff where user_id = auth.uid() limit 1
$$;

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.hotel_staff where user_id = auth.uid() limit 1
$$;

create or replace function public.estadia_vigente(r public.rooms)
returns boolean language sql stable as $$
  select r.estadia_estado = 'activa' and (r.estadia_expira_at is null or r.estadia_expira_at > now())
$$;

-- Mañana a la hora de checkout, en la zona horaria del hotel.
create or replace function public.vencimiento_estadia(p_hotel uuid)
returns timestamptz language sql stable set search_path = public as $$
  select ((((now() at time zone h.zona_horaria)::date + 1) + h.hora_checkout) at time zone h.zona_horaria)
  from public.hotels h where h.id = p_hotel
$$;

create or replace function public.evento(p_tipo text, p_actor text, p_detalle text default null)
returns jsonb language sql stable as $$
  select jsonb_build_object('tipo', p_tipo, 'fecha', now(), 'actor', p_actor, 'detalle', p_detalle)
$$;

-- Exige ser personal del hotel del recurso.
create or replace function public.exigir_staff(p_hotel uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_hotel_id() is distinct from p_hotel then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Portal del huésped
-- -----------------------------------------------------------------------------

-- Datos públicos del hotel y la habitación a partir del código de la placa.
create or replace function public.portal_por_codigo(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hotel', jsonb_build_object(
      'id', h.id, 'nombre', h.nombre, 'logo_url', h.logo_url, 'color_primario', h.color_primario,
      'telefono_recepcion', h.telefono_recepcion, 'wifi_ssid', h.wifi_ssid, 'wifi_password', h.wifi_password,
      'moneda_default', h.moneda_default, 'hora_checkout', to_char(h.hora_checkout, 'HH24:MI'),
      'hora_silencio_inicio', to_char(h.hora_silencio_inicio, 'HH24:MI'), 'hora_silencio_fin', to_char(h.hora_silencio_fin, 'HH24:MI'),
      'horario_desayuno', h.horario_desayuno, 'horario_piscina', h.horario_piscina,
      'notas_info_es', h.notas_info_es, 'notas_info_en', h.notas_info_en,
      'google_review_url', h.google_review_url, 'tripadvisor_url', h.tripadvisor_url),
    'habitacion', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'codigo_placa', r.codigo_placa, 'estado_placa', r.estado_placa,
      'estadia_activa', case when r.estadia_estado is null then null else jsonb_build_object(
        'id', r.estadia_id, 'estado', r.estadia_estado, 'expira_at', r.estadia_expira_at) end))
  from public.rooms r join public.hotels h on h.id = r.hotel_id
  where r.codigo_placa = p_codigo
$$;

-- Crea una solicitud desde el portal (Opción C + idempotencia + historial).
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
  v_room    public.rooms;
  v_ticket  public.tickets;
  v_vigente boolean;
  v_codigo  text;
  v_detalle jsonb := p_detalle_catalogo;
  v_hist    jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión (anónima) del huésped' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where idempotency_key = p_idempotency_key;
  if found then
    return v_ticket; -- reenvío del mismo formulario: mismo ticket
  end if;

  select * into v_room from public.rooms where codigo_placa = p_codigo for update;
  if not found then raise exception 'habitacion_no_encontrada'; end if;
  if v_room.estado_placa <> 'activa' then raise exception 'placa_no_activa'; end if;

  v_vigente := public.estadia_vigente(v_room);

  -- Código corto de 3 dígitos, único entre los activos del hotel.
  loop
    v_codigo := (100 + floor(random() * 900))::int::text;
    exit when not exists (
      select 1 from public.tickets
      where hotel_id = v_room.hotel_id and codigo_corto = v_codigo and estado not in ('resuelto', 'rechazado'));
  end loop;

  if v_detalle is not null and coalesce(v_detalle ->> 'voucher_codigo', '') = '' then
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
    coalesce(p_idioma, 'es'), nullif(trim(coalesce(p_nota, '')), ''), p_detalle_housekeeping,
    p_detalle_mantenimiento, v_detalle, v_hist, auth.uid())
  returning * into v_ticket;

  if not v_vigente and v_room.estadia_estado is distinct from 'pendiente_confirmacion' then
    update public.rooms
      set estadia_id = gen_random_uuid(), estadia_estado = 'pendiente_confirmacion', estadia_expira_at = null
      where id = v_room.id;
  end if;

  -- Los tours se registran también como reserva para Seven Stay.
  if p_categoria = 'tour' and v_detalle is not null then
    insert into public.tour_bookings (ticket_id, tour_id, hotel_id, habitacion_numero, personas, precio_unitario, moneda, voucher_codigo)
    values (
      v_ticket.id,
      (select id from public.curated_tours where id::text = v_detalle ->> 'catalogo_item_id'),
      v_room.hotel_id, v_room.numero,
      greatest(1, coalesce((v_detalle ->> 'cantidad')::int, 1)),
      coalesce((v_detalle ->> 'precio')::numeric, 0),
      coalesce(v_detalle ->> 'moneda', 'USD'),
      v_detalle ->> 'voucher_codigo');
  end if;

  return v_ticket;
end $$;

-- El huésped avisa demora a Gerencia (solo sobre sus propias solicitudes).
create or replace function public.escalar_ticket_huesped(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tickets
    set en_alerta_servicio = true, urgente = true,
        historial = historial || jsonb_build_array(public.evento('escalado', 'huesped', 'Demora notificada a Gerencia'))
  where id = p_ticket and creado_por = auth.uid()
    and estado not in ('resuelto', 'rechazado') and not en_alerta_servicio;
end $$;

-- -----------------------------------------------------------------------------
-- Panel del hotel
-- -----------------------------------------------------------------------------

create or replace function public.staff_aceptar_ticket(p_ticket uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' then raise exception 'Los tours los gestiona Seven Stay'; end if;
  if v.estado not in ('abierto', 'pospuesto_silencio') then return; end if;
  update public.tickets
    set estado = 'aceptado', aceptado_at = now(), asignado_a_nombre = p_nombre,
        historial = historial || jsonb_build_array(public.evento('aceptado', 'recepcion', 'Asignado a ' || p_nombre))
  where id = p_ticket;
end $$;

create or replace function public.staff_resolver_ticket(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tickets;
begin
  select * into v from public.tickets where id = p_ticket for update;
  perform public.exigir_staff(v.hotel_id);
  if v.categoria = 'tour' or v.estado in ('resuelto', 'rechazado', 'pendiente_validacion_hab') then return; end if;
  update public.tickets
    set estado = 'resuelto', resuelto_at = now(), en_alerta_servicio = false,
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
  if v.categoria = 'tour' or v.estado in ('resuelto', 'rechazado') or v.en_alerta_servicio then return; end if;
  update public.tickets
    set en_alerta_servicio = true, urgente = true,
        historial = historial || jsonb_build_array(public.evento('escalado', 'recepcion',
          case when nullif(trim(coalesce(p_motivo, '')), '') is not null then 'Motivo: ' || trim(p_motivo) end))
  where id = p_ticket;
end $$;

-- Check-in (o confirmación de la Opción C): activa la estadía y abre lo que esperaba.
create or replace function public.staff_activar_estadia(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  perform public.exigir_staff(r.hotel_id);
  if r.estado_placa <> 'activa' then raise exception 'placa_no_activa'; end if;
  update public.rooms
    set estadia_id = coalesce(estadia_id, gen_random_uuid()), estadia_estado = 'activa',
        estadia_expira_at = public.vencimiento_estadia(r.hotel_id)
  where id = p_room;
  update public.tickets
    set estado = 'abierto', historial = historial || jsonb_build_array(public.evento('validacion_aprobada', 'recepcion'))
  where room_id = p_room and estado = 'pendiente_validacion_hab';
end $$;

-- Rechazo de la Opción C o check-out: la habitación queda vacía.
create or replace function public.staff_vaciar_habitacion(p_room uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  if p_motivo not in ('validacion_rechazada', 'cerrado_por_checkout') then raise exception 'motivo inválido'; end if;
  select * into r from public.rooms where id = p_room for update;
  perform public.exigir_staff(r.hotel_id);
  update public.rooms set estadia_id = null, estadia_estado = null, estadia_expira_at = null where id = p_room;
  update public.tickets
    set estado = 'rechazado', historial = historial || jsonb_build_array(public.evento(p_motivo, 'recepcion',
      case when p_motivo = 'validacion_rechazada' then 'La habitación estaba vacía' else 'Check-out antes de confirmar la estadía' end))
  where room_id = p_room and estado = 'pendiente_validacion_hab';
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.hotels        enable row level security;
alter table public.rooms         enable row level security;
alter table public.hotel_staff   enable row level security;
alter table public.tickets       enable row level security;
alter table public.menu_items    enable row level security;
alter table public.curated_tours enable row level security;
alter table public.tour_bookings enable row level security;

-- Hotel: el personal lo ve; lo edita (Wi-Fi, horarios, notas). El WhatsApp de
-- recepción solo lo cambia gerencia (ver trigger abajo).
create policy hotels_staff_select on public.hotels for select to authenticated using (id = public.mi_hotel_id());
create policy hotels_staff_update on public.hotels for update to authenticated using (id = public.mi_hotel_id()) with check (id = public.mi_hotel_id());

create or replace function public.solo_gerencia_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.whatsapp_reception is distinct from old.whatsapp_reception
     and auth.uid() is not null and public.mi_rol() is distinct from 'supervisor_gerente' then
    raise exception 'Solo Supervisor / Gerente puede cambiar el WhatsApp de recepción' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger hotels_whatsapp_gerencia before update on public.hotels
  for each row execute function public.solo_gerencia_whatsapp();

-- Habitaciones: el personal las ve. Los cambios van por las funciones staff_*.
create policy rooms_staff_select on public.rooms for select to authenticated using (hotel_id = public.mi_hotel_id());

-- Personal: se ve a sí mismo y a sus compañeros; gerencia cambia turnos.
create policy staff_select on public.hotel_staff for select to authenticated using (hotel_id = public.mi_hotel_id());
create policy staff_gerencia_update on public.hotel_staff for update to authenticated
  using (hotel_id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente')
  with check (hotel_id = public.mi_hotel_id());

-- Tickets:
--  * personal: los de su hotel, sin tours;
--  * huésped (anónimo): solo los que creó.
create policy tickets_staff_select on public.tickets for select to authenticated
  using (hotel_id = public.mi_hotel_id() and categoria <> 'tour');
create policy tickets_huesped_select on public.tickets for select to authenticated
  using (creado_por = auth.uid());

-- Menú: público para leer; el personal lo administra.
create policy menu_publico on public.menu_items for select to anon, authenticated using (activo);
create policy menu_staff_select on public.menu_items for select to authenticated using (hotel_id = public.mi_hotel_id());
create policy menu_staff_write on public.menu_items for all to authenticated
  using (hotel_id = public.mi_hotel_id()) with check (hotel_id = public.mi_hotel_id());

-- Tours: públicos para leer (solo activos). Escritura solo Seven Stay (service_role).
create policy tours_publico on public.curated_tours for select to anon, authenticated using (activo);

-- tour_bookings: sin políticas → solo Seven Stay (service_role).

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------

-- En Supabase anon/authenticated reciben EXECUTE por defecto: se revoca explícitamente
-- y solo se otorga lo que el portal y el panel necesitan.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.portal_por_codigo(text) to anon, authenticated;
grant execute on function public.crear_ticket(text, text, text, boolean, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.escalar_ticket_huesped(uuid) to authenticated;
grant execute on function public.staff_aceptar_ticket(uuid, text) to authenticated;
grant execute on function public.staff_resolver_ticket(uuid) to authenticated;
grant execute on function public.staff_escalar_ticket(uuid, text) to authenticated;
grant execute on function public.staff_activar_estadia(uuid) to authenticated;
grant execute on function public.staff_vaciar_habitacion(uuid, text) to authenticated;
grant execute on function public.mi_hotel_id() to authenticated;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.estadia_vigente(public.rooms) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: el panel y el portal se actualizan solos (respetando RLS).
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.tickets, public.rooms, public.hotels;
