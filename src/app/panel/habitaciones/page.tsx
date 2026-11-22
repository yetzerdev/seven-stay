'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, LogIn, LogOut, Search, TriangleAlert, X } from 'lucide-react';

import { useAccionesEstadia } from '@/components/panel/accionesEstadia';
import { esDelHotel } from '@/components/panel/ticketPanel';
import { formato12h } from '@/components/portal/etiquetasTicket';
import { estadiaVigente, ticketFinalizado, useStay } from '@/context/StayContext';
import type { Habitacion } from '@/types/sevenstay';

/*
 * Habitaciones (panel del hotel cliente). Recepción registra estadías y puede
 * abrir el portal de cada habitación. Las placas QR/NFC las gestiona el equipo
 * de Seven Stay: aquí solo se avisa (solo lectura) si una placa está fuera de
 * servicio, porque eso impide el check-in.
 */

type EstadoEstadia = 'ocupada' | 'por_validar' | 'vacia';
type Filtro = 'todas' | EstadoEstadia | 'con_solicitudes';

const ESTADIA: Record<EstadoEstadia, { texto: string; punto: string; textoClase: string }> = {
  ocupada: { texto: 'Ocupada', punto: 'bg-emerald-500', textoClase: 'text-emerald-700' },
  por_validar: { texto: 'Por validar', punto: 'bg-amber-500', textoClase: 'text-amber-700' },
  vacia: { texto: 'Vacía', punto: 'bg-neutral-300', textoClase: 'text-neutral-500' },
};

function estadiaDe(hab: Habitacion): EstadoEstadia {
  if (hab.estadia_activa?.estado === 'pendiente_confirmacion') return 'por_validar';
  return estadiaVigente(hab) ? 'ocupada' : 'vacia';
}

/** Piso a partir del número: 101 → 1, 204 → 2, 1203 → 12. */
function pisoDe(numero: string): number {
  const n = Number.parseInt(numero, 10);
  return Number.isFinite(n) && n >= 100 ? Math.floor(n / 100) : 0;
}

/** "Check-out mañana 12:00 PM" */
function textoCheckout(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);
  const dia =
    fecha.toDateString() === hoy.toDateString()
      ? 'hoy'
      : fecha.toDateString() === manana.toDateString()
        ? 'mañana'
        : fecha.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
  return `Check-out ${dia} ${formato12h(`${fecha.getHours()}:${fecha.getMinutes()}`)}`;
}

const COLUMNAS = 'lg:grid-cols-[120px_minmax(0,1.5fr)_minmax(0,1fr)_300px]';

export default function HabitacionesPage() {
  const { habitaciones } = useStay();
  const tickets = useStay().tickets.filter(esDelHotel);
  const { checkIn, checkOut, dialogo } = useAccionesEstadia();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const buscador = useRef<HTMLInputElement>(null);

  // Atajo "/" para buscar, como en la mayoría de herramientas de escritorio.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const enCampo = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (e.key === '/' && !enCampo) {
        e.preventDefault();
        buscador.current?.focus();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const activosDe = (numero: string) => tickets.filter((t) => t.habitacion_numero === numero && !ticketFinalizado(t)).length;
  /** Una sola solicitud activa → su detalle; varias → el tablero filtrado por la habitación. */
  const enlaceSolicitudes = (numero: string) => {
    const activos = tickets.filter((t) => t.habitacion_numero === numero && !ticketFinalizado(t));
    return activos.length === 1 ? `/panel/solicitudes/${activos[0].id}` : `/panel?habitacion=${encodeURIComponent(numero)}`;
  };

  const pruebas: Record<Filtro, (h: Habitacion) => boolean> = {
    todas: () => true,
    ocupada: (h) => estadiaDe(h) === 'ocupada',
    vacia: (h) => estadiaDe(h) === 'vacia',
    por_validar: (h) => estadiaDe(h) === 'por_validar',
    con_solicitudes: (h) => activosDe(h.numero) > 0,
  };
  const FILTROS: { clave: Filtro; texto: string; punto?: string }[] = [
    { clave: 'todas', texto: 'Todas' },
    { clave: 'ocupada', texto: 'Ocupadas', punto: 'bg-emerald-500' },
    { clave: 'vacia', texto: 'Vacías', punto: 'bg-neutral-300' },
    { clave: 'por_validar', texto: 'Por validar', punto: 'bg-amber-500' },
    { clave: 'con_solicitudes', texto: 'Con solicitudes', punto: 'bg-sky-500' },
  ];

  const termino = busqueda.trim().toLowerCase();
  const visibles = habitaciones
    .filter(pruebas[filtro])
    .filter((h) => !termino || h.numero.toLowerCase().includes(termino))
    .sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }));
  const pisos = [...new Set(visibles.map((h) => pisoDe(h.numero)))].sort((a, b) => a - b);

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Habitaciones</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            {habitaciones.length} habitaciones · {habitaciones.filter(pruebas.ocupada).length} ocupadas
          </p>
        </div>
        <label className="relative w-full max-w-[360px]">
          <span className="sr-only">Buscar habitación</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
          <input
            ref={buscador}
            type="search"
            inputMode="numeric"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar habitación…"
            className="h-12 w-full rounded-xl border border-black/[0.1] bg-white pl-11 pr-11 text-[15.5px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda ? (
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                buscador.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-neutral-200 px-1.5 py-0.5 font-sans text-[12px] text-neutral-400 sm:block">
              /
            </kbd>
          )}
        </label>
      </header>

      {/* Filtros con conteo */}
      <div role="tablist" aria-label="Filtrar habitaciones" className="flex gap-2 overflow-x-auto">
        {FILTROS.map(({ clave, texto, punto }) => {
          const activo = filtro === clave;
          return (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setFiltro(clave)}
              className={`flex h-11 shrink-0 items-center gap-2.5 rounded-xl border px-4 text-[15px] font-medium transition-colors ${
                activo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/[0.06] bg-white text-neutral-600 hover:border-black/[0.15] hover:text-neutral-900'
              }`}
            >
              {punto && <span aria-hidden className={`h-2 w-2 rounded-full ${punto}`} />}
              {texto}
              <span className={`text-[16px] font-bold tabular-nums ${activo ? 'text-white' : 'text-neutral-900'}`}>
                {habitaciones.filter(pruebas[clave]).length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabla agrupada por piso */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <div className={`hidden items-center gap-4 border-b border-neutral-100 bg-[#FAFAFB] px-6 py-3 text-[12.5px] font-bold uppercase tracking-[0.08em] text-neutral-400 lg:grid ${COLUMNAS}`}>
          <span>Habitación</span>
          <span>Estadía</span>
          <span>Solicitudes</span>
          <span className="text-right">Acciones</span>
        </div>

        {visibles.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[16px] font-medium text-neutral-700">
              {termino ? `No hay habitaciones que coincidan con “${busqueda.trim()}”` : 'No hay habitaciones en este filtro'}
            </p>
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setFiltro('todas');
              }}
              className="mt-3 text-[14.5px] font-semibold text-neutral-900 underline underline-offset-4"
            >
              Ver todas las habitaciones
            </button>
          </div>
        ) : (
          pisos.map((piso) => {
            const delPiso = visibles.filter((h) => pisoDe(h.numero) === piso);
            return (
              <section key={piso} aria-label={piso ? `Piso ${piso}` : 'Otras'}>
                <h2 className="border-b border-neutral-100 bg-[#FAFAFB] px-6 py-2 text-[13px] font-semibold text-neutral-500">
                  {piso ? `Piso ${piso}` : 'Otras'} <span className="font-normal text-neutral-400">· {delPiso.length}</span>
                </h2>
                <ul className="divide-y divide-neutral-100">
                  {delPiso.map((hab) => {
                    const estadia = estadiaDe(hab);
                    const activos = activosDe(hab.numero);
                    const checkout = estadia === 'ocupada' ? textoCheckout(hab.estadia_activa?.expira_at) : null;
                    const placaFuera = hab.estado_placa !== 'activa';

                    return (
                      <li key={hab.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-6 py-4 hover:bg-neutral-50/70 ${COLUMNAS}`}>
                        <span className="text-[22px] font-bold tabular-nums tracking-[-0.01em] text-neutral-900">{hab.numero}</span>

                        {/* Estadía (+ aviso de placa, solo lectura) */}
                        <div className="col-span-2 row-start-2 flex min-w-0 flex-col items-start gap-1 lg:col-span-1 lg:row-start-auto">
                          <span className={`flex items-center gap-2 text-[15px] font-semibold ${ESTADIA[estadia].textoClase}`}>
                            <span aria-hidden className={`h-2 w-2 rounded-full ${ESTADIA[estadia].punto}`} />
                            {ESTADIA[estadia].texto}
                          </span>
                          {checkout && <p className="pl-4 text-[13.5px] text-neutral-500">{checkout}</p>}
                          {placaFuera && (
                            <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-rose-600">
                              <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
                              Placa fuera de servicio · avisa a Seven Stay
                            </p>
                          )}
                        </div>

                        {/* Solicitudes */}
                        <div className="hidden lg:block">
                          {activos > 0 ? (
                            <Link href={enlaceSolicitudes(hab.numero)} className="text-[15px] font-semibold text-sky-700 hover:underline">
                              {activos} {activos === 1 ? 'activa' : 'activas'}
                            </Link>
                          ) : (
                            <span className="text-[15px] text-neutral-300">—</span>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 lg:col-start-auto lg:row-start-auto">
                          <a
                            href={`/p/${encodeURIComponent(hab.codigo_placa)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir el portal de la habitación ${hab.numero} en una pestaña nueva`}
                            className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:flex"
                          >
                            Abrir portal
                            <ExternalLink aria-hidden className="h-4 w-4" />
                          </a>
                          {estadia === 'ocupada' ? (
                            <button
                              type="button"
                              onClick={() => checkOut(hab.numero)}
                              className="flex h-10 w-[128px] items-center justify-center gap-1.5 rounded-lg border border-black/[0.1] bg-white text-[14px] font-semibold text-neutral-700 hover:bg-neutral-50"
                            >
                              <LogOut aria-hidden className="h-4 w-4" />
                              Check-out
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => checkIn(hab.numero, estadia === 'por_validar')}
                              disabled={placaFuera}
                              title={placaFuera ? 'No disponible: la placa de esta habitación está fuera de servicio' : undefined}
                              className="flex h-10 w-[128px] items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-[14px] font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <LogIn aria-hidden className="h-4 w-4" />
                              {estadia === 'por_validar' ? 'Confirmar' : 'Check-in'}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {dialogo}
    </main>
  );
}
