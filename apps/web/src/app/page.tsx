import Image from 'next/image';
import { ArrowRight, CalendarDays, ChevronRight, Flame, Tag, ToggleRight } from 'lucide-react';
import { formatBRL } from '@precisari/shared';
import { t } from '@/i18n';
import { todayIso } from '@/lib/dates';
import { MiniCalendar } from '@/components/landing/mini-calendar';
import { Pricing } from '@/components/landing/pricing';
import { SiteFooter, SiteHeader } from '@/components/landing/site-chrome';
import { ButtonLink } from '@/components/ui/button';
import s from '@/components/landing/landing.module.css';

/** Re-render daily so the hero calendar always shows the current month. */
export const revalidate = 86400;

export default function LandingPage() {
  const today = todayIso();
  const features = [
    { icon: <Tag size={30} />, title: t('landing.features.explainedTitle'), text: t('landing.features.explainedText') },
    { icon: <CalendarDays size={30} />, title: t('landing.features.brazilTitle'), text: t('landing.features.brazilText') },
    { icon: <ToggleRight size={30} />, title: t('landing.features.decideTitle'), text: t('landing.features.decideText') },
  ];
  const steps = [
    { title: t('landing.how.step1Title'), text: t('landing.how.step1Text') },
    { title: t('landing.how.step2Title'), text: t('landing.how.step2Text') },
    { title: t('landing.how.step3Title'), text: t('landing.how.step3Text') },
  ];
  const examples = [
    { label: t('landing.how.exampleFri'), price: formatBRL(29900, { whole: true }), hot: false },
    { label: t('landing.how.exampleSat'), price: formatBRL(34900, { whole: true }), hot: true },
    { label: t('landing.how.exampleSun'), price: formatBRL(27900, { whole: true }), hot: false },
  ];
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <p className={s.eyebrow}>{t('landing.hero.eyebrow')}</p>
            <h1 id="hero-title" className={s.heroTitle}>
              {t('landing.hero.titleLine1')} <br />
              {t('landing.hero.titleLine2Prefix')} <span className={s.highlight}>{t('landing.hero.titleHighlight')}</span>
            </h1>
            <p className={s.heroSubtitle}>{t('landing.hero.subtitle')}</p>
            <div className={s.heroActions}>
              <ButtonLink href="/entrar" size="lg">
                {t('landing.hero.cta')} <ChevronRight size={20} aria-hidden="true" />
              </ButtonLink>
              <a href="#como-funciona" className={s.textLink}>
                {t('landing.hero.secondary')}
              </a>
            </div>
            <p className={s.heroNote}>{t('landing.hero.note')}</p>
          </div>
          <div className={s.heroVisual}>
            <div className={s.heroPhoto}>
              <Image src="/brand/hero-apartamento-litoral.webp" alt={t('landing.hero.photoAlt')} fill priority sizes="(max-width: 1023px) 100vw, 60vw" />
            </div>
            <MiniCalendar today={today} />
          </div>
        </section>

        <section className={s.band} aria-label={t('landing.features.explainedTitle')}>
          <div className={s.bandInner}>
            {features.map((f) => (
              <div key={f.title} className={s.feature}>
                <span className={s.featureIcon} aria-hidden="true">
                  {f.icon}
                </span>
                <h2>{f.title}</h2>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className={s.section} aria-labelledby="how-title">
          <div className={s.sectionHead}>
            <h2 id="how-title" className={s.sectionTitle}>
              {t('landing.how.titleLine1')}
              <br />
              {t('landing.how.titleLine2')}
            </h2>
            <p className={s.sectionLead}>{t('landing.how.lead')}</p>
          </div>
          <ol className={s.steps}>
            {steps.map((st, i) => (
              <li key={st.title} className={s.step}>
                <span className={s.stepNum} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
          <div className={s.example}>
            <div className={s.exampleCards} role="list" aria-label={t('landing.how.exampleAria')}>
              {examples.map((e) => (
                <div key={e.label} role="listitem" className={[s.exampleCard, e.hot ? s.exampleHot : ''].join(' ')}>
                  <span>{e.label}</span>
                  <strong className="tabular">{e.price}</strong>
                  {e.hot ? (
                    <span className={s.exampleTag}>
                      <Flame size={14} aria-hidden="true" /> {t('landing.how.exampleHot')}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className={s.exampleText}>
              <h3>{t('landing.how.exampleTitle')}</h3>
              <p>{t('landing.how.exampleText')}</p>
            </div>
          </div>
        </section>

        <section id="planos" className={[s.section, s.pricing].join(' ')} aria-labelledby="pricing-title">
          <div className={s.pricingIntro}>
            <h2 id="pricing-title" className={s.sectionTitle}>
              {t('landing.pricing.titleLine1')}
              <br />
              {t('landing.pricing.titleLine2')}
            </h2>
            <p className={s.sectionLeadPlain}>{t('landing.pricing.lead')}</p>
            <p className={s.pricingNote}>{t('landing.pricing.trial')}</p>
            <p className={s.pricingNote}>{t('landing.pricing.yearly')}</p>
          </div>
          <Pricing />
        </section>

        <section className={s.ctaBand} aria-labelledby="cta-title">
          <div className={s.ctaInner}>
            <h2 id="cta-title">{t('landing.finalCta.title')}</h2>
            <ButtonLink href="/entrar" size="lg">
              {t('landing.finalCta.button')} <ArrowRight size={20} aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
