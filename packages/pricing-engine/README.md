# @precisari/pricing-engine

Deterministic pricing engine for Precisari (spec: `docs/prd.md` §7). Pure TypeScript, no I/O,
no `Date.now()` — the same `PricingContext` always yields the same output.

```ts
import { computeRecommendations, summarize, ENGINE_VERSION } from '@precisari/pricing-engine';

const nights = computeRecommendations(ctx); // one entry per night from ctx.today, ctx.horizonDays long
```

- **Money**: BRL cents (integers) everywhere.
- **Dates**: `yyyy-mm-dd` strings; arithmetic is UTC day numbers (`dates.ts`).
- **Labels**: short pt-BR strings, all in `src/labels.ts`.
- **Version**: `ENGINE_VERSION = '1.0.0'`.

## Formula

```
raw   = base × weekday × seasonality × demand × weather × leadTime × (orphan | adjacent)
final = keepInsideLimits( roundPsychological( clamp(raw, minPrice, maxPrice) ) )
```

- Every multiplier is scaled by aggressiveness: `m_eff = 1 + (m − 1) × k`, `k` = 0.6 / 1.0 / 1.4
  (CONSERVATIVE / BALANCED / BOLD), then rounded to 4 decimals. `raw` is exactly
  `base × Π factor.multiplier` (ignoring `limit` and informative factors), so every price is
  auditable from its factors.
- `weather` only for D-0..D-7; `leadTime`, `orphan`, `adjacent`, min stay and profit protection
  only for **free** nights. Booked/blocked nights still get a reference price, heat and factors,
  with `minStay = 1`.
- `maxPrice` defaults to `basePrice × 3`; if it is below `minPrice`, `minPrice` is used.
- Neutral factors (multiplier exactly 1) are omitted. Informative factors (multiplier 1):
  `minStay` ("Estadia mínima limitada pela lacuna") and `profitProtection`
  ("Estadia mínima ajustada"). Clamping adds `limit` ("Limite mínimo"/"Limite máximo") with
  multiplier `limit / raw`.

## Rules (defaults, `constants.ts`)

| Rule | Behaviour |
|---|---|
| `weekday` | Night of Sun..Sat: 0.90 0.85 0.85 0.88 0.95 1.15 1.20. **URBAN** (inverted): 1.05 1.15 1.15 1.12 1.00 0.88 0.85 (Sunday/Mon–Wed business peak, Fri/Sat low). Override: `rules.weekdayMultipliers` (7 values). |
| `seasonality` | `seasonality.ts`: monthly curve per destination type × region (N/NE/CO/SE/S, derived from the UF via `regionForState`, unknown UF → SE). Override: `rules.seasonality` (12 values). |
| `demand` | Holiday 1.25 (eve night + holiday night) · long weekend 1.35 · Carnival `rules.carnivalMultiplier` (1.5) · Réveillon `rules.newYearMultiplier` (2.0, night of Dec 31) · events P 1.1 / M 1.3 / G 1.8 / XG 2.5 with distance decay · school vacation 1.15. |
| `weather` | BEACH: rain > 70% → 0.85; sunny day (≤ 30%) after ≥ 4 rainy days in the previous 7 → 1.05. MOUNTAIN: tempMin ≤ 5 °C → 1.10. Others neutral. |
| `leadTime` | > 60 d 1.05 · 30–60 1.00 · 14–29 0.97 · 7–13 0.93 · 3–6 0.88 · 0–2 0.80. |
| `minStay` | > 30 d: 3 · 14–30: 2 · < 14: 1. Long weekend nights: length of the long weekend. Never more than the free nights before the next check-in. |
| `orphan` | Free gap of 1–2 nights bounded by bookings/blocks on both sides: × 0.80 (scaled), `minStay = gap length`, `isOrphan`, `discountPct`. |
| `adjacent` | Free night right after a check-out or right before a check-in: discount `round(7 × k)` kept in 5–10% (5 / 7 / 10). Not applied to orphan nights. |
| `profitProtection` | While `price − price × platformFeePct − cleaningFee / minStay < rules.minProfitPerNight` (default 0), `minStay++` (up to the free nights available, max 30). The price is never lowered. |

Any rule can be disabled with `rules.enabled[rule] = false` (missing = on).

## Design choices

- **Calendar signals don't stack.** Holiday, long weekend, Carnival and Réveillon describe the
  same phenomenon, so per night only the strongest one is kept.
- **Demand combination.** The calendar signal, each event and the school vacation are scaled,
  sorted, and combined as `s₁ × Π (1 + 0.5 × (sᵢ − 1))`, capped at **2.5** (unless `s₁` alone is
  higher). When capped, secondary factors are shrunk in log space so factors still multiply to
  the final demand.
- **Long weekends.** Non-working days = weekends + every holiday entry (bridges included) +
  implicit bridges (Monday before a Tuesday holiday, Friday after a Thursday holiday). A run of
  ≥ 3 such days containing a real holiday is a long weekend; its nights go from the eve of the
  first day to the eve of the last (Fri–Sun → nights Thu, Fri, Sat). A run containing a Carnival
  day is priced as Carnival. Kinds are inferred when missing ("Carnaval" in the name → CARNIVAL,
  Jan 1 → NEW_YEAR).
- **Event decay.** `m = 1 + (m_size − 1) × (1 − (d / R)²)` within radius `R` (default 5 km), else
  no effect. Events affect nights from `startDate` to `endDate`.
- **Rounding.** Nearest whole-reais value ending in 5 or 9; ties go up (287 → 289, 292 → 295,
  290 → 289). After clamping, a rounded value that leaves `[min, max]` moves to the nearest 5/9
  value inside; if none fits, whole reais inside the limits, else the clamped value.
- **Heat.** From the combined raw multiplier (before limits), piecewise linear:
  ≤ 0.8 → 0, 1.0 → 0.4, ≥ 1.6 → 1 (2 decimals).
- **Discount semantics.** `discountPct` is already included in `suggestedPrice` (it is shown for
  context, not to be applied again).

## Other exports

`detectGaps`, `detectLongWeekends`, `roundPsychological` (+ floor/ceil/isPsychological,
`applyLimitsAndRound`), `scaleMultiplier`, `regionForState`, `SEASONALITY`/`seasonalityFor`,
date utils (`addDays`, `diffDays`, `dayOfWeek`, `eachDate`, …), `heatFromMultiplier`,
`combineDemand`, `eventMultiplier`, `weatherAdjustment`, `netPerNight`, `resolveMaxPrice`,
`LABELS`, and `summarize(recs, currentPrices, fallbackPrice?)` (free/booked/orphan counts,
average price, potential gain, nights differing > 5%).

## Scripts

`pnpm --filter @precisari/pricing-engine test` (Vitest + v8 coverage, thresholds 90%),
`typecheck`, `lint`, `build`.
