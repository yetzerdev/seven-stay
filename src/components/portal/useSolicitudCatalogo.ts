'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { generarIdempotencyKey, useStay } from '@/context/StayContext';
import type { CatalogoItem } from '@/types/sevenstay';

/**
 * Lógica compartida para reservar un tour o pedir un plato: abre/cierra la
 * hoja, crea el ticket (con bloqueo de doble toque e idempotencia) y, tras la
 * animación de confirmación, abre el seguimiento del ticket.
 */
export function useSolicitudCatalogo(habitacionNumero: string, base: string) {
  const router = useRouter();
  const { crearTicket, idioma } = useStay();

  const [item, setItem] = useState<CatalogoItem | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ codigo: string; ticketId: string } | null>(null);
  const bloqueado = useRef(false);
  const claveIdempotencia = useRef<string | null>(null);

  const abrir = (nuevo: CatalogoItem) => {
    claveIdempotencia.current = null; // cada ítem abierto es una solicitud nueva
    setError(null);
    setItem(nuevo);
  };

  const cerrar = useCallback(() => {
    if (!bloqueado.current) setItem(null);
  }, []);

  const confirmar = async (cantidad: number, nota: string) => {
    if (!item || bloqueado.current) return;
    bloqueado.current = true;
    setEnviando(true);
    setError(null);
    claveIdempotencia.current ??= generarIdempotencyKey();

    const resultado = await crearTicket({
      habitacion_numero: habitacionNumero,
      categoria: item.tipo === 'tour' ? 'tour' : 'room_service',
      idempotency_key: claveIdempotencia.current,
      idioma_huesped: idioma,
      nota,
      detalle_catalogo: {
        catalogo_item_id: item.id,
        titulo: idioma === 'es' ? item.titulo_es : item.titulo_en,
        cantidad,
        precio: item.precio,
        moneda: item.moneda,
      },
    });

    if (!resultado.ok) {
      bloqueado.current = false;
      setEnviando(false);
      setError(resultado.error);
      return;
    }
    setItem(null);
    setConfirmado({ codigo: resultado.ticket.codigo_corto, ticketId: resultado.ticket.id });
  };

  const alTerminarConfirmacion = () => {
    if (confirmado) router.push(`${base}/ticket/${confirmado.ticketId}`);
    // Next conserva el estado de la página al salir (cacheComponents): se
    // reinicia tras navegar para que al volver no se repita la confirmación.
    setTimeout(() => {
      setConfirmado(null);
      setEnviando(false);
      bloqueado.current = false;
      claveIdempotencia.current = null;
    }, 400);
  };

  return { item, enviando, error, confirmado, idioma, abrir, cerrar, confirmar, alTerminarConfirmacion };
}
