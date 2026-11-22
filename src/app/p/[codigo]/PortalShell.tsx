'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Check, ChevronDown, Globe, Loader2, Phone, QrCode, RotateCw, ShieldCheck, WifiOff, X } from 'lucide-react';

import LogoHotel from '@/components/LogoHotel';
import { PortalStayProvider } from '@/context/PortalStayProvider';
import { useStay } from '@/context/StayContext';
import { registrarServiceWorker } from '@/lib/push';
import type { Idioma } from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Constantes de diseño
// ---------------------------------------------------------------------------

/** Curva "spring" de la estética Cupertino para todas las transiciones. */
const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const FUENTE_PORTAL = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

const TEXTOS = {
  es: {
    habitacion: 'Hab.',
    offline: 'Sin conexión — Datos de Wi-Fi y teléfonos disponibles',
    emergencias: 'Emergencias médicas o incendio: marque 911.',
    privacidad: 'Privacidad y términos',
    cerrar: 'Cerrar',
    placaTitulo: 'Esta placa no está activa',
    placaTexto: 'Por favor contacta a recepción para que podamos ayudarte.',
    llamarRecepcion: 'Llamar a recepción',
    errorTitulo: 'Sin conexión',
    errorTexto: 'Revisa tu conexión a internet o al Wi-Fi del hotel e inténtalo de nuevo.',
    servicioTitulo: 'El portal no está disponible',
    servicioTexto: 'Estamos teniendo un problema temporal. Inténtalo en unos minutos o pide ayuda en recepción.',
    reintentar: 'Reintentar',
    cargando: 'Cargando',
    idioma: 'Idioma',
    privacidadTitulo: 'Privacidad y términos',
    privacidadParrafos: [
      'Este portal solo usa el número de tu habitación y los detalles de las solicitudes que envíes para que el personal del hotel pueda atenderte. No necesitas crear una cuenta ni ingresar datos de pago.',
      'Al hacer check-out, tus solicitudes dejan de mostrarse en este portal: quien ocupe la habitación después no podrá verlas.',
      'Si activas los avisos, solo te notificamos sobre tus propias solicitudes. Puedes desactivarlos cuando quieras desde los ajustes de tu teléfono.',
      'El servicio a la habitación y los tours del hotel los presta el hotel. Los tours marcados «Operado por Seven Stay» los gestiona y cobra Seven Stay. Precios y horarios pueden cambiar sin previo aviso.',
      'Este portal no sustituye al 911 ni a los servicios de emergencia del hotel.',
    ],
  },
  en: {
    habitacion: 'Room',
    offline: "You're offline — Wi-Fi details and phone numbers are still available",
    emergencias: 'Medical emergency or fire: dial 911.',
    privacidad: 'Privacy & terms',
    cerrar: 'Close',
    placaTitulo: 'This tag is not active',
    placaTexto: 'Please contact the front desk so we can help you.',
    llamarRecepcion: 'Call the front desk',
    errorTitulo: "You're offline",
    errorTexto: "Check your internet or the hotel's Wi-Fi and try again.",
    servicioTitulo: 'The portal is unavailable',
    servicioTexto: "We're having a temporary issue. Please try again in a few minutes or ask the front desk.",
    reintentar: 'Try again',
    cargando: 'Loading',
    idioma: 'Language',
    privacidadTitulo: 'Privacy & terms',
    privacidadParrafos: [
      'This portal only uses your room number and the details of the requests you send so hotel staff can assist you. You do not need to create an account or enter any payment details.',
      'After check-out, your requests are no longer shown in this portal: the next guest in the room cannot see them.',
      'If you turn on notifications, we only notify you about your own requests. You can turn them off anytime in your phone settings.',
      'Room service and hotel tours are provided by the hotel. Tours marked “Operated by Seven Stay” are managed and charged by Seven Stay. Prices and schedules may change without notice.',
      "This portal does not replace 911 or the hotel's emergency services.",
    ],
  },
} as const;

/**
 * Nombres de hotel de cualquier largo: el texto baja hasta 2 líneas y, cuanto
 * más largo es, más pequeño y con menos espaciado entre letras. Solo si aun así
 * no cabe se corta con "…" (el nombre completo queda en el `title`).
 */
function claseNombreHotel(nombre: string): string {
  const largo = nombre.trim().length;
  if (largo <= 16) return 'text-[13px] tracking-[0.1em]';
  if (largo <= 30) return 'text-[12px] tracking-[0.06em]';
  return 'text-[11px] tracking-[0.03em]';
}

function telHref(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, '')}`;
}

// ---------------------------------------------------------------------------
// Estado de conexión (navigator.onLine)
// ---------------------------------------------------------------------------

function suscribirConexion(oyente: () => void) {
  window.addEventListener('online', oyente);
  window.addEventListener('offline', oyente);
  return () => {
    window.removeEventListener('online', oyente);
    window.removeEventListener('offline', oyente);
  };
}

function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  );
}

// ---------------------------------------------------------------------------
// Piezas del shell
// ---------------------------------------------------------------------------

const IDIOMAS: { codigo: Idioma; nombre: string }[] = [
  { codigo: 'es', nombre: 'Español' },
  { codigo: 'en', nombre: 'English' },
];

/** Selector de idioma desplegable: muestra "ES ▾" y al tocarlo abre la lista. */
function SelectorIdioma() {
  const { idioma, setIdioma } = useStay();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarFuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('pointerdown', alTocarFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alTocarFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`${TEXTOS[idioma].idioma}: ${idioma.toUpperCase()}`}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-12 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-neutral-700 transition-transform duration-300 ${EASE} active:scale-[0.965]`}
      >
        <Globe aria-hidden className="h-4 w-4 text-neutral-500" strokeWidth={2} />
        {idioma.toUpperCase()}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-300 ${EASE} ${abierto ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
        />
      </button>

      <div
        role="menu"
        aria-label={TEXTOS[idioma].idioma}
        inert={!abierto}
        className={`absolute right-1 top-full z-50 mt-1 w-44 origin-top-right overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-1 shadow-[0_12px_32px_-8px_rgba(17,24,39,0.22)] transition-[opacity,scale] duration-300 ${EASE} ${
          abierto ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        }`}
      >
        {IDIOMAS.map(({ codigo, nombre }) => (
          <button
            key={codigo}
            type="button"
            role="menuitemradio"
            aria-checked={idioma === codigo}
            onClick={() => {
              setIdioma(codigo);
              setAbierto(false);
            }}
            className={`flex h-12 w-full items-center justify-between rounded-xl px-3 text-left text-[14.5px] transition-colors active:bg-neutral-100 ${
              idioma === codigo ? 'font-semibold text-neutral-900' : 'text-neutral-600'
            }`}
          >
            <span>
              {nombre} <span className="ml-1 text-[12px] font-medium text-neutral-400">{codigo.toUpperCase()}</span>
            </span>
            {idioma === codigo && <Check aria-hidden className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function BannerOffline({ idioma }: { idioma: Idioma }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-neutral-900 px-4 py-2 text-center text-[12px] font-medium text-white">
      <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <span>{TEXTOS[idioma].offline}</span>
    </div>
  );
}

function ModalPrivacidad({ abierto, onCerrar, idioma }: { abierto: boolean; onCerrar: () => void; idioma: Idioma }) {
  const t = TEXTOS[idioma];
  const botonCerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    botonCerrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abierto, onCerrar]);

  return (
    <div
      inert={!abierto}
      aria-hidden={!abierto}
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300 ${
        abierto ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t.cerrar}
        onClick={onCerrar}
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-privacidad"
        style={FUENTE_PORTAL}
        className={`relative w-full max-w-[430px] rounded-t-[28px] bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-3 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] transition-transform duration-500 ${EASE} ${
          abierto ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-200" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-privacidad" className="flex items-center gap-2 text-[17px] font-semibold text-[#111827]">
            <ShieldCheck aria-hidden className="h-5 w-5 text-neutral-900" strokeWidth={2} />
            {t.privacidadTitulo}
          </h2>
          <button
            ref={botonCerrar}
            type="button"
            onClick={onCerrar}
            aria-label={t.cerrar}
            className={`-mr-2 flex h-12 w-12 items-center justify-center rounded-full text-neutral-500 transition-transform duration-300 ${EASE} active:scale-[0.965]`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100">
              <X aria-hidden className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </button>
        </div>
        <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-neutral-600">
          {t.privacidadParrafos.map((parrafo) => (
            <p key={parrafo}>{parrafo}</p>
          ))}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className={`mt-6 h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.98]`}
        >
          {t.cerrar}
        </button>
      </div>
    </div>
  );
}

/**
 * Firma "POWERED BY [7]STAY": el logo de Seven Stay sustituye a la palabra
 * "Seven" y va pegado a "STAY" en Anton. El logo se pinta como máscara para
 * que tome el mismo color que el texto.
 */
const MASCARA_LOGO_SEVEN = {
  maskImage: 'url(/seven-stay-logo.png)',
  WebkitMaskImage: 'url(/seven-stay-logo.png)',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
} as const;

function FirmaSevenStay() {
  return (
    <p aria-label="Powered by Seven Stay" className="flex items-center justify-center gap-2 text-neutral-400">
      <span aria-hidden className="text-[10px] font-semibold tracking-[0.22em]">
        POWERED BY
      </span>
      <span aria-hidden className="flex items-end text-neutral-500">
        <span style={MASCARA_LOGO_SEVEN} className="mb-px inline-block h-[14px] w-[15px] bg-current" />
        <span
          style={{ fontFamily: 'var(--font-anton), Impact, sans-serif' }}
          className="text-[15px] uppercase leading-none tracking-[0.03em]"
        >
          STAY
        </span>
      </span>
    </p>
  );
}

/** Marco "teléfono": a pantalla completa en móvil, tarjeta centrada de 430 px en desktop. */
export function MarcoMovil({ children }: { children: ReactNode }) {
  return (
    <div style={FUENTE_PORTAL} className="flex min-h-dvh flex-1 justify-center bg-[#F8F9FA] text-[#111827] antialiased sm:bg-[#E9EBEE] sm:py-8">
      <div className="flex min-h-dvh w-full max-w-[430px] flex-col bg-[#F8F9FA] sm:min-h-[calc(100dvh-4rem)] sm:overflow-clip sm:rounded-[36px] sm:border sm:border-black/[0.05] sm:shadow-[0_24px_60px_-12px_rgba(17,24,39,0.18)]">
        {children}
      </div>
    </div>
  );
}

function PantallaPlacaInactiva({ idioma, telefono, hotelNombre }: { idioma: Idioma; telefono?: string; hotelNombre?: string }) {
  const t = TEXTOS[idioma];
  return (
    <MarcoMovil>
      <div className="flex justify-end px-4 pt-[env(safe-area-inset-top)]">
        <SelectorIdioma />
      </div>
      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-black/[0.05] bg-white shadow-[0_4px_16px_rgba(17,24,39,0.06)]">
          <QrCode aria-hidden className="h-7 w-7 text-neutral-900" strokeWidth={1.75} />
        </div>
        <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.01em]">{t.placaTitulo}</h1>
        <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-neutral-500">{t.placaTexto}</p>
        {telefono && (
        <a
          href={telHref(telefono)}
          className={`mt-8 flex h-12 w-full max-w-[300px] items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.965]`}
        >
          <Phone aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          {t.llamarRecepcion}
        </a>
        )}
        {telefono && <p className="mt-3 text-[13px] text-neutral-400">{telefono}</p>}
      </main>
      <p className="pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center text-[10px] font-semibold tracking-[0.2em] text-neutral-400">
        {hotelNombre?.toUpperCase()}
      </p>
    </MarcoMovil>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** No cargó: sin conexión ('red') o fallo del servicio (otro motivo). Una placa inválida usa PantallaPlacaInactiva. */
function PantallaError({ idioma, motivo, onReintentar }: { idioma: Idioma; motivo: string | null; onReintentar: () => void }) {
  const t = TEXTOS[idioma];
  const sinRed = motivo === 'red';
  const Icono = sinRed ? WifiOff : AlertCircle;
  return (
    <MarcoMovil>
      <div className="flex justify-end px-4 pt-[env(safe-area-inset-top)]">
        <SelectorIdioma />
      </div>
      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-black/[0.05] bg-white shadow-[0_4px_16px_rgba(17,24,39,0.06)]">
          <Icono aria-hidden className="h-7 w-7 text-neutral-900" strokeWidth={1.75} />
        </div>
        <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.01em]">{sinRed ? t.errorTitulo : t.servicioTitulo}</h1>
        <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-neutral-500">{sinRed ? t.errorTexto : t.servicioTexto}</p>
        <button
          type="button"
          onClick={onReintentar}
          className={`mt-8 flex h-12 w-full max-w-[300px] items-center justify-center gap-2 rounded-full bg-neutral-900 text-[15px] font-semibold text-white transition-transform duration-300 ${EASE} active:scale-[0.965]`}
        >
          <RotateCw aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          {t.reintentar}
        </button>
      </main>
    </MarcoMovil>
  );
}

/** El portal de una placa: lee el código de la URL y abre la sesión anónima del huésped. */
export function PortalShell({ children }: { children: ReactNode }) {
  const { codigo } = useParams<{ codigo: string }>();
  return (
    <PortalStayProvider codigo={decodeURIComponent(codigo ?? '')}>
      {/* App instalable de ESTA habitación: el ícono abre directo su portal (React lo sube al <head>). */}
      <link rel="manifest" href={`/p/${encodeURIComponent(decodeURIComponent(codigo ?? ''))}/manifest.webmanifest`} />
      <PortalContenido codigo={codigo}>{children}</PortalContenido>
    </PortalStayProvider>
  );
}

function PortalContenido({ codigo, children }: { codigo: string; children: ReactNode }) {
  const { estadoCarga, mensajeError, hotel, habitaciones, idioma } = useStay();
  // PWA: el service worker recibe los avisos push.
  useEffect(() => {
    void registrarServiceWorker();
  }, []);
  const enLinea = useEnLinea();
  const [privacidadAbierta, setPrivacidadAbierta] = useState(false);
  const cerrarPrivacidad = useCallback(() => setPrivacidadAbierta(false), []);
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));

  // Mientras carga, la página se pinta oculta: si el layout no la pintara,
  // Next avisa "segment dropped from rendering" (navegación instantánea).
  if (estadoCarga === 'cargando') {
    return (
      <MarcoMovil>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 aria-label={t.cargando} className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
        <div hidden>{children}</div>
      </MarcoMovil>
    );
  }
  // Reintentar recarga la página: así también se reintenta la sesión anónima.
  if (estadoCarga === 'error') return <PantallaError idioma={idioma} motivo={mensajeError} onReintentar={() => window.location.reload()} />;
  if (estadoCarga === 'no_encontrado') return <PantallaPlacaInactiva idioma={idioma} />;

  // Una placa "en_stock" todavía no está instalada en ninguna puerta, así que
  // también se trata como inactiva (crearTicket la rechazaría igual).
  if (!habitacion || habitacion.estado_placa !== 'activa') {
    return <PantallaPlacaInactiva idioma={idioma} telefono={hotel.telefono_recepcion} hotelNombre={hotel.nombre} />;
  }

  return (
    <MarcoMovil>
      <header className="sticky top-0 z-40 border-b border-black/[0.04] bg-[#F8F9FA]/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        {!enLinea && <BannerOffline idioma={idioma} />}
        <div className="flex min-h-16 items-center justify-between gap-3 py-2 pl-4 pr-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Logo tal cual (PNG transparente 3:2), sin fondo ni tarjeta. */}
            <LogoHotel src={hotel.logo_url} className="h-10 w-[60px] shrink-0 object-contain" />
            <span
              title={hotel.nombre}
              className={`line-clamp-2 break-words font-bold uppercase leading-tight text-[#111827] ${claseNombreHotel(hotel.nombre)}`}
            >
              {hotel.nombre}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            <span className="text-[13px] text-neutral-500">
              {t.habitacion} {habitacion.numero}
            </span>
            <SelectorIdioma />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col px-4 pt-8">{children}</div>

      <footer className="px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-8 text-center">
        <p className="text-[11.5px] leading-snug text-neutral-500">{t.emergencias}</p>
        <button
          type="button"
          onClick={() => setPrivacidadAbierta(true)}
          className="inline-flex h-12 items-center px-3 text-[11.5px] font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-[3px] transition-colors active:text-neutral-900"
        >
          {t.privacidad}
        </button>
        <FirmaSevenStay />
      </footer>

      <ModalPrivacidad abierto={privacidadAbierta} onCerrar={cerrarPrivacidad} idioma={idioma} />
    </MarcoMovil>
  );
}
