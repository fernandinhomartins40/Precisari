import type { Metadata } from 'next';
import { messages, t } from '@/i18n';
import { LegalPage } from '@/components/landing/legal-page';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `${t('legal.deletionTitle')} — ${t('common.appName')}`,
  description: t('legal.deletionMeta'),
};

/** Public on purpose: Google Play requires a deletion URL that works without signing in. */
export default function AccountDeletionPage() {
  return (
    <LegalPage title={t('legal.deletionTitle')} sections={messages.legal.deletion}>
      <p>{t('legal.deletionMeta')}</p>
      <ButtonLink href="/entrar?next=/app/conta">{t('legal.deletionCta')}</ButtonLink>
    </LegalPage>
  );
}
