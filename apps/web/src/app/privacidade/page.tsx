import type { Metadata } from 'next';
import { messages, t } from '@/i18n';
import { LegalPage } from '@/components/landing/legal-page';

export const metadata: Metadata = { title: `${t('legal.privacyTitle')} — ${t('common.appName')}` };

export default function PrivacyPage() {
  return <LegalPage title={t('legal.privacyTitle')} sections={messages.legal.privacy} />;
}
