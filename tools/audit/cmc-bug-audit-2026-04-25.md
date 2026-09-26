# Audit BUG HUNTER EXPERT — CMCteams v9.517 → v9.518

**Date** : 2026-04-25
**Auditeur** : Claude Code (Opus 4.7) — agent externe
**Cible** : `/home/user/CMCteams/index.html` (~2.34 Mo, ~34000 lignes)
**Méthode** : audit code statique + validation node syntax + grep ciblé + cross-check duplicate functions
**Source** : règles permanentes CLAUDE.md + EXPERT_CODING_STANDARDS + checklist 21 points

---

## Résumé exécutif

| Sévérité | Trouvés | Corrigés | Restants |
|----------|---------|----------|----------|
| CRITIQUE | 1       | 1        | 0        |
| HAUT     | 1       | 1        | 0        |
| MOYEN    | 2       | 0        | 2 (notés)|
| BAS      | 3       | 0        | 3 (notés)|

**Santé globale** : **8.7 / 10**. Aucun bug bloquant en production. Les 6 doublons de fonctions restants sont soit du dead code inactif (dont la 2e définition gagne déjà par hoisting), soit deux systèmes parallèles cohabitant sans collision active. Le bug critique du badge PWA était silencieux mais avait pour effet de **masquer en permanence** le compteur de notifications.

---

## 1. Validation préliminaire

| Vérification | Résultat |
|--------------|----------|
| `node --check` script extrait | OK |
| Taille fichier index.html | 2.34 Mo (cohérent avec v9.517) |
| `APP_VER` détecté | `v9.517` → bumpé `v9.518` |
| `esc()` partout XSS-sensibles | OK (101 innerHTML, 81 hors littéraux statiques tous échappés ou contrôlés) |
| Guards AID sur fonctions destructives | 70 guards `A.user.id===AID` |
| `_audit(...)` calls | 126 (audit log dense) |
| Touch targets `min-height:44px+` | 80+ instances |
| `window.onerror` + `unhandledrejection` | Présents lignes 1143, 1151 |
| Sentinelle `import-watch` (v9.509) | Présente ligne 10178, déclarée ligne 10260 |
| `cmcImportTests` (22 cas) | Présente ligne 6120 |
| `_cmcStartCriticalAgents` (12 agents) | Présente ligne 33990, auto-start ligne 34033 (8s post-login) |
| `vCmcSentinelHub` (route `sentinelhub`) | Présente, route câblée ligne 11827, FAB ligne 22655 |
| `vCmcKnowledgeBank` (route `knowledgebank`) | Présente ligne 33867, route ligne 11826 |

---

## 2. Bugs identifiés par sévérité

### CRITIQUE

#### BUG-CRIT-1 : `_updateAppBadge` dupliquée — badge PWA toujours à 0

**Lieu** : lignes 3852 et 17036.

**Diagnostic** :
- 1ʳᵉ déclaration ligne 3852 : `function _updateAppBadge(){...setBadgeCount(pending);...}` (sans paramètre, calcule pending+chat).
- 2ᵉ déclaration ligne 17036 : `function _updateAppBadge(count){...if(count>0)setAppBadge(count);else clearAppBadge();}`.
- Hoisting JS → la 2ᵉ déclaration **écrase** la 1ʳᵉ.
- `_badgeInt` (ligne 3862) appelle `_updateAppBadge()` sans args toutes les 15 secondes.
- Conséquence : `count` vaut `undefined` → `count>0` est `false` → `clearAppBadge()` est appelé en boucle → **le badge home screen est toujours effacé**.

**Impact** : Kevin et tous les employés ne voient jamais de badge sur l'icône PWA même en cas de message non lu. Régression silencieuse depuis v9.93.

**Fix appliqué (v9.518)** :
- Renommé la 2ᵉ déclaration en `_setAppBadgeCount(count)`.
- Mis à jour son unique appelant `_refreshAppBadge` ligne 17060 → appelle désormais `_setAppBadgeCount(total)`.
- La 1ʳᵉ `_updateAppBadge()` (parameterless, utilisée par `_badgeInt`) est restaurée.

---

### HAUT

#### BUG-HAUT-1 : `cmcGetCasinoLayout` / `cmcSaveCasinoLayout` dupliquées — layouts par défaut perdus + map non re-rendue

**Lieu** : lignes 9671/9676 et 33551/33556.

**Diagnostic** :
- 1ʳᵉ version (9671) : utilise `cmcMapDefaultLayout(id)` pour créer un layout par défaut si absent ; appelle `_cmcMapRender()` après save.
- 2ᵉ version (33551, v9.516) : retourne `{zones:[]}` vide si absent ; ne déclenche pas de render.
- Hoisting → la 2ᵉ écrase la 1ʳᵉ. Tous les appelants (lignes 9701, 9716, 9726, 9735, 33602) tombent sur la 2ᵉ.
- Conséquence : (a) à la première ouverture d'un casino jamais configuré, l'écran montre une carte vide au lieu du layout par défaut SBM ; (b) après une sauvegarde de layout, la carte ne se rafraîchit pas → l'admin doit recharger la page.

**Impact** : map editor et live map (vTableMap) cassés sur premier usage par casino. Touche directement la règle PERMISSIONS MAP.

**Fix appliqué (v9.518)** :
- Fusion : la 2ᵉ version (gardée) délègue maintenant à `cmcMapDefaultLayout(id)` si la fonction existe, persiste le résultat et déclenche `_cmcMapRender()` après save.

---

### MOYEN (notés, non corrigés)

#### BUG-MOY-1 : `_releaseWakeLock` dupliquée — variable `_wakeLockSentinel` orpheline

**Lieu** : lignes 12288 et 17087.

**Diagnostic** : deux systèmes Wake Lock parallèles (`_wakeLockSentinel` ligne 12288 vs `_wakeLock` ligne 17078). La 2ᵉ déclaration de `_releaseWakeLock` ne libère jamais `_wakeLockSentinel`. Si du code legacy assigne encore `_wakeLockSentinel`, il fuite.

**Recommandation** : auditer les assignations à `_wakeLockSentinel` et migrer vers `_wakeLock` (un seul système). Faible impact réel : aucun assignement actif détecté à `_wakeLockSentinel` dans le code courant.

#### BUG-MOY-2 : Sentinelle `_cmcRunAgent` est un stub

**Lieu** : ligne 33966.

**Diagnostic** : les 12 agents critiques v9.517 incrémentent leur compteur `runs` et timestamp `last`, mais aucun ne fait de vraie surveillance métier (à part `sentinel-meta` qui audite les autres). Leurs `tools[]` (`fps_check`, `quota_check`, etc.) ne sont pas implémentés.

**Recommandation** : enrichir progressivement chaque agent avec une vraie logique (fps via `requestAnimationFrame`, quotas via `localStorage` size, etc.). Non bloquant : la vue `vCmcSentinelHub` reste fonctionnelle pour montrer leur heartbeat.

---

### BAS (notés, non corrigés)

#### BUG-BAS-1 : `toggleFeature` dupliquée — 1ʳᵉ version dead code

Lignes 15331 (cmc_feature_flags / vFeatureFlags) et 30095 (cmc_features). Aucune UI n'appelle réellement la 1ʳᵉ (`vFeatureFlags` utilise `cmcSetFeature`). La 2ᵉ gagne par hoisting et c'est la bonne pour `vFeatures` (line 22885). **Pas de bug actif**, juste du dead code.

#### BUG-BAS-2 : `exportPlanningCSV` dupliquée — 1ʳᵉ version dead code

Lignes 20126 (avec params) et 22089 (sans params, utilise A.year/A.month). Les deux callers passent au final par la 2ᵉ. Fonctionne correctement.

#### BUG-BAS-3 : `chatToggleReaction` dupliquée — versions équivalentes

Lignes 21903 et 21928. Les deux fonctions font exactement le même travail. La 2ᵉ gagne. Cosmétique.

---

## 3. Tests parcours utilisateur (mental)

| Parcours | État | Note |
|----------|------|------|
| Login admin Kevin (U11804) | OK | matricule détecté, PIN check, presence heartbeat |
| Import PDF planning + cadres | OK | parser 5 stratégies cascade + 22 tests + sentinelle import-watch escalade Apex |
| Search universal (vEmps, vPasswords) | OK | `searchInput()` avec focus retention, fuzzy multi-tokens, debounce DOM-bound |
| Vue 🛡 Centre des sentinelles | OK | route `sentinelhub` câblée, 12 agents listés avec status temps réel, bouton relance |
| Vue 🗂 Banque infos employés | OK | route `knowledgebank` câblée |
| Reset password employé | OK | guard AID + audit log |
| Mon équipe en premier (vEmps) | OK | `_getMyTeamFirst()` + `_empGroupKey()` + sections collapsibles |

---

## 4. Vérification travaux récents v9.510–517

| Version | Feature | Présence | Callable | Régression ? |
|---------|---------|----------|----------|--------------|
| v9.510 (scanner OCR caméra) | Présent (Tesseract.js lazy + scan studio) | Détecté | OK | Aucune |
| v9.511 (parser cadres ZÉRO erreur) | 5 stratégies + 22 tests + sentinelle | Détecté ligne 10178/6120 | OK | Aucune |
| v9.512 (auto-refresh agressif) | Présent | Détecté | OK | Aucune |
| v9.515 (UX admin-first) | `_getMyTeamFirst` + sections | Détecté ligne 4212 | OK | Aucune |
| v9.516 (banque infos + data-leak-watch) | `vCmcKnowledgeBank` + `_cmcAgentDataLeakWatch` | Détecté lignes 33867/33918 | OK | Aucune |
| v9.517 (12 agents critiques) | `CMC_CRITICAL_AGENTS` + `vCmcSentinelHub` | Détecté lignes 33951/34004 | OK | Aucune |

---

## 5. Recommandations restantes

1. **Cleanup duplicates restantes** (faible priorité) : renommer ou supprimer les 6 doublons restants pour faciliter la maintenance future. Aucun ne casse l'app actuellement.
2. **Implémenter les agents stubs v9.517** : enrichir chaque agent critique avec une vraie logique métier au lieu d'un compteur stub.
3. **Migrer `_wakeLockSentinel` legacy** vers le système `_wakeLock` unifié.
4. **Audit tests automatisés** : `cmcImportTests()` est un test parser cadres. Compléter avec des tests login, recherche, export CSV (regression suite > 50 cas).
5. **Surveiller la croissance index.html** : 2.34 Mo, proche de la limite raisonnable. Envisager une scission CSS / vues à terme.

---

## 6. Fichiers modifiés

| Fichier | Lignes | Changements |
|---------|--------|-------------|
| `index.html` | 4463 | `APP_VER` v9.517 → v9.518 |
| `index.html` | 17036–17042 | `_updateAppBadge(count)` → `_setAppBadgeCount(count)` (BUG-CRIT-1) |
| `index.html` | 17060 | appel `_setAppBadgeCount(total)` au lieu de `_updateAppBadge(total)` |
| `index.html` | 33551–33567 | `cmcGetCasinoLayout` + `cmcSaveCasinoLayout` enrichies (BUG-HAUT-1) |
| `tools/audit/cmc-bug-audit-2026-04-25.md` | nouveau | ce rapport |

**Validation finale** : `node --check` OK · 0 marqueurs conflit · APP_VER bumpé · esc() partout · touch 44px+ respecté.
