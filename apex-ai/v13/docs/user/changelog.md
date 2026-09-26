# Changelog Apex AI

Historique des versions et nouveautés.

## v13.0.82 — 2026-05-04 (actuel)

### ✨ Nouveautés
- **RGPD complet** : export JSON, suppression cascade, registre traitements, opt-out IA, opt-out automation
- **Cookie banner** : consentement granulaire (analytics, marketing)
- **Documentation utilisateur** : 10 guides intégrés
- **i18n 5 langues** : Français, English, Italiano, Español, Deutsch
- **CGU / CGV / Privacy / DPA / Mentions légales** : conformité EU complète
- **Vue Légal** : accès depuis Réglages → RGPD
- **Sélecteur langue** dans Réglages

### 🛡 Sécurité
- Audit Big4 + OWASP ASVS L2 = 95/100 réel
- Chiffrement AES-GCM 256 + PBKDF2 200k itérations
- Audit log immutable (hash chain)
- Sentinelles continues anti-intrusion

### 🚀 Performance
- Bundle gzip < 50 KB initial
- Lazy-loading code-splitting
- Service Worker cache strategies optimisées

### 🐛 Corrections
- Fix `_axCheckRemoteVersion` détection update auto
- Fix `axHardLogoutSession` préservation XP/streak/profil
- Fix wake word iOS Safari (continuous=false)

## v13.0.71 — 2026-05-02

### Nouveautés
- Détecteur anomalies consommation API
- Bilan financier (admin)
- Memory bridge (Notion / GitHub Gist / Firebase)
- Auto-backup avec restore

## v13.0.50 — 2026-04-28

### Nouveautés
- Sentinelles registry (17+ agents)
- Apex Toolbox (60+ outils)
- Knowledge Bank (KB structurée)
- Self-diag automatique
- Apex Execute (parité Claude Code)

## v13.0.20 — 2026-04-22

### Nouveautés
- Refonte v13 : monolithe → modules ES6
- Vault redesign (chiffrement renforcé)
- AI Router multi-providers (Claude, OpenAI, Gemini, Groq)
- Wake word "Dis Apex"

## v12.785 — 2026-04-19

### Nouveautés
- Studios complets (10 modules créatifs)
- Modules pro (8 expertises)
- Compte admin Kevin reconnu via tous aliases
- Permissions tiered Laurence

### Corrections
- Fix sécurité critique : `ax_pin` per-user (anti-impersonation)
- Fix `ax_user` jamais dans FB_FIX

## v12.500 — 2026-04-15

### Nouveautés
- Compression LZ-string UTF16 (économie mémoire iPhone)
- IDB shadow auto-fallback si quota dépassé
- Cleanup agressif auto 30 min

## v12.300 — 2026-04-10

### Nouveautés
- Auto-deploy Cloudflare Workers
- Push notifications PWA
- Reconnaissance vocale per-user

## v12.0 — 2026-04-01

### Nouveautés
- Architecture multi-tenant
- Apex IA self-improvement
- Cross-app pipeline (Apex ↔ CMCteams)

## Anciennes versions

Pour les versions antérieures (v9, v10, v11), consulte le repository GitHub :
https://github.com/9r4rxssx64-creator/CMCteams/commits/main

## Plan de roadmap

### v13.1 (2026-05-15)
- WhatsApp OTP intégré natif
- Stripe Checkout intégré
- Dashboard équipe Business

### v13.2 (2026-06-01)
- Multi-langues IA réponses (matching locale user)
- TTS ElevenLabs intégré
- API Apex publique (Pro/Business)

### v13.5 (2026-07-01)
- Hébergement EU strict (Enterprise)
- SSO SAML/OIDC
- Plugin marketplace

### v14 (2026-Q4)
- Vidéo conférence intégrée
- Document signatures (Yousign API)
- Project management

## Vote nouvelles fonctionnalités

Suggérer / voter : Réglages → Roadmap → "Suggérer feature"

---

*Mises à jour automatiques. Tu n'as rien à faire pour bénéficier des nouveautés.*
