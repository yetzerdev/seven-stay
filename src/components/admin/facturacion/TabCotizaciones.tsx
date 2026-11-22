'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, FileText, Loader2, Pencil, Plus, X } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, EstadoPastilla, INPUT } from '@/components/admin/ui';
import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import type { Cotizacion, DatosCotizacion, NuevaFactura } from '@/lib/admin/tipos';
import {
  categoriaPorHabitaciones,
  cotizarMensualidad,
  cotizarPlacas,
  lempiras,
  PLACAS,
  PLANES_SAAS,
  type PlanSaas,
  type TipoPlaca,
} from '@/lib/facturacion/tarifas';

import { fechaLarga } from './Documentos';

const ESTADOS = {
  borrador: { texto: 'Borrador', tono: 'gris' },
  enviada: { texto: 'Enviada', tono: 'azul' },
  aceptada: { texto: 'Aceptada', tono: 'verde' },
  convertida: { texto: 'Facturada', tono: 'verde' },
} as const;

const VACIA: DatosCotizacion = {
  hotel_id: null,
  cliente_nombre: '',
  cliente_rtn: '',
  ciudad: '',
  contacto: '',
  habitaciones: 20,
  tipo_placa: 'esencial',
  plan_saas: 'boutique',
  bonificacion_piloto: false,
  notas: '',
};

/** Resumen en vivo de lo que cuesta (pago único de placas y mensualidad). */
function Resumen({ c }: { c: DatosCotizacion }) {
  const placas = c.tipo_placa ? cotizarPlacas(c.tipo_placa, c.habitaciones || 1) : null;
  const saas = c.plan_saas ? cotizarMensualidad(c.plan_saas) : null;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[#F8F9FA] p-4 text-[13.5px]">
      {placas && c.tipo_placa && (
        <div>
          <p className="font-bold">Placas · {PLACAS[c.tipo_placa].nombre}</p>
          <p className="text-neutral-600">
            {c.habitaciones} × {lempiras(placas.unitario)} (+ ISV = {lempiras(placas.unitarioConIsv)} c/u)
          </p>
          <p className="tabular-nums">
            Subtotal {lempiras(placas.subtotal)} · ISV {lempiras(placas.isv)} · <strong>Total {lempiras(placas.total)}</strong>
          </p>
          <p className="text-neutral-600 tabular-nums">
            50% anticipo {lempiras(placas.anticipo)} · 50% contra entrega {lempiras(placas.saldo)}
          </p>
        </div>
      )}
      {saas && c.plan_saas && (
        <div>
          <p className="font-bold">Mensualidad · Plan {PLANES_SAAS[c.plan_saas].nombre}</p>
          <p className="tabular-nums">
            {lempiras(saas.subtotal)} + {lempiras(saas.isv)} ISV = <strong>{lempiras(saas.total)} / mes</strong>
          </p>
          {c.bonificacion_piloto && <p className="font-semibold text-emerald-700">Mes 1 bonificado: L. 0.00</p>}
        </div>
      )}
    </div>
  );
}

export default function TabCotizaciones({ onFacturar }: { onFacturar: (borrador: NuevaFactura) => void }) {
  const { llamar } = useAdmin();
  const { confirmar, dialogo } = useConfirmacion();
  const [lista, setLista] = useState<Cotizacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<DatosCotizacion>(VACIA);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await llamar('cotizaciones', null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar.');
    }
  }, [llamar]);

  useEffect(() => {
    let vivo = true;
    llamar('cotizaciones', null).then(
      (l) => vivo && setLista(l),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  const cambiar = <K extends keyof DatosCotizacion>(k: K, v: DatosCotizacion[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cambiarHabitaciones = (n: number) =>
    // La mensualidad sigue a las habitaciones (se puede cambiar a mano después).
    setForm((f) => ({ ...f, habitaciones: n, plan_saas: f.plan_saas ? categoriaPorHabitaciones(n) : null }));

  const abrir = (c?: Cotizacion) => {
    setEditando(c?.id ?? '');
    setForm(c ? { ...c } : VACIA);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (guardando || editando === null) return;
    setGuardando(true);
    setError(null);
    try {
      await llamar('guardarCotizacion', { ...form, ...(editando ? { id: editando } : {}) });
      await cargar();
      setEditando(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const convertir = async (c: Cotizacion) => {
    const darAlta = !c.hotel_id && !c.convertida_hotel_id;
    const ok = await confirmar({
      titulo: darAlta ? `¿Dar de alta «${c.cliente_nombre}» y facturar?` : '¿Convertir en factura?',
      mensaje: darAlta
        ? `Se crea el hotel con ${c.habitaciones} habitaciones contratadas${c.bonificacion_piloto ? ' y el mes 1 gratis' : ''}, y se abre la factura de anticipo lista para emitir. Las habitaciones y placas las agregas después en su ficha.`
        : 'Se abre la factura de anticipo con los datos de la cotización, lista para revisar y emitir.',
      textoConfirmar: darAlta ? 'Dar de alta y facturar' : 'Abrir factura',
    });
    if (ok === false) return;
    try {
      const r = await llamar('convertirCotizacion', { id: c.id, dar_alta: darAlta });
      await cargar();
      onFacturar(r.borrador);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo convertir.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-neutral-500">Proformas en Lempiras con las tarifas oficiales, para prospectos u hoteles.</p>
        <button type="button" onClick={() => abrir()} className={BOTON_PRIMARIO}>
          <Plus aria-hidden className="h-4 w-4" />
          Nueva cotización
        </button>
      </div>
      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
          {!lista ? (
            <div className="flex justify-center py-14">
              <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : lista.length === 0 ? (
            <p className="px-6 py-14 text-center text-[15px] text-neutral-500">Todavía no hay cotizaciones.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {lista.map((c) => (
                <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 ${editando === c.id ? 'bg-neutral-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.cliente_nombre}
                      <EstadoPastilla tono={ESTADOS[c.estado].tono}>{ESTADOS[c.estado].texto}</EstadoPastilla>
                    </p>
                    <p className="text-[13px] text-neutral-500">
                      <span className="font-mono">{c.numero}</span> · {fechaLarga(c.creado_at)} · {c.habitaciones} hab.
                      {c.ciudad ? ` · ${c.ciudad}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/admin/facturacion/cotizacion/${c.id}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-neutral-700 hover:bg-neutral-100">
                      <FileText aria-hidden className="h-4 w-4" />
                      PDF
                    </Link>
                    <button type="button" onClick={() => void convertir(c)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-emerald-700 hover:bg-emerald-50">
                      <ArrowRightLeft aria-hidden className="h-4 w-4" />
                      Facturar
                    </button>
                    <button type="button" onClick={() => abrir(c)} aria-label={`Editar ${c.numero}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                      <Pencil aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editando !== null && (
          <form onSubmit={guardar} noValidate className="flex flex-col gap-4 rounded-2xl border border-black/[0.06] bg-white p-6 xl:sticky xl:top-[88px]">
            <div className="flex items-start justify-between">
              <h2 className="text-[19px] font-bold">{editando ? 'Editar cotización' : 'Nueva cotización'}</h2>
              <button type="button" onClick={() => setEditando(null)} aria-label="Cerrar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <Campo etiqueta="Hotel / Razón social">
              <input value={form.cliente_nombre} maxLength={120} onChange={(e) => cambiar('cliente_nombre', e.target.value)} className={INPUT} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="RTN (opcional)">
                <input value={form.cliente_rtn} maxLength={14} onChange={(e) => cambiar('cliente_rtn', e.target.value.toUpperCase())} className={`${INPUT} font-mono`} />
              </Campo>
              <Campo etiqueta="Ciudad">
                <input value={form.ciudad} maxLength={80} onChange={(e) => cambiar('ciudad', e.target.value)} className={INPUT} />
              </Campo>
              <Campo etiqueta="Contacto">
                <input value={form.contacto} maxLength={120} onChange={(e) => cambiar('contacto', e.target.value)} className={INPUT} />
              </Campo>
              <Campo etiqueta="Habitaciones">
                <input
                  inputMode="numeric"
                  value={form.habitaciones || ''}
                  onChange={(e) => cambiarHabitaciones(Math.max(0, Math.trunc(Number(e.target.value.replace(/\D/g, '')) || 0)))}
                  className={`${INPUT} tabular-nums`}
                />
              </Campo>
            </div>
            <Campo etiqueta="Placas (pago único)">
              <select value={form.tipo_placa ?? ''} onChange={(e) => cambiar('tipo_placa', (e.target.value || null) as TipoPlaca | null)} className={INPUT}>
                <option value="">Sin placas</option>
                {(Object.keys(PLACAS) as TipoPlaca[]).map((t) => (
                  <option key={t} value={t}>
                    {PLACAS[t].nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Mensualidad SaaS">
              <select value={form.plan_saas ?? ''} onChange={(e) => cambiar('plan_saas', (e.target.value || null) as PlanSaas | null)} className={INPUT}>
                <option value="">Sin mensualidad</option>
                {(Object.keys(PLANES_SAAS) as PlanSaas[]).map((p) => (
                  <option key={p} value={p}>
                    {PLANES_SAAS[p].nombre} ({PLANES_SAAS[p].rango}) · {lempiras(PLANES_SAAS[p].mensual)} + ISV
                  </option>
                ))}
              </select>
            </Campo>
            <label className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-4 py-3">
              <input type="checkbox" checked={form.bonificacion_piloto} onChange={(e) => cambiar('bonificacion_piloto', e.target.checked)} className="h-5 w-5 accent-neutral-900" />
              <span className="text-[15px]">Incluir Bonificación Piloto (Mes 1 SaaS L. 0.00)</span>
            </label>
            <Campo etiqueta="Notas (opcional)">
              <textarea rows={2} maxLength={600} value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} className={`${INPUT} h-auto resize-none py-2.5`} />
            </Campo>
            <Resumen c={form} />
            <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
              {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar cotización'}
            </button>
          </form>
        )}
      </div>
      {dialogo}
    </div>
  );
}
