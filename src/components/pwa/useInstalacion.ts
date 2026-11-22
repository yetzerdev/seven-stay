'use client';

import { useSyncExternalStore } from 'react';

import { esAppInstalada, esIOS } from '@/lib/push';

/**
 * Cómo se puede instalar la app en este dispositivo:
 *  - 'instalada': ya se abrió desde el ícono de la pantalla de inicio.
 *  - 'android':   Chrome/Edge ofrecen instalar con un botón (beforeinstallprompt).
 *  - 'ios_safari' / 'ios_otro': en iPhone/iPad se instala a mano desde "Compartir".
 *  - 'no':        este navegador no permite instalar (o no hace falta mostrarlo).
 */
export type ModoInstalacion = 'instalada' | 'android' | 'ios_safari' | 'ios_otro' | 'no';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let eventoInstalar: EventoInstalar | null = null;
let instaladaAhora = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

if (typeof window !== 'undefined') {
  // Chrome lo dispara una vez por carga: se guarda para usarlo al tocar "Instalar".
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    eventoInstalar = null;
    instaladaAhora = true;
    avisar();
  });
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function modoActual(): ModoInstalacion {
  if (instaladaAhora || esAppInstalada()) return 'instalada';
  if (esIOS()) {
    // Chrome, Firefox y Edge de iOS (iOS 16.4+) también instalan desde "Compartir", pero el botón está arriba.
    return /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? 'ios_otro' : 'ios_safari';
  }
  return eventoInstalar ? 'android' : 'no';
}

export function useModoInstalacion(): ModoInstalacion {
  return useSyncExternalStore(suscribir, modoActual, () => 'no');
}

/** Abre el cuadro de instalación de Chrome/Edge. Devuelve `true` si se instaló. */
export async function instalarApp(): Promise<boolean> {
  if (!eventoInstalar) return false;
  const evento = eventoInstalar;
  eventoInstalar = null;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  avisar();
  return outcome === 'accepted';
}
