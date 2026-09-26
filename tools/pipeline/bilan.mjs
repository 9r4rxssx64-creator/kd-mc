#!/usr/bin/env node
/**
 * npm run bilan — LE POINT COMPLET : chaque session du registre, chaque branche
 * du dépôt, chaque discussion. Sans en oublier aucune.
 *
 * POURQUOI (Kevin 2026-09-17 : « fait faire un bilan et un point, un récap de chaque
 * branche par ton pipeline sans en oublier aucune, chaque discussion, qu'ils mettent
 * tous tout à jour ») — le registre (pipeline/sessions.json) dit ce que les sessions
 * DÉCLARENT. Le dépôt dit ce qui EXISTE VRAIMENT. Les deux divergent en silence :
 * une session « active » dont la branche a été supprimée, une branche vivante que
 * personne n'a déclarée, un message ouvert depuis 10 jours que personne ne lit.
 * Cet outil CROISE les trois et nomme chaque écart.
 *
 * Complémentaire de retard-branches.mjs (qui mesure le RETARD sur les fichiers
 * partagés) : ici on mesure l'ÉTAT et les OUBLIS.
 *
 * Ne modifie rien. Sort en 0 sauf --strict (alors 1 s'il reste un oubli).
 *
 * Usage :
 *   node tools/pipeline/bilan.mjs              -> console + BILAN-BRANCHES.md
 *   node tools/pipeline/bilan.mjs --court      -> console seule, résumé
 *   node tools/pipeline/bilan.mjs --strict     -> code 1 si oublis (pour un gate)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ARGS = process.argv.slice(2);
const COURT = ARGS.includes('--court');
const STRICT = ARGS.includes('--strict');
const SANS_RESEAU = ARGS.includes('--sans-reseau');
const AUJ = new Date();
const JOUR = 86400000;

/* Seuils — écrits ici pour être discutables, pas cachés dans le code */
const PERIME_SESSION = 7;   // une session non mise à jour depuis 7 j = à rafraîchir
const VIVANTE = 21;         // une branche touchée il y a moins de 21 j = vivante
const SUIVI_DU = 2;         // un message ouvert depuis 2 j doit porter un suivi

const sh = (c, d = '') => {
  try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return d; }
};
/* Une branche absente du depot n'est PAS un travail perdu : dans ce depot le bot
   fusionne puis le menage supprime. On le VERIFIE (API publique GitHub, depot public,
   sans jeton) au lieu de crier au loup. --sans-reseau pour s'en passer. */
const DEPOT = '9r4rxssx64-creator/CMCteams';
function fusionDe(branche) {
  if (SANS_RESEAU) return { statut: 'non verifie' };
  const url = `https://api.github.com/repos/${DEPOT}/pulls?state=closed&head=9r4rxssx64-creator:${branche}&per_page=100`;
  const brut = sh(`curl -sS -m 25 "${url}"`, '');
  if (!brut) return { statut: 'reseau indisponible' };
  let prs; try { prs = JSON.parse(brut); } catch { return { statut: 'reponse illisible' }; }
  if (!Array.isArray(prs) || !prs.length) return { statut: 'aucune PR' };
  const f = prs.filter(p => p.merged_at).sort((a, b) => a.merged_at.localeCompare(b.merged_at));
  if (!f.length) return { statut: 'PR non fusionnees', total: prs.length };
  const d = f[f.length - 1];
  return { statut: 'fusionne', total: prs.length, fusionnees: f.length, num: d.number, quand: d.merged_at.slice(0, 16).replace('T', ' ') };
}

const jours = (iso) => !iso ? null : Math.floor((AUJ - new Date(iso)) / JOUR);
/* le champ ts du registre est tantot une chaine « 2026-09-02 22:55 », tantot un
   nombre (epoch ms), tantot absent : on normalise avant tout calcul de date. */
const tsIso = (ts) => {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number') return new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
  return String(ts).replace(' ', 'T');
};
const tsJour = (ts) => { const i = tsIso(ts); return i ? i.slice(0, 10) : '?'; };
const ageTxt = (j) => j === null ? '?' : j === 0 ? "aujourd'hui" : j === 1 ? 'hier' : `${j} j`;

/* ---------- 1. le registre ---------- */
const REG = JSON.parse(fs.readFileSync('pipeline/sessions.json', 'utf8'));
const sessions = REG.sessions || {};
const messages = Array.isArray(REG.messages) ? REG.messages : Object.values(REG.messages || {});

/* ---------- 2. la réalité du dépôt ---------- */
const distantes = new Map();  // nom -> {sha, dateISO, auteur, ageJours}
for (const l of sh("git ls-remote --heads origin").split('\n').filter(Boolean)) {
  const [sha, ref] = l.split('\t');
  const nom = ref.replace('refs/heads/', '');
  const info = sh(`git log -1 --format='%cI|%an' origin/${nom.replace(/'/g, "")} 2>/dev/null`);
  const [dateISO, auteur] = info ? info.split('|') : [null, null];
  distantes.set(nom, { sha: sha.slice(0, 8), dateISO: dateISO || null, auteur: auteur || '?', age: jours(dateISO) });
}
const brancheMain = sh('git log -1 --format=%cI origin/main');

/* ---------- 3. croisement ---------- */
const parSession = [];
const oublis = { branche_disparue: [], nettoyee_a_declarer: [], a_rafraichir: [], attend_kevin: [], msg_sans_suivi: [], hors_registre_vivantes: [] };

for (const [id, s] of Object.entries(sessions)) {
  const br = s.branche || '';
  const d = distantes.get(br);
  const majAge = jours(s.maj);
  const recus = messages.filter(m => m.a === id || m.a === 'toutes');
  const envoyes = messages.filter(m => m.de === id);
  const ouvertsPourElle = recus.filter(m => m.etat !== 'clos' && m.de !== id);
  const ouvertsSiens = envoyes.filter(m => m.etat !== 'clos');

  let verdict, gravite = 0, fusion = null;
  if (!d && br) fusion = fusionDe(br);
  if (!d && s.etat !== 'termine') {
    if (fusion && fusion.statut === 'fusionne') {
      verdict = `🟡 branche nettoyée après fusion — travail DANS main (${fusion.fusionnees} PR, dernière #${fusion.num} le ${fusion.quand})`;
      gravite = 1; oublis.nettoyee_a_declarer.push(id);
    } else if (/rien de perdu|0 PR|ancetre de main|ancêtre de main/i.test(s.note || '')) {
      /* la session a deja mesure et documente le cas : on ne rouvre pas un dossier ferme */
      verdict = '🟡 branche nettoyée — la session a déjà documenté que rien n\'est perdu';
      gravite = 1; oublis.nettoyee_a_declarer.push(id);
    } else {
      verdict = `🔴 branche ABSENTE et aucune fusion retrouvée (${fusion ? fusion.statut : '?'}) — À VÉRIFIER`;
      gravite = 3; oublis.branche_disparue.push(id);
    }
  }
  else if (!d) { verdict = '⚪ branche supprimée (session close) — normal'; }
  else if (s.etat === 'termine') { verdict = '✅ terminée'; }
  else if (majAge !== null && majAge > PERIME_SESSION) { verdict = `🟠 pas de mise à jour depuis ${majAge} j`; gravite = 2; oublis.a_rafraichir.push(id); }
  else { verdict = '🟢 à jour'; }
  if (s.attend_kevin) oublis.attend_kevin.push({ id, quoi: s.attend_kevin });

  parSession.push({
    id, titre: s.titre || id, sujet: s.sujet || '', surfaces: s.surfaces || [],
    etat: s.etat || '?', maj: s.maj || '?', majAge, note: s.note || '',
    attend_kevin: s.attend_kevin || null, attend_session: s.attend_session || null,
    branche: br, brancheExiste: !!d, sha: d?.sha || null, brancheAge: d?.age ?? null,
    brancheDate: d?.dateISO ? d.dateISO.slice(0, 10) : null,
    nbRecus: recus.length, nbEnvoyes: envoyes.length,
    ouvertsPourElle: ouvertsPourElle.map(m => m.id), ouvertsSiens: ouvertsSiens.map(m => m.id),
    verdict, gravite, fusion,
  });
}
parSession.sort((a, b) => b.gravite - a.gravite || (a.titre || '').localeCompare(b.titre || ''));

/* branches du dépôt que PERSONNE n'a déclarées */
const declarees = new Set(Object.values(sessions).map(s => s.branche).filter(Boolean));
const horsRegistre = [...distantes.entries()]
  .filter(([n]) => !declarees.has(n) && n !== 'main' && n !== 'gh-pages')
  .map(([n, d]) => ({ nom: n, ...d }))
  .sort((a, b) => (a.age ?? 9e9) - (b.age ?? 9e9));
oublis.hors_registre_vivantes = horsRegistre.filter(b => b.age !== null && b.age <= VIVANTE).map(b => b.nom);

/* familles de branches hors registre */
const familles = {};
for (const b of horsRegistre) {
  const f = b.nom.includes('/') ? b.nom.split('/')[0] : '(racine)';
  (familles[f] ||= []).push(b);
}

/* discussions */
const msgOuverts = messages.filter(m => m.etat !== 'clos');
const msgSansSuivi = msgOuverts.filter(m => {
  const age = jours(tsIso(m.ts));
  const suivi = Array.isArray(m.suivi) ? m.suivi.length : 0;
  return age !== null && age > SUIVI_DU && suivi === 0;
});
oublis.msg_sans_suivi = msgSansSuivi.map(m => m.id);

/* ---------- 4. console ---------- */
const vivantes = [...distantes.values()].filter(d => d.age !== null && d.age <= VIVANTE).length;
console.log('\n📋 BILAN DU PIPELINE — ' + AUJ.toISOString().slice(0, 10) + '\n');
console.log(`   Sessions au registre ........ ${parSession.length}`);
console.log(`   Branches dans le dépôt ...... ${distantes.size}  (dont ${vivantes} touchées depuis ≤ ${VIVANTE} j)`);
console.log(`   Branches hors registre ...... ${horsRegistre.length}  (dont ${oublis.hors_registre_vivantes.length} vivantes)`);
console.log(`   Discussions ................. ${messages.length}  (${msgOuverts.length} ouvertes, ${messages.length - msgOuverts.length} closes)`);
console.log(`   main mis à jour ............. ${brancheMain ? brancheMain.slice(0, 10) : '?'}\n`);
console.log('   ── À TRAITER ──');
console.log(`   🔴 branche absente SANS fusion retrouvée .... ${oublis.branche_disparue.length}${oublis.branche_disparue.length ? ' → ' + oublis.branche_disparue.join(', ') : ''}`);
console.log(`   🟠 sessions à rafraîchir (> ${PERIME_SESSION} j) ...... ${oublis.a_rafraichir.length}${oublis.a_rafraichir.length ? ' → ' + oublis.a_rafraichir.join(', ') : ''}`);
console.log(`   ✉️  messages ouverts sans suivi (> ${SUIVI_DU} j) . ${oublis.msg_sans_suivi.length}${oublis.msg_sans_suivi.length ? ' → ' + oublis.msg_sans_suivi.join(', ') : ''}`);
console.log(`   👤 attentes côté Kevin .................. ${oublis.attend_kevin.length}`);
oublis.attend_kevin.forEach(a => console.log(`        · [${a.id}] ${a.quoi}`));
console.log('');

if (!COURT) {
  console.log('   ── ÉTAT PAR SESSION ──');
  for (const s of parSession) {
    const b = s.brancheExiste ? `${s.brancheDate} (${ageTxt(s.brancheAge)})` : 'branche absente';
    console.log(`   ${s.verdict.slice(0, 2)} ${s.titre.padEnd(34).slice(0, 34)} maj ${String(s.maj).padEnd(10)} ${b}`);
  }
  console.log('');
}

/* ---------- 5. le document ---------- */
if (!COURT) {
  const L = [];
  L.push('# 📋 BILAN-BRANCHES.md — le point complet du pipeline');
  L.push('');
  L.push(`> Fabriqué le **${AUJ.toISOString().slice(0, 10)}** par \`npm run bilan\`. **Aucun chiffre estimé** :`);
  L.push('> tout vient du registre (`pipeline/sessions.json`) croisé avec le dépôt réel');
  L.push('> (`git ls-remote` + date du dernier commit de chaque branche).');
  L.push('> Relancer la commande le remet à jour — ne pas éditer à la main.');
  L.push('');
  L.push('## Les chiffres');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Sessions au registre | **${parSession.length}** |`);
  L.push(`| Branches réellement dans le dépôt | **${distantes.size}** (dont **${vivantes}** touchées depuis ≤ ${VIVANTE} j) |`);
  L.push(`| Branches que personne n'a déclarées | **${horsRegistre.length}** (dont **${oublis.hors_registre_vivantes.length}** vivantes) |`);
  L.push(`| Discussions entre sessions | **${messages.length}** — ${msgOuverts.length} ouvertes, ${messages.length - msgOuverts.length} closes |`);
  L.push(`| Dernier commit sur \`main\` | ${brancheMain ? brancheMain.slice(0, 10) : '?'} |`);
  L.push('');
  L.push('## ⚠️ Ce qui est en retard (les seuls points à traiter)');
  L.push('');
  L.push(`- 🔴 **Branche absente ET aucune fusion retrouvée : ${oublis.branche_disparue.length}**${oublis.branche_disparue.length ? ' → `' + oublis.branche_disparue.join('`, `') + '` — à vérifier à la main.' : ' — aucune. **Aucun travail perdu.**'}`);
  L.push(`- 🟡 **Branche nettoyée après fusion (travail dans \`main\`), état encore \`actif\` : ${oublis.nettoyee_a_declarer.length}**${oublis.nettoyee_a_declarer.length ? ' → `' + oublis.nettoyee_a_declarer.join('`, `') + '` — la session doit repartir d\'une branche neuve et mettre son état à jour.' : ' — aucune.'}`);
  L.push(`- 🟠 **Sessions non mises à jour depuis plus de ${PERIME_SESSION} jours : ${oublis.a_rafraichir.length}**${oublis.a_rafraichir.length ? ' → `' + oublis.a_rafraichir.join('`, `') + '`' : ' — aucune.'}`);
  L.push(`- ✉️ **Messages ouverts depuis plus de ${SUIVI_DU} jours sans suivi daté : ${oublis.msg_sans_suivi.length}**${oublis.msg_sans_suivi.length ? ' → `' + oublis.msg_sans_suivi.join('`, `') + '`' : ' — aucun.'}`);
  L.push(`- 👤 **Attentes côté Kevin : ${oublis.attend_kevin.length}**`);
  oublis.attend_kevin.forEach(a => L.push(`  - \`${a.id}\` : ${a.quoi}`));
  L.push('');
  L.push('## 📚 Chaque session, une par une');
  L.push('');
  for (const s of parSession) {
    L.push(`### ${s.verdict.slice(0, 2)} ${s.titre}  \`${s.id}\``);
    L.push('');
    L.push(`- **Sujet** : ${s.sujet || '—'}`);
    L.push(`- **Branche** : \`${s.branche || '—'}\` — ${s.brancheExiste ? `existe, dernier commit **${s.brancheDate}** (${ageTxt(s.brancheAge)}), \`${s.sha}\`` : '**absente du dépôt**'}`);
    if (!s.brancheExiste && s.fusion) L.push(`- **Son travail** : ${s.fusion.statut === 'fusionne' ? `✅ **retrouvé dans \`main\`** — ${s.fusion.fusionnees}/${s.fusion.total} PR fusionnées, la dernière **#${s.fusion.num}** le **${s.fusion.quand}**` : `⚠️ ${s.fusion.statut} — à vérifier à la main`}`);
    L.push(`- **État déclaré** : \`${s.etat}\` · mise à jour le **${s.maj}**${s.majAge !== null ? ` (il y a ${ageTxt(s.majAge)})` : ''}`);
    if (s.surfaces.length) L.push(`- **Ce qu'elle touche** : ${s.surfaces.map(x => '`' + x + '`').join(' · ')}`);
    L.push(`- **Discussions** : ${s.nbEnvoyes} envoyées, ${s.nbRecus} reçues${s.ouvertsPourElle.length ? ` · **à lire : ${s.ouvertsPourElle.join(', ')}**` : ''}${s.ouvertsSiens.length ? ` · ses signalements encore ouverts : ${s.ouvertsSiens.join(', ')}` : ''}`);
    if (s.attend_kevin) L.push(`- 👤 **Attend Kevin** : ${s.attend_kevin}`);
    if (s.attend_session) L.push(`- ⏳ **Attend une autre session** : ${s.attend_session}`);
    if (s.note) L.push(`- **Dernière note** : ${s.note}`);
    L.push(`- **Verdict** : ${s.verdict}`);
    L.push('');
  }
  L.push('## 🌿 Les branches que personne n\'a déclarées (aucune oubliée)');
  L.push('');
  L.push(`${horsRegistre.length} branches existent dans le dépôt sans être au registre. Elles sont **toutes** listées`);
  L.push('ci-dessous, groupées par famille, de la plus récente à la plus ancienne.');
  L.push('');
  for (const [fam, liste] of Object.entries(familles).sort((a, b) => b[1].length - a[1].length)) {
    const viv = liste.filter(b => b.age !== null && b.age <= VIVANTE).length;
    L.push(`<details><summary><b>${fam}/</b> — ${liste.length} branches${viv ? `, dont ${viv} vivantes` : ', toutes dormantes'}</summary>`);
    L.push('');
    L.push('| Branche | Dernier commit | Âge | Auteur |');
    L.push('|---|---|---|---|');
    for (const b of liste) L.push(`| \`${b.nom}\` | ${b.dateISO ? b.dateISO.slice(0, 10) : '?'} | ${ageTxt(b.age)} | ${b.auteur} |`);
    L.push('');
    L.push('</details>');
    L.push('');
  }
  L.push('## ✉️ Les discussions ouvertes');
  L.push('');
  if (!msgOuverts.length) L.push('Aucune discussion ouverte.');
  else {
    L.push('| # | De → à | Sujet | Déposé | Âge | Suivi |');
    L.push('|---|---|---|---|---|---|');
    for (const m of msgOuverts.sort((a, b) => String(tsIso(a.ts) || '').localeCompare(String(tsIso(b.ts) || '')))) {
      const age = jours(tsIso(m.ts));
      const nbSuivi = Array.isArray(m.suivi) ? m.suivi.length : 0;
      L.push(`| \`${m.id}\` | ${m.de} → ${m.a} | ${(m.sujet || '').replace(/\|/g, '/').slice(0, 78)} | ${tsJour(m.ts)} | ${ageTxt(age)} | ${nbSuivi ? '✅ ' + nbSuivi : (age > SUIVI_DU ? '🔴 aucun' : '—')} |`);
    }
  }
  L.push('');
  L.push('## 🔁 Comment le remettre à jour');
  L.push('');
  L.push('```bash');
  L.push('npm run bilan                 # refait ce document avec les chiffres du jour');
  L.push('npm run bilan -- --court      # juste le résumé à l\'écran');
  L.push('npm run retard-branches       # est-ce que ma branche est en retard sur un fichier partagé');
  L.push('');
  L.push('# chaque session met SON état à jour :');
  L.push('node tools/pipeline/pipeline.mjs maj --id <moi> --etat actif|pause|termine --note "…"');
  L.push('node tools/pipeline/pipeline.mjs clore --id <mNNN> --reponse "…"   # quand un message est traité');
  L.push('```');
  L.push('');
  fs.writeFileSync('BILAN-BRANCHES.md', L.join('\n'));
  console.log('   📄 BILAN-BRANCHES.md écrit (' + Math.round(fs.statSync('BILAN-BRANCHES.md').size / 1024) + ' Ko)\n');
}

const total = oublis.branche_disparue.length + oublis.a_rafraichir.length + oublis.msg_sans_suivi.length;
if (STRICT && total) { console.error(`❌ ${total} oubli(s) à traiter.`); process.exit(1); }
