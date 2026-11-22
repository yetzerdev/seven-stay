# Supabase · Puesta en marcha del hotel piloto

Pasos para dejar la base de datos lista (una sola vez por proyecto):

1. **Crear el proyecto** en [supabase.com](https://supabase.com) (región más cercana: `us-east-1`).
2. **Esquema:** en *SQL Editor*, pegar y ejecutar, **en orden**:
   1. `migrations/20261118000000_esquema_inicial.sql`
   2. `migrations/20261118000100_permisos_tablas.sql`
   3. `migrations/20261119000000_bloque_a_seguridad.sql` (precios del servidor, límites anti-abuso, rechazar/cancelar, permisos y bucket de fotos)
   4. `migrations/20261119000100_fix_estadia_vigente.sql` (habitaciones vacías que piden servicio pasan a "Por validar")
   5. `migrations/20261120000000_silencio_y_personal.sql` (horario de silencio y altas/bajas de personal desde el panel)
   6. `migrations/20261120000100_imagenes_menu.sql` (bucket público para las fotos de los platos del menú)
   7. `migrations/20261120000200_categorias_menu.sql` (categorías del menú con orden, horario y temporada)
   8. `migrations/20261121000000_tours_por_hotel.sql` (tours propios del hotel y modo de tours: propios, Seven Stay o ambos)
   9. `migrations/20261122000000_solicitudes_por_estadia.sql` (al hacer check-out el huésped deja de ver las solicitudes de esa estadía)
  10. `migrations/20261122000100_notificaciones_push.sql` (suscripciones de notificaciones push; ver paso 8)
  11. `migrations/20261123000000_panel_seven_stay.sql` (panel interno /admin y estado activo/suspendido de los hoteles; ver paso 9)
  12. `migrations/20261123000100_permisos_service_role.sql` (permisos de la clave maestra para /admin y la función de avisos)
  13. `migrations/20261124000000_cobros_y_bitacora.sql` (planes por habitación, pagos de hoteles y bitácora del panel interno)
  14. `migrations/20261124000100_ajustes_negocio.sql` (comisión y operador de tours, RTN, tarifa congelada, mínimo de habitaciones, ISV y roles del panel interno)
  15. `migrations/20261125000000_realtime_tablas.sql` (habilita en Realtime todas las tablas que la app escucha en vivo)
  16. `migrations/20261126000000_facturacion_sar.sql` (Facturación SAR: configuración fiscal y CAI, cotizaciones, facturas con correlativo y suscripciones en Lempiras)
  17. `migrations/20261127000000_hotel_datos_facturacion.sql` (Datos de facturación del hotel: dirección fiscal y tipo de placa, para emitir facturas en 1 clic)
3. **Hotel piloto:** ejecutar `seed.sql`: 1 hotel, 10 habitaciones con códigos de placa aleatorios (la lista está al inicio del archivo) y 3 tours de prueba.
4. **Huéspedes sin registro:** *Authentication → Sign In / Providers → Anonymous sign-ins* → **activar**.
   Sin esto el portal muestra "El portal no está disponible".
5. **Anti-bots (Cloudflare Turnstile):**
   1. En Cloudflare → *Turnstile* → *Add widget*: dominio de la app (y `localhost` para pruebas), modo **Managed**.
   2. En Supabase → *Authentication → Attack Protection* → activar **CAPTCHA protection**, proveedor **Turnstile**, pegar la **Secret Key**.
   3. En `.env.local` (y en el hosting): `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` con la **Site Key**.
   Con el CAPTCHA activo, el huésped y el login del panel necesitan el token: sin la Site Key en la app, nadie podrá entrar.
6. **Usuarios del panel:** *Authentication → Users → Add user* (correo y contraseña) para cada persona de recepción o gerencia.
   Luego vincularlos al hotel desde *SQL Editor*:

   ```sql
   insert into public.hotel_staff (hotel_id, user_id, nombre, rol, en_turno)
   values (
     (select id from public.hotels where nombre = 'Hotel Piloto'),
     (select id from auth.users where email = 'gerencia@tuhotel.com'),
     'Nombre Apellido', 'supervisor_gerente', true
   );
   -- rol: 'recepcion' o 'supervisor_gerente' (solo gerencia edita Configuración Hotel y WhatsApp Bot)
   ```
7. **Variables de entorno:** copiar `.env.example` como `.env.local` y completar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (*Project Settings → API*) y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. La clave `service_role` **no** va en la app.

8. **Notificaciones push (PWA):** avisan al huésped cuando su solicitud va en camino, se resuelve o no se aprueba,
   y al personal cuando entra una solicitud nueva o se escala, aunque la app esté cerrada.
   1. Generar las claves VAPID (una sola vez): `npx web-push generate-vapid-keys`.
   2. En `.env.local` (y en el hosting): `NEXT_PUBLIC_VAPID_PUBLIC_KEY=` con la clave **pública**.
   3. Desplegar la función con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
      ```bash
      supabase functions deploy enviar-push --no-verify-jwt
      supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_CONTACTO=mailto:soporte@tudominio.com WEBHOOK_SECRET=una-clave-larga-al-azar
      ```
   4. *Database → Webhooks → Create a new hook*: tabla `tickets`, eventos **Insert** y **Update**,
      tipo **Supabase Edge Functions** → `enviar-push`, método POST, y agregar la cabecera
      `x-webhook-secret` con el mismo valor de `WEBHOOK_SECRET`.
   - **iPhone/iPad:** los avisos solo llegan si la app se instaló en la pantalla de inicio
     (Safari → Compartir → «Agregar a inicio», iOS 16.4 o superior). El portal lo explica paso a paso.
   - Requiere HTTPS: en `localhost` funciona, pero desde el teléfono hay que usar el dominio publicado.

9. **Panel interno de Seven Stay (`/admin`):** desde ahí se crean hoteles, habitaciones, placas QR, usuarios del panel y tours de Seven Stay.
   1. En `.env.local` (y en el hosting, **nunca** con `NEXT_PUBLIC_`): `SUPABASE_SERVICE_ROLE_KEY=` (*Project Settings → API → service_role*).
   2. Crear tu usuario en *Authentication → Users → Add user* y darlo de alta como administrador en *SQL Editor*:
      ```sql
      insert into public.seven_stay_admins (user_id, nombre)
      values ((select id from auth.users where email = 'tu-correo@sevenstay.com'), 'Tu Nombre');
      ```
      Para alguien que solo atiende tours (ve Monitoreo y Tours y reservas, sin Cobros, Bitácora,
      Métricas ni comisiones), agrégalo con el rol `operaciones`:
      ```sql
      insert into public.seven_stay_admins (user_id, nombre, rol)
      values ((select id from auth.users where email = 'agente@sevenstay.com'), 'Nombre', 'operaciones');
      ```
   3. *Authentication → URL Configuration → Redirect URLs*: agregar `http://localhost:3000/panel/restablecer`
      y `https://tudominio.com/panel/restablecer` (invitaciones y recuperar contraseña).
   4. Entrar a `/admin/login`. Los usuarios de los hoteles se crean desde la ficha de cada hotel →
      «Usuarios del panel»: se genera un enlace para mandarlo por WhatsApp o correo.

## Qué hace el esquema

| Tabla | Quién la ve | Quién la cambia |
|---|---|---|
| `hotels` | Personal de ese hotel | Solo Supervisor / Gerente (columnas de configuración) |
| `rooms` | Personal de ese hotel | Funciones de check-in / check-out; placas: Seven Stay |
| `hotel_staff` | Personal de ese hotel | Gerencia: nombre, teléfono y turno (nunca rol ni usuario) |
| `tickets` | Personal del hotel (sin tours) y el huésped que la creó | Solo funciones de la base de datos |
| `menu_items` | Público (activos) | Personal del hotel |
| `curated_tours` | Público (activos) | Solo Seven Stay |
| `tour_bookings` | Solo Seven Stay (`service_role`) | Solo Seven Stay |
| Storage `fotos-mantenimiento` | Quien la subió y el personal de su hotel | El huésped sube a su carpeta (≤ 2 MB, solo imágenes) |

Reglas de `crear_ticket`:

- Precio, moneda y título de tours y platos salen de la base de datos (el teléfono no puede cambiarlos).
- Nota de máximo 300 caracteres.
- Máximo **3 solicitudes abiertas** a la vez por habitación (los tours no cuentan).
- Máximo **10 solicitudes por hora** por sesión o por habitación.

Estados de una solicitud: `pendiente_validacion_hab` → `abierto` → `aceptado` → `resuelto`.
Cierres: `rechazado` (recepción: spam, duplicada o habitación vacía) y `cancelado` (el huésped, solo mientras está `abierto`).

**Realtime** está activo en `tickets`, `rooms` y `hotels`, y respeta los permisos anteriores.
