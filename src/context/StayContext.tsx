'use client';

/**
 * Contexto de datos de Seven Stay (Supabase).
 *
 * Hay dos proveedores con la misma interfaz:
 *  - PortalStayProvider (/p/[codigo]): sesión anónima del huésped, ve su hotel,
 *    su habitación y SOLO sus solicitudes.
 *  - PanelStayProvider (/panel): sesión del personal (correo y contraseña),
 *    ve su hotel, habitaciones, equipo y las solicitudes del hotel (sin los
 *    tours de Seven Stay; las reservas de tours propios sí).
 * Ambos se actualizan solos con Supabase Realtime.
 */

import { createContext, useContext, useSyncExternalStore } from 'react';

import type {
  CatalogoItem,
  CategoriaMenu,
  DetalleCatalogo,
  DetalleHousekeeping,
  DetalleMantenimiento,
  EstadoTicket,
  Habitacion,
  Hotel,
  Idioma,
  PersonalOperativo,
  Ticket,
} from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface NuevoTicket {
  habitacion_numero: string;
  categoria: Ticket['categoria'];
  /** Una por formulario: un reenvío devuelve el mismo ticket. */
  idempotency_key: string;
  urgente?: boolean;
  nota?: string | null;
  idioma_huesped?: Idioma;
  detalle_housekeeping?: DetalleHousekeeping;
  /** La foto viaja comprimida (data URL) y el proveedor la sube a Storage antes de crear el ticket. */
  detalle_mantenimiento?: Omit<DetalleMantenimiento, 'foto_path'> & { foto_data_url: string | null };
  /** Precio, moneda y título los fija la base de datos; el voucher también. */
  detalle_catalogo?: Omit<DetalleCatalogo, 'voucher_codigo'> & { voucher_codigo?: string };
}

export type ResultadoCrearTicket =
  | { ok: true; ticket: Ticket; duplicado: boolean }
  | { ok: false; error: ErrorCrearTicket };

export type ErrorCrearTicket =
  | 'habitacion_no_encontrada'
  | 'placa_no_activa'
  | 'limite_abiertas'
  | 'limite_por_hora'
  | 'nota_muy_larga'
  | 'item_no_disponible'
  | 'fuera_de_horario'
  | 'foto_no_subida'
  | 'error_conexion';

export type DatosHotelEditables = Partial<Omit<Hotel, 'id'>>;

/** Datos de un tour/plato del catálogo (los administra Seven Stay). */
export type NuevoCatalogoItem = Omit<CatalogoItem, 'id'>;

/** Alta de personal desde el panel (sin usuario; los usuarios del panel se crean en Supabase). */
export interface NuevoPersonal {
  nombre: string;
  rol: 'recepcion' | 'ama_de_llaves' | 'mantenimiento';
  telefono_whatsapp: string;
}

/** Plato del menú del hotel tal como lo edita el panel (sin `id` = plato nuevo). */
export type DatosPlato = Pick<
  CatalogoItem,
  | 'titulo_es'
  | 'titulo_en'
  | 'descripcion_es'
  | 'descripcion_en'
  | 'precio'
  | 'moneda'
  | 'horario_o_duracion_es'
  | 'horario_o_duracion_en'
  | 'activo'
  | 'imagen_url'
  | 'categoria_id'
> & { id?: string };

/** Tour propio del hotel tal como lo edita gerencia (sin `id` = tour nuevo). */
export type DatosTour = Omit<DatosPlato, 'categoria_id'>;

/** Categoría del menú tal como la edita el panel (sin `id` = nueva). */
export type DatosCategoria = Omit<CategoriaMenu, 'id' | 'orden'> & { id?: string };

export type RolPanel = 'recepcion' | 'supervisor_gerente';

export type EstadoCarga =
  | 'cargando'
  | 'listo'
  | 'no_encontrado' // portal: el código de la placa no existe
  | 'sin_sesion' // panel: hay que iniciar sesión
  | 'sin_hotel' // panel: el usuario no está vinculado a ningún hotel
  | 'error';

export interface StayContextValue {
  estadoCarga: EstadoCarga;
  mensajeError: string | null;
  /** Error de la última acción (se muestra como aviso y se puede cerrar). */
  errorAccion: string | null;
  limpiarErrorAccion: () => void;
  /** Compatibilidad: `true` cuando los datos ya se leyeron. */
  hidratado: boolean;

  hotel: Hotel;
  habitaciones: Habitacion[];
  tickets: Ticket[];
  catalogo: CatalogoItem[];
  /** Categorías del menú, ya ordenadas (el portal solo recibe las activas). */
  categoriasMenu: CategoriaMenu[];
  personal: PersonalOperativo[];
  /** Portal: ids de las solicitudes de este teléfono (todas las que ve). */
  misTicketIds: string[];

  idioma: Idioma;
  setIdioma: (idioma: Idioma) => void;

  // Huésped
  crearTicket: (payload: NuevoTicket) => Promise<ResultadoCrearTicket>;
  escalarTicket: (ticketId: string, opciones?: { actor?: 'huesped' | 'recepcion'; motivo?: string }) => Promise<void>;
  /** Solo mientras está `abierto`. Devuelve `true` si se canceló. */
  cancelarTicket: (ticketId: string) => Promise<boolean>;

  // Panel
  rolPanel: RolPanel;
  correoUsuario: string | null;
  iniciarSesion: (correo: string, clave: string) => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  validarEstadia: (habitacionNumero: string, aprobada: boolean) => Promise<void>;
  aceptarTicket: (ticketId: string, nombrePersonal: string) => Promise<void>;
  resolverTicket: (ticketId: string) => Promise<void>;
  /** Spam, duplicada o no procede. */
  rechazarTicket: (ticketId: string, motivo?: string) => Promise<void>;
  activarEstadiaManual: (habitacionNumero: string) => Promise<void>;
  hacerCheckout: (habitacionNumero: string) => Promise<void>;
  /** Devuelve `true` si se guardó. */
  actualizarHotel: (datos: DatosHotelEditables) => Promise<boolean>;
  toggleTurnoPersonal: (id: string) => Promise<void>;
  /** Personal operativo sin usuario del panel (solo gerencia). Devuelven `true` si se guardó. */
  agregarPersonal: (persona: NuevoPersonal) => Promise<boolean>;
  eliminarPersonal: (id: string) => Promise<boolean>;
  /** Menú del hotel (room service). Devuelven `true` si se guardó. */
  guardarPlato: (plato: DatosPlato) => Promise<boolean>;
  eliminarPlato: (id: string) => Promise<boolean>;
  /** Sube la foto (JPEG ya comprimido) y devuelve su URL pública, o `null` si falló. */
  subirImagenMenu: (dataUrl: string) => Promise<string | null>;
  /** Tours propios del hotel (solo gerencia). Devuelven `true` si se guardó. */
  guardarTour: (tour: DatosTour) => Promise<boolean>;
  eliminarTour: (id: string) => Promise<boolean>;
  guardarCategoria: (categoria: DatosCategoria) => Promise<boolean>;
  /** Sus platos quedan "Sin categoría". */
  eliminarCategoria: (id: string) => Promise<boolean>;
  /** Guarda el nuevo orden (ids de arriba hacia abajo). */
  ordenarCategorias: (ids: string[]) => Promise<boolean>;
  recargar: () => Promise<void>;
}

export const StayContext = createContext<StayContextValue | null>(null);

export function useStay(): StayContextValue {
  const contexto = useContext(StayContext);
  if (!contexto) throw new Error('useStay debe usarse dentro de PortalStayProvider o PanelStayProvider.');
  return contexto;
}

// ---------------------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------------------

export const ESTADOS_TICKET_FINALES: readonly EstadoTicket[] = ['resuelto', 'rechazado', 'cancelado'];

/** ¿El portal muestra este tour? Depende del modo que eligió el hotel. */
export function tourVisible(item: CatalogoItem, modo: Hotel['modo_tours']): boolean {
  if (item.tipo !== 'tour' || !item.activo) return false;
  return item.propio ? modo !== 'seven_stay' : modo !== 'propios';
}

export function ticketFinalizado(ticket: Ticket): boolean {
  return ESTADOS_TICKET_FINALES.includes(ticket.estado);
}

/** `true` si la habitación tiene una estadía activa que todavía no venció. */
export function estadiaVigente(habitacion: Habitacion, ahora: Date = new Date()): boolean {
  const estadia = habitacion.estadia_activa;
  if (!estadia || estadia.estado !== 'activa') return false;
  return estadia.expira_at === null || new Date(estadia.expira_at) > ahora;
}

/** Clave única para `idempotency_key` (randomUUID solo existe en https/localhost). */
export function generarIdempotencyKey(): string {
  const aleatorio =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `idem-${aleatorio}`;
}

/** Mensaje legible a partir de un error de Supabase/PostgREST. */
export function mensajeDe(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Error de conexión';
}

// ---------------------------------------------------------------------------
// Idioma del portal (por pestaña, sessionStorage)
// ---------------------------------------------------------------------------

const CLAVE_IDIOMA = 'sevenstay:idioma';
const oyentesIdioma = new Set<() => void>();
let idiomaActual: Idioma | null = null;

function obtenerIdioma(): Idioma {
  if (idiomaActual) return idiomaActual;
  let guardado: string | null = null;
  try {
    guardado = window.sessionStorage.getItem(CLAVE_IDIOMA);
  } catch {
    // sin almacenamiento
  }
  idiomaActual = guardado === 'es' || guardado === 'en' ? guardado : navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
  return idiomaActual;
}

export function setIdioma(idioma: Idioma) {
  idiomaActual = idioma;
  try {
    window.sessionStorage.setItem(CLAVE_IDIOMA, idioma);
  } catch {
    // solo en memoria
  }
  oyentesIdioma.forEach((oyente) => oyente());
}

function suscribirIdioma(oyente: () => void): () => void {
  oyentesIdioma.add(oyente);
  return () => oyentesIdioma.delete(oyente);
}

export function useIdioma(): Idioma {
  return useSyncExternalStore(suscribirIdioma, obtenerIdioma, () => 'es' as Idioma);
}

/** Acción que no aplica en este lado (p. ej. asignar desde el portal). */
export async function noDisponible(): Promise<never> {
  throw new Error('Acción no disponible aquí');
}
