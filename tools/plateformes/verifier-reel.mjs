#!/usr/bin/env node
/* LE ROBOT « VÉRIFIER EN RÉEL » — UN SEUL LANCEUR POUR TOUTES LES COMPÉTENCES (Kevin 5.11.2026 : « Intègre toutes les compétences au robot pour faire
 * toutes les vérifications réelles qu'on lui demande »).
 *
 * Il lit le registre `competences-reel.mjs` (une ligne par vérification demandée par Kevin) et enchaîne les scripts choisis :
 *   node tools/plateformes/verifier-reel.mjs --liste                       (ce que le robot sait vérifier)
 *   node tools/plateformes/verifier-reel.mjs --verifs departs-equipes,liens
 *   node tools/plateformes/verifier-reel.mjs --verifs rapides | departs | toutes
 * Règles du lanceur (un journal de dépôt public se lit par tous) :
 *   - SANS_NOMS=1 est TOUJOURS posé ; en plus tout « NOM I » (nom de famille en capitales + initiale), e-mail, empreinte (≥ 32 caractères hexa) et
 *     « Bearer … » sont masqués dans ce que le lanceur imprime ;
 *   - chaque compétence a un délai maximal (`minutes`) : passé ce délai le lanceur la coupe et note ❌ (jamais un robot suspendu) ;
 *   - une compétence « coffre » (captures, ration d'Actions) n'est PAS lancée au dépôt public : elle est notée ⏭ avec la commande exacte ;
 *   - ESSAI_LOCAL=1 : seules les compétences qui savent tourner sans réseau (domaine simulé) sont lancées, les autres sont notées ⏭ ;
 *   - code de sortie : 0 tout vert · 1 au moins un ❌ · 2 compétence inconnue / rien à lancer. Lecture seule, jamais de cron.
 * Le détail de la règle : `.claude/rules/verifier-reel.md`. Garde : `npm run test:verifier-reel`. */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { COMPETENCES, GROUPES, trouver, nomWorkflow } from './competences-reel.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Masque ce qu'un journal public ne doit jamais porter. Volontairement large : mieux vaut masquer un mot de trop qu'un nom de collègue. */
export function masquer(txt) {
  return String(txt)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer …')
    .replace(/\b[0-9a-f]{32,}\b/gi, '…')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '…@…')
    .replace(/\b[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]{1,}(?: [A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]{1,})* [A-ZÀ-ÖØ-Þ]\b(?![\w.'’-])/g, 'NOM I');
}

/* « departs-equipes,liens » · « rapides » · « toutes » → liste d'identifiants (sans doublon, dans l'ordre du registre pour « toutes »). */
export function resoudre(demande) {
  const ids = []; const inconnus = [];
  for (const mot of String(demande || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (mot === 'toutes' || mot === 'tout') { for (const c of COMPETENCES) ids.push(c.id); continue; }
    if (GROUPES[mot]) { ids.push(...GROUPES[mot]); continue; }
    if (trouver(mot)) { ids.push(mot); continue; }
    inconnus.push(mot);
  }
  return { ids: [...new Set(ids)], inconnus };
}

export function lireArguments(argv) {
  const r = { liste: false, verifs: '', contexte: process.env.KDMC_LIEU || 'public' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--liste') r.liste = true;
    else if (a === '--verifs') r.verifs = argv[++i] || '';
    else if (a.startsWith('--verifs=')) r.verifs = a.slice(9);
    else if (a === '--contexte') r.contexte = argv[++i] || r.contexte;
    else if (a.startsWith('--contexte=')) r.contexte = a.slice(11);
  }
  return r;
}

export function commandeCoffre(c) {
  return `gh api -X POST repos/9r4rxssx64-creator/CMCteams/actions/workflows/${nomWorkflow(typeof c === 'string' ? { id: c } : c)}.yml/dispatches -f ref=main (après bash tools/ci/porte-ration.sh 5)`;
}

/* Lance UNE compétence ; rend { id, etat: 'ok'|'ko'|'saute', note, ok, ko, secondes }. `sortie` reçoit chaque ligne déjà masquée. */
export async function lancerUne(c, { contexte = 'public', essaiLocal = !!process.env.ESSAI_LOCAL, sortie = () => {}, racine = RACINE, envBase = process.env } = {}) {
  if (c.lieu === 'coffre' && contexte === 'public') {
    return { id: c.id, etat: 'saute', note: `dépôt privé (captures, ration) — ${commandeCoffre(c)}`, ok: 0, ko: 0, secondes: 0 };
  }
  if (essaiLocal && !c.essaiLocal) return { id: c.id, etat: 'saute', note: 'pas d\'essai local pour cette compétence (elle a besoin du vrai domaine)', ok: 0, ko: 0, secondes: 0 };
  const args = typeof c.args === 'function' ? await c.args() : (c.args || []);
  const env = { ...envBase, ...(c.env || {}), SANS_NOMS: '1' };
  if (essaiLocal) env.ESSAI_LOCAL = '1'; else delete env.ESSAI_LOCAL;
  const debut = Date.now();
  return await new Promise((fin) => {
    const enfant = spawn(process.execPath, [c.script, ...args], { cwd: racine, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let ok = 0, ko = 0, reste = '', coupe = false;
    const ligne = (l) => { if (/✅|^\s*✓/.test(l)) ok++; if (/❌|^\s*✗/.test(l)) ko++; sortie(masquer(l)); };
    const lire = (flux) => flux.on('data', (d) => { reste += d.toString(); const ls = reste.split('\n'); reste = ls.pop(); ls.forEach(ligne); });
    lire(enfant.stdout); lire(enfant.stderr);
    const delai = setTimeout(() => { coupe = true; enfant.kill('SIGKILL'); }, (c.minutes || 20) * 60000);
    enfant.on('close', (code) => {
      clearTimeout(delai); if (reste) ligne(reste);
      const secondes = Math.round((Date.now() - debut) / 1000);
      if (coupe) return fin({ id: c.id, etat: 'ko', note: `coupé après ${c.minutes} min (délai maximal)`, ok, ko: ko + 1, secondes });
      fin({ id: c.id, etat: code === 0 ? 'ok' : 'ko', note: code === 0 ? '' : `code de sortie ${code}`, ok, ko, secondes });
    });
    enfant.on('error', (e) => fin({ id: c.id, etat: 'ko', note: 'lancement impossible : ' + masquer(e.message), ok, ko: ko + 1, secondes: 0 }));
  });
}

export function afficherListe(ecrire = console.log) {
  ecrire('Compétences du robot « vérifier en réel » (' + COMPETENCES.length + ') :');
  for (const c of COMPETENCES) ecrire(`  ${c.id.padEnd(16)} ${c.lieu === 'public' ? 'public' : 'coffre'}  ${c.titre}`);
  ecrire('Groupes : ' + Object.entries(GROUPES).map(([g, v]) => `${g} = ${v.join('+')}`).join(' · ') + ' · toutes');
}

async function principal() {
  const a = lireArguments(process.argv.slice(2));
  if (a.liste) { afficherListe(); return 0; }
  const { ids, inconnus } = resoudre(a.verifs || 'departs');
  if (inconnus.length) { console.error('Compétence inconnue : ' + inconnus.join(', ') + ' — voir --liste'); return 2; }
  if (!ids.length) { console.error('Rien à vérifier — voir --liste'); return 2; }
  const resultats = [];
  for (const id of ids) {
    const c = trouver(id);
    console.log(`\n══ ${c.id} — ${c.titre}\n   (demandé : ${c.demande})`);
    const r = await lancerUne(c, { contexte: a.contexte, sortie: (l) => console.log(l) });
    resultats.push(r);
    const pastille = r.etat === 'ok' ? '✅' : r.etat === 'ko' ? '❌' : '⏭';
    const phrase = `${pastille} ${c.id} · ${r.ok} points verts · ${r.ko} rouges · ${r.secondes} s${r.note ? ' · ' + r.note : ''}`;
    console.log(phrase);
    console.log(`::${r.etat === 'ko' ? 'error' : 'notice'} title=Réel ${c.id}::${phrase.replace(/%/g, '%25').replace(/\n/g, ' ')}`);
  }
  const bilan = resultats.map((r) => `${r.etat === 'ok' ? '✅' : r.etat === 'ko' ? '❌' : '⏭'} ${r.id}`).join('\n');
  console.log('\n═══ BILAN\n' + bilan);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Vérifier en réel\n\n' + resultats.map((r) => `- ${r.etat === 'ok' ? '✅' : r.etat === 'ko' ? '❌' : '⏭'} **${r.id}** — ${r.ok} verts, ${r.ko} rouges, ${r.secondes} s${r.note ? ' — ' + r.note : ''}`).join('\n') + '\n'); } catch { /* le résumé est un confort */ }
  }
  return resultats.some((r) => r.etat === 'ko') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then((code) => process.exit(code), (e) => { console.error('Le lanceur a échoué : ' + masquer(e && e.message)); process.exit(1); });
}
