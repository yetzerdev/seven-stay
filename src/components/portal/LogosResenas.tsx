/**
 * Marcas de las plataformas de reseñas, en SVG (sin depender de imágenes externas).
 * Son decorativas: el nombre de la plataforma va como texto en el botón.
 */

/** "G" de Google en sus cuatro colores oficiales. */
export function LogoGoogle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Búho de Tripadvisor sobre su círculo verde. */
export function LogoTripadvisor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <circle cx="12" cy="12" r="12" fill="#34E0A1" />
      {/* Cabeza */}
      <path d="M3.6 10.2C6 7.9 9 7.1 12 7.1s6 .8 8.4 3.1" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      {/* Ojos */}
      <circle cx="7.9" cy="12.9" r="3.3" fill="#fff" stroke="#000" strokeWidth="1.5" />
      <circle cx="16.1" cy="12.9" r="3.3" fill="#fff" stroke="#000" strokeWidth="1.5" />
      <circle cx="7.9" cy="12.9" r="1.45" fill="#000" />
      <circle cx="16.1" cy="12.9" r="1.45" fill="#000" />
      {/* Pico */}
      <path d="M10.7 15.4 12 17.5l1.3-2.1Z" fill="#000" />
    </svg>
  );
}
