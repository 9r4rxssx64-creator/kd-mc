#!/usr/bin/env node
/**
 * fonctions-reelles.mjs — HARNAIS « TESTE TOUT EN RÉEL » d'Apex Chat (F01…F85).
 *
 * Kevin : « Test toutes les fonctions en réel toujours ». Une fonction non EXÉCUTÉE = non testée.
 * Ce harnais exécute pour de vrai chaque fonction de la cartographie
 * `audit/apex-chat/01-FONCTIONS.md` et écrit un verdict par F-id.
 *
 * USAGE (depuis messaging-app/, Node ≥ 20) :
 *   npm run test:fonctions-reelles                  # tout (front + worker)
 *   node tools/fonctions-reelles.mjs --only=front   # navigateur seulement
 *   node tools/fonctions-reelles.mjs --only=worker  # worker seulement (rapide, ~2 s)
 *   node tools/fonctions-reelles.mjs --out=/chemin/resultat.json --md=/chemin/rapport.md --shots=/chemin/captures
 *   node tools/fonctions-reelles.mjs --headed       # voir le navigateur (debug local)
 *   node tools/fonctions-reelles.mjs --max-boutons=20   # plafond de boutons cliqués par vue (défaut 80)
 *
 * Sorties par défaut : audit/apex-chat/fonctions-reelles.json + audit/apex-chat/06-FONCTIONS-REELLES.md
 * (chemins relatifs à la racine du dépôt, calculés depuis ce fichier), captures dans --shots.
 * Code de sortie : 1 s'il existe au moins un ❌, 0 sinon (les ⚪ ne font pas échouer).
 *
 * CE QU'IL PROUVE (et comment) :
 *   VOLET A — navigateur Chromium RÉEL (Playwright), l'app `index.html` servie en HTTPS par un
 *   http-server propre au harnais (port 4177 par défaut, `--port=`, même certificat auto-signé que
 *   tests/serve-https.sh, relancé s'il meurt), montée avec une session admin SIMULÉE en localStorage
 *   (jamais de code admin, jamais de vrai numéro : `+336000000xx` synthétiques). L'API du
 *   worker est INTERCEPTÉE (page.route → réponses JSON plausibles, comme les specs e2e) :
 *   on prouve donc le RENDU, le CÂBLAGE (le bon chemin /api/… est appelé avec le jeton) et
 *   l'absence d'exception JS — pas la logique métier du serveur (voir volet B).
 *     • chaque vue `K.sv(nom)` : rendue, 0 `pageerror`, élément clé présent, capture d'écran ;
 *     • chaque bouton visible de la vue est CLIQUÉ (vraie souris Playwright) et doit produire
 *       un effet observable : changement de vue, modale, toast, boîte de dialogue, requête
 *       réseau interceptée, window.open, navigation, focus, ou mutation du DOM. Aucun effet
 *       = bouton « mort », consigné nommément ;
 *     • fonctions client hors vue (crypto E2E, cliquet, coffre, groupage, recherche, galerie,
 *       auto-réparation média, GIF, avatar, geste, réciprocité, visio, clé push, Face ID via
 *       authentificateur virtuel CDP, renvoi OTP, signalement) : appelées directement sur le
 *       VRAI bundle chargé, avec un aller-retour vérifié ;
 *     • Service Worker : contexte séparé où le SW est autorisé → actif + cache pré-rempli.
 *
 *   VOLET B — worker `workers/api-worker.js` exécuté dans Node (le VRAI code, importé), avec
 *   une BASE D1 SIMULÉE (helpers de tests/unit/api-worker-helpers.js : D1/KV/R2/queues/DO
 *   mockés) et `fetch` sortant remplacé (aucun réseau). Pour CHAQUE couple méthode/chemin du
 *   routeur (extrait du source, donc toujours à jour) : appel sans jeton, avec jeton
 *   utilisateur, avec jeton admin → jamais 500, corps JSON valide, garde admin = 401/403 sans
 *   jeton ou avec un jeton non-admin. Plus des sondes dédiées : porte MFA admin (F28), CORS
 *   par liste blanche (F78), tâches planifiées (F77), sauvegarde chiffrée re-déchiffrée (F84),
 *   envoi push (F69), Durable Objects instanciés (F31-F33, F81, F85).
 *   HONNÊTETÉ : c'est le vrai code du worker mais une base simulée — un bug SQL réel (colonne
 *   absente, contrainte) ne peut PAS être vu ici ; seuls les scénarios e2e contre la prod le voient.
 *
 * PIÈGES (appris en l'écrivant, à garder) :
 *   • Certificat auto-signé : `ignoreHTTPSErrors` ne couvre que la page ; le SW a besoin de
 *     `--ignore-certificate-errors` au lancement de Chromium, sinon il ne démarre jamais.
 *   • `serviceWorkers:'block'` partout SAUF pour la sonde SW : un SW actif fait ses propres
 *     fetch que `page.route` n'intercepte pas → mocks contournés, faux échecs.
 *   • Le jeton simulé ne doit PAS commencer par `local-` (sinon l'app se croit hors-ligne et
 *     saute les appels réseau) ; il n'a pas besoin d'être un vrai JWT : l'API est mockée.
 *   • Les réponses mockées cross-origin DOIVENT porter `Access-Control-Allow-Origin` (l'app
 *     est sur localhost:<port>, l'API sur workers.dev) sinon le navigateur les rejette.
 *   • Aucun réseau externe (proxy 403) : unpkg (Leaflet) est injoignable → la carte admin
 *     tombe sur son message « Carte indisponible » (comportement de repli, consigné ⚪ pour
 *     la partie CDN). Tout hôte inconnu est ABORTÉ, jamais laissé pendre.
 *   • Les boîtes de dialogue (confirm/alert/prompt) sont REFUSÉES automatiquement : un
 *     `confirm` accepté déclencherait un logout / une suppression de compte. L'ouverture
 *     compte comme effet du bouton.
 *   • `window.open` est remplacé par un enregistreur (sinon Chromium ouvre un onglet).
 *   • Un bouton qui navigue hors de l'app (ex. aller-retour kd-mc.com) tue `window.K` :
 *     le harnais le détecte, le consigne comme effet « navigation » et REBOOTE la page.
 *   • `renderAdminUsers` (F07) n'est PAS routée (`case 'admin-users'` → renderAdminLiveUsers) :
 *     on l'exécute directement pour prouver qu'elle rend, et on le signale.
 *   • Un `[onclick]` imbriqué dans un autre (ligne de conversation + bouton ⋯) : les deux
 *     sont cliqués séparément ; le parent reçoit aussi le clic de l'enfant (bubbling) — c'est
 *     l'effet réel de l'app, pas un artefact.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import https from 'node:https';

const __dir = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dir, '..');                 // messaging-app/
const REPO = resolve(APP, '..');                  // CMCteams/
const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const ONLY = ARGS.only || 'all';
const OUT_JSON = ARGS.out || join(REPO, 'audit', 'apex-chat', 'fonctions-reelles.json');
const OUT_MD = ARGS.md || join(REPO, 'audit', 'apex-chat', '06-FONCTIONS-REELLES.md');
const SHOTS = ARGS.shots || join(APP, 'test-results', 'fonctions-reelles');
const MAX_BOUTONS = parseInt(ARGS['max-boutons'] || '80', 10);
const HEADED = !!ARGS.headed;
// Port DÉDIÉ (pas 4173) : un serveur partagé avec Playwright/un autre run peut mourir en cours de route
// (vécu : ERR_CONNECTION_REFUSED au milieu d'un run) → le harnais lance et surveille le SIEN.
const PORT = parseInt(ARGS.port || '4177', 10);
const BASE = 'https://localhost:' + PORT;
const API_HOST = 'apex-chat-api.9r4rxssx64.workers.dev';
const PUSH_HOST = 'apex-push-worker.9r4rxssx64.workers.dev';
const T0 = Date.now();

// ============================================================================
//  Cartographie F01…F85 — libellé + volet qui la prouve
// ============================================================================
const F = {
  F01: ['Liste des conversations (chats)', 'vue'],        F02: ['Fil d\'une conversation (chat)', 'vue'],
  F03: ['Appels (calls)', 'vue'],                          F04: ['Contacts', 'vue'],
  F05: ['Réglages (settings)', 'vue'],                     F06: ['Panneau admin', 'vue'],
  F07: ['renderAdminUsers — annuaire', 'vue'],             F08: ['renderAdminLiveUsers — présence', 'vue'],
  F09: ['renderAdminMap — carte', 'vue'],                  F10: ['renderAdminSearch — recherche', 'vue'],
  F11: ['renderAdminConnections — connexions', 'vue'],     F12: ['renderAdminAudit — audit', 'vue'],
  F13: ['renderAdminPremium — premium', 'vue'],            F14: ['renderAdminToggles — interrupteurs', 'vue'],
  F15: ['renderAdminTrustedCircle — cercle', 'vue'],       F16: ['renderAdminInviteBook — invitations', 'vue'],
  F17: ['renderAdminDiag — diagnostic', 'vue'],            F18: ['renderAdminSentinels — sentinelles', 'vue'],
  F19: ['renderAdminTimeline — chronologie', 'vue'],
  F20: ['POST /api/auth/send-otp', 'route'],               F21: ['POST /api/auth/verify-otp', 'route'],
  F22: ['POST /api/auth/check-phone', 'route'],            F23: ['POST /api/auth/magic-login', 'route'],
  F24: ['POST /api/auth/sso-from-kdmc', 'route'],          F25: ['POST /api/auth/sso-from-apex', 'route'],
  F26: ['POST /api/auth/ws-ticket', 'route'],              F27: ['POST /api/auth/media-ticket', 'route'],
  F28: ['Porte admin X-Apex-Admin-Token (MFA)', 'sonde'],  F29: ['Verrou Face ID / passkey (client)', 'client'],
  F30: ['GET/POST /api/conversations (+PATCH/DELETE/members)', 'route'],
  F31: ['ConversationDO — WebSocket', 'do'],               F32: ['PresenceDO', 'do'],
  F33: ['BroadcastDO', 'do'],                              F34: ['Chiffrement E2E (crypto-core)', 'client'],
  F35: ['Cliquet (ratchet) & désynchronisation', 'client'],F36: ['Coffre à clés (key-vault)', 'client'],
  F37: ['POST /api/keys/prekeys + GET bundle', 'route'],   F38: ['Groupement des messages', 'client'],
  F39: ['Recherche dans une conversation', 'client'],      F40: ['Auto-réparation DM (heal-dm)', 'route'],
  F41: ['Membres locaux (hors-ligne)', 'route'],           F42: ['GET /api/media/:id (R2) + POST /api/media', 'route'],
  F43: ['Galerie médias', 'client'],                       F44: ['Auto-réparation média cassé', 'client'],
  F45: ['GET /api/gif + sélecteur GIF', 'route+client'],   F46: ['POST /api/users/me/avatar + photo', 'route+client'],
  F47: ['Geste balayer pour répondre', 'client'],          F48: ['/api/stories', 'route'],
  F49: ['/api/polls', 'route'],                            F50: ['/api/time-capsules', 'route'],
  F51: ['/api/letters', 'route'],                          F52: ['/api/memory-lane', 'route'],
  F53: ['/api/contacts + /api/contact/:id', 'route'],      F54: ['/api/invitations', 'route'],
  F55: ['Réciprocité vie privée', 'client'],               F56: ['GET /api/turn', 'route'],
  F57: ['GET /api/turn/health', 'route'],                  F58: ['POST /api/admin/turn-config', 'route'],
  F59: ['Maillage WebRTC (visio-mesh)', 'client'],         F60: ['/api/ia/chat', 'route'],
  F61: ['/api/ai/summarize', 'route'],                     F62: ['/api/ai/translate', 'route'],
  F63: ['/api/ai/rewrite', 'route'],                       F64: ['/api/ai/smart-reply', 'route'],
  F65: ['/api/ai/search', 'route'],                        F66: ['/api/ai/image-describe', 'route'],
  F67: ['/api/ai/voice-transcribe', 'route'],              F68: ['/api/push/subscribe·unsubscribe·test', 'route'],
  F69: ['Envoi VAPID (workers/lib/push-send.js)', 'sonde'],F70: ['Clé push client (push-key) + auto-réparation', 'client'],
  F71: ['Service Worker actif + cache', 'client'],         F72: ['/api/premium/status·quota·request', 'route'],
  F73: ['/api/admin/grant-premium', 'route'],              F74: ['/api/system/config + /api/health', 'route'],
  F75: ['/api/cgu/accept', 'route'],                       F76: ['/api/signalements', 'route'],
  F77: ['Tâches planifiées (scheduled)', 'sonde'],         F78: ['Filtre CORS liste blanche', 'sonde'],
  F79: ['DELETE /api/users/me', 'route'],                  F80: ['GET /api/users/me/export', 'route'],
  F81: ['e2e_strict appliqué par le DO', 'do'],            F82: ['Renvoi du code SMS (client)', 'client'],
  F83: ['Signalement côté utilisateur (client)', 'client'],F84: ['Sauvegarde chiffrée + rotation', 'sonde'],
  F85: ['Alarme de flush DO', 'do'],
};
/** route (méthode chemin) → F-id */
const ROUTE_TO_F = [
  [/^POST \/api\/auth\/send-otp$/, 'F20'], [/^POST \/api\/auth\/verify-otp$/, 'F21'], [/^POST \/api\/auth\/check-phone$/, 'F22'],
  [/^POST \/api\/auth\/magic-login$/, 'F23'], [/^POST \/api\/auth\/sso-from-kdmc$/, 'F24'], [/^POST \/api\/auth\/sso-from-apex$/, 'F25'],
  [/^POST \/api\/auth\/ws-ticket$/, 'F26'], [/^POST \/api\/auth\/media-ticket$/, 'F27'],
  [/^(GET|POST|DELETE) \/api\/conversations\/[^/]+\/members/, 'F41'], // avant F30 (plus général)
  [/^(GET|POST|PATCH|DELETE) \/api\/conversations(\/|$)/, 'F30'], [/^POST \/api\/keys\/prekeys$|^GET \/api\/keys\//, 'F37'],
  [/heal-dm|configure-core-pair/, 'F40'],
  [/^(GET|POST) \/api\/media/, 'F42'], [/^GET \/api\/gif$/, 'F45'], [/^POST \/api\/users\/me\/avatar$/, 'F46'],
  [/\/api\/stories/, 'F48'], [/\/api\/polls/, 'F49'], [/\/api\/time-capsules/, 'F50'], [/\/api\/letters/, 'F51'], [/\/api\/memory-lane/, 'F52'],
  [/\/api\/contacts$|\/api\/contact\//, 'F53'], [/\/api\/invitations/, 'F54'], [/^GET \/api\/turn$/, 'F56'], [/^GET \/api\/turn\/health$/, 'F57'],
  [/turn-config/, 'F58'], [/\/ia\/chat$/, 'F60'], [/\/api\/ai\/summarize$/, 'F61'], [/\/api\/ai\/translate$/, 'F62'], [/\/api\/ai\/rewrite$/, 'F63'],
  [/\/api\/ai\/smart-reply$/, 'F64'], [/\/api\/ai\/search$/, 'F65'], [/\/api\/ai\/image-describe$/, 'F66'], [/\/api\/ai\/voice-transcribe$/, 'F67'],
  [/\/api\/push\//, 'F68'], [/\/api\/premium\//, 'F72'], [/grant-premium|premium-requests/, 'F73'], [/\/api\/system\/config$|\/health$/, 'F74'],
  [/\/api\/cgu\/accept$/, 'F75'], [/\/api\/signalements$/, 'F76'], [/^DELETE \/api\/users\/me$/, 'F79'], [/^GET \/api\/users\/me\/export$/, 'F80'],
  // Routes admin lues par les vues admin → même F-id que la vue
  [/\/api\/admin\/all-users|\/api\/admin\/users\/[^/]+\/full/, 'F07'], [/\/api\/admin\/live-users|\/api\/users\/heartbeat/, 'F08'],
  [/\/api\/admin\/map|geo-history|\/api\/location\//, 'F09'], [/\/api\/admin\/search/, 'F10'], [/\/api\/admin\/connections/, 'F11'],
  [/\/api\/admin\/commands/, 'F12'], [/\/api\/admin\/toggles|user-toggles/, 'F14'], [/trusted-circle/, 'F15'],
  [/invite-magic|whitelist-bulk/, 'F16'], [/\/api\/admin\/diag|ws-diag|\/api\/test\//, 'F17'], [/\/api\/admin\/users\/[^/]+\/(timeline|conversations|block|unblock|ban|unban|authorize|revoke|force_logout|delete)/, 'F19'],
  [/force-update/, 'F17'], [/^(GET|PATCH) \/api\/users\/me$|^GET \/api\/users\//, 'F05'],
];
function routeF(key) { for (const [rx, f] of ROUTE_TO_F) if (rx.test(key)) return f; return null; }

const RES = { meta: { debut: new Date(T0).toISOString(), node: process.version, only: ONLY }, front: null, worker: null, verdicts: {} };
const MARQUEUR_MANUEL = '<!-- MANUEL : tout ce qui suit est rédigé à la main et préservé à chaque régénération -->';
const log = (...a) => console.log(...a);

// ============================================================================
//  VOLET B — WORKER (vrai code, base simulée)
// ============================================================================
async function voletWorker() {
  const t0 = Date.now();
  const H = await import(join(APP, 'tests', 'unit', 'api-worker-helpers.js'));
  const W = await import(join(APP, 'workers', 'api-worker.js'));
  const worker = W.default;
  const src = readFileSync(join(APP, 'workers', 'api-worker.js'), 'utf8');
  // fetch sortant (SMS, IA, Giphy, TURN, Firebase…) → réponse neutre, aucun réseau
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true, iceServers: [{ urls: 'stun:stub' }], results: [], data: [],
    choices: [{ message: { content: 'réponse simulée' } }], content: [{ type: 'text', text: 'réponse simulée' }],
    text: 'réponse simulée', response: 'réponse simulée', messages: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  // --- Base D1 simulée : un admin, une utilisatrice, une conv ; tout le reste vide ---
  const USERS = {
    kdmc_admin: { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin Desarzens', phone: '+33600000001', phone_hash: 'h1', is_admin: 1, is_banned: 0, status: 'active', last_seen: Date.now(), created_at: 1, identity_key_pub: 'PUB', premium_until: 0 },
    'u-laurence': { id: 'u-laurence', pseudo: 'laurence', real_name: 'Laurence Saint-Polit', phone: '+33600000002', phone_hash: 'h2', is_admin: 0, is_banned: 0, status: 'active', last_seen: Date.now(), created_at: 1, identity_key_pub: 'PUB2', premium_until: 0 },
  };
  function makeDbSim(opts = {}) {
    const calls = [];
    const inserted = {}; // utilisateurs créés par un INSERT pendant l'appel (verify-otp, sso…) → retrouvés ensuite par téléphone
    const stmt = (sql) => {
      let args = [];
      const s = {
        bind(...a) { args = a; return s; },
        async first() {
          calls.push(sql);
          if (/FROM users/i.test(sql)) {
            const id = args.find((a) => typeof a === 'string' && USERS[a]);
            if (id) return { ...USERS[id] };
            const ph = args.find((a) => typeof a === 'string' && inserted[a]);
            if (ph) return { ...inserted[ph] };
            return /COUNT/i.test(sql) ? { c: 0, n: 0, count: 0, total: 0 } : null;
          }
          if (/FROM conversations/i.test(sql)) return { id: args[0] || 'cv1', type: 'dm', created_by: 'kdmc_admin', created_at: 1, name: 'DM', e2e_strict: 0 };
          if (/FROM conversation_members/i.test(sql)) return { conv_id: 'cv1', user_id: args[0] || 'kdmc_admin', role: 'owner' };
          if (/FROM cgu_acceptances/i.test(sql)) return { accepted_at: 1 };
          if (/FROM messages/i.test(sql)) return { id: 'm1', conv_id: 'cv1', sender_id: 'u-laurence', ts: 1, content: 'x', media_key: null };
          if (/FROM (stories|polls|time_capsules|letters_queue|invitations|signalements|premium_requests|system_config|ratelimit_otp|otp_codes|push_subscriptions)/i.test(sql)) return null;
          if (/COUNT\(/i.test(sql)) return { c: 0, n: 0, count: 0, total: 0 };
          return null;
        },
        async all() {
          calls.push(sql);
          if (/FROM users/i.test(sql)) return { results: Object.values(USERS).map((u) => ({ ...u })) };
          if (/FROM conversation_members/i.test(sql)) return { results: [{ conv_id: 'cv1', user_id: 'kdmc_admin', role: 'owner' }, { conv_id: 'cv1', user_id: 'u-laurence', role: 'member' }] };
          if (/FROM system_config/i.test(sql)) return { results: opts.systemConfig || [] };
          return { results: [] };
        },
        async run() {
          calls.push(sql);
          if (/INSERT[^(]*INTO users\s*\(\s*id,\s*pseudo,\s*real_name,\s*phone,\s*phone_hash/i.test(sql)) {
            // mémorise la ligne insérée (les 2 INSERT du worker commencent par id, pseudo, real_name, phone, phone_hash)
            // pour que le SELECT … WHERE phone=? qui suit la retrouve, comme une vraie base.
            const u = { id: args[0], pseudo: args[1], real_name: args[2], phone: args[3], phone_hash: args[4], is_admin: /is_admin/.test(sql) ? 1 : 0, is_banned: 0, status: 'active', created_at: Date.now() };
            for (const k of [u.id, u.phone, u.phone_hash]) if (k) inserted[k] = u;
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return s;
    };
    return { _calls: calls, prepare: stmt, batch: async (stmts) => ({ success: true, count: stmts.length }) };
  }
  const envFor = (extra = {}) => H.ENV({ APEX_CHAT_DB: makeDbSim(), KEVIN_PHONE_E164: '+33600000001', APEX_SSO_SIGN_KEY: 'apex-sso-test-secret', GIPHY_KEY: 'g', CF_TURN_KEY_ID: 'k', CF_TURN_API_TOKEN: 't', ...extra });
  const iat = Math.floor(Date.now() / 1000);
  const tokAdmin = await H.makeJWT({ sub: 'kdmc_admin', is_admin: true, iat });
  const tokUser = await H.makeJWT({ sub: 'u-laurence', is_admin: false, iat });
  const ctx = { waitUntil: (p) => { ctx._w.push(Promise.resolve(p).catch(() => {})); }, _w: [] };

  // --- Extraction des routes DU SOURCE (toujours à jour) ---
  const routes = new Map(); // 'METHOD /path' → { path, method, sample }
  const lines = src.split('\n');
  const rxVars = {};
  for (const l of lines) {
    const mv = l.match(/const\s+(\w+)\s*=\s*path\.match\((\/(?:\\\/|[^/])+\/[a-z]*)\)/);
    if (mv) rxVars[mv[1]] = mv[2];
  }
  const samples = (source) => { // génère des chemins d'exemple à partir d'un motif (chaque alternative)
    let body = source.replace(/^\/\^?/, '').replace(/\$?\/[a-z]*$/, '').replace(/\\\//g, '/');
    let out = [''];
    const parts = body.split(/(\([^()]*\))/);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith('(')) {
        const inner = p.slice(1, -1);
        const alts = inner.includes('|') && !inner.startsWith('[') ? inner.split('|') : [/A-Z0-9/.test(inner) && !/a-z/.test(inner) ? 'ABC123' : 'u-laurence'];
        out = out.flatMap((o) => alts.map((a) => o + a));
      } else out = out.map((o) => o + p);
    }
    return out;
  };
  for (const l of lines) {
    const mm = l.match(/method === '([A-Z]+)'/);
    for (const mp of l.matchAll(/path === '([^']+)'/g)) {
      const method = mm ? mm[1] : 'GET';
      routes.set(`${method} ${mp[1]}`, { path: mp[1], method, sample: mp[1] });
    }
    const mu = l.match(/if \((\w+)(?: && method === '([A-Z]+)')?\) return/);
    if (mu && rxVars[mu[1]]) {
      const method = mu[2] || 'GET';
      for (const s of samples(rxVars[mu[1]])) routes.set(`${method} ${s}`, { path: rxVars[mu[1]], method, sample: s, regex: true });
    }
  }
  const BODIES = [
    [/send-otp|check-phone/, { phone: '+33600000009', name: 'Test Synthétique' }],
    [/verify-otp/, { phone: '+33600000009', otp: '000000', pseudo: 'test', name: 'Test Synthétique' }],
    [/sso-from-apex/, { apex_token: 'x', apex_uid: 'u', name: 'X Y' }], [/sso-from-kdmc/, { kdmc_token: 'x' }],
    [/magic-login/, { magic_token: 'x' }], [/\/api\/conversations$/, { type: 'dm', peer_id: 'u-laurence', member_ids: ['u-laurence'] }],
    [/\/members$/, { user_id: 'u-laurence' }], [/\/api\/conversations\/[^/]+$/, { name: 'Renommée' }],
    [/prekeys/, { identity_key_pub: 'PUB', prekeys: [] }], [/\/api\/stories$/, { content: 'x', media_url: null }],
    [/\/api\/polls$/, { conv_id: 'cv1', question: 'Q ?', options: ['a', 'b'] }], [/\/vote$/, { option_index: 0, option: 0 }],
    [/signalements/, { target_user_id: 'u-laurence', reason: 'spam', description: 'test' }],
    [/time-capsules/, { conv_id: 'cv1', content: 'x', open_at: Date.now() + 86400000 }],
    [/\/api\/letters$/, { to_user_id: 'u-laurence', content: 'x', deliver_at: Date.now() + 86400000 }],
    [/ia\/chat/, { messages: [{ role: 'user', content: 'bonjour' }], message: 'bonjour' }],
    [/ai\/(summarize|translate|rewrite|smart-reply|search)/, { text: 'bonjour à tous', messages: ['bonjour'], conv_id: 'cv1', query: 'bonjour', target_lang: 'en', style: 'formal', lang: 'fr' }],
    [/image-describe/, { image_base64: 'AAAA', media_type: 'image/png' }], [/voice-transcribe/, { audio_base64: 'AAAA', mime: 'audio/webm' }],
    [/premium\/request/, { plan: 'monthly', method: 'kdmc' }], [/grant-premium/, { user_id: 'u-laurence', plan: 'monthly' }],
    [/push\/(subscribe|unsubscribe|test)/, { subscription: { endpoint: 'https://push.example/x', keys: { p256dh: 'a', auth: 'b' } }, endpoint: 'https://push.example/x' }],
    [/\/api\/invitations$/, { phone: '+33600000009', name: 'Invité' }], [/admin\/commands/, { cmd: 'analytics', command: 'analytics' }],
    [/invite-magic/, { phone: '+33600000009', name: 'Invité' }], [/whitelist-bulk/, { entries: [{ phone: '+33600000009', name: 'Invité' }] }],
    [/trusted-circle/, { phone: '+33600000009', action: 'add' }], [/turn-config/, { key_id: 'k', token: 't' }],
    [/user-toggles/, { uid: 'kdmc_admin', feature: 'stories', value: false }], // cible un AUTRE compte → admin obligatoire
    [/admin\/toggles/, { key: 'stories', value: true }],
    [/\/api\/users\/me$/, { bio: 'test' }], [/cgu\/accept/, { version: 'v1', cgu: 'v1' }], [/heartbeat/, { lat: 43.7, lng: 7.4 }],
    [/\/api\/contact\/[^/]+$/, { name: 'Laurence', notes: 'x' }], [/nickname/, { nickname: 'Lolo' }],
    [/force-update-via-token/, { token: 'admin-secret' }], [/configure-core-pair/, { phone_a: '+33600000001', phone_b: '+33600000002' }],
    [/test\/login/, { phone: '+33600000009', name: 'Test' }], [/\/api\/media$/, { data: 'AAAA', type: 'image/png', name: 'x.png' }],
  ];
  const bodyFor = (p) => { for (const [rx, b] of BODIES) if (rx.test(p)) return b; return {}; };
  // Publiques PAR CONCEPTION (vérifié dans le source) : auth/*, health, config, turn/health, résolution d'un code
  // d'invitation, force-update-ts (les clients l'interrogent sans jeton), cgu/accept (acceptée AVANT la connexion,
  // rattachée au téléphone), ws-diag (diagnostic : répond 200 avec la CAUSE, y compris « auth_failed »).
  const PUBLIC_BY_DESIGN = ['/api/admin/force-update-ts', '/api/cgu/accept'];
  const isAdminRoute = (p) => (/^\/api\/admin\//.test(p) || /^\/api\/test\//.test(p)) && !PUBLIC_BY_DESIGN.includes(p);
  const isPublic = (p, m) => /^\/api\/auth\//.test(p) || /\/health$/.test(p) || p === '/api/system/config' || p === '/api/turn/health' || /^\/api\/invitations\/[A-Z0-9]+$/.test(p) || PUBLIC_BY_DESIGN.includes(p) || /\/ws-diag$/.test(p) || (p === '/api/invitations' && m === 'POST');

  const routesRes = [];
  async function call(method, path, token, extraHeaders = {}) {
    const env = envFor();
    const req = H.makeRequest({ method, path, body: method === 'GET' || method === 'DELETE' ? undefined : bodyFor(path), token, extraHeaders });
    let r; try { r = await worker.fetch(req, env, ctx); } catch (e) { return { status: 'EXC', err: e.message }; }
    const txt = await r.text();
    let json = null, jsonOk = false; try { json = txt ? JSON.parse(txt) : null; jsonOk = true; } catch (_) { jsonOk = false; }
    return { status: r.status, jsonOk: jsonOk || txt === '', code: json && (json.code || json.error), msg: json && (json.message || json.error), txt: txt.slice(0, 120) };
  }
  for (const [key, r] of routes) {
    const p = r.sample, m = r.method;
    const anon = await call(m, p, null);
    const user = await call(m, p, tokUser);
    const admin = await call(m, p, tokAdmin, { 'X-Apex-Admin-Token': 'admin-secret' });
    const pb = [];
    for (const [nom, x] of [['anon', anon], ['user', user], ['admin', admin]]) {
      if (x.status === 'EXC') pb.push(`${nom}: exception ${x.err}`);
      else if (x.status === 500) pb.push(`${nom}: 500 ${x.msg || ''} ${x.txt}`);
      else if (!x.jsonOk) pb.push(`${nom}: corps non-JSON (${x.status})`);
    }
    if (isAdminRoute(p)) {
      if (![401, 403].includes(anon.status)) pb.push(`anon sur route admin → ${anon.status} (attendu 401/403)`);
      if (![401, 403].includes(user.status) && !/force-update-ts/.test(p)) pb.push(`utilisateur non-admin → ${user.status} (attendu 403)`);
    } else if (!isPublic(p, m) && !/\/ws$/.test(p) && anon.status !== 401 && anon.status !== 403) {
      pb.push(`anon sans jeton → ${anon.status} (attendu 401)`);
    }
    routesRes.push({ key, f: routeF(key), regex: !!r.regex, anon: anon.status, user: user.status, admin: admin.status, adminCode: admin.code || null, ok: pb.length === 0, problemes: pb });
  }

  // --- Sondes dédiées ---
  const sondes = {};
  const sonde = async (id, fn) => { try { sondes[id] = await fn(); } catch (e) { sondes[id] = { ok: false, detail: 'exception : ' + (e && e.message) }; } };

  await sonde('F28', async () => { // porte MFA admin (même scénario que admin-bypass-mfa.test.js)
    const mk = (headers = {}) => new Request('https://x/api/auth/verify-otp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ phone: '+33600000001', pseudo: 'kevin', name: 'Kevin Desarzens', otp: '000000' }) });
    const base = (x) => ({ KEVIN_PHONE_E164: '+33600000001', JWT_SIGN_KEY: 'a'.repeat(64), ALLOW_TEST_OTP: 'false', APEX_CHAT_ADMIN_TOKEN: 'SECRET-ADMIN-XYZ', APEX_CHAT_DB: H.makeDB(), ...x });
    const off = await W.handleVerifyOtp(mk(), base({ ADMIN_BYPASS_REQUIRE_MFA: 'false' })); const offB = await off.json();
    const on = await W.handleVerifyOtp(mk({ 'X-Apex-Admin-Token': 'SECRET-ADMIN-XYZ' }), base({ ADMIN_BYPASS_REQUIRE_MFA: 'true' })); const onB = await on.json();
    const closed = await W.handleVerifyOtp(mk(), base({ ADMIN_BYPASS_REQUIRE_MFA: 'true' })); const cB = await closed.json();
    const wrong = await W.handleVerifyOtp(mk({ 'X-Apex-Admin-Token': 'MAUVAIS' }), base({ ADMIN_BYPASS_REQUIRE_MFA: 'true' }));
    const ok = off.status === 200 && offB.user?.is_admin === true && on.status === 200 && onB.user?.is_admin === true && closed.status === 401 && (cB.code || cB.error) === 'admin_mfa_required' && !cB.token && wrong.status === 401;
    return { ok, detail: `drapeau OFF→${off.status} admin ; ON+jeton→${on.status} admin ; ON sans jeton→${closed.status} ${cB.code || cB.error} ; ON jeton faux→${wrong.status}` };
  });
  await sonde('F78', async () => {
    const okR = await worker.fetch(H.withOrigin(H.makeRequest({ method: 'OPTIONS', path: '/api/x' }), 'https://9r4rxssx64-creator.github.io'), envFor(), ctx);
    const koR = await worker.fetch(H.withOrigin(H.makeRequest({ method: 'OPTIONS', path: '/api/x' }), 'https://evil.example'), envFor(), ctx);
    const a = okR.headers.get('Access-Control-Allow-Origin'), b = koR.headers.get('Access-Control-Allow-Origin');
    return { ok: a === 'https://9r4rxssx64-creator.github.io' && b === null, detail: `origine autorisée → ${a} ; origine inconnue → ${b}` };
  });
  await sonde('F77', async () => {
    const out = [];
    for (const cron of ['0 */1 * * *', '*/5 * * * *', '0 9 * * *', '0 3 * * *']) {
      const env = envFor({ LETTERS_QUEUE: H.makeQueue(), TIMECAPSULE_QUEUE: H.makeQueue(), MEMORY_LANE_QUEUE: H.makeQueue() });
      const c = { _w: [], waitUntil: (p) => c._w.push(Promise.resolve(p).catch((e) => e)) };
      await worker.scheduled({ cron }, env, c); await Promise.all(c._w);
      out.push(`${cron} → ${env.APEX_CHAT_DB._calls.length} requêtes D1, ${(env.LETTERS_QUEUE._sent.length + env.TIMECAPSULE_QUEUE._sent.length + env.MEMORY_LANE_QUEUE._sent.length)} msg queue`);
    }
    return { ok: true, detail: out.join(' · ') };
  });
  await sonde('F84', async () => { // sauvegarde chiffrée : écrite en R2, re-déchiffrée avec la même dérivation que tools/backup-decrypt.mjs, rotation 14 j
    const env = envFor();
    const old = 'backups/d1-2020-01-01.json.enc'; await env.APEX_CHAT_MEDIA.put(old, '{}');
    const c = { _w: [], waitUntil: (p) => c._w.push(Promise.resolve(p).catch((e) => e)) };
    await worker.scheduled({ cron: '0 3 * * *' }, env, c); await Promise.all(c._w);
    const keys = [...env.APEX_CHAT_MEDIA._store.keys()].filter((k) => k.startsWith('backups/d1-'));
    const today = keys.find((k) => k !== old);
    if (!today) return { ok: false, detail: 'aucune sauvegarde écrite dans R2 (clés : ' + keys.join(',') + ')' };
    const blob = JSON.parse(env.APEX_CHAT_MEDIA._store.get(today));
    const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
    const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SIGN_KEY), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('apex-chat-backup'), info: new TextEncoder().encode('d1-backup-v1') }, ikm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct))));
    const rotated = !env.APEX_CHAT_MEDIA._store.has(old);
    const clair = env.APEX_CHAT_MEDIA._store.get(today).includes('kevin') || env.APEX_CHAT_MEDIA._store.get(today).includes('+336');
    return { ok: blob.v === 1 && !!pt && rotated && !clair, detail: `${today} : v=${blob.v}, déchiffré (${Object.keys(pt).length} clés), ancienne sauvegarde 2020 purgée=${rotated}, aucune donnée en clair dans le blob=${!clair}` };
  });
  await sonde('F69', async () => {
    const P = await import(join(APP, 'workers', 'lib', 'push-send.js'));
    let bound = null; const env = { APEX_CHAT_ADMIN_TOKEN: 'tok', PUSH_WORKER: { fetch: async (u, init) => { bound = { u, init }; return new Response('{"ok":true}'); } } };
    const r = await P.sendPush(env, { endpoint: 'https://push.example/x', keys: { p256dh: 'a', auth: 'b' } }, { title: 'Test' });
    let direct = null; const env2 = { APEX_CHAT_ADMIN_TOKEN: 'tok' }; const of = globalThis.fetch; globalThis.fetch = async (u, init) => { direct = { u, init }; return new Response('{"ok":true}'); };
    await P.sendPush(env2, { endpoint: 'x' }, { title: 'T' }); globalThis.fetch = of;
    const body = JSON.parse(bound.init.body);
    return { ok: r.status === 200 && bound.u.includes('/web-push') && bound.init.headers['X-Apex-Push-Token'] === 'tok' && body.payload.title === 'Test' && direct.u.includes(PUSH_HOST), detail: `service binding → ${bound.u} (jeton posé, payload transmis) ; repli fetch direct → ${direct.u}` };
  });
  await sonde('DO', async () => { // F31/F32/F33/F81/F85 : instanciation réelle + requête HTTP + alarme
    const D = await import(join(APP, 'workers', 'durable-objects', 'ConversationDO.js'));
    globalThis.WebSocketPair = class { constructor() { this[0] = { accept() {}, send() {}, close() {}, addEventListener() {} }; this[1] = { accept() {}, send() {}, close() {}, addEventListener() {} }; } };
    const mkState = (id) => { const data = new Map(); return { id: { toString: () => id }, storage: { get: async (k) => data.get(k), put: async (k, v) => { data.set(k, v); }, setAlarm: async () => {}, deleteAlarm: async () => {} }, blockConcurrencyWhile: async (fn) => { await fn(); } }; };
    const out = {};
    const env = envFor();
    const conv = new D.ConversationDO(mkState('cv1'), env);
    const r1 = await conv.fetch(new Request('https://do/ws?userId=kdmc_admin'));
    out.F31 = { ok: r1.status !== 500, detail: `ConversationDO.fetch sans en-tête Upgrade → ${r1.status} (${(await r1.text()).slice(0, 60)})` };
    // e2e_strict : lu par le DO dans system_config.FEATURE_E2E_STRICT → un message en clair est refusé (e2e_required), un E2E1: passe
    const envStrict = envFor({ APEX_CHAT_DB: makeDbSim({ systemConfig: [{ key: 'FEATURE_E2E_STRICT', value: 'true' }] }) });
    const conv2 = new D.ConversationDO(mkState('cv-strict'), envStrict); await new Promise((r) => setTimeout(r, 20));
    conv2.notifyOfflineMembers = async () => {};
    const wsS = { sent: [], send(d) { this.sent.push(JSON.parse(d)); } };
    conv2.sessions.set(wsS, { userId: 'kdmc_admin', deviceId: 'd', convId: 'cv-strict', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });
    await conv2.handleMessage(wsS, { type: 'message', ciphertext: 'coucou en clair' }); const refus = wsS.sent.pop();
    await conv2.handleMessage(wsS, { type: 'message', ciphertext: 'E2E1:abc' }); const passe = wsS.sent.pop();
    const envOff = envFor(); const conv3 = new D.ConversationDO(mkState('cv-off'), envOff); await new Promise((r) => setTimeout(r, 20)); conv3.notifyOfflineMembers = async () => {};
    const wsO = { sent: [], send(d) { this.sent.push(JSON.parse(d)); } }; conv3.sessions.set(wsO, { userId: 'kdmc_admin', deviceId: 'd', convId: 'cv-off', lastSeq: 0, connectedAt: Date.now(), messageCount: 0, lastReset: Date.now() });
    await conv3.handleMessage(wsO, { type: 'message', ciphertext: 'coucou en clair' }); const offOk = wsO.sent.pop();
    out.F81 = { ok: refus && refus.code === 'e2e_required' && passe && passe.type === 'ack' && offOk && offOk.type === 'ack', detail: `strict ON : clair → ${refus && (refus.code || refus.type)}, E2E1: → ${passe && passe.type} ; strict OFF : clair → ${offOk && offOk.type}` };
    conv.pendingMessages.push({ id: 'm-alarm', conv_id: 'cv1', sender_id: 'kdmc_admin', ts: Date.now(), content: 'x' });
    const before = env.APEX_CHAT_DB._calls.length; await conv.alarm(); const after = env.APEX_CHAT_DB._calls.length;
    out.F85 = { ok: conv.pendingMessages.length === 0 && after > before, detail: `alarm() : tampon ${1}→${conv.pendingMessages.length} message, ${after - before} écriture(s) D1` };
    const pres = new D.PresenceDO(mkState('presence'), env); const r2 = await pres.fetch(new Request('https://do/heartbeat', { method: 'POST', body: JSON.stringify({ userId: 'kdmc_admin' }), headers: { 'content-type': 'application/json' } }));
    out.F32 = { ok: r2.status !== 500, detail: `PresenceDO.fetch POST /heartbeat → ${r2.status}` };
    const bc = new D.BroadcastDO(mkState('broadcast'), env); const r3 = await bc.fetch(new Request('https://do/broadcast', { method: 'POST', body: JSON.stringify({ type: 'force-update' }), headers: { 'content-type': 'application/json' } }));
    out.F33 = { ok: r3.status !== 500, detail: `BroadcastDO.fetch POST /broadcast → ${r3.status}` };
    return out;
  });
  Object.assign(sondes, sondes.DO || {}); delete sondes.DO;

  RES.worker = { duree_ms: Date.now() - t0, nb_routes: routesRes.length, routes: routesRes, sondes };
  log(`[worker] ${routesRes.length} routes en ${Date.now() - t0} ms — ${routesRes.filter((r) => !r.ok).length} problème(s)`);
}

// ============================================================================
//  VOLET A — NAVIGATEUR RÉEL
// ============================================================================
const ADMIN = { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin Desarzens', display_name: 'Kevin', phone: '+33600000001', is_admin: true };
const NOW = Date.now();
const CONVS = [
  { id: 'cv-laurence', type: 'dm', peer_id: 'u-laurence', name: 'Laurence', pseudo: 'Laurence', last_message: 'Coucou', last_ts: NOW - 60000, unread: 2, member_count: 2, pinned: true },
  { id: 'cv-groupe', type: 'group', name: 'Famille', pseudo: 'Famille', member_count: 3, members: ['kdmc_admin', 'u-laurence', 'u-ami'], last_message: 'Photo', last_ts: NOW - 3600000 },
  { id: 'cv-archive', type: 'dm', peer_id: 'u-ami', name: 'Ami', pseudo: 'Ami', archived: true, archived_at: NOW - 86400000, last_ts: NOW - 86400000 },
];
const MSGS = {
  'cv-laurence': [
    { id: 'm1', from: 'u-laurence', sender_id: 'u-laurence', ts: NOW - 300000, text: 'Salut Kevin, ça va ?' },
    { id: 'm2', from: 'kdmc_admin', sender_id: 'kdmc_admin', ts: NOW - 240000, text: 'Coucou Lolo, oui et toi ?', status: 'read' },
    { id: 'm3', from: 'u-laurence', sender_id: 'u-laurence', ts: NOW - 60000, text: 'Regarde https://example.com/photo.jpg 😊', reactions: { '❤️': ['kdmc_admin'] } },
  ],
  'cv-groupe': [{ id: 'g1', from: 'u-ami', sender_id: 'u-ami', ts: NOW - 3600000, text: 'Photo de famille', media_url: 'https://example.com/fam.jpg', media_type: 'image/jpeg' }],
  'cv-archive': [],
};
const CONTACTS = [
  { id: 'u-laurence', pseudo: 'Laurence', real_name: 'Laurence Saint-Polit', phone: '+33600000002', last_seen: NOW - 30000 },
  { id: 'u-ami', pseudo: 'Ami', real_name: 'Ami Synthétique', phone: '+33600000003', last_seen: NOW - 7200000 },
];
const SERVER_USERS = [{ ...ADMIN, is_admin: 1, phone_last4: '0001', last_seen: NOW, last_geo_label: 'Monaco', last_lat: 43.7384, last_lng: 7.4246, last_device_label: 'iPhone', conv_count: 2, created_at: NOW - 9e6, source: 'admin-bypass' },
  ...CONTACTS.map((c) => ({ ...c, is_admin: 0, phone_last4: c.phone.slice(-4), last_geo_label: 'Nice', last_lat: 43.71, last_lng: 7.26, last_device_label: 'Android', conv_count: 1, created_at: NOW - 8e6, source: 'invite' }))];
const VAPID = 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY';

/** Réponses simulées de l'API (formes lues par index.html) */
function mockApi(method, path, bodyText, page) {
  const p = path.split('?')[0];
  const ok = (o, status = 200) => ({ status, body: { ok: true, ...o } });
  if (p === '/api/users/me' && method === 'GET') return ok({ user: ADMIN });
  if (p === '/api/users/me' && method === 'PATCH') return ok({ user: ADMIN });
  if (p === '/api/users/me/export') return ok({ exported_at: NOW, user_id: ADMIN.id, messages: [] });
  if (p === '/api/users/me/avatar') return ok({ avatar_url: 'data:image/png;base64,AAAA' });
  if (p === '/api/users/me' && method === 'DELETE') return ok({ deleted: true });
  if (/^\/api\/users\/[^/]+$/.test(p)) return ok({ user: { id: p.split('/').pop(), pseudo: 'Laurence', avatar_url: 'data:image/png;base64,BBBBV2' } });
  if (p === '/api/conversations' && method === 'GET') return ok({ conversations: CONVS });
  if (p === '/api/conversations' && method === 'POST') return ok({ conversation: { id: 'cv-new', type: 'dm', peer_id: 'u-ami', name: 'Ami' }, conv_id: 'cv-new' });
  if (/^\/api\/conversations\/[^/]+\/members$/.test(p)) return ok({ members: [{ user_id: 'kdmc_admin', role: 'owner', pseudo: 'kevin' }, { user_id: 'u-laurence', role: 'member', pseudo: 'Laurence' }] });
  if (/^\/api\/conversations\//.test(p)) return ok({});
  if (p === '/api/contacts') return ok({ count: CONTACTS.length, users: CONTACTS });
  if (/^\/api\/contact\//.test(p)) return ok({ contact: { id: 'u-laurence', name: 'Laurence', notes: '' } });
  if (p === '/api/admin/all-users' || p === '/api/admin/live-users') return ok({ count: SERVER_USERS.length, users: SERVER_USERS });
  if (p === '/api/admin/premium-requests') return ok({ requests: [{ user_id: 'u-laurence', plan: 'monthly', price_eur: 4.99, ts: NOW - 5e5, method: 'kdmc', email: 'l@example.com' }] });
  if (p === '/api/admin/connections') return ok({ connections: [{ user_id: 'u-laurence', pseudo: 'Laurence', real_name: 'Laurence Saint-Polit', ts: NOW - 1e5, event: 'login', device_label: 'iPhone 15', geo_label: 'Monaco', ip: '10.0.0.1', user_agent: 'Safari' }, { user_id: 'kdmc_admin', pseudo: 'kevin', ts: NOW - 2e5, event: 'login', device_label: 'iPhone', geo_label: 'Monaco' }] });
  if (p === '/api/admin/trusted-circle') return ok({ phones: ['+33600000002', '+33600000003'] });
  if (p === '/api/admin/diag') return ok({ users: SERVER_USERS, conversations: CONVS, checks: [{ level: 'ok', label: 'D1', detail: 'répond' }, { level: 'warn', label: 'TURN', detail: 'non configuré' }], duplicates: [{ key: '+336…0002', accounts: ['u-laurence', 'u-laurence-bis'] }], stats: { users: 3, convs: 3 } });
  if (p === '/api/admin/search') return ok({ results: { users: SERVER_USERS.slice(0, 2), audit: [{ id: 1, action: 'login', ts: NOW, details: '{}', user_id: 'u-laurence' }], invitations: [{ code: 'INV1', phone: '+33600000009', created_at: NOW }], signalements: [{ id: 1, ts: NOW, reason: 'spam', status: 'pending', reporter_id: 'u-ami' }] } });
  if (/^\/api\/admin\/users\/[^/]+\/timeline$/.test(p)) return ok({ user: SERVER_USERS[1], timeline: [{ ts: NOW - 1e5, type: 'login', label: 'Connexion', detail: 'iPhone · Monaco' }, { ts: NOW - 2e5, type: 'message', label: 'Message envoyé', detail: 'cv-laurence' }] });
  if (/^\/api\/admin\/users\/[^/]+\/geo-history$/.test(p)) return ok({ history: [{ ts: NOW - 1e5, lat: 43.7, lng: 7.4, label: 'Monaco' }] });
  if (/^\/api\/admin\/users\/[^/]+\/conversations$/.test(p)) return ok({ conversations: CONVS.slice(0, 1) });
  if (/^\/api\/admin\/users\/[^/]+\/full$/.test(p)) return ok({ user: SERVER_USERS[1], conversations: CONVS.slice(0, 1), audit: [] });
  if (p === '/api/admin/map') return ok({ users: SERVER_USERS });
  if (p === '/api/admin/toggles') return ok({ toggles: {} });
  if (p === '/api/admin/whitelist-bulk') return ok({ results: [{ ok: true, phone: '+33600000009' }] });
  if (p === '/api/admin/commands') return ok({ result: { users: 3, messages: 42 }, output: 'ok' });
  if (p === '/api/admin/force-update-ts') return ok({ ts: NOW });
  if (/^\/api\/admin\//.test(p)) return ok({ results: [{ ok: true }] });
  if (p === '/api/premium/status') return ok({ premium: false, plan: null, premium_until: 0 });
  if (p === '/api/premium/quota') return ok({ used: 0, limit: 100, quota: { used: 0, limit: 100 } });
  if (p === '/api/system/config') return ok({ config: { ADMIN_MODE: 'A', KEVIN_INVISIBLE_ADMIN: 'true', AUTH_PROVIDER: 'firebase' } });
  if (p === '/api/turn') return ok({ iceServers: [{ urls: 'stun:stun.example:3478' }], ttl: 600 });
  if (p === '/api/turn/health') return ok({ configured: true, source: 'secret', ts: NOW });
  if (p === '/api/auth/media-ticket') return ok({ ticket: 'mtkt.test', mt: 'mtkt.test', expires_in: 300 });
  if (p === '/api/auth/ws-ticket') return ok({ ticket: 'wst.test', expires_in: 60 });
  if (p === '/api/auth/send-otp') return ok({ sent: true, _dev_otp: '000000' });
  if (p === '/api/auth/check-phone') return ok({ exists: true, known: true });
  if (p === '/api/auth/verify-otp') return ok({ user: ADMIN, token: 'eyJ.test.jwt' });
  if (/^\/api\/keys\/[^/]+\/bundle$/.test(p)) return { status: 200, body: { ok: true, bundle: { identity_key_pub: page.__peerPub || null, crypto_caps: 'media' } } };
  if (p === '/api/keys/prekeys') return ok({});
  if (p === '/api/gif') return { status: 200, body: { disabled: false, results: [{ id: 'g1', title: 'Bonjour', preview: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=', full: 'https://giphy.test/full.gif' }] } };
  if (p === '/api/signalements') return ok({ id: 's1' });
  if (p === '/api/invitations' && method === 'POST') return ok({ invitation: { code: 'ABC123', magic_token: 'mt', url: BASE + '/?i=ABC123' }, code: 'ABC123', link: BASE + '/?i=ABC123' });
  if (/^\/api\/ai\//.test(p)) return ok({ summary: 'Résumé simulé', text: 'Texte simulé', translation: 'Simulated', result: 'Simulé', suggestions: ['Oui', 'Non', 'Plus tard'], replies: ['Oui', 'Non'], results: [], description: 'Image simulée', transcript: 'transcription simulée' });
  if (p === '/api/ia/chat') return ok({ reply: 'Réponse simulée', text: 'Réponse simulée', answer: 'Réponse simulée', provider: 'qwen' });
  if (p === '/api/memory-lane') return ok({ memories: [], items: [] });
  if (/^\/api\/(stories|polls|time-capsules|letters)/.test(p)) return ok({ id: 'x1', items: [], stories: [], letters: [], capsules: [] });
  if (/^\/api\/push\//.test(p)) return ok({ sent: true });
  if (p === '/api/cgu/accept') return ok({});
  if (p === '/api/users/heartbeat') return ok({});
  if (p === '/api/media' && method === 'POST') return ok({ id: 'med1', url: 'https://' + API_HOST + '/api/media/med1' });
  if (/^\/api\/media\//.test(p)) return { status: 200, raw: Buffer.from([137, 80, 78, 71]), contentType: 'image/png' };
  if (/\/health$/.test(p)) return ok({ ts: NOW });
  return ok({ _mock: 'défaut', path: p });
}

/** Vues à rendre : [id F, nom K.sv, préparation (dans la page), sélecteur/texte clé attendu] */
const VUES = [
  ['F01', 'chats', null, { sel: '#conv-search-input, .conv-item', txt: 'Laurence' }],
  ['F02', 'chat', 'K.viewData = K.conversations.find(c => c.id === "cv-laurence");', { sel: '#chat-msgs, .msg', txt: 'Coucou Lolo' }],
  ['F03', 'calls', null, { sel: 'h2', txt: 'Appels' }],
  ['F04', 'contacts', null, { sel: 'h2', txt: 'Contacts' }],
  ['F05', 'settings', null, { sel: 'h2', txt: 'Réglages' }],
  ['F06', 'admin', null, { sel: '.admin-grid .admin-tile', txt: 'Panel admin' }],
  ['F07', 'admin-users', null, { sel: 'h2', txt: 'comptes' }],   // routée vers renderAdminLiveUsers (voir sonde F07 directe)
  ['F08', 'admin-live-users', null, { sel: '#admin-live-list', txt: 'Laurence' }],
  ['F09', 'admin-map', null, { sel: '#admin-map', txt: 'Carte temps réel' }],
  ['F10', 'admin-search', null, { sel: '#admin-search-q', txt: 'Recherche globale' }],
  ['F11', 'admin-connections', null, { sel: 'h2', txt: 'onnexion' }],
  ['F12', 'admin-audit', null, { sel: 'h2', txt: 'Audit' }],
  ['F13', 'admin-premium', null, { sel: 'h2', txt: 'Premium' }],
  ['F14', 'admin-toggles', null, { sel: 'h2', txt: 'Toggles' }],
  ['F15', 'admin-trusted-circle', null, { sel: '#tc-list', txt: 'Cercle de confiance' }],
  ['F16', 'admin-invite-book', null, { sel: 'h2', txt: 'invitations' }],
  ['F17', 'admin-diag', null, { sel: '#diag-body', txt: 'Diagnostic' }],
  ['F18', 'admin-sentinels', null, { sel: 'h2', txt: 'Sentinelles' }],
  ['F19', 'admin-timeline', 'K._adminTimelineUserId = "u-laurence";', { sel: '#admin-timeline-content', txt: 'Timeline' }],
];

async function waitServer(url, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const ok = await new Promise((res) => { const r = https.get(url, { rejectUnauthorized: false }, (x) => { x.resume(); res(x.statusCode > 0); }); r.on('error', () => res(false)); r.setTimeout(2000, () => { r.destroy(); res(false); }); });
    if (ok) return true; await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Serveur HTTPS statique propre au harnais (même certificat auto-signé que tests/serve-https.sh), relancé s'il meurt. */
let _srv = null;
async function ensureServer() {
  if (await waitServer(BASE + '/manifest.json', 1200)) return;
  const CERT = join(APP, 'tests', '.localhost-cert.pem'), KEY = join(APP, 'tests', '.localhost-key.pem');
  if (!existsSync(CERT) || !existsSync(KEY)) {
    const o = spawn('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', KEY, '-out', CERT, '-days', '3650', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    await new Promise((r) => o.on('exit', r));
  }
  try { if (_srv) process.kill(-_srv.pid); } catch (_) {}
  _srv = spawn('npx', ['http-server', '-p', String(PORT), '-s', '-c-1', '-S', '-C', CERT, '-K', KEY], { cwd: APP, stdio: 'ignore', detached: true });
  if (!(await waitServer(BASE + '/manifest.json', 30000))) throw new Error('serveur HTTPS ' + PORT + ' injoignable');
  log(`[front] serveur statique lancé sur ${BASE}`);
}
function stopServer() { try { if (_srv) process.kill(-_srv.pid); } catch (_) {} _srv = null; }

async function voletFront() {
  const t0 = Date.now();
  mkdirSync(SHOTS, { recursive: true });
  await ensureServer();
  const browser = await chromium.launch({ headless: !HEADED, args: ['--ignore-certificate-errors'] });
  const front = { duree_ms: 0, vues: [], boutons: [], clients: {}, sw: null, erreurs_js: [], requetes_api: 0 };
  let apiLog = [], pageErrors = [], dialogs = [], phase = 'boot';

  async function newContext(opts = {}) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', ...opts });
    await ctx.addInitScript(({ ADMIN, CONVS, MSGS, CONTACTS, NOW }) => {
      const P = 'apex_chat_';
      const put = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
      put('user', ADMIN); put('token', 'eyJhbGciOiJIUzI1NiJ9.test-session.sig'); // jamais « local- » (sinon l'app se croit hors-ligne)
      put('conversations', CONVS); put('contacts', CONTACTS);
      for (const id of Object.keys(MSGS)) put('messages_' + id, MSGS[id]);
      put('call_history', [{ id: 'call1', peer_id: 'u-laurence', pseudo: 'Laurence', name: 'Laurence', type: 'audio', ts: NOW - 86400000, duration: 65, direction: 'out', status: 'ended' }]);
      put('telemetry', [{ ts: NOW - 1000, level: 'info', sentinel: 'boot', msg: 'démarrage (harnais)' }]);
      put('signalements', []); put('invited_users', [{ id: 'inv1', pseudo: 'Invité', phone: '+33600000009', name: 'Invité Synthétique' }]);
      localStorage.setItem('apex_chat_cgu_v1', JSON.stringify({ accepted_at: NOW, version: 'v1.1.290', cgu: 'v1', implicit: true }));
      localStorage.setItem('apex_chat_perms_v1', JSON.stringify({ ts: NOW, granted: true, res: {} }));
      window.__opens = []; window.open = (u) => { window.__opens.push(String(u)); return { focus() {}, close() {} }; };
      window.__frSnap = () => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const app = document.getElementById('app');
        return { view: window.K && window.K.view, appLen: app ? app.innerHTML.length : 0,
          modals: [...document.querySelectorAll('.modal-back, .modal, [role="dialog"], .sheet, .bottom-sheet, #gif-picker')].filter(vis).length,
          toasts: [...document.querySelectorAll('.toasts > *, .toast')].filter(vis).length,
          dom: document.body.querySelectorAll('*').length, active: (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || '',
          opens: window.__opens.length, href: location.href, hasK: !!(window.K && window.K.user) };
      };
      window.__frButtons = (scope) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'; };
        const roots = scope.split(',').map((s) => document.querySelector(s.trim())).filter(Boolean);
        const seen = new Set(); const out = [];
        for (const root of roots) {
          for (const el of root.querySelectorAll('button, [onclick], a[href^="#"], input[type="checkbox"][onchange], .bnav-btn, .admin-tile, .conv-item, .card-row[onclick], label[for]')) {
            if (seen.has(el) || !vis(el) || el.disabled) continue;
            seen.add(el);
            const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48) || (el.id ? '#' + el.id : el.tagName.toLowerCase());
            out.push({ i: out.length, label, onclick: (el.getAttribute('onclick') || el.getAttribute('onchange') || '').slice(0, 80), tag: el.tagName.toLowerCase() });
            el.setAttribute('data-fr', String(out.length - 1));
          }
        }
        return out;
      };
    }, { ADMIN, CONVS, MSGS, CONTACTS, NOW });
    await ctx.route('**/*', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      if (url.host === 'localhost:' + PORT) return route.continue();
      if (url.host === API_HOST) {
        const path = url.pathname + url.search;
        apiLog.push({ m: req.method(), p: url.pathname, t: Date.now() });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
        const page = ctx.pages()[0];
        const r = mockApi(req.method(), path, req.postData(), { __peerPub: page && page.__peerPub });
        if (r.raw) return route.fulfill({ status: r.status, body: r.raw, headers: { 'Content-Type': r.contentType, 'Access-Control-Allow-Origin': '*' } });
        return route.fulfill({ status: r.status, body: JSON.stringify(r.body), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.host === PUSH_HOST) { apiLog.push({ m: req.method(), p: 'push:' + url.pathname, t: Date.now() }); return route.fulfill({ status: 200, body: JSON.stringify({ ok: true, configured: true, vapidPublic: VAPID }), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }
      if (url.host === 'admin.kd-mc.com') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
      return route.abort('blockedbyclient'); // aucun réseau externe (unpkg, giphy, kd-mc.com…)
    });
    return ctx;
  }
  const ctx = await newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push({ t: Date.now(), phase, msg: String(e && e.message || e).slice(0, 300), pile: String(e && e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 240) }));
  page.on('dialog', async (d) => { dialogs.push({ t: Date.now(), type: d.type(), msg: d.message().slice(0, 100) }); await d.dismiss().catch(() => {}); });

  async function boot() {
    await ensureServer();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K.user && window.K.user.is_admin && document.getElementById('app') && document.getElementById('app').children.length > 0, { timeout: 20000 });
    await page.waitForTimeout(400);
  }
  const alive = async () => { try { return page.url().startsWith(BASE) && await page.evaluate(() => !!(window.K && window.K.user)); } catch (_) { return false; } };
  async function prep(view, prepJs) {
    await page.evaluate(({ view, prepJs, ADMIN }) => {
      const K = window.K;
      try { K.user = ADMIN; K.token = 'eyJhbGciOiJIUzI1NiJ9.test-session.sig'; localStorage.setItem('apex_chat_user', JSON.stringify(ADMIN)); localStorage.setItem('apex_chat_token', JSON.stringify(K.token)); } catch (_) {}
      try { document.querySelectorAll('.modal-back, .modal, [role="dialog"], .sheet, .bottom-sheet').forEach((m) => m.remove()); } catch (_) {}
      try { if (K._closeModal) K._closeModal(); } catch (_) {}
      try { document.querySelectorAll('.toasts > *').forEach((t) => t.remove()); } catch (_) {}
      try { if (K._adminMapClose) K._adminMapClose(); } catch (_) {}
      try { if (K.ws && K.ws.close) K.ws.close(); } catch (_) {}
      if (prepJs) { try { (new Function('K', prepJs))(K); } catch (_) {} }
      K.sv(view, view === 'chat' ? K.viewData : undefined);
    }, { view, prepJs, ADMIN });
  }
  await boot();

  // ---------------------------------------------------------------- vues + boutons
  for (const [fid, view, prepJs, key] of VUES) {
    const errBefore = pageErrors.length, apiBefore = apiLog.length;
    phase = `vue ${fid}/${view}`;
    if (!(await alive())) await boot();
    await prep(view, prepJs);
    let keyFound = false;
    try { await page.waitForFunction(({ sel, txt }) => { const a = document.getElementById('app'); return a && a.querySelector(sel) && (!txt || a.textContent.includes(txt)); }, key, { timeout: 6000 }); keyFound = true; } catch (_) { keyFound = false; }
    await page.waitForTimeout(500);
    const snap = await page.evaluate(() => { const a = document.getElementById('app'); return { view: window.K.view, len: a.innerHTML.length, h2: [...a.querySelectorAll('h2')].map((h) => h.textContent.trim()).slice(0, 2), text: a.textContent.replace(/\s+/g, ' ').slice(0, 160) }; });
    const shot = join(SHOTS, `${fid}-${view}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    const errs = pageErrors.slice(errBefore).map((e) => e.msg);
    const apis = apiLog.slice(apiBefore).map((r) => `${r.m} ${r.p}`);
    const vue = { fid, view, rendue: snap.view === view && snap.len > 50, cle: keyFound, exceptions: errs, requetes: [...new Set(apis)], h2: snap.h2, capture: shot, boutons: [] };
    // ---- boutons : chaque bouton visible, cliqué, effet mesuré
    const scope = view === 'chats' ? '#app, #topbar, #bnav' : '#app';
    let items = await page.evaluate((s) => window.__frButtons(s), scope);
    if (items.length > MAX_BOUTONS) { vue.boutons_ignores = items.length - MAX_BOUTONS; items = items.slice(0, MAX_BOUTONS); }
    for (const it of items) {
      if (!(await alive())) { await boot(); }
      await prep(view, prepJs); await page.waitForTimeout(350);
      const again = await page.evaluate((s) => window.__frButtons(s), scope);
      if (!again[it.i] || again[it.i].label !== it.label) { vue.boutons.push({ ...it, clic: 'aucun', effet: ['⚪ non retrouvé après re-rendu'], exceptions: [], mort: false }); continue; }
      const before = await page.evaluate(() => window.__frSnap());
      const aB = apiLog.length, dB = dialogs.length, eB = pageErrors.length;
      let clicked = 'souris';
      phase = `bouton ${fid}/${view} #${it.i} « ${it.label} »`;
      // PIÈGE mesuré : sans centrage, le clic souris d'un élément en bas de page atterrit SOUS la barre de
      // navigation fixe (#bnav) → faux « bouton mort » (tuile Sentinelles, bouton Sécurité admin).
      await page.evaluate((i) => { const el = document.querySelector(`[data-fr="${i}"]`); if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' }); }, it.i);
      await page.waitForTimeout(80);
      try { await page.locator(`[data-fr="${it.i}"]`).first().click({ timeout: 2500, force: true }); }
      catch (_) { clicked = 'el.click()'; try { await page.evaluate((i) => { const el = document.querySelector(`[data-fr="${i}"]`); if (el) el.click(); }, it.i); } catch (e2) { clicked = 'échec: ' + e2.message.slice(0, 60); } }
      await page.waitForTimeout(450);
      const effets = [];
      let after = null;
      try { after = page.url().startsWith(BASE) ? await page.evaluate(() => window.__frSnap()) : null; } catch (_) { after = null; }
      if (!after || !after.hasK) { effets.push('navigation hors app → ' + page.url().slice(0, 80)); }
      else {
        if (after.view !== before.view) effets.push(`vue → ${after.view}`);
        if (after.modals > before.modals) effets.push('modale ouverte');
        if (after.modals < before.modals) effets.push('modale fermée');
        if (after.toasts > before.toasts) effets.push('toast');
        if (after.opens > before.opens) effets.push('window.open → ' + (await page.evaluate(() => window.__opens.slice(-1)[0])));
        if (after.href !== before.href) effets.push('URL → ' + after.href.slice(0, 60));
        if (after.active !== before.active && after.active) effets.push('focus → ' + after.active);
      }
      const apis2 = apiLog.slice(aB).map((r) => `${r.m} ${r.p}`); if (apis2.length) effets.push('réseau : ' + [...new Set(apis2)].join(', '));
      const dl = dialogs.slice(dB); if (dl.length) effets.push(`dialogue ${dl[0].type} « ${dl[0].msg.slice(0, 50)} »`);
      if (after && after.hasK && !effets.length && (after.dom !== before.dom || Math.abs(after.appLen - before.appLen) > 8)) effets.push('DOM modifié');
      const exc = pageErrors.slice(eB).map((e) => e.msg);
      // Un gestionnaire qui COMMENCE par `if(` (ex. bulle de message : n'agit qu'en mode sélection) n'est pas un bouton
      // mort quand sa garde n'est pas satisfaite : consigné « conditionnel », jamais compté mort.
      const conditionnel = !effets.length && /^\s*if\s*\(/.test(it.onclick || '');
      if (conditionnel) effets.push('conditionnel : garde `if(…)` non satisfaite dans cet état (pas un bouton)');
      vue.boutons.push({ i: it.i, label: it.label, onclick: it.onclick, clic: clicked, effet: effets, exceptions: exc, mort: effets.length === 0 });
    }
    front.vues.push(vue);
    log(`[front] ${fid} ${view} : rendue=${vue.rendue} clé=${vue.cle} exc=${errs.length} boutons=${vue.boutons.length} morts=${vue.boutons.filter((b) => b.mort).length}`);
  }

  // ---------------------------------------------------------------- fonctions client (hors vue)
  const cli = front.clients;
  const probe = async (id, fn) => { const eB = pageErrors.length; phase = `sonde client ${id}`; try { if (!(await alive())) await boot(); const r = await fn(); cli[id] = { ...r, exceptions: pageErrors.slice(eB).map((e) => e.msg) }; } catch (e) { cli[id] = { ok: false, detail: 'exception : ' + String(e && e.message).slice(0, 200), exceptions: pageErrors.slice(eB).map((e) => e.msg) }; } log(`[front] ${id} : ${cli[id].ok ? '✅' : '❌'} ${cli[id].detail}`); };

  await probe('F07', () => page.evaluate(async () => { // renderAdminUsers n'est pas routée : exécution directe
    const routed = (document.documentElement.innerHTML.match(/case 'admin-users': render(\w+)/) || [])[1];
    const app = document.getElementById('app'); window.renderAdminUsers(app); await new Promise((r) => setTimeout(r, 150));
    const ok = !!document.getElementById('user-list') && !!document.getElementById('user-search');
    return { ok, detail: `renderAdminUsers(app) exécutée directement : #user-search=${!!document.getElementById('user-search')}, #user-list=${!!document.getElementById('user-list')} — mais le routeur envoie 'admin-users' vers renderAdminLiveUsers (fonction non atteignable par K.sv)` };
  }));
  await probe('F29', async () => {
    const cdp = await ctx.newCDPSession(page); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const r = await page.evaluate(async () => { const K = window.K; try { localStorage.removeItem('apex_chat_user_biometric_kdmc_admin'); } catch (_) {}
      const supported = await K._biometricSupported(); const before = K._biometricEnrolled('kdmc_admin'); const reg = await K._biometricRegister(); const after = K._biometricEnrolled('kdmc_admin'); const ver = await K._biometricVerify();
      return { supported, before, reg, after, ver }; });
    await cdp.send('WebAuthn.disable').catch(() => {});
    return { ok: r.supported && !r.before && r.reg && r.after && r.ver, detail: `plateforme=${r.supported} enrôlé avant=${r.before} enrôlement=${r.reg} enrôlé après=${r.after} vérification=${r.ver} (authentificateur virtuel CDP)` };
  });
  await probe('F34', () => page.evaluate(async () => {
    const C = window.ApexCrypto; const st = await C.selfTest();
    const a = await C.generateIdentityKeys(), b = await C.generateIdentityKeys();
    await C.establishSession('hA', a.privateKey, b.publicKey); await C.establishSession('hB', b.privateKey, a.publicKey);
    const ct = await C.encryptForConv('hA', 'Coucou Lolo 🔐'); const pt = await C.decryptForConv('hB', ct);
    const fp = await C.computeFingerprint(a.publicKey, b.publicKey);
    return { ok: st.ok && pt === 'Coucou Lolo 🔐' && typeof fp === 'string' && fp.length > 8, detail: `selfTest=${st.ok}, aller-retour ECDH+AES-GCM entre 2 identités OK (« ${pt} »), empreinte ${String(fp).slice(0, 12)}…` };
  }));
  await probe('F35', () => page.evaluate(async () => {
    const C = window.ApexCrypto; const a = await C.generateIdentityKeys(), b = await C.generateIdentityKeys();
    await C.ratchetInit('rA', a.privateKey, b.publicKey); await C.ratchetInit('rB', b.privateKey, a.publicKey);
    const m1 = await C.ratchetEncrypt('rA', 'un'); const m2 = await C.ratchetEncrypt('rA', 'deux'); const m3 = await C.ratchetEncrypt('rA', 'trois');
    const d3 = await C.ratchetDecrypt('rB', m3.n, m3.ct || m3.ciphertext); // arrivé AVANT les autres (désynchronisation)
    const d1 = await C.ratchetDecrypt('rB', m1.n, m1.ct || m1.ciphertext); const d2 = await C.ratchetDecrypt('rB', m2.n, m2.ct || m2.ciphertext);
    const exp = C.ratchetExport('rA'); C.resetRatchet('rA'); const gone = !C.hasRatchet('rA'); await C.ratchetImport('rA', exp); const back = C.hasRatchet('rA');
    return { ok: d3 === 'trois' && d1 === 'un' && d2 === 'deux' && gone && back, detail: `3 messages, le 3ᵉ reçu en premier → « ${d3} », puis « ${d1} », « ${d2} » ; export/reset/import du cliquet : ${gone}/${back}` };
  }));
  await probe('F36', () => page.evaluate(async () => {
    // CÂBLAGE : index.html lit `window.ApexVault` (l.~6909/6952) mais ne charge lib/key-vault.js par AUCUNE balise
    // <script type="module"> → dans la vraie page, ApexVault est undefined et la clé privée reste en clair (crypto_priv).
    const cable = !!window.ApexVault; const tag = !!document.querySelector('script[type="module"][src*="key-vault"]');
    if (!window.ApexVault) await import('./lib/key-vault.js'); // exécute quand même la lib pour prouver qu'ELLE marche
    const V = window.ApexVault; const w = await V.wrapPrivKey('cGF5bG9hZC1wcml2ZQ==', '123456'); const u = await V.unwrapPrivKey(w, '123456');
    let refus = false; try { await V.unwrapPrivKey(w, '000000'); } catch (_) { refus = true; }
    const plan = V.planKeyMigration({ hasCleartext: true, hasWrapped: false, pinAvailable: true, keysLoaded: true });
    const libOk = u === 'cGF5bG9hZC1wcml2ZQ==' && refus && !!plan;
    return { ok: libOk && cable, detail: `lib : enveloppe v${w.v} déballée avec le bon PIN, refusée avec un faux PIN=${refus}, plan=${JSON.stringify(plan)} — MAIS window.ApexVault présent dans la page=${cable}, balise <script type=module src=lib/key-vault.js>=${tag} : le coffre n'est PAS chargé par index.html (importé ici manuellement), _ensureCryptoKeys retombe sur « keep-cleartext »` };
  }));
  await probe('F38', () => page.evaluate(() => {
    const K = window.K, G = window.ApexGrouping; const conv = { id: 'cg' };
    const msgs = [{ id: 'a', from: 'me', ts: 1000, text: 'un' }, { id: 'b', from: 'me', ts: 2000, text: 'deux' }, { id: 'c', from: 'other', ts: 3000, text: 'salut' }];
    const cls = msgs.map((m) => (new DOMParser().parseFromString(K._renderBubble(m, conv, msgs), 'text/html').querySelector('.msg') || {}).className || '');
    const flags = G.groupFlags(msgs, 1);
    return { ok: cls[0].includes('grp-start') && !cls[0].includes('grp-end') && cls[1].includes('grp-end') && cls[2].includes('grp-start') && cls[2].includes('grp-end') && !!flags, detail: `classes réelles : [${cls.map((c) => c.replace(/msg |me |them /g, '').trim()).join(' | ')}]` };
  }));
  await probe('F39', async () => {
    await prep('chat', VUES[1][2]); await page.waitForTimeout(400);
    return page.evaluate(async () => { const K = window.K, S = window.ApexSearch;
      const hits = S.findInMessages(K.messages['cv-laurence'], 'coucou'); K._toggleFindBar(); await new Promise((r) => setTimeout(r, 150));
      const bar = document.getElementById('find-input'); let count = '';
      if (bar) { bar.value = 'coucou'; bar.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 400)); count = (document.getElementById('find-count') || {}).textContent || ''; }
      const next = S.nextMatchIndex(0, 3, 1);
      return { ok: hits.total === 1 && hits.ids[0] === 'm2' && !!bar && /1\/1/.test(count) && next === 1, detail: `findInMessages('coucou') → ${hits.total} résultat (${hits.ids.join(',')}) ; barre #find-input ouverte=${!!bar}, compteur réel « ${count.trim()} », nextMatchIndex(0,3,+1)=${next}` }; });
  });
  await probe('F43', async () => {
    await prep('chat', VUES[1][2]); await page.waitForTimeout(300);
    return page.evaluate(async () => { const K = window.K, G = window.ApexGallery;
      const media = G.collectConversationMedia([...K.messages['cv-laurence'], ...K.messages['cv-groupe']]); const links = G.extractLinks('vois https://example.com/a.jpg et http://x.io');
      const before = document.querySelectorAll('.modal-back, .modal').length; K._openMediaGallery('cv-groupe'); await new Promise((r) => setTimeout(r, 400));
      const after = document.querySelectorAll('.modal-back, .modal').length;
      return { ok: (media.length >= 1 || Object.keys(media).length >= 1) && links.length === 2 && after > before, detail: `collectConversationMedia → ${media.length ?? Object.keys(media).length} élément(s), extractLinks → ${links.length} liens, galerie ouverte (modale ${before}→${after})` }; });
  });
  await probe('F44', async () => {
    const r = await page.evaluate(async () => { const C = window.ApexCrypto, K = window.K;
      const me = await C.generateIdentityKeys(), peerOld = await C.generateIdentityKeys(), peerNew = await C.generateIdentityKeys();
      window.__PEER_NEW_PUB = await C.exportPublicKey(peerNew.publicKey);
      K._cryptoKeys = me; K._healFetchAt = {};
      const conv = { id: 'cvm', peer_id: 'p', peer_pubkey: await C.exportPublicKey(peerOld.publicKey) }; K.viewData = conv; K.conversations = [conv, ...K.conversations];
      await C.establishSession('cvm', me.privateKey, peerOld.publicKey);
      const myPub = await C.importPublicKey(await C.exportPublicKey(me.publicKey)); await C.establishSession('peer-side', peerNew.privateKey, myPub);
      window.__ENC = await C.encryptBytes('peer-side', new Uint8Array([1, 2, 3, 42]).buffer); // gardé DANS la page (un aller-retour par evaluate abîme les octets)
      let directFail = false; try { await C.decryptBytes('cvm', window.__ENC); } catch (_) { directFail = true; }
      return { directFail, pub: window.__PEER_NEW_PUB }; });
    page.__peerPub = r.pub; // la route /api/keys/p/bundle renverra la NOUVELLE clé
    const h = await page.evaluate(async () => { const K = window.K; return Array.from(new Uint8Array(await K._decryptBytesHeal('cvm', window.__ENC))); });
    return { ok: r.directFail && h.join(',') === '1,2,3,42', detail: `déchiffrement direct échoue (clé du pair tournée)=${r.directFail} → _decryptBytesHeal re-télécharge le bundle et déchiffre [${h.join(',')}]` };
  });
  await probe('F45', async () => {
    await prep('chat', VUES[1][2]); await page.waitForTimeout(300);
    return page.evaluate(async () => { const K = window.K; let uploaded = null; K._uploadMedia = async (f) => { uploaded = { name: f.name, type: f.type, size: f.size }; };
      const of = window.fetch; window.fetch = async (u, o) => (String(u) === 'https://giphy.test/full.gif' ? new Response(new Blob([new Uint8Array([71, 73, 70, 56, 57, 97])], { type: 'image/gif' })) : of(u, o));
      if (!document.getElementById('gif-picker')) { const d = document.createElement('div'); d.id = 'gif-picker'; d.style.display = 'none'; document.body.appendChild(d); }
      K._toggleGifPicker(); await K._loadGifs('bonjour'); await new Promise((r) => setTimeout(r, 300));
      const cells = document.querySelectorAll('#gif-grid .gif-cell').length; const c = document.querySelector('#gif-grid .gif-cell'); if (c) c.click(); await new Promise((r) => setTimeout(r, 300)); window.fetch = of;
      return { ok: cells === 1 && !!uploaded && uploaded.type === 'image/gif', detail: `GET /api/gif (mock, via le vrai fetch) → ${cells} cellule ; clic → _uploadMedia(File ${uploaded && uploaded.type}, ${uploaded && uploaded.size} o)` }; });
  });
  await probe('F46', async () => {
    const r = await page.evaluate(async () => { const K = window.K; K._fetchedPeerAvatars = {}; const a1 = await K._fetchPeerAvatar('u-laurence', true); const cached = K._getAvatar('u-laurence');
      const before = document.querySelectorAll('.modal-back, .modal').length; K._openProfilePhoto(); await new Promise((r) => setTimeout(r, 300)); const after = document.querySelectorAll('.modal-back, .modal, input[type=file]').length;
      return { a1: String(a1).slice(0, 30), cached: String(cached).slice(0, 30), before, after }; });
    return { ok: r.a1.includes('BBBBV2') && r.cached.includes('BBBBV2') && r.after > r.before, detail: `_fetchPeerAvatar → ${r.a1}… (cache=${r.cached.includes('BBBBV2')}) ; _openProfilePhoto → modale/sélecteur (${r.before}→${r.after})` };
  });
  await probe('F47', async () => {
    await prep('chat', VUES[1][2]); await page.waitForTimeout(400);
    return page.evaluate(() => { const K = window.K; K._replyToMsg = null; if (K._installLongPressOnce) K._installLongPressOnce();
      const el = document.querySelector('.msg[data-msg-id="m1"]'); if (!el) return { ok: false, detail: 'bulle m1 absente du DOM' };
      // Un VRAI touchend porte changedTouches (lu par l'écouteur global « retour par balayage », index.html l.~2271) :
      // sans lui, l'événement synthétique provoque un faux pageerror « reading '0' » — piège mesuré.
      const fire = (type, x) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const t = [{ clientX: x, clientY: 200 }]; Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : t }); Object.defineProperty(ev, 'changedTouches', { value: t }); el.dispatchEvent(ev); };
      fire('touchstart', 10); fire('touchmove', 40); fire('touchmove', 95); fire('touchend', 95); const big = K._replyToMsg && K._replyToMsg.id;
      K._replyToMsg = null; fire('touchstart', 10); fire('touchmove', 25); fire('touchmove', 40); fire('touchend', 40); const small = K._replyToMsg;
      const dec = window.ApexGesture.swipeReplyDecision ? 'présent' : 'absent';
      return { ok: big === 'm1' && !small, detail: `balayage 85 px sur la vraie bulle m1 → réponse à « ${big} » ; balayage 30 px → ${small ? 'déclenché (KO)' : 'rien'} ; ApexGesture.swipeReplyDecision ${dec}` }; });
  });
  await probe('F55', () => page.evaluate(async () => { const K = window.K; const P = window.ApexPrivacy;
    const saveRender = K.render; K.render = () => {}; K._renderTypingIndicator = () => {};
    const readEvt = () => ({ type: 'read', userId: 'peer', message_id: 'm9' }); const typeEvt = () => ({ type: 'typing', userId: 'peer', from_pseudo: 'Peer' });
    window.ls('privacy_prefs', { readReceipts: true, typingIndicator: true, onlineStatus: true }); K._readState = {}; K._typingState = {};
    await window._handleWsMessage(readEvt(), 'cvP'); await window._handleWsMessage(typeEvt(), 'cvP'); const sees = K._readState?.cvP?.peer === 'm9' && !!K._typingState?.cvP?.peer;
    window.ls('privacy_prefs', { readReceipts: false, typingIndicator: false, onlineStatus: false }); K._readState = {}; K._typingState = {};
    await window._handleWsMessage(readEvt(), 'cvP'); await window._handleWsMessage(typeEvt(), 'cvP'); const hidden = !K._readState?.cvP?.peer && !K._typingState?.cvP?.peer;
    K._presenceState = { peer: { status: 'online', last_seen: Date.now() } }; const lbl = K._presenceLabel({ id: 'cvP', peer_id: 'peer' });
    window.ls('privacy_prefs', { readReceipts: true, typingIndicator: true, onlineStatus: true }); K.render = saveRender;
    return { ok: sees && hidden && !String(lbl).includes('En ligne') && P.canSeePresence !== undefined, detail: `activé → je vois lecture+saisie=${sees} ; coupé → masqués=${hidden}, présence « ${lbl} »` }; }));
  await probe('F59', () => page.evaluate(async () => { const V = window.ApexVisio; const sent = [];
    const s = V.createVisioSession({ convId: 'cv-laurence', userId: 'kdmc_admin', type: 'audio', ws: { send: (m) => sent.push(m), readyState: 1 }, iceServers: [{ urls: 'stun:stun.example:3478' }],
      deps: { getUserMedia: async () => { const c = document.createElement('canvas'); return c.captureStream ? c.captureStream(1) : new MediaStream(); } } });
    await s.startLocalStream(); await s.inviteUser('u-laurence'); await new Promise((r) => setTimeout(r, 300));
    const peers = s.state.peers.size; const pc = s.state.peers.get('u-laurence') && s.state.peers.get('u-laurence').pc; const hasOffer = !!(pc && pc.localDescription && pc.localDescription.type === 'offer');
    s.toggleMute(); const muted = s.state.muted; s.end();
    return { ok: peers === 1 && hasOffer && muted && s.state.peers.size === 0, detail: `vraie RTCPeerConnection créée pour 1 pair, offre SDP locale=${hasOffer}, ${sent.length} signal(aux) envoyés via ws, mute=${muted}, end() → ${s.state.peers.size} pair` }; }));
  await probe('F70', () => page.evaluate(async () => { const P = window.ApexPushKey; const K = window.K;
    const REAL = 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY', OTHER = 'BOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyXYZ12';
    const d = { resub: P.needsResubscribe(OTHER, REAL, true), keep: P.needsResubscribe(REAL, REAL, true), noSub: P.needsResubscribe('', REAL, false), failOpen: P.needsResubscribe(REAL, '', true), eff: P.effectiveVapidKey(OTHER, REAL) === OTHER };
    const srv = await K._serverVapidKey();
    return { ok: d.resub && !d.keep && d.noSub && !d.failOpen && d.eff && srv === REAL, detail: `décisions ${JSON.stringify(d)} ; _serverVapidKey() lit la clé du push-worker (/health mocké) = ${srv === REAL}` }; }));
  await probe('F82', () => page.evaluate(async () => { const K = window.K; K.authData = { phone: '+33600000009', name: 'Test Synthétique' }; K.authStep = 'otp'; const sv = window.renderAuthStep; let rendered = false; window.renderAuthStep = () => { rendered = true; };
    await K._resendOtp(); await new Promise((r) => setTimeout(r, 200)); window.renderAuthStep = sv;
    return { ok: !!K.authData._dev_otp, detail: `_resendOtp() → POST /api/auth/send-otp (mock) → code de dev reçu « ${K.authData._dev_otp} », re-rendu de l'étape=${rendered}` }; }));
  await probe('F83', async () => {
    const aB = apiLog.length; const dB = dialogs.length;
    const r = await page.evaluate(async () => { const K = window.K; const before = document.querySelectorAll('.modal-back, .modal').length; const p = K._reportUser('u-laurence', 'cv-laurence', 'Laurence'); await new Promise((r) => setTimeout(r, 400));
      const after = document.querySelectorAll('.modal-back, .modal').length; const btn = [...document.querySelectorAll('.modal button, .modal-back button')].find((b) => /signaler|envoyer|confirmer/i.test(b.textContent));
      const sel = document.querySelector('.modal select, .modal-back select, .modal input[type=radio]'); if (sel && sel.tagName === 'SELECT') sel.value = sel.options[1] ? sel.options[1].value : sel.value;
      if (btn) btn.click(); await new Promise((r) => setTimeout(r, 500)); try { await p; } catch (_) {}
      return { before, after, btn: btn ? btn.textContent.trim() : null }; });
    const apis = apiLog.slice(aB).filter((x) => x.p === '/api/signalements').length; const dl = dialogs.slice(dB).map((d) => d.type);
    return { ok: r.after > r.before || apis > 0 || dl.length > 0, detail: `_reportUser() → modale (${r.before}→${r.after}), bouton « ${r.btn} », POST /api/signalements ×${apis}, dialogues ${dl.join(',') || 'aucun'}` };
  });
  await probe('F41-client', () => page.evaluate(async () => { const K = window.K; const conv = K.conversations.find((c) => c.id === 'cv-groupe');
    const fns = ['_openMembers', '_openGroupInfo', '_openConvInfo', '_addLocalMember'].filter((f) => typeof K[f] === 'function');
    return { ok: fns.length > 0, detail: `fonctions membres présentes côté client : ${fns.join(', ') || 'aucune'} (la logique membres locaux est testée côté worker F41)` }; }));

  // ---------------------------------------------------------------- Service Worker (F71) : contexte séparé, SW autorisé
  try {
    await ensureServer();
    const ctxSw = await newContext({ serviceWorkers: 'allow' });
    const p2 = await ctxSw.newPage();
    await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const etat = await p2.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { support: false };
      try { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout 15s')), 15000))]);
        for (let i = 0; i < 40; i++) { const keys = await caches.keys(); if (keys.some((k) => k.startsWith('apex-chat-v'))) break; await new Promise((r) => setTimeout(r, 250)); }
        const keys = await caches.keys(); const manifest = await caches.match('./manifest.json');
        return { support: true, active: !!reg.active, keys, manifestCached: !!manifest, url: reg.active && reg.active.scriptURL };
      } catch (e) { return { support: true, error: String(e && e.message || e) }; } });
    front.sw = { ok: !!(etat.support && etat.active && etat.keys && etat.keys.some((k) => k.startsWith('apex-chat-v')) && etat.manifestCached), detail: etat.error ? 'SW : ' + etat.error : `SW actif (${etat.url}), caches ${JSON.stringify(etat.keys)}, manifest pré-caché=${etat.manifestCached}` };
    await ctxSw.close();
  } catch (e) { front.sw = { ok: false, detail: 'exception : ' + e.message }; }
  log(`[front] F71 SW : ${front.sw.ok ? '✅' : '❌'} ${front.sw.detail}`);

  front.erreurs_js = pageErrors; front.requetes_api = apiLog.length; front.dialogues = dialogs.length;
  front.duree_ms = Date.now() - t0;
  RES.front = front;
  await browser.close();
  stopServer();
}

// ============================================================================
//  VERDICTS + RAPPORTS
// ============================================================================
function verdicts() {
  const V = RES.verdicts; const fr = RES.front, wk = RES.worker;
  const set = (id, statut, preuve) => { V[id] = { statut, libelle: F[id][0], volet: F[id][1], preuve }; };
  const nonAtteint = (id, why) => set(id, '⚪', why);
  for (const id of Object.keys(F)) {
    const [, kind] = F[id];
    if (kind === 'vue') {
      if (!fr) { nonAtteint(id, 'volet front non exécuté (--only=worker)'); continue; }
      const v = fr.vues.find((x) => x.fid === id); if (!v) { nonAtteint(id, 'vue absente du harnais'); continue; }
      const morts = v.boutons.filter((b) => b.mort); const excB = v.boutons.filter((b) => (b.exceptions || []).length);
      const pb = [];
      if (!v.rendue) pb.push('vue non rendue'); if (!v.cle) pb.push('élément clé absent'); if (v.exceptions.length) pb.push('exception : ' + v.exceptions[0]);
      if (morts.length) pb.push(`${morts.length} bouton(s) sans effet : ${morts.map((b) => `« ${b.label} »`).join(', ')}`);
      if (excB.length) pb.push(`${excB.length} bouton(s) lèvent une exception : ${excB.map((b) => `« ${b.label} » → ${b.exceptions[0].slice(0, 70)}`).join(' ; ')}`);
      let extra = '';
      if (id === 'F07' && fr.clients.F07) extra = ' · ' + fr.clients.F07.detail;
      if (id === 'F09') extra = ' · ⚪ tuiles/CDN Leaflet (unpkg) injoignables hors réseau : seul le repli « Carte indisponible » est prouvé';
      const preuve = `rendue, ${v.boutons.length} boutons cliqués (${v.boutons.length - morts.length} avec effet), requêtes ${v.requetes.join(', ') || 'aucune'}${extra}`;
      set(id, pb.length ? '❌' : '✅', pb.length ? pb.join(' · ') + ' — ' + preuve : preuve);
      continue;
    }
    if (kind === 'route') {
      if (!wk) { nonAtteint(id, 'volet worker non exécuté'); continue; }
      const rs = wk.routes.filter((r) => r.f === id); if (!rs.length) { nonAtteint(id, 'aucune route du routeur ne correspond'); continue; }
      const ko = rs.filter((r) => !r.ok);
      const clientExtra = fr && fr.clients[id] ? ` · client : ${fr.clients[id].ok ? '✅' : '❌'} ${fr.clients[id].detail}` : '';
      const clientKo = fr && fr.clients[id] && !fr.clients[id].ok;
      set(id, ko.length || clientKo ? '❌' : '✅', (ko.length ? ko.map((r) => `${r.key} : ${r.problemes.join(' ; ')}`).join(' · ') + ' — ' : '') + rs.map((r) => `${r.key} → anon ${r.anon} / user ${r.user} / admin ${r.admin}`).join(' · ') + clientExtra);
      continue;
    }
    if (kind === 'route+client') {
      const rs = wk ? wk.routes.filter((r) => r.f === id) : []; const c = fr && fr.clients[id];
      const ko = rs.filter((r) => !r.ok); const parts = [];
      if (rs.length) parts.push(rs.map((r) => `${r.key} → anon ${r.anon} / user ${r.user} / admin ${r.admin}${r.ok ? '' : ' ❌ ' + r.problemes.join(';')}`).join(' · ')); else parts.push('worker non exécuté');
      if (c) parts.push(`client : ${c.detail}`); else parts.push('client non exécuté');
      set(id, (ko.length || (c && !c.ok)) ? '❌' : (rs.length && c ? '✅' : '⚪'), parts.join(' · '));
      continue;
    }
    if (kind === 'client') {
      if (!fr) { nonAtteint(id, 'volet front non exécuté'); continue; }
      const c = id === 'F71' ? fr.sw : fr.clients[id];
      if (!c) { nonAtteint(id, 'sonde client absente'); continue; }
      const exc = c.exceptions && c.exceptions.length ? ' · exception JS : ' + c.exceptions[0] : '';
      set(id, c.ok ? '✅' : '❌', c.detail + exc); continue;
    }
    if (kind === 'sonde' || kind === 'do') {
      if (!wk) { nonAtteint(id, 'volet worker non exécuté'); continue; }
      const s = wk.sondes[id]; if (!s) { nonAtteint(id, 'sonde serveur absente'); continue; }
      set(id, s.ok ? '✅' : '❌', s.detail + (kind === 'do' ? ' (Durable Object instancié avec un état simulé — pas le runtime Cloudflare)' : ''));
    }
  }
}

function rapportMd() {
  const V = RES.verdicts; const fr = RES.front, wk = RES.worker;
  const n = (s) => Object.values(V).filter((v) => v.statut === s).length;
  const L = [];
  L.push('# Apex Chat — 06 · Fonctions testées EN RÉEL (F01…F85)', '');
  const total = RES.meta.duree_ms || (Date.now() - T0);
  L.push(`**Généré par** \`messaging-app/tools/fonctions-reelles.mjs\` (\`npm run test:fonctions-reelles\`) · **Date** : ${RES.meta.debut} · **Durée mesurée** : ${(total / 1000).toFixed(1)} s (front ${fr ? (fr.duree_ms / 1000).toFixed(1) : '—'} s · worker ${wk ? (wk.duree_ms / 1000).toFixed(1) : '—'} s) · Node ${RES.meta.node}`, '');
  L.push('**Règle** : ✅ = exécuté et résultat attendu observé · ❌ = échec (message exact) · ⚪ = non atteignable en local et pourquoi.', '');
  L.push(`**Bilan** : ✅ ${n('✅')} · ❌ ${n('❌')} · ⚪ ${n('⚪')} / ${Object.keys(V).length}`, '');
  L.push('**Ce que ça prouve / ne prouve pas** : le volet navigateur (Chromium réel, DOM réel, app montée, API interceptée) prouve le RENDU, le CÂBLAGE et l\'absence d\'exception ; le volet worker (vrai `api-worker.js` dans Node, base D1 SIMULÉE) prouve le routage, les gardes d\'accès et l\'absence de 500 — pas le SQL réel ni la logique métier profonde.', '');
  L.push('| F | Fonction | Volet | Verdict | Preuve / message exact |', '|---|---|---|---|---|');
  for (const id of Object.keys(F)) { const v = V[id]; L.push(`| **${id}** | ${v.libelle} | ${v.volet} | ${v.statut} | ${String(v.preuve).replace(/\|/g, '\\|').slice(0, 900)} |`); }
  if (fr) {
    L.push('', '## Boutons cliqués par vue (volet navigateur)', '');
    L.push('| Vue | Boutons | Avec effet | Morts | Exceptions | Boutons morts (libellé → onclick) |', '|---|---:|---:|---:|---:|---|');
    for (const v of fr.vues) { const m = v.boutons.filter((b) => b.mort); const e = v.boutons.filter((b) => (b.exceptions || []).length); L.push(`| ${v.fid} \`${v.view}\` | ${v.boutons.length}${v.boutons_ignores ? ' (+' + v.boutons_ignores + ' ignorés, plafond)' : ''} | ${v.boutons.length - m.length} | ${m.length} | ${e.length} | ${m.map((b) => `« ${b.label} » → \`${b.onclick || b.tag}\``).join(' ; ').replace(/\|/g, '\\|') || '—'} |`); }
    L.push('', `Captures : \`${SHOTS}\` (une par vue). Exceptions JS totales sur tout le volet : ${fr.erreurs_js.length}. Requêtes API interceptées : ${fr.requetes_api}. Dialogues (refusés automatiquement) : ${fr.dialogues}.`);
    if (fr.erreurs_js.length) { L.push('', '### Exceptions JS (message exact, phase du harnais, pile)', ''); for (const e of fr.erreurs_js.slice(0, 40)) L.push(`- \`${e.msg.replace(/`/g, "'")}\` — pendant **${e.phase || '?'}** — ${(e.pile || '').replace(/`/g, "'")}`); }
  }
  if (wk) {
    L.push('', `## Routes du worker (${wk.nb_routes} couples méthode/chemin, extraits du source)`, '');
    L.push('| Route | F | anon | user | admin | OK | Problème |', '|---|---|---:|---:|---:|:-:|---|');
    for (const r of wk.routes) L.push(`| \`${r.key}\` | ${r.f || '—'} | ${r.anon} | ${r.user} | ${r.admin}${r.adminCode ? ' ' + r.adminCode : ''} | ${r.ok ? '✅' : '❌'} | ${r.problemes.join(' ; ') || ''} |`);
  }
  L.push('', '## Auto-critique (écrite par le harnais, à compléter à la main)', '');
  const blancs = Object.keys(V).filter((id) => V[id].statut === '⚪');
  L.push(`- **F-ids non atteints (⚪)** : ${blancs.length ? blancs.map((id) => `${id} (${V[id].preuve})`).join(' · ') : 'aucun'}.`);
  L.push('- **Ce que le harnais ne prouve pas** : la logique métier du serveur sur une vraie base D1 (colonnes, contraintes, données réelles) ; le contenu exact des vues au-delà de l\'élément clé (un texte faux mais rendu passe) ; les WebSockets réels (bloqués hors réseau) ; les tuiles de carte (CDN) ; l\'envoi SMS/push réel ; le comportement sur WebKit/iPhone (Chromium seul ici).');
  L.push(`- **Temps d'exécution mesuré** : ${(total / 1000).toFixed(1)} s au total (front ${fr ? (fr.duree_ms / 1000).toFixed(1) : '—'} s · worker ${wk ? (wk.duree_ms / 1000).toFixed(1) : '—'} s).`);
  // Tout ce qui suit le marqueur MANUEL dans le rapport précédent (constats rédigés à la main) est PRÉSERVÉ.
  let manuel = '';
  try { const prev = readFileSync(OUT_MD, 'utf8'); const i = prev.indexOf(MARQUEUR_MANUEL); if (i >= 0) manuel = prev.slice(i); } catch (_) {}
  return L.join('\n') + '\n\n' + (manuel || MARQUEUR_MANUEL + '\n');
}

// ============================================================================
(async () => {
  if (ARGS.rapport) { // --rapport=<json> : régénère verdicts + Markdown depuis un résultat existant (sans relancer les tests)
    const prev = JSON.parse(readFileSync(ARGS.rapport, 'utf8')); Object.assign(RES, prev); RES.meta.regenere_le = new Date().toISOString();
  } else {
    try {
      if (ONLY === 'all' || ONLY === 'worker') await voletWorker();
      if (ONLY === 'all' || ONLY === 'front') await voletFront();
    } catch (e) { console.error('[fonctions-reelles] ERREUR FATALE :', e && e.stack || e); RES.meta.fatal = String(e && e.message || e); }
    RES.meta.fin = new Date().toISOString(); RES.meta.duree_ms = Date.now() - T0;
  }
  verdicts();
  mkdirSync(dirname(OUT_JSON), { recursive: true }); writeFileSync(OUT_JSON, JSON.stringify(RES, null, 1));
  mkdirSync(dirname(OUT_MD), { recursive: true }); writeFileSync(OUT_MD, rapportMd());
  const n = (s) => Object.values(RES.verdicts).filter((v) => v.statut === s).length;
  log(`\n[fonctions-reelles] ✅ ${n('✅')} · ❌ ${n('❌')} · ⚪ ${n('⚪')} — ${((Date.now() - T0) / 1000).toFixed(1)} s\n  JSON : ${OUT_JSON}\n  MD   : ${OUT_MD}\n  Captures : ${SHOTS}`);
  process.exit(n('❌') || RES.meta.fatal ? 1 : 0);
})();
