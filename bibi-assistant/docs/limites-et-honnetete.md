# Ce que Bibi fait vraiment — et ce qu'elle ne fait pas

Règle du projet : **aucune fonction n'est annoncée si elle n'existe pas.** Voici l'état réel, sans enjolivement.

## Testé pour de vrai, de bout en bout

Avec les tests automatiques du projet (`npm run test:all`) :

- **Application** dans un vrai navigateur (Chromium piloté par Playwright) : navigation entre les 8 pages, création de notes / tâches / rappels, conversation avec un faux fournisseur d'IA, arrêt et régénération d'une réponse, mémoire avec confirmation, export / effacement, service worker, installation, mode hors ligne.
- **Serveur** : refus des requêtes sans protection CSRF, accès par code, comptes, isolation des données entre deux comptes, politique « payant refusé », clés jamais renvoyées, limitation de débit, repli entre fournisseurs gratuits, flux de réponse, erreurs claires (clé refusée, limite atteinte, modèle inconnu, délai dépassé).
- **Logique locale** : mémoire (refus des données sensibles), rappels, synchronisation (le plus récent gagne, suppressions), base locale, voix.

## Testé seulement avec de FAUX serveurs

Ces parties sont écrites et leurs échanges sont vérifiés contre un faux serveur qui imite le vrai, mais **elles n'ont jamais parlé au vrai service** (aucune clé n'était disponible) :

| Fonction | Ce qui est vérifié | Ce qui ne l'est pas |
|---|---|---|
| Gemini, Groq, OpenRouter, fournisseur personnalisé | le format des requêtes, la lecture du flux, les erreurs | qu'un vrai appel aboutisse avec une vraie clé ; que les noms de modèles proposés existent encore ; les limites réelles de chaque offre gratuite |
| Piper, Kokoro | l'appel et la lecture de l'audio reçu | une vraie voix |
| ElevenLabs | l'appel, le blocage tant que le payant est interdit | une vraie voix, le prix réel |
| Whisper (via Groq) | l'envoi de l'audio et la lecture du texte | une vraie transcription |

## Non testable dans cet environnement

- **Un vrai iPhone / iPad avec Safari** : le contrôle a été fait avec l'émulation d'iPhone de Chromium, qui n'est pas Safari. Particularités à vérifier sur un vrai appareil : installation sur l'écran d'accueil, autorisation du micro, voix système disponibles, notifications (sur iPhone elles n'existent que pour une appli installée sur l'écran d'accueil).
- **Les voix du navigateur** : la liste dépend de chaque appareil. Bibi affiche ce que l'appareil fournit, sans en inventer ; elle n'a donc pas pu être jugée « belle » ici.
- **La reconnaissance vocale du navigateur** : dépend du navigateur (Chrome oui, Safari variable, Firefox non). Si elle n'existe pas, Bibi le dit.

## Non implémenté (et dit comme tel dans l'interface ou la doc)

| Demandé / possible | État |
|---|---|
| **Supabase / PostgreSQL** | **Non.** Seul SQLite existe. Une adresse PostgreSQL est refusée au démarrage. |
| **Rappels envoyés quand Bibi est fermée** (notifications « push » du serveur) | **Non.** Les rappels sont locaux : ils sonnent quand Bibi est ouverte ou active. L'écran Rappels l'écrit. |
| **Accès à ton agenda, tes e-mails, Internet** | **Non.** Bibi ne lit rien hors de ses propres données et n'effectue aucune action extérieure. Elle ne dira jamais « c'est fait » pour une action qu'elle n'a pas les moyens de faire. |
| **Verrouillage de l'appli (Face ID / code local)** | **Non.** Le code d'accès / les comptes protègent le serveur, pas l'écran de l'appareil. |
| **Chiffrement des données locales** | **Non.** |
| **Fusion fine des modifications simultanées** | **Non.** Sur deux appareils qui modifient le même élément, **le plus récent gagne** (document entier). |
| **Application native App Store / Play Store** | **Non.** C'est une appli web installable (PWA). |

## Petites imperfections connues

- Après réception d'un changement venu d'un autre appareil, la synchronisation peut le renvoyer **une fois** au serveur (sans conséquence, le résultat est identique).
- Les niveaux gratuits des fournisseurs d'IA changent sans préavis : un modèle gratuit aujourd'hui peut devenir limité ou payant. Bibi bloque le payant par défaut, mais la **liste** des modèles vient du fournisseur et peut contenir des modèles que ton compte ne peut pas utiliser (l'erreur affichée le dit).
- La détection de données sensibles (mémoire) repose sur des motifs : elle attrape les cas courants (cartes, IBAN, clés, mots de passe annoncés comme tels), pas tous les secrets possibles.
- Le dossier `bibi-assistant` n'est pas dans la liste des dossiers « toujours privés » du dépôt de Kevin : il peut donc être recopié dans le dépôt public. Il ne contient aucun secret (`.env` est ignoré), seulement du code.

## Comment vérifier toi-même en 5 minutes

1. `npm run test:all` → tout doit être vert.
2. Lance Bibi, ouvre *Paramètres → Intelligence artificielle* : chaque fournisseur affiche « pas de clé » ou « clé présente » **sans jamais montrer la clé**, et un avertissement s'il est bloqué parce que payant.
3. Ajoute **une vraie clé gratuite**, touche « Tester » : tu vois la vraie réponse du fournisseur (ou son erreur exacte). C'est la seule étape qui n'a pas pu être faite ici.
4. Page *Rappels* : lis l'avertissement sur les notifications.
5. Page *Voix* : compare la liste affichée avec les voix de ton appareil.
