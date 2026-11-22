'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Languages, Loader2 } from 'lucide-react';

import { useStay } from '@/context/StayContext';
import { traducirAlIngles } from '@/lib/traduccion';
import type { Hotel } from '@/types/sevenstay';

type Campos = Pick<
  Hotel,
  | 'wifi_ssid'
  | 'wifi_password'
  | 'hora_checkout'
  | 'horario_desayuno'
  | 'horario_piscina'
  | 'hora_silencio_inicio'
  | 'hora_silencio_fin'
  | 'notas_info_es'
  | 'google_review_url'
  | 'tripadvisor_url'
>;

const CLAVES: (keyof Campos)[] = [
  'wifi_ssid',
  'wifi_password',
  'hora_checkout',
  'horario_desayuno',
  'horario_piscina',
  'hora_silencio_inicio',
  'hora_silencio_fin',
  'notas_info_es',
  'google_review_url',
  'tripadvisor_url',
];

const INPUT =
  'h-11 w-full rounded-xl border border-black/[0.1] bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900';

function camposDe(hotel: Hotel): Campos {
  return Object.fromEntries(CLAVES.map((c) => [c, hotel[c]])) as Campos;
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold text-neutral-700">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-[12.5px] text-neutral-400">{ayuda}</span>}
    </label>
  );
}

/** Wi-Fi, horarios y notas del hotel. Se guarda todo junto con "Guardar Cambios". */
export default function FormularioHotel() {
  const { hotel, actualizarHotel } = useStay();
  const [campos, setCampos] = useState<Campos>(() => camposDe(hotel));
  const [guardado, setGuardado] = useState<null | 'ok' | 'sin_traduccion'>(null);
  const [traduciendo, setTraduciendo] = useState(false);

  const original = camposDe(hotel);
  const cambiados = CLAVES.filter((c) => campos[c] !== original[c]);
  const errorSsid = campos.wifi_ssid.trim() === '';
  const urlInvalida = (v: string) => v.trim() !== '' && !/^https:\/\/\S+$/i.test(v.trim());
  const errorGoogle = urlInvalida(campos.google_review_url);
  const errorTripadvisor = urlInvalida(campos.tripadvisor_url);

  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(null), guardado === 'ok' ? 4000 : 9000);
    return () => clearTimeout(t);
  }, [guardado]);

  const cambiar = (clave: keyof Campos, valor: string) => {
    setCampos((prev) => ({ ...prev, [clave]: valor }));
    setGuardado(null);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (errorSsid || errorGoogle || errorTripadvisor || cambiados.length === 0 || traduciendo) return;
    const datos: Partial<Hotel> = Object.fromEntries(cambiados.map((c) => [c, campos[c].trim()]));

    // Las notas se escriben en español; 7Stay genera la versión en inglés.
    let traducido = true;
    if (cambiados.includes('notas_info_es')) {
      setTraduciendo(true);
      const ingles = await traducirAlIngles([campos.notas_info_es]);
      setTraduciendo(false);
      traducido = ingles !== null;
      // Si no se pudo traducir, se conserva el inglés anterior (mejor que mostrar español).
      if (ingles?.[0]) datos.notas_info_en = ingles[0];
    }

    // Si falla, el panel muestra el aviso de error y el formulario conserva lo escrito.
    if (!(await actualizarHotel(datos))) return;
    setCampos((prev) => Object.fromEntries(CLAVES.map((c) => [c, prev[c].trim()])) as Campos);
    setGuardado(traducido ? 'ok' : 'sin_traduccion');
  };

  return (
    <form onSubmit={guardar} className="flex flex-col rounded-2xl border border-black/[0.06] bg-white">
      <div className="border-b border-neutral-100 px-6 py-5">
        <h2 className="text-[19px] font-bold text-neutral-900">Wi-Fi, horarios y políticas</h2>
        <p className="mt-0.5 text-[14px] text-neutral-500">Lo que ve el huésped en la Home y en Menú y Horarios</p>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">Wi-Fi</legend>
          <Campo etiqueta="Red Wi-Fi (SSID)">
            <input
              value={campos.wifi_ssid}
              onChange={(e) => cambiar('wifi_ssid', e.target.value)}
              aria-invalid={errorSsid}
              className={`${INPUT} ${errorSsid ? 'border-rose-400' : ''}`}
            />
          </Campo>
          <Campo etiqueta="Contraseña Wi-Fi">
            <input value={campos.wifi_password} onChange={(e) => cambiar('wifi_password', e.target.value)} className={`${INPUT} font-mono`} />
          </Campo>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">Horarios</legend>
          <Campo etiqueta="Desayuno" ayuda="Texto libre, ej. 6:30 AM – 10:00 AM">
            <input value={campos.horario_desayuno} onChange={(e) => cambiar('horario_desayuno', e.target.value)} className={INPUT} />
          </Campo>
          <Campo etiqueta="Piscina" ayuda="Texto libre, ej. 8:00 AM – 8:00 PM">
            <input value={campos.horario_piscina} onChange={(e) => cambiar('horario_piscina', e.target.value)} className={INPUT} />
          </Campo>
          <Campo etiqueta="Hora de check-out" ayuda="También define hasta cuándo dura cada estadía">
            <input type="time" value={campos.hora_checkout} onChange={(e) => cambiar('hora_checkout', e.target.value)} className={INPUT} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-neutral-700">Horario de silencio</span>
            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="Inicio del horario de silencio"
                value={campos.hora_silencio_inicio}
                onChange={(e) => cambiar('hora_silencio_inicio', e.target.value)}
                className={INPUT}
              />
              <span className="text-neutral-400">–</span>
              <input
                type="time"
                aria-label="Fin del horario de silencio"
                value={campos.hora_silencio_fin}
                onChange={(e) => cambiar('hora_silencio_fin', e.target.value)}
                className={INPUT}
              />
            </div>
            <span className="text-[12.5px] text-neutral-400">Los insumos pedidos en ese rango se entregan al terminar</span>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4">
          <legend className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">Notas y políticas</legend>
          <Campo etiqueta="Notas para el huésped" ayuda="Escribe en español: 7Stay lo traduce automáticamente al inglés al guardar.">
            <textarea
              rows={4}
              value={campos.notas_info_es}
              onChange={(e) => cambiar('notas_info_es', e.target.value)}
              className={`${INPUT} h-auto resize-y py-3 leading-relaxed`}
            />
          </Campo>
          <div className="rounded-xl bg-[#F8F9FA] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-neutral-400">
              <Languages aria-hidden className="h-3.5 w-3.5" />
              Inglés · traducción automática
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-neutral-600">{hotel.notas_info_en || '—'}</p>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-400">Reseñas</legend>
          <Campo
            etiqueta="Enlace de reseñas en Google"
            ayuda={errorGoogle ? undefined : 'Google Business Profile → «Pedir reseñas» → copia el enlace.'}
          >
            <input
              type="url"
              inputMode="url"
              value={campos.google_review_url}
              onChange={(e) => cambiar('google_review_url', e.target.value)}
              placeholder="https://g.page/r/…/review"
              aria-invalid={errorGoogle}
              className={`${INPUT} ${errorGoogle ? 'border-rose-400' : ''}`}
            />
            {errorGoogle && <span className="text-[13px] font-medium text-rose-600">Pega el enlace completo, empieza con https://</span>}
          </Campo>
          <Campo
            etiqueta="Enlace de reseñas en Tripadvisor"
            ayuda={errorTripadvisor ? undefined : 'La página de tu hotel en Tripadvisor o su enlace «Escribir una opinión».'}
          >
            <input
              type="url"
              inputMode="url"
              value={campos.tripadvisor_url}
              onChange={(e) => cambiar('tripadvisor_url', e.target.value)}
              placeholder="https://www.tripadvisor.com/UserReviewEdit-…"
              aria-invalid={errorTripadvisor}
              className={`${INPUT} ${errorTripadvisor ? 'border-rose-400' : ''}`}
            />
            {errorTripadvisor && <span className="text-[13px] font-medium text-rose-600">Pega el enlace completo, empieza con https://</span>}
          </Campo>
          <p className="text-[13px] text-neutral-500 sm:col-span-2">
            Si dejas uno vacío, el huésped verá un botón que busca tu hotel en esa plataforma.
          </p>
        </fieldset>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
        {guardado === 'ok' && (
          <p role="status" className="mr-auto inline-flex items-center gap-2 text-[14.5px] font-medium text-emerald-700">
            <CheckCircle2 aria-hidden className="h-5 w-5" />
            Cambios guardados y visibles en el portal del huésped
          </p>
        )}
        {guardado === 'sin_traduccion' && (
          <p role="status" className="mr-auto text-[14px] font-medium text-amber-800">
            Guardado. Este navegador no pudo traducir las notas: la versión en inglés quedó sin actualizar.
          </p>
        )}
        {!guardado && cambiados.length > 0 && (
          <p className="mr-auto text-[14px] text-neutral-500">
            {cambiados.length} {cambiados.length === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
          </p>
        )}
        {cambiados.length > 0 && (
          <button
            type="button"
            onClick={() => setCampos(original)}
            className="h-11 rounded-xl px-4 text-[14.5px] font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            Descartar
          </button>
        )}
        <button
          type="submit"
          disabled={cambiados.length === 0 || errorSsid || errorGoogle || errorTripadvisor || traduciendo}
          className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[14.5px] font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {traduciendo && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {traduciendo ? 'Traduciendo…' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
}
