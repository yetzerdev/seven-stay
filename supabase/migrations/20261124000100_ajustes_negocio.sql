-- =============================================================================
-- Seven Stay · Panel interno · Ajustes de negocio (revisión del panel)
--
--  1. Comisión y operador de cada tour de Seven Stay, en una tabla APARTE
--     (curated_tours es pública para el portal: el huésped nunca debe ver el
--     margen). Cada reserva guarda la comisión y el operador del momento.
--  2. Hotel: RTN, habitaciones contratadas (mínimo que se cobra) y tarifa
--     acordada por habitación (congelada: subir el precio del plan no cambia
--     a los hoteles actuales salvo que Seven Stay lo decida).
--  3. Pagos: desglose de ISV 15 % (factura SAR).
--  4. Roles del panel interno: super_admin (todo) y operaciones (solo
--     Monitoreo y Tours y reservas, sin montos de comisión).
--
-- Ejecutar después de 20261124000000_cobros_y_bitacora.sql.
-- =============================================================================

-- 1. Comisión y operador ------------------------------------------------------

create table if not exists public.tours_comercial (
  tour_id       uuid primary key references public.curated_tours (id) on delete cascade,
  comision_pct  numeric(5, 2) not null default 20 check (comision_pct between 0 and 100),
  operador      text not null default ''
);

alter table public.tour_bookings
  add column if not exists comision_pct numeric(5, 2),
  add column if not exists operador text not null default '';

-- Al crear la reserva se copia la comisión vigente (si después cambia, la reserva no).
create or replace function public.copiar_comision_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select c.comision_pct, c.operador into new.comision_pct, new.operador
    from public.tours_comercial c where c.tour_id = new.tour_id;
  new.operador := coalesce(new.operador, '');
  return new;
end $$;

drop trigger if exists tour_bookings_comision on public.tour_bookings;
create trigger tour_bookings_comision before insert on public.tour_bookings
  for each row execute function public.copiar_comision_reserva();

revoke execute on function public.copiar_comision_reserva() from public, anon, authenticated;

-- 2. Hotel: RTN, mínimo contratado y tarifa congelada ---------------------------

alter table public.hotels
  add column if not exists rtn text not null default '',
  add column if not exists habitaciones_contratadas int not null default 0 check (habitaciones_contratadas between 0 and 5000),
  add column if not exists tarifa_habitacion numeric(10, 2) check (tarifa_habitacion >= 0),
  add column if not exists tarifa_moneda text check (tarifa_moneda in ('HNL', 'USD'));

-- Hoteles que ya tenían plan: su tarifa acordada es el precio actual del plan.
update public.hotels h
  set tarifa_habitacion = p.precio_habitacion, tarifa_moneda = p.moneda
  from public.planes p
  where h.plan_id = p.id and h.tarifa_habitacion is null;

-- 3. Pagos con ISV --------------------------------------------------------------

alter table public.pagos_hotel
  add column if not exists incluye_isv boolean not null default false,
  add column if not exists subtotal numeric(12, 2),
  add column if not exists isv numeric(12, 2);

-- 4. Roles del panel interno ------------------------------------------------------

alter table public.seven_stay_admins
  add column if not exists rol text not null default 'super_admin' check (rol in ('super_admin', 'operaciones'));

-- Solo el servidor de /admin (service_role) toca estas tablas.
alter table public.tours_comercial enable row level security;
revoke all on public.tours_comercial from anon, authenticated;
grant all privileges on public.tours_comercial to service_role;
