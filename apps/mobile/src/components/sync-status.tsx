import { View } from 'react-native';
import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react-native';
import type { PropertyDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { AppText } from './ui';

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return t('properties.agoNow');
  if (min < 60) return t('properties.agoMinutes', { count: min });
  return t('properties.agoHours', { count: Math.round(min / 60) });
}

export function syncState(p: PropertyDto): 'ok' | 'error' | 'pending' {
  const src = p.calendarSources[0];
  if (!src) return 'error';
  if (src.status === 'ERROR') return 'error';
  if (src.status === 'PENDING') return 'pending';
  return 'ok';
}

export function SyncStatus({ property }: { property: PropertyDto }) {
  const { c, space } = useTheme();
  const state = syncState(property);
  const src = property.calendarSources[0];
  const Icon = state === 'ok' ? CircleCheck : state === 'error' ? TriangleAlert : RefreshCw;
  const color = state === 'ok' ? c.positive : state === 'error' ? c.danger : c.textSecondary;
  const label =
    state === 'ok'
      ? t('properties.syncOkAgo', { ago: timeAgo(src?.lastSyncAt ?? null) })
      : state === 'error'
        ? t('properties.syncError')
        : t('properties.syncPending');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      <Icon size={16} color={color} strokeWidth={2.4} />
      <AppText variant="caption" weight="600" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}
