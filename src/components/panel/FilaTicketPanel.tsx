'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { tiempoRelativo } from '@/components/portal/etiquetasTicket';
import { ticketFinalizado } from '@/context/StayContext';
import type { Ticket } from '@/types/sevenstay';

import { AccionesTicket, CATEGORIAS_PANEL, partesPedido, useFotoTicket, VisorFoto } from './ticketPanel';

/**
 * Fila compacta de un ticket: quién/qué a la izquierda (abre el detalle con su
 * trazabilidad) y la acción del momento a la derecha.
 */
export default function FilaTicketPanel({ ticket, ahora }: { ticket: Ticket; ahora: number }) {
  const [fotoAbierta, setFotoAbierta] = useState(false);

  const finalizado = ticketFinalizado(ticket);
  const escalado = ticket.en_alerta_servicio && !finalizado;
  const urgente = ticket.urgente && !finalizado && !escalado;
  const categoria = CATEGORIAS_PANEL[ticket.categoria];
  const foto = useFotoTicket(ticket);
  const que = partesPedido(ticket).join(' · ');

  const franja =
    escalado || urgente
      ? 'bg-rose-500'
      : ticket.estado === 'aceptado'
        ? 'bg-sky-500'
        : ticket.estado === 'resuelto'
          ? 'bg-emerald-500'
          : finalizado
            ? 'bg-neutral-300'
            : 'bg-amber-400';

  return (
    <li className="relative flex flex-col gap-3 py-5 pl-6 pr-5 sm:flex-row sm:items-center sm:gap-5">
      <span aria-hidden className={`absolute bottom-3 left-0 top-3 w-1.5 rounded-r-full ${franja}`} />

      {/* Qué y dónde: abre el detalle */}
      <Link
        href={`/panel/solicitudes/${ticket.id}`}
        className={`group -my-2 -ml-2 min-w-0 flex-1 rounded-xl py-2 pl-2 pr-1 hover:bg-neutral-50 ${finalizado ? 'opacity-70' : ''}`}
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-neutral-500">
          <span className="text-[24px] font-bold tabular-nums leading-none tracking-[-0.01em] text-neutral-900">{ticket.habitacion_numero}</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-neutral-700">
            <span aria-hidden className={`h-2 w-2 rounded-full ${categoria.punto}`} />
            {categoria.texto}
          </span>
          <span aria-hidden>·</span>
          <span className="font-semibold">{ticket.idioma_huesped.toUpperCase()}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">#{ticket.codigo_corto}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{tiempoRelativo(ticket.creado_at, ahora, 'es')}</span>
          {escalado && <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[12px] font-bold tracking-wide text-white">ESCALADO</span>}
          {urgente && <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[12px] font-bold tracking-wide text-rose-700">URGENTE</span>}
          <ChevronRight aria-hidden className="ml-auto h-4 w-4 text-neutral-300 transition-colors group-hover:text-neutral-500" />
        </span>
        <span className="mt-1.5 block truncate text-[16px] text-neutral-800" title={ticket.nota ? `${que} — “${ticket.nota}”` : que}>
          <span className="font-medium">{que}</span>
          {ticket.nota && <span className="text-neutral-500"> — “{ticket.nota}”</span>}
        </span>
      </Link>

      {foto && (
        <button
          type="button"
          onClick={() => setFotoAbierta(true)}
          aria-label="Ver foto adjunta"
          className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] hover:ring-2 hover:ring-neutral-900/20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Supabase Storage */}
          <img src={foto} alt="" className="h-full w-full object-cover" />
        </button>
      )}

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        <AccionesTicket ticket={ticket} ahora={ahora} />
      </div>

      {fotoAbierta && foto && <VisorFoto src={foto} onCerrar={() => setFotoAbierta(false)} />}
    </li>
  );
}
