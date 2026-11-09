import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { t } from '@/i18n';
import { SiteFooter, SiteHeader } from './site-chrome';
import s from './legal.module.css';

export function LegalPage({ title, sections }: { title: string; sections: readonly { title: string; body: string }[] }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className={s.main}>
        <Link href="/" className={s.back}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('legal.backHome')}
        </Link>
        <h1>{title}</h1>
        <p className={s.meta}>{t('legal.updated')}</p>
        <p className={s.notice}>{t('legal.draftNotice')}</p>
        {sections.map((sec) => (
          <section key={sec.title} className={s.section}>
            <h2>{sec.title}</h2>
            <p>{sec.body}</p>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
