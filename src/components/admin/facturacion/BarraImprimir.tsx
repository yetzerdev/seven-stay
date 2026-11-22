'use client';

import { Printer } from 'lucide-react';

/** Barra superior de los documentos (no sale al imprimir). */
export default function BarraImprimir({ titulo }: { titulo: string }) {
  return (
    <div className="mx-auto mb-5 flex w-full max-w-[816px] flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-[15px] font-semibold text-neutral-700">{titulo}</p>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
      >
        <Printer aria-hidden className="h-4 w-4" />
        Descargar PDF / Imprimir
      </button>
      <p className="w-full text-[12.5px] text-neutral-500">En la ventana de impresión elige «Guardar como PDF» como destino.</p>
    </div>
  );
}
