/**
 * Backend address. Set EXPO_PUBLIC_API_URL (see .env.example). Without it
 * the app runs in stub mode: reorders are recorded locally and marked as
 * sent, but no email goes out. Useful for the UI and for demos offline.
 */
export function getApiBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

export function isStubMode(): boolean {
  return getApiBaseUrl() === null;
}
