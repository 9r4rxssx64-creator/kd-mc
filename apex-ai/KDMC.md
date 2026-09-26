# KDMC AI — Fichier Reference Persistant

> Ce fichier est la memoire de l'app KDMC. L'IA le lit et le met a jour automatiquement.
> Derniere MAJ: 2026-04-20 — v12.3

---

## Identite

- **Nom**: KDMC AI
- **Version**: v12.1
- **Createur**: Kevin DESARZENS (kevind@monaco.mc)
- **Hebergement**: GitHub Pages (9r4rxssx64-creator.github.io/CMCteams/apex-ai/)
- **Firebase**: cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app
- **Taille**: 575 KB monofichier HTML

---

## Projets geres depuis KDMC

| Projet | Statut | Description |
|--------|--------|-------------|
| KDMC AI | Production v12.1 | Cette app — assistant IA premium |
| CMCteams | Production v9.303 | Planning casino 258 employes |
| e-KDMC | Developpement v0.1 | E-commerce automatise |
| Remote | Integre | Telecommande universelle IR/TV/HA |
| CrackPass | Integre | Generateur/testeur MDP |
| IA-KDMC | A demarrer | Projet IA personnel |

---

## Architecture agents (26 workers)

### Systeme (7)
- Erreurs (2min) — compte erreurs/heure, alerte si >5
- Performance (1min) — DOM load time, RAM, cores
- Stockage (5min) — localStorage usage, alerte >80%
- Memoire (5min) — taille totale, conversations, messages
- Reseau (2min) — online/offline, type connexion, debit
- Session (1min) — TTL session, alerte expiration
- SW-Health (10min) — Service Worker actif et a jour

### Securite (2)
- Securite (10min) — PIN, proxy, erreurs, API key
- CrackPass-Audit (30min) — fonctions MDP operationnelles

### Qualite (5)
- Qualite (15min) — satisfaction, reactions thumbs up/down
- UX-Feedback (20min) — feedbacks 24h
- UI-Coherence (15min) — vues cassees, fonctions manquantes
- Code-Integrity (10min) — nombre fonctions, erreurs recentes
- Scalability (15min) — taille HTML, nombre fonctions

### Donnees (3)
- Data-Sync (5min) — queue sync offline, Firebase connecte
- API-Health (3min) — cle API presente, proxy configure
- Firebase-Health (5min) — connexion SSE active

### Apps (3)
- CMCteams-Watch (10min) — presence employes, chat
- Remote-Devices (5min) — IR/TV/HA connectes
- E-Commerce (10min) — produits, commandes en attente

### Automatisation (6)
- Habitudes (10min) — habitudes non cochees, rappel 20h
- Taches (5min) — taches en attente
- Backup (1h) — snapshot auto a 3h
- Auto-Cleanup (1h) — nettoie convs >60j, tronque erreurs
- Apprentissage (30min) — appareils appris, KB growth
- Auto-Learn — s'ameliore des reactions utilisateur

---

## Lecons apprises (auto-enrichi)

1. **Ne jamais hardcoder le system prompt** — toujours utiliser _buildSystemPrompt()
2. **Toujours guard admin sur les fonctions settings** — 11 fonctions protegees
3. **Quotes dans les strings HTML** — eviter apostrophes francaises, utiliser esc()
4. **SW cache** — TOUJOURS bumper avec la version app
5. **Boutons touch** — minimum 44px sur mobile
6. **Firebase user-prefix** — fbShouldSync doit checker les cles suffixees
7. **Timeout API** — toujours mettre un timeout (45s) sinon freeze
8. **CSS .ax-msg** — ne pas definir 2 fois (fusionner en une regle)
9. **axInjectFunction** — toujours guard admin (code injection)
10. **cmcRead** — proteger par admin (donnees sensibles)
11. **SYNC FIREBASE** — toute donnee partagee (ex: ax_shared_api_key) DOIT etre dans FB_FIX ET utiliser ls() pas localStorage.setItem directement. TOUJOURS verifier le flux complet: ecriture → fbShouldSync → Firebase → fbLoadAll → lecture client
12. **Audit insuffisant** — verifier les GUARDS ne suffit pas. Il faut aussi verifier le FLUX DE DONNEES bout-en-bout (ecriture → sync → lecture). Un guard OK avec un flux casse = bug invisible
13. **Format ls/lg** — ls() stocke en JSON (ajoute des quotes), localStorage.setItem stocke brut. _getApiKey doit gerer les deux formats
14. **Audits a faire** — CHAQUE audit doit inclure: (1) syntaxe JS, (2) guards securite, (3) flux de donnees complet, (4) format donnees, (5) cross-device sync
15. **IA bloquee "3 petits points a l'infini" (v12.3 fix definitif)** — 3 causes cumulatives:
    (a) `_callClaudeAPI` ignorait `ax_proxy_url` → CORS silent hang sur iOS Safari PWA. FIX: lire `localStorage.getItem("ax_proxy_url")` et utiliser en priorite.
    (b) Tool-use recursion droppait les messages a `content` tableau (filtrage `typeof==="string"`) → API recevait conversation cassee → 400/loop silencieux. FIX: preserver `Array.isArray(m.content)` aussi.
    (c) Pas d'`AbortController` → fetch zombie apres timeout. FIX: AbortController signal sur chaque fetch + abort() dans le timeout.
    Idem pour `_mcSend` et `axUploadImage` (images en array).
    **Regle permanente** : JAMAIS hardcoder `https://api.anthropic.com/v1/messages` directement, TOUJOURS passer par `ax_proxy_url`-or-default. JAMAIS filtrer par `typeof content === "string"` dans les messages API.
16. **Health check proactif** — _healthCheck check si `isStreaming` dure > 45s et push un message visible "(IA debloquee automatiquement)" + dc() pour que l'utilisateur voit immediatement que c'est reglable.

---

## Procedure d'audit obligatoire (CHAQUE session)

> **REGLE ABSOLUE** : Ne JAMAIS valider sans cet audit complet.

### Niveau 1 — Syntaxe (automatique)
- [ ] node --check → JS OK
- [ ] wc -c → taille coherente
- [ ] SW cache == APP_VER

### Niveau 2 — Securite (agents)
- [ ] Toutes les fonctions _settings* ont guard admin
- [ ] Toutes les vues ont guard K.user
- [ ] innerHTML sans esc() → 0
- [ ] new Function / eval → sandboxe ou admin-only

### Niveau 3 — Flux de donnees (NOUVEAU — celui qui manquait)
- [ ] Chaque donnee partagee est dans FB_FIX ou FB_PRE
- [ ] Chaque ecriture partagee utilise ls() pas localStorage.setItem
- [ ] fbShouldSync retourne true pour chaque cle partagee
- [ ] fbLoadAll charge correctement dans localStorage
- [ ] _getApiKey gere les deux formats (raw et JSON)
- [ ] Cross-device : admin ecrit → Firebase sync → client lit → fonctionne

### Niveau 4 — Fonctionnel (agents)
- [ ] Chaque vue du vMain switch a sa fonction
- [ ] Chaque tab du navbar a son case dans vMain
- [ ] Tous les workers ont leur case handler
- [ ] Toutes les onclick appellent des fonctions existantes

### Niveau 5 — UX (verification manuelle)
- [ ] Login fonctionne (admin + client)
- [ ] Chat envoie et recoit des reponses
- [ ] Sidebar affiche les conversations
- [ ] Toutes les vues s'affichent sans erreur
- [ ] Mobile 375px : tout est lisible

---

## Regles permanentes

1. TOUT AU MAXIMUM — jamais de valeur basse par defaut
2. Agents en permanence — 26+ workers actifs surveillent tout
3. Auto-apprentissage — apprend des reactions, des erreurs, s'ameliore
4. Auto-nettoyage — nettoie convs anciennes, erreurs, queue
5. Auto-backup — snapshot quotidien a 3h
6. Centralisation — toutes les donnees dans Firebase + localStorage
7. Securite 5 couches — PIN, guard admin, chiffrement, audit, kill switch
8. Self-modify — peut modifier son CSS, ses fonctions, ses tabs en direct
9. Multi-projet — gere KDMC + CMCteams + e-KDMC + Remote + CrackPass
10. Anticipation — prevoit les bugs avant qu'ils arrivent
11. AUDIT 5 NIVEAUX — syntaxe + securite + flux donnees + fonctionnel + UX
12. FLUX DE DONNEES — verifier bout-en-bout, pas juste les guards
13. LECONS APPRISES — chaque erreur = nouvelle lecon notee ici et dans ax_lessons_learned
14. **NE JAMAIS INVENTER DE DONNEES** — si pas de source reelle (mois precedent, PDF), NE PAS mettre de pattern par defaut. Alerter l'admin a la place. Les donnees doivent TOUJOURS venir d'une source verifiee.
15. **Test de flux reel** — un audit qui verifie la syntaxe et les guards n'est PAS suffisant. Il faut tester le flux REEL.
16. **JAMAIS DE STREAMING SSE** — Safari iOS PWA ne supporte PAS getReader() correctement en mode standalone. Le streaming BLOQUE l'app (3 points infinis). Mode JSON UNIQUEMENT. Ne PLUS JAMAIS remettre le streaming. C'est la 3e fois que ce bug se reproduit.

---

## Metriques cles

- 350+ actions autonomes
- 26 workers en arriere-plan
- 13 personas
- 80+ templates pro
- 44 voix
- 6 themes
- 5 langues
- 40+ vues premium
- 23 guards login
- 23 guards admin
- 41 headers gradient
- 31 left-borders

---

## Connexions configurables

- Claude API (sk-ant-...)
- Firebase RTDB
- Sentry monitoring
- Stripe paiement
- Telegram bot
- EmailJS
- Broadlink IR
- Smart TV WiFi
- Home Assistant
- MQTT IoT
- Finnhub finance
- Cloudflare Workers

---

---

## Methodologie de travail (appliquee a CHAQUE interaction)

1. **TodoWrite AVANT de coder** — planifier, decomposer, suivre
2. **Subagents pour auditer** — verifier chaque modification par un agent independant
3. **Syntax check AVANT commit** — node --check obligatoire
4. **esc() sur toute donnee utilisateur** — securite XSS
5. **Guards admin sur fonctions sensibles** — if(!axIsAdmin())return
6. **Tester sur mobile 375px** — iPhone SE = reference
7. **Ne jamais oublier une demande** — tout noter dans TodoWrite + KDMC.md
8. **Auto-apprentissage** — chaque erreur = lecon apprise automatiquement
9. **Auto-nettoyage** — conversations >60j, erreurs >40, queue sync
10. **MAJ tous les fichiers apres chaque session** — KDMC.md, MEMO_RESUME.md, NOTES_USER.md

## Self-repair (auto-reparation)

L'app detecte et corrige les problemes en autonomie:
- **Erreurs JS** → remontees dans ax_err_log, notifiees par worker Erreurs
- **Firebase deconnecte** → reconnexion auto avec backoff exponentiel
- **Queue sync pleine** → flush auto au retour online
- **Stockage plein** → _emergencyCleanup() supprime les vieilles conversations
- **Session expiree** → redirect login automatique
- **SW desynchronise** → proposition MAJ + cache bust
- **API timeout** → lecon apprise + suggestion reduire le prompt
- **Worker crashe** → restart auto au prochain interval

## Fonctions de gestion des projets (depuis KDMC)

| Action | Fonction | Description |
|--------|----------|-------------|
| Modifier CSS | axModifyCSS(selector, prop, value) | Change le style en direct |
| Injecter fonction | axInjectFunction(name, code) | Ajoute du code JS |
| Ajouter tab | axAddTab(id, icon, label, html) | Nouveau module |
| Supprimer tab | axRemoveTab(id) | Retire un module |
| Lire le code | axGetAppSource() | Code source complet |
| Chercher dans le code | axFindInCode(query) | Trouve les lignes |
| Lire une fonction | axGetFunctionCode(name) | Code d'une fonction |
| Remplacer dans le CSS | axReplaceInCode(search, replace) | Modification |
| Exporter l'app | axExportAppCode() | Telecharge le HTML |
| Lire Firebase CMC | cmcRead(key) | Donnees CMCteams |
| Ecrire Firebase CMC | cmcWrite(key, value) | Modifier CMCteams |
| MOTD CMCteams | cmcSetMotd(text) | Message du jour |
| Chat CMCteams | cmcSendChat(msg) | Envoyer un message |

## Checklist pre-livraison (appliquer CHAQUE fois)

- [ ] node --check /tmp/t.js → JS OK
- [ ] wc -c index.html → taille coherente
- [ ] grep innerHTML | grep -v esc → 0 XSS
- [ ] grep "axIsAdmin" sur toutes les fonctions sensibles
- [ ] git diff → pas de regression
- [ ] Test mental: que se passe-t-il si K.user est null ?
- [ ] Test mental: que se passe-t-il sur iPhone Safari PWA ?
- [ ] Test mental: que se passe-t-il si Firebase est down ?

---

*Ce fichier est mis a jour automatiquement par les workers KDMC.*
*Derniere verification: tous les audits PASS (2026-04-20)*


## 🚨 REGLE UX ERREURS (Kevin 2026-04-21, OBLIGATOIRE)

JAMAIS afficher message erreur technique brut a l utilisateur final.
TOUJOURS remplacer par message actionnable clair.

| Technique (interdit) | User-friendly (attendu) |
|----------------------|-------------------------|
| undefined is not an object | Erreur interne, recharge la page |
| null reference | Donnees manquantes, reinstalle l icone |
| HTTP 500 / 502 / 503 | Serveur surcharge, reessaie dans 1 min |
| Failed to fetch / network | Reseau indisponible, verifie Wi-Fi/4G |
| CORS / Host not allowed | Blocage API, contacte admin ou attends |
| QuotaExceededError | Stockage plein, un cleanup auto a ete lance |
| Timeout | Pas de reponse apres 30s, reessaie |

Applicable dans :
- Chaque catch (try/catch ou .catch)
- Chaque toast visible user
- Chaque push message assistant dans K.messages/A.iaHistory
- Chaque alert/confirm

A verifier a chaque audit (axRunAudit, subagent audit).

---
