'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Loader2, Printer } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO } from '@/components/admin/ui';
import MarcaSevenStay from '@/components/MarcaSevenStay';
import type { DetalleHotel } from '@/lib/admin/tipos';

interface Placa {
  numero: string;
  codigo: string;
  qr: string;
}

/**
 * Todas las placas activas del hotel en hojas para imprimir (4 por hoja carta).
 * Mismo diseño que la placa individual.
 */
export default function ImprimirPlacasPage() {
  const { id } = useParams<{ id: string }>();
  const { llamar } = useAdmin();
  const [hotel, setHotel] = useState<DetalleHotel['hotel'] | null>(null);
  const [placas, setPlacas] = useState<Placa[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const detalle = await llamar('hotel', { id });
      const activas = detalle.habitaciones.filter((h) => h.estado_placa === 'activa');
      const generadas = await Promise.all(
        activas.map(async (h) => {
          const url = `${window.location.origin}/p/${encodeURIComponent(h.codigo_placa)}`;
          const qr = await QRCode.toDataURL(url, { margin: 1, width: 500, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
          return { numero: h.numero, codigo: h.codigo_placa, qr };
        }),
      );
      if (!vivo) return;
      setHotel(detalle.hotel);
      setPlacas(generadas);
    })().catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [llamar, id]);

  if (error) return <AvisoError mensaje={error} />;
  if (!placas || !hotel) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 aria-label="Generando placas" className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <style>{'@page { size: letter; margin: 10mm; }'}</style>
      <header className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-[24px] font-bold">Placas de {hotel.nombre}</h1>
          <p className="text-[14.5px] text-neutral-500">
            {placas.length} placas activas · 4 por hoja carta. Recórtalas por la línea punteada.
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className={BOTON_PRIMARIO}>
          <Printer aria-hidden className="h-4 w-4" />
          Imprimir
        </button>
      </header>

      <div className="grid grid-cols-2 justify-items-center gap-6 print:gap-0">
        {placas.map((p) => (
          <article
            key={p.codigo}
            className="flex w-[300px] break-inside-avoid flex-col items-center rounded-[24px] border border-dashed border-neutral-300 bg-white px-6 pb-4 pt-5 text-center text-neutral-900 print:my-[6mm]"
          >
            {hotel.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- se imprime tal cual
              <img src={hotel.logo_url} alt="" className="h-11 w-[66px] object-contain" />
            )}
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">{hotel.nombre}</p>
            <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Habitación</p>
            <p className="text-[44px] font-bold leading-none tracking-[-0.02em]">{p.numero}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR generado como data URL */}
            <img src={p.qr} alt={`QR de la habitación ${p.numero}`} className="mt-3 h-[160px] w-[160px]" />
            <p className="mt-3 text-[14px] font-semibold leading-snug">Escanea para Wi-Fi, Limpieza y Tours</p>
            <p className="text-[12px] text-neutral-500">Scan for Wi-Fi, Housekeeping &amp; Tours</p>
            <div className="mt-3 flex w-full items-center justify-between border-t border-neutral-100 pt-2.5 text-neutral-400">
              <span className="font-mono text-[10.5px] tracking-wider">PLACA {p.codigo}</span>
              <MarcaSevenStay tamano="sm" />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
