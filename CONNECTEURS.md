# CONNECTEURS — ce que l'agent peut atteindre, mesuré (8.10.2026, 18h UTC)

> Kevin, 8.10 : « Fais le bilan de tes connecteurs que je viens de mettre à jour pour améliorer ton travail et celui de tes
> autres branches. Qu'elles soient toutes au courant avec les accès à jour pour tous. »
>
> Chaque ligne a été **sondée** (un appel réel, en lecture seule) le 8.10 entre 17h30 et 18h UTC depuis la session
> `reparer-tout`. Les connecteurs sont ceux du compte claude.ai de Kevin : **toute session Claude Code du même compte les
> a** — rien à installer. Règle : **lecture d'abord, jamais d'écriture ni de dépense sans que Kevin l'ait demandé** ;
> **tout gratuit** (une sonde ne consomme rien ; un connecteur payant ne sert qu'à LIRE).

## 1. Les connecteurs du DOMAINE — ceux qui changent le travail

| Connecteur | État mesuré | Ce qu'il permet pour kd-mc.com | Forfait / règle |
|---|---|---|---|
| **Cloudflare Developer Platform** | ✅ **nouveau, autorisé le 8.10** — 28 Workers, 6 bases D1, 6 espaces KV visibles | Lire les Workers et leur code, **interroger D1 en direct** (`kdmc-cercle` : `code_attente` vide le 8.10 à 18h), lister KV. **Plus besoin d'un robot GitHub pour LIRE** : zéro minute Actions, zéro dispatch. Pas de lecture de clé KV par ce connecteur (espaces seulement) → les fiches `acc:` restent lues par `coffre-lire-alertes` / `coffre-comptes-inventaire`. | Gratuit (plan Workers Free). Écriture D1/KV : **jamais sans demande explicite** ; les robots du coffre gardent l'essai à blanc + corbeille. |
| **Sentry** | ✅ **nouveau** — org `kdmc` (région DE), projet `cmcteams`, 3 erreurs non résolues sur 7 j | Lire les **vraies erreurs JavaScript** de CMCteams. Mesuré le 8.10 : `CMCTEAMS-B` `TypeError … reading 'forEach'` dans `iaRespond` (52 événements, 6 j), `CMCTEAMS-A` `requestFullscreen Illegal invocation` dans `toggleTVMode` (16), `CMCTEAMS-8` `SyntaxError` (5). **Chemin des 3 : `/home/runner/work/CMCteams/…`** = ce sont nos **harnais de test en CI** qui envoient à Sentry (0 utilisateur) → quota gratuit (5 000 événements/mois) gaspillé par les robots : à couper dans les harnais (voir audit). | Gratuit (5 k événements/mois). Lecture seule. |
| **GitHub** | ✅ compte `9r4rxssx64-creator` | Déjà le cœur de tout : PR, robots du coffre, dépôt public. | Gratuit (coffre : 2 000 min/mois, chaîne privée à la fusion seulement). |
| **Hugging Face** | ✅ `Dkevin`, OAuth valable jusqu'au 9.10 00h25 UTC, droits `inference-api`, `jobs` | Modèles et inférence gratuite (quota HF), espaces. Jobs/Sandbox = **payants** (402 mesuré le 15.09) → ne pas utiliser. | Gratuit en inférence limitée ; jobs interdits. |
| **Railway** | ✅ `9r4rxssx64-creator`, aucun workspace | Rien n'y tourne. Ne rien y déployer : Cloudflare gratuit suffit. | Hors forfait gratuit au-delà de l'essai → **interdit**. |
| **Netlify** | ✅ compte lié GitHub, **0 site** | Rien n'y tourne. Même règle. | Gratuit mais inutile. |
| **Vercel** | ❌ **404 « User not found »** (le jeton ne correspond plus à un compte) | Il reste des traces Vercel dans le dépôt (`test:vercel-config`) ; le domaine n'en dépend pas. | À retirer des connecteurs ou à ré-autoriser — rien ne casse en attendant. |
| **Lovable / Replit** | ✅ comptes `Kev Des` ; 0 projet, 0 app | Générateurs d'apps hébergées ailleurs : contraires à « tout chez Cloudflare, gratuit ». Ne pas s'en servir pour le domaine. | Interdit pour le domaine (hors Cloudflare). |
| **Supabase** | ✅ autorisé le 8.10, **0 projet** | Le domaine est sur Firebase + D1. Pas d'usage. | Non utilisé (gratuit, mais une base de plus = une maison de plus). |
| **Zapier / Make** | ✅ autorisés (Zapier le 8.10) | Automatisations entre apps. Le domaine automatise par Workers et robots GitHub (destination écrite, règle du 5.09) : **aucune automatisation ne part sur Zapier/Make sans entrée au registre des destinations**. | Zapier : 100 tâches/mois gratuites ; Make : 1 000 opérations/mois. |
| **Mem0** | ✅ autorisé le 8.10, 0 souvenir | Mémoire hébergée. La mémoire de l'agent est `tools/memory/mem.cjs` (0 réseau, 0 clé) : Mem0 est un doublon → non utilisé. | Non utilisé (lecture seule si jamais). |
| **PayPal** | ✅ autorisé le 8.10, **0 transaction du 1er au 8.10** | Lire les paiements (boutiques). Jamais de création de facture ou de lien de paiement sans demande explicite. | Lecture seule. |
| **Shopify** | ❌ **jeton expiré** (« needs you to sign in again ») | Les boutiques du domaine sont sur Printify + Firebase, pas Shopify. | À ré-autoriser seulement si Kevin veut Shopify. |

## 2. Les connecteurs UTILES au travail (lecture, recherche, sécurité)

| Connecteur | État | Usage | Règle |
|---|---|---|---|
| **Firecrawl / Exa** | ✅ (Firecrawl sondé le 5.10, Exa chargé) | Recherche et lecture web depuis l'agent (TikTok reste bloqué — leçon lire-video). | Gratuit dans les quotas. |
| **Malwarebytes (ScamGuard)** | ✅ — `https://kd-mc.com` : verdict **unknown** (« domaine enregistré depuis 4 mois, hors Tranco ») | Vérifier un lien suspect du journal, une adresse mail, un numéro. Le domaine n'est pas « malveillant », juste **inconnu** des listes : normal pour un domaine de 4 mois. | Gratuit. |
| **Context7 / Microsoft Learn / pg-aiguide** | ✅ | Documentation à jour des bibliothèques. | Gratuit. |
| **Gmail** | ✅ (227 messages, 183 non lus ; étiquettes 🔐 Sécurité & Comptes 96, 💳 Factures 16, 🛠️ Outils & SaaS 230) | Lire les factures et alertes de sécurité des services (pour vérifier « tout gratuit » : une facture = une alerte). **Jamais d'envoi** sans demande. | Lecture. |
| **Google Agenda / Drive** | ✅ (agenda `desarzens.kevin@gmail.com`, Drive avec le dossier « Ball-trap ») | Agenda : jours fériés Monaco (utile aux départs/planning). Drive : documents importés par Kevin. | Lecture ; écriture sur demande. |
| **Figma** | ✅ `Kev Des`, plan starter, Figma AI ouvert | Maquettes. Le domaine est codé en HTML : Figma sert à montrer, pas à produire. | Gratuit (starter). |
| **Canva / Gamma / Adobe Express** | ✅ (Canva : 0 kit de marque) | Visuels (affiches, posts). | Gratuit dans les limites ; Adobe : init obligatoire avant tout appel. |
| **ElevenLabs** | ✅ répond (15 voix françaises listées) | **Voix payante** : interdite pour Bee/Lingua sans l'interrupteur `BEE_SECOURS_PAYANT` (règle du 2.10). Ne sert qu'à écouter des exemples. | Payant → non utilisé en production. |
| **Metricool** | ✅ marque « Kdmc » (Facebook, Instagram `kd45772`, TikTok `kevinmc98000`, YouTube) | Statistiques et programmation des réseaux (app social). | Gratuit (1 marque). |
| **Apollo** | ✅ `Kev Des` — **175 crédits restants, 0 utilisé** | Prospection B2B. **Chaque recherche consomme des crédits** → ne jamais lancer sans demande ; le bilan est le seul appel fait (profil, gratuit). | Crédits limités. |
| **Jam** | ✅ (0 bug enregistré) | Rapports de bug vidéo depuis l'iPhone de Kevin : utile pour « ça saute », « rafraîchir ne marche pas ». | Gratuit. |
| **Twilio** | ✅ (documentation seulement) | SMS/appels : **payant** → non utilisé (les alertes passent par push gratuit). | Interdit sans demande de Kevin (payant). |
| **Superhuman Docs / PDF.net / Era Context / Supermetrics / Motion / Granola** | ✅ répondent (Granola : **pas de compte**, Motion : 0 workspace, Era : finances perso) | Hors domaine. Rien à faire. | Lecture seule, hors domaine. |
| **Claude Code Remote** | ✅ | Sessions, routines (jamais de cron GitHub ; les routines Claude sont la seule horloge autorisée), notifications. | Gratuit (abonnement Claude) ; une routine = une entrée au registre des destinations. |

## 3. Ce que ça change, concrètement (pour toutes les branches)

1. **Lire le domaine sans robot** : D1 (`kdmc-cercle`, `kdmc-arbre`, `apex-chat-main`…) et la liste des Workers se lisent
   par le connecteur Cloudflare → 0 minute GitHub, 0 attente de file. Les écritures restent aux robots du coffre (essai à
   blanc, corbeille), ou à une demande explicite de Kevin.
2. **Les vraies erreurs de CMCteams se lisent** (Sentry). Première mesure : les 3 erreurs ouvertes viennent de nos harnais CI,
   pas des téléphones → couper Sentry dans les harnais (sinon le quota gratuit part en tests) et corriger `iaRespond`
   (`forEach` sur `undefined`) et `toggleTVMode` (`requestFullscreen` hors geste utilisateur).
3. **Rien ne se déploie ailleurs que Cloudflare** : Railway, Netlify, Vercel, Lovable, Replit, Supabase existent mais sont vides —
   c'est voulu (tout gratuit, une seule maison).
4. **Les connecteurs qui coûtent** (Apollo crédits, ElevenLabs, Twilio, HF Jobs) ne se touchent **que sur demande explicite**.
5. **Deux connecteurs cassés** : Vercel (404) et Shopify (jeton expiré). Aucun des deux n'est dans le chemin du domaine.

## 4. Pour Kevin (un clic chacun, seulement si utile)

- Shopify : ré-autoriser **seulement** si tu veux relier une boutique Shopify (sinon laisse).
- Vercel : retirer le connecteur (le compte n'existe plus pour ce jeton).
- Granola : pas de compte — sans objet.

*Garde : `npm run test:connecteurs` (le document liste chaque connecteur vu dans la session, avec un état et une règle ; une
ligne sans état ou sans règle est rouge).*
