'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Info, Mail } from 'lucide-react';
import { PrecisariApiError } from '@precisari/api-client';
import { ErrorCode, OtpRequestBody } from '@precisari/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '@/i18n';
import { api, isMockMode } from '@/lib/api';
import { safeNext, useHasSession } from '@/lib/auth';
import { qk } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Field, Logo, ThemeToggle } from '@/components/ui/primitives';
import s from './login.module.css';

const RESEND_SECONDS = 30;

export function LoginFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const hasSession = useHasSession();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(params.get('expirou') ? t('login.sessionExpired') : null);
  const digits = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (hasSession && !busy) router.replace(next);
  }, [hasSession, busy, next, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') digits.current[0]?.focus();
  }, [step]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const parsed = OtpRequestBody.safeParse({ email });
    if (!parsed.success) {
      setEmailError(t('login.emailInvalid'));
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      await api().auth.requestOtp(parsed.data.email);
      setEmail(parsed.data.email);
      setStep('code');
      setCooldown(RESEND_SECONDS);
      setNotice(null);
    } catch {
      setEmailError(t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!/^\d{6}$/.test(value)) return;
    setBusy(true);
    setCodeError(null);
    try {
      const session = await api().auth.verifyOtp({ email, code: value });
      qc.setQueryData(qk.me, session.user);
      router.replace(next);
    } catch (err) {
      const code = err instanceof PrecisariApiError ? err.code : '';
      setCodeError(
        code === ErrorCode.OTP_EXPIRED ? t('login.codeExpired') : code === ErrorCode.OTP_TOO_MANY_ATTEMPTS ? t('login.tooMany') : code === ErrorCode.OTP_INVALID ? t('login.codeInvalid') : t('common.errorGeneric'),
      );
      setCode(Array(6).fill(''));
      digits.current[0]?.focus();
      setBusy(false);
    }
  }

  function setDigits(start: number, raw: string) {
    const chars = raw.replace(/\D/g, '').split('');
    if (chars.length === 0) {
      const nextCode = [...code];
      nextCode[start] = '';
      setCode(nextCode);
      return;
    }
    const nextCode = [...code];
    chars.slice(0, 6 - start).forEach((c, i) => (nextCode[start + i] = c));
    setCode(nextCode);
    const focusIdx = Math.min(5, start + chars.length);
    digits.current[focusIdx]?.focus();
    const joined = nextCode.join('');
    if (joined.length === 6) void verify(joined);
  }

  return (
    <div className={s.page}>
      <aside className={s.aside}>
        <Logo tone="dark" href="/" width={176} />
        <div className={s.asideBody}>
          <h1 className={s.asideTitle}>{t('login.asideTitle')}</h1>
          <p>{t('login.asideText')}</p>
          <div className={s.heatStrip} aria-hidden="true">
            {[0, 0, 1, 1, 2, 3, 4, 0, 0, 1, 2, 2, 4, 3].map((h, i) => (
              <span key={i} data-heat={h} />
            ))}
          </div>
        </div>
      </aside>
      <main id="conteudo" className={s.main}>
        <div className={s.topRow}>
          <span className={s.mobileLogo}>
            <Logo href="/" width={140} />
          </span>
          <ThemeToggle />
        </div>
        <div className={s.card}>
          {step === 'email' ? (
            <form onSubmit={requestCode} noValidate className={s.form}>
              <div className={s.headIcon} aria-hidden="true">
                <Mail size={24} />
              </div>
              <h2>{t('login.title')}</h2>
              <p className={s.sub}>{t('login.subtitle')}</p>
              {notice ? (
                <p className={s.notice} role="status">
                  <Info size={16} aria-hidden="true" /> {notice}
                </p>
              ) : null}
              <Field
                label={t('login.emailLabel')}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={emailError}
                autoFocus
                required
              />
              <Button type="submit" block size="lg" loading={busy}>
                {busy ? t('login.sending') : t('login.sendCode')}
              </Button>
              <div className={s.divider}>
                <span>{t('login.or')}</span>
              </div>
              {/* TODO(auth): enable once Apple/Google credentials exist (RF-01). */}
              <Button variant="outline" block disabled aria-describedby="social-soon">
                {t('login.apple')} <small className={s.soon}>{t('login.socialSoon')}</small>
              </Button>
              <Button variant="outline" block disabled aria-describedby="social-soon">
                {t('login.google')} <small className={s.soon}>{t('login.socialSoon')}</small>
              </Button>
              <span id="social-soon" className="visually-hidden">
                {t('login.socialSoon')}
              </span>
            </form>
          ) : (
            <form
              className={s.form}
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code.join(''));
              }}
              noValidate
            >
              <button type="button" className={s.back} onClick={() => setStep('email')}>
                <ArrowLeft size={16} aria-hidden="true" /> {t('login.changeEmail')}
              </button>
              <h2>{t('login.codeTitle')}</h2>
              <p className={s.sub}>{t('login.codeSubtitle', { email })}</p>
              <fieldset className={s.otp} aria-describedby={codeError ? 'otp-error' : undefined}>
                <legend className="visually-hidden">{t('login.codeLabel')}</legend>
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      digits.current[i] = el;
                    }}
                    className={s.digit}
                    value={d}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={t('login.digitLabel', { index: i + 1 })}
                    aria-invalid={codeError ? true : undefined}
                    maxLength={i === 0 ? 6 : 1}
                    disabled={busy}
                    onChange={(e) => setDigits(i, e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      setDigits(i, e.clipboardData.getData('text'));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !code[i] && i > 0) digits.current[i - 1]?.focus();
                      if (e.key === 'ArrowLeft' && i > 0) digits.current[i - 1]?.focus();
                      if (e.key === 'ArrowRight' && i < 5) digits.current[i + 1]?.focus();
                    }}
                  />
                ))}
              </fieldset>
              {codeError ? (
                <p id="otp-error" className={s.error} role="alert">
                  {codeError}
                </p>
              ) : null}
              {isMockMode ? (
                <p className={s.notice}>
                  <Info size={16} aria-hidden="true" /> {t('login.mockHint')}
                </p>
              ) : null}
              <Button type="submit" block size="lg" loading={busy} disabled={code.join('').length !== 6}>
                {busy ? t('login.verifying') : t('login.verify')}
              </Button>
              <Button
                variant="ghost"
                block
                disabled={cooldown > 0 || busy}
                onClick={async () => {
                  await requestCode();
                  setNotice(t('login.resent'));
                }}
              >
                {cooldown > 0 ? t('login.resendIn', { seconds: cooldown }) : t('login.resend')}
              </Button>
            </form>
          )}
        </div>
        <p className={s.legal}>
          <Link href="/termos">{t('login.legal')}</Link>
        </p>
      </main>
    </div>
  );
}
