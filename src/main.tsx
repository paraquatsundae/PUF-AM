import './lib/leaflet-setup';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {ensureSyncHub} from './lib/syncHub.ts';

// The packaged APK hosts no Express, so `/api/*` has nowhere to go until a LAN
// hub is found. Start looking at boot rather than when the operator happens to
// open Settings — by the time anything needs the hub, it is usually there. No
// effect on web, desktop or live-reload builds, which are already same-origin.
void ensureSyncHub().catch(() => {
  /* Offline is a normal state here; the UI reports it where it matters. */
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
