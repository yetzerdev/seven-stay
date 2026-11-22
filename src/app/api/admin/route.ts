import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import {
  categoriaPorHabitaciones,
  CONCEPTOS,
  cotizarMensualidad,
  cotizarPlacas,
  gravadoPara,
  montoEnLetras,
  PLACAS,
  PLANES_SAAS,
  r2,
  totalesSar,
  type Concepto,
  type PlanSaas,
} from '@/lib/facturacion/tarifas';
import type { NextRequest } from 'next/server';

import type {
  AccionesAdmin,
  DatosHotelAdmin,
  EstadoPlaca,
  EstadoReserva,
  HotelResumen,
  ConfigFiscal,
  Cotizacion,
  EstadoCai,
  EntradaBitacora,
  Factura,
  MetodoPagoFactura,
  MetricaHotel,
  MonitoreoHotel,
  NombreAccion,
  NuevaFactura,
  Suscripcion,
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

const METODOS_FACTURA: MetodoPagoFactura[] = ['transferencia', 'deposito', 'cheque'];
const PLANES: PlanSaas[] = ['boutique', 'estandar', 'resort'];
const CONCEPTOS_VALIDOS = Object.keys(CONCEPTOS) as Concepto[];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
    plan_saas: PLANES.includes(d.plan_saas as PlanSaas) ? d.plan_saas : null,
    gratis_hasta: esFecha(d.gratis_hasta) ? d.gratis_hasta : '',
    direccion_fiscal: String(d.direccion_fiscal ?? '').trim().slice(0, 300),
    tipo_placa: d.tipo_placa === 'esencial' || d.tipo_placa === 'ejecutiva' ? d.tipo_placa : null,
    habitaciones_contratadas: Math.min(5000, Math.max(0, Math.trunc(Number(d.habitaciones_contratadas) || 0))),
  };
}

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** "2026-11-15" → "Noviembre 2026" */
const etiquetaMes = (fecha: string) => {
  const nombre = MESES[Number(fecha.slice(5, 7)) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${fecha.slice(0, 4)}`;
};

type FilaConfig = ConfigFiscal & { correlativo_actual: number | null };

async function leerConfigFiscal(db: SupabaseClient): Promise<FilaConfig> {
  const { data, error } = await db.from('config_fiscal').select('*').eq('id', 1).maybeSingle();
  if (error && /config_fiscal/.test(error.message)) {
    throw new ErrorAdmin('Falta la tabla de facturación: corre la migración 20261126000000_facturacion_sar.sql en Supabase.', 500);
  }
  revisar(error);
  return exigir(data as FilaConfig | null, 'Falta la configuración fiscal.');
}

function aConfig(c: FilaConfig): ConfigFiscal {
  return {
    nombre_legal: c.nombre_legal,
    denominacion: c.denominacion,
    rtn: c.rtn,
    domicilio: c.domicilio,
    telefono: c.telefono,
    correo: c.correo,
    cai: c.cai,
    rango_inicial: c.rango_inicial,
    rango_final: c.rango_final,
    fecha_limite: c.fecha_limite,
    registro_sag: c.registro_sag,
    banco: c.banco,
    tipo_cuenta: c.tipo_cuenta,
    numero_cuenta: c.numero_cuenta,
    titular: c.titular,
  };
}

function estadoCai(c: FilaConfig): EstadoCai {
  const base = { correlativo_actual: c.correlativo_actual === null ? null : Number(c.correlativo_actual), siguiente: null, restantes: null, dias_para_limite: null };
  if (!c.rtn || !c.cai || !c.rango_inicial || !c.rango_final || !c.fecha_limite) {
    return { ...base, bloqueo: 'Completa RTN, CAI, rango autorizado y fecha límite para poder emitir facturas.' };
  }
  const dias = diasEntre(hoyISO(), c.fecha_limite);
  const inicial = Number(c.rango_inicial.slice(11));
  const final = Number(c.rango_final.slice(11));
  const siguiente = Math.max(c.correlativo_actual === null ? inicial : Number(c.correlativo_actual) + 1, inicial);
  const restantes = final - siguiente + 1;
  return {
    ...base,
    siguiente: restantes > 0 ? `${c.rango_inicial.slice(0, 11)}${String(siguiente).padStart(8, '0')}` : null,
    restantes: Math.max(0, restantes),
    dias_para_limite: dias,
    bloqueo: dias < 0 ? 'La fecha límite de emisión del CAI ya pasó.' : restantes <= 0 ? 'Se terminó el rango autorizado del CAI.' : null,
  };
}

function aCotizacion(c: Record<string, unknown>): Cotizacion {
  return {
    id: String(c.id),
    numero: String(c.numero),
    creado_at: String(c.creado_at),
    hotel_id: (c.hotel_id as string | null) ?? null,
    cliente_nombre: String(c.cliente_nombre),
    cliente_rtn: String(c.cliente_rtn ?? ''),
    ciudad: String(c.ciudad ?? ''),
    contacto: String(c.contacto ?? ''),
    habitaciones: Number(c.habitaciones),
    tipo_placa: (c.tipo_placa as Cotizacion['tipo_placa']) ?? null,
    plan_saas: (c.plan_saas as Cotizacion['plan_saas']) ?? null,
    bonificacion_piloto: Boolean(c.bonificacion_piloto),
    notas: String(c.notas ?? ''),
    estado: c.estado as Cotizacion['estado'],
    convertida_hotel_id: (c.convertida_hotel_id as string | null) ?? null,
  };
}

function aFactura(f: Record<string, unknown>): Factura {
  const n = (v: unknown) => Number(v ?? 0);
  const estado = f.estado === 'pendiente' && String(f.vence) < hoyISO() ? 'vencida' : (f.estado as Factura['estado']);
  return {
    id: String(f.id),
    numero: String(f.numero),
    cai: String(f.cai),
    rango_inicial: String(f.rango_inicial),
    rango_final: String(f.rango_final),
    fecha_limite: String(f.fecha_limite),
    emisor: f.emisor as Factura['emisor'],
    fecha_emision: String(f.fecha_emision),
    condicion: f.condicion as Factura['condicion'],
    vence: String(f.vence),
    hotel_id: (f.hotel_id as string | null) ?? null,
    cotizacion_id: (f.cotizacion_id as string | null) ?? null,
    cliente_nombre: String(f.cliente_nombre),
    cliente_rtn: String(f.cliente_rtn ?? ''),
    cliente_direccion: String(f.cliente_direccion ?? ''),
    lineas: (f.lineas as Factura['lineas']) ?? [],
    descuentos: n(f.descuentos),
    importe_exento: n(f.importe_exento),
    importe_exonerado: n(f.importe_exonerado),
    importe_gravado: n(f.importe_gravado),
    isv: n(f.isv),
    total: n(f.total),
    total_letras: String(f.total_letras),
    orden_compra_exenta: String(f.orden_compra_exenta ?? ''),
    constancia_exonerado: String(f.constancia_exonerado ?? ''),
    registro_sag: String(f.registro_sag ?? ''),
    mensualidad_meses: f.mensualidad_meses === null || f.mensualidad_meses === undefined ? null : n(f.mensualidad_meses),
    estado,
    pago_fecha: (f.pago_fecha as string | null) ?? null,
    pago_metodo: (f.pago_metodo as Factura['pago_metodo']) ?? null,
    pago_referencia: String(f.pago_referencia ?? ''),
    retencion: n(f.retencion),
    retencion_comprobante: String(f.retencion_comprobante ?? ''),
    anulada_motivo: String(f.anulada_motivo ?? ''),
    emitida_por: String(f.emitida_por ?? ''),
  };
}

/** Hoteles activos con su mensualidad, próximo corte y estado de cobro. */
async function cargarSuscripciones(db: SupabaseClient): Promise<Suscripcion[]> {
  const [hoteles, rooms, pendientes] = await Promise.all([
    db.from('hotels').select('id, nombre, rtn, estado, plan_saas, habitaciones_contratadas, pagado_hasta, gratis_hasta').eq('estado', 'activo').order('nombre'),
    db.from('rooms').select('hotel_id'),
    db.from('facturas').select('hotel_id, numero').eq('estado', 'pendiente').not('mensualidad_meses', 'is', null),
  ]);
  [hoteles, rooms, pendientes].forEach((x) => revisar(x.error));
  const hoy = hoyISO();
  return (hoteles.data ?? []).map((h): Suscripcion => {
    const habitaciones = Math.max(h.habitaciones_contratadas ?? 0, (rooms.data ?? []).filter((r) => r.hotel_id === h.id).length);
    const plan: PlanSaas = h.plan_saas ?? categoriaPorHabitaciones(habitaciones);
    const precio = cotizarMensualidad(plan);
    const enGratis = Boolean(h.gratis_hasta && h.gratis_hasta >= hoy);
    const corte = h.pagado_hasta ?? h.gratis_hasta ?? null;
    let estado: Suscripcion['estado'];
    let mora = 0;
    if (enGratis && (!h.pagado_hasta || h.pagado_hasta < h.gratis_hasta)) estado = 'gratis';
    else if (!corte || corte < hoy) {
      estado = 'vencido';
      mora = corte ? diasEntre(corte, hoy) : 0;
    } else estado = diasEntre(hoy, corte) <= 7 ? 'por_vencer' : 'al_dia';
    return {
      hotel_id: h.id,
      nombre: h.nombre,
      cliente_rtn: h.rtn ?? '',
      plan,
      plan_automatico: !h.plan_saas,
      habitaciones,
      subtotal: precio.subtotal,
      total: precio.total,
      pagado_hasta: h.pagado_hasta,
      gratis_hasta: h.gratis_hasta,
      proximo_corte: corte,
      dias_mora: mora,
      estado,
      factura_pendiente: (pendientes.data ?? []).find((f) => f.hotel_id === h.id)?.numero ?? null,
    };
  });
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
      db.from('hotels').select('id, nombre, logo_url, estado, modo_tours, creado_at, pagado_hasta, gratis_hasta').order('nombre'),
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
        pago_vencido: Boolean(h.pagado_hasta && h.pagado_hasta < hoyISO() && !(h.gratis_hasta && h.gratis_hasta >= hoyISO())),
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
        plan_saas: h.plan_saas ?? null,
        gratis_hasta: h.gratis_hasta ?? '',
        direccion_fiscal: h.direccion_fiscal ?? '',
        tipo_placa: h.tipo_placa ?? null,
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
      revisar((await db.from('hotels').update({ ...limpio, gratis_hasta: limpio.gratis_hasta || null }).eq('id', id)).error);
      return { id };
    }
    const { data, error } = await db.from('hotels').insert({ ...limpio, gratis_hasta: limpio.gratis_hasta || null }).select('id').single();
    revisar(error);
    return { id: data!.id };
  },

  eliminarHotel: async ({ id, confirmacion }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Hotel inválido.');
    const { data: hotel, error } = await db.from('hotels').select('nombre').eq('id', id).maybeSingle();
    revisar(error);
    if (!hotel) throw new ErrorAdmin('Ese hotel ya no existe.');
    if (String(confirmacion ?? '').trim() !== hotel.nombre.trim()) {
      throw new ErrorAdmin('Para eliminarlo escribe el nombre del hotel exactamente igual.');
    }
    // Los usuarios del panel de este hotel se borran también: sin hotel no tienen a qué entrar.
    const { data: staff, error: errorStaff } = await db.from('hotel_staff').select('user_id').eq('hotel_id', id).not('user_id', 'is', null);
    revisar(errorStaff);
    // Borrar el hotel borra en cascada habitaciones, solicitudes, personal, menú, tours propios,
    // reservas, pagos y suscripciones de avisos.
    revisar((await db.from('hotels').delete().eq('id', id)).error);
    let usuarios_borrados = 0;
    for (const s of staff ?? []) {
      const { error: errorUsuario } = await db.auth.admin.deleteUser(s.user_id);
      if (!errorUsuario) usuarios_borrados++;
      else console.error('[api/admin] no se pudo borrar el usuario', s.user_id, errorUsuario.message);
    }
    return { usuarios_borrados };
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

  configFiscal: async (_e, { db }) => {
    const c = await leerConfigFiscal(db);
    return { config: aConfig(c), estado: estadoCai(c) };
  },

  guardarConfigFiscal: async (d, { db }) => {
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const rtn = texto(d.rtn, 14).toUpperCase();
    const cai = texto(d.cai, 37).toUpperCase();
    const inicial = texto(d.rango_inicial, 19);
    const final = texto(d.rango_final, 19);
    if (rtn && !/^[0-9A-Z]{14}$/.test(rtn)) throw new ErrorAdmin('El RTN debe tener 14 caracteres.');
    if (cai && !/^[0-9A-F]{6}(-[0-9A-F]{6}){4}-[0-9A-F]{2}$/.test(cai)) throw new ErrorAdmin('El CAI debe tener el formato XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX.');
    for (const r of [inicial, final]) {
      if (r && !/^\d{3}-\d{3}-\d{2}-\d{8}$/.test(r)) throw new ErrorAdmin('Los rangos deben tener el formato 000-001-01-00000001.');
    }
    if (inicial && final) {
      if (inicial.slice(0, 11) !== final.slice(0, 11)) throw new ErrorAdmin('El rango inicial y el final deben ser del mismo establecimiento, punto y tipo (los primeros 11 caracteres).');
      if (Number(final.slice(11)) < Number(inicial.slice(11))) throw new ErrorAdmin('El rango final no puede ser menor que el inicial.');
    }
    if (d.fecha_limite && !esFecha(d.fecha_limite)) throw new ErrorAdmin('Fecha límite inválida.');
    const anterior = await leerConfigFiscal(db);
    // CAI o rango nuevos: el correlativo vuelve a empezar desde el rango inicial autorizado.
    const reiniciar = anterior.cai !== cai || anterior.rango_inicial !== inicial;
    revisar(
      (
        await db
          .from('config_fiscal')
          .update({
            nombre_legal: texto(d.nombre_legal, 120) || 'YETZER BANEGAS',
            denominacion: texto(d.denominacion, 120),
            rtn,
            domicilio: texto(d.domicilio, 300),
            telefono: texto(d.telefono, 40),
            correo: texto(d.correo, 120),
            cai,
            rango_inicial: inicial,
            rango_final: final,
            fecha_limite: d.fecha_limite || null,
            registro_sag: texto(d.registro_sag, 60),
            banco: texto(d.banco, 80),
            tipo_cuenta: texto(d.tipo_cuenta, 60),
            numero_cuenta: texto(d.numero_cuenta, 60),
            titular: texto(d.titular, 120),
            ...(reiniciar ? { correlativo_actual: null } : {}),
            actualizado_at: new Date().toISOString(),
          })
          .eq('id', 1)
      ).error,
    );
    return null;
  },

  cotizaciones: async (_e, { db }) => {
    const { data, error } = await db.from('cotizaciones').select('*').order('creado_at', { ascending: false }).limit(300);
    revisar(error);
    return (data ?? []).map(aCotizacion);
  },

  cotizacion: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Cotización inválida.');
    const { data, error } = await db.from('cotizaciones').select('*').eq('id', id).maybeSingle();
    revisar(error);
    return { cotizacion: aCotizacion(exigir(data, 'Esa cotización no existe.')), emisor: aConfig(await leerConfigFiscal(db)) };
  },

  guardarCotizacion: async ({ id, ...c }, { db, admin }) => {
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const nombre = texto(c.cliente_nombre, 120);
    if (!nombre) throw new ErrorAdmin('Escribe el nombre del hotel o la razón social.');
    const habitaciones = Math.trunc(Number(c.habitaciones));
    if (!(habitaciones >= 1 && habitaciones <= 5000)) throw new ErrorAdmin('Escribe la cantidad de habitaciones.');
    if (!c.tipo_placa && !c.plan_saas) throw new ErrorAdmin('Elige al menos un tipo de placa o una mensualidad.');
    const fila = {
      cliente_nombre: nombre,
      cliente_rtn: texto(c.cliente_rtn, 14).toUpperCase(),
      ciudad: texto(c.ciudad, 80),
      contacto: texto(c.contacto, 120),
      habitaciones,
      tipo_placa: c.tipo_placa === 'esencial' || c.tipo_placa === 'ejecutiva' ? c.tipo_placa : null,
      plan_saas: PLANES.includes(c.plan_saas as PlanSaas) ? c.plan_saas : null,
      bonificacion_piloto: Boolean(c.bonificacion_piloto),
      notas: texto(c.notas, 600),
      hotel_id: esUuid(c.hotel_id) ? c.hotel_id : null,
    };
    if (id) {
      if (!esUuid(id)) throw new ErrorAdmin('Cotización inválida.');
      revisar((await db.from('cotizaciones').update(fila).eq('id', id)).error);
      return { id };
    }
    const { data, error } = await db.from('cotizaciones').insert({ ...fila, creado_por: admin.nombre }).select('id').single();
    revisar(error);
    return { id: data!.id };
  },

  convertirCotizacion: async ({ id, dar_alta }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Cotización inválida.');
    const { data, error } = await db.from('cotizaciones').select('*').eq('id', id).maybeSingle();
    revisar(error);
    const c = aCotizacion(exigir(data, 'Esa cotización no existe.'));
    let hotelId = c.hotel_id ?? c.convertida_hotel_id;
    if (dar_alta && !hotelId) {
      // Alta del hotel con lo que trae la cotización; el resto lo completa Seven Stay en su ficha.
      const gratis = c.bonificacion_piloto ? sumarMeses(hoyISO(), 1) : null;
      const { data: nuevo, error: errorAlta } = await db
        .from('hotels')
        .insert({
          nombre: c.cliente_nombre,
          rtn: c.cliente_rtn,
          habitaciones_contratadas: c.habitaciones,
          plan_saas: c.plan_saas && c.plan_saas !== categoriaPorHabitaciones(c.habitaciones) ? c.plan_saas : null,
          gratis_hasta: gratis,
          moneda_default: 'HNL',
          tipo_placa: c.tipo_placa,
          direccion_fiscal: c.ciudad,
        })
        .select('id')
        .single();
      revisar(errorAlta);
      hotelId = nuevo!.id;
    }
    revisar(
      (await db.from('cotizaciones').update({ estado: 'convertida', ...(hotelId ? { convertida_hotel_id: hotelId } : {}) }).eq('id', id)).error,
    );
    // Borrador de la factura de anticipo (50 % de las placas); si no cotizó placas, la primera mensualidad.
    const lineas: NuevaFactura['lineas'] = [];
    if (c.tipo_placa) {
      const p = cotizarPlacas(c.tipo_placa, c.habitaciones);
      lineas.push({
        cantidad: 1,
        descripcion: `${CONCEPTOS.anticipo_placas} — ${PLACAS[c.tipo_placa].nombre}: ${c.habitaciones} placas × L. ${p.unitarioConIsv.toFixed(2)} ISV incluido`,
        precio_unitario: p.anticipoSinIsv,
        concepto: 'anticipo_placas',
        total_con_isv: p.anticipo,
      });
    } else if (c.plan_saas) {
      lineas.push({
        cantidad: 1,
        descripcion: `${CONCEPTOS.mensualidad} — Plan ${PLANES_SAAS[c.plan_saas].nombre} — ${etiquetaMes(hoyISO())}`,
        precio_unitario: PLANES_SAAS[c.plan_saas].mensual,
        concepto: 'mensualidad',
      });
    }
    return {
      hotel_id: hotelId ?? null,
      borrador: {
        hotel_id: hotelId ?? null,
        cotizacion_id: c.id,
        cliente_nombre: c.cliente_nombre,
        cliente_rtn: c.cliente_rtn,
        cliente_direccion: c.ciudad,
        condicion: 'contado',
        vence: sumarDias(hoyISO(), 7),
        lineas,
        orden_compra_exenta: '',
        constancia_exonerado: '',
        registro_sag: '',
        descuentos: 0,
        mensualidad_meses: lineas[0]?.concepto === 'mensualidad' ? 1 : null,
      },
    };
  },

  facturas: async ({ desde, hasta }, { db }) => {
    let consulta = db.from('facturas').select('*').order('fecha_emision', { ascending: false }).order('correlativo', { ascending: false }).limit(2000);
    if (esFecha(desde)) consulta = consulta.gte('fecha_emision', desde);
    if (esFecha(hasta)) consulta = consulta.lte('fecha_emision', hasta);
    const { data, error } = await consulta;
    revisar(error);
    return (data ?? []).map(aFactura);
  },

  factura: async ({ id }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Factura inválida.');
    const { data, error } = await db.from('facturas').select('*').eq('id', id).maybeSingle();
    revisar(error);
    return aFactura(exigir(data, 'Esa factura no existe.'));
  },

  emitirFactura: async (f, { db, admin }) => {
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const cliente = texto(f.cliente_nombre, 160);
    if (!cliente) throw new ErrorAdmin('Escribe la razón social o el nombre del hotel.');
    const rtn = texto(f.cliente_rtn, 14).toUpperCase();
    if (rtn && !/^[0-9A-Z]{14}$/.test(rtn)) throw new ErrorAdmin('El RTN del cliente debe tener 14 caracteres (o déjalo vacío para consumidor final).');
    if (f.condicion !== 'contado' && f.condicion !== 'credito') throw new ErrorAdmin('Condición de pago inválida.');
    if (!esFecha(f.vence) || f.vence < hoyISO()) throw new ErrorAdmin('La fecha de vencimiento no puede ser anterior a hoy.');
    if (!Array.isArray(f.lineas) || f.lineas.length === 0 || f.lineas.length > 30) throw new ErrorAdmin('La factura necesita entre 1 y 30 líneas.');
    const lineas = f.lineas.map((l) => {
      const cantidad = Number(l.cantidad);
      const precio = r2(Number(l.precio_unitario));
      const descripcion = texto(l.descripcion, 300);
      if (!descripcion) throw new ErrorAdmin('Cada línea necesita una descripción.');
      if (!(cantidad > 0 && cantidad <= 100000)) throw new ErrorAdmin('Cantidad inválida en una línea.');
      if (!Number.isFinite(precio) || precio < 0) throw new ErrorAdmin('Precio inválido en una línea.');
      // Precio cerrado: el subtotal debe corresponder a su total final ÷ 1.15.
      const cerrado = l.total_con_isv != null && Number(l.total_con_isv) > 0 ? r2(Number(l.total_con_isv)) : null;
      if (cerrado !== null && Math.abs(gravadoPara(cerrado) - r2(cantidad * precio)) > 0.02) {
        throw new ErrorAdmin('Una línea con precio cerrado no cuadra con su total final.');
      }
      return {
        cantidad,
        descripcion,
        precio_unitario: precio,
        total: r2(cantidad * precio),
        concepto: CONCEPTOS_VALIDOS.includes(l.concepto) ? l.concepto : 'libre',
        total_con_isv: cerrado,
      };
    });
    const descuento = r2(Number(f.descuentos) || 0);
    if (descuento < 0) throw new ErrorAdmin('El descuento no puede ser negativo.');
    const totales = totalesSar(lineas, descuento);
    if (totales.total <= 0) throw new ErrorAdmin('El total de la factura debe ser mayor que cero.');
    const meses = f.mensualidad_meses ? Math.trunc(Number(f.mensualidad_meses)) : null;
    const { data, error } = await db.rpc('emitir_factura', {
      p_factura: {
        ...totales,
        condicion: f.condicion,
        vence: f.vence,
        hotel_id: esUuid(f.hotel_id) ? f.hotel_id : '',
        cotizacion_id: esUuid(f.cotizacion_id) ? f.cotizacion_id : '',
        cliente_nombre: cliente,
        cliente_rtn: rtn,
        cliente_direccion: texto(f.cliente_direccion, 300),
        lineas,
        total_letras: montoEnLetras(totales.total),
        orden_compra_exenta: texto(f.orden_compra_exenta, 60),
        constancia_exonerado: texto(f.constancia_exonerado, 60),
        registro_sag: texto(f.registro_sag, 60),
        mensualidad_meses: meses && meses >= 1 && meses <= 24 && esUuid(f.hotel_id) ? meses : '',
        emitida_por: admin.nombre,
      },
    });
    if (error) {
      const avisos: Record<string, string> = {
        config_incompleta: 'Falta completar la Configuración Fiscal (RTN, CAI, rango y fecha límite) antes de emitir.',
        cai_vencido: 'La fecha límite de emisión del CAI ya pasó: solicita un CAI nuevo a la SAR y actualízalo en Configuración Fiscal.',
        rango_agotado: 'Se terminó el rango autorizado del CAI: solicita un rango nuevo a la SAR.',
        rango_invalido: 'El rango autorizado de la Configuración Fiscal no es válido.',
      };
      const clave = Object.keys(avisos).find((k) => error.message.includes(k));
      throw new ErrorAdmin(clave ? avisos[clave] : error.message);
    }
    const emitida = data as { id: string; numero: string };
    return { id: emitida.id, numero: emitida.numero };
  },

  pagarFactura: async ({ id, fecha, metodo, referencia, retencion, retencion_comprobante }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Factura inválida.');
    if (!esFecha(fecha) || fecha > hoyISO()) throw new ErrorAdmin('Fecha de pago inválida.');
    if (!METODOS_FACTURA.includes(metodo)) throw new ErrorAdmin('Método de pago inválido.');
    const ret = r2(Number(retencion) || 0);
    const { data: f, error } = await db.from('facturas').select('estado, total, hotel_id, mensualidad_meses').eq('id', id).maybeSingle();
    revisar(error);
    if (!f) throw new ErrorAdmin('Esa factura no existe.');
    if (f.estado !== 'pendiente') throw new ErrorAdmin('Solo una factura pendiente se puede marcar como pagada.');
    if (ret < 0 || ret >= Number(f.total)) throw new ErrorAdmin('La retención debe ser menor que el total de la factura.');
    revisar(
      (
        await db
          .from('facturas')
          .update({
            estado: 'pagada',
            pago_fecha: fecha,
            pago_metodo: metodo,
            pago_referencia: String(referencia ?? '').trim().slice(0, 80),
            retencion: ret,
            retencion_comprobante: String(retencion_comprobante ?? '').trim().slice(0, 80),
          })
          .eq('id', id)
      ).error,
    );
    // Mensualidad pagada: el hotel queda al día por los meses que cubre.
    let pagadoHasta: string | null = null;
    if (f.mensualidad_meses && f.hotel_id) {
      const { data: h } = await db.from('hotels').select('pagado_hasta, gratis_hasta').eq('id', f.hotel_id).maybeSingle();
      if (h) {
        const hoy = hoyISO();
        const desde = [h.pagado_hasta, h.gratis_hasta, hoy].filter(Boolean).sort().at(-1)!;
        pagadoHasta = sumarMeses(desde, f.mensualidad_meses);
        revisar((await db.from('hotels').update({ pagado_hasta: pagadoHasta }).eq('id', f.hotel_id)).error);
      }
    }
    return { pagado_hasta: pagadoHasta };
  },

  anularFactura: async ({ id, motivo }, { db }) => {
    if (!esUuid(id)) throw new ErrorAdmin('Factura inválida.');
    const m = String(motivo ?? '').trim().slice(0, 200);
    if (!m) throw new ErrorAdmin('Escribe el motivo de la anulación.');
    const { data: f, error } = await db.from('facturas').select('estado').eq('id', id).maybeSingle();
    revisar(error);
    if (!f) throw new ErrorAdmin('Esa factura no existe.');
    if (f.estado !== 'pendiente') throw new ErrorAdmin('Solo se puede anular una factura pendiente de pago.');
    // Nunca se borra: conserva su número correlativo, marcada como ANULADA (auditoría SAR).
    revisar((await db.from('facturas').update({ estado: 'anulada', anulada_motivo: m, anulada_at: new Date().toISOString() }).eq('id', id)).error);
    return null;
  },

  suscripciones: async (_e, { db }) => cargarSuscripciones(db),

  borradorMensualidad: async ({ hotel_id }, { db }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const s = (await cargarSuscripciones(db)).find((x) => x.hotel_id === hotel_id);
    if (!s) throw new ErrorAdmin('Ese hotel no está activo.');
    const inicio = [s.pagado_hasta, s.gratis_hasta, hoyISO()].filter(Boolean).sort().at(-1)!;
    return {
      hotel_id,
      cotizacion_id: null,
      cliente_nombre: s.nombre,
      cliente_rtn: s.cliente_rtn,
      cliente_direccion: '',
      condicion: 'credito',
      vence: s.proximo_corte && s.proximo_corte >= hoyISO() ? s.proximo_corte : sumarDias(hoyISO(), 7),
      lineas: [
        {
          cantidad: 1,
          descripcion: `${CONCEPTOS.mensualidad} — Plan ${PLANES_SAAS[s.plan].nombre} — ${etiquetaMes(inicio)}`,
          precio_unitario: s.subtotal,
          concepto: 'mensualidad',
        },
      ],
      orden_compra_exenta: '',
      constancia_exonerado: '',
      registro_sag: '',
      descuentos: 0,
      mensualidad_meses: 1,
    };
  },

  datosCobroHotel: async ({ hotel_id }, { db }) => {
    if (!esUuid(hotel_id)) throw new ErrorAdmin('Hotel inválido.');
    const [hotel, rooms] = await Promise.all([
      db.from('hotels').select('id, nombre, rtn, direccion_fiscal, tipo_placa, plan_saas, habitaciones_contratadas, pagado_hasta, gratis_hasta').eq('id', hotel_id).maybeSingle(),
      db.from('rooms').select('id', { count: 'exact', head: true }).eq('hotel_id', hotel_id),
    ]);
    revisar(hotel.error);
    revisar(rooms.error);
    const h = exigir(hotel.data, 'Ese hotel no existe.');
    const habitaciones = Math.max(h.habitaciones_contratadas ?? 0, rooms.count ?? 0);
    const inicio = [h.pagado_hasta, h.gratis_hasta, hoyISO()].filter(Boolean).sort().at(-1)!;
    return {
      hotel_id: h.id,
      cliente_nombre: h.nombre,
      cliente_rtn: h.rtn ?? '',
      cliente_direccion: h.direccion_fiscal ?? '',
      plan: h.plan_saas ?? categoriaPorHabitaciones(habitaciones),
      habitaciones,
      tipo_placa: h.tipo_placa ?? 'esencial',
      placa_supuesta: !h.tipo_placa,
      mes_mensualidad: etiquetaMes(inicio),
    };
  },

  reporteFiscal: async ({ desde, hasta }, { db }) => {
    if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) throw new ErrorAdmin('Rango de fechas inválido.');
    const [enRango, pagadas, pendientes, subs] = await Promise.all([
      db.from('facturas').select('*').gte('fecha_emision', desde).lte('fecha_emision', hasta).order('fecha_emision').order('correlativo').limit(5000),
      db.from('facturas').select('total, retencion').eq('estado', 'pagada').gte('pago_fecha', desde).lte('pago_fecha', hasta).limit(5000),
      db.from('facturas').select('total').eq('estado', 'pendiente').limit(5000),
      cargarSuscripciones(db),
    ]);
    [enRango, pagadas, pendientes].forEach((x) => revisar(x.error));
    const facturas = (enRango.data ?? []).map(aFactura);
    const validas = facturas.filter((f) => f.estado !== 'anulada');
    const suma = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
    return {
      desde,
      hasta,
      facturado: suma(validas.map((f) => f.importe_gravado + f.importe_exento + f.importe_exonerado)),
      isv: suma(validas.map((f) => f.isv)),
      cobrado: suma((pagadas.data ?? []).map((f) => Number(f.total) - Number(f.retencion))),
      retenciones: suma((pagadas.data ?? []).map((f) => Number(f.retencion))),
      por_cobrar: suma((pendientes.data ?? []).map((f) => Number(f.total))),
      mrr: suma(subs.filter((x) => x.estado !== 'gratis').map((x) => x.subtotal)),
      facturas,
    };
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
  'guardarHotel', 'estadoHotel', 'eliminarHotel', 'crearHabitaciones', 'editarHabitacion', 'reemplazarPlaca', 'eliminarHabitacion',
  'invitarUsuario', 'enlaceAcceso', 'cambiarRol', 'quitarUsuario', 'guardarTour', 'eliminarTour', 'estadoReserva',
  'guardarConfigFiscal', 'guardarCotizacion', 'convertirCotizacion', 'emitirFactura', 'pagarFactura', 'anularFactura',
]);

/** Datos para la bitácora que hay que leer ANTES de la acción (p. ej. lo que se va a borrar). */
async function contextoBitacora(db: SupabaseClient, accion: NombreAccion, e: Record<string, unknown>) {
  const ctx: { hotel_id: string | null; etiqueta: string } = { hotel_id: null, etiqueta: '' };
  if (typeof e.hotel_id === 'string' && esUuid(e.hotel_id)) ctx.hotel_id = e.hotel_id;
  if ((accion === 'guardarHotel' || accion === 'estadoHotel') && esUuid(e.id)) ctx.hotel_id = e.id;
  // El hotel eliminado ya no existe: la bitácora guarda su nombre en el texto, sin enlace.
  if (accion === 'eliminarHotel' && esUuid(e.id)) {
    const { data } = await db.from('hotels').select('nombre').eq('id', e.id).maybeSingle();
    ctx.etiqueta = data?.nombre ?? '';
  }
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
  if ((accion === 'pagarFactura' || accion === 'anularFactura') && esUuid(e.id)) {
    const { data } = await db.from('facturas').select('numero, hotel_id').eq('id', e.id).maybeSingle();
    ctx.hotel_id = data?.hotel_id ?? null;
    ctx.etiqueta = data?.numero ?? '';
  }
  return ctx;
}

function resumenBitacora(accion: NombreAccion, e: Record<string, unknown>, salida: unknown, etiqueta: string): string {
  const s = (salida ?? {}) as Record<string, unknown>;
  const datos = (e.datos ?? {}) as Record<string, unknown>;
  switch (accion) {
    case 'guardarHotel':
      return e.id ? `Editó los datos del hotel ${datos.nombre ?? ''}`.trim() : `Creó el hotel ${datos.nombre ?? ''}`.trim();
    case 'eliminarHotel':
      return `Eliminó el hotel «${etiqueta}» con todos sus datos (${s.usuarios_borrados ?? 0} usuarios del panel borrados)`;
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
    case 'guardarConfigFiscal':
      return `Actualizó la configuración fiscal (CAI ${e.cai || 'sin CAI'})`;
    case 'guardarCotizacion':
      return e.id ? `Editó la cotización de ${e.cliente_nombre}` : `Creó una cotización para ${e.cliente_nombre} (${e.habitaciones} hab.)`;
    case 'convertirCotizacion':
      return `Convirtió una cotización en factura${s.hotel_id ? ' y dio de alta el hotel' : ''}`;
    case 'emitirFactura':
      return `Emitió la factura ${s.numero ?? ''} a ${e.cliente_nombre}`;
    case 'pagarFactura':
      return `Factura ${etiqueta} pagada (${e.metodo}${Number(e.retencion) > 0 ? `, retención L. ${Number(e.retencion).toFixed(2)}` : ''})`;
    case 'anularFactura':
      return `Anuló la factura ${etiqueta}: ${e.motivo}`;
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
