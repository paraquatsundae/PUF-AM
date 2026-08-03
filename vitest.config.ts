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
    include: [
      "src/**/*.test.ts",
      "tests/**/*.test.ts",
      "units/**/*.test.ts",
      // Only the Electron-free parts of desktop/ are testable; main.ts needs a real shell.
      "desktop/**/*.test.ts",
    ],
  },
});
