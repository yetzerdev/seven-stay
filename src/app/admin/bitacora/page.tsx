'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Loader2 } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, INPUT } from '@/components/admin/ui';
import type { EntradaBitacora, HotelResumen } from '@/lib/admin/tipos';

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-HN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Agrupa por día para leer la bitácora como un diario. */
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Quién del equipo de Seven Stay cambió qué y cuándo (las últimas 300 acciones). */
export default function BitacoraPage() {
  const { llamar } = useAdmin();
  const [hotelId, setHotelId] = useState('');
  const [hoteles, setHoteles] = useState<HotelResumen[]>([]);
  const [datos, setDatos] = useState<{ filtro: string; entradas: EntradaBitacora[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('hoteles', null).then(
      (h) => vivo && setHoteles(h),
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  useEffect(() => {
    let vivo = true;
    llamar('bitacora', hotelId ? { hotel_id: hotelId } : {}).then(
      (entradas) => {
        if (!vivo) return;
        setDatos({ filtro: hotelId, entradas });
        setError(null);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, hotelId]);

  const entradas = datos?.filtro === hotelId ? datos.entradas : null;
  const grupos: { dia: string; entradas: EntradaBitacora[] }[] = [];
  for (const e of entradas ?? []) {
    const d = dia(e.creado_at);
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === d) ultimo.entradas.push(e);
    else grupos.push({ dia: d, entradas: [e] });
  }

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Bitácora</h1>
          <p className="mt-1 text-[15px] text-neutral-500">Cada cambio hecho desde este panel: quién, qué y cuándo.</p>
        </div>
        <label className="w-full max-w-[300px]">
          <span className="sr-only">Filtrar por hotel</span>
          <select value={hotelId} onChange={(e) => setHotelId(e.target.value)} className={INPUT}>
            <option value="">Todos los hoteles</option>
            {hoteles.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
      </header>

      <AvisoError mensaje={error} />

      {!entradas ? (
        !error && (
          <div className="flex justify-center py-20">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )
      ) : entradas.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-black/[0.06] bg-white px-6 py-16 text-center">
          <History aria-hidden className="h-7 w-7 text-neutral-400" />
          <p className="mt-3 text-[15px] text-neutral-500">Todavía no hay cambios registrados.</p>
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.dia}>
            <h2 className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{g.dia}</h2>
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {g.entradas.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3">
                  <span className="w-[72px] shrink-0 text-[13px] tabular-nums text-neutral-400" title={fechaHora(e.creado_at)}>
                    {new Date(e.creado_at).toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 text-[14.5px] text-neutral-800">
                    <strong className="font-semibold">{e.admin_nombre}</strong> · {e.resumen}
                  </span>
                  {e.hotel_id && e.hotel_nombre && (
                    <Link href={`/admin/hoteles/${e.hotel_id}`} className="text-[13.5px] font-medium text-neutral-500 hover:text-neutral-900 hover:underline">
                      {e.hotel_nombre}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
