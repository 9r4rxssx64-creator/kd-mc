/* RAPPEL AUTOMATIQUE À CHAQUE MESSAGE (Kevin 7.10.2026 : « Tu as un gros problème de mémoire ! Pourquoi et comment c'est possible
 * avec tout ce que l'on a fait pour parer à ça ?! »). Le crochet UserPromptSubmit doit :
 *   A. être BRANCHÉ dans .claude/settings.json (sinon rien ne tourne — c'est le sabotage) ;
 *   B. pour un message sur les départs, rappeler la règle de glissement continu ET la règle d'équité ;
 *   C. pour un message sur les CGU / l'inscription, rappeler la règle « inscription unique du domaine » ;
 *   D. répondre vite (< 2 s) ; un message vide → rien ; jamais d'erreur bloquante.
 * SABOTAGE=1 : crochet débranché → A rougit. node tests/verify-rappel-message.mjs */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const SAB = process.env.SABOTAGE === '1';
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + String(d).slice(0, 200) : ''}`); };
const reglages = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const branche = (reglages.hooks?.UserPromptSubmit || []).some((g) => (g.hooks || []).some((h) => /rappel-message\.sh/.test(h.command || '')));
ok(branche && !SAB, 'A. le rappel est branché sur CHAQUE message de Kevin (UserPromptSubmit)');
const lancer = (prompt) => { const t0 = Date.now(); let out = '';
  try { out = execFileSync('/bin/bash', ['.claude/hooks/rappel-message.sh'], { input: JSON.stringify({ prompt }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() }, timeout: 10000 }); } catch (e) { out = 'ERREUR ' + e.message; }
  let ctx = ''; try { ctx = out ? JSON.parse(out).hookSpecificOutput.additionalContext : ''; } catch { ctx = 'ILLISIBLE ' + out.slice(0, 80); }
  return { ctx, ms: Date.now() - t0 }; };
const d = lancer('Les départs ne sont pas bons, ma ligne ne bouge pas. Équilibrer bon et mauvais départ.');
/* 8.10 : la « rotation CONTINUE » a été REMPLACÉE le 7.10 au soir par la règle des SÉRIES (4235-2351-3514) — leçon #447 : le rappel doit servir la règle en vigueur */
ok(/RÈGLE DES DÉPARTS = LES SÉRIES/.test(d.ctx) && /Équité des départs/.test(d.ctx), 'B. message sur les départs : la règle des séries (en vigueur) et la règle d\'équité sont rappelées', d.ctx.slice(0, 160));
const c = lancer('Les CGU du domaine une seule fois pour chaque compte, inscription complète');
ok(/Inscription unique du domaine/.test(c.ctx), 'C. message sur les CGU / l\'inscription : la règle « inscription unique » est rappelée', c.ctx.slice(0, 160));
ok(d.ms < 2000 && c.ms < 2000, `D. rapide (${d.ms} ms, ${c.ms} ms)`);
ok(lancer('').ctx === '', 'D2. message vide : rien (jamais bloquant)');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
