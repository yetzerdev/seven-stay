-- =============================================================================
-- Seven Stay · Categorías del menú (Desayunos, Platos fuertes, Bebidas, Temporada…)
--
--  * Cada hotel define sus categorías, con orden propio.
--  * Horario opcional (hora de inicio/fin, hora local del hotel; puede cruzar
--    la medianoche): fuera de horario se ve, pero no se puede ordenar.
--  * Temporada opcional (fecha desde/hasta, fecha local del hotel): fuera de
--    esas fechas la categoría ni se muestra.
--  * Ocultar la categoría oculta todos sus platos.
--  La base de datos rechaza un pedido de un plato cuya categoría no está
--  disponible (`fuera_de_horario`), aunque el teléfono intente saltárselo.
--
-- Ejecutar después de 20261120000100_imagenes_menu.sql.
-- =============================================================================

create table if not exists public.menu_categorias (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  nombre_es     text not null check (char_length(nombre_es) between 1 and 60),
  nombre_en     text not null,
  orden         int not null default 0,
  activa        boolean not null default true,
  hora_inicio   time,
  hora_fin      time,
  fecha_inicio  date,
  fecha_fin     date,
  check ((hora_inicio is null) = (hora_fin is null)),
  check (fecha_inicio is null or fecha_fin is null or fecha_inicio <= fecha_fin)
);

create index if not exists menu_categorias_hotel_idx on public.menu_categorias (hotel_id, orden);

alter table public.menu_items
  add column if not exists categoria_id uuid references public.menu_categorias (id) on delete set null;

-- -----------------------------------------------------------------------------
-- RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.menu_categorias enable row level security;

drop policy if exists menu_categorias_publico on public.menu_categorias;
drop policy if exists menu_categorias_staff on public.menu_categorias;
create policy menu_categorias_publico on public.menu_categorias for select to anon, authenticated using (activa);
create policy menu_categorias_staff on public.menu_categorias for all to authenticated
  using (hotel_id = public.mi_hotel_id()) with check (hotel_id = public.mi_hotel_id());

grant select on public.menu_categorias to anon, authenticated;
grant insert, update, delete on public.menu_categorias to authenticated;

-- -----------------------------------------------------------------------------
-- ¿La categoría se puede ordenar ahora mismo? (activa, en temporada y en horario)
-- -----------------------------------------------------------------------------

create or replace function public.categoria_disponible(p_categoria uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.activa
      and (c.fecha_inicio is null or (now() at time zone h.zona_horaria)::date >= c.fecha_inicio)
      and (c.fecha_fin is null or (now() at time zone h.zona_horaria)::date <= c.fecha_fin)
      and (
        c.hora_inicio is null
        or (c.hora_inicio < c.hora_fin
            and (now() at time zone h.zona_horaria)::time >= c.hora_inicio
            and (now() at time zone h.zona_horaria)::time < c.hora_fin)
        or (c.hora_inicio >= c.hora_fin
            and ((now() at time zone h.zona_horaria)::time >= c.hora_inicio
                 or (now() at time zone h.zona_horaria)::time < c.hora_fin))
      )
    from public.menu_categorias c join public.hotels h on h.id = c.hotel_id
    where c.id = p_categoria), false)
$$;

-- Al crear un pedido de room service: si el plato tiene categoría, debe estar disponible.
create or replace function public.validar_categoria_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_categoria uuid;
begin
  if new.categoria = 'room_service' and new.detalle_catalogo ? 'catalogo_item_id' then
    select categoria_id into v_categoria from public.menu_items
      where id::text = new.detalle_catalogo ->> 'catalogo_item_id';
    if v_categoria is not null and not public.categoria_disponible(v_categoria) then
      raise exception 'fuera_de_horario';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tickets_validar_categoria on public.tickets;
create trigger tickets_validar_categoria before insert on public.tickets
  for each row execute function public.validar_categoria_pedido();

revoke execute on function public.categoria_disponible(uuid) from public, anon, authenticated;
revoke execute on function public.validar_categoria_pedido() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- El portal necesita la zona horaria del hotel para mostrar bien los horarios
-- (misma firma: conserva los permisos).
-- -----------------------------------------------------------------------------

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
      'google_review_url', h.google_review_url, 'tripadvisor_url', h.tripadvisor_url),
    'habitacion', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'codigo_placa', r.codigo_placa, 'estado_placa', r.estado_placa,
      'estadia_activa', case when r.estadia_estado is null then null else jsonb_build_object(
        'id', r.estadia_id, 'estado', r.estadia_estado, 'expira_at', r.estadia_expira_at) end))
  from public.rooms r join public.hotels h on h.id = r.hotel_id
  where r.codigo_placa = p_codigo
$$;
