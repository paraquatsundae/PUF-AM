/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DPIRD_API_KEY: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Capacitor / device API origin, e.g. http://10.0.2.2:3000 or http://192.168.x.x:3000 */
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WORKSHOP_MODE?: string
  readonly VITE_REQUIRE_AUTH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
