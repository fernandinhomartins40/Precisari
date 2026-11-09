import type { Metadata } from 'next';
import { messages, t } from '@/i18n';
import { LegalPage } from '@/components/landing/legal-page';

export const metadata: Metadata = { title: `${t('legal.termsTitle')} — ${t('common.appName')}` };

export default function TermsPage() {
  return <LegalPage title={t('legal.termsTitle')} sections={messages.legal.terms} />;
}
