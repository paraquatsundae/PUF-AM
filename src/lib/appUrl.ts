/** AI Studio share URL — opens the project in AI Studio (not the published Cloud Run app). */
export const SENTINUT_SHARE_URL =
  'https://ai.studio/apps/143a17d7-b431-4490-8302-3a5ff176bb96';

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

/** Whether a published production URL is configured (Cloud Run from AI Studio Publish). */
export function hasPublishedAppUrl(): boolean {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  return Boolean(
    configured &&
    configured !== 'MY_APP_URL' &&
    !configured.includes('ai.studio/apps')
  );
}

export function getShareUrl(): string {
  return SENTINUT_SHARE_URL;
}
