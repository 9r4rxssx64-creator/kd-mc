# APEX CONTINUATOR — Configuration & Memory

> ⚠️ **JAMAIS IMPLÉMENTÉ — vérifié le 6.09.2026.** Tout ce dossier décrit un « agent externe »
> (`ax_external_agent_enabled`, file Firebase `/apex/external_agent_queue/`, commande `/agent`,
> kill-switch) annoncé « sera codé en v13.4.6 ». Apex est aujourd'hui en **v13.4.355** et
> `grep -rl external_agent` sur le code source ne renvoie **rien**. Ne pas suivre ces pages
> comme un mode d'emploi : elles décrivent du vide.



## 2e copier-coller : Memory MCP / Notes persistantes

Copie ce bloc dans le **Memory MCP** de l'agent (ou en notes initiales si pas de Memory MCP).
Ce sont les infos critiques que l'agent doit avoir mémorisées de façon permanente.

---

### IDENTITÉ KEVIN
- Nom : Kevin DESARZENS
- Email primaire : kevind@monaco.mc
- Adresse : Monaco
- Société : Casino Monte-Carlo (SBM employé)
- ID admin Apex : `kdmc_admin`
- ID admin CMCteams : `U11804` (DESARZENS K)
- Aliases reconnus : "Kevin DESARZENS", "DESARZENS Kevin", "kevin desarzens", "Kevin", "DESARZENS", "kevin.desarzens@gmail.com", "K DESARZENS", "KD", "KDMC"

### ENTOURAGE
- **Laurence SAINT-POLIT** ❤️ : compagne, tier `laurence`, permissions tiered (auto/notify/validate)
- **Familles CMCteams** : bj, roulettes, cmc, cadres
- **Pit Boss CMCteams** : ‹employé›, ‹employé›, ‹employé›, ‹employé›, ‹employé›, ‹employé›

### REPO GITHUB
- URL : `https://github.com/9r4rxssx64-creator/cmcteams`
- Branche dev : `claude/test-699LQ` (TOUJOURS pousser ici, jamais main direct)
- Pages déploiement : `https://9r4rxssx64-creator.github.io/CMCteams/`
- Apex live : `https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/`

### FIREBASE REALTIME DB
- URL : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`
- REST endpoint : `<URL>/<path>.json`
- Region : europe-west1
- Auth : **`auth != null` EXIGÉ partout** (auth anonyme acceptée) — la racine est `.read:false`. « Lecture publique » était faux (vérifié 6.09.2026)., write avec `auth=<KEVIN_FIREBASE_TOKEN>`
- Token Kevin : à fournir séparément (env `KEVIN_FIREBASE_TOKEN`)

### PATHS FIREBASE CRITIQUES
- `/cmcteams/*` — données CMCteams (ne JAMAIS toucher sauf demande explicite)
- `/apex/users/<uid>/vault/*` — vault encrypted (JAMAIS lire en clair)
- `/apex/users/<uid>/persistent_memory/*` — facts cross-session
- `/apex/telemetry_in/*` — sentinelles errors
- `/apex/lessons_learned/*` — learnings cross-session
- `/apex/claude_todo/*` — TES tâches en attente (escalades sentinelles)
- `/apex/external_agent_queue/<uid>/<msgId>` — TES commandes Kevin via Apex chat
- `/apex/external_agent_results/<uid>/<msgId>` — TES réponses
- `/apex/external_agent_enabled` — bouton ON/OFF (true/false)

### DOCS RACINE À FETCH AU BOOT (cache 6h)
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/CLAUDE.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/NOTES_USER.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/MEMO_RESUME.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/KEVIN_INVENTORY.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/MEMORY_PERSISTENT.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/APEX_HANDOFF.md`
- `https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/KEVIN_ACTIONS_TODO.md`

### PROJETS ACTIFS KEVIN (priorité ordre)
1. **APEX AI v13** — `/apex-ai/v13/` source TS, `/apex-ai-v13/` build deployed (priorité 1)
2. **CMCteams** — `/index.html` racine monolithe SPA (priorité 2)
3. **e-KDMC v0.4** — `/_PROJECTS_KDMC/e-KDMC/` marketplace (priorité 3)
4. **CrackPass / KDMC tools** — `/tools/*.html` (priorité 4)
5. **Télécommande KDMC** — `/messaging-app/` (priorité 5)
6. **Cloudflare Workers** — `/services/{apex-auth-worker, chat-svc, vault-svc, sentinels-svc}/` (priorité 6)

### CONTACT KEVIN ESCALADE
- **Telegram bot** : `@Kdmc_kevind_2026_bot`
- **Bot token** : Firebase path `ax_telegram_token` (lis-le, ne le hardcode pas)
- **Email** : kevind@monaco.mc
- **MOTD CMCteams** : `cmcSetMotd("ALERTE Apex bloquée : ...")` visible accueil CMCteams

### COMPTE ANTHROPIC KEVIN (consommation tokens)
- **Modèle recommandé** : `claude-sonnet-4-6` (équilibre coût/qualité)
- **Modèle économie** : `claude-haiku-4-5-20251001` (~10× moins cher)
- **Modèle premium reasoning** : `claude-opus-4-7` (cher, à réserver décisions critiques)
- **Recharge auto activée** : ATTENTION budget. Cap impératif.
- **Cap par session agent** : 50 000 tokens max
- **Cap quotidien** : 200 000 tokens max
- **Stop net si error 429/402** : push notif Telegram + status='quota_exhausted'

### REGLES PERMANENTES KEVIN (résumé top 10)
1. Autonomie totale — jamais demander si peut faire seul
2. Honnêteté — score mesuré, jamais inventé
3. Pas de régression — tests AVANT commit
4. 1 clic + bouton direct
5. Triple persistence (localStorage + IDB + Firebase)
6. Branche `claude/test-699LQ` uniquement
7. Build cohérence triple (data-app-ver source = build = deploy)
8. Sécu vault AES-GCM-256 PBKDF2 200k, pas de XOR-obf
9. Admin only (kdmc_admin) pour mode autonome
10. iOS Safari PWA = terrain (touch 44px, test 375px)

### COMMANDES UTILES (que tu peux exécuter via Bash MCP ou tool use)
- `git fetch origin claude/test-699LQ`
- `git pull origin claude/test-699LQ`
- `cd /tmp/repo && npm install` (si tu cloneS)
- `npx tsc --noEmit` (TypeScript strict check)
- `npx vitest run` (tests)
- `npx vite build` (build)
- `git add -A && git commit -m "Apex vX.Y.Z — <desc> (Agent autonome)"` 
- `git push -u origin claude/test-699LQ`

### SI BLOQUÉ
1. Push `/apex/claude_todo/<id>` Firebase avec `{context, reason, severity:"critical"}`
2. Notif Telegram (via fetch POST `https://api.telegram.org/bot<TOKEN>/sendMessage`)
3. Email (via Brevo API si dispo)
4. Marker `agent_blocked` dans queue pour que Apex affiche dans chat Kevin
