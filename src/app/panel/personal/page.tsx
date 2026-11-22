'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, Plus, Trash2, UserRound } from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import { PUESTOS } from '@/components/panel/ticketPanel';
import { useStay, type NuevoPersonal } from '@/context/StayContext';
import type { PersonalOperativo } from '@/types/sevenstay';

const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

const PUESTOS_ALTA: NuevoPersonal['rol'][] = ['ama_de_llaves', 'mantenimiento', 'recepcion'];

/** "50499001111" → "+504 9900-1111" */
function formatoTelefono(numero: string): string {
  const d = numero.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('504') && d.length === 11) return `+504 ${d.slice(3, 7)}-${d.slice(7)}`;
  return `+${d}`;
}

/** Interruptor accesible (role="switch"). */
function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambiar}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? 'bg-emerald-500' : 'bg-neutral-300'}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${activo ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

/**
 * Personal del hotel (solo Supervisor / Gerente; el cascarón bloquea a recepción).
 * Aquí se da de alta al personal operativo para poder asignarle solicitudes.
 * Quien entra al panel tiene usuario: esas cuentas las crea Seven Stay / Supabase.
 */
export default function PersonalPage() {
  const { personal, toggleTurnoPersonal, agregarPersonal, eliminarPersonal } = useStay();
  const { confirmar, dialogo } = useConfirmacion();
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<NuevoPersonal['rol']>('ama_de_llaves');
  const [telefono, setTelefono] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const digitos = telefono.replace(/\D/g, '');
  const errorNombre = nombre.trim() === '' ? 'Escribe el nombre.' : undefined;
  const errorTelefono = digitos && (digitos.length < 8 || digitos.length > 15) ? 'Escribe un número válido, ej. +504 9999-0000.' : undefined;

  const ordenado = [...personal].sort(
    (a, b) => Number(b.en_turno) - Number(a.en_turno) || a.nombre.localeCompare(b.nombre),
  );
  const enTurno = personal.filter((p) => p.en_turno).length;

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorNombre || errorTelefono || guardando) return;
    setGuardando(true);
    const ok = await agregarPersonal({
      nombre: nombre.trim().slice(0, 80),
      rol,
      // Sin código de país se asume Honduras (+504).
      telefono_whatsapp: digitos && digitos.length === 8 ? `504${digitos}` : digitos,
    });
    setGuardando(false);
    if (!ok) return;
    setNombre('');
    setTelefono('');
    setIntentado(false);
  };

  const quitar = async (persona: PersonalOperativo) => {
    const ok = await confirmar({
      titulo: `¿Quitar a ${persona.nombre} del equipo?`,
      mensaje: 'Ya no aparecerá para asignarle solicitudes. Las que atendió conservan su nombre en el historial.',
      textoConfirmar: 'Quitar del equipo',
      tono: 'peligro',
    });
    if (ok !== false) await eliminarPersonal(persona.id);
  };

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Personal</h1>
        <p className="mt-1 text-[15px] text-neutral-500">
          A quién se le pueden asignar solicitudes · {enTurno} en turno de {personal.length}
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Equipo */}
        <section aria-label="Equipo del hotel" className="rounded-2xl border border-black/[0.06] bg-white">
          {ordenado.length === 0 ? (
            <p className="px-6 py-16 text-center text-[15px] text-neutral-500">Todavía no hay nadie en el equipo.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {ordenado.map((persona) => (
                <li key={persona.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4">
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                      persona.en_turno ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[16.5px] font-semibold text-neutral-900">
                      {persona.nombre}
                      {persona.con_usuario && (
                        <span
                          title="Entra al panel con su usuario"
                          className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[12px] font-bold text-sky-700"
                        >
                          <KeyRound aria-hidden className="h-3 w-3" />
                          PANEL
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[14px] text-neutral-500">
                      {PUESTOS[persona.rol]}
                      {persona.telefono_whatsapp && <span className="tabular-nums"> · {formatoTelefono(persona.telefono_whatsapp)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-[14px] font-medium ${persona.en_turno ? 'text-emerald-700' : 'text-neutral-400'}`}>
                      {persona.en_turno ? 'En turno' : 'Libre'}
                    </span>
                    <Interruptor
                      activo={persona.en_turno}
                      onCambiar={() => void toggleTurnoPersonal(persona.id)}
                      etiqueta={`${persona.nombre} en turno`}
                    />
                    {persona.con_usuario ? (
                      <span className="w-10" aria-hidden />
                    ) : (
                      <button
                        type="button"
                        onClick={() => quitar(persona)}
                        aria-label={`Quitar a ${persona.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Alta */}
        <div className="flex flex-col gap-4">
          <form onSubmit={agregar} noValidate className="flex flex-col rounded-2xl border border-black/[0.06] bg-white">
            <div className="border-b border-neutral-100 px-6 py-5">
              <h2 className="text-[19px] font-bold text-neutral-900">Agregar al equipo</h2>
              <p className="mt-0.5 text-[14px] text-neutral-500">Para asignarle solicitudes desde el Centro de Control.</p>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-neutral-700">Nombre</span>
                <input
                  value={nombre}
                  maxLength={80}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Ana Mejía"
                  aria-invalid={intentado && Boolean(errorNombre)}
                  className={`${INPUT} ${intentado && errorNombre ? 'border-rose-400' : ''}`}
                />
                {intentado && errorNombre && <span className="text-[13px] font-medium text-rose-600">{errorNombre}</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-neutral-700">Puesto</span>
                <select value={rol} onChange={(e) => setRol(e.target.value as NuevoPersonal['rol'])} className={INPUT}>
                  {PUESTOS_ALTA.map((p) => (
                    <option key={p} value={p}>
                      {PUESTOS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-neutral-700">WhatsApp (opcional)</span>
                <input
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+504 9999-0000"
                  aria-invalid={intentado && Boolean(errorTelefono)}
                  className={`${INPUT} tabular-nums ${intentado && errorTelefono ? 'border-rose-400' : ''}`}
                />
                {intentado && errorTelefono ? (
                  <span className="text-[13px] font-medium text-rose-600">{errorTelefono}</span>
                ) : (
                  <span className="text-[12.5px] text-neutral-400">Para contactarle por WhatsApp si hace falta.</span>
                )}
              </label>
            </div>
            <div className="flex justify-end border-t border-neutral-100 px-6 py-4">
              <button
                type="submit"
                disabled={guardando}
                className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {guardando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Plus aria-hidden className="h-4 w-4" />}
                Agregar
              </button>
            </div>
          </form>

          <p className="rounded-2xl bg-white/70 px-5 py-4 text-[14px] leading-relaxed text-neutral-500 ring-1 ring-black/[0.06]">
            <strong className="font-semibold text-neutral-700">¿Alguien necesita entrar al panel?</strong> Las cuentas con usuario (etiqueta
            «PANEL») las crea Seven Stay. Pídelas por WhatsApp con el nombre, correo y puesto de la persona.
          </p>
        </div>
      </div>

      {dialogo}
    </main>
  );
}
