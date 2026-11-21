/* « Apex AI propose une action comme Bee » (parité, javis-bee 3016 / 3031) — la porte POST /__admin/proposer.
   Fermée sans session admin ; liste blanche de 5 actions ; ne fait QUE proposer (aucune écriture) ; la fiche de l'arbre est trouvée par le domaine.
   node services/kdmc-router/proposer-admin.test.mjs */
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { ACTIONS, CATALOGUE } from './bee-agir.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/proposer', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ action: 'arbre_commentaire', personne: 'X Y', texte: 'a' }) }), env, { waitUntil() {} });
const txt = await rep.text();
ok(rep.status === 401 || rep.status === 403, '1. fermée sans session admin', rep.status);
ok(!/jeton|v1\./.test(txt), '2. aucune proposition ni signature dans le refus');
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const m = /const ACTIONS_APEX_AI = \[([^\]]*)\]/.exec(src);
const liste = m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) : [];
ok(liste.join() === 'arbre_info,arbre_champ,arbre_commentaire,arbre_lien,message_direct', '3. liste blanche = les 5 actions du garde de parité, rien d\'autre', liste);
ok(liste.every((a) => ACTIONS.includes(a) && CATALOGUE[a]), '4. chacune existe dans le catalogue de Bee (même définition, mêmes champs, même résumé fabriqué par le domaine)');
ok(!liste.some((a) => /bot_|compte_|code|bannir|supprimer|mail/.test(a)), '5. aucune action à risque (robot, comptes, code, bannissement, mail) n\'est ouverte par cette porte');
const bloc = src.slice(src.indexOf("path === '/__admin/proposer'"), src.indexOf("path === '/__admin/ecrire-apex-chat'"));
ok(/proposerBee\(env, action, champs, ob\.now\(\)/.test(bloc) && /ACTIONS_APEX_AI\.indexOf\(action\) < 0/.test(bloc), '6. la porte appelle `proposer` de Bee et refuse toute action hors liste');
ok(!/\.executer\(|__javis\/agir|premiereFois/.test(bloc), '7. cette porte ne fait QUE proposer : elle n\'exécute rien (seul /__javis/agir exécute, après ✅)');
ok(/ob\.qui\(request\)/.test(bloc) && /ob\.limite\('bee-agir'\)/.test(bloc), '8. session admin prouvée + même plafond de débit que Bee');
ok(/r\.n > 1[\s\S]{0,200}plusieurs/.test(bloc) && /r\.n === 0[\s\S]{0,200}introuvable/.test(bloc), '9. la fiche est trouvée par le domaine : aucune → refus, plusieurs → refus (jamais de devinette)');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
