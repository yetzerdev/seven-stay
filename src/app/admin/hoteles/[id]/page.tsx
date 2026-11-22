'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronLeft, ExternalLink, Loader2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';

import FormularioHotelAdmin from '@/components/admin/FormularioHotelAdmin';
import PestanaHabitaciones from '@/components/admin/PestanaHabitaciones';
import PestanaUsuarios from '@/components/admin/PestanaUsuarios';
import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, EstadoPastilla } from '@/components/admin/ui';
import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import type { DetalleHotel } from '@/lib/admin/tipos';

type Pestana = 'datos' | 'habitaciones' | 'usuarios';

/** Ficha de un hotel: datos, habitaciones con sus placas y usuarios del panel. */
export default function HotelAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const pestana: Pestana = (['datos', 'habitaciones', 'usuarios'] as const).find((p) => p === params.get('pestana')) ?? 'datos';
  const { llamar } = useAdmin();
  const { confirmar, dialogo } = useConfirmacion();
  const [detalle, setDetalle] = useState<DetalleHotel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await llamar('hotel', { id }));
      setError(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el hotel.');
    }
  }, [llamar, id]);

  useEffect(() => {
    let vivo = true;
    llamar('hotel', { id }).then(
      (d) => vivo && setDetalle(d),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, id]);

  const irA = (p: Pestana) => router.replace(`/admin/hoteles/${id}?pestana=${p}`, { scroll: false });

  const eliminar = async () => {
    if (!detalle) return;
    const nombre = detalle.hotel.nombre;
    const escrito = await confirmar({
      titulo: `¿Eliminar ${nombre} para siempre?`,
      mensaje: (
        <>
          Se borran <strong>todas</strong> sus habitaciones y placas, solicitudes, menú, tours propios, reservas, pagos y los
          accesos al panel de su personal. <strong>No se puede deshacer.</strong> Si solo quieres pausarlo, usa «Suspender».
        </>
      ),
      textoConfirmar: 'Eliminar para siempre',
      tono: 'peligro',
      motivo: { etiqueta: `Escribe «${nombre}» para confirmar`, placeholder: nombre, obligatorio: true, debeCoincidir: nombre },
    });
    if (escrito === false) return;
    setCambiandoEstado(true);
    try {
      await llamar('eliminarHotel', { id, confirmacion: escrito });
      router.replace('/admin');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo eliminar el hotel.');
      setCambiandoEstado(false);
    }
  };

  const alternarEstado = async () => {
    if (!detalle) return;
    const suspender = detalle.hotel.estado === 'activo';
    const ok = await confirmar(
      suspender
        ? {
            titulo: `¿Suspender ${detalle.hotel.nombre}?`,
            mensaje: 'Sus placas mostrarán «Esta placa no está activa» y no entrarán solicitudes nuevas. El panel del hotel y su historial se conservan. Puedes reactivarlo cuando quieras.',
            textoConfirmar: 'Suspender hotel',
            tono: 'peligro',
          }
        : {
            titulo: `¿Reactivar ${detalle.hotel.nombre}?`,
            mensaje: 'Sus placas activas vuelven a funcionar de inmediato.',
            textoConfirmar: 'Reactivar',
          },
    );
    if (ok === false) return;
    setCambiandoEstado(true);
    try {
      await llamar('estadoHotel', { id, estado: suspender ? 'suspendido' : 'activo' });
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const volver = (
    <Link href="/admin" className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-lg px-2 text-[14.5px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
      <ChevronLeft aria-hidden className="h-4 w-4" />
      Hoteles
    </Link>
  );

  if (!detalle) {
    return (
      <main className="flex flex-col gap-5">
        {volver}
        <AvisoError mensaje={error} />
        {!error && (
          <div className="flex justify-center py-20">
            <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
          </div>
        )}
      </main>
    );
  }

  const { hotel, habitaciones, usuarios } = detalle;
  const pestanas: { valor: Pestana; texto: string; cuenta?: number }[] = [
    { valor: 'datos', texto: 'Datos del hotel' },
    { valor: 'habitaciones', texto: 'Habitaciones y placas', cuenta: habitaciones.length },
    { valor: 'usuarios', texto: 'Usuarios del panel', cuenta: usuarios.length },
  ];
  const primeraPlaca = habitaciones.find((h) => h.estado_placa === 'activa');

  return (
    <main className="flex flex-col gap-5">
      {volver}
      <header className="flex flex-wrap items-center gap-5">
        {hotel.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage
          <img src={hotel.logo_url} alt="" className="h-14 w-20 object-contain" />
        ) : (
          <span aria-hidden className="flex h-14 w-20 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
            <Building2 className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[28px] font-bold tracking-[-0.02em]">
            {hotel.nombre}
            {hotel.estado === 'suspendido' ? <EstadoPastilla tono="rojo">Suspendido</EstadoPastilla> : <EstadoPastilla tono="verde">Activo</EstadoPastilla>}
          </h1>
          <p className="mt-0.5 text-[14px] text-neutral-500">Alta: {new Date(hotel.creado_at).toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {primeraPlaca && (
            <a
              href={`/p/${encodeURIComponent(primeraPlaca.codigo_placa)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.1] bg-white px-4 text-[14.5px] font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              <ExternalLink aria-hidden className="h-4 w-4" />
              Ver portal (Hab. {primeraPlaca.numero})
            </a>
          )}
          <button
            type="button"
            disabled={cambiandoEstado}
            onClick={() => void alternarEstado()}
            className={`flex h-11 items-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-50 ${
              hotel.estado === 'activo' ? 'text-rose-600 hover:bg-rose-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {cambiandoEstado ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : hotel.estado === 'activo' ? (
              <PauseCircle aria-hidden className="h-4 w-4" />
            ) : (
              <PlayCircle aria-hidden className="h-4 w-4" />
            )}
            {hotel.estado === 'activo' ? 'Suspender' : 'Reactivar hotel'}
          </button>
          <button
            type="button"
            disabled={cambiandoEstado}
            onClick={() => void eliminar()}
            title="Eliminar el hotel y todos sus datos"
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Eliminar
          </button>
        </div>
      </header>

      <AvisoError mensaje={error} onCerrar={() => setError(null)} />

      <nav aria-label="Secciones del hotel" className="flex gap-1 border-b border-neutral-200">
        {pestanas.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => irA(p.valor)}
            aria-current={pestana === p.valor ? 'page' : undefined}
            className={`relative flex h-12 items-center gap-2 px-4 text-[15px] font-semibold ${pestana === p.valor ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-800'}`}
          >
            {p.texto}
            {p.cuenta !== undefined && <span className="rounded-full bg-neutral-100 px-2 py-px text-[12px] tabular-nums text-neutral-600">{p.cuenta}</span>}
            {pestana === p.valor && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-neutral-900" />}
          </button>
        ))}
      </nav>

      {pestana === 'datos' && (
        <section className="max-w-[900px] rounded-2xl border border-black/[0.06] bg-white p-6">
          {guardado && (
            <p role="status" className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">
              Datos guardados. El portal y el panel del hotel ya los muestran.
            </p>
          )}
          <FormularioHotelAdmin
            key={JSON.stringify(hotel)}
            hotelId={hotel.id}
            inicial={{
              nombre: hotel.nombre,
              logo_url: hotel.logo_url,
              telefono_recepcion: hotel.telefono_recepcion,
              wifi_ssid: hotel.wifi_ssid,
              wifi_password: hotel.wifi_password,
              moneda_default: hotel.moneda_default,
              zona_horaria: hotel.zona_horaria,
              hora_checkout: hotel.hora_checkout,
              modo_tours: hotel.modo_tours,
              whatsapp_reception: hotel.whatsapp_reception,
              rtn: hotel.rtn,
              plan_saas: hotel.plan_saas,
              gratis_hasta: hotel.gratis_hasta,
              direccion_fiscal: hotel.direccion_fiscal,
              tipo_placa: hotel.tipo_placa,
              habitaciones_contratadas: hotel.habitaciones_contratadas,
            }}
            textoGuardar="Guardar cambios"
            onGuardado={async () => {
              await cargar();
              setGuardado(true);
            }}
          />
        </section>
      )}
      {pestana === 'habitaciones' && <PestanaHabitaciones detalle={detalle} onCambio={cargar} />}
      {pestana === 'usuarios' && <PestanaUsuarios detalle={detalle} onCambio={cargar} />}
      {dialogo}
    </main>
  );
}
