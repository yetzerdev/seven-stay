'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Minus, Moon, Plus } from 'lucide-react';

import ConfirmacionEnviada from '@/components/portal/ConfirmacionEnviada';
import { mensajeErrorEnvio } from '@/components/portal/etiquetasTicket';
import { generarIdempotencyKey, useStay } from '@/context/StayContext';
import type { HoraDelDia, Idioma, ItemHousekeeping } from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Constantes de diseño y textos
// ---------------------------------------------------------------------------

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const GRUPO = 'overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)] divide-y divide-neutral-100';
const MAX_CANTIDAD = 4;
const MAX_NOTA = 140;

const ITEMS: { clave: ItemHousekeeping; textos: Record<Idioma, [string, string]> }[] = [
  {
    clave: 'toallas',
    textos: {
      es: ['Toallas adicionales', 'Toallas de baño extra, de manos o tapete de ducha'],
      en: ['Extra towels', 'Bath towels, hand towels, or bath mat'],
    },
  },
  {
    clave: 'almohadas_cobijas',
    textos: {
      es: ['Almohadas y ropa de cama', 'Almohadas adicionales, mantas o cobijas'],
      en: ['Pillows & extra bedding', 'Additional pillows, blankets, or throws'],
    },
  },
  {
    clave: 'amenities',
    textos: {
      es: ['Artículos de higiene personal', 'Papel higiénico, cepillo/pasta dental, jabón o champú'],
      en: ['Personal care amenities', 'Toilet paper, toothbrush/paste, soap, or shampoo'],
    },
  },
  {
    clave: 'cafe_cortesias',
    textos: {
      es: ['Café, té y cortesías', 'Refuerzo de café, té, tazas o botellas de agua'],
      en: ['Coffee, tea & refreshments', 'Extra coffee, tea, mugs, or bottled water'],
    },
  },
  {
    clave: 'plancha',
    textos: {
      es: ['Plancha y burro de planchar', 'Préstamo temporal para prendas en habitación'],
      en: ['Iron & ironing board', 'Temporary in-room garment care loan'],
    },
  },
  {
    clave: 'adaptadores',
    textos: {
      es: ['Adaptadores y cargadores', 'Adaptador universal de corriente o cable USB'],
      en: ['Power adapters & chargers', 'Universal plug adapter or USB cable'],
    },
  },
];

const TEXTOS = {
  es: {
    volver: 'Volver',
    titulo: 'Limpieza y Amenidades',
    subtitulo: 'Selecciona lo que necesitas en tu habitación',
    nocturno: (rango: string, fin: string) =>
      `Horario nocturno (${rango}): las solicitudes de insumos se entregarán a partir de las ${fin}.`,
    insumos: 'Insumos',
    preferencias: 'Servicio',
    limpiezaAhora: 'Solicitar limpieza de habitación ahora',
    noMolestar: 'Activar "No Molestar"',
    nota: 'Nota para el personal (obligatoria)',
    notaRequerida: 'Escribe una nota para poder enviar la solicitud.',
    notaPlaceholder: 'Ej. Dejar las toallas junto a la puerta, por favor...',
    disclaimer:
      'Nota: Algunos artículos o préstamos (como adaptadores, amenities especiales o reposiciones extra) pueden estar sujetos a disponibilidad, depósito o cargos adicionales establecidos directamente por el hotel. Seven Stay actúa únicamente como plataforma tecnológica de comunicación y no se hace responsable por tarifas, disponibilidad ni políticas internas del establecimiento.',
    enviar: 'Enviar Solicitud',
    enviando: 'Enviando…',
    menos: (item: string) => `Quitar uno: ${item}`,
    mas: (item: string) => `Agregar uno: ${item}`,
  },
  en: {
    volver: 'Back',
    titulo: 'Housekeeping & Amenities',
    subtitulo: 'Select what you need for your room',
    nocturno: (rango: string, fin: string) =>
      `Quiet hours (${rango}): amenity requests will be delivered starting at ${fin}.`,
    insumos: 'Items',
    preferencias: 'Service',
    limpiezaAhora: 'Request room cleaning now',
    noMolestar: 'Enable "Do Not Disturb"',
    nota: 'Note for staff (required)',
    notaRequerida: 'Write a note to send your request.',
    notaPlaceholder: 'E.g., Please leave towels by the door...',
    disclaimer:
      'Note: Certain items or loans (such as adapters, special amenities, or extra refills) may be subject to availability, deposit, or additional charges set directly by the hotel. Seven Stay acts solely as a communication technology platform and is not responsible for rates, availability, or internal property policies.',
    enviar: 'Submit Request',
    enviando: 'Sending…',
    menos: (item: string) => `Remove one: ${item}`,
    mas: (item: string) => `Add one: ${item}`,
  },
} as const;

// ---------------------------------------------------------------------------
// Horario nocturno (usa las horas de silencio configuradas en el hotel)
// ---------------------------------------------------------------------------

function aMinutos(hora: HoraDelDia): number {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function enHorarioSilencio(inicio: HoraDelDia, fin: HoraDelDia, ahora: Date): boolean {
  const actual = ahora.getHours() * 60 + ahora.getMinutes();
  const ini = aMinutos(inicio);
  const end = aMinutos(fin);
  // Rango que cruza la medianoche (22:00 → 06:00) o dentro del mismo día.
  return ini > end ? actual >= ini || actual < end : actual >= ini && actual < end;
}

/** "22:00" → "10:00 PM" */
function formato12h(hora: HoraDelDia): string {
  const total = aMinutos(hora);
  const h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Hora actual que se refresca cada minuto; `null` hasta montar en el navegador. */
function useAhora(): Date | null {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    const actualizar = () => setAhora(new Date());
    const primero = setTimeout(actualizar, 0);
    const intervalo = setInterval(actualizar, 60_000);
    return () => {
      clearTimeout(primero);
      clearInterval(intervalo);
    };
  }, []);
  return ahora;
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function Contador({
  valor,
  onCambiar,
  etiquetaMenos,
  etiquetaMas,
}: {
  valor: number;
  onCambiar: (valor: number) => void;
  etiquetaMenos: string;
  etiquetaMas: string;
}) {
  const puedeMenos = valor > 0;
  const puedeMas = valor < MAX_CANTIDAD;
  // El círculo visible mide 36 px; el botón real ocupa 44×48 px para el dedo.
  const boton = (activo: boolean) =>
    `flex h-12 w-11 items-center justify-center ${activo ? '' : 'pointer-events-none'}`;
  const circulo = (activo: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-full transition-[transform,background-color] duration-200 ${EASE} active:scale-90 ${
      activo ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-100/60 text-neutral-300'
    }`;

  return (
    <div className="flex shrink-0 items-center">
      <button type="button" aria-label={etiquetaMenos} disabled={!puedeMenos} onClick={() => onCambiar(valor - 1)} className={boton(puedeMenos)}>
        <span className={circulo(puedeMenos)}>
          <Minus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </button>
      <span
        aria-live="polite"
        className={`w-5 text-center text-[16px] tabular-nums ${valor > 0 ? 'font-semibold text-neutral-900' : 'text-neutral-300'}`}
      >
        {valor}
      </span>
      <button type="button" aria-label={etiquetaMas} disabled={!puedeMas} onClick={() => onCambiar(valor + 1)} className={boton(puedeMas)}>
        <span className={circulo(puedeMas)}>
          <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </button>
    </div>
  );
}

function FilaSwitch({ etiqueta, activo, onCambiar }: { etiqueta: string; activo: boolean; onCambiar: (valor: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors active:bg-neutral-50"
    >
      <span className="text-[14.5px] font-medium leading-snug text-neutral-900">{etiqueta}</span>
      <span
        aria-hidden
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ${EASE} ${
          activo ? 'bg-emerald-500' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-300 ${EASE} ${
            activo ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

type Cantidades = Record<ItemHousekeeping, number>;
const SIN_CANTIDADES: Cantidades = {
  toallas: 0,
  almohadas_cobijas: 0,
  amenities: 0,
  cafe_cortesias: 0,
  plancha: 0,
  adaptadores: 0,
};

export default function HousekeepingPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const router = useRouter();
  const { hotel, habitaciones, idioma, crearTicket } = useStay();
  const ahora = useAhora();
  const t = TEXTOS[idioma];

  const [cantidades, setCantidades] = useState<Cantidades>(SIN_CANTIDADES);
  const [limpiezaInmediata, setLimpiezaInmediata] = useState(false);
  const [noMolestar, setNoMolestar] = useState(false);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Código corto del ticket creado: mientras exista se muestra la animación de confirmación. */
  const [confirmado, setConfirmado] = useState<string | null>(null);
  // Bloqueo síncrono: el estado `enviando` tarda un render en aplicarse y dos
  // toques seguidos alcanzarían a pasar. Además, la idempotency_key es una sola
  // por formulario: si aun así llegara un segundo envío, crearTicket devuelve
  // el mismo ticket en vez de duplicarlo.
  const bloqueado = useRef(false);
  const claveIdempotencia = useRef<string | null>(null);

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva

  const base = `/p/${encodeURIComponent(codigo)}`;
  const hayItems = Object.values(cantidades).some((c) => c > 0);
  const haySeleccion = hayItems || limpiezaInmediata || noMolestar;
  const hayNota = nota.trim().length > 0;
  const puedeEnviar = haySeleccion && hayNota && !enviando;
  const nocturno = ahora !== null && enHorarioSilencio(hotel.hora_silencio_inicio, hotel.hora_silencio_fin, ahora);

  // Limpiar ahora y No molestar son mutuamente excluyentes.
  const cambiarLimpieza = (valor: boolean) => {
    setLimpiezaInmediata(valor);
    if (valor) setNoMolestar(false);
  };
  const cambiarNoMolestar = (valor: boolean) => {
    setNoMolestar(valor);
    if (valor) setLimpiezaInmediata(false);
  };

  const enviar = async () => {
    if (!puedeEnviar || bloqueado.current) return;
    bloqueado.current = true;
    setEnviando(true);
    setError(null);
    claveIdempotencia.current ??= generarIdempotencyKey();

    const resultado = await crearTicket({
      habitacion_numero: habitacion.numero,
      categoria: 'housekeeping',
      idempotency_key: claveIdempotencia.current,
      idioma_huesped: idioma,
      nota,
      detalle_housekeeping: {
        items: ITEMS.filter(({ clave }) => cantidades[clave] > 0).map(({ clave }) => ({
          item: clave,
          cantidad: cantidades[clave],
        })),
        limpieza_inmediata: limpiezaInmediata,
        no_molestar: noMolestar,
      },
    });

    if (!resultado.ok) {
      bloqueado.current = false;
      setEnviando(false);
      setError(resultado.error);
      return;
    }
    // Animación de confirmación; al terminar vuelve a la Home de la habitación,
    // donde el banner de solicitud activa ya muestra este pedido.
    setConfirmado(resultado.ticket.codigo_corto);
  };

  /** Deja el formulario como nuevo (otra solicitud = otra idempotency_key). */
  const reiniciarFormulario = () => {
    setCantidades(SIN_CANTIDADES);
    setLimpiezaInmediata(false);
    setNoMolestar(false);
    setNota('');
    setError(null);
    setEnviando(false);
    setConfirmado(null);
    bloqueado.current = false;
    claveIdempotencia.current = null;
  };

  const alTerminarConfirmacion = () => {
    router.replace(base);
    // Con cacheComponents, Next conserva el estado de esta página oculta al
    // salir y lo restaura al volver: sin este reinicio, al regresar a
    // Limpieza se repetía la animación (y la redirección). Se reinicia un
    // instante después de navegar para que el formulario vacío no parpadee
    // antes de que aparezca la Home.
    setTimeout(reiniciarFormulario, 400);
  };

  return (
    <main className="flex flex-col gap-3.5 pb-2">
      <Link
        href={base}
        className={`-ml-2 -mt-4 flex h-12 w-fit items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-medium text-neutral-600 transition-transform duration-300 ${EASE} active:scale-[0.965]`}
      >
        <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.25} />
        {t.volver}
      </Link>

      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-neutral-900">{t.titulo}</h1>
        <p className="mt-1 text-[14px] text-neutral-500">{t.subtitulo}</p>
      </header>

      {nocturno && (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 p-3.5">
          <Moon aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600" strokeWidth={2} />
          <p className="text-[13px] leading-relaxed text-amber-900">
            {t.nocturno(
              `${formato12h(hotel.hora_silencio_inicio)} - ${formato12h(hotel.hora_silencio_fin)}`,
              formato12h(hotel.hora_silencio_fin),
            )}
          </p>
        </div>
      )}

      {/* Insumos */}
      <section aria-label={t.insumos} className={GRUPO}>
        {ITEMS.map(({ clave, textos }) => {
          const [titulo, descripcion] = textos[idioma];
          return (
            <div key={clave} className="flex items-center gap-2 py-2 pl-4 pr-1.5">
              <div className="min-w-0 flex-1 py-1">
                <p className="text-[14.5px] font-medium leading-snug text-neutral-900">{titulo}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-500">{descripcion}</p>
              </div>
              <Contador
                valor={cantidades[clave]}
                onCambiar={(valor) =>
                  setCantidades((prev) => ({ ...prev, [clave]: Math.min(MAX_CANTIDAD, Math.max(0, valor)) }))
                }
                etiquetaMenos={t.menos(titulo)}
                etiquetaMas={t.mas(titulo)}
              />
            </div>
          );
        })}
      </section>

      {/* Preferencias de servicio */}
      <section aria-label={t.preferencias} className={GRUPO}>
        <FilaSwitch etiqueta={t.limpiezaAhora} activo={limpiezaInmediata} onCambiar={cambiarLimpieza} />
        <FilaSwitch etiqueta={t.noMolestar} activo={noMolestar} onCambiar={cambiarNoMolestar} />
      </section>

      {/* Nota opcional */}
      <div className="relative">
        <label htmlFor="nota-housekeeping" className="mb-1.5 block px-1 text-[13px] font-medium text-neutral-700">
          {t.nota}
        </label>
        <textarea
          id="nota-housekeeping"
          rows={2}
          required
          aria-required="true"
          aria-describedby="nota-requerida"
          maxLength={MAX_NOTA}
          value={nota}
          onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA))}
          placeholder={t.notaPlaceholder}
          className="block w-full resize-none rounded-2xl border border-black/[0.05] bg-white p-3.5 pb-7 text-[13.5px] leading-relaxed text-neutral-900 shadow-[0_1px_2px_rgba(17,24,39,0.04)] outline-none placeholder:text-neutral-400 focus:border-neutral-300"
        />
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-3.5 text-[11px] tabular-nums text-neutral-400">
          {nota.length}/{MAX_NOTA}
        </span>
      </div>

      {/* Disclaimer */}
      <p className="rounded-xl border border-neutral-200/60 bg-neutral-100/80 p-3 text-[11.5px] leading-relaxed text-neutral-500">
        {t.disclaimer}
      </p>

      {haySeleccion && !hayNota && (
        <p id="nota-requerida" className="px-1 text-center text-[12.5px] text-neutral-500">
          {t.notaRequerida}
        </p>
      )}

      {error && (
        <p role="alert" className="px-1 text-center text-[13px] font-medium text-red-600">
          {mensajeErrorEnvio(error, idioma)}
        </p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={!puedeEnviar}
        className={`h-[50px] w-full rounded-full bg-neutral-900 text-[14px] font-medium text-white transition-[transform,opacity] duration-300 ${EASE} active:scale-[0.98] ${
          puedeEnviar ? '' : 'pointer-events-none opacity-40'
        }`}
      >
        {enviando ? t.enviando : t.enviar}
      </button>

      {confirmado && (
        <ConfirmacionEnviada codigoCorto={confirmado} idioma={idioma} onTerminar={alTerminarConfirmacion} />
      )}
    </main>
  );
}
