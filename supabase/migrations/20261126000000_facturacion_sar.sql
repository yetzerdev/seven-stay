-- =============================================================================
-- Seven Stay · Facturación (SAR Honduras), cotizaciones y suscripciones
--
--  * config_fiscal: datos del emisor (SevenCloud Systems), CAI, rango
--    autorizado, fecha límite y correlativo actual. Una sola fila (id = 1).
--  * facturas: nunca se borran. Una anulada conserva su número (auditoría SAR).
--    El número lo asigna emitir_factura(): bloquea la fila de configuración,
--    valida CAI vigente y rango disponible, y avanza el correlativo. Así no
--    hay saltos ni números repetidos aunque se emita desde dos pantallas.
--  * cotizaciones: proformas en Lempiras para prospectos u hoteles.
--  * hotels.plan_saas / gratis_hasta: categoría de la mensualidad (null =
--    automática por habitaciones) y periodo gratis (bonificación piloto).
--
-- Todo es solo del servidor de /admin (service_role); el panel del hotel y el
-- portal no leen estas tablas.
--
-- Ejecutar después de 20261125000000_realtime_tablas.sql.
-- =============================================================================

create table if not exists public.config_fiscal (
  id                   int primary key default 1 check (id = 1),
  nombre_legal         text not null default 'YETZER BANEGAS',
  denominacion         text not null default 'SevenCloud Systems',
  rtn                  text not null default '',
  domicilio            text not null default 'Colonia Zelaya, Calle Principal, Casa Marrón, La Ceiba, Atlántida, Honduras',
  telefono             text not null default '',
  correo               text not null default '',
  cai                  text not null default '',
  rango_inicial        text not null default '',
  rango_final          text not null default '',
  fecha_limite         date,
  correlativo_actual   bigint,          -- último número usado (null = aún no se emite ninguna)
  registro_sag         text not null default '',
  banco                text not null default '',
  tipo_cuenta          text not null default '',
  numero_cuenta        text not null default '',
  titular              text not null default 'Yetzer Banegas / SevenCloud Systems',
  actualizado_at       timestamptz not null default now()
);
insert into public.config_fiscal (id) values (1) on conflict (id) do nothing;

create sequence if not exists public.cotizaciones_numero_seq;

create table if not exists public.cotizaciones (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique default ('COT-' || to_char(now() at time zone 'America/Tegucigalpa', 'YYYY') || '-' || lpad(nextval('public.cotizaciones_numero_seq')::text, 4, '0')),
  creado_at            timestamptz not null default now(),
  creado_por           text not null default '',
  hotel_id             uuid references public.hotels (id) on delete set null,
  cliente_nombre       text not null,
  cliente_rtn          text not null default '',
  ciudad               text not null default '',
  contacto             text not null default '',
  habitaciones         int not null check (habitaciones between 1 and 5000),
  tipo_placa           text check (tipo_placa in ('esencial', 'ejecutiva')),
  plan_saas            text check (plan_saas in ('boutique', 'estandar', 'resort')),
  bonificacion_piloto  boolean not null default false,
  notas                text not null default '',
  estado               text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'convertida')),
  convertida_hotel_id  uuid references public.hotels (id) on delete set null
);

create table if not exists public.facturas (
  id                        uuid primary key default gen_random_uuid(),
  numero                    text not null unique,           -- 000-001-01-00000001
  correlativo               bigint not null,
  -- Copia de los datos fiscales vigentes al emitir (la factura no cambia si después cambia el CAI).
  cai                       text not null,
  rango_inicial             text not null,
  rango_final               text not null,
  fecha_limite              date not null,
  emisor                    jsonb not null,
  fecha_emision             date not null,
  condicion                 text not null check (condicion in ('contado', 'credito')),
  vence                     date not null,
  hotel_id                  uuid references public.hotels (id) on delete set null,
  cotizacion_id             uuid references public.cotizaciones (id) on delete set null,
  cliente_nombre            text not null,
  cliente_rtn               text not null default '',
  cliente_direccion         text not null default '',
  lineas                    jsonb not null,                 -- [{cantidad, descripcion, precio_unitario, total, concepto}]
  descuentos                numeric(14, 2) not null default 0,
  importe_exento            numeric(14, 2) not null default 0,
  importe_exonerado         numeric(14, 2) not null default 0,
  importe_gravado           numeric(14, 2) not null,
  isv                       numeric(14, 2) not null,
  total                     numeric(14, 2) not null,
  total_letras              text not null,
  orden_compra_exenta       text not null default '',
  constancia_exonerado      text not null default '',
  registro_sag              text not null default '',
  -- Mensualidad SaaS: al pagarse, extiende hotels.pagado_hasta.
  mensualidad_meses         int check (mensualidad_meses between 1 and 24),
  estado                    text not null default 'pendiente' check (estado in ('pendiente', 'pagada', 'anulada')),
  pago_fecha                date,
  pago_metodo               text check (pago_metodo in ('transferencia', 'deposito', 'cheque')),
  pago_referencia           text not null default '',
  retencion                 numeric(14, 2) not null default 0 check (retencion >= 0),
  retencion_comprobante     text not null default '',
  anulada_motivo            text not null default '',
  anulada_at                timestamptz,
  emitida_por               text not null default '',
  creado_at                 timestamptz not null default now()
);
create index if not exists facturas_fecha_idx on public.facturas (fecha_emision desc);
create index if not exists facturas_hotel_idx on public.facturas (hotel_id, fecha_emision desc);

alter table public.hotels
  add column if not exists plan_saas text check (plan_saas in ('boutique', 'estandar', 'resort')),
  add column if not exists gratis_hasta date;

-- Una factura emitida nunca se borra (ni por accidente desde el servidor).
create or replace function public.facturas_no_borrar()
returns trigger language plpgsql as $$
begin
  raise exception 'Las facturas emitidas no se borran: se anulan.';
end $$;
drop trigger if exists facturas_no_borrar on public.facturas;
create trigger facturas_no_borrar before delete on public.facturas
  for each row execute function public.facturas_no_borrar();

-- -----------------------------------------------------------------------------
-- Emisión con correlativo SAR: valida CAI y rango, y asigna el número siguiente.
-- p_factura trae todo menos los datos fiscales y el número.
-- -----------------------------------------------------------------------------

create or replace function public.emitir_factura(p_factura jsonb)
returns public.facturas
language plpgsql security definer set search_path = public as $$
declare
  c         public.config_fiscal;
  v_prefijo text;
  v_inicial bigint;
  v_final   bigint;
  v_numero  bigint;
  v_hoy     date := (now() at time zone 'America/Tegucigalpa')::date;
  f         public.facturas;
begin
  select * into c from public.config_fiscal where id = 1 for update;
  if c.cai = '' or c.rango_inicial = '' or c.rango_final = '' or c.fecha_limite is null or c.rtn = '' then
    raise exception 'config_incompleta';
  end if;
  if v_hoy > c.fecha_limite then
    raise exception 'cai_vencido';
  end if;
  -- Formato 000-001-01-00000001: el prefijo (establecimiento-punto-tipo) es fijo y los 8 últimos dígitos avanzan.
  if c.rango_inicial !~ '^\d{3}-\d{3}-\d{2}-\d{8}$' or c.rango_final !~ '^\d{3}-\d{3}-\d{2}-\d{8}$'
     or left(c.rango_inicial, 11) <> left(c.rango_final, 11) then
    raise exception 'rango_invalido';
  end if;
  v_prefijo := left(c.rango_inicial, 11);
  v_inicial := right(c.rango_inicial, 8)::bigint;
  v_final := right(c.rango_final, 8)::bigint;
  v_numero := greatest(coalesce(c.correlativo_actual + 1, v_inicial), v_inicial);
  if v_numero > v_final then
    raise exception 'rango_agotado';
  end if;

  insert into public.facturas (
    numero, correlativo, cai, rango_inicial, rango_final, fecha_limite, emisor,
    fecha_emision, condicion, vence, hotel_id, cotizacion_id, cliente_nombre, cliente_rtn, cliente_direccion,
    lineas, descuentos, importe_exento, importe_exonerado, importe_gravado, isv, total, total_letras,
    orden_compra_exenta, constancia_exonerado, registro_sag, mensualidad_meses, emitida_por)
  values (
    v_prefijo || lpad(v_numero::text, 8, '0'), v_numero, c.cai, c.rango_inicial, c.rango_final, c.fecha_limite,
    jsonb_build_object('nombre_legal', c.nombre_legal, 'denominacion', c.denominacion, 'rtn', c.rtn,
      'domicilio', c.domicilio, 'telefono', c.telefono, 'correo', c.correo, 'banco', c.banco,
      'tipo_cuenta', c.tipo_cuenta, 'numero_cuenta', c.numero_cuenta, 'titular', c.titular),
    v_hoy, p_factura ->> 'condicion', (p_factura ->> 'vence')::date,
    nullif(p_factura ->> 'hotel_id', '')::uuid, nullif(p_factura ->> 'cotizacion_id', '')::uuid,
    p_factura ->> 'cliente_nombre', coalesce(p_factura ->> 'cliente_rtn', ''), coalesce(p_factura ->> 'cliente_direccion', ''),
    p_factura -> 'lineas', coalesce((p_factura ->> 'descuentos')::numeric, 0), coalesce((p_factura ->> 'importe_exento')::numeric, 0),
    coalesce((p_factura ->> 'importe_exonerado')::numeric, 0), (p_factura ->> 'importe_gravado')::numeric,
    (p_factura ->> 'isv')::numeric, (p_factura ->> 'total')::numeric, p_factura ->> 'total_letras',
    coalesce(p_factura ->> 'orden_compra_exenta', ''), coalesce(p_factura ->> 'constancia_exonerado', ''),
    coalesce(nullif(p_factura ->> 'registro_sag', ''), c.registro_sag),
    nullif(p_factura ->> 'mensualidad_meses', '')::int, coalesce(p_factura ->> 'emitida_por', ''))
  returning * into f;

  update public.config_fiscal set correlativo_actual = v_numero, actualizado_at = now() where id = 1;
  return f;
end $$;

-- -----------------------------------------------------------------------------
-- Permisos: solo el servidor de /admin
-- -----------------------------------------------------------------------------

alter table public.config_fiscal enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.facturas enable row level security;
revoke all on public.config_fiscal, public.cotizaciones, public.facturas from anon, authenticated;
revoke all on sequence public.cotizaciones_numero_seq from anon, authenticated;
grant all privileges on public.config_fiscal, public.cotizaciones, public.facturas to service_role;
grant usage, select on sequence public.cotizaciones_numero_seq to service_role;
revoke execute on function public.emitir_factura(jsonb) from public, anon, authenticated;
revoke execute on function public.facturas_no_borrar() from public, anon, authenticated;
grant execute on function public.emitir_factura(jsonb) to service_role;
