'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import BarraImprimir from '@/components/admin/facturacion/BarraImprimir';
import { CotizacionImpresa } from '@/components/admin/facturacion/Documentos';
import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError } from '@/components/admin/ui';
import type { ConfigFiscal, Cotizacion } from '@/lib/admin/tipos';

/** Cotización (proforma) lista para imprimir o guardar como PDF. */
export default function CotizacionPdfPage() {
  const { id } = useParams<{ id: string }>();
  const { llamar } = useAdmin();
  const [datos, setDatos] = useState<{ cotizacion: Cotizacion; emisor: ConfigFiscal } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('cotizacion', { id }).then(
      (x) => vivo && setDatos(x),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, id]);

  useEffect(() => {
    if (datos) document.title = `Cotización ${datos.cotizacion.numero} - ${datos.cotizacion.cliente_nombre}`;
  }, [datos]);

  if (error) return <AvisoError mensaje={error} />;
  if (!datos) return <Loader2 aria-label="Cargando" className="mx-auto mt-20 h-6 w-6 animate-spin text-neutral-400" />;
  return (
    <main>
      <BarraImprimir titulo={`Cotización ${datos.cotizacion.numero}`} />
      <CotizacionImpresa c={datos.cotizacion} emisor={datos.emisor} />
    </main>
  );
}
