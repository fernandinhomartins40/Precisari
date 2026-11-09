'use client';

import { useEffect, useId, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { PlaceDetailsDto, PlaceSuggestionDto } from '@precisari/shared';
import { formatNumber, t } from '@/i18n';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/primitives';
import s from './onboarding.module.css';
import ui from '@/components/ui/ui.module.css';

/** Address autocomplete (combobox) backed by /places, plus map confirmation (illustrative, no map key needed). */
export function AddressStep({
  place,
  onPlace,
  name,
  onName,
}: {
  place: PlaceDetailsDto | null;
  onPlace: (p: PlaceDetailsDto | null) => void;
  name: string;
  onName: (n: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PlaceSuggestionDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(() => {
      api()
        .places.autocomplete(q)
        .then((r) => {
          if (!cancelled) {
            setItems(r);
            setOpen(true);
            setActive(r.length ? 0 : -1);
          }
        })
        .catch(() => !cancelled && setItems([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  const choose = async (sug: PlaceSuggestionDto) => {
    setOpen(false);
    setQuery(sug.description);
    const d = await api().places.details(sug.placeId);
    onPlace(d);
    if (!name) onName(t('onboarding.address.nameDefault', { city: d.city }));
  };

  if (place) {
    return (
      <div className={s.confirm}>
        <h3>{t('onboarding.address.confirmTitle')}</h3>
        <div className={s.map} role="img" aria-label={t('onboarding.address.mapAlt', { city: place.city })}>
          <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path className={s.mapWater} d="M0 140 C 80 120, 120 170, 200 150 S 330 110, 400 130 V200 H0Z" />
            <g className={s.mapStreets}>
              <path d="M0 40 H400 M0 90 H400 M60 0 V200 M150 0 V200 M260 0 V200 M340 0 V200 M0 0 L 400 160" />
            </g>
            <g className={s.mapPin} transform="translate(200 92)">
              <circle r="22" className={s.mapPulse} />
              <path d="M0 14 C -10 0, -14 -6, -14 -14 A 14 14 0 1 1 14 -14 C 14 -6, 10 0, 0 14Z" />
              <circle r="5" cy="-14" className={s.mapPinDot} />
            </g>
          </svg>
        </div>
        <p className={s.addressLine}>
          <MapPin size={18} aria-hidden="true" /> {place.address} · {place.city}/{place.state}
        </p>
        <p className={s.coords}>{t('onboarding.address.coordinates', { lat: formatNumber(place.lat, 4), lng: formatNumber(place.lng, 4) })}</p>
        <Field label={t('onboarding.address.nameLabel')} placeholder={t('onboarding.address.namePlaceholder')} value={name} onChange={(e) => onName(e.target.value)} />
        <Button variant="ghost" size="sm" onClick={() => onPlace(null)}>
          {t('onboarding.address.change')}
        </Button>
      </div>
    );
  }

  return (
    <div className={s.combo}>
      <label htmlFor={inputId} className={ui.label}>
        {t('onboarding.address.label')}
      </label>
      <div className={ui.inputWrap}>
        <span className={ui.prefix} aria-hidden="true">
          <Search size={18} />
        </span>
        <input
          id={inputId}
          className={ui.input}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={t('onboarding.address.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && open && items[active]) {
              e.preventDefault();
              void choose(items[active]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      <p className={ui.hint} aria-live="polite">
        {loading ? t('onboarding.address.searching') : query.trim().length >= 3 && items.length === 0 ? t('onboarding.address.noResults') : ''}
      </p>
      {open && items.length > 0 ? (
        <ul id={listId} role="listbox" aria-label={t('onboarding.address.suggestions')} className={s.listbox}>
          {items.map((it, i) => (
            <li
              key={it.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={s.option}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(it);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={16} aria-hidden="true" /> {it.description}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
