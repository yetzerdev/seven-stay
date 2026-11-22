'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * Dos clientes con sesiones SEPARADAS en el mismo navegador:
 *  - portal: sesión anónima del huésped (cada teléfono = un usuario anónimo);
 *  - panel: sesión con correo y contraseña del personal del hotel.
 * Así, si alguien de recepción abre el portal en su computadora, no mezcla su
 * sesión del panel con la de huésped (y viceversa).
 */

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(URL_SUPABASE && CLAVE_ANON);

let portal: SupabaseClient | null = null;
let panel: SupabaseClient | null = null;
let admin: SupabaseClient | null = null;

function crear(clave: string): SupabaseClient {
  if (!URL_SUPABASE || !CLAVE_ANON) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local');
  }
  return createClient(URL_SUPABASE, CLAVE_ANON, {
    auth: { storageKey: clave, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

export function clientePortal(): SupabaseClient {
  portal ??= crear('sevenstay-portal-auth');
  return portal;
}

export function clientePanel(): SupabaseClient {
  panel ??= crear('sevenstay-panel-auth');
  return panel;
}

/** Panel interno de Seven Stay (/admin): su propia sesión, separada de la del hotel. */
export function clienteAdmin(): SupabaseClient {
  admin ??= crear('sevenstay-admin-auth');
  return admin;
}
