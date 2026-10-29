#!/usr/bin/env node
/* MES APPAREILS : sont-ils bien à Kevin ? — lecture seule (Kevin 29.10.2026 : « Vérifie si c'est connecté d'une tablette Lenovo, si ça vient de
 * mon matériel… il faut que mes appareils soient reconnus et qu'on sache quand c'est moi ou quand c'est pas moi »).
 *
 * Lit la fiche admin (KV ACCOUNTS `acc:kdmc_admin`, + les fiches fondues dans elle) et les clés Face ID (`pk:kdmc_admin`, étiquette + dates seulement,
 * jamais l'identifiant ni la clé publique), range les sessions de l'historique par APPAREIL (modèle + système, sans les versions) et dit pour chacun :
 *   combien de sessions, quand, d'où (lieux, opérateur, VPN), quelles apps, et s'il est RECONNU (une clé Face ID de ce type d'appareil existe) ou SANS PREUVE.
 * Limite connue : Chrome Android masque le modèle (« K ») — on ne sait pas dire « Lenovo » sans l'indice client `Sec-CH-UA-Model` (voir worker.js).
 * Usage (robot coffre-appareils-admin.yml, dépôt PRIVÉ : le journal contient les lieux de Kevin) : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NS.
 * Test : tests/verify-appareils-kevin.mjs (la fonction `analyserAppareils` est pure).
 */
export const CANON_UID = 'kdmc_admin';

/** « K · Android 10 · Chrome 154 » → { famille: 'K · Android', modele: 'K', os: 'Android' } (sans versions : une mise à jour ne change pas l'appareil). */
export function famille(label) {
  const [modele = '', os = ''] = String(label || '').split(' · ').map((x) => x.trim());
  const osNom = os.replace(/\s+[\d._/-]+.*$/, '');
  const m = modele || 'Inconnu';
  return { famille: osNom ? m + ' · ' + osNom : m, modele: m, os: osNom };
}
/** Le type de matériel déduit du libellé : le modèle précis n'est connu que s'il n'est pas masqué par Chrome. */
export function genre(modele, os) {
  const m = String(modele || '');
  if (/iphone/i.test(m)) return 'iphone';
  if (/ipad/i.test(m)) return 'ipad';
  if (/lenovo|tb-|tab\b|yoga tab|m10|p11/i.test(m)) return 'tablette-lenovo';
  if (/^k$/i.test(m) && /android/i.test(os)) return 'android-modele-masque';
  if (/android/i.test(os) || /^(sm-|pixel|moto|redmi|xiaomi)/i.test(m)) return 'android';
  if (/windows/i.test(os) || /pc windows/i.test(m)) return 'pc-windows';
  if (/mac/i.test(m + os)) return 'mac';
  if (/linux/i.test(m + os)) return 'linux';
  return 'autre';
}
/** Un opérateur d'hébergement / de nuage (Microsoft = les robots GitHub, serveurs « hosted », VPN) : ce n'est pas la ligne d'un domicile ni d'un téléphone. */
export const HEBERGEUR = /microsoft|amazon|aws|google (cloud|llc)|digitalocean|hetzner|ovh|linode|vultr|oracle|hosted|datacenter|data center|server|vps|m247|choopa|leaseweb|cloudflare|akamai|zscaler|tor\b/i;
const jour = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '?');
const top = (m, n = 3) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ' ×' + v).join(', ');

/** Pure : fiche(s) de Kevin + clés Face ID → un bilan par appareil. */
export function analyserAppareils(fiches, cles = []) {
  const groupes = new Map();
  for (const f of fiches) {
    for (const s of (f && f.history) || []) {
      const lab = s.dev || s.device || f.last_device || '';
      const base = famille(lab);
      const heb = !!(s.vpn || HEBERGEUR.test(String(s.isp || '')));
      const fam = { ...base, famille: base.famille + (heb ? ' [via hébergeur/VPN]' : ''), heb };
      if (!groupes.has(fam.famille)) groupes.set(fam.famille, { ...fam, genre: genre(fam.modele, fam.os), sessions: 0, premiere: Infinity, derniere: 0, jours: new Set(), lieux: new Map(), isp: new Map(), vpn: 0, apps: new Map(), navigateurs: new Set() });
      const g = groupes.get(fam.famille);
      g.sessions++;
      const t0 = s.ts || 0, t1 = s.end || s.ts || 0;
      if (t0 && t0 < g.premiere) g.premiere = t0;
      if (t1 > g.derniere) g.derniere = t1;
      if (t0) g.jours.add(jour(t0));
      if (s.place) g.lieux.set(s.place, (g.lieux.get(s.place) || 0) + 1);
      if (s.isp) g.isp.set(s.isp, (g.isp.get(s.isp) || 0) + 1);
      if (s.vpn) g.vpn++;
      if (s.app) g.apps.set(s.app, (g.apps.get(s.app) || 0) + 1);
      const nav = String(lab).split(' · ')[2]; if (nav) g.navigateurs.add(nav);
    }
  }
  /* Clés Face ID : l'étiquette (« iPhone · Safari »…) donne le genre d'appareil prouvé par un Face ID / une clé d'accès. */
  const prouves = cles.map((k) => { const f = famille(k.label || ''); return { label: k.label || '(sans nom)', genre: genre(f.modele, f.os), created: k.created || 0, last: k.last || 0 }; });
  const genresProuves = new Set(prouves.map((k) => k.genre));
  const appareils = [...groupes.values()].map((g) => {
    /* « Reconnu » = une clé Face ID de CE genre existe. Un modèle masqué (« K ») n'est jamais reconnu seul : il ressemble à toute tablette Android. */
    const reconnu = !g.heb && g.genre !== 'android-modele-masque' && g.genre !== 'autre' && genresProuves.has(g.genre);
    return {
      famille: g.famille, genre: g.genre, sessions: g.sessions, jours: g.jours.size,
      premiere: g.premiere === Infinity ? 0 : g.premiere, derniere: g.derniere,
      lieux: top(g.lieux), isp: top(g.isp, 2), vpn: g.vpn, apps: top(g.apps, 4), navigateurs: [...g.navigateurs].join(', '),
      verdict: g.heb ? 'hebergeur' : reconnu ? 'reconnu' : g.genre === 'android-modele-masque' ? 'modele-masque' : 'sans-preuve',
    };
  }).sort((a, b) => b.derniere - a.derniere);
  return { appareils, prouves, total: appareils.reduce((n, a) => n + a.sessions, 0) };
}
export function texte(b) {
  const L = [];
  L.push(`Clés Face ID de Kevin (${b.prouves.length}) : ` + (b.prouves.map((k) => `${k.label} [ajouté ${jour(k.created)}, utilisé ${jour(k.last)}]`).join(' · ') || 'aucune'));
  L.push(`Sessions lues : ${b.total} sur ${b.appareils.length} appareil(s) distinct(s)`);
  for (const a of b.appareils) {
    const v = a.verdict === 'hebergeur' ? '🤖 vient d\'un hébergeur / VPN (robot de test ou VPN) — pas ton appareil en direct' : a.verdict === 'reconnu' ? '✅ reconnu (clé Face ID de ce type)' : a.verdict === 'modele-masque' ? '❓ modèle masqué par Chrome (pas de preuve)' : '⚠️ sans preuve';
    L.push(`· ${a.famille} — ${v}`);
    L.push(`    ${a.sessions} session(s) sur ${a.jours} jour(s), du ${jour(a.premiere)} au ${jour(a.derniere)} · navigateurs : ${a.navigateurs || '?'}`);
    L.push(`    lieux : ${a.lieux || '?'} · opérateur : ${a.isp || '?'} · VPN : ${a.vpn} · apps : ${a.apps || '?'}`);
  }
  return L.join('\n');
}

if (process.argv[1] && /(^|[\\/])appareils-kevin\.mjs$/.test(process.argv[1])) {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS } = process.env;
  if (!T || !A || !NS) { console.log('::error title=Appareils::jeton, compte ou espace KV manquant'); process.exit(1); }
  const base = `/accounts/${A}/storage/kv/namespaces/${NS}`;
  const lire = async (cle) => {
    const r = await fetch('https://api.cloudflare.com/client/v4' + base + '/values/' + encodeURIComponent(cle), { headers: { authorization: 'Bearer ' + T } });
    if (!r.ok) return null;
    try { return JSON.parse(await r.text()); } catch { return null; }
  };
  const fiche = await lire('acc:' + CANON_UID);
  const pk = await lire('pk:' + CANON_UID);
  if (!fiche) { console.log('::error title=Appareils::fiche admin introuvable'); process.exit(1); }
  const cles = (Array.isArray(pk) ? pk : (pk && pk.keys) || []).map((k) => ({ label: k.label, created: k.created, last: k.last }));
  const b = analyserAppareils([fiche], cles);
  const t = texte(b);
  console.log(t);
  console.log(`::notice title=Appareils de Kevin::${t.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500)}`);
  if (process.env.GITHUB_STEP_SUMMARY) { const fs = await import('node:fs'); fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + t + '\n```\n'); }
}
