-- =============================================================================
-- Seven Stay · Horario de silencio + personal desde el panel
--
--  1. Horario de silencio (hotels.hora_silencio_inicio / _fin, en la zona
--     horaria del hotel): una solicitud de HOUSEKEEPING no urgente que llega
--     dentro del horario queda "Programada" (pospuesto_silencio). El huésped ve
--     "Programado para entrega a las 6:00 AM" y recepción la ve con una luna.
--     Al terminar el horario, el panel la pasa sola a "Sin asignar".
--     Mantenimiento, room service, tours y todo lo urgente NO se posponen.
--  2. Personal: gerencia agrega y quita personal operativo (ama de llaves,
--     mantenimiento, recepción SIN usuario del panel). Los usuarios que entran
--     al panel se siguen creando en Supabase (no se pueden borrar desde la app).
--
-- Ejecutar después de 20261119000100_fix_estadia_vigente.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Horario de silencio
-- -----------------------------------------------------------------------------

-- ¿Ahora mismo es horario de silencio en ese hotel? (soporta rangos que cruzan medianoche)
create or replace function public.en_horario_silencio(p_hotel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when h.hora_silencio_inicio = h.hora_silencio_fin then false
      when h.hora_silencio_inicio < h.hora_silencio_fin then
        (now() at time zone h.zona_horaria)::time >= h.hora_silencio_inicio
        and (now() at time zone h.zona_horaria)::time < h.hora_silencio_fin
      else
        (now() at time zone h.zona_horaria)::time >= h.hora_silencio_inicio
        or (now() at time zone h.zona_horaria)::time < h.hora_silencio_fin
    end
    from public.hotels h where h.id = p_hotel), false)
$$;

-- Al crear la solicitud: housekeeping no urgente en horario de silencio → Programada.
create or replace function public.programar_por_silencio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fin text;
begin
  if new.estado = 'abierto' and new.categoria = 'housekeeping' and not new.urgente
     and public.en_horario_silencio(new.hotel_id) then
    select to_char(hora_silencio_fin, 'HH24:MI') into v_fin from public.hotels where id = new.hotel_id;
    new.estado := 'pospuesto_silencio';
    new.historial := coalesce(new.historial, '[]'::jsonb)
      || jsonb_build_array(public.evento('programado', 'sistema', 'Horario de silencio: se entrega desde las ' || v_fin));
  end if;
  return new;
end $$;

drop trigger if exists tickets_programar_silencio on public.tickets;
create trigger tickets_programar_silencio before insert on public.tickets
  for each row execute function public.programar_por_silencio();

-- El panel la llama al abrir y cada minuto: si ya terminó el silencio, libera lo programado.
create or replace function public.staff_liberar_programados()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hotel uuid := public.mi_hotel_id();
  v_total int;
begin
  perform public.exigir_staff(v_hotel);
  if public.en_horario_silencio(v_hotel) then return 0; end if;
  update public.tickets
    set estado = 'abierto',
        historial = historial || jsonb_build_array(public.evento('liberado', 'sistema', 'Terminó el horario de silencio'))
  where hotel_id = v_hotel and estado = 'pospuesto_silencio';
  get diagnostics v_total = row_count;
  return v_total;
end $$;

revoke execute on function public.en_horario_silencio(uuid) from public, anon, authenticated;
revoke execute on function public.programar_por_silencio() from public, anon, authenticated;
revoke execute on function public.staff_liberar_programados() from public, anon, authenticated;
grant execute on function public.staff_liberar_programados() to authenticated;

-- -----------------------------------------------------------------------------
-- Personal: altas y bajas desde el panel (solo gerencia, solo personal sin usuario)
-- -----------------------------------------------------------------------------

drop policy if exists staff_gerencia_insert on public.hotel_staff;
create policy staff_gerencia_insert on public.hotel_staff for insert to authenticated
  with check (
    hotel_id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente'
    and user_id is null and rol in ('recepcion', 'ama_de_llaves', 'mantenimiento'));

drop policy if exists staff_gerencia_delete on public.hotel_staff;
create policy staff_gerencia_delete on public.hotel_staff for delete to authenticated
  using (hotel_id = public.mi_hotel_id() and public.mi_rol() = 'supervisor_gerente' and user_id is null);

-- user_id no está en la lista: desde la app nunca se vincula una cuenta.
grant insert (hotel_id, nombre, rol, telefono_whatsapp, en_turno, turno_inicio_hora) on public.hotel_staff to authenticated;
grant delete on public.hotel_staff to authenticated;
