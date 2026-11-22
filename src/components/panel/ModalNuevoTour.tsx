'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Languages, Loader2, X } from 'lucide-react';

import type { NuevoCatalogoItem } from '@/context/StayContext';
import { traducirAlIngles } from '@/lib/traduccion';
import type { Moneda } from '@/types/sevenstay';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };
const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

type Borrador = {
  titulo: string;
  descripcion: string;
  horario: string;
  precio: string;
  moneda: Moneda;
  whatsapp: string;
};

const VACIO: Borrador = { titulo: '', descripcion: '', horario: '', precio: '', moneda: 'USD', whatsapp: '' };

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold text-neutral-700">{etiqueta}</span>
      {children}
      {error && <span className="text-[12.5px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

/**
 * RESERVADO PARA EL PANEL INTERNO DE SEVEN STAY: los tours los opera, cobra y
 * gestiona Seven Stay, no el hotel. El panel del hotel (/panel) no lo usa.
 *
 * Alta de un tour. El hotel escribe solo en español: al guardar, 7Stay traduce
 * título, descripción y horario al inglés para los huéspedes que usan el
 * portal en ese idioma. `traducido` avisa al padre si la traducción funcionó.
 */
export default function ModalNuevoTour({
  onCerrar,
  onGuardar,
}: {
  onCerrar: () => void;
  onGuardar: (datos: NuevoCatalogoItem, traducido: boolean) => void;
}) {
  const [b, setB] = useState<Borrador>(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [traduciendo, setTraduciendo] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !traduciendo && onCerrar();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [onCerrar, traduciendo]);

  const precio = Number(b.precio.replace(',', '.'));
  const telefono = b.whatsapp.replace(/\D/g, '');
  const errores: Partial<Record<keyof Borrador, string>> = {};
  if (!b.titulo.trim()) errores.titulo = 'Obligatorio';
  if (!b.descripcion.trim()) errores.descripcion = 'Obligatorio';
  if (!b.horario.trim()) errores.horario = 'Obligatorio';
  if (!(precio > 0)) errores.precio = 'Escribe un precio mayor a 0';
  if (telefono.length < 8) errores.whatsapp = 'Número con código de país, ej. 504 9999-0000';
  const err = (c: keyof Borrador) => (intentado ? errores[c] : undefined);

  const cambiar = (c: keyof Borrador, v: string) => setB((prev) => ({ ...prev, [c]: v }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.keys(errores).length > 0 || traduciendo) return;

    const titulo = b.titulo.trim();
    const descripcion = b.descripcion.trim();
    const horario = b.horario.trim();

    setTraduciendo(true);
    const ingles = await traducirAlIngles([titulo, descripcion, horario]);
    setTraduciendo(false);

    onGuardar(
      {
        tipo: 'tour',
        propio: false,
        titulo_es: titulo,
        descripcion_es: descripcion,
        horario_o_duracion_es: horario,
        // Sin traductor disponible, el huésped en inglés ve el texto en español.
        titulo_en: ingles?.[0] || titulo,
        descripcion_en: ingles?.[1] || descripcion,
        horario_o_duracion_en: ingles?.[2] || horario,
        precio,
        moneda: b.moneda,
        activo: true,
        imagen_url: null,
        whatsapp_destino: telefono,
        categoria_id: null,
      },
      ingles !== null,
    );
  };

  return createPortal(
    <div style={FUENTE} role="dialog" aria-modal="true" aria-labelledby="titulo-nuevo-tour" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => !traduciendo && onCerrar()} className="absolute inset-0" />
      <form onSubmit={guardar} noValidate className="relative flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 id="titulo-nuevo-tour" className="text-[19px] font-bold text-neutral-900">
            Nuevo tour
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={traduciendo}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <p className="flex items-start gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-[14px] leading-relaxed text-sky-900">
            <Languages aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            Escribe en español. 7Stay lo traduce automáticamente al inglés para los huéspedes que usan el portal en ese idioma.
          </p>
          <Campo etiqueta="Título" error={err('titulo')}>
            <input value={b.titulo} onChange={(e) => cambiar('titulo', e.target.value)} placeholder="Ej. Canopy en Pico Bonito" className={INPUT} />
          </Campo>
          <Campo etiqueta="Descripción" error={err('descripcion')}>
            <textarea
              rows={3}
              value={b.descripcion}
              onChange={(e) => cambiar('descripcion', e.target.value)}
              placeholder="Qué incluye, punto de salida, qué llevar…"
              className={`${INPUT} h-auto resize-none py-3 leading-relaxed`}
            />
          </Campo>
          <Campo etiqueta="Horario o duración" error={err('horario')}>
            <input value={b.horario} onChange={(e) => cambiar('horario', e.target.value)} placeholder="Ej. Salida 9:00 AM · 3 horas" className={INPUT} />
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Precio por persona" error={err('precio')}>
              <div className="flex gap-2">
                <input inputMode="decimal" value={b.precio} onChange={(e) => cambiar('precio', e.target.value)} placeholder="55" className={INPUT} />
                <select value={b.moneda} onChange={(e) => cambiar('moneda', e.target.value)} aria-label="Moneda" className={`${INPUT} w-28 shrink-0`}>
                  <option value="USD">USD</option>
                  <option value="HNL">HNL</option>
                </select>
              </div>
            </Campo>
            <Campo etiqueta="WhatsApp del operador" error={err('whatsapp')}>
              <input inputMode="tel" value={b.whatsapp} onChange={(e) => cambiar('whatsapp', e.target.value)} placeholder="504 9999-0000" className={INPUT} />
            </Campo>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onCerrar}
            disabled={traduciendo}
            className="h-11 rounded-xl px-4 text-[14.5px] font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={traduciendo}
            className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[14.5px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {traduciendo && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {traduciendo ? 'Traduciendo…' : 'Agregar tour'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
