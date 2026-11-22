'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';

import LogoHotel from '@/components/LogoHotel';
import MarcaSevenStay from '@/components/MarcaSevenStay';
import type { Habitacion, Hotel } from '@/types/sevenstay';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

/**
 * Vista previa de la placa física de una habitación, lista para imprimir.
 * Se pinta en un portal fuera del panel: al imprimir, el panel se oculta
 * (`print:hidden`) y solo sale la placa.
 *
 * RESERVADO PARA EL PANEL INTERNO DE SEVEN STAY: las placas QR/NFC las genera
 * y administra el equipo de Seven Stay, no el hotel. El panel del hotel
 * (/panel) no lo usa a propósito; junto con `cambiarEstadoPlaca` del contexto
 * queda listo para cuando se construya ese panel interno.
 */
export default function ModalPlacaQR({ hotel, habitacion, onCerrar }: { hotel: Hotel; habitacion: Habitacion; onCerrar: () => void }) {
  const url = `${window.location.origin}/p/${encodeURIComponent(habitacion.codigo_placa)}`;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })
      .then((dataUrl) => vigente && setQr(dataUrl))
      .catch(() => vigente && setQr(null));
    return () => {
      vigente = false;
    };
  }, [url]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [onCerrar]);

  return createPortal(
    <div
      style={FUENTE}
      role="dialog"
      aria-modal="true"
      aria-label={`Placa QR de la habitación ${habitacion.numero}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0"
    >
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 print:hidden" />

      <div className="relative flex max-h-full flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-[#F1F2F4] p-5 shadow-2xl print:max-h-none print:overflow-visible print:bg-white print:p-0 print:shadow-none">
        {/* Placa física */}
        <article className="flex w-[320px] flex-col items-center rounded-[28px] border border-black/[0.08] bg-white px-7 pb-5 pt-6 text-center text-neutral-900 shadow-[0_12px_32px_-12px_rgba(17,24,39,0.25)] print:mx-auto print:mt-10 print:shadow-none">
          {/* Si el hotel aún no tiene logo, no se pinta nada (un src vacío recargaría la página). */}
          <LogoHotel src={hotel.logo_url} className="h-12 w-[72px] object-contain" />
          <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.14em] text-neutral-500">{hotel.nombre}</p>
          <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Habitación</p>
          <p className="text-[48px] font-bold leading-none tracking-[-0.02em]">{habitacion.numero}</p>

          <div className="mt-4 flex h-[180px] w-[180px] items-center justify-center rounded-2xl border border-black/[0.06] p-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR generado como data URL
              <img src={qr} alt={`Código QR hacia ${url}`} className="h-full w-full" />
            ) : (
              <span className="text-[12px] text-neutral-400">Generando QR…</span>
            )}
          </div>

          <p className="mt-4 text-[15px] font-semibold leading-snug">Escanea para Wi-Fi, Limpieza y Tours</p>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">Scan for Wi-Fi, Housekeeping &amp; Tours</p>

          <div className="mt-4 flex w-full items-center justify-between border-t border-neutral-100 pt-3 text-neutral-400">
            <span className="font-mono text-[11px] tracking-wider">PLACA {habitacion.codigo_placa}</span>
            <MarcaSevenStay tamano="sm" />
          </div>
        </article>

        <p className="max-w-[320px] break-all text-center font-mono text-[11.5px] text-neutral-500 print:hidden">{url}</p>

        <div className="flex w-full gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!qr}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[14.5px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            <Printer aria-hidden className="h-4 w-4" />
            Imprimir placa
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-black/[0.1] bg-white px-4 text-[14.5px] font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <X aria-hidden className="h-4 w-4" />
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
