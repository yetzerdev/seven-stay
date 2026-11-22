'use client';

/**
 * Cloudflare Turnstile (anti-bots) para las sesiones de Supabase Auth.
 *
 * Cuando "CAPTCHA protection" está activo en Supabase (Authentication →
 * Attack Protection → Turnstile), TODO inicio de sesión necesita un token:
 * la sesión anónima del huésped y el login del panel.
 *
 * Si NEXT_PUBLIC_TURNSTILE_SITE_KEY no está definida, no se pide token
 * (útil en desarrollo con el CAPTCHA apagado en Supabase).
 *
 * El widget va en modo "interaction-only": casi siempre pasa invisible y solo
 * aparece (abajo, centrado) si Cloudflare necesita que la persona confirme.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const ESPERA_MAX_MS = 90_000;

export const turnstileActivo = SITE_KEY !== '';

interface OpcionesTurnstile {
  sitekey: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  language?: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (contenedor: HTMLElement, opciones: OpcionesTurnstile) => string | undefined;
      remove: (id: string) => void;
    };
  }
}

let carga: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  carga ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      carga = null;
      script.remove();
      reject(new Error('turnstile_no_cargo'));
    };
    document.head.appendChild(script);
  });
  return carga;
}

/** Token de un solo uso para Supabase Auth, o `undefined` si Turnstile no está configurado. */
export async function obtenerTokenCaptcha(idioma: 'es' | 'en' = 'es'): Promise<string | undefined> {
  if (!turnstileActivo) return undefined;
  await cargarScript();
  const turnstile = window.turnstile;
  if (!turnstile) throw new Error('turnstile_no_cargo');

  return new Promise<string>((resolve, reject) => {
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100';
    document.body.appendChild(caja);

    const widget: { id?: string } = {};
    let terminado = false;
    const terminar = (accion: () => void) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(limite);
      // Se quita fuera del callback del propio widget.
      setTimeout(() => {
        if (widget.id) turnstile.remove(widget.id);
        caja.remove();
      }, 0);
      accion();
    };
    const fallo = () => terminar(() => reject(new Error('captcha_fallo')));
    const limite = setTimeout(fallo, ESPERA_MAX_MS);

    widget.id = turnstile.render(caja, {
      sitekey: SITE_KEY,
      appearance: 'interaction-only',
      language: idioma,
      callback: (token) => terminar(() => resolve(token)),
      'error-callback': fallo,
      'expired-callback': fallo,
      'timeout-callback': fallo,
    });
  });
}
