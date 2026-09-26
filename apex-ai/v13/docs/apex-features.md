# Apex AI — Catalogue des capacités

> **Version courante** : v13.3.41
> **Mis à jour** : 2026-05-07
> **Mission** : Préparation commercialisation e-Apex (Kevin règle "TOUT AU MAX")

---

## En 1 phrase

Apex est l'IA qui **agit pour toi** : pose une question, scan un papier, dis "Dis Apex" — l'outil adapté apparaît, sans menus.

---

## Capacités principales

### 🤖 IA Multi-Provider avec failover

| Provider | Usage | Failover |
|---|---|---|
| **Anthropic Claude** | Chat principal, raisonnement | ✅ |
| **OpenAI** | Code, traduction | ✅ |
| **Gemini** | Vision, multimodal | ✅ |
| **Groq** | Latence ultra-rapide | ✅ |
| **Mistral** | Français natif, RGPD-friendly | ✅ |

Si un provider tombe → bascule auto vers le suivant. Aucune interruption utilisateur.

### 🎙 60+ Voix premium

- **Web Speech** (10+) : voix système iOS/Android/Mac/Win
- **ElevenLabs Pro** (clone vocal, multilingue)
- **OpenAI TTS** : alloy, echo, fable, onyx, nova, shimmer
- **Effets temps réel** : helium, robot, echo, vieux, fantôme, super-héros, sorcier, chat, dragon, cartoon, megaphone, underwater, space, phone

### 🎨 15 Studios créatifs

| Studio | Capacités |
|---|---|
| 🎚 **Music Mix Pro** | 12+ pistes, EQ multi-bandes, reverb/delay/chorus, compresseur, limiter LUFS |
| 🎬 **Video Editor** | Timeline, cut, fade, captions auto, export MP4 |
| 📷 **Photo** | Filtres, recadrage, effets, retouche |
| 🏗 **Architecture** | RE2020, calcul surface, mélanges béton, normes PMR |
| 📄 **CV** | Templates pro + IA writing assistant |
| 🧾 **Facture** | Devis + facture + suivi paiement |
| 📋 **Contrat** | NDA, CDI, CDD avec ref légales |
| 🎤 **Présentation** | Slides + IA design |
| 🎵 **Clip Photo→Vidéo** | Animation auto depuis photos |
| 🪄 **Logo** | Branding Pantone strict + Comic Sans fun |
| 🌱 **Plant Studio** | Identification plantes + soins |
| 🌍 **Geo Studio** | Cartes interactives, GPS |
| 🏠 **Building Studio** | Réno + permis construire |
| 🌙 **Garden Lunar** | Calendrier biodynamique Conway |
| 🐾 **Pet Studio** | Suivi animaux, vétérinaire |

### 💼 8 Modules pro experts

| Module | Sources officielles | Niveau |
|---|---|---|
| 🍳 **Cuisine** | INCO 14 allergènes, 50+ recettes | Pro |
| 💊 **Médical** | Vidal, ANSM, IMC, urgences | Référence |
| 💰 **Finance** | IR FR 2026, PFU 30%, plus-values, Monaco fiscal | Expert |
| ⚖ **Légal** | 25+ codes français + Cassation/CE/CJUE/CEDH | Expert |
| 🌐 **Traducteur** | 30+ langues, mode interprète | Pro |
| 🛡 **Sécurité perso** | Self-defense, urgences | Standard |
| 📷 **Scan multi** | OCR, QR, vCard, BARCODE | Pro |
| 🎓 **Loisirs Pro** | Sports, musique, cinéma | Standard |

### 🔐 Coffre chiffré

- **AES-GCM 256** (PBKDF2 100k iterations)
- **Triple persistence** : localStorage + IndexedDB shadow + Firebase optionnel
- **Détection auto** 30+ types de credentials (API keys, IBAN, BTC, ETH, JWT, OAuth)
- **Auto-test validité** : ping API mineur (~$0.0001) à chaque ajout
- **Sentinelle expiry** : alerte 30j avant expiration

### 🛡 27 Sentinelles 24/7 auto-fix

| Sentinelle | Fréquence | Auto-fix |
|---|---|---|
| `token-watch` | 1h | Rotate API key from history |
| `backup-watch` | 6h | Snapshot + seed timestamp |
| `security-watch` | 1h | Rebuild chain hash si tampering |
| `memory-watch` | 1j | Compression + dedupe lessons |
| `network-watch` | 30s | Ping + reconnect Firebase |
| `storage-watch` | 30min | Cleanup agressif > 80% |
| `presence-watch` | 2min | Heartbeat |
| `smart-router-watch` | 5min | Mask provider failover |
| `ai-providers-health` | 5min | Failover next provider |
| `import-watch` | 1h | Retry parser strategies |
| `chat-watch` | 30s | Cancel + reprocess queue |
| `voice-quality-watch` | 1j | Reset wake recognition |
| **`innovation-watch`** | **7j** | **Scan npm/IA/HF + auto-update** |
| `persistence-watch` | 1h | Restore from IDB shadow |
| `conflict-watch` | 5min | Force fb pull + merge |
| `RGPD compliance-watch` | 1j | Re-fix consent |
| `anti-régression-watch` | 1j | Revert dernier commit fautif |
| `multi-key-health` | 30min | Re-test failing keys |
| `link-validation-watch` | 1j | HEAD test tous URLs |
| `regression-watch` | 1j | Subset critical tests |
| `dedup-watch` | 1j | Audit doublons UI |
| `tools-watch` | 1sem | Detect new APIs |
| `auto-fix-watch` | 5min | Audit pattern récurrent |
| `inventory-watch` | 1j | Auto-list nouveaux fichiers |
| `data-leak-watch` | 1h | Audit msgs non-enrichis |
| `data-persistence-watch` | 1j | Test login/logout cycle |
| `feature-watch` | 1h | Sim actions principales |

### 🧠 Mémoire long terme

- **Per-user** : `ax_persistent_memory_<uid>` (1000 facts max)
- **Catégories** : profile, preferences, relationships, projects, lessons, facts, goals, history
- **Auto-extract** depuis chat (regex NLP) : anniv, allergies, métier, lieu, projets
- **Cross-user admin** : Kevin (admin) voit la knowledge de tous
- **Lessons cross-app** : Apex apprend → CMCteams hérite (et inverse)

### 📱 Cross-platform identique

| Plateforme | Capacités |
|---|---|
| **iOS Safari PWA** | Push, NFC (lecture), Bluetooth, FaceID (WebAuthn) |
| **Android Chrome** | Push, NFC R/W, Bluetooth, USB, Serial, MIDI |
| **Desktop Chrome/Edge** | Tout + WebHID, WebUSB |
| **Safari macOS** | Tout sauf NFC/USB |

---

## Sécurité & conformité

### Chiffrement
- AES-GCM 256 pour tous les secrets au repos
- TLS 1.3 pour les communications réseau
- Hashage PBKDF2 100k iterations pour les PINs
- Chaîne hash audit log (tamper detection)

### Architecture local-first
- **Tout stocké chez toi par défaut** : localStorage + IndexedDB
- Firebase optionnel pour sync cross-device
- Aucun tracking analytics tiers
- Aucune télémétrie sans consentement explicite

### RGPD (Règlement européen 2018/679)
- Export complet JSON 1-clic (Réglages → RGPD)
- Suppression compte = effacement total < 24h
- Consentement opt-in pour chaque feature sensible
- Audit log immutable de tous les accès

### Permissions tiered
- **Niveau A — Auto** : utiliser studios, chat, voix, browser
- **Niveau B — Notify** : login/logout, achats, modif preferences (Kevin notifié)
- **Niveau C — Validate** : effacement compte, export complet, achat > 50€ (validation Kevin)

---

## Tarifs

| Plan | Prix | Limites | Idéal pour |
|---|---|---|---|
| **Free** | 0€/mois | 50 msg/j, 1 studio | Découverte |
| **Basic** | 9€/mois | 500 msg/j, 5 studios, voix premium | Usage régulier |
| **Pro** | 29€/mois | Illimité, tous studios, marketplace, API | Usage intensif |
| **Business** | Sur devis | White-label, multi-user, marketplace 30% | Entreprise |

Annulation 1-clic. 14 jours satisfait/remboursé.

---

## Comparatif concurrents

| Feature | Apex | Claude.ai | ChatGPT | Gemini |
|---|---|---|---|---|
| Multi-provider failover | ✅ | ❌ | ❌ | ❌ |
| Local-first | ✅ | ❌ | ❌ | ❌ |
| Studios créatifs | ✅ 15 | ❌ | ❌ | ❌ |
| Modules pro experts | ✅ 8 | ❌ | Plugins | ❌ |
| Voix temps réel | ✅ 60+ | ❌ | ✅ ~6 | ❌ |
| Cross-platform PWA | ✅ | ❌ | ❌ | ❌ |
| Sentinelles auto-fix | ✅ 27 | ❌ | ❌ | ❌ |
| Mémoire long terme | ✅ illimité | ⚠ Projects | ✅ Memories | ❌ |
| Open source | ✅ | ❌ | ❌ | ❌ |
| Prix entry | 0€ | 0€ | 0€ | 0€ |
| Prix pro | 29€ | 18€ (Pro) | 20€ (Plus) | 19€ (Advanced) |

---

## Cas d'usage

### Personnel
- "Compose-moi une chanson R&B pour l'anniv de Laurence"
- "Cherche les meilleurs vols Monaco-Tokyo en novembre"
- "Quelle était ma facture EDF de mars dernier ?" (mémoire long terme)

### Pro
- "Fais-moi un devis 3000€ pour client X avec mes coordonnées"
- "Quelle est la convention collective applicable pour un croupier monégasque ?"
- "Calcule l'IR 2026 sur 65000€ de revenus avec 2 enfants"

### Créatif
- "Logo doré sur fond bleu pour ma startup ApexLabs"
- "Mix mes 3 morceaux EDM avec sidechain"
- "Plan d'une cuisine 12m² ouverte sur séjour"

---

## Architecture technique (pour devs)

- **Stack** : TypeScript 5.6+, Vite 6, Vitest, Playwright
- **Bundle initial** : < 50 KB gzipped
- **Tests** : > 95% coverage statements, 100+ unit tests, 20+ E2E
- **PWA** : Service Worker triple cache (static / runtime / offline)
- **Cross-app bridge** : CMCteams ↔ Apex via Firebase shared
- **Pipeline** : sentinelle Apex → ax_claude_todo → GitHub Action cron 5min → Claude Code fix → handoff_journal

---

## Liens utiles

- 🌐 **App live** : https://9r4rxssx64-creator.github.io/CMCteams/apex-ai/v13/
- 🛒 **Landing commerciale** : https://9r4rxssx64-creator.github.io/CMCteams/apex-landing
- 📦 **GitHub** : https://github.com/9r4rxssx64-creator/cmcteams
- 📧 **Support** : kevin.desarzens@gmail.com

---

*Document généré v13.3.41 — Auto-mis à jour à chaque release majeure via sentinelle `capabilities-watch`.*
