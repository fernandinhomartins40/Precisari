'use client';

import { RequireAuth } from '@/lib/auth';
import { PropertyProvider } from '@/lib/property-context';
import { AppShell, ShellSplash } from '@/components/app/shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth fallback={<ShellSplash />}>
      <PropertyProvider>
        <AppShell>{children}</AppShell>
      </PropertyProvider>
    </RequireAuth>
  );
}
