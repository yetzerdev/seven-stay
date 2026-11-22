'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import type { CobroHotel, MetodoPago, PagoHotel } from '@/lib/admin/tipos';
import type { Moneda } from '@/types/sevenstay';

import { useAdmin } from './SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, INPUT } from './ui';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

export const METODOS: { valor: MetodoPago; texto: string }[] = [
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'tarjeta', texto: 'Tarjeta' },
  { valor: 'otro', texto: 'Otro' },
];

export const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' });

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

/**
 * Registrar el pago de un hotel y ver su historial. El periodo pagado continúa
 * donde terminó el anterior (o empieza hoy si estaba vencido); eso lo calcula el servidor.
 */
export default function ModalPagos({ cobro, onCerrar, onRegistrado }: { cobro: CobroHotel; onCerrar: () => void; onRegistrado: () => void }) {
  const { llamar } = useAdmin();
  const [pagos, setPagos] = useState<PagoHotel[] | null>(null);
  const [meses, setMeses] = useState(1);
  const [monto, setMonto] = useState(cobro.mensualidad ? String(cobro.mensualidad) : '');
  const [moneda, setMoneda] = useState<Moneda>(cobro.moneda ?? 'USD');
  const [fecha, setFecha] = useState(hoyLocal);
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [incluyeIsv, setIncluyeIsv] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('pagosHotel', { hotel_id: cobro.id }).then(
      (p) => vivo && setPagos(p),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, cobro.id]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [guardando, onCerrar]);

  // Al cambiar los meses, el monto sugerido se ajusta (si hay mensualidad conocida).
  const cambiarMeses = (n: number) => {
    setMeses(n);
    if (cobro.mensualidad) setMonto(String(Math.round(cobro.mensualidad * n * 100) / 100));
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    const valor = Number(monto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Escribe el monto pagado.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await llamar('registrarPago', {
        hotel_id: cobro.id,
        monto: valor,
        moneda,
        fecha_pago: fecha,
        meses,
        metodo,
        referencia,
        notas,
        incluye_isv: incluyeIsv,
      });
      setExito(`Pago registrado. ${cobro.nombre} queda pagado hasta el ${fechaCorta(r.pagado_hasta)}.`);
      setReferencia('');
      setNotas('');
      setPagos(await llamar('pagosHotel', { hotel_id: cobro.id }));
      onRegistrado();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div style={FUENTE} role="dialog" aria-modal="true" aria-label={`Pagos de ${cobro.nombre}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => !guardando && onCerrar()} className="absolute inset-0" />
      <div className="relative flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-5">
          <div>
            <h2 className="text-[19px] font-bold text-neutral-900">Pagos de {cobro.nombre}</h2>
            <p className="mt-0.5 text-[14px] text-neutral-500">
              {cobro.mensualidad !== null && cobro.moneda
                ? `Mensualidad: ${formatoPrecio(cobro.mensualidad, cobro.moneda)} (${cobro.habitaciones_cobradas} habitaciones × ${formatoPrecio(cobro.tarifa_habitacion ?? 0, cobro.moneda)})`
                : 'Sin plan asignado'}
              {cobro.pagado_hasta && ` · Pagado hasta ${fechaCorta(cobro.pagado_hasta)}`}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <form onSubmit={registrar} noValidate className="flex flex-col gap-4 rounded-xl bg-[#F8F9FA] p-5">
            <h3 className="text-[15.5px] font-bold text-neutral-900">Registrar pago</h3>
            <AvisoError mensaje={error} onCerrar={() => setError(null)} />
            {exito && (
              <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
                {exito}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo etiqueta="Meses que cubre">
                <select value={meses} onChange={(e) => cambiarMeses(Number(e.target.value))} className={INPUT}>
                  {[1, 2, 3, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'mes' : 'meses'}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Monto recibido">
                <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${INPUT} tabular-nums`} />
              </Campo>
              <Campo etiqueta="Moneda">
                <select value={moneda} onChange={(e) => setMoneda(e.target.value === 'HNL' ? 'HNL' : 'USD')} className={INPUT}>
                  <option value="USD">Dólares</option>
                  <option value="HNL">Lempiras</option>
                </select>
              </Campo>
              <Campo etiqueta="Fecha del pago">
                <input type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
              </Campo>
              <Campo etiqueta="Método">
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={INPUT}>
                  {METODOS.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.texto}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Referencia" ayuda="N.º de transferencia o recibo (opcional)">
                <input value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} className={INPUT} />
              </Campo>
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-white px-4 py-3">
              <input type="checkbox" checked={incluyeIsv} onChange={(e) => setIncluyeIsv(e.target.checked)} className="mt-0.5 h-5 w-5 accent-neutral-900" />
              <span className="text-[14.5px] text-neutral-800">
                Incluye 15 % ISV (factura SAR)
                {incluyeIsv && Number(monto.replace(',', '.')) > 0 && (
                  <span className="mt-0.5 block text-[13px] tabular-nums text-neutral-500">
                    Subtotal {formatoPrecio(Number(monto.replace(',', '.')) / 1.15, moneda)} · ISV{' '}
                    {formatoPrecio(Number(monto.replace(',', '.')) - Number(monto.replace(',', '.')) / 1.15, moneda)}
                  </span>
                )}
              </span>
            </label>
            <Campo etiqueta="Notas (opcional)">
              <input value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} className={INPUT} />
            </Campo>
            <div className="flex justify-end">
              <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {guardando ? 'Registrando…' : 'Registrar pago'}
              </button>
            </div>
          </form>

          <section>
            <h3 className="mb-2 text-[15.5px] font-bold text-neutral-900">Historial</h3>
            {!pagos ? (
              <div className="flex justify-center py-8">
                <Loader2 aria-label="Cargando" className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : pagos.length === 0 ? (
              <p className="text-[14px] text-neutral-400">Todavía no hay pagos registrados.</p>
            ) : (
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-[12px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                    <th className="pb-2 font-semibold">Fecha</th>
                    <th className="pb-2 text-right font-semibold">Monto</th>
                    <th className="pb-2 font-semibold">Cubre</th>
                    <th className="pb-2 font-semibold">Método</th>
                    <th className="pb-2 font-semibold">Registró</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5">{fechaCorta(p.fecha_pago)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">
                        {formatoPrecio(p.monto, p.moneda)}
                        {p.incluye_isv && p.subtotal !== null && p.isv !== null && (
                          <span className="block text-[12px] font-normal text-neutral-400">
                            {formatoPrecio(p.subtotal, p.moneda)} + ISV {formatoPrecio(p.isv, p.moneda)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-neutral-600">
                        {fechaCorta(p.periodo_desde)} → {fechaCorta(p.periodo_hasta)}
                      </td>
                      <td className="py-2.5 text-neutral-600">
                        {METODOS.find((m) => m.valor === p.metodo)?.texto}
                        {p.referencia && <span className="block text-[12px] text-neutral-400">{p.referencia}</span>}
                      </td>
                      <td className="py-2.5 text-neutral-500">{p.registrado_por}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
