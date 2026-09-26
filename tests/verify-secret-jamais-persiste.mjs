/* GARDE-FOU — un secret ne s'écrit JAMAIS sur le disque. Nulle part.
 * ===========================================================================
 * Origine : leçon #188 (1.09.2026, signalée par Kevin « c'est grave ce que tu
 * viens de faire »). Après avoir LU la règle qui l'interdit et l'avoir CITÉE,
 * j'ai enregistré un jeton GitLab compromis dans `.git/config`, de ma propre
 * initiative, pour du confort. Une règle écrite n'est pas une garde (leçon
 * #168) : voici la garde.
 *
 * Ce qu'elle refuse, mécaniquement :
 *   1. un jeton dans `.git/config` (URL de remote, insteadOf…) ;
 *   2. un assistant d'identifiants qui ÉCRIT sur le disque (`credential.helper
 *      store`) ou un `~/.git-credentials` existant ;
 *   3. un jeton vivant dans un fichier VERSIONNÉ (glpat-, ghp_, github_pat_,
 *      sk-ant-, AIza…) — les motifs de DÉTECTION (`glpat-[A-Za-z0-9_-]`) ne
 *      comptent pas : ils n'ont pas la forme d'un vrai jeton ;
 *   4. un script de publication qui persisterait le jeton au lieu de l'écrire
 *      dans l'URL au moment du push.
 *
 * La bonne méthode, elle, reste possible et n'est PAS bloquée : jeton lu dans
 * l'environnement, écrit dans l'URL au moment du push, sortie masquée, rien
 * derrière (tools/pipeline/pousser.sh).
 *
 * Lancer : node tests/verify-secret-jamais-persiste.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }).trim(); } catch { return ''; } };

/* Formes de jetons RÉELS. Le quantificateur {20,} est ce qui distingue un vrai
   jeton d'un motif de détection écrit en clair dans le code du coffre.
   TRIAGE fait le 3.09 sur les 3 alertes de la première exécution — les trois
   étaient FAUSSES, et voici pourquoi (pour ne pas les réintroduire) :
     · `https://x-access-token:${PAT}@github.com` (workflow clayscore) et
       `https://oauth2:<JETON>@gitlab.com` (SESSIONS-ET-BRANCHES.md) sont une
       VARIABLE et un ESPACE RÉSERVÉ, pas un secret → on n'alerte que si la
       partie identifiant ne contient AUCUN marqueur de substitution ;
     · `AIza…` dans firebase-auth-bridge est la clé Firebase **Web**, publique
       par conception (elle part dans le navigateur, CLAUDE.md le dit
       explicitement) → volontairement ABSENTE de cette liste. */
const PLACEHOLDER = /[${}<>*%]/;
const JETONS = [
  ['GitLab', /glpat-[A-Za-z0-9_-]{20,}/],
  ['GitHub (classique)', /ghp_[A-Za-z0-9]{30,}/],
  ['GitHub (fine-grained)', /github_pat_[A-Za-z0-9_]{50,}/],
  ['Anthropic', /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/],
  ['identifiants en clair dans une URL', {
    test: (t) => [...String(t).matchAll(/https:\/\/([^\s/@]{4,}:[^\s/@]{8,})@/g)]
      .some((m) => !PLACEHOLDER.test(m[1])),
  }],
];
/* Un jeton de DÉMONSTRATION n'est pas un secret : les tests de rédaction en
   contiennent forcément (« ghp_AbCdEfGhIjKl… », « sk-ant-api03-AbCdEfGh… »),
   et un `.env.example` aussi. On les écarte par la FORME du jeton, pas par le
   chemin du fichier : ainsi un VRAI jeton posé dans un fichier de test reste
   attrapé. Vérifié sur les 10 fichiers signalés le 3.09 : tous des factices. */
const FACTICE = (jeton) =>
  /AbCdEfGh|abcdefgh|ABCDEFGH|0123456789|fake|FAKE|example|EXAMPLE|dummy|placeholder/.test(jeton)
  /* 8 fois le même caractère d'affilée (« ghp_AAAAAAAA… ») : aucun vrai jeton
     n'a cette forme, alors que les fixtures de test en sont pleines */
  || /(.)\1{7,}/.test(jeton);
const cherche = (txt) => JETONS.filter(([nom, re]) => {
  if (typeof re.exec !== 'function') return re.test(txt);           /* règle URL */
  const m = String(txt).match(new RegExp(re.source, 'g')) || [];
  return m.some((jeton) => !FACTICE(jeton));
}).map(([n]) => n);

/* --- 1. .git/config ------------------------------------------------------- */
const gitDir = sh('git', ['rev-parse', '--git-dir']) || '.git';
const cfgPath = join(gitDir, 'config');
const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8') : '';
const dansConfig = cherche(cfg);
chk(dansConfig.length === 0,
  dansConfig.length === 0
    ? `${cfgPath} ne contient aucun jeton`
    : `${cfgPath} CONTIENT un secret (${dansConfig.join(', ')}) — c'est exactement la faute #188, à retirer TOUT DE SUITE`);

/* --- 2. assistant d'identifiants qui écrit sur le disque ------------------ */
const helper = sh('git', ['config', '--get', 'credential.helper']);
chk(!/store|^cache/.test(helper),
  helper
    ? (/store|^cache/.test(helper)
      ? `credential.helper = « ${helper} » : il ÉCRIT le jeton sur le disque — interdit`
      : `credential.helper = « ${helper} » (n'écrit rien de durable)`)
    : 'aucun assistant d\'identifiants configuré');

const gitCreds = join(process.env.HOME || '/root', '.git-credentials');
chk(!existsSync(gitCreds), existsSync(gitCreds)
  ? `${gitCreds} existe — c'est un fichier de jetons en clair, à supprimer`
  : '~/.git-credentials n\'existe pas');

/* --- 3. fichiers VERSIONNÉS ---------------------------------------------- */
const suivis = sh('git', ['ls-files']).split('\n').filter(Boolean);
const BINAIRE = /\.(png|jpg|jpeg|gif|webp|mp4|mp3|wav|pdf|zip|tgz|gz|woff2?|ico|otf|ttf)$/i;
/* on saute les sorties de construction : elles ne sont pas écrites à la main,
   et les lire coûtait ~15 s sur les 17 s de la première exécution */
const CONSTRUIT = /(^|\/)(chunks|dist|build)\/|\.min\.(js|css)$|\.map$/;
const coupables = [];
for (const f of suivis) {
  if (BINAIRE.test(f) || CONSTRUIT.test(f) || !existsSync(f)) continue;
  let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
  const trouve = cherche(t);
  if (trouve.length) coupables.push(`${f} (${trouve.join(', ')})`);
}
chk(coupables.length === 0,
  coupables.length === 0
    ? `aucun jeton vivant dans les ${suivis.length} fichiers versionnés`
    : `JETON VERSIONNÉ dans : ${coupables.slice(0, 5).join(' · ')}${coupables.length > 5 ? ` … +${coupables.length - 5}` : ''}`);

/* --- 4. le script de publication ne persiste rien ------------------------- */
const SCRIPT = 'tools/pipeline/pousser.sh';
if (existsSync(SCRIPT)) {
  /* on ne juge que le CODE : un commentaire qui explique « jamais de git remote
     add avec le jeton » ne doit évidemment pas déclencher l'alarme */
  const s = readFileSync(SCRIPT, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  chk(!/git\s+remote\s+(add|set-url)/.test(s),
    !/git\s+remote\s+(add|set-url)/.test(s)
      ? `${SCRIPT} n'enregistre aucun remote (donc aucun jeton dans .git/config)`
      : `${SCRIPT} enregistre un remote — le jeton finirait dans .git/config`);
  chk(/credential\.helper/.test(s) === false, `${SCRIPT} n'installe pas d'assistant d'identifiants`);
  chk(/sed/.test(s) && /\*\*\*/.test(s), `${SCRIPT} masque sa sortie (le jeton n'apparaît pas dans les journaux)`);
  chk(/GITLAB_TOKEN/.test(s) && !cherche(s).length, `${SCRIPT} lit le jeton dans l'environnement, il n'en contient aucun`);
} else {
  chk(false, `${SCRIPT} est absent — c'est lui la méthode sûre de publication`);
}

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
if (R.ko.length) console.log('Règle : ETAT-INFRA.md fait n°7 — un secret ne se persiste jamais, un secret arrivé par un canal non contrôlé est mort-né.');
process.exit(R.ko.length ? 1 : 0);
