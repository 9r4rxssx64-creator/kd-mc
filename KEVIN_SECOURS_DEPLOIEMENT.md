# 🛟 Secours de déploiement — si GitHub retombe en panne

> ## ✅ BRANCHÉ le 7 août 2026 à 01:11 — `kdmc-router`
>
> Kevin a connecté Cloudflare Workers Builds. Vérifié sur sa capture d'écran :
> dépôt `9r4rxssx64-creator/CMCteams` · Root directory `/services/kdmc-router` ·
> Deploy command `npx wrangler deploy` · Build command *None* · Production branch `main`.
>
> **✅ RÉGLÉ le 7 août 2026 (Kevin : « Fait »)** : « Builds for non-production branches »
> passé sur **Disabled**. Seuls les envois sur `main` déclenchent désormais une
> construction → le quota gratuit reste disponible le jour où le parachute sert, et plus
> d'e-mails d'échec sur les branches de travail (règle anti-spam).
>
> **Ne pas toucher aux « Build watch paths »** (laisser `*`) tant qu'on n'a pas confirmé si
> le chemin se compte depuis la racine du dépôt ou depuis le Root directory : la doc
> Cloudflare renvoie **403** à l'agent (mesuré 2026-08-07). Une mauvaise valeur ne rougit
> pas — elle désactive le parachute **en silence**. Vérifier avant de proposer une valeur.

> **Pourquoi** : le 6 août 2026, GitHub Actions est tombé **6 heures** (0 travail en cours,
> 390 en attente). Résultat : plus aucun déploiement ne partait. Tes sites tournaient
> toujours, mais on ne pouvait **rien mettre à jour**.
>
> **La solution** : laisser **Cloudflare** construire et publier lui-même depuis ton dépôt,
> sans passer par GitHub. Si GitHub retombe, Cloudflare continue.

---

## ▶️ TON UNIQUE CLIC

**[👉 Ouvrir les réglages du routeur kd-mc.com sur Cloudflare](https://dash.cloudflare.com/?to=/:account/workers/services/view/kdmc-router/production/settings)**

Puis, sur cette page :

1. Section **« Build »** (ou « Builds ») → bouton **« Connect »**
2. Choisis **GitHub** → autorise → sélectionne le dépôt **`CMCteams`**
3. Remplis **3 champs** (recopie exactement) :

| Champ | Valeur à mettre |
|---|---|
| **Root directory** (dossier racine) | `services/kdmc-router` |
| **Deploy command** (commande) | `npx wrangler deploy` |
| **Build command** | *(laisser vide)* |

4. Si tu vois **« Build watch paths »** → **laisse `*`** (ne mets RIEN). L'avertissement en tête
   de ce document explique pourquoi : une mauvaise valeur ne rougit pas, elle désactive le
   parachute **en silence**. *(Cette étape disait auparavant `services/kdmc-router/*` — c'était
   en contradiction directe avec l'avertissement ; corrigé le 6.09.2026.)*
   → ça évite qu'il republie à chaque petite modif sans rapport.
5. **Save**.

C'est tout. Aucune clé à saisir : les secrets déjà posés sur le Worker restent en place.

**Pourquoi les clés ne risquent rien (vérifié, pas supposé)** : le déploiement GitHub fait deux
choses — publier le code, **et** reposer 10 secrets sur le routeur (`KDMC_ADMIN_PIN_SHA256`,
`KDMC_SSO_SECRET`, Firebase ×3, `KDMC_PUSH_TOKEN`, `RAILWAY_TOKEN`, OpenAI, Groq, Mistral,
Gemini — voir `.github/workflows/deploy-kdmc-router.yml`). Cloudflare, lui, publie **seulement
le code**. Ce n'est pas un problème : sur un Worker, les secrets **survivent aux publications**,
`wrangler deploy` ne les efface pas. Le parachute publie donc un routeur complet et fonctionnel.
**Limite honnête** : si un secret venait à manquer, seul GitHub sait le reposer.

---

## Ce que ça change (et ce que ça ne change pas)

| | Avant | Après |
|---|---|---|
| GitHub va bien | GitHub publie | GitHub **et** Cloudflare publient (même code, sans risque) |
| GitHub en panne | ❌ rien ne part | ✅ **Cloudflare publie quand même** |
| Tes clés/secrets | sur le Worker | **inchangés**, rien à ressaisir |
| Les tests | tournent sur GitHub | **inchangés** — GitHub reste le chemin principal |

**Honnêtement** : ce n'est pas « mieux » que GitHub, c'est un **filet de sécurité en plus**.
GitHub fait davantage (il lance les tests, pousse les secrets, prouve que le site répond).
Cloudflare, lui, fait une seule chose — mais il la fait **même quand GitHub est mort**.

**Limite honnête** : si GitHub est totalement inaccessible (impossible d'envoyer le code),
plus rien ne part, ni par l'un ni par l'autre. Là, le secours ne peut rien.

---

## Pourquoi je ne peux pas le faire à ta place

Cloudflare n'autorise ce branchement **que depuis son tableau de bord**, avec **ta session
connectée** (c'est une autorisation entre ton compte Cloudflare et ton compte GitHub).
Il n'existe aucune API pour le faire — vérifié, ce n'est pas une excuse.
**Tout le reste est déjà prêt** : les fichiers de configuration sont valides tels quels, et un
test automatique le vérifie à chaque livraison (voir plus bas).

---

## Si tu veux étendre le secours plus tard

Même procédure, en changeant juste le nom dans le lien et le dossier racine :

| Ce que ça protège | Lien 1 clic | Root directory |
|---|---|---|
| Le domaine + tous les sous-domaines | [kdmc-router](https://dash.cloudflare.com/?to=/:account/workers/services/view/kdmc-router/production/settings) | `services/kdmc-router` |
| La page « Qui se connecte » | [kdmc-access](https://dash.cloudflare.com/?to=/:account/workers/services/view/kdmc-access/production/settings) | `services/kdmc-access` |
| Les données live (cartes, météo…) | [kdmc-live](https://dash.cloudflare.com/?to=/:account/workers/services/view/kdmc-live/production/settings) | `services/kdmc-live` |

Le plus important est **le premier** : c'est lui qui fait vivre `kd-mc.com` et tous tes sous-domaines.

---

## Le garde-fou (pour que ce secours ne soit pas du vent)

Un secours jamais testé, c'est un secours qui casse le jour où on en a besoin.
`tests/deploy-secours-cloudflare.test.mjs` vérifie à **chaque livraison** (câblé dans le
contrôle automatique `test:ci`) que **chaque worker reste publiable tel quel par Cloudflare** :
le fichier de configuration est là, le nom est déclaré, le fichier principal existe vraiment,
rien ne sort du dossier, et les identifiants de stockage sont figés.

**83 vérifications** au vert aujourd'hui. Et j'ai prouvé qu'il **échoue** quand on casse
quelque chose (test refait avec un fichier principal manquant → détecté).
