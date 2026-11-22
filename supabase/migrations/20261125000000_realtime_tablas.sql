-- =============================================================================
-- Seven Stay · Realtime: tablas que la app escucha en vivo
--
-- Error encontrado en producción: el panel escucha hotel_staff, pero esa tabla
-- no estaba en la publicación de Realtime. Supabase rechazaba esa suscripción
-- y el canal completo del panel dejaba de recibir cambios (había que dar F5
-- para ver las solicitudes nuevas).
--
-- Se agregan las tablas que faltan (sin fallar si ya estaban).
--
-- Ejecutar después de 20261124000100_ajustes_negocio.sql.
-- =============================================================================

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['tickets', 'rooms', 'hotels', 'hotel_staff', 'curated_tours', 'menu_items', 'menu_categorias'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end $$;
