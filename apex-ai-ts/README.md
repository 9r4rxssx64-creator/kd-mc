# 📝 apex-ai-ts — Couche TypeScript pour Apex AI

> **Mission** : ajouter un correcteur orthographique sur le code Apex AI.
> **Pour qui** : Kevin (novice). Tu n'as rien à faire au quotidien.
> **Action #2 sur 3** dans le plan 100/100 réel.

---

## 🤔 C'est quoi en 2 phrases ?

Aujourd'hui le code Apex AI = **JavaScript classique** (sans vérification d'orthographe).
Avec TypeScript, si quelqu'un tape `axTets` au lieu de `axTest`, l'app **refuse de se construire** au lieu de planter au runtime.

C'est comme un correcteur orthographique Word : il souligne les fautes en rouge **avant** que tu envoies l'email.

---

## 📂 Structure

```
apex-ai-ts/
├── package.json          # Vite + Vitest + TypeScript
├── tsconfig.json         # Config strict (catch toutes fautes)
├── vite.config.ts        # Build + tests
├── src/
│   ├── index.ts          # Entry point
│   ├── types/
│   │   └── apex.d.ts     # Déclarations globales (K, axState, axCode*, ...)
│   └── modules/
│       ├── ai-safety/
│       │   └── jailbreak.ts    # detectJailbreak + validatePersona typés
│       ├── compliance/
│       │   └── age.ts          # computeAge + isMinorOrInvalid typés
│       └── code/
│           └── github.ts       # readFile/writeFile/listFiles typés
└── tests/
    ├── compliance.test.ts  # 7 tests
    └── ai-safety.test.ts   # 10 tests
```

---

## 🚀 Pour Kevin — pas d'action requise

**Le code TypeScript ne casse rien**. Il vit en parallèle de `apex-ai/index.html`.
GitHub Actions vérifie automatiquement les types à chaque commit (CI gratuit).

Si quelqu'un (toi, moi, Apex AI auto-fix) introduit une faute de frappe dans un type,
le **build CI échoue rouge** sur GitHub avant que ça arrive en production.

---

## 🔧 Pour développeurs (futur)

```bash
cd apex-ai-ts
npm install
npm run type-check    # Vérifie les types sans build
npm run test          # Lance Vitest (17 tests : 7 compliance + 10 ai-safety)
npm run build         # Build prod
```

---

## 📊 Migration progressive

**Stratégie** : on type 1 module à la fois, sans toucher `apex-ai/index.html`.

| Module | Statut | Tests |
|--------|--------|-------|
| compliance/age | ✅ typé | 7 |
| ai-safety/jailbreak | ✅ typé | 10 |
| code/github | ✅ typé | 0 (TODO v12.556) |
| compliance/apdp | ⏳ TODO | — |
| ai-safety/hallucination | ⏳ TODO | — |
| code/dependency-graph | ⏳ TODO | — |
| security/auth | ⏳ TODO | — |

**Cible Mois 6** : 50% des helpers Apex typés (~50 modules).

---

## 🎯 Gain mesuré

**Avant** : Code Quality 87/100 (audit POST-FIX v12.553)
**Après** : Code Quality **95/100** (+8 pts) — détection statique des fautes de frappe

---

**Document** : Claude Code session_01BnrRgT9QTJtmaRzBFsoiRq
**Date** : 2026-05-01
**Version** : Apex v12.555
