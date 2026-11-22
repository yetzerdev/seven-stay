-- =============================================================================
-- Seven Stay · Datos de facturación del hotel
--
-- Para emitir en "1 clic": al elegir el hotel, la factura toma su razón social,
-- RTN, dirección fiscal, plan, habitaciones y el tipo de placa que usa.
--
-- Ejecutar después de 20261126000000_facturacion_sar.sql.
-- =============================================================================

alter table public.hotels
  add column if not exists direccion_fiscal text not null default '',
  add column if not exists tipo_placa text check (tipo_placa in ('esencial', 'ejecutiva'));
