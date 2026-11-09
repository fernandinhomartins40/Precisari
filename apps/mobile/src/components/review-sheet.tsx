import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Check, CircleCheck, Copy, ExternalLink, Info } from 'lucide-react-native';
import { formatBRL, type ActionDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { formatShortDay } from '@/lib/dates';
import { copyPrice, openListing } from '@/lib/platform';
import { PriceRise, Sheet } from './feedback';
import { AppText, Button } from './ui';

function Step({ n, label, done }: { n: number; label: string; done: boolean }) {
  const { c, radii, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? c.positiveSurface : c.surfaceMuted,
        }}
      >
        {done ? (
          <Check size={16} color={c.positive} strokeWidth={3} />
        ) : (
          <AppText variant="label" weight="700">
            {n}
          </AppText>
        )}
      </View>
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * MVP approval flow (journey 4.2): copy the price, open the listing on Airbnb, confirm here.
 * Prices are never pushed to Airbnb automatically in the MVP.
 */
export function ReviewSheet({
  action,
  onClose,
  onConfirm,
}: {
  action: ActionDto | null;
  onClose: () => void;
  onConfirm: (action: ActionDto) => void;
}) {
  const { c, radii, space } = useTheme();
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setCopied(false);
    setOpened(false);
    setConfirmed(false);
  }, [action?.id]);

  useEffect(() => {
    if (!confirmed || !action) return;
    const id = setTimeout(() => onConfirm(action), 900);
    return () => clearTimeout(id);
  }, [confirmed, action, onConfirm]);

  if (!action) return null;
  const to = formatBRL(action.toValue, { whole: true });
  return (
    <Sheet visible={!!action} onClose={onClose} title={t('today.sheet.title')}>
      <View style={{ gap: space[4] }}>
        <View style={{ backgroundColor: c.surfaceMuted, borderRadius: radii.control, padding: space[4], gap: space[1] }}>
          <AppText variant="label" weight="500" color="textSecondary">
            {formatShortDay(action.date)} · {action.propertyName}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            {confirmed ? <PriceRise text={to} /> : <AppText variant="display" weight="800" color="accentStrong">{to}</AppText>}
            <AppText variant="bodyLg" color="textSecondary">
              {t('common.perNight')}
            </AppText>
            {confirmed ? <CircleCheck size={28} color={c.positive} /> : null}
          </View>
          <AppText variant="label" weight="500" color="textSecondary">
            {t('a11y.priceChange', { from: formatBRL(action.fromValue, { whole: true }), to })}
          </AppText>
        </View>
        <View style={{ gap: space[3] }}>
          <Step n={1} label={t('today.sheet.step1')} done={copied} />
          <Step n={2} label={t('today.sheet.step2')} done={opened} />
          <Step n={3} label={t('today.sheet.step3')} done={confirmed} />
        </View>
        <View style={{ gap: space[3] }}>
          <Button
            kind="secondary"
            icon={copied ? Check : Copy}
            label={copied ? t('common.copied') : t('today.sheet.copy', { price: to })}
            onPress={async () => {
              await copyPrice(action.toValue);
              setCopied(true);
            }}
          />
          <Button
            kind="ghost"
            icon={ExternalLink}
            label={t('today.sheet.openAirbnb')}
            onPress={async () => {
              if (!copied) {
                await copyPrice(action.toValue);
                setCopied(true);
              }
              setOpened(true);
              await openListing(action.listingUrl);
            }}
          />
        </View>
        <Button label={t('today.sheet.confirm')} icon={Check} onPress={() => setConfirmed(true)} disabled={confirmed} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Info size={16} color={c.textSecondary} />
          <AppText variant="caption" color="textSecondary">
            {t('today.sheet.note')}
          </AppText>
        </View>
      </View>
    </Sheet>
  );
}
