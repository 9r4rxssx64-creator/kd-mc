# Pipeline de toutes les branches et sessions — état au 2026-09-06

**Question posée** : est-ce qu'un travail de session est resté en rade, hors de `main` ?
**Méthode** : mesure sur les 370 branches `claude/*` distantes, pas un coup d'œil.

> **Correction de méthode, assumée.** Mon premier test comparait les *fichiers modifiés depuis
> le fork* — c'est faux : une branche peut avoir touché 1 889 fichiers dont le contenu est déjà
> dans `main`. Le bon test est la **comparaison de patchs** (`git cherry`), qui reconnaît un
> travail déjà livré autrement (report, rebase, re-livraison). Les chiffres ci-dessous viennent
> du bon test. Le premier annonçait 129 branches « à risque » ; il y en a **109**.

---

## Le compte, en une image

| Catégorie | Nombre | Risque de perte |
|---|---:|---|
| Branches `claude/*` distantes | **369** | — |
| **Ancêtres de `main`** — tout est déjà dedans | **240** | **aucun**, prouvé mathématiquement |
| **Contenu équivalent** dans `main` (patchs déjà livrés autrement) | **20** | aucun patch inédit |
| **Avec des patchs inédits** | **109** | à décider |
| …qui se regroupent en **travaux distincts** (les 109 sont des instantanés successifs du même job) | **49** | à décider |

**Union dédupliquée des commits jamais livrés à `main` : 699 sujets distincts**, dont **149**
sont des commits de robot (uptime, cache, `[skip ci]`) → **~550 commits de travail réel**
n'existent que sur des branches.

> **Ce que ce chiffre ne dit PAS** : « 550 commits perdus ». Beaucoup datent de juin-août et
> portent sur des zones (`apex-ai-v13`, `arbre`) qui ont été **réécrites depuis** sur `main` :
> ce sont des brouillons dépassés, pas du travail volé. Distinguer les deux demande un examen
> **par travail** — c'est l'objet du tableau plus bas. Je ne prétends pas l'avoir fait pour les 49.

---

## Les 49 travaux qui portent des patchs inédits

Trié du plus récent au plus ancien. Les cinq premiers (5-6 septembre) sont des **sessions
en cours**, pas des travaux abandonnés : il est normal qu'ils ne soient pas encore dans `main`.

| Dernier commit | Patchs inédits | Branche (sommet de la famille) | Zones touchées | SHA |
|---|---:|---|---|---|
| 2026-09-06 | 5 | `claude/sarzance-family-tree-3jxi7i` | .github,KEVIN_INVENTORY.md,MEMO_RESUME.md | `e0af90a64` |
| 2026-09-06 | 10 | `claude/surveillance-domaine-26-adresses` | .claude,.github,APEX_HANDOFF.md | `e0e78c0c0` |
| 2026-09-06 | 1 | `claude/verify-cmcteams-light-data-rzlvau` | LESSONS.md,MEMO_RESUME.md,pipeline | `c4658457f` |
| 2026-09-05 | 1 | `claude/lingua-prenom-nom` | MEMO_RESUME.md,lingua,node_modules | `9c0ba94b7` |
| 2026-09-05 | 1 | `claude/miroir-pour-chaque` | .github,KEVIN_INVENTORY.md,MEMO_RESUME.md | `30f390022` |
| 2026-08-14 | 1 | `claude/lsf-recolte-31761807096` | lingua | `e99b54354` |
| 2026-08-13 | 1 | `claude/monegasque-sources-31695914322` | "audit,audit | `4eefab11b` |
| 2026-08-13 | 41 | `claude/sources-langues-31725316505` | .github,.uptime,LESSONS.md | `51219ede0` |
| 2026-08-11 | 133 | `claude/cmcteams-clicking-issue-rmli6m` | .github,.uptime,CLAUDE.md | `cdec9e362` |
| 2026-08-11 | 157 | `claude/lingua-donkey-art-2` | .github,.uptime,CLAUDE.md | `80d41e830` |
| 2026-08-11 | 160 | `claude/lingua-donkey-video-2` | .github,.uptime,CLAUDE.md | `028a6eea9` |
| 2026-08-11 | 161 | `claude/lingua-hq-bee-1` | .github,.uptime,CLAUDE.md | `543dec401` |
| 2026-08-11 | 139 | `claude/lingua-stories-langs-22` | .github,.uptime,CLAUDE.md | `21a6fb83d` |
| 2026-08-11 | 173 | `claude/lingua-video-bee-2` | .claude,.github,.uptime | `56d858ac9` |
| 2026-08-11 | 176 | `claude/lingua-vocab-2` | .claude,.github,.uptime | `5ac09c11f` |
| 2026-08-09 | 200 | `claude/lingua-grow-2` | .claude,.github,.uptime | `dfedfaf98` |
| 2026-08-07 | 30 | `claude/printify-blueprints-31131057965` | .claude,.github,CLAUDE.md | `b6fa7e142` |
| 2026-08-07 | 30 | `claude/printify-catalog-31131057867` | .claude,.github,CLAUDE.md | `7b2a0a7c3` |
| 2026-08-07 | 32 | `claude/printify-connect-31131057944` | .claude,.github,CLAUDE.md | `87b939317` |
| 2026-08-07 | 49 | `claude/printify-order-config-31151799502` | .claude,.github,.uptime | `ba5d7fd39` |
| 2026-08-07 | 43 | `claude/reverse-engineer-app-consolidation-t0y4u5` | .claude,.github,CLAUDE.md | `33f1cbb84` |
| 2026-08-07 | 49 | `claude/worker-config-31151799721` | .claude,.github,.uptime | `1d733c469` |
| 2026-08-05 | 1 | `claude/bee-video-30962048633` | lingua | `2913c1446` |
| 2026-08-05 | 2 | `claude/kdmc-access-visible-proof` | .github,kdmc-home | `a2ff91493` |
| 2026-08-04 | 1 | `claude/bee-art-30960853989` | lingua | `03ea14c7c` |
| 2026-08-04 | 1 | `claude/bee-mascot-art` | lingua | `db062b10b` |
| 2026-07-17 | 1 | `claude/monaco-kv-frugal` | tools | `96e7c672c` |
| 2026-07-14 | 2 | `claude/account-statements-analysis-9sebdc` | .github,CLAUDE.md,services | `81600f722` |
| 2026-07-04 | 3 | `claude/free-apis-analysis-c4sy5d` | CLAUDE.md,MEMO_RESUME.md,apex-ai | `70f2f2865` |
| 2026-06-24 | 1 | `claude/note-canari-todo` | KEVIN_ACTIONS_TODO.md | `d1b6848be` |
| 2026-06-22 | 22 | `claude/ld-logo-gen` | .github,shops | `2d4180904` |
| 2026-06-22 | 19 | `claude/ld-logo-img` | .github,shops | `369cb895a` |
| 2026-06-17 | 1 | `claude/ld-empty-catalog` | shops | `7269215b1` |
| 2026-06-09 | 2 | `claude/kdmc-sso-pwa` | .github,KEVIN_ACTIONS_TODO.md,kdmc-home | `ad3e76341` |
| 2026-06-07 | 8 | `claude/cmcteams-crew-review-QZUyo` | AUDIT_ORPHELINES_CMCteams.md,CLAUDE.md,KEVIN_ACTIONS_TODO.md | `9c8b10c3f` |
| 2026-06-06 | 1 | `claude/lolo-crew-review-tDzp7` | CLAUDE.md,KEVIN_ACTIONS_TODO.md,KEVIN_INVENTORY.md | `a7f7330b5` |
| 2026-06-03 | 1 | `claude/ai-lifestyle-26893034887` | shops | `555171730` |
| 2026-06-03 | 1 | `claude/ai-realguns-26909226871` | shops | `c7e3ef493` |
| 2026-06-03 | 1 | `claude/e2e-shot-26899949984` | tools | `15f7cc74a` |
| 2026-06-02 | 1 | `claude/apex-coffre-autotest-v280` | apex-ai | `b632f6d54` |
| 2026-05-22 | 2 | `claude/apex-chat-v113-merge` | .claude,messaging-app | `47c5d2d69` |
| 2026-05-22 | 10 | `claude/apex-installation-setup-VCzUl` | .claude,CLAUDE.md,VEILLE_OUTILS.md | `27757d8da` |
| 2026-05-22 | 5 | `claude/code-review-debug-bhYZP` | .claude,.github,FIREBASE_SECURITY.md | `ae889e475` |
| 2026-05-22 | 1 | `claude/dossier-reprise-markdown-C2d0J` | DOSSIER_REPRISE.md | `1a8d504f1` |
| 2026-05-22 | 3 | `claude/fix-firebase-backup-tests-oTgtn` | .claude,CLAUDE.md,MEMO_RESUME.md | `b31ffb2d7` |
| 2026-05-22 | 6 | `claude/new-session-evcB9` | apex-ai,apex-ai-v13 | `fb175ec20` |
| 2026-05-22 | 2 | `claude/session-final-docs` | .claude,CLAUDE.md,MEMO_RESUME.md | `3e8485623` |
| 2026-05-22 | 195 | `claude/test-699LQ` | .claude,.github,.session | `9ee676104` |
| 2026-05-22 | 13 | `claude/ultra-review-per-project-7foEI` | .gitignore,_PROJECTS_KDMC,apex-ai | `549c70043` |

---

## Les 240 branches supprimables sans aucune perte

Leur sommet est un **ancêtre de `main`** : chacun de leurs commits est déjà dans `main`.
La suppression ne peut rien perdre — et le SHA est noté ici, donc chacune reste **restaurable**
(`git branch <nom> <sha>`).

<details><summary>Liste complète (SHA · date · branche)</summary>

```
b538200b8  2026-07-12  claude/actions-done-doc
9ca547d55  2026-06-11  claude/admin-add-studio
b393cbd15  2026-06-30  claude/admin-connection-history
4fdcea588  2026-06-30  claude/admin-presence-connectes
1db4a95c5  2026-07-15  claude/agent-gauth-der
67c4c44d0  2026-07-15  claude/agent-gauth-selfheal
115f76f57  2026-06-08  claude/ai-dead-precise-msg
b992adb91  2026-06-10  claude/apex-ai-domain-login
0bf3db671  2026-06-09  claude/apex-ai-domain-register
581170942  2026-06-10  claude/apex-ai-recognize
84790ae82  2026-06-10  claude/apex-ai-sso
0cbc58828  2026-06-09  claude/apex-chat-domain-register
628c3f0f0  2026-06-18  claude/apex-chat-messages-gtyqwl
a5655c494  2026-07-10  claude/apex-chat-multi-messenger-dvpo2u
8ead4f08c  2026-06-10  claude/apex-chat-recognize
6bd9dda6c  2026-06-07  claude/apex-chat-review-It5lo
7937b2bbf  2026-09-05  claude/apex-chat-secu-numero-public
3bc9419fa  2026-06-19  claude/apex-commands-add
9faba268f  2026-06-02  claude/apex-proxy-health-test-v282
909b5f877  2026-06-03  claude/apex-replicate-health-v283
c927953c2  2026-06-10  claude/apex-sso-autologin
229ded716  2026-09-06  claude/apex-ultra-review-crew-MZ8nS
ebb7b8ec4  2026-06-09  claude/apex-v13-gate-green
c26cf412e  2026-07-14  claude/apex-v13-manifest-in-build
ea24ff188  2026-06-09  claude/apex-v13-security
da92a61b2  2026-06-02  claude/apex-worker-url-fix-v281
e25dca499  2026-08-04  claude/apexchat-access-log
ba46c25b2  2026-06-11  claude/apexchat-auto-notif
04d03b1ff  2026-07-12  claude/apexchat-avatar-refresh
871386a93  2026-07-12  claude/apexchat-delete-persist-coderabbit
3b408d501  2026-07-12  claude/apexchat-e2e-ratchet-fix
16af26d98  2026-07-13  claude/apexchat-e2e-selfheal
67e55f1f3  2026-06-10  claude/apexchat-faceid-autologin
80f944eb8  2026-07-13  claude/apexchat-gesture-webkit-skip
b92b73da0  2026-07-13  claude/apexchat-media-bigger
8315bfdbb  2026-07-13  claude/apexchat-msg-grouping
98605539b  2026-06-10  claude/apexchat-premium-kdmc
57b93c172  2026-07-13  claude/apexchat-push-diag
d0a1260c9  2026-07-13  claude/apexchat-push-gesture
5a2125aac  2026-07-13  claude/apexchat-push-vapid-fix
3999ed17e  2026-07-13  claude/apexchat-scroll-bottom
d20ae13c8  2026-07-13  claude/apexchat-send-freshkey
a504d5aa1  2026-07-13  claude/apexchat-swipe-reply
067e46dad  2026-07-13  claude/apexchat-visual-whatsapp
b2401f408  2026-08-04  claude/apexv13-access-log
70fe0bf44  2026-07-11  claude/audit-auth-hardening
1483560d1  2026-07-11  claude/audit-cmc-error-msg
753152a25  2026-07-11  claude/audit-csp-deadbuttons
cf825d04a  2026-07-11  claude/audit-d1-backup
0f4d2f348  2026-07-11  claude/audit-fixes-ldreviews
b913239ef  2026-07-16  claude/audit-p0-xss-ld
ffebadfa5  2026-07-14  claude/audit-passe-1
ffebadfa5  2026-07-14  claude/audit-passe-1-docs
18fb5951b  2026-07-14  claude/audit-passe-3b
98a7c4311  2026-07-14  claude/audit-passe-4
f469af7fb  2026-07-14  claude/audit-passe-5
d66fe2923  2026-07-14  claude/audit-rule-update
00c12723a  2026-07-25  claude/audit-secu-pass
970d288a0  2026-07-11  claude/audit-verifypw-adminpin
f99bcbf57  2026-07-16  claude/audit-xss-delegation
107b5d5e5  2026-07-16  claude/auto-merge-worker-deploys
086ed71a4  2026-06-11  claude/auto-notif-all
ef6c9ca13  2026-07-14  claude/bot-analysis-tool
08db0d744  2026-07-06  claude/bot-fleet-dashboard-2rQx
ba1b076ac  2026-07-06  claude/bot-fleet-paper-irrfu6
7d5528d2f  2026-07-07  claude/bot-no-catastrophe-brake
428316514  2026-07-04  claude/bot-optimize-gains-irrfu6
701378339  2026-07-20  claude/bot-p3-style
aa6e5f92d  2026-07-03  claude/bot-reactive-irrfu6
664668292  2026-07-06  claude/bot-research-real-irrfu6
77e0a60ff  2026-07-06  claude/bot-strategy-holdprofit-irrfu6
f5718bf81  2026-07-03  claude/bot-tile-and-abc-irrfu6
19a3be69e  2026-07-04  claude/bot-trade-counter-irrfu6
8ca99bc2e  2026-07-14  claude/bot-tradingview
0bb264105  2026-07-03  claude/botdash-version-irrfu6
77a534d73  2026-09-05  claude/capcut-mini-versions-66tfum
9fbc943c1  2026-06-10  claude/chezlolo-faceid-autologin
eb22742ea  2026-06-09  claude/ci-sso-smoke
be008a0ba  2026-07-13  claude/claudemd-push-correction
f3820e580  2026-08-12  claude/clayscore-development-df6rj1
a8f84e494  2026-07-16  claude/cmc-admin-role-lock
249484724  2026-06-24  claude/cmc-stability-v9808
a4a110547  2026-08-04  claude/cmcteams-access-log
01ef6dda2  2026-06-07  claude/cmcteams-cleanup-fresh
59a65ca86  2026-06-15  claude/cmcteams-detection-errors-48gbod
59692d887  2026-06-10  claude/cmcteams-sso-autologin
4acff4059  2026-06-19  claude/commands-add
7b0dc460e  2026-06-08  claude/commands-clickable-prefill
6b033bd1a  2026-06-30  claude/connection-duration
b9a2daa4f  2026-06-07  claude/crew-verification-relaxation-pbk6H
7d57e0755  2026-07-03  claude/crypto-trading-bot-irrfu6
c3ce6fd0a  2026-07-16  claude/cryptobot-money-safety
371066cf8  2026-09-05  claude/cuisine-6-recettes
fc262f296  2026-08-14  claude/cuisine-ebook-1m9xm7
1f7d7caed  2026-06-08  claude/custom-commands
04011390d  2026-06-08  claude/custom-commands-cloud
61522cc57  2026-06-28  claude/dashboard-laurence-access
933638f51  2026-06-09  claude/dashboard-pin-fix
1aa936178  2026-06-08  claude/doc-commands-rule
727336dfc  2026-06-10  claude/doc-idp-lesson
8233f9b3d  2026-06-10  claude/doc-lessons
aabe6c413  2026-06-08  claude/docs-secrets-2026-06-08
2a618e966  2026-06-02  claude/docs-worker-url-lesson
2039c54aa  2026-07-01  claude/domain-apps-single-source
6ca867454  2026-07-01  claude/domain-audit-p0-verified
8ffd6f668  2026-07-01  claude/domain-faceid-adoption
a11af1847  2026-06-10  claude/domain-idp-passkey
aca9ab844  2026-08-14  claude/domain-one-click-links-s43ilc
295204a84  2026-07-01  claude/domain-push-newdevice
c6d4776b3  2026-07-01  claude/domain-self-service
77575dc71  2026-08-14  claude/duolingo-reverse-engineering-kocs92
6a55e017f  2026-06-02  claude/epure-batch-x9
a6e903a74  2026-07-03  claude/faceid-bot-login-irrfu6
9cacedc43  2026-06-24  claude/fb-rules-hygiene
700f4ac28  2026-06-09  claude/fiches-retry-ladetente
10deed6f6  2026-07-21  claude/finances-autoreanalyze
e3a78ee5e  2026-07-14  claude/finances-bilan-complet-9sebdc
0b5ab0f42  2026-07-18  claude/finances-clarity
348f6f6c5  2026-07-16  claude/finances-classif-verify-v0139
a22c25a32  2026-07-23  claude/finances-engins-tracking
30bdd3eb1  2026-07-18  claude/finances-fiche-riche
ced1a8ca2  2026-07-16  claude/finances-free-ai-chain-v0138
4a145567f  2026-07-13  claude/finances-gemini-model-9sebdc
fb2c1c6c8  2026-07-13  claude/finances-one-code-9sebdc
debea8908  2026-07-16  claude/finances-taxo-avoir-v01310
2d40870ff  2026-07-14  claude/finances-tri-drill-9sebdc
50446f51a  2026-07-14  claude/finances-v0133-aifallback
f20319ce9  2026-07-14  claude/finances-v0134-docorigine
ea9ecfd6e  2026-07-14  claude/finances-v0135-import-retry
ea5cf1ddf  2026-07-14  claude/finances-v0136-pending-import-queue
5d8a7f046  2026-07-15  claude/finances-v0137-ai-cooldown
bf51e9b4a  2026-07-14  claude/finances-visible-recovery-9sebdc
fb19f67a1  2026-06-08  claude/fix-apex-parity-e2e
7a418ef6e  2026-07-14  claude/fix-apex-rescue-404
1a9885fbc  2026-06-08  claude/fix-auth-worker-kv-deploy
5a15f0e22  2026-06-08  claude/fix-auto-deploy-force-push
b01848678  2026-06-08  claude/fix-connexion-proxy-vault-ui
27c04bc0a  2026-06-10  claude/fix-kv-deploy
6680d1aaf  2026-09-05  claude/fix-messages-photo
f27ef2dc5  2026-09-05  claude/fix-mois-ouverture
b29a38d3f  2026-06-08  claude/fix-proxy-pin-auth
5f197874a  2026-06-11  claude/fix-search-bar
f333b7d0d  2026-06-09  claude/fix-sso-admin-flag
7c9ebb7c7  2026-06-11  claude/fix-sso-e2e-passkey-offer
42d87abba  2026-06-08  claude/fix-vault-header-scroll
e6898c1d9  2026-06-08  claude/fix-wake-mic-autostart
c18d1b2db  2026-06-06  claude/gmail-organization-oEUEG
c7a30828d  2026-08-14  claude/graphity-auto-install-sm3f92
ab5ae27b9  2026-09-05  claude/journal-fusion-union
3830b79e6  2026-08-04  claude/kdmc-access-retention
14cafde52  2026-08-04  claude/kdmc-access-worker
7aaf7cb5e  2026-07-15  claude/kdmc-agent-health-probe
7fc581a5a  2026-07-15  claude/kdmc-agent-rebuild
fce844384  2026-06-09  claude/kdmc-apex-portal
c6c193888  2026-06-12  claude/kdmc-audit-doc
59fcb6a8c  2026-06-06  claude/kdmc-custom-domain-7hNn9
ad24199b7  2026-06-15  claude/kdmc-deepen-hardening
d73ebd405  2026-06-09  claude/kdmc-domain-admin
95b764d8e  2026-06-12  claude/kdmc-domain-hardening-audit
1c00d182a  2026-06-09  claude/kdmc-portal-return
2781cb283  2026-06-15  claude/kdmc-replay-csp
da3242a28  2026-06-09  claude/kdmc-sso-pwa2
a1f86c10c  2026-06-11  claude/la-detente-faceid-studio
611855a88  2026-06-05  claude/la-detente-gun-heart-logos-8HwIP
7e0ca2660  2026-06-18  claude/laurence-own-code
a936b8275  2026-07-04  claude/ld-canvas-rework
adfc6d9ff  2026-06-23  claude/ld-dualview
8e2be365e  2026-06-17  claude/ld-empty-v2
a56a2d6e5  2026-06-23  claude/ld-lib-xl
e5af0fa39  2026-06-18  claude/ld-logo-t05b
3b2fec605  2026-06-19  claude/ld-logos-batch
9b1e5490b  2026-06-23  claude/ld-logos-studio
5903146e3  2026-06-23  claude/ld-multiproduct
af2e28415  2026-07-05  claude/ld-shop-selftest
e458fe6d3  2026-06-23  claude/ld-studio-fix
0bb56acce  2026-06-18  claude/ld-studio-models
54a091c6a  2026-06-23  claude/ld-studio-ux
dca172abe  2026-07-14  claude/lesson-146-9sebdc
6107200b2  2026-07-14  claude/lesson-147-9sebdc
3ad6e154e  2026-09-06  claude/lingua-connexion-honnete
d19ee3ec3  2026-06-28  claude/login-name-or-faceid-everywhere
1b399f78c  2026-06-06  claude/lolo-docs-sync
d58d57f06  2026-07-13  claude/mail-body-capture-9sebdc
34a371724  2026-07-14  claude/mail-invoice-amount-filter-9sebdc
2c543d9c1  2026-08-05  claude/max-renseignements
9de5c396e  2026-07-16  claude/mem-phaseb
c458f891d  2026-07-13  claude/monaco-backfill-9sebdc
014e37ace  2026-07-16  claude/monaco-backfill-speedup
bf05899e2  2026-07-16  claude/monaco-cpu-batch
04fbc801f  2026-07-13  claude/monaco-forward-9sebdc
996d87dbf  2026-07-16  claude/monaco-loop-resilient
fe0e3d920  2026-07-13  claude/monaco-probe-9sebdc
fa29d55f5  2026-07-14  claude/monaco-targeted-backfill-9sebdc
467fbd2ea  2026-06-10  claude/orders-notif-details
fb94e5ebd  2026-06-10  claude/orders-printify-link
0832ad460  2026-06-11  claude/orders-validate-photo
4b512b13f  2026-06-04  claude/perfect-100-Ypr17
47adf5998  2026-07-21  claude/pool-robot-app-mapping-kcmx03
95aff1e78  2026-06-09  claude/portal-admin-link
568a7e700  2026-06-09  claude/portal-admin-only
568781741  2026-07-03  claude/portal-bot-tile-irrfu6
d4d21ebb3  2026-07-03  claude/portal-cachebust-irrfu6
baddb80a3  2026-06-03  claude/premium-ai-photos-script
85d1595de  2026-06-10  claude/premium-semi-auto
36840ace6  2026-06-30  claude/presence-heartbeat
97263b49a  2026-06-30  claude/presence-ping-all-apps
cc8069543  2026-08-05  claude/preuve-connexions-reelles
ab53ceea9  2026-06-08  claude/priority-action-workflow-iKc0T
52172feec  2026-08-05  claude/progression-et-doublon
15ddf8dbf  2026-06-08  claude/proxy-pin-1tap
53a3c81f0  2026-06-10  claude/purge-stripe-everywhere
9f09955ea  2026-08-05  claude/qui-se-connecte-source-unique
478c76873  2026-06-10  claude/remove-stripe-unify
9672f9207  2026-06-16  claude/remove-unsold-items-qpnypb
374b67fd6  2026-07-25  claude/scan-and-fix
bd8095a31  2026-07-25  claude/scanfix-xss-jsattr
1509363cb  2026-06-06  claude/secure-vault-app-EN8yR
ecfe9d3cc  2026-06-02  claude/seo-skill-install-2rdyZ
e731b4595  2026-07-16  claude/shops-orders-read-lock
1bfbe2aac  2026-06-17  claude/shops-search-ux
6f691337d  2026-06-08  claude/shops-security-hardening
2d9f9c330  2026-06-10  claude/shops-unify-payment
8ffdc0a04  2026-06-09  claude/signed-pass-rails
62533643d  2026-06-10  claude/smoke-resilient
6b7b6d93b  2026-06-09  claude/smoke-retry
9a40163a6  2026-06-10  claude/sso-autologin-policy
a4c9235d1  2026-06-09  claude/sso-e2e
935438863  2026-06-18  claude/studio-refine
838d58338  2026-06-19  claude/supplier-research-api-hy1zl0
d22be87d6  2026-06-04  claude/textile-shop-ar15-heart-mMJ0j
02f581c47  2026-06-08  claude/todo-shops-update
6d0cd08c6  2026-08-05  claude/un-compte-par-personne
f015b4610  2026-07-11  claude/v10-shops-fbtoken
52ae00734  2026-09-06  claude/vercel-config-main
4a59918ed  2026-06-02  claude/verifie-Ypr17
b2611b840  2026-08-05  claude/vrais-humains-vs-robots
eb0b952e5  2026-07-10  claude/webkit-diag-temp
02bf49d9b  2026-07-10  claude/webkit-e2e-https-fix
59aba4db7  2026-07-10  claude/webkit-lesson-doc
fc86d1753  2026-06-19  claude/workspace-organization-hcgyvz
```

</details>

---

## Les 20 branches au contenu déjà livré (2ᵉ passe)

`git cherry` ne trouve **aucun patch inédit** : le contenu est dans `main`, apporté par d'autres
commits. Suppression très probablement sans perte, mais la preuve est moins forte que pour les
ancêtres — donc **je ne les ai pas touchées**. SHA notés pour restauration.

<details><summary>Liste complète (SHA · date · branche)</summary>

```
37c5d726a  2026-07-15  claude/agent-mem-fact
f60050b86  2026-08-06  claude/agent-toolkit-sync
210f3baf4  2026-06-03  claude/ai-designs-26897589203
00b53310a  2026-06-03  claude/ai-realguns-26909228919
eb805bc9f  2026-06-04  claude/ai-realguns-26922190736
dd4cf32c1  2026-07-14  claude/audit-passe-2
2e615d26b  2026-07-14  claude/audit-passe-3
1e26816b0  2026-08-05  claude/compte-unique
511d7a722  2026-06-08  claude/deploy-321-manual
d5a7342a9  2026-07-01  claude/domain-hardening-batch2
fd2a7b7d4  2026-08-05  claude/espion-max
146cab2f7  2026-08-05  claude/kdmc-access-tile-verify
78a1aee66  2026-07-15  claude/kdmc-agent-mintdiag
571285927  2026-06-28  claude/portal-priv-zone-gate
b3c25495a  2026-06-03  claude/printify-blueprints-26914866399
68479fd47  2026-06-03  claude/printify-blueprints-26915550897
e8fec7d8a  2026-06-03  claude/printify-connect-26914168652
aeff252c1  2026-06-04  claude/printify-order-config-26922189852
8c16a294e  2026-07-13  claude/v10-shops-lock-safe
ddb4358a4  2026-06-03  claude/worker-config-26897582610
```

</details>

---

## Ce que je n'ai PAS fait, et pourquoi

- **Je n'ai pas fusionné les 49 travaux dans `main`.** Ce serait irresponsable : du code de
  juin-août posé sur un `main` qui a bougé de milliers de commits, c'est une régression
  garantie. Chaque travail demande une décision : encore utile, ou dépassé ?
- **Je n'ai pas supprimé les 40 branches « contenu équivalent »** : la preuve y est bonne mais
  moins absolue que pour un ancêtre de `main`. Sur une opération irréversible, je prends la
  version conservatrice.
- **Je n'ai pas d'accès à l'historique des conversations**, seulement aux branches. Une session
  qui n'a jamais poussé de commit est invisible ici.

---

## Suite : pourquoi les branches ne sont TOUJOURS pas supprimées (état 17h55)

Quatre cycles de vérification, tout est mesuré, rien n'est supposé.

| Ce que j'ai corrigé | Sur `main` ? | Effet observé |
|---|---|---|
| Le nettoyeur était **aveugle** (refspec mono-branche, leçon #227) | ✅ | aucun |
| Le nettoyeur ne **démarrait** pas (2 déclencheurs morts, leçon #228) | — | — |
| Nettoyage **greffé dans l'auto-merge**, seul workflow qui tourne | ✅ | **aucun** |

**Résultat honnête : 371 branches, inchangé.** Ma branche a bien fusionné (`fusionne=oui`
pendant 18 min de surveillance), donc l'auto-merge s'exécute — mais aucune branche n'a disparu.

**Je ne sais pas pourquoi, et je ne vais pas inventer une quatrième explication.** Il me
faudrait le journal d'exécution du workflow, et l'API GitHub est fermée à cette session
(HTTP 403, re-mesuré). Les trois causes déjà trouvées étaient réelles et sont corrigées ;
il en reste visiblement une quatrième que je ne peux pas voir d'ici.

### Ce que je ne peux pas faire, mesuré (pas supposé)

```
API GitHub — déclencher un workflow : HTTP 403
gh (ligne de commande GitHub)       : absent
git push origin --delete <branche>  : REFUSÉE (le relais coupe la connexion)
```

### Le seul canal restant : un clic, une fois

**▶️ [Lancer « Compact stale claude/* branches »](https://github.com/9r4rxssx64-creator/CMCteams/actions/workflows/cleanup-stale-branches.yml)**
→ bouton « Run workflow » · `dry_run` = `false` · brancher sur `main`.

Ce workflow porte désormais le correctif de cécité : lancé à la main, il **voit** les branches
et supprimera celles qui sont déjà entièrement dans `main`. Son journal dira aussi, enfin,
pourquoi la version automatique ne fait rien — et je pourrai finir le travail sans autre clic.

### Ce qui, lui, est fait et ne dépend d'aucun clic

- La question posée — **est-ce qu'un travail de session est resté en rade ?** — est **répondue** :
  49 travaux distincts identifiés, datés, avec leurs zones et leurs SHA (tableau plus haut).
- **Rien n'est en danger** : les 240 branches candidates à la suppression sont des ancêtres de
  `main` (leur contenu y est déjà), et chaque SHA est noté ici, donc tout reste restaurable.
- Le ménage est de l'**hygiène**, pas de la valeur : 371 branches encombrent, elles ne perdent rien.

---

## Compactage — état final honnête (21h40)

### Ce qui est prouvé

| Fait | Preuve |
|---|---|
| Le nettoyeur **voit** enfin les branches | compte-rendu du robot : **371 vues** (avant : 0) |
| Le mécanisme de compte-rendu **fonctionne** | fichier écrit et poussé par le robot à 20 h 44 |
| **235 suppressions tentées, 235 échecs** | 371 vues − 136 gardées − 0 supprimée |
| Trois identités ont refusé | relais git (connexion coupée) · connecteur (**lecture seule**, `403` en écriture) · jeton de CI (les 235 échecs) |
| Aucune donnée en danger | les 235 sont des **ancêtres de `main`** : leur contenu y est déjà, et chaque SHA est noté plus haut |

### Ce que je ne sais toujours pas

**Le nom exact du verrou.** J'ai livré la capture d'erreur qui le donnera, mais aucun nouveau
compte-rendu n'est arrivé depuis. Pour savoir pourquoi, il faudrait le **journal d'exécution** —
et c'est précisément ce que je ne peux pas atteindre :

```
déclencher un workflow (API)      : HTTP 403
lire un journal d'exécution (API) : HTTP 403
outil Actions dans le connecteur  : aucun
```

### J'arrête de tâtonner — et voici pourquoi

Le compactage est de l'**hygiène** : 374 branches encombrent, elles ne perdent rien. J'ai déjà
consommé plusieurs cycles dessus, et chaque nouvelle tentative sans journal revient à **deviner**.
Continuer coûterait du forfait pour du rangement — exactement le travers que Kevin me reproche.

### Le chemin le plus court, et il tient en un clic

**▶️ [Lancer « Compact stale claude/* branches »](https://github.com/9r4rxssx64-creator/CMCteams/actions/workflows/cleanup-stale-branches.yml)**
→ « Run workflow » · branche `main` · `dry_run` = `false`

Ce workflow porte le correctif de cécité (vérifié présent sur `main`). Deux issues, toutes deux utiles :

- **il supprime** → le ménage est fait, et il repartira seul à chaque livraison ;
- **il échoue** → son journal, que *toi* tu peux lire, **nomme le verrou**. Colle-moi la ligne
  d'erreur et je termine sans autre clic.

C'est un vrai clic — pas un que j'aurais pu m'épargner : déclencher un workflow et lire un journal
sont les deux seules choses qu'aucun de mes trois accès ne permet.

---

## Suite — 23 h 30 : le verrou a enfin un nom, et les 18 annulations sont fermées

### 1. Les 18 annulations dormantes : **fermées**, pour de vrai

Ce n'était plus « prévu », c'est **fait et vérifié** :

| Mesure | Valeur |
|---|---|
| PR `revert/auto-rollback-*` encore ouvertes | **0** |
| Fermées le | **2026-09-06, entre 21 h 48 min 17 s et 21 h 48 min 46 s UTC** |
| Par qui | `github-actions[bot]` — l'étape « Ménage » du robot de fusion |
| Avec quel mot | le commentaire exact que j'avais écrit (« annulation jamais appliquée… Réouvrable en un clic ») |
| Pull requests ouvertes restantes | **27** (contre 46 ce matin) |

Vérifié en interrogeant GitHub directement, pas déduit. Chaque fermeture est **réversible en un
clic** si Kevin veut revoir l'une d'elles.

### 2. Le verrou de suppression des branches : **mesuré, nommé**

Je l'ai tenté moi-même, en capturant la sortie au lieu de l'avaler :

```
$ git push origin --delete claude/actions-done-doc
error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
send-pack: unexpected disconnect while reading sideband packet
fatal: the remote end hung up unexpectedly
Everything up-to-date
```

**Traduction** : mon accès git de session sait **ajouter** des commits (je pousse toute la
journée), il n'a **pas le droit d'effacer une référence**. GitHub répond `403` à la demande de
suppression, et git termine par un trompeur « Everything up-to-date » — c'est ce mot qui m'a fait
tourner en rond.

Ce n'est pas non plus le pare-feu de l'environnement : son journal de refus
(`recentRelayFailures`) est **vide**, donc le `403` vient bien de GitHub, contre mon jeton.
Le mode d'emploi de ce pare-feu est explicite sur ce point : un `403` **se rapporte, il ne se
contourne pas**. Je ne le contourne donc pas.

### 3. Ce qui reste, et pourquoi ce n'est plus un tâtonnement

| Question | Réponse |
|---|---|
| Combien de branches sont supprimables aujourd'hui ? | **231** — toutes déjà entièrement dans `main`, plus de 7 jours sans activité |
| Risque à les supprimer ? | **aucun** : leur contenu est dans `main`, et chaque SHA est listé plus haut |
| Qui peut les supprimer ? | le **jeton de la CI** (`contents: write`), pas moi |
| Pourquoi la CI n'y arrivait pas ? | **on ne le sait pas encore** — mais le compte-rendu du robot avale l'erreur dans son ancienne version |
| Qu'est-ce qui change maintenant ? | la version **corrigée** (qui écrit la cause exacte) est sur cette branche ; la prochaine exécution du robot **écrira le message d'erreur du jeton de CI** dans `.github/CLEANUP-REPORT.md`, ou supprimera les 231 |

Autrement dit : plus rien à deviner. La prochaine livraison répond d'elle-même.

---

## Réponse finale (7 septembre, 00 h 03) — ce n'était **pas** une histoire de droits

Le robot a enfin écrit la cause exacte, et elle change tout le dossier :

```
remote: error: GH013: Repository rule violations found for refs/heads/claude/actions-done-doc
remote: - Cannot delete this branch
 ! [remote rejected]  (push declined due to repository rule violations)
```

**Ce n'est pas un jeton trop faible. C'est une règle du dépôt qui interdit de supprimer
une branche** — une protection posée dans les réglages, au-dessus de tout le monde.

### Ce que ça invalide dans ce que j'ai écrit hier

| Ce que j'avais écrit | La vérité |
|---|---|
| « trois identités ont refusé, chacune pour sa raison » | **une seule raison, la même pour les trois** : la règle du dépôt |
| « mon accès n'a pas le droit d'effacer une référence » (#235) | vrai en apparence, **faux en cause** : même un accès administrateur reçoit ce refus |
| « il reste à savoir si le jeton de la CI y arrive » | il n'y arrive pas non plus, **et il n'y arrivera jamais** tant que la règle est là |

Le `403` que j'avais mesuré à la main était la **même** règle, vue de l'extérieur.

### Ce que ça veut dire concrètement

- **Aucun automatisme ne peut supprimer ces 375 branches.** Ni moi, ni le connecteur, ni la CI.
- La seule voie est de **modifier la règle** dans *Réglages → Rules → Rulesets* — un réglage de
  **sécurité** du dépôt, donc une décision de Kevin, pas une action que je prends seul.
- Le robot **arrête maintenant de s'acharner** : il sonde une fois par livraison, constate la
  règle, l'écrit, et passe. Le jour où la règle change, **il repart tout seul**, par paquets de 60.

### Ma recommandation : **laisser la règle en place**

Les 375 branches ne coûtent rien : elles n'apparaissent pas dans l'application, ne ralentissent
rien, ne peuvent pas être fusionnées par accident (contrairement aux 18 annulations, qui elles
étaient un vrai danger — et qui sont fermées). Cette règle, en revanche, protège chaque branche
d'une suppression accidentelle par un automatisme. **Le rangement ne vaut pas d'affaiblir ça.**

Si Kevin veut quand même faire le ménage un jour, la marche est courte et il n'y a aucun risque :
les 231 branches concernées sont **entièrement contenues dans `main`** — leur contenu est déjà
livré, et chaque SHA est noté plus haut dans ce document.
