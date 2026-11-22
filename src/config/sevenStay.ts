/**
 * Datos comerciales de Seven Stay (no del hotel).
 */

/** WhatsApp del Agente Oficial de Seven Stay: confirma, cobra y emite vouchers de tours. E.164 sin "+". */
export const WHATSAPP_AGENTE_SEVEN_STAY = '50495197142';

/** Enlace wa.me con el mensaje ya escrito. */
export function enlaceAgenteSevenStay(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_AGENTE_SEVEN_STAY}?text=${encodeURIComponent(mensaje)}`;
}
