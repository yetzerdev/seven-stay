'use client';

import { useEffect, useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';

import { clientePortal, supabaseConfigurado } from '@/lib/supabase';
import { activarPush, estadoPush, type EstadoPush } from '@/lib/push';
import type { Idioma } from '@/types/sevenstay';

import PasosInstalarIOS from './PasosInstalarIOS';
import { useModoInstalacion } from './useInstalacion';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';

const TEXTOS = {
  es: {
    titulo: 'Avísame cuando cambie',
    texto: 'Te enviamos una notificación cuando tu solicitud vaya en camino o se resuelva, aunque cierres esta página.',
    activar: 'Activar avisos',
    activo: 'Avisos activados en este teléfono',
    instalarTitulo: 'Recibe avisos en tu iPhone',
    instalarTexto: 'En iPhone los avisos funcionan desde la app. Agrégala a tu inicio y ábrela desde el ícono:',
    bloqueado: 'Los avisos están bloqueados. Actívalos en Ajustes → Notificaciones de tu teléfono.',
  },
  en: {
    titulo: 'Notify me when it changes',
    texto: "We'll send you a notification when your request is on its way or completed, even if you close this page.",
    activar: 'Turn on notifications',
    activo: 'Notifications are on for this phone',
    instalarTitulo: 'Get notified on your iPhone',
    instalarTexto: 'On iPhone, notifications work from the app. Add it to your Home Screen and open it from the icon:',
    bloqueado: 'Notifications are blocked. Turn them on in your phone’s Settings → Notifications.',
  },
} as const;

/**
 * En el seguimiento de una solicitud abierta: ofrece activar las notificaciones
 * push. En iPhone fuera de la app instalada, explica cómo instalarla primero.
 */
export default function TarjetaAvisos({ codigo, idioma }: { codigo: string; idioma: Idioma }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [activando, setActivando] = useState(false);
  const modo = useModoInstalacion();
  const t = TEXTOS[idioma];

  useEffect(() => {
    let vivo = true;
    void estadoPush().then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!supabaseConfigurado || estado === null || estado === 'no_soportado') return null;

  const activar = async () => {
    setActivando(true);
    setEstado(await activarPush(clientePortal(), codigo, idioma));
    setActivando(false);
  };

  const tarjeta = 'rounded-2xl border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';

  if (estado === 'activo') {
    return (
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        {t.activo}
      </p>
    );
  }

  if (estado === 'requiere_instalar') {
    return (
      <div className={tarjeta}>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
          <BellRing aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          {t.instalarTitulo}
        </p>
        <p className="mb-3.5 mt-1 text-[13px] leading-relaxed text-neutral-500">{t.instalarTexto}</p>
        <PasosInstalarIOS idioma={idioma} safari={modo !== 'ios_otro'} />
      </div>
    );
  }

  if (estado === 'bloqueado') {
    return <p className="px-2 text-center text-[12.5px] leading-relaxed text-neutral-500">{t.bloqueado}</p>;
  }

  return (
    <div className={tarjeta}>
      <p className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
        <BellRing aria-hidden className="h-4 w-4" strokeWidth={2.25} />
        {t.titulo}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">{t.texto}</p>
      <button
        type="button"
        disabled={activando}
        onClick={() => void activar()}
        className={`mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[14px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.98] disabled:opacity-70`}
      >
        {activando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
        {t.activar}
      </button>
    </div>
  );
}
