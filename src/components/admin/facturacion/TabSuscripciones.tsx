'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Receipt } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, EstadoPastilla } from '@/components/admin/ui';
import type { EstadoSuscripcion, NuevaFactura, Suscripcion } from '@/lib/admin/tipos';
import { lempiras, PLANES_SAAS } from '@/lib/facturacion/tarifas';

import { fechaLarga } from './Documentos';

const ESTADOS: Record<EstadoSuscripcion, { texto: string; tono: 'azul' | 'verde' | 'ambar' | 'rojo' }> = {
  gratis: { texto: 'En periodo gratis', tono: 'azul' },
  al_dia: { texto: 'Al día', tono: 'verde' },
  por_vencer: { texto: 'Por vencer', tono: 'ambar' },
  vencido: { texto: 'Vencido', tono: 'rojo' },
};

/** Cobranza recurrente: cada hotel activo, su mensualidad y si está al día. */
export default function TabSuscripciones({ onFacturar, recarga }: { onFacturar: (b: NuevaFactura) => void; recarga: number }) {
  const { llamar } = useAdmin();
  const [datos, setDatos] = useState<{ recarga: number; subs: Suscripcion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('suscripciones', null).then(
      (subs) => vivo && setDatos({ recarga, subs }),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, recarga]);

  const generar = async (s: Suscripcion) => {
    setGenerando(s.hotel_id);
    try {
      onFacturar(await llamar('borradorMensualidad', { hotel_id: s.hotel_id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar la factura.');
    } finally {
      setGenerando(null);
    }
  };

  const subs = datos?.recarga === recarga ? datos.subs : null;
  const orden: Record<EstadoSuscripcion, number> = { vencido: 0, por_vencer: 1, al_dia: 2, gratis: 3 };
  const lista = [...(subs ?? [])].sort((a, b) => orden[a.estado] - orden[b.estado] || b.dias_mora - a.dias_mora || a.nombre.localeCompare(b.nombre));
  const mrr = (subs ?? []).filter((s) => s.estado !== 'gratis').reduce((t, s) => t + s.subtotal, 0);

  return (
    <div className="flex flex-col gap-5">
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {subs && (
        <p className="text-[14.5px] text-neutral-500">
          {subs.length} hoteles activos · Ingreso mensual recurrente <strong className="text-neutral-900">{lempiras(mrr)}</strong> sin ISV
        </p>
      )}
      <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
        {!subs ? (
          <div className="flex justify-center py-14">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : lista.length === 0 ? (
          <p className="px-6 py-14 text-center text-[15px] text-neutral-500">No hay hoteles activos.</p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                <th className="px-6 py-3 font-semibold">Hotel</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 text-right font-semibold">Mensualidad (ISV inc.)</th>
                <th className="px-3 py-3 font-semibold">Próximo corte</th>
                <th className="px-3 py-3 text-right font-semibold">Días de mora</th>
                <th className="px-3 py-3 font-semibold">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lista.map((s) => (
                <tr key={s.hotel_id}>
                  <td className="px-6 py-3">
                    <Link href={`/admin/hoteles/${s.hotel_id}`} className="font-semibold hover:underline">
                      {s.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {PLANES_SAAS[s.plan].nombre}
                    <span className="block text-[12.5px] text-neutral-500">
                      {s.habitaciones} hab.{s.plan_automatico ? ' · automático' : ''}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{lempiras(s.total)}</td>
                  <td className="px-3 py-3 tabular-nums">{s.proximo_corte ? fechaLarga(s.proximo_corte) : 'Sin facturar aún'}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${s.dias_mora ? 'font-semibold text-rose-700' : 'text-neutral-400'}`}>{s.dias_mora || '—'}</td>
                  <td className="px-3 py-3">
                    <EstadoPastilla tono={ESTADOS[s.estado].tono}>{ESTADOS[s.estado].texto}</EstadoPastilla>
                    {s.factura_pendiente && <span className="mt-0.5 block font-mono text-[12px] text-neutral-500">Pendiente: {s.factura_pendiente}</span>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      disabled={generando !== null}
                      onClick={() => void generar(s)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3 text-[13.5px] font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      {generando === s.hotel_id ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Receipt aria-hidden className="h-4 w-4" />}
                      Generar factura del mes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-[13px] text-neutral-500">
        Al marcar como pagada una factura de mensualidad, el hotel queda al día por los meses que cubre. La suspensión por mora sigue siendo manual desde la ficha del hotel.
      </p>
    </div>
  );
}
