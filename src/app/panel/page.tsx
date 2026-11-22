'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import BandaValidacion from '@/components/panel/BandaValidacion';
import ControlHabitaciones from '@/components/panel/ControlHabitaciones';
import FilaTicketPanel from '@/components/panel/FilaTicketPanel';
import { esDelHotel } from '@/components/panel/ticketPanel';
import { useAhora } from '@/components/portal/AlertaSolicitudActiva';
import { ticketFinalizado, useStay } from '@/context/StayContext';
import type { Ticket } from '@/types/sevenstay';

type Filtro = 'activos' | 'sin_asignar' | 'en_proceso' | 'urgentes' | 'resueltos_hoy' | 'historial';

function esHoy(iso: string | null): boolean {
  if (!iso) return false;
  const f = new Date(iso);
  const hoy = new Date();
  return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth() && f.getDate() === hoy.getDate();
}

/** Escalados y urgentes primero; luego el más antiguo (se atiende en orden de llegada). */
function prioridad(t: Ticket): number {
  if (t.en_alerta_servicio) return 0;
  if (t.urgente) return 1;
  if (t.estado === 'pendiente_validacion_hab') return 3;
  return 2;
}

const FILTROS: { clave: Filtro; texto: string; punto?: string; prueba: (t: Ticket) => boolean }[] = [
  { clave: 'activos', texto: 'Activos', prueba: (t) => !ticketFinalizado(t) },
  { clave: 'sin_asignar', texto: 'Sin asignar', punto: 'bg-amber-400', prueba: (t) => !ticketFinalizado(t) && t.estado !== 'aceptado' },
  { clave: 'en_proceso', texto: 'En proceso', punto: 'bg-sky-500', prueba: (t) => t.estado === 'aceptado' },
  { clave: 'urgentes', texto: 'Urgentes', punto: 'bg-rose-500', prueba: (t) => !ticketFinalizado(t) && (t.urgente || t.en_alerta_servicio) },
  { clave: 'resueltos_hoy', texto: 'Resueltos hoy', punto: 'bg-emerald-500', prueba: (t) => t.estado === 'resuelto' && esHoy(t.resuelto_at) },
  // Todo lo cerrado (resueltos y rechazados), de cualquier día: el registro para auditar.
  { clave: 'historial', texto: 'Historial', prueba: (t) => ticketFinalizado(t) },
];

const VACIOS: Record<Filtro, string> = {
  activos: 'Todo al día: no hay solicitudes activas.',
  sin_asignar: 'No hay solicitudes esperando asignación.',
  en_proceso: 'Nadie está atendiendo una solicitud ahora.',
  urgentes: 'Sin urgencias.',
  resueltos_hoy: 'Aún no se ha resuelto nada hoy.',
  historial: 'Todavía no hay solicitudes cerradas.',
};

export default function CentroDeControlPage() {
  // Solo lo que gestiona el hotel: los tours de Seven Stay van a su canal.
  const tickets = useStay().tickets.filter(esDelHotel);
  const ahora = useAhora();
  const [filtro, setFiltro] = useState<Filtro>('activos');
  // ?habitacion=204 (p. ej. desde Habitaciones): el tablero muestra solo esa habitación.
  const habitacion = useSearchParams().get('habitacion');
  const delAlcance = habitacion ? tickets.filter((t) => t.habitacion_numero === habitacion) : tickets;

  const actual = FILTROS.find((f) => f.clave === filtro)!;
  const lista = delAlcance
    .filter(actual.prueba)
    .sort((a, b) =>
      filtro === 'resueltos_hoy' || filtro === 'historial'
        ? (b.resuelto_at ?? b.creado_at).localeCompare(a.resuelto_at ?? a.creado_at)
        : prioridad(a) - prioridad(b) || a.creado_at.localeCompare(b.creado_at),
    );

  return (
    <main className="flex flex-1 flex-col gap-5">
      <h1 className="sr-only">Centro de Control en vivo</h1>

      <BandaValidacion />

      <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Solicitudes" className="flex min-w-0 flex-col gap-4">
          {/* Los contadores son también los filtros */}
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Filtrar solicitudes" className="flex flex-1 gap-2 overflow-x-auto">
              {FILTROS.map(({ clave, texto, punto, prueba }) => {
                const activo = filtro === clave;
                return (
                  <button
                    key={clave}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setFiltro(clave)}
                    className={`flex h-11 shrink-0 items-center gap-2.5 rounded-xl border px-4 text-[15px] font-medium transition-colors ${
                      activo
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-black/[0.06] bg-white text-neutral-600 hover:border-black/[0.15] hover:text-neutral-900'
                    }`}
                  >
                    {punto && <span aria-hidden className={`h-2 w-2 rounded-full ${punto}`} />}
                    {texto}
                    <span className={`text-[16px] font-bold tabular-nums ${activo ? 'text-white' : 'text-neutral-900'}`}>
                      {delAlcance.filter(prueba).length}
                    </span>
                  </button>
                );
              })}
            </div>
            {habitacion && (
              <Link
                href="/panel"
                aria-label={`Quitar filtro de la habitación ${habitacion}`}
                className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 pl-4 pr-3 text-[15px] font-semibold text-sky-800 hover:bg-sky-100"
              >
                Hab. {habitacion}
                <X aria-hidden className="h-4 w-4" />
              </Link>
            )}
            <span className="hidden shrink-0 items-center gap-2 text-[14px] font-semibold text-emerald-700 sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              En vivo
            </span>
          </div>

          {lista.length === 0 ? (
            <p className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center text-[16px] text-neutral-500">
              {habitacion ? `Hab. ${habitacion}: ${VACIOS[filtro].charAt(0).toLowerCase()}${VACIOS[filtro].slice(1)}` : VACIOS[filtro]}
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {lista.map((ticket) => (
                <FilaTicketPanel key={ticket.id} ticket={ticket} ahora={ahora} />
              ))}
            </ul>
          )}
        </section>

        <aside className="xl:sticky xl:top-[104px] xl:self-start">
          <ControlHabitaciones />
        </aside>
      </div>
    </main>
  );
}
