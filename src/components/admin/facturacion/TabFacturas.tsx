'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Ban, CheckCircle2, FileText, Loader2, Plus, X } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, EstadoPastilla, INPUT } from '@/components/admin/ui';
import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import type { EstadoFactura, Factura, MetodoPagoFactura } from '@/lib/admin/tipos';
import { lempiras } from '@/lib/facturacion/tarifas';

import { fechaLarga } from './Documentos';

export const ESTADOS_FACTURA: Record<EstadoFactura, { texto: string; tono: 'ambar' | 'verde' | 'rojo' | 'gris' }> = {
  pendiente: { texto: 'Pendiente de pago', tono: 'ambar' },
  pagada: { texto: 'Pagada', tono: 'verde' },
  vencida: { texto: 'Vencida', tono: 'rojo' },
  anulada: { texto: 'Anulada', tono: 'gris' },
};

const METODOS: { valor: MetodoPagoFactura; texto: string }[] = [
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'deposito', texto: 'Depósito' },
  { valor: 'cheque', texto: 'Cheque' },
];

/** "2026-11" → primer y último día del mes. */
export function rangoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

function ModalPago({ f, onCerrar, onPagada }: { f: Factura; onCerrar: () => void; onPagada: () => void }) {
  const { llamar } = useAdmin();
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [metodo, setMetodo] = useState<MetodoPagoFactura>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [retencion, setRetencion] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ret = Number(retencion.replace(',', '.')) || 0;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await llamar('pagarFactura', { id: f.id, fecha, metodo, referencia, retencion: ret, retencion_comprobante: comprobante });
      onPagada();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo registrar el pago.');
      setGuardando(false);
    }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Registrar pago" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => !guardando && onCerrar()} className="absolute inset-0" />
      <form onSubmit={guardar} noValidate className="relative flex w-full max-w-[520px] flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl" style={{ fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[19px] font-bold">Marcar como pagada</h2>
            <p className="text-[14px] text-neutral-500">
              Factura {f.numero} · {f.cliente_nombre} · <strong className="tabular-nums">{lempiras(f.total)}</strong>
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <AvisoError mensaje={error} />
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha de pago">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
          </Campo>
          <Campo etiqueta="Método">
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPagoFactura)} className={INPUT}>
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo etiqueta="No. de referencia bancaria">
          <input value={referencia} maxLength={80} onChange={(e) => setReferencia(e.target.value)} className={INPUT} />
        </Campo>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F8F9FA] p-3">
          <Campo etiqueta="Retención aplicada (L.)" ayuda="Si el hotel retuvo ISR o ISV">
            <input value={retencion} inputMode="decimal" placeholder="0.00" onChange={(e) => setRetencion(e.target.value)} className={`${INPUT} tabular-nums`} />
          </Campo>
          <Campo etiqueta="No. comprobante de retención SAR">
            <input value={comprobante} maxLength={80} onChange={(e) => setComprobante(e.target.value)} className={INPUT} />
          </Campo>
          <p className="col-span-2 text-[13px] text-neutral-600">
            Llega al banco: <strong className="tabular-nums">{lempiras(Math.max(0, f.total - ret))}</strong>
          </p>
        </div>
        {f.mensualidad_meses && f.hotel_id && (
          <p className="text-[13px] text-emerald-700">
            Es una mensualidad: el hotel quedará al día por {f.mensualidad_meses} {f.mensualidad_meses === 1 ? 'mes' : 'meses'}.
          </p>
        )}
        <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
          {guardando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden className="h-4 w-4" />}
          Registrar pago
        </button>
      </form>
    </div>,
    document.body,
  );
}

/** Listado de facturas emitidas por mes, con pago y anulación (nunca se borran). */
export default function TabFacturas({ onNueva, recarga }: { onNueva: () => void; recarga: number }) {
  const { llamar } = useAdmin();
  const { confirmar, dialogo } = useConfirmacion();
  const [mes, setMes] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7));
  const [datos, setDatos] = useState<{ clave: string; facturas: Factura[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState<Factura | null>(null);
  const [extra, setExtra] = useState(0);
  const clave = `${mes}-${recarga}-${extra}`;

  useEffect(() => {
    let vivo = true;
    llamar('facturas', rangoMes(mes)).then(
      (facturas) => {
        if (!vivo) return;
        setDatos({ clave, facturas });
        setError(null);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, mes, clave]);

  const recargar = useCallback(() => setExtra((n) => n + 1), []);

  const anular = async (f: Factura) => {
    const motivo = await confirmar({
      titulo: `¿Anular la factura ${f.numero}?`,
      mensaje: 'La factura no se borra: conserva su número correlativo marcada como ANULADA (auditoría SAR). Si hay que volver a facturar, emite una nueva.',
      textoConfirmar: 'Anular factura',
      tono: 'peligro',
      motivo: { etiqueta: 'Motivo de la anulación', placeholder: 'Ej. Error en el RTN del cliente', obligatorio: true },
    });
    if (motivo === false) return;
    try {
      await llamar('anularFactura', { id: f.id, motivo });
      recargar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo anular.');
    }
  };

  const facturas = datos?.clave === clave ? datos.facturas : null;
  const vigentes = (facturas ?? []).filter((f) => f.estado !== 'anulada');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-neutral-600">Mes</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={`${INPUT} w-[200px]`} />
        </label>
        <button type="button" onClick={onNueva} className={BOTON_PRIMARIO}>
          <Plus aria-hidden className="h-4 w-4" />
          Emitir factura
        </button>
      </div>
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      {facturas && facturas.length > 0 && (
        <p className="text-[14px] text-neutral-500">
          {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'} · Facturado {lempiras(vigentes.reduce((s, f) => s + f.total, 0))} (ISV incluido)
        </p>
      )}

      <section className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
        {!facturas ? (
          <div className="flex justify-center py-14">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        ) : facturas.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FileText aria-hidden className="h-7 w-7 text-neutral-400" />
            <p className="mt-3 text-[15px] text-neutral-500">No hay facturas en este mes.</p>
          </div>
        ) : (
          <table className="w-full min-w-[960px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                <th className="px-6 py-3 font-semibold">No. Factura</th>
                <th className="px-3 py-3 font-semibold">Fecha</th>
                <th className="px-3 py-3 font-semibold">Cliente</th>
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-3 py-3 font-semibold">Vence</th>
                <th className="px-3 py-3 font-semibold">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {facturas.map((f) => (
                <tr key={f.id} className={f.estado === 'anulada' ? 'text-neutral-400' : ''}>
                  <td className="px-6 py-3 font-mono text-[13.5px] font-semibold">{f.numero}</td>
                  <td className="px-3 py-3 tabular-nums">{fechaLarga(f.fecha_emision)}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold">{f.cliente_nombre}</p>
                    <p className="font-mono text-[12.5px] text-neutral-500">{f.cliente_rtn || 'Consumidor final'}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{lempiras(f.total)}</td>
                  <td className="px-3 py-3 tabular-nums">{f.estado === 'pagada' ? '—' : fechaLarga(f.vence)}</td>
                  <td className="px-3 py-3">
                    <EstadoPastilla tono={ESTADOS_FACTURA[f.estado].tono}>{ESTADOS_FACTURA[f.estado].texto}</EstadoPastilla>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/admin/facturacion/factura/${f.id}`}
                        target="_blank"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-neutral-700 hover:bg-neutral-100"
                      >
                        <FileText aria-hidden className="h-4 w-4" />
                        PDF
                      </Link>
                      {(f.estado === 'pendiente' || f.estado === 'vencida') && (
                        <>
                          <button type="button" onClick={() => setPagando(f)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-emerald-700 hover:bg-emerald-50">
                            <CheckCircle2 aria-hidden className="h-4 w-4" />
                            Pagada
                          </button>
                          <button type="button" onClick={() => void anular(f)} aria-label={`Anular ${f.numero}`} title="Anular" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                            <Ban aria-hidden className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pagando && (
        <ModalPago
          f={pagando}
          onCerrar={() => setPagando(null)}
          onPagada={() => {
            setPagando(null);
            recargar();
          }}
        />
      )}
      {dialogo}
    </div>
  );
}
