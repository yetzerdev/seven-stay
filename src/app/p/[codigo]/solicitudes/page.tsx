'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Inbox } from 'lucide-react';

import { useAhora } from '@/components/portal/AlertaSolicitudActiva';
import FilaTicket from '@/components/portal/FilaTicket';
import { ticketFinalizado, useStay } from '@/context/StayContext';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';

const TEXTOS = {
  es: {
    inicio: 'Inicio',
    titulo: 'Mis solicitudes',
    subtitulo: 'Todo lo que pediste desde este teléfono, con su estado en vivo.',
    enCurso: 'En curso',
    anteriores: 'Anteriores',
    vacio: 'Todavía no has enviado solicitudes. Cuando pidas algo, aparecerá aquí con su estado.',
  },
  en: {
    inicio: 'Home',
    titulo: 'My requests',
    subtitulo: 'Everything you requested from this phone, with its live status.',
    enCurso: 'In progress',
    anteriores: 'Past',
    vacio: "You haven't sent any requests yet. When you do, they'll show up here with their status.",
  },
} as const;

/** Historial del huésped: solicitudes en curso y terminadas (resueltas, no aprobadas o canceladas). */
export default function MisSolicitudesPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { hotel, habitaciones, tickets, misTicketIds, idioma, hidratado } = useStay();
  const ahora = useAhora();
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  if (!habitacion || !hidratado) return null; // el layout ya muestra el aviso o el cargando

  const base = `/p/${encodeURIComponent(codigo)}`;
  const mias = tickets
    .filter((tk) => misTicketIds.includes(tk.id) && tk.habitacion_numero === habitacion.numero)
    .sort((a, b) => b.creado_at.localeCompare(a.creado_at));
  const grupos = [
    { titulo: t.enCurso, lista: mias.filter((tk) => !ticketFinalizado(tk)) },
    { titulo: t.anteriores, lista: mias.filter(ticketFinalizado) },
  ].filter((g) => g.lista.length > 0);

  return (
    <main className="flex flex-col gap-4 pb-2">
      <Link
        href={base}
        className={`-ml-2 -mt-4 flex h-12 w-fit items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-medium text-neutral-600 transition-transform duration-300 ${EASE} active:scale-[0.965]`}
      >
        <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.25} />
        {t.inicio}
      </Link>

      <header className="-mt-1 px-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-neutral-900">{t.titulo}</h1>
        <p className="mt-1 text-[14px] text-neutral-500">{t.subtitulo}</p>
      </header>

      {grupos.length === 0 ? (
        <div className={`${TARJETA} flex flex-col items-center px-6 py-10 text-center`}>
          <Inbox aria-hidden className="h-7 w-7 text-neutral-400" strokeWidth={1.75} />
          <p className="mt-3 max-w-[260px] text-[14px] leading-relaxed text-neutral-500">{t.vacio}</p>
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.titulo} aria-label={g.titulo}>
            <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {g.titulo} · {g.lista.length}
            </h2>
            <ul className={`${TARJETA} divide-y divide-neutral-100 overflow-hidden`}>
              {g.lista.map((tk) => (
                <FilaTicket
                  key={tk.id}
                  ticket={tk}
                  href={`${base}/ticket/${tk.id}`}
                  idioma={idioma}
                  ahora={ahora}
                  horaFinSilencio={hotel.hora_silencio_fin}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
