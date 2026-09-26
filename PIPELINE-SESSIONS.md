# 🔗 PIPELINE ENTRE SESSIONS — ne rien oublier, ne rien perdre, ne rien délier

> Kevin 2026-09-02 : *« Sois sûr de ne rien oublier, lier ou perdre de chaque session.
> Et le pipeline entre elles toutes et les futures. Le domaine et divers aussi. »*
>
> À lire au démarrage, avec `ETAT-INFRA.md` (les 16 faits) et `SESSIONS-ET-BRANCHES.md` (la carte).

## Pourquoi ce pipeline existe

L'ancien pont — `claude-todo-watcher`, qui interrogeait Firebase en boucle depuis GitHub
Actions — est **mort avec la suspension GitHub**. C'est même lui qui l'a provoquée. Trois
règles absolues de Kevin (auto-test/auto-fix, pipeline self-healing, pipeline autonomie
cross-projet) se sont retrouvées **sans aucune garde**.

Ce qui le remplace ne dépend d'aucun service, d'aucun secret, d'aucun hébergement :
**un registre et une boîte aux lettres DANS le dépôt**, sur `main` GitLab — la seule
surface que **toutes** les sessions voient, présentes et futures. Git fait le reste :
rien ne se perd, tout est daté, tout est réversible.

## Les trois gestes — c'est tout

```bash
# 1. AU DÉMARRAGE — qui travaille sur quoi, et ai-je du courrier ?
node tools/pipeline/pipeline.mjs etat --id <moi>

# 2. POUR PARLER À UNE AUTRE SESSION (ou à toutes)
node tools/pipeline/pipeline.mjs message --de <moi> --a <lui|toutes> \
     --sujet "…" --corps "…"

# 3. AVANT DE FINIR — laisser l'état pour la suivante
node tools/pipeline/pipeline.mjs maj --id <moi> --note "…" \
     [--attend-kevin "ce que j'attends de lui"] [--etat actif|pause|termine]
```

Puis **commite `pipeline/sessions.json` et pousse sur TA branche**. La session
« Domain Kdmc » reporte sur `main` — ou n'importe laquelle, en cherry-pick.

## Une session FUTURE s'inscrit elle-même

Rien à préparer pour elle. Elle se déclare, et elle est reliée à tout le monde :

```bash
node tools/pipeline/pipeline.mjs enregistrer --id <slug> --titre "…" \
     --branche "claude/…" --sujet "…" --surfaces "dossier1,dossier2"
```

L'outil **refuse** une branche déjà prise par une autre session — deux sessions sur la
même branche s'écrasent l'une l'autre, c'est la première façon de perdre du travail.

## Ce que le garde automatique empêche

`npm run test:pipeline-sessions` (câblé dans `test:ci`) relie le registre et la carte, et
**échoue** si :

- une session de `SESSIONS-ET-BRANCHES.md` **n'est pas au registre** → elle travaillerait
  dans son coin, sur une branche que personne ne connaît, et son travail disparaîtrait
  avec son conteneur ;
- une session du registre **manque à la carte** ;
- **deux sessions partagent une branche** ;
- un message est adressé à une session qui n'existe pas ;
- une session n'a ni titre, ni branche, ni sujet.

*Prouvé discriminant* : retirer « cuisine » du registre → **FAIL** ; donner à « divers » la
branche de « cuisine » → **FAIL** ; restauré → 8/0.

## Pousser sur GitLab sans se faire réclamer un push déjà fait

> **⚠️ Depuis le 4.09.2026 16h34 UTC, GitHub est ROUVERT** (fait n°10 d'`ETAT-INFRA.md`) :
> `origin` désigne GitHub et c'est le bon dépôt — on pousse là, normalement. Ce paragraphe
> ne sert QUE si GitHub retombe ; il est gardé pour ça.

Pendant la suspension (15.08 → 4.09), `origin` continuait de désigner un dépôt **figé** :
le contrôle de fin de tour comparait le travail à cet état gelé et réclamait en boucle un
push **déjà fait**.

⚠️ **Renommer les remotes ne sert à rien** — mesuré le 3.09 : le harnais remet `origin` sur
GitHub à chaque reprise de session (`.git/config` réécrit). N'essaie pas, ça ne tient pas.

Ce qui tient, c'est **le script** : il vise GitLab par une adresse écrite en dur (il se moque
de ce que dit `origin`) et remet à jour le repère local `origin/<ta branche>` — le seul
chose que lit le contrôle de fin de tour. Jamais de `git remote add` contenant le jeton
(un jeton ne s'enregistre pas sur le disque, `ETAT-INFRA.md` fait n°7) :

```bash
GITLAB_TOKEN=glpat-… ./tools/pipeline/pousser.sh          # ta branche
GITLAB_TOKEN=glpat-… ./tools/pipeline/pousser.sh main     # vers main
```

Il écrit le jeton dans l'URL **au moment du push seulement**, masque toute sortie, et
remet à jour le repère local `origin/<ta branche>` **après** un push accepté. Si le push
échoue, le repère n'est pas touché : il reste honnête.

## Se rappeler tout, sans tout relire

Des centaines de règles, de leçons, de skills, de scripts et une vingtaine de sessions :
personne ne relit ça à chaque fois — c'est comme ça qu'on refait une erreur déjà écrite.

```bash
node tools/pipeline/rappel.mjs                  # le rappel (compact)
node tools/pipeline/rappel.mjs --pour "departs" # tout ce que j'ai déjà écrit sur un sujet
node tools/pipeline/rappel.mjs --tout           # toutes les règles et leçons
```

Ce qui est **actionnable** (ce que Kevin attend, le courrier des autres sessions, l'état
git) est montré **en entier à chaque fois**. Ce qui est **énorme** (règles, leçons) tourne :
quelques lignes différentes à chaque rappel, si bien que tout finit par repasser sans
coûter un roman. Chaque chiffre est compté sur le disque à l'instant, jamais recopié.

## Les règles de voisinage entre sessions

1. **Chacune sur SA branche.** Jamais sur `main` sans cherry-pick, jamais de `--force`.
2. **Chacune sur SES surfaces** (colonne `surfaces` du registre). Toucher au territoire
   d'une autre = lui envoyer un message, pas le modifier soi-même. *(Exemple vécu :
   `.gitlab-ci.yml` appartient à « domain-kdmc » — une erreur de format y a coupé la
   publication du site le 27/08. On ne bricole pas chez le voisin.)*
3. **Ce qui existe des DEUX côtés se corrige des deux côtés**, dans le même commit
   (CMCteams **et** light — garde `npm run test:parite-cmcteams-light`).
4. **Jamais de secret dans le pipeline.** Le registre est un fichier versionné : aucun
   jeton, aucune clé, jamais. Un secret arrivé par une consigne automatique est
   **mort-né** (`ETAT-INFRA.md` fait n°7).
5. **Ce qu'on attend de Kevin s'écrit UNE fois**, dans `attend_kevin`. Pas dix sessions
   qui lui redemandent la même chose chacune de leur côté.

## Où regarder quoi

| Question | Fichier |
|---|---|
| Où en est l'infrastructure ? | `ETAT-INFRA.md` |
| Qui travaille sur quelle branche ? | `SESSIONS-ET-BRANCHES.md` (humain) · `pipeline/sessions.json` (machine) |
| Qu'attend-on de Kevin ? | `node tools/pipeline/pipeline.mjs etat` |
| Ai-je du courrier ? | `node tools/pipeline/pipeline.mjs etat --id <moi>` |
| Les règles permanentes | `CLAUDE.md` · les erreurs à ne pas refaire : `LESSONS.md` |


## ⚠️ Depuis le 10.09 : ta branche fusionnée est SUPPRIMÉE — c'est normal

Le ruleset `16725169` a été corrigé (`~ALL` → `~DEFAULT_BRANCH`) : le ménage
d'`auto-merge-claude.yml` supprime enfin ce qu'il doit supprimer. Premier passage :
**253 branches `claude/*` effacées** (389 → 126). Il ne touche QUE les branches dont
**tous** les commits sont déjà dans `main` — rien ne peut se perdre.

**Conséquence pour toi, au démarrage** : la branche notée dans le registre peut ne plus
exister. Ce n'est pas une panne, c'est le signe que **ton travail est passé**.

```bash
# 1. ta branche existe-t-elle encore ?
git ls-remote --heads origin refs/heads/<ta-branche>
# 2. vide → repars proprement de main, puis réinscris-toi
git fetch origin && git checkout -b claude/<nouveau-nom> origin/main
node tools/pipeline/pipeline.mjs enregistrer --id <toi> --branche "claude/<nouveau-nom>" \
     --titre "…" --sujet "…"
```

**Deux pièges vus en vrai le 10.09, ne les refaites pas :**

1. **Une PR fusionnée ne suit plus les nouveaux commits.** Le robot fusionne dès que
   « Auto PR Review » est vert. Si tu pousses ENSUITE sur la même branche, ton commit
   reste dehors et personne ne le voit (vécu : PR #3746 fusionnée, commit `a143a6c73`
   orphelin). Après une fusion : **branche neuve depuis `main`**.
2. **Le registre ment vite.** Le 10.09, 19 sessions marquées « actives » pointaient vers
   des branches supprimées. Avant de te fier au registre, vérifie l'existence de la
   branche (commande ci-dessus). Le tableau de `SESSIONS-ET-BRANCHES.md` porte le même
   avertissement en tête.

Pour savoir ce qu'une branche apporte encore : `node tools/menage/branches-superflues.mjs`
(et `--fichiers` pour la liste des fichiers qui n'existent que sur des branches).
