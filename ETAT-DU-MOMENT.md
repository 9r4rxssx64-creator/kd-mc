# 🧭 ÉTAT DU MOMENT — la vérité d'aujourd'hui, en une page (MAJ : 26.09.2026)

> **LIS CECI EN PREMIER, quelle que soit ta branche et sa date.** Cette page est servie depuis
> `main` à chaque démarrage ou réveil de session (hook `.claude/hooks/etat-du-moment.sh`) :
> même une branche vieille de trois mois la reçoit à jour. `ETAT-INFRA.md` est l'**historique**
> (22 faits datés) ; ici, **seulement ce qui est vrai maintenant**. Toute session qui change l'un
> de ces points **met cette page à jour dans le même commit** (garde `npm run test:etat-du-moment`,
> dans `test:ci` : la date en tête doit être ≥ au fait le plus récent d'ETAT-INFRA).

## ✅ Vrai aujourd'hui

| Sujet | État (et date de la mesure) |
|---|---|
| **GitHub Actions** | **TOURNENT DE NOUVEAU depuis le 26.09 ~17:09 UTC** (machines GitHub, mesuré : 82 runs réussis entre 17 h et 18 h ; déploiement Apex Chat + E2E prod verts). Arrêt du 24.09 13:38 → 26.09 ~17:00 : budget Actions du **compte** à 0 $ ; **Kevin l'a monté à 20 $** (fait n°23 d'ETAT-INFRA). **Le plafond de 2 000 min/mois reste** : pas de rafales inutiles jusqu'à la bascule du 1er octobre. |
| **Fusionner une PR** | Si les Actions retombent (run qui échoue en ~5 s sans étape) : à la main **par l'API** après tests **en local** (`PUT /repos/…/pulls/{n}/merge`). Sinon, chemin normal. |
| **GitLab** | **Ni bloqué, ni en panne : ses deux jetons sont RÉVOQUÉS** (3.09, réponse 401). Aucune session ne peut y publier, **et personne n'en a besoin** : la publication passe par GitHub. Ne rien y chercher, ne rien y proposer à Kevin, ne pas lui redemander un jeton. |
| **Le site kd-mc.com** | **EN LIGNE**, servi par Cloudflare Pages via le routeur ; indépendant de GitHub. **3 boutiques en 404** (la-detente, chez-lolo, rotaplan) : réparation **écrite** (`publier-site-prive.yml` + `tools/gitlab/publier.sh`), elle part à la première publication qui tourne. |
| **GitHub Pages / github.io** | **ÉTEINT** (dépôt privé). Toute adresse `9r4rxssx64-creator.github.io` est morte. |
| **Le plan « deux dépôts »** | **Décidé par Kevin le 24.09** : ce dépôt = **coffre privé** (CMCteams, Light, arbre, données, sauvegardes) ; un dépôt **public neuf** `kd-mc` reçoit le reste, sans historique. **Bascule AUTOMATIQUE le 1er octobre 06:00 UTC** (Routine `trig_01U8qNTJM5PnhGt1fmgg1kEj`, vérifiée active le 25.09). Garde `test:depot-public` : 47/0 le 26.09. Règle « DEUX DÉPÔTS » dans CLAUDE.md. |
| **Après la bascule** | Le coffre garde 27 robots privés = **57 min sur 1 980** mesurées sur les 29 dernières heures d'activité (3 %) → il tient sous les 2 000 min. Les 132 autres robots partent au public. |
| **Le Lenovo comme runner** | **ABANDONNÉ par Kevin le 25.09** (« trop compliqué »). Fichiers gardés dans `tools/runner/`, interrupteur `KDMC_RUNNER` **inactif** = comportement d'avant. Ne pas le lui reproposer. |
| **Bot auto-merge** | **Revenu avec les Actions** (26.09 : il a fusionné `main` dans une branche à 17:18). Son dernier « Auto-merge into main » mesuré (17:10) a échoué : ne pas compter sur lui sans vérifier la PR. |
| **Routeur du domaine (`services/kdmc-router`)** | ⚠️ **Fusionne `main` AVANT tout push qui le touche** : déployé depuis une branche dont `wrangler.toml` n'a pas `UPSTREAM_BASE`, le routeur renvoie sur `github.io` (mort) et le déploiement reste VERT (message m123, 23.09 : kit.kd-mc.com 12 adresses en 404 pendant 5 min). Correctif dans `main` depuis le commit f497c3b87. |
| **Déployer la production** | **Depuis `main` seulement** (Kevin 26.09 « limité ») : les 25 workflows de déploiement ne partent plus sur un push `claude/**`. Une branche de travail ne déploie rien ; on fusionne, `main` déploie. Manuel : `workflow_dispatch`. Garde `test:deploiement-main`. |
| **Sessions Claude entre elles** | Registre + boîte aux lettres = `pipeline/sessions.json` sur **GitHub `main`** (pas GitLab). Se déclarer : `node tools/pipeline/pipeline.mjs enregistrer --id <slug> --titre … --branche … --sujet …`. Lire son courrier : `… etat --id <slug>`. |

## 🚫 Plus vrai — ne le redis plus à Kevin, ne le relis pas comme actuel

- « GitHub est suspendu » (levé le 4.09.2026) · « le seul site vivant est `kdmc-site.pages.dev` » ·
  « publie via GitLab avec `GITLAB_TOKEN` » · « le bot fusionne les PR `claude/*` » ·
  « branche de dev courante = `claude/graphity-auto-install-sm3f92` » (supprimée le 10.09) ·
  « il faut le runner Lenovo » · « envoie la réponse au support GitHub » (fait le 4.09).

## 📌 Décisions de Kevin de la semaine

- **24.09** : dépôt public tout neuf + coffre privé, tout automatique, « que je n'aie rien à faire ».
- **25.09** : Lenovo abandonné ; « Trouve d'autres solutions auto » → la bascule du 1er suffit.
- **26.09** : « tout le monde au courant en temps réel, même les vieilles branches qui se réveillent,
  pas de double travail, pas d'annulation » → cette page + le hook + la garde.

## 👤 Ce qui attend Kevin (inévitable, tout le reste est automatique)

- Réclamer son crédit Claude **avant le 7.10** · remplacer les **4 codes** rendus publics (section 🔴
  de `KEVIN_ACTIONS_TODO.md`) · **3 réponses oui/non** (section 🟠). Pour la bascule : **rien**.

## 🔁 Qui fait quoi

Le hook ajoute sous cette page, **à chaque démarrage**, les 8 branches les plus actives (date, nom,
dernier commit) et le retard de ta branche sur `main` — mesuré dans git à l'instant, jamais écrit à
la main. Avant de toucher un fichier partagé : `node tools/pipeline/retard-branches.mjs`, et
`npm run bilan` pour le point complet.
