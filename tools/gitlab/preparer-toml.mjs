// Usage: node preparer-toml.mjs <dossier-worker> <sortie.toml>
// Sort sur stdout la liste des bindings KV a re-creer (un par ligne: BINDING<TAB>ANCIEN_ID)
import { readFileSync, writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const lignes = readFileSync(`${dir}/wrangler.toml`, 'utf8').split('\n');
const garde = []; let section = ''; let kv = []; let bindingCourant = null; let dansRoutes = false;
for (const l of lignes) {
  // routes = [ ... ] peut s'etaler sur plusieurs lignes : tout sauter jusqu'au ]
  if (dansRoutes) { if (/\]/.test(l)) dansRoutes = false; continue; }
  if (/^\s*routes\s*=/.test(l)) { if (!/\]/.test(l)) dansRoutes = true; continue; }
  const sec = l.match(/^\s*\[\[?([a-z0-9_.]+)\]?\]/i);
  if (sec) { section = sec[1]; bindingCourant = null; }
  if (/^\s*(pattern|zone_name|custom_domain)\s*=/.test(l)) continue;
  if (section === 'kv_namespaces') {
    const b = l.match(/binding\s*=\s*"([^"]+)"/); if (b) bindingCourant = b[1];
    const i = l.match(/^\s*id\s*=\s*"([^"]+)"/);
    if (i && bindingCourant) { kv.push(`${bindingCourant}\t${i[1]}`); garde.push(`id = "@@${bindingCourant}@@"`); continue; }
  }
  if (/^\s*\[\[?routes\]?\]/.test(l)) continue;
  garde.push(l);
}
writeFileSync(out, garde.join('\n'));
console.log(kv.join('\n'));
