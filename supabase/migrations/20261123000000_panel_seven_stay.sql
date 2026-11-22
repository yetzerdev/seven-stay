-- =============================================================================
-- Seven Stay · Panel interno (/admin) · Etapa 1
--
--  * seven_stay_admins: el equipo de Seven Stay que entra a /admin.
--    La app NO lee esta tabla desde el navegador: el servidor de Next.js la
--    consulta con la service_role antes de cada acción del panel interno.
--  * hotels.estado: 'activo' o 'suspendido'. Un hotel suspendido no recibe
--    solicitudes (su portal muestra "placa no activa").
--
-- Ejecutar después de 20261122000100_notificaciones_push.sql.
-- Luego, dar de alta al primer administrador (ver supabase/README.md).
-- =============================================================================

create table if not exists public.seven_stay_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  creado_at  timestamptz not null default now()
);

alter table public.seven_stay_admins enable row level security;
-- Sin políticas: solo la service_role (servidor) la lee.
revoke all on public.seven_stay_admins from anon, authenticated;

alter table public.hotels
  add column if not exists estado text not null default 'activo' check (estado in ('activo', 'suspendido'));
-- El estado solo lo cambia Seven Stay (service_role): no está entre las columnas
-- que el panel del hotel puede actualizar.

-- -----------------------------------------------------------------------------
-- Hotel suspendido: no entran solicitudes nuevas (aunque el teléfono lo intente)
-- -----------------------------------------------------------------------------

create or replace function public.bloquear_hotel_suspendido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select estado from public.hotels where id = new.hotel_id) = 'suspendido' then
    raise exception 'placa_no_activa';
  end if;
  return new;
end $$;

drop trigger if exists tickets_hotel_suspendido on public.tickets;
create trigger tickets_hotel_suspendido before insert on public.tickets
  for each row execute function public.bloquear_hotel_suspendido();

revoke execute on function public.bloquear_hotel_suspendido() from public, anon, authenticated;

-- El portal de un hotel suspendido se ve como "placa no activa"
-- (misma firma: conserva los permisos).
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
      'id', r.id, 'numero', r.numero, 'codigo_placa', r.codigo_placa,
      'estado_placa', case when h.estado = 'suspendido' then 'en_stock' else r.estado_placa end,
      'estadia_activa', case when r.estadia_estado is null then null else jsonb_build_object(
        'id', r.estadia_id, 'estado', r.estadia_estado, 'expira_at', r.estadia_expira_at) end))
  from public.rooms r join public.hotels h on h.id = r.hotel_id
  where r.codigo_placa = p_codigo
$$;
