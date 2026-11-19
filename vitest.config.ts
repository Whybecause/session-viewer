import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// The Svelte plugin compiles the runes of *.svelte.ts modules, so their state logic can be tested too.
export default defineConfig({
  plugins: [svelte({ configFile: false })],
  test: { setupFiles: ["./web/src/lib/test-setup.ts"] },
});
