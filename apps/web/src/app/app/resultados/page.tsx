import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ResultsView } from './results-view';

export const metadata: Metadata = { title: t('results.metaTitle') };

export default function ResultsPage() {
  return <ResultsView />;
}
