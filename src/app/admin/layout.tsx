import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminShell } from '@/components/admin/AdminShell';
import { SesionAdminProvider } from '@/components/admin/SesionAdmin';

export const metadata: Metadata = {
  title: 'Seven Stay · Interno',
  robots: { index: false, follow: false },
};

/** Panel interno de Seven Stay (solo el equipo de Seven Stay). */
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<div className="min-h-dvh flex-1 bg-[#F8F9FA]" />}>
      <SesionAdminProvider>
        <AdminShell>{children}</AdminShell>
      </SesionAdminProvider>
    </Suspense>
  );
}
