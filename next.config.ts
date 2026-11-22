import type { NextConfig } from "next";

/** Cabeceras de seguridad para todas las rutas (portal y panel). */
const CABECERAS_SEGURIDAD = [
  // Nadie puede meter la app dentro de un iframe (evita clickjacking en el panel).
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no "adivina" tipos de archivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir hacia otro sitio (WhatsApp, reseñas) solo se envía el dominio, nunca el código de la placa.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Permite abrir el servidor de desarrollo desde el celular en la red local
  // (sin esto Next bloquea los recursos de desarrollo y la página no responde).
  allowedDevOrigins: ["192.168.*.*"],
  async headers() {
    return [
      { source: "/:path*", headers: CABECERAS_SEGURIDAD },
      // Service worker de la PWA: nunca en caché, para que las actualizaciones lleguen enseguida.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
