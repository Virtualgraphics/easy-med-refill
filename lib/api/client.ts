import type { ProviderKind, ReorderLanguage } from '../db/types';
import { getApiBaseUrl } from './config';

export interface ReorderPayloadItem {
  medication: { name: string; strength: string | null; form: string | null; gtin: string | null; pharmacode: string | null };
  quantity_packs: number;
  units_remaining: number | null;
  needed_by: string | null;
}

/** One batch: every medication ordered together from one supplier. */
export interface ReorderPayload {
  /** The batch id; the server derives its short reference from it. */
  request_id: string;
  language: ReorderLanguage;
  patient_reference: string | null;
  provider: { kind: ProviderKind; name: string; email: string | null };
  items: ReorderPayloadItem[];
  /** Earliest needed-by date across the items. */
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

export interface ShortageFeedEntry {
  source: string;
  product_code: string;
  active_ingredient: string | null;
  status: string | null;
  fetched_at: string;
}

export interface ShortageRefreshResult {
  simulated: number;
  bwl: number | null;
  bwl_error: string | null;
}

/** Asks the server to rebuild its shortage list now (BWL via Muse). Null in stub mode. */
export async function refreshShortagesOnServer(force = false, options: ApiOptions = {}): Promise<ShortageRefreshResult | null> {
  if (!getApiBaseUrl()) {
    return null;
  }
  return request<ShortageRefreshResult>('/v1/shortages/refresh', { method: 'POST', body: JSON.stringify({ force }) }, { timeoutMs: 120_000, ...options });
}

/** Published shortage list (product codes and ATC/ingredient rows); null in stub mode. */
export async function fetchShortages(options: ApiOptions = {}): Promise<ShortageFeedEntry[] | null> {
  if (!getApiBaseUrl()) {
    return null;
  }
  const data = await request<{ shortages: ShortageFeedEntry[] }>('/v1/shortages', { method: 'GET' }, options);
  return data.shortages;
}

export interface ExtractedMedication {
  name: string;
  active_ingredient: string | null;
  strength: string | null;
  form: string | null;
  morning: number;
  noon: number;
  evening: number;
  night: number;
  as_needed: boolean;
  intake_note: string | null;
  reason: string | null;
}

export interface ExtractedPlan {
  medications: ExtractedMedication[];
  patient_fields_seen: boolean;
  notes: string | null;
}

/**
 * Sends a photo of a paper medication list to the server, which asks
 * Meta's Muse Spark to transcribe it. Requires a configured server.
 */
export async function extractPlanFromPhoto(imageBase64: string, mime: string, options: ApiOptions = {}): Promise<ExtractedPlan> {
  if (!getApiBaseUrl()) {
    throw new ApiError('Reading a photo needs the server. Set EXPO_PUBLIC_API_URL.');
  }
  return request<ExtractedPlan>('/v1/extract-plan', { method: 'POST', body: JSON.stringify({ image_base64: imageBase64, mime }) }, { timeoutMs: 120_000, ...options });
}

/** Current server-side status; null in stub mode. */
export async function fetchReorderStatus(reference: string, options: ApiOptions = {}): Promise<ReorderStatusResponse | null> {
  if (!getApiBaseUrl()) {
    return null;
  }
  return request<ReorderStatusResponse>(`/v1/reorders/${encodeURIComponent(reference)}`, { method: 'GET' }, options);
}
