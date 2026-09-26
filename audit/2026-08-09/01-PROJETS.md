# 01 — CHAQUE PROJET, INDIVIDUELLEMENT · Audit 2026-08-09

Un bloc par projet : ce qu'il fait · son état mesuré · ses problèmes (avec `fichier:ligne`) · ce qui peut devenir meilleur. Priorités `[P0]` faille/crash · `[P1]` dégrade fort · `[P2]` net · `[P3]` confort.

---

## P01 · CMCteams — `cmcteams.kd-mc.com` 🟠
**Ce que ça fait** : le planning du Casino de Monaco. Import du PDF SBM, planning par employé/équipe, pit boss live, chat, RGPD, back-office admin.
**Mesuré** : 3,35 Mo / 49 844 lignes · 1 464 fonctions · 102 vues · 96 routes · 145 `innerHTML` pour 1 160 `esc(` · 41 `setInterval` / 30 `clearInterval`.

- **[P0] ✅ CORRIGÉ (v9.885)** — La règle n°1 (« tout nom du PDF a un planning ») **ne s'exécutait plus**. `index.html:24660` faisait `.toUpperCase()` sur un **objet** (`cmc_import_src_<key>` est écrit `{txt,…}` l.40194) → TypeError avalé par un `catch` muet → l'écran certifiait « ok » sans avoir rien vérifié, dès qu'on rechargeait la page. Correctif + test `test:planning-guarantee` qui **exécute** l'extraction.
- **[P0] ✅ CORRIGÉ** — Code admin en clair (voir P00 transversal).
- **[P1] RESTE** — `_postValidateImport` (`index.html:38793`) **ne câble pas** la garantie : il compare `withCodes/totalActive` sur la base employés, donc **un nom présent au PDF mais absent de la base est invisible**, et 49 % de non-couverture passent en silence. → Faire la comparaison sur les noms extraits du texte source, et bloquer.
- **[P1] RESTE** — XSS stocké : `index.html:4599` injecte une URL Firebase dans `src="…"` sans échappement ; la valeur est écrite par **une autre app** (`tools/departs/index.html:1027`). Une URL `x" onerror=…` s'exécute dans la session admin.
- **[P1] RESTE** — CSP présente mais avec `'unsafe-inline'` (`index.html:74`) → elle ne protège pas des XSS ci-dessus. Pas de `frame-ancestors`.
- **[P2]** 2 scripts bloquants de 532 Ko en chemin absolu `/CMCteams/…` (`index.html:1251,1256`), sans `defer`.
- **[P2]** 10 `setInterval` de niveau module jamais annulés, armés **avant** login.
- **[P2]** 92 boutons < 44 px et 1 658 déclarations de police < 14 px (mesuré).
- **✅ Bon** : **0 route orpheline** (77 cibles `sv()` toutes couvertes), **0 fonction dupliquée** au top-level, **301** gardes `A.user.id!==AID`, 18/19 fonctions destructrices protégées.

---

## P02 · Apex v13 — `apex-ai.kd-mc.com` 🟠
**Ce que ça fait** : ton assistant IA personnel (SPA TypeScript, 88 routes, coffre chiffré, 100+ outils).
**Mesuré** : 1090 `.ts` · 88 routes **0 doublon** · 634 tests (633 en CI) · bundle servi 1,13 Mo gzip.

- **[P0 — À TRANCHER PAR TOI, pas un bug]** Anthropic **n'est plus** l'IA par défaut. `ai-routing-policy.ts:255` : `if (isAdmin) return 'free-smart'`. Chaîne réelle pour une question générique : **gemini → anthropic → groq → openrouter**. C'est un **conflit entre deux de tes consignes** : ta règle absolue dit « ne jamais changer le défaut Anthropic », mais le mode « gratuit d'abord » a été mis en place à ta demande (commentaire l.253). **Je n'ai pas tranché seul.**
- **[P1]** **Sourcemaps complètes publiées** : 289 `.map` = **9,46 Mo** servis, avec le code TypeScript d'origine (auth, clés de stockage, endpoints). Correctif : 1 ligne dans le workflow de déploiement.
- **[P1]** Le coffre chiffre vraiment (PBKDF2 200 000 + AES-GCM, `vault.ts:232`) **mais la passphrase est stockée en clair à côté** (`vault.ts:282,315`) → protège d'un vol de sauvegarde, pas du navigateur.
- **[P2]** 10 routes enregistrées **sans aucune entrée dans l'interface** (`studio-docx/pptx/xlsx`, `knowledge-bank`, `pro-business`…) → 11 % du routage inatteignable.
- **[P2]** 23 services jamais importés en production (code mort), dont `admin-action-gate.ts` (contrôle d'accès jamais branché).
- **[P2]** Budget de bundle CI **non bloquant** et mal mesuré : annoncé « < 200 Ko », réel **709 Ko gzip**, jamais rouge.
- **✅ Bon** : CSP conforme (27 hôtes appelés, tous couverts), 633 tests en CI, aucune désactivation en masse.

---

## P03 · Apex Chat — `apex-chat.kd-mc.com` 🔴
**Ce que ça fait** : messagerie chiffrée de bout en bout (PWA + 4 workers, OTP téléphone → JWT).
- **[P0]** **Porte dérobée permanente** : `workers/api-worker.js:692` `if (otp === '000000')` puis `:759` → JWT `is_admin:true` valable **30 jours**, sans SMS. Le seul secret est un numéro de téléphone.
- **[P1]** **Clé privée E2E en clair** dans `localStorage` (`index.html:6836`). Le coffre PIN existe (`lib/key-vault.js`) mais **son import est commenté** (`crypto.js:19`) → la branche « en clair » est la seule atteignable.
- **[P2]** `Access-Control-Allow-Origin: *` sur le service média (`api-worker.js:1617`) — atténué : l'auth passe avant.
- **✅ Bon** : le chiffrement E2E est **réel** (ECDH P-256 + HKDF + AES-GCM, double-ratchet, médias chiffrés) et actif par défaut ; aucun message ne peut partir en clair quand E2E est ON.

---

## P04 · La Détente — `la-detente.kd-mc.com` 🟢
**Ce que ça fait** : **ce n'est pas une boutique** — c'est une page-galerie d'identité visuelle (99 lignes) + un script local de génération d'emblèmes. Zéro panier, zéro paiement, zéro réseau.
- **[P3]** Galerie **vide par décision** (`index.html:73-76` : 4 tableaux vides) → les 4 sections affichent « À venir ».
- **[P3]** Lien retour ≈ 27 px de haut, police 13 px.
- 🔴 **Non vérifié** : que le sous-domaine pointe bien ici et non sur `shops/la-detente/` (qui, lui, est une vraie boutique avec worker de commande).

---

## P05 · Chez Lolo — `chez-lolo.kd-mc.com` 🔴
**Ce que ça fait** : boutique cosmétique + impression à la demande (Printify), panier local, encaissement manuel.
- **[P0]** **Le worker de commande n'est pas authentifié** : `shops/la-detente/worker-order/worker.js:162` ne vérifie qu'un `Origin` + un en-tête statique — deux choses qui se forgent en une ligne. Or `POST /validate` (`:144`) **met en production et paie** chez Printify.
- **[P0]** `GET /cost` (`:56`) **sans aucun contrôle** : chaque appel **crée puis supprime un vrai produit Printify**.
- **[P0]** **Fail-open commercial** : `chez-lolo/index.html:561` — la commande est enregistrée et poussée en production **au clic sur le lien PayPal**, avant tout encaissement.
- **[P1]** Injection HTML : `:362` ré-injecte l'image telle quelle si elle commence par `<img`, contournant `esc()`.
- **✅ Bon** : la clé Printify est bien **côté serveur** (`worker.js:169`), jamais côté client.

---

## P06 · Dashboard boutiques — `dashboard.kd-mc.com` 🔴
**Ce que ça fait** : console admin des 6 boutiques (chiffre d'affaires, commandes, SSE temps réel).
- **[P0]** **La porte ne protège rien** : l'auth est entièrement côté client (`index.html:314`) alors que la donnée est **publique en amont** (règles Firebase `orders: {".read": true}`) → le CA et les commandes se lisent par simple requête, sans jamais voir l'écran PIN.
- **[P1]** Fail-open assumé et documenté (`:165,230,335`) : rendre le SSO injoignable contourne la porte.
- **[P2]** Anti-force-brute effaçable (compteurs en `localStorage`).
- **✅ Bon** : hygiène locale correcte (PBKDF2 200 000 + sel aléatoire, `esc()`, session 8 h).

---

## P07 · Sourcing — `sourcing.kd-mc.com` 🟠
**Ce que ça fait** : veille fournisseurs + sélection produits partagée.
- **[P1]** Données concurrentielles **publiques** : règles Firebase `selection: {".read": true}` + écriture quasi libre → fournisseurs, SKU et prix d'achat lisibles **et modifiables** par n'importe qui.
- **[P2]** Fail-open à l'identification (`sourcing.js:39,48` fabriquent un invité `open:true`) — sans danger aujourd'hui, piège pour plus tard.
- **[P2]** Le mode « catalogue live » est **mort** : `loadCatalog` sort immédiatement, et **aucun worker proxy catalogue n'existe** dans le dépôt.
- **✅ Bon** : **le meilleur code des boutiques** — échappement complet (apostrophe incluse) et porte **sans fail-open** (`sourcing.js:149-155` exige `verified === true`).

---

## P08 · Arbre généalogique — `arbre.kd-mc.com` 🟠
**Ce que ça fait** : arbre familial (IndexedDB + Firebase), accès par code famille, sync 8 s.
- **[P0] ✅ PARTIELLEMENT CORRIGÉ** — le code famille était écrit **en commentaire** dans le source (`index.html:261`). Retiré. **Honnête : correctif partiel** — le code est un **nom de famille présent 145×** comme donnée dans la page → devinable. **Vrai correctif = changer le code** pour une valeur absente des données.
- **[P0] RESTE** — Lecture possible **sans passer par la page** : règles `arbre: {".read": "auth != null"}` + **auth anonyme** → n'importe qui authentifié anonymement lit `/arbre/<empreinte>`.
- **[P2]** Empreinte du code non salée, 0 itération → force brute instantanée sur un nom de famille.
- **✅ Bon** : la reconnaissance automatique de l'appareil **respecte ta règle** (`arbre_trust` en `localStorage`, pas `sessionStorage`) ; `esc()` systématique ; CSP présente.

---

## P09 · Coffre-fort — `coffre.kd-mc.com` 🟠
**Ce que ça fait** : coffre personnel local-first, tout chiffré avant de partir au cloud.
- **✅ Excellent** : chiffrement **réel et solide** — PBKDF2-SHA256 **200 000** itérations → AES-GCM-256, IV aléatoire par entrée, clé maître jamais persistée (`index.html:157-166,461`).
- **[P1]** Le stockage cloud (worker R2) **n'authentifie rien** : `PUT`/`DELETE /v1/chunk/<id>` sans en-tête d'auth → **confidentialité préservée** (tout est chiffré) mais **intégrité nulle** : un tiers peut écraser ou supprimer tes sauvegardes.
- **[P2]** Le repli Face ID stocke sa clé en clair si l'extension PRF n'est pas dispo → Face ID contournable dans ce cas.
- **Note** : pas de reconnexion automatique — **c'est un choix défendable pour un coffre** (verrou auto 5 min, PIN limité jusqu'à 24 h). Pas un défaut.

---

## P10 · Départs / CMCteams light — `departs.kd-mc.com` 🔴
- **[P0]** **L'admin est une classe CSS** : `index.html:632` `isAdmin(){return document.body.classList.contains("admin");}` → une ligne en console donne les droits d'écriture complets.
- **[P1]** PIN en dur non salé (`:198`), numérique → table arc-en-ciel triviale.
- **[P2]** `boards-gen.js` = **257 Ko pour 2 lignes** de données générées.

---

## P11 · Créa Studio — `studio.kd-mc.com` 🟠
- **[P0] ✅ CORRIGÉ** — ton PIN admin était **en clair** (`index.html:1212`). Remplacé par une empreinte. **Honnête** : la porte reste **côté client** et l'empreinte est faible (djb2 32 bits) — elle empêche la lecture directe, pas un calcul déterminé.
- **[P1] RESTE** — l'admin est déduit du **nom saisi** (`isAdminName`) et lu depuis `localStorage` → modifiable en console. **Vrai correctif** : adosser l'admin au SSO serveur **déjà présent** (`/__sso/whoami`, l.~1166).

---

## P12 · Autorisations — `autorisations.kd-mc.com` 🔴
- **[P0]** **Le premier venu crée le code** : `index.html:507` — sur un appareil vierge, quiconque ouvre la page choisit le PIN et entre.
- **[P0]** **La clé du coffre n'est pas un secret** : `:500` dérive la clé de `credId + RP_ID`, or `credId` est en clair dans `localStorage` → coffre déchiffrable **sans** Face ID. (Le chiffrement lui-même est correct.)
- **[P1]** Clé Firebase = placeholder → l'app est en fail-open assumé.

---

## P13 · Bot crypto — `bot.kd-mc.com` 🟢
- **✅ La seule vraie porte serveur du lot** : `index.html:211` → `POST /__admin/login` renvoie un laissez-passer signé, rejoué en en-tête. Non contournable en console.
- **[P2]** Le laissez-passer est en clair et sans expiration côté client → un vol de `localStorage` = accès durable.

---

## P14 · Beatbot (robot piscine) — `beatbot.kd-mc.com` 🟢
- **✅ Bon** : relais same-origin avec porte serveur (`need_admin_code`), `esc()` partout, SSRF déjà bloquée côté worker (HTTPS obligatoire, IP privées refusées).
- **[P1]** Le jeton d'API du robot est stocké **en clair** dans `localStorage` (`:401`).

---

## P15 · Lingua — `lingua.kd-mc.com` 🟢
- **[P2]** L'espace de sauvegarde est **énumérable** : la clé est `sha256(prénom + code 4 chiffres)` → 10 000 essais par prénom suffisent à récupérer la progression d'un tiers. Aucune donnée sensible, mais ce n'est pas une authentification.
- **✅ Bon** : aucun secret, échappement correct, mobile-first strict.

---

## P16 · Accueil kd-mc.com 🟠
- **[P0] ✅ CORRIGÉ** — le code admin était **affiché en texte visible** sur la page (« Code … »). Retiré.
- **[P2]** Le jeton SSO transite en fragment d'URL vers 4 apps → persiste dans l'historique.
- **✅ Bon** : aucun appel cross-origin, CSP `connect-src 'self'` cohérente.

---

## P17 · World Monitor — `kd-mc.com/worldmonitor/` 🟠
- **✅ Correction d'hier confirmée** : avions et CVE passent bien par le relais `kdmc-live` — plus d'appel direct bloqué.
- **[P1]** **Aucune CSP** sur la page.
- **[P2]** Leaflet + satellite.js chargés depuis unpkg **sans `integrity`** → du JS tiers à pleins pouvoirs.
- **[P2]** ~450 Ko à charger — lourd en 4G.
- **[P3]** Une couche qui échoue est **silencieuse** (fail-open sans message) → tu ne sais pas qu'elle est morte.
- **✅ Bon** : fraîcheur réelle (~25 minuteries), échappement OK.

---

## P18 · OSINT — `kd-mc.com/osint/` 🟢
- **✅** Plus **aucun appel direct cassant** (correction confirmée) ; rafraîchissement réel toutes les 60 s.
- **[P1]** Pas de CSP · **[P2]** unpkg sans `integrity` · **[P3]** iframe Windy sans `sandbox`.

---

## P19 · Clone / IA / Liens / Outils 🟢
- **Clone** : anti-SSRF côté worker ✅. **[P2]** `index.html:103` n'échappe pas le **schéma** → un site cloné renvoyant `javascript:…` donne un lien exécutable.
- **IA** : annuaire statique, zéro `fetch` ✅.
- **Liens** : **[P2]** la « santé live des workers » est un **fichier statique commité** (fraîcheur = dernier commit CI, pas temps réel) · **[P3]** aucun rafraîchissement.
- **Outils** : 100 % statique, 6,5 Ko — la plus saine.

---

## P20 · Admin du domaine — `admin.kd-mc.com` 🟢
- **✅ Protection réelle côté serveur** (pas cosmétique) : 403 sans session, **fail-closed** si le hash du PIN manque, laissez-passer signé, cookie `HttpOnly` 12 h, limite de tentatives, journal d'audit.
- **[P2]** Le laissez-passer est **aussi** en `localStorage` → une XSS sur kd-mc.com l'exfiltre pour 12 h.

---

## P21 · Les 19 workers Cloudflare
| Worker | En prod | Verdict |
|---|---|---|
| apex-secrets-proxy | ✅ | 🔴 **P0** — proxy de **toutes** les clés (dont l'API Cloudflare) derrière un PIN **sans limite de tentatives**, + **fail-open** si le PIN n'est pas configuré |
| kdmc-crea-famille | ✅ | 🔴 **P0** — admin accordé sur un **nom auto-déclaré** (`worker.js:71`) → lecture de **toutes** les familles |
| coffre-r2 | ✅ | 🔴 **P1** — écriture/suppression sans authentification |
| kdmc-apis | ✅ | 🟡 clés payantes protégées par le seul en-tête `Origin` (forgeable hors navigateur) |
| kdmc-router | ✅ | 🟡 `/__lingua/*` ouvert (CORS `*`, sans auth) → proxy IA payant public |
| kdmc-crea-ai | ✅ | 🟡 routes IA payantes sans auth |
| kdmc-access | ✅ | 🟡 `POST /log` sans auth → journal « qui se connecte » falsifiable |
| apex-auth-worker | ✅ | 🟡 CORS `*` sur des routes qui renvoient des jetons |
| kdmc-live · kdmc-balances · kdmc-mail · kdmc-monaco · kdmc-outlook · kdmc-rag | ✅ | 🟢 sains (fail-closed vérifié) |
| apex-v13-backend · chat-svc · sentinels-svc · vault-svc · sourcing-proxy | ❌ non déployés | 🟡 à durcir **avant** tout déploiement |

**Faux positifs écartés** (avec preuve) : CORS `*` sur les relais publics en lecture seule (météo, avions, décès INSEE) = intentionnel · clé Firebase Web = publique par conception · ID de namespace KV ≠ secret · `/__mail`, `/__fin`, `/__bot`, `/__beatbot`, `/__admin` passent tous par une session admin **fail-closed** · `/__beatbot/relay` a déjà l'anti-SSRF.
