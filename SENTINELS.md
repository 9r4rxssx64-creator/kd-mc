# SENTINELLES EXPERT + CGU — Spec universelle (tous projets Kevin)

## Pattern CGU (Consentement utilisateur) — v9.448 / v12.9, Kevin 2026-04-20 nuit

**Règle permanente** : toute feature qui accède à un capteur device (caméra, micro, GPS,
biométrie, notifications) DOIT demander consentement via `cguAsk(feature, label, desc)`,
le persister en localStorage, et offrir révocation.

### Helper universel

```js
function cguAsk(feature, label, description) {
  var k = "<prefix>_cgu_" + feature;
  if (lg(k, "0") === "1") return true;
  var msg = label + "\n\n" + description
    + "\n\n• Données stockées localement uniquement"
    + "\n• Révocable dans Réglages/Admin > Confidentialité";
  if (!confirm(msg)) return false;
  ls(k, "1");
  audit("cgu_accept", userId, feature, label);
  return true;
}
function cguRevoke(feature) { ls("<prefix>_cgu_" + feature, "0"); }
function cguStatus() { /* retourne objet {feature: accepted} */ }
```

### Features à wrap obligatoires

| Feature | Entry point Apex | Entry point CMCteams |
|---------|------------------|----------------------|
| `biometric` | `axBiometricAuth()` | `webauthnLogin(uid)` |
| `microphone` | `axSttToggle()` | `sttStart()` |
| `geolocation` | `axGetLocation()` | `cmc_geoloc_consent` existant |
| `camera` | `axCameraCapture()` (à wrapper) | upload image admin |
| `notifications` | `requestNotifPermission()` | `requestNotifPermission()` |

### Textes CGU recommandés

- **Biométrie** : "Votre biométrie ne quitte JAMAIS votre appareil (WebAuthn standard)"
- **Micro** : "Traitement par moteur natif du navigateur. Aucun audio envoyé à un serveur externe"
- **Géolocalisation** : "Position utilisée pour détection de lieu (casino/domicile) et contexte local"

---



> Règle permanente : **chaque projet Kevin doit embarquer les 7 sentinelles ci-dessous**
> en plus de ses agents domain-specific. Elles tournent en autonomie totale, en permanence,
> chez tous les utilisateurs connectés.
>
> Cibles : CMCteams, KDMC Apex AI, e-KDMC, Remote, CrackPass, futurs projets.
>
> Dernière MAJ : 2026-04-20

---

## Les 7 sentinelles expert (non-négociables)

| # | Sentinelle | Icône | Intervalle | Mission |
|---|-----------|-------|-----------|---------|
| 1 | **perf-sentinel** | ⚡ | 2 min | Render time, RAM, localStorage %, funcs lentes (>100ms), DOM size |
| 2 | **security-sentinel** | 🛡 | 5 min | `innerHTML` sans `esc()`, guards admin manquants, CSP violations, sessions expirées |
| 3 | **data-integrity-sentinel** | 🧬 | 10 min | Refs orphelines, champs requis manquants, codes inconnus, doublons IDs |
| 4 | **api-sentinel** | 📡 | 1 min | Firebase SSE up, Anthropic API latence, proxy health, retry queue |
| 5 | **ux-sentinel** | 🎨 | 15 min | Boutons cassés (onclick fonction inexistante), états vides sans CTA, touch targets <44px |
| 6 | **self-heal-sentinel** | 🩺 | 3 min | Auto-fix : isStreaming stuck, queue offline flush, SW cache mismatch, intervals zombies |
| 7 | **learner-sentinel** | 🧠 | 30 min | Patterns récurrents (≥3×/7j) → auto-ajout `lessons_learned` cross-projets |

---

## Contrat d'exécution (commun à toutes)

Chaque sentinelle DOIT :

1. **Tourner chez tout le monde connecté** (admin ET employés — mode silent watcher pour non-admin)
2. **Dédupliquer** ses alertes (1 même pattern = 1 seul rapport par fenêtre de 1h)
3. **Auto-heal quand possible** (whitelist stricte de fixes : abort stream, flush queue, clear cache, etc.)
4. **Logger** dans un store dédié (`<prefix>_sentinels_log`, max 500 entries, FIFO)
5. **Remonter à l'admin** via badge topbar pulsant + vue dashboard dédiée
6. **Ne jamais inventer de données** — si pas de source, alerte only
7. **S'arrêter proprement** à `doLogout` (pas d'intervals zombies)
8. **Persister** — survit rechargement page via localStorage state
9. **Auto-apprendre** — chaque découverte notable → leçon enregistrée + partagée cross-admins
10. **Rate-limiter** le auto-fix — 1 action auto-corrective max par sentinelle par heure

---

## Tâches autonomes par sentinelle

### 1. ⚡ perf-sentinel (2 min)
- [x] Mesure `performance.now()` avant/après `dc()` → alerte si >500ms
- [x] Surveille taille localStorage → déclenche `emergencyCleanup` si >85%
- [x] Tracke top 10 funcs les plus lentes (via wrapper `perfMeasure`)
- [x] Détecte re-renders >10/s (boucle infinie DOM)
- [x] Alerte si `document.querySelectorAll("*").length` > 10000

### 2. 🛡 security-sentinel (5 min)
- [x] Scan `document.body.innerHTML` pour motifs de XSS résiduels
- [x] Vérifie présence guards `AID` / `axIsAdmin()` sur funcs admin connues
- [x] Check CSP via `document.querySelector("meta[http-equiv='Content-Security-Policy']")`
- [x] Détecte session > TTL → force logout
- [x] Audit `localStorage.getItem("*_pin")` jamais en clair

### 3. 🧬 data-integrity-sentinel (10 min)
- [x] Vérifie clés orphelines dans overrides (emp supprimé mais row existe)
- [x] Codes horaires inconnus (pas dans `CODES`) → liste
- [x] IDs dupliqués dans `employees` / `teams` / `users`
- [x] Champs requis : `emp.name`, `emp.id`, `emp.family` non vides
- [x] Refs croisées : `team.members` ⊆ `employees`

### 4. 📡 api-sentinel (1 min)
- [x] Firebase SSE : `_fbEs` ouvert et `readyState===1`
- [x] Anthropic API : ping `/health` proxy (si configuré) toutes les 5 min
- [x] Retry queue : taille < 50, sinon flush
- [x] Latence fetch moyenne — alerte si >3s sur 5 dernières

### 5. 🎨 ux-sentinel (15 min)
- [x] Scan `onclick="func("` → vérifier que `window.func` existe
- [x] Scan états vides sans CTA : `.empty` sans `<button>`
- [x] Touch targets : `button, a, [onclick]` avec getBoundingClientRect().height < 44px
- [x] Labels manquants (bouton sans texte ni aria-label)

### 6. 🩺 self-heal-sentinel (3 min) — WHITELIST STRICTE
- [x] `K.isStreaming` true + dernier msg >45s → `K.isStreaming=false; dc();`
- [x] Retry queue >10 items + online → flush
- [x] SW cache mismatch avec APP_VER → toast + proposer reload
- [x] Firebase SSE fermé + online → `fbStartListening()`
- [x] Intervals fantômes (pas dans `_globalIntervals`) → log warning

### 7. 🧠 learner-sentinel (30 min)
- [x] Scan `*_sentinels_log` des 7 derniers jours
- [x] Groupe par pattern (message ~30 premiers chars)
- [x] Si ≥3 occurrences → génère leçon brouillon
- [x] Push dans `cmc_lessons_learned` (FB_FIX, shared) avec flag `auto-generated`
- [x] Admin peut approuver/rejeter via vAgents

---

## Intégration dans chaque projet

### CMCteams (`index.html`)
- Ajouter les 7 sentinelles dans `APP_AGENTS` (à la suite des 15 existantes)
- Auto-start au login via `_startAgentsLoop`
- Vue admin `vAgents` affiche leur statut séparément (section "Sentinelles Expert")

### KDMC Apex AI (`apex-ai/index.html`)
- Ajouter via `axCreateLocalWorker("perf-sentinel", "perf_check", 120000)` etc.
- Démarrer dans `axInit()` si admin
- Dashboard dans `vWorkers`

### Futurs projets
- Embarquer `SENTINELS.md` comme spec à suivre
- Implémenter les 7 sentinelles avant tout autre agent domain-specific
- Tester leur déclenchement AVANT release

---

## Rate-limit auto-heal (whitelist globale)

Les seules fonctions dont le `self-heal-sentinel` peut déclencher l'exécution auto :

| Projet | Fonctions whitelist |
|--------|---------------------|
| CMCteams | `agentActionFlushSync`, `agentActionPurgeOldLogs`, `_agentImportGuardian`, `autoFillMissingCadres` |
| KDMC | `flushSyncQueue`, `_emergencyCleanup`, `fbStartListening`, `axForceRefresh` |
| Universel | `localStorage.setItem("<prefix>_isStreaming", false)` (reset UI stuck) |

**1 action / sentinelle / heure** — enforced par `<prefix>_sentinel_lastheal`.

---

## Audit & traçabilité

- Chaque déclenchement sentinelle → entry dans `<prefix>_audit` :
  `{ts, agent:"perf-sentinel", finding:"...", action:"auto-heal", result:"ok"}`
- Dashboard admin affiche les 50 derniers événements par sentinelle
- Badge topbar pulsant si ≥1 warn/err dans les 10 dernières min

---

## Pipeline d'autonomie complet inter-apps (v9.445 / v12.8, Kevin 2026-04-20 soir)

**Règle Kevin** : *"CMCteams fait remonter problèmes/actions/historique à l'IA Apex.
L'IA Apex corrige, répare, améliore. Si elle n'y arrive pas, elle écrit à Claude Code
qui patch le code à la prochaine session. Tout en autonomie."*

### Chaîne complète

```
Sentinelle (n'importe quelle app)
    ↓ [err/warn détecté]
_sentinelLogFinding local + push ax_telemetry_in (Firebase shared)
    ↓
Firebase SSE broadcast
    ↓
Apex AI : fbStartListening écoute ax_telemetry_in
    ↓
_processIncomingTelemetry(buffer) :
  pour chaque entry non processed :
    _aiHandleIssue("cross-app-"+src+"-"+id, kind, msg)
      ↓ Claude Haiku 4.5 analyse + choisit action whitelist
      ├─ flushSyncQueue / emergencyCleanup / fbReconnect / resetStreaming → auto-exec
      ├─ escalateToClaudeCode(context, reason) → écrit dans ax_claude_todo
      └─ logOnly → notée
    entry.processed = true
    entry.processedBy = APP_VER
    entry.processedAt = Date.now()
ls("ax_telemetry_in", buffer)  // re-sync pour que les autres apps voient l'état
    ↓
ax_claude_todo (si escalade) → lu par Claude Code à la prochaine session utilisateur
    ↓
Claude Code : read outbox + patch + push via git
```

### Clés Firebase partagées (ajoutées à FB_FIX dans chaque app)

| Clé | Producteur | Consommateur | Usage |
|-----|-----------|--------------|-------|
| `ax_telemetry_in` | CMCteams, e-KDMC, futurs | Apex AI | Erreurs/warnings sentinelles à traiter |
| `ax_claude_todo` | Apex AI | Claude Code | Problèmes non résolus, fix code nécessaire |
| `ax_lessons_learned` | Tous | Tous | Mémoire cross-session, cross-projet |

### Garanties

- **Rate limit** : 1 appel IA/sentinelle/30min (coût API maîtrisé)
- **Dédup** : flag `processed` évite re-traiter la même entry
- **Buffer circulaire** : 100 entries max (ax_telemetry_in), 50 max (ax_claude_todo)
- **Admin-only** : l'IA ne réagit qu'en session admin (garde-fou)
- **Audit trail** : chaque étape log'ée dans `ax_sentinels_log` avec src/dest

### Propagation

- ✅ CMCteams v9.445 : `_pushTelemetryToApex` dans `_sentinelLogFinding`
- ✅ Apex v12.8 : `_processIncomingTelemetry` + `_escalateToClaudeCode` dans whitelist
- 🔄 e-KDMC : à ajouter dès le début
- 🔄 Futurs projets : copier-coller le pattern 4 lignes

---

## Bridge Sentinelles → IA (v9.442 / v12.6, Kevin 2026-04-20)

**Règle additionnelle non-négociable** : chaque sentinelle qui détecte un `err`
doit appeler l'IA locale avec contexte + whitelist d'actions. L'IA diagnostique,
choisit UNE action, auto-exécute si whitelist autorise.

### Pattern universel

```js
// Dans le log de la sentinelle (err uniquement)
if (kind === "err") _aiHandleIssue(sentinelId, severity, finding);

// Fonction universelle (à porter dans chaque projet)
function _aiHandleIssue(sentinelId, severity, finding) {
  // 1. Admin only + rate-limit 30min/sentinelle
  // 2. Construit prompt : "sentinel X a détecté Y, actions disponibles: [whitelist]"
  // 3. Appelle l'API (proxy ou direct), model: haiku-4-5 (rapide + cheap)
  // 4. Parse JSON { diagnostic, action }
  // 5. Exécute action si dans whitelist
  // 6. Log tout dans <prefix>_sentinels_log pour traçabilité
}
```

### Whitelist actions auto-exécutables

**Communes à tous projets** (safe, réversibles, non destructives) :

| Action | Effet |
|--------|-------|
| `flushSyncQueue` | Rejoue la queue offline |
| `emergencyCleanup` | Nettoie localStorage (vieilles convs/erreurs) |
| `fbReconnect` | Relance Firebase SSE |
| `resetStreaming` | Force K.isStreaming=false |
| `logOnly` | Noter sans action (diagnostic seulement) |

**Interdits en auto-exécution** : delete user, write to Firebase, send message,
network call externe. L'IA peut PROPOSER ces actions mais l'admin doit valider.

### Sécurité

- Admin uniquement (`A.user.id===AID` ou `axIsAdmin()`)
- Rate-limit strict 1 appel/sentinelle/30min (coût API maîtrisé)
- Model `claude-haiku-4-5-20251001` (rapide + économique, 200-400 tokens max)
- Timeout 12-15s avec AbortController
- Fallback silencieux si l'IA échoue (pas de toast anxiogène)
- Traçabilité complète dans `<prefix>_sentinels_log` + `ai-handler` entries

### Propagation (à répliquer)

- ✅ CMCteams v9.442 (`_cmcAiHandleIssue`)
- ✅ KDMC Apex v12.6 (`_aiHandleIssue` + `_aiHandleWhitelist`)
- 🔄 e-KDMC (à faire quand le projet démarre)
- 🔄 Tous les futurs projets : obligatoire

---

## Règle permanente

**Kevin 2026-04-20** : *"Des sentinelles expert autonomes dédiées pour augmenter
la performance, la sécurité, le fonctionnement, etc., dans tous les projets. Leur
donner toutes les tâches importantes à exécuter en autonomie totale."*

→ Appliqué à CMCteams (v9.438+), KDMC Apex AI (v12.4+), et tous projets à venir.


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
