/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Maps JS API — client-visible; restrict in Google Cloud (see Plans/API_KEY_SECURITY.md) */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Capacitor / device API origin, e.g. http://10.0.2.2:3000 or http://192.168.x.x:3000 */
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WORKSHOP_MODE?: string
  readonly VITE_REQUIRE_AUTH?: string
  /** Baked at build time — inlined by Vite, so no runtime env var can un-gate it. */
  readonly VITE_MIST_EXPERIMENTAL?: string
  /** Freenet API origin for `/api/mist/freenet/*` when it is not same-origin. */
  readonly VITE_MIST_FREENET_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
