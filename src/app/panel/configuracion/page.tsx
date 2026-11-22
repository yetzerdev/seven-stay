'use client';

import FormularioHotel from '@/components/panel/FormularioHotel';

/**
 * Configuración del hotel: Wi-Fi, horarios y notas/políticas para el huésped.
 * Los tours no se gestionan aquí: los opera, cobra y administra Seven Stay.
 */
export default function ConfiguracionHotelPage() {
  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-neutral-900">Configuración Hotel</h1>
        <p className="mt-1 text-[15px] text-neutral-500">Wi-Fi, horarios y políticas. Los cambios se ven al instante en el portal del huésped.</p>
      </header>
      <div className="max-w-[880px]">
        <FormularioHotel />
      </div>
    </main>
  );
}
