'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  ChevronLeft,
  Hourglass,
  Inbox,
  LogOut,
  Moon,
  SearchX,
  ShieldCheck,
  Siren,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { useConfirmacion } from '@/components/panel/DialogoConfirmacion';
import { AccionesTicket, CATEGORIAS_PANEL, esDelHotel, ESTADOS_PANEL, partesPedido, puestoDe, useFotoTicket, VisorFoto } from '@/components/panel/ticketPanel';
import { useAhora } from '@/components/portal/AlertaSolicitudActiva';
import { formato12h, tiempoRelativo } from '@/components/portal/etiquetasTicket';
import { ticketFinalizado, useStay } from '@/context/StayContext';
import type { ActorEvento, TipoEventoTicket } from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Textos de la trazabilidad
// ---------------------------------------------------------------------------

const EVENTOS: Record<TipoEventoTicket, { titulo: string; icono: LucideIcon; color: string }> = {
  creado: { titulo: 'Solicitud creada', icono: Inbox, color: 'bg-neutral-900 text-white' },
  pendiente_validacion: { titulo: 'Habitación por validar', icono: Hourglass, color: 'bg-amber-100 text-amber-700' },
  validacion_aprobada: { titulo: 'Check-in confirmado', icono: ShieldCheck, color: 'bg-emerald-100 text-emerald-700' },
  validacion_rechazada: { titulo: 'Rechazada', icono: Ban, color: 'bg-neutral-200 text-neutral-600' },
  aceptado: { titulo: 'Asignada', icono: UserCheck, color: 'bg-sky-100 text-sky-700' },
  escalado: { titulo: 'Escalada', icono: Siren, color: 'bg-rose-100 text-rose-700' },
  resuelto: { titulo: 'Resuelta', icono: CheckCircle2, color: 'bg-emerald-600 text-white' },
  rechazado: { titulo: 'Rechazada por recepción', icono: XCircle, color: 'bg-neutral-200 text-neutral-600' },
  cancelado: { titulo: 'Cancelada por el huésped', icono: XCircle, color: 'bg-neutral-200 text-neutral-600' },
  programado: { titulo: 'Programada (horario de silencio)', icono: Moon, color: 'bg-indigo-100 text-indigo-700' },
  liberado: { titulo: 'Lista para atender', icono: Inbox, color: 'bg-amber-100 text-amber-700' },
  cerrado_por_checkout: { titulo: 'Cerrada por check-out', icono: LogOut, color: 'bg-neutral-200 text-neutral-600' },
  movido_habitacion: { titulo: 'Cambio de habitación', icono: ArrowRightLeft, color: 'bg-violet-100 text-violet-700' },
};

/** Por si llega un evento que esta versión del panel aún no conoce. */
const EVENTO_DESCONOCIDO = { titulo: 'Actualización', icono: Inbox, color: 'bg-neutral-200 text-neutral-600' };

const ACTORES: Record<ActorEvento, string> = {
  huesped: 'Huésped',
  recepcion: 'Recepción',
  sistema: 'Sistema',
};

/** "18 nov · 9:42 PM" */
function fechaHora(iso: string): string {
  const f = new Date(iso);
  const dia = f.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${dia} · ${formato12h(`${f.getHours()}:${f.getMinutes()}`)}`;
}

/** Duración legible entre dos instantes: "4 min", "1 h 12 min". */
function duracion(desde: string, hasta: string | number): string {
  const ms = (typeof hasta === 'number' ? hasta : Date.parse(hasta)) - Date.parse(desde);
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function DetalleSolicitudPage() {
  const { id } = useParams<{ id: string }>();
  const { tickets, personal, escalarTicket, rechazarTicket } = useStay();
  const ahora = useAhora();
  const [fotoAbierta, setFotoAbierta] = useState(false);
  const { confirmar, dialogo } = useConfirmacion();

  // Los tours de Seven Stay no se gestionan desde el panel del hotel (los propios sí).
  const ticket = tickets.find((t) => t.id === decodeURIComponent(id ?? '') && esDelHotel(t));
  const foto = useFotoTicket(ticket);

  const volver = (
    <Link href="/panel" className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-lg pl-1 pr-3 text-[15px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
      <ChevronLeft aria-hidden className="h-5 w-5" />
      Centro de Control
    </Link>
  );

  if (!ticket) {
    return (
      <main className="flex flex-1 flex-col gap-5">
        {volver}
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-20 text-center">
          <SearchX aria-hidden className="h-8 w-8 text-neutral-400" />
          <p className="mt-4 text-[18px] font-semibold text-neutral-900">No encontramos esta solicitud</p>
          <p className="mt-1 text-[15px] text-neutral-500">Puede que el enlace sea incorrecto o que la solicitud ya no exista.</p>
        </div>
      </main>
    );
  }

  const finalizado = ticketFinalizado(ticket);
  const categoria = CATEGORIAS_PANEL[ticket.categoria];
  const estado = ESTADOS_PANEL[ticket.estado];
  const historial = [...(ticket.historial ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const otras = tickets
    .filter((t) => t.id !== ticket.id && esDelHotel(t) && t.habitacion_numero === ticket.habitacion_numero)
    .sort((a, b) => b.creado_at.localeCompare(a.creado_at))
    .slice(0, 5);

  const puedeEscalar = !finalizado && !ticket.en_alerta_servicio;
  const escalar = async () => {
    const motivo = await confirmar({
      titulo: `¿Escalar la solicitud #${ticket.codigo_corto} a supervisor?`,
      mensaje: 'Se marcará como prioritaria (ESCALADO) y pasará al primer lugar del tablero. Queda registrado en la trazabilidad.',
      textoConfirmar: 'Escalar a supervisor',
      tono: 'peligro',
      motivo: { etiqueta: 'Motivo', placeholder: 'Ej. El huésped llamó molesto, falla repetida…' },
    });
    if (motivo !== false) escalarTicket(ticket.id, { actor: 'recepcion', motivo });
  };

  const rechazar = async () => {
    const motivo = await confirmar({
      titulo: `¿Rechazar la solicitud #${ticket.codigo_corto}?`,
      mensaje: 'Úsalo para spam, duplicados o pedidos que no proceden. El huésped la verá como no aprobada y queda registrado en la trazabilidad.',
      textoConfirmar: 'Rechazar solicitud',
      tono: 'peligro',
      motivo: { etiqueta: 'Motivo', placeholder: 'Ej. Duplicada de la #412, pedido de prueba…' },
    });
    if (motivo !== false) rechazarTicket(ticket.id, motivo || undefined);
  };

  const tiempos = [
    {
      etiqueta: 'Hasta asignar',
      valor: ticket.aceptado_at ? duracion(ticket.creado_at, ticket.aceptado_at) : finalizado ? '—' : `${duracion(ticket.creado_at, ahora)} esperando`,
    },
    {
      etiqueta: 'Atención',
      valor: ticket.aceptado_at
        ? ticket.resuelto_at
          ? duracion(ticket.aceptado_at, ticket.resuelto_at)
          : `${duracion(ticket.aceptado_at, ahora)} en curso`
        : '—',
    },
    {
      etiqueta: 'Total',
      valor: ticket.resuelto_at ? duracion(ticket.creado_at, ticket.resuelto_at) : finalizado ? '—' : `${duracion(ticket.creado_at, ahora)} abierto`,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-5">
      {volver}

      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-white px-6 py-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.02em] text-neutral-900">Hab. {ticket.habitacion_numero}</h1>
          <span className="text-[17px] font-semibold tabular-nums text-neutral-400">#{ticket.codigo_corto}</span>
          <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-neutral-700">
            <span aria-hidden className={`h-2 w-2 rounded-full ${categoria.punto}`} />
            {categoria.texto}
          </span>
          <span className={`rounded-lg border px-2.5 py-1 text-[13.5px] font-semibold ${estado.clase}`}>{estado.texto}</span>
          {ticket.en_alerta_servicio && !finalizado && (
            <span className="rounded-md bg-rose-600 px-2 py-1 text-[12.5px] font-bold tracking-wide text-white">ESCALADO</span>
          )}
          {ticket.urgente && !ticket.en_alerta_servicio && !finalizado && (
            <span className="rounded-md bg-rose-100 px-2 py-1 text-[12.5px] font-bold tracking-wide text-rose-700">URGENTE</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeEscalar && (
            <button
              type="button"
              onClick={escalar}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 text-[15px] font-semibold text-rose-700 hover:bg-rose-50"
            >
              <Siren aria-hidden className="h-4 w-4" />
              Escalar a supervisor
            </button>
          )}
          {!finalizado && (
            <button
              type="button"
              onClick={rechazar}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-black/[0.1] bg-white px-4 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <XCircle aria-hidden className="h-4 w-4" />
              Rechazar solicitud
            </button>
          )}
          <AccionesTicket ticket={ticket} ahora={ahora} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-5">
          {/* Pedido */}
          <section aria-labelledby="titulo-pedido" className="rounded-2xl border border-black/[0.06] bg-white p-6">
            <h2 id="titulo-pedido" className="text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
              Pedido
            </h2>
            <ul className="mt-3 space-y-1.5 text-[18px] font-semibold text-neutral-900">
              {partesPedido(ticket).map((parte) => (
                <li key={parte}>{parte}</li>
              ))}
            </ul>
            {ticket.nota && (
              <blockquote className="mt-4 rounded-xl border-l-4 border-neutral-300 bg-neutral-50 px-4 py-3 text-[16px] italic leading-relaxed text-neutral-700">
                “{ticket.nota}”
              </blockquote>
            )}
            {foto && (
              <button
                type="button"
                onClick={() => setFotoAbierta(true)}
                aria-label="Ampliar foto adjunta"
                className="mt-4 block h-40 w-40 overflow-hidden rounded-xl border border-black/[0.06] hover:ring-2 hover:ring-neutral-900/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Supabase Storage */}
                <img src={foto} alt="" className="h-full w-full object-cover" />
              </button>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-100 pt-4 text-[15px] sm:grid-cols-3">
              <div>
                <dt className="text-neutral-500">Idioma del huésped</dt>
                <dd className="font-semibold text-neutral-900">{ticket.idioma_huesped === 'es' ? 'Español' : 'Inglés'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Creada</dt>
                <dd className="font-semibold text-neutral-900">{fechaHora(ticket.creado_at)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Responsable</dt>
                <dd className="font-semibold text-neutral-900">
                  {ticket.asignado_a_nombre ?? '—'}
                  {puestoDe(personal, ticket.asignado_a_nombre) && (
                    <span className="block text-[13.5px] font-normal text-neutral-500">{puestoDe(personal, ticket.asignado_a_nombre)}</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Tiempos */}
          <section aria-label="Tiempos de respuesta" className="grid grid-cols-3 gap-3">
            {tiempos.map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
                <p className="text-[14px] text-neutral-500">{etiqueta}</p>
                <p className="mt-1 text-[19px] font-bold tabular-nums text-neutral-900">{valor}</p>
              </div>
            ))}
          </section>

          {/* Otras solicitudes de la habitación */}
          {otras.length > 0 && (
            <section aria-labelledby="titulo-otras" className="rounded-2xl border border-black/[0.06] bg-white">
              <h2 id="titulo-otras" className="border-b border-neutral-100 px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
                Otras solicitudes de la Hab. {ticket.habitacion_numero}
              </h2>
              <ul className="divide-y divide-neutral-100">
                {otras.map((t) => (
                  <li key={t.id}>
                    <Link href={`/panel/solicitudes/${t.id}`} className="flex items-center gap-3 px-6 py-3 text-[15px] hover:bg-neutral-50">
                      <span className="tabular-nums text-neutral-400">#{t.codigo_corto}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{partesPedido(t).join(' · ')}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[12.5px] font-semibold ${ESTADOS_PANEL[t.estado].clase}`}>
                        {ESTADOS_PANEL[t.estado].texto}
                      </span>
                      <span className="w-24 text-right text-[13.5px] tabular-nums text-neutral-400">{tiempoRelativo(t.creado_at, ahora, 'es')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Trazabilidad */}
        <section aria-labelledby="titulo-traza" className="rounded-2xl border border-black/[0.06] bg-white p-6 lg:sticky lg:top-[104px]">
          <h2 id="titulo-traza" className="text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
            Trazabilidad
          </h2>
          <ol className="mt-5">
            {historial.map((evento, i) => {
              const { titulo, icono: Icono, color } = EVENTOS[evento.tipo] ?? EVENTO_DESCONOCIDO;
              const ultimo = i === historial.length - 1;
              return (
                <li key={`${evento.tipo}-${evento.fecha}-${i}`} className="relative flex gap-4">
                  {!ultimo && <span aria-hidden className="absolute bottom-0 left-[17px] top-10 w-px bg-neutral-200" />}
                  <span aria-hidden className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color}`}>
                    <Icono className="h-[18px] w-[18px]" />
                  </span>
                  <div className={`min-w-0 flex-1 ${ultimo ? '' : 'pb-6'}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[16px] font-semibold text-neutral-900">
                        {evento.tipo === 'escalado' ? (evento.actor === 'recepcion' ? 'Escalada a supervisor' : 'Escalada a Gerencia (huésped)') : titulo}
                      </p>
                      <time dateTime={evento.fecha} className="text-[13.5px] tabular-nums text-neutral-500">
                        {fechaHora(evento.fecha)}
                      </time>
                    </div>
                    {evento.detalle && <p className="mt-0.5 text-[15px] text-neutral-600">{evento.detalle}</p>}
                    <p className="mt-1 text-[13px] text-neutral-400">
                      {ACTORES[evento.actor]} · {tiempoRelativo(evento.fecha, ahora, 'es')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {!finalizado && (
            <p className="mt-5 rounded-xl bg-[#F8F9FA] px-4 py-3 text-[14px] text-neutral-500">
              Cada acción sobre esta solicitud queda registrada aquí con su hora y responsable.
            </p>
          )}
        </section>
      </div>

      {fotoAbierta && foto && <VisorFoto src={foto} onCerrar={() => setFotoAbierta(false)} />}
      {dialogo}
    </main>
  );
}
