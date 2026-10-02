#!/usr/bin/env node
/* KV ACCOUNTS — QUI ÉCRIT ? Inventaire des clés en LECTURE SEULE (2.10.2026, 20h05 : 1 406 écritures dans la journée,
 * plafond gratuit 1 000 atteint pour la 2e fois ; la mesure Analytics (mesure-kv) dit COMBIEN et QUAND, pas QUI).
 *
 * L'API Analytics ne connaît pas les clés. Mais les clés PARLENT : chaque écrivain a son préfixe (`anonv:` visiteur
 * anonyme par app et par heure, `q:` plafonds par appareil, `dep:` dépenses du jour, `gtts:` voix Google, `rlc:` …,
 * `mon:`/`out:`/`mail:` les workers Monaco/Outlook/mail, `acc:`/`cred:` les comptes). On liste les clés (opération
 * « list », pas « write »), on compte par préfixe, et on lit les compteurs `anon:<jour>:<hôte>` : leur somme est
 * EXACTEMENT le nombre d'écritures `anonv:` + `anon:` du jour (2 par visite anonyme comptée).
 *
 * Usage (robot coffre-kv-inventaire.yml) : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NS. Ne modifie RIEN.
 * Tests : tests/verify-kv-inventaire.mjs (grouper / bilan sont pures). */

/** Préfixe = premier segment avant « : » ; `anon:<jour>` garde le jour (pour distinguer aujourd'hui d'hier). */
export function prefixe(nom) {
  const s = String(nom || '');
  const i = s.indexOf(':');
  if (i < 0) return s || '(vide)';
  const p = s.slice(0, i);
  if (p === 'anon') { const m = /^anon:(\d{4}-\d{2}-\d{2}):/.exec(s); return m ? 'anon:' + m[1] : 'anon'; }
  return p;
}

/** Pure : noms de clés → { total, parPrefixe: [[prefixe, nombre] trié desc] }. */
export function grouper(noms) {
  const c = new Map();
  for (const n of noms || []) { const p = prefixe(n); c.set(p, (c.get(p) || 0) + 1); }
  return { total: (noms || []).length, parPrefixe: [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
}

/** Pure : bilan lisible.  anonValeurs = { 'anon:<jour>:<hôte>': nombre } ; ecrituresMesurees = chiffre Analytics (facultatif). */
export function bilan(noms, anonValeurs, jour, ecrituresMesurees) {
  const g = grouper(noms);
  const lignes = [`Clés dans l'espace KV ACCOUNTS : ${g.total}`];
  for (const [p, n] of g.parPrefixe.slice(0, 20)) lignes.push(`  ${p.padEnd(18)} ${String(n).padStart(6)} clé(s)`);
  const duJour = Object.entries(anonValeurs || {}).filter(([k]) => k.startsWith('anon:' + jour + ':'))
    .map(([k, v]) => [k.slice(('anon:' + jour + ':').length), parseInt(v, 10) || 0]).sort((a, b) => b[1] - a[1]);
  const visites = duJour.reduce((s, [, v]) => s + v, 0);
  const anonv = (noms || []).filter((n) => n.startsWith('anonv:')).length;
  lignes.push(`Visites anonymes comptées le ${jour} : ${visites} (= ~${visites * 2} écritures : 1 « anonv » + 1 « anon » par visite) · « anonv » encore vivantes (2 h) : ${anonv}`);
  for (const [h, v] of duJour.slice(0, 12)) lignes.push(`  ${h.padEnd(28)} ${String(v).padStart(5)} visite(s)`);
  const q = (noms || []).filter((n) => n.startsWith('q:')).length, dep = (noms || []).filter((n) => n.startsWith('dep:' + jour)).length;
  lignes.push(`Plafonds par appareil « q: » vivants (1 h) : ${q} · compteurs de dépense du jour « dep: » : ${dep}`);
  if (ecrituresMesurees > 0) {
    const part = Math.round((visites * 2) / ecrituresMesurees * 100);
    lignes.push(`Écritures mesurées (Analytics) : ${ecrituresMesurees} → les visites anonymes en expliquent ~${part} % ; le reste = plafonds q:, voix gtts:, comptes, workers mon:/out:/mail:`);
  }
  return { ...g, visites, anonv, duJour, lignes };
}

async function cf(path, token) {
  return fetch('https://api.cloudflare.com/client/v4' + path, { headers: { authorization: 'Bearer ' + token } });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { CLOUDFLARE_API_TOKEN: T, CLOUDFLARE_ACCOUNT_ID: A, NS, ECRITURES } = process.env;
  if (!T || !A || !NS) { console.log('::error title=KV inventaire::jeton, compte ou espace KV manquant'); process.exit(1); }
  const base = `/accounts/${A}/storage/kv/namespaces/${NS}`;
  const noms = [];
  let curseur = '';
  for (let i = 0; i < 60; i++) {
    const r = await cf(`${base}/keys?limit=1000${curseur ? '&cursor=' + encodeURIComponent(curseur) : ''}`, T);
    const j = await r.json();
    if (!j.success) { console.log('::error title=KV inventaire::liste des clés refusée ' + JSON.stringify(j.errors).slice(0, 200)); process.exit(1); }
    for (const k of j.result) noms.push(k.name);
    curseur = j.result_info && j.result_info.cursor;
    if (!curseur) break;
  }
  const jour = new Date().toISOString().slice(0, 10);
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const aLire = noms.filter((n) => n.startsWith('anon:' + jour + ':') || n.startsWith('anon:' + hier + ':')).slice(0, 120);
  const anonValeurs = {};
  for (let i = 0; i < aLire.length; i += 8) {
    await Promise.all(aLire.slice(i, i + 8).map(async (k) => {
      const r = await cf(`${base}/values/${encodeURIComponent(k)}`, T);
      anonValeurs[k] = r.ok ? await r.text() : '0';
    }));
  }
  const b = bilan(noms, anonValeurs, jour, parseInt(ECRITURES, 10) || 0);
  const bHier = bilan(noms, anonValeurs, hier, 0);
  const lignes = b.lignes.concat([`Hier (${hier}) : ${bHier.visites} visites anonymes comptées (~${bHier.visites * 2} écritures)`]);
  console.log(lignes.join('\n'));
  /* Annotations : le seul canal lisible depuis une session. Hôtes = noms d'apps, pas de données personnelles. */
  for (let i = 0, n = 1; i < lignes.length; i += 14, n++) {
    console.log(`::notice title=KV qui écrit ${n}::` + lignes.slice(i, i + 14).join('%0A').replace(/%(?!0A)/g, '%25'));
  }
}
