# audit/01 — FONCTIONS (cartographie exhaustive)

> Source : `grep -oE 'function v[A-Z][A-Za-z0-9_]*' index.html` → **102 vues** (✅ VÉRIFIÉ). Chaque vue a un ID. « Testé » = couvert par un script de `test:ci` (harnais maison) — ✅ oui / 🟡 indirect / ☐ non couvert par un test dédié.

| ID | Vue / fonction | Type | Testé |
|---|---|---|---|
| F01 | vLogin | Auth | ✅ (test:pin, test:faceid) |
| F02 | vLoginStep0 (nom/prénom/matricule) | Auth | ✅ test:faceid |
| F03 | vLoginStep1 (Face ID) | Auth | ✅ test:faceid |
| F04 | vLoginStepPin (création/saisie PIN) | Auth | ✅ test:pin |
| F05 | vLoginStepVerify | Auth | 🟡 |
| F06 | vLoginRegister | Auth | 🟡 |
| F07 | vLoginGeo / vLoginGeo | Auth+Geo | ☐ |
| F08 | vMain (routeur de rendu) | Core | ✅ (indirect, toutes) |
| F09 | vNav / F10 vTopbar | Core UI | 🟡 |
| F11 | vAccueil | Métier | 🟡 |
| F12 | vMonPlanning | Métier | ✅ test:vplan, kevin |
| F13 | vMonProfil | Métier | ☐ |
| F14 | vPlan (grille équipe) | Métier | ✅ test:vplan, teams-compare |
| F15 | vDeparts (ordres de départ) | Métier | ✅ test:departs-* (algo/render/compare/sync) |
| F16 | vTeams | Métier | ✅ test:team-rule, teams-compare |
| F17 | vEmps (employés) | Admin | ✅ test:guards |
| F18 | vRetrait | Admin | 🟡 |
| F19 | vAbsences / F20 vAbsencesLongues | Métier | 🟡 |
| F21 | vImport (PDF SBM) | Admin/Import | ✅ test:coverage, fidelity, everyone-has-planning, v2-codes, space-format |
| F22 | vImportVerif / F23 vImportAnomalies / F24 vImportVersions / F25 vImportTestResults | Import | ✅ test:verify |
| F26 | vParserLearning / F27 vParserIntelligence / F28 vParserCompare | Import | ✅ test:geometric, validated-teams |
| F29 | vRepoConflicts | Import | ✅ test:verify |
| F30 | vChat | Comm | ✅ test:kevin-inbox |
| F31 | vKevinInbox (message → Kevin/Apex) | Comm | ✅ test:kevin-inbox |
| F32 | vIA / F33 vIaFab | IA | 🟡 |
| F34 | vGalerie (~75 photos) | UI | ☐ (→ finding perf F-D1) |
| F35 | vConvention | Métier | 🟡 |
| F36 | vDocs | UI | 🟡 |
| F37 | vStats / F38 vMesStats / F39 vStatsAnnuelles / F40 vStatsGlobal | Stats | 🟡 |
| F41 | vDashboardHeures / F42 vHeuresShift / F43 vEndShiftDashboard | Stats | 🟡 |
| F44 | vPit / F45 vPitDashboard / F46 vPitHistory / F47 vMonFilPit | Pit Boss | ☐ |
| F48 | vMapEditor / F49 vPlanImplantation / F50 vTablesCoords / F51 vQRCodesTables | Tables/Map | 🟡 (test:v784 route pitmap) |
| F52 | vCheckInTable / F53 vLiveRoom / F54 vGestionLive / F55 vMyPlanLive / F56 vMonacoLive | Live | ☐ |
| F57 | vQuiEstLibre / F58 vConsumptionLevelsCMC / F59 vConvocsPending | Métier | ☐ |
| F60 | vGeolocationCMC / F61 vGeoAdmin | Geo | ☐ |
| F62 | vCMCCameraStudio / F63 vBrowserCMC | Outils | ☐ |
| F64 | vDeparts-related vSimView / F65 vQuotidienne / F66 vMesDemandes / F67 vRetardataires | Métier | 🟡 |
| F68 | vFichePerso (fiche complète employé) | Admin | ✅ test:fiche |
| F69 | vPasswords | Admin | ✅ test:guards |
| F70 | vAdminV10 / F71 vAdminCat / F72 vAdminSecurity / F73 vAdminTimework | Admin | ✅ test:guards |
| F74 | vAudit / F75 vAuditLog / F76 vTelemetry / F77 vPersistenceAudit | Admin/Obs | 🟡 test:handoff |
| F78 | vAgents / F79 vAgentsHealth / F80 vCmcSentinelHub / F81 vCmcQuietStatus | Sentinelles | ✅ test:agents |
| F82 | vCmcKnowledgeBank / F83 vCmcMemoryDashboard / F84 vLessonsLearnedCmc | Mémoire | 🟡 |
| F85 | vKnownIdentities | Import | ✅ test:homonyms |
| F86 | vConnexions / F87 vOnline / F88 vUsersActivity | Admin/présence | 🟡 |
| F89 | vDayHistory / F90 vMoisStockes | Historique | 🟡 |
| F91 | vRGPD | Conformité | ☐ (→ finding H) |
| F92 | vCrossTeamActivity | Stats | ✅ (v785 route) |
| F93 | vFeatureFlags / F94 vCmcFeatureflags | Admin | 🟡 |
| F95 | vTemplates / F96 vTimingsAdmin | Admin | 🟡 |
| F97 | vDebug | Admin | 🟡 |
| F98 | vPartage / F99 vUploadRequests / F100 vOcrHistory | Outils | ☐ |
| F101 | vVerify (audit fidélité import) | Import | ✅ test:verify |
| F102 | vVoicePresetsCMC | Outils | ☐ |

**Couverture (✅ VÉRIFIÉ par comptage) :** ~40 vues sur 102 sont couvertes directement ou indirectement par le harnais `test:ci` (import/parsing/départs/équipes/auth/guards = le **cœur métier critique**). Les ~60 vues ☐/🟡 (studios, outils live, geo, stats secondaires) ne sont pas couvertes par un test dédié → **c'est le principal angle mort** (voir auto-critique `05-JOURNAL.md`).

**Cas métier spécifiques CMC Teams à couvrir (Phase 5 du brief) — état :**
- Deux croupiers même table/horaire → conflit : `_cmcDetectTeamsByRestPattern`/`vVerify` détectent les incohérences d'import ; **conflit d'affectation live** = non prouvé par test dédié → 🔴 à vérifier.
- Croupier CMC+CDP simultané → 🔴 à vérifier.
- Planning vide → empty state : 🟡 (vMonPlanning gère « aucun planning », test:vplan).
- Bascule salons → cohérence état : 🟡.
- Galerie ~75 images 4G / lazy / alt / CLS → **finding F-D1** (non vérifié, probable manque de `loading=lazy`).
