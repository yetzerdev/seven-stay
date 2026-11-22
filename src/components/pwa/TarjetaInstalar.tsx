'use client';

import { useState, useSyncExternalStore } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';

import type { Idioma } from '@/types/sevenstay';

import PasosInstalarIOS from './PasosInstalarIOS';
import { instalarApp, useModoInstalacion } from './useInstalacion';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const CLAVE_OCULTA = 'sevenstay:instalar-oculto';
const EVENTO = 'sevenstay:instalar-oculto';

const TEXTOS = {
  es: {
    titulo: 'Agrega Seven Stay a tu inicio',
    texto: 'Ábrelo como una app y recibe avisos cuando tu solicitud avance.',
    instalar: 'Instalar app',
    comoInstalar: 'Ver cómo',
    ocultar: 'Ahora no',
  },
  en: {
    titulo: 'Add Seven Stay to your Home Screen',
    texto: 'Open it like an app and get notified when your request moves forward.',
    instalar: 'Install app',
    comoInstalar: 'Show me how',
    ocultar: 'Not now',
  },
} as const;

function leerOculta(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_OCULTA) === '1';
  } catch {
    return false;
  }
}
function suscribir(oyente: () => void) {
  window.addEventListener(EVENTO, oyente);
  return () => window.removeEventListener(EVENTO, oyente);
}

/**
 * Invitación a instalar el portal como app (inicio del huésped).
 * Android: botón que abre el instalador. iPhone: los 3 pasos de Safari.
 * No aparece si ya está instalada, si el navegador no permite instalar o si el
 * huésped tocó "Ahora no".
 */
export default function TarjetaInstalar({ idioma }: { idioma: Idioma }) {
  const modo = useModoInstalacion();
  const oculta = useSyncExternalStore(suscribir, leerOculta, () => true);
  const [abierta, setAbierta] = useState(false);
  const t = TEXTOS[idioma];

  if (oculta || modo === 'instalada' || modo === 'no') return null;

  const ocultar = () => {
    try {
      window.localStorage.setItem(CLAVE_OCULTA, '1');
    } catch {
      // sin almacenamiento: se oculta solo en esta visita
    }
    window.dispatchEvent(new Event(EVENTO));
  };
  const esIOS = modo === 'ios_safari' || modo === 'ios_otro';

  return (
    <section className="relative rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]">
      <button
        type="button"
        onClick={ocultar}
        aria-label={t.ocultar}
        className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100"
      >
        <X aria-hidden className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <div className="flex items-start gap-3 pr-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícono local de la app */}
        <img src="/iconos/icono-192.png" alt="" className="h-11 w-11 shrink-0 rounded-[12px]" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-neutral-900">{t.titulo}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">{t.texto}</p>
        </div>
      </div>

      {esIOS ? (
        <>
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            className={`mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-neutral-900 text-[14px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.98]`}
          >
            {t.comoInstalar}
            <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${abierta ? 'rotate-180' : ''}`} strokeWidth={2.5} />
          </button>
          {abierta && (
            <div className="mt-4">
              <PasosInstalarIOS idioma={idioma} safari={modo === 'ios_safari'} />
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => void instalarApp()}
          className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[14px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.98]`}
        >
          <Download aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          {t.instalar}
        </button>
      )}
    </section>
  );
}
