import { manifiestoPanel, respuestaManifiesto } from '@/lib/pwa';

/** Manifiesto de la app del panel del hotel. */
export function GET() {
  return respuestaManifiesto(manifiestoPanel());
}
