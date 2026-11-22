/*
 * Service worker de Seven Stay.
 * Solo muestra las notificaciones push y abre la pantalla correcta al tocarlas.
 * No guarda páginas en caché: los datos de las solicitudes siempre son en vivo.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { titulo: 'Seven Stay', cuerpo: event.data ? event.data.text() : '' };
  }
  const titulo = datos.titulo || 'Seven Stay';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || '',
      icon: '/iconos/icono-192.png',
      badge: '/iconos/insignia-96.png',
      // Una notificación por solicitud: si cambia de estado, reemplaza a la anterior.
      tag: datos.etiqueta || undefined,
      renotify: Boolean(datos.etiqueta),
      data: { url: datos.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Si la app ya está abierta, se reutiliza esa ventana.
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin && 'focus' in ventana) {
          await ventana.focus();
          if ('navigate' in ventana) await ventana.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
