'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { PrecisariApiError } from '@precisari/api-client';
import { ErrorCode, type ChannexStatusDto } from '@precisari/shared';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { formatAgo } from '@/lib/dates';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, Dialog } from '@/components/ui/primitives';
import p from '@/components/app/page.module.css';

const channexKey = (id: string) => ['channex', id] as const;

/** RF-23: link the property's Airbnb listing through Channex so approved prices go out by themselves. */
export function AirbnbLink({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const status = useQuery({
    queryKey: channexKey(propertyId),
    queryFn: () => api().channex.status(propertyId),
    // While the host authorizes Airbnb in the other tab, check back so the card flips to "connected" by itself.
    refetchInterval: (q) => (q.state.data?.state === 'PENDING_LINK' ? 10_000 : false),
  });
  const set = (s: ChannexStatusDto) => qc.setQueryData(channexKey(propertyId), s);

  const connect = useMutation({
    // The tab is opened on click (before the request) so popup blockers allow it.
    mutationFn: async (tab: Window | null) => ({ res: await api().channex.connect(propertyId), tab }),
    onSuccess: ({ res, tab }) => {
      set(res);
      if (tab) tab.location.href = res.connectUrl;
      else window.location.assign(res.connectUrl);
    },
    onError: (_e, tab) => tab?.close(),
  });
  const disconnect = useMutation({
    mutationFn: () => api().channex.disconnect(propertyId),
    onSuccess: (s) => {
      set(s);
      setConfirmOff(false);
    },
  });
  const open = () => connect.mutate(window.open('', '_blank'));
  const planLimit = connect.error instanceof PrecisariApiError && connect.error.code === ErrorCode.PLAN_LIMIT;
  const s = status.data;

  return (
    <section className={p.section} aria-labelledby="airbnb">
      <div className={p.sectionHead}>
        <h2 id="airbnb">{t('airbnbLink.title')}</h2>
        <p>{t('airbnbLink.text')}</p>
      </div>
      {!s ? null : s.state === 'LINKED' ? (
        <>
          <div className={p.statusRow}>
            <Badge tone="positive">{t('airbnbLink.linked')}</Badge>
            <span className={[p.muted, p.small].join(' ')}>
              {s.lastSyncAt ? t('airbnbLink.lastSync', { ago: formatAgo(s.lastSyncAt) }) : t('airbnbLink.firstSync')}
            </span>
          </div>
          <p className={[p.muted, p.small].join(' ')}>{t('airbnbLink.linkedHint')}</p>
          {s.lastError ? <p className={p.errorText}>{s.lastError}</p> : null}
          <div className={p.actionsRow}>
            <Button variant="ghost" onClick={() => setConfirmOff(true)}>
              {t('airbnbLink.disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {s.state === 'PENDING_LINK' ? <p className={p.muted}>{t('airbnbLink.pending')}</p> : null}
          {planLimit ? (
            <p className={p.errorText} role="alert">
              {t('airbnbLink.planLimit')}
            </p>
          ) : connect.isError ? (
            <p className={p.errorText} role="alert">
              {t('common.errorGeneric')}
            </p>
          ) : null}
          <div className={p.actionsRow}>
            {planLimit ? (
              <ButtonLink href="/checkout">{t('airbnbLink.seePlans')}</ButtonLink>
            ) : (
              <Button onClick={open} loading={connect.isPending}>
                <Link2 size={18} aria-hidden="true" /> {s.state === 'PENDING_LINK' ? t('airbnbLink.continue') : t('airbnbLink.connect')}
              </Button>
            )}
            {s.state === 'PENDING_LINK' ? (
              <Button variant="ghost" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t('airbnbLink.disconnectTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
              {t('airbnbLink.disconnect')}
            </Button>
          </>
        }
      >
        <p>{t('airbnbLink.disconnectText')}</p>
      </Dialog>
    </section>
  );
}
