'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, INPUT } from '@/components/admin/ui';
import type { DatosCobroHotel, HotelResumen, NuevaFactura } from '@/lib/admin/tipos';
import {
  CONCEPTOS,
  cotizarMensualidad,
  cotizarPlacas,
  cotizarReposicion,
  lempiras,
  montoEnLetras,
  PLACAS,
  PLANES_SAAS,
  r2,
  REPOSICION,
  totalesSar,
  type Concepto,
  type PlanSaas,
  type TipoPlaca,
} from '@/lib/facturacion/tarifas';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };
const fechaLocal = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('en-CA');
};
const mesActual = () => {
  const t = new Date().toLocaleDateString('es-HN', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** total_con_isv = precio cerrado (placas, anticipo, saldo, reposición): el total final no se mueve ni un centavo. */
type Linea = { cantidad: string; descripcion: string; precio_unitario: string; concepto: Concepto; total_con_isv: number | null };

export const FACTURA_VACIA: NuevaFactura = {
  hotel_id: null,
  cotizacion_id: null,
  cliente_nombre: '',
  cliente_rtn: '',
  cliente_direccion: '',
  condicion: 'contado',
  vence: '',
  lineas: [],
  orden_compra_exenta: '',
  constancia_exonerado: '',
  registro_sag: '',
  descuentos: 0,
  mensualidad_meses: null,
};

// ---------------------------------------------------------------------------
// Conceptos con las tarifas oficiales
// ---------------------------------------------------------------------------

function lineaMensualidad(plan: PlanSaas, mes: string, meses = 1): Linea {
  return {
    cantidad: String(meses),
    descripcion: `${CONCEPTOS.mensualidad} — Plan ${PLANES_SAAS[plan].nombre} — ${meses > 1 ? `${meses} meses desde ${mes}` : mes}`,
    precio_unitario: String(PLANES_SAAS[plan].mensual),
    concepto: 'mensualidad',
    total_con_isv: null,
  };
}

function lineaPlacas(concepto: 'anticipo_placas' | 'saldo_placas', tipo: TipoPlaca, n: number): Linea {
  const p = cotizarPlacas(tipo, n);
  const total = concepto === 'anticipo_placas' ? p.anticipo : p.saldo;
  return {
    cantidad: '1',
    descripcion: `${CONCEPTOS[concepto]} — ${PLACAS[tipo].nombre}: ${n} placas × L. ${p.unitarioConIsv.toFixed(2)} ISV incluido`,
    precio_unitario: String(concepto === 'anticipo_placas' ? p.anticipoSinIsv : p.saldoSinIsv),
    concepto,
    total_con_isv: total,
  };
}

function lineaReposicion(tipo: TipoPlaca, n: number): Linea {
  const r = cotizarReposicion(tipo, n);
  return {
    cantidad: '1',
    descripcion: `${REPOSICION[tipo].nombre}: ${n} ${n === 1 ? 'placa' : 'placas'} × L. ${REPOSICION[tipo].final.toFixed(2)} ISV incluido`,
    precio_unitario: String(r.subtotal),
    concepto: 'reposicion',
    total_con_isv: r.total,
  };
}

/** Botón grande de cobro rápido. */
function BotonCobro({ titulo, detalle, monto, activo, onClick }: { titulo: string; detalle: string; monto: number; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex flex-col items-start rounded-xl border-2 px-4 py-3 text-left transition-colors ${
        activo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/[0.1] bg-white hover:border-neutral-900'
      }`}
    >
      <span className="text-[14.5px] font-bold">{titulo}</span>
      <span className="mt-0.5 text-[22px] font-black tabular-nums tracking-[-0.01em]">{lempiras(monto)}</span>
      <span className={`text-[12px] ${activo ? 'text-white/70' : 'text-neutral-500'}`}>{detalle}</span>
    </button>
  );
}

/**
 * Emisión de una factura SAR en 2 clics: eliges el hotel (rellena razón social,
 * RTN, dirección, plan, habitaciones y placa) y tocas qué cobrar. El servidor
 * recalcula totales, monto en letras y asigna el número correlativo del CAI.
 */
export default function EmitirFactura({
  inicial,
  onCerrar,
  onEmitida,
}: {
  inicial: NuevaFactura;
  onCerrar: () => void;
  onEmitida: (id: string, numero: string) => void;
}) {
  const { llamar } = useAdmin();
  const [hoteles, setHoteles] = useState<HotelResumen[]>([]);
  const [datosHotel, setDatosHotel] = useState<DatosCobroHotel | null>(null);
  const [cargandoHotel, setCargandoHotel] = useState(false);
  const [f, setF] = useState<Omit<NuevaFactura, 'lineas'>>({
    ...inicial,
    vence: inicial.condicion === 'credito' ? inicial.vence || fechaLocal(30) : fechaLocal(),
  });
  const [lineas, setLineas] = useState<Linea[]>(
    inicial.lineas.map((l) => ({
      cantidad: String(l.cantidad),
      descripcion: l.descripcion,
      precio_unitario: String(l.precio_unitario),
      concepto: l.concepto,
      total_con_isv: l.total_con_isv ?? null,
    })),
  );
  const [verOtros, setVerOtros] = useState(false);
  const [verOpcionales, setVerOpcionales] = useState(Boolean(inicial.registro_sag || inicial.orden_compra_exenta || inicial.constancia_exonerado || inicial.descuentos));
  // Para "+ Agregar otro concepto".
  const [planOtro, setPlanOtro] = useState<PlanSaas>('boutique');
  const [placaOtra, setPlacaOtra] = useState<TipoPlaca>('esencial');
  const [cantidadOtra, setCantidadOtra] = useState('1');
  const [descuento, setDescuento] = useState(inicial.descuentos ? String(inicial.descuentos) : '');
  const [emitiendo, setEmitiendo] = useState(false);
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

  // Si llega con hotel (desde Suscripciones o una cotización), se cargan sus datos de cobro.
  useEffect(() => {
    if (!inicial.hotel_id) return;
    let vivo = true;
    llamar('datosCobroHotel', { hotel_id: inicial.hotel_id }).then(
      (d) => vivo && setDatosHotel(d),
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [llamar, inicial.hotel_id]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !emitiendo && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [emitiendo, onCerrar]);

  const num = (v: string) => Number(v.replace(',', '.'));
  const totales = totalesSar(
    lineas.map((l) => ({ cantidad: num(l.cantidad) || 0, precio_unitario: r2(num(l.precio_unitario) || 0), total_con_isv: l.total_con_isv })),
    num(descuento) || 0,
  );
  const mensualidad = lineas.find((l) => l.concepto === 'mensualidad');

  const elegirHotel = async (id: string) => {
    setError(null);
    setLineas([]);
    if (!id) {
      setDatosHotel(null);
      setF((x) => ({ ...x, hotel_id: null, cliente_nombre: '', cliente_rtn: '', cliente_direccion: '' }));
      return;
    }
    setCargandoHotel(true);
    try {
      const d = await llamar('datosCobroHotel', { hotel_id: id });
      setDatosHotel(d);
      setF((x) => ({ ...x, hotel_id: id, cliente_nombre: d.cliente_nombre, cliente_rtn: d.cliente_rtn, cliente_direccion: d.cliente_direccion }));
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudieron leer los datos del hotel.');
    } finally {
      setCargandoHotel(false);
    }
  };

  // Cobros rápidos del hotel elegido.
  const rapidos = datosHotel
    ? {
        mensualidad: lineaMensualidad(datosHotel.plan, datosHotel.mes_mensualidad),
        anticipo: lineaPlacas('anticipo_placas', datosHotel.tipo_placa, datosHotel.habitaciones),
        saldo: lineaPlacas('saldo_placas', datosHotel.tipo_placa, datosHotel.habitaciones),
      }
    : null;
  const elegido = (concepto: Concepto) => lineas.length === 1 && lineas[0].concepto === concepto;
  const cobrar = (l: Linea) => {
    setLineas([l]);
    setF((x) => ({ ...x, mensualidad_meses: l.concepto === 'mensualidad' ? 1 : null }));
  };

  const agregar = (l: Linea) => {
    setLineas((xs) => [...xs, l]);
    if (l.concepto === 'mensualidad') setF((x) => ({ ...x, mensualidad_meses: x.mensualidad_meses ?? 1 }));
  };
  // Editar a mano una línea de precio cerrado la vuelve normal (15 % sobre lo que se escriba).
  const cambiarLinea = (i: number, cambios: Partial<Linea>) =>
    setLineas((xs) => xs.map((l, j) => (j === i ? { ...l, ...cambios, total_con_isv: 'cantidad' in cambios || 'precio_unitario' in cambios ? null : l.total_con_isv } : l)));

  const cambiarMeses = (meses: number) => {
    setF((x) => ({ ...x, mensualidad_meses: meses }));
    setLineas((xs) =>
      xs.map((l) => {
        if (l.concepto !== 'mensualidad') return l;
        const plan = (Object.keys(PLANES_SAAS) as PlanSaas[]).find((p) => String(PLANES_SAAS[p].mensual) === l.precio_unitario) ?? datosHotel?.plan ?? 'boutique';
        return lineaMensualidad(plan, datosHotel?.mes_mensualidad ?? mesActual(), meses);
      }),
    );
  };

  const cambiarCondicion = (condicion: 'contado' | 'credito') =>
    // Contado vence el mismo día de emisión; crédito, a 30 días (editable).
    setF((x) => ({ ...x, condicion, vence: condicion === 'credito' ? fechaLocal(30) : fechaLocal() }));

  const emitir = async (e: FormEvent) => {
    e.preventDefault();
    if (emitiendo) return;
    setEmitiendo(true);
    setError(null);
    try {
      const r = await llamar('emitirFactura', {
        ...f,
        vence: f.condicion === 'contado' ? fechaLocal() : f.vence,
        descuentos: num(descuento) || 0,
        lineas: lineas.map((l) => ({
          cantidad: num(l.cantidad),
          descripcion: l.descripcion,
          precio_unitario: num(l.precio_unitario),
          concepto: l.concepto,
          total_con_isv: l.total_con_isv,
        })),
        mensualidad_meses: mensualidad ? f.mensualidad_meses ?? 1 : null,
      });
      onEmitida(r.id, r.numero);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo emitir.');
      setEmitiendo(false);
    }
  };

  const botonChico = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3 text-[13.5px] font-semibold text-neutral-800 hover:bg-neutral-50';
  const selectChico = 'h-9 rounded-lg border border-black/[0.1] bg-white px-2 text-[13.5px]';

  return createPortal(
    <div style={FUENTE} role="dialog" aria-modal="true" aria-label="Emitir factura" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => !emitiendo && onCerrar()} className="absolute inset-0" />
      <form onSubmit={emitir} noValidate className="relative flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4">
          <h2 className="text-[19px] font-bold">Emitir factura</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <AvisoError mensaje={error} onCerrar={() => setError(null)} />

          {/* 1 · Hotel: rellena todo y muestra los cobros rápidos */}
          <section className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold text-neutral-700">Hotel</span>
              <span className="flex items-center gap-3">
                <select value={f.hotel_id ?? ''} onChange={(e) => void elegirHotel(e.target.value)} className={`${INPUT} h-12 text-[16px] font-semibold`}>
                  <option value="">— Otro cliente (no es un hotel) —</option>
                  {hoteles.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nombre}
                    </option>
                  ))}
                </select>
                {cargandoHotel && <Loader2 aria-label="Cargando datos del hotel" className="h-5 w-5 shrink-0 animate-spin text-neutral-400" />}
              </span>
            </label>

            {datosHotel && rapidos && (
              <>
                <p className="text-[13.5px] text-neutral-500">
                  Plan {PLANES_SAAS[datosHotel.plan].nombre} · {datosHotel.habitaciones} habitaciones · {PLACAS[datosHotel.tipo_placa].nombre}
                  {datosHotel.placa_supuesta && <span className="text-amber-700"> (placa sin definir en su ficha: se usa Esencial)</span>}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <BotonCobro
                    titulo="Cobrar mensualidad"
                    detalle={datosHotel.mes_mensualidad}
                    monto={cotizarMensualidad(datosHotel.plan).total}
                    activo={elegido('mensualidad')}
                    onClick={() => cobrar(rapidos.mensualidad)}
                  />
                  <BotonCobro
                    titulo="Cobrar anticipo 50% placas"
                    detalle={`${datosHotel.habitaciones} placas`}
                    monto={rapidos.anticipo.total_con_isv ?? 0}
                    activo={elegido('anticipo_placas')}
                    onClick={() => cobrar(rapidos.anticipo)}
                  />
                  <BotonCobro
                    titulo="Cobrar saldo 50% placas"
                    detalle="Entrega e instalación"
                    monto={rapidos.saldo.total_con_isv ?? 0}
                    activo={elegido('saldo_placas')}
                    onClick={() => cobrar(rapidos.saldo)}
                  />
                </div>
              </>
            )}

            {/* Datos del cliente: se rellenan solos con el hotel; editables por si hace falta */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.8fr_1.4fr]">
              <Campo etiqueta="Razón social">
                <input value={f.cliente_nombre} maxLength={160} onChange={(e) => setF((x) => ({ ...x, cliente_nombre: e.target.value }))} className={INPUT} />
              </Campo>
              <Campo etiqueta="RTN" ayuda={f.cliente_rtn ? undefined : 'Vacío = consumidor final'}>
                <input value={f.cliente_rtn} maxLength={14} onChange={(e) => setF((x) => ({ ...x, cliente_rtn: e.target.value.toUpperCase() }))} className={`${INPUT} font-mono`} />
              </Campo>
              <Campo etiqueta="Dirección">
                <input value={f.cliente_direccion} maxLength={300} onChange={(e) => setF((x) => ({ ...x, cliente_direccion: e.target.value }))} className={INPUT} />
              </Campo>
            </div>
          </section>

          {/* 2 · Detalle */}
          <section className="flex flex-col gap-2">
            {lineas.length > 0 && (
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="text-[12px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                    <th className="pb-1 font-semibold">Cant.</th>
                    <th className="pb-1 font-semibold">Descripción</th>
                    <th className="pb-1 text-right font-semibold">Precio sin ISV</th>
                    <th className="pb-1 text-right font-semibold">Total línea</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <input value={l.cantidad} inputMode="decimal" onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })} aria-label="Cantidad" className="h-10 w-16 rounded-lg border border-black/[0.1] px-2 text-right tabular-nums" />
                      </td>
                      <td className="py-1 pr-2">
                        <input value={l.descripcion} maxLength={300} onChange={(e) => cambiarLinea(i, { descripcion: e.target.value })} aria-label="Descripción" className="h-10 w-full rounded-lg border border-black/[0.1] px-2.5" />
                      </td>
                      <td className="py-1 pr-2">
                        <input value={l.precio_unitario} inputMode="decimal" placeholder="0.00" onChange={(e) => cambiarLinea(i, { precio_unitario: e.target.value })} aria-label="Precio sin ISV" className="h-10 w-32 rounded-lg border border-black/[0.1] px-2 text-right tabular-nums" />
                      </td>
                      <td className="py-1 pr-2 text-right font-semibold tabular-nums">{lempiras(r2((num(l.cantidad) || 0) * (num(l.precio_unitario) || 0)))}</td>
                      <td className="py-1">
                        <button type="button" onClick={() => setLineas((xs) => xs.filter((_, j) => j !== i))} aria-label="Quitar línea" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Meses: solo si hay una mensualidad */}
            {mensualidad && (
              <label className="flex w-fit items-center gap-2 text-[14px] text-neutral-700">
                Meses que cubre la mensualidad
                <select value={f.mensualidad_meses ?? 1} onChange={(e) => cambiarMeses(Number(e.target.value))} className={selectChico}>
                  {[1, 2, 3, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'mes' : 'meses'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button type="button" onClick={() => setVerOtros((v) => !v)} aria-expanded={verOtros} className="w-fit text-[13.5px] font-semibold text-neutral-600 hover:text-neutral-900">
              {verOtros ? '− Ocultar otros conceptos' : '+ Agregar otro concepto'}
            </button>
            {verOtros && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F8F9FA] p-3">
                <select value={planOtro} onChange={(e) => setPlanOtro(e.target.value as PlanSaas)} aria-label="Plan" className={selectChico}>
                  {(Object.keys(PLANES_SAAS) as PlanSaas[]).map((p) => (
                    <option key={p} value={p}>
                      {PLANES_SAAS[p].nombre}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => agregar(lineaMensualidad(planOtro, datosHotel?.mes_mensualidad ?? mesActual()))} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Mensualidad
                </button>
                <span className="mx-1 h-6 w-px bg-neutral-300" />
                <select value={placaOtra} onChange={(e) => setPlacaOtra(e.target.value as TipoPlaca)} aria-label="Tipo de placa" className={selectChico}>
                  <option value="esencial">Acrílico</option>
                  <option value="ejecutiva">Madera</option>
                </select>
                <input value={cantidadOtra} onChange={(e) => setCantidadOtra(e.target.value)} inputMode="numeric" aria-label="Cantidad de placas" className="h-9 w-16 rounded-lg border border-black/[0.1] bg-white px-2 text-right text-[13.5px] tabular-nums" />
                <button type="button" onClick={() => agregar(lineaReposicion(placaOtra, Math.max(1, Math.trunc(num(cantidadOtra) || 1))))} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Reposición
                </button>
                <button type="button" onClick={() => agregar(lineaPlacas('anticipo_placas', placaOtra, Math.max(1, Math.trunc(num(cantidadOtra) || 1))))} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Anticipo
                </button>
                <button type="button" onClick={() => agregar(lineaPlacas('saldo_placas', placaOtra, Math.max(1, Math.trunc(num(cantidadOtra) || 1))))} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Saldo
                </button>
                <span className="mx-1 h-6 w-px bg-neutral-300" />
                <button type="button" onClick={() => agregar({ cantidad: '1', descripcion: `${CONCEPTOS.comision_tours} — ${mesActual()}`, precio_unitario: '', concepto: 'comision_tours', total_con_isv: null })} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Comisión tours
                </button>
                <button type="button" onClick={() => agregar({ cantidad: '1', descripcion: '', precio_unitario: '', concepto: 'libre', total_con_isv: null })} className={botonChico}>
                  <Plus aria-hidden className="h-4 w-4" /> Ítem libre
                </button>
              </div>
            )}
          </section>

          {/* 3 · Condición de pago */}
          <section className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold text-neutral-700">Condición de pago</span>
              <div role="radiogroup" aria-label="Condición de pago" className="flex rounded-xl border border-black/[0.1] bg-white p-1">
                {(['contado', 'credito'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={f.condicion === c}
                    onClick={() => cambiarCondicion(c)}
                    className={`h-9 rounded-lg px-5 text-[14px] font-semibold ${f.condicion === c ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                  >
                    {c === 'contado' ? 'Contado' : 'Crédito'}
                  </button>
                ))}
              </div>
            </div>
            {f.condicion === 'credito' ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-neutral-700">Vence</span>
                <input type="date" min={fechaLocal()} value={f.vence} onChange={(e) => setF((x) => ({ ...x, vence: e.target.value }))} className={`${INPUT} w-[180px]`} />
              </label>
            ) : (
              <p className="pb-2.5 text-[13px] text-neutral-500">Vence el mismo día de emisión.</p>
            )}
          </section>

          {/* 4 · Opcionales SAR */}
          <section>
            <button type="button" onClick={() => setVerOpcionales((v) => !v)} aria-expanded={verOpcionales} className="flex items-center gap-1 text-[13.5px] font-semibold text-neutral-600 hover:text-neutral-900">
              <ChevronRight aria-hidden className={`h-4 w-4 transition-transform ${verOpcionales ? 'rotate-90' : ''}`} />
              Datos de exoneración / descuentos (opcional)
            </button>
            {verOpcionales && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-[#F8F9FA] p-4 md:grid-cols-2">
                <Campo etiqueta="Descuentos y rebajas (L.)" ayuda="Se restan antes del ISV">
                  <input value={descuento} inputMode="decimal" placeholder="0.00" onChange={(e) => setDescuento(e.target.value)} className={`${INPUT} tabular-nums`} />
                </Campo>
                <Campo etiqueta="No. Registro SAG">
                  <input value={f.registro_sag} maxLength={60} onChange={(e) => setF((x) => ({ ...x, registro_sag: e.target.value }))} className={INPUT} />
                </Campo>
                <Campo etiqueta="No. Correlativo Orden de Compra Exenta">
                  <input value={f.orden_compra_exenta} maxLength={60} onChange={(e) => setF((x) => ({ ...x, orden_compra_exenta: e.target.value }))} className={INPUT} />
                </Campo>
                <Campo etiqueta="No. Constancia Registro Exonerado">
                  <input value={f.constancia_exonerado} maxLength={60} onChange={(e) => setF((x) => ({ ...x, constancia_exonerado: e.target.value }))} className={INPUT} />
                </Campo>
              </div>
            )}
          </section>

          {/* Totales */}
          {lineas.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
              <p className="self-end rounded-lg bg-neutral-100 px-3 py-2 text-[12.5px] font-semibold">{montoEnLetras(totales.total)}</p>
              <div className="rounded-xl border-2 border-neutral-900 text-[13.5px]">
                {totales.descuentos > 0 && (
                  <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                    <span className="text-neutral-600">Descuentos</span>
                    <span className="tabular-nums">− {lempiras(totales.descuentos)}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                  <span className="text-neutral-600">Importe gravado 15%</span>
                  <span className="tabular-nums">{lempiras(totales.importe_gravado)}</span>
                </div>
                <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                  <span className="text-neutral-600">ISV 15%</span>
                  <span className="tabular-nums">{lempiras(totales.isv)}</span>
                </div>
                <div className="flex justify-between bg-neutral-900 px-3 py-2 text-[15px] font-black text-white">
                  <span>TOTAL A PAGAR</span>
                  <span className="tabular-nums">{lempiras(totales.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100">
            Cancelar
          </button>
          <button type="submit" disabled={emitiendo || lineas.length === 0 || !f.cliente_nombre.trim()} className={BOTON_PRIMARIO}>
            {emitiendo && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {emitiendo ? 'Emitiendo…' : lineas.length ? `Emitir factura · ${lempiras(totales.total)}` : 'Elige qué cobrar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
