import type { Metadata } from 'next';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.metaTitle'), robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
