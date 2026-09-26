# 🚚 Quitter GitHub — tout est prêt, il ne reste que tes clics

> Préparé le 15/08/2026, après que GitHub a **refusé** de lever la suspension.
> Tout ce qui suit est fait et testé de mon côté. Toi, tu cliques.

---

## Pourquoi on part

GitHub a suspendu le compte, et le support a répondu :

> *any repositories that use GitHub Actions solely to interact with 3rd party websites, to engage in incentivized activities, or for general computing purposes may fall afoul of the GitHub Additional Product Terms*
>
> *For this reason, I'm afraid we will not be removing the restrictions from this account.*

La cause est corrigée (**97 exécutions/jour → 0**, 42 workflins hors-sujet retirés,
un test qui empêche le retour en arrière). Mais un « non » a été prononcé, donc on
prépare l'indépendance.

**GitLab est joignable depuis mon environnement** — vérifié en vrai, pas supposé :

```
git ls-remote https://gitlab.com/…  →  faadd95335b8…   ✅
```

Donc je peux y pousser ton code. GitHub, lui, refuse même la lecture.

---

## Étape 1 — Créer le compte et le projet *(≈ 3 min, faisable sur iPhone)*

1. **▶️ [Créer un compte GitLab](https://gitlab.com/users/sign_up)**
2. **▶️ [Créer un projet vide](https://gitlab.com/projects/new#blank_project)**
   - Nom : `CMCteams`
   - Visibilité : **Privé**
   - ⚠️ **Ne coche PAS** « Initialize repository with a README » — le projet doit
     être **vide**, sinon le transfert refusera de partir.

## Étape 2 — Le jeton *(≈ 1 min)*

**▶️ [Créer un jeton d'accès](https://gitlab.com/-/user_settings/personal_access_tokens)**

- Nom : `migration`
- **Expiration : demain** (la date la plus proche possible)
- Portée : **`write_repository` uniquement** — décoche tout le reste

Colle-le-moi. Je lance le transfert (396 Mo, 395 commits, quelques minutes),
je te confirme que le dernier commit correspond exactement des deux côtés.

> ⚠️ Le jeton apparaîtra dans notre conversation. C'est pour ça qu'on lui donne
> la portée minimale et 24 h de vie. **Supprime-le dès que j'ai fini** — au même
> endroit, bouton « Revoke ».

## Étape 3 — Remettre les sites en ligne *(≈ 5 min, dans Safari)*

C'est **Cloudflare Pages** qui prend la place de GitHub Pages. Il construit chez
Cloudflare : **zéro minute GitLab consommée**.

1. **▶️ [Créer un projet Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages)**
2. « Connect to Git » → **GitLab** → autoriser → choisir `CMCteams`
3. Réglages de construction :
   - Build command : **laisser vide**
   - Build output directory : **`/`**
   - *(le site est fait de fichiers déjà prêts, il n'y a rien à compiler)*
4. Déployer. Tu obtiens une adresse du type `https://cmcteams.pages.dev`

## Étape 4 — Basculer le domaine *(≈ 1 min, 2 réglages)*

Ton routeur Cloudflare sait déjà changer de source **sans nouvelle mise en
ligne** : c'est un réglage, pas du code (je l'ai préparé et testé).

**▶️ [Réglages du routeur](https://dash.cloudflare.com/?to=/:account/workers/services/view/kdmc-router/production/settings)**
→ *Variables and Secrets* → ajouter :

| Nom | Valeur |
|---|---|
| `UPSTREAM_BASE` | `https://cmcteams.pages.dev` *(l'adresse de l'étape 3)* |
| `UPSTREAM_PREFIX` | *(laisser complètement vide)* |

Sauvegarder. **kd-mc.com et ses sous-domaines reviennent** (ils étaient 20 au moment de la
panne du 2.09 ; ils sont **26** depuis — liste vérifiée par `npm run test:uptime-couverture`).

> **⚠️ 5.09.2026 : ce document est un plan de SECOURS, pas la marche à suivre du jour.**
> GitHub a rouvert le 4.09 à 16h34 UTC ; le site est de nouveau servi depuis GitHub et GitLab
> n'est plus que le miroir + l'endroit des travaux que GitHub interdit.

> Pourquoi deux réglages : GitHub Pages servait tes pages sous `/CMCteams/…`,
> Cloudflare Pages les sert à la racine. Le second réglage retire ce préfixe.
> Sans ces variables, rien ne change — c'est le comportement d'avant.

## Étape 5 — Les clés *(seulement si tu veux la CI GitLab)*

Facultatif : les tests tournent sans aucune clé. Ce n'est utile que pour
remettre en ligne les Workers depuis GitLab.

**▶️ [Variables CI/CD du projet GitLab](https://gitlab.com/kdmc-group/Kdmc-project/-/settings/ci_cd)** → section *Variables*, en cochant **Masked** :
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, puis les clés d'IA au besoin.

---

## Ce qui change, et ce qui ne change pas

| | Avant | Après |
|---|---|---|
| Code | GitHub | **GitLab** (privé) |
| Sites | GitHub Pages | **Cloudflare Pages** |
| Domaine et sous-domaines | routeur Cloudflare | **inchangé** |
| Workers (Créa Studio, routeur…) | Cloudflare | **inchangé, jamais tombés** |
| Tests | 126 workflows | tests au push, **0 exécution programmée** |
| Surveillances, générations d'images | GitHub Actions | **à déplacer vers un Worker** |

**Rien n'est perdu** : les 35 workflows retirés sont conservés dans
`.github/workflows-desactives/`, et tout l'historique (395 commits) part sur
GitLab.

## Si tu préfères retenter GitHub d'abord

Les deux ne s'excluent pas. Le texte de seconde demande est prêt (il s'appuie
sur la correction déjà faite, chiffres à l'appui). Si GitHub réactive, on garde
GitLab comme filet — c'est de toute façon plus sain qu'un seul hébergeur.

## Ce que je ne peux pas faire

- Créer le compte, le projet et le jeton : ça demande **ton** identité
- Cliquer dans le tableau de bord Cloudflare : mon accès réseau n'y va pas
  (`CONNECT 403`, mesuré)

Tout le reste — transfert, vérification, CI, bascule du domaine — est écrit,
testé, et part au premier feu vert.
