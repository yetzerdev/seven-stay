import type { CategoriaMenu } from '@/types/sevenstay';

/**
 * Disponibilidad de una categoría del menú en la hora y fecha LOCAL del hotel.
 * Es solo para mostrar: la base de datos vuelve a validarlo al crear el pedido.
 */

const ZONA_POR_DEFECTO = 'America/Tegucigalpa';

/** Fecha "AAAA-MM-DD" y hora "HH:MM" actuales en la zona horaria del hotel. */
export function ahoraEnHotel(zona: string, ahora: Date = new Date()): { fecha: string; hora: string } {
  const formatear = (z: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: z,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(ahora);
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = formatear(zona || ZONA_POR_DEFECTO);
  } catch {
    partes = formatear(ZONA_POR_DEFECTO);
  }
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '00';
  return { fecha: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` };
}

/** ¿Se muestra hoy? (activa y dentro de sus fechas de temporada, si tiene). */
export function categoriaVisible(c: CategoriaMenu, zona: string, ahora?: Date): boolean {
  if (!c.activa) return false;
  const { fecha } = ahoraEnHotel(zona, ahora);
  if (c.fecha_inicio && fecha < c.fecha_inicio) return false;
  if (c.fecha_fin && fecha > c.fecha_fin) return false;
  return true;
}

/** ¿Se puede ordenar ahora? (dentro de su horario, si tiene; soporta cruzar medianoche). */
export function categoriaAbierta(c: CategoriaMenu, zona: string, ahora?: Date): boolean {
  if (!c.hora_inicio || !c.hora_fin) return true;
  const { hora } = ahoraEnHotel(zona, ahora);
  return c.hora_inicio < c.hora_fin
    ? hora >= c.hora_inicio && hora < c.hora_fin
    : hora >= c.hora_inicio || hora < c.hora_fin;
}

/** "13 abr" / "Apr 13" a partir de "AAAA-MM-DD". */
export function fechaCorta(fecha: string, idioma: 'es' | 'en'): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d)
    .toLocaleDateString(idioma === 'es' ? 'es-HN' : 'en-US', { day: 'numeric', month: 'short' })
    .replace('.', '');
}
