/* GARDE — la sauvegarde Firebase prend TOUTE la base et ne rougit que pour une vraie raison (1.10.2026)
 *
 * Mesuré : runs 36872931313 et 36925968030 rouges (« coffre-2026-10-01.json n'est pas une sauvegarde valide ») — le
 * contrôle « ≥ 1 Ko » visait aussi /coffre_vault, vide ; et /kdmc_access n'était jamais sauvegardée (3 branches en dur).
 * Logique de tools/firebase/sauvegarder.cjs avec une fausse base :
 *   1. toutes les branches de la racine sont sauvegardées (dont kdmc_access) ;
 *   2. une branche non essentielle vide (null) est notée « vide », sans échec ;
 *   3. une branche essentielle vide, tronquée ou refusée = défaut ; une autre branche refusée = défaut ;
 *   4. seulement des GET ;
 *   5. SABOTAGE : sans la liste ESSENTIELLES, /apex vide passerait → ce garde rougit.
 * node tests/verify-sauvegarde-firebase.mjs */
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sauvegarder, verifier, ESSENTIELLES } = require('../tools/firebase/sauvegarder.cjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const gros = JSON.stringify({ a: 'x'.repeat(3000) });

function base(contenus) {
  const methodes = [];
  const fetchFn = async (url, init) => {
    methodes.push((init && init.method) || 'GET');
    const u = new URL(url), p = u.pathname.replace(/\.json$/, '');
    if (p === '/' && u.searchParams.get('shallow') === 'true') { const o = {}; for (const k of Object.keys(contenus)) if (k !== '__absente') o[k] = true; return { ok: true, status: 200, json: async () => o }; }
    const k = p.slice(1); const v = contenus[k];
    if (v && v.statut) return { ok: false, status: v.statut, text: async () => '{"error":"Permission denied"}' };
    return { ok: true, status: 200, text: async () => (v === undefined ? 'null' : v) };
  };
  return { fetchFn, methodes };
}

/* 1-2. cas réel du 1.10 */
const d1 = mkdtempSync(join(tmpdir(), 'svg-'));
const b1 = base({ cmcteams: gros, apex: gros, kdmc_access: gros, coffre_vault: 'null', ld_detente: '{"x":1}' });
const r1 = await sauvegarder({ fetchFn: b1.fetchFn, token: 't', dossier: d1, jour: '2026-10-01' });
const fichiers = readdirSync(d1).sort();
ok(fichiers.includes('kdmc_access-2026-10-01.json') && fichiers.includes('ld_detente-2026-10-01.json') && fichiers.length === 5, '1. toutes les branches de la racine sont sauvegardées, dont kdmc_access', fichiers.join());
ok(r1.every((r) => !r.defaut) && r1.find((r) => r.nom === 'coffre_vault').vide === true, '2. /coffre_vault vide = notée « vide », aucun échec (le rouge du 1.10)', JSON.stringify(r1));

/* 3. vraies raisons de rougir */
const d2 = mkdtempSync(join(tmpdir(), 'svg-'));
const b2 = base({ cmcteams: gros, apex: 'null', kdmc_access: { statut: 401 } });
const r2 = await sauvegarder({ fetchFn: b2.fetchFn, token: 't', dossier: d2, jour: '2026-10-01' });
ok(/vide/.test(r2.find((r) => r.nom === 'apex').defaut), '3a. /apex vide = défaut (pas d\'archive trompeuse)');
ok(/401/.test(r2.find((r) => r.nom === 'kdmc_access').defaut), '3b. une autre branche refusée (401) = défaut');
ok(/Permission/.test(verifier('ld_detente', '{"error":"Permission denied"}')) && /incomplet/.test(verifier('cmcteams', '{"a":')), '3c. « Permission denied » ou JSON coupé = défaut, quelle que soit la branche');
const b3 = base({ cmcteams: gros });
const r3 = await sauvegarder({ fetchFn: b3.fetchFn, token: 't', dossier: mkdtempSync(join(tmpdir(), 'svg-')), jour: '2026-10-01' });
ok(r3.find((r) => r.nom === 'apex') && r3.find((r) => r.nom === 'apex').defaut, '3d. une branche essentielle ABSENTE de la racine est quand même regardée → défaut');
ok(!readdirSync(d2).includes('apex-2026-10-01.json'), '3e. une branche en défaut n\'est pas écrite comme sauvegarde');

/* 4. lecture seule */
ok([...b1.methodes, ...b2.methodes].every((m) => m === 'GET'), '4. seulement des GET');

/* 5. sabotage */
const garde = ESSENTIELLES.splice(0);
const sab = verifier('apex', 'null');
ESSENTIELLES.push(...garde);
ok(sab === '' && verifier('apex', 'null') !== '', '5. SABOTAGE : sans ESSENTIELLES, /apex vide passerait — c\'est bien cette liste qui tient le contrôle');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
