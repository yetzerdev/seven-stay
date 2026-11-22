'use client';

import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, Clock, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';

import { formato12h } from '@/components/portal/etiquetasTicket';
import { useStay, type DatosCategoria } from '@/context/StayContext';
import { fechaCorta } from '@/lib/categorias';
import { traducirAlIngles } from '@/lib/traduccion';
import type { CategoriaMenu } from '@/types/sevenstay';

import { useConfirmacion } from './DialogoConfirmacion';

const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

interface Formulario {
  nombre: string;
  activa: boolean;
  conHorario: boolean;
  hora_inicio: string;
  hora_fin: string;
  conTemporada: boolean;
  fecha_inicio: string;
  fecha_fin: string;
}

const VACIO: Formulario = {
  nombre: '',
  activa: true,
  conHorario: false,
  hora_inicio: '06:30',
  hora_fin: '10:30',
  conTemporada: false,
  fecha_inicio: '',
  fecha_fin: '',
};

function formularioDe(c: CategoriaMenu): Formulario {
  return {
    nombre: c.nombre_es,
    activa: c.activa,
    conHorario: Boolean(c.hora_inicio && c.hora_fin),
    hora_inicio: c.hora_inicio ?? VACIO.hora_inicio,
    hora_fin: c.hora_fin ?? VACIO.hora_fin,
    conTemporada: Boolean(c.fecha_inicio || c.fecha_fin),
    fecha_inicio: c.fecha_inicio ?? '',
    fecha_fin: c.fecha_fin ?? '',
  };
}

/** Resumen corto: "6:30 AM – 10:30 AM · 13 abr – 20 abr". */
export function resumenCategoria(c: CategoriaMenu): string {
  const partes: string[] = [];
  if (c.hora_inicio && c.hora_fin) partes.push(`${formato12h(c.hora_inicio)} – ${formato12h(c.hora_fin)}`);
  if (c.fecha_inicio && c.fecha_fin) partes.push(`${fechaCorta(c.fecha_inicio, 'es')} – ${fechaCorta(c.fecha_fin, 'es')}`);
  else if (c.fecha_inicio) partes.push(`Desde el ${fechaCorta(c.fecha_inicio, 'es')}`);
  else if (c.fecha_fin) partes.push(`Hasta el ${fechaCorta(c.fecha_fin, 'es')}`);
  return partes.join(' · ');
}

/**
 * Categorías del menú: crear, renombrar, ordenar, ocultar y borrar.
 * Horario: fuera de él la categoría se ve pero no se puede ordenar.
 * Temporada: fuera de esas fechas ni se muestra.
 */
export default function GestorCategorias({ onCerrar }: { onCerrar: () => void }) {
  const { catalogo, categoriasMenu, guardarCategoria, eliminarCategoria, ordenarCategorias } = useStay();
  const { confirmar, dialogo } = useConfirmacion();
  // null = sin formulario; '' = nueva; id = editando esa categoría
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const platosDe = (id: string) => catalogo.filter((p) => p.tipo === 'menu' && p.categoria_id === id).length;
  const cambiar = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) => setForm((f) => ({ ...f, [clave]: valor }));

  const errorNombre = form.nombre.trim() === '' ? 'Escribe el nombre de la categoría.' : undefined;
  const errorHorario = form.conHorario && form.hora_inicio === form.hora_fin ? 'La hora de inicio y fin no pueden ser iguales.' : undefined;
  const errorTemporada =
    form.conTemporada && !form.fecha_inicio && !form.fecha_fin
      ? 'Elige al menos una fecha.'
      : form.conTemporada && form.fecha_inicio && form.fecha_fin && form.fecha_inicio > form.fecha_fin
        ? 'La fecha final es antes de la inicial.'
        : undefined;

  const abrir = (c?: CategoriaMenu) => {
    setEditando(c?.id ?? '');
    setForm(c ? formularioDe(c) : VACIO);
    setIntentado(false);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorNombre || errorHorario || errorTemporada || guardando || editando === null) return;
    setGuardando(true);
    const nombre = form.nombre.trim();
    const anterior = categoriasMenu.find((c) => c.id === editando);
    const ingles = await traducirAlIngles([nombre]);
    const datos: DatosCategoria = {
      ...(editando ? { id: editando } : {}),
      nombre_es: nombre,
      // Sin traductor: se conserva el inglés anterior si el nombre no cambió.
      nombre_en: ingles?.[0] || (anterior?.nombre_es === nombre && anterior.nombre_en ? anterior.nombre_en : nombre),
      activa: form.activa,
      hora_inicio: form.conHorario ? form.hora_inicio : null,
      hora_fin: form.conHorario ? form.hora_fin : null,
      fecha_inicio: form.conTemporada && form.fecha_inicio ? form.fecha_inicio : null,
      fecha_fin: form.conTemporada && form.fecha_fin ? form.fecha_fin : null,
    };
    const ok = await guardarCategoria(datos);
    setGuardando(false);
    if (ok) setEditando(null);
  };

  const mover = (indice: number, paso: -1 | 1) => {
    const ids = categoriasMenu.map((c) => c.id);
    const destino = indice + paso;
    if (destino < 0 || destino >= ids.length) return;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    void ordenarCategorias(ids);
  };

  const alternarVisible = (c: CategoriaMenu) =>
    void guardarCategoria({
      id: c.id,
      nombre_es: c.nombre_es,
      nombre_en: c.nombre_en,
      activa: !c.activa,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
    });

  const borrar = async (c: CategoriaMenu) => {
    const n = platosDe(c.id);
    const ok = await confirmar({
      titulo: `¿Eliminar la categoría "${c.nombre_es}"?`,
      mensaje:
        n > 0
          ? `Sus ${n === 1 ? 'plato queda' : `${n} platos quedan`} en "Sin categoría" (no se borran).`
          : 'No tiene platos.',
      textoConfirmar: 'Eliminar categoría',
      tono: 'peligro',
    });
    if (ok === false) return;
    if (editando === c.id) setEditando(null);
    await eliminarCategoria(c.id);
  };

  return (
    <section aria-label="Categorías del menú" className="flex flex-col rounded-2xl border border-black/[0.06] bg-white xl:sticky xl:top-[104px]">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 py-5">
        <div>
          <h2 className="text-[19px] font-bold text-neutral-900">Categorías</h2>
          <p className="mt-0.5 text-[14px] text-neutral-500">Se muestran al huésped en este orden.</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar categorías"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {categoriasMenu.length === 0 && editando === null && (
        <p className="px-6 pt-5 text-[14.5px] text-neutral-500">
          Agrupa el menú en secciones como Desayunos, Platos fuertes o Bebidas. Sin categorías, el huésped ve una sola lista.
        </p>
      )}

      {categoriasMenu.length > 0 && (
        <ul className="divide-y divide-neutral-100 px-2 pt-2">
          {categoriasMenu.map((c, i) => {
            const resumen = resumenCategoria(c);
            return (
              <li key={c.id} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${editando === c.id ? 'bg-neutral-50' : ''}`}>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir ${c.nombre_es}`}
                    className="flex h-6 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-25"
                  >
                    <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === categoriasMenu.length - 1}
                    aria-label={`Bajar ${c.nombre_es}`}
                    className="flex h-6 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-25"
                  >
                    <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className={`min-w-0 flex-1 ${c.activa ? '' : 'opacity-50'}`}>
                  <p className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-semibold text-neutral-900">
                    {c.nombre_es}
                    <span className="text-[13px] font-normal text-neutral-400">· {platosDe(c.id)}</span>
                    {!c.activa && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-500">OCULTA</span>}
                  </p>
                  {resumen && <p className="truncate text-[13px] text-neutral-500">{resumen}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => alternarVisible(c)}
                  aria-label={c.activa ? `Ocultar ${c.nombre_es}` : `Mostrar ${c.nombre_es}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {c.activa ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => abrir(c)}
                  aria-label={`Editar ${c.nombre_es}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Pencil aria-hidden className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(c)}
                  aria-label={`Eliminar ${c.nombre_es}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editando === null ? (
        <div className="px-6 py-5">
          <button
            type="button"
            onClick={() => abrir()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Nueva categoría
          </button>
        </div>
      ) : (
        <form onSubmit={guardar} noValidate className="mt-2 flex flex-col gap-4 border-t border-neutral-100 px-6 py-5">
          <p className="text-[15px] font-bold text-neutral-900">{editando ? 'Editar categoría' : 'Nueva categoría'}</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-neutral-700">Nombre</span>
            <input
              value={form.nombre}
              maxLength={60}
              onChange={(e) => cambiar('nombre', e.target.value)}
              placeholder="Ej. Desayunos"
              aria-invalid={intentado && Boolean(errorNombre)}
              className={`${INPUT} ${intentado && errorNombre ? 'border-rose-400' : ''}`}
            />
            {intentado && errorNombre && <span className="text-[13px] font-medium text-rose-600">{errorNombre}</span>}
          </label>

          <div className="flex flex-col gap-2 rounded-xl bg-[#F8F9FA] p-3.5">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={form.conHorario} onChange={(e) => cambiar('conHorario', e.target.checked)} className="h-5 w-5 accent-neutral-900" />
              <Clock aria-hidden className="h-4 w-4 text-neutral-500" />
              <span className="text-[14.5px] font-medium text-neutral-800">Solo en un horario</span>
            </label>
            {form.conHorario && (
              <>
                <div className="flex items-center gap-2 pl-7">
                  <input type="time" aria-label="Desde" value={form.hora_inicio} onChange={(e) => cambiar('hora_inicio', e.target.value)} className={INPUT} />
                  <span className="text-neutral-400">–</span>
                  <input type="time" aria-label="Hasta" value={form.hora_fin} onChange={(e) => cambiar('hora_fin', e.target.value)} className={INPUT} />
                </div>
                <p className={`pl-7 text-[12.5px] ${errorHorario ? 'font-medium text-rose-600' : 'text-neutral-500'}`}>
                  {errorHorario ?? 'Fuera de este horario el huésped la ve, pero no puede ordenar.'}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-[#F8F9FA] p-3.5">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={form.conTemporada} onChange={(e) => cambiar('conTemporada', e.target.checked)} className="h-5 w-5 accent-neutral-900" />
              <CalendarRange aria-hidden className="h-4 w-4 text-neutral-500" />
              <span className="text-[14.5px] font-medium text-neutral-800">De temporada (entre fechas)</span>
            </label>
            {form.conTemporada && (
              <>
                <div className="flex items-center gap-2 pl-7">
                  <input type="date" aria-label="Desde la fecha" value={form.fecha_inicio} onChange={(e) => cambiar('fecha_inicio', e.target.value)} className={INPUT} />
                  <span className="text-neutral-400">–</span>
                  <input type="date" aria-label="Hasta la fecha" value={form.fecha_fin} onChange={(e) => cambiar('fecha_fin', e.target.value)} className={INPUT} />
                </div>
                <p className={`pl-7 text-[12.5px] ${intentado && errorTemporada ? 'font-medium text-rose-600' : 'text-neutral-500'}`}>
                  {intentado && errorTemporada ? errorTemporada : 'Aparece y desaparece sola en esas fechas.'}
                </p>
              </>
            )}
          </div>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={form.activa} onChange={(e) => cambiar('activa', e.target.checked)} className="h-5 w-5 accent-neutral-900" />
            <span className="text-[14.5px] text-neutral-800">Visible para el huésped</span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              Guardar categoría
            </button>
          </div>
        </form>
      )}

      {dialogo}
    </section>
  );
}
