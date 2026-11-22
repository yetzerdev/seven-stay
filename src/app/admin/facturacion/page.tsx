'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

import EmitirFactura, { FACTURA_VACIA } from '@/components/admin/facturacion/EmitirFactura';
import TabConfigFiscal from '@/components/admin/facturacion/TabConfigFiscal';
import TabCotizaciones from '@/components/admin/facturacion/TabCotizaciones';
import TabFacturas from '@/components/admin/facturacion/TabFacturas';
import TabReportes from '@/components/admin/facturacion/TabReportes';
import TabSuscripciones from '@/components/admin/facturacion/TabSuscripciones';
import type { NuevaFactura } from '@/lib/admin/tipos';

const PESTANAS = [
  { valor: 'facturas', texto: 'Facturas' },
  { valor: 'cotizaciones', texto: 'Cotizaciones' },
  { valor: 'suscripciones', texto: 'Suscripciones' },
  { valor: 'reportes', texto: 'Reportes SAR' },
  { valor: 'config', texto: 'Configuración Fiscal (SAR)' },
] as const;
type Pestana = (typeof PESTANAS)[number]['valor'];

/** Facturación SAR de SevenCloud Systems: todo en Lempiras. */
export default function FacturacionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const pestana: Pestana = PESTANAS.find((p) => p.valor === params.get('pestana'))?.valor ?? 'facturas';
  const [borrador, setBorrador] = useState<NuevaFactura | null>(null);
  const [emitida, setEmitida] = useState<{ id: string; numero: string } | null>(null);
  const [recarga, setRecarga] = useState(0);

  const irA = (p: Pestana) => router.replace(`/admin/facturacion?pestana=${p}`, { scroll: false });
  const facturar = (b: NuevaFactura) => {
    setEmitida(null);
    setBorrador(b);
  };

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Facturación</h1>
        <p className="mt-1 text-[15px] text-neutral-500">SevenCloud Systems · facturas SAR, cotizaciones, suscripciones y reportes. Todo en Lempiras (L.).</p>
      </header>

      {emitida && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
          <CheckCircle2 aria-hidden className="h-5 w-5" />
          Factura <span className="font-mono font-bold">{emitida.numero}</span> emitida.
          <a href={`/admin/facturacion/factura/${emitida.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Ver / descargar PDF
          </a>
        </p>
      )}

      <nav aria-label="Secciones de facturación" className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => irA(p.valor)}
            aria-current={pestana === p.valor ? 'page' : undefined}
            className={`relative h-12 shrink-0 px-4 text-[15px] font-semibold ${pestana === p.valor ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-800'}`}
          >
            {p.texto}
            {pestana === p.valor && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-neutral-900" />}
          </button>
        ))}
      </nav>

      {pestana === 'facturas' && <TabFacturas onNueva={() => facturar(FACTURA_VACIA)} recarga={recarga} />}
      {pestana === 'cotizaciones' && <TabCotizaciones onFacturar={facturar} />}
      {pestana === 'suscripciones' && <TabSuscripciones onFacturar={facturar} recarga={recarga} />}
      {pestana === 'reportes' && <TabReportes />}
      {pestana === 'config' && <TabConfigFiscal onGuardada={() => setRecarga((n) => n + 1)} />}

      {borrador && (
        <EmitirFactura
          inicial={borrador}
          onCerrar={() => setBorrador(null)}
          onEmitida={(id, numero) => {
            setBorrador(null);
            setEmitida({ id, numero });
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </main>
  );
}
