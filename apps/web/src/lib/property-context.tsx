'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropertyDto } from '@precisari/shared';
import { useProperties } from './queries';

const KEY = 'precisari.propertyId';

interface Ctx {
  properties: PropertyDto[];
  property: PropertyDto | undefined;
  setPropertyId: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
}

const PropertyContext = createContext<Ctx>({ properties: [], property: undefined, setPropertyId: () => undefined, isLoading: true, isError: false });

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const q = useProperties();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSelected(localStorage.getItem(KEY));
    } catch {
      /* ignore */
    }
  }, []);

  const setPropertyId = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const properties = q.data ?? [];
    const property = properties.find((p) => p.id === selected) ?? properties[0];
    return { properties, property, setPropertyId, isLoading: q.isPending, isError: q.isError };
  }, [q.data, q.isPending, q.isError, selected, setPropertyId]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useSelectedProperty() {
  return useContext(PropertyContext);
}
