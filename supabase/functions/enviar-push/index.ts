// Seven Stay · Envío de notificaciones push.
//
// La dispara un Database Webhook de Supabase en INSERT y UPDATE de `tickets`.
//  - Solicitud nueva (o escalada) → personal del hotel suscrito.
//  - Cambio de estado (en camino, resuelta, no aprobada) → el huésped que la creó.
// Los tours de Seven Stay no avisan al hotel (los gestiona Seven Stay).
//
// Secretos necesarios (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACTO (ej. mailto:soporte@tudominio.com),
//   WEBHOOK_SECRET (el mismo valor que se pone en la cabecera del webhook).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

type Fila = Record<string, unknown>;
interface Aviso {
  titulo: string;
  cuerpo: string;
  url: string;
  etiqueta: string;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(
  Deno.env.get('VAPID_CONTACTO') ?? 'mailto:soporte@sevenstay.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const CATEGORIAS: Record<string, { es: string; en: string }> = {
  housekeeping: { es: 'Limpieza y amenidades', en: 'Housekeeping' },
  mantenimiento: { es: 'Reporte de falla', en: 'Maintenance report' },
  tour: { es: 'Reserva de tour', en: 'Tour booking' },
  room_service: { es: 'Pedido a la habitación', en: 'Room service order' },
};

function queEs(t: Fila, idioma: 'es' | 'en'): string {
  const catalogo = t.detalle_catalogo as { titulo?: string } | null;
  return catalogo?.titulo || CATEGORIAS[String(t.categoria)]?.[idioma] || 'Solicitud';
}

/** Aviso para el personal del hotel, o null si no corresponde. */
function avisoStaff(tipo: string, t: Fila, previo: Fila | null): Aviso | null {
  if (t.categoria === 'tour' && !t.tour_propio) return null;
  const base = { url: `/panel/solicitudes/${t.id}`, etiqueta: `staff-${t.id}` };
  const hab = `Hab. ${t.habitacion_numero}`;
  if (tipo === 'INSERT') {
    const espera = t.estado === 'pendiente_validacion_hab' ? ' · figura vacía, valida el check-in' : '';
    return { ...base, titulo: `${t.urgente ? 'Urgente · ' : ''}Nueva solicitud · ${hab}`, cuerpo: `${queEs(t, 'es')}${espera}` };
  }
  if (tipo === 'UPDATE' && t.en_alerta_servicio && !previo?.en_alerta_servicio) {
    return { ...base, titulo: `Solicitud escalada · ${hab}`, cuerpo: `${queEs(t, 'es')} · necesita prioridad` };
  }
  return null;
}

/** Aviso para el huésped cuando su solicitud cambia de estado, o null. */
function avisoHuesped(t: Fila, previo: Fila | null, codigo: string): Aviso | null {
  if (!previo || t.estado === previo.estado) return null;
  const en = t.idioma_huesped === 'en';
  const que = queEs(t, en ? 'en' : 'es');
  const textos: Record<string, [string, string]> = en
    ? {
        aceptado: ['Your request is on its way', t.asignado_a_nombre ? `${que} · ${t.asignado_a_nombre} is on it` : que],
        resuelto: ['Request completed', `${que} · Thank you for your patience!`],
        rechazado: ['Request not approved', `${que} · Tap to see the details`],
      }
    : {
        aceptado: ['Tu solicitud va en camino', t.asignado_a_nombre ? `${que} · La atiende ${t.asignado_a_nombre}` : que],
        resuelto: ['Solicitud resuelta', `${que} · ¡Gracias por tu paciencia!`],
        rechazado: ['Solicitud no aprobada', `${que} · Toca para ver el detalle`],
      };
  const texto = textos[String(t.estado)];
  if (!texto) return null;
  return {
    titulo: texto[0],
    cuerpo: texto[1],
    url: `/p/${encodeURIComponent(codigo)}/ticket/${t.id}`,
    etiqueta: `ticket-${t.id}`,
  };
}

async function enviar(suscripciones: Fila[], aviso: Aviso) {
  const vencidas: string[] = [];
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
          JSON.stringify(aviso),
          { TTL: 60 * 60 * 6, urgency: 'high' },
        );
      } catch (error) {
        const codigo = (error as { statusCode?: number }).statusCode;
        // 404/410: el teléfono ya no tiene esa suscripción (app borrada, permiso quitado).
        if (codigo === 404 || codigo === 410) vencidas.push(String(s.id));
        else console.error('push fallido', codigo, (error as Error).message);
      }
    }),
  );
  if (vencidas.length) await supabase.from('push_suscripciones').delete().in('id', vencidas);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('No autorizado', { status: 401 });
  }
  const { type: tipo, record: t, old_record: previo } = (await req.json()) as { type: string; record: Fila; old_record: Fila | null };
  if (!t?.id) return new Response('sin datos', { status: 200 });

  const tareas: Promise<unknown>[] = [];

  const staff = avisoStaff(tipo, t, previo);
  if (staff) {
    tareas.push(
      (async () => {
        const { data } = await supabase.from('push_suscripciones').select('*').eq('tipo', 'staff').eq('hotel_id', t.hotel_id);
        if (data?.length) await enviar(data, staff);
      })(),
    );
  }

  if (tipo === 'UPDATE' && t.creado_por) {
    tareas.push(
      (async () => {
        const { data: room } = await supabase.from('rooms').select('codigo_placa').eq('id', t.room_id).maybeSingle();
        const aviso = room ? avisoHuesped(t, previo, String(room.codigo_placa)) : null;
        if (!aviso) return;
        const { data } = await supabase
          .from('push_suscripciones')
          .select('*')
          .eq('tipo', 'huesped')
          .eq('user_id', t.creado_por)
          .eq('room_id', t.room_id);
        if (data?.length) await enviar(data, aviso);
      })(),
    );
  }

  await Promise.all(tareas);
  return new Response('ok', { status: 200 });
});
