#!/usr/bin/env node
/* ============================================================================
 * LE DÉPÔT EST PUBLIC — ALORS IL DOIT ÊTRE SAIN COMME UN DÉPÔT PUBLIC
 * ----------------------------------------------------------------------------
 * Kevin, 5.09.2026 : « Public mais sécurisé normalement. »
 *
 * « Public » ne veut pas dire « ouvert à tout » : ça veut dire que le CODE se
 * lit, pas que n'importe qui peut faire tourner nos clés. Les quatre risques
 * qui comptent vraiment sur un dépôt public, et qui sont vérifiés ici :
 *
 *  1. `pull_request_target` — le piège classique : ce déclencheur exécute le
 *     code d'un inconnu AVEC nos secrets et un jeton en écriture. Interdit.
 *
 *  2. Une action tierce épinglée sur une BRANCHE MOUVANTE (@main, @master,
 *     @latest) — c'est dire « exécute ce que ce dépôt tiers contiendra demain »
 *     avec nos secrets dans l'environnement. Trouvé le 5.09 : qodo-ai/pr-agent
 *     était en @main avec la clé OpenAI de Kevin. Épinglé depuis à une version.
 *
 *  3. Un workflow que N'IMPORTE QUI peut déclencher (commentaire, PR d'un
 *     inconnu) et qui dépense une clé PAYANTE, sans vérifier qui parle. Ce
 *     n'est pas une fuite de données : c'est une facture ouverte aux inconnus
 *     et un moyen de saturer les minutes. Trouvé le 5.09 sur la revue IA.
 *
 *  4. Une chaîne en FORME de secret qui n'était pas là avant. Le dépôt en
 *     contient déjà (des fausses clés de test, et la clé Firebase Web qui est
 *     PUBLIQUE par conception — elle est servie à chaque visiteur). On les
 *     connaît une par une ; toute NOUVELLE doit être regardée par un humain
 *     avant d'entrer. C'est un cliquet, pas un rouge permanent.
 *
 * Lancer : node tests/verify-depot-public-sain.mjs
 * ========================================================================== */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const WF = '.github/workflows';
let ko = 0;
const echec = (m) => { console.log(`❌ ${m}`); ko++; };
const ok = (m) => console.log(`✅ ${m}`);

const fichiers = existsSync(WF) ? readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)) : [];
const lire = (f) => readFileSync(join(WF, f), 'utf8');
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/* ── 1. pull_request_target ──────────────────────────────────────────────── */
const prTarget = fichiers.filter((f) => /^\s*pull_request_target:/m.test(sansCommentaires(lire(f))));
if (prTarget.length) {
  echec(`pull_request_target dans ${prTarget.join(', ')} — ce déclencheur fait tourner le code d'un inconnu avec nos secrets et un jeton en écriture. Sur un dépôt public, c'est la porte ouverte.`);
} else ok('aucun pull_request_target (le déclencheur qui exécute le code d\'un inconnu avec nos secrets)');

/* ── 2. actions tierces épinglées sur une branche mouvante ───────────────── */
const MOUVANT = /uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@(main|master|latest|HEAD)\s*$/gm;
const mouvantes = [];
for (const f of fichiers) {
  for (const m of sansCommentaires(lire(f)).matchAll(MOUVANT)) {
    if (/^(actions|github)\//.test(m[1])) continue;      // actions officielles GitHub
    mouvantes.push(`${f} → ${m[1]}@${m[2]}`);
  }
}
if (mouvantes.length) {
  echec(`action(s) tierce(s) épinglée(s) sur une branche mouvante : ${mouvantes.join(', ')}`
    + ' — c\'est exécuter ce que ce dépôt tiers contiendra demain, avec nos secrets. Épingle une version publiée.');
} else ok('aucune action tierce épinglée sur une branche mouvante (@main / @master / @latest)');

/* ── 3. dépense d'une clé payante déclenchable par un inconnu ────────────── */
const PAYANT = /secrets\.(OPEN_?AI_API_KEY|ANTHROPIC_API_KEY|AX_REPLICATE_KEY|GEMINI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|PERPLEXITI_API_KEY|XAI_API_KEY|TOGETHER_API_KEY|COHERE_API_KEY|DEEPSEEK_API_KEY|PRINTIFY_API_KEY)/;
const OUVERT = /^\s*(issue_comment|pull_request_review_comment|pull_request):/m;
const exposes = [];
for (const f of fichiers) {
  const t = sansCommentaires(lire(f));
  if (!OUVERT.test(t) || !PAYANT.test(t)) continue;
  if (!/author_association/.test(t)) exposes.push(f);
}
if (exposes.length) {
  echec(`${exposes.join(', ')} : déclenchable par un inconnu (commentaire ou PR) ET dépense une clé payante, sans vérifier qui parle.`
    + ' Ajoute un contrôle author_association (OWNER / MEMBER / COLLABORATOR).');
} else ok('aucune clé payante déclenchable par un inconnu sans contrôle de qui parle');

/* ── 4. cliquet sur les chaînes en forme de secret ───────────────────────── */
/* Ce qu'on connaît déjà — et pourquoi ce n'est pas un problème.
   La clé Firebase Web est PUBLIQUE par conception : elle est servie à chaque
   visiteur dans index.html, et l'accès est contrôlé par les règles Firebase,
   pas par elle. Tout le reste ci-dessous est une fausse clé de test. */
const CONNUES = new Set([
  'AIzaSyDciW-0sIIg9msdmgZjQHBksqzsfA6DCMs',   // clé Firebase WEB — publique par conception
  'AIzaSyB-cmcteams-public-web-key-placeho',
  'AIzaSyBcDeFgHiJkLmNoPqRsTuVwXyZ01234567',
  'AIzaSyOtherKeyBcDeFgHiJkLmNoPqRsTuVwXyZ',
  'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  'ghp_AbCdEfGhIjKlMnOpQrStUvWxYzABCDEFG123',
  'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  'glpat-AAAAAAAAAAAAAAAAAAAA',
  'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789ABCDE',
  'sk-ant-api03-AbcdefGhijklmnopqrstuv1234567890ABCDEFGH',
  'sk-ant-api03-FAKETESTKEYABCDEFGHIJKLMNOPQRSTUVWXYZ012',
  'sk-ant-api03-abcdef0123456789abcdef0123456789abcdef01',
  'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890ABCD',
]);
const MOTIF = 'glpat-[A-Za-z0-9_-]{20}|sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40}|ghp_[A-Za-z0-9]{36}'
  + '|github_pat_[A-Za-z0-9_]{60,}|xkeysib-[a-f0-9]{64}|AIza[A-Za-z0-9_-]{35}'
  + '|r8_[A-Za-z0-9]{37}|sk-proj-[A-Za-z0-9_-]{40}';
let trouvees = [];
try {
  const sortie = execSync(
    `git ls-files -z | xargs -0 grep -hoIE '${MOTIF}' 2>/dev/null | sort -u`,
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, shell: '/bin/bash' },
  );
  trouvees = sortie.split('\n').map((x) => x.trim()).filter(Boolean);
} catch { /* grep sans résultat sort en 1 : ce n'est pas une erreur */ }
const nouvelles = trouvees.filter((v) => !CONNUES.has(v));
if (nouvelles.length) {
  /* On n'affiche JAMAIS la valeur entière : un journal public n'est pas
     l'endroit où recopier une clé qui serait vraie. */
  const masque = (v) => v.slice(0, 12) + '…' + v.slice(-4);
  echec(`${nouvelles.length} chaîne(s) en forme de secret jamais vue(s) : ${nouvelles.map(masque).join(', ')}`
    + ' — le dépôt est PUBLIC : vérifie si c\'est une vraie clé (alors : la révoquer et la sortir d\'ici)'
    + ' ou une fausse de test (alors : l\'ajouter à la liste CONNUES de ce fichier, en disant pourquoi).');
} else ok(`aucune nouvelle chaîne en forme de secret (${trouvees.length} connues, toutes fausses sauf la clé Firebase Web qui est publique par conception)`);

/* ── Ce qu'on ne peut PAS vérifier d'ici, et il faut le dire ─────────────── */
console.log('');
console.log('Non couvert par ce garde, et assumé :');
console.log('  · l\'HISTORIQUE git (11 000+ commits) — c\'est le travail de gitleaks/TruffleHog');
console.log('    dans security-suite.yml, pas d\'un test local ;');
console.log('  · les réglages GitHub eux-mêmes (protection de branche, droits du jeton par');
console.log('    défaut) — ils vivent côté serveur, pas dans le dépôt.');

if (ko) {
  console.log(`\n${ko} problème(s). Sur un dépôt public, chacun se lit depuis n'importe où.`);
  process.exit(1);
}
console.log('Dépôt public, et sain. ✅');
