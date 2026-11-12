import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Après le build : donne au service worker un identifiant de version et la liste exacte des fichiers à garder hors ligne. */
function serviceWorker(): Plugin {
  let sortie = "dist";
  return {
    name: "bibi-service-worker",
    apply: "build",
    configResolved(c) { sortie = c.build.outDir; },
    closeBundle() {
      const tous: string[] = [];
      const parcourir = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) parcourir(p); else tous.push(p); } };
      parcourir(sortie);
      const liste = tous.map((p) => "/" + relative(sortie, p).split("\\").join("/")).filter((u) => u !== "/service-worker.js");
      const precache = [...new Set(["/", ...liste])].sort();
      const h = createHash("sha256");
      for (const u of precache.filter((u) => u !== "/")) h.update(readFileSync(join(sortie, u)));
      const build = h.digest("hex").slice(0, 12);
      const f = join(sortie, "service-worker.js");
      const source = readFileSync(f, "utf8");
      if (!source.includes('"__BIBI_BUILD__"') || !source.includes("= __BIBI_PRECACHE__;")) throw new Error("service-worker.js : marqueurs de build introuvables");
      writeFileSync(f, source.replace('"__BIBI_BUILD__"', JSON.stringify(build)).replace("= __BIBI_PRECACHE__;", `= ${JSON.stringify(precache)};`));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  server: { port: 5173, proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT ?? 3000}`, changeOrigin: false } } },
});
