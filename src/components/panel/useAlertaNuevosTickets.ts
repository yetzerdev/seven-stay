'use client';

import { useEffect, useRef } from 'react';

import { useStay } from '@/context/StayContext';

import { esDelHotel } from './ticketPanel';

/*
 * Alerta de recepción en el panel (los avisos por WhatsApp los envía el bot de Seven Stay):
 *  - suena un aviso discreto cada vez que entra una solicitud nueva que pide
 *    acción (abierta o por validar), venga de esta pestaña o de otra;
 *  - el título de la pestaña muestra "(n) Nuevo Ticket - Seven Stay" hasta que
 *    alguien vuelve a mirar el panel (pestaña visible y con foco).
 */

const TITULO_BASE = 'Seven Stay';

let contextoAudio: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!contextoAudio) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    contextoAudio = new Ctor();
  }
  return contextoAudio;
}

/** Campanita de dos tonos, corta y suave (sin archivos de audio). */
function sonarAviso() {
  const ctx = obtenerContexto();
  if (!ctx || ctx.state !== 'running') return; // el navegador aún no permite sonido (sin interacción)
  const ahora = ctx.currentTime;
  [
    { frecuencia: 880, inicio: 0 },
    { frecuencia: 1318.5, inicio: 0.14 },
  ].forEach(({ frecuencia, inicio }) => {
    const osc = ctx.createOscillator();
    const volumen = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    volumen.gain.setValueAtTime(0.0001, ahora + inicio);
    volumen.gain.exponentialRampToValueAtTime(0.18, ahora + inicio + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + 0.45);
    osc.connect(volumen).connect(ctx.destination);
    osc.start(ahora + inicio);
    osc.stop(ahora + inicio + 0.5);
  });
}

function requiereAccion(estado: string): boolean {
  return estado === 'abierto' || estado === 'pendiente_validacion_hab';
}

/** Activa la alerta (sonido + título) mientras el panel está abierto. */
export function useAlertaNuevosTickets(activa: boolean) {
  const { tickets, hidratado } = useStay();
  const conocidos = useRef<Set<string> | null>(null);
  const sinVer = useRef(0);

  // Los navegadores solo permiten sonido después de una interacción: se
  // "despierta" el audio con el primer clic o tecla en el panel.
  useEffect(() => {
    if (!activa) return;
    const despertar = () => {
      void obtenerContexto()?.resume();
    };
    window.addEventListener('pointerdown', despertar);
    window.addEventListener('keydown', despertar);
    return () => {
      window.removeEventListener('pointerdown', despertar);
      window.removeEventListener('keydown', despertar);
    };
  }, [activa]);

  // Al volver a mirar el panel, el contador del título se limpia.
  useEffect(() => {
    if (!activa) return;
    document.title = TITULO_BASE;
    const limpiar = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        sinVer.current = 0;
        document.title = TITULO_BASE;
      }
    };
    window.addEventListener('focus', limpiar);
    document.addEventListener('visibilitychange', limpiar);
    return () => {
      window.removeEventListener('focus', limpiar);
      document.removeEventListener('visibilitychange', limpiar);
    };
  }, [activa]);

  // Detecta solicitudes nuevas que piden acción.
  useEffect(() => {
    if (!activa || !hidratado) return;
    const delHotel = tickets.filter(esDelHotel);
    if (conocidos.current === null) {
      // Primera lectura: lo que ya existía no suena.
      conocidos.current = new Set(delHotel.map((t) => t.id));
      return;
    }
    const nuevos = delHotel.filter((t) => !conocidos.current!.has(t.id) && requiereAccion(t.estado));
    delHotel.forEach((t) => conocidos.current!.add(t.id));
    if (nuevos.length === 0) return;

    sonarAviso();
    const mirando = document.visibilityState === 'visible' && document.hasFocus();
    if (!mirando) {
      sinVer.current += nuevos.length;
      document.title = `(${sinVer.current}) Nuevo Ticket - Seven Stay`;
    }
  }, [activa, hidratado, tickets]);
}
