/* ALERTE « NOUVELLE CONNEXION » POUR KEVIN.   node alerte-nouveau.test.mjs
   Kevin 27.09 : « Pas besoin que je valide si tous les champs des renseignements sont fournis,
   juste une alerte pour moi d'une nouvelle connexion ». Ce test verrouille le relais du domaine :
     · un nouvel inscrit / une première connexion → UNE notification « 🆕 Nouvelle connexion » ;
     · la même personne sur la même app dans les 12 h → pas de doublon ;
     · une autre personne → sa propre alerte, même juste après (pas avalée par le frein des messages) ;
     · les messages ordinaires gardent leur comportement (titre 💬, frein de 12 s). */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const envois = [];
globalThis.fetch = async (req, init) => {
  const url = typeof req === 'string' ? req : req.url;
  if (/send-all/.test(url)) { envois.push(JSON.parse((init && init.body) || '{}')); return new Response('{"ok":true}'); }
  return new Response('nf', { status: 404 });
};
const kv = new Map();
const env = {
  KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 'jeton-push',
  ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } },
};
const ctx = { waitUntil() {} };
const alerte = async (host, corps) => {
  const r = await mod.fetch(new Request('https://' + host + '/__notify-kevin', { method: 'POST', headers: { 'content-type': 'application/json', host }, body: JSON.stringify(corps) }), env, ctx);
  return r.json();
};

let j = await alerte('cmcteams.kd-mc.com', { kind: 'nouveau', name: 'Jean ROSSI', text: 'Nouvelle inscription CMCteams (U00071)' });
ok(j.ok && j.alerte && envois.length === 1, 'nouvel inscrit CMCteams → une notification envoyée');
ok(/^🆕 Nouvelle connexion — Jean ROSSI$/.test(envois[0]?.payload?.title || '') && /U00071/.test(envois[0]?.payload?.body || ''), 'titre « 🆕 Nouvelle connexion — Jean ROSSI », le matricule dans le texte');
ok(envois[0]?.payload?.tag === 'kdmc-nouveau' && /admin\.kd-mc\.com/.test(envois[0]?.payload?.url || ''), 'la notification ouvre « Qui se connecte » (admin.kd-mc.com)');

j = await alerte('cmcteams.kd-mc.com', { kind: 'nouveau', name: 'Jean ROSSI', text: 'Nouvelle inscription CMCteams (U00071)' });
ok(j.ok && j.deja && envois.length === 1, 'la même personne, même app, dans les 12 h → pas de doublon');

j = await alerte('cmcteams-light.kd-mc.com', { kind: 'nouveau', name: 'Jean ROSSI', text: 'Première connexion à la light (code U00071)' });
ok(j.alerte && envois.length === 2, 'la même personne sur la LIGHT → sa propre alerte (autre app)');

j = await alerte('cmcteams.kd-mc.com', { kind: 'nouveau', name: 'Anne MARTIN', text: 'Nouvelle inscription CMCteams (U00072)' });
ok(j.alerte && envois.length === 3, 'une autre personne juste après → son alerte part (pas avalée par le frein des messages)');

j = await alerte('cmcteams-light.kd-mc.com', { name: 'Anne MARTIN', text: 'Bonjour' });
ok(j.ok && envois.length === 4 && /^💬 /.test(envois[3]?.payload?.title || ''), 'un message ordinaire garde son titre 💬');
j = await alerte('cmcteams-light.kd-mc.com', { name: 'Anne MARTIN', text: 'Encore' });
ok(j.throttled && envois.length === 4, 'et son frein de 12 s (inchangé)');

j = await alerte('evil.example.com', { kind: 'nouveau', name: 'X Y', text: 'z' });
ok(!j.ok && envois.length === 4, 'depuis une adresse hors du domaine → refusé');

console.log(`\nAlerte nouvelle connexion : ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
