import { Suspense } from 'react';

import { MarcoMovil, PortalShell } from './PortalShell';

/**
 * Layout del Portal del Huésped. El shell es un componente cliente (lee el
 * código de la URL y el estado de StayContext); el Suspense le permite a
 * Next prerenderizar el marco vacío y completar el resto en el navegador.
 */
export default function PortalHuespedLayout({ children }: LayoutProps<'/p/[codigo]'>) {
  return (
    <Suspense fallback={<MarcoMovil>{null}</MarcoMovil>}>
      <PortalShell>{children}</PortalShell>
    </Suspense>
  );
}
