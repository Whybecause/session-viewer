import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    proxy: { "/ws": { target: "ws://localhost:3000", ws: true } },
  },
});
