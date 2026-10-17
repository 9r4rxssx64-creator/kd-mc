#!/usr/bin/env node
/* RAPATRIER SUR LE BON COMPTE = ÉTEINDRE LES COPIES ORPHELINES DE L'ANCIEN COMPTE (Kevin 17.10.2026 : « rapatrie tout sur la même
   adresse, celle que tu connais ; revérifie tout ; mets tout en place correctement ; économise les quotas »).
 *
 * Mesuré le 17.10 (sondes HTTP gratuites, sans clé) : 12 workers vivent ENCORE sur l'ancien compte ffaca6f3… (adresse
 * *.desarzens-kevin.workers.dev) alors que tout le domaine tourne sur le compte principal 425377ca… (*.9r4rxssx64.workers.dev).
 * Aucun code ne les appelle plus (Apex corrige même seul une vieille adresse desarzens-kevin → 9r4rxssx64, worker-url-heal.ts) ;
 * l'app coffre-fort n'a jamais pointé vers l'ancien coffre-r2 (historique de coffre-fort/config.json). Ce sont des copies
 * périmées : l'ancien coffre-r2 est OUVERT (lire / déposer / effacer sans rien), l'ancien apex-secrets-proxy garde une copie des
 * clés (Anthropic, Groq, Gemini, Telegram, Vonage…). Rien à déplacer : il faut les éteindre.
 *
 * Usage : CLOUDFLARE_API_TOKEN=<clé de l'ANCIEN compte> node tools/cloudflare/orphelins-supprimer.mjs [--confirmer=oui]
 *   Sans --confirmer=oui : essai à blanc (liste ce qui serait supprimé, vérifie chaque garde, ne touche à rien).
 * Gardes, pour CHAQUE worker, avant suppression :
 *   1. il est dans la liste fermée ci-dessous (jamais un autre) ;
 *   2. le compte visé est bien l'ANCIEN (ffaca6f3…) — jamais le compte principal ;
 *   3. sa copie sur le compte principal répond (le service ne disparaît pas) — sauf kdmc-proxy (démo « Hello World », sans copie).
 * Il liste aussi les KV / D1 / R2 de l'ancien compte (à exporter avant tout effacement : non supprimés par ce script).
 * La clé ne vient que de l'environnement ; elle n'est jamais écrite ni affichée. */
const ANCIEN = 'ffaca6f306a953f82834db0970f300f0';
const PRINCIPAL_SOUS_DOMAINE = '9r4rxssx64';
export const LISTE_FERMEE = ['apex-push-worker', 'apex-secrets-proxy', 'coffre-r2', 'kdmc-apis', 'kdmc-balances', 'kdmc-crea-ai',
  'kdmc-crea-famille', 'kdmc-live', 'kdmc-mail', 'kdmc-monaco', 'kdmc-outlook', 'kdmc-proxy'];
const SANS_COPIE = new Set(['kdmc-proxy']);

const confirmer = process.argv.some((a) => /^--confirmer=(oui|1|true)$/i.test(a));
const T = process.env.CLOUDFLARE_API_TOKEN || '';
const API = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
const sonde = process.env.CF_SONDE_BASE || '';   /* tests : remplace https://<nom>.9r4rxssx64.workers.dev */
if (!T) { console.error('clé absente (CLOUDFLARE_API_TOKEN de l\'ANCIEN compte)'); process.exit(2); }

const cf = async (chemin, init = {}) => {
  const r = await fetch(`${API}${chemin}`, { ...init, headers: { authorization: `Bearer ${T}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
  return { ok: !!j.success, result: j.result, err: (j.errors || []).map((e) => e.message).join(' ; ') };
};
const repond = async (nom) => {
  const url = sonde ? `${sonde}/${nom}/health` : `https://${nom}.${PRINCIPAL_SOUS_DOMAINE}.workers.dev/health`;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.status; } catch { return 0; }
};

const comptes = await cf('/accounts');
const ids = (comptes.result || []).map((c) => c.id);
if (!ids.includes(ANCIEN)) { console.error(`cette clé ne voit pas l'ancien compte ${ANCIEN.slice(0, 8)}… (elle voit : ${ids.map((i) => i.slice(0, 8) + '…').join(', ') || 'rien'})`); process.exit(1); }
const ws = await cf(`/accounts/${ANCIEN}/workers/scripts`);
if (!ws.ok) { console.error('workers illisibles : ' + ws.err); process.exit(1); }
const presents = (ws.result || []).map((w) => w.id);
console.log(`Ancien compte ${ANCIEN.slice(0, 8)}… : ${presents.length} worker(s) — ${presents.join(', ') || '(aucun)'}`);
const hors = presents.filter((n) => !LISTE_FERMEE.includes(n));
if (hors.length) console.log(`⚠️ hors liste (NON touchés, à regarder) : ${hors.join(', ')}`);

let supprimes = 0, gardes = 0;
for (const nom of LISTE_FERMEE.filter((n) => presents.includes(n))) {
  const copie = SANS_COPIE.has(nom) ? 'sans copie (démo)' : await repond(nom);
  const okCopie = SANS_COPIE.has(nom) || (copie >= 200 && copie < 500 && copie !== 404);
  if (!okCopie) { gardes++; console.log(`  ⛔ ${nom} : copie du compte principal ne répond pas (${copie}) → GARDÉ`); continue; }
  if (!confirmer) { console.log(`  · ${nom} : serait supprimé (copie principale : ${copie})`); continue; }
  const d = await cf(`/accounts/${ANCIEN}/workers/scripts/${nom}?force=true`, { method: 'DELETE' });
  if (d.ok) { supprimes++; console.log(`  ✅ ${nom} supprimé`); } else { gardes++; console.log(`  ❌ ${nom} : ${d.err}`); }
}

const kv = await cf(`/accounts/${ANCIEN}/storage/kv/namespaces?per_page=100`);
const d1 = await cf(`/accounts/${ANCIEN}/d1/database?per_page=100`);
const r2 = await cf(`/accounts/${ANCIEN}/r2/buckets`);
console.log(`\nDonnées restantes sur l'ancien compte (NON supprimées — exporter avant) : KV ${(kv.result || []).map((n) => n.title).join(', ') || '—'} · D1 ${(d1.result || []).map((d) => d.name).join(', ') || '—'} · R2 ${((r2.result && r2.result.buckets) || []).map((b) => b.name).join(', ') || '—'}`);
console.log(confirmer ? `\n${supprimes} supprimé(s), ${gardes} gardé(s).` : `\nEssai à blanc : rien n'a été touché. Relancer avec --confirmer=oui pour supprimer.`);
