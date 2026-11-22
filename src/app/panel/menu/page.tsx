'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, ImagePlus, Layers, Loader2, Pencil, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import GestorCategorias, { resumenCategoria } from '@/components/panel/GestorCategorias';
import { formatoPrecio } from '@/components/portal/etiquetasTicket';
import { useStay, type DatosPlato } from '@/context/StayContext';
import { comprimirFoto } from '@/lib/imagenes';
import { traducirAlIngles } from '@/lib/traduccion';
import type { CatalogoItem, CategoriaMenu, Moneda } from '@/types/sevenstay';

const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

interface Formulario {
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: Moneda;
  horario: string;
  activo: boolean;
  /** Categoría ('' = sin categoría). */
  categoria: string;
  /** Foto ya guardada (URL pública) o `null`. */
  imagen_url: string | null;
  /** Foto nueva elegida (JPEG comprimido), se sube al guardar. */
  nueva: string | null;
}

const VACIO: Formulario = { titulo: '', descripcion: '', precio: '', moneda: 'HNL', horario: '', activo: true, categoria: '', imagen_url: null, nueva: null };

function formularioDe(plato: CatalogoItem): Formulario {
  return {
    titulo: plato.titulo_es,
    descripcion: plato.descripcion_es,
    precio: String(plato.precio),
    moneda: plato.moneda,
    horario: plato.horario_o_duracion_es,
    activo: plato.activo,
    categoria: plato.categoria_id ?? '',
    imagen_url: plato.imagen_url,
    nueva: null,
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
 * Menú del hotel (room service): lo que el huésped ve y pide en "Menú y Horarios".
 * Se escribe en español; el inglés se genera solo al guardar. El precio que se
 * cobra es siempre el de aquí (la base de datos ignora el que mande el teléfono).
 */
export default function MenuHotelPage() {
  const { catalogo, categoriasMenu, guardarPlato, eliminarPlato, subirImagenMenu } = useStay();
  const platos = catalogo.filter((c) => c.tipo === 'menu');
  const { confirmar, dialogo } = useConfirmacion();

  // null = formulario cerrado; '' = plato nuevo; id = editando ese plato.
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<null | 'ok' | 'sin_traduccion'>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const [verCategorias, setVerCategorias] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso === 'ok' ? 4000 : 9000);
    return () => clearTimeout(t);
  }, [aviso]);

  const precio = Number(form.precio.replace(',', '.'));
  const errorTitulo = form.titulo.trim() === '' ? 'Escribe el nombre del plato.' : undefined;
  const errorPrecio = form.precio.trim() === '' || !Number.isFinite(precio) || precio < 0 ? 'Escribe un precio válido, ej. 180.' : undefined;

  const abrir = (plato?: CatalogoItem) => {
    setEditando(plato?.id ?? '');
    setForm(plato ? formularioDe(plato) : VACIO);
    setIntentado(false);
    setAviso(null);
    setErrorFoto(null);
    setVerCategorias(false);
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
    const anterior = platos.find((p) => p.id === editando);

    // El hotel escribe en español; 7Stay genera el inglés para los huéspedes.
    const ingles = await traducirAlIngles([titulo, descripcion, horario]);
    // Sin traductor: se conserva el inglés anterior si el texto no cambió; si cambió, se usa el español.
    const enIngles = (i: number, es: string, previoEs?: string, previoEn?: string) =>
      ingles?.[i] || (previoEs === es && previoEn ? previoEn : es);

    const datos: DatosPlato = {
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
      categoria_id: form.categoria || null,
    };

    const ok = await guardarPlato(datos);
    setGuardando(false);
    if (!ok) return; // el panel muestra el error y el formulario conserva lo escrito
    setEditando(null);
    setAviso(ingles ? 'ok' : 'sin_traduccion');
  };

  const alternarVisible = (plato: CatalogoItem) =>
    void guardarPlato({
      id: plato.id,
      titulo_es: plato.titulo_es,
      titulo_en: plato.titulo_en,
      descripcion_es: plato.descripcion_es,
      descripcion_en: plato.descripcion_en,
      horario_o_duracion_es: plato.horario_o_duracion_es,
      horario_o_duracion_en: plato.horario_o_duracion_en,
      precio: plato.precio,
      moneda: plato.moneda,
      activo: !plato.activo,
      imagen_url: plato.imagen_url,
      categoria_id: plato.categoria_id,
    });

  const eliminar = async (plato: CatalogoItem) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${plato.titulo_es}"?`,
      mensaje: 'Se borra para siempre, con su foto. Los pedidos que ya se hicieron conservan su detalle. Si solo se acabó o es de temporada, mejor desactívalo: se conserva y lo vuelves a activar cuando quieras.',
      textoConfirmar: 'Eliminar plato',
      tono: 'peligro',
    });
    if (ok === false) return;
    if (editando === plato.id) setEditando(null);
    await eliminarPlato(plato.id);
  };

  const visibles = platos.filter((p) => p.activo).length;

  // Lista agrupada por categoría, en el orden del hotel; al final, lo que no tiene categoría.
  const grupos: { id: string; nombre: string; categoria: CategoriaMenu | null; platos: CatalogoItem[] }[] =
    categoriasMenu.length === 0
      ? [{ id: 'todos', nombre: '', categoria: null, platos }]
      : [
          ...categoriasMenu.map((c) => ({ id: c.id, nombre: c.nombre_es, categoria: c, platos: platos.filter((p) => p.categoria_id === c.id) })),
          { id: 'sin', nombre: 'Sin categoría', categoria: null, platos: platos.filter((p) => !p.categoria_id || !categoriasMenu.some((c) => c.id === p.categoria_id)) },
        ].filter((g) => g.categoria !== null || g.platos.length > 0);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Menú</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            Lo que el huésped puede pedir a la habitación · {visibles} {visibles === 1 ? 'plato activo' : 'platos activos'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (guardando) return;
              setEditando(null);
              setVerCategorias(true);
            }}
            aria-pressed={verCategorias}
            className={`flex h-11 items-center gap-2 rounded-xl border px-5 text-[15px] font-semibold ${
              verCategorias ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/[0.1] bg-white text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <Layers aria-hidden className="h-4 w-4" />
            Categorías{categoriasMenu.length > 0 ? ` · ${categoriasMenu.length}` : ''}
          </button>
          <button
            type="button"
            onClick={() => abrir()}
            className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Agregar plato
          </button>
        </div>
      </header>

      {aviso && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-[14.5px] font-medium ${
            aviso === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
          }`}
        >
          <CheckCircle2 aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {aviso === 'ok'
            ? 'Plato guardado. Ya se ve en el portal del huésped, en español e inglés.'
            : 'Plato guardado, pero este navegador no pudo traducirlo: en inglés se mostrará en español. Guárdalo de nuevo desde Google Chrome para traducirlo.'}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Lista */}
        <section aria-label="Platos del menú" className="rounded-2xl border border-black/[0.06] bg-white">
          {platos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100">
                <UtensilsCrossed aria-hidden className="h-6 w-6 text-neutral-500" />
              </span>
              <p className="mt-4 text-[18px] font-semibold text-neutral-900">Todavía no hay platos</p>
              <p className="mt-1 max-w-[360px] text-[15px] text-neutral-500">
                Agrega lo que el huésped puede pedir a la habitación. Mientras el menú esté vacío, el portal muestra «El menú no está disponible».
              </p>
              <button
                type="button"
                onClick={() => abrir()}
                className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Agregar el primer plato
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200/70">
              {grupos.map((grupo) => (
                <div key={grupo.id}>
                  {categoriasMenu.length > 0 && (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-[#F8F9FA] px-6 py-2.5">
                      <h2 className={`text-[13px] font-bold uppercase tracking-[0.08em] ${grupo.categoria?.activa === false ? 'text-neutral-400' : 'text-neutral-600'}`}>
                        {grupo.nombre}
                      </h2>
                      {grupo.categoria?.activa === false && <span className="text-[12px] font-semibold text-neutral-400">· oculta</span>}
                      {grupo.categoria && resumenCategoria(grupo.categoria) && (
                        <span className="text-[12.5px] text-neutral-400">· {resumenCategoria(grupo.categoria)}</span>
                      )}
                    </div>
                  )}
                  {grupo.platos.length === 0 && (
                    <p className="px-6 py-3 text-[14px] text-neutral-400">Sin platos en esta categoría.</p>
                  )}
            <ul className="divide-y divide-neutral-100">
              {grupo.platos.map((plato) => (
                <li
                  key={plato.id}
                  className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 ${editando === plato.id ? 'bg-neutral-50' : ''}`}
                >
                  {plato.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage
                    <img
                      src={plato.imagen_url}
                      alt=""
                      className={`h-14 w-14 shrink-0 rounded-xl border border-black/[0.06] object-cover ${plato.activo ? '' : 'opacity-50'}`}
                    />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                      <UtensilsCrossed className="h-5 w-5" />
                    </span>
                  )}
                  <div className={`min-w-0 flex-1 ${plato.activo ? '' : 'opacity-50'}`}>
                    <p className="flex flex-wrap items-center gap-2 text-[16.5px] font-semibold text-neutral-900">
                      {plato.titulo_es}
                      {!plato.activo && (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] font-bold tracking-wide text-neutral-500">INACTIVO</span>
                      )}
                    </p>
                    {plato.descripcion_es && <p className="mt-0.5 line-clamp-1 text-[14px] text-neutral-500">{plato.descripcion_es}</p>}
                    {plato.horario_o_duracion_es && <p className="mt-0.5 text-[13px] text-neutral-400">{plato.horario_o_duracion_es}</p>}
                  </div>
                  <p className="w-28 text-right text-[16px] font-bold tabular-nums text-neutral-900">{formatoPrecio(plato.precio, plato.moneda)}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Desactivar: el plato se conserva (con su foto) pero el huésped no lo ve. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={plato.activo}
                      onClick={() => alternarVisible(plato)}
                      aria-label={`${plato.titulo_es} activo en el menú`}
                      title={plato.activo ? 'Desactivar: se conserva, pero el huésped no lo ve' : 'Activar: vuelve a mostrarse al huésped'}
                      className={`mr-1 flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3 text-[13.5px] font-semibold ${
                        plato.activo ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                      }`}
                    >
                      <span aria-hidden className={`relative h-6 w-10 rounded-full transition-colors ${plato.activo ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${plato.activo ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                      {plato.activo ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => abrir(plato)}
                      aria-label={`Editar ${plato.titulo_es}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(plato)}
                      aria-label={`Eliminar ${plato.titulo_es}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Formulario */}
        {verCategorias && editando === null && <GestorCategorias onCerrar={() => setVerCategorias(false)} />}

        {editando !== null && (
          <form onSubmit={guardar} noValidate className="flex flex-col rounded-2xl border border-black/[0.06] bg-white xl:sticky xl:top-[104px]">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-5">
              <div>
                <h2 className="text-[19px] font-bold text-neutral-900">{editando ? 'Editar plato' : 'Nuevo plato'}</h2>
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
                    <img src={vistaFoto} alt="Foto del plato" className="h-24 w-32 shrink-0 rounded-xl border border-black/[0.06] object-cover" />
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
                  <span role="alert" className="text-[13px] font-medium text-rose-600">{errorFoto}</span>
                ) : (
                  <span className="text-[12.5px] text-neutral-400">Horizontal se ve mejor. La reducimos sola para que cargue rápido.</span>
                )}
              </div>

              <Campo etiqueta="Nombre" error={intentado ? errorTitulo : undefined}>
                <input
                  value={form.titulo}
                  maxLength={80}
                  onChange={(e) => cambiar('titulo', e.target.value)}
                  placeholder="Ej. Baleadas especiales"
                  aria-invalid={intentado && Boolean(errorTitulo)}
                  className={`${INPUT} ${intentado && errorTitulo ? 'border-rose-400' : ''}`}
                />
              </Campo>
              <Campo etiqueta="Descripción" ayuda="Ingredientes o qué incluye (opcional).">
                <textarea
                  value={form.descripcion}
                  maxLength={280}
                  rows={3}
                  onChange={(e) => cambiar('descripcion', e.target.value)}
                  placeholder="Ej. Tortilla de harina con frijoles, queso, mantequilla y huevo."
                  className={`${INPUT} h-auto resize-none py-2.5 leading-relaxed`}
                />
              </Campo>
              <Campo etiqueta="Categoría" ayuda={categoriasMenu.length === 0 ? 'Crea categorías desde el botón «Categorías» (opcional).' : undefined}>
                <select value={form.categoria} onChange={(e) => cambiar('categoria', e.target.value)} className={INPUT}>
                  <option value="">Sin categoría</option>
                  {categoriasMenu.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_es}
                      {c.activa ? '' : ' (oculta)'}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                <Campo etiqueta="Precio" error={intentado ? errorPrecio : undefined}>
                  <input
                    inputMode="decimal"
                    value={form.precio}
                    onChange={(e) => cambiar('precio', e.target.value)}
                    placeholder="180"
                    aria-invalid={intentado && Boolean(errorPrecio)}
                    className={`${INPUT} tabular-nums ${intentado && errorPrecio ? 'border-rose-400' : ''}`}
                  />
                </Campo>
                <Campo etiqueta="Moneda">
                  <select value={form.moneda} onChange={(e) => cambiar('moneda', e.target.value as Moneda)} className={INPUT}>
                    <option value="HNL">Lempiras</option>
                    <option value="USD">Dólares</option>
                  </select>
                </Campo>
              </div>
              <Campo etiqueta="Horario disponible" ayuda="Opcional. Ej. Disponible 6:30 AM – 10:00 PM">
                <input
                  value={form.horario}
                  maxLength={80}
                  onChange={(e) => cambiar('horario', e.target.value)}
                  placeholder="Disponible 6:30 AM – 10:00 PM"
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
                <span className="text-[15px] text-neutral-800">Activo: el huésped lo ve y lo puede pedir</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
              <button
                type="button"
                onClick={cerrar}
                className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || procesandoFoto}
                className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {guardando ? 'Guardando…' : 'Guardar plato'}
              </button>
            </div>
          </form>
        )}
      </div>

      {dialogo}
    </main>
  );
}
