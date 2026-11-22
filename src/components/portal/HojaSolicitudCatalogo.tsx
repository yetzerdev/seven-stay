'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info, Minus, Plus, X } from 'lucide-react';

import type { CatalogoItem, Idioma } from '@/types/sevenstay';

import { formatoPrecio, mensajeErrorEnvio } from './etiquetasTicket';
import PortadaCatalogo from './PortadaCatalogo';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const MAX_NOTA = 140;

/** Reglas y textos según se pida un tour (personas) o un plato (cantidad). */
const MODOS = {
  tour: {
    inicial: 2,
    maximo: 8,
    es: {
      cantidad: 'Personas',
      menos: 'Una persona menos',
      mas: 'Una persona más',
      unidad: 'por persona',
      placeholder: 'Ej. Para mañana por la mañana, 2 adultos',
      aviso: 'Experiencia operada por Seven Stay. Al enviar, el Agente Oficial de Seven Stay te atiende por WhatsApp para confirmar disponibilidad, cobrar en línea y emitir tu voucher.',
      avisoPropio: 'Tour del hotel. Al enviar, recepción confirma la disponibilidad contigo y el pago se hace en recepción.',
      confirmar: 'Enviar solicitud',
    },
    en: {
      cantidad: 'Guests',
      menos: 'One guest less',
      mas: 'One guest more',
      unidad: 'per person',
      placeholder: 'E.g., Tomorrow morning, 2 adults',
      aviso: 'Experience operated by Seven Stay. After sending, the Official Seven Stay Agent will assist you on WhatsApp to confirm availability, take secure online payment, and issue your voucher.',
      avisoPropio: 'Hotel tour. After sending, the front desk will confirm availability with you and payment is made at the front desk.',
      confirmar: 'Send request',
    },
  },
  menu: {
    inicial: 1,
    maximo: 10,
    es: {
      cantidad: 'Cantidad',
      menos: 'Uno menos',
      mas: 'Uno más',
      unidad: 'c/u',
      placeholder: 'Ej. Sin chile, por favor',
      aviso: 'Sin cobro en línea. El pago se coordina con recepción al entregar tu pedido en la habitación.',
      confirmar: 'Ordenar',
    },
    en: {
      cantidad: 'Quantity',
      menos: 'One less',
      mas: 'One more',
      unidad: 'each',
      placeholder: 'E.g., No chili, please',
      aviso: 'No online payment required. Payment is arranged with the front desk when your order is delivered to your room.',
      confirmar: 'Place order',
    },
  },
} as const;

const COMUNES = {
  es: { total: 'Total estimado', nota: 'Nota (opcional)', enviando: 'Enviando…', cerrar: 'Cerrar' },
  en: { total: 'Estimated total', nota: 'Note (optional)', enviando: 'Sending…', cerrar: 'Close' },
} as const;

/** Botón "−"/"+": círculo visible de 36 px dentro de un área táctil de 44×48 px. */
function BotonPaso({ etiqueta, activo, onClick, children }: { etiqueta: string; activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={!activo}
      onClick={onClick}
      className="flex h-12 w-11 items-center justify-center disabled:pointer-events-none"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90 ${
          activo ? 'bg-white text-neutral-900 shadow-sm' : 'bg-white/60 text-neutral-300'
        }`}
      >
        {children}
      </span>
    </button>
  );
}

interface Props {
  /** Ítem a pedir; `null` = hoja cerrada. */
  item: CatalogoItem | null;
  idioma: Idioma;
  enviando: boolean;
  /** Código del error de envío (ver mensajeErrorEnvio) o `null`. */
  error: string | null;
  onCerrar: () => void;
  onConfirmar: (cantidad: number, nota: string) => void;
}

/** Hoja inferior estilo iOS para reservar un tour o pedir un plato del menú. */
export default function HojaSolicitudCatalogo({ item, idioma, enviando, error, onCerrar, onConfirmar }: Props) {
  const abierta = item !== null;
  const [ultimo, setUltimo] = useState<CatalogoItem | null>(item);
  const [cantidad, setCantidad] = useState<number>(item ? MODOS[item.tipo].inicial : 1);
  const [nota, setNota] = useState('');
  const botonCerrar = useRef<HTMLButtonElement>(null);

  // Al abrir otro ítem se reinicia el formulario; al cerrar se conserva el
  // último para que la hoja no se vacíe mientras se desliza hacia abajo.
  if (item && item !== ultimo) {
    setUltimo(item);
    setCantidad(MODOS[item.tipo].inicial);
    setNota('');
  }
  const visible = item ?? ultimo;

  useEffect(() => {
    if (!abierta) return;
    botonCerrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abierta, onCerrar]);

  const c = COMUNES[idioma];

  return (
    <div
      inert={!abierta}
      aria-hidden={!abierta}
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300 ${
        abierta ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button type="button" tabIndex={-1} aria-label={c.cerrar} onClick={onCerrar} className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-hoja-catalogo"
        style={{ fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' }}
        className={`relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] transition-transform duration-500 ${EASE} ${
          abierta ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {visible &&
          (() => {
            const modo = MODOS[visible.tipo];
            const t = modo[idioma];
            return (
              <>
                <div className="relative">
                  <PortadaCatalogo item={visible} className="h-40" />
                  <span aria-hidden className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/80" />
                  <button
                    ref={botonCerrar}
                    type="button"
                    onClick={onCerrar}
                    aria-label={c.cerrar}
                    className="absolute right-1 top-1 flex h-12 w-12 items-center justify-center"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform active:scale-90">
                      <X aria-hidden className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                  </button>
                </div>

                <div className="px-5 pt-4">
                  <h2 id="titulo-hoja-catalogo" className="text-[18px] font-semibold leading-snug text-neutral-900">
                    {idioma === 'es' ? visible.titulo_es : visible.titulo_en}
                  </h2>
                  <p className="mt-0.5 text-[13.5px] text-neutral-500">
                    {formatoPrecio(visible.precio, visible.moneda)} {t.unidad}
                  </p>

                  {/* Cantidad / personas */}
                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-black/[0.05] bg-[#F8F9FA] py-1.5 pl-4 pr-1.5">
                    <span className="text-[14.5px] font-medium text-neutral-900">{t.cantidad}</span>
                    <div className="flex items-center">
                      <BotonPaso etiqueta={t.menos} activo={cantidad > 1} onClick={() => setCantidad((n) => Math.max(1, n - 1))}>
                        <Minus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
                      </BotonPaso>
                      <span aria-live="polite" className="w-6 text-center text-[16px] font-semibold tabular-nums text-neutral-900">
                        {cantidad}
                      </span>
                      <BotonPaso
                        etiqueta={t.mas}
                        activo={cantidad < modo.maximo}
                        onClick={() => setCantidad((n) => Math.min(modo.maximo, n + 1))}
                      >
                        <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
                      </BotonPaso>
                    </div>
                  </div>
                  <p className="mt-2 px-1 text-[13px] text-neutral-500">
                    {c.total}:{' '}
                    <span className="font-semibold text-neutral-900">{formatoPrecio(visible.precio * cantidad, visible.moneda)}</span>
                  </p>

                  {/* Nota */}
                  <div className="relative mt-3">
                    <label htmlFor="nota-catalogo" className="sr-only">
                      {c.nota}
                    </label>
                    <textarea
                      id="nota-catalogo"
                      rows={2}
                      maxLength={MAX_NOTA}
                      value={nota}
                      onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA))}
                      placeholder={t.placeholder}
                      className="block w-full resize-none rounded-2xl border border-black/[0.05] bg-[#F8F9FA] p-3.5 pb-7 text-[13.5px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300"
                    />
                    <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-3.5 text-[11px] tabular-nums text-neutral-400">
                      {nota.length}/{MAX_NOTA}
                    </span>
                  </div>

                  {/* Aviso sin pagos en línea */}
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-neutral-200/60 bg-neutral-100/80 p-3 text-[12px] leading-relaxed text-neutral-600">
                    <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    {'avisoPropio' in t && visible.propio ? t.avisoPropio : t.aviso}
                  </p>

                  {error && (
                    <p role="alert" className="mt-3 text-center text-[13px] font-medium text-rose-600">
                      {mensajeErrorEnvio(error, idioma)}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => onConfirmar(cantidad, nota)}
                    className={`mt-4 h-[50px] w-full rounded-full bg-neutral-900 text-[14px] font-medium text-white transition-[transform,opacity] duration-300 ${EASE} active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40`}
                  >
                    {enviando ? c.enviando : t.confirmar}
                  </button>
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
}
