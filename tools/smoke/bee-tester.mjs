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
import { passPortail } from './session-kevin.mjs';

const DOMAINE = 'https://kd-mc.com';
const args = process.argv.slice(2);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const APP = String(val('--app', 'arbre')).replace(/[^a-z0-9-]/gi, '') || 'arbre';
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

process.exit(diagOk && repondOk ? 0 : 1);
