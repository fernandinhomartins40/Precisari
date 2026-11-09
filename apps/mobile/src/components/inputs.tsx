import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { centsToMaskedDisplay, maskBRLInput } from '@/lib/money-mask';
import { AppText, TextField } from './ui';

/** BRL input (whole reais) backed by cents. */
export function MoneyField({
  label,
  hint,
  error,
  valueCents,
  onChangeCents,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
}) {
  const [display, setDisplay] = useState(() => centsToMaskedDisplay(valueCents));
  return (
    <TextField
      label={label}
      hint={hint}
      error={error}
      prefix="R$"
      keyboardType="number-pad"
      inputMode="numeric"
      value={display}
      placeholder="0"
      onChangeText={(text) => {
        const m = maskBRLInput(text);
        setDisplay(m.display);
        onChangeCents(m.cents);
      }}
    />
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 50 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const { c, radii, space } = useTheme();
  const btn = (Icon: typeof Plus, delta: number, a11y: string) => {
    const disabled = value + delta < min || value + delta > max;
    return (
      <Pressable
        onPress={() => onChange(value + delta)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${a11y} ${label}`}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: radii.pill,
          backgroundColor: c.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Icon size={20} color={c.textPrimary} />
      </Pressable>
    );
  };
  return (
    <View
      accessible={false}
      style={{ flex: 1, gap: space[2], padding: space[3], borderRadius: radii.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}
    >
      <AppText variant="label" weight="600">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {btn(Minus, -1, '−')}
        <AppText variant="h2" weight="800" accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${value}`}>
          {value}
        </AppText>
        {btn(Plus, 1, '+')}
      </View>
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2] }}>
      <View style={{ flex: 1 }}>
        <AppText variant="body" weight="500">
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: c.borderStrong, true: c.accent }}
        thumbColor={c.surface}
        {...({ activeThumbColor: c.surface } as object)}
      />
    </View>
  );
}

