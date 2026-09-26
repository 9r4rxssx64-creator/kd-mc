# 🍎 Tes apps du domaine en vraies applis iPhone (TestFlight) — sécurisé au max

Ce dossier automatise l'emballage de tes apps web (Créa Studio, Départs, CMCteams…)
en **vraies applis iPhone**, signées et envoyées sur **TestFlight**, **sans Mac**
(la fabrication tourne sur un Mac du cloud GitHub).

## Ce que TOI seul dois faire (impossible à automatiser : c'est ton identité + ton paiement Apple)

1. **T'inscrire au programme développeur Apple** (99 $/an) :
   👉 **https://developer.apple.com/programs/enroll/**
   (Connexion avec ton Apple ID, depuis ton iPhone. ~10 min.)

2. **Créer UNE clé « App Store Connect API »** (elle sert à signer + envoyer, sans certificat à trimballer) :
   👉 **https://appstoreconnect.apple.com/access/integrations/api**
   → bouton **+**, rôle **App Manager** → télécharge le fichier **`.p8`**, et note le **Key ID** + l'**Issuer ID** affichés.

3. **Coller 4 valeurs dans les secrets GitHub** (une seule fois, elles servent à TOUTES les apps) :
   👉 **https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions**

   | Secret | Valeur |
   |---|---|
   | `APPLE_TEAM_ID` | ton Team ID (en haut à droite d'App Store Connect / page Membership) |
   | `APPSTORE_API_KEY_ID` | le **Key ID** de l'étape 2 |
   | `APPSTORE_API_ISSUER_ID` | l'**Issuer ID** de l'étape 2 |
   | `APPSTORE_API_KEY_BASE64` | **le contenu du fichier `.p8` collé TEL QUEL** (le pipeline l'accepte directement — pas de conversion). Le base64 marche aussi (compat Apex). |

C'est **tout**. Aucun Mac, aucun certificat, aucune ligne de code.

### 🆘 Si le téléchargement du `.p8` échoue (« Une erreur s'est produite »)

Vu chez Kevin en août 2026, sur compte tout neuf. À essayer **dans cet ordre** (du plus
fréquent au moins fréquent). ⚠️ Ce sont des pistes **probables**, pas une certitude : le
message d'Apple est générique et ne dit pas la cause.

1. **Un contrat Apple en attente bloque les clés** (cause n°1 sur les comptes récents).
   App Store Connect → **Accords, taxes et opérations bancaires** → si une ligne est
   « En attente / À accepter », **accepter**, puis re-créer la clé.
2. **Type de clé** : prendre une clé **d'équipe** (onglet *Intégrations → App Store Connect API*,
   section **Clés d'équipe**), pas une clé « individuelle ». Rôle **Admin** (ou App Manager).
3. **Le navigateur iPhone bloque le fichier** : appui **long** sur *Télécharger* →
   « Télécharger le fichier lié ». Sinon **Chrome** sur iPhone. Sinon couper temporairement
   **Relais privé iCloud** (Réglages → Apple ID → iCloud) et les bloqueurs de contenu.
4. **Depuis un ordinateur** — le plus fiable, 30 s.
5. **Attendre** : sur une adhésion toute neuve, l'API met parfois **24-48 h** à s'activer.

> Le fichier n'est téléchargeable **qu'une seule fois**. Chaque tentative ratée laisse une clé
> inutilisable : **révoque-les** pour ne pas confondre les *Key ID* (le piège : c'est le Key ID
> de la clé **réellement téléchargée** qu'il faut coller dans le secret).

**Pas de contournement possible** : la signature automatique en CI exige cette clé. L'alternative
(certificat `.p12` + profil) demande un Mac, des téléchargements en plus, et un secret bien plus
dangereux s'il fuite — donc non.

> Ces 4 secrets sont **déjà** ceux utilisés par le build iOS d'Apex — donc si tu les as posés pour Apex, il n'y a **rien de plus à faire**.

## Ce que JE fais, tout seul, jusqu'au bout

- J'emballe l'app en natif (Capacitor), je la **signe automatiquement** avec ta clé API (rien à cliquer côté Apple : les identifiants d'app sont créés tout seuls).
- Je **lance la fabrication** sur le Mac cloud et **j'envoie sur TestFlight** — tu reçois l'invitation, tu installes.
- Je corrige les erreurs de build au fur et à mesure.

Déclencheur : Actions → **« iOS — Apps du domaine → TestFlight »** → `app: crea-studio`
(`dry_run` = test de fabrication sans secrets ; `testflight` = signe + envoie).

Ajouter une app = 1 ligne dans **`apps.json`** (0 secret nouveau).

## Sécurité au maximum (par défaut)

- **Signature par clé API révocable** (pas de certificat `.p12` long à stocker/fuiter). Tu peux révoquer la clé à tout moment sur App Store Connect.
- **HTTPS strict** (App Transport Security `NSAllowsArbitraryLoads=false`) : l'appli refuse tout trafic en clair.
- **Domaines liés à l'app limités à `kd-mc.com`** (`WKAppBoundDomains`) : l'appli ne peut charger QUE ton domaine.
- **Aucune clé applicative embarquée** : comme aujourd'hui, tout secret reste côté serveur (workers), jamais dans l'appli.
- **Secrets jamais journalisés** dans les logs de fabrication (masqués + `fail-closed` si absents).
- **TestFlight = distribution privée** (toi, Laurence, famille, employés par lien), pas de vitrine publique.

## Limites honnêtes (pas de survente)

- Je **ne peux pas** franchir l'inscription/le paiement Apple à ta place (compte = ton identité).
- La **1ʳᵉ fabrication réelle** ne peut passer au vert qu'une fois tes 4 secrets posés ; je la piloterai alors et corrigerai ce qui coince (je ne peux pas prouver un build iOS vert tant que le compte n'existe pas).
- Le mode « pilote » charge le **vrai site** (`server.url`) → le SSO du domaine continue de marcher. L'**offline + notifications push natives** viennent dans une 2ᵉ étape (elle demande d'ouvrir le partage `/__sso` du routeur pour l'appli — je le ferai proprement).
- **CMCteams** (interne casino) part en **distribution privée**, pas sur le Store public.
