'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import BarraImprimir from '@/components/admin/facturacion/BarraImprimir';
import { FacturaImpresa } from '@/components/admin/facturacion/Documentos';
import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError } from '@/components/admin/ui';
import type { Factura } from '@/lib/admin/tipos';

/** Factura SAR lista para imprimir o guardar como PDF. */
export default function FacturaPdfPage() {
  const { id } = useParams<{ id: string }>();
  const { llamar } = useAdmin();
  const [f, setF] = useState<Factura | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar('factura', { id }).then(
      (x) => vivo && setF(x),
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar, id]);

  // El nombre del PDF al guardarlo sale del título de la pestaña.
  useEffect(() => {
    if (f) document.title = `Factura ${f.numero} - ${f.cliente_nombre}`;
  }, [f]);

  if (error) return <AvisoError mensaje={error} />;
  if (!f) return <Loader2 aria-label="Cargando" className="mx-auto mt-20 h-6 w-6 animate-spin text-neutral-400" />;
  return (
    <main>
      <BarraImprimir titulo={`Factura ${f.numero}`} />
      <FacturaImpresa f={f} />
    </main>
  );
}
