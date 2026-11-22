'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import MarcaSevenStay from '@/components/MarcaSevenStay';

const CAMPO =
  'h-12 w-full rounded-xl border border-black/[0.08] bg-white pl-10 pr-3 text-[14.5px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

/** Login del panel interno de Seven Stay. */
export default function LoginAdminPage() {
  const router = useRouter();
  const { iniciarSesion } = useAdmin();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!/^\S+@\S+\.\S+$/.test(correo.trim()) || !clave) {
      setError('Escribe tu correo y contraseña.');
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
    router.replace('/admin');
    setTimeout(() => setEnviando(false), 400);
  };

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-neutral-900 px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center text-white">
          <MarcaSevenStay tamano="lg" />
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/50">Panel interno</p>
        </div>
        <form onSubmit={entrar} noValidate className="flex flex-col gap-3.5 rounded-2xl bg-white p-6">
          <h1 className="text-[17px] font-semibold text-neutral-900">Equipo Seven Stay</h1>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">Correo</span>
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
                className={CAMPO}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">Contraseña</span>
            <span className="relative">
              <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="password"
                autoComplete="current-password"
                value={clave}
                onChange={(e) => {
                  setClave(e.target.value);
                  setError(null);
                }}
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
            className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-70"
          >
            {enviando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            {enviando ? 'Entrando…' : 'Entrar'}
            {!enviando && <ArrowRight aria-hidden className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
