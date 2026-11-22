/**
 * Etiquetas y formatos compartidos por las pantallas del huésped que muestran
 * tickets (banner de solicitud activa, seguimiento en vivo, ...).
 */
import type {
  CategoriaTicket,
  HoraDelDia,
  Idioma,
  ItemHousekeeping,
  Moneda,
  SubcategoriaMantenimiento,
} from '@/types/sevenstay';

export const ITEMS_HOUSEKEEPING: Record<ItemHousekeeping, Record<Idioma, string>> = {
  toallas: { es: 'Toallas adicionales', en: 'Extra towels' },
  almohadas_cobijas: { es: 'Almohadas y ropa de cama', en: 'Pillows & bedding' },
  amenities: { es: 'Artículos de higiene', en: 'Personal care' },
  cafe_cortesias: { es: 'Café, té y cortesías', en: 'Coffee, tea & refreshments' },
  plancha: { es: 'Plancha', en: 'Iron & board' },
  adaptadores: { es: 'Adaptadores y cargadores', en: 'Adapters & chargers' },
};

export const SUBCATEGORIAS: Record<SubcategoriaMantenimiento, Record<Idioma, string>> = {
  aire_acondicionado: { es: 'Aire Acondicionado', en: 'Air Conditioning' },
  agua_bano: { es: 'Agua / Baño', en: 'Water / Bathroom' },
  wifi_tv: { es: 'Wi-Fi / TV', en: 'Wi-Fi / TV' },
  luz_enchufes: { es: 'Luz / Enchufes', en: 'Lights / Outlets' },
  cerradura: { es: 'Cerradura / Puerta', en: 'Door Lock' },
  otro: { es: 'Otro', en: 'Other' },
};

/** Etiqueta de la subcategoría; datos guardados con claves antiguas caen en "Otro". */
export function etiquetaSubcategoria(sub: SubcategoriaMantenimiento | undefined, idioma: Idioma): string {
  return (SUBCATEGORIAS[sub ?? 'otro'] ?? SUBCATEGORIAS.otro)[idioma];
}

export const TITULOS_CATEGORIA: Record<CategoriaTicket, Record<Idioma, string>> = {
  housekeeping: { es: 'Solicitud de Limpieza', en: 'Housekeeping Request' },
  mantenimiento: { es: 'Reporte Técnico', en: 'Maintenance Report' },
  tour: { es: 'Solicitud de Tour', en: 'Tour Request' },
  room_service: { es: 'Pedido a la Habitación', en: 'Room Service Order' },
};

/** Precio de referencia: "$65 USD" o "L 1,600". */
export function formatoPrecio(valor: number, moneda: Moneda): string {
  const numero = valor.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$${numero} USD` : `L ${numero}`;
}

/** "06:00" → "6:00 AM" */
export function formato12h(hora: HoraDelDia): string {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Fecha ISO → hora local "9:42 PM". */
export function horaDeFecha(iso: string): string {
  const fecha = new Date(iso);
  return formato12h(`${fecha.getHours()}:${fecha.getMinutes()}`);
}

/** "hace 3 min" / "3m ago" */
export function tiempoRelativo(iso: string, ahora: number, idioma: Idioma): string {
  const minutos = Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000));
  const es = idioma === 'es';
  if (minutos < 1) return es ? 'hace un momento' : 'just now';
  if (minutos < 60) return es ? `hace ${minutos} min` : `${minutos}m ago`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return es ? `hace ${horas} h` : `${horas}h ago`;
  const dias = Math.floor(horas / 24);
  return es ? `hace ${dias} d` : `${dias}d ago`;
}

/** Por qué no se pudo enviar una solicitud (lo que devuelve crearTicket). */
const ERRORES_ENVIO: Record<string, { es: string; en: string }> = {
  limite_abiertas: {
    es: 'Ya tienes 3 solicitudes en curso en esta habitación. Espera a que se atienda alguna o llama a recepción.',
    en: 'You already have 3 requests in progress for this room. Please wait for one to be handled or call the front desk.',
  },
  limite_por_hora: {
    es: 'Enviaste muchas solicitudes en la última hora. Inténtalo más tarde o llama a recepción.',
    en: "You've sent many requests in the last hour. Please try again later or call the front desk.",
  },
  nota_muy_larga: {
    es: 'La nota es demasiado larga. Acórtala e inténtalo de nuevo.',
    en: 'The note is too long. Please shorten it and try again.',
  },
  item_no_disponible: {
    es: 'Esta opción ya no está disponible. Elige otra o consulta en recepción.',
    en: 'This option is no longer available. Please choose another or ask the front desk.',
  },
  fuera_de_horario: {
    es: 'Esta sección del menú no está disponible a esta hora. Revisa su horario o elige otro plato.',
    en: 'This part of the menu is not available right now. Check its hours or choose another dish.',
  },
  foto_no_subida: {
    es: 'No pudimos subir la foto. Quítala o prueba con otra e inténtalo de nuevo.',
    en: "We couldn't upload the photo. Remove it or try another one.",
  },
};

export function mensajeErrorEnvio(error: string, idioma: Idioma): string {
  return (
    ERRORES_ENVIO[error]?.[idioma] ??
    (idioma === 'es'
      ? 'No pudimos enviar la solicitud. Revisa tu conexión o llama a recepción.'
      : "We couldn't send your request. Check your connection or call the front desk.")
  );
}
