import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Project Pages path (`https://<owner>.github.io/ops-pilot/`). Override with `VITE_BASE=/` for local root. */
const base = process.env.VITE_BASE ?? "/ops-pilot/";

export default defineConfig({
  base,
  plugins: [react()],
});
