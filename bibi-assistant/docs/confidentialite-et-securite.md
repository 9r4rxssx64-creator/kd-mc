# Confidentialité et sécurité

Ce document dit **où vont tes données** et **ce que Bibi protège** (et ce qu'elle ne protège pas).

## 1. Où sont tes données

| Donnée | Où | Qui peut la lire |
|---|---|---|
| Conversations, souvenirs, notes, tâches, rappels, réglages | **Dans ton navigateur** (IndexedDB), sur chaque appareil | toi, sur cet appareil |
| Les mêmes, **si** la synchronisation est activée | + une copie dans la base SQLite du serveur, rattachée à ton compte | toi (compte) et l'administrateur du serveur (accès au fichier) |
| Clés d'IA saisies dans l'application | Base du serveur, **chiffrées** (AES-256-GCM, clé dérivée de `SESSION_SECRET`) | le serveur seulement ; jamais renvoyées au navigateur |
| Clés d'IA mises dans `.env` | Variables d'environnement du serveur | l'administrateur du serveur |

Sans synchronisation, **rien de ce que tu écris dans tes notes, tâches ou souvenirs ne quitte ton appareil**, sauf ce qui est envoyé à l'IA (voir plus bas).

## 2. Ce qui part vers des services extérieurs

| Quand | Ce qui est envoyé | À qui |
|---|---|---|
| Tu envoies un message à Bibi | les derniers messages de la conversation (nombre réglable dans *Paramètres*), la personnalité de Bibi et **tes souvenirs activés** | le fournisseur d'IA choisi (Gemini, Groq, OpenRouter ou le tien), **via ton serveur** |
| Tu touches 🎤 sur **Chrome / Edge / Android** avec la reconnaissance du navigateur | le **son** de ta voix | les serveurs du navigateur (**Google** pour Chrome). C'est le fonctionnement normal de Chrome, pas un choix de Bibi |
| Tu touches 🎤 et la reconnaissance du navigateur n'existe pas (ex. certains navigateurs) | le son | Groq (Whisper), si une clé Groq est configurée ; sinon Bibi te dit que l'écoute n'est pas disponible |
| Tu utilises une voix Piper / Kokoro | le texte à prononcer | **ton** serveur Piper / Kokoro |
| Tu utilises ElevenLabs (payant, bloqué par défaut) | le texte à prononcer | ElevenLabs |

Bibi n'envoie **aucune statistique, aucun pistage, aucune publicité**. Les niveaux gratuits des fournisseurs d'IA peuvent, selon leurs conditions, conserver ou réutiliser les échanges : lis les conditions de celui que tu choisis, et **ne confie pas d'informations que tu ne voudrais pas lui donner**.

Le micro **ne démarre jamais tout seul** : seulement après ton geste (🎤 ou « Mains libres ») et l'autorisation du navigateur. Un bandeau montre quand il écoute et un bouton l'arrête.

## 3. La mémoire

- Rien n'est mémorisé sans ta confirmation.
- Bibi **refuse** de retenir : mots de passe, numéros de carte bancaire, IBAN, clés d'API, numéro de sécurité sociale, codes secrets (détection automatique + tests). La détection est une aide, pas une garantie : ne dicte pas de secret.
- Tu peux voir, modifier, désactiver, supprimer chaque souvenir, tout exporter, tout oublier.
- L'interrupteur général de la mémoire est dans *Paramètres → Mémoire et confidentialité* ; l'administrateur peut aussi la couper pour tout le serveur (`ENABLE_LOCAL_MEMORY=false`).

## 4. La sécurité du serveur

| Protection | Détail |
|---|---|
| **Clés jamais exposées** | jamais dans le code envoyé au navigateur ni dans les réponses (des tests automatiques cherchent la clé dans les réponses). Le journal du serveur masque les en-têtes sensibles (cookie, autorisation, clé Gemini) et n'enregistre pas le contenu des requêtes ; ce point-là n'est pas couvert par un test dédié |
| **Accès fermé par défaut en production** | le serveur refuse de démarrer sans `BIBI_ACCESS_CODE` ou comptes, sauf `BIBI_ALLOW_OPEN=true` explicite |
| **Dépenses** | tout fournisseur / moteur payant est refusé **côté serveur** tant que `ALLOW_PAID_PROVIDERS=false`, même si le navigateur le demande |
| **Anti-CSRF** | chaque requête qui modifie quelque chose doit porter l'en-tête `x-bibi: 1` et une origine autorisée |
| **Cookies** | de session, `HttpOnly`, `SameSite=Strict`, `Secure` en production |
| **En-têtes** | Content-Security-Policy « même origine uniquement », `helmet` |
| **Limitation de débit** | `RATE_LIMIT_PER_MINUTE` (120 par défaut) ; les routes de connexion/code d'accès sont limitées à 10 essais par minute, le chat à 30, la voix à 20-30, la synchronisation à 60 |
| **Validation** | toute entrée est validée (zod) ; taille des corps limitée (1 Mo ; 4 Mo pour la synchronisation ; 10 Mo pour l'audio) |
| **Comptes** | mots de passe hachés (scrypt avec sel aléatoire) ; le premier compte seulement est automatique |
| **Mises à jour** | le service worker n'est jamais mis en cache durablement : une nouvelle version est détectée à l'ouverture |

## 5. Ce que la sécurité ne couvre pas

- **Quelqu'un qui a accès au serveur** (fichier de la base, variables d'environnement) peut lire ce qui y est : c'est ton serveur, protège-le.
- **Un appareil volé et déverrouillé** donne accès aux données locales de Bibi (comme n'importe quelle appli). Il n'y a pas de verrou Face ID propre à Bibi dans cette version.
- Les données locales ne sont **pas chiffrées** dans le navigateur (IndexedDB).
- Si tu perds `SESSION_SECRET`, les clés d'IA enregistrées dans l'application ne sont plus lisibles (il faut les ressaisir).
- Pas d'audit de sécurité externe : les protections ci-dessus sont testées par les tests automatiques du projet, pas certifiées.

## 6. Effacer

- Sur l'appareil : *Paramètres → Mes données → Tout effacer sur cet appareil*.
- Sur le serveur : *Effacer mes données du serveur* (avec la synchronisation).
- Tout effacer sur le serveur : supprimer le dossier `DATA_DIR`.
