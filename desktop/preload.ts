/**
 * Preload bridge — the only surface the renderer sees of the desktop shell.
 *
 * `contextIsolation` stays on and Node stays out of the renderer. The config is
 * passed as an `additionalArguments` flag so `src/lib/apiBase.ts` can read it
 * synchronously on first paint (Phase 1 adds that branch).
 */

import { contextBridge, ipcRenderer } from 'electron';

const CONFIG_FLAG = '--puf-desktop-config=';

type DesktopConfig = {
  isDesktop: true;
  apiBase: string;
  freenetApiBase: string;
  mistEnabled: boolean;
};

function readConfig(): DesktopConfig {
  const fallback: DesktopConfig = {
    isDesktop: true,
    apiBase: '',
    freenetApiBase: '',
    mistEnabled: false,
  };

  const arg = process.argv.find((value) => value.startsWith(CONFIG_FLAG));
  if (!arg) return fallback;

  try {
    const json = Buffer.from(arg.slice(CONFIG_FLAG.length), 'base64').toString('utf8');
    return { ...fallback, ...(JSON.parse(json) as Partial<DesktopConfig>), isDesktop: true };
  } catch {
    return fallback;
  }
}

const config = readConfig();

contextBridge.exposeInMainWorld('pufamDesktop', {
  ...config,
  platform: process.platform,
  freenet: {
    status: () => ipcRenderer.invoke('puf-freenet:status'),
    start: () => ipcRenderer.invoke('puf-freenet:start'),
    stop: () => ipcRenderer.invoke('puf-freenet:stop'),
    onState: (listener: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown) => listener(status);
      ipcRenderer.on('puf-freenet:state', handler);
      return () => ipcRenderer.removeListener('puf-freenet:state', handler);
    },
  },
});
