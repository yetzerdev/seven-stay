'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cambios en vivo (Supabase Realtime) a prueba de fallos:
 *  - Un canal POR TABLA: si una suscripción falla, las demás siguen funcionando
 *    (antes, una tabla sin Realtime tumbaba el canal completo del panel).
 *  - Si un canal se cae (internet, teléfono dormido), se reconecta solo con
 *    espera creciente (2 s → 30 s).
 *  - Al volver a la app (pestaña o PWA en primer plano) se avisa con `alVolver`
 *    para releer lo que pasó mientras estaba en segundo plano.
 *  - Respaldo: `alVolver` también corre cada `respaldoMs`, por si el canal
 *    en vivo quedó colgado sin avisar.
 */

export interface TablaEnVivo {
  tabla: string;
  filtro?: string;
}

export function escucharEnVivo(
  cliente: SupabaseClient,
  nombre: string,
  tablas: TablaEnVivo[],
  alCambiar: (tabla: string) => void,
  alVolver: () => void,
  respaldoMs = 20_000,
): () => void {
  let activo = true;
  const canales = new Map<string, RealtimeChannel>();
  const reintentos = new Map<string, ReturnType<typeof setTimeout>>();
  const esperas = new Map<string, number>();
  const sufijo = Math.random().toString(36).slice(2, 8);

  const conectar = ({ tabla, filtro }: TablaEnVivo) => {
    if (!activo) return;
    const canal = cliente
      .channel(`${nombre}-${tabla}-${sufijo}-${Date.now().toString(36)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) }, () => alCambiar(tabla))
      .subscribe((estado, error) => {
        if (!activo) return;
        if (estado === 'SUBSCRIBED') {
          // Al (re)conectar se relee esa parte: pudo cambiar mientras no había conexión.
          if (esperas.has(tabla)) alCambiar(tabla);
          esperas.set(tabla, 0);
          return;
        }
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          if (estado === 'CHANNEL_ERROR') console.warn(`[en vivo] ${tabla}:`, error?.message ?? estado);
          const espera = Math.min(30_000, Math.max(2_000, (esperas.get(tabla) ?? 1_000) * 2));
          esperas.set(tabla, espera);
          clearTimeout(reintentos.get(tabla));
          reintentos.set(
            tabla,
            setTimeout(() => {
              if (!activo) return;
              const viejo = canales.get(tabla);
              if (viejo) void cliente.removeChannel(viejo);
              conectar({ tabla, filtro });
            }, espera),
          );
        }
      });
    canales.set(tabla, canal);
  };

  tablas.forEach(conectar);

  // Volver a la app: en el teléfono `focus` no siempre se dispara (PWA), `visibilitychange` sí.
  const alMostrar = () => {
    if (document.visibilityState === 'visible') alVolver();
  };
  document.addEventListener('visibilitychange', alMostrar);
  window.addEventListener('focus', alVolver);
  window.addEventListener('pageshow', alVolver);
  window.addEventListener('online', alVolver);
  const respaldo = setInterval(() => {
    if (document.visibilityState === 'visible') alVolver();
  }, respaldoMs);

  return () => {
    activo = false;
    clearInterval(respaldo);
    reintentos.forEach((t) => clearTimeout(t));
    document.removeEventListener('visibilitychange', alMostrar);
    window.removeEventListener('focus', alVolver);
    window.removeEventListener('pageshow', alVolver);
    window.removeEventListener('online', alVolver);
    canales.forEach((c) => void cliente.removeChannel(c));
  };
}
