import type { Metadata } from 'next';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('checkout.metaTitle') };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
