'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import type { PropertyDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useSelectedProperty } from '@/lib/property-context';
import s from './property-selector.module.css';

export function PropertyPhoto({ property, size = 'md' }: { property: PropertyDto; size?: 'sm' | 'md' | 'lg' }) {
  const cls = [s.photo, s[size]].join(' ');
  if (property.photoUrl && property.photoUrl.startsWith('/')) {
    return (
      <span className={cls}>
        <Image src={property.photoUrl} alt={t('property.photoAlt', { name: property.name })} fill sizes="160px" loading="eager" />
      </span>
    );
  }
  return (
    <span className={[cls, s.placeholder].join(' ')} aria-hidden="true">
      <Building2 size={size === 'lg' ? 32 : 22} />
    </span>
  );
}

export function PropertySelector() {
  const { properties, property, setPropertyId } = useSelectedProperty();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!property) return null;
  const multiple = properties.length > 1;
  return (
    <div className={s.wrap} ref={ref}>
      <button
        type="button"
        className={s.trigger}
        aria-haspopup={multiple ? 'menu' : undefined}
        aria-expanded={multiple ? open : undefined}
        aria-label={`${t('property.selectorLabel')}: ${property.name}, ${property.city}${multiple ? `. ${t('property.selectorChange')}` : ''}`}
        onClick={() => multiple && setOpen((o) => !o)}
        disabled={!multiple}
      >
        <PropertyPhoto property={property} size="sm" />
        <span className={s.name}>
          <strong>{property.name}</strong>
          <span className={s.dot} aria-hidden="true">
            ·
          </span>
          <span className={s.city}>{property.city}</span>
        </span>
        {multiple ? <ChevronDown size={20} aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className={s.menu} role="menu">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === property.id}
              className={s.item}
              onClick={() => {
                setPropertyId(p.id);
                setOpen(false);
              }}
            >
              <PropertyPhoto property={p} size="sm" />
              <span className={s.itemText}>
                <strong>{p.name}</strong>
                <span>{p.city}</span>
              </span>
              {p.id === property.id ? <Check size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
