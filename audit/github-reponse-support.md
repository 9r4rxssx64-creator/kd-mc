# Réponse à GitHub Support — lever la restriction du compte

> Reçu le 2.09.2026 de « Wick » (GitHub Support). Il donne trois conditions.
> Ce document contient : **ce qui est déjà fait**, **ce qui te reste**, et **le texte à envoyer**.

## Où on en est, mesuré (pas supposé)

| Condition de GitHub | État |
|---|---|
| **1. Supprimer les workflows en infraction** | ✅ fait — voir ci-dessous |
| **2. Supprimer les identifiants liés** | 🔴 **2 secrets à supprimer par toi** (3 min) |
| **3. Reconnaître la règle** | ✅ écrit dans la réponse ci-dessous |

### Ce qui a été supprimé, et pourquoi

**Les exécutions programmées : déjà toutes retirées le 15/08.**
Vérifié fichier par fichier : sur **168 workflows, 0 tourne encore en cron**. Les mentions
de `cron` qui subsistent sont dans des **commentaires** qui expliquent le retrait. C'est
la cause première citée par GitHub (*« interact with 3rd party websites … general
computing purposes »*) — elle n'existe plus.

**Les 6 workflows crypto : supprimés le 2.09** — GitHub nomme explicitement
« cryptocurrency operations » :

- `crypto-bot-analysis.yml`
- `crypto-bot-deploy.yml`
- `crypto-bot-fleet-deploy.yml`
- `crypto-bot-research.yml`
- `crypto-bot-verify.yml`
- `crypto-bot-status.yml`

> Conséquence honnête : le bot ne se déploie plus depuis GitHub. Il **tourne sur Railway**,
> pas sur GitHub — Actions ne faisait que l'y envoyer. Son déploiement passera par GitLab CI.

**Ce qui reste : 162 workflows** — uniquement des tests, des constructions et des
déploiements du site, déclenchés par un `push` ou à la main. C'est exactement l'usage
que GitHub décrit comme légitime.

## 🔴 Ta seule action — supprimer 2 secrets (3 min)

**github.com → ton dépôt → Settings → Secrets and variables → Actions**, supprime :

- **`BINANCE_TESTNET_API_KEY`**
- **`BINANCE_TESTNET_API_SECRET`**

**Vérifié : ces deux-là ne servent à RIEN d'autre** (0 autre workflow les utilise).

⚠️ **NE SUPPRIME PAS** `JWT_SECRET`, `KDMC_SSO_SECRET` ni `RAILWAY_TOKEN` — ils sont
utilisés par 7, 5 et 3 autres workflows. Les supprimer casserait ton site.

## Texte à envoyer à GitHub Support (anglais)

> Hello Wick,
>
> Thank you for the clear instructions. I have completed all three steps.
>
> **1. Policy violations cleaned up.**
> The scheduled workflows were the root cause. Every `cron` schedule was removed on
> 2026-08-15 — across all 168 workflow files there is now **not a single scheduled run**
> left (the remaining `cron` mentions are comments documenting the removal). In addition,
> I have now **deleted the 6 cryptocurrency-related workflows**
> (`crypto-bot-analysis`, `crypto-bot-deploy`, `crypto-bot-fleet-deploy`,
> `crypto-bot-research`, `crypto-bot-verify`, `crypto-bot-status`).
>
> The remaining 162 workflows are only tests, builds and deployments of my own website,
> triggered by `push` or manually — standard CI/CD for the software in this repository.
>
> **2. Associated credentials removed.**
> I have deleted the two repository secrets that existed solely for the cryptocurrency
> workflows: `BINANCE_TESTNET_API_KEY` and `BINANCE_TESTNET_API_SECRET`.
>
> **3. Policy understanding acknowledged.**
> I understand that GitHub Actions is designed for CI/CD and software development, and
> must not be used to poll or interact with third-party services on a schedule, to host
> infrastructure, for cryptocurrency operations, or for general computing. I have moved
> all scheduled/monitoring work off GitHub Actions entirely, and it will stay off.
>
> This is a personal repository for my own applications; there was no commercial or
> coordinated activity. Could you please review the account again?
>
> Thank you,
> Kevin Desarzens

## Traduction (pour toi — ne pas envoyer)

> Bonjour Wick,
>
> Merci pour ces instructions claires. J'ai effectué les trois étapes.
>
> **1. Infractions nettoyées.** Les exécutions programmées étaient la cause. Tous les
> `cron` ont été retirés le 15/08/2026 — sur 168 fichiers, **aucune exécution programmée**
> ne subsiste (les mentions restantes sont des commentaires expliquant le retrait). J'ai
> en plus **supprimé les 6 workflows liés aux cryptomonnaies**. Les 162 restants ne sont
> que des tests, constructions et déploiements de mon propre site, déclenchés par `push`
> ou à la main.
>
> **2. Identifiants supprimés.** J'ai supprimé les deux secrets qui n'existaient que pour
> ces workflows crypto : `BINANCE_TESTNET_API_KEY` et `BINANCE_TESTNET_API_SECRET`.
>
> **3. Règle comprise.** Je comprends que GitHub Actions sert au CI/CD et au développement
> logiciel, et ne doit pas servir à interroger des services tiers de façon périodique, à
> héberger de l'infrastructure, aux opérations crypto, ni à du calcul général. Tout ce qui
> était périodique ou de surveillance a été sorti de GitHub Actions, définitivement.
>
> C'est un dépôt personnel pour mes propres applications ; il n'y avait ni activité
> commerciale ni activité coordonnée. Pourriez-vous réexaminer le compte ?

## Ordre à suivre

1. **Supprime les 2 secrets** (sinon ta réponse serait fausse sur le point 2).
2. **Envoie la réponse** ci-dessus, en réponse au message de Wick.
3. Quand GitHub débloque : **ne remets JAMAIS de `cron`** dans un workflow. Le garde
   `tools/github/triage-workflows.mjs` le détecte ; le pipeline entre sessions
   (`PIPELINE-SESSIONS.md`) porte la consigne pour toutes les sessions.
