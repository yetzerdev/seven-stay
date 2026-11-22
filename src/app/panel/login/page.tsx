'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';

import MarcaSevenStay from '@/components/MarcaSevenStay';
import { mensajeDe, useStay } from '@/context/StayContext';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';
import { obtenerTokenCaptcha } from '@/lib/turnstile';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const CAMPO =
  'h-12 w-full rounded-xl border border-black/[0.08] bg-white pl-10 pr-3 text-[14.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

/**
 * Login del panel con Supabase Auth (correo y contraseña). El hotel y el rol
 * salen del usuario (hotel_staff), así que antes de entrar solo se ve la marca.
 */
export default function LoginPanelPage() {
  const router = useRouter();
  const { iniciarSesion } = useStay();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Recuperar contraseña: se envía un enlace al correo que abre /panel/restablecer.
  const [recuperando, setRecuperando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  const enviarEnlace = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) {
      setError('Escribe el correo con el que entras al panel.');
      return;
    }
    if (!supabaseConfigurado) {
      setError('Supabase no está configurado.');
      return;
    }
    setEnviando(true);
    try {
      const captchaToken = await obtenerTokenCaptcha('es');
      const { error: fallo } = await clientePanel().auth.resetPasswordForEmail(correo.trim(), {
        redirectTo: `${window.location.origin}/panel/restablecer`,
        captchaToken,
      });
      // Por seguridad no se dice si el correo existe: el mensaje es el mismo.
      if (fallo && !/user not found/i.test(fallo.message)) throw fallo;
      setEnlaceEnviado(true);
    } catch (fallo) {
      const m = mensajeDe(fallo);
      setError(/rate limit|security purposes/i.test(m) ? 'Ya enviamos un enlace hace poco. Espera un minuto e inténtalo de nuevo.' : m);
    } finally {
      setEnviando(false);
    }
  };

  const cambiarModo = (recuperar: boolean) => {
    setRecuperando(recuperar);
    setEnlaceEnviado(false);
    setError(null);
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) {
      setError('Escribe un correo válido.');
      return;
    }
    if (!clave) {
      setError('Escribe tu contraseña.');
      return;
    }
    setEnviando(true);
    const fallo = await iniciarSesion(correo.trim(), clave);
    if (fallo) {
      setEnviando(false);
      setError(fallo);
      return;
    }
    setClave('');
    router.replace('/panel');
    // Next conserva el estado de la página al salir: se reinicia tras navegar.
    setTimeout(() => setEnviando(false), 400);
  };

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-[#F8F9FA] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <MarcaSevenStay tamano="lg" className="text-neutral-900" />
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Panel del hotel</p>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-12px_rgba(17,24,39,0.12)]">
          {recuperando ? (
            <>
              <button
                type="button"
                onClick={() => cambiarModo(false)}
                className="-ml-2 mb-3 flex h-9 items-center gap-1 rounded-lg px-2 text-[13.5px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <ArrowLeft aria-hidden className="h-4 w-4" />
                Volver a iniciar sesión
              </button>
              <div className="mb-5">
                <h1 className="text-[17px] font-semibold text-neutral-900">Recuperar contraseña</h1>
                <p className="text-[13px] text-neutral-500">Te enviamos un enlace para crear una contraseña nueva.</p>
              </div>
              {enlaceEnviado ? (
                <div role="status" className="flex gap-3 rounded-xl bg-emerald-50 px-4 py-3.5 text-[14px] leading-relaxed text-emerald-900">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>
                    Si <strong className="font-semibold">{correo.trim()}</strong> tiene acceso al panel, te llegará un correo con el enlace en unos minutos.
                    Revisa también la carpeta de spam.
                  </p>
                </div>
              ) : (
                <form onSubmit={enviarEnlace} noValidate className="flex flex-col gap-3.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-700">Correo electrónico</span>
                    <span className="relative">
                      <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="email"
                        autoComplete="username"
                        value={correo}
                        onChange={(e) => {
                          setCorreo(e.target.value);
                          setError(null);
                        }}
                        placeholder="recepcion@hotel.com"
                        className={CAMPO}
                      />
                    </span>
                  </label>
                  {error && (
                    <p role="alert" className="text-[13px] font-medium text-rose-600">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={enviando}
                    className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white transition-transform duration-300 ${EASE} hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70`}
                  >
                    {enviando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                    {enviando ? 'Enviando…' : 'Enviar enlace'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
          <div className="mb-6">
            <h1 className="text-[17px] font-semibold text-neutral-900">Iniciar sesión</h1>
            <p className="text-[13px] text-neutral-500">Entra con el usuario que te dio tu hotel</p>
          </div>

          <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">Correo electrónico</span>
              <span className="relative">
                <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  autoComplete="username"
                  value={correo}
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    setError(null);
                  }}
                  placeholder="recepcion@hotel.com"
                  className={CAMPO}
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">Contraseña</span>
              <span className="relative">
                <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type={verClave ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => {
                    setClave(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  className={`${CAMPO} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-neutral-400 hover:text-neutral-700"
                >
                  {verClave ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="text-[13px] font-medium text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white transition-transform duration-300 ${EASE} hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70`}
            >
              {enviando ? (
                <>
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => cambiarModo(true)}
              className="mx-auto h-10 px-2 text-[13.5px] font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-[3px] hover:text-neutral-900"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-neutral-400">
          ¿No tienes usuario? Pídelo a la gerencia de tu hotel o a Seven Stay.
        </p>
      </div>
    </main>
  );
}
