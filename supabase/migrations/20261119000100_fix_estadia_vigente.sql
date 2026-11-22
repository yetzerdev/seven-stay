-- =============================================================================
-- Seven Stay · Corrección: habitaciones vacías que piden servicio
--
-- Error encontrado en las pruebas del piloto: en una habitación vacía
-- (estadia_estado = null), estadia_vigente() devolvía NULL en vez de false.
-- Resultado: la solicitud sí quedaba "Esperando check-in", pero la habitación
-- NO pasaba a "Por validar", así que el panel no mostraba la franja
-- "Hab. X pidió servicio pero figura vacía" ni el historial lo registraba.
--
-- Ejecutar después de 20261119000000_bloque_a_seguridad.sql.
-- =============================================================================

create or replace function public.estadia_vigente(r public.rooms)
returns boolean language sql stable as $$
  select coalesce(
    r.estadia_estado = 'activa' and (r.estadia_expira_at is null or r.estadia_expira_at > now()),
    false)
$$;

-- Repara las habitaciones que ya tienen solicitudes esperando check-in sin estar marcadas.
update public.rooms r
  set estadia_id = gen_random_uuid(), estadia_estado = 'pendiente_confirmacion', estadia_expira_at = null
where r.estadia_estado is null
  and exists (select 1 from public.tickets t where t.room_id = r.id and t.estado = 'pendiente_validacion_hab');
