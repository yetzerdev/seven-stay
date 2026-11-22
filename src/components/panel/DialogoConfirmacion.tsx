'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  /** "peligro" pinta el botón en rojo (acciones que cierran o rechazan algo). */
  tono?: 'normal' | 'peligro';
  /** Pide un motivo (texto libre) antes de confirmar. */
  motivo?: { etiqueta: string; placeholder?: string; obligatorio?: boolean; debeCoincidir?: string };
}

/**
 * Confirmaciones del panel sin `confirm()` del navegador:
 *   const { confirmar, dialogo } = useConfirmacion();
 *   const motivo = await confirmar({...}); // false si se canceló; el motivo ('' si no se pidió) si se aceptó
 *   ...y renderizar {dialogo}.
 */
export function useConfirmacion() {
  const [pendiente, setPendiente] = useState<{ opciones: OpcionesConfirmacion; resolver: (r: string | false) => void } | null>(null);

  const confirmar = useCallback(
    (opciones: OpcionesConfirmacion) => new Promise<string | false>((resolver) => setPendiente({ opciones, resolver })),
    [],
  );

  const responder = useCallback(
    (respuesta: string | false) => {
      pendiente?.resolver(respuesta);
      setPendiente(null);
    },
    [pendiente],
  );

  const dialogo = pendiente ? <Dialogo opciones={pendiente.opciones} onResponder={responder} /> : null;
  return { confirmar, dialogo };
}

function Dialogo({ opciones, onResponder }: { opciones: OpcionesConfirmacion; onResponder: (r: string | false) => void }) {
  const [motivo, setMotivo] = useState('');
  const botonConfirmar = useRef<HTMLButtonElement>(null);
  const campoMotivo = useRef<HTMLTextAreaElement>(null);
  const peligro = opciones.tono === 'peligro';
  const faltaMotivo =
    (Boolean(opciones.motivo?.obligatorio) && motivo.trim() === '') ||
    (opciones.motivo?.debeCoincidir !== undefined && motivo.trim() !== opciones.motivo.debeCoincidir.trim());

  useEffect(() => {
    (opciones.motivo ? campoMotivo.current : botonConfirmar.current)?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onResponder(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [opciones.motivo, onResponder]);

  return createPortal(
    <div style={FUENTE} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cancelar" onClick={() => onResponder(false)} className="absolute inset-0" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmacion"
        className="relative w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${peligro ? 'bg-rose-100 text-rose-600' : 'bg-neutral-100 text-neutral-700'}`}>
            {peligro ? <AlertTriangle aria-hidden className="h-5 w-5" /> : <HelpCircle aria-hidden className="h-5 w-5" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="titulo-confirmacion" className="text-[18px] font-bold text-neutral-900">
              {opciones.titulo}
            </h2>
            <div className="mt-1.5 text-[15px] leading-relaxed text-neutral-600">{opciones.mensaje}</div>
          </div>
        </div>

        {opciones.motivo && (
          <label className="mt-5 block">
            <span className="text-[14px] font-semibold text-neutral-700">
              {opciones.motivo.etiqueta}
              {!opciones.motivo.obligatorio && <span className="font-normal text-neutral-400"> (opcional)</span>}
            </span>
            <textarea
              ref={campoMotivo}
              rows={2}
              maxLength={160}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={opciones.motivo.placeholder}
              className="mt-1.5 block w-full resize-none rounded-xl border border-black/[0.1] px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            />
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onResponder(false)}
            className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            ref={botonConfirmar}
            type="button"
            disabled={faltaMotivo}
            onClick={() => onResponder(motivo.trim())}
            className={`h-11 rounded-xl px-5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35 ${
              peligro ? 'bg-rose-600 hover:bg-rose-700' : 'bg-neutral-900 hover:bg-neutral-800'
            }`}
          >
            {opciones.textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
