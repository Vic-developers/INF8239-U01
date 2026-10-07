/**
 * Server-state hooks.
 *
 * Every screen reads through these, so there is exactly one place that
 * knows the API's shapes and one cache to invalidate after a mutation.
 * The alternative — each page fetching for itself — is how a UI ends up
 * with six copies of a list that disagree after an edit.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { operationPlanSchema, type PlanPreview } from '@mcc/shared';
import type { z } from 'zod';
import { ApiError, api } from '@/lib/api';

/**
 * The shape sent to `POST /plans`.
 *
 * `z.input` rather than `z.infer`: the server applies the schema's
 * defaults, so `state`, `attempts` and `policy` are optional on the wire
 * and mandatory in the parsed type. Sending the parsed type would mean the
 * client inventing values the server is meant to decide.
 */
export type OperationPlanPayload = z.input<typeof operationPlanSchema>;

// ── Types the API returns ──────────────────────────────────────────────────

export interface MoodleInstance {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly status: string;
  readonly moodleVersion: string | null;
  readonly moodleRelease: string | null;
  readonly sitename: string | null;
  readonly rateLimitProfile: string;
  readonly pluginInstalled: boolean;
  readonly lastProbeAt: string | null;
  readonly lastProbeStatus: string;
  readonly lastLatencyP50Ms: number | null;
  readonly createdAt: string;
}

export interface ProbeResult {
  readonly reachable: boolean;
  readonly version: string;
  readonly release: string;
  readonly sitename: string;
  readonly supported: boolean;
  readonly pluginInstalled: boolean;
  readonly grantedCapabilities: readonly string[];
  readonly deniedCapabilities: readonly string[];
  readonly latencyP50Ms: number;
}

export interface PlanSummary {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly origin: string;
  readonly createdAt: string;
}

export interface PlanDetail {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly moodleInstanceId: string | null;
  readonly origin: string;
  readonly options: Record<string, unknown>;
  readonly policy: Record<string, unknown>;
  readonly preview: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly items: ReadonlyArray<{
    readonly naturalKey: string;
    readonly targetType: string;
    readonly state: string;
    readonly moodleId: string | null;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  }>;
}

export interface CreatedPlan {
  readonly id: string;
  readonly idempotent: boolean;
}

export interface ApprovedPlan {
  readonly planId: string;
  readonly job: {
    readonly id: string;
    readonly type: string;
    readonly queue: string;
    readonly status: string;
    readonly total: number;
  };
}

// ── Moodle instances ───────────────────────────────────────────────────────

export const moodleKeys = {
  all: ['moodles'] as const,
  list: () => [...moodleKeys.all, 'list'] as const,
  detail: (id: string) => [...moodleKeys.all, 'detail', id] as const,
};

export function useMoodleInstances() {
  return useQuery<MoodleInstance[], ApiError>({
    queryKey: moodleKeys.list(),
    queryFn: () => api.get<MoodleInstance[]>('/moodles'),
  });
}

export function useMoodleInstance(id: string | undefined) {
  return useQuery<MoodleInstance, ApiError>({
    queryKey: moodleKeys.detail(id ?? 'none'),
    queryFn: () => api.get<MoodleInstance>(`/moodles/${id ?? ''}`),
    enabled: id !== undefined && id.length > 0,
  });
}

export interface CreateInstanceInput {
  readonly name: string;
  readonly baseUrl: string;
  readonly token: string;
  readonly rateLimitProfile: string;
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  return useMutation<MoodleInstance, ApiError, CreateInstanceInput>({
    mutationFn: (input) => api.post<MoodleInstance>('/moodles', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moodleKeys.all });
    },
  });
}

export function useProbeInstance() {
  const queryClient = useQueryClient();
  return useMutation<ProbeResult, ApiError, string>({
    mutationFn: (id) => api.post<ProbeResult>(`/moodles/${id}/probe`),
    // The probe persists the discovered version and capabilities on the
    // instance, so the list has to be re-read or it shows stale data.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moodleKeys.all });
    },
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/moodles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moodleKeys.all });
    },
  });
}

// ── Plans ──────────────────────────────────────────────────────────────────

export const planKeys = {
  all: ['plans'] as const,
  list: () => [...planKeys.all, 'list'] as const,
  detail: (id: string) => [...planKeys.all, 'detail', id] as const,
};

export function usePlans() {
  return useQuery<PlanSummary[], ApiError>({
    queryKey: planKeys.list(),
    queryFn: () => api.get<PlanSummary[]>('/plans'),
  });
}

export function usePlan(id: string | undefined) {
  return useQuery<PlanDetail, ApiError>({
    queryKey: planKeys.detail(id ?? 'none'),
    queryFn: () => api.get<PlanDetail>(`/plans/${id ?? ''}`),
    enabled: id !== undefined && id.length > 0,
    // A plan in flight changes state on its own as the worker executes it.
    // Polling only while it can still move avoids hammering a plan that
    // already reached a terminal status.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'approved' || status === 'executing' ? 1000 : false;
    },
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation<CreatedPlan, ApiError, OperationPlanPayload>({
    mutationFn: (input) => api.post<CreatedPlan>('/plans', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

export function usePreviewPlan() {
  return useMutation<PlanPreview, ApiError, string>({
    mutationFn: (id) => api.post<PlanPreview>(`/plans/${id}/preview`),
  });
}

export function useApprovePlan() {
  const queryClient = useQueryClient();
  return useMutation<ApprovedPlan, ApiError, string>({
    mutationFn: (id) => api.post<ApprovedPlan>(`/plans/${id}/approve`, { confirmPreview: true }),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(id) });
    },
  });
}

export function useCancelPlan() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.post<void>(`/plans/${id}/cancel`),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(id) });
    },
  });
}
