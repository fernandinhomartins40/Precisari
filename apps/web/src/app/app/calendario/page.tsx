import type { Metadata } from 'next';
import { Suspense } from 'react';
import { t } from '@/i18n';
import { CalendarView } from './calendar-view';

export const metadata: Metadata = { title: t('calendar.metaTitle') };

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
