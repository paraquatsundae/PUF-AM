/**
 * Preload bridge — the only surface the renderer sees of the desktop shell.
 *
 * `contextIsolation` stays on and Node stays out of the renderer. The config
 * arrives as a command-line flag rather than over IPC so `src/lib/apiBase.ts` can
 * read it synchronously on first paint, before any fetch is issued.
 *
 * Renderer-side counterpart: `src/lib/desktopBridge.ts`.
 */

import { contextBridge, ipcRenderer } from 'electron';

import { decodeDesktopConfig } from './desktopConfig.ts';

const config = decodeDesktopConfig(process.argv);

contextBridge.exposeInMainWorld('pufamDesktop', {
  ...config,
  platform: process.platform,
  mist: {
    getPreference: () => ipcRenderer.invoke('puf-desktop:mist-preference'),
    setPreference: (enabled: boolean) =>
      ipcRenderer.invoke('puf-desktop:set-mist-preference', enabled),
  },
  // The pairing code and the paired-device list cross by IPC, not through the
  // LAN listener's own routes: the desktop UI is on loopback, and giving it a
  // way to read the code over HTTP would mean a route that hands out the hub's
  // credential to whoever asks.
  lanHub: {
    state: () => ipcRenderer.invoke('puf-desktop:lan-hub'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('puf-desktop:set-lan-hub', enabled),
    rotatePairingCode: () => ipcRenderer.invoke('puf-desktop:rotate-lan-pairing-code'),
    forgetDevice: (deviceId: string) =>
      ipcRenderer.invoke('puf-desktop:forget-lan-device', deviceId),
    onState: (listener: (state: unknown) => void) => {
      const handler = (_event: unknown, state: unknown) => listener(state);
      ipcRenderer.on('puf-desktop:lan-hub-state', handler);
      return () => ipcRenderer.removeListener('puf-desktop:lan-hub-state', handler);
    },
  },
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
