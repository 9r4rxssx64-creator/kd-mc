/* GARDE — LE MAILLON QUI MANQUAIT : LE CODE DOIT ARRIVER AU DÉPÔT PUBLIC (26.09.2026)
 *
 * Ce que j'ai mesuré ce jour-là, et qui a rendu cette garde nécessaire :
 * la bascule de 17h36 a fait du dépôt PUBLIC le seul éditeur de la production (robot du
 * coffre mis en pause, variable PUBLICATION_PAR=public). Mais rien ne mettait à jour la
 * COPIE DU CODE du dépôt public : l'étape de dépôt de la bascule « refuse un dépôt déjà
 * rempli » — protection juste pour le premier envoi, piège ensuite.
 * Conséquence, mesurée sur le vrai domaine : kd-mc.com servait v1.0.33 quand main était en
 * v1.0.34 ; les 4 tuiles demandées par Kevin et EcoCraft absentes de la page SERVIE ; le
 * widget Javis à 69 857 o servis contre 72 270 o au dépôt. Ni cache ni propagation (la même
 * page avec un paramètre inédit rendait la même vieille version). Le site était GELÉ, et
 * aucune garde ne le disait.
 *
 * LA RÈGLE : tant que la production est publiée par le dépôt public, il doit exister un robot
 * qui pousse le code vérifié du coffre vers lui — et ce robot ne doit jamais pouvoir envoyer
 * sans contrôle, ni écraser le site avec un export tronqué.
 *
 * node tests/verify-sync-public.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows');
let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* 1. Le robot existe, et il pousse vraiment vers le dépôt public. */
const candidats = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f));
const pousseurs = candidats.filter((f) => {
  const t = readFileSync(join(WF, f), 'utf8');
  return /9r4rxssx64-creator\/kd-mc\.git/.test(t) && /git push/.test(t);
});
ok(pousseurs.length > 0,
  'aucun workflow ne POUSSE le code vers le dépôt public : depuis la bascule, il est le seul à publier — sans ce robot, sa copie du code reste figée et le site ne bouge plus (mesuré le 26.09 : v1.0.33 servie, v1.0.34 au dépôt)');

for (const f of pousseurs) {
  const t = readFileSync(join(WF, f), 'utf8');
  /* Les COMMENTAIRES ne comptent pas. Écrit d'abord sur le texte entier, ce contrôle est passé
     VERT sur un sabotage qui remplaçait l'appel au vérificateur par un echo : le nom
     « verifier.mjs » figure aussi dans l'en-tête explicatif. Une mention n'est pas un geste
     (même piège que la garde des tuiles, le même jour — leçon #335). */
  const code = t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const iVerif = code.search(/node +tools\/depot-public\/verifier\.mjs/);
  const iPush = code.search(/git push/);

  /* 2. Fail-CLOSED : on ne pousse JAMAIS sans que le vérificateur ait parlé, et il parle AVANT. */
  ok(iVerif >= 0, `${f} : ne LANCE pas « node tools/depot-public/verifier.mjs » — un envoi sans contrôle peut publier une donnée sensible`);
  ok(iVerif >= 0 && iPush >= 0 && iVerif < iPush, `${f} : le contrôle de sensibilité doit être LANCÉ avant l'envoi, pas après`);

  /* 3. Un export tronqué ne doit pas pouvoir effacer le site : il faut une COMPARAISON, pas le
        mot « plancher ». Sabotage qui a servi : bloc retiré → doit échouer. */
  ok(/-lt\s+"?\$\{?(mini|MINI|plancher)/.test(code) || /\[\s*"?\$\{?PRETS.*-lt/.test(code),
    `${f} : aucune comparaison de plancher — si l'export sort tronqué, rsync --delete effacerait le site publié`);
  ok(/rsync[^\n]*--delete/.test(code) ? /--exclude +'\.git\/'|--exclude +"\.git\/"/.test(code) : true,
    `${f} : rsync --delete sans exclure .git/ détruirait l'historique du dépôt public`);

  /* 4. Jamais de réécriture d'historique chez autrui. */
  ok(!/git push[^\n]*--force|push[^\n]*\+refs/.test(code), `${f} : un --force sur le dépôt public est interdit`);

  /* 5. UN SEUL ÉDITEUR de la production. Le robot doit lire PUBLICATION_PAR, et l'étape qui
        ENVOIE doit être conditionnée — peu importe la forme (condition de job, ou décision prise
        dans une étape « qui publie ? »). Écrit d'abord en exigeant la chaîne
        « vars.PUBLICATION_PAR == 'public' » au niveau du job : ça a refusé une version MEILLEURE,
        qui décide à l'intérieur pour pouvoir CRIER quand personne ne publie. Un garde doit
        exprimer la règle, pas une façon de l'écrire. */
  /* Et on exige la LECTURE de la variable — « vars.PUBLICATION_PAR » est la seule façon pour un
     workflow de la lire. Sabotage qui a servi : renommer cette expression laissait la garde VERTE,
     parce que le mot « PUBLICATION_PAR » reste dans un echo et dans le message d'erreur. */
  ok(/vars\.PUBLICATION_PAR/.test(code),
    `${f} : ne LIT pas vars.PUBLICATION_PAR — il ne peut pas savoir qui publie la production`);
  const blocs = t.split(/\n      - name:/);
  const blocPush = blocs.find((b) => /git push/.test(b)) || '';
  const jobConditionne = /if:[^\n]*PUBLICATION_PAR/.test(t);
  ok(jobConditionne || /\n +if:/.test(blocPush),
    `${f} : l'étape qui ENVOIE n'est conditionnée par rien — elle pousserait même quand le coffre publie encore, et deux éditeurs publieraient la même production`);

  /* 6. Réflexe ci-no-stampede : le groupe de concurrence porte la branche. */
  const grp = (t.match(/group:\s*([^\n]+)/) || [])[1] || '';
  ok(!/cancel-in-progress:\s*true/.test(t) || /github\.ref/.test(grp),
    `${f} : cancel-in-progress vrai sans \${{ github.ref }} dans le groupe → il annulerait le run d'une autre branche`);
}

/* 7. Ce que ce robot est le SEUL à pouvoir porter : les surfaces publiques du site.
      Si l'une d'elles devenait « privée », elle serait recopiée au moment de publier et ce
      robot ne serait plus indispensable pour elle — la liste doit donc être VÉRIFIÉE, pas
      supposée. */
const regles = JSON.parse(readFileSync(join(ROOT, 'tools/depot-public/regles.json'), 'utf8'));
const prive = (regles.prive_toujours || []).map(String);
const estPrive = (p) => prive.some((r) => p === r || p.startsWith(r) || r.startsWith(p + '/'));
for (const surface of ['kdmc-home/', 'shops/', 'javis/', 'lingua/', 'la-detente/']) {
  if (!existsSync(join(ROOT, surface))) continue;
  if (estPrive(surface)) { pass++; continue; }   /* recopiée depuis le coffre à la publication */
  ok(pousseurs.length > 0,
    `${surface} est PUBLIQUE (absente de prive_toujours) : elle ne peut atteindre kd-mc.com que par le robot de synchronisation — et il manque`);
}

console.log(`Synchronisation coffre → dépôt public : ${pass} vérifications OK, ${fails.length} échec(s)`);
if (pousseurs.length) console.log(`  (robot : ${pousseurs.join(', ')})`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
