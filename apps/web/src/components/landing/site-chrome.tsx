import Link from 'next/link';
import { t } from '@/i18n';
import { ButtonLink } from '../ui/button';
import { Logo, ThemeToggle } from '../ui/primitives';
import s from './landing.module.css';

export function SiteHeader() {
  return (
    <header className={s.header}>
      <div className={s.headerInner}>
        <Logo href="/" width={176} priority />
        <nav aria-label={t('landing.nav.label')} className={s.nav}>
          <Link href="/#como-funciona" className={s.navLink}>
            {t('landing.nav.how')}
          </Link>
          <Link href="/#planos" className={s.navLink}>
            {t('landing.nav.plans')}
          </Link>
          <Link href="/entrar" className={s.navLogin}>
            {t('landing.nav.login')}
          </Link>
          <ThemeToggle />
          <ButtonLink href="/entrar" className={s.navCta}>
            {t('landing.nav.start')}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <Logo href="/" width={140} />
        <p className={s.footerCopy}>{t('landing.footer.copyright', { year: new Date().getFullYear() })}</p>
        <nav aria-label={t('landing.footer.label')} className={s.footerNav}>
          <Link href="/privacidade">{t('landing.footer.privacy')}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/termos">{t('landing.footer.terms')}</Link>
        </nav>
      </div>
    </footer>
  );
}
