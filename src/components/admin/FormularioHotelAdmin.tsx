'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

import type { DatosHotelAdmin } from '@/lib/admin/tipos';
import { categoriaPorHabitaciones, cotizarMensualidad, lempiras, PLACAS, PLANES_SAAS, type PlanSaas, type TipoPlaca } from '@/lib/facturacion/tarifas';
import { comprimirFoto } from '@/lib/imagenes';
import type { ModoTours } from '@/types/sevenstay';

import { useAdmin } from './SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, BOTON_SECUNDARIO, Campo, INPUT, leerArchivo } from './ui';

export const HOTEL_NUEVO: DatosHotelAdmin = {
  nombre: '',
  logo_url: '',
  telefono_recepcion: '',
  wifi_ssid: '',
  wifi_password: '',
  moneda_default: 'HNL',
  zona_horaria: 'America/Tegucigalpa',
  hora_checkout: '12:00',
  modo_tours: 'seven_stay',
  whatsapp_reception: '',
  rtn: '',
  plan_saas: null,
  gratis_hasta: '',
  direccion_fiscal: '',
  tipo_placa: null,
  habitaciones_contratadas: 0,
};

const ZONAS = [
  { valor: 'America/Tegucigalpa', texto: 'Honduras (UTC−6)' },
  { valor: 'America/Guatemala', texto: 'Guatemala (UTC−6)' },
  { valor: 'America/El_Salvador', texto: 'El Salvador (UTC−6)' },
  { valor: 'America/Managua', texto: 'Nicaragua (UTC−6)' },
  { valor: 'America/Costa_Rica', texto: 'Costa Rica (UTC−6)' },
  { valor: 'America/Panama', texto: 'Panamá (UTC−5)' },
  { valor: 'America/Mexico_City', texto: 'México centro (UTC−6)' },
  { valor: 'America/Cancun', texto: 'Cancún (UTC−5)' },
];

const MODOS: { valor: ModoTours; texto: string }[] = [
  { valor: 'seven_stay', texto: 'Solo tours de Seven Stay' },
  { valor: 'propios', texto: 'Solo tours del hotel' },
  { valor: 'ambos', texto: 'Ambos' },
];

/**
 * Datos del hotel que configura Seven Stay al darlo de alta. El resto (horarios
 * de desayuno, notas, reseñas…) lo completa la gerencia desde su panel.
 */
export default function FormularioHotelAdmin({
  hotelId,
  inicial,
  textoGuardar,
  onGuardado,
  onCancelar,
}: {
  hotelId?: string;
  inicial: DatosHotelAdmin;
  textoGuardar: string;
  onGuardado: (id: string) => void;
  onCancelar?: () => void;
}) {
  const { llamar } = useAdmin();
  const [d, setD] = useState<DatosHotelAdmin>(inicial);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputLogo = useRef<HTMLInputElement>(null);

  const cambiar = <K extends keyof DatosHotelAdmin>(k: K, v: DatosHotelAdmin[K]) => setD((x) => ({ ...x, [k]: v }));
  const errorNombre = d.nombre.trim() === '' ? 'Escribe el nombre del hotel.' : undefined;
  const sinCambios = JSON.stringify(d) === JSON.stringify(inicial);

  const elegirLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    setSubiendoLogo(true);
    try {
      // PNG/WebP con transparencia se suben tal cual (≤ 1 MB); el resto se comprime a JPG.
      const dataUrl =
        /png|webp/.test(archivo.type) && archivo.size <= 1024 * 1024
          ? await leerArchivo(archivo)
          : await comprimirFoto(archivo, { ladoMax: 800, bytesMax: 300 * 1024 });
      const { url } = await llamar('subirImagen', { dataUrl, carpeta: hotelId ?? 'seven-stay' });
      cambiar('logo_url', url);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errorNombre || guardando || subiendoLogo) return;
    setGuardando(true);
    setError(null);
    try {
      const { id } = await llamar('guardarHotel', { id: hotelId, datos: d });
      onGuardado(id);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-6">
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      <div className="flex items-center gap-5">
        {d.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
          <img src={d.logo_url} alt="Logo del hotel" className="h-20 w-28 shrink-0 rounded-xl border border-black/[0.06] bg-white object-contain p-2" />
        ) : (
          <span aria-hidden className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-[#F8F9FA] text-neutral-400">
            <ImagePlus className="h-6 w-6" />
          </span>
        )}
        <div className="flex flex-col items-start gap-1">
          <button type="button" disabled={subiendoLogo} onClick={() => inputLogo.current?.click()} className={BOTON_SECUNDARIO}>
            {subiendoLogo ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ImagePlus aria-hidden className="h-4 w-4" />}
            {subiendoLogo ? 'Subiendo…' : d.logo_url ? 'Cambiar logo' : 'Subir logo'}
          </button>
          {d.logo_url && (
            <button type="button" onClick={() => cambiar('logo_url', '')} className="h-8 px-1 text-[13.5px] font-medium text-rose-600 hover:underline">
              Quitar logo
            </button>
          )}
          <span className="text-[12.5px] text-neutral-400">PNG con fondo transparente, horizontal (3:2).</span>
        </div>
        <input ref={inputLogo} type="file" accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} className="hidden" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo etiqueta="Nombre del hotel" error={intentado ? errorNombre : undefined}>
          <input value={d.nombre} maxLength={80} onChange={(e) => cambiar('nombre', e.target.value)} className={`${INPUT} ${intentado && errorNombre ? 'border-rose-400' : ''}`} />
        </Campo>
        <Campo etiqueta="Teléfono de recepción" ayuda="El huésped lo marca desde el portal. Ej. +504 2440-0000">
          <input inputMode="tel" value={d.telefono_recepcion} onChange={(e) => cambiar('telefono_recepcion', e.target.value)} className={INPUT} />
        </Campo>
        <Campo
          etiqueta="WhatsApp de recepción"
          ayuda="Con código de país. El bot de Seven Stay avisa aquí cada solicitud nueva. Vacío = sin bot."
        >
          <input
            inputMode="tel"
            value={d.whatsapp_reception}
            onChange={(e) => cambiar('whatsapp_reception', e.target.value)}
            placeholder="+504 9999-0000"
            className={`${INPUT} tabular-nums`}
          />
        </Campo>
        <Campo etiqueta="Red Wi-Fi (SSID)">
          <input value={d.wifi_ssid} onChange={(e) => cambiar('wifi_ssid', e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Contraseña Wi-Fi">
          <input value={d.wifi_password} onChange={(e) => cambiar('wifi_password', e.target.value)} className={`${INPUT} font-mono`} />
        </Campo>
        <Campo etiqueta="Zona horaria" ayuda="Define el check-out, el horario de silencio y las métricas.">
          <select value={d.zona_horaria} onChange={(e) => cambiar('zona_horaria', e.target.value)} className={INPUT}>
            {ZONAS.map((z) => (
              <option key={z.valor} value={z.valor}>
                {z.texto}
              </option>
            ))}
            {!ZONAS.some((z) => z.valor === d.zona_horaria) && <option value={d.zona_horaria}>{d.zona_horaria}</option>}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Hora de check-out">
            <input type="time" value={d.hora_checkout} onChange={(e) => cambiar('hora_checkout', e.target.value)} className={INPUT} />
          </Campo>
          <Campo etiqueta="Moneda">
            <select value={d.moneda_default} onChange={(e) => cambiar('moneda_default', e.target.value === 'USD' ? 'USD' : 'HNL')} className={INPUT}>
              <option value="HNL">Lempiras</option>
              <option value="USD">Dólares</option>
            </select>
          </Campo>
        </div>
        <Campo etiqueta="RTN" ayuda="Para las facturas de Seven Stay. Ej. 0801-1990-12345">
          <input inputMode="numeric" value={d.rtn} maxLength={20} onChange={(e) => cambiar('rtn', e.target.value)} className={`${INPUT} tabular-nums`} />
        </Campo>
        <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3">
          <Campo
            etiqueta="Mensualidad SaaS"
            ayuda={`${lempiras(cotizarMensualidad(d.plan_saas ?? categoriaPorHabitaciones(d.habitaciones_contratadas)).total)} / mes con ISV`}
          >
            <select value={d.plan_saas ?? ''} onChange={(e) => cambiar('plan_saas', (e.target.value || null) as PlanSaas | null)} className={INPUT}>
              <option value="">
                Automática · {PLANES_SAAS[categoriaPorHabitaciones(d.habitaciones_contratadas)].nombre} (por habitaciones)
              </option>
              {(Object.keys(PLANES_SAAS) as PlanSaas[]).map((p) => (
                <option key={p} value={p}>
                  {PLANES_SAAS[p].nombre} ({PLANES_SAAS[p].rango}) · {lempiras(PLANES_SAAS[p].mensual)} + ISV
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Hab. contratadas" ayuda="Define la categoría">
            <input
              inputMode="numeric"
              value={d.habitaciones_contratadas || ''}
              onChange={(e) => cambiar('habitaciones_contratadas', Math.max(0, Math.trunc(Number(e.target.value.replace(/\D/g, '')) || 0)))}
              placeholder="0"
              className={`${INPUT} tabular-nums`}
            />
          </Campo>
        </div>
        <Campo etiqueta="Dirección fiscal" ayuda="La que sale en sus facturas.">
          <input value={d.direccion_fiscal} maxLength={300} onChange={(e) => cambiar('direccion_fiscal', e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Tipo de placa" ayuda="Para cobrar anticipo, saldo y reposiciones.">
          <select value={d.tipo_placa ?? ''} onChange={(e) => cambiar('tipo_placa', (e.target.value || null) as TipoPlaca | null)} className={INPUT}>
            <option value="">Sin definir</option>
            {(Object.keys(PLACAS) as TipoPlaca[]).map((t) => (
              <option key={t} value={t}>
                {PLACAS[t].nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Mes gratis hasta (bonificación piloto)" ayuda="Vacío = sin periodo gratis. Mientras dure no se le cobra.">
          <input type="date" value={d.gratis_hasta} onChange={(e) => cambiar('gratis_hasta', e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Tours en el portal" ayuda="La gerencia también puede cambiarlo desde su panel.">
          <select value={d.modo_tours} onChange={(e) => cambiar('modo_tours', e.target.value as ModoTours)} className={INPUT}>
            {MODOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-5">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="h-11 rounded-xl px-4 text-[15px] font-semibold text-neutral-600 hover:bg-neutral-100">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando || subiendoLogo || (Boolean(hotelId) && sinCambios)} className={BOTON_PRIMARIO}>
          {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {guardando ? 'Guardando…' : textoGuardar}
        </button>
      </div>
    </form>
  );
}
