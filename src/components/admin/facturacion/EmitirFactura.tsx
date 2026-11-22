'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Trash2, X } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, INPUT } from '@/components/admin/ui';
import type { HotelResumen, NuevaFactura } from '@/lib/admin/tipos';
import {
  CONCEPTOS,
  cotizarPlacas,
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
const hoy = () => new Date().toLocaleDateString('en-CA');
const sumarDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('en-CA');
};
const mesActual = () => {
  const t = new Date().toLocaleDateString('es-HN', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Linea = { cantidad: string; descripcion: string; precio_unitario: string; concepto: Concepto };

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
  mensualidad_meses: null,
};

/**
 * Emisión de una factura SAR. Se llena aquí; el servidor recalcula totales,
 * monto en letras y asigna el número correlativo del CAI vigente.
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
  const [f, setF] = useState<Omit<NuevaFactura, 'lineas'>>({ ...inicial, vence: inicial.vence || sumarDias(7) });
  const [lineas, setLineas] = useState<Linea[]>(
    inicial.lineas.map((l) => ({ cantidad: String(l.cantidad), descripcion: l.descripcion, precio_unitario: String(l.precio_unitario), concepto: l.concepto })),
  );
  // Ayudantes para agregar conceptos con las tarifas oficiales.
  const [plan, setPlan] = useState<PlanSaas>('boutique');
  const [placa, setPlaca] = useState<TipoPlaca>('esencial');
  const [nPlacas, setNPlacas] = useState('10');
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

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !emitiendo && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [emitiendo, onCerrar]);

  const num = (v: string) => Number(v.replace(',', '.'));
  const lineasValidas = lineas.map((l) => ({ cantidad: num(l.cantidad) || 0, precio_unitario: r2(num(l.precio_unitario) || 0) }));
  const totales = totalesSar(lineasValidas);
  const agregar = (l: Linea) => setLineas((xs) => [...xs, l]);
  const cambiarLinea = (i: number, cambios: Partial<Linea>) => setLineas((xs) => xs.map((l, j) => (j === i ? { ...l, ...cambios } : l)));

  const agregarMensualidad = () => {
    agregar({ cantidad: '1', descripcion: `${CONCEPTOS.mensualidad} — Plan ${PLANES_SAAS[plan].nombre} — ${mesActual()}`, precio_unitario: String(PLANES_SAAS[plan].mensual), concepto: 'mensualidad' });
    setF((x) => ({ ...x, mensualidad_meses: x.mensualidad_meses ?? 1 }));
  };
  const agregarPlacas = (concepto: 'anticipo_placas' | 'saldo_placas') => {
    const n = Math.max(1, Math.trunc(num(nPlacas) || 0));
    const p = cotizarPlacas(placa, n);
    agregar({
      cantidad: '1',
      descripcion: `${CONCEPTOS[concepto]} — ${PLACAS[placa].nombre}: ${n} placas × L. ${p.unitario.toFixed(2)}`,
      precio_unitario: String(r2(p.subtotal / 2)),
      concepto,
    });
  };

  const elegirHotel = (id: string) => {
    const h = hoteles.find((x) => x.id === id);
    setF((x) => ({ ...x, hotel_id: id || null, cliente_nombre: h ? h.nombre : x.cliente_nombre }));
  };

  const emitir = async (e: FormEvent) => {
    e.preventDefault();
    if (emitiendo) return;
    setEmitiendo(true);
    setError(null);
    try {
      const r = await llamar('emitirFactura', {
        ...f,
        lineas: lineas.map((l) => ({ cantidad: num(l.cantidad), descripcion: l.descripcion, precio_unitario: num(l.precio_unitario), concepto: l.concepto })),
        // Solo cuenta como mensualidad si tiene una línea de mensualidad.
        mensualidad_meses: lineas.some((l) => l.concepto === 'mensualidad') ? f.mensualidad_meses ?? 1 : null,
      });
      onEmitida(r.id, r.numero);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo emitir.');
      setEmitiendo(false);
    }
  };

  const boton = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-3 text-[13.5px] font-semibold text-neutral-800 hover:bg-neutral-50';

  return createPortal(
    <div style={FUENTE} role="dialog" aria-modal="true" aria-label="Emitir factura" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => !emitiendo && onCerrar()} className="absolute inset-0" />
      <form onSubmit={emitir} noValidate className="relative flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-[19px] font-bold">Emitir factura</h2>
            <p className="text-[13.5px] text-neutral-500">El número correlativo lo asigna el sistema al emitir. Todo en Lempiras.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <AvisoError mensaje={error} onCerrar={() => setError(null)} />

          <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <legend className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-400">Cliente</legend>
            <Campo etiqueta="Hotel (opcional)">
              <select value={f.hotel_id ?? ''} onChange={(e) => elegirHotel(e.target.value)} className={INPUT}>
                <option value="">— Cliente que no es hotel —</option>
                {hoteles.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Razón social / Nombre">
              <input value={f.cliente_nombre} maxLength={160} onChange={(e) => setF((x) => ({ ...x, cliente_nombre: e.target.value }))} className={INPUT} />
            </Campo>
            <Campo etiqueta="RTN (14 dígitos)" ayuda="Vacío = consumidor final">
              <input value={f.cliente_rtn} maxLength={14} onChange={(e) => setF((x) => ({ ...x, cliente_rtn: e.target.value.toUpperCase() }))} className={`${INPUT} font-mono`} />
            </Campo>
            <div className="md:col-span-3">
              <Campo etiqueta="Dirección">
                <input value={f.cliente_direccion} maxLength={300} onChange={(e) => setF((x) => ({ ...x, cliente_direccion: e.target.value }))} className={INPUT} />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <legend className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-400">Condición</legend>
            <Campo etiqueta="Condición de pago">
              <select
                value={f.condicion}
                onChange={(e) => setF((x) => ({ ...x, condicion: e.target.value === 'credito' ? 'credito' : 'contado', vence: e.target.value === 'credito' ? sumarDias(30) : sumarDias(7) }))}
                className={INPUT}
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </Campo>
            <Campo etiqueta="Vence">
              <input type="date" min={hoy()} value={f.vence} onChange={(e) => setF((x) => ({ ...x, vence: e.target.value }))} className={INPUT} />
            </Campo>
            <Campo etiqueta="Meses de mensualidad" ayuda="Al pagarse, el hotel queda al día">
              <select
                value={f.mensualidad_meses ?? 1}
                disabled={!lineas.some((l) => l.concepto === 'mensualidad')}
                onChange={(e) => setF((x) => ({ ...x, mensualidad_meses: Number(e.target.value) }))}
                className={INPUT}
              >
                {[1, 2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'mes' : 'meses'}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="No. Registro SAG" ayuda="Si aplica">
              <input value={f.registro_sag} maxLength={60} onChange={(e) => setF((x) => ({ ...x, registro_sag: e.target.value }))} className={INPUT} />
            </Campo>
          </fieldset>

          <section className="flex flex-col gap-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-400">Agregar concepto (tarifas oficiales, sin ISV)</p>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F8F9FA] p-3">
              <select value={plan} onChange={(e) => setPlan(e.target.value as PlanSaas)} aria-label="Plan" className="h-9 rounded-lg border border-black/[0.1] bg-white px-2 text-[13.5px]">
                {(Object.keys(PLANES_SAAS) as PlanSaas[]).map((p) => (
                  <option key={p} value={p}>
                    {PLANES_SAAS[p].nombre} · {lempiras(PLANES_SAAS[p].mensual)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={agregarMensualidad} className={boton}>
                <Plus aria-hidden className="h-4 w-4" /> Mensualidad
              </button>
              <span className="mx-1 h-6 w-px bg-neutral-300" />
              <select value={placa} onChange={(e) => setPlaca(e.target.value as TipoPlaca)} aria-label="Tipo de placa" className="h-9 rounded-lg border border-black/[0.1] bg-white px-2 text-[13.5px]">
                <option value="esencial">Esencial (acrílico)</option>
                <option value="ejecutiva">Ejecutiva (madera)</option>
              </select>
              <input value={nPlacas} onChange={(e) => setNPlacas(e.target.value)} inputMode="numeric" aria-label="Cantidad de placas" className="h-9 w-16 rounded-lg border border-black/[0.1] bg-white px-2 text-right text-[13.5px] tabular-nums" />
              <button type="button" onClick={() => agregarPlacas('anticipo_placas')} className={boton}>
                <Plus aria-hidden className="h-4 w-4" /> Anticipo 50%
              </button>
              <button type="button" onClick={() => agregarPlacas('saldo_placas')} className={boton}>
                <Plus aria-hidden className="h-4 w-4" /> Saldo 50%
              </button>
              <button
                type="button"
                onClick={() => agregar({ cantidad: nPlacas || '1', descripcion: REPOSICION[placa].nombre, precio_unitario: String(REPOSICION[placa].precio), concepto: 'reposicion' })}
                className={boton}
              >
                <Plus aria-hidden className="h-4 w-4" /> Reposición
              </button>
              <span className="mx-1 h-6 w-px bg-neutral-300" />
              <button type="button" onClick={() => agregar({ cantidad: '1', descripcion: `${CONCEPTOS.comision_tours} — ${mesActual()}`, precio_unitario: '', concepto: 'comision_tours' })} className={boton}>
                <Plus aria-hidden className="h-4 w-4" /> Comisión tours
              </button>
              <button type="button" onClick={() => agregar({ cantidad: '1', descripcion: '', precio_unitario: '', concepto: 'libre' })} className={boton}>
                <Plus aria-hidden className="h-4 w-4" /> Ítem libre
              </button>
            </div>

            {lineas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-[14px] text-neutral-500">Agrega al menos un concepto.</p>
            ) : (
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
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-3">
              <Campo etiqueta="No. Correlativo Orden de Compra Exenta">
                <input value={f.orden_compra_exenta} maxLength={60} onChange={(e) => setF((x) => ({ ...x, orden_compra_exenta: e.target.value }))} className={INPUT} />
              </Campo>
              <Campo etiqueta="No. Constancia Registro Exonerado">
                <input value={f.constancia_exonerado} maxLength={60} onChange={(e) => setF((x) => ({ ...x, constancia_exonerado: e.target.value }))} className={INPUT} />
              </Campo>
              <p className="rounded-lg bg-neutral-100 px-3 py-2 text-[12.5px] font-semibold">{montoEnLetras(totales.total)}</p>
            </div>
            <div className="rounded-xl border-2 border-neutral-900 text-[13.5px]">
              {(
                [
                  ['Descuentos y Rebajas', totales.descuentos],
                  ['Importe Exento', totales.importe_exento],
                  ['Importe Exonerado', totales.importe_exonerado],
                  ['Importe Gravado 15%', totales.importe_gravado],
                  ['ISV (15%)', totales.isv],
                ] as [string, number][]
              ).map(([e, v]) => (
                <div key={e} className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                  <span className="text-neutral-600">{e}</span>
                  <span className="tabular-nums">{lempiras(v)}</span>
                </div>
              ))}
              <div className="flex justify-between bg-neutral-900 px-3 py-2 text-[15px] font-black text-white">
                <span>TOTAL A PAGAR</span>
                <span className="tabular-nums">{lempiras(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100">
            Cancelar
          </button>
          <button type="submit" disabled={emitiendo || lineas.length === 0 || !f.cliente_nombre.trim()} className={BOTON_PRIMARIO}>
            {emitiendo && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {emitiendo ? 'Emitiendo…' : `Emitir factura · ${lempiras(totales.total)}`}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
