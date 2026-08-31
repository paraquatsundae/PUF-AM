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
    // `.tsx` as well as `.ts`: a component whose whole job is what it renders —
    // the route error boundary's offline wording, say — can only be tested by
    // rendering it, and JSX in a `.ts` file is a syntax error.
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "units/**/*.test.ts",
      // Only the Electron-free parts of desktop/ are testable; main.ts needs a real shell.
      "desktop/**/*.test.ts",
    ],
  },
});
