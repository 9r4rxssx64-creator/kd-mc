# 🔒 Apex Chat — Modèle de sécurité

> ⚠️ **Audit 17/09/2026 — ce document décrivait une architecture qui n'existe pas.** Ce qui est
> RÉELLEMENT dans le code (`lib/crypto-core.js`) : ECDH P-256 + HKDF-SHA256 + AES-GCM-256, clés
> dérivées en PBKDF2 100 000 itérations, ratchet symétrique (forward secrecy). **Aucun
> Kyber/PQXDH, aucun libsodium, aucun Ed25519, aucun sealed sender.** Le serveur n'est pas
> « aveugle » : il stocke les messages tels qu'envoyés (chiffrés quand la session E2E est
> établie, sinon en clair — l'interrupteur admin `e2e_strict` impose désormais le chiffré).
> Les sections ci-dessous marquées « (cible, non livré) » sont conservées comme intention
> produit, pas comme description de l'existant. Règle Kevin « vérité, rien de faux ».


> Version 1.0 — 2026-04-27
> Audit externe Phase 9 obligatoire avant lancement public

---

## 1. Modèle de menace

### 1.1 Acteurs et accès

| Acteur | Peut voir | Ne peut PAS voir |
|--------|-----------|------------------|
| Toi | Tous tes messages (déchiffrement local) | — |
| Tes contacts | Pseudo + photo + bio + statut "en ligne" (toggle par contact) | Vrai nom, tel, email, conversations privées |
| **Admin Kevin (Option A)** | Pseudo + vrai nom + fiche complète au clic + conversations (clé maître invisible) | — (admin total côté client) |
| Serveur Cloudflare | Métadonnées (qui→qui, quand, taille) | Contenu chiffré (mathématiquement illisible) |
| Hacker / gouvernement | Métadonnées si breach serveur | Contenu des messages chiffrés de bout en bout (ECDH P-256 / AES-GCM) |

### 1.2 Communication marketing
- ✅ "Chiffré de bout en bout par défaut (ECDH P-256 + AES-GCM-256)"
- ❌ JAMAIS "chiffrement militaire", "serveur aveugle", "post-quantum" — le code ne le tient pas
- ❌ JAMAIS "inviolable" (mensonge en Option A car Kevin lit côté client)
- ⚠ Mention discrète CGU : "modération admin pour la sécurité du service privé"

---

## 2. Crypto E2E — cible PQXDH (NON LIVRÉ ; l'existant est ECDH P-256, voir bandeau)

### 2.1 Spec
- **Identité** : Ed25519 (signature) + Curve25519 (ECDH)
- **Post-quantum** : Kyber-768 (NIST L1) — résistant aux ordinateurs quantiques futurs
- **Échange de clés** : X3DH + PQXDH (Signal Protocol)
- **Ratchet** : Double Ratchet (forward secrecy + post-compromise security)
- **Chiffrement message** : ChaCha20-Poly1305 (libsodium)
- **Sealed sender** : routage opaque côté serveur

### 2.2 Bibliothèques
- `libsodium-wrappers@0.7.x` (CDN, lazy load)
- `kyber-crystals-js@1.x` (CDN, lazy load)
- `double-ratchet-js` (custom léger inspiré libsignal)

### 2.3 Stockage clés privées
- `crypto.subtle.importKey(..., extractable=false)` — non-extractable
- IndexedDB key store
- Wrappées AES-GCM avec clé dérivée du PIN (PBKDF2 100k iterations)
- FaceID/TouchID via WebAuthn pour déverrouiller le PIN (Phase 2)

### 2.4 Backup E2E
- Bundle clés exporté chiffré localement
- Mnémonique BIP39 12 mots dérivée
- Upload optionnel iCloud Drive (iOS) / Google Drive (Android) via Web Share Target API
- Récupération : saisir les 12 mots → re-import keys

---

## 3. Kevin admin invisible (Option A)

### 3.1 Mécanisme
- Flag `KEVIN_INVISIBLE_ADMIN=true` dans `D1.system_config`
- Lors de `addRecipientsToRatchet(conv, members)` (worker `api-worker`), si flag true → ajoute la clé maître Kevin au sender-key tree
- Le bandeau UI ne liste jamais Kevin
- Le compteur `member_count` affiche n−1
- Côté Kevin : déchiffrement client comme un membre normal

### 3.2 Bascule Option B (vrai E2E)
- `UPDATE system_config SET value='false' WHERE key='KEVIN_INVISIBLE_ADMIN'`
- Job `e2e-revoke-master-key` (Cloudflare Queue) :
  - SELECT toutes conversations actives
  - Pour chacune : `rotateRatchetWithoutMaster(convId)` côté ConversationDO
  - Force fresh prekey rotation pour tous les members
- Aucun changement schéma DB ni refactor code
- Kevin perd l'accès aux nouveaux messages (anciens reste accessibles dans D1 par metadata mais ciphertexts deviennent illisibles sans master key)

---

## 4. Sécurité front (PWA)

### 4.1 CSP strict
```
default-src 'self';
script-src 'self' 'sha256-<hash>' https://cdn.jsdelivr.net https://www.gstatic.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://imagedelivery.net;
connect-src 'self' wss://*.workers.dev https://*.workers.dev https://*.firebaseio.com https://*.googleapis.com;
worker-src 'self';
frame-src 'none';
base-uri 'self';
form-action 'self';
```

### 4.2 SRI sur libs externes
Toutes les libs CDN incluent `integrity="sha384-..."` et `crossorigin="anonymous"`.

### 4.3 Pas de cookies de tracking
Stockage : `localStorage` + IndexedDB uniquement. Pas de pixels publicitaires, pas d'analytics tiers.

### 4.4 WebCrypto non-extractable
Toutes les clés privées : `extractable: false`. Impossible à exfiltrer même avec XSS.

### 4.5 Anti-screenshot iOS (Phase 2)
- Détection via `addEventListener` + `UIApplicationUserDidTakeScreenshotNotification` (PWA WebKit)
- Notification dans la conv : "X a fait une capture d'écran"
- Watermark dynamique pseudo + timestamp en overlay (rend les captures traçables)

---

## 5. Sécurité serveur (Cloudflare)

### 5.1 Auth JWT HS256
- Secret en Cloudflare Secret (`JWT_SIGN_KEY`)
- TTL 30 jours
- Vérification systématique sur chaque endpoint authentifié
- Header `Authorization: Bearer <token>`

### 5.2 Rate limiting
- OTP : 5/h/IP via table `ratelimit_otp` (lit `OTP_RATE_LIMIT_PER_HOUR` config)
- Invitations : 50/jour/user
- Messages : 100/min/user (Cloudflare Workers Rate Limit API)
- Login fails : verrouillage progressif (5 fails → 30s, 6 → 2min, 7 → 10min, 8 → 1h, 9 → 24h)

### 5.3 Anti SIM swap
- Table `device_trust` : hash IMEI + UA + IP region
- Détection nouveau device → forçage re-OTP + alerte push aux autres devices
- Cooldown 24h avant accès complet sur nouveau device

### 5.4 Audit log obligatoire
Toute action admin écrit dans `audit_log` :
- `view_user_card_full` (clic pseudo admin)
- `kick_user`, `ban_user`
- `export_conv`, `broadcast_notif`
- `admin_command` (chaque tool IA admin)

Stocke : `actor_id`, `action`, `target_type`, `target_id`, `details` (JSON), `ts`, `ip_hash`, `user_agent`.

### 5.5 Confirmation 2-step pour destructifs
Tools `kickUser`, `banUser`, `deleteConv`, `exportConv` → exigent `confirm_token` :
- Modal user demande "Tape KEVIN-CONFIRM-2025"
- Push admin sur autre device pour validation finale
- Audit log avec les 2 facteurs

### 5.6 Validation entrée stricte
- Schémas inline (zod-like)
- SQL parameterized queries (jamais concaténation)
- HTML sanitization (DOMPurify côté front si médias HTML)
- Phone E.164 regex strict

---

## 6. Données collectées (RGPD)

### 6.1 Obligatoires (fonctionnement)
- Numéro téléphone vérifié SMS (auth)
- Pseudo (3-20 chars alphanum)
- Vrai nom (visible Kevin admin uniquement)
- Métadonnées messages (qui→qui, quand, taille — 30 jours TTL)

### 6.2 Optionnelles (choix user)
- Photo profil, bio courte, email (récupération)
- Localisation (uniquement si activé partage)
- Carnet d'adresses (pour matching contacts Apex Chat)

### 6.3 Jamais collecté
- Contenu messages déchiffré (mathématiquement impossible côté serveur)
- Frappes clavier
- Géoloc passive
- Voiceprints (chiffrés client-side avant upload, jamais lisibles serveur)

---

## 7. Droits utilisateur RGPD

| Droit | Endpoint | Délai |
|-------|----------|-------|
| Accès | `GET /api/users/me/export` | Immédiat |
| Portabilité | `GET /api/users/me/export?format=zip` (JSON + médias) | Immédiat |
| Rectification | `PATCH /api/users/me` | Immédiat |
| Effacement | `DELETE /api/users/me` | Sous 7 jours |
| Opposition | Désinstallation app + notification | Immédiat |

---

## 8. Sous-traitants (RGPD article 28)

- **Cloudflare Inc.** : hébergement Workers + D1 + R2 + Queues. SCCs RGPD-compliant. Région UE par défaut.
- **Firebase / Google** : Auth Phone (numéro + token) uniquement. SCCs.
- **Vonage** : SMS invitations + OTP fallback (numéros uniquement, pas de contenu).
- **Anthropic** : requêtes IA (uniquement si user demande explicitement).
- **OpenAI / Google AI / Groq / OpenRouter** : failover IA (uniquement si user demande).

DPA contractuel signé avec chaque sous-traitant. Aucun ne reçoit de contenu chiffré E2E.

---

## 9. Failles de sécurité (notification 72h)

En cas de breach affectant données personnelles (numéros, pseudos), notification users sous 72h conformément RGPD article 33.

Plan d'incident :
1. Containment (couper accès)
2. Évaluation impact (logs, scope)
3. Notification CCIN Monaco (si applicable)
4. Notification users
5. Post-mortem public (si > 1000 users impactés)

---

## 10. Bugs sécu connus à éviter (leçons Apex)

### 10.1 Bug "3 points infini" (Apex v12.365 — résolu)
**Causes cumulatives** :
1. Hardcoding URL `https://api.anthropic.com/v1/messages` au lieu de lire `apex_proxy_url`
2. Filter `typeof content === "string"` droppait `tool_use`/`tool_result`/image
3. Pas d'`AbortController` → fetch zombie

**Règles permanentes Apex Chat** :
- ✅ Lire `apex_proxy_url` AVANT de hardcoder
- ✅ JAMAIS filter content array par `typeof === "string"`
- ✅ TOUJOURS `AbortController` + `signal.abort()` dans timeout
- ✅ Pre-commit hook detect `catch(_){}` patterns vides

### 10.2 Pattern critique : `_axSafeCatch(ctx, e)`
Tout `try/catch` DOIT logger via `_axSafeCatch` (pas `catch(_){}` silencieux). Permet escalade automatique si pattern récurrent.

### 10.3 Firebase SSE `null` overwrite
Bug connu : Firebase SSE peut écraser localStorage avec `null`. Règle : si `d.data === null` ET `localStorage.getItem(k)` non vide → GARDER la valeur locale + push vers Firebase pour réparer.

### 10.4 ax_pin per-user vs global
Stockage PIN strictement scopé : `ax_pin_<userId>` (per-user) vs `ax_pin` (global admin Kevin réservé). Audit boot strict.

### 10.5 ax_user dans FB_LOCAL strict
L'objet `user/session/identity` JAMAIS sync Firebase (cross-device pollution). Validation au boot : `K.user.id === ax_uid`, sinon force logout + audit.

---

## 11. Audit externe (Phase 9)

### 11.1 Prestataires recommandés (FR)
- **Synacktiv** (référence pentest crypto)
- **Quarkslab** (top crypto + reverse engineering)
- **Lexfo** (bonne réputation Web app pentest)

### 11.2 Scope audit
1. **Pentest webapp** : OWASP Top 10 + auth bypass + injection + XSS + CSRF
2. **Crypto review** : implémentation PQXDH + ratchet + key storage
3. **Threat model** : attaquants externes + admin malveillant + supply chain
4. **Privacy audit** : conformité RGPD, sous-traitants, transferts internationaux
5. **Code review** : workers + ConversationDO + crypto inline

### 11.3 Budget estimé
8 000 € à 15 000 € HT (selon scope + nombre de jours).

### 11.4 Critères pré-audit
- Aucun secret hardcodé
- Tests crypto avec vecteurs Signal officiels passés
- CSP strict en place
- Audit log complet
- DPIA (Data Protection Impact Assessment) rédigé

### 11.5 Critères pré-lancement
- Audit externe sans P0 ouvert
- Plan de réponse incident écrit
- DPO désigné (Kevin DESARZENS)
- Déclaration CCIN Monaco si applicable

---

## 12. Conformité légale

- **RGPD** (UE) — articles 5, 6, 7, 13, 25, 28, 32, 33
- **Loi 1.165** Monaco (données personnelles)
- **Code pénal FR art. 226-15** (interception correspondance privée)
- **DSA** (Digital Services Act) si > 50 users en UE
- **COPPA** (US) — interdit aux <13 ans
- **CGU contractuelle privée** acceptée explicitement par chaque user (Option A)

---

## 13. Liens

- [ARCHITECTURE.md](./ARCHITECTURE.md) — vue technique
- [PIVOT_PLAN_B_C.md](./PIVOT_PLAN_B_C.md) — bascule modèle admin
- [ROADMAP.md](./ROADMAP.md) — 9 phases
