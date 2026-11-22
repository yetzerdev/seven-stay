import type { ReactNode } from 'react';

/** Piezas visuales compartidas del panel interno (mismo lenguaje que el panel del hotel). */

export const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-500';

export const BOTON_PRIMARIO =
  'flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50';

export const BOTON_SECUNDARIO =
  'flex h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[15px] font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

export function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold text-neutral-700">{etiqueta}</span>
      {children}
      {error ? (
        <span className="text-[13px] font-medium text-rose-600">{error}</span>
      ) : (
        ayuda && <span className="text-[12.5px] text-neutral-400">{ayuda}</span>
      )}
    </label>
  );
}

export function AvisoError({ mensaje, onCerrar }: { mensaje: string | null; onCerrar?: () => void }) {
  if (!mensaje) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[14.5px] text-rose-800">
      <p>{mensaje}</p>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className="shrink-0 text-[13px] font-semibold text-rose-600 hover:underline">
          Cerrar
        </button>
      )}
    </div>
  );
}

export function EstadoPastilla({ tono, children }: { tono: 'verde' | 'gris' | 'ambar' | 'rojo' | 'azul'; children: ReactNode }) {
  const colores = {
    verde: 'bg-emerald-50 text-emerald-800',
    gris: 'bg-neutral-100 text-neutral-600',
    ambar: 'bg-amber-50 text-amber-800',
    rojo: 'bg-rose-50 text-rose-700',
    azul: 'bg-sky-50 text-sky-800',
  }[tono];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${colores}`}>{children}</span>;
}

/** Lee un archivo de imagen como data URL (los logos PNG se suben tal cual para conservar la transparencia). */
export function leerArchivo(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(archivo);
  });
}
