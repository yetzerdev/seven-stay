'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, Loader2, Lock, LogOut, RotateCw, UserX, X } from 'lucide-react';

import LogoHotel from '@/components/LogoHotel';
import MarcaSevenStay from '@/components/MarcaSevenStay';
import BotonAvisosPanel from '@/components/pwa/BotonAvisosPanel';
import { useStay } from '@/context/StayContext';
import { registrarServiceWorker } from '@/lib/push';

import { NOMBRES_ROL } from './sesionPanel';
import { useAlertaNuevosTickets } from './useAlertaNuevosTickets';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

/**
 * Secciones del panel del hotel. `soloGerencia` = solo para supervisor_gerente.
 * Tours: gerencia elige si el portal muestra los de Seven Stay, los propios o ambos.
 */
const ENLACES: { href: string; texto: string; soloGerencia?: boolean }[] = [
  { href: '/panel', texto: 'Centro de Control' },
  { href: '/panel/habitaciones', texto: 'Habitaciones' },
  { href: '/panel/menu', texto: 'Menú' },
  { href: '/panel/tours', texto: 'Tours', soloGerencia: true },
  { href: '/panel/personal', texto: 'Personal', soloGerencia: true },
  // Solo gerencia edita los datos del hotel (también lo exige la base de datos).
  { href: '/panel/configuracion', texto: 'Configuración Hotel', soloGerencia: true },
  { href: '/panel/metricas', texto: 'Métricas', soloGerencia: true },
];

function enlaceActivo(href: string, pathname: string): boolean {
  return href === '/panel' ? pathname === '/panel' || pathname.startsWith('/panel/solicitudes') : pathname.startsWith(href);
}

/** Menú de cuenta: hotel, usuario y rol de la sesión, y "Salir". */
function MenuCuenta({ onSalir }: { onSalir: () => void }) {
  const { hotel, rolPanel, correoUsuario } = useStay();
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
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-11 items-center gap-2.5 rounded-xl pl-1.5 pr-2.5 hover:bg-neutral-100"
      >
        {/* Logo del hotel (PNG transparente), igual que en el portal del huésped */}
        <LogoHotel src={hotel.logo_url} className="h-8 w-12 shrink-0 object-contain" />
        <span className="hidden max-w-[180px] truncate text-[14.5px] font-semibold text-neutral-800 md:block">{hotel.nombre}</span>
        <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(17,24,39,0.25)]">
          <div className="px-3 pb-2.5 pt-1.5">
            {correoUsuario && <p className="truncate text-[14px] font-semibold text-neutral-800">{correoUsuario}</p>}
            <p className="text-[12.5px] text-neutral-500">{NOMBRES_ROL[rolPanel]}</p>
          </div>
          <BotonAvisosPanel />
          <button
            type="button"
            role="menuitem"
            onClick={onSalir}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[14.5px] font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            Salir
          </button>
        </div>
      )}
    </div>
  );
}

/** Pantalla completa centrada (carga, error o usuario sin hotel). */
function PantallaAviso({ children }: { children: ReactNode }) {
  return (
    <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center text-neutral-900 antialiased">
      {children}
    </div>
  );
}

/**
 * Cascarón del Panel del Hotel: protege las rutas con la sesión de Supabase
 * (sin sesión → login) y dibuja la barra superior. El login se muestra sin barra.
 */
export function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { estadoCarga, mensajeError, errorAccion, limpiarErrorAccion, rolPanel, cerrarSesion, recargar } = useStay();
  const esLogin = pathname === '/panel/login';
  // Llega desde el correo de recuperación: abre su propia sesión, sin redirecciones ni barra.
  const esRestablecer = pathname === '/panel/restablecer';
  const listo = estadoCarga === 'listo';
  // PWA: el service worker recibe los avisos push de solicitudes nuevas.
  useEffect(() => {
    void registrarServiceWorker();
  }, []);
  const enlaces = ENLACES.filter((e) => !e.soloGerencia || rolPanel === 'supervisor_gerente');
  // Sonido + "(n) Nuevo Ticket" en el título mientras el panel está abierto con sesión.
  useAlertaNuevosTickets(listo && !esLogin && !esRestablecer && pathname.startsWith('/panel'));
  // Sección exclusiva de gerencia abierta por alguien de recepción (p. ej. pegando la URL).
  const sinPermiso = ENLACES.some((e) => e.soloGerencia && pathname.startsWith(e.href)) && rolPanel !== 'supervisor_gerente';

  useEffect(() => {
    // Next deja las secciones visitadas montadas y ocultas (Activity): el panel del
    // hotel solo redirige mientras la dirección es suya, nunca desde /admin o /p.
    if (esRestablecer || !pathname.startsWith('/panel')) return;
    if (estadoCarga === 'sin_sesion' && !esLogin) router.replace('/panel/login');
    if (estadoCarga === 'listo' && esLogin) router.replace('/panel');
  }, [estadoCarga, esLogin, esRestablecer, pathname, router]);

  const salir = async () => {
    await cerrarSesion();
    router.replace('/panel/login');
  };

  if (esLogin || esRestablecer) {
    return (
      <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col text-neutral-900 antialiased">
        {children}
      </div>
    );
  }

  if (estadoCarga === 'sin_hotel') {
    return (
      <PantallaAviso>
        <UserX aria-hidden className="h-8 w-8 text-neutral-400" />
        <p className="mt-4 text-[18px] font-semibold">Tu usuario no está vinculado a ningún hotel</p>
        <p className="mt-1 max-w-[420px] text-[15px] text-neutral-500">
          Pide a Seven Stay o a la gerencia del hotel que te den acceso al panel.
        </p>
        <button
          type="button"
          onClick={salir}
          className="mt-6 h-11 rounded-xl bg-neutral-900 px-6 text-[15px] font-semibold text-white hover:bg-neutral-800"
        >
          Salir
        </button>
        <div hidden>{children}</div>
      </PantallaAviso>
    );
  }

  if (estadoCarga === 'error') {
    return (
      <PantallaAviso>
        <AlertTriangle aria-hidden className="h-8 w-8 text-amber-500" />
        <p className="mt-4 text-[18px] font-semibold">No se pudo cargar el panel</p>
        {mensajeError && <p className="mt-1 max-w-[460px] text-[15px] text-neutral-500">{mensajeError}</p>}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => void recargar()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[15px] font-semibold text-white hover:bg-neutral-800"
          >
            <RotateCw aria-hidden className="h-4 w-4" />
            Reintentar
          </button>
          <button type="button" onClick={salir} className="h-11 rounded-xl px-5 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-100">
            Salir
          </button>
        </div>
        <div hidden>{children}</div>
      </PantallaAviso>
    );
  }

  // Hasta leer la sesión y los datos (o mientras redirige al login) el panel
  // no se muestra. La página igual se pinta, oculta: si el layout no la
  // pintara, Next avisa "segment dropped from rendering" (navegación instantánea).
  if (!listo) {
    return (
      <PantallaAviso>
        <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
        <div hidden>{children}</div>
      </PantallaAviso>
    );
  }

  return (
    // print:hidden: al imprimir una placa QR solo sale la placa (va en un portal fuera de este árbol).
    <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col bg-[#F8F9FA] text-neutral-900 antialiased print:hidden">
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-8 px-5 lg:px-8">
          <Link href="/panel" aria-label="Seven Stay — Centro de Control" className="shrink-0 text-neutral-900">
            <MarcaSevenStay tamano="md" />
          </Link>

          <nav aria-label="Secciones del panel" className="flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
            {enlaces.map(({ href, texto }) => {
              const activo = enlaceActivo(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={activo ? 'page' : undefined}
                  className={`relative flex h-full shrink-0 items-center px-3.5 text-[15px] font-semibold transition-colors ${
                    activo ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-800'
                  }`}
                >
                  {texto}
                  {activo && <span aria-hidden className="absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-full bg-neutral-900" />}
                </Link>
              );
            })}
          </nav>

          <MenuCuenta onSalir={salir} />
        </div>
      </header>

      {errorAccion && (
        <div role="alert" className="mx-auto mt-5 flex w-full max-w-[1600px] px-5 lg:px-8">
          <div className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 py-2.5 pl-4 pr-2 text-[14.5px] text-rose-800">
            <AlertTriangle aria-hidden className="h-[18px] w-[18px] shrink-0 text-rose-500" />
            <p className="min-w-0 flex-1">
              <strong className="font-semibold">No se pudo completar la acción.</strong> {errorAccion}
            </p>
            <button
              type="button"
              onClick={limpiarErrorAccion}
              aria-label="Cerrar aviso"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-100"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-5 py-6 lg:px-8 lg:py-8">
        {sinPermiso ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-20 text-center">
            <Lock aria-hidden className="h-8 w-8 text-neutral-400" />
            <p className="mt-4 text-[18px] font-semibold text-neutral-900">Sección solo para Supervisor / Gerente</p>
            <p className="mt-1 text-[15px] text-neutral-500">Pide a tu supervisor que la revise o inicia sesión con un usuario de gerencia.</p>
            <Link href="/panel" className="mt-5 h-11 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold leading-[44px] text-white hover:bg-neutral-800">
              Ir al Centro de Control
            </Link>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
