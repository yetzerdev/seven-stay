import type { ReactNode } from 'react';

import MarcaSevenStay from '@/components/MarcaSevenStay';
import type { ConfigFiscal, Cotizacion, Emisor, Factura } from '@/lib/admin/tipos';
import { cotizarMensualidad, cotizarPlacas, lempiras, PLACAS, PLANES_SAAS } from '@/lib/facturacion/tarifas';

/**
 * Documentos imprimibles (Guardar como PDF desde el navegador): factura SAR y
 * cotización. Tamaño carta, tinta oscura sobre blanco, marca SevenCloud Systems · 7STAY.
 */

export const fechaLarga = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ESTILO_PAGINA = '@page { size: letter; margin: 12mm; }';

function Encabezado({ emisor, derecha }: { emisor: Pick<Emisor, 'nombre_legal' | 'denominacion' | 'rtn' | 'domicilio' | 'telefono' | 'correo'>; derecha: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
      <div className="min-w-0">
        <div className="flex items-end gap-3">
          <MarcaSevenStay tamano="lg" className="text-neutral-900" />
        </div>
        <p className="mt-2 text-[15px] font-extrabold uppercase tracking-[0.06em] text-neutral-900">«{emisor.denominacion || 'SevenCloud Systems'}»</p>
        <p className="text-[12.5px] font-semibold text-neutral-800">{emisor.nombre_legal}</p>
        <p className="text-[11.5px] text-neutral-600">RTN: {emisor.rtn || '—'}</p>
        <p className="max-w-[340px] text-[11.5px] leading-snug text-neutral-600">{emisor.domicilio}</p>
        <p className="text-[11.5px] text-neutral-600">
          {[emisor.telefono && `Tel. ${emisor.telefono}`, emisor.correo].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="shrink-0">{derecha}</div>
    </header>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-[11.5px]">
      <span className="text-neutral-500">{etiqueta}</span>
      <span className={`text-right font-semibold text-neutral-900 ${mono ? 'font-mono tracking-tight' : ''}`}>{valor}</span>
    </div>
  );
}

function DatosBancarios({ e }: { e: Pick<Emisor, 'banco' | 'tipo_cuenta' | 'numero_cuenta' | 'titular'> }) {
  if (!e.banco && !e.numero_cuenta) return null;
  return (
    <div className="rounded-lg border border-neutral-300 px-3 py-2 text-[11px] text-neutral-700">
      <p className="font-bold uppercase tracking-[0.08em] text-neutral-500">Datos para transferencia</p>
      <p>
        {e.banco} · {e.tipo_cuenta} · <span className="font-mono font-semibold">{e.numero_cuenta}</span>
      </p>
      <p>Titular: {e.titular}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Factura SAR
// ---------------------------------------------------------------------------

export function FacturaImpresa({ f }: { f: Factura }) {
  const filasTotales: [string, number, boolean?][] = [
    ['Descuentos y Rebajas Otorgados', f.descuentos],
    ['Importe Exento', f.importe_exento],
    ['Importe Exonerado', f.importe_exonerado],
    ['Importe Gravado 15%', f.importe_gravado],
    ['ISV (15%)', f.isv],
    ['TOTAL A PAGAR', f.total, true],
  ];
  return (
    <article className="relative mx-auto w-full max-w-[816px] bg-white p-8 text-neutral-900 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.25)] print:max-w-none print:p-0 print:shadow-none">
      <style>{ESTILO_PAGINA}</style>
      {f.estado === 'anulada' && (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] rounded-xl border-[6px] border-rose-600/70 px-8 py-2 text-[88px] font-black tracking-[0.12em] text-rose-600/60">ANULADA</span>
        </span>
      )}
      <Encabezado
        emisor={f.emisor}
        derecha={
          <div className="w-[300px] rounded-lg border-2 border-neutral-900 p-3">
            <p className="text-center text-[17px] font-black tracking-[0.18em]">FACTURA</p>
            <p className="mb-2 text-center font-mono text-[15px] font-bold">No. {f.numero}</p>
            <Dato etiqueta="CAI" valor={f.cai} mono />
            <Dato etiqueta="Rango autorizado" valor={`${f.rango_inicial} al ${f.rango_final}`} mono />
            <Dato etiqueta="Fecha límite de emisión" valor={fechaLarga(f.fecha_limite)} />
            <Dato etiqueta="Fecha de emisión" valor={fechaLarga(f.fecha_emision)} />
            <Dato etiqueta="Condición de pago" valor={f.condicion === 'contado' ? 'Contado' : 'Crédito'} />
            <Dato etiqueta="Vence" valor={fechaLarga(f.vence)} />
          </div>
        }
      />

      <section className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 rounded-lg border border-neutral-300 px-4 py-3 text-[12px]">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">Cliente · Razón social</p>
          <p className="text-[14px] font-bold">{f.cliente_nombre}</p>
          {f.cliente_direccion && <p className="text-neutral-600">{f.cliente_direccion}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">RTN del cliente</p>
          <p className="font-mono text-[14px] font-bold">{f.cliente_rtn || 'Consumidor final'}</p>
        </div>
      </section>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-neutral-900 text-white">
            <th className="px-3 py-2 text-left font-semibold">Cant.</th>
            <th className="px-3 py-2 text-left font-semibold">Descripción</th>
            <th className="px-3 py-2 text-right font-semibold">Precio unitario (sin ISV)</th>
            <th className="px-3 py-2 text-right font-semibold">Total línea</th>
          </tr>
        </thead>
        <tbody>
          {f.lineas.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="px-3 py-2 tabular-nums">{l.cantidad}</td>
              <td className="px-3 py-2">{l.descripcion}</td>
              <td className="px-3 py-2 text-right tabular-nums">{lempiras(l.precio_unitario)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{lempiras(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 grid grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col gap-3">
          <p className="rounded-lg bg-neutral-100 px-3 py-2 text-[12px] font-bold">{f.total_letras}</p>
          <div className="grid grid-cols-1 gap-1 text-[11px] text-neutral-700">
            <p>No. Correlativo Orden de Compra Exenta: {f.orden_compra_exenta || '—'}</p>
            <p>No. Constancia Registro Exonerado: {f.constancia_exonerado || '—'}</p>
            <p>No. Registro SAG: {f.registro_sag || '—'}</p>
          </div>
          <DatosBancarios e={f.emisor} />
        </div>
        <div className="rounded-lg border-2 border-neutral-900">
          {filasTotales.map(([etiqueta, valor, fuerte]) => (
            <div
              key={etiqueta}
              className={`flex justify-between px-3 py-1.5 text-[12px] ${fuerte ? 'bg-neutral-900 text-[14px] font-black text-white' : 'border-b border-neutral-200'}`}
            >
              <span>{etiqueta}</span>
              <span className="tabular-nums">{lempiras(valor)}</span>
            </div>
          ))}
        </div>
      </section>

      {f.estado === 'pagada' && f.pago_fecha && (
        <p className="mt-3 text-[11px] text-neutral-600">
          Pagada el {fechaLarga(f.pago_fecha)}
          {f.pago_referencia ? ` · Ref. ${f.pago_referencia}` : ''}
          {f.retencion > 0 ? ` · Retención aplicada por el cliente ${lempiras(f.retencion)}${f.retencion_comprobante ? ` (Comprobante ${f.retencion_comprobante})` : ''}` : ''}
        </p>
      )}
      {f.estado === 'anulada' && <p className="mt-3 text-[11px] font-semibold text-rose-700">ANULADA · Motivo: {f.anulada_motivo}</p>}

      <footer className="mt-6 flex items-center justify-between border-t border-neutral-300 pt-3 text-[10.5px] text-neutral-500">
        <span>Original: Cliente | Copia: Obligado Tributario Emisor</span>
        <span className="flex items-center gap-2">
          Plataforma <MarcaSevenStay tamano="sm" className="text-neutral-700" />
        </span>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Cotización (proforma comercial)
// ---------------------------------------------------------------------------

export function CotizacionImpresa({ c, emisor }: { c: Cotizacion; emisor: ConfigFiscal }) {
  const placas = c.tipo_placa ? cotizarPlacas(c.tipo_placa, c.habitaciones) : null;
  const saas = c.plan_saas ? cotizarMensualidad(c.plan_saas) : null;
  return (
    <article className="mx-auto w-full max-w-[816px] bg-white p-8 text-neutral-900 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.25)] print:max-w-none print:p-0 print:shadow-none">
      <style>{ESTILO_PAGINA}</style>
      <Encabezado
        emisor={emisor}
        derecha={
          <div className="w-[260px] rounded-lg border-2 border-neutral-900 p-3">
            <p className="text-center text-[16px] font-black tracking-[0.14em]">COTIZACIÓN</p>
            <p className="mb-2 text-center font-mono text-[14px] font-bold">{c.numero}</p>
            <Dato etiqueta="Fecha" valor={fechaLarga(c.creado_at)} />
            <Dato etiqueta="Válida por" valor="30 días" />
            <Dato etiqueta="Moneda" valor="Lempiras (L.)" />
          </div>
        }
      />

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-neutral-300 px-4 py-3 text-[12px]">
        <p>
          <span className="text-neutral-500">Hotel / Razón social: </span>
          <strong>{c.cliente_nombre}</strong>
        </p>
        <p>
          <span className="text-neutral-500">RTN: </span>
          <strong>{c.cliente_rtn || '—'}</strong>
        </p>
        <p>
          <span className="text-neutral-500">Contacto: </span>
          {c.contacto || '—'}
        </p>
        <p>
          <span className="text-neutral-500">Ciudad: </span>
          {c.ciudad || '—'}
        </p>
        <p>
          <span className="text-neutral-500">Habitaciones: </span>
          <strong>{c.habitaciones}</strong>
        </p>
      </section>

      {placas && c.tipo_placa && (
        <section className="mt-5">
          <h2 className="text-[13px] font-black uppercase tracking-[0.1em]">1. Placas NFC/QR · pago único</h2>
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-neutral-900 text-white">
                <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                <th className="px-3 py-2 text-right font-semibold">Cant.</th>
                <th className="px-3 py-2 text-right font-semibold">Precio (sin ISV)</th>
                <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="px-3 py-2">
                  {PLACAS[c.tipo_placa].nombre} · categoría {PLANES_SAAS[placas.categoria].nombre} ({PLANES_SAAS[placas.categoria].rango})
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.habitaciones}</td>
                <td className="px-3 py-2 text-right tabular-nums">{lempiras(placas.unitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{lempiras(placas.subtotal)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-2 grid grid-cols-[1fr_300px] gap-6">
            <div className="rounded-lg bg-neutral-100 px-3 py-2 text-[11.5px] leading-relaxed">
              <p className="font-bold">Condiciones de pago</p>
              <p>50% Anticipo contra firma: <strong className="tabular-nums">{lempiras(placas.anticipo)}</strong></p>
              <p>50% Contra entrega e instalación: <strong className="tabular-nums">{lempiras(placas.saldo)}</strong></p>
            </div>
            <div className="rounded-lg border-2 border-neutral-900 text-[12px]">
              <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                <span>Subtotal</span>
                <span className="tabular-nums">{lempiras(placas.subtotal)}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                <span>ISV (15%)</span>
                <span className="tabular-nums">{lempiras(placas.isv)}</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-3 py-1.5 font-black text-white">
                <span>Total placas</span>
                <span className="tabular-nums">{lempiras(placas.total)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {saas && c.plan_saas && (
        <section className="mt-5">
          <h2 className="text-[13px] font-black uppercase tracking-[0.1em]">{placas ? '2' : '1'}. Plataforma SaaS Seven Stay · mensual</h2>
          <div className="mt-2 grid grid-cols-[1fr_300px] gap-6">
            <div className="text-[12px] leading-relaxed">
              <p>
                <strong>Plan {PLANES_SAAS[c.plan_saas].nombre}</strong> ({PLANES_SAAS[c.plan_saas].rango})
              </p>
              <p className="text-neutral-600">Portal del huésped bilingüe, panel del hotel, avisos en vivo, métricas y soporte.</p>
              {c.bonificacion_piloto && (
                <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">Bonificación Piloto: Mes 1 SaaS L. 0.00</p>
              )}
            </div>
            <div className="rounded-lg border-2 border-neutral-900 text-[12px]">
              <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                <span>Mensualidad</span>
                <span className="tabular-nums">{lempiras(saas.subtotal)}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-200 px-3 py-1.5">
                <span>ISV (15%)</span>
                <span className="tabular-nums">{lempiras(saas.isv)}</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-3 py-1.5 font-black text-white">
                <span>Total / mes</span>
                <span className="tabular-nums">{lempiras(saas.total)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {c.notas && <p className="mt-5 rounded-lg border border-neutral-300 px-3 py-2 text-[11.5px] text-neutral-700">Notas: {c.notas}</p>}

      <div className="mt-5">
        <DatosBancarios e={emisor} />
      </div>

      <footer className="mt-6 flex items-center justify-between border-t border-neutral-300 pt-3 text-[10.5px] text-neutral-500">
        <span>Documento informativo · no es una factura. Precios en Lempiras; incluyen 15% ISV donde se indica.</span>
        <span className="flex items-center gap-2">
          <MarcaSevenStay tamano="sm" className="text-neutral-700" />
        </span>
      </footer>
    </article>
  );
}
