'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { mensajeDe } from '@/context/StayContext';
import type { AccionesAdmin, NombreAccion, RolAdmin } from '@/lib/admin/tipos';
import { clienteAdmin, supabaseConfigurado } from '@/lib/supabase';
import { obtenerTokenCaptcha } from '@/lib/turnstile';

/**
 * Sesión del panel interno de Seven Stay. El navegador solo guarda la sesión;
 * todo lo demás lo pide a /api/admin, que comprueba en el servidor que la
 * persona sea del equipo de Seven Stay.
 */

export type EstadoSesionAdmin = 'cargando' | 'sin_sesion' | 'sin_permiso' | 'error' | 'listo';

/** Error de /api/admin con su código HTTP (403 = no es del equipo de Seven Stay). */
export class ErrorApiAdmin extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

interface ValorSesionAdmin {
  estado: EstadoSesionAdmin;
  admin: { nombre: string; correo: string; rol: RolAdmin } | null;
  /** Motivo cuando `estado` es 'error' (p. ej. falta configurar el servidor). */
  mensajeError: string | null;
  reintentar: () => void;
  iniciarSesion: (correo: string, clave: string) => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  /** Llama una acción del servidor. Lanza `Error` con un mensaje legible si falla. */
  llamar: <N extends NombreAccion>(accion: N, entrada: AccionesAdmin[N]['entrada']) => Promise<AccionesAdmin[N]['salida']>;
}

const Contexto = createContext<ValorSesionAdmin | null>(null);

/** Promesa que se cumple cuando el servidor confirma que la sesión es del equipo. */
function crearEspera() {
  let cumplir = () => {};
  const promesa = new Promise<void>((r) => {
    cumplir = r;
  });
  return { promesa, cumplir };
}

export function useAdmin(): ValorSesionAdmin {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAdmin debe usarse dentro de SesionAdminProvider.');
  return v;
}

export function SesionAdminProvider({ children }: { children: ReactNode }) {
  const cliente = useMemo(() => (supabaseConfigurado ? clienteAdmin() : null), []);
  const [sesion, setSesion] = useState<Session | null | undefined>(cliente ? undefined : null);
  // Resultado de preguntar al servidor "¿esta sesión es de Seven Stay?" (por usuario).
  const [verificacion, setVerificacion] = useState<{
    uid: string;
    admin: ValorSesionAdmin['admin'];
    error: string | null;
    noEsAdmin: boolean;
    intento: number;
  } | null>(null);
  const [intento, setIntento] = useState(0);
  // Las páginas se pintan (ocultas) antes de verificar el acceso: sus llamadas esperan aquí.
  const verificado = useRef(crearEspera());

  useEffect(() => {
    if (!cliente) return;
    void cliente.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = cliente.auth.onAuthStateChange((_e, nueva) => setSesion(nueva));
    return () => data.subscription.unsubscribe();
  }, [cliente]);

  const llamar = useCallback(
    async <N extends NombreAccion>(accion: N, entrada: AccionesAdmin[N]['entrada']): Promise<AccionesAdmin[N]['salida']> => {
      if (!cliente) throw new Error('Supabase no está configurado.');
      if (accion !== 'yo') await verificado.current.promesa;
      const { data } = await cliente.auth.getSession(); // renueva el token si venció
      const token = data.session?.access_token;
      if (!token) throw new Error('Inicia sesión.');
      let respuesta: Response;
      try {
        respuesta = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ accion, entrada }),
        });
      } catch {
        throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      }
      const cuerpo = (await respuesta.json().catch(() => null)) as { ok: boolean; salida?: unknown; error?: string } | null;
      if (!cuerpo?.ok) throw new ErrorApiAdmin(cuerpo?.error ?? `Error ${respuesta.status}`, respuesta.status);
      return cuerpo.salida as AccionesAdmin[N]['salida'];
    },
    [cliente],
  );

  const uid = sesion?.user.id ?? null;
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    const espera = crearEspera();
    verificado.current = espera; // otro usuario o reintento: se vuelve a esperar
    llamar('yo', null).then(
      (admin) => {
        if (!vivo) return;
        setVerificacion({ uid, admin, error: null, noEsAdmin: false, intento });
        espera.cumplir();
      },
      (fallo: unknown) => {
        if (!vivo) return;
        // Solo un 403 significa "no es del equipo"; lo demás (servidor sin configurar,
        // sin conexión, sesión vencida) se muestra con su motivo real.
        const noEsAdmin = fallo instanceof ErrorApiAdmin && fallo.estado === 403;
        setVerificacion({ uid, admin: null, error: mensajeDe(fallo), noEsAdmin, intento });
      },
    );
    return () => {
      vivo = false;
    };
  }, [uid, llamar, intento]);

  const verificada = verificacion && verificacion.uid === uid && verificacion.intento === intento ? verificacion : null;
  let estado: EstadoSesionAdmin;
  if (sesion === undefined) estado = 'cargando';
  else if (sesion === null) estado = 'sin_sesion';
  else if (!verificada) estado = 'cargando';
  else if (verificada.admin) estado = 'listo';
  else estado = verificada.noEsAdmin ? 'sin_permiso' : 'error';

  const valor = useMemo<ValorSesionAdmin>(
    () => ({
      estado,
      admin: verificada?.admin ?? null,
      mensajeError: verificada?.error ?? null,
      reintentar: () => setIntento((n) => n + 1),
      llamar,
      iniciarSesion: async (correo, clave) => {
        if (!cliente) return 'Supabase no está configurado.';
        try {
          const captchaToken = await obtenerTokenCaptcha('es');
          const { error } = await cliente.auth.signInWithPassword({ email: correo, password: clave, options: { captchaToken } });
          if (!error) return null;
          return /invalid login credentials/i.test(error.message) ? 'Correo o contraseña incorrectos.' : error.message;
        } catch (error) {
          return mensajeDe(error);
        }
      },
      cerrarSesion: async () => {
        await cliente?.auth.signOut();
      },
    }),
    [estado, verificada, llamar, cliente],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
