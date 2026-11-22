import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import type {
  AccionesAdmin,
  DatosHotelAdmin,
  EstadoPlaca,
  EstadoReserva,
  HotelResumen,
  CobroHotel,
  EntradaBitacora,
  MetodoPago,
  MetricaHotel,
  MonitoreoHotel,
  NombreAccion,
  PagoHotel,
  Plan,
  RolAdmin,
  RolUsuarioHotel,
  TourSevenStay,
  UsuarioHotel,
} from '@/lib/admin/tipos';

/**
 * API del panel interno de Seven Stay (/admin).
 *
 * Es el ÚNICO lugar de la app que usa la clave maestra de Supabase
 * (SUPABASE_SERVICE_ROLE_KEY, solo en el servidor, nunca NEXT_PUBLIC_).
 * Cada llamada:
 *   1. lee el token de la sesión del navegador (cabecera Authorization),
 *   2. confirma con Supabase quién es,
 *   3. exige que esté en `seven_stay_admins`,
 * y recién entonces ejecuta la acción pedida.
 */

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const CLAVE_MAESTRA = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET_IMAGENES = 'imagenes-menu';
const ALFABETO_PLACA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

class ErrorAdmin extends Error {
  constructor(
    mensaje: string,
    readonly estado = 400,
  ) {
    super(mensaje);
  }
}

let servicio: SupabaseClient | null = null;
function clienteServicio(): SupabaseClient {
  if (!URL_SUPABASE || !CLAVE_MAESTRA) {
    throw new ErrorAdmin('Falta SUPABASE_SERVICE_ROLE_KEY en las variables del servidor.', 500);
  }
  servicio ??= createClient(URL_SUPABASE, CLAVE_MAESTRA, { auth: { persistSession: false, autoRefreshToken: false } });
  return servicio;
}

function exigir<T>(valor: T | null | undefined, mensaje = 'Solicitud inválida.'): T {
  if (valor === null || valor === undefined || valor === '') throw new ErrorAdmin(mensaje);
  return valor;
}

function revisar(error: { message: string } | null) {
  if (error) throw new ErrorAdmin(error.message);
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
}

/** Fecha de hoy "AAAA-MM-DD" (hora de Honduras, donde opera Seven Stay). */
function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
}

/** Suma meses a "AAAA-MM-DD" (el 31 pasa al último día del mes si hace falta). */
function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

const METODOS: MetodoPago[] = ['transferencia', 'efectivo', 'tarjeta', 'otro'];

const minutos = (desde: string, hasta: string) => (new Date(hasta).getTime() - new Date(desde).getTime()) / 60_000;

const esUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

function codigoPlaca(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALFABETO_PLACA[b % ALFABETO_PLACA.length]).join('');
}

const ROLES_PANEL: RolUsuarioHotel[] = ['recepcion', 'supervisor_gerente'];
const ESTADOS_PLACA: EstadoPlaca[] = ['activa', 'en_stock', 'danada'];
const ESTADOS_RESERVA: EstadoReserva[] = ['pendiente_pago', 'pagado', 'cancelado', 'completado'];

function limpiarHotel(d: DatosHotelAdmin): DatosHotelAdmin {
  const texto = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
  const nombre = texto(d.nombre, 80);
  if (!nombre) throw new ErrorAdmin('El hotel necesita un nombre.');
  const hora = texto(d.hora_checkout, 5);
  return {
    nombre,
    logo_url: texto(d.logo_url, 500),
    telefono_recepcion: texto(d.telefono_recepcion, 30),
    wifi_ssid: texto(d.wifi_ssid, 64),
    wifi_password: texto(d.wifi_password, 64),
    moneda_default: d.moneda_default === 'USD' ? 'USD' : 'HNL',
    zona_horaria: texto(d.zona_horaria, 60) || 'America/Tegucigalpa',
    hora_checkout: /^\d{2}:\d{2}$/.test(hora) ? hora : '12:00',
    modo_tours: d.modo_tours === 'propios' || d.modo_tours === 'ambos' ? d.modo_tours : 'seven_stay',
    // Solo dígitos (formato E.164 sin "+"); vacío = sin bot.
    whatsapp_reception: String(d.whatsapp_reception ?? '').replace(/\D/g, '').slice(0, 15),
    rtn: String(d.rtn ?? '').replace(/[^\d-]/g, '').slice(0, 20),
    plan_id: esUuid(d.plan_id) ? d.plan_id : null,
    habitaciones_contratadas: Math.min(5000, Math.max(0, Math.trunc(Number(d.habitaciones_contratadas) || 0))),
  };
}

/** Tarifa congelada que corresponde al plan elegido (o ninguna si se quita el plan). */
async function tarifaDePlan(db: SupabaseClient, planId: string | null) {
  if (!planId) return { tarifa_habitacion: null, tarifa_moneda: null };
  const { data, error } = await db.from('planes').select('precio_habitacion, moneda').eq('id', planId).maybeSingle();
  revisar(error);
  if (!data) throw new ErrorAdmin('Ese plan no existe.');
  return { tarifa_habitacion: Number(data.precio_habitacion), tarifa_moneda: data.moneda as string };
}

// ---------------------------------------------------------------------------
// Usuarios de Supabase Auth
// ---------------------------------------------------------------------------

async function buscarUsuarioPorCorreo(db: SupabaseClient, correo: string): Promise<User | null> {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    revisar(error);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === correo);
    if (encontrado) return encontrado;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Enlace para crear/recuperar la contraseña (se puede mandar por WhatsApp). */
async function generarEnlace(db: SupabaseClient, usuario: User, origen: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: usuario.email_confirmed_at ? 'recovery' : 'invite',
    email: exigir(usuario.email),
    options: { redirectTo: `${origen}/panel/restablecer` },
  });
  revisar(error);
  return exigir(data.properties?.action_link, 'No se pudo generar el enlace.');
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

type Manejador<N extends NombreAccion> = (
  entrada: AccionesAdmin[N]['entrada'],
  ctx: { db: SupabaseClient; admin: { nombre: string; correo: string; rol: RolAdmin }; origen: string },
) => Promise<AccionesAdmin[N]['salida']>;

const ACCIONES: { [N in NombreAccion]: Manejador<N> } = {
  yo: async (_e, { admin }) => admin,

  hoteles: async (_e, { db }) => {
    const inicioHoy = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const [hoteles, rooms, staff, tickets] = await Promise.all([
      db.from('hotels').select('id, nombre, logo_url, estado, modo_tours, creado_at, plan_id, pagado_hasta').order('nombre'),
      db.from('rooms').select('hotel_id, estado_placa'),
      db.from('hotel_staff').select('hotel_id').not('user_id', 'is', null),
      db.from('tickets').select('hotel_id').gte('creado_at', inicioHoy),
    ]);
    [hoteles, rooms, staff, tickets].forEach((r) => revisar(r.error));
    const contar = <T extends { hotel_id: string }>(filas: T[] | null, id: string, filtro: (f: T) => boolean = () => true) =>
      (filas ?? []).filter((f) => f.hotel_id === id && filtro(f)).length;
    return (hoteles.data ?? []).map(
      (h): HotelResumen => ({
        id: h.id,
        nombre: h.nombre,
        logo_url: h.logo_url,
        estado: h.estado,
        modo_tours: h.modo_tours,
        creado_at: h.creado_at,
        pago_vencido: Boolean(h.plan_id && (!h.pagado_hasta || h.pagado_hasta < hoyISO())),
        habitaciones: contar(rooms.data, h.id),
        placas_activas: contar(rooms.data, h.id, (r) => r.estado_placa === 'activa'),
        usuarios: contar(staff.data, h.id),
        solicitudes_hoy: contar(tickets.data, h.id),
      }),
    );
  },

  hotel: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Hotel inválido.');
    const [hotel, rooms, staff] = await Promise.all([
      db.from('hotels').select('*').eq('id', id).maybeSingle(),
      db.from('rooms').select('id, numero, codigo_placa, estado_placa, estadia_estado, estadia_expira_at').eq('hotel_id', id),
      db.from('hotel_staff').select('id, user_id, nombre, rol').eq('hotel_id', id).in('rol', ROLES_PANEL).not('user_id', 'is', null),
    ]);
    [hotel, rooms, staff].forEach((r) => revisar(r.error));
    const h = exigir(hotel.data, 'Ese hotel no existe.');
    const ahora = Date.now();
    const usuarios = await Promise.all(
      (staff.data ?? []).map(async (s): Promise<UsuarioHotel> => {
        const { data } = await db.auth.admin.getUserById(s.user_id);
        return {
          id: s.id,
          user_id: s.user_id,
          nombre: s.nombre,
          rol: s.rol,
          correo: data.user?.email ?? null,
          confirmado: Boolean(data.user?.email_confirmed_at),
          ultimo_acceso: data.user?.last_sign_in_at ?? null,
        };
      }),
    );
    return {
      hotel: {
        id: h.id,
        estado: h.estado,
        creado_at: h.creado_at,
        nombre: h.nombre,
        logo_url: h.logo_url,
        telefono_recepcion: h.telefono_recepcion,
        wifi_ssid: h.wifi_ssid,
        wifi_password: h.wifi_password,
        moneda_default: h.moneda_default,
        zona_horaria: h.zona_horaria,
        hora_checkout: String(h.hora_checkout).slice(0, 5),
        modo_tours: h.modo_tours,
        whatsapp_reception: h.whatsapp_reception ?? '',
        rtn: h.rtn ?? '',
        plan_id: h.plan_id ?? null,
        habitaciones_contratadas: h.habitaciones_contratadas ?? 0,
      },
      habitaciones: (rooms.data ?? [])
        .map((r) => ({
          id: r.id,
          numero: r.numero,
          codigo_placa: r.codigo_placa,
          estado_placa: r.estado_placa,
          ocupada:
            r.estadia_estado === 'pendiente_confirmacion' ||
            (r.estadia_estado === 'activa' && (!r.estadia_expira_at || new Date(r.estadia_expira_at).getTime() > ahora)),
        }))
        .sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true })),
      usuarios: usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  },

  guardarHotel: async ({ id, datos }, { db }) => {
    const limpio = limpiarHotel(datos);
    if (id) {
      if (!esUuid(id)) throw new ErrorAdmin('Hotel inválido.');
      const { data: actual, error } = await db.from('hotels').select('plan_id').eq('id', id).maybeSingle();
      revisar(error);
      // Solo si cambia de plan se toma el precio del plan nuevo; si no, se respeta la tarifa acordada.
      const tarifa = actual && actual.plan_id !== limpio.plan_id ? await tarifaDePlan(db, limpio.plan_id) : {};
      revisar((await db.from('hotels').update({ ...limpio, ...tarifa }).eq('id', id)).error);
      return { id };
    }
    const tarifa = await tarifaDePlan(db, limpio.plan_id);
    const { data, error } = await db.from('hotels').insert({ ...limpio, ...tarifa }).select('id').single();
    revisar(error);
    return { id: data!.id };
  },

  estadoHotel: async ({ id, estado }, { db }) => {
    if (!esUuid(id) || !['activo', 'suspendido'].includes(estado)) throw new ErrorAdmin('Solicitud inválida.');
    revisar((await db.from('hotels').update({ estado }).eq('id', id)).error);
    return null;
  },

  subirImagen: async ({ dataUrl, carpeta }, { db, admin }) => {
    if (carpeta !== 'seven-stay' && !esUuid(carpeta)) throw new ErrorAdmin('Carpeta inválida.');
    if (admin.rol !== 'super_admin' && carpeta !== 'seven-stay') throw new ErrorAdmin('Tu rol no puede subir imágenes de hoteles.', 403);
    const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl));
    if (!m) throw new ErrorAdmin('Elige una imagen PNG, JPG o WebP.');
    const bytes = Buffer.from(m[3], 'base64');
    if (bytes.length > 2 * 1024 * 1024) throw new ErrorAdmin('La imagen pesa más de 2 MB.');
    const ruta = `${carpeta}/${crypto.randomUUID()}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    revisar((await db.storage.from(BUCKET_IMAGENES).upload(ruta, bytes, { contentType: m[1], upsert: false })).error);
    return { url: db.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta).data.publicUrl };
  },

  crearHabitaciones: async ({ hotel_id, numeros }, { db }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const limpios = [...new Set((numeros ?? []).map((n) => String(n).trim()).filter(Boolean))];
    if (limpios.length === 0) throw new ErrorAdmin('Escribe al menos un número de habitación.');
    if (limpios.length > 500) throw new ErrorAdmin('Máximo 500 habitaciones por vez.');
    if (limpios.some((n) => n.length > 12)) throw new ErrorAdmin('Cada número de habitación debe tener 12 caracteres o menos.');
    const { data: existentes, error } = await db.from('rooms').select('numero').eq('hotel_id', hotel_id);
    revisar(error);
    const usados = new Set((existentes ?? []).map((r) => r.numero));
    const repetidas = limpios.filter((n) => usados.has(n));
    const nuevas = limpios.filter((n) => !usados.has(n));
    // Códigos de placa al azar (no adivinables). Si choca con uno existente, se reintenta.
    for (let intento = 0; intento < 5 && nuevas.length; intento++) {
      const filas = nuevas.map((numero) => ({ hotel_id, numero, codigo_placa: codigoPlaca(), estado_placa: 'activa' }));
      const { error: fallo } = await db.from('rooms').insert(filas);
      if (!fallo) return { creadas: filas.length, repetidas };
      if (!/codigo_placa/.test(fallo.message)) throw new ErrorAdmin(fallo.message);
    }
    if (nuevas.length === 0) return { creadas: 0, repetidas };
    throw new ErrorAdmin('No se pudieron generar códigos de placa únicos. Inténtalo de nuevo.');
  },

  editarHabitacion: async ({ id, numero, estado_placa }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Habitación inválida.');
    const cambios: Record<string, string> = {};
    if (numero !== undefined) cambios.numero = exigir(String(numero).trim().slice(0, 12), 'Escribe el número.');
    if (estado_placa !== undefined) {
      if (!ESTADOS_PLACA.includes(estado_placa)) throw new ErrorAdmin('Estado de placa inválido.');
      cambios.estado_placa = estado_placa;
    }
    const { error } = await db.from('rooms').update(cambios).eq('id', id);
    if (error && /rooms_hotel_id_numero_key|duplicate/.test(error.message)) throw new ErrorAdmin('Ya existe una habitación con ese número.');
    revisar(error);
    return null;
  },

  reemplazarPlaca: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Habitación inválida.');
    for (let intento = 0; intento < 5; intento++) {
      const codigo_placa = codigoPlaca();
      const { error } = await db.from('rooms').update({ codigo_placa, estado_placa: 'activa' }).eq('id', id);
      if (!error) return { codigo_placa };
      if (!/codigo_placa/.test(error.message)) throw new ErrorAdmin(error.message);
    }
    throw new ErrorAdmin('No se pudo generar un código único. Inténtalo de nuevo.');
  },

  eliminarHabitacion: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Habitación inválida.');
    // Borrar la habitación borraría su historial de solicitudes: solo si nunca tuvo.
    const { count, error } = await db.from('tickets').select('id', { count: 'exact', head: true }).eq('room_id', id);
    revisar(error);
    if (count) throw new ErrorAdmin('Esta habitación ya tiene solicitudes: márcala como «En bodega» en vez de borrarla.');
    revisar((await db.from('rooms').delete().eq('id', id)).error);
    return null;
  },

  invitarUsuario: async ({ hotel_id, correo, nombre, rol }, { db, origen }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const email = String(correo ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErrorAdmin('Escribe un correo válido.');
    const nombreLimpio = exigir(String(nombre ?? '').trim().slice(0, 80), 'Escribe el nombre de la persona.');
    if (!ROLES_PANEL.includes(rol)) throw new ErrorAdmin('Rol inválido.');

    const existente = await buscarUsuarioPorCorreo(db, email);
    let usuario: User;
    let enlace: string;
    if (existente) {
      const { data: vinculo } = await db.from('hotel_staff').select('hotel_id, hotels(nombre)').eq('user_id', existente.id).maybeSingle();
      if (vinculo) {
        const hotelNombre = (vinculo.hotels as { nombre?: string } | null)?.nombre ?? 'otro hotel';
        throw new ErrorAdmin(`Ese correo ya tiene acceso al panel de ${hotelNombre}. Una persona solo puede estar en un hotel.`);
      }
      usuario = existente;
      enlace = await generarEnlace(db, usuario, origen);
    } else {
      // Crea el usuario y devuelve el enlace de invitación SIN enviar correo: Seven Stay
      // lo manda por WhatsApp o correo (el correo gratuito de Supabase tiene límites
      // muy bajos). El enlace abre /panel/restablecer para crear la contraseña.
      const { data, error } = await db.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${origen}/panel/restablecer`, data: { nombre: nombreLimpio } },
      });
      revisar(error);
      usuario = exigir(data.user, 'No se pudo crear el usuario.');
      enlace = exigir(data.properties?.action_link, 'No se pudo generar el enlace.');
    }

    const { error } = await db.from('hotel_staff').insert({ hotel_id, user_id: usuario.id, nombre: nombreLimpio, rol, en_turno: true });
    revisar(error);
    return { enlace };
  },

  enlaceAcceso: async ({ staff_id }, { db, origen }) => {
    if (!esUuid(staff_id)) throw new ErrorAdmin('Usuario inválido.');
    const { data: staff, error } = await db.from('hotel_staff').select('user_id').eq('id', staff_id).maybeSingle();
    revisar(error);
    const { data } = await db.auth.admin.getUserById(exigir(staff?.user_id, 'Esa persona no tiene usuario.'));
    return { enlace: await generarEnlace(db, exigir(data.user, 'El usuario ya no existe.'), origen) };
  },

  cambiarRol: async ({ staff_id, rol }, { db }) => {
    if (!esUuid(staff_id) || !ROLES_PANEL.includes(rol)) throw new ErrorAdmin('Solicitud inválida.');
    revisar((await db.from('hotel_staff').update({ rol }).eq('id', staff_id)).error);
    return null;
  },

  quitarUsuario: async ({ staff_id }, { db }) => {
    if (!esUuid(staff_id)) throw new ErrorAdmin('Usuario inválido.');
    const { data: staff, error } = await db.from('hotel_staff').select('user_id').eq('id', staff_id).maybeSingle();
    revisar(error);
    // Se borra el usuario (ya no puede entrar) y su vínculo con el hotel.
    // Las solicitudes que atendió conservan su nombre en el historial.
    if (staff?.user_id) revisar((await db.auth.admin.deleteUser(staff.user_id)).error);
    revisar((await db.from('hotel_staff').delete().eq('id', staff_id)).error);
    return null;
  },

  tours: async (_e, { db, admin }) => {
    const [tours, comercial] = await Promise.all([
      db.from('curated_tours').select('*').is('hotel_id', null).order('titulo_es'),
      admin.rol === 'super_admin' ? db.from('tours_comercial').select('*') : Promise.resolve({ data: [], error: null }),
    ]);
    revisar(tours.error);
    revisar(comercial.error);
    const info = (id: string) => (comercial.data ?? []).find((c: { tour_id: string }) => c.tour_id === id) as
      | { comision_pct: number; operador: string }
      | undefined;
    return (tours.data ?? []).map(
      (t): TourSevenStay => ({
        id: t.id,
        titulo_es: t.titulo_es,
        titulo_en: t.titulo_en,
        descripcion_es: t.descripcion_es,
        descripcion_en: t.descripcion_en,
        horario_o_duracion_es: t.horario_o_duracion_es,
        horario_o_duracion_en: t.horario_o_duracion_en,
        precio: Number(t.precio),
        moneda: t.moneda,
        activo: t.activo,
        imagen_url: t.imagen_url,
        whatsapp_destino: t.whatsapp_destino,
        // El margen solo lo ve el super_admin (nunca operaciones ni el huésped).
        comision_pct: admin.rol === 'super_admin' ? Number(info(t.id)?.comision_pct ?? 20) : null,
        operador: admin.rol === 'super_admin' ? (info(t.id)?.operador ?? '') : null,
      }),
    );
  },

  guardarTour: async ({ id, comision_pct, operador, ...t }, { db, admin }) => {
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const titulo_es = texto(t.titulo_es, 80);
    if (!titulo_es) throw new ErrorAdmin('El tour necesita un nombre.');
    const precio = Number(t.precio);
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorAdmin('Precio inválido.');
    const fila = {
      titulo_es,
      titulo_en: texto(t.titulo_en, 80) || titulo_es,
      descripcion_es: texto(t.descripcion_es, 600),
      descripcion_en: texto(t.descripcion_en, 600),
      horario_o_duracion_es: texto(t.horario_o_duracion_es, 80),
      horario_o_duracion_en: texto(t.horario_o_duracion_en, 80),
      precio: Math.round(precio * 100) / 100,
      moneda: t.moneda === 'HNL' ? 'HNL' : 'USD',
      activo: Boolean(t.activo),
      imagen_url: t.imagen_url ? texto(t.imagen_url, 500) : null,
      whatsapp_destino: texto(t.whatsapp_destino, 20).replace(/\D/g, '') || '50495197142',
      hotel_id: null, // tour de Seven Stay
    };
    let tourId = id;
    if (id) {
      if (!esUuid(id)) throw new ErrorAdmin('Tour inválido.');
      revisar((await db.from('curated_tours').update(fila).eq('id', id).is('hotel_id', null)).error);
    } else {
      const { data, error } = await db.from('curated_tours').insert(fila).select('id').single();
      revisar(error);
      tourId = data!.id;
    }
    if (admin.rol === 'super_admin') {
      const pct = Number(comision_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ErrorAdmin('La comisión debe estar entre 0 y 100 %.');
      revisar(
        (
          await db
            .from('tours_comercial')
            .upsert({ tour_id: tourId, comision_pct: Math.round(pct * 100) / 100, operador: String(operador ?? '').trim().slice(0, 80) })
        ).error,
      );
    } else if (!id) {
      // Tour creado por operaciones: queda con la comisión por defecto hasta que el super_admin la revise.
      revisar((await db.from('tours_comercial').upsert({ tour_id: tourId }, { ignoreDuplicates: true })).error);
    }
    return { id: tourId! };
  },

  eliminarTour: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Tour inválido.');
    // Las reservas quedan (tour_id pasa a null) con su título en el detalle del ticket.
    revisar((await db.from('curated_tours').delete().eq('id', id).is('hotel_id', null)).error);
    return null;
  },

  reservas: async ({ estado }, { db, admin }) => {
    let consulta = db
      .from('tour_bookings')
      .select('id, voucher_codigo, habitacion_numero, personas, precio_unitario, moneda, estado, creado_at, comision_pct, operador, hotels(nombre), tickets(nota, detalle_catalogo), curated_tours(titulo_es)')
      .order('creado_at', { ascending: false })
      .limit(500);
    if (estado && estado !== 'todas') consulta = consulta.eq('estado', estado);
    const { data, error } = await consulta;
    revisar(error);
    type Fila = {
      id: string;
      voucher_codigo: string;
      habitacion_numero: string;
      personas: number;
      precio_unitario: number;
      moneda: 'HNL' | 'USD';
      estado: EstadoReserva;
      creado_at: string;
      comision_pct: number | null;
      operador: string;
      hotels: { nombre: string } | null;
      tickets: { nota: string | null; detalle_catalogo: { titulo?: string } | null } | null;
      curated_tours: { titulo_es: string } | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((r) => ({
      id: r.id,
      voucher_codigo: r.voucher_codigo,
      tour_titulo: r.curated_tours?.titulo_es ?? r.tickets?.detalle_catalogo?.titulo ?? 'Tour eliminado',
      hotel_nombre: r.hotels?.nombre ?? '—',
      habitacion_numero: r.habitacion_numero,
      personas: r.personas,
      precio_unitario: Number(r.precio_unitario),
      moneda: r.moneda,
      estado: r.estado,
      creado_at: r.creado_at,
      nota: r.tickets?.nota ?? null,
      comision_pct: admin.rol === 'super_admin' && r.comision_pct !== null ? Number(r.comision_pct) : null,
      operador: admin.rol === 'super_admin' ? r.operador : null,
    }));
  },

  estadoReserva: async ({ id, estado }, { db }) => {
    if (!esUuid(id) || !ESTADOS_RESERVA.includes(estado)) throw new ErrorAdmin('Solicitud inválida.');
    revisar((await db.from('tour_bookings').update({ estado }).eq('id', id)).error);
    return null;
  },

  monitoreo: async (_e, { db }) => {
    const ahora = Date.now();
    const hace24h = new Date(ahora - 24 * 3_600_000).toISOString();
    const [hoteles, abiertas, recientes, reservas] = await Promise.all([
      db.from('hotels').select('id, nombre, logo_url, estado').order('nombre'),
      db
        .from('tickets')
        .select('hotel_id, estado, en_alerta_servicio, creado_at, categoria, tour_propio, historial')
        .in('estado', ['abierto', 'aceptado', 'pospuesto_silencio', 'pendiente_validacion_hab'])
        .limit(20000),
      db.from('tickets').select('hotel_id, creado_at, aceptado_at, categoria, tour_propio').gte('creado_at', hace24h).limit(20000),
      db.from('tour_bookings').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_pago'),
    ]);
    [hoteles, abiertas, recientes, reservas].forEach((r) => revisar(r.error));
    // Lo que gestiona el hotel: los tours de Seven Stay van por su canal.
    const delHotel = (t: { categoria: string; tour_propio: boolean }) => t.categoria !== 'tour' || t.tour_propio;
    const activas = (abiertas.data ?? []).filter(delHotel);
    const hoy = (recientes.data ?? []).filter(delHotel);
    return {
      reservas_por_cobrar: reservas.count ?? 0,
      generado_at: new Date(ahora).toISOString(),
      hoteles: (hoteles.data ?? []).map((h): MonitoreoHotel => {
        const mias = activas.filter((t) => t.hotel_id === h.id);
        const sinAsignar = mias.filter((t) => t.estado === 'abierto');
        const masVieja = sinAsignar.reduce<number | null>((min, t) => {
          // Lo que se pospuso por el horario de silencio empieza a contar cuando se liberó:
          // así no hay falsos rojos a las 3 AM. Lo urgente de la noche sí cuenta desde que llegó.
          const liberado = (t.historial as { tipo: string; fecha: string }[] | null)?.findLast((e) => e.tipo === 'liberado');
          const ms = new Date(liberado?.fecha ?? t.creado_at).getTime();
          return min === null || ms < min ? ms : min;
        }, null);
        const deHoy = hoy.filter((t) => t.hotel_id === h.id);
        return {
          id: h.id,
          nombre: h.nombre,
          logo_url: h.logo_url,
          estado: h.estado,
          abiertas: mias.length,
          sin_asignar: sinAsignar.length,
          escaladas: mias.filter((t) => t.en_alerta_servicio).length,
          esperando_checkin: mias.filter((t) => t.estado === 'pendiente_validacion_hab').length,
          espera_max_min: masVieja === null ? null : Math.round((ahora - masVieja) / 60_000),
          solicitudes_hoy: deHoy.length,
          respuesta_min: mediana(deHoy.filter((t) => t.aceptado_at).map((t) => minutos(t.creado_at, t.aceptado_at!))),
        };
      }),
    };
  },

  metricasGlobales: async ({ dias }, { db }) => {
    const periodo = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
    const desde = new Date(Date.now() - periodo * 24 * 3_600_000).toISOString();
    const inicioVentas = new Date();
    inicioVentas.setUTCDate(1);
    inicioVentas.setUTCHours(0, 0, 0, 0);
    inicioVentas.setUTCMonth(inicioVentas.getUTCMonth() - 5); // este mes y los 5 anteriores
    const [hoteles, rooms, tickets, ventas] = await Promise.all([
      db.from('hotels').select('id, nombre').order('nombre'),
      db.from('rooms').select('hotel_id'),
      db
        .from('tickets')
        .select('hotel_id, categoria, tour_propio, estado, creado_at, aceptado_at, resuelto_at, en_alerta_servicio, historial')
        .gte('creado_at', desde)
        .limit(50000),
      db
        .from('tour_bookings')
        .select('creado_at, personas, precio_unitario, moneda')
        .in('estado', ['pagado', 'completado'])
        .gte('creado_at', inicioVentas.toISOString())
        .limit(50000),
    ]);
    [hoteles, rooms, tickets, ventas].forEach((r) => revisar(r.error));
    type FilaT = {
      hotel_id: string;
      categoria: string;
      tour_propio: boolean;
      estado: string;
      creado_at: string;
      aceptado_at: string | null;
      resuelto_at: string | null;
      en_alerta_servicio: boolean;
      historial: { tipo: string }[] | null;
    };
    const filas = ((tickets.data ?? []) as FilaT[]).filter((t) => t.categoria !== 'tour' || t.tour_propio);

    const porHotel = (hoteles.data ?? []).map((h): MetricaHotel => {
      const mias = filas.filter((t) => t.hotel_id === h.id);
      const resueltas = mias.filter((t) => t.estado === 'resuelto');
      const terminadas = mias.filter((t) => ['resuelto', 'rechazado', 'cancelado'].includes(t.estado));
      return {
        id: h.id,
        nombre: h.nombre,
        solicitudes: mias.length,
        respuesta_min: mediana(mias.filter((t) => t.aceptado_at).map((t) => minutos(t.creado_at, t.aceptado_at!))),
        resolucion_min: mediana(resueltas.filter((t) => t.resuelto_at).map((t) => minutos(t.creado_at, t.resuelto_at!))),
        pct_resueltas: terminadas.length ? Math.round((resueltas.length / terminadas.length) * 100) : null,
        escaladas: mias.filter((t) => t.en_alerta_servicio || t.historial?.some((e) => e.tipo === 'escalado')).length,
        rechazadas: mias.filter((t) => t.estado === 'rechazado').length,
        habitaciones: (rooms.data ?? []).filter((r) => r.hotel_id === h.id).length,
      };
    });

    // Ventas de tours de Seven Stay (pagadas o completadas) por mes, en cada moneda.
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(inicioVentas);
      d.setUTCMonth(d.getUTCMonth() + i);
      return { mes: d.toISOString().slice(0, 7), reservas: 0, usd: 0, hnl: 0 };
    });
    for (const v of (ventas.data ?? []) as { creado_at: string; personas: number; precio_unitario: number; moneda: string }[]) {
      const m = meses.find((x) => x.mes === v.creado_at.slice(0, 7));
      if (!m) continue;
      const total = Number(v.precio_unitario) * v.personas;
      m.reservas++;
      if (v.moneda === 'USD') m.usd += total;
      else m.hnl += total;
    }
    return { hoteles: porHotel, ventas_tours: meses };
  },

  planes: async (_e, { db }) => {
    const { data, error } = await db.from('planes').select('*').order('precio_habitacion');
    revisar(error);
    return (data ?? []).map(
      (p): Plan => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio_habitacion: Number(p.precio_habitacion),
        moneda: p.moneda,
        activo: p.activo,
      }),
    );
  },

  guardarPlan: async ({ id, aplicar_a_actuales, ...p }, { db }) => {
    const nombre = String(p.nombre ?? '').trim().slice(0, 60);
    if (!nombre) throw new ErrorAdmin('El plan necesita un nombre.');
    const precio = Number(p.precio_habitacion);
    if (!Number.isFinite(precio) || precio < 0) throw new ErrorAdmin('Precio por habitación inválido.');
    const fila = {
      nombre,
      descripcion: String(p.descripcion ?? '').trim().slice(0, 300),
      precio_habitacion: Math.round(precio * 100) / 100,
      moneda: p.moneda === 'HNL' ? 'HNL' : 'USD',
      activo: Boolean(p.activo),
    };
    if (id) {
      if (!esUuid(id)) throw new ErrorAdmin('Plan inválido.');
      revisar((await db.from('planes').update(fila).eq('id', id)).error);
      // Los hoteles conservan su tarifa acordada, salvo que se pida actualizarlos.
      let actualizados = 0;
      if (aplicar_a_actuales) {
        const { data, error } = await db
          .from('hotels')
          .update({ tarifa_habitacion: fila.precio_habitacion, tarifa_moneda: fila.moneda })
          .eq('plan_id', id)
          .select('id');
        revisar(error);
        actualizados = data?.length ?? 0;
      }
      return { id, actualizados };
    }
    const { data, error } = await db.from('planes').insert(fila).select('id').single();
    revisar(error);
    return { id: data!.id, actualizados: 0 };
  },

  cobros: async (_e, { db }) => {
    const [hoteles, planes, rooms, pagos] = await Promise.all([
      db.from('hotels').select('id, nombre, estado, plan_id, pagado_hasta, tarifa_habitacion, tarifa_moneda, habitaciones_contratadas').order('nombre'),
      db.from('planes').select('id, precio_habitacion, moneda'),
      db.from('rooms').select('hotel_id').eq('estado_placa', 'activa'),
      db.from('pagos_hotel').select('hotel_id, fecha_pago').order('fecha_pago', { ascending: false }),
    ]);
    [hoteles, planes, rooms, pagos].forEach((r) => revisar(r.error));
    const hoy = hoyISO();
    return (hoteles.data ?? []).map((h): CobroHotel => {
      const plan = (planes.data ?? []).find((p) => p.id === h.plan_id);
      const activas = (rooms.data ?? []).filter((r) => r.hotel_id === h.id).length;
      // Se cobra el mayor entre lo contratado y las placas activas (pasar placas a bodega no baja la cuota).
      const cobradas = Math.max(h.habitaciones_contratadas ?? 0, activas);
      const tarifa = plan ? (h.tarifa_habitacion !== null ? Number(h.tarifa_habitacion) : Number(plan.precio_habitacion)) : null;
      let estado_cobro: CobroHotel['estado_cobro'] = 'sin_plan';
      let dias: number | null = null;
      if (plan) {
        if (!h.pagado_hasta || h.pagado_hasta < hoy) {
          estado_cobro = 'vencido';
          dias = h.pagado_hasta ? diasEntre(h.pagado_hasta, hoy) : null;
        } else {
          dias = diasEntre(hoy, h.pagado_hasta);
          estado_cobro = dias <= 7 ? 'por_vencer' : 'al_dia';
        }
      }
      return {
        id: h.id,
        nombre: h.nombre,
        estado_hotel: h.estado,
        plan_id: h.plan_id,
        habitaciones_activas: activas,
        habitaciones_contratadas: h.habitaciones_contratadas ?? 0,
        habitaciones_cobradas: cobradas,
        tarifa_habitacion: tarifa,
        mensualidad: tarifa !== null ? Math.round(tarifa * cobradas * 100) / 100 : null,
        moneda: plan ? (h.tarifa_moneda ?? plan.moneda) : null,
        pagado_hasta: h.pagado_hasta,
        estado_cobro,
        dias,
        ultimo_pago: (pagos.data ?? []).find((p) => p.hotel_id === h.id)?.fecha_pago ?? null,
      };
    });
  },

  asignarPlan: async ({ hotel_id, plan_id }, { db }) => {
    if (!esUuid(hotel_id) || (plan_id !== null && !esUuid(plan_id))) throw new ErrorAdmin('Solicitud inválida.');
    revisar((await db.from('hotels').update({ plan_id, ...(await tarifaDePlan(db, plan_id)) }).eq('id', hotel_id)).error);
    return null;
  },

  ajustarCobro: async ({ hotel_id, habitaciones_contratadas, tarifa_habitacion }, { db }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const contratadas = Math.trunc(Number(habitaciones_contratadas));
    if (!(contratadas >= 0 && contratadas <= 5000)) throw new ErrorAdmin('Habitaciones contratadas inválidas.');
    const tarifa = tarifa_habitacion === null ? null : Number(tarifa_habitacion);
    if (tarifa !== null && (!Number.isFinite(tarifa) || tarifa < 0)) throw new ErrorAdmin('Tarifa inválida.');
    revisar(
      (
        await db
          .from('hotels')
          .update({ habitaciones_contratadas: contratadas, tarifa_habitacion: tarifa === null ? null : Math.round(tarifa * 100) / 100 })
          .eq('id', hotel_id)
      ).error,
    );
    return null;
  },

  registrarPago: async (p, { db, admin }) => {
    if (!esUuid(p.hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const monto = Number(p.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new ErrorAdmin('Escribe el monto pagado.');
    const meses = Math.trunc(Number(p.meses));
    if (!(meses >= 1 && meses <= 24)) throw new ErrorAdmin('Los meses pagados deben ser entre 1 y 24.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha_pago))) throw new ErrorAdmin('Fecha de pago inválida.');
    if (!METODOS.includes(p.metodo)) throw new ErrorAdmin('Método de pago inválido.');

    const { data: hotel, error } = await db.from('hotels').select('pagado_hasta').eq('id', p.hotel_id).maybeSingle();
    revisar(error);
    if (!hotel) throw new ErrorAdmin('Ese hotel no existe.');
    // El periodo pagado sigue donde terminó el anterior; si ya estaba vencido, arranca hoy.
    const hoy = hoyISO();
    const desde = hotel.pagado_hasta && hotel.pagado_hasta > hoy ? hotel.pagado_hasta : hoy;
    const hasta = sumarMeses(desde, meses);

    revisar(
      (
        await db.from('pagos_hotel').insert({
          hotel_id: p.hotel_id,
          monto: Math.round(monto * 100) / 100,
          moneda: p.moneda === 'HNL' ? 'HNL' : 'USD',
          fecha_pago: p.fecha_pago,
          meses,
          periodo_desde: desde,
          periodo_hasta: hasta,
          metodo: p.metodo,
          referencia: String(p.referencia ?? '').trim().slice(0, 120),
          notas: String(p.notas ?? '').trim().slice(0, 300),
          registrado_por: admin.nombre,
          // Factura SAR: el monto incluye 15 % de ISV → se guarda el desglose.
          incluye_isv: Boolean(p.incluye_isv),
          subtotal: p.incluye_isv ? Math.round((monto / 1.15) * 100) / 100 : null,
          isv: p.incluye_isv ? Math.round((monto - monto / 1.15) * 100) / 100 : null,
        })
      ).error,
    );
    revisar((await db.from('hotels').update({ pagado_hasta: hasta }).eq('id', p.hotel_id)).error);
    return { pagado_hasta: hasta };
  },

  pagosHotel: async ({ hotel_id }, { db }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const { data, error } = await db.from('pagos_hotel').select('*').eq('hotel_id', hotel_id).order('fecha_pago', { ascending: false }).limit(100);
    revisar(error);
    return (data ?? []).map(
      (x): PagoHotel => ({
        id: x.id,
        monto: Number(x.monto),
        moneda: x.moneda,
        fecha_pago: x.fecha_pago,
        meses: x.meses,
        periodo_desde: x.periodo_desde,
        periodo_hasta: x.periodo_hasta,
        metodo: x.metodo,
        referencia: x.referencia,
        notas: x.notas,
        registrado_por: x.registrado_por,
        incluye_isv: Boolean(x.incluye_isv),
        subtotal: x.subtotal === null ? null : Number(x.subtotal),
        isv: x.isv === null ? null : Number(x.isv),
      }),
    );
  },

  bitacora: async ({ hotel_id }, { db }) => {
    let consulta = db
      .from('bitacora_admin')
      .select('id, admin_nombre, accion, hotel_id, resumen, creado_at, hotels(nombre)')
      .order('creado_at', { ascending: false })
      .limit(300);
    if (hotel_id) {
      if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
      consulta = consulta.eq('hotel_id', hotel_id);
    }
    const { data, error } = await consulta;
    revisar(error);
    type Fila = { id: string; admin_nombre: string; accion: string; hotel_id: string | null; resumen: string; creado_at: string; hotels: { nombre: string } | null };
    return ((data ?? []) as unknown as Fila[]).map(
      (b): EntradaBitacora => ({
        id: b.id,
        admin_nombre: b.admin_nombre,
        accion: b.accion,
        hotel_id: b.hotel_id,
        hotel_nombre: b.hotels?.nombre ?? null,
        resumen: b.resumen,
        creado_at: b.creado_at,
      }),
    );
  },
};

// ---------------------------------------------------------------------------
// Bitácora: cada cambio hecho desde /admin queda registrado
// ---------------------------------------------------------------------------

const ROLES_TEXTO: Record<string, string> = { recepcion: 'Recepción', supervisor_gerente: 'Supervisor / Gerente' };
const ESTADOS_PLACA_TEXTO: Record<string, string> = { activa: 'Activa', en_stock: 'En bodega', danada: 'Dañada' };
const ESTADOS_RESERVA_TEXTO: Record<string, string> = { pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', cancelado: 'Cancelado', completado: 'Completado' };

/** Acciones que cambian algo (las de solo lectura no se registran; subir imágenes tampoco). */
const ACCIONES_REGISTRADAS = new Set<NombreAccion>([
  'guardarHotel', 'estadoHotel', 'crearHabitaciones', 'editarHabitacion', 'reemplazarPlaca', 'eliminarHabitacion',
  'invitarUsuario', 'enlaceAcceso', 'cambiarRol', 'quitarUsuario', 'guardarTour', 'eliminarTour', 'estadoReserva',
  'guardarPlan', 'asignarPlan', 'ajustarCobro', 'registrarPago',
]);

/** Datos para la bitácora que hay que leer ANTES de la acción (p. ej. lo que se va a borrar). */
async function contextoBitacora(db: SupabaseClient, accion: NombreAccion, e: Record<string, unknown>) {
  const ctx: { hotel_id: string | null; etiqueta: string } = { hotel_id: null, etiqueta: '' };
  if (typeof e.hotel_id === 'string' && esUuid(e.hotel_id)) ctx.hotel_id = e.hotel_id;
  if ((accion === 'guardarHotel' || accion === 'estadoHotel') && esUuid(e.id)) ctx.hotel_id = e.id;
  if (['editarHabitacion', 'reemplazarPlaca', 'eliminarHabitacion'].includes(accion) && esUuid(e.id)) {
    const { data } = await db.from('rooms').select('hotel_id, numero').eq('id', e.id).maybeSingle();
    ctx.hotel_id = data?.hotel_id ?? null;
    ctx.etiqueta = data ? `Hab. ${data.numero}` : '';
  }
  if (['enlaceAcceso', 'cambiarRol', 'quitarUsuario'].includes(accion) && esUuid(e.staff_id)) {
    const { data } = await db.from('hotel_staff').select('hotel_id, nombre').eq('id', e.staff_id).maybeSingle();
    ctx.hotel_id = data?.hotel_id ?? null;
    ctx.etiqueta = data?.nombre ?? '';
  }
  if ((accion === 'eliminarTour' || accion === 'guardarTour') && esUuid(e.id)) {
    const { data } = await db.from('curated_tours').select('titulo_es').eq('id', e.id).maybeSingle();
    ctx.etiqueta = data?.titulo_es ?? '';
  }
  if (accion === 'estadoReserva' && esUuid(e.id)) {
    const { data } = await db.from('tour_bookings').select('hotel_id, voucher_codigo').eq('id', e.id).maybeSingle();
    ctx.hotel_id = data?.hotel_id ?? null;
    ctx.etiqueta = data?.voucher_codigo ?? '';
  }
  if (accion === 'asignarPlan' && esUuid(e.plan_id)) {
    const { data } = await db.from('planes').select('nombre').eq('id', e.plan_id).maybeSingle();
    ctx.etiqueta = data?.nombre ?? '';
  }
  return ctx;
}

function resumenBitacora(accion: NombreAccion, e: Record<string, unknown>, salida: unknown, etiqueta: string): string {
  const s = (salida ?? {}) as Record<string, unknown>;
  const datos = (e.datos ?? {}) as Record<string, unknown>;
  switch (accion) {
    case 'guardarHotel':
      return e.id ? `Editó los datos del hotel ${datos.nombre ?? ''}`.trim() : `Creó el hotel ${datos.nombre ?? ''}`.trim();
    case 'estadoHotel':
      return e.estado === 'suspendido' ? 'Suspendió el hotel' : 'Reactivó el hotel';
    case 'crearHabitaciones':
      return `Creó ${s.creadas ?? 0} habitaciones con su placa`;
    case 'editarHabitacion':
      return e.estado_placa ? `${etiqueta}: placa → ${ESTADOS_PLACA_TEXTO[String(e.estado_placa)] ?? e.estado_placa}` : `${etiqueta}: cambió el número a ${e.numero}`;
    case 'reemplazarPlaca':
      return `${etiqueta}: reemplazó la placa (código nuevo ${s.codigo_placa ?? ''})`;
    case 'eliminarHabitacion':
      return `Eliminó la ${etiqueta || 'habitación'}`;
    case 'invitarUsuario':
      return `Dio acceso al panel a ${e.nombre} (${e.correo}) como ${ROLES_TEXTO[String(e.rol)] ?? e.rol}`;
    case 'enlaceAcceso':
      return `Generó un enlace de acceso para ${etiqueta}`;
    case 'cambiarRol':
      return `${etiqueta}: rol → ${ROLES_TEXTO[String(e.rol)] ?? e.rol}`;
    case 'quitarUsuario':
      return `Quitó el acceso al panel de ${etiqueta}`;
    case 'guardarTour':
      return e.id ? `Editó el tour «${e.titulo_es}»` : `Creó el tour «${e.titulo_es}»`;
    case 'eliminarTour':
      return `Eliminó el tour «${etiqueta}»`;
    case 'estadoReserva':
      return `Reserva ${etiqueta} → ${ESTADOS_RESERVA_TEXTO[String(e.estado)] ?? e.estado}`;
    case 'guardarPlan':
      return e.id
        ? `Editó el plan «${e.nombre}»${e.aplicar_a_actuales ? ` y actualizó la tarifa de ${s.actualizados ?? 0} hoteles` : ''}`
        : `Creó el plan «${e.nombre}»`;
    case 'ajustarCobro':
      return `Cobro ajustado: ${e.habitaciones_contratadas} habitaciones contratadas${e.tarifa_habitacion !== null ? ` · tarifa ${e.tarifa_habitacion} por habitación` : ''}`;
    case 'asignarPlan':
      return e.plan_id ? `Asignó el plan «${etiqueta}»` : 'Quitó el plan del hotel';
    case 'registrarPago':
      return `Registró un pago de ${e.moneda === 'HNL' ? 'L' : '$'}${Number(e.monto).toFixed(2)}${e.incluye_isv ? ' con ISV' : ''} (${e.meses} ${Number(e.meses) === 1 ? 'mes' : 'meses'}, ${e.metodo}) · pagado hasta ${s.pagado_hasta ?? ''}`;
    default:
      return accion;
  }
}

/** Lo único que puede hacer el rol Operaciones: Monitoreo y Tours y reservas (sin ver márgenes). */
const ACCIONES_OPERACIONES = new Set<NombreAccion>([
  'yo', 'monitoreo', 'tours', 'guardarTour', 'eliminarTour', 'reservas', 'estadoReserva', 'subirImagen',
]);

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const db = clienteServicio();
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new ErrorAdmin('Inicia sesión.', 401);
    const { data: auth, error: errorAuth } = await db.auth.getUser(token);
    if (errorAuth || !auth.user) throw new ErrorAdmin('Tu sesión venció. Vuelve a iniciar sesión.', 401);
    const { data: admin, error: errorAdmin } = await db.from('seven_stay_admins').select('nombre, rol').eq('user_id', auth.user.id).maybeSingle();
    if (errorAdmin) {
      // Lo más común: todavía no se corrió la migración del panel interno.
      throw new ErrorAdmin(
        /seven_stay_admins/.test(errorAdmin.message)
          ? 'Falta la tabla seven_stay_admins: corre la migración 20261123000000_panel_seven_stay.sql en Supabase.'
          : errorAdmin.message,
        500,
      );
    }
    if (!admin) throw new ErrorAdmin(`Tu usuario (${auth.user.email ?? auth.user.id}) no está dado de alta en seven_stay_admins.`, 403);

    const cuerpo = (await req.json()) as { accion?: string; entrada?: unknown };
    const accion = cuerpo.accion as NombreAccion;
    if (!accion || !Object.hasOwn(ACCIONES, accion)) throw new ErrorAdmin('Acción desconocida.');
    const rol: RolAdmin = admin.rol === 'operaciones' ? 'operaciones' : 'super_admin';
    if (rol === 'operaciones' && !ACCIONES_OPERACIONES.has(accion)) {
      throw new ErrorAdmin('Tu rol (Operaciones) no tiene acceso a esta sección.', 403);
    }
    const origen = req.headers.get('origin') ?? req.nextUrl.origin;
    const manejador = ACCIONES[accion] as Manejador<NombreAccion>;
    const entrada = (cuerpo.entrada ?? {}) as Record<string, unknown>;
    const registrar = ACCIONES_REGISTRADAS.has(accion);
    const ctx = registrar ? await contextoBitacora(db, accion, entrada) : null;
    const salida = await manejador(cuerpo.entrada as never, {
      db,
      admin: { nombre: admin.nombre, correo: auth.user.email ?? '', rol },
      origen,
    });
    if (ctx) {
      const hotelId = ctx.hotel_id ?? (accion === 'guardarHotel' ? ((salida as { id?: string }).id ?? null) : null);
      // La bitácora nunca debe romper la acción que ya se hizo.
      const { error: errorBitacora } = await db.from('bitacora_admin').insert({
        admin_id: auth.user.id,
        admin_nombre: admin.nombre,
        accion,
        hotel_id: hotelId,
        resumen: resumenBitacora(accion, entrada, salida, ctx.etiqueta).slice(0, 300),
      });
      if (errorBitacora) console.error('[api/admin] bitácora', errorBitacora.message);
    }
    return Response.json({ ok: true, salida });
  } catch (error) {
    const estado = error instanceof ErrorAdmin ? error.estado : 500;
    const mensaje = error instanceof Error ? error.message : 'Error inesperado.';
    if (estado === 500) console.error('[api/admin]', error);
    return Response.json({ ok: false, error: mensaje }, { status: estado });
  }
}
