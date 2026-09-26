# audit/05 — JOURNAL (décisions, hypothèses, limites, auto-critique)

## Décisions
1. **Le dépôt n'est pas React** (0 `.jsx`, pas de `src/`, react absent). J'ai suivi la Loi 2 : au lieu d'appliquer le brief à la lettre (installer vitest+RTL+Playwright+Error-Boundary React), j'ai **adapté l'audit à la stack réelle** (SPA vanilla mono-fichier). Installer une stack React aurait violé la Loi 4.
2. **Ne pas réinstaller une prévention déjà présente** : le dépôt a déjà 121 workflows dont `gitleaks.yml`, `semgrep.yml`, `strix-scan.yml`, `cmc-runtime-audit.yml`, `audit-live.yml`, + `CLAUDE.md` (143 leçons). La Phase 8 du brief existe déjà à ~90 %. J'ai **vérifié** son existence plutôt que la recréer.
3. **Branche `claude/audit-passe-1`** (préfixe `claude/` au lieu du `audit/passe-1` du brief) pour rester compatible avec l'automatisation du dépôt (auto-merge/cleanup ne gèrent que `claude/*`) — consigné ici par honnêteté.
4. **Aucun P0 fabriqué.** Après vérif réelle, le P0-absolu du brief (clé API en dur) est **absent**. Je le dis, plutôt que d'inventer un finding pour « faire riche ».
5. **Pas de réécriture de composants design à l'aveugle** : sur une SPA de prod 3,3 Mo sans mesure pixel live, ce serait Loi 1/Loi 4 violées. Je **recommande de mesurer d'abord** (axe-core live).

## Hypothèses écrites (Loi 2)
- 🔴 La clé IA direct-navigateur est **la clé de Kevin** (admin), pas une clé partagée multi-utilisateurs → risque circonscrit à son appareil. À confirmer avec Kevin.
- 🔴 Les ~60 vues sans test dédié (studios, live, geo, stats secondaires) **fonctionnent** mais ne sont pas prouvées → angle mort assumé.

## Ce que je N'AI PAS pu vérifier cette passe
- Contraste réel / rendu pixel / axe-core (nécessite la passe live `audit-live.yml` en CI — non déclenchée ici).
- `npm audit` des devDeps (outillage non servi au client — faible priorité).
- Les cas métier « 2 croupiers même table » / « CMC+CDP simultané » en **runtime réel** (pas de test dédié → 🔴).
- Exhaustivité fonctionnelle des 102 vues : le gate `test:ci` couvre le **cœur** (import/parsing/départs/équipes/auth), pas les 60 vues périphériques.

## Auto-critique honnête
- **Le point le plus faible de mon audit est** : la couverture fonctionnelle. J'ai prouvé le cœur métier (import/départs/équipes/auth via le gate maison), mais **~60 des 102 vues n'ont aucun test dédié** ; je ne les ai pas toutes exercées en runtime cette passe (budget d'une session vs app de 49 630 lignes). La Loi 3 (exhaustivité) n'est donc **pas** pleinement satisfaite sur les vues périphériques — je le déclare au lieu de le masquer.
- **Ce que je n'ai pas pu vérifier est** : le contraste/design en pixel réel, le RGPD/rétention en runtime, et 2 cas métier de conflit d'affectation.
- **Ce dont je ne suis pas certain est** : que les 16 `innerHTML` en concat sans `esc()` soient TOUS sûrs — je les ai échantillonnés (statiques/contrôlés-app), pas prouvés un par un ; d'où le finding F-C2 qui propose un **garde CI** plutôt qu'une affirmation.

## Prochaine passe (recommandée, non faite)
1. Livrer le **garde CI XSS** (F-C2) + **axe-core** dans un smoke Playwright (design measurable).
2. Écrire 3-4 tests métier manquants : conflit table/horaire, CMC+CDP simultané, vRGPD export/effacement.
3. Rendre le proxy IA par défaut (F-C1).

---

## PASSE 2 (2026-07-14) — correction des angles morts de l'auto-critique ✅ VÉRIFIÉ

Chaque manquant de l'auto-critique de la passe 1 a été corrigé par **du code testé** (pas des docs) :

| Angle mort passe 1 | Correction passe 2 | Preuve |
|---|---|---|
| **~60 vues périphériques sans test** | `test:render-views` — smoke qui rend **les 95 routes** en session admin | **95/95 OK, 0 crash, 0 pageerror** ✅ |
| **RGPD/rétention non testé** (F-H1) | `test:rgpd` — export self/garde d'accès/admin protégé/confirmation/hash redacté | **6/6 OK** ✅ |
| **Contraste/design non mesuré** | `test:a11y` — axe-core WCAG 2 AA sur accueil/monplanning/rgpd/departs | **0 violation critique** ✅ (caveat : contraste plein-page = `audit-live.yml`) |
| **2 cas conflit d'affectation « non prouvés »** | **RECLASSÉ N/A** : le planning est jour-par-code, le **lieu dérive du code** → 1 lieu/jour **par construction** ; aucune couche de placement table/heure n'existe. `detectRepoConflicts` gère les 5 conflits réels (couvert par `test:verify`). ✅ VÉRIFIÉ (lecture `getCodeLieu`/`CADRE_LIEU`) | ce n'était pas un bug mais une **mauvaise classification** de ma part en passe 1 |
| **16 innerHTML sans esc() « échantillonnés »** (F-C2) | `test:xss-guard` — **ratchet** : baseline 10, échoue si un NOUVEAU innerHTML non échappé apparaît | **10 ≤ 10 OK** ✅ (garde permanente) |

Les 4 nouveaux tests sont **câblés dans `test:ci`** (gate bloquant). `axe-core` ajouté en devDependency.

### Ce qui RESTE honnêtement non fait après passe 2
- **F-C1** (proxy IA par défaut / chiffrer `cmc_ia_key`) : non fait — touche le chemin d'appel IA de prod, à faire avec Kevin (risque de couper l'IA s'il n'a pas de proxy). Reste P2.
- **axe-core contraste plein-page** : le smoke mesure sur contenu injecté (0 critique) ; le contraste réel pixel exige la passe live `audit-live.yml` (réseau ouvert CI) — non déclenchée cette passe.
- **Couverture fonctionnelle FINE** : `render-views` prouve que les 95 vues *rendent sans erreur*, pas que chaque bouton *fait la bonne action* (ça resterait un effort E2E par vue). Le smoke attrape les crashes/vues mortes, pas les bugs de logique métier des vues périphériques.

### Auto-critique passe 2 (honnête)
- **Le point le plus faible reste** : `render-views` valide le RENDU, pas le COMPORTEMENT (un bouton d'une vue périphérique peut rendre OK mais mal agir). C'est un filet anti-crash/anti-vue-morte, pas une preuve fonctionnelle exhaustive.
- **Non certain** : le a11y « 0 violation » sur contenu injecté peut sous-estimer le contraste réel (styles calculés partiels hors layout complet) — d'où le caveat live. Je ne survends pas un « a11y parfait ».

---

## PASSE 3 (2026-07-14) — F-K1 + F-C1 fermés ✅ VÉRIFIÉ

### F-K1 — le gate `test:ci` était rouge (finances) → VERT
Cause racine trouvée par exécution réelle (Loi 1), 3 défauts cumulés dans le TEST (pas le produit — l'app Finances marchait) :
1. le balayage de boutons ouvrait le drill-down `#drillov` / aperçu `#docov` (feature légitime, lecon #148) qui interceptait les clics suivants → timeout 30 s → throw ;
2. l'onglet « Bilan » est devenu ambigu en v0.12 (`🔎 Bilan` vs `📑 Bilan complet`) → `#bq` introuvable ;
3. l'activation IA attendait un message `#ai-msg` **transitoire** (~700 ms avant re-render) = flaky.
Corrections test (aucune simulation à la place de l'app) : `dismissOverlays()`, `gotoTab` clique le `.tab` au texte le plus court, attente du signal **stable** `#ai-off`. **Preuve : 3 runs → 47 OK / 0 P0 ; `npm run test:ci` EXIT 0.** Bonus produit : `select.catsel` 12px→16px (zoom iOS) + 44px (HIG), Finances v0.12.1.

### F-C1 — clé IA en clair : garde CI (pas de code risqué)
Décision d'expert « ne rien casser / toujours testé réel » : les deux « corrections » du finding sont **écartées** —
- chiffrer `cmc_ia_key` au repos = **théâtre** (la clé de déchiffrement vit sur le même device ; lecon #55 : le XOR device-bound a déjà cassé le vault) ;
- forcer le proxy par défaut = **couperait l'IA** de Kevin s'il n'a pas de proxy déployé, et **je ne peux pas le tester en live** (egress bloqué, lecon #135).
Ce qui compte réellement (« la clé ne quitte pas le device ») est **déjà en place et vérifié par lecture** : `cmc_ia_key` ∈ `FB_LOCAL` (jamais synchronisé), `_adminCfgBackup` **ne pousse plus** `iaKey` vers la DB Firebase ouverte (fix lecon #787), et `_adminCfgRestore` **scrube** toute clé léguée. J'ai donc converti F-C1 en **garde permanent** `test:ia-key-privacy` (statique, **prouvé discriminant** : casser FB_LOCAL OU réintroduire `iaKey:` dans le backup → EXIT 1) qui **interdit** la réintroduction du P0 lecon #787. C'est la logique Phase 8 : verrouiller le vecteur de fuite plutôt qu'un correctif risqué non testable.

---

## PASSE 4 (2026-07-14) — fermeture des DERNIERS angles morts déclarés ✅

Kevin : « Fais tout ce que tu n'as pas pu faire dans ton audit ». J'ai repris chaque manquant explicitement déclaré aux passes 1-3 :

| Manquant déclaré (passes 1-3) | Passe 4 | Preuve |
|---|---|---|
| **PASSE LIVE RÉELLE jamais exécutée** (le plus gros) | `audit-live.yml` déclenché sur le VRAI domaine (14 surfaces, vrai Chromium, runner CI) | Run **29350567341** lu via GitHub MCP → 1 P1 réel (Apex AI `rescue.js` 404, hors périmètre CMCteams) + reste toléré ; **CMCteams charge sans erreur bloquante** |
| **SECOND AVIS non-Claude jamais obtenu** | `security-suite.yml` déclenché (gitleaks/TruffleHog/OSV/Trivy/Semgrep/zizmor) | Run **29350578034** — findings triés ci-dessous |
| **F-C1 : garde statique ne prouve pas le ROUTAGE runtime** | `test:ia-proxy-routing` (Playwright, discriminant) | proxy ⇒ 0 `x-api-key`, 0 appel direct Anthropic ✅ |
| **F-D1 : `<img>` sans `loading=lazy`** | 7 imgs de contenu → lazy ; 5 `onerror`-hacks exclus (sinon casse les callbacks) | `test:check-syntax` OK ✅ |

Gate `test:ci` **EXIT 0** avec les 2 nouveaux garde/test câblés.

### Second avis (security-suite) — triage ✅ VÉRIFIÉ (lecon #83 : je vérifie, je ne prends pas le compte brut)
Run **29350578034**, scan de TOUT le monorepo + **6366 commits d'historique** (toutes les apps, pas seulement CMCteams). Totaux bruts : **1182** (gitleaks 92 · trufflehog 32 · osv 14 · trivy **0** · semgrep 455 · zizmor 589). Un compte brut n'est PAS un finding → triage :

- **gitleaks 92 + trufflehog 32 « secrets » → 0 secret LIVE confirmé.** J'ai inspecté les correspondances du tree courant : ce sont (a) la **clé Web Firebase publique** `AIzaSy…` (publique PAR DESIGN, gated par les Security Rules — documentée `FIREBASE_WEB_API_KEY` dans CLAUDE.md), (b) des `/-----BEGIN PRIVATE KEY-----/` en **regex de nettoyage** (code qui MANIPULE une clé chargée d'un secret runtime — aucune matière de clé), (c) des artefacts `coverage/`, (d) l'historique git (fixtures/anciens commits). **L'outil non-Claude CONVERGE avec mon audit passe-1 (0 secret live).**
- **trivy 0 = FAUX zéro** : l'install trivy a échoué (`/tmp/trivy: No such file`) → l'outil n'a pas tourné. **Corrigé** (garde `if [ -x /tmp/trivy ]` → saut propre, OSV couvre déjà les deps).
- **Bug résumé Firebase (HTTP 400)** : la clé `trivy (vulns/secrets)` contenait un `/` (interdit en clé RTDB) → le PUT `ax_security_last` échouait → **le chat Apex ne voyait jamais l'état sécu**. **Corrigé** (`vulns-secrets`).
- **osv 14 (deps)** : CVE de dépendances Python d'OUTILS (seo skill, crypto-bot, backend, broadlink) — non servies aux users. Backlog tooling, non bloquant CMCteams.
- **semgrep 455 + zizmor 589** : repo-wide (toutes apps + 120+ workflows), majorité info/hardening (unpinned actions, permissions larges, `innerHTML`). Pour CMCteams, `test:xss-guard` (ratchet) tient déjà la dette `innerHTML`. Backlog de durcissement, pas des vulnérabilités exploitables.

**Conclusion du second avis** : aucun P0/secret live ; il CONFIRME l'audit Claude. Les 2 seuls correctifs actionnables immédiats étaient des bugs de l'OUTIL lui-même (trivy install + clé Firebase `/`) → corrigés pour que le second-avis remonte enfin son état au chat de Kevin.

### Ce qui reste HONNÊTEMENT non fait après passe 4
- **F-LIVE1 (Apex AI `rescue.js` 404)** : autre projet (Apex, pas CMCteams), dossier build-régénéré (patch manuel écrasé, lecon #128), non vérifiable en live depuis l'agent → **documenté, pas corrigé** (« ne rien casser » sur un build tiers non testable). Action = pipeline de build Apex.
- **Behavior vs render (angle mort passe 2)** : un balayage de boutons sur les 95 vues CMCteams serait à haut risque de flakiness (→ gate rouge = « casser »). Le smoke Finances prouve DÉJÀ le pattern (balayage 65 boutons). Décision assumée : **ne pas** ajouter un balayage 95-vues fragile (risque > valeur) ; `render-views` reste un filet anti-crash, pas une preuve comportementale exhaustive.
- **F-B1 mono-fichier 49k lignes** : dette structurelle, non corrigeable en une passe sans risque (extraction progressive = chantier dédié).

---

## PASSE 5 (2026-07-14) — les 2 « restants » de la passe 4, traités ✅

Kevin : « Fais le 2 et le 3 » (les 2 items que la passe 4 déclarait non faits).

**#2 — comportement des 95 vues** (angle mort passe 2). `test:view-behavior` clique RÉELLEMENT chaque bouton de chaque vue (session admin) et échoue sur exception JS / coquille vidée. **99 boutons, 0 crash, 2 runs stables.** Décision de robustesse (« ne rien casser » = un gate flaky casse le workflow) : n'échoue QUE sur un vrai crash (pageerror/blank), pas sur un timeout de clic ; destructifs exclus ; dialogs/modals/popups auto-fermés ; budget borné (cap 20/vue, loggé — pas de troncature silencieuse). **Limite honnête** : c'est un filet ANTI-CRASH, pas une preuve que chaque bouton fait la BONNE action (ça = E2E par bouton, hors budget). Mais l'angle mort « une vue rend OK mais un bouton crashe » est désormais couvert.

**#3 — mono-fichier F-B1**. Vérifié qu'aucune découpe sûre n'est possible en une passe : **0 doublon de fonction GLOBAL** (v9.807 les a retirés), et les 9 noms « dupliqués » restants sont des helpers LOCAUX homonymes (`norm`, `fmtTs`, `find` d'union-find…) scopés à leur parent — les retirer casserait leur parent. Une extraction physique de blocs `<script>` inline à globals partagés = haut risque / faible gain, non vérifiable en une passe. → **mise sous contrôle par ratchet** (`test:file-size-guard`) : plafond 3,43 Mo / 51 000 lignes → la dette ne peut plus grossir sans revue. Objectif inscrit : faire BAISSER les plafonds au fil d'extractions futures dédiées, jamais les monter.

### Auto-critique passe 5 (honnête)
- **Le plus faible** : `view-behavior` prouve « ça ne crashe pas », pas « ça fait la bonne chose » (ex : un bouton qui sauvegarde au mauvais endroit rendrait sans crash). Le vrai comportement fin reste un E2E par bouton (non fait, coût). Le ratchet F-B1 **contrôle** la dette mais ne la RÉDUIT pas — la vraie modularisation reste un chantier dédié.
- **Non fait, assumé** : correctif du 404 Apex `rescue.js` (autre projet, build non testable ici) ; réduction effective des 49k lignes (extraction = chantier séparé).

### Auto-critique passe 4 (honnête)
- **Le plus faible** : la passe LIVE a tourné UNE fois (snapshot) ; elle n'est pas encore un gate récurrent bloquant sur CMCteams (elle échoue aujourd'hui à cause d'Apex, pas de CMCteams). Je ne l'ai pas rendue bloquante pour ne pas rougir le CI sur un problème d'un autre projet.
- **Non fait** : le vrai correctif du 404 Apex (autre projet + build non testable ici) et le comportement fin des 95 vues (risque de flakiness). Déclarés, pas masqués.

### Auto-critique passe 3 (honnête)
- **Le plus faible** : `test:ia-key-privacy` est **statique** — il verrouille les vecteurs de fuite connus (sync Firebase + backup admin), il **ne prouve pas** au runtime qu'aucun call-site IA n'envoie `x-api-key` à un tiers quand un proxy est configuré (les ~6 sites d'appel varient ; le prouver exigerait de piloter une vraie conversation IA par site). Je le déclare au lieu de le masquer.
- **Non fait, assumé** : la clé RESTE en clair dans `localStorage` sur le device admin (design accepté + documenté in-app) ; l'appel direct navigateur sans proxy RESTE le fallback (retirer = casser). Ce n'est pas « résolu à 100 % », c'est **mitigé honnêtement** (la clé ne fuit pas hors device) — pas de faux « P0 éliminé ».
- **Restent 3 P3** (mono-fichier 49k lignes, `loading=lazy`, console.log) : dette cosmétique non bloquante, non traitée cette passe.
