'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { ticketFinalizado } from '@/context/StayContext';
import type { Ticket } from '@/types/sevenstay';

/**
 * Solicitudes terminadas que el huésped ya abrió en este teléfono. Mientras no
 * las abra, el inicio le avisa que se resolvieron o que no se aprobaron.
 * Se guarda en el navegador (localStorage); si no hay almacenamiento, el aviso
 * se muestra igual y simplemente no se recuerda.
 */

const CLAVE = 'sevenstay:tickets-vistos';
const EVENTO = 'sevenstay:tickets-vistos';
const MAXIMO = 200;

let cache: string | null = null;

function leer(): string {
  try {
    cache = window.localStorage.getItem(CLAVE) ?? '';
  } catch {
    cache ??= '';
  }
  return cache;
}

function suscribir(oyente: () => void): () => void {
  const alCambiar = (e: StorageEvent) => {
    if (e.key === CLAVE || e.key === null) oyente();
  };
  window.addEventListener('storage', alCambiar);
  window.addEventListener(EVENTO, oyente);
  return () => {
    window.removeEventListener('storage', alCambiar);
    window.removeEventListener(EVENTO, oyente);
  };
}

/** Ids de las solicitudes terminadas que ya se vieron. */
export function useTicketsVistos(): Set<string> {
  const crudo = useSyncExternalStore(suscribir, leer, () => '');
  return new Set(crudo ? crudo.split(',') : []);
}

export function marcarTicketVisto(id: string) {
  const ids = leer() ? leer().split(',') : [];
  if (ids.includes(id)) return;
  const nuevos = [...ids, id].slice(-MAXIMO).join(',');
  try {
    window.localStorage.setItem(CLAVE, nuevos);
  } catch {
    cache = nuevos;
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Al abrir una solicitud ya terminada, deja de avisarse en el inicio. */
export function useMarcarVisto(ticket: Ticket | undefined) {
  const id = ticket?.id;
  const terminado = ticket ? ticketFinalizado(ticket) : false;
  useEffect(() => {
    if (id && terminado) marcarTicketVisto(id);
  }, [id, terminado]);
}

/** Cuándo terminó la solicitud (último evento del historial). */
export function fechaFin(ticket: Ticket): string {
  return ticket.historial.at(-1)?.fecha ?? ticket.resuelto_at ?? ticket.creado_at;
}
