'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Loader2 } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, INPUT } from '@/components/admin/ui';
import type { Factura, ReporteFiscal } from '@/lib/admin/tipos';
import { lempiras } from '@/lib/facturacion/tarifas';

import { fechaLarga } from './Documentos';
import { ESTADOS_FACTURA, rangoMes } from './TabFacturas';

/** Una anulada se lista (auditoría SAR) pero con importes en cero. */
export const importesLibro = (f: Factura) =>
  f.estado === 'anulada'
    ? { exento: 0, gravado: 0, isv: 0, total: 0, retencion: 0 }
    : { exento: f.importe_exento + f.importe_exonerado, gravado: f.importe_gravado, isv: f.isv, total: f.total, retencion: f.retencion };

/** CSV del Libro de Ventas (UTF-8 con BOM para que Excel respete los acentos). */
function descargarCsv(r: ReporteFiscal) {
  const celda = (v: string | number) => {
    const t = String(v);
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas = [
    ['Fecha', 'No. Factura', 'RTN Cliente', 'Cliente', 'Importe Exento', 'Importe Gravado 15%', 'ISV 15%', 'Total Facturado', 'Retenciones', 'Estado'],
    ...r.facturas.map((f) => {
      const i = importesLibro(f);
      return [f.fecha_emision, f.numero, f.cliente_rtn || 'Consumidor final', f.cliente_nombre, i.exento.toFixed(2), i.gravado.toFixed(2), i.isv.toFixed(2), i.total.toFixed(2), i.retencion.toFixed(2), ESTADOS_FACTURA[f.estado].texto.toUpperCase()];
    }),
  ];
  const csv = '﻿' + filas.map((fila) => fila.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `libro-de-ventas_${r.desde}_${r.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
      <p className="text-[13px] font-semibold text-neutral-500">{etiqueta}</p>
      <p className="mt-1 text-[24px] font-bold tabular-nums tracking-[-0.02em]">{valor}</p>
      <p className="text-[12.5px] text-neutral-500">{detalle}</p>
    </div>
  );
}

/** KPIs fiscales y Libro de Ventas para la declaración mensual de ISV. */
export default function TabReportes() {
  const { llamar } = useAdmin();
  const [rango, setRango] = useState(() => rangoMes(new Date().toLocaleDateString('en-CA').slice(0, 7)));
  const [datos, setDatos] = useState<ReporteFiscal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('reporteFiscal', rango).then(
      (r) => {
        if (!vivo) return;
        setDatos(r);
        setError(null);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, rango]);

  const r = datos && datos.desde === rango.desde && datos.hasta === rango.hasta ? datos : null;
  const totales = (r?.facturas ?? []).reduce(
    (t, f) => {
      const i = importesLibro(f);
      return { exento: t.exento + i.exento, gravado: t.gravado + i.gravado, isv: t.isv + i.isv, total: t.total + i.total, retencion: t.retencion + i.retencion };
    },
    { exento: 0, gravado: 0, isv: 0, total: 0, retencion: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-neutral-600">Mes fiscal</span>
          <input type="month" value={rango.desde.slice(0, 7)} onChange={(e) => e.target.value && setRango(rangoMes(e.target.value))} className={`${INPUT} w-[190px]`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-neutral-600">Desde</span>
          <input type="date" value={rango.desde} onChange={(e) => e.target.value && setRango((x) => ({ ...x, desde: e.target.value }))} className={`${INPUT} w-[170px]`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-neutral-600">Hasta</span>
          <input type="date" value={rango.hasta} onChange={(e) => e.target.value && setRango((x) => ({ ...x, hasta: e.target.value }))} className={`${INPUT} w-[170px]`} />
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={!r}
            onClick={() => r && descargarCsv(r)}
            className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[14.5px] font-semibold hover:bg-neutral-50 disabled:opacity-50"
          >
            <Download aria-hidden className="h-4 w-4" />
            Excel / CSV
          </button>
          <Link
            href={`/admin/facturacion/libro?desde=${rango.desde}&hasta=${rango.hasta}`}
            target="_blank"
            className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-[14.5px] font-semibold text-white hover:bg-neutral-800"
          >
            <FileText aria-hidden className="h-4 w-4" />
            PDF
          </Link>
        </div>
      </div>

      <AvisoError mensaje={error} />

      {!r ? (
        !error && (
          <div className="flex justify-center py-14">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi etiqueta="Ingresos facturados" valor={lempiras(r.facturado)} detalle="Subtotal sin ISV, sin anuladas" />
            <Kpi etiqueta="ISV cobrado (15%)" valor={lempiras(r.isv)} detalle="A declarar ante la SAR" />
            <Kpi etiqueta="Cobrado en banco" valor={lempiras(r.cobrado)} detalle={`Por cobrar: ${lempiras(r.por_cobrar)}${r.retenciones ? ` · Retenciones ${lempiras(r.retenciones)}` : ''}`} />
            <Kpi etiqueta="MRR" valor={lempiras(r.mrr)} detalle="Mensualidades activas sin ISV" />
          </div>

          <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
            <h2 className="border-b border-neutral-100 px-6 py-4 text-[17px] font-bold">
              Libro de Ventas · {fechaLarga(r.desde)} al {fechaLarga(r.hasta)}
            </h2>
            {r.facturas.length === 0 ? (
              <p className="px-6 py-10 text-center text-[15px] text-neutral-500">No hay facturas en este periodo.</p>
            ) : (
              <table className="w-full min-w-[1100px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 text-[12px] font-semibold uppercase tracking-[0.05em] text-neutral-400">
                    <th className="px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">No. Factura</th>
                    <th className="px-3 py-2.5 font-semibold">RTN Cliente</th>
                    <th className="px-3 py-2.5 font-semibold">Cliente</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Exento</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Gravado 15%</th>
                    <th className="px-3 py-2.5 text-right font-semibold">ISV 15%</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Retenciones</th>
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {r.facturas.map((f) => {
                    const i = importesLibro(f);
                    return (
                      <tr key={f.id} className={f.estado === 'anulada' ? 'text-neutral-400' : ''}>
                        <td className="px-4 py-2 tabular-nums">{fechaLarga(f.fecha_emision)}</td>
                        <td className="px-3 py-2 font-mono">{f.numero}</td>
                        <td className="px-3 py-2 font-mono">{f.cliente_rtn || 'C. final'}</td>
                        <td className="px-3 py-2">{f.cliente_nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lempiras(i.exento)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lempiras(i.gravado)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lempiras(i.isv)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{lempiras(i.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lempiras(i.retencion)}</td>
                        <td className="px-4 py-2 text-[12.5px] font-semibold uppercase">{ESTADOS_FACTURA[f.estado].texto}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-neutral-50 font-bold">
                    <td className="px-4 py-2.5" colSpan={4}>
                      Totales del periodo
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{lempiras(totales.exento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{lempiras(totales.gravado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{lempiras(totales.isv)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{lempiras(totales.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{lempiras(totales.retencion)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
