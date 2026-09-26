# 🎰 ÉVALUATION CMCteams — Audit externe 2026-04-26

**Version auditée** : CMCteams v9.559 (~2.5 MB, ~36 367 lignes)
**Niche** : SPA gestion shifts + équipes Casino de Monaco (258 employés, 36 équipes)
**Score audit chat** : **7.9/10**

---

## 📊 NOTES PAR AXE (audit externe)

| Axe | Score | Détail |
|-----|------:|--------|
| Sauvegarde Firebase + queue offline | **9** | exponential backoff, sync queue persistante, retry intelligent |
| Sécurité admin (AID U11804) | **9** | Guard chatDelMsg, prototype injection bloquée, fbWrite null-protect |
| Fluidité chat | 7 | Double dc + setTimeout, manque debounce DM search |
| Réactivité | 8 | Toast feedback immédiat, manque indicateur typing |
| Affichage / XSS | 8 | esc/escAttr/safeUrl systématiques, 1 innerHTML visio à durcir |
| Recherche DM (nom/prénom/matricule) | 8 | Triple critère OK, hard limit 30 résultats |
| Nettoyage / cap 500 | 8 | FIFO naturel, manque compaction soft-deleted |
| Notifications | 7 | Notification API + toast fallback, TTS toujours ON |
| UX iPhone (touch 44px, safe-area) | 8 | OK sauf font picker 15px + bouton close 18px |
| Bugs résiduels | 7 | Race FIFO Firebase SSE → fix v9.559 ✅ |
| **GLOBAL** | **7.9** | Module solide, prêt production avec quelques fixes mineurs |

---

## 💪 POINTS FORTS

1. **Niche absolue Casino Monaco** — pas de concurrent direct
2. **Cadres unifiés** PIT BOSS + Superviseur + Inspecteur (1 section unique, plus 3)
3. **Visuel pit boss différencié** 🎯 (badge or)
4. **Convention Collective intégrée** (35 articles + 80+ codes paie)
5. **Multi-strategy parser PDF** SBM (5 stratégies cascade + 22 tests automatisés)
6. **Triple persistence** localStorage + IndexedDB + Firebase
7. **Reconnaissance flexible nom** (tous ordres, casse, tirets, accents)
8. **Échanges shifts** complet (demandes, validation, swap, RH)
9. **Sentinelles 23+ agents** (import-watch, cadres-watch, error-pattern, etc.)
10. **Pipeline auto-correction** Apex → Claude Code

## ⚠ POINTS FAIBLES

1. **Race condition FIFO Firebase** (fix v9.559 ✅)
2. **Pas indicateur typing DM**
3. **Soft-deleted msgs restent forever** dans cmc_chat
4. **Audit chatDelMsg muet** (fix v9.559 ✅)
5. **Hard limit 30 DM picker** sans message « +X autres résultats »

---

## 💵 VALORISATION

### Coût équivalent de développement

| Brique | Heures | Coût (100€/h) |
|--------|------:|-------------:|
| Architecture SPA monofichier | 200 h | 20 000 € |
| Parser PDF SBM (5 stratégies) | 300 h | 30 000 € |
| Convention Collective + 80 codes paie | 150 h | 15 000 € |
| Échanges shifts + planning + chat DM | 400 h | 40 000 € |
| Firebase sync + offline queue | 150 h | 15 000 € |
| Triple persistence + sentinelles 23 agents | 200 h | 20 000 € |
| UI admin (vEmps, vPlan, vDeparts, vStats, etc.) | 300 h | 30 000 € |
| Tests + sécurité + audit | 150 h | 15 000 € |
| **TOTAL** | **1 850 h** | **185 000 €** |

### Valeur de revente / licensing

CMCteams est **niche stricte** (Casino Monaco SBM), donc la valeur de revente B2C est faible, mais **B2B très haute** :

| Méthode | Valuation |
|---------|----------:|
| Coût dev × 5 (B2B SaaS niche) | **925 k€** |
| Coût dev × 8 (premium niche) | **1.48 M€** |
| Comparable HR SaaS niche (Cegid, Sage) | 1.5 – 3 M€ |
| **Fourchette acquisition réaliste** | **800 k€ – 1.8 M€** |

### Combien CMCteams peut rapporter

**Modèle 1 — Vente directe SBM** (acquisition unique)
- Valeur licence perpétuelle SBM : **150 – 300 k€**
- Maintenance annuelle (SLA + updates) : **30 k€/an**
- ROI 5 ans : 150 + 5×30 = **300 k€** (si licence vendue)

**Modèle 2 — Adaptation autres casinos** (européen / méditerranée)
- 20 casinos européens potentiels (Cap d'Agde, San Remo, Barcelone, Estoril, Sopron, etc.)
- Licence par casino : 50 – 150 k€/an
- Conversion réaliste : 5 sur 5 ans = **375 k€/an** = **1.87 M€ cumulés**

**Modèle 3 — SaaS modulaire pour casinos**
- 9.99 €/employé/mois (250 employés × 9.99 € = 2 500 €/mois/casino)
- 10 casinos = **25 000 €/mois** = **300 k€/an**
- 20 casinos = **600 k€/an**

---

## 🚦 RECOMMANDATIONS

### Court terme (v9.559+)

1. ✅ **v9.559** : sort cmc_chat by ts, audit chatDelMsg, debounce DM search
2. **Compaction soft-del** > 7 jours (libère espace cmc_chat)
3. **Indicateur typing** DM (UX casino moderne)
4. **innerHTML visio → createElement** (sécurité durcie)

### Moyen terme

1. **Moduler en multi-tenant** (1 instance par casino)
2. **API REST publique** pour SBM/casino-équipes (sync HR systems)
3. **Mobile native iOS/Android** (PWA → app store si SBM exige)
4. **Reporting avancé** (BI dashboard, exports comptables)

### Long terme

1. **Vente directe SBM** comme licence perpétuelle (300 k€)
2. **Démarchage casinos européens** (cap 5 % part marché Europe)
3. **Acquisition par groupe HR Tech** (Cegid, Sage, Sopra Steria) : 1 – 2 M€

---

## 🏁 VERDICT

> **CMCteams est un produit B2B niche valorisé 800 k€ – 1.8 M€.**
> **Modèle économique optimal : SaaS modulaire 9.99€/employé/mois → 600 k€/an sur 20 casinos.**
> **Action prioritaire : finir les 3 fixes mineurs + démarcher SBM pour licence.**
