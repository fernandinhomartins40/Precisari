import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionDto, ActionsResponse, UpdateMeBody, UpdatePropertyBody } from '@precisari/shared';
import { api } from './api';
import { addDays, localIso, monthKey } from './dates';
import { qk } from './query';
import { useSession } from './session';

export function useMe() {
  const { status } = useSession();
  return useQuery({ queryKey: qk.me, queryFn: () => api.me.get(), enabled: status === 'signedIn' });
}

export function useProperties() {
  const { status } = useSession();
  return useQuery({ queryKey: qk.properties, queryFn: () => api.properties.list(), enabled: status === 'signedIn' });
}

export function useNights(propertyId: string | undefined, days = 90) {
  return useQuery({
    queryKey: qk.nights(propertyId ?? '', days),
    queryFn: () => {
      const from = localIso();
      return api.properties.nights(propertyId ?? '', { from, to: addDays(from, days - 1) });
    },
    enabled: !!propertyId,
  });
}

export function useNight(propertyId: string | undefined, date: string) {
  return useQuery({
    queryKey: qk.night(propertyId ?? '', date),
    queryFn: () => api.properties.night(propertyId ?? '', date),
    enabled: !!propertyId,
  });
}

export function usePendingActions(propertyId: string | undefined) {
  return useQuery({
    queryKey: qk.actions(propertyId),
    queryFn: () => api.actions.list({ status: 'PENDING', propertyId }),
    enabled: !!propertyId,
  });
}

export function useInsights(propertyId: string | undefined, month = monthKey(localIso())) {
  return useQuery({
    queryKey: qk.insights(propertyId ?? '', month),
    queryFn: () => api.properties.insights(propertyId ?? '', month),
    enabled: !!propertyId,
  });
}

export type Decision = 'approve' | 'dismiss' | 'revert';

/** Approve / dismiss / revert with optimistic removal from the home stack. */
export function useDecideAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, decision }: { action: ActionDto; decision: Decision }) => api.actions[decision](action.id),
    onMutate: async ({ action, decision }) => {
      if (decision === 'revert') return;
      const key = qk.actions(action.propertyId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ActionsResponse>(key);
      if (prev) {
        qc.setQueryData<ActionsResponse>(key, {
          ...prev,
          items: prev.items.filter((a) => a.id !== action.id),
          totalEstimatedGain: prev.totalEstimatedGain - action.estimatedGain,
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, { action }) => {
      void qc.invalidateQueries({ queryKey: ['actions'] });
      void qc.invalidateQueries({ queryKey: ['nights', action.propertyId] });
      void qc.invalidateQueries({ queryKey: ['night', action.propertyId] });
      void qc.invalidateQueries({ queryKey: ['insights', action.propertyId] });
    },
  });
}

export function useSyncProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) => api.properties.sync(propertyId),
    onSettled: (_d, _e, propertyId) => {
      void qc.invalidateQueries({ queryKey: qk.properties });
      void qc.invalidateQueries({ queryKey: ['nights', propertyId] });
      void qc.invalidateQueries({ queryKey: ['actions'] });
    },
  });
}

export function useUpdateProperty(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePropertyBody) => api.properties.update(propertyId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.properties });
      void qc.invalidateQueries({ queryKey: ['nights', propertyId] });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) => api.properties.delete(propertyId),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeBody) => api.me.update(body),
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}
