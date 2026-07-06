import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "make-sfx-core/browser",
        replacement: resolve(__dirname, "../../packages/core/src/browser.ts"),
      },
      {
        find: "make-sfx-core",
        replacement: resolve(__dirname, "../../packages/core/src/index.ts"),
      },
    ],
  },
});