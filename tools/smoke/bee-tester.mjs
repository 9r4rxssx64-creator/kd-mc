#!/usr/bin/env node
/* TESTER BEE À LA PLACE DE KEVIN (17.10.2026, Kevin : « Test tout toi réel toujours à la place »).
 *
 * Ce que Kevin ferait au doigt : arbre.kd-mc.com → pastille 🐝 → « 🩺 Tester Bee » → lire le bilan ; puis lui poser une vraie question.
 * Ce robot le fait avec SA session (code admin = empreinte, secret CI → /__admin/login → session prouvée), exactement les appels du widget :
 *   1. POST /__javis/ai {diag:true}  → le bilan de Bee (session reconnue ? quelle IA gratuite répond ? arbre publié ? interrupteurs ?)
 *   2. POST /__javis/ai {messages:[question]} → une vraie réponse de Bee (date du jour : vérifiable, 0 € — une IA gratuite)
 * Verdict en annotations GitHub. Jamais le jeton ni l'empreinte dans le journal. Lecture seule : rien n'est écrit dans l'arbre.
 *
 * Usage : KDMC_ADMIN_PIN_SHA256=… node tools/smoke/bee-tester.mjs [--app arbre] [--question "…"] */
/* Autonome (18.10 : un robot PUBLIC ne doit jamais importer session-kevin.mjs, qui reste au coffre) : la connexion admin est ici,
   en quelques lignes, sans rien journaliser du jeton ni de l'empreinte. */
const masque = (s) => (!s ? '(absent)' : `(présent, ${String(s).length} car.)`);
async function passPortail(base) {
  const hash = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, note: 'code admin absent (secret CI)' };
  const r = await fetch(base + '/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ hash }) });
  if (!r.ok) return { ok: false, statut: r.status, note: 'le routeur a refusé /__admin/login' };
  const d = await r.json().catch(() => ({}));
  if (!d || !d.token) return { ok: false, note: 'réponse sans jeton' };
  return { ok: true, jeton: d.token, masque: masque(d.token), adminProuve: d.admin === true };
}

const DOMAINE = 'https://kd-mc.com';
const args = process.argv.slice(2);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const APP = String(val('--app', 'arbre')).replace(/[^a-z0-9-]/gi, '') || 'arbre';
const ATTEND = String(val('--attend', '')).replace(/[^a-z_]/g, '').slice(0, 24); /* type de carte que la réponse DOIT porter (preuve des outils de parité) */
const QUESTION = String(val('--question', 'Quelle est la date d’aujourd’hui ? Réponds en une phrase.'));
const annot = (niveau, titre, msg) => console.log(`::${niveau} title=${titre}::${String(msg).replace(/\n/g, ' · ')}`);

const session = await passPortail(DOMAINE);
if (!session.ok) { annot('error', 'Tester Bee', `pas de session Kevin : ${session.note || session.statut}`); process.exit(1); }
console.log(`session Kevin obtenue (${session.masque}), admin prouvé : ${session.adminProuve}`);
const H = { 'content-type': 'application/json', origin: `https://${APP}.kd-mc.com`, 'x-kdmc-sso': session.jeton, 'x-kdmc-sonde': 'bee-tester' };
const poster = async (corps) => {
  const t = Date.now();
  const r = await fetch(`${DOMAINE}/__javis/ai`, { method: 'POST', headers: H, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t, j };
};

/* 1. le bouton « 🩺 Tester Bee » */
const d = await poster({ diag: true, contexte: { app: APP, page: `https://${APP}.kd-mc.com/`, sonde: true } });
console.log(`diag : HTTP ${d.status} en ${d.ms} ms`);
console.log(d.j.texte || JSON.stringify(d.j).slice(0, 400));
const diagOk = d.status === 200 && d.j.ok === true;
annot(diagOk ? 'notice' : 'error', '🩺 Tester Bee', diagOk ? 'Bee est en état de travailler' : `bilan : ${d.j.reason || d.j.texte || 'HTTP ' + d.status}`);

/* 2. une vraie question (ce que Kevin tape ensuite) */
const q = await poster({ messages: [{ role: 'user', content: QUESTION }], contexte: { app: APP, sonde: true } });
const texte = String(q.j.text || q.j.reponse || q.j.content || '').trim();
console.log(`question : HTTP ${q.status} en ${q.ms} ms · IA : ${q.j.provider || '?'} · réponse : ${texte.slice(0, 200) || '(vide)'}`);
const jour = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Monaco', day: 'numeric' });
const repondOk = q.status === 200 && texte.length > 0;
const dateOk = repondOk && new RegExp(`\\b${jour}\\b`).test(texte);
annot(repondOk ? 'notice' : 'error', 'Bee répond', repondOk ? `${q.ms} ms, IA ${q.j.provider || '?'}${dateOk ? ', la date du jour est juste' : ', (date du jour non reconnue dans la réponse)'}` : `pas de réponse : HTTP ${q.status} ${q.j.reason || ''}`);

/* 3. les CARTES que le domaine a fabriquées pour Kevin (liste des comptes, bouton Appeler, bouton Ouvrir…) : NOMBRES SEULEMENT.
 * Un journal public se lit par tous : jamais un nom, un matricule, un numéro ni une adresse — seulement « type × nombre ». */
const cartes = Array.isArray(q.j.cartes) ? q.j.cartes : [];
const parType = {};
for (const c of cartes) { const t = /^[a-z_]{1,24}$/.test(String(c && c.t)) ? c.t : 'autre'; parType[t] = (parType[t] || 0) + 1; }
let resume = Object.keys(parType).sort((a, b) => a.localeCompare(b)).map((t) => `${t}×${parType[t]}`).join(' ') || 'aucune';
console.log(`cartes : ${resume}`);
/* Le raccourci « ouvrir » du domaine répond par une liste de liens `ouvrir` (pas par une carte) : on la compte aussi et, pour l'arbre,
 * on lit SEULEMENT la vue et le tri demandés (liste fermée) — jamais un nom de personne ni de famille (un journal public se lit par tous). */
const liens = Array.isArray(q.j.ouvrir) ? q.j.ouvrir : [];
if (liens.length) {
  parType.ouvrir = liens.length;
  resume = Object.keys(parType).sort((a, b) => a.localeCompare(b)).map((t) => `${t}×${parType[t]}`).join(' ');
  console.log(`liens ouvrir : ${resume}`);
  for (const l of liens.slice(0, 3)) {
    let h = ''; let vue = '-'; let tri = '-';
    try {
      const u = new URL(String(l?.url));
      h = /(^|\.)kd-mc\.com$/.test(u.hostname) ? u.hostname : 'hors-domaine';
      const p = new URLSearchParams(u.hash.replace(/^#/, ''));
      const v = p.get('vue');
      const t = p.get('tri');
      if (['arbre', 'plan', 'paysage', 'lignee'].includes(v)) vue = v;
      if (['alpha', 'nom', 'naissance', 'recent'].includes(t)) tri = t;
    } catch {
      h = 'adresse illisible'; // adresse qui ne se lit pas : on le dit, jamais son contenu (journal public)
    }
    console.log(`ouvrir : ${h} · vue=${vue} · tri=${tri}`);
  }
}
/* Recherche web : le domaine rend le résultat à l'IA sous forme de TEXTE (jamais une carte) ; la seule trace côté réponse est le NOM de l'outil
 * (`outils: ['rechercher', …]`). Signal « web » = l'outil de recherche a servi ET la réponse n'est pas vide. Il ne distingue pas web / encyclopédie :
 * la preuve se fait avec une question qui ne se trouve que sur le web. Journal public : un NOMBRE, jamais la question ni la réponse. */
const outilsUtilises = Array.isArray(q.j.outils) ? q.j.outils.filter((o) => /^[a-z_]{1,32}$/.test(String(o))) : [];
if (outilsUtilises.includes('rechercher') && texte.length > 0) {
  parType.web = 1;
  resume = Object.keys(parType).sort((a, b) => a.localeCompare(b)).map((t) => `${t}×${parType[t]}`).join(' ');
  console.log(`recherche web : outil « rechercher » utilisé, réponse de ${texte.length} caractères`);
}
const chat = cartes.find((c) => c && c.t === 'apex_chat');
if (chat) console.log(`apex_chat : ${Array.isArray(chat.messages) ? chat.messages.length : 0} message(s) prêt(s) · rien n'est envoyé (Kevin touche pour valider)`);
const liste = cartes.find((c) => c && c.t === 'liste_comptes');
if (liste) console.log(`liste_comptes : ${Array.isArray(liste.lignes) ? liste.lignes.length : 0} lignes · total ${Number(liste.total) || 0} · avec identifiant SBM ${Number(liste.avec_matricule) || 0}`);
let attendOk = true;
if (ATTEND) {
  attendOk = !!parType[ATTEND];
  annot(attendOk ? 'notice' : 'error', 'Carte de Bee', attendOk ? `la carte « ${ATTEND} » est bien là (${parType[ATTEND]})` : `la carte « ${ATTEND} » manque (cartes reçues : ${resume})`);
} else annot('notice', 'Cartes de Bee', resume);

process.exit(diagOk && repondOk && attendOk ? 0 : 1);
