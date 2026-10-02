/* GARDE — retirer les comptes robots ne peut JAMAIS toucher une personne ni Kevin, et la sonde de
 * déploiement ne recrée plus de fiche (Kevin 2.10 : « Chacun 1 seul compte »).
 * node tests/verify-comptes-nettoyer.mjs */
import { plan } from '../tools/audit/comptes-nettoyer-robots.mjs';
import mod from '../services/kdmc-router/worker.js';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };
const F = [{ uid: 'ci_smoke', name: 'CI Smoke' }, { uid: 'kdmc_admin', name: 'kevin Desarzens' }, { uid: 'u1', name: 'Marie Dupont' }, { uid: 'test-user', name: 'Test User' }];
let p = plan(F, ['ci_smoke', 'test-user']);
dit(p.refus.length === 0 && p.aRetirer.length === 2, 'deux robots demandés → deux retirés');
p = plan(F, ['ci_smoke', 'kdmc_admin']);
dit(p.refus.some((r) => /Kevin/.test(r)), 'le compte de Kevin est REFUSÉ');
p = plan(F, ['u1']);
dit(p.refus.length === 1 && p.aRetirer.length === 0, 'une vraie personne est refusée');
p = plan(F, ['inconnu']);
dit(p.refus.length === 1, 'un uid inconnu est refusé (rien n\'est deviné)');
const src = readFileSync(new URL('../tools/audit/comptes-nettoyer-robots.mjs', import.meta.url), 'utf8');
dit(/if \(p\.refus\.length\)[^\n]*process\.exit\(1\)/.test(src), 'un seul refus ARRÊTE tout le nettoyage');
dit(src.indexOf("ecrire('corbeille:comptes:") > 0 && src.indexOf("ecrire('corbeille:comptes:") < src.indexOf("effacer('acc:"), 'sauvegarde AVANT toute suppression');
dit(/if \(!appliquer\)[^\n]*process\.exit\(0\)/.test(src), 'essai à blanc par défaut');
/* La sonde de déploiement (uid ci_smoke) n'écrit plus de fiche. */
let puts = []; const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', ACCOUNTS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { puts.push(k); kv.set(k, v); }, delete: async () => {} } };
const ctx = { waitUntil() {} };
const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: 'ci_smoke', name: 'CI Smoke', cgu: true }) }), env, ctx);
const j = await r.json();
dit(j.ok && typeof j.token === 'string', 'la sonde reçoit toujours sa session (la chaîne SSO reste testée)');
dit(!puts.some((k) => k === 'acc:ci_smoke' || k === 'idx:uids'), `aucune fiche « CI Smoke » écrite (${puts.filter((k) => /acc:|idx:/.test(k)).join(', ') || 'rien'})`);
const w = await mod.fetch(new Request('https://apex-chat.kd-mc.com/__sso/whoami', { headers: { authorization: 'Bearer ' + j.token } }), env, ctx);
const wj = await w.json().catch(() => ({}));
dit(wj.ok && wj.uid === 'ci_smoke', `whoami reconnaît toujours la sonde (contrôle du déploiement intact) — ${JSON.stringify(wj).slice(0, 80)}`);
console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
