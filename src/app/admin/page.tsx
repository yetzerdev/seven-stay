'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, Loader2, Plus, Search } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, EstadoPastilla, INPUT } from '@/components/admin/ui';
import type { HotelResumen } from '@/lib/admin/tipos';

const MODOS = { seven_stay: 'Tours Seven Stay', propios: 'Tours propios', ambos: 'Tours: ambos' } as const;

/** Lista de hoteles de Seven Stay. */
export default function HotelesAdminPage() {
  const { llamar } = useAdmin();
  const [hoteles, setHoteles] = useState<HotelResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let vivo = true;
    llamar('hoteles', null).then(
      (h) => vivo && setHoteles(h),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  const filtro = busqueda.trim().toLowerCase();
  const visibles = (hoteles ?? []).filter((h) => !filtro || h.nombre.toLowerCase().includes(filtro));
  const activos = (hoteles ?? []).filter((h) => h.estado === 'activo').length;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Hoteles</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            {hoteles ? `${hoteles.length} ${hoteles.length === 1 ? 'hotel' : 'hoteles'} · ${activos} activos` : 'Cargando…'}
          </p>
        </div>
        <Link href="/admin/hoteles/nuevo" className={BOTON_PRIMARIO}>
          <Plus aria-hidden className="h-4 w-4" />
          Nuevo hotel
        </Link>
      </header>

      <AvisoError mensaje={error} />

      {hoteles && hoteles.length > 5 && (
        <label className="relative max-w-[360px]">
          <span className="sr-only">Buscar hotel</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar hotel" className={`${INPUT} pl-10`} />
        </label>
      )}

      {!hoteles && !error && (
        <div className="flex justify-center py-20">
          <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      )}

      {hoteles?.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-black/[0.06] bg-white px-6 py-16 text-center">
          <Building2 aria-hidden className="h-8 w-8 text-neutral-400" />
          <p className="mt-4 text-[18px] font-semibold">Todavía no hay hoteles</p>
          <p className="mt-1 max-w-[380px] text-[15px] text-neutral-500">Crea el primero: después le agregas habitaciones, imprimes sus placas e invitas a su gerencia.</p>
          <Link href="/admin/hoteles/nuevo" className={`${BOTON_PRIMARIO} mt-5`}>
            <Plus aria-hidden className="h-4 w-4" />
            Crear el primer hotel
          </Link>
        </div>
      )}

      {visibles.length > 0 && (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
          {visibles.map((h) => (
            <li key={h.id}>
              <Link href={`/admin/hoteles/${h.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 hover:bg-neutral-50">
                {h.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
                  <img src={h.logo_url} alt="" className="h-10 w-14 shrink-0 object-contain" />
                ) : (
                  <span aria-hidden className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
                    <Building2 className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[16.5px] font-semibold">
                    {h.nombre}
                    {h.estado === 'suspendido' && <EstadoPastilla tono="rojo">Suspendido</EstadoPastilla>}
                    {h.estado === 'activo' && h.pago_vencido && <EstadoPastilla tono="ambar">Pago vencido</EstadoPastilla>}
                  </p>
                  <p className="mt-0.5 text-[13.5px] text-neutral-500">{MODOS[h.modo_tours]}</p>
                </div>
                <dl className="flex gap-8 text-[13px] text-neutral-500">
                  {[
                    ['Habitaciones', h.habitaciones, h.placas_activas < h.habitaciones ? `${h.placas_activas} placas activas` : null],
                    ['Usuarios', h.usuarios, h.usuarios === 0 ? 'Sin acceso al panel' : null],
                    ['Solicitudes 24 h', h.solicitudes_hoy, null],
                  ].map(([etiqueta, valor, nota]) => (
                    <div key={String(etiqueta)} className="min-w-[96px]">
                      <dt>{etiqueta}</dt>
                      <dd className="text-[18px] font-bold tabular-nums text-neutral-900">{valor}</dd>
                      {nota && <dd className="text-[12px] text-amber-700">{nota}</dd>}
                    </div>
                  ))}
                </dl>
                <ChevronRight aria-hidden className="h-5 w-5 text-neutral-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
