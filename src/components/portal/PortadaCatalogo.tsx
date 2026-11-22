import { Compass, UtensilsCrossed } from 'lucide-react';

import type { CatalogoItem } from '@/types/sevenstay';

/** Degradados de respaldo cuando el ítem todavía no tiene foto. */
const DEGRADADOS = {
  tour: [
    'from-teal-500 via-cyan-600 to-sky-700',
    'from-emerald-500 via-teal-600 to-cyan-800',
    'from-lime-500 via-emerald-600 to-teal-800',
  ],
  menu: [
    'from-amber-400 via-orange-500 to-rose-600',
    'from-orange-400 via-rose-500 to-pink-700',
    'from-yellow-400 via-amber-500 to-orange-700',
  ],
} as const;

function indiceEstable(texto: string, total: number): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % total;
}

/**
 * Imagen de portada de un tour o plato. Si el ítem tiene `imagen_url` muestra
 * la foto; si no, un degradado con ícono para que la tarjeta nunca quede vacía.
 */
export default function PortadaCatalogo({ item, className = '' }: { item: CatalogoItem; className?: string }) {
  if (item.imagen_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- las fotos vendrán del hotel (Storage); next/image exigiría dominios fijos
      <img src={item.imagen_url} alt="" loading="lazy" className={`block w-full object-cover ${className}`} />
    );
  }
  const paleta = DEGRADADOS[item.tipo];
  const Icono = item.tipo === 'tour' ? Compass : UtensilsCrossed;
  return (
    <div
      aria-hidden
      className={`relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br ${paleta[indiceEstable(item.id, paleta.length)]} ${className}`}
    >
      <span className="absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <span className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
      <Icono className="relative h-10 w-10 text-white/85" strokeWidth={1.5} />
    </div>
  );
}
