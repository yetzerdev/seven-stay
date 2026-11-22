import { PlusSquare, Share } from 'lucide-react';

import type { Idioma } from '@/types/sevenstay';

const TEXTOS = {
  es: {
    paso1Safari: 'Toca Compartir',
    paso1SafariDonde: 'en la barra de Safari (abajo, o arriba en iPad)',
    paso1Otro: 'Toca Compartir',
    paso1OtroDonde: 'arriba a la derecha del navegador',
    paso2: 'Elige «Agregar a inicio»',
    paso2Ayuda: 'Si no aparece, desliza hacia abajo en la lista',
    paso3: 'Toca «Agregar»',
    paso3Ayuda: 'Abre Seven Stay desde el ícono nuevo',
  },
  en: {
    paso1Safari: 'Tap Share',
    paso1SafariDonde: 'in the Safari toolbar (bottom, or top on iPad)',
    paso1Otro: 'Tap Share',
    paso1OtroDonde: 'at the top right of your browser',
    paso2: 'Choose “Add to Home Screen”',
    paso2Ayuda: 'If you don’t see it, scroll down the list',
    paso3: 'Tap “Add”',
    paso3Ayuda: 'Open Seven Stay from the new icon',
  },
} as const;

/** Los 3 pasos para instalar la app en iPhone/iPad (Safari no tiene botón de instalar). */
export default function PasosInstalarIOS({ idioma, safari }: { idioma: Idioma; safari: boolean }) {
  const t = TEXTOS[idioma];
  const pasos = [
    {
      icono: <Share aria-hidden className="h-[18px] w-[18px] text-[#007AFF]" strokeWidth={2.25} />,
      titulo: safari ? t.paso1Safari : t.paso1Otro,
      ayuda: safari ? t.paso1SafariDonde : t.paso1OtroDonde,
    },
    {
      icono: <PlusSquare aria-hidden className="h-[18px] w-[18px] text-neutral-900" strokeWidth={2.25} />,
      titulo: t.paso2,
      ayuda: t.paso2Ayuda,
    },
    {
      icono: <span aria-hidden className="text-[13px] font-bold text-[#007AFF]">OK</span>,
      titulo: t.paso3,
      ayuda: t.paso3Ayuda,
    },
  ];
  return (
    <ol className="flex flex-col gap-2.5">
      {pasos.map((p, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-[#F8F9FA]">{p.icono}</span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-snug text-neutral-900">
              {i + 1}. {p.titulo}
            </span>
            <span className="block text-[12.5px] leading-snug text-neutral-500">{p.ayuda}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
