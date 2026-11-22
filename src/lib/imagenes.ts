'use client';

/**
 * Compresión de fotos en el navegador (canvas), antes de subirlas a Storage.
 * La usan el reporte de mantenimiento del huésped y las fotos del menú.
 */

/** Bytes reales que ocupa el contenido base64 de un data URL. */
export function bytesDeDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

async function decodificarImagen(archivo: File): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number }> {
  // createImageBitmap respeta la orientación EXIF de las fotos del celular.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height };
    } catch {
      // se intenta con <img>
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redimensiona la foto (lado mayor ≤ `ladoMax`) y la exporta como JPEG. Si aun
 * así pesa más de `bytesMax`, baja la calidad y luego el tamaño hasta que quepa.
 */
export async function comprimirFoto(
  archivo: File,
  { ladoMax = 1024, bytesMax = 200 * 1024 }: { ladoMax?: number; bytesMax?: number } = {},
): Promise<string> {
  const { fuente, ancho, alto } = await decodificarImagen(archivo);
  let escala = Math.min(1, ladoMax / Math.max(ancho, alto));

  for (let intento = 0; intento < 6; intento++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ancho * escala));
    canvas.height = Math.max(1, Math.round(alto * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);

    for (const calidad of [0.75, 0.65, 0.55, 0.45]) {
      const dataUrl = canvas.toDataURL('image/jpeg', calidad);
      if (bytesDeDataUrl(dataUrl) <= bytesMax) return dataUrl;
    }
    escala *= 0.75;
  }
  throw new Error(`No se pudo comprimir por debajo de ${Math.round(bytesMax / 1024)} KB`);
}
