# 🔄 REPRISE / HANDOFF — Session SEO + Avocat/Droit + GitHub MCP

> But : tout savoir pour reprendre sur une **nouvelle branche** sans rien relire de l'historique.
> Dernière mise à jour : 2026-06-01. Méthode de vérité = **WebFetch `raw.githubusercontent.com`** (PAS le proxy git local, qui ment — cf. lesson #79).

---

## 1. ✅ DÉJÀ LIVRÉ ET EN PROD (sur le VRAI main, vérifié WebFetch raw)

| Livraison | Preuve sur main |
|---|---|
| **SEO Apex vitrine indexable** (title, canonical, robots index, OG/Twitter, JSON-LD SoftwareApplication, noscript indexable, `robots.txt`/`sitemap.xml`/`llms.txt`/`og-image.png`) | `apex-ai-v13/llms.txt` présent |
| **Section Avocat/Droit** (claude-for-legal : 12 modules, 151 skills, 10 agents, Apache-2.0) + orchestrateur `/legal` + parité Apex | `.claude/skills/legal/SKILL.md` présent |
| **SEO + Google APIs** (skill claude-seo, extensions free, workflow seo-audit, pont clés Google) | `.claude/skills/seo/SKILL.md` présent |
| **`.mcp.json` serveur GitHub MCP** (URL-seule `https://api.githubcopilot.com/mcp/`, SANS header — credential via Coffre) | vérifié : `.mcp.json` sur main contient `github` sans `headers` (PR #530 + edits directs GitHub) |

→ **Ces 4 blocs sont définitivement sur main. Ne pas les refaire.**

---

## 2. ⏳ EN ATTENTE (commits doc non mergés sur le vrai main)

Branche `claude/seo-skill-install-2rdyZ`, 5 commits **pure documentation** (zéro impact fonctionnel) :
- `31c094cc3` mémo friction GitHub (KEVIN_ACTIONS_TODO « MÉMO À FAIRE »)
- `cdbf5b907` lesson #79 (proxy git désync)
- `500ea357` / `4aec71d1` .mcp.json github (déjà reflété sur main via edits directs de Kevin)
- `01bc60cb0` lesson #80 (GitHub MCP non chargé)

Ces commits **n'atteignent pas le vrai GitHub** car le proxy git `127.0.0.1` ne propage pas (lesson #78/#79). **Non urgent** : c'est de la doc. À reprendre via le modèle §4.

---

## 3. 🚧 LE BLOCAGE CENTRAL — GitHub MCP (lessons #78 → #80)

**Symptôme** : impossible de merger/pusher en autonomie depuis les sessions Claude Code web de CMCteams.

**Causes empiriquement vérifiées** :
1. **Proxy git `127.0.0.1`** : `git push` répond `[new branch]` mais ne propage PAS durablement vers le vrai GitHub ; `git ls-remote`/`cat-file` du proxy **mentent** (vu proxy main = `6b1ca9b4` alors que vrai main = `b38e20e5`). Push direct sur `main` = **403** (protégé).
2. **GitHub MCP `mcp__github__*` ABSENT** du registre d'outils des sessions CMCteams (vérifié par ToolSearch sur 3 sessions, noms exacts + mots-clés → rien). Seuls Figma/Sentry/Apollo/Supabase/etc. chargés.
3. **Hypothèse forte (lesson #80)** : les **Coffres d'identifiants GitHub** (Jeton Bearer + OAuth, Actifs, URL `api.githubcopilot.com`) sont configurés sur **`platform.claude.com`** (agent **Apex AI** / env `apex-ai-env`). Or les sessions CMCteams tournent sur **`claude.ai/code`** = **produit séparé** → le Coffre n'alimente pas ces sessions. `.mcp.json` correct ne suffit pas si le runtime n'a pas le credential.

**Ce qui est ÉLIMINÉ comme cause** : `.mcp.json` (correct, vérifié), header parasite (retiré), réseau (`apex-ai-env` = Unrestricted).

---

## 4. ✅ MODÈLE DE LIVRAISON QUI MARCHE (à utiliser tant que GitHub MCP absent)

**« Je prépare le diff exact → Kevin applique/merge sur github.com »**
C'est ainsi que les 3 features + PR #530 sont passées :
- Pour un fichier : je donne le contenu complet → Kevin **édite directement sur GitHub** (`github.com/.../edit/main/<fichier>`) → Commit. L'éditeur web touche le **vrai** GitHub (contourne le proxy).
- Pour une branche existante sur le vrai GitHub : **Create PR → Merge** (mobile OK).
- ⚠️ Sur iPhone, le bouton **« Run workflow »** (workflow_dispatch) est masqué → préférer **Create PR**.

**Vérifier un merge** = WebFetch `raw.githubusercontent.com/9r4rxssx64-creator/CMCteams/main/<fichier-témoin>`. JAMAIS se fier à `git ls-remote`/`git log` du proxy.

---

## 5. ❓ QUESTION OUVERTE POUR DÉBLOQUER L'AUTONOMIE

Où `create_pull_request`/`merge_pull_request` sont-ils « chargés » ?
- Si **platform.claude.com (agent Apex AI)** → normal qu'ils soient absents des sessions CMCteams (produits séparés).
- Pour les avoir dans les sessions **CMCteams**, il faut rattacher le serveur GitHub MCP + credential à **l'environnement/agent qui exécute les sessions CMCteams** (pas seulement `apex-ai-env`), puis **relancer une session** et **revérifier par ToolSearch** que `mcp__github__*` apparaît AVANT de promettre quoi que ce soit.

---

## 6. 🆕 REPRENDRE SUR UNE NOUVELLE BRANCHE — procédure

1. **Lire ce fichier** + `CLAUDE.md` lessons **#72, #78, #79, #80**.
2. **Au démarrage** : `ToolSearch "github merge pull request"` → si `mcp__github__*` présent ⇒ autonomie totale (créer branche + PR + merge par API). Sinon ⇒ modèle §4.
3. **État vérité** : WebFetch `raw.../main/apex-ai-v13/llms.txt` (doit exister) pour confirmer que les features sont là.
4. **Repartir du SHA que KEVIN voit** sur github.com (pas du main proxy). Lui demander le SHA de main si besoin.
5. Nouvelle branche : `claude/<sujet>` ; livrer en petits commits ; pour merger, modèle §4.
6. **Ne PAS** refaire les 4 livraisons du §1 (déjà en prod).

---

## 7. 📌 ACTION KEVIN (durable, hors session)
Reconnecter/rattacher le **GitHub MCP** au runtime des sessions **claude.ai/code CMCteams** (pas seulement l'agent Apex AI sur platform.claude.com). Tant que ce n'est pas fait, garder le modèle §4 (qui fonctionne).

---
## 8. 🔴 DERNIER ÉTAT VÉRIFIÉ (2026-06-01, fin de session)
- **VRAI main `.mcp.json` est CASSÉ** : la ligne url github = `"url": "<https://api.githubcopilot.com/mcp/>"` (avec `<>` parasites introduits lors d'une résolution de conflit web). Vérifié WebFetch raw. **Impact = nul sur l'app/Pages** (`.mcp.json` ne sert qu'aux sessions Claude Code web ; le github MCP ne se charge de toute façon pas — séparation produit, lesson #80). À nettoyer pour que le github MCP puisse marcher un jour.
  - FIX = éditer `.mcp.json` directement sur main (github.com/.../edit/main/.mcp.json), retirer le `<` et le `>` de la ligne url → `"url": "https://api.githubcopilot.com/mcp/"` → Commit to main. NE PAS recoller tout le fichier (le recollage réintroduit les `<>`).
- **PR #532** (`claude/seo-skill-install-2rdyZ` → main) : COINCÉE. La branche a été SUPPRIMÉE par github-actions[bot] alors que la PR était ouverte + auto-merge activé + conflit `.mcp.json`. → la fermer (Close) ; ses seuls apports uniques = fichiers doc (lessons #78-80, mémo, REPRISE_HANDOFF.md), non essentiels.
- **Résolution locale faite** : commit merge `276aa907c` sur la branche locale (.mcp.json propre, sans `<>`) — mais NON propagé au vrai GitHub (proxy, lesson #79). Donc le fix propre n'est PAS sur main ; seul l'edit direct §8 le mettra.
- ✅ **Inchangé et en prod** : les 3 features (SEO Apex, Avocat/Droit, SEO/Google). Rien à refaire.

### Verdict
Chantier infra GitHub MCP = bloqué par 2 murs cumulés : (a) proxy git non-propageant (lesson #79), (b) GitHub MCP non exposé aux sessions claude.ai/code (lesson #80). Le SEUL canal fiable vers le vrai GitHub = **édition/merge manuels par Kevin sur github.com**. Pour toute prochaine livraison : modèle « je prépare le diff → Kevin applique sur github.com ».

---
## 9. ✅ RÉSOLU (2026-06-01 17:22) — main .mcp.json nettoyé
Kevin a édité `.mcp.json` directement sur main (github.com) → url github = `"https://api.githubcopilot.com/mcp/"` PROPRE (sans `<>`). Confirmé par sa capture live du fichier rendu sur main (le endpoint raw.githubusercontent peut encore montrer l'ancienne version ~15 min = cache). `.mcp.json` est donc valide sur main (3 serveurs : github, nanobanana, firecrawl).
Restant (optionnel) : fermer la PR #532 (coincée, apports = doc). RAS sinon — 3 features en prod, .mcp.json propre.
