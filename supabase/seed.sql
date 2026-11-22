-- =============================================================================
-- Seven Stay · Datos del hotel piloto
--
-- 1 hotel, 10 habitaciones con códigos de placa ALEATORIOS (no adivinables) y
-- 3 tours curados de prueba. Ejecutar DESPUÉS de las 3 migraciones.
-- Es seguro correrlo dos veces: si el hotel o los tours ya existen, no duplica.
--
-- Antes de imprimir las placas, cambia el nombre, teléfono y Wi-Fi del hotel
-- (o hazlo luego en el panel: Configuración Hotel, con un usuario de gerencia).
-- Cada placa abre:  https://TU-DOMINIO/p/{codigo_placa}
--
--   Hab. | Código de placa
--   101  | hp-9yz29iwtt6
--   102  | hp-g7n6dlhlqs
--   103  | hp-l94rd1xhxk
--   104  | hp-xrahftx1ag
--   105  | hp-9ztn7abbwb
--   201  | hp-plaaq8jj68
--   202  | hp-f6kjpuvg64
--   203  | hp-7g54bmc828
--   204  | hp-4jrsag42yk
--   205  | hp-gptx93xsu5
--
-- Los usuarios del panel se crean en Authentication y se vinculan en
-- hotel_staff (ver supabase/README.md, paso 6).
-- =============================================================================

with h as (
  insert into public.hotels (
    nombre, telefono_recepcion, wifi_ssid, wifi_password, moneda_default,
    hora_checkout, hora_silencio_inicio, hora_silencio_fin, horario_desayuno, horario_piscina,
    notas_info_es, notas_info_en)
  select
    'Hotel Piloto', '+504 0000-0000', 'Hotel_Huespedes', 'cambiar-esta-clave', 'HNL',
    '12:00', '22:00', '06:00', '6:30 AM – 10:00 AM', '8:00 AM – 8:00 PM',
    'Bienvenido. Si necesitas algo, pídelo desde esta página y recepción lo atenderá.',
    'Welcome. If you need anything, request it from this page and the front desk will take care of it.'
  where not exists (select 1 from public.hotels where nombre = 'Hotel Piloto')
  returning id
)
insert into public.rooms (hotel_id, numero, codigo_placa, estado_placa)
select h.id, r.numero, r.codigo, 'activa'
from h, (values
  ('101', 'hp-9yz29iwtt6'),
  ('102', 'hp-g7n6dlhlqs'),
  ('103', 'hp-l94rd1xhxk'),
  ('104', 'hp-xrahftx1ag'),
  ('105', 'hp-9ztn7abbwb'),
  ('201', 'hp-plaaq8jj68'),
  ('202', 'hp-f6kjpuvg64'),
  ('203', 'hp-7g54bmc828'),
  ('204', 'hp-4jrsag42yk'),
  ('205', 'hp-gptx93xsu5')
) as r (numero, codigo);

-- Tours curados de prueba (son de Seven Stay, se ven en todos los hoteles).
insert into public.curated_tours (titulo_es, titulo_en, descripcion_es, descripcion_en, precio, moneda, horario_o_duracion_es, horario_o_duracion_en)
select t.* from (values
  ('Excursión Cayos Cochinos', 'Cayos Cochinos Island Trip',
   'Lancha hacia el archipiélago de Cayos Cochinos con snorkel en arrecife, almuerzo garífuna y tiempo libre en playa de arena blanca.',
   'Boat ride to the Cayos Cochinos archipelago with reef snorkeling, a Garifuna lunch and free time on a white-sand beach.',
   85, 'USD', 'Salida 7:00 AM · Día completo (8 h)', 'Departs 7:00 AM · Full day (8 h)'),
  ('Rafting Río Cangrejal', 'Cangrejal River Rafting',
   'Descenso de rápidos clase II–IV con guías certificados, equipo completo de seguridad y transporte ida y vuelta.',
   'Class II–IV whitewater run with certified guides, full safety gear and round-trip transportation.',
   65, 'USD', 'Salida 8:30 AM · Medio día (4 h)', 'Departs 8:30 AM · Half day (4 h)'),
  ('Senderismo Pico Bonito', 'Pico Bonito Hiking',
   'Caminata guiada por el bosque tropical del Parque Nacional Pico Bonito hasta la cascada El Bejuco, con avistamiento de aves.',
   'Guided rainforest hike through Pico Bonito National Park to El Bejuco waterfall, with birdwatching along the trail.',
   45, 'USD', 'Salida 7:30 AM · 5 h', 'Departs 7:30 AM · 5 h')
) as t (titulo_es, titulo_en, descripcion_es, descripcion_en, precio, moneda, horario_o_duracion_es, horario_o_duracion_en)
where not exists (select 1 from public.curated_tours c where c.titulo_es = t.titulo_es);
