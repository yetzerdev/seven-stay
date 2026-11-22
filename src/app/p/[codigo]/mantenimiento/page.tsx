'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Camera,
  ChevronLeft,
  CircleHelp,
  Droplets,
  KeyRound,
  Loader2,
  Plug,
  Snowflake,
  Tv,
  X,
  type LucideIcon,
} from 'lucide-react';

import ConfirmacionEnviada from '@/components/portal/ConfirmacionEnviada';
import { mensajeErrorEnvio } from '@/components/portal/etiquetasTicket';
import { bytesDeDataUrl, comprimirFoto } from '@/lib/imagenes';
import { generarIdempotencyKey, useStay } from '@/context/StayContext';
import type { Idioma, SubcategoriaMantenimiento } from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Constantes de diseño y textos
// ---------------------------------------------------------------------------

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]';
const MAX_DESCRIPCION = 200;

const CATEGORIAS: { clave: SubcategoriaMantenimiento; icono: LucideIcon; textos: Record<Idioma, string> }[] = [
  { clave: 'aire_acondicionado', icono: Snowflake, textos: { es: 'Aire Acondicionado', en: 'Air Conditioning' } },
  { clave: 'agua_bano', icono: Droplets, textos: { es: 'Agua / Baño', en: 'Water / Bathroom' } },
  { clave: 'wifi_tv', icono: Tv, textos: { es: 'Wi-Fi / TV', en: 'Wi-Fi / TV' } },
  { clave: 'luz_enchufes', icono: Plug, textos: { es: 'Luz / Enchufes', en: 'Lights / Outlets' } },
  { clave: 'cerradura', icono: KeyRound, textos: { es: 'Cerradura / Puerta', en: 'Door Lock' } },
  { clave: 'otro', icono: CircleHelp, textos: { es: 'Otro', en: 'Other' } },
];

const TEXTOS = {
  es: {
    volver: 'Volver',
    titulo: 'Reportar Falla',
    subtitulo: 'Cuéntanos qué requiere revisión técnica en tu habitación',
    categoria: 'Tipo de falla',
    urgente: '¿Es una falla urgente?',
    urgenteDetalle: 'Ej. fuga de agua activa, falla total de energía o problema con la cerradura.',
    descripcion: 'Descripción (opcional)',
    descripcionPlaceholder: 'Describe brevemente el problema (ej. El aire enciende pero no enfría)...',
    adjuntar: 'Adjuntar foto (opcional)',
    procesando: 'Procesando foto…',
    quitarFoto: 'Quitar foto',
    fotoLista: (kb: number) => `Foto lista · ${kb} KB`,
    fotoError: 'No pudimos procesar esa imagen. Prueba con otra foto.',
    fotoVista: 'Vista previa de la foto adjunta',
    enviar: 'Enviar Reporte',
    enviando: 'Enviando…',
    elegirCategoria: 'Elige el tipo de falla para enviar el reporte.',
  },
  en: {
    volver: 'Back',
    titulo: 'Report an Issue',
    subtitulo: 'Let us know what needs technical attention in your room',
    categoria: 'Issue type',
    urgente: 'Is this an urgent issue?',
    urgenteDetalle: 'E.g., active water leak, total power loss, or door lock issue.',
    descripcion: 'Description (optional)',
    descripcionPlaceholder: "Briefly describe the issue (e.g., A/C turns on but isn't cooling)...",
    adjuntar: 'Attach photo (optional)',
    procesando: 'Processing photo…',
    quitarFoto: 'Remove photo',
    fotoLista: (kb: number) => `Photo ready · ${kb} KB`,
    fotoError: "We couldn't process that image. Please try another photo.",
    fotoVista: 'Attached photo preview',
    enviar: 'Submit Report',
    enviando: 'Sending…',
    elegirCategoria: 'Choose the issue type to submit the report.',
  },
} as const;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function MantenimientoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const router = useRouter();
  const { habitaciones, idioma, crearTicket } = useStay();
  const t = TEXTOS[idioma];

  const [categoria, setCategoria] = useState<SubcategoriaMantenimiento | null>(null);
  const [urgente, setUrgente] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ codigo: string; ticketId: string } | null>(null);

  const inputFoto = useRef<HTMLInputElement>(null);
  // Bloqueo síncrono contra doble toque + una sola idempotency_key por formulario.
  const bloqueado = useRef(false);
  const claveIdempotencia = useRef<string | null>(null);

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva

  const base = `/p/${encodeURIComponent(codigo)}`;
  const puedeEnviar = categoria !== null && !enviando && !procesandoFoto;

  const alElegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setProcesandoFoto(true);
    setErrorFoto(false);
    try {
      setFoto(await comprimirFoto(archivo));
    } catch {
      setFoto(null);
      setErrorFoto(true);
    } finally {
      setProcesandoFoto(false);
    }
  };

  const enviar = async () => {
    if (!puedeEnviar || bloqueado.current || !categoria) return;
    bloqueado.current = true;
    setEnviando(true);
    setErrorEnvio(null);
    claveIdempotencia.current ??= generarIdempotencyKey();

    const resultado = await crearTicket({
      habitacion_numero: habitacion.numero,
      categoria: 'mantenimiento',
      idempotency_key: claveIdempotencia.current,
      idioma_huesped: idioma,
      urgente,
      nota: descripcion,
      detalle_mantenimiento: { subcategoria: categoria, foto_data_url: foto },
    });

    if (!resultado.ok) {
      bloqueado.current = false;
      setEnviando(false);
      setErrorEnvio(resultado.error);
      return;
    }
    setConfirmado({ codigo: resultado.ticket.codigo_corto, ticketId: resultado.ticket.id });
  };

  const reiniciarFormulario = () => {
    setCategoria(null);
    setUrgente(false);
    setDescripcion('');
    setFoto(null);
    setErrorFoto(false);
    setErrorEnvio(null);
    setEnviando(false);
    setConfirmado(null);
    bloqueado.current = false;
    claveIdempotencia.current = null;
  };

  const alTerminarConfirmacion = () => {
    if (confirmado) router.push(`${base}/ticket/${confirmado.ticketId}`);
    // Next conserva el estado de esta página al salir (cacheComponents): se
    // reinicia tras navegar para que al volver no se repita la confirmación.
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

      {/* Categoría (selección única) */}
      <div role="radiogroup" aria-label={t.categoria} className="grid grid-cols-2 gap-2.5">
        {CATEGORIAS.map(({ clave, icono: Icono, textos }) => {
          const activa = categoria === clave;
          return (
            <button
              key={clave}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setCategoria(clave)}
              className={`flex min-h-16 items-center gap-2 rounded-2xl border px-3 py-3 text-left transition-[transform,background-color,border-color] duration-300 ${EASE} active:scale-[0.965] ${
                activa
                  ? 'border-neutral-900 bg-neutral-900/[0.03]'
                  : 'border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
                  activa ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'
                }`}
              >
                <Icono className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 text-[13.5px] font-semibold leading-tight text-neutral-900 [overflow-wrap:anywhere]">
                {textos[idioma]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Urgencia */}
      <button
        type="button"
        role="switch"
        aria-checked={urgente}
        onClick={() => setUrgente((v) => !v)}
        className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color] duration-300 ${
          urgente ? 'border-amber-300/80 bg-amber-50/70' : 'border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]'
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-neutral-900">{t.urgente}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-neutral-500">{t.urgenteDetalle}</span>
        </span>
        <span
          aria-hidden
          className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ${EASE} ${
            urgente ? 'bg-amber-500' : 'bg-neutral-200'
          }`}
        >
          <span
            className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-300 ${EASE} ${
              urgente ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>

      {/* Descripción opcional */}
      <div className="relative">
        <label htmlFor="descripcion-falla" className="sr-only">
          {t.descripcion}
        </label>
        <textarea
          id="descripcion-falla"
          rows={3}
          maxLength={MAX_DESCRIPCION}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value.slice(0, MAX_DESCRIPCION))}
          placeholder={t.descripcionPlaceholder}
          className="block w-full resize-none rounded-2xl border border-black/[0.05] bg-white p-3.5 pb-7 text-[13.5px] leading-relaxed text-neutral-900 shadow-[0_1px_2px_rgba(17,24,39,0.04)] outline-none placeholder:text-neutral-400 focus:border-neutral-300"
        />
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-3.5 text-[11px] tabular-nums text-neutral-400">
          {descripcion.length}/{MAX_DESCRIPCION}
        </span>
      </div>

      {/* Foto opcional */}
      <div className={`${TARJETA} p-4`}>
        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={alElegirFoto}
          className="hidden"
          tabIndex={-1}
        />
        {foto ? (
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL local */}
              <img src={foto} alt={t.fotoVista} className="h-24 w-24 rounded-xl border border-black/[0.05] object-cover" />
              <button
                type="button"
                onClick={() => setFoto(null)}
                aria-label={t.quitarFoto}
                className="absolute -right-4 -top-4 flex h-12 w-12 items-center justify-center"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-transform active:scale-90">
                  <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </button>
            </div>
            <p className="text-[13px] text-neutral-500">{t.fotoLista(Math.round(bytesDeDataUrl(foto) / 1024))}</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            disabled={procesandoFoto}
            className={`flex h-[48px] w-full items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-900 transition-transform duration-300 ${EASE} active:scale-[0.98] disabled:opacity-60`}
          >
            {procesandoFoto ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                {t.procesando}
              </>
            ) : (
              <>
                <Camera aria-hidden className="h-4 w-4" strokeWidth={2.25} />
                {t.adjuntar}
              </>
            )}
          </button>
        )}
        {errorFoto && (
          <p role="alert" className="mt-2.5 text-center text-[12.5px] text-rose-600">
            {t.fotoError}
          </p>
        )}
      </div>

      {categoria === null && <p className="px-1 text-center text-[12.5px] text-neutral-500">{t.elegirCategoria}</p>}
      {errorEnvio && (
        <p role="alert" className="px-1 text-center text-[13px] font-medium text-rose-600">
          {mensajeErrorEnvio(errorEnvio, idioma)}
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
        <ConfirmacionEnviada codigoCorto={confirmado.codigo} idioma={idioma} onTerminar={alTerminarConfirmacion} />
      )}
    </main>
  );
}
