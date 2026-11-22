-- =============================================================================
-- Seven Stay · Permisos de la service_role (panel interno /admin y funciones Edge)
--
-- Este proyecto de Supabase no expone las tablas automáticamente, así que la
-- service_role (la clave maestra que usa el servidor de /admin y la función
-- `enviar-push`) también necesita permisos explícitos. Sin esto, /admin falla
-- con "permission denied for table ...".
--
-- La service_role ya salta RLS; esto solo le da acceso a las tablas.
-- Nunca se usa desde el navegador.
--
-- Ejecutar después de 20261123000000_panel_seven_stay.sql.
-- =============================================================================

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tablas y funciones que se creen en el futuro también quedan accesibles.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
