/**
 * Contrato de datos de Seven Stay.
 *
 * Los nombres siguen snake_case en español para mapear 1:1 con las
 * futuras tablas/columnas de Supabase. Las fechas son strings ISO 8601
 * (equivalente a `timestamptz`) y las horas del día son "HH:mm".
 */

// ---------------------------------------------------------------------------
// Primitivos compartidos
// ---------------------------------------------------------------------------

export type Idioma = 'es' | 'en';

export type Moneda = 'HNL' | 'USD';

/** Qué tours ofrece el portal del hotel: los de Seven Stay, los propios o ambos. */
export type ModoTours = 'seven_stay' | 'propios' | 'ambos';

/** Fecha/hora ISO 8601, p. ej. "2026-11-18T12:00:00.000Z". */
export type FechaISO = string;

/** Hora del día en formato 24 h, p. ej. "22:00". */
export type HoraDelDia = string;

// ---------------------------------------------------------------------------
// Hotel
// ---------------------------------------------------------------------------

export interface Hotel {
  id: string;
  nombre: string;
  /** Ruta o URL del logo (hoy en /public, luego Supabase Storage). */
  logo_url: string;
  /** Color de marca en hexadecimal, p. ej. "#0E7490". */
  color_primario: string;
  telefono_recepcion: string;
  /**
   * WhatsApp de recepción (E.164 sin "+") donde el bot avisará las solicitudes
   * nuevas (Fase 2). Hoy solo se guarda; `null` = sin configurar.
   */
  whatsapp_reception: string | null;
  wifi_ssid: string;
  wifi_password: string;
  moneda_default: Moneda;
  /** Zona horaria IANA del hotel, p. ej. "America/Tegucigalpa". */
  zona_horaria: string;
  hora_checkout: HoraDelDia;
  hora_silencio_inicio: HoraDelDia;
  hora_silencio_fin: HoraDelDia;
  horario_desayuno: string;
  horario_piscina: string;
  notas_info_es: string;
  notas_info_en: string;
  google_review_url: string;
  tripadvisor_url: string;
  /** Qué tours ve el huésped (lo elige gerencia en el panel). */
  modo_tours: ModoTours;
}

// ---------------------------------------------------------------------------
// Habitaciones y estadías
// ---------------------------------------------------------------------------

export type EstadoPlaca = 'activa' | 'en_stock' | 'danada';

export type EstadoEstadia = 'pendiente_confirmacion' | 'activa' | 'finalizada';

export interface EstadiaActiva {
  id: string;
  estado: EstadoEstadia;
  /** Fin de la estadía; `null` mientras está pendiente de confirmación. */
  expira_at: FechaISO | null;
}

export interface Habitacion {
  id: string;
  numero: string;
  /** Código impreso en la placa QR/NFC de la puerta, p. ej. "204". */
  codigo_placa: string;
  estado_placa: EstadoPlaca;
  /** `null` = habitación vacía (sin huésped registrado). */
  estadia_activa: EstadiaActiva | null;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type CategoriaTicket = 'housekeeping' | 'mantenimiento' | 'tour' | 'room_service';

export type EstadoTicket =
  | 'pendiente_validacion_hab'
  | 'abierto'
  | 'aceptado'
  | 'pospuesto_silencio'
  | 'resuelto'
  | 'rechazado'
  /** El huésped la canceló antes de que alguien la tomara. */
  | 'cancelado';

/** Los 6 insumos que el huésped puede pedir (cantidad de 0 a 4 cada uno). */
export type ItemHousekeeping =
  | 'toallas'
  | 'almohadas_cobijas'
  | 'amenities'
  | 'cafe_cortesias'
  | 'plancha'
  | 'adaptadores';

export interface LineaHousekeeping {
  item: ItemHousekeeping;
  cantidad: number;
}

export interface DetalleHousekeeping {
  items: LineaHousekeeping[];
  limpieza_inmediata: boolean;
  no_molestar: boolean;
}

/** Las 6 categorías de falla que el huésped puede reportar. */
export type SubcategoriaMantenimiento =
  | 'aire_acondicionado'
  | 'agua_bano'
  | 'wifi_tv'
  | 'luz_enchufes'
  | 'cerradura'
  | 'otro';

export interface DetalleMantenimiento {
  subcategoria: SubcategoriaMantenimiento;
  /** Ruta de la foto en Supabase Storage (bucket privado "fotos-mantenimiento"). */
  foto_path: string | null;
}

export interface DetalleCatalogo {
  catalogo_item_id: string;
  titulo: string;
  cantidad: number;
  /** Precio unitario. */
  precio: number;
  moneda: Moneda;
  voucher_codigo: string;
}

/** Qué pasó con un ticket (trazabilidad). */
export type TipoEventoTicket =
  | 'creado'
  | 'pendiente_validacion'
  | 'validacion_aprobada'
  | 'validacion_rechazada'
  | 'aceptado'
  | 'escalado'
  | 'resuelto'
  | 'rechazado'
  | 'cancelado'
  | 'programado'
  | 'liberado'
  | 'cerrado_por_checkout'
  | 'movido_habitacion';

/** Quién lo hizo. */
export type ActorEvento = 'huesped' | 'recepcion' | 'sistema';

export interface EventoTicket {
  tipo: TipoEventoTicket;
  fecha: FechaISO;
  actor: ActorEvento;
  /** Dato extra legible, p. ej. "Asignado a Ana Mejía" o "De 101 a 201". */
  detalle: string | null;
}

export interface Ticket {
  id: string;
  /** Código de 3 dígitos que el huésped y el personal usan de referencia. */
  codigo_corto: string;
  /** Evita duplicados si el huésped toca "enviar" dos veces. */
  idempotency_key: string;
  habitacion_numero: string;
  categoria: CategoriaTicket;
  estado: EstadoTicket;
  urgente: boolean;
  en_alerta_servicio: boolean;
  /** Solo tours: `true` = tour propio del hotel (lo atiende recepción y se paga ahí). */
  tour_propio: boolean;
  creado_at: FechaISO;
  aceptado_at: FechaISO | null;
  resuelto_at: FechaISO | null;
  asignado_a_nombre: string | null;
  idioma_huesped: Idioma;
  nota: string | null;
  detalle_housekeeping?: DetalleHousekeeping;
  detalle_mantenimiento?: DetalleMantenimiento;
  detalle_catalogo?: DetalleCatalogo;
  /** Registro cronológico de todo lo que le pasó al ticket (en orden de llegada). */
  historial: EventoTicket[];
}

// ---------------------------------------------------------------------------
// Catálogo (tours y menú)
// ---------------------------------------------------------------------------

export type TipoCatalogo = 'tour' | 'menu';

export interface CatalogoItem {
  id: string;
  tipo: TipoCatalogo;
  titulo_es: string;
  titulo_en: string;
  descripcion_es: string;
  descripcion_en: string;
  precio: number;
  moneda: Moneda;
  horario_o_duracion_es: string;
  horario_o_duracion_en: string;
  activo: boolean;
  /** Foto del tour o del plato (hoy en /public, luego Supabase Storage). `null` = sin foto. */
  imagen_url: string | null;
  /** Número de WhatsApp (formato E.164 sin "+") que recibe el pedido. */
  whatsapp_destino: string;
  /** Solo platos del menú: categoría a la que pertenece (`null` = sin categoría). */
  categoria_id: string | null;
  /** Solo tours: `true` = tour propio del hotel; `false` = tour de Seven Stay. */
  propio: boolean;
}

/** Categoría del menú del hotel (Desayunos, Bebidas, Temporada…). */
export interface CategoriaMenu {
  id: string;
  nombre_es: string;
  nombre_en: string;
  orden: number;
  activa: boolean;
  /** Horario en que se puede ordenar (hora local del hotel); `null` = todo el día. */
  hora_inicio: HoraDelDia | null;
  hora_fin: HoraDelDia | null;
  /** Temporada ("AAAA-MM-DD", fecha local del hotel); `null` = sin límite. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

// ---------------------------------------------------------------------------
// Personal operativo
// ---------------------------------------------------------------------------

export type RolPersonal = 'ama_de_llaves' | 'mantenimiento' | 'recepcion' | 'supervisor_gerente';

export interface PersonalOperativo {
  id: string;
  nombre: string;
  /** Formato E.164 sin "+", listo para enlaces wa.me. */
  telefono_whatsapp: string;
  rol: RolPersonal;
  en_turno: boolean;
  turno_inicio_hora: HoraDelDia;
  /** Tiene usuario para entrar al panel (se gestiona en Supabase, no desde la app). */
  con_usuario: boolean;
}
