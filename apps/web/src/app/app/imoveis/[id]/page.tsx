import type { Metadata } from 'next';
import { t } from '@/i18n';
import { PropertySettings } from './property-settings';

export const metadata: Metadata = { title: t('propertySettings.metaTitle') };

export default async function PropertySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PropertySettings id={id} />;
}
