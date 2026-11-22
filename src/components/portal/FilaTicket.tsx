'use client';

import Link from 'next/link';
import { BedDouble, Check, ChevronRight, Compass, UtensilsCrossed, Wrench, X, type LucideIcon } from 'lucide-react';

import { ticketFinalizado } from '@/context/StayContext';
import type { CategoriaTicket, Idioma, Ticket } from '@/types/sevenstay';

import { ESTILOS, resumenTicket, textoEstadoActivo, varianteDe } from './AlertaSolicitudActiva';
import { horaDeFecha, tiempoRelativo } from './etiquetasTicket';

const ICONOS: Record<CategoriaTicket, LucideIcon> = {
  housekeeping: BedDouble,
  mantenimiento: Wrench,
  tour: Compass,
  room_service: UtensilsCrossed,
};

const TEXTOS = {
  es: { resuelto: 'Resuelto', rechazado: 'No aprobada', cancelado: 'Cancelada' },
  en: { resuelto: 'Resolved', rechazado: 'Not approved', cancelado: 'Canceled' },
} as const;

interface Props {
  ticket: Ticket;
  href: string;
  idioma: Idioma;
  ahora: number;
  horaFinSilencio: string;
}

/** Fila de un ticket para listas agrupadas: ícono, resumen, estado en vivo y hora. */
export default function FilaTicket({ ticket, href, idioma, ahora, horaFinSilencio }: Props) {
  const t = TEXTOS[idioma];
  const Icono = ICONOS[ticket.categoria];
  const finalizado = ticketFinalizado(ticket);

  let estado;
  if (ticket.estado === 'resuelto') {
    estado = (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        {t.resuelto}
      </span>
    );
  } else if (ticket.estado === 'cancelado') {
    estado = (
      <span className="inline-flex items-center gap-1 text-neutral-500">
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        {t.cancelado}
      </span>
    );
  } else if (ticket.estado === 'rechazado') {
    estado = (
      <span className="inline-flex items-center gap-1 text-rose-600">
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        {t.rechazado}
      </span>
    );
  } else {
    const estilo = ESTILOS[varianteDe(ticket)];
    estado = (
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${estilo.etiqueta}`}>
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${estilo.punto}`} />
        <span className="truncate">{textoEstadoActivo(ticket, idioma, ahora, horaFinSilencio)}</span>
      </span>
    );
  }

  return (
    <li>
      <Link href={href} className="flex min-h-[72px] items-center gap-3 py-3 pl-3.5 pr-2 transition-colors active:bg-neutral-50">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            finalizado ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-900 text-white'
          }`}
        >
          <Icono className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14.5px] font-semibold ${finalizado ? 'text-neutral-500' : 'text-neutral-900'}`}>
            {resumenTicket(ticket, idioma)}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium">{estado}</span>
          <span className="mt-0.5 block text-[11.5px] tabular-nums text-neutral-400">
            #{ticket.codigo_corto} · {horaDeFecha(ticket.creado_at)} · {tiempoRelativo(ticket.creado_at, ahora, idioma)}
          </span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-300" strokeWidth={2.5} />
      </Link>
    </li>
  );
}
