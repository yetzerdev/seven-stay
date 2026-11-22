'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, ChevronRight, Loader2, RotateCw, Ticket } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, EstadoPastilla } from '@/components/admin/ui';
import type { Monitoreo, MonitoreoHotel } from '@/lib/admin/tipos';

/** Minutos sin asignar a partir de los cuales una solicitud se considera atrasada. */
const MINUTOS_ATRASO = 15;
const REFRESCO_MS = 60_000;

function formatoMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** Qué tan preocupante está un hotel ahora mismo (para ordenar y colorear). */
function gravedad(h: MonitoreoHotel): 0 | 1 | 2 {
  if (h.escaladas > 0 || (h.espera_max_min ?? 0) >= MINUTOS_ATRASO * 2) return 2;
  if ((h.espera_max_min ?? 0) >= MINUTOS_ATRASO || h.esperando_checkin > 0) return 1;
  return 0;
}

function Indicador({ etiqueta, valor, detalle, alerta }: { etiqueta: string; valor: number; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${alerta ? 'border-rose-200 bg-rose-50' : 'border-black/[0.06] bg-white'}`}>
      <p className={`text-[13px] font-semibold ${alerta ? 'text-rose-700' : 'text-neutral-500'}`}>{etiqueta}</p>
      <p className="mt-1 text-[30px] font-bold tabular-nums tracking-[-0.02em] text-neutral-900">{valor}</p>
      {detalle && <p className="text-[12.5px] text-neutral-500">{detalle}</p>}
    </div>
  );
}

/**
 * Monitoreo en vivo de todos los hoteles: para detectar a tiempo un hotel que
 * no está atendiendo (solicitudes sin asignar, escaladas, check-ins sin validar).
 * Se actualiza solo cada minuto.
 */
export default function MonitoreoPage() {
  const { llamar } = useAdmin();
  const [datos, setDatos] = useState<Monitoreo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await llamar('monitoreo', null));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el monitoreo.');
    } finally {
      setCargando(false);
    }
  }, [llamar]);

  useEffect(() => {
    let vivo = true;
    const leer = () =>
      llamar('monitoreo', null).then(
        (d) => {
          if (!vivo) return;
          setDatos(d);
          setError(null);
        },
        (e: Error) => vivo && setError(e.message),
      );
    void leer();
    const intervalo = setInterval(() => void leer(), REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [llamar]);

  const hoteles = [...(datos?.hoteles ?? [])]
    .filter((h) => h.estado === 'activo')
    .sort((a, b) => gravedad(b) - gravedad(a) || b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre));
  const suspendidos = (datos?.hoteles ?? []).filter((h) => h.estado === 'suspendido').length;
  const total = (k: keyof Pick<MonitoreoHotel, 'abiertas' | 'sin_asignar' | 'escaladas' | 'solicitudes_hoy'>) =>
    hoteles.reduce((s, h) => s + h[k], 0);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Monitoreo</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            Todos los hoteles en vivo · se actualiza cada minuto
            {datos && ` · ${new Date(datos.generado_at).toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' })}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[14.5px] font-semibold hover:bg-neutral-50 disabled:opacity-50"
        >
          <RotateCw aria-hidden className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </header>

      <AvisoError mensaje={error} />

      {!datos ? (
        !error && (
          <div className="flex justify-center py-20">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Indicador etiqueta="Solicitudes abiertas" valor={total('abiertas')} detalle={`${hoteles.length} hoteles activos`} />
            <Indicador etiqueta="Sin asignar" valor={total('sin_asignar')} detalle="Nadie las ha tomado" />
            <Indicador etiqueta="Escaladas" valor={total('escaladas')} detalle="Necesitan prioridad" alerta={total('escaladas') > 0} />
            <Indicador etiqueta="Solicitudes 24 h" valor={total('solicitudes_hoy')} detalle="En todos los hoteles" />
            <Link href="/admin/tours?pestana=reservas" className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4 hover:bg-neutral-50">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500">
                <Ticket aria-hidden className="h-3.5 w-3.5" />
                Tours por cobrar
              </p>
              <p className="mt-1 text-[30px] font-bold tabular-nums tracking-[-0.02em] text-neutral-900">{datos.reservas_por_cobrar}</p>
              <p className="text-[12.5px] text-neutral-500">Reservas pendientes de pago →</p>
            </Link>
          </div>

          <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
            {hoteles.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <Building2 aria-hidden className="h-7 w-7 text-neutral-400" />
                <p className="mt-3 text-[15px] text-neutral-500">No hay hoteles activos.</p>
              </div>
            ) : (
              <table className="w-full min-w-[900px] text-left text-[14.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                    <th className="px-6 py-3 font-semibold">Hotel</th>
                    <th className="px-3 py-3 text-right font-semibold">Abiertas</th>
                    <th className="px-3 py-3 text-right font-semibold">Sin asignar</th>
                    <th className="px-3 py-3 text-right font-semibold">Espera más larga</th>
                    <th className="px-3 py-3 text-right font-semibold">Escaladas</th>
                    <th className="px-3 py-3 text-right font-semibold">Por validar</th>
                    <th className="px-3 py-3 text-right font-semibold">Respuesta 24 h</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {hoteles.map((h) => {
                    const g = gravedad(h);
                    return (
                      <tr key={h.id} className={g === 2 ? 'bg-rose-50/60' : g === 1 ? 'bg-amber-50/50' : ''}>
                        <td className="px-6 py-3">
                          <span className="flex items-center gap-3">
                            {h.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
                              <img src={h.logo_url} alt="" className="h-8 w-12 shrink-0 object-contain" />
                            ) : (
                              <span aria-hidden className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-400">
                                <Building2 className="h-4 w-4" />
                              </span>
                            )}
                            <span className="font-semibold">{h.nombre}</span>
                            {g === 2 && (
                              <EstadoPastilla tono="rojo">
                                <AlertTriangle aria-hidden className="mr-1 h-3 w-3" />
                                Atender
                              </EstadoPastilla>
                            )}
                            {g === 1 && <EstadoPastilla tono="ambar">Revisar</EstadoPastilla>}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{h.abiertas}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{h.sin_asignar}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${(h.espera_max_min ?? 0) >= MINUTOS_ATRASO ? 'font-semibold text-rose-700' : ''}`}>
                          {formatoMin(h.espera_max_min)}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums ${h.escaladas ? 'font-semibold text-rose-700' : ''}`}>{h.escaladas}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${h.esperando_checkin ? 'font-semibold text-amber-700' : ''}`}>{h.esperando_checkin}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatoMin(h.respuesta_min)}</td>
                        <td className="px-6 py-3 text-right">
                          <Link href={`/admin/hoteles/${h.id}`} aria-label={`Abrir ${h.nombre}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
                            <ChevronRight aria-hidden className="h-5 w-5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-[13px] text-neutral-500">
            <strong className="font-semibold text-rose-700">Atender:</strong> hay escaladas o una solicitud lleva {MINUTOS_ATRASO * 2}+ min sin asignar ·{' '}
            <strong className="font-semibold text-amber-700">Revisar:</strong> {MINUTOS_ATRASO}+ min sin asignar o check-ins sin validar.
            {suspendidos > 0 && ` · ${suspendidos} ${suspendidos === 1 ? 'hotel suspendido no se muestra' : 'hoteles suspendidos no se muestran'}.`}
          </p>
        </>
      )}
    </main>
  );
}
