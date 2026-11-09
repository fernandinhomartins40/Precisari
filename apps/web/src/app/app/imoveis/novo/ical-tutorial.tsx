'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, Copy, Link2, Pause, Play } from 'lucide-react';
import { messages, t } from '@/i18n';
import { prefersReducedMotion } from '@/lib/clipboard';
import s from './onboarding.module.css';

const STEP_MS = 3200;

/** Animated, illustrative tutorial of where the iCal link lives in Airbnb (generic UI, no third-party branding). */
export function IcalTutorial() {
  const steps = messages.onboarding.ical.tutorialSteps;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion()) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setActive((a) => (a + 1) % steps.length), STEP_MS);
    return () => clearInterval(id);
  }, [playing, steps.length]);

  return (
    <section className={s.tutorial} aria-labelledby="tutorial-title">
      <div className={s.tutorialHead}>
        <h3 id="tutorial-title">{t('onboarding.ical.tutorialTitle')}</h3>
        <button type="button" className={s.playBtn} onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('onboarding.ical.tutorialPause') : t('onboarding.ical.tutorialPlay')}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className={s.tutorialBody}>
        <div className={s.phone} aria-hidden="true">
          <div className={s.phoneNotch} />
          <div className={s.screen} key={active} data-step={active}>
            {active === 0 ? (
              <>
                <div className={s.mockTabs}>
                  <span className={s.mockTabActive}>
                    <CalendarDays size={12} /> {t('onboarding.ical.tutorialScreenAgenda')}
                  </span>
                  <span className={s.mockBar} />
                </div>
                <div className={s.mockGrid}>
                  {Array.from({ length: 21 }, (_, i) => (
                    <span key={i} data-on={i % 5 === 2 || undefined} />
                  ))}
                </div>
                <span className={s.mockTap} />
              </>
            ) : active === 1 ? (
              <>
                <span className={s.mockTitle}>{t('onboarding.ical.tutorialScreenAvailability')}</span>
                <span className={s.mockLine} />
                <span className={s.mockLine} data-short />
                <span className={s.mockRow} data-highlight>
                  <Link2 size={12} /> {t('onboarding.ical.tutorialScreenConnect')} <ChevronRight size={12} />
                </span>
                <span className={s.mockLine} />
              </>
            ) : (
              <>
                <span className={s.mockTitle}>{t('onboarding.ical.tutorialScreenExport')}</span>
                <span className={s.mockUrl}>https://…/calendar/ical/….ics</span>
                <span className={s.mockButton} data-highlight>
                  <Copy size={12} /> {t('onboarding.ical.tutorialCopy')}
                </span>
              </>
            )}
          </div>
        </div>
        <ol className={s.tutorialSteps}>
          {steps.map((st, i) => (
            <li key={st}>
              <button type="button" aria-current={i === active ? 'step' : undefined} onClick={() => setActive(i)}>
                <span className={s.tutorialNum}>{i + 1}</span>
                {st}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
