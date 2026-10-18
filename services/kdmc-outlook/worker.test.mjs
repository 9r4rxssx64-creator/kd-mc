// Tests purs du connecteur Outlook (logique, sans réseau/OAuth réel).
// node --test services/kdmc-outlook/worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesInvoice, keepAttachment, buildAuthorizeUrl, pkceChallenge, b64url, REDIRECT_URI, declencherPublication, PUBLICATION_CLE_KV, basculerSecoursDepot, githubHorsService, SECOURS_DEPOTS } from './worker.js';

test('matchesInvoice : reconnaît factures/devis, ignore le reste', () => {
  assert.equal(matchesInvoice('Votre facture Orange', '', 'no-reply@orange.fr'), true);
  assert.equal(matchesInvoice('Devis toiture', 'devis.pdf', ''), true);
  assert.equal(matchesInvoice('Reçu de paiement', '', ''), true);
  assert.equal(matchesInvoice('', 'quittance_loyer.pdf', ''), true);
  assert.equal(matchesInvoice('', '', 'billing@edf.fr'), true); // "bill"
  assert.equal(matchesInvoice('Réunion projet lundi', 'compte-rendu.pdf', 'chef@sbm.mc'), false);
  assert.equal(matchesInvoice('Photos week-end', 'img.jpg', 'ami@gmail.com'), false);
});

test('keepAttachment : PDF/image de mail « facture » seulement', () => {
  const pdf = { contentType: 'application/pdf', name: 'f.pdf', '@odata.type': '#microsoft.graph.fileAttachment' };
  const img = { contentType: 'image/jpeg', name: 'photo.jpg', '@odata.type': '#microsoft.graph.fileAttachment' };
  const docx = { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'note.docx' };
  assert.equal(keepAttachment(pdf, 'Facture EDF', 'edf@edf.fr'), true);
  assert.equal(keepAttachment(pdf, 'Contrat de bail', 'agence@x.fr'), false); // pas de mot-clé facture
  assert.equal(keepAttachment(img, 'Ma facture resto', ''), true);       // mot-clé dans le sujet
  assert.equal(keepAttachment(img, 'Vacances', ''), false);              // aucun mot-clé (nom neutre)
  assert.equal(keepAttachment({ ...img, name: 'ticket.jpg' }, 'Vacances', ''), true); // mot-clé dans le nom de fichier
  assert.equal(keepAttachment(docx, 'Facture', ''), false); // ni pdf ni image
  assert.equal(keepAttachment({ ...pdf, isInline: true }, 'Facture', ''), false); // inline (logo) exclu
  assert.equal(keepAttachment({ contentType: 'application/pdf', name: 'x.pdf', '@odata.type': '#microsoft.graph.itemAttachment' }, 'Facture', ''), false); // pas un fileAttachment
});

test('b64url : url-safe, sans padding', () => {
  const s = b64url(new Uint8Array([251, 255, 191, 0, 1, 2]));
  assert.equal(/[+/=]/.test(s), false);
});

test('pkceChallenge : S256 = 43 chars url-safe déterministe', async () => {
  const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const c = await pkceChallenge(v);
  // vecteur RFC 7636 §4
  assert.equal(c, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(c.length, 43);
});

test('buildAuthorizeUrl : contient client_id, PKCE S256, scope Mail.Read, redirect 9r4rxssx64', () => {
  const u = buildAuthorizeUrl('11111111-2222-3333-4444-555555555555', 'st8', 'CHAL');
  assert.match(u, /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/);
  assert.match(u, /client_id=11111111-2222-3333-4444-555555555555/);
  assert.match(u, /code_challenge=CHAL/);
  assert.match(u, /code_challenge_method=S256/);
  assert.match(u, /scope=offline_access\+Mail\.Read/);
  assert.match(u, /response_type=code/);
});

test('REDIRECT_URI = sous-domaine du COMPTE (lesson #85), jamais desarzens-kevin', () => {
  assert.match(REDIRECT_URI, /kdmc-outlook\.9r4rxssx64\.workers\.dev\/auth\/callback/);
  assert.equal(/desarzens-kevin/.test(REDIRECT_URI), false);
});

/* ---- publication automatique vers le dépôt public (17.10.2026, décision (b) de Kevin) ---- */
const kvMem = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, m }; };
const faux = (reponses) => { const appels = []; const f = async (url, init = {}) => { appels.push({ url, method: init.method || 'GET', body: init.body }); const r = reponses(url, init); return r; }; f.appels = appels; return f; };
const rep = (status, json) => ({ status, json: async () => json });

test('publication : jeton absent → rien, aucun appel', async () => {
  const f = faux(() => rep(200, {}));
  const r = await declencherPublication({ ACCOUNTS: kvMem() }, f);
  assert.equal(r.fait, false); assert.equal(f.appels.length, 0);
});

test('publication : main du coffre a changé → le robot public est lancé, la marque est posée', async () => {
  const kv = kvMem();
  const f = faux((url, init) => (init.method === 'POST' ? rep(204, {}) : rep(200, { sha: 'abc1234def' })));
  const r = await declencherPublication({ GITHUB_SAUVEGARDE_TOKEN: 't', ACCOUNTS: kv }, f);
  assert.equal(r.fait, true); assert.equal(r.sha, 'abc1234def');
  assert.equal(f.appels.length, 2);
  assert.match(f.appels[0].url, /repos\/9r4rxssx64-creator\/CMCteams\/commits\/main$/);
  assert.match(f.appels[1].url, /repos\/9r4rxssx64-creator\/kd-mc\/actions\/workflows\/publier-depuis-coffre\.yml\/dispatches$/);
  assert.equal(JSON.parse(f.appels[1].body).ref, 'main');
  assert.equal(kv.m.get(PUBLICATION_CLE_KV), 'abc1234def');
});

test('publication : même commit que la dernière fois → aucun lancement (1 lecture, 0 écriture)', async () => {
  const kv = kvMem(); await kv.put(PUBLICATION_CLE_KV, 'abc1234def');
  const f = faux(() => rep(200, { sha: 'abc1234def' }));
  const r = await declencherPublication({ GITHUB_SAUVEGARDE_TOKEN: 't', ACCOUNTS: kv }, f);
  assert.equal(r.fait, false); assert.equal(r.raison, 'déjà publié'); assert.equal(f.appels.length, 1);
});

test('publication : GitHub refuse le lancement → la marque n\'est PAS posée (nouvel essai au tick suivant)', async () => {
  const kv = kvMem();
  const f = faux((url, init) => (init.method === 'POST' ? rep(403, {}) : rep(200, { sha: 'abc1234def' })));
  const r = await declencherPublication({ GITHUB_SAUVEGARDE_TOKEN: 't', ACCOUNTS: kv }, f);
  assert.equal(r.fait, false); assert.equal(kv.m.has(PUBLICATION_CLE_KV), false);
});

/* ── Le Lenovo en secours automatique (Kevin 18.10) ─────────────────────────────────────────────── */
const DEPOT = '9r4rxssx64-creator/kd-mc';
const NOW = Date.parse('2026-10-18T12:00:00Z');
const il = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const runsKO = [{ conclusion: 'startup_failure', created_at: il(1) }, { conclusion: 'startup_failure', created_at: il(2) }, { conclusion: 'success', created_at: il(3) }];
const runsOK = [{ conclusion: 'success', created_at: il(1) }, { conclusion: 'startup_failure', created_at: il(2) }];
/* faux GitHub : lenovo = 'online' | 'offline' | null (aucun runner), variable = valeur | null, runs = liste */
function github({ lenovo, variable = null, runs = runsOK, statutRunners = 200, statutPose = 201 }) {
  const appels = [];
  const f = async (url, init = {}) => {
    const m = (init.method || 'GET'); appels.push(m + ' ' + url.replace('https://api.github.com/repos/' + DEPOT + '/actions/', ''));
    if (/runners/.test(url)) return rep(statutRunners, { runners: lenovo ? [{ status: lenovo, labels: [{ name: 'self-hosted' }, { name: 'kdmc-lenovo' }] }] : [] });
    if (/variables\/KDMC_RUNNER/.test(url)) {
      if (m === 'DELETE') { variable = null; return rep(204, {}); }
      return variable ? rep(200, { name: 'KDMC_RUNNER', value: variable }) : rep(404, {});
    }
    if (/variables$/.test(url) && m === 'POST') { if (statutPose === 201) variable = JSON.parse(init.body).value; return rep(statutPose, {}); }
    if (/runs/.test(url)) return rep(200, { workflow_runs: runs });
    return rep(500, {});
  };
  f.appels = appels; f.variable = () => variable;
  return f;
}
const env = (kv) => ({ GITHUB_SAUVEGARDE_TOKEN: 't', ACCOUNTS: kv || kvMem() });

test('secours : machines GitHub HS + Lenovo en ligne → KDMC_RUNNER=kdmc-lenovo posée, heure notée', async () => {
  const kv = kvMem(); const f = github({ lenovo: 'online', runs: runsKO });
  const r = await basculerSecoursDepot(DEPOT, env(kv), NOW, f);
  assert.equal(r.action, 'pose'); assert.equal(f.variable(), 'kdmc-lenovo'); assert.equal(kv.m.get('secours:lenovo:' + DEPOT), String(NOW));
});
test('secours : GitHub fonctionne → rien (jamais de bascule inutile)', async () => {
  const f = github({ lenovo: 'online', runs: runsOK });
  const r = await basculerSecoursDepot(DEPOT, env(), NOW, f);
  assert.equal(r.action, 'rien'); assert.equal(f.variable(), null);
});
test('secours : GitHub HS mais Lenovo éteint ou jamais enrôlé → rien (aucun robot envoyé à une machine éteinte)', async () => {
  for (const l of ['offline', null]) {
    const f = github({ lenovo: l, runs: runsKO });
    const r = await basculerSecoursDepot(DEPOT, env(), NOW, f);
    assert.equal(r.action, 'rien', String(l)); assert.equal(f.variable(), null);
  }
});
test('secours : le Lenovo s\'éteint pendant le secours → variable retirée au tick suivant', async () => {
  const kv = kvMem(); await kv.put('secours:lenovo:' + DEPOT, String(NOW - 3600000));
  const f = github({ lenovo: 'offline', variable: 'kdmc-lenovo', runs: runsKO });
  const r = await basculerSecoursDepot(DEPOT, env(kv), NOW, f);
  assert.equal(r.action, 'retire'); assert.equal(f.variable(), null); assert.equal(kv.m.has('secours:lenovo:' + DEPOT), false);
});
test('secours : Lenovo en ligne depuis < 6 h → on garde ; ≥ 6 h → on retente GitHub (variable retirée)', async () => {
  const kv1 = kvMem(); await kv1.put('secours:lenovo:' + DEPOT, String(NOW - 2 * 3600000));
  const f1 = github({ lenovo: 'online', variable: 'kdmc-lenovo' });
  assert.equal((await basculerSecoursDepot(DEPOT, env(kv1), NOW, f1)).action, 'rien'); assert.equal(f1.variable(), 'kdmc-lenovo');
  const kv2 = kvMem(); await kv2.put('secours:lenovo:' + DEPOT, String(NOW - 7 * 3600000));
  const f2 = github({ lenovo: 'online', variable: 'kdmc-lenovo' });
  assert.equal((await basculerSecoursDepot(DEPOT, env(kv2), NOW, f2)).action, 'retire'); assert.equal(f2.variable(), null);
});
test('secours : une variable posée À LA MAIN par Kevin n\'est jamais touchée', async () => {
  const f = github({ lenovo: 'online', variable: 'ubuntu-22.04', runs: runsKO });
  const r = await basculerSecoursDepot(DEPOT, env(), NOW, f);
  assert.equal(r.action, 'rien'); assert.equal(f.variable(), 'ubuntu-22.04'); assert.ok(!f.appels.some((a) => /^(DELETE|POST)/.test(a)));
});
test('secours : jeton absent / GitHub refuse (portée) → rien, raison rendue, jamais d\'exception', async () => {
  assert.equal((await basculerSecoursDepot(DEPOT, {}, NOW, github({ lenovo: 'online' }))).raison, 'jeton absent');
  const r = await basculerSecoursDepot(DEPOT, env(), NOW, github({ lenovo: 'online', statutRunners: 403 }));
  assert.equal(r.action, 'rien'); assert.match(r.raison, /403/);
  const p = await basculerSecoursDepot(DEPOT, env(), NOW, github({ lenovo: 'online', runs: runsKO, statutPose: 403 }));
  assert.equal(p.action, 'rien'); assert.match(p.raison, /pose refusée/);
});
test('secours : githubHorsService = au moins 2 startup_failure parmi les robots des 12 dernières heures', () => {
  assert.equal(githubHorsService(runsKO, NOW), true); assert.equal(githubHorsService(runsOK, NOW), false);
  assert.equal(githubHorsService([{ conclusion: 'startup_failure', created_at: il(30) }, { conclusion: 'startup_failure', created_at: il(31) }], NOW), false);
  assert.equal(githubHorsService(null, NOW), false);
});
test('secours : jamais le dépôt PUBLIC (un runner y exécuterait le code de n\'importe quelle pull request sur le PC de Kevin)', () => {
  assert.deepEqual(SECOURS_DEPOTS, ['9r4rxssx64-creator/CMCteams']);
});
