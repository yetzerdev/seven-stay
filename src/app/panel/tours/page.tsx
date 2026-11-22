'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { BadgeCheck, CheckCircle2, Compass, Hotel, ImagePlus, Layers, Loader2, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import { useStay, type DatosTour } from '@/context/StayContext';
import { comprimirFoto } from '@/lib/imagenes';
import { traducirAlIngles } from '@/lib/traduccion';
import type { CatalogoItem, ModoTours, Moneda } from '@/types/sevenstay';

const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

/** Qué tours ve el huésped en el portal. */
const MODOS: { valor: ModoTours; titulo: string; texto: string; icono: LucideIcon }[] = [
  {
    valor: 'propios',
    titulo: 'Solo tours del hotel',
    texto: 'El huésped ve únicamente los tours que ustedes crean aquí. Se reservan con recepción y se pagan en el hotel.',
    icono: Hotel,
  },
  {
    valor: 'seven_stay',
    titulo: 'Solo tours de Seven Stay',
    texto: 'Seven Stay opera, cobra y atiende los tours por su Agente Oficial. Esas reservas no llegan al panel.',
    icono: BadgeCheck,
  },
  {
    valor: 'ambos',
    titulo: 'Ambos',
    texto: 'Se muestran los de Seven Stay primero (como «Recomendado») y después los del hotel, cada uno con su etiqueta.',
    icono: Layers,
  },
];

interface Formulario {
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: Moneda;
  horario: string;
  activo: boolean;
  /** Foto ya guardada (URL pública) o `null`. */
  imagen_url: string | null;
  /** Foto nueva elegida (JPEG comprimido), se sube al guardar. */
  nueva: string | null;
}

const VACIO: Formulario = { titulo: '', descripcion: '', precio: '', moneda: 'USD', horario: '', activo: true, imagen_url: null, nueva: null };

function formularioDe(tour: CatalogoItem): Formulario {
  return {
    titulo: tour.titulo_es,
    descripcion: tour.descripcion_es,
    precio: String(tour.precio),
    moneda: tour.moneda,
    horario: tour.horario_o_duracion_es,
    activo: tour.activo,
    imagen_url: tour.imagen_url,
    nueva: null,
  };
}

function datosDe(tour: CatalogoItem): DatosTour {
  return {
    id: tour.id,
    titulo_es: tour.titulo_es,
    titulo_en: tour.titulo_en,
    descripcion_es: tour.descripcion_es,
    descripcion_en: tour.descripcion_en,
    horario_o_duracion_es: tour.horario_o_duracion_es,
    horario_o_duracion_en: tour.horario_o_duracion_en,
    precio: tour.precio,
    moneda: tour.moneda,
    activo: tour.activo,
    imagen_url: tour.imagen_url,
  };
}

function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
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

/**
 * Tours (solo Supervisor / Gerente; el cascarón bloquea a recepción).
 *  - Elige qué tours ve el huésped: propios, de Seven Stay o ambos.
 *  - Administra los tours propios. Sus reservas entran al Centro de Control y se
 *    pagan en recepción. Se escriben en español; el inglés se genera al guardar.
 */
export default function ToursHotelPage() {
  const { hotel, catalogo, actualizarHotel, guardarTour, eliminarTour, subirImagenMenu } = useStay();
  const tours = catalogo.filter((c) => c.tipo === 'tour');
  const { confirmar, dialogo } = useConfirmacion();

  // null = formulario cerrado; '' = tour nuevo; id = editando ese tour.
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<null | 'ok' | 'sin_traduccion' | 'modo'>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [cambiandoModo, setCambiandoModo] = useState<ModoTours | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso === 'sin_traduccion' ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const precio = Number(form.precio.replace(',', '.'));
  const errorTitulo = form.titulo.trim() === '' ? 'Escribe el nombre del tour.' : undefined;
  const errorPrecio =
    form.precio.trim() === '' || !Number.isFinite(precio) || precio < 0 ? 'Escribe un precio válido por persona, ej. 45.' : undefined;
  const muestraPropios = hotel.modo_tours !== 'seven_stay';

  const elegirModo = async (modo: ModoTours) => {
    if (modo === hotel.modo_tours || cambiandoModo) return;
    if (modo === 'propios' && !tours.some((t) => t.activo)) {
      const ok = await confirmar({
        titulo: '¿Mostrar solo los tours del hotel?',
        mensaje: 'Todavía no tienen tours activos: el portal mostrará «No hay tours disponibles» hasta que agreguen uno.',
        textoConfirmar: 'Sí, solo los del hotel',
      });
      if (ok === false) return;
    }
    setCambiandoModo(modo);
    const ok = await actualizarHotel({ modo_tours: modo });
    setCambiandoModo(null);
    if (ok) setAviso('modo');
  };

  const abrir = (tour?: CatalogoItem) => {
    setEditando(tour?.id ?? '');
    setForm(tour ? formularioDe(tour) : VACIO);
    setIntentado(false);
    setAviso(null);
    setErrorFoto(null);
  };
  const cerrar = () => {
    if (guardando) return;
    setEditando(null);
    setIntentado(false);
  };
  const cambiar = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) => setForm((f) => ({ ...f, [clave]: valor }));

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setErrorFoto(null);
    if (!archivo.type.startsWith('image/')) {
      setErrorFoto('Elige una imagen (JPG, PNG o WebP).');
      return;
    }
    setProcesandoFoto(true);
    try {
      const dataUrl = await comprimirFoto(archivo, { ladoMax: 1200, bytesMax: 350 * 1024 });
      setForm((f) => ({ ...f, nueva: dataUrl }));
    } catch {
      setErrorFoto('No pudimos procesar esa imagen. Prueba con otra.');
    } finally {
      setProcesandoFoto(false);
    }
  };
  const quitarFoto = () => setForm((f) => ({ ...f, imagen_url: null, nueva: null }));
  const vistaFoto = form.nueva ?? form.imagen_url;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorTitulo || errorPrecio || guardando || procesandoFoto || editando === null) return;
    setGuardando(true);

    // La foto nueva se sube primero; si falla, no se guarda nada y el formulario queda igual.
    let imagenUrl = form.imagen_url;
    if (form.nueva) {
      const subida = await subirImagenMenu(form.nueva);
      if (!subida) {
        setGuardando(false);
        setErrorFoto('No pudimos subir la foto. Inténtalo de nuevo.');
        return;
      }
      imagenUrl = subida;
    }

    const titulo = form.titulo.trim();
    const descripcion = form.descripcion.trim();
    const horario = form.horario.trim();
    const anterior = tours.find((t) => t.id === editando);

    // El hotel escribe en español; 7Stay genera el inglés para los huéspedes.
    const ingles = await traducirAlIngles([titulo, descripcion, horario]);
    // Sin traductor: se conserva el inglés anterior si el texto no cambió; si cambió, se usa el español.
    const enIngles = (i: number, es: string, previoEs?: string, previoEn?: string) =>
      ingles?.[i] || (previoEs === es && previoEn ? previoEn : es);

    const ok = await guardarTour({
      ...(editando ? { id: editando } : {}),
      titulo_es: titulo,
      titulo_en: enIngles(0, titulo, anterior?.titulo_es, anterior?.titulo_en),
      descripcion_es: descripcion,
      descripcion_en: enIngles(1, descripcion, anterior?.descripcion_es, anterior?.descripcion_en),
      horario_o_duracion_es: horario,
      horario_o_duracion_en: enIngles(2, horario, anterior?.horario_o_duracion_es, anterior?.horario_o_duracion_en),
      precio: Math.round(precio * 100) / 100,
      moneda: form.moneda,
      activo: form.activo,
      imagen_url: imagenUrl,
    });
    setGuardando(false);
    if (!ok) return; // el panel muestra el error y el formulario conserva lo escrito
    setEditando(null);
    setAviso(ingles ? 'ok' : 'sin_traduccion');
  };

  const eliminar = async (tour: CatalogoItem) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${tour.titulo_es}"?`,
      mensaje:
        'Se borra para siempre, con su foto. Las reservas que ya se hicieron conservan su detalle. Si es de temporada, mejor desactívalo: se conserva y lo vuelves a activar cuando quieras.',
      textoConfirmar: 'Eliminar tour',
      tono: 'peligro',
    });
    if (ok === false) return;
    if (editando === tour.id) setEditando(null);
    await eliminarTour(tour.id);
  };

  const activos = tours.filter((t) => t.activo).length;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Tours</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            Qué experiencias ve el huésped en «Tours y Guías» · {activos} {activos === 1 ? 'tour propio activo' : 'tours propios activos'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => abrir()}
          className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Agregar tour
        </button>
      </header>

      {/* Modo: qué tours muestra el portal */}
      <section aria-labelledby="titulo-modo" className="rounded-2xl border border-black/[0.06] bg-white p-6">
        <h2 id="titulo-modo" className="text-[17px] font-bold text-neutral-900">
          ¿Qué tours ve el huésped?
        </h2>
        <div role="radiogroup" aria-labelledby="titulo-modo" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {MODOS.map(({ valor, titulo, texto, icono: Icono }) => {
            const elegido = hotel.modo_tours === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={elegido}
                disabled={cambiandoModo !== null}
                onClick={() => void elegirModo(valor)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-wait ${
                  elegido ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/[0.1] bg-white text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {cambiandoModo === valor ? (
                  <Loader2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Icono aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${elegido ? 'text-white' : 'text-neutral-500'}`} />
                )}
                <span>
                  <span className="block text-[15.5px] font-semibold">{titulo}</span>
                  <span className={`mt-1 block text-[13.5px] leading-snug ${elegido ? 'text-white/75' : 'text-neutral-500'}`}>{texto}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {aviso && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-[14.5px] font-medium ${
            aviso === 'sin_traduccion' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          <CheckCircle2 aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {aviso === 'modo'
            ? 'Listo. El portal del huésped ya muestra los tours elegidos.'
            : aviso === 'ok'
              ? muestraPropios
                ? 'Tour guardado. Ya se ve en el portal del huésped, en español e inglés.'
                : 'Tour guardado. Para que el huésped lo vea, elige «Solo tours del hotel» o «Ambos».'
              : 'Tour guardado, pero este navegador no pudo traducirlo: en inglés se mostrará en español. Guárdalo de nuevo desde Google Chrome para traducirlo.'}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Lista */}
        <section aria-label="Tours del hotel" className={`rounded-2xl border border-black/[0.06] bg-white ${muestraPropios ? '' : 'opacity-70'}`}>
          <div className="border-b border-neutral-100 px-6 py-4">
            <h2 className="text-[17px] font-bold text-neutral-900">Tours del hotel</h2>
            <p className="mt-0.5 text-[14px] text-neutral-500">
              {muestraPropios
                ? 'Las reservas llegan al Centro de Control y se pagan en recepción.'
                : 'Ahora no se muestran al huésped: el portal solo ofrece los tours de Seven Stay.'}
            </p>
          </div>
          {tours.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100">
                <Compass aria-hidden className="h-6 w-6 text-neutral-500" />
              </span>
              <p className="mt-4 text-[18px] font-semibold text-neutral-900">Todavía no hay tours propios</p>
              <p className="mt-1 max-w-[380px] text-[15px] text-neutral-500">
                Agrega las excursiones que organiza el hotel: city tour, traslados, snorkel… con su precio por persona.
              </p>
              <button
                type="button"
                onClick={() => abrir()}
                className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Agregar el primer tour
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {tours.map((tour) => (
                <li
                  key={tour.id}
                  className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 ${editando === tour.id ? 'bg-neutral-50' : ''}`}
                >
                  {tour.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage
                    <img
                      src={tour.imagen_url}
                      alt=""
                      className={`h-14 w-14 shrink-0 rounded-xl border border-black/[0.06] object-cover ${tour.activo ? '' : 'opacity-50'}`}
                    />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                      <Compass className="h-5 w-5" />
                    </span>
                  )}
                  <div className={`min-w-0 flex-1 ${tour.activo ? '' : 'opacity-50'}`}>
                    <p className="flex flex-wrap items-center gap-2 text-[16.5px] font-semibold text-neutral-900">
                      {tour.titulo_es}
                      {!tour.activo && (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] font-bold tracking-wide text-neutral-500">INACTIVO</span>
                      )}
                    </p>
                    {tour.descripcion_es && <p className="mt-0.5 line-clamp-1 text-[14px] text-neutral-500">{tour.descripcion_es}</p>}
                    {tour.horario_o_duracion_es && <p className="mt-0.5 text-[13px] text-neutral-400">{tour.horario_o_duracion_es}</p>}
                  </div>
                  <p className="w-32 text-right text-[16px] font-bold tabular-nums text-neutral-900">
                    {formatoPrecio(tour.precio, tour.moneda)}
                    <span className="block text-[12px] font-medium text-neutral-400">por persona</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Desactivar: el tour se conserva (con su foto) pero el huésped no lo ve. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tour.activo}
                      onClick={() => void guardarTour({ ...datosDe(tour), activo: !tour.activo })}
                      aria-label={`${tour.titulo_es} activo`}
                      title={tour.activo ? 'Desactivar: se conserva, pero el huésped no lo ve' : 'Activar: vuelve a mostrarse al huésped'}
                      className={`mr-1 flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3 text-[13.5px] font-semibold ${
                        tour.activo ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                      }`}
                    >
                      <span aria-hidden className={`relative h-6 w-10 rounded-full transition-colors ${tour.activo ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${tour.activo ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                      {tour.activo ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => abrir(tour)}
                      aria-label={`Editar ${tour.titulo_es}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(tour)}
                      aria-label={`Eliminar ${tour.titulo_es}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Formulario */}
        {editando !== null && (
          <form onSubmit={guardar} noValidate className="flex flex-col rounded-2xl border border-black/[0.06] bg-white xl:sticky xl:top-[104px]">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-5">
              <div>
                <h2 className="text-[19px] font-bold text-neutral-900">{editando ? 'Editar tour' : 'Nuevo tour'}</h2>
                <p className="mt-0.5 text-[14px] text-neutral-500">Escríbelo en español: el inglés se genera solo.</p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              {/* Foto */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-neutral-700">Foto (opcional)</span>
                <div className="flex items-center gap-4">
                  {vistaFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local o URL pública de Storage
                    <img src={vistaFoto} alt="Foto del tour" className="h-24 w-32 shrink-0 rounded-xl border border-black/[0.06] object-cover" />
                  ) : (
                    <span aria-hidden className="flex h-24 w-32 shrink-0 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-[#F8F9FA] text-neutral-400">
                      <ImagePlus className="h-6 w-6" />
                    </span>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      disabled={procesandoFoto || guardando}
                      onClick={() => inputFoto.current?.click()}
                      className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[14.5px] font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {procesandoFoto ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ImagePlus aria-hidden className="h-4 w-4" />}
                      {procesandoFoto ? 'Procesando…' : vistaFoto ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    {vistaFoto && !procesandoFoto && (
                      <button type="button" onClick={quitarFoto} className="h-9 px-1 text-[14px] font-medium text-rose-600 hover:underline">
                        Quitar foto
                      </button>
                    )}
                  </div>
                  <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} className="hidden" />
                </div>
                {errorFoto ? (
                  <span role="alert" className="text-[13px] font-medium text-rose-600">
                    {errorFoto}
                  </span>
                ) : (
                  <span className="text-[12.5px] text-neutral-400">Horizontal se ve mejor. La reducimos sola para que cargue rápido.</span>
                )}
              </div>

              <Campo etiqueta="Nombre" error={intentado ? errorTitulo : undefined}>
                <input
                  value={form.titulo}
                  maxLength={80}
                  onChange={(e) => cambiar('titulo', e.target.value)}
                  placeholder="Ej. Snorkel en el arrecife"
                  aria-invalid={intentado && Boolean(errorTitulo)}
                  className={`${INPUT} ${intentado && errorTitulo ? 'border-rose-400' : ''}`}
                />
              </Campo>
              <Campo etiqueta="Descripción" ayuda="Qué incluye, punto de salida, qué llevar (opcional).">
                <textarea
                  value={form.descripcion}
                  maxLength={400}
                  rows={4}
                  onChange={(e) => cambiar('descripcion', e.target.value)}
                  placeholder="Ej. Incluye equipo, guía bilingüe y traslado desde el hotel."
                  className={`${INPUT} h-auto resize-none py-2.5 leading-relaxed`}
                />
              </Campo>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                <Campo etiqueta="Precio por persona" error={intentado ? errorPrecio : undefined}>
                  <input
                    inputMode="decimal"
                    value={form.precio}
                    onChange={(e) => cambiar('precio', e.target.value)}
                    placeholder="45"
                    aria-invalid={intentado && Boolean(errorPrecio)}
                    className={`${INPUT} tabular-nums ${intentado && errorPrecio ? 'border-rose-400' : ''}`}
                  />
                </Campo>
                <Campo etiqueta="Moneda">
                  <select value={form.moneda} onChange={(e) => cambiar('moneda', e.target.value as Moneda)} className={INPUT}>
                    <option value="USD">Dólares</option>
                    <option value="HNL">Lempiras</option>
                  </select>
                </Campo>
              </div>
              <Campo etiqueta="Horario o duración" ayuda="Opcional. Ej. Salidas 8:00 AM · 4 horas">
                <input
                  value={form.horario}
                  maxLength={80}
                  onChange={(e) => cambiar('horario', e.target.value)}
                  placeholder="Salidas 8:00 AM · 4 horas"
                  className={INPUT}
                />
              </Campo>
              <label className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => cambiar('activo', e.target.checked)}
                  className="h-5 w-5 accent-neutral-900"
                />
                <span className="text-[15px] text-neutral-800">Activo: el huésped lo ve y lo puede reservar</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
              <button type="button" onClick={cerrar} className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || procesandoFoto}
                className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {guardando ? 'Guardando…' : 'Guardar tour'}
              </button>
            </div>
          </form>
        )}
      </div>

      {dialogo}
    </main>
  );
}
