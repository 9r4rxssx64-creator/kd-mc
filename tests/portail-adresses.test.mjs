/* GARDE-FOU — « pourquoi les adresses ne sont pas pareilles ? » (Kevin 2026-08-13).
 *
 * Trois défauts trouvés en vrai sur le portail kd-mc.com, invisibles à l'œil :
 *  1. 5 cartes affichaient « kd-mc.com → shops / tech-hub / … » mais le lien partait sur
 *     `9r4rxssx64-creator.github.io` — l'adresse AFFICHÉE était fausse, et le clic
 *     SORTAIT du domaine (adresse technique exposée, session du domaine perdue).
 *  2. « CMCteams light » affichait `cmcteams-light.kd-mc.com` et menait sur
 *     `departs.kd-mc.com` — affiché ≠ destination.
 *  3. Des apps entières (World Monitor, OSINT, Outils IA, Mes outils) vivaient sur un
 *     chemin alors que la règle du domaine (KDMC_ADRESSES.md) est « UNE belle adresse
 *     par projet ». D'où l'impression de désordre.
 *
 * Ce test verrouille les trois : aucune sortie du domaine, l'adresse affichée EST la
 * destination, et chaque belle adresse citée existe vraiment dans le routeur.
 *
 * node tests/portail-adresses.test.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'kdmc-home/index.html'), 'utf8');
const worker = readFileSync(join(ROOT, 'services/kdmc-router/worker.js'), 'utf8');
const wrangler = readFileSync(join(ROOT, 'services/kdmc-router/wrangler.toml'), 'utf8');

let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* Cartes du portail : href + libellé d'adresse affiché. */
const cartes = [...html.matchAll(/<a class="card[^"]*"[^>]*href="([^"]+)"([\s\S]*?)<\/a>/g)].map((m) => {
  const nom = (m[2].match(/<span class="nm">([\s\S]*?)<\/span>/) || [, '?'])[1].replace(/<[^>]+>/g, '').trim();
  const adr = (m[2].match(/<span class="url">([\s\S]*?)<\/span>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
  return { href: m[1], nom, adr };
});

ok(cartes.length >= 25, `le portail expose ${cartes.length} cartes (≥25 attendu)`);

/* 1. Aucune carte ne sort du domaine. */
for (const c of cartes)
  ok(!/github\.io/.test(c.href), `« ${c.nom} » sort du domaine : ${c.href}`);

/* 2. L'adresse affichée EST la destination.
      · « hote.kd-mc.com »        → le lien doit aller sur https://hote.kd-mc.com/…
      · « hote.kd-mc.com → page » → le lien doit aller sur ce même hôte. */
for (const c of cartes) {
  if (!c.adr) continue;
  const hote = c.adr.split('→')[0].trim();
  if (!/^[a-z0-9.-]+\.kd-mc\.com$|^kd-mc\.com$/.test(hote)) continue;
  if (c.href.startsWith('https://')) {
    const reel = new URL(c.href).hostname;
    ok(reel === hote, `« ${c.nom} » affiche ${hote} mais mène sur ${reel}`);
  } else {
    ok(hote === 'kd-mc.com', `« ${c.nom} » affiche ${hote} mais le lien est un chemin (${c.href})`);
  }
}

/* 3. Chaque belle adresse citée existe VRAIMENT (routeur + domaine provisionné),
      sinon la carte mène à une page morte. */
const hotes = [...new Set(cartes
  .filter((c) => c.href.startsWith('https://'))
  .map((c) => new URL(c.href).hostname)
  .filter((h) => h.endsWith('.kd-mc.com') && h !== 'admin.kd-mc.com'))]; // admin = worker séparé (kdmc-access)
for (const h of hotes) {
  ok(worker.includes(`'${h}'`), `${h} absent des ROUTES du routeur → page morte`);
  ok(wrangler.includes(`"${h}"`), `${h} absent de wrangler.toml → ni DNS ni certificat`);
}

/* 4. Les 5 belles adresses ajoutées ce jour restent en place (anti-retour en arrière). */
for (const h of ['worldmonitor.kd-mc.com', 'osint.kd-mc.com', 'ia.kd-mc.com', 'outils.kd-mc.com', 'shops.kd-mc.com'])
  ok(worker.includes(`'${h}'`) && wrangler.includes(`"${h}"`), `${h} a disparu (régression)`);

console.log(`Adresses du portail : ${pass} vérifications OK, ${fails.length} échec(s)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
