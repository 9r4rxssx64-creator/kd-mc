# BRANCHES.md — Carte des branches du dépôt

> Inventaire maintenu à jour pour ne plus se perdre dans les branches.
> Dernière mise à jour : 2026-05-20 (rangement Kevin).

---

## 🌳 Convention de nommage

| Préfixe | Rôle | Histoire |
|---------|------|----------|
| `main` | Production — GitHub Pages déploie depuis ici | — |
| `project/<nom>` | Projet autonome séparé (app distincte, cycle de vie propre) | indépendante |
| `archive/<nom>` | Branche conservée pour mémoire, plus développée | indépendante |
| `fix/<sujet>` | Correctif ciblé, dérivé de `main` | liée à main |
| `claude/<sujet>` | Branche de travail Claude Code, dérivée de `main`, auto-mergée vers `main` | liée à main |

**Règle d'or** : toute nouvelle branche de travail doit partir de `main`
(`git checkout -b claude/<sujet> origin/main`). Une branche dérivée de `main`
a une histoire liée → merge propre, zéro conflit. Ne jamais repartir d'une
branche à histoire non-liée (cf. `claude/test-699LQ` ci-dessous).

---

## ✅ Branches actives

| Branche | Contenu | État |
|---------|---------|------|
| `main` | Dépôt principal — CMCteams, Apex AI v13, Apex Chat, shops, outils | 🟢 prod |
| `project/iremotehub` | Projet **iRemoteHub** — télécommande iPhone universelle (v0.1.2) | 🟢 projet séparé |
| `project/crackpass` | Projet **CrackPass** — outil mots de passe | 🟢 projet séparé |
| `project/ecommerce` | Projet **plateforme e-commerce automation** | 🟢 projet séparé |
| `archive/evaluate-resources` | Archive session avril 2026 (workflow cron, guide iPhone) | 📦 archive |

> Les `project/*` ont une histoire indépendante de `main` : ce sont des apps
> distinctes, elles ne se mergent pas dans `main`.

---

## 🔧 Branches `fix/*` Apex — stale, NON mergées

`main` est déjà à **Apex v13.4.236**. Ces branches sont antérieures ou
équivalentes — les merger réintroduirait des régressions (diff de 400 à 1000+
fichiers, chez-lolo v1.0.0 périmé). **Ne pas merger** sans audit ciblé.

| Branche | Date | Note |
|---------|------|------|
| `fix/apex-tests-v236` | 20 mai | La plus récente — 3 fichiers `messaging-app/`. À cherry-pick si besoin du fix tests. |
| `fix/apex-v236-a11y-vault` | 20 mai | a11y vault — superseded (main à v236) |
| `fix/apex-v235-inline-css` | 20 mai | extraction CSS — superseded |
| `fix/apex-v234-a11y` | 19 mai | stale (chez-lolo v1.0.0) |
| `fix/apex-v233-post-audit` | 19 mai | stale |
| `fix/apex-v232-ux-refonte` | 19 mai | stale |
| `fix/apex-v225-urgent` | 18 mai | divergence massive (1000+ fichiers) — mort |
| `claude/apex-chat-v113-merge` | 18 mai | divergence massive — mort |

---

## ⚠️ Branches obsolètes conservées (à histoire NON-LIÉE)

Conservées sur décision Kevin, mais **ne pas en repartir** pour travailler :
leur histoire git n'a aucun ancêtre commun avec `main` → tout merge = conflits
massifs.

| Branche | Note |
|---------|------|
| `claude/test-699LQ` | Ancienne branche de travail — `main` est plus récent. chez-lolo déjà rapatrié. |
| `claude/continue-perfection-work-5C2eH` | Histoire non-liée, mai 2026 |
| `claude/session-final-docs` | Docs session avril 2026 |
| `gh-pages` | Ancien mode de déploiement (v7.2, mars 2026) — Pages passe désormais par GitHub Actions |
| `revert/auto-rollback-*` (×8) | Branches de rollback générées automatiquement |

---

## 🗑️ Branches supprimées le 2026-05-20

**Mergées dans `main` (travail en ligne)** :
`claude/apex-chat-deploy-acctid`, `claude/apex-chat-migrations`,
`claude/apex-chat-v133-merge`, `claude/apex-chat-v134-merge`,
`claude/improve-chez-lolo-7DWMT`.

**Renommées** (ancien `claude/*` → nouveau nom clair) :
- `claude/iphone-device-remote-control-Nam26` → `project/iremotehub`
- `claude/universal-password-cracker-o2mbo` → `project/crackpass`
- `claude/ecommerce-automation-platform-Gprjk` → `project/ecommerce`
- `claude/evaluate-resources-shZBa` → `archive/evaluate-resources`

---

## 🔁 Automatisation en place

- `auto-merge-claude.yml` — merge auto `claude/**` → `main` après validation JS.
- `cleanup-stale-branches.yml` — supprime auto les `claude/*` mergées (cron 04:00)
  + les `claude/*` inactives > 30 jours (cron dimanche).
- `branch-coordinator.yml` — détecte les conflits entre branches actives.
