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
// Cotización (proforma comercial) · diseño limpio: franja, una tabla, totales, firmas
// ---------------------------------------------------------------------------

/** Para que la franja oscura y el encabezado de la tabla salgan al imprimir. */
const IMPRIMIR_FONDOS = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as const;

export function CotizacionImpresa({ c, emisor }: { c: Cotizacion; emisor: ConfigFiscal }) {
  const placas = c.tipo_placa ? cotizarPlacas(c.tipo_placa, c.habitaciones) : null;
  const saas = c.plan_saas ? cotizarMensualidad(c.plan_saas) : null;

  const filas: { producto: string; detalle?: string; cantidad: string; precio: number; total: number }[] = [];
  if (placas && c.tipo_placa) {
    filas.push({
      producto: `Placas NFC/QR · ${PLACAS[c.tipo_placa].nombre}`,
      detalle: 'Pago único · instalación incluida',
      cantidad: String(c.habitaciones),
      precio: placas.unitario,
      total: placas.subtotal,
    });
  }
  if (saas && c.plan_saas) {
    filas.push({
      producto: `Plataforma Seven Stay · Plan ${PLANES_SAAS[c.plan_saas].nombre}`,
      detalle: c.bonificacion_piloto ? 'Mensual · Mes 1 bonificado (L. 0.00)' : 'Mensual',
      cantidad: '1 / mes',
      precio: saas.subtotal,
      total: saas.subtotal,
    });
  }

  return (
    <article
      style={IMPRIMIR_FONDOS}
      className="mx-auto flex min-h-[1056px] w-full max-w-[816px] flex-col bg-white text-neutral-900 shadow-[0_8px_30px_-12px_rgba(17,24,39,0.25)] print:min-h-0 print:max-w-none print:shadow-none"
    >
      <style>{'@page { size: letter; margin: 0; }'}</style>

      {/* Franja superior */}
      <header style={IMPRIMIR_FONDOS} className="flex items-start justify-between gap-8 bg-neutral-900 px-12 pb-9 pt-10 text-white">
        <div>
          <MarcaSevenStay tamano="lg" />
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/60">{emisor.denominacion || 'SevenCloud Systems'}</p>
          {emisor.domicilio && <p className="mt-2 max-w-[260px] text-[11.5px] leading-relaxed text-white/70">{emisor.domicilio}</p>}
        </div>
        <div className="text-right">
          <p className="text-[26px] font-black tracking-[0.06em]">COTIZACIÓN</p>
          <p className="font-mono text-[13px] text-white/70">{c.numero}</p>
          <dl className="mt-4 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-[12px]">
            <dt className="text-white/55">Fecha</dt>
            <dd className="font-semibold">{fechaLarga(c.creado_at)}</dd>
            <dt className="text-white/55">Cliente</dt>
            <dd className="max-w-[200px] font-semibold">{c.cliente_nombre}</dd>
            {c.contacto && (
              <>
                <dt className="text-white/55">Contacto</dt>
                <dd className="font-semibold">{c.contacto}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <div className="flex flex-1 flex-col px-12 py-9">
        <p className="text-[13px] leading-relaxed text-neutral-600">
          Portal del huésped y panel operativo Seven Stay para <strong className="text-neutral-900">{c.cliente_nombre}</strong>
          {c.ciudad ? `, ${c.ciudad}` : ''} · {c.habitaciones} habitaciones.
        </p>

        <table className="mt-6 w-full border-collapse text-[12.5px]">
          <thead>
            <tr style={IMPRIMIR_FONDOS} className="bg-neutral-900 text-white">
              <th className="px-4 py-2.5 text-left font-semibold">Producto</th>
              <th className="px-4 py-2.5 text-right font-semibold">Cantidad</th>
              <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto} className="border-b border-neutral-200 align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold">{f.producto}</p>
                  {f.detalle && <p className="text-[11.5px] text-neutral-500">{f.detalle}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{f.cantidad}</td>
                <td className="px-4 py-3 text-right tabular-nums">{lempiras(f.precio)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{lempiras(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right text-[11px] text-neutral-500">Precios sin ISV · se agrega 15% ISV</p>

        {/* Totales: el pago único y la mensualidad se muestran por separado */}
        <div className="mt-5 ml-auto w-[320px] text-[13px]">
          {placas && (
            <>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">Placas · subtotal</span>
                <span className="tabular-nums">{lempiras(placas.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-600">ISV 15%</span>
                <span className="tabular-nums">{lempiras(placas.isv)}</span>
              </div>
              <div style={IMPRIMIR_FONDOS} className="mt-1 flex justify-between bg-neutral-900 px-3 py-2 font-bold text-white">
                <span>Total pago único</span>
                <span className="tabular-nums">{lempiras(placas.total)}</span>
              </div>
            </>
          )}
          {saas && (
            <div className={`flex justify-between border-2 border-neutral-900 px-3 py-2 font-bold ${placas ? 'mt-2' : ''}`}>
              <span>Mensualidad con ISV</span>
              <span className="tabular-nums">{lempiras(saas.total)} / mes</span>
            </div>
          )}
        </div>

        {placas && (
          <p className="mt-5 text-[12px] text-neutral-600">
            Forma de pago de las placas: 50% de anticipo al firmar ({lempiras(placas.anticipo)}) y 50% contra entrega e instalación ({lempiras(placas.saldo)}).
          </p>
        )}
        {c.notas && <p className="mt-2 text-[12px] text-neutral-600">{c.notas}</p>}

        <p className="mt-6 text-[12px] font-bold">Cotización válida por 30 días.</p>

        {/* Firmas al pie de la hoja */}
        <div className="mt-auto grid grid-cols-2 gap-16 pt-20 text-[11.5px] text-neutral-600">
          <p className="border-t border-neutral-400 pt-2">Firma del cliente</p>
          <p className="border-t border-neutral-400 pt-2">{emisor.denominacion || 'SevenCloud Systems'}</p>
        </div>
      </div>
    </article>
  );
}
