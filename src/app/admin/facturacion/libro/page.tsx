'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import BarraImprimir from '@/components/admin/facturacion/BarraImprimir';
import { fechaLarga } from '@/components/admin/facturacion/Documentos';
import { ESTADOS_FACTURA } from '@/components/admin/facturacion/TabFacturas';
import { importesLibro } from '@/components/admin/facturacion/TabReportes';
import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError } from '@/components/admin/ui';
import MarcaSevenStay from '@/components/MarcaSevenStay';
import type { ConfigFiscal, ReporteFiscal } from '@/lib/admin/tipos';
import { lempiras } from '@/lib/facturacion/tarifas';

/** Libro de Ventas del periodo, para el contador (declaración mensual de ISV). */
export default function LibroVentasPage() {
  const params = useSearchParams();
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const { llamar } = useAdmin();
  const [r, setR] = useState<ReporteFiscal | null>(null);
  const [emisor, setEmisor] = useState<ConfigFiscal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([llamar('reporteFiscal', { desde, hasta }), llamar('configFiscal', null)]).then(
      ([rep, conf]) => {
        if (!vivo) return;
        setR(rep);
        setEmisor(conf.config);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, desde, hasta]);

  useEffect(() => {
    if (r) document.title = `Libro de Ventas ${r.desde} a ${r.hasta}`;
  }, [r]);

  if (error) return <AvisoError mensaje={error} />;
  if (!r || !emisor) return <Loader2 aria-label="Cargando" className="mx-auto mt-20 h-6 w-6 animate-spin text-neutral-400" />;

  const t = r.facturas.reduce(
    (a, f) => {
      const i = importesLibro(f);
      return { exento: a.exento + i.exento, gravado: a.gravado + i.gravado, isv: a.isv + i.isv, total: a.total + i.total, retencion: a.retencion + i.retencion };
    },
    { exento: 0, gravado: 0, isv: 0, total: 0, retencion: 0 },
  );

  return (
    <main>
      <style>{'@page { size: letter landscape; margin: 10mm; }'}</style>
      <BarraImprimir titulo="Libro de Ventas" />
      <article className="mx-auto w-full max-w-[1056px] bg-white p-8 text-neutral-900 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.25)] print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-neutral-900 pb-3">
          <div>
            <MarcaSevenStay tamano="md" />
            <p className="mt-1 text-[13px] font-extrabold uppercase tracking-[0.06em]">«{emisor.denominacion}» · {emisor.nombre_legal}</p>
            <p className="text-[11.5px] text-neutral-600">RTN {emisor.rtn || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[18px] font-black tracking-[0.1em]">LIBRO DE VENTAS</p>
            <p className="text-[12px] text-neutral-600">
              Del {fechaLarga(r.desde)} al {fechaLarga(r.hasta)}
            </p>
          </div>
        </header>
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-900 text-white">
              {['Fecha', 'No. Factura', 'RTN Cliente', 'Cliente', 'Exento', 'Gravado 15%', 'ISV 15%', 'Total', 'Retenciones', 'Estado'].map((h, i) => (
                <th key={h} className={`px-2 py-1.5 font-semibold ${i >= 4 && i <= 8 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.facturas.map((f) => {
              const i = importesLibro(f);
              return (
                <tr key={f.id} className="border-b border-neutral-200">
                  <td className="px-2 py-1 tabular-nums">{fechaLarga(f.fecha_emision)}</td>
                  <td className="px-2 py-1 font-mono">{f.numero}</td>
                  <td className="px-2 py-1 font-mono">{f.cliente_rtn || 'C. final'}</td>
                  <td className="px-2 py-1">{f.cliente_nombre}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{lempiras(i.exento)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{lempiras(i.gravado)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{lempiras(i.isv)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{lempiras(i.total)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{lempiras(i.retencion)}</td>
                  <td className="px-2 py-1 font-semibold uppercase">{ESTADOS_FACTURA[f.estado].texto}</td>
                </tr>
              );
            })}
            <tr className="bg-neutral-100 font-bold">
              <td className="px-2 py-1.5" colSpan={4}>
                Totales ({r.facturas.length} documentos)
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{lempiras(t.exento)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{lempiras(t.gravado)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{lempiras(t.isv)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{lempiras(t.total)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{lempiras(t.retencion)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[10.5px] text-neutral-500">Las facturas anuladas se listan con importes en cero para la auditoría del correlativo.</p>
      </article>
    </main>
  );
}
