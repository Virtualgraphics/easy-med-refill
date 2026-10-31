import type { ProviderKind, ReorderLanguage } from '../db/types';
import { getApiBaseUrl } from './config';

export interface ReorderPayload {
  request_id: string;
  language: ReorderLanguage;
  patient_reference: string | null;
  provider: { kind: ProviderKind; name: string; email: string | null };
  medication: { name: string; strength: string | null; form: string | null; gtin: string | null; pharmacode: string | null };
  quantity_packs: number;
  units_remaining: number | null;
  needed_by: string | null;
  message: { subject: string; body: string };
}

export interface ReorderSubmission {
  reference: string;
  status: 'queued' | 'sent';
}

export interface ReorderStatusResponse {
  reference: string;
  status: 'queued' | 'sent' | 'confirmed' | 'overdue' | 'cancelled';
  confirmed_at: string | null;
  follow_up_count: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

export interface ApiOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

async function request<T>(path: string, init: RequestInit, { fetchImpl = fetch, timeoutMs = 15_000 }: ApiOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError('No server configured.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiKey = process.env.EXPO_PUBLIC_API_KEY?.trim() ?? '';
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(`Server answered ${response.status}.`, response.status);
    }
    return (await response.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error && e.name === 'AbortError' ? 'The server did not answer in time.' : 'The server could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

/** Queues a reorder on the server. In stub mode it is marked sent locally. */
export async function submitReorder(payload: ReorderPayload, options: ApiOptions = {}): Promise<ReorderSubmission> {
  if (!getApiBaseUrl()) {
    return { reference: `LOCAL-${payload.request_id.replace(/-/g, '').slice(0, 8).toUpperCase()}`, status: 'sent' };
  }
  return request<ReorderSubmission>('/v1/reorders', { method: 'POST', body: JSON.stringify(payload) }, options);
}

/** Current server-side status; null in stub mode. */
export async function fetchReorderStatus(reference: string, options: ApiOptions = {}): Promise<ReorderStatusResponse | null> {
  if (!getApiBaseUrl()) {
    return null;
  }
  return request<ReorderStatusResponse>(`/v1/reorders/${encodeURIComponent(reference)}`, { method: 'GET' }, options);
}
