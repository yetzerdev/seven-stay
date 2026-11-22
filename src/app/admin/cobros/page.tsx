'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Pencil, Plus, Receipt, X } from 'lucide-react';

import ModalPagos, { fechaCorta } from '@/components/admin/ModalPagos';
import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, EstadoPastilla, INPUT } from '@/components/admin/ui';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import type { CobroHotel, Plan } from '@/lib/admin/tipos';
import type { Moneda } from '@/types/sevenstay';

const ESTADOS = {
  al_dia: { texto: 'Al día', tono: 'verde' },
  por_vencer: { texto: 'Por vencer', tono: 'azul' },
  vencido: { texto: 'Vencido', tono: 'ambar' },
  sin_plan: { texto: 'Sin plan', tono: 'gris' },
} as const;

/** Desde estos días de atraso la alerta pasa a rojo: hay que llamar al hotel (la suspensión sigue siendo manual). */
const DIAS_LLAMAR = 10;
const debeLlamar = (c: CobroHotel) => c.estado_cobro === 'vencido' && (c.dias === null || c.dias >= DIAS_LLAMAR);

// ---------------------------------------------------------------------------
// Hoteles
// ---------------------------------------------------------------------------

function Hoteles() {
  const { llamar } = useAdmin();
  const [cobros, setCobros] = useState<CobroHotel[] | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<CobroHotel | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([llamar('cobros', null), llamar('planes', null)]);
      setCobros(c);
      setPlanes(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los cobros.');
    }
  }, [llamar]);

  useEffect(() => {
    let vivo = true;
    Promise.all([llamar('cobros', null), llamar('planes', null)]).then(
      ([c, p]) => {
        if (!vivo) return;
        setCobros(c);
        setPlanes(p);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  const asignar = async (c: CobroHotel, plan_id: string) => {
    setOcupado(c.id);
    try {
      await llamar('asignarPlan', { hotel_id: c.id, plan_id: plan_id || null });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar el plan.');
    } finally {
      setOcupado(null);
    }
  };

  // Ingreso mensual esperado de los hoteles activos con plan, por moneda.
  const esperado = (moneda: Moneda) =>
    (cobros ?? []).filter((c) => c.estado_hotel === 'activo' && c.moneda === moneda).reduce((s, c) => s + (c.mensualidad ?? 0), 0);
  const vencidos = (cobros ?? []).filter((c) => c.estado_cobro === 'vencido' && c.estado_hotel === 'activo');
  const porLlamar = vencidos.filter(debeLlamar);
  const porVencer = (cobros ?? []).filter((c) => c.estado_cobro === 'por_vencer');
  const orden = { vencido: 0, por_vencer: 1, sin_plan: 2, al_dia: 3 };
  const lista = [...(cobros ?? [])].sort(
    (a, b) => Number(debeLlamar(b)) - Number(debeLlamar(a)) || orden[a.estado_cobro] - orden[b.estado_cobro] || a.nombre.localeCompare(b.nombre),
  );

  const ajustar = async (c: CobroHotel, cambios: { habitaciones_contratadas?: number; tarifa_habitacion?: number | null }) => {
    setOcupado(c.id);
    try {
      await llamar('ajustarCobro', {
        hotel_id: c.id,
        habitaciones_contratadas: cambios.habitaciones_contratadas ?? c.habitaciones_contratadas,
        tarifa_habitacion: cambios.tarifa_habitacion !== undefined ? cambios.tarifa_habitacion : c.tarifa_habitacion,
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ajustar el cobro.');
    } finally {
      setOcupado(null);
    }
  };

  if (!cobros) {
    return error ? (
      <AvisoError mensaje={error} />
    ) : (
      <div className="flex justify-center py-20">
        <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
          <p className="text-[13px] font-semibold text-neutral-500">Ingreso mensual esperado</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums tracking-[-0.02em]">{formatoPrecio(esperado('USD'), 'USD')}</p>
          {esperado('HNL') > 0 && <p className="text-[14px] font-semibold tabular-nums text-neutral-600">+ {formatoPrecio(esperado('HNL'), 'HNL')}</p>}
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${porLlamar.length ? 'border-rose-200 bg-rose-50' : vencidos.length ? 'border-amber-200 bg-amber-50' : 'border-black/[0.06] bg-white'}`}>
          <p className={`text-[13px] font-semibold ${porLlamar.length ? 'text-rose-700' : vencidos.length ? 'text-amber-800' : 'text-neutral-500'}`}>Vencidos</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums">{vencidos.length}</p>
          <p className="text-[12.5px] text-neutral-500">
            {porLlamar.length ? `${porLlamar.length} con ${DIAS_LLAMAR}+ días: llamar` : 'Hoteles activos sin pago al día'}
          </p>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
          <p className="text-[13px] font-semibold text-neutral-500">Por vencer</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums">{porVencer.length}</p>
          <p className="text-[12.5px] text-neutral-500">En los próximos 7 días</p>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
          <p className="text-[13px] font-semibold text-neutral-500">Sin plan</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums">{cobros.filter((c) => c.estado_cobro === 'sin_plan').length}</p>
          <p className="text-[12.5px] text-neutral-500">No se les cobra todavía</p>
        </div>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      {planes.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900">
          Primero crea tus planes en la pestaña «Planes» y luego asígnalos a cada hotel.
        </p>
      )}

      <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
        <table className="w-full min-w-[1120px] text-left text-[14.5px]">
          <thead>
            <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
              <th className="px-6 py-3 font-semibold">Hotel</th>
              <th className="px-3 py-3 font-semibold">Plan</th>
              <th className="px-3 py-3 text-right font-semibold">Contratadas</th>
              <th className="px-3 py-3 text-right font-semibold">Activas</th>
              <th className="px-3 py-3 text-right font-semibold">Tarifa / hab.</th>
              <th className="px-3 py-3 text-right font-semibold">Mensualidad</th>
              <th className="px-3 py-3 font-semibold">Pagado hasta</th>
              <th className="px-3 py-3 font-semibold">Estado</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lista.map((c) => {
              const e = ESTADOS[c.estado_cobro];
              return (
                <tr key={c.id} className={ocupado === c.id ? 'opacity-50' : ''}>
                  <td className="px-6 py-3">
                    <Link href={`/admin/hoteles/${c.id}`} className="font-semibold hover:underline">
                      {c.nombre}
                    </Link>
                    {c.estado_hotel === 'suspendido' && <span className="ml-2 text-[12.5px] font-semibold text-rose-600">Suspendido</span>}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={c.plan_id ?? ''}
                      disabled={ocupado !== null || planes.length === 0}
                      onChange={(ev) => void asignar(c, ev.target.value)}
                      aria-label={`Plan de ${c.nombre}`}
                      className="h-9 max-w-[200px] rounded-lg border border-black/[0.1] bg-white px-2 text-[14px] outline-none focus:border-neutral-900"
                    >
                      <option value="">Sin plan</option>
                      {planes
                        .filter((p) => p.activo || p.id === c.plan_id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      key={`${c.id}-${c.habitaciones_contratadas}`}
                      inputMode="numeric"
                      defaultValue={c.habitaciones_contratadas || ''}
                      placeholder="0"
                      disabled={ocupado !== null}
                      aria-label={`Habitaciones contratadas de ${c.nombre}`}
                      title="Mínimo de habitaciones que se cobran"
                      onBlur={(ev) => {
                        const n = Math.max(0, Math.trunc(Number(ev.target.value.replace(/\D/g, '')) || 0));
                        if (n !== c.habitaciones_contratadas) void ajustar(c, { habitaciones_contratadas: n });
                      }}
                      className="h-9 w-20 rounded-lg border border-black/[0.1] bg-white px-2 text-right text-[14px] tabular-nums outline-none focus:border-neutral-900"
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {c.habitaciones_activas}
                    {c.habitaciones_cobradas > c.habitaciones_activas && (
                      <span className="block text-[11.5px] text-neutral-400">se cobran {c.habitaciones_cobradas}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {c.plan_id && c.moneda ? (
                      <input
                        key={`${c.id}-${c.tarifa_habitacion}`}
                        inputMode="decimal"
                        defaultValue={c.tarifa_habitacion ?? ''}
                        disabled={ocupado !== null}
                        aria-label={`Tarifa por habitación de ${c.nombre}`}
                        title="Tarifa acordada con este hotel (no cambia si sube el precio del plan)"
                        onBlur={(ev) => {
                          const v = Number(ev.target.value.replace(',', '.'));
                          if (Number.isFinite(v) && v >= 0 && v !== c.tarifa_habitacion) void ajustar(c, { tarifa_habitacion: v });
                        }}
                        className="h-9 w-20 rounded-lg border border-black/[0.1] bg-white px-2 text-right text-[14px] tabular-nums outline-none focus:border-neutral-900"
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {c.mensualidad !== null && c.moneda ? formatoPrecio(c.mensualidad, c.moneda) : '—'}
                  </td>
                  <td className="px-3 py-3 text-neutral-600">{c.pagado_hasta ? fechaCorta(c.pagado_hasta) : '—'}</td>
                  <td className="px-3 py-3">
                    <EstadoPastilla tono={debeLlamar(c) ? 'rojo' : e.tono}>
                      {debeLlamar(c) ? 'Llamar' : e.texto}
                      {c.estado_cobro === 'vencido' && c.dias !== null && ` · ${c.dias} ${c.dias === 1 ? 'día' : 'días'}`}
                      {c.estado_cobro === 'por_vencer' && c.dias !== null && ` · ${c.dias === 0 ? 'hoy' : `en ${c.dias} ${c.dias === 1 ? 'día' : 'días'}`}`}
                    </EstadoPastilla>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setAbierto(c)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      <Receipt aria-hidden className="h-4 w-4" />
                      Pagos
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-[13px] text-neutral-500">
        Se cobra la tarifa acordada × el mayor entre habitaciones contratadas y placas activas. Vencido de 1 a {DIAS_LLAMAR - 1} días = ámbar; {DIAS_LLAMAR} o más = «Llamar». Un hotel vencido no se suspende solo: si hace falta, suspéndelo desde su ficha.
      </p>

      {abierto && (
        <ModalPagos
          cobro={abierto}
          onCerrar={() => setAbierto(null)}
          onRegistrado={() => void cargar()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

interface FormPlan {
  nombre: string;
  descripcion: string;
  precio: string;
  moneda: Moneda;
  activo: boolean;
}
const PLAN_VACIO: FormPlan = { nombre: '', descripcion: '', precio: '', moneda: 'USD', activo: true };

function Planes() {
  const { llamar } = useAdmin();
  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormPlan>(PLAN_VACIO);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aplicarActuales, setAplicarActuales] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('planes', null).then(
      (p) => vivo && setPlanes(p),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  const precio = Number(form.precio.replace(',', '.'));
  const errorNombre = form.nombre.trim() ? undefined : 'Escribe el nombre del plan.';
  const errorPrecio = form.precio.trim() && Number.isFinite(precio) && precio >= 0 ? undefined : 'Precio por habitación al mes, ej. 3.';

  const abrir = (p?: Plan) => {
    setEditando(p?.id ?? '');
    setIntentado(false);
    setAplicarActuales(false);
    setAviso(null);
    setForm(p ? { nombre: p.nombre, descripcion: p.descripcion, precio: String(p.precio_habitacion), moneda: p.moneda, activo: p.activo } : PLAN_VACIO);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorNombre || errorPrecio || editando === null) return;
    setGuardando(true);
    try {
      const anterior = planes?.find((x) => x.id === editando);
      const r = await llamar('guardarPlan', {
        ...(editando ? { id: editando, aplicar_a_actuales: aplicarActuales } : {}),
        nombre: form.nombre,
        descripcion: form.descripcion,
        precio_habitacion: precio,
        moneda: form.moneda,
        activo: form.activo,
      });
      setPlanes(await llamar('planes', null));
      setEditando(null);
      setAviso(
        anterior && anterior.precio_habitacion !== precio
          ? aplicarActuales
            ? `Plan guardado. Se actualizó la tarifa de ${r.actualizados} ${r.actualizados === 1 ? 'hotel' : 'hoteles'}.`
            : 'Plan guardado. El precio nuevo aplica a los hoteles que reciban este plan desde ahora; los actuales conservan su tarifa.'
          : 'Plan guardado.',
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el plan.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-neutral-500">Cada plan cobra un precio mensual por habitación con placa activa.</p>
        <button type="button" onClick={() => abrir()} className={BOTON_PRIMARIO}>
          <Plus aria-hidden className="h-4 w-4" />
          Nuevo plan
        </button>
      </div>
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {aviso && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
          {aviso}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
          {!planes ? (
            <div className="flex justify-center py-14">
              <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : planes.length === 0 ? (
            <p className="px-6 py-14 text-center text-[15px] text-neutral-500">Todavía no hay planes. Ej. «Básico» a $3 por habitación al mes.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {planes.map((p) => (
                <li key={p.id} className={`flex items-center gap-4 px-6 py-4 ${editando === p.id ? 'bg-neutral-50' : ''}`}>
                  <div className={`min-w-0 flex-1 ${p.activo ? '' : 'opacity-50'}`}>
                    <p className="flex items-center gap-2 text-[16px] font-semibold">
                      {p.nombre}
                      {!p.activo && <EstadoPastilla tono="gris">Inactivo</EstadoPastilla>}
                    </p>
                    {p.descripcion && <p className="text-[13.5px] text-neutral-500">{p.descripcion}</p>}
                  </div>
                  <p className="text-right">
                    <span className="block text-[17px] font-bold tabular-nums">{formatoPrecio(p.precio_habitacion, p.moneda)}</span>
                    <span className="text-[12px] text-neutral-400">por habitación / mes</span>
                  </p>
                  <button type="button" onClick={() => abrir(p)} aria-label={`Editar ${p.nombre}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                    <Pencil aria-hidden className="h-[18px] w-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editando !== null && (
          <form onSubmit={guardar} noValidate className="flex flex-col gap-4 rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-[19px] font-bold">{editando ? 'Editar plan' : 'Nuevo plan'}</h2>
              <button type="button" onClick={() => setEditando(null)} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <Campo etiqueta="Nombre" error={intentado ? errorNombre : undefined}>
              <input value={form.nombre} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={INPUT} />
            </Campo>
            <Campo etiqueta="Descripción (opcional)">
              <input value={form.descripcion} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className={INPUT} />
            </Campo>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <Campo etiqueta="Precio por habitación / mes" error={intentado ? errorPrecio : undefined}>
                <input inputMode="decimal" value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} className={`${INPUT} tabular-nums`} />
              </Campo>
              <Campo etiqueta="Moneda">
                <select value={form.moneda} onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value === 'HNL' ? 'HNL' : 'USD' }))} className={INPUT}>
                  <option value="USD">Dólares</option>
                  <option value="HNL">Lempiras</option>
                </select>
              </Campo>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-4 py-3">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="h-5 w-5 accent-neutral-900" />
              <span className="text-[15px]">Activo: se puede asignar a hoteles nuevos</span>
            </label>
            {editando && planes?.find((x) => x.id === editando)?.precio_habitacion !== precio && Number.isFinite(precio) && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <input type="checkbox" checked={aplicarActuales} onChange={(e) => setAplicarActuales(e.target.checked)} className="mt-0.5 h-5 w-5 accent-neutral-900" />
                <span className="text-[14px] text-amber-950">
                  Aplicar el precio nuevo también a los hoteles que ya tienen este plan
                  <span className="mt-0.5 block text-[12.5px] text-amber-800">
                    Si no lo marcas, solo cambia para los hoteles que reciban el plan desde ahora (los actuales conservan su tarifa acordada).
                  </span>
                </span>
              </label>
            )}
            <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
              {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar plan'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Cobro a hoteles: planes por habitación y pagos registrados a mano. */
export default function CobrosPage() {
  const router = useRouter();
  const params = useSearchParams();
  const pestana = params.get('pestana') === 'planes' ? 'planes' : 'hoteles';
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Cobros</h1>
        <p className="mt-1 text-[15px] text-neutral-500">Lo que paga cada hotel a Seven Stay y quién está atrasado.</p>
      </header>
      <nav aria-label="Secciones" className="flex gap-1 border-b border-neutral-200">
        {[
          { valor: 'hoteles', texto: 'Hoteles' },
          { valor: 'planes', texto: 'Planes' },
        ].map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => router.replace(`/admin/cobros?pestana=${p.valor}`, { scroll: false })}
            aria-current={pestana === p.valor ? 'page' : undefined}
            className={`relative h-12 px-4 text-[15px] font-semibold ${pestana === p.valor ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-800'}`}
          >
            {p.texto}
            {pestana === p.valor && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-neutral-900" />}
          </button>
        ))}
      </nav>
      {pestana === 'planes' ? <Planes /> : <Hoteles />}
    </main>
  );
}
