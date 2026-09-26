# 💬 Apex Chat

**Messagerie privée avec IA Apex intégrée.**
Chiffrement de bout en bout : **ECDH P-256 + HKDF-SHA256 + AES-GCM-256** (clés
dérivées en PBKDF2 100 000 itérations). Transport en HTTPS, serveur privé.

> ⚠️ **Honnêteté (corrigé le 2026-09-05, audit)** — ce README annonçait
> « chiffrement militaire post-quantum (PQXDH) » et « serveur aveugle ».
> **Les deux étaient FAUX** et sont corrigés ici :
> - **Aucun post-quantique** dans le code : zéro Kyber, zéro ML-KEM. `PQXDH`
>   n'existe que comme texte de remplissage (`'PENDING_PQXDH'`) dans une colonne
>   de base. Le chiffrement réel (ci-dessus) est solide, mais **classique**.
> - **Pas « aveugle » en mode A** : le compte admin (`kdmc_admin`) est membre
>   invisible de chaque conversation (`KEVIN_INVISIBLE_ADMIN`).
>
> Règle Kevin « vérité, rien de faux, partout toujours » : ne jamais réintroduire
> une allégation de sécurité que le code ne tient pas.

> Repo : `9r4rxssx64-creator/cmcteams` — dossier `messaging-app/`
> Status : **en production** (front ~16 000 lignes, worker ~5 900, DO ~820)
> Live : `https://apex-chat.kd-mc.com/` (adresse officielle ; l'ancienne adresse github.io est un miroir technique)

---

## 📂 Structure

```
messaging-app/
├── index.html              # PWA monofichier (~16 300 lignes)
├── sw.js                   # Service Worker (3 caches static/runtime/offline)
├── manifest.json           # PWA installable iOS/Android
├── cgu.html                # CGU variante A (cercle privé contractuel)
├── privacy.html            # Charte privée RGPD-compliant
├── force-update.html       # Force refresh SW
├── force-logout.html       # Force logout user
├── diag.html               # Diagnostics techniques
├── robots.txt
├── sitemap.xml
├── og-image.svg
├── icons/
│   ├── icon.svg            # Icône principale 192×192
│   └── favicon.svg         # Favicon 32×32
├── d1-migrations/
│   └── 0001_init.sql       # Schéma D1 complet (16 tables)
├── workers/
│   ├── wrangler.toml       # Config Cloudflare
│   ├── api-worker.js       # API REST + WebSocket upgrade (livré)
│   ├── push-worker.js      # Push notifs Web Push + APNs + FCM (livré)
│   ├── sms-worker.js       # SMS invitations Vonage (livré)
│   ├── ia-worker.js        # IA failover + cache LRU (livré)
│   └── durable-objects/
│       └── ConversationDO.js   # 1 DO par conversation (livré)
├── docs/
│   ├── ARCHITECTURE.md     # Architecture technique (livré)
│   ├── SECURITY.md         # Modèle sécurité + crypto (livré)
│   ├── PIVOT_PLAN_B_C.md   # Bascule A→B→C sans refactor (livré)
│   └── ROADMAP.md          # 9 phases de développement (livré)
├── PROJECT_MEMO.md         # Mémoire vivante des décisions (40K)
└── README.md               # Ce fichier
```

---

## 🚀 Stack technique

| Couche | Tech | Pourquoi |
|--------|------|----------|
| Frontend | PWA monofichier (vanilla JS) | Pas de framework, pas de build, déployé GitHub Pages |
| Backend API | Cloudflare Workers | Scale infini, ~10× moins cher que Firebase à 1M users |
| Real-time | Durable Objects (1 DO/conv) | WebSocket persistant, état ratchet en mémoire |
| Database | Cloudflare D1 (SQL) | Sharding préparé Day 1 (colonne `shard_id` virtuelle) |
| Médias | Cloudflare R2 | Stockage illimité, zero egress fee |
| Auth | Code SMS (Vonage) + lien d'invitation magique + SSO kd-mc.com (Face ID) | Firebase n'est PAS utilisé pour l'authentification (variable héritée) |
| Crypto | ECDH P-256 + HKDF-SHA256 + AES-GCM-256 + ratchet symétrique | Classique et solide — **rien de post-quantique** (voir bandeau en tête) |
| Push | Cloudflare Worker dédié | Web Push (VAPID) + APNs + FCM cross-platform |
| IA | Anthropic + failover (OpenRouter / Gemini / Groq / OpenAI) | Cache LRU 60-70% hit rate, divise coûts par 7 |
| Self-healing | Cloudflare Queues → Apex `ax_telemetry_in` | Pipeline cross-app vers Claude Code |

---

## 👥 Comptes pré-configurés (Phase 1, validés et opérationnels)

| ID | Pseudo | Vrai nom | Email | Rôle | Premium |
|----|--------|----------|-------|------|---------|
| `kdmc_admin` | `kevin` | Kevin DESARZENS | kevind@monaco.mc | Admin (Kevin alias reconnu) | ∞ |
| `user_laurence` | `laurence` | Laurence SAINT-POLIT | — | Family (épouse Kevin) | ∞ |
| `user_tardieu_sandrine` | `sandrine` | Sandrine TARDIEU | — | Client (test) | Non |
| `user_tardieu_christophe` | `christophe` | Christophe TARDIEU | — | Client (test) | Non |

**PIN admin** : `‹code admin›` (modifiable). **PIN clients test** : ‹défini hors dépôt› (à changer à la 1ère connexion).

**Contact mutuel pré-créé** : Kevin ↔ Laurence avec une conversation DM `conv_kevin_laurence` opérationnelle Day 1.

---

## 🔐 Sécurité — Modèle de menace

| Acteur | Peut voir |
|--------|-----------|
| Toi | Tes messages (déchiffrement local FaceID/PIN) |
| Tes contacts | Pseudo + photo + bio + statut "en ligne" (toggle par contact) — vrai nom JAMAIS révélé |
| **Admin Kevin (Option A)** | Pseudo + vrai nom, fiche complète au clic, conversations (clé maître invisible) |
| Serveur Cloudflare | Métadonnées (qui→qui, quand, taille) — contenu chiffré, ILLISIBLE |
| Hacker / gouvernement | Métadonnées en cas de fuite serveur ; contenu illisible quand le chiffrement de bout en bout est établi (sinon : texte stocké, cf. `e2e_strict`) |

**Bascule prévue** :
- **Option A** (active) : Kevin admin lit tout côté client, marketing "privé entre nous"
- **Option B** : retirer la clé maître Kevin, vrai E2E grand public (1 seul flag à modifier dans `system_config`, job `e2e-revoke-master-key` rotate les ratchets sans master key)
- **Option C** : pivot B2B compliance (casinos, banques, hôpitaux) avec audit trail

Voir `docs/PIVOT_PLAN_B_C.md` pour détails.

---

## 🔗 Intégration Apex (cross-app)

Apex Chat est **intégré à Apex** et auto-géré par Apex IA :
- **SSO cross-app** : compte Apex = compte Apex Chat (token JWT partagé)
- **Bouton "💬 Apex Chat"** dans la nav Apex (user + admin)
- **IA Apex** pilote Apex Chat en autonomie totale (commands, sentinelles, self-healing)
- **Push notifications** unifiées (1 seul worker `apex-push-worker.workers.dev`)
- **Vue admin** Kevin : données Apex Chat dans `vUserActivity` Apex
- **Mémoire partagée** par contact (`ax_persistent_memory_<uid>`)
- **Pipeline self-healing** : sentinelles Apex Chat → CF Queues → Apex `ax_telemetry_in` → Claude Code

---

## 🛠 Comment démarrer (dev)

### Prérequis
- Compte Cloudflare (Workers + D1 + R2 + Queues)
- Compte Firebase (Auth Phone)
- Wrangler CLI : `npm i -g wrangler`
- Node 20+

### Setup local
```bash
cd messaging-app/workers
wrangler login
wrangler d1 create apex-chat-main
# → copier l'ID dans wrangler.toml
wrangler d1 execute apex-chat-main --file=../d1-migrations/0001_init.sql
wrangler r2 bucket create apex-chat-media
wrangler kv:namespace create APEX_CHAT_CACHE
# → copier les IDs dans wrangler.toml

# Définir les secrets
wrangler secret put JWT_SIGN_KEY
wrangler secret put FIREBASE_API_KEY
wrangler secret put VONAGE_API_KEY
# ... (voir wrangler.toml liste complète)

# Déployer
wrangler deploy
```

### Frontend (GitHub Pages)
Le push sur `main` déclenche automatiquement le déploiement via `.github/workflows/deploy.yml`.
Live URL : `https://apex-chat.kd-mc.com/` (servie par le routeur kd-mc.com depuis GitHub Pages)

---

## 📚 Documentation

- **`PROJECT_MEMO.md`** : mémoire vivante de toutes les décisions Kevin
- **`docs/ARCHITECTURE.md`** : architecture technique détaillée
- **`docs/SECURITY.md`** : modèle de menace + crypto E2E
- **`docs/PIVOT_PLAN_B_C.md`** : plan bascule modèle admin
- **`docs/ROADMAP.md`** : 9 phases de développement

---

## 🎯 Roadmap résumé

| Phase | Sprint | Livrables |
|-------|--------|-----------|
| 1. Foundation | S1 | PWA scaffold + auth + comptes pré-config + triple persistence |
| 2. Crypto E2E | S1-S2 | ECDH P-256 + ratchet symétrique (livré) — pas de PQXDH |
| 3. Chat de base | S2 | DM + threads + médias + receipts granulaires |
| 4. Groupes | S2-S3 | Groupes 1024 + communautés + channels broadcast |
| 5. Appels | S3 | WebRTC P2P 4 max + activities + replay |
| 6. Vue admin | S3 | Light user + Puissante Kevin + chat IA admin tools |
| 7. IA + Innovations | S3-S4 | Résumé + traduction + Time Capsule + Letters + Memory Lane |
| 8. Mini-apps | S4 | Studios Apex + paiement QR + Watch + CarPlay |
| 9. Sentinelles + Tests | S4-S5 | 13 sentinelles + load test + audit externe + Stripe |

---

## 📞 Contact

**Kevin DESARZENS** — `kevind@monaco.mc`
Monaco — Casino Monte-Carlo
Repo issues : [GitHub](https://github.com/9r4rxssx64-creator/CMCteams/issues)

---

## 📜 Licence

Privé, propriétaire **Kevin DESARZENS**. Tous droits réservés.
Usage limité au cercle privé invité (Option A).
