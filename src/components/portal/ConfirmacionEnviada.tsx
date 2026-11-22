'use client';

import { useEffect, useRef, useState } from 'react';

import type { Idioma } from '@/types/sevenstay';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';

const TEXTOS = {
  es: {
    titulo: '¡Solicitud enviada!',
    detalle: (codigo: string) => `Código #${codigo} · Te avisaremos aquí cuando esté en camino.`,
  },
  en: {
    titulo: 'Request sent!',
    detalle: (codigo: string) => `Code #${codigo} · We'll update you here when it's on the way.`,
  },
} as const;

interface Props {
  codigoCorto: string;
  idioma: Idioma;
  /** Se llama al terminar la animación (p. ej. para volver a la Home). */
  onTerminar: () => void;
  duracionMs?: number;
}

/**
 * Pantalla de confirmación a pantalla completa: círculo verde que aparece con
 * rebote, check que se dibuja, onda que se expande y texto que sube. Al
 * terminar llama a `onTerminar`. Respeta "reducir movimiento" del sistema.
 */
export default function ConfirmacionEnviada({ codigoCorto, idioma, onTerminar, duracionMs = 2000 }: Props) {
  const [visible, setVisible] = useState(false);
  const alTerminar = useRef(onTerminar);

  useEffect(() => {
    alTerminar.current = onTerminar;
  }, [onTerminar]);

  useEffect(() => {
    // Un instante después de montar (ya pintado el estado inicial) se disparan
    // las transiciones. setTimeout en vez de requestAnimationFrame: rAF se
    // pausa en pestañas en segundo plano y la animación quedaría invisible.
    const entrada = setTimeout(() => setVisible(true), 30);
    const temporizador = setTimeout(() => alTerminar.current(), duracionMs);
    return () => {
      clearTimeout(entrada);
      clearTimeout(temporizador);
    };
  }, [duracionMs]);

  const t = TEXTOS[idioma];

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#F8F9FA]/85 px-8 text-center backdrop-blur-xl transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative flex h-24 w-24 items-center justify-center">
        {/* Onda que se expande */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full bg-emerald-500/25 transition-[transform,opacity] delay-200 duration-1000 ease-out motion-reduce:hidden ${
            visible ? 'scale-[1.9] opacity-0' : 'scale-75 opacity-100'
          }`}
        />
        {/* Círculo */}
        <span
          aria-hidden
          className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 shadow-[0_12px_32px_-6px_rgba(5,150,105,0.55)] transition-[transform,opacity] duration-700 ${EASE} motion-reduce:transition-none ${
            visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none">
            <path
              d="M6.5 12.5l3.75 3.75L17.5 8.5"
              stroke="white"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={18}
              className={`transition-[stroke-dashoffset] delay-300 duration-500 ease-out motion-reduce:transition-none ${
                visible ? '[stroke-dashoffset:0]' : '[stroke-dashoffset:18]'
              }`}
            />
          </svg>
        </span>
      </div>

      <p
        className={`mt-7 text-[22px] font-semibold tracking-[-0.01em] text-neutral-900 transition-[transform,opacity] delay-300 duration-500 ${EASE} ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        {t.titulo}
      </p>
      <p
        className={`mt-2 max-w-[280px] text-[14px] leading-relaxed text-neutral-500 transition-[transform,opacity] delay-[420ms] duration-500 ${EASE} ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        {t.detalle(codigoCorto)}
      </p>
    </div>
  );
}
