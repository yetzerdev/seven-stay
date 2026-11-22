'use client';

import { useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Loader2, Mail, MessageCircle, Trash2, UserPlus, Users, X } from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import type { DetalleHotel, RolUsuarioHotel, UsuarioHotel } from '@/lib/admin/tipos';

import { useAdmin } from './SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, EstadoPastilla, INPUT } from './ui';

const ROLES: { valor: RolUsuarioHotel; texto: string; ayuda: string }[] = [
  { valor: 'supervisor_gerente', texto: 'Supervisor / Gerente', ayuda: 'Todo el panel: configuración, menú, tours, personal y métricas.' },
  { valor: 'recepcion', texto: 'Recepción', ayuda: 'Centro de Control, habitaciones y menú.' },
];

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Nunca';

/** Muestra el enlace de acceso para mandarlo por WhatsApp o correo. */
function ModalEnlace({ enlace, persona, hotel, onCerrar }: { enlace: string; persona: UsuarioHotel | { nombre: string; correo: string }; hotel: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `Hola ${persona.nombre}, este es tu acceso al panel de ${hotel} en Seven Stay. Abre el enlace y crea tu contraseña (vence en 24 horas): ${enlace}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Enlace de acceso" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0" />
      <div className="relative w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-bold">Enlace de acceso para {persona.nombre}</h2>
            <p className="mt-1 text-[14px] text-neutral-500">
              Mándaselo por WhatsApp o correo. Con él crea su contraseña y entra al panel. Vence en 24 horas y sirve una sola vez.
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 break-all rounded-xl bg-[#F8F9FA] px-4 py-3 font-mono text-[12px] text-neutral-600">{enlace}</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void copiar()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.1] text-[14.5px] font-semibold hover:bg-neutral-50">
            {copiado ? <Check aria-hidden className="h-4 w-4 text-emerald-600" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[14.5px] font-semibold text-white"
          >
            <MessageCircle aria-hidden className="h-4 w-4" />
            WhatsApp
          </a>
          {persona.correo && (
            <a
              href={`mailto:${persona.correo}?subject=${encodeURIComponent(`Tu acceso al panel de ${hotel}`)}&body=${encodeURIComponent(mensaje)}`}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white"
            >
              <Mail aria-hidden className="h-4 w-4" />
              Correo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PestanaUsuarios({ detalle, onCambio }: { detalle: DetalleHotel; onCambio: () => Promise<void> }) {
  const { llamar } = useAdmin();
  const { confirmar, dialogo } = useConfirmacion();
  const [form, setForm] = useState<{ nombre: string; correo: string; rol: RolUsuarioHotel }>({ nombre: '', correo: '', rol: 'supervisor_gerente' });
  const [intentado, setIntentado] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<{ enlace: string; persona: UsuarioHotel | { nombre: string; correo: string } } | null>(null);
  const { hotel, usuarios } = detalle;

  const errorNombre = form.nombre.trim() === '' ? 'Escribe su nombre.' : undefined;
  const errorCorreo = !/^\S+@\S+\.\S+$/.test(form.correo.trim()) ? 'Escribe un correo válido.' : undefined;

  const invitar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorNombre || errorCorreo || invitando) return;
    setInvitando(true);
    setError(null);
    try {
      const persona = { nombre: form.nombre.trim(), correo: form.correo.trim().toLowerCase() };
      const r = await llamar('invitarUsuario', { hotel_id: hotel.id, ...persona, rol: form.rol });
      await onCambio();
      setForm({ nombre: '', correo: '', rol: 'recepcion' });
      setIntentado(false);
      setEnlace({ enlace: r.enlace, persona });
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo invitar.');
    } finally {
      setInvitando(false);
    }
  };

  const ejecutar = async (id: string, accion: () => Promise<void>) => {
    setOcupado(id);
    setError(null);
    try {
      await accion();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar.');
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async (u: UsuarioHotel) => {
    const ok = await confirmar({
      titulo: `¿Quitar el acceso de ${u.nombre}?`,
      mensaje: 'Se borra su usuario: ya no podrá entrar al panel. Las solicitudes que atendió conservan su nombre en el historial.',
      textoConfirmar: 'Quitar acceso',
      tono: 'peligro',
    });
    if (ok === false) return;
    await ejecutar(u.id, async () => {
      await llamar('quitarUsuario', { staff_id: u.id });
      await onCambio();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={invitar} noValidate className="rounded-2xl border border-black/[0.06] bg-white p-6">
        <h2 className="text-[17px] font-bold">Dar acceso al panel</h2>
        <p className="mt-0.5 text-[14px] text-neutral-500">
          Se crea su usuario y te damos un enlace para mandárselo. El personal sin acceso al panel (ama de llaves, mantenimiento) lo agrega la gerencia desde «Personal».
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_220px_auto] md:items-start">
          <Campo etiqueta="Nombre" error={intentado ? errorNombre : undefined}>
            <input value={form.nombre} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={INPUT} />
          </Campo>
          <Campo etiqueta="Correo" error={intentado ? errorCorreo : undefined}>
            <input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} placeholder="gerencia@hotel.com" className={INPUT} />
          </Campo>
          <Campo etiqueta="Rol" ayuda={ROLES.find((r) => r.valor === form.rol)?.ayuda}>
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as RolUsuarioHotel }))} className={INPUT}>
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.texto}
                </option>
              ))}
            </select>
          </Campo>
          <button type="submit" disabled={invitando} className={`${BOTON_PRIMARIO} md:mt-[30px]`}>
            {invitando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <UserPlus aria-hidden className="h-4 w-4" />}
            Dar acceso
          </button>
        </div>
      </form>

      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <h2 className="border-b border-neutral-100 px-6 py-4 text-[17px] font-bold">
          {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'} del panel
        </h2>
        {usuarios.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Users aria-hidden className="h-7 w-7 text-neutral-400" />
            <p className="mt-3 max-w-[380px] text-[15px] text-neutral-500">Empieza por la gerencia: con su acceso, ellos configuran el hotel y agregan a su personal operativo.</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {usuarios.map((u) => (
              <li key={u.id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3.5 ${ocupado === u.id ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15.5px] font-semibold">
                    {u.nombre}
                    {!u.confirmado && <EstadoPastilla tono="ambar">Invitación pendiente</EstadoPastilla>}
                  </p>
                  <p className="text-[13.5px] text-neutral-500">
                    {u.correo ?? 'Sin correo'} · Último acceso: {fecha(u.ultimo_acceso)}
                  </p>
                </div>
                <select
                  value={u.rol}
                  disabled={ocupado !== null}
                  onChange={(e) =>
                    void ejecutar(u.id, async () => {
                      await llamar('cambiarRol', { staff_id: u.id, rol: e.target.value as RolUsuarioHotel });
                      await onCambio();
                    })
                  }
                  aria-label={`Rol de ${u.nombre}`}
                  className="h-10 rounded-lg border border-black/[0.1] bg-white px-2.5 text-[14px] font-medium outline-none focus:border-neutral-900"
                >
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.texto}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() =>
                    void ejecutar(u.id, async () => {
                      const r = await llamar('enlaceAcceso', { staff_id: u.id });
                      setEnlace({ enlace: r.enlace, persona: u });
                    })
                  }
                  title={u.confirmado ? 'Enlace para crear una contraseña nueva' : 'Volver a generar la invitación'}
                  className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-neutral-700 hover:bg-neutral-100"
                >
                  <KeyRound aria-hidden className="h-4 w-4" />
                  {u.confirmado ? 'Restablecer contraseña' : 'Reenviar invitación'}
                </button>
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => void quitar(u)}
                  aria-label={`Quitar el acceso de ${u.nombre}`}
                  title="Quitar acceso"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 aria-hidden className="h-[17px] w-[17px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {enlace && <ModalEnlace enlace={enlace.enlace} persona={enlace.persona} hotel={hotel.nombre} onCerrar={() => setEnlace(null)} />}
      {dialogo}
    </div>
  );
}
