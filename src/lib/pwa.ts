/**
 * Manifiestos de la PWA. Hay dos apps instalables:
 *  - Portal del huésped: una por habitación (/p/{codigo}), así el ícono del
 *    teléfono abre directo esa habitación.
 *  - Panel del hotel (/panel), para la tablet o el teléfono de recepción.
 */

const ICONOS = [
  { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export function manifiestoPortal(codigo: string) {
  const base = `/p/${encodeURIComponent(codigo)}`;
  return {
    id: base,
    name: 'Seven Stay',
    short_name: 'Seven Stay',
    description: 'Pide toallas, reporta fallas, reserva tours y sigue tus solicitudes.',
    start_url: base,
    // start_url debe quedar dentro del scope, por eso el scope no lleva "/" final.
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8F9FA',
    theme_color: '#F8F9FA',
    lang: 'es',
    icons: ICONOS,
  };
}

export function manifiestoPanel() {
  return {
    id: '/panel',
    name: 'Seven Stay · Panel del hotel',
    short_name: 'Panel 7Stay',
    description: 'Solicitudes de los huéspedes en vivo para recepción y gerencia.',
    start_url: '/panel',
    scope: '/panel',
    display: 'standalone',
    background_color: '#F8F9FA',
    theme_color: '#FFFFFF',
    lang: 'es',
    icons: ICONOS,
  };
}

export function respuestaManifiesto(manifiesto: object): Response {
  return new Response(JSON.stringify(manifiesto), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
