'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CircleCheck, Clock, RefreshCw, Unplug } from 'lucide-react';
import type { PropertyDto } from '@precisari/shared';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { formatAgo } from '@/lib/dates';
import { qk } from '@/lib/queries';
import { Badge } from '../ui/primitives';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';

export function SyncBadge({ property }: { property: PropertyDto }) {
  const src = property.calendarSources[0];
  if (!src)
    return (
      <Badge tone="neutral">
        <Unplug aria-hidden="true" /> {t('properties.status.NONE')}
      </Badge>
    );
  if (src.status === 'OK')
    return (
      <Badge tone="positive">
        <CircleCheck aria-hidden="true" /> {t('properties.status.OK', { ago: formatAgo(src.lastSyncAt) })}
      </Badge>
    );
  if (src.status === 'ERROR')
    return (
      <Badge tone="danger">
        <AlertTriangle aria-hidden="true" /> {t('properties.status.ERROR')}
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <Clock aria-hidden="true" /> {t('properties.status.PENDING')}
    </Badge>
  );
}

export function SyncButton({ property, size = 'sm' }: { property: PropertyDto; size?: 'sm' | 'md' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api().properties.sync(property.id),
    onSuccess: (r) => {
      toast({ message: r.status === 'OK' ? t('properties.synced') : t('properties.syncError') });
      void qc.invalidateQueries({ queryKey: qk.properties });
      void qc.invalidateQueries({ queryKey: qk.property(property.id) });
      void qc.invalidateQueries({ queryKey: ['nights', property.id] });
    },
    onError: () => toast({ message: t('properties.syncError') }),
  });
  if (!property.calendarSources[0]) return null;
  return (
    <Button variant="outline" size={size} onClick={() => m.mutate()} loading={m.isPending}>
      {m.isPending ? null : <RefreshCw size={16} aria-hidden="true" />}
      {m.isPending ? t('properties.syncing') : t('properties.syncNow')}
    </Button>
  );
}
