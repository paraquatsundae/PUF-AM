import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Workshop default: load the live Vite/Express app from the host so `/api/*`
 * (invite PIN, weather proxy) works on the Android emulator.
 *
 * Emulator → host loopback is http://10.0.2.2:3000 (keep `npm run dev` running).
 *
 * Fully packaged / offline shell (no live server):
 *   set CAP_SERVER_URL= (empty) or CAP_PACKAGED=1 before `npx cap sync`
 */
const liveServerUrl =
  process.env.CAP_PACKAGED === '1'
    ? undefined
    : (process.env.CAP_SERVER_URL || 'http://10.0.2.2:3000').trim() || undefined;

// Live LAN/emulator reload uses cleartext HTTP. androidScheme must be "http" too —
// "https" + server.url http://192.168.x.x leaves a blank WebView (Chrome still works).
const config: CapacitorConfig = {
  appId: 'com.sentinut.farm',
  appName: 'PUF-Ag Manager',
  webDir: 'dist',
  server: {
    androidScheme: liveServerUrl ? 'http' : 'https',
    cleartext: true,
    ...(liveServerUrl ? { url: liveServerUrl } : {}),
  },
  android: {
    allowMixedContent: true,
  },
  // Do NOT enable CapacitorHttp global fetch patch — it breaks Firebase Auth/Firestore
  // ("client is offline" / WebChannel failures). Use relative /api via server.url instead.
};

export default config;
