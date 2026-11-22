import type { NextRequest } from 'next/server';

import { manifiestoPortal, respuestaManifiesto } from '@/lib/pwa';

/** Manifiesto de la app del huésped para ESTA habitación (el ícono abre su portal). */
export async function GET(_req: NextRequest, ctx: RouteContext<'/p/[codigo]/manifest.webmanifest'>) {
  const { codigo } = await ctx.params;
  return respuestaManifiesto(manifiestoPortal(decodeURIComponent(codigo)));
}
