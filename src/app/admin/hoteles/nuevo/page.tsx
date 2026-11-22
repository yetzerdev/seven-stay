'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import FormularioHotelAdmin, { HOTEL_NUEVO } from '@/components/admin/FormularioHotelAdmin';

/** Alta de un hotel: al guardar se abre su ficha para agregar habitaciones y usuarios. */
export default function NuevoHotelPage() {
  const router = useRouter();
  return (
    <main className="flex max-w-[900px] flex-col gap-5">
      <Link href="/admin" className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-lg px-2 text-[14.5px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        Hoteles
      </Link>
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Nuevo hotel</h1>
        <p className="mt-1 text-[15px] text-neutral-500">Después agregas sus habitaciones, imprimes las placas e invitas a su gerencia.</p>
      </header>
      <section className="rounded-2xl border border-black/[0.06] bg-white p-6">
        <FormularioHotelAdmin
          inicial={HOTEL_NUEVO}
          textoGuardar="Crear hotel"
          onGuardado={(id) => router.replace(`/admin/hoteles/${id}?pestana=habitaciones`)}
          onCancelar={() => router.push('/admin')}
        />
      </section>
    </main>
  );
}
