'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Bucket privado de Supabase Storage con las fotos de mantenimiento (≤ 2 MB, solo imágenes). */
export const BUCKET_FOTOS = 'fotos-mantenimiento';

/** Las URL firmadas duran 1 hora; se piden de nuevo al volver a mostrar la foto. */
const DURACION_URL_S = 60 * 60;

/** data URL (JPEG ya comprimido en el navegador) → Blob para subir. */
export async function blobDeDataUrl(dataUrl: string): Promise<Blob> {
  const respuesta = await fetch(dataUrl);
  return respuesta.blob();
}

/**
 * URL temporal para mostrar una foto privada. Storage aplica RLS: el huésped
 * solo ve las suyas y el personal, las de su hotel.
 * Devuelve `null` mientras carga o si no hay permiso.
 */
export function useUrlFoto(cliente: SupabaseClient | null, ruta: string | null | undefined): string | null {
  const [firmada, setFirmada] = useState<{ ruta: string; url: string } | null>(null);

  useEffect(() => {
    if (!cliente || !ruta) return;
    let cancelado = false;
    void cliente.storage
      .from(BUCKET_FOTOS)
      .createSignedUrl(ruta, DURACION_URL_S)
      .then(({ data }) => {
        if (!cancelado && data?.signedUrl) setFirmada({ ruta, url: data.signedUrl });
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, ruta]);

  return firmada && firmada.ruta === ruta ? firmada.url : null;
}
