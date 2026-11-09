import type { Metadata } from 'next';
import { t } from '@/i18n';
import { PropertiesView } from './properties-view';

export const metadata: Metadata = { title: t('properties.metaTitle') };

export default function PropertiesPage() {
  return <PropertiesView />;
}
