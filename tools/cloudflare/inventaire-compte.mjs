#!/usr/bin/env node
/* INVENTAIRE COMPLET D'UN COMPTE CLOUDFLARE, EN LECTURE SEULE (Kevin 17.10.2026 : « vérifie que tout ce qui est sur Cloudflare,
   sur mes deux comptes — ce qu'on a effacé et ce qui reste — soit bien sécurisé, confidentiel ; fais le tri »).
 *
 * Usage : CLOUDFLARE_API_TOKEN=… node tools/cloudflare/inventaire-compte.mjs [--compte <id>] [--json audit/prive/cf-<id>.json]
 *   sans --compte : chaque compte que la clé voit.
 * Ce qu'il liste : projets Pages (+ nombre de déploiements, adresse qui répond ou non), Workers (+ adresse workers.dev ouverte ou non,
 * routes), KV, D1, R2, zones et leurs enregistrements DNS, membres du compte, jetons d'API de l'utilisateur (nom, état, date
 * d'expiration — JAMAIS la valeur), et il SIGNALE : site encore public sur pages.dev, workers.dev ouvert, DNS qui pointe vers un
 * service supprimé (*.pages.dev / *.workers.dev absent), jeton sans date d'expiration, membre inconnu.
 * Sécurité : la clé ne vient que de l'environnement, n'est jamais écrite ni affichée ; aucune requête qui modifie (GET seulement). */
const args = process.argv.slice(2);
const val = (n, d = '') => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const T = process.env.CLOUDFLARE_API_TOKEN || '';
const API = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
const SONDER = process.env.CF_SONDER !== '0';
/* --public : pour un journal PUBLIC (robot du dépôt public) — seulement les nombres et les points à traiter, aucune liste détaillée. */
const PUBLIC = args.includes('--public');
if (PUBLIC) { const vrai = console.log; console.log = (...a) => { const t = a.join(' '); if (!/^\s{2}(Pages|Worker|KV|D1|R2|Membres|Zone|\S+ ·)/.test(t) && !/^\s{2}\S.*· (active|expired|disabled) ·/.test(t)) vrai(...a); }; }
if (!T) { console.error('clé absente (CLOUDFLARE_API_TOKEN)'); process.exit(2); }

const get = async (chemin) => {
  try {
    const r = await fetch(`${API}${chemin}`, { headers: { authorization: `Bearer ${T}` } });
    const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
    return { ok: !!j.success, result: j.result, info: j.result_info, err: (j.errors || []).map((e) => e.message).join(' ; ') || (j.success ? '' : `HTTP ${r.status}`) };
  } catch (e) { return { ok: false, result: null, err: String(e.message || e) }; }
};
/* toutes les pages d'une liste (50 par page) */
const tout = async (chemin) => {
  const L = []; let err = '';
  for (let p = 1; p <= 40; p++) {
    const r = await get(`${chemin}${chemin.includes('?') ? '&' : '?'}page=${p}&per_page=50`);
    if (!r.ok) { err = r.err; break; }
    const res = Array.isArray(r.result) ? r.result : [];
    L.push(...res);
    const tot = r.info && (r.info.total_pages || (r.info.total_count ? Math.ceil(r.info.total_count / 50) : 0));
    if (!res.length || res.length < 50 || (tot && p >= tot)) break;
  }
  return { L, err };
};
const repond = async (url) => {
  if (!SONDER) return null;
  try { const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) }); return r.status; } catch { return 0; }
};

const alertes = [];
const alerte = (grav, txt) => alertes.push({ grav, txt });

const v = await get('/user/tokens/verify');
console.log(`clé : ${v.ok ? v.result.status + (v.result.expires_on ? ' · expire ' + v.result.expires_on : ' · sans date d\'expiration') : 'refusée (' + v.err + ')'}`);
let comptes = [];
if (val('--compte')) comptes = [{ id: val('--compte'), name: '(demandé)' }];
else { const c = await tout('/accounts'); comptes = c.L; if (!comptes.length) { console.error('aucun compte visible : ' + c.err); process.exit(1); } }

const rapport = { quand: new Date().toISOString(), comptes: [] };
for (const c of comptes) {
  const id = c.id, court = id.slice(0, 8) + '…';
  const R = { id: court, nom: c.name, pages: [], workers: [], kv: [], d1: [], r2: [], zones: [], membres: [], illisible: [] };
  console.log(`\n══ Compte ${court} (${c.name || '?'}) ══`);

  const pages = await tout(`/accounts/${id}/pages/projects`);
  if (pages.err && !pages.L.length) R.illisible.push('Pages : ' + pages.err);
  for (const p of pages.L) {
    const d = await get(`/accounts/${id}/pages/projects/${p.name}/deployments?per_page=1`);
    const code = await repond(`https://${p.subdomain}/`);
    const e = { nom: p.name, adresse: p.subdomain, domaines: p.domains || [], deploiements: d.info ? d.info.total_count : '?', repond: code };
    R.pages.push(e);
    console.log(`  Pages  ${p.name} · ${p.subdomain} répond ${code} · ${e.deploiements} déploiement(s)${e.domaines.length ? ' · domaines ' + e.domaines.join(', ') : ''}`);
    if (code === 200) alerte('ÉLEVÉ', `${court} Pages « ${p.name} » est PUBLIC sur ${p.subdomain} (vérifier qu'il ne sert aucune app privée)`);
  }

  const sub = await get(`/accounts/${id}/workers/subdomain`);
  const sousDomaine = sub.ok && sub.result ? sub.result.subdomain : '';
  const ws = await tout(`/accounts/${id}/workers/scripts`);
  if (ws.err && !ws.L.length) R.illisible.push('Workers : ' + ws.err);
  for (const w of ws.L) {
    const s = await get(`/accounts/${id}/workers/scripts/${w.id}/subdomain`);
    const ouvert = s.ok && s.result ? !!s.result.enabled : null;
    const code = ouvert && sousDomaine ? await repond(`https://${w.id}.${sousDomaine}.workers.dev/`) : null;
    R.workers.push({ nom: w.id, modifie: (w.modified_on || '').slice(0, 10), workers_dev: ouvert, repond: code });
    console.log(`  Worker ${w.id} · modifié ${(w.modified_on || '').slice(0, 10)} · workers.dev ${ouvert === null ? '?' : ouvert ? 'OUVERT (' + code + ')' : 'fermé'}`);
    if (ouvert) alerte('MOYEN', `${court} worker « ${w.id} » répond aussi sur ${w.id}.${sousDomaine}.workers.dev (adresse hors domaine, contourne les règles du domaine)`);
  }

  const kv = await tout(`/accounts/${id}/storage/kv/namespaces`); R.kv = kv.L.map((n) => n.title);
  const d1 = await tout(`/accounts/${id}/d1/database`); R.d1 = d1.L.map((d) => `${d.name} (${Math.round((d.file_size || 0) / 1024)} Ko)`);
  const r2 = await get(`/accounts/${id}/r2/buckets`); R.r2 = r2.ok ? ((r2.result && r2.result.buckets) || []).map((b) => b.name) : [];
  if (!r2.ok) R.illisible.push('R2 : ' + r2.err);
  console.log(`  KV ${R.kv.length} : ${R.kv.join(', ') || '—'}\n  D1 ${R.d1.length} : ${R.d1.join(', ') || '—'}\n  R2 ${R.r2.length} : ${R.r2.join(', ') || '—'}`);
  for (const b of R.r2) {
    const pub = await get(`/accounts/${id}/r2/buckets/${b}/domains/managed`);
    if (pub.ok && pub.result && pub.result.enabled) alerte('ÉLEVÉ', `${court} R2 « ${b} » a son adresse publique r2.dev ACTIVÉE (${pub.result.domain || ''})`);
  }

  const mb = await tout(`/accounts/${id}/members`);
  R.membres = mb.L.map((m) => ({ email: m.user ? String(m.user.email || '').replace(/^(.).*(@.*)$/, '$1…$2') : '?', statut: m.status, roles: (m.roles || []).map((r) => r.name) }));
  if (R.membres.length) console.log(`  Membres ${R.membres.length} : ${R.membres.map((m) => m.email + ' [' + m.roles.join('/') + ']').join(', ')}`);
  if (R.membres.length > 1) alerte('MOYEN', `${court} a ${R.membres.length} membres : vérifier que chacun est connu de Kevin`);

  const zones = await tout(`/zones?account.id=${id}`);
  for (const z of zones.L) {
    const dns = await tout(`/zones/${z.id}/dns_records`);
    const ssl = await get(`/zones/${z.id}/settings/ssl`);
    const E = { nom: z.name, statut: z.status, ssl: ssl.ok ? ssl.result.value : '?', dns: dns.L.map((r) => `${r.type} ${r.name} → ${r.content}${r.proxied ? ' (proxy)' : ''}`) };
    R.zones.push(E);
    console.log(`  Zone ${z.name} · ${z.status} · SSL ${E.ssl} · ${dns.L.length} enregistrement(s)`);
    for (const r of dns.L) {
      if (/\.pages\.dev$|\.workers\.dev$/.test(r.content || '')) {
        const code = await repond(`https://${r.content}/`);
        if (code === 0 || (code >= 400 && code !== 401 && code !== 403)) alerte('ÉLEVÉ', `${z.name} : ${r.name} pointe vers ${r.content} qui n'existe plus (${code}) → risque de reprise par un inconnu, à supprimer`);
      }
    }
    if (E.ssl === 'off' || E.ssl === 'flexible') alerte('MOYEN', `${z.name} : SSL « ${E.ssl} » (mettre « full (strict) »)`);
  }
  rapport.comptes.push(R);
}

const tk = await tout('/user/tokens');
rapport.jetons = tk.L.map((t) => ({ nom: t.name, statut: t.status, expire: t.expires_on || null, cree: (t.issued_on || '').slice(0, 10), dernier_usage: (t.last_used_on || '').slice(0, 10) }));
if (rapport.jetons.length) {
  console.log(`\n══ Jetons d'API de l'utilisateur (${rapport.jetons.length}) — noms seulement ══`);
  for (const t of rapport.jetons) {
    console.log(`  ${t.nom} · ${t.statut} · expire ${t.expire || 'JAMAIS'} · dernier usage ${t.dernier_usage || '?'}`);
    if (!t.expire && t.statut === 'active') alerte('MOYEN', `jeton « ${t.nom} » actif SANS date d'expiration`);
  }
} else if (tk.err) console.log(`\n(jetons illisibles avec cette clé : ${tk.err})`);

rapport.alertes = alertes;
for (const c of rapport.comptes) console.log(`  résumé ${c.id} : ${c.pages.length} Pages · ${c.workers.length} workers (${c.workers.filter((w) => w.workers_dev).length} ouverts sur workers.dev) · ${c.kv.length} KV · ${c.d1.length} D1 · ${c.r2.length} R2 · ${c.zones.length} zone(s) · ${c.membres.length} membre(s)`);
console.log(`\n══ ${alertes.length} point(s) à traiter ══`);
for (const a of alertes) console.log(`  [${a.grav}] ${a.txt}`);
for (const c of rapport.comptes) if (c.illisible.length) console.log(`  (illisible sur ${c.id} : ${c.illisible.join(' · ')})`);
const sortie = val('--json');
if (sortie) { const fs = await import('node:fs'); fs.writeFileSync(sortie, JSON.stringify(rapport, null, 2)); console.log(`\nrapport : ${sortie}`); }
