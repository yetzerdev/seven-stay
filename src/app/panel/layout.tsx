import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PanelShell } from '@/components/panel/PanelShell';
import { PanelStayProvider } from '@/context/PanelStayProvider';

/**
 * Layout del Panel del Hotel. El proveedor abre la sesión de Supabase y lee el
 * hotel del usuario; el cascarón es cliente (ruta activa). El Suspense deja
 * prerenderizar el resto.
 */
export const metadata: Metadata = {
  title: 'Panel · Seven Stay',
  // App instalable del panel (tablet o teléfono de recepción).
  manifest: '/panel/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Panel 7Stay', statusBarStyle: 'default' },
};

export default function PanelLayout({ children }: LayoutProps<'/panel'>) {
  return (
    <Suspense fallback={<div className="min-h-dvh flex-1 bg-[#F8F9FA]" />}>
      <PanelStayProvider>
        <PanelShell>{children}</PanelShell>
      </PanelStayProvider>
    </Suspense>
  );
}
