-- =============================================================================
-- Seven Stay · Permisos de tabla para la API de Supabase
--
-- Los proyectos nuevos de Supabase no otorgan permisos de tabla a anon /
-- authenticated automáticamente. Estos GRANT abren la puerta; las políticas
-- RLS del esquema inicial siguen decidiendo QUÉ filas ve cada uno.
-- =============================================================================

grant usage on schema public to anon, authenticated;

-- Público (portal del huésped, incluso antes de iniciar sesión anónima)
grant select on public.curated_tours to anon, authenticated;
grant select on public.menu_items    to anon, authenticated;

-- Usuarios con sesión (personal del hotel o huésped anónimo); RLS filtra las filas
grant select, update                 on public.hotels      to authenticated;
grant select                         on public.rooms       to authenticated;
grant select, update                 on public.hotel_staff to authenticated;
grant select                         on public.tickets     to authenticated;
grant insert, update, delete         on public.menu_items  to authenticated;

-- tour_bookings: sin permisos para anon/authenticated (solo Seven Stay con service_role).
