/**
 * The config the main process hands the renderer, and how it travels.
 *
 * Shared by `main.ts` (encode) and `preload.ts` (decode) so the flag name and
 * encoding cannot drift apart. It rides on `additionalArguments` rather than IPC
 * so `src/lib/apiBase.ts` can read it synchronously on first paint — before any
 * fetch is issued and therefore before anything could target the wrong origin.
 *
 * Imports nothing from `electron`, which keeps it testable in plain Node.
 * Renderer-side counterpart: `src/lib/desktopBridge.ts`.
 */

export const DESKTOP_CONFIG_FLAG = '--puf-desktop-config=';

export type DesktopConfig = {
  isDesktop: true;
  /** Base for the cloud-only routes — invite PIN and DPIRD need server secrets. */
  cloudApiBase: string;
  /** Base for `/api/mist/freenet/*` — empty string means same-origin loopback. */
  freenetApiBase: string;
  mistEnabled: boolean;
};

export const DESKTOP_CONFIG_FALLBACK: DesktopConfig = {
  isDesktop: true,
  cloudApiBase: '',
  freenetApiBase: '',
  mistEnabled: false,
};

export function encodeDesktopConfig(config: DesktopConfig): string {
  return `${DESKTOP_CONFIG_FLAG}${Buffer.from(JSON.stringify(config)).toString('base64')}`;
}

/**
 * Never throws: a malformed flag must not leave the operator with a blank window.
 * The fallback is same-origin everywhere, which is the safe direction — a local
 * 404 beats silently sending farm data somewhere unintended.
 */
export function decodeDesktopConfig(argv: readonly string[]): DesktopConfig {
  const arg = argv.find((value) => value.startsWith(DESKTOP_CONFIG_FLAG));
  if (!arg) return DESKTOP_CONFIG_FALLBACK;

  try {
    const json = Buffer.from(arg.slice(DESKTOP_CONFIG_FLAG.length), 'base64').toString('utf8');
    return {
      ...DESKTOP_CONFIG_FALLBACK,
      ...(JSON.parse(json) as Partial<DesktopConfig>),
      isDesktop: true,
    };
  } catch {
    return DESKTOP_CONFIG_FALLBACK;
  }
}
