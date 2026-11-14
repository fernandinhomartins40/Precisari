import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PartyPopper } from 'lucide-react-native';
import { formatBRL, type ActionDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { formatShortDay } from '@/lib/dates';
import { greeting } from '@/lib/greeting';
import { useDecideAction, useMe, useNights, usePendingActions, useSyncProperty } from '@/lib/hooks';
import { copyPrice, haptic } from '@/lib/platform';
import { useSelectedProperty } from '@/lib/selected-property';
import { NoProperty } from '@/components/no-property';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/action-card';
import { CutBlock, PropertyCard } from '@/components/blocks';
import { ErrorState, Skeleton, Snackbar, type SnackbarState } from '@/components/feedback';
import { WeekStrip } from '@/components/heat-map';
import { Screen, TopBar } from '@/components/layout';
import { PropertyPicker } from '@/components/property-picker';
import { ReviewSheet } from '@/components/review-sheet';
import { AppText, Card, SectionHeader } from '@/components/ui';

function PotentialBlock({ total, count }: { total: number; count: number }) {
  const { c, space } = useTheme();
  const suggestions =
    count === 0 ? t('today.suggestionsNone') : count === 1 ? t('today.suggestionsOne') : t('today.suggestions', { count });
  return (
    <CutBlock style={{ marginHorizontal: -space[1] }}>
      <AppText variant="h3" weight="800" color="textOnInverse">
        {t('today.potentialTitle')}
      </AppText>
      <AppText variant="hero" weight="800" style={{ color: c.accent }} accessibilityLabel={`${t('today.potentialTitle')}: ${formatBRL(total, { whole: true, signed: true })}`}>
        {formatBRL(total, { whole: true, signed: true })}
      </AppText>
      <AppText variant="bodyLg" weight="700" color="textOnInverse">
        {suggestions}
      </AppText>
      <AppText variant="label" weight="500" color="textOnInverse" style={{ opacity: 0.85, marginTop: space[1] }}>
        {t('common.estimateDisclaimer')}
      </AppText>
    </CutBlock>
  );
}

function Dots({ total, index }: { total: number; index: number }) {
  const { c, radii, space } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'center', gap: space[2], marginTop: space[4] }}
      accessible
      accessibilityLabel={t('a11y.stepDot', { index: index + 1, total })}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: radii.pill, backgroundColor: i === index ? c.accent : c.borderStrong }} />
      ))}
    </View>
  );
}

export default function Today() {
  const { c, radii, space } = useTheme();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { property, isLoading: propertiesLoading, properties } = useSelectedProperty();
  const actionsQ = usePendingActions(property?.id);
  const nightsQ = useNights(property?.id, 90);
  const decide = useDecideAction();
  const sync = useSyncProperty();
  const [reviewing, setReviewing] = useState<ActionDto | null>(null);
  const [picker, setPicker] = useState(false);
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const cardRef = useRef<SwipeCardHandle>(null);
  const seen = useRef(new Set<string>());

  const items = actionsQ.data?.items ?? [];
  items.forEach((a) => seen.current.add(a.id));
  const total = Math.max(seen.current.size, items.length);
  const position = total - items.length;
  const top = items[0];

  const showUndo = useCallback(
    (action: ActionDto, message: string) => {
      setSnack({
        key: Date.now(),
        message,
        actionLabel: t('common.undo'),
        onAction: () =>
          decide.mutate(
            { action, decision: 'revert' },
            { onSuccess: () => setSnack({ key: Date.now(), message: t('today.reverted') }) },
          ),
      });
    },
    [decide],
  );

  const approve = useCallback(
    async (action: ActionDto, copy: boolean) => {
      if (copy) await copyPrice(action.toValue);
      decide.mutate({ action, decision: 'approve' });
      const msg = t('today.approved', { price: formatBRL(action.toValue, { whole: true }), date: formatShortDay(action.date) });
      showUndo(action, copy ? `${msg} · ${t('common.copied')}` : msg);
    },
    [decide, showUndo],
  );

  const onSwiped = useCallback(
    (action: ActionDto, dir: SwipeDirection) => {
      if (dir === 'right') {
        void approve(action, true);
      } else {
        haptic('light');
        decide.mutate({ action, decision: 'dismiss' });
        showUndo(action, t('today.dismissed'));
      }
    },
    [approve, decide, showUndo],
  );

  const onRefresh = useCallback(async () => {
    if (property) await sync.mutateAsync(property.id).catch(() => undefined);
    await qc.invalidateQueries();
  }, [property, sync, qc]);

  const openNight = (date: string) => property && router.push({ pathname: '/night/[date]', params: { date, propertyId: property.id } });

  if (!property && !propertiesLoading) return <NoProperty />;

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={sync.isPending} onRefresh={onRefresh} contentStyle={{ gap: space[5] }}>
        <View>
          <TopBar />
          <AppText variant="h1" weight="800" accessibilityRole="header">
            {greeting(me?.name)}
          </AppText>
          <AppText variant="bodyLg" color="textSecondary">
            {items.length > 0 ? t('greeting.subtitleOpportunities') : t('greeting.subtitleAllDone')}
          </AppText>
        </View>

        {property ? (
          <PropertyCard property={property} onPress={() => (properties.length > 1 ? setPicker(true) : router.push(`/property/${property.id}`))} />
        ) : (
          <Skeleton height={90} />
        )}

        {actionsQ.data ? <PotentialBlock total={actionsQ.data.totalEstimatedGain} count={items.length} /> : <Skeleton height={190} />}

        <View>
          <SectionHeader
            title={t('today.stackTitle')}
            right={
              top ? (
                <AppText variant="body" color="textSecondary">
                  {t('today.stackCounter', { index: position + 1, total })}
                </AppText>
              ) : null
            }
          />
          {actionsQ.isError && !actionsQ.data ? (
            <ErrorState onRetry={() => actionsQ.refetch()} />
          ) : !actionsQ.data ? (
            <Skeleton height={420} />
          ) : top ? (
            <View>
              <SwipeCard ref={cardRef} key={top.id} action={top} onSwiped={(dir) => onSwiped(top, dir)} onReview={() => setReviewing(top)} />
              {/* Peeking edges of the next cards in the stack. */}
              {items.slice(1, 3).map((a, i) => (
                <View
                  key={a.id}
                  style={{
                    height: space[2],
                    marginHorizontal: space[3] * (i + 1),
                    marginTop: -1,
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderTopWidth: 0,
                    borderColor: c.border,
                    borderBottomLeftRadius: radii.control,
                    borderBottomRightRadius: radii.control,
                    zIndex: -1 - i,
                  }}
                />
              ))}
              <Dots total={total} index={position} />
            </View>
          ) : (
            <Card style={{ alignItems: 'center', gap: space[2], paddingVertical: space[8] }}>
              <PartyPopper size={32} color={c.accentStrong} />
              <AppText variant="h3" weight="800" align="center">
                {t('today.allDoneTitle')}
              </AppText>
              <AppText variant="body" color="textSecondary" align="center">
                {t('today.allDoneBody')}
              </AppText>
            </Card>
          )}
        </View>

        <View>
          <SectionHeader title={t('today.weekTitle')} />
          {nightsQ.data ? <WeekStrip nights={nightsQ.data.nights} onPress={openNight} /> : <Skeleton height={72} />}
        </View>
      </Screen>

      <Snackbar state={snack} onHide={() => setSnack(null)} />
      <ReviewSheet
        action={reviewing}
        onClose={() => setReviewing(null)}
        onConfirm={(a) => {
          setReviewing(null);
          void approve(a, false);
        }}
      />
      <PropertyPicker visible={picker} onClose={() => setPicker(false)} />
    </View>
  );
}
