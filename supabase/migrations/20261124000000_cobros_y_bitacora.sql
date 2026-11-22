-- =============================================================================
-- Seven Stay · Panel interno · Etapa 3: cobro a hoteles y bitácora
--
--  * planes: precio POR HABITACIÓN al mes (se multiplica por las habitaciones
--    con placa activa del hotel).
--  * hotels.plan_id / hotels.pagado_hasta: plan asignado y hasta qué fecha
--    está pagado. Si pagado_hasta ya pasó, el hotel figura "Vencido" en /admin;
--    Seven Stay decide cuándo suspenderlo (no hay suspensión automática).
--  * pagos_hotel: cada pago registrado a mano (transferencia, efectivo…).
--  * bitacora_admin: quién de Seven Stay cambió qué y cuándo.
--
-- Todo lo maneja solo el servidor de /admin (service_role); el panel del hotel
-- y el portal no leen estas tablas.
--
-- Ejecutar después de 20261123000100_permisos_service_role.sql.
-- =============================================================================

create table if not exists public.planes (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (char_length(nombre) between 1 and 60),
  descripcion        text not null default '',
  precio_habitacion  numeric(10, 2) not null check (precio_habitacion >= 0),
  moneda             text not null default 'USD' check (moneda in ('HNL', 'USD')),
  activo             boolean not null default true,
  creado_at          timestamptz not null default now()
);

alter table public.hotels
  add column if not exists plan_id uuid references public.planes (id) on delete set null,
  add column if not exists pagado_hasta date;

create table if not exists public.pagos_hotel (
  id               uuid primary key default gen_random_uuid(),
  hotel_id         uuid not null references public.hotels (id) on delete cascade,
  monto            numeric(12, 2) not null check (monto > 0),
  moneda           text not null check (moneda in ('HNL', 'USD')),
  fecha_pago       date not null,
  meses            int not null check (meses between 1 and 24),
  periodo_desde    date not null,
  periodo_hasta    date not null,
  metodo           text not null check (metodo in ('transferencia', 'efectivo', 'tarjeta', 'otro')),
  referencia       text not null default '',
  notas            text not null default '',
  registrado_por   text not null default '',
  creado_at        timestamptz not null default now(),
  check (periodo_hasta > periodo_desde)
);
create index if not exists pagos_hotel_hotel_idx on public.pagos_hotel (hotel_id, fecha_pago desc);

create table if not exists public.bitacora_admin (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid,
  admin_nombre  text not null,
  accion        text not null,
  hotel_id      uuid references public.hotels (id) on delete set null,
  resumen       text not null default '',
  detalle       jsonb not null default '{}'::jsonb,
  creado_at     timestamptz not null default now()
);
create index if not exists bitacora_admin_fecha_idx on public.bitacora_admin (creado_at desc);
create index if not exists bitacora_admin_hotel_idx on public.bitacora_admin (hotel_id, creado_at desc);

-- Sin políticas: solo la service_role (servidor de /admin).
alter table public.planes enable row level security;
alter table public.pagos_hotel enable row level security;
alter table public.bitacora_admin enable row level security;
revoke all on public.planes, public.pagos_hotel, public.bitacora_admin from anon, authenticated;
grant all privileges on public.planes, public.pagos_hotel, public.bitacora_admin to service_role;
