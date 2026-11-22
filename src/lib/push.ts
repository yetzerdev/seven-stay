'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Notificaciones push (Web Push).
 *  - Android / computadora: funcionan desde el navegador.
 *  - iPhone / iPad: SOLO si la app se instaló en la pantalla de inicio (iOS 16.4+).
 * La suscripción se guarda en Supabase (push_suscripciones) y el envío lo hace
 * la función `enviar-push` cuando una solicitud cambia.
 */

export const CLAVE_PUBLICA_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type EstadoPush =
  | 'no_soportado' // navegador sin Web Push (o sin clave VAPID configurada)
  | 'requiere_instalar' // iPhone/iPad fuera de la app instalada
  | 'bloqueado' // el usuario lo negó: solo se reactiva desde los ajustes del teléfono
  | 'disponible' // se puede pedir permiso
  | 'activo';

export function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS se presenta como Mac, pero con pantalla táctil.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function esAppInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } catch {
    return null;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'no_soportado';
  if (esIOS() && !esAppInstalada()) return 'requiere_instalar';
  if (!CLAVE_PUBLICA_VAPID || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'no_soportado';
  }
  if (Notification.permission === 'denied') return 'bloqueado';
  const registro = await navigator.serviceWorker.getRegistration('/');
  const suscripcion = await registro?.pushManager.getSubscription();
  return suscripcion && Notification.permission === 'granted' ? 'activo' : 'disponible';
}

function bytesDeBase64Url(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const crudo = window.atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

/**
 * Pide permiso (debe llamarse desde un toque del usuario), suscribe el teléfono
 * y guarda la suscripción. `codigo` = placa de la habitación (huésped); `null` = panel.
 */
export async function activarPush(cliente: SupabaseClient, codigo: string | null, idioma: 'es' | 'en' = 'es'): Promise<EstadoPush> {
  if (esIOS() && !esAppInstalada()) return 'requiere_instalar';
  if (!CLAVE_PUBLICA_VAPID || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'no_soportado';
  }
  // Safari solo muestra el permiso si se pide en el mismo toque: nada asíncrono antes de esto.
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'disponible';

  const registro = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeBase64Url(CLAVE_PUBLICA_VAPID) }));

  const json = suscripcion.toJSON();
  const { error } = await cliente.rpc('guardar_suscripcion_push', {
    p_codigo: codigo,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_idioma: idioma,
  });
  return error ? 'disponible' : 'activo';
}
