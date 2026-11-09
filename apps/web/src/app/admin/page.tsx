'use client';

import { RequireAuth } from '@/lib/auth';
import { ShellSplash } from '@/components/app/shell';
import { AdminView } from './admin-view';

export default function AdminPage() {
  return (
    <RequireAuth fallback={<ShellSplash />}>
      <AdminView />
    </RequireAuth>
  );
}
