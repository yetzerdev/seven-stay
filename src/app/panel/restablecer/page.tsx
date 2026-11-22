'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';

import MarcaSevenStay from '@/components/MarcaSevenStay';
import { mensajeDe } from '@/context/StayContext';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const CAMPO =
  'h-12 w-full rounded-xl border border-black/[0.08] bg-white pl-10 pr-12 text-[14.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';
const MINIMO = 8;

type Estado = 'verificando' | 'listo' | 'invalido';
type Tipo = 'recovery' | 'invite';

/**
 * Llega desde el enlace de "Recuperar contraseña" o desde la invitación que
 * genera Seven Stay al crear un usuario. Supabase redirige aquí con la sesión en
 * el fragmento de la URL (#access_token=…&type=recovery|invite); se abre esa
 * sesión y la persona elige su contraseña.
 */
export default function RestablecerClavePage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [tipo, setTipo] = useState<Tipo>('recovery');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const abrir = async () => {
      if (!supabaseConfigurado) throw new Error('Supabase no está configurado.');
      const fragmento = new URLSearchParams(window.location.hash.slice(1));
      // El enlace ya no sirve (vencido o usado): Supabase lo informa en el fragmento.
      const errorEnlace = fragmento.get('error_description');
      if (errorEnlace) throw new Error(/expired|invalid/i.test(errorEnlace) ? 'El enlace venció o ya se usó.' : errorEnlace);
      const access_token = fragmento.get('access_token');
      const refresh_token = fragmento.get('refresh_token');
      const tipoEnlace = fragmento.get('type');
      if (!access_token || !refresh_token || (tipoEnlace !== 'recovery' && tipoEnlace !== 'invite')) throw new Error('Este enlace no es válido.');
      const { error } = await clientePanel().auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      // Se quitan los tokens de la barra de direcciones (y del historial).
      window.history.replaceState(null, '', window.location.pathname);
      return tipoEnlace as Tipo;
    };
    abrir().then(
      (t) => {
        if (!vivo) return;
        setTipo(t);
        setEstado('listo');
      },
      (fallo) => {
        if (!vivo) return;
        setMotivo(mensajeDe(fallo));
        setEstado('invalido');
      },
    );
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    if (clave.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (clave !== repetir) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setGuardando(true);
    const { error: fallo } = await clientePanel().auth.updateUser({ password: clave });
    if (fallo) {
      setGuardando(false);
      const m = mensajeDe(fallo);
      setError(/different from the old/i.test(m) ? 'Usa una contraseña distinta a la anterior.' : /weak|short/i.test(m) ? 'Esa contraseña es muy débil. Usa una más larga.' : m);
      return;
    }
    // La sesión ya está abierta con la contraseña nueva: directo al panel.
    router.replace('/panel');
  };

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-[#F8F9FA] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <MarcaSevenStay tamano="lg" className="text-neutral-900" />
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Panel del hotel</p>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-12px_rgba(17,24,39,0.12)]">
          {estado === 'verificando' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 aria-label="Verificando enlace" className="h-6 w-6 animate-spin text-neutral-400" />
              <p className="mt-3 text-[14px] text-neutral-500">Verificando el enlace…</p>
            </div>
          )}

          {estado === 'invalido' && (
            <div className="flex flex-col items-center py-4 text-center">
              <AlertTriangle aria-hidden className="h-7 w-7 text-amber-500" />
              <h1 className="mt-3 text-[17px] font-semibold text-neutral-900">No pudimos abrir el enlace</h1>
              <p className="mt-1 text-[14px] text-neutral-500">{motivo} Pide uno nuevo desde «¿Olvidaste tu contraseña?» o a Seven Stay.</p>
              <Link
                href="/panel/login"
                className="mt-5 flex h-11 items-center rounded-xl bg-neutral-900 px-5 text-[14.5px] font-semibold text-white hover:bg-neutral-800"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {estado === 'listo' && (
            <>
              <div className="mb-6">
                <h1 className="text-[17px] font-semibold text-neutral-900">
                  {tipo === 'invite' ? 'Bienvenido al panel de tu hotel' : 'Crea tu contraseña nueva'}
                </h1>
                <p className="text-[13px] text-neutral-500">
                  {tipo === 'invite' ? 'Crea tu contraseña para entrar. ' : ''}Mínimo {MINIMO} caracteres. Al guardar entras directo al panel.
                </p>
              </div>
              <form onSubmit={guardar} noValidate className="flex flex-col gap-3.5">
                {[
                  { etiqueta: 'Contraseña nueva', valor: clave, cambiar: setClave, auto: 'new-password' },
                  { etiqueta: 'Repite la contraseña', valor: repetir, cambiar: setRepetir, auto: 'new-password' },
                ].map((campo, i) => (
                  <label key={campo.etiqueta} className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-700">{campo.etiqueta}</span>
                    <span className="relative">
                      <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        type={verClave ? 'text' : 'password'}
                        autoComplete={campo.auto}
                        value={campo.valor}
                        onChange={(e) => {
                          campo.cambiar(e.target.value);
                          setError(null);
                        }}
                        className={CAMPO}
                      />
                      {i === 0 && (
                        <button
                          type="button"
                          onClick={() => setVerClave((v) => !v)}
                          aria-label={verClave ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                          className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-neutral-400 hover:text-neutral-700"
                        >
                          {verClave ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                        </button>
                      )}
                    </span>
                  </label>
                ))}
                {error && (
                  <p role="alert" className="text-[13px] font-medium text-rose-600">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={guardando}
                  className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white transition-transform duration-300 ${EASE} hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70`}
                >
                  {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                  {guardando ? 'Guardando…' : 'Guardar y entrar'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
