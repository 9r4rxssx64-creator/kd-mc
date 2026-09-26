# 🗓 TODO — Tâches en attente

> **Lecture obligatoire à chaque session par Claude.**
> État v9.202 · 2026-04-17

---

## ✅ FAIT SESSION 2026-04-17 (50 versions, v9.153 → v9.202)

### Features UX / Admin livrées
- [x] Filter chips familles + codes (highlight)
- [x] Mode brosse (dbl-clic) + range select (Shift+Click intervalle)
- [x] Bulk select + bulk apply + drag vers sélection
- [x] Drag & drop cellules admin (swap / Ctrl-copy)
- [x] Long-press mobile bulk select (fallback tactile)
- [x] Keyboard nav cellules (arrow/Enter/Del/Space)
- [x] Live presence avatars + widget "En ligne"
- [x] Sparkline 12 mois cliquable + heatmap annuelle cliquable
- [x] Badges gamification (10 milestones auto)
- [x] Score équité par équipe + team insights cards
- [x] Timeclock pointage + historique 7j + export CSV
- [x] Demande congé structurée + auto-apply CP si approuvée
- [x] Annotations libres par jour (★ dans headers)
- [x] Bandeau conflits auto-détection
- [x] Quick profile modal emp + Next shift prédictif
- [x] Cheatsheet clavier + FAB contextuel + raccourcis T/P/F/Esc
- [x] Bouton "Aujourd'hui" + print CSS dédié + deep-links URL

### Modules niche SBM (4 modules)
- [x] Événements Monaco (GP F1, EPT, Tennis, Festival, Fête Nat.) v9.195
- [x] Cagnottes & %CA Convention Article 13 v9.196
- [x] Multi-Casino SBM (CMC + CDP + Sun + MCB) v9.197
- [x] Bulletin paie pré-visualisé unifié v9.198

### Sécurité / Intégrité
- [x] Snapshots planning (15 rotatifs + checksum stable)
- [x] Validation schéma backup stricte
- [x] Validation stricte inputs saveOv
- [x] Rate limits : 3 congés/24h + 30s entre pointages
- [x] Audit log accès clear passwords + expiry check 180j
- [x] Guards AID systématiques

### Design futuriste
- [x] Keyframes modernes (floatIn, slideUpFade, rippleExpand, confettiFall)
- [x] Glass morphism + ripple effect délégué global
- [x] Confetti sur succès (congé approuvé, install PWA)
- [x] View Transitions API native

### Accessibilité
- [x] Empty states role="status" + aria-live="polite"
- [x] Filter chips aria-pressed + tabindex
- [x] Boutons modales aria-label="Fermer" + title
- [x] aria-hidden sur dots décoratifs

### PWA
- [x] Install prompt natif (beforeinstallprompt)
- [x] Web Share API + copyShareableUrl fallback
- [x] sw.js cache v9.202 (network-first)

### Calcul paie
- [x] Indice Monaco historique (10+ sources officielles)
- [x] Grille SBM 2015 (12 niveaux Annexe 1)
- [x] Facteur indexation cumulatif
- [x] Simulateur bulletin unifié

### Performance
- [x] Indexes O(1) (_empsById, _teamsById, _empsTeamIndex)
- [x] LRU cache helper + memoize getOnlineUsers TTL 5s
- [x] Cache sparkline par render

### Audits
- [x] 12 audits externes (5 agents × 2-3 passes)
- [x] 3 P0 + 11 P1 détectés, tous corrigés
- [x] AUDIT_EXTERNE_2026-04-17.md consolidé

### Cleanup
- [x] Supprimé app 2.js (artifact legacy 110KB)
- [x] Supprimé dist/CMCteams_v9.117_* (backup obsolète)
- [x] .gitignore renforcé (dist, *.zip, app N.js, .DS_Store, éditeurs)

---

## 🟡 PRIORITÉ HAUTE (prochaine session)

### 1. Actions Kevin (hors code)
- Nettoyer Vercel (garder `kdmc-bot-2026`)
- Régénérer token Telegram via @BotFather
- Ajouter 4 secrets GitHub Actions
- Backup chiffré tokens (règle 3-2-1)

### 2. Repos satellites à créer sur GitHub
- `IA-KDMC` — stub dans `_PROJECTS_KDMC/IA-KDMC/CLAUDE.md`
- `e-KDMC` — stub dans `_PROJECTS_KDMC/e-KDMC/CLAUDE.md`

### 3. Superviseurs PDF tronqué
Warning déjà présent dans vImport. Attendre test réel Kevin.

---

## 🟢 AMÉLIORATIONS FUTURES (roadmap 10/10)

### Pour pousser la sécurité à 10/10
- [ ] AES-GCM encrypt opt-in des clear passwords (passphrase admin session-only) — ~3h
- [ ] Event delegation global pour retirer CSP unsafe-inline — ~2h
- [ ] CSP script-src hashes SHA256 des scripts critiques — ~1h

### Pour pousser la performance à 10/10
- [ ] `dcView(viewId)` granular (Virtual-DOM-like partiel) — ~2h
- [ ] Lazy-load heatmap SVG après FCP — ~30min
- [ ] Replacer les 58 `.find()` résiduels par `empById()` — ~1h

### Pour pousser l'UX/a11y à 10/10
- [ ] Dates fr-FR exhaustif (toLocaleDateString partout) — ~2h
- [ ] Onboarding tour 3 étapes overlay premier login — ~2h
- [ ] aria-label exhaustif sur tous boutons icon-only restants — ~1h

### Features métier supplémentaires
- [ ] Module Écoles de Jeux Article 5 (progression niv 1→7, alertes)
- [ ] Export DRH compliance PDF signable (inspection Monaco)
- [ ] Sync iCal Monaco public (visitmonaco.com)
- [ ] Multi-tenant (si SBM veut étendre)

---

*Dernière mise à jour : 2026-04-17 — v9.202 (50 versions livrées, moyenne audits externes 8.50/10, benchmark niche 9.9/10)*
