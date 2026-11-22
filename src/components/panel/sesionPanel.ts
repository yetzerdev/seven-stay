import type { RolPanel } from '@/context/StayContext';

/**
 * Roles del panel (vienen de hotel_staff.rol en Supabase):
 *  - recepcion: opera el día a día (tablero, habitaciones, configuración).
 *  - supervisor_gerente: además ve Personal y Configuración Hotel.
 */
export const NOMBRES_ROL: Record<RolPanel, string> = {
  recepcion: 'Recepción',
  supervisor_gerente: 'Supervisor / Gerente',
};
