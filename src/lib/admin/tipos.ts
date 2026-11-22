/**
 * Tipos del panel interno de Seven Stay (/admin), compartidos entre el
 * navegador y el servidor (/api/admin).
 */
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
  /** Plan asignado (al asignarlo se congela su precio como tarifa del hotel). */
  plan_id: string | null;
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
// Etapa 3: cobro a hoteles y bitácora
// ---------------------------------------------------------------------------

export interface Plan {
  id: string;
  nombre: string;
  descripcion: string;
  /** Precio mensual por habitación con placa activa. */
  precio_habitacion: number;
  moneda: Moneda;
  activo: boolean;
}

export type MetodoPago = 'transferencia' | 'efectivo' | 'tarjeta' | 'otro';

/** 'al_dia' · 'por_vencer' (≤ 7 días) · 'vencido' · 'sin_plan' */
export type EstadoCobro = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan';

export interface CobroHotel {
  id: string;
  nombre: string;
  estado_hotel: EstadoHotel;
  plan_id: string | null;
  habitaciones_activas: number;
  habitaciones_contratadas: number;
  /** Las que se cobran: el mayor entre contratadas y placas activas. */
  habitaciones_cobradas: number;
  /** Tarifa acordada por habitación (congelada al asignar el plan). */
  tarifa_habitacion: number | null;
  /** Tarifa × habitaciones cobradas (null si no tiene plan). */
  mensualidad: number | null;
  moneda: Moneda | null;
  pagado_hasta: string | null;
  estado_cobro: EstadoCobro;
  /** Días de atraso (vencido) o que faltan para vencer (al día / por vencer). */
  dias: number | null;
  ultimo_pago: string | null;
}

export interface PagoHotel {
  id: string;
  monto: number;
  moneda: Moneda;
  fecha_pago: string;
  meses: number;
  periodo_desde: string;
  periodo_hasta: string;
  metodo: MetodoPago;
  referencia: string;
  notas: string;
  registrado_por: string;
  incluye_isv: boolean;
  subtotal: number | null;
  isv: number | null;
}

export interface NuevoPago {
  hotel_id: string;
  monto: number;
  moneda: Moneda;
  fecha_pago: string;
  meses: number;
  metodo: MetodoPago;
  referencia: string;
  notas: string;
  /** El monto incluye 15 % de ISV (factura SAR): se guarda el desglose. */
  incluye_isv: boolean;
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
  planes: { entrada: null; salida: Plan[] };
  /** `aplicar_a_actuales`: si el precio cambió, también actualiza la tarifa de los hoteles con este plan. */
  guardarPlan: { entrada: Omit<Plan, 'id'> & { id?: string; aplicar_a_actuales?: boolean }; salida: { id: string; actualizados: number } };
  cobros: { entrada: null; salida: CobroHotel[] };
  asignarPlan: { entrada: { hotel_id: string; plan_id: string | null }; salida: null };
  ajustarCobro: { entrada: { hotel_id: string; habitaciones_contratadas: number; tarifa_habitacion: number | null }; salida: null };
  registrarPago: { entrada: NuevoPago; salida: { pagado_hasta: string } };
  pagosHotel: { entrada: { hotel_id: string }; salida: PagoHotel[] };
  bitacora: { entrada: { hotel_id?: string }; salida: EntradaBitacora[] };
}

export type NombreAccion = keyof AccionesAdmin;
