import { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { formatBRL } from '@precisari/shared';
import { typography } from '@precisari/design-tokens';
import { t } from '@/i18n';
import { fontFor, useTheme } from '@/theme';

export interface Bar {
  label: string;
  value: number; // cents
  highlight?: boolean;
}

/** Minimal SVG bar chart: values on top, labels below, highlighted bar in tangerine. */
export function BarChart({ bars, height = 160 }: { bars: Bar[]; height?: number }) {
  const { c, radii, space } = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const labelH = typography.caption.lineHeight + space[2];
  const valueH = typography.caption.lineHeight + space[1];
  const chartH = height - labelH - valueH;
  const gap = space[3];
  const barW = bars.length ? (width - gap * (bars.length - 1)) / bars.length : 0;
  const summary = bars.map((b) => `${b.label}: ${formatBRL(b.value, { whole: true })}`).join(', ');
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('results.chartLabel', { count: bars.length })}. ${summary}`}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {bars.map((b, i) => {
            const h = Math.max(4, (b.value / max) * chartH);
            const x = i * (barW + gap);
            const y = valueH + chartH - h;
            const thousands = b.value / 100000;
            const short =
              b.value >= 100000
                ? t('results.thousands', { value: thousands.toFixed(thousands >= 10 ? 0 : 1).replace('.', ',') })
                : formatBRL(b.value, { whole: true });
            return (
              <G key={b.label + i}>
                <Rect x={x} y={y} width={barW} height={h} rx={radii.sm} fill={b.highlight ? c.accent : c.borderStrong} />
                <SvgText
                  x={x + barW / 2}
                  y={y - space[1]}
                  fontSize={typography.caption.size}
                  fontFamily={fontFor('caption', '600')}
                  fill={b.highlight ? c.textPrimary : c.textSecondary}
                  textAnchor="middle"
                >
                  {short}
                </SvgText>
                <SvgText
                  x={x + barW / 2}
                  y={height - space[1]}
                  fontSize={typography.caption.size}
                  fontFamily={fontFor('caption', b.highlight ? '700' : '500')}
                  fill={b.highlight ? c.textPrimary : c.textSecondary}
                  textAnchor="middle"
                >
                  {b.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
