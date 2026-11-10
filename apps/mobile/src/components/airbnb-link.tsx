import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Link2, Unlink } from 'lucide-react-native';
import { PrecisariApiError } from '@precisari/api-client';
import { ErrorCode } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';
import { confirmAsync } from '@/lib/platform';
import { timeAgo } from './sync-status';
import { AppText, Button } from './ui';

/** RF-23: link the Airbnb listing through Channex; the authorization screen opens in the in-app browser. */
export function AirbnbLink({ propertyId }: { propertyId: string }) {
  const { c, space } = useTheme();
  const qc = useQueryClient();
  const key = ['channex', propertyId] as const;
  const status = useQuery({ queryKey: key, queryFn: () => api.channex.status(propertyId) });
  const connect = useMutation({
    mutationFn: async () => {
      const res = await api.channex.connect(propertyId);
      await WebBrowser.openBrowserAsync(res.connectUrl);
    },
    // Back from the browser: Channex now knows whether Airbnb was authorized.
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const disconnect = useMutation({
    mutationFn: () => api.channex.disconnect(propertyId),
    onSuccess: (s) => qc.setQueryData(key, s),
  });
  const s = status.data;
  if (!s) return null;
  const planLimit = connect.error instanceof PrecisariApiError && connect.error.code === ErrorCode.PLAN_LIMIT;

  if (s.state === 'LINKED') {
    return (
      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <CircleCheck size={16} color={c.positive} strokeWidth={2.4} />
          <AppText variant="caption" weight="600" color="positive">
            {s.lastSyncAt ? t('airbnb.lastSync', { ago: timeAgo(s.lastSyncAt) }) : t('airbnb.firstSync')}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary">
          {t('airbnb.linkedHint')}
        </AppText>
        {s.lastError ? (
          <AppText variant="caption" color="danger">
            {s.lastError}
          </AppText>
        ) : null}
        <Button
          small
          kind="ghost"
          icon={Unlink}
          label={t('airbnb.disconnect')}
          loading={disconnect.isPending}
          onPress={async () => {
            if (await confirmAsync(t('airbnb.disconnectTitle'), t('airbnb.disconnectText'), t('airbnb.disconnect'), true)) disconnect.mutate();
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: space[3] }}>
      <AppText variant="body" color="textSecondary">
        {s.state === 'PENDING_LINK' ? t('airbnb.pending') : t('airbnb.text')}
      </AppText>
      {connect.isError ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {planLimit ? t('airbnb.planLimit') : t('common.error')}
        </AppText>
      ) : null}
      <Button
        icon={Link2}
        label={s.state === 'PENDING_LINK' ? t('airbnb.continue') : t('airbnb.connect')}
        loading={connect.isPending}
        onPress={() => connect.mutate()}
      />
    </View>
  );
}
