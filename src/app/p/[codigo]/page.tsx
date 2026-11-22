'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BedDouble, ChevronRight, Compass, ListChecks, Phone, UtensilsCrossed, Wifi, Wrench, type LucideIcon } from 'lucide-react';

import AlertaSolicitudActiva from '@/components/portal/AlertaSolicitudActiva';
import TarjetaInstalar from '@/components/pwa/TarjetaInstalar';
import { useStay } from '@/context/StayContext';
import type { Idioma } from '@/types/sevenstay';

// ---------------------------------------------------------------------------
// Constantes de diseño y textos
// ---------------------------------------------------------------------------

const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
const TARJETA = 'rounded-[22px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_6px_20px_-8px_rgba(17,24,39,0.08)]';
const TOQUE = `transition-transform duration-300 ${EASE} active:scale-[0.965]`;

const TEXTOS = {
  es: {
    clave: 'Clave',
    copiar: 'Copiar',
    copiada: '¡Copiada! ✓',
    copiaFallida: 'Mantén presionada la clave para copiarla',
    wifiTitulo: 'Wi-Fi del hotel',
    titulo: '¿En qué podemos ayudarte hoy?',
    llamar: 'Llamar a Recepción',
    misSolicitudes: 'Mis solicitudes',
    tarjetas: {
      housekeeping: ['Limpieza y Amenidades', 'Toallas y limpieza'],
      mantenimiento: ['Reportar Falla', 'Algo no funciona'],
      tours: ['Tours y Guías', 'Excursiones locales'],
      menu: ['Menú y Horarios', 'Comida y servicios'],
    },
  },
  en: {
    clave: 'Password',
    copiar: 'Copy',
    copiada: 'Copied! ✓',
    copiaFallida: 'Press and hold the password to copy it',
    wifiTitulo: 'Hotel Wi-Fi',
    titulo: 'How may we assist you today?',
    llamar: 'Call Front Desk',
    misSolicitudes: 'My requests',
    tarjetas: {
      housekeeping: ['Housekeeping & Amenities', 'Towels & cleaning'],
      mantenimiento: ['Report an Issue', 'Something not working'],
      tours: ['Tours & Guides', 'Local excursions'],
      menu: ['Menu & Hours', 'Food & services'],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // Algunos navegadores dejan la promesa colgada (permiso pendiente,
      // pestaña sin foco): pasados 800 ms se usa el método de respaldo.
      const ok = await Promise.race([
        navigator.clipboard.writeText(texto).then(() => true),
        new Promise<false>((resolver) => setTimeout(() => resolver(false), 800)),
      ]);
      if (ok) return true;
    }
  } catch {
    // se intenta el método de respaldo
  }
  // Respaldo para http por IP local (el portapapeles moderno exige https).
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand('copy');
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}

function TarjetaWifi({ ssid, clave, idioma }: { ssid: string; clave: string; idioma: Idioma }) {
  const t = TEXTOS[idioma];
  const [estado, setEstado] = useState<'normal' | 'copiada' | 'fallo'>('normal');
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const alCopiar = async () => {
    const ok = await copiarTexto(clave);
    setEstado(ok ? 'copiada' : 'fallo');
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado('normal'), 2200);
  };

  const copiada = estado === 'copiada';

  return (
    <section aria-label={t.wifiTitulo} className={`${TARJETA} flex items-center gap-3 p-4`}>
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
        <Wifi className="h-[22px] w-[22px] text-neutral-900" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        {/* Nunca se recortan: el SSID puede partirse tras "_" y la clave baja de línea entera. */}
        <p className="text-[15px] font-semibold leading-snug text-[#111827] [overflow-wrap:anywhere]">
          {ssid.split('_').map((parte, i) => (
            <span key={i}>
              {i > 0 && (
                <>
                  _<wbr />
                </>
              )}
              {parte}
            </span>
          ))}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">
          {t.clave}: <span className="font-mono text-neutral-700 select-all [overflow-wrap:anywhere]">{clave}</span>
        </p>
        {estado === 'fallo' && <p className="mt-1 text-[11.5px] text-neutral-500">{t.copiaFallida}</p>}
      </div>
      <button
        type="button"
        onClick={alCopiar}
        className={`flex h-12 min-w-[96px] shrink-0 items-center justify-center rounded-full px-4 text-[13.5px] font-semibold text-white transition-[transform,background-color] duration-300 ${EASE} active:scale-[0.965] ${
          copiada ? 'bg-emerald-600' : 'bg-neutral-900'
        }`}
      >
        <span aria-live="polite">{copiada ? t.copiada : t.copiar}</span>
      </button>
    </section>
  );
}

function TarjetaServicio({ href, icono: Icono, titulo, subtitulo }: { href: string; icono: LucideIcon; titulo: string; subtitulo: string }) {
  return (
    <Link href={href} className={`${TARJETA} ${TOQUE} flex h-[142px] flex-col justify-between p-4`}>
      <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-neutral-100">
        <Icono className="h-[21px] w-[21px] text-neutral-900" strokeWidth={1.9} />
      </span>
      <span>
        <span className="block text-[15px] font-semibold leading-snug text-[#111827]">{titulo}</span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-neutral-500">{subtitulo}</span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function HomeHabitacion() {
  const { codigo } = useParams<{ codigo: string }>();
  const { hotel, habitaciones, tickets, misTicketIds, idioma } = useStay();
  const t = TEXTOS[idioma];

  const habitacion = habitaciones.find((h) => h.codigo_placa === decodeURIComponent(codigo ?? ''));
  if (!habitacion) return null; // el layout ya muestra el aviso de placa inactiva

  const base = `/p/${encodeURIComponent(codigo)}`;
  const totalMias = tickets.filter((tk) => misTicketIds.includes(tk.id) && tk.habitacion_numero === habitacion.numero).length;
  const tarjetas = [
    { clave: 'housekeeping', href: `${base}/housekeeping`, icono: BedDouble },
    { clave: 'mantenimiento', href: `${base}/mantenimiento`, icono: Wrench },
    { clave: 'tours', href: `${base}/tours`, icono: Compass },
    { clave: 'menu', href: `${base}/menu`, icono: UtensilsCrossed },
  ] as const;

  return (
    // justify-center: el contenido queda centrado entre el header y el footer
    // en vez de pegado arriba (el espacio sobrante se reparte arriba y abajo).
    <main className="flex flex-1 flex-col justify-center gap-3.5">
      <AlertaSolicitudActiva habitacionNumero={habitacion.numero} basePath={base} />

      <TarjetaWifi ssid={hotel.wifi_ssid} clave={hotel.wifi_password} idioma={idioma} />

      <h1 className="mt-5 px-1 text-[20px] font-semibold tracking-[-0.01em] text-[#111827]">{t.titulo}</h1>

      <nav className="grid grid-cols-2 gap-3">
        {tarjetas.map(({ clave, href, icono }) => (
          <TarjetaServicio key={clave} href={href} icono={icono} titulo={t.tarjetas[clave][0]} subtitulo={t.tarjetas[clave][1]} />
        ))}
      </nav>

      <a
        href={`tel:${hotel.telefono_recepcion.replace(/[^\d+]/g, '')}`}
        className={`${TOQUE} mt-2 flex h-[48px] items-center justify-center gap-2 rounded-full border border-neutral-200/60 bg-white text-[15px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(17,24,39,0.04)]`}
      >
        <Phone aria-hidden className="h-4 w-4" strokeWidth={2.25} />
        {t.llamar}
      </a>

      <TarjetaInstalar idioma={idioma} />

      {/* Historial: todo lo que se pidió desde este teléfono (en curso y terminado) */}
      {totalMias > 0 && (
        <Link
          href={`${base}/solicitudes`}
          className={`${TOQUE} flex h-[48px] items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-neutral-700`}
        >
          <ListChecks aria-hidden className="h-4 w-4" strokeWidth={2.25} />
          {t.misSolicitudes}
          <span className="rounded-full bg-black/[0.06] px-2 py-px text-[12px] tabular-nums text-neutral-600">{totalMias}</span>
          <ChevronRight aria-hidden className="h-4 w-4 text-neutral-400" strokeWidth={2.5} />
        </Link>
      )}
    </main>
  );
}
