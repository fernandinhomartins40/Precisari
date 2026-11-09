import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { t } from '@/i18n';
import { SiteFooter, SiteHeader } from './site-chrome';
import s from './legal.module.css';

export interface LegalSection {
  title: string;
  body?: string;
  items?: readonly string[];
}

export function LegalPage({ title, sections, children }: { title: string; sections: readonly LegalSection[]; children?: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className={s.main}>
        <Link href="/" className={s.back}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('legal.backHome')}
        </Link>
        <h1>{title}</h1>
        <p className={s.meta}>{t('legal.updated')}</p>
        {children}
        {sections.map((sec) => (
          <section key={sec.title} className={s.section}>
            <h2>{sec.title}</h2>
            {sec.body ? <p>{sec.body}</p> : null}
            {sec.items ? (
              <ul>
                {sec.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
