'use client';

import { Suspense } from 'react';
import { RequireAuth } from '@/lib/auth';
import { ShellSplash } from '@/components/app/shell';
import { CheckoutFlow } from './checkout-flow';

export default function CheckoutPage() {
  return (
    <RequireAuth fallback={<ShellSplash />}>
      <Suspense>
        <CheckoutFlow />
      </Suspense>
    </RequireAuth>
  );
}
