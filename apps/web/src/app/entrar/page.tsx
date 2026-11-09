import type { Metadata } from 'next';
import { Suspense } from 'react';
import { t } from '@/i18n';
import { LoginFlow } from './login-flow';

export const metadata: Metadata = { title: t('login.metaTitle') };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  );
}
