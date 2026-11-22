'use client';

import { AlertTriangle } from 'lucide-react';

import { useStay } from '@/context/StayContext';

import { useConfirmacion } from './DialogoConfirmacion';
import { esDelHotel } from './ticketPanel';

/**
 * Regla Opción C: llegó una solicitud desde una habitación marcada como vacía.
 * Una franja por habitación: recepción confirma el check-in o la rechaza.
 */
export default function BandaValidacion() {
  const { habitaciones, tickets, validarEstadia } = useStay();
  const { confirmar, dialogo } = useConfirmacion();

  const rechazar = async (numero: string, enEspera: number) => {
    const ok = await confirmar({
      titulo: `¿Rechazar las solicitudes de la Hab. ${numero}?`,
      mensaje: `Confirmas que la habitación está vacía. ${enEspera === 1 ? 'La solicitud en espera se cerrará' : `Las ${enEspera} solicitudes en espera se cerrarán`} como rechazadas y quedará registrado.`,
      textoConfirmar: 'Rechazar',
      tono: 'peligro',
    });
    if (ok !== false) validarEstadia(numero, false);
  };
  const pendientes = habitaciones.filter((h) => h.estadia_activa?.estado === 'pendiente_confirmacion');
  if (pendientes.length === 0) return dialogo;

  return (
    <section aria-label="Habitaciones por validar" className="flex flex-col gap-2">
      {pendientes.map((hab) => {
        const enEspera = tickets.filter(
          (t) => esDelHotel(t) && t.habitacion_numero === hab.numero && t.estado === 'pendiente_validacion_hab',
        ).length;
        return (
          <div
            key={hab.id}
            role="alert"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-300/80 bg-amber-50 py-3 pl-5 pr-3"
          >
            <p className="flex min-w-0 flex-1 items-center gap-2.5 text-[16px] text-amber-950">
              <AlertTriangle aria-hidden className="h-5 w-5 shrink-0 text-amber-600" />
              <span>
                <strong className="font-bold">Hab. {hab.numero}</strong> pidió servicio pero figura vacía
                {enEspera > 0 && <span className="text-amber-800"> · {enEspera} en espera</span>}
              </span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => validarEstadia(hab.numero, true)}
                className="h-11 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
              >
                Confirmar check-in
              </button>
              <button
                type="button"
                onClick={() => rechazar(hab.numero, enEspera)}
                className="h-11 rounded-xl px-4 text-[15px] font-semibold text-amber-900 hover:bg-amber-100"
              >
                Rechazar
              </button>
            </div>
          </div>
        );
      })}
      {dialogo}
    </section>
  );
}
