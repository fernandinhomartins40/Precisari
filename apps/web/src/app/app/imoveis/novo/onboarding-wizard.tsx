'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Check, Landmark, Mountain, Smartphone, Trees, Waves } from 'lucide-react';
import { PrecisariApiError } from '@precisari/api-client';
import { ErrorCode, formatBRL, parseBRLToCents, type DestinationType, type NightDto, type PlaceDetailsDto, type PropertyDto } from '@precisari/shared';
import { messages, t } from '@/i18n';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { monthsInRange } from '@/lib/calendar-grid';
import { addDays, todayIso } from '@/lib/dates';
import { legendExamples } from '@/lib/heat';
import { useSelectedProperty } from '@/lib/property-context';
import { qk, useNights } from '@/lib/queries';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, NumberStepper, SelectField, Switch } from '@/components/ui/primitives';
import { HeatLegend, HeatMapMonth } from '@/components/calendar/heat-map';
import { IcalTutorial } from './ical-tutorial';
import { AddressStep } from './address-step';
import s from './onboarding.module.css';

const DEST_ICONS: Record<DestinationType, React.ReactNode> = {
  BEACH: <Waves size={26} />,
  MOUNTAIN: <Mountain size={26} />,
  URBAN: <Building2 size={26} />,
  RURAL: <Trees size={26} />,
  CULTURAL: <Landmark size={26} />,
};
const DESTS: DestinationType[] = ['BEACH', 'MOUNTAIN', 'URBAN', 'RURAL', 'CULTURAL'];
const TOTAL = 5;

const ICAL_RE = /^https?:\/\/\S+(\.ics(\?\S*)?$|\/ical\/\S*)/i;

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function Wow({ property }: { property: PropertyDto }) {
  const today = todayIso(property.timezone);
  const end = addDays(today, 89);
  const q = useNights(property.id, today, end);
  const nights = useMemo(() => new Map<string, NightDto>((q.data?.nights ?? []).map((n) => [n.date, n])), [q.data]);
  return (
    <div className={s.wow} data-testid="onboarding-wow">
      <p className={s.wowEyebrow}>
        <Check size={18} aria-hidden="true" /> {t('onboarding.wow.eyebrow')}
      </p>
      <h1>{t('onboarding.wow.title')}</h1>
      <section className={s.wowGain} aria-labelledby="wow-gain">
        <h2 id="wow-gain">{t('onboarding.wow.gainLabel')}</h2>
        <strong className="tabular" data-testid="wow-gain">
          {q.data ? formatBRL(q.data.potentialGain, { whole: true, signed: true }) : '…'}
        </strong>
        <p>{t('onboarding.wow.gainNote')}</p>
      </section>
      {q.data ? (
        <>
          <div className={s.wowMonths}>
            {monthsInRange(today, end).map((m) => (
              <HeatMapMonth key={m} month={m} nights={nights} today={today} rangeEnd={end} compact showTitle />
            ))}
          </div>
          <HeatLegend examples={legendExamples(q.data.nights)} />
        </>
      ) : null}
      <div className={s.wowActions}>
        <ButtonLink href="/app" size="lg">
          {t('onboarding.wow.toToday')}
        </ButtonLink>
        <ButtonLink href="/app/calendario" variant="outline" size="lg">
          {t('onboarding.wow.toCalendar')}
        </ButtonLink>
      </div>
    </div>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useUser();
  const { setPropertyId } = useSelectedProperty();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'form' | 'creating' | 'wow'>('form');
  const [ical, setIcal] = useState('');
  const [listing, setListing] = useState('');
  const [icalError, setIcalError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceDetailsDto | null>(null);
  const [name, setName] = useState('');
  const [dest, setDest] = useState<DestinationType>('BEACH');
  const [base, setBase] = useState('');
  const [min, setMin] = useState('');
  const [cleaning, setCleaning] = useState('');
  const [capacity, setCapacity] = useState(2);
  const [bedrooms, setBedrooms] = useState(1);
  const [hour, setHour] = useState(user.dailyNotificationHour);
  const [weekly, setWeekly] = useState(user.emailWeeklySummary);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<PropertyDto | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (place) setDest(place.suggestedDestinationType);
  }, [place]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, phase]);

  const baseC = parseBRLToCents(base);
  const minC = parseBRLToCents(min);
  const cleaningC = cleaning.trim() === '' ? 0 : parseBRLToCents(cleaning);
  const listingOk = listing.trim() === '' || isUrl(listing.trim());

  const errors = {
    ical: ICAL_RE.test(ical.trim()) ? null : t('onboarding.ical.invalid'),
    listing: listingOk ? null : t('onboarding.ical.listingInvalid'),
    base: baseC && baseC > 0 ? null : t('onboarding.prices.required'),
    min: !minC || minC <= 0 ? t('onboarding.prices.required') : baseC && minC > baseC ? t('onboarding.prices.minError') : null,
    cleaning: cleaningC === null || cleaningC < 0 ? t('validation.money') : null,
  };

  const stepValid = [
    !errors.ical && !errors.listing && icalError === null,
    Boolean(place) && name.trim().length > 0,
    true,
    !errors.base && !errors.min && !errors.cleaning,
    true,
  ][step];

  async function submit() {
    if (!place || !baseC || !minC) return;
    setPhase('creating');
    setSubmitError(null);
    try {
      const prop =
        created ??
        (await api().properties.create({
          name: name.trim(),
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          city: place.city,
          state: place.state,
          ibgeCode: place.ibgeCode,
          destinationType: dest,
          capacity,
          bedrooms,
          basePrice: baseC,
          minPrice: minC,
          cleaningFee: cleaningC ?? 0,
          listingUrl: listing.trim() || null,
        }));
      setCreated(prop);
      await api().properties.connectCalendar(prop.id, ical.trim());
      await api().me.update({ dailyNotificationHour: hour, emailWeeklySummary: weekly }).then((u) => qc.setQueryData(qk.me, u));
      await qc.invalidateQueries({ queryKey: qk.properties });
      await qc.invalidateQueries({ queryKey: ['actions'] });
      setPropertyId(prop.id);
      setPhase('wow');
    } catch (e) {
      setPhase('form');
      if (e instanceof PrecisariApiError && e.code === ErrorCode.ICAL_INVALID) {
        setIcalError(t('onboarding.ical.invalid'));
        setStep(0);
      } else setSubmitError(t('onboarding.createError'));
    }
  }

  const next = () => {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (step < TOTAL - 1) setStep(step + 1);
    else void submit();
  };

  if (phase === 'wow' && created) return <Wow property={created} />;

  return (
    <div className={s.wizard}>
      <div className={s.progressWrap}>
        <p className={s.stepOf}>{t('onboarding.stepOf', { current: step + 1, total: TOTAL })}</p>
        <ol className={s.progress} aria-label={t('onboarding.progressLabel')}>
          {messages.onboarding.steps.map((label, i) => (
            <li key={label} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} aria-current={i === step ? 'step' : undefined}>
              <span className={s.progressBar} />
              <span className={s.progressLabel}>{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <form
        className={s.card}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        {phase === 'creating' ? (
          <div className={s.creating} role="status">
            <span className={s.creatingDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <h2 tabIndex={-1} ref={headingRef}>
              {t('onboarding.creating')}
            </h2>
          </div>
        ) : (
          <>
            {step === 0 ? (
              <div className={s.stepBody}>
                <div className={s.stepHead}>
                  <h2 tabIndex={-1} ref={headingRef}>
                    {t('onboarding.ical.title')}
                  </h2>
                  <p>{t('onboarding.ical.text')}</p>
                </div>
                <IcalTutorial />
                <Field
                  label={t('onboarding.ical.label')}
                  placeholder={t('onboarding.ical.placeholder')}
                  value={ical}
                  inputMode="url"
                  onChange={(e) => {
                    setIcal(e.target.value);
                    setIcalError(null);
                  }}
                  error={icalError ?? (showErrors ? errors.ical : null)}
                />
                <Field
                  label={`${t('onboarding.ical.listingLabel')} (${t('common.optional')})`}
                  placeholder={t('onboarding.ical.listingPlaceholder')}
                  hint={t('onboarding.ical.listingHint')}
                  value={listing}
                  inputMode="url"
                  onChange={(e) => setListing(e.target.value)}
                  error={showErrors ? errors.listing : null}
                />
              </div>
            ) : null}

            {step === 1 ? (
              <div className={s.stepBody}>
                <div className={s.stepHead}>
                  <h2 tabIndex={-1} ref={headingRef}>
                    {t('onboarding.address.title')}
                  </h2>
                  <p>{t('onboarding.address.text')}</p>
                </div>
                <AddressStep place={place} onPlace={setPlace} name={name} onName={setName} />
                {showErrors && !stepValid ? <p className={s.error}>{t('validation.required')}</p> : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className={s.stepBody}>
                <div className={s.stepHead}>
                  <h2 tabIndex={-1} ref={headingRef}>
                    {t('onboarding.type.title')}
                  </h2>
                  <p>{t('onboarding.type.text')}</p>
                </div>
                <div role="radiogroup" aria-label={t('onboarding.type.groupLabel')} className={s.destGrid}>
                  {DESTS.map((d) => (
                    <label key={d} className={s.dest} data-checked={dest === d || undefined}>
                      <input type="radio" name="dest" value={d} checked={dest === d} onChange={() => setDest(d)} className="visually-hidden" />
                      <span className={s.destIcon} aria-hidden="true">
                        {DEST_ICONS[d]}
                      </span>
                      <span className={s.destName}>
                        {t(`property.destination.${d}`)}
                        {place?.suggestedDestinationType === d ? <span className={s.suggested}>{t('onboarding.type.suggested')}</span> : null}
                      </span>
                      <span className={s.destHint}>{t(`property.destinationHint.${d}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className={s.stepBody}>
                <div className={s.stepHead}>
                  <h2 tabIndex={-1} ref={headingRef}>
                    {t('onboarding.prices.title')}
                  </h2>
                  <p>{t('onboarding.prices.text')}</p>
                </div>
                <div className={s.priceGrid}>
                  <Field label={t('onboarding.prices.base')} prefix={t('common.currency')} inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} error={showErrors ? errors.base : null} placeholder={t('onboarding.prices.basePlaceholder')} />
                  <Field label={t('onboarding.prices.min')} prefix={t('common.currency')} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} error={showErrors ? errors.min : null} placeholder={t('onboarding.prices.minPlaceholder')} />
                  <Field
                    label={t('onboarding.prices.cleaning')}
                    prefix={t('common.currency')}
                    inputMode="decimal"
                    value={cleaning}
                    onChange={(e) => setCleaning(e.target.value)}
                    error={showErrors ? errors.cleaning : null}
                    placeholder={t('onboarding.prices.cleaningPlaceholder')}
                  />
                </div>
                <div className={s.priceGrid}>
                  <NumberStepper label={t('onboarding.prices.capacity')} value={capacity} min={1} max={50} onChange={setCapacity} />
                  <NumberStepper label={t('onboarding.prices.bedrooms')} value={bedrooms} min={0} max={30} onChange={setBedrooms} />
                </div>
                {baseC ? <p className={s.hint}>{t('onboarding.prices.maxHint', { price: formatBRL(baseC * 3, { whole: true }) })}</p> : null}
              </div>
            ) : null}

            {step === 4 ? (
              <div className={s.stepBody}>
                <div className={s.stepHead}>
                  <h2 tabIndex={-1} ref={headingRef}>
                    {t('onboarding.notifications.title')}
                  </h2>
                  <p>{t('onboarding.notifications.text')}</p>
                </div>
                <div className={s.pushBox}>
                  <Smartphone size={28} aria-hidden="true" />
                  <div>
                    <strong>{t('onboarding.notifications.pushTitle')}</strong>
                    <p>{t('onboarding.notifications.pushText')}</p>
                  </div>
                </div>
                <SelectField label={t('onboarding.notifications.hourLabel')} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {t('account.hourOption', { hour: String(h).padStart(2, '0') })}
                    </option>
                  ))}
                </SelectField>
                <Switch checked={weekly} onChange={setWeekly} label={t('onboarding.notifications.weeklyLabel')} description={t('onboarding.notifications.weeklyText')} />
                {submitError ? (
                  <p className={s.error} role="alert">
                    {submitError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className={s.footer}>
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={18} aria-hidden="true" /> {t('common.back')}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => router.back()}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button type="submit" size="lg">
                {step === TOTAL - 1 ? t('onboarding.finish') : t('common.continue')}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
