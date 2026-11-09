import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Plus, Wrench } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { useMe } from '@/lib/hooks';
import { useSelectedProperty } from '@/lib/selected-property';
import { useQueryClient } from '@tanstack/react-query';
import { PropertyThumb } from '@/components/blocks';
import { Skeleton } from '@/components/feedback';
import { Screen, TopBar } from '@/components/layout';
import { SyncStatus, syncState } from '@/components/sync-status';
import { AppText, Button } from '@/components/ui';

export default function Properties() {
  const { c, radii, space } = useTheme();
  const qc = useQueryClient();
  const { properties, isLoading, select } = useSelectedProperty();
  const { data: me } = useMe();
  const sub = me?.subscription;
  const maxFree = sub?.plan === 'FREE' && sub.status !== 'TRIALING' ? 1 : null;
  const atLimit = maxFree !== null && properties.length >= maxFree;

  return (
    <Screen onRefresh={() => void qc.invalidateQueries({ queryKey: ['properties'] })} contentStyle={{ gap: space[4] }}>
      <TopBar title={t('properties.title')} />
      {isLoading && properties.length === 0 ? <Skeleton height={110} /> : null}
      {properties.map((p) => {
        const state = syncState(p);
        return (
          <View key={p.id} style={{ backgroundColor: c.surface, borderRadius: radii.card, borderWidth: 1, borderColor: state === 'error' ? c.danger : c.border, overflow: 'hidden' }}>
            <Pressable
              onPress={() => {
                select(p.id);
                router.push(`/property/${p.id}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${p.city}. ${t('properties.settings')}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], opacity: pressed ? 0.85 : 1 })}
            >
              <PropertyThumb property={p} size={64} />
              <View style={{ flex: 1, gap: space[1] }}>
                <AppText variant="h3" weight="800" numberOfLines={1}>
                  {p.name}
                </AppText>
                <AppText variant="body" color="textSecondary" numberOfLines={1}>
                  {p.city} · {p.state}
                </AppText>
                <SyncStatus property={p} />
              </View>
              <ChevronRight size={22} color={c.textPrimary} />
            </Pressable>
            {state === 'error' ? (
              <View style={{ backgroundColor: c.dangerSurface, padding: space[3], paddingHorizontal: space[4] }}>
                <Button small kind="danger" icon={Wrench} label={t('properties.fixLink')} onPress={() => router.push(`/property/${p.id}`)} />
              </View>
            ) : null}
          </View>
        );
      })}
      {atLimit ? (
        <AppText variant="caption" color="textSecondary">
          {t('properties.planLimit', { count: maxFree ?? 1 })}
        </AppText>
      ) : null}
      <Button kind="ghost" icon={Plus} label={t('properties.add')} disabled={atLimit} onPress={() => router.push('/onboarding')} />
    </Screen>
  );
}
