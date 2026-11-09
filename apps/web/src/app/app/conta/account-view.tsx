'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Sparkles, Trash2 } from 'lucide-react';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { useLogout, useUser } from '@/lib/auth';
import { formatDateBR } from '@/lib/dates';
import { useUpdateMe } from '@/lib/queries';
import { localTokenStore } from '@/lib/token-store';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, Dialog, Field, SelectField, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import p from '@/components/app/page.module.css';

export function AccountView() {
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const update = useUpdateMe();
  const [name, setName] = useState(user.name ?? '');
  const [delStep, setDelStep] = useState<0 | 1 | 2>(0);
  const [confirmWord, setConfirmWord] = useState('');
  const sub = user.subscription;

  const exportData = useMutation({
    mutationFn: () => api().me.export(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `precisari-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast({ message: t('common.errorGeneric') }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api().me.delete(),
    onSuccess: () => {
      localTokenStore.clear();
      qc.clear();
      router.replace('/');
      toast({ message: t('account.deleted') });
    },
    onError: () => toast({ message: t('common.errorGeneric') }),
  });

  const statusText =
    sub.status === 'TRIALING' && sub.trialEndsAt ? t('account.status.TRIALING', { date: formatDateBR(sub.trialEndsAt) }) : t(`account.status.${sub.status}`);

  return (
    <div className={[p.page, p.narrow].join(' ')}>
      <header className={p.header}>
        <h1>{t('account.title')}</h1>
      </header>

      <section className={p.section} aria-labelledby="profile">
        <h2 id="profile">{t('account.profileTitle')}</h2>
        <div className={p.formGrid}>
          <Field
            label={t('account.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== user.name && update.mutate({ name: name.trim() }, { onSuccess: () => toast({ message: t('common.saved') }) })}
          />
          <Field label={t('account.email')} value={user.email} readOnly />
        </div>
      </section>

      <section className={p.section} aria-labelledby="notif">
        <h2 id="notif">{t('account.notificationsTitle')}</h2>
        <SelectField
          label={t('account.hour')}
          value={user.dailyNotificationHour}
          onChange={(e) => update.mutate({ dailyNotificationHour: Number(e.target.value) }, { onSuccess: () => toast({ message: t('common.saved') }) })}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {t('account.hourOption', { hour: String(h).padStart(2, '0') })}
            </option>
          ))}
        </SelectField>
        <Switch
          checked={user.emailWeeklySummary}
          onChange={(v) => update.mutate({ emailWeeklySummary: v }, { onSuccess: () => toast({ message: t('common.saved') }) })}
          label={t('account.weekly')}
          description={t('onboarding.notifications.weeklyText')}
        />
      </section>

      <section className={p.section} aria-labelledby="plan">
        <h2 id="plan">{t('account.planTitle')}</h2>
        <div className={p.statusRow}>
          <strong>{t('account.planName', { plan: t(`landing.pricing.plans.${sub.plan}.name`) })}</strong>
          <Badge tone={sub.status === 'ACTIVE' ? 'positive' : sub.status === 'TRIALING' ? 'accent' : 'danger'}>{statusText}</Badge>
        </div>
        {sub.status === 'ACTIVE' && sub.currentPeriodEnd ? <p className={p.muted}>{t('account.renews', { date: formatDateBR(sub.currentPeriodEnd) })}</p> : null}
        <div className={p.actionsRow}>
          <ButtonLink href="/checkout">
            <Sparkles size={18} aria-hidden="true" /> {sub.status === 'ACTIVE' ? t('account.changePlan') : t('account.upgrade')}
          </ButtonLink>
        </div>
      </section>

      <section className={p.section} aria-labelledby="data">
        <div className={p.sectionHead}>
          <h2 id="data">{t('account.dataTitle')}</h2>
          <p>{t('account.dataText')}</p>
        </div>
        <div className={p.actionsRow}>
          <Button variant="outline" onClick={() => exportData.mutate()} loading={exportData.isPending}>
            <Download size={18} aria-hidden="true" /> {exportData.isPending ? t('account.exporting') : t('account.export')}
          </Button>
          <Button variant="ghost" onClick={() => void logout('/')}>
            <LogOut size={18} aria-hidden="true" /> {t('account.logout')}
          </Button>
        </div>
      </section>

      <section className={[p.section, p.danger].join(' ')} aria-labelledby="del">
        <div className={p.sectionHead}>
          <h2 id="del">{t('account.deleteTitle')}</h2>
          <p>{t('account.deleteText')}</p>
        </div>
        <div className={p.actionsRow}>
          <Button variant="dangerOutline" onClick={() => setDelStep(1)}>
            <Trash2 size={18} aria-hidden="true" /> {t('account.deleteButton')}
          </Button>
        </div>
      </section>

      <Dialog
        open={delStep === 1}
        onClose={() => setDelStep(0)}
        title={t('account.deleteStep1Title')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDelStep(0)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => setDelStep(2)}>
              {t('account.deleteStep1Confirm')}
            </Button>
          </>
        }
      >
        <p>{t('account.deleteStep1Text')}</p>
      </Dialog>
      <Dialog
        open={delStep === 2}
        onClose={() => {
          setDelStep(0);
          setConfirmWord('');
        }}
        title={t('account.deleteStep2Title')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDelStep(0)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={confirmWord.trim().toUpperCase() !== t('account.deleteWord')} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
              {t('account.deleteStep2Confirm')}
            </Button>
          </>
        }
      >
        <p>{t('account.deleteStep2Text', { word: t('account.deleteWord') })}</p>
        <Field label={t('account.deleteStep2Label')} value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} autoComplete="off" />
      </Dialog>
    </div>
  );
}
