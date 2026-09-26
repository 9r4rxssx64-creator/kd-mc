---
description: 🛡️ Scan sécurité du code + applique les corrections (tout auto, sans rien casser)
argument-hint: [périmètre optionnel : ex "apex", "cmcteams", "workers" — vide = tout]
---

Mode **« Scan and fix your codebase »** (équivalent `/claude-security`, installé le 2026-07-17
à la demande de Kevin « install apex et toi et exécute tout auto, corrections comprises »).

Périmètre demandé : $ARGUMENTS (vide = toutes les apps de Kevin dans ce repo).

Tu exécutes le pipeline COMPLET, en autonomie, jusqu'au bout — corrections comprises —
en respectant à la lettre les règles CLAUDE.md (jamais rien casser, PR jamais push main direct,
preuve réelle, zéro faux positif, 1 clic max / tout auto pour Kevin).

## 1. SCAN (l'arsenal réel, pas une estimation)
- Déclenche le scan CI réel : `security-suite.yml` sur `main` via `actions_run_trigger`
  (gitleaks + TruffleHog = secrets ; OSV + Trivy = dépendances ; Semgrep = SAST XSS/injections ;
  zizmor = durcissement des workflows). Résultat = artifact `security-report-*` + Firebase
  `/apex/ax_security_last`.
- EN PARALLÈLE, lance une passe statique en sandbox (subagents `general-purpose` scopés par app)
  sur les classes qui comptent : **XSS** (`innerHTML`/template de donnée user sans `esc()`/
  `escapeHtml()`/textContent), **JS-in-attribute** (`onclick="f('${userdata}')"` → délégation),
  **secrets en clair** (`sk-ant-`, clés privées, tokens worker — les clés Firebase Web PUBLIQUES
  n'en sont pas), **CSP** (host `fetch`/`EventSource`/`WebSocket` absent de `connect-src`),
  **côté worker** (secret renvoyé au client, CORS `*` sur endpoint sensible, endpoint admin sans
  auth, SSRF/open-proxy).

## 2. TRIAGE — vérifie AVANT d'agir (règle #59/#83, la plus importante)
- Pour CHAQUE finding (CI ou subagent) : relis la ligne exacte et confirme que la donnée est
  vraiment attaquant/user-contrôlée. Écarte les faux positifs : HTML statique sans interpolation,
  `onclick` sans interpolation, contenu déjà échappé/`textContent`, host déjà dans la CSP, clé
  Firebase Web publique, relais public read-only (AIS/feeds) en CORS `*` = intentionnel, endpoint
  qui vérifie déjà un token/PIN/grant/HMAC. Un faux « leak » annoncé = temps perdu pour Kevin.
- Classe le reste : 🔴 P0 (faille exploitable / secret actif) · 🟠 P1 · 🟡 P2.

## 3. CORRECTIONS (le cœur — « corrections comprises »)
- Branche dédiée `claude/scan-and-fix-*` depuis `origin/main` à jour (jamais push main direct).
- Applique les correctifs SÛRS et à faible risque : `esc()`/`escapeHtml()`/textContent sur XSS ;
  conversion en délégation d'événement (`data-…` + un listener) pour le JS-in-attribute ;
  retrait/rotation de secret + passage côté serveur ; ajout du host manquant à `connect-src` ;
  CORS restreint à une allowlist ; ajout du garde d'auth manquant. Un correctif = un commit clair.
- Un secret ACTIF trouvé dans le dépôt = P0 : le retirer ET prévenir Kevin qu'il est compromis /
  à révoquer (je ne peux pas révoquer sa clé tierce à sa place).
- Ne touche PAS à ce qui est architectural/risqué sans preuve ; consigne-le comme reco au lieu de
  le patcher à l'aveugle.

## 4. PREUVE (jamais « ça devrait marcher »)
- Pour chaque correctif : `node --check` sur le JS modifié, tests/`verify-*` concernés verts,
  et si UI/worker : preuve réelle (Playwright en sandbox avec libs du registre npm + APIs mockées,
  ou déclenchement d'un smoke CI). Ajoute un test de non-régression quand c'est pertinent.

## 5. LIVRAISON (tout auto)
- PR via GitHub MCP → merge squash → vérifie la propagation réelle sur `main`
  (`get_file_contents@main` d'un fichier témoin — le proxy git peut mentir, leçon #79).
- Relis le résultat du scan CI `security-suite` (`actions_get` + Firebase `ax_security_last`),
  trie ses findings, applique les correctifs sûrs restants, re-scanne si besoin.

## 6. RAPPORT à Kevin (simple, iPhone, sans jargon)
- Ce qui a été scanné, ce qui a été CORRIGÉ (avec la preuve), ce qui reste (reco/action Kevin
  ex. révoquer une clé), et le fait que c'est rejouable en 1 commande (`/scan-and-fix`).
- JAMAIS déclarer « sécurisé » sans avoir lu un résultat réel. Statut par affirmation : ✅ vérifié
  (commande exécutée) / 🟡 déduit (lecture) / 🔴 supposé (+ comment le confirmer).
