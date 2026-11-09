import type { Metadata } from 'next';
import { t } from '@/i18n';
import { TodayView } from './today-view';

export const metadata: Metadata = { title: t('today.metaTitle') };

export default function TodayPage() {
  return <TodayView />;
}
