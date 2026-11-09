'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionDto, ActionsResponse, UpdateMeBody, UpdatePropertyBody } from '@precisari/shared';
import { api } from './api';

export const qk = {
  me: ['me'] as const,
  properties: ['properties'] as const,
  property: (id: string) => ['properties', id] as const,
  nights: (id: string, from: string, to: string) => ['nights', id, from, to] as const,
  night: (id: string, date: string) => ['night', id, date] as const,
  actions: (propertyId?: string) => ['actions', 'PENDING', propertyId ?? 'all'] as const,
  insights: (id: string, month: string) => ['insights', id, month] as const,
  plans: ['plans'] as const,
};

export function useMe(enabled = true) {
  return useQuery({ queryKey: qk.me, queryFn: () => api().me.get(), enabled, staleTime: 30_000 });
}

export function useProperties() {
  return useQuery({ queryKey: qk.properties, queryFn: () => api().properties.list(), staleTime: 60_000 });
}

export function useProperty(id: string) {
  return useQuery({ queryKey: qk.property(id), queryFn: () => api().properties.get(id) });
}

export function useNights(id: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: qk.nights(id ?? '', from, to),
    queryFn: () => api().properties.nights(id ?? '', { from, to }),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useNight(id: string | undefined, date: string | null) {
  return useQuery({
    queryKey: qk.night(id ?? '', date ?? ''),
    queryFn: () => api().properties.night(id ?? '', date ?? ''),
    enabled: Boolean(id && date),
  });
}

export function usePendingActions(propertyId?: string) {
  return useQuery({
    queryKey: qk.actions(propertyId),
    queryFn: () => api().actions.list({ status: 'PENDING', propertyId }),
    staleTime: 15_000,
  });
}

export function useInsights(id: string | undefined, month: string) {
  return useQuery({
    queryKey: qk.insights(id ?? '', month),
    queryFn: () => api().properties.insights(id ?? '', month),
    enabled: Boolean(id),
  });
}

export function usePlans() {
  return useQuery({ queryKey: qk.plans, queryFn: () => api().billing.plans(), staleTime: 3_600_000, retry: 1 });
}

type Decision = 'approve' | 'dismiss' | 'revert';

/** Approve / dismiss / revert with optimistic removal from (or re-insertion into) the pending lists. */
export function useActionDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, decision }: { action: ActionDto; decision: Decision }) => api().actions[decision](action.id),
    onMutate: async ({ action, decision }) => {
      await qc.cancelQueries({ queryKey: ['actions'] });
      const snapshots = qc.getQueriesData<ActionsResponse>({ queryKey: ['actions'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        const without = data.items.filter((a) => a.id !== action.id);
        const items =
          decision === 'revert' ? [{ ...action, status: 'PENDING' as const }, ...without].sort((a, b) => b.estimatedGain - a.estimatedGain) : without;
        qc.setQueryData<ActionsResponse>(key, {
          ...data,
          items,
          totalEstimatedGain: items.reduce((s, a) => s + a.estimatedGain, 0),
        });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_d, _e, { action }) => {
      void qc.invalidateQueries({ queryKey: ['actions'] });
      void qc.invalidateQueries({ queryKey: ['nights', action.propertyId] });
      void qc.invalidateQueries({ queryKey: ['night', action.propertyId] });
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeBody) => api().me.update(body),
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePropertyBody) => api().properties.update(id, body),
    onSuccess: (p) => {
      qc.setQueryData(qk.property(id), p);
      void qc.invalidateQueries({ queryKey: qk.properties });
      void qc.invalidateQueries({ queryKey: ['nights', id] });
    },
  });
}
