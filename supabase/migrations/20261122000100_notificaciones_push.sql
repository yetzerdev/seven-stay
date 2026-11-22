-- =============================================================================
-- Seven Stay · Notificaciones push (PWA)
--
--  * push_suscripciones: un registro por teléfono/navegador suscrito.
--      - huésped: ligado a su sesión anónima y a la habitación (avisos de SUS
--        solicitudes: en camino, resuelta, no aprobada).
--      - staff: ligado al hotel (aviso de cada solicitud nueva o escalada).
--  * Nadie lee esta tabla desde la app: solo la función guardar_suscripcion_push
--    escribe y la función Edge `enviar-push` (service_role) lee.
--
-- Ejecutar después de 20261122000000_solicitudes_por_estadia.sql.
-- Luego: desplegar supabase/functions/enviar-push y crear el Database Webhook
-- (ver supabase/README.md, sección "Notificaciones push").
-- =============================================================================

create table if not exists public.push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh      text not null check (char_length(p256dh) between 10 and 200),
  auth        text not null check (char_length(auth) between 8 and 100),
  user_id     uuid not null,
  tipo        text not null check (tipo in ('huesped', 'staff')),
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  room_id     uuid references public.rooms (id) on delete cascade,
  idioma      text not null default 'es' check (idioma in ('es', 'en')),
  creado_at   timestamptz not null default now()
);

create index if not exists push_suscripciones_user_idx on public.push_suscripciones (user_id);
create index if not exists push_suscripciones_hotel_idx on public.push_suscripciones (hotel_id, tipo);

alter table public.push_suscripciones enable row level security;
-- Sin políticas: la app no la lee ni la escribe directo.
revoke all on public.push_suscripciones from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Guarda (o actualiza) la suscripción del teléfono actual.
--   p_codigo = placa de la habitación → huésped; null → personal del hotel.
-- -----------------------------------------------------------------------------

create or replace function public.guardar_suscripcion_push(
  p_codigo   text,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_idioma   text default 'es'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_room  public.rooms;
  v_hotel uuid;
begin
  if v_uid is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then raise exception 'solicitud_invalida'; end if;

  if p_codigo is not null then
    select * into v_room from public.rooms where codigo_placa = p_codigo;
    if not found or v_room.estado_placa <> 'activa' then raise exception 'habitacion_no_encontrada'; end if;
    insert into public.push_suscripciones (endpoint, p256dh, auth, user_id, tipo, hotel_id, room_id, idioma)
    values (p_endpoint, p_p256dh, p_auth, v_uid, 'huesped', v_room.hotel_id, v_room.id,
            case when p_idioma = 'en' then 'en' else 'es' end)
    on conflict (endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id, tipo = 'huesped',
          hotel_id = excluded.hotel_id, room_id = excluded.room_id, idioma = excluded.idioma, creado_at = now();
  else
    v_hotel := public.mi_hotel_id();
    if v_hotel is null then raise exception 'No autorizado' using errcode = '42501'; end if;
    insert into public.push_suscripciones (endpoint, p256dh, auth, user_id, tipo, hotel_id, room_id, idioma)
    values (p_endpoint, p_p256dh, p_auth, v_uid, 'staff', v_hotel, null, 'es')
    on conflict (endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id, tipo = 'staff',
          hotel_id = excluded.hotel_id, room_id = null, idioma = 'es', creado_at = now();
  end if;
end $$;

-- Quitar la suscripción de este teléfono (p. ej. al cerrar sesión en el panel).
create or replace function public.quitar_suscripcion_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_suscripciones where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke execute on function public.guardar_suscripcion_push(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.quitar_suscripcion_push(text) from public, anon, authenticated;
grant execute on function public.guardar_suscripcion_push(text, text, text, text, text) to authenticated;
grant execute on function public.quitar_suscripcion_push(text) to authenticated;
