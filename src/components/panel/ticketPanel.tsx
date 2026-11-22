'use client';

import { useEffect, useState } from 'react';
import { Check, Hourglass, Moon, X } from 'lucide-react';

import { etiquetaSubcategoria, formato12h, formatoPrecio, ITEMS_HOUSEKEEPING, tiempoRelativo } from '@/components/portal/etiquetasTicket';
import { useStay } from '@/context/StayContext';
import { useUrlFoto } from '@/lib/fotos';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';
import type { CategoriaTicket, EstadoTicket, PersonalOperativo, RolPersonal, Ticket } from '@/types/sevenstay';

/*
 * Piezas compartidas por el tablero (/panel) y el detalle de una solicitud
 * (/panel/solicitudes/[id]).
 */

/**
 * ¿Lo gestiona el hotel? Las reservas de tours propios del hotel sí (se pagan en
 * recepción); las de tours de Seven Stay van a su canal y el panel no las muestra.
 */
export function esDelHotel(ticket: Ticket): boolean {
  return ticket.categoria !== 'tour' || ticket.tour_propio;
}

export const CATEGORIAS_PANEL: Record<CategoriaTicket, { texto: string; punto: string }> = {
  housekeeping: { texto: 'Housekeeping', punto: 'bg-violet-500' },
  mantenimiento: { texto: 'Mantenimiento', punto: 'bg-orange-500' },
  tour: { texto: 'Tour', punto: 'bg-teal-500' },
  room_service: { texto: 'Room service', punto: 'bg-pink-500' },
};

export const ESTADOS_PANEL: Record<EstadoTicket, { texto: string; clase: string }> = {
  pendiente_validacion_hab: { texto: 'Esperando check-in', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  abierto: { texto: 'Sin asignar', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  pospuesto_silencio: { texto: 'Programado', clase: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  aceptado: { texto: 'En proceso', clase: 'bg-sky-50 text-sky-700 border-sky-200' },
  resuelto: { texto: 'Resuelto', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazado: { texto: 'Rechazado', clase: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  cancelado: { texto: 'Cancelada por huésped', clase: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
};

/** URL temporal de la foto de mantenimiento (Storage privado; RLS: solo el personal del hotel). */
export function useFotoTicket(ticket: Ticket | undefined): string | null {
  return useUrlFoto(supabaseConfigurado ? clientePanel() : null, ticket?.detalle_mantenimiento?.foto_path);
}

export const PUESTOS: Record<RolPersonal, string> = {
  ama_de_llaves: 'Ama de llaves',
  mantenimiento: 'Mantenimiento',
  recepcion: 'Recepción',
  supervisor_gerente: 'Supervisor / Gerente',
};

/** Quién suele atender cada categoría (se sugiere primero al asignar). */
const ROL_SUGERIDO: Record<CategoriaTicket, RolPersonal> = {
  housekeeping: 'ama_de_llaves',
  mantenimiento: 'mantenimiento',
  tour: 'recepcion',
  room_service: 'recepcion',
};

/** Lo que se pidió, en partes legibles (en español: el panel es para el personal). */
export function partesPedido(ticket: Ticket): string[] {
  switch (ticket.categoria) {
    case 'housekeeping': {
      const d = ticket.detalle_housekeeping;
      const partes = (d?.items ?? []).map(({ item, cantidad }) => `${cantidad}x ${ITEMS_HOUSEKEEPING[item]?.es ?? item}`);
      if (d?.limpieza_inmediata) partes.push('Limpieza ahora');
      if (d?.no_molestar) partes.push('No Molestar');
      return partes;
    }
    case 'mantenimiento':
      return [etiquetaSubcategoria(ticket.detalle_mantenimiento?.subcategoria, 'es')];
    case 'tour':
    case 'room_service': {
      const c = ticket.detalle_catalogo;
      if (!c) return [];
      const cantidad = ticket.categoria === 'tour' ? `${c.cantidad} pax` : `${c.cantidad}x`;
      return [`${cantidad} ${c.titulo}`, formatoPrecio(c.precio * c.cantidad, c.moneda), c.voucher_codigo];
    }
  }
}

/** Puesto de un miembro del equipo por su nombre (los tickets guardan el nombre). */
export function puestoDe(personal: PersonalOperativo[], nombre: string | null): string | null {
  const persona = personal.find((p) => p.nombre === nombre);
  return persona ? PUESTOS[persona.rol] : null;
}

/**
 * Todo el equipo puede recibir una asignación (ya no depende de quién está "en
 * turno"). Primero el puesto que suele atender la categoría, luego quien está en turno.
 */
function equipoOrdenado(personal: PersonalOperativo[], categoria: CategoriaTicket): PersonalOperativo[] {
  const rol = ROL_SUGERIDO[categoria];
  return [...personal].sort(
    (a, b) =>
      Number(b.rol === rol) - Number(a.rol === rol) ||
      Number(b.en_turno) - Number(a.en_turno) ||
      a.nombre.localeCompare(b.nombre),
  );
}

/** Foto a pantalla completa (Escape o clic fuera para cerrar). */
export function VisorFoto({ src, onCerrar }: { src: string; onCerrar: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Foto adjunta" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <button type="button" aria-label="Cerrar foto" onClick={onCerrar} className="absolute inset-0" />
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL local */}
      <img src={src} alt="Foto adjunta por el huésped" className="relative max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar foto"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}

/** La acción del momento según el estado: asignar, resolver o solo informar. */
export function AccionesTicket({ ticket, ahora }: { ticket: Ticket; ahora: number }) {
  const { personal, hotel, aceptarTicket, resolverTicket } = useStay();
  const disponibles = equipoOrdenado(personal, ticket.categoria);
  const [asignado, setAsignado] = useState('');
  const seleccion = disponibles.some((p) => p.nombre === asignado) ? asignado : (disponibles[0]?.nombre ?? '');

  if (ticket.estado === 'abierto' || ticket.estado === 'pospuesto_silencio') {
    // Sin equipo cargado: quien acepta queda como responsable (lo registra la base de datos).
    if (disponibles.length === 0) {
      return (
        <button
          type="button"
          onClick={() => aceptarTicket(ticket.id, '')}
          className="h-11 shrink-0 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
        >
          Tomar solicitud
        </button>
      );
    }
    return (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {ticket.estado === 'pospuesto_silencio' && (
          <span title={`Programado ${formato12h(hotel.hora_silencio_fin)}`} className="text-indigo-600">
            <Moon aria-label={`Programado ${formato12h(hotel.hora_silencio_fin)}`} className="h-5 w-5" />
          </span>
        )}
        <select
          aria-label="Asignar a"
          value={seleccion}
          onChange={(e) => setAsignado(e.target.value)}
          className="h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3 text-[15px] font-medium text-neutral-900 outline-none focus:border-neutral-900 sm:w-64"
        >
          {disponibles.map((p) => (
            <option key={p.id} value={p.nombre}>
              {p.nombre} · {PUESTOS[p.rol]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => seleccion && aceptarTicket(ticket.id, seleccion)}
          className="h-11 shrink-0 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
        >
          Asignar
        </button>
      </div>
    );
  }

  if (ticket.estado === 'aceptado') {
    return (
      <div className="flex items-center gap-3">
        <span className="truncate text-[15px] text-neutral-600">
          {ticket.asignado_a_nombre ?? 'Equipo'}
          {puestoDe(personal, ticket.asignado_a_nombre) && (
            <span className="text-neutral-400"> · {puestoDe(personal, ticket.asignado_a_nombre)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => resolverTicket(ticket.id)}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-[15px] font-semibold text-white hover:bg-emerald-700"
        >
          <Check aria-hidden className="h-4 w-4" />
          Resolver
        </button>
      </div>
    );
  }

  if (ticket.estado === 'pendiente_validacion_hab') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-amber-700">
        <Hourglass aria-hidden className="h-4 w-4" />
        Esperando check-in
      </span>
    );
  }

  if (ticket.estado === 'resuelto') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-emerald-700">
        <Check aria-hidden className="h-4 w-4" />
        {ticket.asignado_a_nombre ?? 'Resuelto'}
        {ticket.resuelto_at && <span className="font-normal text-neutral-400">· {tiempoRelativo(ticket.resuelto_at, ahora, 'es')}</span>}
      </span>
    );
  }

  return (
    <span className="text-[14.5px] font-medium text-neutral-500">{ticket.estado === 'cancelado' ? 'Cancelada por huésped' : 'Rechazado'}</span>
  );
}
