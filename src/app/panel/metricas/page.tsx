'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { CATEGORIAS_PANEL } from '@/components/panel/ticketPanel';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import { mensajeDe, useStay } from '@/context/StayContext';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';
import type { CategoriaTicket, Moneda } from '@/types/sevenstay';

/**
 * Métricas del hotel (solo Supervisor / Gerente; el cascarón bloquea a recepción).
 * Se calculan en el navegador a partir de las solicitudes del periodo (RLS: solo
 * las de este hotel, sin los tours de Seven Stay).
 */

type Periodo = 'hoy' | '7d' | '30d';
const PERIODOS: { valor: Periodo; texto: string; dias: number; anterior: string }[] = [
  { valor: 'hoy', texto: 'Hoy', dias: 1, anterior: 'vs. ayer' },
  { valor: '7d', texto: 'Últimos 7 días', dias: 7, anterior: 'vs. 7 días anteriores' },
  { valor: '30d', texto: 'Últimos 30 días', dias: 30, anterior: 'vs. 30 días anteriores' },
];

// Un solo tono (magnitud): azul de la paleta de referencia, validado en fondo claro.
const TONO = '#2a78d6';

interface Fila {
  id: string;
  categoria: CategoriaTicket;
  estado: string;
  en_alerta_servicio: boolean;
  historial: { tipo: string }[] | null;
  creado_at: string;
  aceptado_at: string | null;
  resuelto_at: string | null;
  asignado_a_nombre: string | null;
  habitacion_numero: string;
  detalle_catalogo: { cantidad?: number; precio?: number; moneda?: Moneda } | null;
}

function inicioPeriodo(dias: number, hace = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1) - hace * dias);
  return d;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const minutosEntre = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

function formatoMinutos(min: number | null): string {
  if (min === null) return '—';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round(min % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

function calcular(filas: Fila[]) {
  const finalizadas = filas.filter((f) => ['resuelto', 'rechazado', 'cancelado'].includes(f.estado));
  const resueltas = filas.filter((f) => f.estado === 'resuelto');
  const respuesta = mediana(filas.filter((f) => f.aceptado_at).map((f) => minutosEntre(f.creado_at, f.aceptado_at!)));
  const resolucion = mediana(resueltas.filter((f) => f.resuelto_at).map((f) => minutosEntre(f.creado_at, f.resuelto_at!)));
  return {
    total: filas.length,
    resueltas: resueltas.length,
    pctResueltas: finalizadas.length ? Math.round((resueltas.length / finalizadas.length) * 100) : null,
    // La alerta se apaga al resolver: se cuenta por el historial (alguna vez se escaló).
    escaladas: filas.filter((f) => f.en_alerta_servicio || f.historial?.some((e) => e.tipo === 'escalado')).length,
    rechazadas: filas.filter((f) => f.estado === 'rechazado').length,
    respuesta,
    resolucion,
  };
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function Tarjeta({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-black/[0.06] bg-white p-6 ${className}`}>
      <h2 className="text-[16px] font-bold text-neutral-900">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Indicador({ etiqueta, valor, detalle, ayuda }: { etiqueta: string; valor: string; detalle?: ReactNode; ayuda?: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4" title={ayuda}>
      <p className="text-[13px] font-semibold text-neutral-500">{etiqueta}</p>
      <p className="mt-1 text-[30px] font-bold tabular-nums tracking-[-0.02em] text-neutral-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-[12.5px] text-neutral-500">{detalle}</p>}
    </div>
  );
}

/** "+12% vs. ayer": cambio contra el periodo anterior, en tinta neutra (más no es siempre mejor). */
function Cambio({ actual, previo, texto }: { actual: number; previo: number; texto: string }) {
  if (previo === 0) return <>{actual > 0 ? 'Sin datos del periodo anterior' : texto}</>;
  const pct = Math.round(((actual - previo) / previo) * 100);
  return (
    <>
      <span className="font-semibold tabular-nums text-neutral-700">
        {pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}%
      </span>{' '}
      {texto}
    </>
  );
}

/** Barras horizontales de un solo tono, ordenadas de mayor a menor, con su valor al final. */
function BarrasHorizontales({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (datos.every((d) => d.valor === 0)) return <p className="text-[14px] text-neutral-400">Sin solicitudes en este periodo.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {datos.map((d) => (
        <li key={d.etiqueta} className="grid grid-cols-[150px_minmax(0,1fr)_48px] items-center gap-3">
          <span className="truncate text-[14px] text-neutral-700">{d.etiqueta}</span>
          <span className="h-5">
            <span
              className="block h-full rounded-r-[4px]"
              style={{ width: `${(d.valor / max) * 100}%`, minWidth: d.valor ? 4 : 0, background: TONO }}
            />
          </span>
          <span className="text-right text-[14px] font-semibold tabular-nums text-neutral-900">{d.valor}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columnas por hora del día (0–23) con tooltip al pasar el cursor. */
function ColumnasPorHora({ porHora }: { porHora: number[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const max = Math.max(1, ...porHora);
  const total = porHora.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-[14px] text-neutral-400">Sin solicitudes en este periodo.</p>;
  const pico = porHora.indexOf(Math.max(...porHora));
  const hora = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  return (
    <div>
      <p className="mb-3 text-[13.5px] text-neutral-500">
        Hora con más solicitudes: <strong className="font-semibold text-neutral-900">{hora(pico)} – {hora((pico + 1) % 24)}</strong>
      </p>
      <div className="relative" onMouseLeave={() => setActiva(null)}>
        {/* Línea base y guía de máximo, recesivas */}
        <div className="flex h-40 items-end gap-[2px] border-b border-neutral-200">
          {porHora.map((v, h) => (
            <button
              key={h}
              type="button"
              onMouseEnter={() => setActiva(h)}
              onFocus={() => setActiva(h)}
              onBlur={() => setActiva(null)}
              aria-label={`${hora(h)}: ${v} ${v === 1 ? 'solicitud' : 'solicitudes'}`}
              className="flex h-full flex-1 items-end justify-center outline-none"
            >
              <span
                className="block w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                style={{
                  height: `${(v / max) * 100}%`,
                  minHeight: v ? 3 : 0,
                  background: TONO,
                  opacity: activa === null || activa === h ? 1 : 0.35,
                }}
              />
            </button>
          ))}
        </div>
        {activa !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[12.5px] text-white shadow-lg"
            style={{ left: `${((activa + 0.5) / 24) * 100}%` }}
          >
            <span className="font-semibold">{hora(activa)}</span> · {porHora[activa]} {porHora[activa] === 1 ? 'solicitud' : 'solicitudes'}
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[11.5px] tabular-nums text-neutral-400">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>11 PM</span>
        </div>
      </div>
    </div>
  );
}

function Tabla({ columnas, filas, vacio }: { columnas: string[]; filas: ReactNode[][]; vacio: string }) {
  if (filas.length === 0) return <p className="text-[14px] text-neutral-400">{vacio}</p>;
  return (
    <table className="w-full text-left text-[14px]">
      <thead>
        <tr className="border-b border-neutral-200 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
          {columnas.map((c, i) => (
            <th key={c} className={`pb-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {filas.map((fila, i) => (
          <tr key={i}>
            {fila.map((celda, j) => (
              <td key={j} className={`py-2.5 ${j > 0 ? 'text-right tabular-nums' : 'font-medium text-neutral-900'}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function MetricasPage() {
  const { hotel, tickets } = useStay();
  const [periodo, setPeriodo] = useState<Periodo>('7d');
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conf = PERIODOS.find((p) => p.valor === periodo)!;
  // Cuando entra o cambia una solicitud (Realtime), las métricas se recalculan.
  const marcaTickets = tickets.length > 0 ? `${tickets.length}-${tickets[0].id}-${tickets[0].estado}` : '0';

  useEffect(() => {
    if (!supabaseConfigurado || !hotel.id) return;
    let vivo = true;
    // Se lee el periodo actual y el anterior (para comparar).
    const desde = inicioPeriodo(conf.dias, 1).toISOString();
    clientePanel()
      .from('tickets')
      .select('id, categoria, estado, en_alerta_servicio, historial, creado_at, aceptado_at, resuelto_at, asignado_a_nombre, habitacion_numero, detalle_catalogo')
      .eq('hotel_id', hotel.id)
      .gte('creado_at', desde)
      .order('creado_at', { ascending: false })
      .limit(10000)
      .then(({ data, error: fallo }) => {
        if (!vivo) return;
        if (fallo) {
          setError(mensajeDe(fallo));
          return;
        }
        setError(null);
        setFilas((data ?? []) as Fila[]);
      });
    return () => {
      vivo = false;
    };
  }, [hotel.id, conf.dias, marcaTickets]);

  const datos = useMemo(() => {
    if (!filas) return null;
    const corte = inicioPeriodo(conf.dias).getTime();
    const actuales = filas.filter((f) => new Date(f.creado_at).getTime() >= corte);
    const previas = filas.filter((f) => new Date(f.creado_at).getTime() < corte);
    const kpi = calcular(actuales);
    const kpiPrevio = calcular(previas);

    const categorias = (Object.keys(CATEGORIAS_PANEL) as CategoriaTicket[])
      .map((c) => ({ etiqueta: CATEGORIAS_PANEL[c].texto, valor: actuales.filter((f) => f.categoria === c).length }))
      .sort((a, b) => b.valor - a.valor);

    const porHora = Array.from({ length: 24 }, () => 0);
    actuales.forEach((f) => porHora[new Date(f.creado_at).getHours()]++);

    // Equipo: quién atendió y cuánto tardó (de creada a resuelta).
    const equipo = new Map<string, { atendidas: number; tiempos: number[] }>();
    actuales.forEach((f) => {
      if (!f.asignado_a_nombre) return;
      const e = equipo.get(f.asignado_a_nombre) ?? { atendidas: 0, tiempos: [] };
      e.atendidas++;
      if (f.estado === 'resuelto' && f.resuelto_at) e.tiempos.push(minutosEntre(f.creado_at, f.resuelto_at));
      equipo.set(f.asignado_a_nombre, e);
    });

    const habitaciones = new Map<string, number>();
    actuales.forEach((f) => habitaciones.set(f.habitacion_numero, (habitaciones.get(f.habitacion_numero) ?? 0) + 1));

    // Ventas: pedidos y tours propios RESUELTOS (lo que realmente se entregó), por moneda.
    const ventas = new Map<Moneda, { monto: number; pedidos: number }>();
    actuales
      .filter((f) => f.estado === 'resuelto' && (f.categoria === 'room_service' || f.categoria === 'tour') && f.detalle_catalogo?.precio != null)
      .forEach((f) => {
        const c = f.detalle_catalogo!;
        const moneda = c.moneda === 'USD' ? 'USD' : 'HNL';
        const v = ventas.get(moneda) ?? { monto: 0, pedidos: 0 };
        v.monto += (c.precio ?? 0) * (c.cantidad ?? 1);
        v.pedidos++;
        ventas.set(moneda, v);
      });

    return {
      kpi,
      kpiPrevio,
      categorias,
      porHora,
      equipo: [...equipo.entries()].sort((a, b) => b[1].atendidas - a[1].atendidas),
      habitaciones: [...habitaciones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      ventas: [...ventas.entries()],
    };
  }, [filas, conf.dias]);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Métricas</h1>
          <p className="mt-1 text-[15px] text-neutral-500">Cómo está respondiendo el hotel a sus huéspedes</p>
        </div>
        {/* Filtro de periodo: una sola fila, arriba de todo */}
        <div role="radiogroup" aria-label="Periodo" className="flex rounded-xl border border-black/[0.08] bg-white p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              role="radio"
              aria-checked={periodo === p.valor}
              onClick={() => setPeriodo(p.valor)}
              className={`h-9 rounded-lg px-4 text-[14px] font-semibold transition-colors ${
                periodo === p.valor ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[14.5px] text-rose-800">
          <AlertTriangle aria-hidden className="h-4 w-4" />
          No se pudieron leer las métricas: {error}
        </p>
      )}

      {!datos ? (
        !error && (
          <div className="flex justify-center py-20">
            <Loader2 aria-label="Cargando métricas" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <Indicador
              etiqueta="Solicitudes"
              valor={String(datos.kpi.total)}
              detalle={<Cambio actual={datos.kpi.total} previo={datos.kpiPrevio.total} texto={conf.anterior} />}
            />
            <Indicador
              etiqueta="Tiempo de respuesta"
              valor={formatoMinutos(datos.kpi.respuesta)}
              detalle="Mediana hasta que alguien la toma"
              ayuda="Minutos desde que el huésped envía la solicitud hasta que recepción la acepta (mediana)."
            />
            <Indicador
              etiqueta="Tiempo de resolución"
              valor={formatoMinutos(datos.kpi.resolucion)}
              detalle="Mediana hasta resolverla"
              ayuda="Minutos desde que el huésped envía la solicitud hasta que se marca resuelta (mediana)."
            />
            <Indicador
              etiqueta="Resueltas"
              valor={datos.kpi.pctResueltas === null ? '—' : `${datos.kpi.pctResueltas}%`}
              detalle={`${datos.kpi.resueltas} de las terminadas`}
            />
            <Indicador etiqueta="Escaladas" valor={String(datos.kpi.escaladas)} detalle="Por demora o a supervisor" />
            <Indicador etiqueta="No aprobadas" valor={String(datos.kpi.rechazadas)} detalle="Rechazadas por recepción" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Tarjeta titulo="Solicitudes por tipo">
              <BarrasHorizontales datos={datos.categorias} />
            </Tarjeta>
            <Tarjeta titulo="Solicitudes por hora del día">
              <ColumnasPorHora porHora={datos.porHora} />
            </Tarjeta>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Tarjeta titulo="Equipo" className="xl:col-span-1">
              <Tabla
                columnas={['Persona', 'Atendidas', 'Resolución']}
                filas={datos.equipo.map(([nombre, e]) => [nombre, e.atendidas, formatoMinutos(mediana(e.tiempos))])}
                vacio="Nadie ha tomado solicitudes en este periodo."
              />
            </Tarjeta>
            <Tarjeta titulo="Habitaciones con más solicitudes" className="xl:col-span-1">
              <Tabla
                columnas={['Habitación', 'Solicitudes']}
                filas={datos.habitaciones.map(([numero, n]) => [`Hab. ${numero}`, n])}
                vacio="Sin solicitudes en este periodo."
              />
            </Tarjeta>
            <Tarjeta titulo="Ventas entregadas" className="xl:col-span-1">
              {datos.ventas.length === 0 ? (
                <p className="text-[14px] text-neutral-400">Sin pedidos ni tours propios resueltos en este periodo.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {datos.ventas.map(([moneda, v]) => (
                    <div key={moneda}>
                      <p className="text-[30px] font-bold tabular-nums tracking-[-0.02em] text-neutral-900">{formatoPrecio(v.monto, moneda)}</p>
                      <p className="text-[13px] text-neutral-500">
                        {v.pedidos} {v.pedidos === 1 ? 'pedido o tour resuelto' : 'pedidos y tours resueltos'}
                      </p>
                    </div>
                  ))}
                  <p className="text-[12.5px] leading-snug text-neutral-400">
                    Room service y tours propios marcados como resueltos, con el precio del menú. Los tours de Seven Stay no se cuentan aquí.
                  </p>
                </div>
              )}
            </Tarjeta>
          </div>
        </>
      )}
    </main>
  );
}
