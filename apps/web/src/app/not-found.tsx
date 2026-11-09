import { Compass } from 'lucide-react';
import { t } from '@/i18n';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';
import { SiteHeader } from '@/components/landing/site-chrome';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <EmptyState icon={<Compass size={28} />} title={t('common.notFoundTitle')} text={t('common.notFoundText')} action={<ButtonLink href="/">{t('common.notFoundCta')}</ButtonLink>} />
      </main>
    </>
  );
}
