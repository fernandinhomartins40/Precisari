import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PropertyDto } from '@precisari/shared';
import { useProperties } from './hooks';

const KEY = 'precisari.selectedProperty';

interface SelectedPropertyValue {
  property: PropertyDto | undefined;
  properties: PropertyDto[];
  isLoading: boolean;
  select(id: string): void;
}

const Ctx = createContext<SelectedPropertyValue | null>(null);

export function SelectedPropertyProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((id) => id && setSelectedId((cur) => cur ?? id))
      .catch(() => undefined);
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    void AsyncStorage.setItem(KEY, id).catch(() => undefined);
  }, []);

  const value = useMemo(() => {
    const properties = data ?? [];
    const property = properties.find((p) => p.id === selectedId) ?? properties[0];
    return { property, properties, isLoading, select };
  }, [data, selectedId, isLoading, select]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelectedProperty(): SelectedPropertyValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSelectedProperty must be used inside SelectedPropertyProvider');
  return ctx;
}
