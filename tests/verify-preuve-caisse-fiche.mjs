/* GARDE — la preuve live de la caisse envoie des commandes que la caisse ACCEPTE de lire (10.10.2026).
 * Vécu : depuis le 27.09 (« fiche acheteur obligatoire à la commande »), /caisse/commande et /caisse/intention refusent
 * d'abord une commande sans prénom + nom + CGV. Le robot deploy-kdmc-vente envoyait encore e-mail + consentement seuls :
 * la caisse répondait « prenom » au lieu de « caisse_absente » / « moyen_inconnu »… et chaque déploiement de la caisse
 * finissait ROUGE, alors que le worker était bien en ligne (leçon #489).
 * Règle : toute commande du robot qui passe l'e-mail et le consentement porte aussi la fiche (ordre des contrôles du worker).
 * node tests/verify-preuve-caisse-fiche.mjs */
import { readFileSync } from 'node:fs';
const wf = readFileSync(new URL('../.github/workflows/deploy-kdmc-vente.yml', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../services/kdmc-vente/worker.js', import.meta.url), 'utf8');
let ko = 0; const ok = (c, m, d) => { console.log((c ? '  ✅ ' : '  ❌ ') + m + (!c && d ? ' — ' + d : '')); if (!c) ko++; };
const corps = wf.match(/\{"produit":"[^']*?\}/g) || [];
const complets = corps.filter((c) => /"email":"[^"]+"/.test(c) && /"consentement":true/.test(c));
const sansFiche = complets.filter((c) => !(/"prenom":"\p{L}{2,}/u.test(c) && /"nom":"\p{L}{2,}/u.test(c) && /"cgv":true/.test(c)));
ok(complets.length >= 6, `le robot envoie ${complets.length} commande(s) avec e-mail + consentement (≥ 6 attendues)`);
ok(sansFiche.length === 0, 'chacune porte la fiche obligatoire (prénom, nom, CGV)', sansFiche.join(' | '));
ok(/function ficheAcheteur/.test(worker) && /ficheAcheteur\(b, 'cmd'\)/.test(worker) && /ficheAcheteur\(b, 'int'\)/.test(worker),
  'la caisse exige toujours la fiche à la commande et au panier (sinon cette garde n\'a plus d\'objet)');
console.log(ko ? `❌ preuve-caisse-fiche : ${ko} échec(s)` : '✅ preuve-caisse-fiche : les commandes du robot passent la fiche de la caisse');
process.exit(ko ? 1 : 0);
