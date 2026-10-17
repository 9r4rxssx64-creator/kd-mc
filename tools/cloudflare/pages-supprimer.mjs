#!/usr/bin/env node
/* SUPPRIMER UN VIEUX PROJET PAGES QUI FUIT, MÊME AVEC « TOO MANY DEPLOYMENTS » (17.10.2026).
 *
 * Kevin a essayé au doigt : Cloudflare refuse (« Your project has too many deployments to be deleted »). Ce script fait ce que
 * le tableau de bord ne sait pas faire : il efface les déploiements par paquets (force=true), puis le projet, puis prouve que
 * l'adresse ne répond plus. Même logique que le robot public `pages-nettoyage.yml`, mais exécutable depuis une session quand la
 * clé du robot ne voit pas le bon compte (mesuré le 17.10 : la clé du dépôt public voit 425377ca…, les fuites sont sur ffaca6f3…).
 *
 * Usage : CLOUDFLARE_API_TOKEN=… node tools/cloudflare/pages-supprimer.mjs --compte <id> --projet <nom> [--confirmer=oui]
 * Sans --confirmer=oui : essai à blanc (liste les projets du compte, compte les déploiements du projet, ne supprime rien).
 * Liste blanche : seuls kdmc0, kdmc-javis, kdmc-site peuvent être supprimés (jamais un projet vivant par erreur).
 * La clé ne vient QUE de l'environnement ; elle n'est jamais écrite ni affichée. */
const args = process.argv.slice(2);
const val = (n, d = '') => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const compte = val('--compte'), projet = val('--projet');
const confirmer = /^--confirmer=(oui|1|true)$/i.test(args.find((a) => a.startsWith('--confirmer=')) || '');
const T = process.env.CLOUDFLARE_API_TOKEN || '';
const LISTE_BLANCHE = new Set(['kdmc0', 'kdmc-javis', 'kdmc-site']);
const API = 'https://api.cloudflare.com/client/v4';
const H = { authorization: `Bearer ${T}` };
const cf = async (chemin, init = {}) => {
  const r = await fetch(`${API}${chemin}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status} illisible` }] }));
  return { status: r.status, ...j };
};
const code = async (url) => { try { const r = await fetch(url, { redirect: 'manual' }); return r.status; } catch { return 0; } };

if (!T) { console.error('clé absente (CLOUDFLARE_API_TOKEN)'); process.exit(2); }
if (!/^[0-9a-f]{32}$/.test(compte) || !projet) { console.error('usage : --compte <id 32 hex> --projet <nom> [--confirmer=oui]'); process.exit(2); }

const v = await cf('/user/tokens/verify');
console.log(`clé : ${v.success ? v.result.status : JSON.stringify(v.errors)}`);
const liste = await cf(`/accounts/${compte}/pages/projects?page=1`);
if (!liste.success) { console.error(`projets Pages illisibles sur ${compte.slice(0, 8)}… : ${JSON.stringify(liste.errors)}`); process.exit(1); }
console.log(`${liste.result.length} projet(s) Pages sur ${compte.slice(0, 8)}… : ${liste.result.map((p) => `${p.name} (${p.subdomain})`).join(', ') || '(aucun)'}`);
const cible = liste.result.find((p) => p.name === projet);
if (!cible) { console.error(`« ${projet} » n'est pas sur ce compte`); process.exit(1); }
const d0 = await cf(`/accounts/${compte}/pages/projects/${projet}/deployments?per_page=25&page=1`);
console.log(`${projet} : ${d0.success ? (d0.result_info?.total_count ?? d0.result.length) : '?'} déploiement(s) · ${cible.subdomain} répond ${await code(`https://${cible.subdomain}/`)}`);
if (!LISTE_BLANCHE.has(projet)) { console.error(`refus : « ${projet} » n'est pas dans la liste blanche (${[...LISTE_BLANCHE].join(', ')})`); process.exit(2); }
if (!confirmer) { console.log('essai à blanc : rien n\'est supprimé (relancer avec --confirmer=oui)'); process.exit(0); }

let total = 0;
for (let tour = 0; tour < 400; tour++) {
  const d = await cf(`/accounts/${compte}/pages/projects/${projet}/deployments?per_page=25&page=1`);
  const ids = d.success ? d.result.map((x) => x.id) : [];
  if (!ids.length) break;
  const codes = await Promise.all(ids.map((id) => cf(`/accounts/${compte}/pages/projects/${projet}/deployments/${id}?force=true`, { method: 'DELETE' }).then((r) => r.success)));
  const ok = codes.filter(Boolean).length; total += ok;
  process.stdout.write(`\r${total} déploiement(s) effacé(s)…`);
  if (!ok) break; /* la production active part avec le projet (constaté le 16.10) */
}
console.log('');
const del = await cf(`/accounts/${compte}/pages/projects/${projet}`, { method: 'DELETE' });
if (!del.success) { console.error(`suppression du projet refusée : ${JSON.stringify(del.errors)}`); process.exit(1); }
await new Promise((r) => setTimeout(r, 20000));
const c = await code(`https://${cible.subdomain}/`);
console.log(`✅ ${projet} supprimé (${total} déploiements effacés avant) · https://${cible.subdomain}/ répond maintenant ${c}`);
process.exit(c === 200 ? 1 : 0);
