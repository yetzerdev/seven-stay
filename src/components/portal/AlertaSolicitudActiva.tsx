'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, X } from 'lucide-react';

import { ticketFinalizado, useStay } from '@/context/StayContext';
import type { Idioma, Ticket } from '@/types/sevenstay';

import { etiquetaSubcategoria, formato12h, ITEMS_HOUSEKEEPING, tiempoRelativo } from './etiquetasTicket';
import { fechaFin, useTicketsVistos } from './ticketsVistos';

/** Cuánto tiempo se avisa en el inicio una solicitud terminada que no se abrió. */
const HORAS_AVISO_FINAL = 24;

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const TEXTOS = {
  es: {
    solicitudActiva: 'Solicitud activa',
    mas: (n: number) => `+${n} más`,
    ver: 'Ver',
    recibido: (hace: string) => `Recibido (${hace})`,
    enCamino: (quien: string) => `En camino (${quien})`,
    equipo: 'Equipo',
    programado: (hora: string) => `Programado ${hora}`,
    alerta: 'Prioridad alta en atención',
    limpieza: 'Limpieza de habitación',
    noMolestar: 'No Molestar activo',
    reporte: (que: string) => `Reporte: ${que}`,
    tour: (que: string) => `Tour: ${que}`,
    pedido: (que: string) => `Pedido: ${que}`,
    roomService: 'Servicio a la habitación',
    resuelta: 'Solicitud resuelta',
    rechazada: 'Solicitud no aprobada',
    resueltaTexto: (hace: string) => `Completada ${hace}`,
    rechazadaTexto: 'Toca para ver el motivo',
  },
  en: {
    solicitudActiva: 'Active request',
    mas: (n: number) => `+${n} more`,
    ver: 'View',
    recibido: (hace: string) => `Received (${hace})`,
    enCamino: (quien: string) => `On the way (${quien})`,
    equipo: 'Team',
    programado: (hora: string) => `Scheduled ${hora}`,
    alerta: 'High priority',
    limpieza: 'Room cleaning',
    noMolestar: 'Do Not Disturb on',
    reporte: (que: string) => `Report: ${que}`,
    tour: (que: string) => `Tour: ${que}`,
    pedido: (que: string) => `Order: ${que}`,
    roomService: 'Room service',
    resuelta: 'Request completed',
    rechazada: 'Request not approved',
    resueltaTexto: (hace: string) => `Completed ${hace}`,
    rechazadaTexto: 'Tap to see why',
  },
} as const;

// ---------------------------------------------------------------------------
// Variantes visuales por estado
// ---------------------------------------------------------------------------

export type Variante = 'recibido' | 'en_camino' | 'programado' | 'alerta';

export const ESTILOS: Record<Variante, { punto: string; aura: string; halo: string; etiqueta: string }> = {
  recibido: { punto: 'bg-amber-500', aura: 'bg-amber-400/10', halo: 'bg-amber-300/25', etiqueta: 'text-amber-700' },
  en_camino: { punto: 'bg-emerald-500', aura: 'bg-emerald-400/10', halo: 'bg-emerald-300/25', etiqueta: 'text-emerald-700' },
  programado: { punto: 'bg-indigo-500', aura: 'bg-indigo-400/10', halo: 'bg-indigo-300/25', etiqueta: 'text-indigo-700' },
  alerta: { punto: 'bg-rose-500', aura: 'bg-rose-400/10', halo: 'bg-rose-300/25', etiqueta: 'text-rose-700' },
};

export function varianteDe(ticket: Ticket): Variante {
  // El escalamiento manda sobre cualquier estado.
  if (ticket.en_alerta_servicio) return 'alerta';
  if (ticket.estado === 'aceptado') return 'en_camino';
  if (ticket.estado === 'pospuesto_silencio') return 'programado';
  return 'recibido'; // 'abierto' o 'pendiente_validacion_hab'
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Título corto según la categoría, p. ej. "2x Toallas adicionales" o "Reporte: Aire Acondicionado". */
export function resumenTicket(ticket: Ticket, idioma: Idioma): string {
  const t = TEXTOS[idioma];
  switch (ticket.categoria) {
    case 'housekeeping': {
      const detalle = ticket.detalle_housekeeping;
      const primero = detalle?.items[0];
      if (primero) return `${primero.cantidad}x ${ITEMS_HOUSEKEEPING[primero.item][idioma]}`;
      if (detalle?.no_molestar) return t.noMolestar;
      return t.limpieza;
    }
    case 'mantenimiento':
      return t.reporte(etiquetaSubcategoria(ticket.detalle_mantenimiento?.subcategoria, idioma));
    case 'tour':
      return t.tour(ticket.detalle_catalogo?.titulo ?? 'Tour');
    case 'room_service':
      return ticket.detalle_catalogo?.titulo ? t.pedido(ticket.detalle_catalogo.titulo) : t.roomService;
  }
}

/** Texto del estado de un ticket en curso, p. ej. "En camino (Ana Mejía)". */
export function textoEstadoActivo(ticket: Ticket, idioma: Idioma, ahora: number, horaFinSilencio: string): string {
  const t = TEXTOS[idioma];
  return {
    recibido: t.recibido(tiempoRelativo(ticket.creado_at, ahora, idioma)),
    en_camino: t.enCamino(ticket.asignado_a_nombre || t.equipo),
    programado: t.programado(formato12h(horaFinSilencio)),
    alerta: t.alerta,
  }[varianteDe(ticket)];
}

/** Hora actual (ms) que se refresca cada 30 s para el "hace X min". */
export function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);
  return ahora;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface Props {
  habitacionNumero: string;
  /** Ruta base del portal, p. ej. "/p/204". */
  basePath: string;
}

/**
 * Banner tipo "Live Activity" de la solicitud en curso. Reacciona en vivo a los
 * cambios de StayContext (también los hechos desde Recepción en otra pestaña):
 * ámbar = recibido, verde = en camino, índigo = programado por horario nocturno,
 * rojo = escalado. Solo considera las solicitudes enviadas desde este teléfono;
 * si no hay ninguna activa, no se renderiza.
 */
export default function AlertaSolicitudActiva({ habitacionNumero, basePath }: Props) {
  const { tickets, misTicketIds, hotel, idioma, hidratado } = useStay();
  const ahora = useAhora();
  const vistos = useTicketsVistos();

  // Los tickets vienen del navegador: antes de hidratar no se muestra nada.
  if (!hidratado) return null;

  const activos = tickets
    .filter(
      (tk) => misTicketIds.includes(tk.id) && tk.habitacion_numero === habitacionNumero && !ticketFinalizado(tk),
    )
    .sort((a, b) => b.creado_at.localeCompare(a.creado_at));
  const ticket = activos[0];
  const t = TEXTOS[idioma];

  if (!ticket) {
    // Sin nada en curso: se avisa la última solicitud que terminó (resuelta o no
    // aprobada) hasta que el huésped la abra. Las que él canceló no se avisan.
    const terminada = tickets
      .filter(
        (tk) =>
          misTicketIds.includes(tk.id) &&
          tk.habitacion_numero === habitacionNumero &&
          (tk.estado === 'resuelto' || tk.estado === 'rechazado') &&
          !vistos.has(tk.id) &&
          ahora - new Date(fechaFin(tk)).getTime() < HORAS_AVISO_FINAL * 3_600_000,
      )
      .sort((a, b) => fechaFin(b).localeCompare(fechaFin(a)))[0];
    if (!terminada) return null;
    const ok = terminada.estado === 'resuelto';
    return (
      <Link
        href={`${basePath}/ticket/${terminada.id}`}
        className={`relative flex min-h-[76px] items-center gap-3.5 overflow-hidden rounded-[22px] border border-black/[0.05] bg-white py-3.5 pl-4 pr-3 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)] transition-transform duration-300 ${EASE} active:scale-[0.965]`}
      >
        <span aria-hidden className={`pointer-events-none absolute inset-0 ${ok ? 'bg-emerald-400/10' : 'bg-rose-400/10'}`} />
        <span
          aria-hidden
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
        >
          {ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
        </span>
        <span className="relative min-w-0 flex-1">
          <span className={`block truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {ok ? t.resuelta : t.rechazada}
          </span>
          <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-[#111827]">{resumenTicket(terminada, idioma)}</span>
          <span aria-live="polite" className="block text-[13px] leading-snug text-neutral-600">
            {ok ? t.resueltaTexto(tiempoRelativo(fechaFin(terminada), ahora, idioma)) : t.rechazadaTexto}{' '}
            <span className="tabular-nums text-neutral-400">· #{terminada.codigo_corto}</span>
          </span>
        </span>
        <span className="relative flex h-12 shrink-0 items-center gap-0.5 rounded-full pl-3 pr-1 text-[14px] font-semibold text-neutral-900">
          {t.ver}
          <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </Link>
    );
  }

  const variante = varianteDe(ticket);
  const estilo = ESTILOS[variante];
  const adicionales = activos.length - 1;

  const estadoTexto = textoEstadoActivo(ticket, idioma, ahora, hotel.hora_silencio_fin);

  return (
    <Link
      href={`${basePath}/ticket/${ticket.id}`}
      className={`relative flex min-h-[76px] items-center gap-3.5 overflow-hidden rounded-[22px] border border-black/[0.05] bg-white py-3.5 pl-4 pr-3 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)] transition-transform duration-300 ${EASE} active:scale-[0.965]`}
    >
      {/* Aura de color según el estado */}
      <span aria-hidden className={`pointer-events-none absolute inset-0 transition-colors duration-500 ${estilo.aura}`} />
      <span
        aria-hidden
        className={`pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full blur-2xl transition-colors duration-500 ${estilo.halo}`}
      />

      <span aria-hidden className="relative flex h-3 w-3 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${estilo.punto}`} />
        <span className={`relative inline-flex h-3 w-3 rounded-full ${estilo.punto}`} />
      </span>

      <span className="relative min-w-0 flex-1">
        {/* Una sola línea: la etiqueta se recorta con "…" antes que partir la pastilla. */}
        <span className="flex min-w-0 items-center gap-2">
          <span className={`min-w-0 truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] ${estilo.etiqueta}`}>
            {t.solicitudActiva}
          </span>
          {adicionales > 0 && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-black/[0.06] px-1.5 py-px text-[10.5px] font-semibold text-neutral-600">
              {t.mas(adicionales)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-[#111827]">
          {resumenTicket(ticket, idioma)}
        </span>
        <span aria-live="polite" className="block text-[13px] leading-snug text-neutral-600">
          {estadoTexto} <span className="tabular-nums text-neutral-400">· #{ticket.codigo_corto}</span>
        </span>
      </span>

      <span className="relative flex h-12 shrink-0 items-center gap-0.5 rounded-full bg-transparent pl-3 pr-1 text-[14px] font-semibold text-neutral-900">
        {t.ver}
        <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </Link>
  );
}
