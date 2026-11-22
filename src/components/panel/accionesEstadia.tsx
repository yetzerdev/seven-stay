'use client';

import { formato12h } from '@/components/portal/etiquetasTicket';
import { ticketFinalizado, useStay } from '@/context/StayContext';

import { useConfirmacion } from './DialogoConfirmacion';

/**
 * Check-in / check-out con confirmación previa. Lo usan Habitaciones y el mapa
 * del Centro de Control para que nadie cambie una estadía por un clic accidental.
 */
export function useAccionesEstadia() {
  const { hotel, tickets, activarEstadiaManual, hacerCheckout } = useStay();
  const { confirmar, dialogo } = useConfirmacion();

  const checkIn = async (numero: string, porValidar = false) => {
    const enEspera = tickets.filter((t) => t.habitacion_numero === numero && t.estado === 'pendiente_validacion_hab').length;
    const ok = await confirmar({
      titulo: porValidar ? `¿Confirmar check-in de la Hab. ${numero}?` : `¿Registrar check-in en la Hab. ${numero}?`,
      mensaje: (
        <>
          La estadía quedará activa hasta mañana a las <strong>{formato12h(hotel.hora_checkout)}</strong>.
          {enEspera > 0 && ` Se abrirán ${enEspera === 1 ? 'la solicitud que estaba' : `las ${enEspera} solicitudes que estaban`} en espera.`}
        </>
      ),
      textoConfirmar: porValidar ? 'Confirmar check-in' : 'Registrar check-in',
    });
    if (ok !== false) activarEstadiaManual(numero);
  };

  const checkOut = async (numero: string) => {
    const activas = tickets.filter(
      (t) => t.habitacion_numero === numero && !ticketFinalizado(t),
    ).length;
    const ok = await confirmar({
      titulo: `¿Hacer check-out de la Hab. ${numero}?`,
      mensaje: (
        <>
          La habitación quedará vacía y su portal dejará de aceptar solicitudes sin validación.
          {activas > 0 && (
            <>
              {' '}
              <strong>
                Tiene {activas} {activas === 1 ? 'solicitud abierta' : 'solicitudes abiertas'}
              </strong>
              : {activas === 1 ? 'seguirá en el tablero hasta que se resuelva' : 'seguirán en el tablero hasta que se resuelvan'}.
            </>
          )}
        </>
      ),
      textoConfirmar: 'Hacer check-out',
      tono: 'peligro',
    });
    if (ok !== false) hacerCheckout(numero);
  };

  return { checkIn, checkOut, dialogo };
}
