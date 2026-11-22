'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BedDouble, Download, Loader2, Plus, Printer, QrCode, RefreshCw, Trash2 } from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import ModalPlacaQR from '@/components/panel/ModalPlacaQR';
import type { DetalleHotel, EstadoPlaca, HabitacionAdmin } from '@/lib/admin/tipos';
import { HOTEL_VACIO } from '@/lib/mapeos';

import { useAdmin } from './SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, BOTON_SECUNDARIO, EstadoPastilla, INPUT } from './ui';

const ESTADOS: { valor: EstadoPlaca; texto: string }[] = [
  { valor: 'activa', texto: 'Activa' },
  { valor: 'en_stock', texto: 'En bodega' },
  { valor: 'danada', texto: 'Dañada' },
];

/**
 * "101-120, 201-220, PH1" → ["101", …, "120", "201", …, "220", "PH1"].
 * Los rangos son numéricos y de máximo 500 habitaciones.
 */
export function expandirNumeros(texto: string): { numeros: string[]; error: string | null } {
  const numeros: string[] = [];
  for (const parte of texto.split(/[\s,;]+/).filter(Boolean)) {
    const rango = /^(\d+)\s*-\s*(\d+)$/.exec(parte);
    if (rango) {
      const [desde, hasta] = [Number(rango[1]), Number(rango[2])];
      if (hasta < desde) return { numeros: [], error: `El rango ${parte} está al revés.` };
      if (hasta - desde >= 500) return { numeros: [], error: `El rango ${parte} es demasiado grande (máximo 500).` };
      for (let n = desde; n <= hasta; n++) numeros.push(String(n));
    } else {
      numeros.push(parte);
    }
  }
  return { numeros: [...new Set(numeros)], error: null };
}

/**
 * CSV para grabar las placas NFC en lote (NFC Tools Pro y similares):
 * columnas `habitacion,url_completa`, solo placas activas.
 */
function descargarCsvNfc(hotelNombre: string, habitaciones: HabitacionAdmin[]) {
  const celda = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = habitaciones
    .filter((h) => h.estado_placa === 'activa')
    .map((h) => `${celda(h.numero)},${celda(`${window.location.origin}/p/${encodeURIComponent(h.codigo_placa)}`)}`);
  const csv = ['habitacion,url_completa', ...filas].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `placas-nfc-${hotelNombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export default function PestanaHabitaciones({ detalle, onCambio }: { detalle: DetalleHotel; onCambio: () => Promise<void> }) {
  const { llamar } = useAdmin();
  const { confirmar, dialogo } = useConfirmacion();
  const [lista, setLista] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [placa, setPlaca] = useState<HabitacionAdmin | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { numeros, error: errorLista } = expandirNumeros(lista);
  const { habitaciones, hotel } = detalle;

  const ejecutar = async (id: string, accion: () => Promise<unknown>, exito?: string) => {
    setOcupado(id);
    setError(null);
    try {
      await accion();
      await onCambio();
      if (exito) setAviso(exito);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar.');
    } finally {
      setOcupado(null);
    }
  };

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    if (errorLista || numeros.length === 0) return;
    setAgregando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await llamar('crearHabitaciones', { hotel_id: hotel.id, numeros });
      await onCambio();
      setLista('');
      setAviso(
        `${r.creadas} ${r.creadas === 1 ? 'habitación creada' : 'habitaciones creadas'}, cada una con su placa.` +
          (r.repetidas.length ? ` Ya existían: ${r.repetidas.join(', ')}.` : ''),
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudieron crear.');
    } finally {
      setAgregando(false);
    }
  };

  const reemplazar = async (h: HabitacionAdmin) => {
    const ok = await confirmar({
      titulo: `¿Reemplazar la placa de la Hab. ${h.numero}?`,
      mensaje: 'Se genera un código nuevo: la placa anterior deja de funcionar de inmediato. Úsalo si la placa se perdió o la robaron, y luego imprime la nueva.',
      textoConfirmar: 'Reemplazar placa',
      tono: 'peligro',
    });
    if (ok === false) return;
    await ejecutar(h.id, () => llamar('reemplazarPlaca', { id: h.id }), `Hab. ${h.numero}: placa nueva generada. Imprímela y cámbiala en la puerta.`);
  };

  const eliminar = async (h: HabitacionAdmin) => {
    const ok = await confirmar({
      titulo: `¿Eliminar la Hab. ${h.numero}?`,
      mensaje: 'Solo se puede si nunca tuvo solicitudes. Si ya se usó, márcala como «En bodega».',
      textoConfirmar: 'Eliminar',
      tono: 'peligro',
    });
    if (ok === false) return;
    await ejecutar(h.id, () => llamar('eliminarHabitacion', { id: h.id }));
  };

  // ModalPlacaQR usa los tipos del panel: se le pasa lo que necesita para pintar la placa.
  const hotelPlaca = { ...HOTEL_VACIO, id: hotel.id, nombre: hotel.nombre, logo_url: hotel.logo_url };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={agregar} noValidate className="rounded-2xl border border-black/[0.06] bg-white p-6">
        <h2 className="text-[17px] font-bold">Agregar habitaciones</h2>
        <p className="mt-0.5 text-[14px] text-neutral-500">
          Escribe números sueltos o rangos separados por comas. Ej. <span className="font-mono text-neutral-700">101-120, 201-220, PH1</span>
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <input
            value={lista}
            onChange={(e) => {
              setLista(e.target.value);
              setAviso(null);
            }}
            placeholder="101-120, 201-220"
            aria-invalid={Boolean(errorLista)}
            className={`${INPUT} max-w-[420px] flex-1 font-mono`}
          />
          <button type="submit" disabled={agregando || numeros.length === 0 || Boolean(errorLista)} className={BOTON_PRIMARIO}>
            {agregando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Plus aria-hidden className="h-4 w-4" />}
            {numeros.length > 0 && !errorLista ? `Crear ${numeros.length}` : 'Crear'}
          </button>
        </div>
        {errorLista && <p className="mt-2 text-[13px] font-medium text-rose-600">{errorLista}</p>}
      </form>

      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {aviso && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
          {aviso}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4">
          <h2 className="text-[17px] font-bold">
            {habitaciones.length} {habitaciones.length === 1 ? 'habitación' : 'habitaciones'}
          </h2>
          {habitaciones.some((h) => h.estado_placa === 'activa') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => descargarCsvNfc(hotel.nombre, habitaciones)}
                title="Columnas habitacion,url_completa para grabar chips NFC en lote (NFC Tools Pro)"
                className={BOTON_SECUNDARIO}
              >
                <Download aria-hidden className="h-4 w-4" />
                Exportar CSV para NFC
              </button>
              <Link href={`/admin/hoteles/${hotel.id}/placas`} target="_blank" className={BOTON_SECUNDARIO}>
                <Printer aria-hidden className="h-4 w-4" />
                Imprimir todas las placas
              </Link>
            </div>
          )}
        </div>
        {habitaciones.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <BedDouble aria-hidden className="h-7 w-7 text-neutral-400" />
            <p className="mt-3 text-[15px] text-neutral-500">Agrega las habitaciones del hotel: cada una recibe su código de placa al instante.</p>
          </div>
        ) : (
          <table className="w-full text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-neutral-100 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                <th className="px-6 py-2.5 font-semibold">Habitación</th>
                <th className="px-3 py-2.5 font-semibold">Código de placa</th>
                <th className="px-3 py-2.5 font-semibold">Placa</th>
                <th className="px-3 py-2.5 font-semibold">Estadía</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {habitaciones.map((h) => (
                <tr key={h.id} className={ocupado === h.id ? 'opacity-50' : ''}>
                  <td className="px-6 py-2.5 text-[16px] font-bold">{h.numero}</td>
                  <td className="px-3 py-2.5 font-mono text-[13.5px] tracking-wider text-neutral-600">{h.codigo_placa}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={h.estado_placa}
                      disabled={ocupado !== null}
                      onChange={(e) => void ejecutar(h.id, () => llamar('editarHabitacion', { id: h.id, estado_placa: e.target.value as EstadoPlaca }))}
                      aria-label={`Estado de la placa de la Hab. ${h.numero}`}
                      className={`h-9 rounded-lg border px-2 text-[14px] font-medium outline-none focus:border-neutral-900 ${
                        h.estado_placa === 'activa' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-black/[0.1] bg-white text-neutral-700'
                      }`}
                    >
                      {ESTADOS.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.texto}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">{h.ocupada ? <EstadoPastilla tono="azul">Ocupada</EstadoPastilla> : <span className="text-[13.5px] text-neutral-400">Vacía</span>}</td>
                  <td className="px-6 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setPlaca(h)} title="Ver e imprimir la placa" aria-label={`Ver placa de la Hab. ${h.numero}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                        <QrCode aria-hidden className="h-[18px] w-[18px]" />
                      </button>
                      <button type="button" disabled={ocupado !== null} onClick={() => void reemplazar(h)} title="Reemplazar placa (perdida o robada)" aria-label={`Reemplazar placa de la Hab. ${h.numero}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                        <RefreshCw aria-hidden className="h-[17px] w-[17px]" />
                      </button>
                      <button type="button" disabled={ocupado !== null} onClick={() => void eliminar(h)} title="Eliminar habitación" aria-label={`Eliminar la Hab. ${h.numero}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 aria-hidden className="h-[17px] w-[17px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {placa && (
        <ModalPlacaQR
          hotel={hotelPlaca}
          habitacion={{ id: placa.id, numero: placa.numero, codigo_placa: placa.codigo_placa, estado_placa: placa.estado_placa, estadia_activa: null }}
          onCerrar={() => setPlaca(null)}
        />
      )}
      {dialogo}
    </div>
  );
}
