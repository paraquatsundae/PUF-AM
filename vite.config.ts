import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Absolute `/` for Cloud Run / browser hosting. Capacitor builds set VITE_CAPACITOR=1.
    base: process.env.VITE_CAPACITOR === '1' ? './' : '/',
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: ['leaflet'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('leaflet') || id.includes('react-leaflet')) return 'vendor-leaflet';
              if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
              if (
                id.includes('react-dom') ||
                id.includes('react-router') ||
                (id.includes('/react/') && !id.includes('react-leaflet'))
              ) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
