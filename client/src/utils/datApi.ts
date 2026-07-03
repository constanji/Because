/**
 * Dynamic DAT API base URL.
 *
 * In development the VITE env var is used; in production the backend serves
 * the runtime URL via the /api/config startupConfig payload, so it can be
 * changed without rebuilding the Docker image.
 */

let _datApiBaseUrl: string | null = null;

/** Call once at app startup with the value from startupConfig. */
export function setDatApiBaseUrl(url: string | undefined | null): void {
  if (url) {
    _datApiBaseUrl = url;
  }
}

/** Returns the current DAT API base URL. */
export function getDatApiBaseUrl(): string {
  return (
    _datApiBaseUrl ||
    import.meta.env.VITE_DAT_OPENAPI_BASE_URL ||
    'http://localhost:8080'
  );
}
