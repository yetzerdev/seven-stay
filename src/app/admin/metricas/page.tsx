'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError } from '@/components/admin/ui';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import type { MetricasGlobales, VentaMes } from '@/lib/admin/tipos';
import type { Moneda } from '@/types/sevenstay';

const PERIODOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
];

// Un solo tono (magnitud): azul de la paleta de referencia.
const TONO = '#2a78d6';

function formatoMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('es-HN', { month: 'short', year: '2-digit' }).replace('.', '');

/** Columnas por mes de UNA moneda (nunca dos escalas en el mismo gráfico). */
function VentasPorMes({ meses, moneda }: { meses: VentaMes[]; moneda: Moneda }) {
  const [activo, setActivo] = useState<number | null>(null);
  const valor = (m: VentaMes) => (moneda === 'USD' ? m.usd : m.hnl);
  const max = Math.max(1, ...meses.map(valor));
  return (
    <div>
      <p className="mb-3 text-[13px] font-semibold text-neutral-500">{moneda === 'USD' ? 'Dólares' : 'Lempiras'}</p>
      <div className="relative" onMouseLeave={() => setActivo(null)}>
        <div className="flex h-40 items-end gap-3 border-b border-neutral-200">
          {meses.map((m, i) => (
            <button
              key={m.mes}
              type="button"
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              aria-label={`${nombreMes(m.mes)}: ${formatoPrecio(valor(m), moneda)}`}
              className="flex h-full flex-1 items-end justify-center outline-none"
            >
              <span
                className="block w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                style={{ height: `${(valor(m) / max) * 100}%`, minHeight: valor(m) ? 3 : 0, background: TONO, opacity: activo === null || activo === i ? 1 : 0.35 }}
              />
            </button>
          ))}
        </div>
        {activo !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[12.5px] text-white shadow-lg"
            style={{ left: `${((activo + 0.5) / meses.length) * 100}%` }}
          >
            <span className="font-semibold">{nombreMes(meses[activo].mes)}</span> · {formatoPrecio(valor(meses[activo]), moneda)}
          </div>
        )}
        <div className="mt-1.5 flex gap-3">
          {meses.map((m) => (
            <span key={m.mes} className="flex-1 text-center text-[11.5px] capitalize text-neutral-400">
              {nombreMes(m.mes)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Comparación entre hoteles y ventas de los tours de Seven Stay. */
export default function MetricasGlobalesPage() {
  const { llamar } = useAdmin();
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<{ dias: number; m: MetricasGlobales } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('metricasGlobales', { dias }).then(
      (m) => {
        if (!vivo) return;
        setDatos({ dias, m });
        setError(null);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, dias]);

  const actual = datos?.dias === dias ? datos.m : null;
  const hoteles = [...(actual?.hoteles ?? [])].sort((a, b) => b.solicitudes - a.solicitudes);
  const ventas = actual?.ventas_tours ?? [];
  const totalUsd = ventas.reduce((s, m) => s + m.usd, 0);
  const totalHnl = ventas.reduce((s, m) => s + m.hnl, 0);
  const totalReservas = ventas.reduce((s, m) => s + m.reservas, 0);
  // La mejor y la peor respuesta resaltan a quién felicitar y a quién llamar.
  const conRespuesta = hoteles.filter((h) => h.respuesta_min !== null);
  const mejor = conRespuesta.length > 1 ? Math.min(...conRespuesta.map((h) => h.respuesta_min!)) : null;
  const peor = conRespuesta.length > 1 ? Math.max(...conRespuesta.map((h) => h.respuesta_min!)) : null;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Métricas</h1>
          <p className="mt-1 text-[15px] text-neutral-500">Cómo responde cada hotel y cuánto venden los tours de Seven Stay</p>
        </div>
        <div role="radiogroup" aria-label="Periodo" className="flex rounded-xl border border-black/[0.08] bg-white p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              role="radio"
              aria-checked={dias === p.dias}
              onClick={() => setDias(p.dias)}
              className={`h-9 rounded-lg px-4 text-[14px] font-semibold ${dias === p.dias ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </header>

      <AvisoError mensaje={error} />

      {!actual ? (
        !error && (
          <div className="flex justify-center py-20">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )
      ) : (
        <>
          <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
            <h2 className="border-b border-neutral-100 px-6 py-4 text-[17px] font-bold">Hoteles · últimos {dias} días</h2>
            {hoteles.length === 0 ? (
              <p className="px-6 py-10 text-center text-[15px] text-neutral-500">Todavía no hay hoteles.</p>
            ) : (
              <table className="w-full min-w-[860px] text-left text-[14.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                    <th className="px-6 py-3 font-semibold">Hotel</th>
                    <th className="px-3 py-3 text-right font-semibold">Solicitudes</th>
                    <th className="px-3 py-3 text-right font-semibold">Por habitación</th>
                    <th className="px-3 py-3 text-right font-semibold">Respuesta</th>
                    <th className="px-3 py-3 text-right font-semibold">Resolución</th>
                    <th className="px-3 py-3 text-right font-semibold">Resueltas</th>
                    <th className="px-3 py-3 text-right font-semibold">Escaladas</th>
                    <th className="px-6 py-3 text-right font-semibold">No aprobadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {hoteles.map((h) => (
                    <tr key={h.id}>
                      <td className="px-6 py-3">
                        <Link href={`/admin/hoteles/${h.id}`} className="font-semibold hover:underline">
                          {h.nombre}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{h.solicitudes}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-500">
                        {h.habitaciones ? (h.solicitudes / h.habitaciones).toFixed(1) : '—'}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums ${
                          h.respuesta_min !== null && h.respuesta_min === mejor ? 'font-semibold text-emerald-700' : h.respuesta_min !== null && h.respuesta_min === peor ? 'font-semibold text-rose-700' : ''
                        }`}
                      >
                        {formatoMin(h.respuesta_min)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatoMin(h.resolucion_min)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{h.pct_resueltas === null ? '—' : `${h.pct_resueltas}%`}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${h.escaladas ? 'text-rose-700' : ''}`}>{h.escaladas}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{h.rechazadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-neutral-100 px-6 py-3 text-[12.5px] text-neutral-500">
              Tiempos en mediana. En verde la respuesta más rápida y en rojo la más lenta. No incluye los tours de Seven Stay.
            </p>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-bold">Ventas de tours de Seven Stay</h2>
                <p className="text-[14px] text-neutral-500">Reservas pagadas o completadas · últimos 6 meses</p>
              </div>
              <dl className="flex gap-8">
                <div>
                  <dt className="text-[13px] font-semibold text-neutral-500">Reservas</dt>
                  <dd className="text-[24px] font-bold tabular-nums">{totalReservas}</dd>
                </div>
                {totalUsd > 0 && (
                  <div>
                    <dt className="text-[13px] font-semibold text-neutral-500">Total en dólares</dt>
                    <dd className="text-[24px] font-bold tabular-nums">{formatoPrecio(totalUsd, 'USD')}</dd>
                  </div>
                )}
                {totalHnl > 0 && (
                  <div>
                    <dt className="text-[13px] font-semibold text-neutral-500">Total en lempiras</dt>
                    <dd className="text-[24px] font-bold tabular-nums">{formatoPrecio(totalHnl, 'HNL')}</dd>
                  </div>
                )}
              </dl>
            </div>
            {totalReservas === 0 ? (
              <p className="mt-6 text-[14.5px] text-neutral-400">
                Todavía no hay reservas pagadas. Se cuentan cuando marcas una reserva como «Pagado» o «Completado» en Tours y reservas.
              </p>
            ) : (
              <div className={`mt-6 grid gap-8 ${totalUsd > 0 && totalHnl > 0 ? 'lg:grid-cols-2' : ''}`}>
                {totalUsd > 0 && <VentasPorMes meses={ventas} moneda="USD" />}
                {totalHnl > 0 && <VentasPorMes meses={ventas} moneda="HNL" />}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
