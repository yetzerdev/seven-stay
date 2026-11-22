/**
 * Conversión de filas de Supabase (tablas en snake_case) a los tipos de la app.
 */
import type {
  CatalogoItem,
  CategoriaMenu,
  Habitacion,
  Hotel,
  Moneda,
  PersonalOperativo,
  RolPersonal,
  Ticket,
} from '@/types/sevenstay';

type Fila = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const textoONulo = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
/** "12:00:00" → "12:00" */
const hora = (v: unknown): string => texto(v).slice(0, 5);

export const HOTEL_VACIO: Hotel = {
  id: '',
  nombre: '',
  logo_url: '',
  color_primario: '#0E7490',
  telefono_recepcion: '',
  whatsapp_reception: null,
  wifi_ssid: '',
  wifi_password: '',
  moneda_default: 'HNL',
  zona_horaria: 'America/Tegucigalpa',
  hora_checkout: '12:00',
  hora_silencio_inicio: '22:00',
  hora_silencio_fin: '06:00',
  horario_desayuno: '',
  horario_piscina: '',
  notas_info_es: '',
  notas_info_en: '',
  google_review_url: '',
  tripadvisor_url: '',
  modo_tours: 'seven_stay',
};

export function aHotel(f: Fila): Hotel {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    logo_url: texto(f.logo_url),
    color_primario: texto(f.color_primario) || '#0E7490',
    telefono_recepcion: texto(f.telefono_recepcion),
    whatsapp_reception: textoONulo(f.whatsapp_reception),
    wifi_ssid: texto(f.wifi_ssid),
    wifi_password: texto(f.wifi_password),
    moneda_default: (f.moneda_default === 'USD' ? 'USD' : 'HNL') as Moneda,
    zona_horaria: texto(f.zona_horaria) || 'America/Tegucigalpa',
    hora_checkout: hora(f.hora_checkout) || '12:00',
    hora_silencio_inicio: hora(f.hora_silencio_inicio) || '22:00',
    hora_silencio_fin: hora(f.hora_silencio_fin) || '06:00',
    horario_desayuno: texto(f.horario_desayuno),
    horario_piscina: texto(f.horario_piscina),
    notas_info_es: texto(f.notas_info_es),
    notas_info_en: texto(f.notas_info_en),
    google_review_url: texto(f.google_review_url),
    tripadvisor_url: texto(f.tripadvisor_url),
    modo_tours: f.modo_tours === 'propios' || f.modo_tours === 'ambos' ? f.modo_tours : 'seven_stay',
  };
}

/** Fila de `rooms` (columnas estadia_*) → Habitacion. */
export function aHabitacion(f: Fila): Habitacion {
  return {
    id: texto(f.id),
    numero: texto(f.numero),
    codigo_placa: texto(f.codigo_placa),
    estado_placa: (f.estado_placa as Habitacion['estado_placa']) ?? 'activa',
    estadia_activa: f.estadia_estado
      ? {
          id: texto(f.estadia_id),
          estado: f.estadia_estado as NonNullable<Habitacion['estadia_activa']>['estado'],
          expira_at: textoONulo(f.estadia_expira_at),
        }
      : null,
  };
}

/** Habitación tal como la devuelve la función portal_por_codigo (ya trae estadia_activa). */
export function aHabitacionPortal(f: Fila): Habitacion {
  const e = f.estadia_activa as Fila | null;
  return {
    id: texto(f.id),
    numero: texto(f.numero),
    codigo_placa: texto(f.codigo_placa),
    estado_placa: (f.estado_placa as Habitacion['estado_placa']) ?? 'activa',
    estadia_activa: e
      ? {
          id: texto(e.id),
          estado: e.estado as NonNullable<Habitacion['estadia_activa']>['estado'],
          expira_at: textoONulo(e.expira_at),
        }
      : null,
  };
}

export function aTicket(f: Fila): Ticket {
  return {
    id: texto(f.id),
    codigo_corto: texto(f.codigo_corto),
    idempotency_key: texto(f.idempotency_key),
    habitacion_numero: texto(f.habitacion_numero),
    categoria: f.categoria as Ticket['categoria'],
    estado: f.estado as Ticket['estado'],
    urgente: Boolean(f.urgente),
    en_alerta_servicio: Boolean(f.en_alerta_servicio),
    tour_propio: Boolean(f.tour_propio),
    creado_at: texto(f.creado_at),
    aceptado_at: textoONulo(f.aceptado_at),
    resuelto_at: textoONulo(f.resuelto_at),
    asignado_a_nombre: textoONulo(f.asignado_a_nombre),
    idioma_huesped: f.idioma_huesped === 'en' ? 'en' : 'es',
    nota: textoONulo(f.nota),
    historial: Array.isArray(f.historial) ? (f.historial as Ticket['historial']) : [],
    ...(f.detalle_housekeeping ? { detalle_housekeeping: f.detalle_housekeeping as Ticket['detalle_housekeeping'] } : {}),
    ...(f.detalle_mantenimiento ? { detalle_mantenimiento: f.detalle_mantenimiento as Ticket['detalle_mantenimiento'] } : {}),
    ...(f.detalle_catalogo ? { detalle_catalogo: f.detalle_catalogo as Ticket['detalle_catalogo'] } : {}),
  };
}

function aItem(f: Fila, tipo: CatalogoItem['tipo']): CatalogoItem {
  return {
    id: texto(f.id),
    tipo,
    titulo_es: texto(f.titulo_es),
    titulo_en: texto(f.titulo_en),
    descripcion_es: texto(f.descripcion_es),
    descripcion_en: texto(f.descripcion_en),
    precio: Number(f.precio ?? 0),
    moneda: f.moneda === 'USD' ? 'USD' : 'HNL',
    horario_o_duracion_es: texto(f.horario_o_duracion_es),
    horario_o_duracion_en: texto(f.horario_o_duracion_en),
    activo: Boolean(f.activo),
    imagen_url: textoONulo(f.imagen_url),
    whatsapp_destino: texto(f.whatsapp_destino),
    categoria_id: textoONulo(f.categoria_id),
    propio: tipo === 'tour' && Boolean(f.hotel_id),
  };
}

export function aCategoria(f: Fila): CategoriaMenu {
  const horaONula = (v: unknown) => (v ? hora(v) : null);
  return {
    id: texto(f.id),
    nombre_es: texto(f.nombre_es),
    nombre_en: texto(f.nombre_en),
    orden: Number(f.orden ?? 0),
    activa: Boolean(f.activa),
    hora_inicio: horaONula(f.hora_inicio),
    hora_fin: horaONula(f.hora_fin),
    fecha_inicio: textoONulo(f.fecha_inicio),
    fecha_fin: textoONulo(f.fecha_fin),
  };
}

export const aTour = (f: Fila) => aItem(f, 'tour');
export const aPlato = (f: Fila) => aItem(f, 'menu');

export function aPersonal(f: Fila): PersonalOperativo {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    telefono_whatsapp: texto(f.telefono_whatsapp),
    rol: f.rol as RolPersonal,
    en_turno: Boolean(f.en_turno),
    turno_inicio_hora: hora(f.turno_inicio_hora),
    con_usuario: Boolean(f.user_id),
  };
}
