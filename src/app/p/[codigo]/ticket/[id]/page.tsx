'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, BellRing, Check, ChevronLeft, ExternalLink, MessageCircle, SearchX, ShieldCheck, X } from 'lucide-react';

import FilaTicket from '@/components/portal/FilaTicket';
import { LogoGoogle, LogoTripadvisor } from '@/components/portal/LogosResenas';
import { useMarcarVisto } from '@/components/portal/ticketsVistos';
import TarjetaAvisos from '@/components/pwa/TarjetaAvisos';
import { enlaceAgenteSevenStay } from '@/config/sevenStay';
import { ticketFinalizado, useStay } from '@/context/StayContext';
import { useUrlFoto } from '@/lib/fotos';
import { clientePortal, supabaseConfigurado } from '@/lib/supabase';
import type { Idioma, Ticket } from '@/types/sevenstay';

import {
  formato12h,
  formatoPrecio,
  horaDeFecha,
  etiquetaSubcategoria,
  ITEMS_HOUSEKEEPING,
  tiempoRelativo,
  TITULOS_CATEGORIA,
} from '@/components/portal/etiquetasTicket';

// ---------------------------------------------------------------------------
// Constantes de diseño y textos
// ---------------------------------------------------------------------------

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-2xl border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';
const TOQUE = `transition-transform duration-300 ${EASE} active:scale-[0.98]`;
/** Minutos sin resolver a partir de los cuales se ofrece escalar a Gerencia. */
const MINUTOS_DEMORA = 15;

const TEXTOS = {
  es: {
    inicio: 'Inicio',
    ticket: 'Ticket',
    limpiezaInmediata: 'Limpieza de habitación ahora',
    noMolestar: 'No Molestar activado',
    fotoAdjunta: 'Foto adjunta',
    voucher: 'Código de referencia',
    voucherDetalle: 'Muéstralo al guía el día del tour.',
    propioTitulo: 'Pago en recepción',
    propioTexto: 'Recepción confirmará la disponibilidad contigo. El tour se paga en recepción; muestra tu código de referencia.',
    agenteTitulo: 'Confirma y paga con Seven Stay',
    agenteTexto: 'El Agente Oficial de Seven Stay confirma la disponibilidad, cobra en línea y te envía tu voucher.',
    agenteBoton: 'Completar pago con Agente Seven Stay',
    agenteMensaje: (tour: string, personas: number, hab: string, hotel: string, codigo: string) =>
      `Hola, quiero reservar "${tour}" para ${personas} ${personas === 1 ? 'persona' : 'personas'}. Hab. ${hab} · ${hotel}. Código: ${codigo}`,
    voucherDetallePedido: 'Tenlo a mano al recibir tu pedido.',
    personas: (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`,
    total: 'Total estimado',
    progreso: 'Progreso de tu solicitud',
    paso1: 'Solicitud recibida',
    paso1Hace: (hace: string) => `Enviada ${hace}`,
    validando: 'Verificando registro de habitación con recepción...',
    programado: (hora: string) => `Programado para entrega a las ${hora} (horario nocturno)`,
    paso2: 'En proceso / En camino',
    paso2Espera: 'Esperando que el personal tome tu solicitud',
    atendidoPor: (nombre: string) => `Atendido por ${nombre}`,
    atendidoEquipo: 'Nuestro equipo ya está en ello',
    paso3: 'Completado',
    paso3Hecho: (hora: string) => `Resuelto a las ${hora}`,
    paso3Pendiente: 'Te avisaremos aquí al terminar',
    rechazado: 'Solicitud no aprobada por recepción',
    rechazadoDetalle: 'Si crees que es un error, llama a recepción.',
    cancelado: 'Solicitud cancelada',
    canceladoDetalle: 'La cancelaste antes de que el personal la tomara.',
    cancelar: 'Cancelar solicitud',
    cancelarPregunta: '¿Cancelar esta solicitud?',
    cancelarSi: 'Sí, cancelar',
    cancelarNo: 'No',
    demoraTitulo: '¿Tu solicitud está tardando?',
    demoraTexto: (min: number) => `Lleva más de ${min} minutos sin resolverse. Podemos avisar a Gerencia para darle prioridad.`,
    notificar: 'Notificar demora a Gerencia',
    notificado: 'Gerencia ha sido notificada y dará prioridad a tu solicitud.',
    resenaTitulo: (hotel: string) => `¿Cómo fue tu experiencia en ${hotel}?`,
    resenaTexto: 'Tu opinión ayuda a otros viajeros y al equipo del hotel.',
    volverInicio: 'Volver al inicio de la habitación',
    otras: 'Mis otras solicitudes',
    noEncontradoTitulo: 'No encontramos esta solicitud',
    noEncontradoTexto: 'Puede que el enlace sea incorrecto o que la solicitud ya no esté disponible.',
  },
  en: {
    inicio: 'Home',
    ticket: 'Ticket',
    limpiezaInmediata: 'Room cleaning now',
    noMolestar: 'Do Not Disturb enabled',
    fotoAdjunta: 'Attached photo',
    voucher: 'Reference code',
    voucherDetalle: 'Show it to your guide on the day of the tour.',
    propioTitulo: 'Pay at the front desk',
    propioTexto: 'The front desk will confirm availability with you. The tour is paid at the front desk; show your reference code.',
    agenteTitulo: 'Confirm and pay with Seven Stay',
    agenteTexto: 'The Official Seven Stay Agent confirms availability, takes secure online payment, and sends your voucher.',
    agenteBoton: 'Complete payment with Seven Stay Agent',
    agenteMensaje: (tour: string, personas: number, hab: string, hotel: string, codigo: string) =>
      `Hi, I'd like to book "${tour}" for ${personas} ${personas === 1 ? 'guest' : 'guests'}. Room ${hab} · ${hotel}. Code: ${codigo}`,
    voucherDetallePedido: 'Keep it handy when your order arrives.',
    personas: (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`,
    total: 'Estimated total',
    progreso: 'Request progress',
    paso1: 'Request received',
    paso1Hace: (hace: string) => `Sent ${hace}`,
    validando: 'Verifying room check-in with front desk...',
    programado: (hora: string) => `Scheduled for ${hora} delivery (quiet hours)`,
    paso2: 'In progress / On the way',
    paso2Espera: 'Waiting for staff to pick up your request',
    atendidoPor: (nombre: string) => `Handled by ${nombre}`,
    atendidoEquipo: 'Our team is on it',
    paso3: 'Resolved',
    paso3Hecho: (hora: string) => `Resolved at ${hora}`,
    paso3Pendiente: "We'll update you here when it's done",
    rechazado: 'Request not approved by the front desk',
    rechazadoDetalle: 'If you think this is a mistake, please call the front desk.',
    cancelado: 'Request canceled',
    canceladoDetalle: 'You canceled it before staff picked it up.',
    cancelar: 'Cancel request',
    cancelarPregunta: 'Cancel this request?',
    cancelarSi: 'Yes, cancel',
    cancelarNo: 'No',
    demoraTitulo: 'Is your request taking too long?',
    demoraTexto: (min: number) => `It has been more than ${min} minutes. We can notify Management to prioritize it.`,
    notificar: 'Notify Management of Delay',
    notificado: 'Management has been notified and will prioritize your request.',
    resenaTitulo: (hotel: string) => `How was your stay at ${hotel}?`,
    resenaTexto: 'Your feedback helps other travelers and the hotel team.',
    volverInicio: 'Back to room home',
    otras: 'My other requests',
    noEncontradoTitulo: "We couldn't find this request",
    noEncontradoTexto: 'The link may be wrong or the request is no longer available.',
  },
} as const;

type Textos = (typeof TEXTOS)[Idioma];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Hora actual (ms) que se refresca cada 30 s. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);
  return ahora;
}

/** Líneas legibles de lo que pidió el huésped. */
function lineasDetalle(ticket: Ticket, idioma: Idioma, t: Textos): string[] {
  switch (ticket.categoria) {
    case 'housekeeping': {
      const d = ticket.detalle_housekeeping;
      const lineas = (d?.items ?? []).map(({ item, cantidad }) => `${cantidad}x ${ITEMS_HOUSEKEEPING[item][idioma]}`);
      if (d?.limpieza_inmediata) lineas.push(t.limpiezaInmediata);
      if (d?.no_molestar) lineas.push(t.noMolestar);
      return lineas;
    }
    case 'mantenimiento':
      return [etiquetaSubcategoria(ticket.detalle_mantenimiento?.subcategoria, idioma)];
    case 'tour': {
      const c = ticket.detalle_catalogo;
      if (!c) return [];
      return [c.titulo, t.personas(c.cantidad), `${t.total}: ${formatoPrecio(c.precio * c.cantidad, c.moneda)}`];
    }
    case 'room_service': {
      const c = ticket.detalle_catalogo;
      if (!c) return [];
      return [`${c.cantidad}x ${c.titulo}`, `${t.total}: ${formatoPrecio(c.precio * c.cantidad, c.moneda)}`];
    }
  }
}

// ---------------------------------------------------------------------------
// Línea de tiempo
// ---------------------------------------------------------------------------

type EstadoPaso = 'hecho' | 'activo' | 'pendiente' | 'error';

function Paso({
  estado,
  titulo,
  detalle,
  ultimo = false,
  siguienteAlcanzado = false,
}: {
  estado: EstadoPaso;
  titulo: string;
  detalle?: ReactNode;
  ultimo?: boolean;
  siguienteAlcanzado?: boolean;
}) {
  const circulo = {
    hecho: 'bg-emerald-600 text-white',
    activo: 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500',
    pendiente: 'bg-neutral-100 text-neutral-300',
    error: 'bg-rose-500 text-white',
  }[estado];

  return (
    <li className="relative flex gap-3.5">
      {/* Línea que une con el siguiente paso */}
      {!ultimo && (
        <span
          aria-hidden
          className={`absolute left-[13px] top-8 bottom-0 w-0.5 rounded-full transition-colors duration-700 ${
            siguienteAlcanzado ? 'bg-emerald-500' : 'bg-neutral-200'
          }`}
        />
      )}
      <span
        aria-hidden
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${circulo}`}
      >
        {estado === 'hecho' && <Check className="h-4 w-4" strokeWidth={3} />}
        {estado === 'error' && <X className="h-4 w-4" strokeWidth={3} />}
        {estado === 'activo' && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}
        {estado === 'pendiente' && <span className="h-2 w-2 rounded-full bg-neutral-300" />}
      </span>
      <div className={`min-w-0 flex-1 ${ultimo ? '' : 'pb-6'}`}>
        <p
          className={`pt-0.5 text-[15px] font-semibold leading-snug ${
            estado === 'pendiente' ? 'text-neutral-400' : estado === 'error' ? 'text-rose-600' : 'text-neutral-900'
          }`}
        >
          {titulo}
        </p>
        {detalle && <div className="mt-0.5 text-[13px] leading-snug text-neutral-500">{detalle}</div>}
      </div>
    </li>
  );
}

/** Foto privada de Storage (URL firmada temporal). */
function FotoAdjunta({ ruta, alt }: { ruta: string; alt: string }) {
  const url = useUrlFoto(supabaseConfigurado ? clientePortal() : null, ruta);
  if (!url) return <span aria-hidden className="mt-3 block h-28 w-28 animate-pulse rounded-xl bg-neutral-200/70" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Supabase Storage
  return <img src={url} alt={alt} className="mt-3 h-28 w-28 rounded-xl border border-black/[0.05] object-cover" />;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function SeguimientoTicketPage() {
  const { codigo, id } = useParams<{ codigo: string; id: string }>();
  const { hotel, habitaciones, tickets, misTicketIds, idioma, hidratado, escalarTicket, cancelarTicket } = useStay();
  const ahora = useAhora();
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  // Solo se muestran tickets de esta habitación (aunque alguien tenga el id de otra).
  const ticket = habitacion
    ? tickets.find((tk) => tk.id === decodeURIComponent(id ?? '') && tk.habitacion_numero === habitacion.numero)
    : undefined;
  // Abrir una solicitud terminada apaga su aviso en el inicio.
  useMarcarVisto(ticket);

  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva
  // Los tickets creados por el huésped viven en el navegador: se espera a leerlos.
  if (!hidratado) return null;

  const base = `/p/${encodeURIComponent(codigo)}`;

  const enlaceVolver = (
    <Link
      href={base}
      className={`-ml-2 -mt-4 flex h-12 w-fit items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-medium text-neutral-600 ${TOQUE}`}
    >
      <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.25} />
      {t.inicio}
    </Link>
  );

  const botonVolverInicio = (
    <Link
      href={base}
      className={`flex h-[48px] w-full items-center justify-center rounded-full border border-neutral-200/60 bg-white text-[15px] font-semibold text-neutral-900 shadow-[0_1px_2px_rgba(17,24,39,0.04)] ${TOQUE}`}
    >
      {t.volverInicio}
    </Link>
  );

  if (!ticket) {
    return (
      <main className="flex flex-1 flex-col gap-3.5">
        {enlaceVolver}
        <div className={`${TARJETA} flex flex-col items-center px-6 py-10 text-center`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100">
            <SearchX aria-hidden className="h-6 w-6 text-neutral-500" strokeWidth={1.9} />
          </span>
          <h1 className="mt-5 text-[19px] font-semibold text-neutral-900">{t.noEncontradoTitulo}</h1>
          <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-neutral-500">{t.noEncontradoTexto}</p>
        </div>
        {botonVolverInicio}
      </main>
    );
  }

  const { estado } = ticket;
  // Otras solicitudes de este teléfono para esta habitación: en curso primero, luego las más recientes.
  const otros = tickets
    .filter((tk) => tk.id !== ticket.id && misTicketIds.includes(tk.id) && tk.habitacion_numero === habitacion.numero)
    .sort(
      (a, b) =>
        Number(ticketFinalizado(a)) - Number(ticketFinalizado(b)) || b.creado_at.localeCompare(a.creado_at),
    );
  const resuelto = estado === 'resuelto';
  // Enlace de reseñas del hotel; si aún no lo cargó, se busca el hotel en esa plataforma.
  const buscar = encodeURIComponent(hotel.nombre);
  const plataformasResena = [
    { nombre: 'Google', href: hotel.google_review_url.trim() || `https://www.google.com/search?q=${buscar}+reviews`, Logo: LogoGoogle },
    { nombre: 'Tripadvisor', href: hotel.tripadvisor_url.trim() || `https://www.tripadvisor.com/Search?q=${buscar}`, Logo: LogoTripadvisor },
  ];
  const rechazado = estado === 'rechazado';
  const cancelado = estado === 'cancelado';
  const finalizado = ticketFinalizado(ticket);
  const lineas = lineasDetalle(ticket, idioma, t);
  const minutosAbierto = (ahora - Date.parse(ticket.creado_at)) / 60_000;
  const mostrarEscalar = !finalizado && !ticket.en_alerta_servicio && minutosAbierto > MINUTOS_DEMORA;

  // Estados de los 3 pasos
  const paso2: EstadoPaso = resuelto ? 'hecho' : estado === 'aceptado' ? 'activo' : 'pendiente';
  const paso3: EstadoPaso = resuelto ? 'hecho' : rechazado || cancelado ? 'error' : 'pendiente';

  const detallePaso1 = (
    <>
      <span>{t.paso1Hace(tiempoRelativo(ticket.creado_at, ahora, idioma))}</span>
      {estado === 'pendiente_validacion_hab' && <span className="mt-1 block text-amber-700">{t.validando}</span>}
      {estado === 'pospuesto_silencio' && (
        <span className="mt-1 block text-indigo-700">{t.programado(formato12h(hotel.hora_silencio_fin))}</span>
      )}
    </>
  );
  const detallePaso2 =
    estado === 'aceptado' || resuelto
      ? ticket.asignado_a_nombre
        ? t.atendidoPor(ticket.asignado_a_nombre)
        : t.atendidoEquipo
      : finalizado
        ? undefined
        : t.paso2Espera;
  // Motivo que dejó recepción al no aprobarla (último evento de cierre con detalle).
  const motivoRechazo = rechazado
    ? ticket.historial
        .filter((e) => e.detalle && ['rechazado', 'validacion_rechazada', 'cerrado_por_checkout'].includes(e.tipo))
        .at(-1)
        ?.detalle?.replace(/\.$/, '') ?? null
    : null;
  const detallePaso3 = resuelto
    ? ticket.resuelto_at && t.paso3Hecho(horaDeFecha(ticket.resuelto_at))
    : rechazado
      ? motivoRechazo
        ? `${motivoRechazo}. ${t.rechazadoDetalle}`
        : t.rechazadoDetalle
      : cancelado
        ? t.canceladoDetalle
        : t.paso3Pendiente;

  return (
    <main className="flex flex-col gap-3.5 pb-2">
      {enlaceVolver}

      {/* Encabezado del ticket */}
      <header className="px-1">
        <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2.5 py-1 text-[12px] font-semibold text-neutral-600 tabular-nums">
          {t.ticket} #{ticket.codigo_corto} · {horaDeFecha(ticket.creado_at)}
        </span>
        <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.01em] text-neutral-900">
          {TITULOS_CATEGORIA[ticket.categoria][idioma]}
        </h1>
        {lineas.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[14.5px] leading-snug text-neutral-700">
            {lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        )}
        {ticket.detalle_mantenimiento?.foto_path && <FotoAdjunta ruta={ticket.detalle_mantenimiento.foto_path} alt={t.fotoAdjunta} />}
        {ticket.nota && (
          <p className="mt-3 rounded-xl border-l-2 border-neutral-300 bg-white/70 py-2 pl-3 pr-2 text-[13.5px] italic leading-relaxed text-neutral-600">
            “{ticket.nota}”
          </p>
        )}
      </header>

      {/* Voucher / código de referencia (tours y pedidos del catálogo) */}
      {ticket.detalle_catalogo?.voucher_codigo && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3.5 text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{t.voucher}</p>
          <p className="mt-1 font-mono text-[22px] font-semibold tracking-[0.06em] text-neutral-900 select-all">
            {ticket.detalle_catalogo.voucher_codigo}
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">
            {ticket.categoria === 'tour' ? t.voucherDetalle : t.voucherDetallePedido}
          </p>
        </div>
      )}

      {/* Tour propio del hotel: lo confirma recepción y se paga ahí */}
      {ticket.categoria === 'tour' && ticket.tour_propio && !finalizado && (
        <div className={`${TARJETA} p-4`}>
          <p className="text-[15px] font-semibold text-neutral-900">{t.propioTitulo}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{t.propioTexto}</p>
        </div>
      )}

      {/* Tours de Seven Stay: los confirma y cobra el Agente Oficial de Seven Stay por WhatsApp */}
      {ticket.categoria === 'tour' &&
        !ticket.tour_propio &&
        ticket.detalle_catalogo &&
        !finalizado &&
        (() => {
          const c = ticket.detalle_catalogo;
          const mensaje = t.agenteMensaje(c.titulo, c.cantidad, ticket.habitacion_numero, hotel.nombre, c.voucher_codigo);
          return (
            <div className={`${TARJETA} p-4`}>
              <p className="text-[15px] font-semibold text-neutral-900">{t.agenteTitulo}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{t.agenteTexto}</p>
              <a
                href={enlaceAgenteSevenStay(mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-[14.5px] font-semibold text-white ${TOQUE}`}
              >
                <MessageCircle aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.25} />
                {t.agenteBoton}
              </a>
            </div>
          );
        })()}

      {/* Avisos push: así el huésped se entera aunque cierre la página */}
      {!finalizado && <TarjetaAvisos codigo={decodeURIComponent(codigo)} idioma={idioma} />}

      {/* Línea de tiempo en vivo */}
      <section aria-label={t.progreso} className={`${TARJETA} p-5`}>
        <ol aria-live="polite">
          <Paso estado="hecho" titulo={t.paso1} detalle={detallePaso1} siguienteAlcanzado={paso2 !== 'pendiente'} />
          <Paso
            estado={paso2}
            titulo={t.paso2}
            detalle={detallePaso2}
            siguienteAlcanzado={paso3 === 'hecho'}
          />
          <Paso
            estado={paso3}
            titulo={rechazado ? t.rechazado : cancelado ? t.cancelado : t.paso3}
            detalle={detallePaso3}
            ultimo
          />
        </ol>
      </section>

      {/* Cancelar: solo mientras nadie la ha tomado */}
      {estado === 'abierto' &&
        (confirmandoCancelar ? (
          <div className={`${TARJETA} p-4 text-center`}>
            <p className="text-[15px] font-semibold text-neutral-900">{t.cancelarPregunta}</p>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={cancelando}
                onClick={() => setConfirmandoCancelar(false)}
                className={`h-12 rounded-full border border-neutral-200/60 bg-white text-[14.5px] font-semibold text-neutral-900 ${TOQUE}`}
              >
                {t.cancelarNo}
              </button>
              <button
                type="button"
                disabled={cancelando}
                onClick={async () => {
                  setCancelando(true);
                  await cancelarTicket(ticket.id);
                  setCancelando(false);
                  setConfirmandoCancelar(false);
                }}
                className={`h-12 rounded-full bg-rose-600 text-[14.5px] font-semibold text-white disabled:opacity-60 ${TOQUE}`}
              >
                {t.cancelarSi}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoCancelar(true)}
            className="mx-auto h-11 px-4 text-[14px] font-medium text-rose-600"
          >
            {t.cancelar}
          </button>
        ))}

      {/* Escalamiento por demora */}
      {ticket.en_alerta_servicio && !finalizado && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4">
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
          <p className="text-[14px] leading-relaxed text-emerald-900">{t.notificado}</p>
        </div>
      )}
      {mostrarEscalar && (
        <div className={`${TARJETA} p-4`}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <AlertTriangle aria-hidden className="h-[18px] w-[18px] text-amber-600" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-neutral-900">{t.demoraTitulo}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{t.demoraTexto(MINUTOS_DEMORA)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => escalarTicket(ticket.id)}
            className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-[14px] font-medium text-white ${TOQUE}`}
          >
            <BellRing aria-hidden className="h-4 w-4" strokeWidth={2.25} />
            {t.notificar}
          </button>
        </div>
      )}

      {/* Reseñas: el mismo bloque neutro para todos (sin review gating) */}
      {resuelto && (
        <section className={`${TARJETA} p-5 text-center`}>
          <p className="text-[16px] font-semibold text-neutral-900">{t.resenaTitulo(hotel.nombre)}</p>
          <p className="mt-1 text-[13px] text-neutral-500">{t.resenaTexto}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {plataformasResena.map(({ nombre, href, Logo }) => (
              <a
                key={nombre}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex h-12 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-900 ${TOQUE}`}
              >
                <Logo className="h-5 w-5 shrink-0" />
                {nombre}
                <ExternalLink aria-hidden className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2.25} />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Historial: el resto de solicitudes enviadas desde este teléfono */}
      {otros.length > 0 && (
        <section aria-label={t.otras} className="mt-2">
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
            {t.otras} · {otros.length}
          </h2>
          <ul className={`${TARJETA} divide-y divide-neutral-100 overflow-hidden`}>
            {otros.map((tk) => (
              <FilaTicket
                key={tk.id}
                ticket={tk}
                href={`${base}/ticket/${tk.id}`}
                idioma={idioma}
                ahora={ahora}
                horaFinSilencio={hotel.hora_silencio_fin}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-1">{botonVolverInicio}</div>

    </main>
  );
}
