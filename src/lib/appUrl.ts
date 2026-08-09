const LOCAL_DEV_URL = 'http://localhost:3000';

/** Running app URL: published Cloud Run, current origin, or local dev. */
export function getAppUrl(): string {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  if (configured && configured !== 'MY_APP_URL' && !configured.includes('ai.studio/apps')) {
    return configured.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return LOCAL_DEV_URL;
}

/** Whether a published production URL is configured. */
export function hasPublishedAppUrl(): boolean {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  return Boolean(
    configured &&
    configured !== 'MY_APP_URL' &&
    !configured.includes('ai.studio/apps')
  );
}
