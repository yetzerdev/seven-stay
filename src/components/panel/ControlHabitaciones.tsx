'use client';

import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';

import { estadiaVigente, ticketFinalizado, useStay } from '@/context/StayContext';

import { useAccionesEstadia } from './accionesEstadia';
import { esDelHotel } from './ticketPanel';
import type { Habitacion } from '@/types/sevenstay';

type EstadoHab = 'ocupada' | 'vacia' | 'por_validar' | 'sin_placa';

const ESTADOS: Record<EstadoHab, { texto: string; punto: string }> = {
  ocupada: { texto: 'Ocupada', punto: 'bg-emerald-500' },
  vacia: { texto: 'Vacía', punto: 'bg-neutral-300' },
  por_validar: { texto: 'Por validar', punto: 'bg-amber-500' },
  sin_placa: { texto: 'Placa inactiva', punto: 'bg-rose-300' },
};

function estadoDe(hab: Habitacion): EstadoHab {
  if (hab.estado_placa !== 'activa') return 'sin_placa';
  if (hab.estadia_activa?.estado === 'pendiente_confirmacion') return 'por_validar';
  return estadiaVigente(hab) ? 'ocupada' : 'vacia';
}

/**
 * Mini cuadrícula de habitaciones: el color dice el estado y al tocar una
 * aparece su única acción (check-in o check-out), sin botones repetidos.
 */
export default function ControlHabitaciones() {
  const { habitaciones } = useStay();
  const tickets = useStay().tickets.filter(esDelHotel);
  const { checkIn, checkOut, dialogo } = useAccionesEstadia();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const ocupadas = habitaciones.filter((h) => estadoDe(h) === 'ocupada').length;
  const hab = habitaciones.find((h) => h.numero === seleccionada);
  const estadoSel = hab ? estadoDe(hab) : null;

  return (
    <section aria-labelledby="titulo-habitaciones" className="rounded-2xl border border-black/[0.06] bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="titulo-habitaciones" className="text-[17px] font-bold text-neutral-900">
          Habitaciones
        </h2>
        <span className="text-[14px] tabular-nums text-neutral-500">
          {ocupadas}/{habitaciones.length} ocupadas
        </span>
      </div>

      <ul className="grid grid-cols-4 gap-2">
        {habitaciones.map((h) => {
          const estado = estadoDe(h);
          const activos = tickets.filter((t) => t.habitacion_numero === h.numero && !ticketFinalizado(t)).length;
          const activa = seleccionada === h.numero;
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => setSeleccionada(activa ? null : h.numero)}
                aria-pressed={activa}
                aria-label={`Habitación ${h.numero}: ${ESTADOS[estado].texto}${activos ? `, ${activos} solicitudes activas` : ''}`}
                className={`relative flex h-16 w-full flex-col items-center justify-center rounded-xl border text-[18px] font-bold tabular-nums transition-colors ${
                  activa ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/[0.06] bg-[#F8F9FA] text-neutral-900 hover:border-black/[0.15]'
                }`}
              >
                {h.numero}
                <span aria-hidden className={`mt-1.5 h-2 w-2 rounded-full ${ESTADOS[estado].punto}`} />
                {activos > 0 && (
                  <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                    {activos}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Acción de la habitación elegida */}
      {hab && estadoSel && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[#F8F9FA] py-2.5 pl-3.5 pr-2.5">
          <span className="inline-flex items-center gap-2 text-[15px] text-neutral-700">
            <span aria-hidden className={`h-2 w-2 rounded-full ${ESTADOS[estadoSel].punto}`} />
            <strong className="font-semibold">Hab. {hab.numero}</strong> · {ESTADOS[estadoSel].texto}
          </span>
          {estadoSel === 'ocupada' && (
            <button
              type="button"
              onClick={() => checkOut(hab.numero)}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3.5 text-[14px] font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              <LogOut aria-hidden className="h-3.5 w-3.5" />
              Check-out
            </button>
          )}
          {(estadoSel === 'vacia' || estadoSel === 'por_validar') && (
            <button
              type="button"
              onClick={() => checkIn(hab.numero, estadoSel === 'por_validar')}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-[14px] font-semibold text-white hover:bg-neutral-800"
            >
              <LogIn aria-hidden className="h-3.5 w-3.5" />
              Check-in
            </button>
          )}
        </div>
      )}

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-neutral-400">
        {(['ocupada', 'vacia', 'por_validar'] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${ESTADOS[e].punto}`} />
            {ESTADOS[e].texto}
          </span>
        ))}
      </p>

      {dialogo}
    </section>
  );
}
