/* DIAGNOSTIC LECTURE SEULE — la réception des factures (factures@kd-mc.com → worker kdmc-mail) fonctionne-t-elle ? (12.10.2026)
   node tools/audit/diag-mail.mjs [jours]      — exige CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID

   Kevin : « Tjs 0 récup ». Avant de corriger, on MESURE : (1) Email Routing est-il actif sur kd-mc.com, et la règle factures@ pointe-t-elle
   sur le worker kdmc-mail ? (2) combien d'appels le worker a-t-il reçus par jour, avec quelle issue (succès / exception) ?
   (3) le worker répond-il à /health ? Aucune écriture, aucun contenu de mail lu : seulement des compteurs et la configuration. */
const T = process.env.CLOUDFLARE_API_TOKEN;
const A = process.env.CLOUDFLARE_ACCOUNT_ID;
const ID_CF = /^[0-9a-f]{32}$/;   /* un identifiant Cloudflare a toujours cette forme : rien d'autre n'entre dans une adresse d'API */
if (!T || !A || !ID_CF.test(A)) { console.error('jeton absent, ou identifiant de compte Cloudflare invalide'); process.exit(1); }
const JOURS = Math.max(1, Math.min(14, Number.parseInt(process.argv[2] || '7', 10) || 7));
const H = { authorization: 'Bearer ' + T, 'content-type': 'application/json' };
/* tout ce qui vient du réseau est nettoyé avant d'être affiché (pas de saut de ligne, pas de caractère de contrôle) */
const propre = (v, n = 160) => String(v ?? '').replaceAll(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const dit = (m) => console.log(propre(m, 600));
/* l'adresse est bâtie segment par segment, chacun encodé : une valeur venue de l'environnement ou du réseau ne peut pas changer de chemin */
const api = async (segments, requete = '') => {
  const chemin = segments.map((s) => encodeURIComponent(s)).join('/');
  const r = await fetch('https://api.cloudflare.com/client/v4/' + chemin + requete, { headers: H });
  let j = null; try { j = await r.json(); } catch { /* corps absent */ }
  return { st: r.status, j };
};
const erreurs = (j) => propre(JSON.stringify(j?.errors ?? ''), 200);
const actions = (liste) => (liste ?? []).map((a) => a.type + ':' + (a.value ?? []).join('|')).join(' ; ');

dit('== 1. Email Routing sur kd-mc.com ==');
const z = await api(['zones'], '?name=kd-mc.com');
const zone = z.j?.result?.[0];
const zid = String(zone?.id ?? '').match(ID_CF)?.[0];   /* seule la forme exacte d'un identifiant (32 caractères hexadécimaux) entre dans une adresse */
if (zone && zid) {
  dit(`zone kd-mc.com : ${zid.slice(0, 6)}… (${propre(zone.status, 20)})`);
  const s = await api(['zones', zid, 'email', 'routing']);
  if (s.j?.success) dit(`Email Routing : ${s.j.result.enabled ? '✅ ACTIF' : '❌ DÉSACTIVÉ'} · statut « ${propre(s.j.result.status ?? '?', 30)} »`);
  else dit(`⚠️ état d'Email Routing illisible (HTTP ${s.st}) : ${erreurs(s.j)}`);
  const r = await api(['zones', zid, 'email', 'routing', 'rules']);
  if (r.j?.success) {
    const regles = r.j.result ?? [];
    dit(`${regles.length} règle(s) :`);
    for (const x of regles) {
      const adr = (x.matchers ?? []).map((m) => (m.field ?? '') + '=' + (m.value ?? m.type ?? '')).join(',');
      dit(`  ${x.enabled ? '✅' : '❌ (désactivée)'} ${propre(x.name ?? '', 60)} · ${propre(adr, 100)} → ${propre(actions(x.actions), 100)}`);
    }
    const f = regles.find((x) => JSON.stringify(x.matchers ?? []).toLowerCase().includes('factures@'));
    if (!f) dit('❌ AUCUNE règle pour factures@');
    else dit(f.enabled ? '✅ la règle factures@ existe et est active' : '❌ la règle factures@ existe mais est DÉSACTIVÉE');
    const ca = await api(['zones', zid, 'email', 'routing', 'rules', 'catch_all']);
    if (ca.j?.success) dit(`catch-all : ${ca.j.result.enabled ? 'actif' : 'inactif'} → ${propre(actions(ca.j.result.actions), 100)}`);
  } else dit(`⚠️ règles illisibles (HTTP ${r.st}) : ${erreurs(r.j)}`);
} else dit(`⚠️ zone introuvable (HTTP ${z.st}) : ${erreurs(z.j)}`);

dit(`\n== 2. Appels reçus par le worker kdmc-mail, ${JOURS} derniers jours (issue) ==`);
const fin = new Date();
const debut = new Date(Date.now() - JOURS * 86400000);
const q = `query{viewer{accounts(filter:{accountTag:"${A}"}){workersInvocationsAdaptive(limit:500,filter:{scriptName:"kdmc-mail",datetime_geq:"${debut.toISOString()}",datetime_leq:"${fin.toISOString()}"},orderBy:[datetimeHour_ASC]){sum{requests errors subrequests}dimensions{datetimeHour status}}}}}`;
const g = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query: q }) })
  .then((x) => x.json()).catch((e) => ({ errors: [{ message: String(e) }] }));
const lignes = g.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
if (lignes) {
  const parJour = {};
  for (const l of lignes) {
    const jour = l.dimensions.datetimeHour.slice(0, 10);
    const k = (parJour[jour] ??= { issues: {}, erreurs: 0 });
    k.issues[l.dimensions.status] = (k.issues[l.dimensions.status] ?? 0) + l.sum.requests;
    k.erreurs += l.sum.errors;
  }
  const jours = Object.keys(parJour).sort((a, b) => a.localeCompare(b));
  if (jours.length === 0) dit('aucun appel du tout sur la période');
  for (const jour of jours) {
    const issues = Object.entries(parJour[jour].issues).map(([a, b]) => a + '=' + b).join(' ');
    dit(`  ${jour} : ${issues} · erreurs ${parJour[jour].erreurs}`);
  }
} else dit(`⚠️ lecture impossible : ${propre(JSON.stringify(g.errors ?? g), 300)}`);

dit('\n== 3. /health du worker ==');
const h = await fetch('https://kdmc-mail.9r4rxssx64.workers.dev/health')
  .then(async (x) => x.status + ' ' + (await x.text()).slice(0, 80))
  .catch((e) => 'injoignable ' + e.message);
dit(h);
