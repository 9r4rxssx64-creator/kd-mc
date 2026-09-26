# RESEARCH_TRACKER.md — Recherches actives session 2026-04-21

> **Kevin demande** (2026-04-21) : "Fais les recherches et dote-toi des meilleures compétences. Apex + CMCteams. iPhone, Android Lenovo, objets connectés, tout." Plus question spécifique : "Télécommande universelle, smart TV toutes marques, montres, domotique, couteau suisse complet."

## 🔬 Agents lancés en parallèle (background)

| # | Focus | Document cible | Status |
|---|-------|---------------|--------|
| 1 | iOS avancé — PWA, Siri Shortcuts, Pushcut, Wallet, WebKit, jailbreak | `APPLE_IOS_SKILLS.md` (append) | 🟡 Running |
| 2 | Android Lenovo — Intent URLs, Tasker, Automate, TWA, ADB, Shizuku | `ANDROID_SKILLS.md` (new) | 🟡 Running |
| 3 | Google APIs — Gmail/Calendar/Drive/Sheets/Docs/Tasks/Maps/Vision | `GOOGLE_APIS_INTEGRATION.md` (new) | 🟡 Running |
| 4 | Automation Hub — Home Assistant, Broadlink, IFTTT, NFC, Proxmox | `AUTOMATION_HUB.md` (new) | 🟡 Running |
| 5 | Télécommande universelle — TVs, IR/RF/BLE/Zigbee, watches, speakers | `UNIVERSAL_REMOTE.md` (new) | 🟡 Running |

## 🎯 Objectif après récupération

1. Chaque .md référencé dans `_CLAUDE_HANDOFF` d'Apex → Apex IA connaît tout
2. Chaque .md référencé dans `buildIASystemPrompt` CMCteams → même chose
3. v12.33 : implémenter les **top 5 intégrations** de chaque catégorie (25 features concrètes ajoutées)
4. Nouveau tab Apex "🎮 Télécommande Universelle" (couteau suisse contrôle device)
5. Intégrer dans outils IA Apex : `apple_shortcut_run`, `android_tasker_trigger`, `google_gmail_send`, `home_assistant_call`, `tv_control(brand, cmd)`, `watch_send_notif`, etc.

## 📋 Plan d'intégration post-recherche

```
v12.33 (majeur) :
  - 25-50 nouveaux outils IA (smart TVs, watches, speakers, Google APIs, iOS shortcuts)
  - Nouveau tab "Télécommande Universelle" (UI simple : scan devices + boutons)
  - Refs docs dans _CLAUDE_HANDOFF
  - Intégration webhook générique (Pushcut, Tasker, HA) pour tout déclencher

v12.34 :
  - Google OAuth flow complet (bouton "Se connecter avec Google")
  - Gmail read/send + Calendar create natif dans le chat
  - Device auto-discovery via mDNS (Chrome)

v12.35 :
  - Matter/Thread support (si HA installé)
  - Apple Wallet .pkpass generator
  - Siri Shortcut creator (bouton "Ajouter à Siri" pour chaque action Apex)
```

## ⚡ Règle permanente

À chaque fois que Kevin acquiert un nouveau device → Apex doit savoir le contrôler. Je maintiens ce tracker + documents à jour en permanence.

---

**Créé** : 2026-04-21 par Claude Code
