/**
 * Tipos del panel interno de Seven Stay (/admin), compartidos entre el
 * navegador y el servidor (/api/admin).
 */
import type { Concepto, LineaFactura, PlanSaas, TipoPlaca } from '@/lib/facturacion/tarifas';
import type { Moneda, ModoTours } from '@/types/sevenstay';

export type EstadoHotel = 'activo' | 'suspendido';
export type EstadoPlaca = 'activa' | 'en_stock' | 'danada';
export type RolUsuarioHotel = 'recepcion' | 'supervisor_gerente';
export type EstadoReserva = 'pendiente_pago' | 'pagado' | 'cancelado' | 'completado';

/** Roles del panel interno: todo, o solo Monitoreo + Tours y reservas (sin montos de comisión). */
export type RolAdmin = 'super_admin' | 'operaciones';

export interface HotelResumen {
  id: string;
  nombre: string;
  logo_url: string;
  estado: EstadoHotel;
  /** `true` si su plan venció sin pago registrado. */
  pago_vencido: boolean;
  modo_tours: ModoTours;
  creado_at: string;
  habitaciones: number;
  placas_activas: number;
  usuarios: number;
  solicitudes_hoy: number;
}

/** Datos del hotel que edita Seven Stay. */
export interface DatosHotelAdmin {
  nombre: string;
  logo_url: string;
  telefono_recepcion: string;
  wifi_ssid: string;
  wifi_password: string;
  moneda_default: Moneda;
  zona_horaria: string;
  hora_checkout: string;
  modo_tours: ModoTours;
  /** WhatsApp de recepción (E.164 sin "+") al que escribe el bot de Seven Stay. */
  whatsapp_reception: string;
  /** RTN del hotel (para las facturas de Seven Stay en Honduras). */
  rtn: string;
  /** Categoría de la mensualidad SaaS; null = automática por habitaciones. */
  plan_saas: PlanSaas | null;
  /** Mes gratis (bonificación piloto) hasta esta fecha "AAAA-MM-DD"; '' = sin periodo gratis. */
  gratis_hasta: string;
  /** Mínimo de habitaciones que se cobran aunque haya menos placas activas. */
  habitaciones_contratadas: number;
}

export interface HabitacionAdmin {
  id: string;
  numero: string;
  codigo_placa: string;
  estado_placa: EstadoPlaca;
  ocupada: boolean;
}

export interface UsuarioHotel {
  id: string; // hotel_staff.id
  user_id: string | null;
  nombre: string;
  correo: string | null;
  rol: RolUsuarioHotel;
  /** `false` = invitado que todavía no creó su contraseña. */
  confirmado: boolean;
  ultimo_acceso: string | null;
}

export interface DetalleHotel {
  hotel: DatosHotelAdmin & { id: string; estado: EstadoHotel; creado_at: string };
  habitaciones: HabitacionAdmin[];
  usuarios: UsuarioHotel[];
}

export interface TourSevenStay {
  id: string;
  titulo_es: string;
  titulo_en: string;
  descripcion_es: string;
  descripcion_en: string;
  horario_o_duracion_es: string;
  horario_o_duracion_en: string;
  precio: number;
  moneda: Moneda;
  activo: boolean;
  imagen_url: string | null;
  whatsapp_destino: string;
  /** Solo super_admin: % que se queda Seven Stay (uso interno, nunca lo ve el huésped). */
  comision_pct: number | null;
  /** Solo super_admin: operador aliado que presta el tour. */
  operador: string | null;
}

export interface ReservaTour {
  id: string;
  voucher_codigo: string;
  tour_titulo: string;
  hotel_nombre: string;
  habitacion_numero: string;
  personas: number;
  precio_unitario: number;
  moneda: Moneda;
  estado: EstadoReserva;
  creado_at: string;
  nota: string | null;
  /** Solo super_admin: comisión y operador guardados al crear la reserva. */
  comision_pct: number | null;
  operador: string | null;
}

/** Estado en vivo de un hotel (Monitoreo). Solo lo que gestiona el hotel: sin tours de Seven Stay. */
export interface MonitoreoHotel {
  id: string;
  nombre: string;
  logo_url: string;
  estado: EstadoHotel;
  abiertas: number;
  sin_asignar: number;
  /** Escaladas (por demora o a supervisor) que siguen abiertas. */
  escaladas: number;
  esperando_checkin: number;
  /** Minutos que lleva la solicitud sin asignar más antigua (null = ninguna). */
  espera_max_min: number | null;
  solicitudes_hoy: number;
  /** Mediana de minutos hasta aceptar, últimas 24 h. */
  respuesta_min: number | null;
}

export interface Monitoreo {
  hoteles: MonitoreoHotel[];
  reservas_por_cobrar: number;
  generado_at: string;
}

export interface MetricaHotel {
  id: string;
  nombre: string;
  solicitudes: number;
  respuesta_min: number | null;
  resolucion_min: number | null;
  pct_resueltas: number | null;
  escaladas: number;
  rechazadas: number;
  habitaciones: number;
}

export interface VentaMes {
  /** "2026-11" */
  mes: string;
  reservas: number;
  usd: number;
  hnl: number;
}

export interface MetricasGlobales {
  hoteles: MetricaHotel[];
  ventas_tours: VentaMes[];
}

// ---------------------------------------------------------------------------
// Facturación SAR (todo en Lempiras)
// ---------------------------------------------------------------------------

export type { Concepto, LineaFactura, PlanSaas, TipoPlaca };

/** Datos del emisor y control del CAI (una sola configuración). */
export interface ConfigFiscal {
  nombre_legal: string;
  denominacion: string;
  /** RTN del emisor, 14 caracteres. */
  rtn: string;
  domicilio: string;
  telefono: string;
  correo: string;
  /** XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX */
  cai: string;
  /** 000-001-01-00000001 */
  rango_inicial: string;
  rango_final: string;
  fecha_limite: string | null;
  registro_sag: string;
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular: string;
}

/** Cómo está el CAI ahora mismo (se calcula en el servidor). */
export interface EstadoCai {
  correlativo_actual: number | null;
  /** Número que llevará la próxima factura (null si no se puede emitir). */
  siguiente: string | null;
  restantes: number | null;
  dias_para_limite: number | null;
  /** Motivo por el que no se puede emitir, o null si se puede. */
  bloqueo: string | null;
}

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'convertida';

export interface Cotizacion {
  id: string;
  numero: string;
  creado_at: string;
  hotel_id: string | null;
  cliente_nombre: string;
  cliente_rtn: string;
  ciudad: string;
  contacto: string;
  habitaciones: number;
  tipo_placa: TipoPlaca | null;
  plan_saas: PlanSaas | null;
  bonificacion_piloto: boolean;
  notas: string;
  estado: EstadoCotizacion;
  convertida_hotel_id: string | null;
}

export type DatosCotizacion = Omit<Cotizacion, 'id' | 'numero' | 'creado_at' | 'estado' | 'convertida_hotel_id'> & { id?: string };

/** 'vencida' no se guarda: es una pendiente cuya fecha de vencimiento ya pasó. */
export type EstadoFactura = 'pendiente' | 'pagada' | 'vencida' | 'anulada';
export type MetodoPagoFactura = 'transferencia' | 'deposito' | 'cheque';

export interface Emisor {
  nombre_legal: string;
  denominacion: string;
  rtn: string;
  domicilio: string;
  telefono: string;
  correo: string;
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular: string;
}

export interface Factura {
  id: string;
  numero: string;
  cai: string;
  rango_inicial: string;
  rango_final: string;
  fecha_limite: string;
  emisor: Emisor;
  fecha_emision: string;
  condicion: 'contado' | 'credito';
  vence: string;
  hotel_id: string | null;
  cotizacion_id: string | null;
  cliente_nombre: string;
  cliente_rtn: string;
  cliente_direccion: string;
  lineas: LineaFactura[];
  descuentos: number;
  importe_exento: number;
  importe_exonerado: number;
  importe_gravado: number;
  isv: number;
  total: number;
  total_letras: string;
  orden_compra_exenta: string;
  constancia_exonerado: string;
  registro_sag: string;
  mensualidad_meses: number | null;
  estado: EstadoFactura;
  pago_fecha: string | null;
  pago_metodo: MetodoPagoFactura | null;
  pago_referencia: string;
  retencion: number;
  retencion_comprobante: string;
  anulada_motivo: string;
  emitida_por: string;
}

/** Lo que llena la pantalla para emitir (el servidor recalcula totales, letras y número). */
export interface NuevaFactura {
  hotel_id: string | null;
  cotizacion_id: string | null;
  cliente_nombre: string;
  cliente_rtn: string;
  cliente_direccion: string;
  condicion: 'contado' | 'credito';
  vence: string;
  lineas: { cantidad: number; descripcion: string; precio_unitario: number; concepto: Concepto }[];
  orden_compra_exenta: string;
  constancia_exonerado: string;
  registro_sag: string;
  mensualidad_meses: number | null;
}

export type EstadoSuscripcion = 'gratis' | 'al_dia' | 'por_vencer' | 'vencido';

export interface Suscripcion {
  hotel_id: string;
  nombre: string;
  cliente_rtn: string;
  plan: PlanSaas;
  plan_automatico: boolean;
  habitaciones: number;
  /** Mensualidad sin ISV y con ISV. */
  subtotal: number;
  total: number;
  pagado_hasta: string | null;
  gratis_hasta: string | null;
  proximo_corte: string | null;
  dias_mora: number;
  estado: EstadoSuscripcion;
  /** Factura de mensualidad emitida y aún sin pagar (para no duplicarla). */
  factura_pendiente: string | null;
}

export interface ReporteFiscal {
  desde: string;
  hasta: string;
  /** Facturado sin ISV (sin anuladas). */
  facturado: number;
  isv: number;
  /** Cobrado en banco (total − retenciones de las pagadas en el rango). */
  cobrado: number;
  retenciones: number;
  /** Pendiente de cobro (todas las no pagadas ni anuladas, de cualquier fecha). */
  por_cobrar: number;
  /** Mensualidades activas sin ISV (sin hoteles en periodo gratis). */
  mrr: number;
  facturas: Factura[];
}

export interface EntradaBitacora {
  id: string;
  admin_nombre: string;
  accion: string;
  hotel_id: string | null;
  hotel_nombre: string | null;
  resumen: string;
  creado_at: string;
}

/** Acciones de /api/admin: nombre → { entrada, salida }. */
export interface AccionesAdmin {
  yo: { entrada: null; salida: { nombre: string; correo: string; rol: RolAdmin } };
  hoteles: { entrada: null; salida: HotelResumen[] };
  hotel: { entrada: { id: string }; salida: DetalleHotel };
  guardarHotel: { entrada: { id?: string; datos: DatosHotelAdmin }; salida: { id: string } };
  estadoHotel: { entrada: { id: string; estado: EstadoHotel }; salida: null };
  /** Borra el hotel y TODO lo suyo. `confirmacion` debe ser su nombre exacto. */
  eliminarHotel: { entrada: { id: string; confirmacion: string }; salida: { usuarios_borrados: number } };
  subirImagen: { entrada: { dataUrl: string; carpeta: string }; salida: { url: string } };
  crearHabitaciones: { entrada: { hotel_id: string; numeros: string[] }; salida: { creadas: number; repetidas: string[] } };
  editarHabitacion: { entrada: { id: string; numero?: string; estado_placa?: EstadoPlaca }; salida: null };
  reemplazarPlaca: { entrada: { id: string }; salida: { codigo_placa: string } };
  eliminarHabitacion: { entrada: { id: string }; salida: null };
  invitarUsuario: { entrada: { hotel_id: string; correo: string; nombre: string; rol: RolUsuarioHotel }; salida: { enlace: string } };
  enlaceAcceso: { entrada: { staff_id: string }; salida: { enlace: string } };
  cambiarRol: { entrada: { staff_id: string; rol: RolUsuarioHotel }; salida: null };
  quitarUsuario: { entrada: { staff_id: string }; salida: null };
  tours: { entrada: null; salida: TourSevenStay[] };
  guardarTour: { entrada: Omit<TourSevenStay, 'id'> & { id?: string }; salida: { id: string } };
  eliminarTour: { entrada: { id: string }; salida: null };
  reservas: { entrada: { estado?: EstadoReserva | 'todas' }; salida: ReservaTour[] };
  estadoReserva: { entrada: { id: string; estado: EstadoReserva }; salida: null };
  monitoreo: { entrada: null; salida: Monitoreo };
  metricasGlobales: { entrada: { dias: number }; salida: MetricasGlobales };
  configFiscal: { entrada: null; salida: { config: ConfigFiscal; estado: EstadoCai } };
  guardarConfigFiscal: { entrada: ConfigFiscal; salida: null };
  cotizaciones: { entrada: null; salida: Cotizacion[] };
  cotizacion: { entrada: { id: string }; salida: { cotizacion: Cotizacion; emisor: ConfigFiscal } };
  guardarCotizacion: { entrada: DatosCotizacion; salida: { id: string } };
  /** Pasa la cotización a borrador de factura de anticipo; opcionalmente da de alta el hotel. */
  convertirCotizacion: { entrada: { id: string; dar_alta: boolean }; salida: { hotel_id: string | null; borrador: NuevaFactura } };
  facturas: { entrada: { desde?: string; hasta?: string }; salida: Factura[] };
  factura: { entrada: { id: string }; salida: Factura };
  emitirFactura: { entrada: NuevaFactura; salida: { id: string; numero: string } };
  pagarFactura: {
    entrada: { id: string; fecha: string; metodo: MetodoPagoFactura; referencia: string; retencion: number; retencion_comprobante: string };
    salida: { pagado_hasta: string | null };
  };
  anularFactura: { entrada: { id: string; motivo: string }; salida: null };
  suscripciones: { entrada: null; salida: Suscripcion[] };
  /** Borrador de la factura del mes de un hotel (mensualidad de su plan). */
  borradorMensualidad: { entrada: { hotel_id: string }; salida: NuevaFactura };
  reporteFiscal: { entrada: { desde: string; hasta: string }; salida: ReporteFiscal };
  bitacora: { entrada: { hotel_id?: string }; salida: EntradaBitacora[] };
}

export type NombreAccion = keyof AccionesAdmin;
