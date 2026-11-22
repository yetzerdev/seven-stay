'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';

import { activarPush, estadoPush, type EstadoPush } from '@/lib/push';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';

const TEXTOS: Record<EstadoPush, string> = {
  disponible: 'Activar avisos de solicitudes nuevas',
  activo: 'Avisos activados en este dispositivo',
  bloqueado: 'Avisos bloqueados en el navegador',
  requiere_instalar: 'Instala el panel para recibir avisos',
  no_soportado: '',
};

/**
 * Elemento del menú de cuenta del panel: activa las notificaciones push de
 * solicitudes nuevas o escaladas en este dispositivo (aunque la pestaña esté cerrada).
 */
export default function BotonAvisosPanel() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [activando, setActivando] = useState(false);

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

  const Icono = estado === 'activo' ? BellRing : estado === 'bloqueado' ? BellOff : Bell;
  const accionable = estado === 'disponible';

  return (
    <div className="border-t border-neutral-100 pt-1.5">
      <button
        type="button"
        role="menuitem"
        disabled={!accionable || activando}
        onClick={async () => {
          setActivando(true);
          setEstado(await activarPush(clientePanel(), null));
          setActivando(false);
        }}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium ${
          estado === 'activo' ? 'text-emerald-700' : accionable ? 'text-neutral-700 hover:bg-neutral-100' : 'text-neutral-500'
        }`}
      >
        {activando ? <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" /> : <Icono aria-hidden className="h-4 w-4 shrink-0" />}
        {TEXTOS[estado]}
      </button>
      {estado === 'requiere_instalar' && (
        <p className="px-3 pb-2 text-[12.5px] leading-snug text-neutral-500">
          En iPhone o iPad: Compartir → «Agregar a inicio» y abre el panel desde el ícono.
        </p>
      )}
    </div>
  );
}
