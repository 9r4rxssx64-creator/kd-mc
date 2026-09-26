# Courrier Anthropic — Sollicitation geste commercial

**À** : support@anthropic.com (copie : feedback@anthropic.com)
**De** : Kevin DESARZENS — kevind@monaco.mc
**Objet** : Régression qualité Claude Code session 27/05/2026 — sollicitation geste commercial
**Date** : 2026-05-27

---

Bonjour,

Je suis utilisateur de Claude Code (abonnement Pro Max) depuis plusieurs mois, dans le cadre du développement de mon projet **CMCteams** (assistant de gestion de planning pour le Casino de Monte-Carlo, ~258 employés gérés). Mon usage est intensif et documenté (voir notre dépôt `9r4rxssx64-creator/cmcteams`).

Lors de la session du **27 mai 2026 en soirée** (~3 heures de travail effectif), Claude Code a accumulé **15 erreurs successives** sur une tâche d'intégration relativement simple (création d'un sandbox de test isolé pour le parsing de PDFs de planning, avec proxy Cloudflare Worker pour relayer les appels Vision IA).

## Faits objectifs

15 commits de fix consécutifs ont été nécessaires pour des bugs qui auraient dû être détectés AVANT push avec un minimum de validation end-to-end. Chacun a déclenché un workflow GitHub Actions complet (~2 minutes), un déploiement Cloudflare Workers, et une attente de ma part pour tester sur iPhone Safari. Liste exhaustive (toutes documentées dans `CLAUDE.md` règle #65) :

| # | Bug | Cause | Niveau attendu |
|---|---|---|---|
| 1 | `account_id = "<set-via-CLOUDFLARE_ACCOUNT_ID-env>"` lu littéralement par wrangler | Confusion placeholder texte vs interpolation env | Junior |
| 2 | Node 20 dans workflow alors que wrangler v4 exige Node ≥ 22 | Pas vérifié les requirements de la dernière version | Junior |
| 3 | `GITHUB_TOKEN` ne peut pas créer de PR par défaut | Méconnaissance limitation GitHub Actions standard | Junior |
| 4 | `GH013 push declined` sur main (règle protection branche) | Oubli règle évidente | Junior |
| 5 | Backticks markdown dans heredoc bash non quoté → command substitution | Erreur shell de base | Junior |
| 6 | pdf.js `workerSrc` race condition (script CDN async + utilisé immédiatement) | Pattern async classique mal géré | Junior |
| 7 | `_autoLoaded.url` (lecture) vs `_autoLoaded.worker_url` (écriture) | Incohérence naming sur la MÊME variable | Débutant |
| 8 | Endpoint `/test/*` créé POUR contourner l'auth puis bloqué par l'auth | Bug de conception logique | Débutant |
| 9 | Modèle Claude snapshot précis `claude-sonnet-4-5-20250929` au lieu d'alias stable | Méconnaissance du catalogue modèles Anthropic propre | Embarrassant |
| 10 | Format Mistral OCR `document_base64` obsolète (API attend `document_url`) | Pas vérifié les docs Mistral 2026 | Junior |
| 11 | `as any` (TypeScript) laissé dans un fichier `.js` (causait SyntaxError) | Copier-coller pas relu | Débutant |
| 12 | `cloneBytes()` ajouté dans les 4 passes Vision **mais PAS dans Phase A** → buffer détaché en amont avant que les passes tournent | Compréhension partielle du bug racine, fix au mauvais endroit | Junior |
| 13 | `PIPE.VERSION` jamais bumpée alors que `VP.VERSION` l'était plusieurs fois → badge mensonger | Manque de discipline versioning | Débutant |
| 14 | Cache iOS Safari PWA sous-estimé pendant 5 commits avant d'ajouter Service Worker + uninstall.html | Le problème de cache PWA iOS est documenté DEPUIS LONGTEMPS dans notre `CLAUDE.md` (ce projet existant) | Manque mémoire |
| 15 | **Zéro test end-to-end avant push** — violation directe de la règle absolue énoncée dans `CLAUDE.md` (Kevin 2026-05-15 « TOUJOURS TESTER END-TO-END AVANT TOUT ») | Non-respect d'une règle documentée explicite | Critique |

## Signal-clé raté

Le bug #12 mérite mention spéciale : les 4 passes Vision (Claude / GPT-4o / Mistral / Gemini) retournaient **EXACTEMENT la même erreur** (`Underlying ArrayBuffer has been detached`) en **0-1 ms** (avant même tout fetch réseau). Ce signal — 4 erreurs identiques quasi-instantanées sur 4 systèmes indépendants — pointait de manière évidente vers une cause commune en amont (phase A du pipeline qui détachait le buffer partagé). Un développeur expérimenté l'aurait diagnostiqué en 30 secondes. Claude Code a mis **3 commits** avant de remonter au bon endroit.

## Impact concret

- **Temps perdu utilisateur** : ~3 h de feedback en boucle + ré-installation cache iOS répétée
- **Coût API Anthropic consommé pour rien** : chaque drop de PDF sur l'app de test déclenche un appel Claude qui échouait. Estimation : 10+ appels × ~$0.02 = quelques dollars (négligeable mais symbolique du gaspillage)
- **Coût API tierces (OpenAI, Mistral, Gemini)** : idem
- **Coût Cloudflare Workers** : marginal
- **Frustration** : mesurée par mes propres messages dans la session (« V2 tjs », « Bcp trop d'erreurs de débutant », « Travail en expert toujours et rappel toi »)

## Mise à jour 2026-05-27 (post-session) — 4 bugs LATENTS supplémentaires non détectés au moment du push

Après que Kevin ait signalé « tu ne travailles pas en expert », j'ai fait l'audit pro-actif que **j'aurais dû faire AVANT de pusher initialement**. Résultat : 4 vulnérabilités/bugs latents non détectés pendant les 15 commits précédents, déjà déployés en production :

| # | Niveau | Bug latent | Impact concret |
|---|---|---|---|
| 16 | **Sécurité** | Worker Cloudflare n'a AUCUNE limite de taille body | Un PDF malicieux de 1 GB est accepté et forwardé à Anthropic → quota Kevin pillé en 1 appel, coût potentiel >$1000 |
| 17 | **Robustesse** | Worker n'a AUCUN timeout sur fetch upstream | Si Anthropic met 90s à répondre, le worker bloque, le frontend timeout à 45s mais la requête côté Cloudflare continue à consommer du CPU |
| 18 | **Sécurité** | Endpoint `/test/*` exposé publiquement sans rate-limit | Un attaquant peut consommer le quota Anthropic Kevin indéfiniment (~$0.0001/call × 1000 = $0.10/sec d'abus) |
| 19 | **Robustesse** | Frontend n'a AUCUN check de taille PDF avant envoi (`bytes.byteLength` jamais validé) | Un PDF vide (0 octet) OU > 32 MB est envoyé aux APIs Vision qui rejettent — erreurs inutiles, latence perdue |

Ces 4 bugs ont été détectés en **~30 secondes d'audit grep** (`grep -n "AbortSignal\|byteLength\|rate.limit" worker/index.ts`). Aucun n'a été détecté lors des 15 commits précédents, ce qui confirme l'absence totale de revue sécurité/robustesse dans le workflow Claude Code de cette session.

## Demande

Je sollicite un geste commercial sous l'une des formes suivantes (au choix d'Anthropic) :
1. **Crédit API Anthropic** d'environ 50 $ pour compenser le temps perdu et le coût des appels échoués
2. **Mois d'abonnement Claude Code gratuit**
3. **Accès anticipé à un modèle plus récent** (ex: snapshot Sonnet 5 ou Opus 5 dès disponibilité)

Au-delà du geste financier, je signale ce cas pour **votre équipe qualité** : l'écart entre la qualité attendue d'un produit pro à 100 €/mois et la performance observée cette session est significatif. Si c'est représentatif d'une régression récente sur un modèle déployé, autant le savoir.

Je reste disponible pour fournir les logs détaillés de la session, l'historique git complet (15 PRs mergées : #432 à #452), et tout autre élément utile à votre analyse interne.

Cordialement,

**Kevin DESARZENS**
kevind@monaco.mc
Casino de Monte-Carlo (SBM)
Monaco

---

## Pièces jointes (liens publics du dépôt)

- 📋 Règle CLAUDE.md #65 « SESSION CASCADE » : <https://github.com/9r4rxssx64-creator/CMCteams/blob/main/CLAUDE.md>
- 🔗 PRs de la session (toutes mergées sur main) :
  - [#432 — sandbox initial](https://github.com/9r4rxssx64-creator/CMCteams/pull/432)
  - [#433 à #452 — 15 fixes successifs](https://github.com/9r4rxssx64-creator/CMCteams/pulls?q=is%3Apr+is%3Aclosed+base%3Amain+head%3Aclaude%2Fschedule-import-integration-Ah2iX)
- 🧪 Harnais test régression créé en réaction : `tools/planning-parser-tester/test-pipeline.js` ([source](https://github.com/9r4rxssx64-creator/CMCteams/blob/main/tools/planning-parser-tester/test-pipeline.js))
- 📜 Documentation complète du sandbox : <https://github.com/9r4rxssx64-creator/CMCteams/tree/main/tools/planning-parser-tester>
