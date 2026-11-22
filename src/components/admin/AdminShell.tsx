'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, LogOut, RotateCw, ShieldAlert } from 'lucide-react';

import MarcaSevenStay from '@/components/MarcaSevenStay';

import { useAdmin } from './SesionAdmin';

const FUENTE = { fontFamily: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' };

/** `operaciones` = también lo ve el rol Operaciones (el resto es solo para el super_admin). */
const ENLACES = [
  { href: '/admin', texto: 'Hoteles' },
  { href: '/admin/monitoreo', texto: 'Monitoreo', operaciones: true },
  { href: '/admin/metricas', texto: 'Métricas' },
  { href: '/admin/tours', texto: 'Tours y reservas', operaciones: true },
  { href: '/admin/facturacion', texto: 'Facturación' },
  { href: '/admin/bitacora', texto: 'Bitácora' },
];

/** ¿El rol Operaciones puede abrir esta ruta? */
const permitidaOperaciones = (ruta: string) => ruta.startsWith('/admin/monitoreo') || ruta.startsWith('/admin/tours');

const activo = (href: string, ruta: string) => (href === '/admin' ? ruta === '/admin' || ruta.startsWith('/admin/hoteles') : ruta.startsWith(href));

/**
 * Cascarón del panel interno de Seven Stay. Barra oscura a propósito: que
 * nadie lo confunda con el panel de un hotel.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const { estado, admin, mensajeError, reintentar, cerrarSesion } = useAdmin();
  const esLogin = ruta === '/admin/login';
  const esOperaciones = admin?.rol === 'operaciones';
  const inicio = esOperaciones ? '/admin/monitoreo' : '/admin';

  useEffect(() => {
    // Igual que el panel del hotel: solo redirige mientras la dirección es /admin.
    if (!ruta.startsWith('/admin')) return;
    if (estado === 'sin_sesion' && !esLogin) router.replace('/admin/login');
    if (estado === 'listo' && esLogin) router.replace(inicio);
    // Operaciones entra directo a Monitoreo (Hoteles es solo del super_admin).
    if (estado === 'listo' && esOperaciones && ruta === '/admin') router.replace('/admin/monitoreo');
  }, [estado, esLogin, esOperaciones, inicio, ruta, router]);

  const salir = async () => {
    await cerrarSesion();
    router.replace('/admin/login');
  };

  if (esLogin) {
    return (
      <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col text-neutral-900 antialiased">
        {children}
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center text-neutral-900">
        <AlertTriangle aria-hidden className="h-8 w-8 text-amber-500" />
        <p className="mt-4 text-[18px] font-semibold">No se pudo verificar tu acceso</p>
        <p className="mt-1 max-w-[480px] text-[15px] text-neutral-500">{mensajeError}</p>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={reintentar} className="flex h-11 items-center gap-2 rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800">
            <RotateCw aria-hidden className="h-4 w-4" />
            Reintentar
          </button>
          <button type="button" onClick={salir} className="h-11 rounded-xl px-5 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-100">
            Salir
          </button>
        </div>
        <div hidden>{children}</div>
      </div>
    );
  }

  if (estado === 'sin_permiso') {
    return (
      <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center text-neutral-900">
        <ShieldAlert aria-hidden className="h-8 w-8 text-amber-500" />
        <p className="mt-4 text-[18px] font-semibold">Este usuario no es del equipo de Seven Stay</p>
        <p className="mt-1 max-w-[420px] text-[15px] text-neutral-500">
          Si trabajas en un hotel, entra por el panel del hotel. Si eres de Seven Stay, pide que te den de alta como administrador.
        </p>
        {mensajeError && <p className="mt-3 max-w-[480px] rounded-xl bg-white px-4 py-2.5 font-mono text-[12.5px] text-neutral-600">{mensajeError}</p>}
        <div className="mt-6 flex gap-2">
          <Link href="/panel" className="flex h-11 items-center rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800">
            Ir al panel del hotel
          </Link>
          <button type="button" onClick={salir} className="h-11 rounded-xl px-5 text-[15px] font-semibold text-neutral-700 hover:bg-neutral-100">
            Salir
          </button>
        </div>
        <div hidden>{children}</div>
      </div>
    );
  }

  if (estado !== 'listo') {
    // La página se pinta oculta mientras carga (si no, Next avisa "segment dropped from rendering").
    return (
      <div style={FUENTE} className="flex min-h-dvh flex-1 items-center justify-center bg-[#F8F9FA]">
        <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
        <div hidden>{children}</div>
      </div>
    );
  }

  return (
    <div style={FUENTE} className="flex min-h-dvh flex-1 flex-col bg-[#F8F9FA] text-neutral-900 antialiased print:bg-white">
      <header className="sticky top-0 z-40 bg-neutral-900 text-white print:hidden">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-8 px-5 lg:px-8">
          <Link href={inicio} className="flex shrink-0 items-end gap-2" aria-label="Seven Stay · Panel interno">
            <MarcaSevenStay tamano="md" />
            <span className="mb-0.5 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]">Interno</span>
          </Link>
          <nav aria-label="Secciones" className="flex h-full flex-1 gap-1">
            {ENLACES.filter((e) => !esOperaciones || e.operaciones).map(({ href, texto }) => {
              const sel = activo(href, ruta);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={sel ? 'page' : undefined}
                  className={`relative flex h-full items-center px-3.5 text-[15px] font-semibold ${sel ? 'text-white' : 'text-white/55 hover:text-white'}`}
                >
                  {texto}
                  {sel && <span aria-hidden className="absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-full bg-white" />}
                </Link>
              );
            })}
          </nav>
          <div className="hidden text-right sm:block">
            <p className="text-[14px] font-semibold leading-tight">{admin?.nombre}</p>
            <p className="text-[12px] leading-tight text-white/55">
              {esOperaciones ? 'Operaciones' : 'Super-Admin'} · {admin?.correo}
            </p>
          </div>
          <button
            type="button"
            onClick={salir}
            aria-label="Salir"
            title="Salir"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-5 py-6 lg:px-8 lg:py-8 print:p-0">
        {esOperaciones && !permitidaOperaciones(ruta) ? (
          // Sección solo para el super_admin (el servidor también lo bloquea).
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-20 text-center">
            <ShieldAlert aria-hidden className="h-8 w-8 text-neutral-400" />
            <p className="mt-4 text-[18px] font-semibold">Sección solo para Super-Admin</p>
            <p className="mt-1 text-[15px] text-neutral-500">Con el rol Operaciones ves Monitoreo y Tours y reservas.</p>
            <Link href="/admin/monitoreo" className="mt-5 flex h-11 items-center rounded-xl bg-neutral-900 px-5 text-[15px] font-semibold text-white hover:bg-neutral-800">
              Ir a Monitoreo
            </Link>
            <div hidden>{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
