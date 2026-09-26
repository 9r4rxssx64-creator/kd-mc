# audit/03 — FINDINGS (Passe 1)

> Priorités : P0 faille/crash/blocage · P1 dégrade fortement · P2 amélioration nette · P3 confort.
> **Aucun P0 découvert.** L'app est mature et déjà durcie (cf. `00-INVENTAIRE.md` §3/§5). Les findings ci-dessous sont réels, mesurés, et modestes — je ne fabrique pas de P0 pour « faire un audit impressionnant » (Loi 1).

---

## ✅ P0 vérifiés comme ABSENTS (preuves)

- **Clé API en dur** → `grep sk-ant-api[0-9]` hors tests = **0**. ✅ VÉRIFIÉ. (Le brief le posait comme « P0 absolu à corriger » — ici il n'existe pas : clé fournie par l'admin, stockée device-local, ou proxy serveur.)
- **Build cassé** → `test:check-syntax` exit **0**. ✅ VÉRIFIÉ.
- **Écriture Firebase shops anonyme** — ❌ **CE POINT ÉTAIT FAUX, RE-MESURÉ LE 6.09.2026 : LA FAILLE EST OUVERTE.**
  Il était classé « P0 vérifié comme ABSENT (verrou `_phase_shops_rolelock` = ON) ». Mesure réelle sur
  `firebase-rules-apex.json` : `shops_admin_v1/logos/$shop/$id/.write = true` et
  `ld_detente/push_sub/.write = true` sont **inconditionnels** (n'importe qui écrit), et
  `shops_admin_v1/{orders,products,logos}/.read = true` + `shops_sourcing_v1/selection/.read` +
  `ld_detente/.read` sont **publics en lecture**. Le bloc `_phase_shops_rolelock` existe bien dans le
  fichier mais c'est un **payload optionnel non appliqué** : `deploy-cmcteams-rules.yml:78` a
  `SHOPS_LOCK: ${{ github.event.inputs.shops_lock || 'keep' }}` — **`keep` par défaut**, donc le verrou
  n'est jamais armé tout seul. Un document qui déclare une faille fermée alors qu'elle est ouverte est
  pire que pas de document : il dit d'arrêter de chercher.
  **Correctif = une décision de Kevin** (changer des règles Firebase touche la production en direct) :
  relancer `deploy-cmcteams-rules.yml` avec `shops_lock=on`, après avoir vérifié que les boutiques
  écrivent bien via un compte authentifié — sinon le verrou casse les commandes clients.

---

## P2 — améliorations nettes

### [P2] F-C1 — Clé Anthropic de l'admin en clair dans `localStorage` (chemin sans proxy)
- **Axe** : C — Sécurité
- **Fichier** : `index.html:13194`, `:44446` (`_resolveIaKey`)
- **Preuve** ✅ : `var apiKey=localStorage.getItem("cmc_ia_key")…` puis `headers["x-api-key"]=apiKey; headers["anthropic-dangerous-direct-browser-access"]="true"` quand aucun `cmc_ia_proxy` n'est configuré.
- **Impact** : la clé de l'admin vit en clair dans le `localStorage` de son navigateur → exfiltrable si un XSS existait. Ce n'est **pas** un secret committé (aucune fuite dépôt).
- **Cause** : chemin de repli « appel direct navigateur » conservé pour marcher sans proxy.
- **Correctif** : rendre le **proxy Cloudflare le défaut** (`cmc-parser-proxy` existe déjà, workflow `cmc-parser-proxy-deploy.yml`) ; ne conserver l'appel direct que si l'admin l'active explicitement, avec avertissement. Optionnel : chiffrer `cmc_ia_key` au repos (AES-GCM, comme le vault Apex).
- **Test** : un test qui vérifie que, proxy configuré, aucun header `x-api-key` ne part vers un tiers.
- **Effort** : M · **Régression** : le repli direct doit rester possible (Kevin sans proxy).

### [P2] F-C2 — 145 `innerHTML`, 16 en concaténation sans `esc()`
- **Axe** : C — Sécurité / B — Code
- **Preuve** 🟡 DÉDUIT : échantillon des 16 → markup **statique/contrôlé-app** (`<div>`, `<button>` depuis tableaux internes, object-URL d'image, `_cmcBreadcrumb()+vMain()`). `esc()` défini (l.4931) et utilisé sur les données employé/planning dans les vues de rendu.
- **Impact** : faible aujourd'hui, mais surface à surveiller (données planning = noms de personnel SBM).
- **Correctif** : ajouter un **garde CI** (grep) qui échoue si un `innerHTML=` interpole une variable de données non passée par `esc()` — transforme un audit manuel en filet permanent (Phase 8).
- **Effort** : S · **Régression** : nulle (test only).

### [P2] F-H1 — vRGPD / rétention des données personnel SBM non couvertes par test
- **Axe** : H — Données & confidentialité
- **Preuve** 🔴 SUPPOSÉ : `vRGPD` existe mais aucun test dédié ; la politique de rétention (noms, matricules, plannings, présence, géoloc `vGeolocationCMC`) n'est pas vérifiée automatiquement.
- **Impact** : données de personnel (RGPD) — accès admin-only via 399 gardes, mais pas de preuve de purge/rétention.
- **Correctif** : test qui vérifie (a) données personnel jamais dans le dépôt/tests, (b) `vRGPD` expose export + effacement, (c) géoloc opt-in.
- **Effort** : M.

## P3 — confort / dette

### [P3] F-B1 — `index.html` mono-fichier de 49 630 lignes
- **Axe** : B — Architecture. **Preuve** ✅ : `wc -c` = 3,33 Mo. Dette de maintenabilité structurelle assumée (leçon CLAUDE.md « monolith > 15K lignes »). Non corrigeable en une passe sans risque ; à traiter par extraction progressive de modules non-critiques. Effort : L.

### [P3] F-D1 — quelques `<img>` sans `loading="lazy"`
- **Axe** : D — Perf. **Preuve** ✅ : `vGalerie` **a** déjà `loading="lazy"` + `alt` (bon) ; **12** autres `<img>` dans `index.html` sans `loading=`. Impact mineur. Correctif : ajouter `loading="lazy"` + `width/height` (anti-CLS) aux `<img>` restants. Effort : S.

### [P3] F-L1 — 46 `console.log` + 18 TODO/FIXME
- **Axe** : L — Dette. **Preuve** ✅. Nettoyage cosmétique ; aucun `console.log` ne fuit de secret (vérifié : pas de clé loguée). Effort : S.

---

## [P1] F-K1 — le gate `test:ci` est ROUGE sur `main` (test `verify-finances-as-kevin` cassé) — DÉCOUVERT passe 2
- **Axe** : K — Tests & CI.
- **Preuve** ✅ VÉRIFIÉ : `node tests/verify-finances-as-kevin.mjs` (déjà dans `test:ci` sur origin/main) → **exit 1**, `page.waitForFunction: Timeout 30000ms` (l.91, flux de reconnaissance « 3 op » de l'app **Finances**). Échoue en standalone → **pas ma régression** (mes 4 nouveaux tests passent : render-views 95/95, rgpd 6/6, a11y 0 crit, xss-guard OK).
- **Impact** : tant qu'il casse, le gate `test:ci` complet ne peut pas être « vert » → aucune preuve de non-régression globale ; un vrai bug de CMCteams pourrait passer inaperçu derrière ce rouge chronique.
- **Cause** : app **Finances** (autre app du monorepo, v0.8.x) — sélecteur/flux d'analyse de relevé probablement périmé, OU dépendance proxy non satisfaite en local.
- **Correctif** : hors périmètre de cet audit CMCteams (app différente) → **à traiter séparément** : réparer le sélecteur/flux, OU sortir `verify-finances-as-kevin` de `test:ci` s'il n'est pas fiable hors CI. Ne PAS le laisser rouge chronique (règle #109 : un gate rouge en permanence masque les vraies régressions).
- **Effort** : M (côté équipe Finances). **Régression** : nulle sur CMCteams.

## Mise à jour PASSE 5 (2026-07-14) — 2 derniers « non fait » de la passe 4 traités

### Comportement des 95 vues (angle mort passe 2 « rendu ≠ comportement ») → RÉSOLU (filet)
`test:view-behavior` : session admin, monte CHAQUE vue (sv→dc) puis **clique chaque bouton** de `#content` (hors destructifs) → échoue si un clic lève une exception JS ou vide la coquille. **99 boutons cliqués sur 95 vues, 0 crash** (2 runs stables). Dialogs/modals/popups auto-fermés, budget borné (cap 20/vue, loggé). C'est un **filet anti-crash comportemental** (pas une preuve fonctionnelle exhaustive de chaque bouton — un bouton peut réagir sans crasher mais mal agir ; ça resterait un E2E par bouton). Câblé bloquant dans `test:ci`.

### F-B1 mono-fichier (P3) → MIS SOUS CONTRÔLE (ratchet)
Aucune découpe sûre possible en une passe (globals partagés ; **0 doublon de fonction global** — v9.807 les a supprimés ; les 9 « doublons » restants sont des helpers LOCAUX homonymes, pas du code mort — ✅ VÉRIFIÉ). → `test:file-size-guard` : plafond ratchet (3 430 000 o / 51 000 lignes, ~3 % de marge sur le baseline 3 330 288 o / 49 631 lignes) → **la dette ne peut plus EMPIRER**. Objectif = faire BAISSER les plafonds au fil des extractions, jamais les monter. Discriminant (✅ VÉRIFIÉ : plafond abaissé → EXIT 1). Câblé bloquant dans `test:ci`.

## Mise à jour PASSE 4 (2026-07-14) — angles morts restants fermés (LIVE + second avis + runtime + dette)

### 🌐 PASSE LIVE RÉELLE exécutée (le gros manquant des passes 1-3)
`audit-live.yml` déclenché sur `main` → **vraies pages kd-mc.com dans un vrai Chromium** (runner CI, réseau ouvert — ce que l'agent ne peut pas atteindre, lecon #135). Run `29350567341`, 14 surfaces balayées. **Triage** :
- **[P1] F-LIVE1 — `apex-ai.kd-mc.com` : `/assets/js/rescue.js` → HTTP 404** (188 erreurs console). ✅ VÉRIFIÉ (log CI). **Cause** : le build Apex déploie `rescue.js` dans `apex-ai-v13/js/` alors que le HTML référence `assets/js/rescue.js` (la SOURCE `apex-ai/v13/` est cohérente ; c'est l'étape de build qui déplace l'asset). **Hors périmètre CMCteams** (app Apex AI, dossier build-régénéré lecon #128 → un patch manuel serait écrasé ; `rescue.js` = script de secours, la page charge). **Action** : corriger le pipeline de build Apex (non fait ici : autre projet + non vérifiable en live depuis l'agent = « ne rien casser »).
- **✅ Toléré / cosmétique** (pas des échecs) : CSP `frame-ancestors` via `<meta>` ignorée (bénin) ; Google Fonts bloqué par CSP → repli polices système ; World Monitor/OSINT CORS `adsb.lol`/Shodan (connu, lecon #127 — repli gratuit) ; CMCteams 356 req tierces/abortées (SSE/tuiles à la navigation) ; beacon Cloudflare CSP.
- **CMCteams lui-même : ✅ chargé sans erreur bloquante** (aucune exception JS, aucun asset 404 propre au projet).

### 🤝 SECOND AVIS INDÉPENDANT (non-Claude) exécuté
`security-suite.yml` déclenché sur `main` (gitleaks + TruffleHog + OSV-Scanner + Trivy + **Semgrep** SAST + zizmor). Run `29350578034`. Findings triés dans `05-JOURNAL.md` (analyse déterministe indépendante de Claude = le second avis exigé par la règle « fais ton audit »).

### F-C1 — preuve RUNTIME du routage (angle mort passe 3 fermé)
`test:ia-proxy-routing` (Playwright) pilote `_cmcAiHandleIssue` (pattern `isProxy` partagé) : **proxy configuré ⇒ requête vers le proxy, 0 `x-api-key`, 0 appel direct Anthropic** ; sans proxy ⇒ repli direct assumé (documenté). **Prouvé discriminant** (retirer le garde `if(!isProxy)` → EXIT 1). Complète le garde statique `test:ia-key-privacy`.

### F-D1 — `loading="lazy"` (dette P3 fermée, sans rien casser)
7 `<img>` de CONTENU passés en `loading="lazy" decoding="async"`. Les **5 `<img>` `onerror`-hack** (`src="" … display:none … this.remove()` qui déclenchent Face ID/météo/carte) sont **volontairement exclus** : un `<img>` lazy en `display:none` peut ne jamais charger → le callback `onerror` ne se déclenche pas → **casse la feature** (piège du F-D1 naïf). ✅ VÉRIFIÉ (`test:check-syntax` OK).

## Mise à jour PASSE 3 (2026-07-14) — F-K1 + F-C1 fermés (code testé)
- **F-K1 (gate rouge)** → **RÉSOLU** : `verify-finances-as-kevin` fiabilisé (fermeture drill/doc overlay entre actions, désambiguïsation onglet « Bilan », signal d'activation stable `#ai-off`). **3 runs → 47 OK / 0 P0** ; `npm run test:ci` **EXIT 0 end-to-end**. Bonus : bug réel corrigé (input `select.catsel` 12px→16px = plus de zoom iOS, +HIG 44px, Finances v0.12.1).
- **F-C1 (clé IA en clair)** → **MITIGÉ par garde CI** : `test:ia-key-privacy` (statique, discriminant) VERROUILLE les 2 seuls vecteurs de fuite (cmc_ia_key ∈ FB_LOCAL, jamais dans FB_FIX ; `_adminCfgBackup` ne pousse pas la clé vers la DB Firebase ouverte) → interdit toute réintroduction du **P0 lecon #787**. Le chiffrement au repos (théâtre device-local, lecon #55) et le proxy-par-défaut (couperait l'IA sans proxy = « ne rien casser ») restent **écartés volontairement** — documentés au JOURNAL.

## Mise à jour PASSE 2 (2026-07-14) — corrections livrées (code testé)
- **F-C2 (XSS)** → **RÉSOLU** : garde CI `test:xss-guard` (ratchet baseline 10) câblé dans `test:ci`. Tout nouvel `innerHTML` non échappé casse le gate.
- **F-H1 (RGPD)** → **RÉSOLU (test)** : `test:rgpd` (6/6) prouve export self, garde d'accès cross-user, admin protégé, confirmation « EFFACER », hash mdp redacté. (La *politique* de rétention reste un point produit, mais le mécanisme est testé.)
- **Angle mort « ~60 vues »** → **RÉSOLU** : `test:render-views` (95/95, 0 crash) câblé au gate.
- **Design non mesuré** → **RÉSOLU (baseline)** : `test:a11y` (axe-core, 0 critique) câblé au gate.
- **Cas conflit table/CMC+CDP** → **RECLASSÉ N/A par construction** (1 code = 1 lieu/jour ; pas de placement table/heure dans le modèle).
- **F-C1** (clé IA en clair localStorage) → **reste P2**, non fait (chemin IA de prod, à faire avec Kevin).

## Synthèse (après passe 3)
| P | Nb | 
|---|---|
| P0 | **0** |
| P1 | **0** (F-K1 résolu) |
| P2 | **0** restant (F-C1 mitigé par garde · F-C2 & F-H1 résolus) |
| P3 | 3 (F-B1, F-D1, F-L1) — dette assumée, non bloquante |
| Nouveaux gardes CI | render-views · rgpd · a11y · xss-guard · **ia-key-privacy** (bloquants) |

Gate `test:ci` **VERT end-to-end** (EXIT 0). Tous les findings P0/P1/P2 sont soit résolus, soit mitigés par un garde CI permanent. Restent 3 P3 de dette (mono-fichier, `loading=lazy`, console.log) — cosmétiques, non bloquants.

Le levier le plus utile n'est pas un correctif de code mais un **garde CI** (F-C2) : convertir la vérification XSS manuelle en filet permanent. C'est la logique Phase 8 « cause racine, pas pansement ».

---

## Passe 7 (2026-09-06) — relecture des `.md` : ce que je n'ai PAS corrigé, et pourquoi

Deux constats qui demandent une **décision de Kevin**, pas un correctif de ma part. Je les écris
ici plutôt que de « nettoyer » les documents, parce que dans les deux cas nettoyer le document
**ne changerait rien au problème réel** — ça donnerait seulement l'impression que c'est réglé
(exactement le « faux vert » de la leçon #103).

### F-P1 [P2] — Des noms de tiers sont dans le dépôt PUBLIC, mais c'est le CODE qui les porte, pas les docs

**Ce que j'ai mesuré le 6.09.2026** (dépôt `9r4rxssx64-creator/CMCteams`, **public**) :

| Donnée | Dans les `.md` | Dans le **code servi** |
|---|---|---|
| Nom complet de la compagne de Kevin | 15 fichiers | **25 fichiers** (`.html`/`.js`/`.ts`) |
| Noms des 6 Pit Boss (collègues) | quelques docs | **29 occurrences dans `index.html`** |
| Effectif nominatif | — | **261 entrées `DEF_EMP` dans `index.html`** |

**Pourquoi je n'ai rien caviardé** : ces noms ne sont pas des notes de travail, ce sont les
**données de fonctionnement de l'application** (la liste du personnel, les cadres). Les masquer
dans 15 documents pendant qu'ils restent dans le fichier livré au navigateur ne protège
personne — et deux rappels valent pour tout le reste de ce document :

1. **Masquer n'efface pas l'historique git.** Ce qui a été publié une fois est à considérer
   comme connu, définitivement.
2. Ce sont des **données de tiers** (collègues, proches) qui n'ont rien demandé — donc c'est un
   sujet RGPD réel, pas une coquetterie.

**Ce que ça demande comme décision (Kevin, pas moi)** — 3 options, de la moins à la plus lourde :
- **(a) Assumer** : le dépôt reste public avec l'effectif nominatif dedans. C'est un choix
  possible, mais il doit être **explicite et daté**, pas subi par défaut.
- **(b) Dépersonnaliser l'app** : les noms deviennent des identifiants (`U11804`…) et la
  correspondance nom↔identifiant vit dans Firebase (déjà authentifié), plus dans le dépôt.
  C'est le vrai correctif ; c'est un chantier, pas une passe de relecture.
- **(c) Rendre le dépôt privé.** Le plus rapide, mais ça casse GitHub Pages tel qu'il est servi
  aujourd'hui — donc à ne pas faire sans mesurer d'abord ce qui tombe.

### F-P2 [P1] — Le DPA Firebase affirmait une chose que son propre contenu contredit

`docs/DPA-Firebase.md` affirmait « région `europe-west1` ✅ EU » et en tirait « pas de transfert
hors EU », **alors que l'adresse citée dans le document même** — et surtout celle réellement
appelée par le code déployé (`index.html:6545`) — est `kdmc-clients-default-rtdb.firebaseio.com`,
la forme **us-central1**. Un relevé Lighthouse réel prouve que cette adresse **répond**.

Je n'ai pas d'accès réseau à la console Google : je **ne peux pas** trancher, donc je n'affirme
ni l'un ni l'autre. J'ai retiré la certitude fausse et écrit la vérification en 1 clic dans le
document. **Tant que Kevin n'a pas ouvert la console, ce DPA ne doit servir d'argument RGPD
devant personne.** Détail complet : encadré du §3 de `docs/DPA-Firebase.md`.
