'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Clock, Plus, Search, UtensilsCrossed, X } from 'lucide-react';

import { useAhora } from '@/components/portal/AlertaSolicitudActiva';
import ConfirmacionEnviada from '@/components/portal/ConfirmacionEnviada';
import { formato12h, formatoPrecio } from '@/components/portal/etiquetasTicket';
import HojaSolicitudCatalogo from '@/components/portal/HojaSolicitudCatalogo';
import PortadaCatalogo from '@/components/portal/PortadaCatalogo';
import { useSolicitudCatalogo } from '@/components/portal/useSolicitudCatalogo';
import { useStay } from '@/context/StayContext';
import { categoriaAbierta, categoriaVisible, fechaCorta } from '@/lib/categorias';
import type { CatalogoItem, CategoriaMenu, Idioma } from '@/types/sevenstay';

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';
/** Con más platos que esto aparece el buscador. */
const PLATOS_PARA_BUSCADOR = 20;

const TEXTOS = {
  es: {
    inicio: 'Inicio',
    titulo: 'Menú',
    subtitulo: 'Pide desde tu habitación y te lo llevamos',
    sinMenu: 'El menú no está disponible en este momento.',
    ordenar: 'Ordenar',
    ordenarPlato: (plato: string) => `Ordenar ${plato}`,
    desde: (hora: string) => `Desde ${hora}`,
    disponibleDesde: (hora: string) => `Disponible desde las ${hora}`,
    hasta: (fecha: string) => `Hasta el ${fecha}`,
    otros: 'Más opciones',
    secciones: 'Secciones del menú',
    buscar: 'Buscar en el menú',
    limpiar: 'Borrar búsqueda',
    sinResultados: 'No encontramos platos con ese nombre.',
    infoTitulo: 'Horarios del hotel',
    desayuno: 'Desayuno',
    piscina: 'Piscina',
    checkout: 'Check-out',
    silencio: 'Horario de silencio',
    notas: 'Notas del hotel',
  },
  en: {
    inicio: 'Home',
    titulo: 'Menu',
    subtitulo: "Order from your room and we'll bring it to you",
    sinMenu: 'The menu is not available right now.',
    ordenar: 'Order',
    ordenarPlato: (plato: string) => `Order ${plato}`,
    desde: (hora: string) => `From ${hora}`,
    disponibleDesde: (hora: string) => `Available from ${hora}`,
    hasta: (fecha: string) => `Until ${fecha}`,
    otros: 'More options',
    secciones: 'Menu sections',
    buscar: 'Search the menu',
    limpiar: 'Clear search',
    sinResultados: "We couldn't find dishes with that name.",
    infoTitulo: 'Hotel hours',
    desayuno: 'Breakfast',
    piscina: 'Pool',
    checkout: 'Check-out',
    silencio: 'Quiet hours',
    notas: 'Hotel notes',
  },
} as const;

type Textos = (typeof TEXTOS)[Idioma];

/** "Café con leche" → "cafe con leche" (para buscar sin tildes ni mayúsculas). */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface Seccion {
  id: string;
  nombre: string;
  categoria: CategoriaMenu | null;
  abierta: boolean;
  platos: CatalogoItem[];
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function BotonOrdenar({ titulo, abierta, horaApertura, t, onOrdenar }: { titulo: string; abierta: boolean; horaApertura: string | null; t: Textos; onOrdenar: () => void }) {
  if (!abierta) {
    return (
      <span className="flex h-[40px] shrink-0 items-center rounded-full bg-neutral-100 px-4 text-[12.5px] font-medium text-neutral-500">
        {horaApertura ? t.desde(horaApertura) : '—'}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOrdenar}
      aria-label={t.ordenarPlato(titulo)}
      className={`flex h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 pl-4 pr-5 text-[13px] font-medium text-white transition-transform duration-300 ${EASE} active:scale-[0.97]`}
    >
      <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
      {t.ordenar}
    </button>
  );
}

/** Tarjeta grande con foto (menú corto, sin categorías). */
function TarjetaPlato({ plato, idioma, t, onOrdenar }: { plato: CatalogoItem; idioma: Idioma; t: Textos; onOrdenar: () => void }) {
  const titulo = idioma === 'es' ? plato.titulo_es : plato.titulo_en;
  const horario = idioma === 'es' ? plato.horario_o_duracion_es : plato.horario_o_duracion_en;
  return (
    <article className={`${TARJETA} overflow-hidden`}>
      <PortadaCatalogo item={plato} className="h-36" />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[16px] font-semibold leading-snug text-neutral-900">{titulo}</h2>
          <span className="shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums text-neutral-900">
            {formatoPrecio(plato.precio, plato.moneda)}
          </span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-neutral-600">{idioma === 'es' ? plato.descripcion_es : plato.descripcion_en}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          {/* El horario es opcional: sin texto no se muestra el reloj solo. */}
          {horario ? (
            <span className="inline-flex min-w-0 items-start gap-1.5 text-[12px] font-medium leading-snug text-neutral-500">
              <Clock aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <span>{horario}</span>
            </span>
          ) : (
            <span />
          )}
          <BotonOrdenar titulo={titulo} abierta horaApertura={null} t={t} onOrdenar={onOrdenar} />
        </div>
      </div>
    </article>
  );
}

/** Fila compacta (menú por categorías): texto a la izquierda, foto a la derecha. */
function FilaPlato({
  plato,
  idioma,
  t,
  abierta,
  horaApertura,
  onOrdenar,
}: {
  plato: CatalogoItem;
  idioma: Idioma;
  t: Textos;
  abierta: boolean;
  horaApertura: string | null;
  onOrdenar: () => void;
}) {
  const titulo = idioma === 'es' ? plato.titulo_es : plato.titulo_en;
  const descripcion = idioma === 'es' ? plato.descripcion_es : plato.descripcion_en;
  // Botón "+" redondo: sobre la esquina de la foto, o solo a la derecha si no hay foto.
  const botonMas = (
    <button
      type="button"
      onClick={onOrdenar}
      aria-label={t.ordenarPlato(titulo)}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-[0_4px_12px_rgba(17,24,39,0.25)] ring-[3px] ring-white transition-transform duration-300 ${EASE} active:scale-[0.92]`}
    >
      <Plus aria-hidden className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
  return (
    <li className="flex items-start gap-4 px-4 py-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[15.5px] font-semibold leading-snug text-neutral-900">{titulo}</h3>
        {descripcion && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">{descripcion}</p>}
        <p className="mt-2 text-[15px] font-semibold tabular-nums text-neutral-900">{formatoPrecio(plato.precio, plato.moneda)}</p>
        {!abierta && horaApertura && <p className="mt-1 text-[12.5px] font-medium text-amber-700">{t.desde(horaApertura)}</p>}
      </div>
      {plato.imagen_url ? (
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage */}
          <img
            src={plato.imagen_url}
            alt=""
            loading="lazy"
            className={`h-[104px] w-[104px] rounded-2xl object-cover ${abierta ? '' : 'opacity-50 grayscale'}`}
          />
          {abierta && <div className="absolute -bottom-2 -right-2">{botonMas}</div>}
        </div>
      ) : (
        abierta && <div className="shrink-0 self-center">{botonMas}</div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function MenuPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { hotel, habitaciones, catalogo, categoriasMenu, idioma } = useStay();
  const ahora = useAhora();
  const [busqueda, setBusqueda] = useState('');
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  const base = `/p/${encodeURIComponent(codigo ?? '')}`;
  const solicitud = useSolicitudCatalogo(habitacion?.numero ?? '', base);
  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva

  const fecha = new Date(ahora);
  const zona = hotel.zona_horaria;
  // Categorías que se muestran hoy (activas y en temporada), en el orden del hotel.
  const visibles = categoriasMenu.filter((c) => categoriaVisible(c, zona, fecha));
  const idsVisibles = new Set(visibles.map((c) => c.id));
  // Un plato de una categoría oculta o fuera de temporada no se muestra.
  const platos = catalogo.filter(
    (item) => item.tipo === 'menu' && item.activo && (!item.categoria_id || idsVisibles.has(item.categoria_id)),
  );
  const conCategorias = visibles.length > 0;

  const termino = normalizar(busqueda.trim());
  const coincide = (p: CatalogoItem) =>
    !termino ||
    normalizar(`${p.titulo_es} ${p.titulo_en} ${p.descripcion_es} ${p.descripcion_en}`).includes(termino);

  const secciones: Seccion[] = [
    ...visibles.map((c) => ({
      id: c.id,
      nombre: idioma === 'es' ? c.nombre_es : c.nombre_en,
      categoria: c,
      abierta: categoriaAbierta(c, zona, fecha),
      platos: platos.filter((p) => p.categoria_id === c.id && coincide(p)),
    })),
    {
      id: 'otros',
      nombre: t.otros,
      categoria: null,
      abierta: true,
      platos: platos.filter((p) => !p.categoria_id && coincide(p)),
    },
  ].filter((s) => s.platos.length > 0);

  const irASeccion = (id: string) => {
    setSeccionActiva(id);
    document.getElementById(`seccion-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filasInfo = [
    { etiqueta: t.desayuno, valor: hotel.horario_desayuno },
    { etiqueta: t.piscina, valor: hotel.horario_piscina },
    { etiqueta: t.checkout, valor: formato12h(hotel.hora_checkout) },
    { etiqueta: t.silencio, valor: `${formato12h(hotel.hora_silencio_inicio)} – ${formato12h(hotel.hora_silencio_fin)}` },
  ];
  const notasHotel = idioma === 'es' ? hotel.notas_info_es : hotel.notas_info_en;

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
        <p className="mt-1 text-[14px] text-neutral-500">{t.subtitulo}</p>
      </header>

      {platos.length === 0 ? (
        <div className={`${TARJETA} flex flex-col items-center px-6 py-10 text-center`}>
          <UtensilsCrossed aria-hidden className="h-7 w-7 text-neutral-400" strokeWidth={1.75} />
          <p className="mt-3 max-w-[260px] text-[14px] leading-relaxed text-neutral-500">{t.sinMenu}</p>
        </div>
      ) : !conCategorias ? (
        // Menú corto sin categorías: tarjetas grandes con foto.
        platos.map((plato) => (
          <TarjetaPlato key={plato.id} plato={plato} idioma={idioma} t={t} onOrdenar={() => solicitud.abrir(plato)} />
        ))
      ) : (
        <>
          {/* Buscador (menús largos) */}
          {platos.length > PLATOS_PARA_BUSCADOR && (
            <label className="relative block">
              <span className="sr-only">{t.buscar}</span>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t.buscar}
                className="h-12 w-full rounded-2xl border border-black/[0.06] bg-white pl-11 pr-11 text-[16px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label={t.limpiar}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-neutral-400"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </label>
          )}

          {/* Pestañas de secciones (quedan fijas bajo el encabezado al bajar) */}
          {secciones.length > 1 && (
            <nav
              aria-label={t.secciones}
              className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 overflow-x-auto bg-[#F8F9FA]/90 px-4 py-2 backdrop-blur-xl [scrollbar-width:none]"
            >
              <ul className="flex w-max gap-2">
                {secciones.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => irASeccion(s.id)}
                      aria-current={seccionActiva === s.id ? 'true' : undefined}
                      className={`h-10 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors ${
                        seccionActiva === s.id ? 'bg-neutral-900 text-white' : 'border border-black/[0.06] bg-white text-neutral-700'
                      }`}
                    >
                      {s.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {secciones.length === 0 && <p className="px-1 py-6 text-center text-[14px] text-neutral-500">{t.sinResultados}</p>}

          {secciones.map((s) => {
            const c = s.categoria;
            const horaApertura = c?.hora_inicio ? formato12h(c.hora_inicio) : null;
            return (
              <section key={s.id} id={`seccion-${s.id}`} aria-labelledby={`titulo-${s.id}`} className="scroll-mt-32">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                  <h2 id={`titulo-${s.id}`} className="text-[17px] font-semibold text-neutral-900">
                    {s.nombre}
                  </h2>
                  {c && (c.hora_inicio || c.fecha_fin) && (
                    <p className={`flex items-center gap-1.5 text-[12.5px] font-medium ${s.abierta ? 'text-neutral-500' : 'text-amber-700'}`}>
                      {c.hora_inicio && c.hora_fin && <Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />}
                      {!s.abierta && horaApertura
                        ? t.disponibleDesde(horaApertura)
                        : c.hora_inicio && c.hora_fin
                          ? `${formato12h(c.hora_inicio)} – ${formato12h(c.hora_fin)}`
                          : null}
                      {c.fecha_fin && (
                        <span className="text-neutral-400">
                          {c.hora_inicio ? ' · ' : ''}
                          {t.hasta(fechaCorta(c.fecha_fin, idioma))}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <ul className={`${TARJETA} divide-y divide-neutral-100`}>
                  {s.platos.map((plato) => (
                    <FilaPlato
                      key={plato.id}
                      plato={plato}
                      idioma={idioma}
                      t={t}
                      abierta={s.abierta}
                      horaApertura={horaApertura}
                      onOrdenar={() => solicitud.abrir(plato)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {/* Horarios del hotel (la tarjeta de la Home es "Menú y Horarios") */}
      <section aria-labelledby="titulo-horarios" className="mt-2 flex flex-col gap-3">
        <h2 id="titulo-horarios" className="px-1 text-[17px] font-semibold text-neutral-900">
          {t.infoTitulo}
        </h2>
        <dl className={`${TARJETA} divide-y divide-neutral-100 px-4`}>
          {filasInfo.map(({ etiqueta, valor }) => (
            <div key={etiqueta} className="flex min-h-[52px] items-center justify-between gap-4 py-3">
              <dt className="text-[14.5px] text-neutral-600">{etiqueta}</dt>
              <dd className="text-right text-[14.5px] font-semibold tabular-nums text-neutral-900">{valor}</dd>
            </div>
          ))}
          {notasHotel && (
            <div className="py-3.5">
              <dt className="text-[14.5px] text-neutral-600">{t.notas}</dt>
              <dd className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-700">{notasHotel}</dd>
            </div>
          )}
        </dl>
      </section>

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
