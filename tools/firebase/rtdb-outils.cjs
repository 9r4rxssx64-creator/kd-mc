/* Outils RTDB partagés par les robots du coffre (27.09.2026) : lecture/écriture au compte de service,
   jeton ANONYME (ce qu'a n'importe quel téléphone) et statut vu par un visiteur. */
const fs = require('node:fs');
const path = require('node:path');

const DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';

async function req(method, p, token, body) {
  const url = DB + p + '.json' + (token ? '?access_token=' + encodeURIComponent(token) : '');
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(method + ' ' + p + ' → HTTP ' + r.status + ' ' + txt.slice(0, 160));
  return txt ? JSON.parse(txt) : null;
}
function cleWeb() {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY.trim();
  try {   // la clé WEB publique de l'appli (servie à chaque visiteur) — lue dans index.html du coffre
    const s = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
    const m = /FB_WEB_APIKEY="([^"]+)"/.exec(s); return m ? m[1] : '';
  } catch (_) { return ''; }   // pas d'index.html (dépôt public) : la clé doit venir du secret
}
async function jetonAnonyme() {
  const k = cleWeb(); if (!k) return null;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(k),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
  const j = await r.json().catch(() => ({}));
  return j.idToken || null;
}
/* Requête « comme un visiteur » (sans jeton) ou « comme un téléphone » (jeton anonyme). */
async function commeVisiteur(method, p, idToken, body) {
  const r = await fetch(DB + p + '.json' + (idToken ? '?auth=' + encodeURIComponent(idToken) : ''), {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  let corps = null;
  try { corps = await r.json(); } catch (_) { corps = null; }   // réponse non JSON (page d'erreur) : seul le statut compte
  return { status: r.status, body: corps };
}
const attendre = (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = { DB, req, cleWeb, jetonAnonyme, commeVisiteur, attendre };
