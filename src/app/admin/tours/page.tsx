'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, ImagePlus, Loader2, Pencil, Plus, Ticket, Trash2, X } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, BOTON_SECUNDARIO, Campo, EstadoPastilla, INPUT } from '@/components/admin/ui';
import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import type { EstadoReserva, ReservaTour, TourSevenStay } from '@/lib/admin/tipos';
import { comprimirFoto } from '@/lib/imagenes';
import { traducirAlIngles } from '@/lib/traduccion';
import type { Moneda } from '@/types/sevenstay';

const WHATSAPP_AGENTE = '50495197142';

const ESTADOS_RESERVA: { valor: EstadoReserva; texto: string; tono: 'ambar' | 'azul' | 'verde' | 'gris' }[] = [
  { valor: 'pendiente_pago', texto: 'Pendiente de pago', tono: 'ambar' },
  { valor: 'pagado', texto: 'Pagado', tono: 'azul' },
  { valor: 'completado', texto: 'Completado', tono: 'verde' },
  { valor: 'cancelado', texto: 'Cancelado', tono: 'gris' },
];

interface Formulario {
  titulo: string;
  descripcion: string;
  horario: string;
  precio: string;
  moneda: Moneda;
  activo: boolean;
  whatsapp: string;
  imagen_url: string | null;
  nueva: string | null;
  /** Uso interno (solo super_admin): % de Seven Stay y operador aliado. */
  comision: string;
  operador: string;
}
const VACIO: Formulario = {
  titulo: '',
  descripcion: '',
  horario: '',
  precio: '',
  moneda: 'USD',
  activo: true,
  whatsapp: WHATSAPP_AGENTE,
  imagen_url: null,
  nueva: null,
  comision: '20',
  operador: '',
};

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

function Catalogo() {
  const { llamar, admin } = useAdmin();
  const esSuper = admin?.rol === 'super_admin';
  const { confirmar, dialogo } = useConfirmacion();
  const [tours, setTours] = useState<TourSevenStay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null); // '' = nuevo
  const [form, setForm] = useState<Formulario>(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      setTours(await llamar('tours', null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los tours.');
    }
  }, [llamar]);

  useEffect(() => {
    let vivo = true;
    llamar('tours', null).then(
      (t) => vivo && setTours(t),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  const precio = Number(form.precio.replace(',', '.'));
  const errorTitulo = form.titulo.trim() ? undefined : 'Escribe el nombre del tour.';
  const errorPrecio = form.precio.trim() && Number.isFinite(precio) && precio >= 0 ? undefined : 'Precio por persona, ej. 45.';
  const cambiar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (t?: TourSevenStay) => {
    setEditando(t?.id ?? '');
    setIntentado(false);
    setAviso(null);
    setForm(
      t
        ? {
            titulo: t.titulo_es,
            descripcion: t.descripcion_es,
            horario: t.horario_o_duracion_es,
            precio: String(t.precio),
            moneda: t.moneda,
            activo: t.activo,
            whatsapp: t.whatsapp_destino,
            imagen_url: t.imagen_url,
            nueva: null,
            comision: String(t.comision_pct ?? 20),
            operador: t.operador ?? '',
          }
        : VACIO,
    );
  };

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProcesandoFoto(true);
    try {
      cambiar('nueva', await comprimirFoto(archivo, { ladoMax: 1200, bytesMax: 350 * 1024 }));
    } catch {
      setError('No pudimos procesar esa imagen.');
    } finally {
      setProcesandoFoto(false);
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorTitulo || errorPrecio || guardando || editando === null) return;
    setGuardando(true);
    setError(null);
    try {
      let imagen_url = form.imagen_url;
      if (form.nueva) imagen_url = (await llamar('subirImagen', { dataUrl: form.nueva, carpeta: 'seven-stay' })).url;
      const anterior = tours?.find((t) => t.id === editando);
      const [titulo, descripcion, horario] = [form.titulo.trim(), form.descripcion.trim(), form.horario.trim()];
      const ingles = await traducirAlIngles([titulo, descripcion, horario]);
      const en = (i: number, es: string, prevEs?: string, prevEn?: string) => ingles?.[i] || (prevEs === es && prevEn ? prevEn : es);
      await llamar('guardarTour', {
        ...(editando ? { id: editando } : {}),
        titulo_es: titulo,
        titulo_en: en(0, titulo, anterior?.titulo_es, anterior?.titulo_en),
        descripcion_es: descripcion,
        descripcion_en: en(1, descripcion, anterior?.descripcion_es, anterior?.descripcion_en),
        horario_o_duracion_es: horario,
        horario_o_duracion_en: en(2, horario, anterior?.horario_o_duracion_es, anterior?.horario_o_duracion_en),
        precio: Math.round(precio * 100) / 100,
        moneda: form.moneda,
        activo: form.activo,
        imagen_url,
        whatsapp_destino: form.whatsapp.replace(/\D/g, '') || WHATSAPP_AGENTE,
        comision_pct: esSuper ? Number(form.comision.replace(',', '.')) : null,
        operador: esSuper ? form.operador : null,
      });
      await cargar();
      setEditando(null);
      setAviso(ingles ? 'Tour guardado en español e inglés.' : 'Tour guardado. Este navegador no pudo traducirlo: guárdalo de nuevo desde Chrome para el inglés.');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (t: TourSevenStay) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${t.titulo_es}"?`,
      mensaje: 'Desaparece de todos los hoteles. Las reservas que ya existen se conservan. Si es de temporada, mejor desactívalo.',
      textoConfirmar: 'Eliminar tour',
      tono: 'peligro',
    });
    if (ok === false) return;
    try {
      await llamar('eliminarTour', { id: t.id });
      if (editando === t.id) setEditando(null);
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo eliminar.');
    }
  };

  const vista = form.nueva ?? form.imagen_url;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-neutral-500">Se muestran en los hoteles con modo «Solo tours de Seven Stay» o «Ambos».</p>
        <button type="button" onClick={() => abrir()} className={BOTON_PRIMARIO}>
          <Plus aria-hidden className="h-4 w-4" />
          Nuevo tour
        </button>
      </div>
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {aviso && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
          {aviso}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
          {!tours ? (
            <div className="flex justify-center py-14">
              <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : tours.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Compass aria-hidden className="h-7 w-7 text-neutral-400" />
              <p className="mt-3 text-[15px] text-neutral-500">Todavía no hay tours de Seven Stay.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {tours.map((t) => (
                <li key={t.id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4 ${editando === t.id ? 'bg-neutral-50' : ''}`}>
                  {t.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
                    <img src={t.imagen_url} alt="" className={`h-14 w-14 shrink-0 rounded-xl object-cover ${t.activo ? '' : 'opacity-50'}`} />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                      <Compass className="h-5 w-5" />
                    </span>
                  )}
                  <div className={`min-w-0 flex-1 ${t.activo ? '' : 'opacity-50'}`}>
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                      {t.titulo_es}
                      {!t.activo && <EstadoPastilla tono="gris">Inactivo</EstadoPastilla>}
                    </p>
                    {t.horario_o_duracion_es && <p className="text-[13.5px] text-neutral-500">{t.horario_o_duracion_es}</p>}
                  </div>
                  <p className="text-[16px] font-bold tabular-nums">{formatoPrecio(t.precio, t.moneda)}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => abrir(t)} aria-label={`Editar ${t.titulo_es}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                      <Pencil aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                    <button type="button" onClick={() => void eliminar(t)} aria-label={`Eliminar ${t.titulo_es}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editando !== null && (
          <form onSubmit={guardar} noValidate className="flex flex-col gap-4 rounded-2xl border border-black/[0.06] bg-white p-6 xl:sticky xl:top-[88px]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[19px] font-bold">{editando ? 'Editar tour' : 'Nuevo tour'}</h2>
                <p className="text-[14px] text-neutral-500">En español: el inglés se genera solo.</p>
              </div>
              <button type="button" onClick={() => !guardando && setEditando(null)} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              {vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local o URL de Storage
                <img src={vista} alt="Foto del tour" className="h-20 w-28 rounded-xl object-cover" />
              ) : (
                <span aria-hidden className="flex h-20 w-28 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-neutral-400">
                  <ImagePlus className="h-6 w-6" />
                </span>
              )}
              <div className="flex flex-col items-start gap-1">
                <button type="button" disabled={procesandoFoto} onClick={() => inputFoto.current?.click()} className={BOTON_SECUNDARIO}>
                  {procesandoFoto ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ImagePlus aria-hidden className="h-4 w-4" />}
                  {vista ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {vista && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, imagen_url: null, nueva: null }))} className="h-8 px-1 text-[13.5px] font-medium text-rose-600 hover:underline">
                    Quitar foto
                  </button>
                )}
              </div>
              <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} className="hidden" />
            </div>
            <Campo etiqueta="Nombre" error={intentado ? errorTitulo : undefined}>
              <input value={form.titulo} maxLength={80} onChange={(e) => cambiar('titulo', e.target.value)} className={INPUT} />
            </Campo>
            <Campo etiqueta="Descripción">
              <textarea rows={4} maxLength={600} value={form.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} className={`${INPUT} h-auto resize-none py-2.5`} />
            </Campo>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <Campo etiqueta="Precio por persona" error={intentado ? errorPrecio : undefined}>
                <input inputMode="decimal" value={form.precio} onChange={(e) => cambiar('precio', e.target.value)} className={`${INPUT} tabular-nums`} />
              </Campo>
              <Campo etiqueta="Moneda">
                <select value={form.moneda} onChange={(e) => cambiar('moneda', e.target.value === 'HNL' ? 'HNL' : 'USD')} className={INPUT}>
                  <option value="USD">Dólares</option>
                  <option value="HNL">Lempiras</option>
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Horario o duración" ayuda="Ej. Salidas 8:00 AM · 6 horas">
              <input value={form.horario} maxLength={80} onChange={(e) => cambiar('horario', e.target.value)} className={INPUT} />
            </Campo>
            <Campo etiqueta="WhatsApp del agente" ayuda="Con código de país. Por defecto, el Agente Oficial de Seven Stay.">
              <input inputMode="tel" value={form.whatsapp} onChange={(e) => cambiar('whatsapp', e.target.value)} className={`${INPUT} tabular-nums`} />
            </Campo>
            {esSuper && (
              <fieldset className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 p-4">
                <legend className="px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-400">Uso interno · el huésped no lo ve</legend>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                  <Campo etiqueta="Comisión %">
                    <input inputMode="decimal" value={form.comision} onChange={(e) => cambiar('comision', e.target.value)} className={`${INPUT} tabular-nums`} />
                  </Campo>
                  <Campo etiqueta="Operador aliado">
                    <input value={form.operador} maxLength={80} onChange={(e) => cambiar('operador', e.target.value)} placeholder="Ej. Roatán Adventures" className={INPUT} />
                  </Campo>
                </div>
                {precio > 0 && Number(form.comision.replace(',', '.')) >= 0 && (
                  <p className="text-[13px] tabular-nums text-neutral-500">
                    Por persona: Seven Stay {formatoPrecio((precio * Number(form.comision.replace(',', '.'))) / 100, form.moneda)} · al operador{' '}
                    {formatoPrecio(precio - (precio * Number(form.comision.replace(',', '.'))) / 100, form.moneda)}
                  </p>
                )}
              </fieldset>
            )}
            <label className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-4 py-3">
              <input type="checkbox" checked={form.activo} onChange={(e) => cambiar('activo', e.target.checked)} className="h-5 w-5 accent-neutral-900" />
              <span className="text-[15px]">Activo: se muestra en los portales</span>
            </label>
            <button type="submit" disabled={guardando || procesandoFoto} className={BOTON_PRIMARIO}>
              {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar tour'}
            </button>
          </form>
        )}
      </div>
      {dialogo}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------

/** Parte de Seven Stay y del operador en una reserva (null si no hay comisión registrada). */
function reparto(r: ReservaTour) {
  const total = r.precio_unitario * r.personas;
  if (r.comision_pct === null) return null;
  const sevenStay = Math.round(total * r.comision_pct) / 100;
  return { total, sevenStay, operador: Math.round((total - sevenStay) * 100) / 100 };
}

function Reservas() {
  const { llamar, admin } = useAdmin();
  const esSuper = admin?.rol === 'super_admin';
  const [filtro, setFiltro] = useState<EstadoReserva | 'todas'>('pendiente_pago');
  const [reservas, setReservas] = useState<ReservaTour[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('reservas', { estado: filtro }).then(
      (r) => {
        if (!vivo) return;
        setReservas(r);
        setError(null);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, filtro]);

  const cambiarEstado = async (r: ReservaTour, estado: EstadoReserva) => {
    setOcupado(r.id);
    try {
      await llamar('estadoReserva', { id: r.id, estado });
      setReservas((lista) => (lista ?? []).map((x) => (x.id === r.id ? { ...x, estado } : x)).filter((x) => filtro === 'todas' || x.estado === filtro));
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.');
    } finally {
      setOcupado(null);
    }
  };

  // Liquidación: lo cobrado (pagado o completado) agrupado por operador y moneda.
  const liquidacion = new Map<string, { operador: string; moneda: Moneda; reservas: number; total: number; sevenStay: number; alOperador: number }>();
  if (esSuper) {
    for (const r of reservas ?? []) {
      const p = reparto(r);
      if (!p || (r.estado !== 'pagado' && r.estado !== 'completado')) continue;
      const clave = `${r.operador || 'Sin operador'}|${r.moneda}`;
      const l = liquidacion.get(clave) ?? { operador: r.operador || 'Sin operador', moneda: r.moneda, reservas: 0, total: 0, sevenStay: 0, alOperador: 0 };
      l.reservas++;
      l.total += p.total;
      l.sevenStay += p.sevenStay;
      l.alOperador += p.operador;
      liquidacion.set(clave, l);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Filtrar reservas" className="flex w-fit flex-wrap gap-1 rounded-xl border border-black/[0.08] bg-white p-1">
        {[{ valor: 'todas' as const, texto: 'Todas' }, ...ESTADOS_RESERVA].map((e) => (
          <button
            key={e.valor}
            type="button"
            role="radio"
            aria-checked={filtro === e.valor}
            onClick={() => {
              setFiltro(e.valor);
              setReservas(null);
            }}
            className={`h-9 rounded-lg px-4 text-[14px] font-semibold ${filtro === e.valor ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
          >
            {e.texto}
          </button>
        ))}
      </div>
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {liquidacion.size > 0 && (
        <section className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <h2 className="text-[17px] font-bold">Liquidación con operadores</h2>
          <p className="text-[14px] text-neutral-500">Reservas pagadas o completadas de esta lista: lo que es de Seven Stay y lo que se le transfiere a cada operador.</p>
          <table className="mt-4 w-full text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-neutral-200 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                <th className="pb-2 font-semibold">Operador</th>
                <th className="pb-2 text-right font-semibold">Reservas</th>
                <th className="pb-2 text-right font-semibold">Cobrado</th>
                <th className="pb-2 text-right font-semibold">Seven Stay</th>
                <th className="pb-2 text-right font-semibold">A transferir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {[...liquidacion.values()].map((l) => (
                <tr key={`${l.operador}-${l.moneda}`}>
                  <td className="py-2.5 font-semibold">{l.operador}</td>
                  <td className="py-2.5 text-right tabular-nums">{l.reservas}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatoPrecio(l.total, l.moneda)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-emerald-700">{formatoPrecio(l.sevenStay, l.moneda)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatoPrecio(l.alOperador, l.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
        {!reservas ? (
          <div className="flex justify-center py-14">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : reservas.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Ticket aria-hidden className="h-7 w-7 text-neutral-400" />
            <p className="mt-3 text-[15px] text-neutral-500">No hay reservas en este estado.</p>
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                <th className="px-6 py-2.5 font-semibold">Voucher</th>
                <th className="px-3 py-2.5 font-semibold">Tour</th>
                <th className="px-3 py-2.5 font-semibold">Hotel · Hab.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                {esSuper && <th className="px-3 py-2.5 text-right font-semibold">Seven Stay</th>}
                {esSuper && <th className="px-3 py-2.5 font-semibold">Operador</th>}
                <th className="px-3 py-2.5 font-semibold">Fecha</th>
                <th className="px-6 py-2.5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reservas.map((r) => (
                <tr key={r.id} className={ocupado === r.id ? 'opacity-50' : ''}>
                  <td className="px-6 py-3 font-mono text-[13px] tracking-wide">{r.voucher_codigo}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold">{r.tour_titulo}</p>
                    <p className="text-[13px] text-neutral-500">
                      {r.personas} {r.personas === 1 ? 'persona' : 'personas'}
                      {r.nota ? ` · “${r.nota}”` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {r.hotel_nombre} · <span className="font-semibold">{r.habitacion_numero}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatoPrecio(r.precio_unitario * r.personas, r.moneda)}</td>
                  {esSuper && (
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                      {reparto(r) ? (
                        <>
                          {formatoPrecio(reparto(r)!.sevenStay, r.moneda)}
                          <span className="block text-[12px] text-neutral-400">{r.comision_pct}%</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {esSuper && (
                    <td className="px-3 py-3 text-[13.5px]">
                      {r.operador || <span className="text-neutral-400">Sin operador</span>}
                      {reparto(r) && <span className="block tabular-nums text-neutral-500">{formatoPrecio(reparto(r)!.operador, r.moneda)}</span>}
                    </td>
                  )}
                  <td className="px-3 py-3 text-[13.5px] text-neutral-500">
                    {new Date(r.creado_at).toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={r.estado}
                      disabled={ocupado !== null}
                      onChange={(e) => void cambiarEstado(r, e.target.value as EstadoReserva)}
                      aria-label={`Estado de la reserva ${r.voucher_codigo}`}
                      className="h-9 rounded-lg border border-black/[0.1] bg-white px-2 text-[14px] font-medium outline-none focus:border-neutral-900"
                    >
                      {ESTADOS_RESERVA.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.texto}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Tours de Seven Stay: catálogo (para todos los hoteles) y reservas de los huéspedes. */
export default function ToursAdminPage() {
  const router = useRouter();
  const params = useSearchParams();
  const pestana = params.get('pestana') === 'reservas' ? 'reservas' : 'catalogo';
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Tours y reservas</h1>
        <p className="mt-1 text-[15px] text-neutral-500">Experiencias operadas por Seven Stay y lo que reservan los huéspedes.</p>
      </header>
      <nav aria-label="Secciones" className="flex gap-1 border-b border-neutral-200">
        {[
          { valor: 'catalogo', texto: 'Catálogo' },
          { valor: 'reservas', texto: 'Reservas' },
        ].map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => router.replace(`/admin/tours?pestana=${p.valor}`, { scroll: false })}
            aria-current={pestana === p.valor ? 'page' : undefined}
            className={`relative h-12 px-4 text-[15px] font-semibold ${pestana === p.valor ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-800'}`}
          >
            {p.texto}
            {pestana === p.valor && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-neutral-900" />}
          </button>
        ))}
      </nav>
      {pestana === 'catalogo' ? <Catalogo /> : <Reservas />}
    </main>
  );
}
