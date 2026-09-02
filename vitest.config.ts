import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    /**
     * The default 5 s is too tight for the API tests, and the reason is dull
     * rather than interesting: `isAdminSdkReady()` synchronously loads the whole
     * `firebase-admin` package the first time any authenticated route is hit, so
     * every test *file* touching one pays that import. On a checkout living on a
     * mounted Windows filesystem, with several vitest workers doing it at once,
     * that alone can exceed 5 s — and the failure looks like a hung route rather
     * than a slow disk.
     *
     * Raised rather than worked around: the tests are correct, they are just
     * being charged for a heavyweight import. Still bounded, so a genuine hang
     * fails instead of running forever.
     */
    testTimeout: 30_000,
    // `.tsx` as well as `.ts`: a component whose whole job is what it renders —
    // the route error boundary's offline wording, say — can only be tested by
    // rendering it, and JSX in a `.ts` file is a syntax error.
    include: [
      "src/**/*.test.{ts,tsx}",
      // Packs keep their tests beside the code they cover (PLUGIN_PACK_LAYOUT.md).
      "plugins/*/src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "units/**/*.test.ts",
      // Only the Electron-free parts of desktop/ are testable; main.ts needs a real shell.
      "desktop/**/*.test.ts",
    ],
  },
});
