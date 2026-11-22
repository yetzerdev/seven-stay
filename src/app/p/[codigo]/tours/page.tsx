'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BadgeCheck, ChevronLeft, Clock, Compass, Hotel, Star } from 'lucide-react';

import ConfirmacionEnviada from '@/components/portal/ConfirmacionEnviada';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import HojaSolicitudCatalogo from '@/components/portal/HojaSolicitudCatalogo';
import PortadaCatalogo from '@/components/portal/PortadaCatalogo';
import { useSolicitudCatalogo } from '@/components/portal/useSolicitudCatalogo';
import { tourVisible, useStay } from '@/context/StayContext';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';

const TEXTOS = {
  es: {
    inicio: 'Inicio',
    titulo: 'Tours y Guías',
    subtitulo: 'Experiencias locales para tu estadía',
    subtituloSevenStay: 'Experiencias con operadores locales seleccionados por Seven Stay',
    subtituloPropios: (hotel: string) => `Experiencias organizadas por ${hotel}`,
    porSevenStay: 'Operado por Seven Stay',
    recomendado: 'Recomendado',
    porHotel: (hotel: string) => `Del hotel · ${hotel}`,
    sinTours: 'Por ahora no hay tours disponibles. Pregunta en recepción por otras opciones.',
    reservar: 'Solicitar información / Reservar',
  },
  en: {
    inicio: 'Home',
    titulo: 'Tours & Guides',
    subtitulo: 'Local experiences for your stay',
    subtituloSevenStay: 'Experiences with local operators selected by Seven Stay',
    subtituloPropios: (hotel: string) => `Experiences organized by ${hotel}`,
    porSevenStay: 'Operated by Seven Stay',
    recomendado: 'Recommended',
    porHotel: (hotel: string) => `Hotel tour · ${hotel}`,
    sinTours: 'No tours are available right now. Ask the front desk for other options.',
    reservar: 'Inquire / Book',
  },
} as const;

export default function ToursPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { hotel, habitaciones, catalogo, idioma } = useStay();
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  const base = `/p/${encodeURIComponent(codigo ?? '')}`;
  const solicitud = useSolicitudCatalogo(habitacion?.numero ?? '', base);
  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva

  // Primero los de Seven Stay (en «Ambos» van como «Recomendado»), luego los del hotel.
  const tours = catalogo
    .filter((item) => tourVisible(item, hotel.modo_tours))
    .sort((a, b) => Number(a.propio) - Number(b.propio));
  const marcarRecomendados = hotel.modo_tours === 'ambos' && tours.some((x) => x.propio);
  const subtitulo =
    hotel.modo_tours === 'seven_stay' ? t.subtituloSevenStay : hotel.modo_tours === 'propios' ? t.subtituloPropios(hotel.nombre) : t.subtitulo;

  return (
    <main className="flex flex-col gap-4 pb-2">
      <Link
        href={base}
        className={`-ml-2 -mt-4 flex h-12 w-fit items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-medium text-neutral-600 transition-transform duration-300 ${EASE} active:scale-[0.965]`}
      >
        <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.25} />
        {t.inicio}
      </Link>

      <header className="-mt-1 px-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-neutral-900">{t.titulo}</h1>
        <p className="mt-1 text-[14px] text-neutral-500">{subtitulo}</p>
      </header>

      {tours.length === 0 ? (
        <div className={`${TARJETA} flex flex-col items-center px-6 py-10 text-center`}>
          <Compass aria-hidden className="h-7 w-7 text-neutral-400" strokeWidth={1.75} />
          <p className="mt-3 max-w-[260px] text-[14px] leading-relaxed text-neutral-500">{t.sinTours}</p>
        </div>
      ) : (
        tours.map((tour) => (
          <article key={tour.id} className={`${TARJETA} overflow-hidden`}>
            <PortadaCatalogo item={tour} className="h-44" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[16px] font-semibold leading-snug text-neutral-900">
                  {idioma === 'es' ? tour.titulo_es : tour.titulo_en}
                </h2>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-neutral-900/[0.05] px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-neutral-900">
                  {formatoPrecio(tour.precio, tour.moneda)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {marcarRecomendados && !tour.propio && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-900 px-2.5 py-1 text-[12px] font-semibold text-white">
                    <Star aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {t.recomendado}
                  </span>
                )}
                {/* Quién opera el tour: así el huésped sabe con quién lo coordina y dónde paga */}
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[12px] font-medium text-neutral-600">
                  {tour.propio ? (
                    <Hotel aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : (
                    <BadgeCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
                  )}
                  <span className="max-w-[220px] truncate">{tour.propio ? t.porHotel(hotel.nombre) : t.porSevenStay}</span>
                </span>
                {(idioma === 'es' ? tour.horario_o_duracion_es : tour.horario_o_duracion_en) && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F8F9FA] px-2.5 py-1 text-[12px] font-medium text-neutral-600">
                    <Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {idioma === 'es' ? tour.horario_o_duracion_es : tour.horario_o_duracion_en}
                  </span>
                )}
              </div>
              <p className="text-[13.5px] leading-relaxed text-neutral-600">
                {idioma === 'es' ? tour.descripcion_es : tour.descripcion_en}
              </p>
              <button
                type="button"
                onClick={() => solicitud.abrir(tour)}
                className={`h-[44px] w-full rounded-full bg-neutral-900 text-[13px] font-medium text-white transition-transform duration-300 ${EASE} active:scale-[0.98]`}
              >
                {t.reservar}
              </button>
            </div>
          </article>
        ))
      )}

      <HojaSolicitudCatalogo
        item={solicitud.item}
        idioma={idioma}
        enviando={solicitud.enviando}
        error={solicitud.error}
        onCerrar={solicitud.cerrar}
        onConfirmar={solicitud.confirmar}
      />
      {solicitud.confirmado && (
        <ConfirmacionEnviada
          codigoCorto={solicitud.confirmado.codigo}
          idioma={idioma}
          onTerminar={solicitud.alTerminarConfirmacion}
        />
      )}
    </main>
  );
}
