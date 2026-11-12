# 🐝 Bibi — ton assistante personnelle IA

Bibi est une petite abeille qui t'aide au quotidien : elle discute avec toi (par écrit ou à la voix), garde des notes, des tâches et des rappels, et retient ce que tu lui demandes de retenir.
C'est une application web qui s'installe comme une vraie appli sur iPhone, iPad, Android et ordinateur.

> **Ce que Bibi fait vraiment, et ce qu'elle ne fait pas.** Elle ne prétend jamais avoir fait une action qu'elle n'a pas faite.
> Elle n'a pas accès à internet ni à ton agenda. Ses rappels sonnent seulement quand l'application est ouverte (voir [Rappels](#rappels-ce-qui-est-vrai)).
> La liste complète et honnête des limites est dans [`docs/limites-et-honnetete.md`](docs/limites-et-honnetete.md).

---

## 1. Ce qu'il faut avant de commencer

| Il faut | Pourquoi | Comment |
|---|---|---|
| **Node.js 22.5 ou plus récent** | fait tourner le serveur de Bibi | <https://nodejs.org> (version « LTS » ou plus récente). Vérifie : `node -v` |
| **Un terminal** | pour taper 4 commandes | Mac : app « Terminal ». Windows : « PowerShell ». |
| **Une clé d'IA gratuite** (au moins une) | sans elle Bibi ne peut pas répondre | voir [section 4](#4-obtenir-une-clé-dia) |

Tout le reste (micro, voix, synchronisation, voix de qualité) est facultatif.

## 2. Installer

```bash
cd bibi-assistant
npm install        # télécharge les outils (une seule fois)
cp .env.example .env
```

Sous Windows PowerShell, remplace la 3ᵉ ligne par : `Copy-Item .env.example .env`.

## 3. Lancer

**Pour l'utiliser au quotidien :**

```bash
npm run build      # prépare l'application (une fois, et après chaque mise à jour)
npm start          # démarre Bibi
```

Ouvre ensuite <http://localhost:3000>.

**Pour modifier le code** (rechargement automatique) : `npm run dev` puis ouvre l'adresse affichée (<http://localhost:5173>).

**Pour tout vérifier** : `npm run test:all` (types, tests, construction, test dans un vrai navigateur).

## 4. Obtenir une clé d'IA

Bibi parle à une « IA » hébergée par un fournisseur. Chaque fournisseur te donne une **clé** (un long mot de passe). Trois offres ont un niveau gratuit :

| Fournisseur | Où créer la clé | Gratuit ? |
|---|---|---|
| **Google Gemini** | <https://aistudio.google.com/apikey> | oui, avec des limites par minute et par jour |
| **Groq** | <https://console.groq.com/keys> | oui, avec des limites par minute et par jour |
| **OpenRouter** | <https://openrouter.ai/keys> | modèles marqués « :free » gratuits, les autres sont payants |

> Les niveaux gratuits **ne sont pas illimités** : quand la limite est atteinte, Bibi te le dit (et te dit dans combien de temps réessayer).

**Deux façons de donner une clé à Bibi :**

1. **Dans l'application** : *Paramètres → Intelligence artificielle*, colle la clé, touche « Enregistrer », puis « Tester ». La clé est stockée **chiffrée sur le serveur** et n'est jamais renvoyée au navigateur.
2. **Dans le fichier `.env`** : `GEMINI_API_KEY=...` (ou `GROQ_API_KEY`, `OPENROUTER_API_KEY`). Redémarre ensuite Bibi.

Tu peux aussi brancher un fournisseur compatible OpenAI de ton choix (Ollama sur ton ordinateur, LM Studio…) avec les variables `CUSTOM_AI_*`.

### Règle de dépense (très importante)

**Bibi ne dépense jamais d'argent sans que tu le saches.** Tant que `ALLOW_PAID_PROVIDERS=false` (réglage par défaut), tout modèle ou moteur de voix payant est **bloqué**, même si tu as saisi une clé. Et Bibi ne bascule **jamais** d'elle-même vers un service payant quand un gratuit est en panne : elle essaie un autre fournisseur **gratuit** si tu as activé le « repli », sinon elle te le dit.

## 5. Le fichier `.env`

Toutes les variables sont expliquées, une par une, dans [`.env.example`](.env.example). Les plus utiles :

| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | longue phrase aléatoire (32 caractères mini), **obligatoire sur Internet** |
| `BIBI_ACCESS_CODE` | code d'accès : sans lui, n'importe qui qui trouve l'adresse peut utiliser tes clés |
| `ENABLE_CLOUD_SYNC` | `true` = comptes e-mail + mot de passe et synchronisation entre appareils |
| `ALLOW_PAID_PROVIDERS` | `false` par défaut : aucun service payant |
| `ENABLE_LOCAL_MEMORY` | `false` = coupe « Ma mémoire avec Bibi » sur tout le serveur |
| `DATA_DIR` | où est la base SQLite (à sauvegarder) |

En production (`NODE_ENV=production`), Bibi **refuse de démarrer** si `SESSION_SECRET` est trop court ou si rien ne protège l'accès. C'est voulu.

## 6. L'utiliser sur ton téléphone

### Sur le même Wi-Fi (essai à la maison)

1. Sur l'ordinateur, lance Bibi avec `HOST=0.0.0.0` (c'est la valeur par défaut).
2. Trouve l'adresse de l'ordinateur sur le réseau (Mac : *Réglages → Wi-Fi → Détails* ; Windows : `ipconfig`) — par exemple `192.168.1.20`.
3. Sur le téléphone, ouvre `http://192.168.1.20:3000`.

> ⚠️ En `http://` (sans cadenas), les navigateurs **refusent le micro, l'installation comme appli et le mode hors ligne**. Seul `localhost` fait exception. Pour tout avoir sur téléphone, il faut une adresse `https://` : voir [`docs/deploiement.md`](docs/deploiement.md).

### Installer comme une appli (PWA)

Il faut ouvrir Bibi en **https://** (ou `localhost`).

- **iPhone / iPad (Safari)** : touche le bouton *Partager* ⬆️ → *Sur l'écran d'accueil* → *Ajouter*.
- **Android (Chrome)** : menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).
- **Ordinateur (Chrome / Edge)** : l'icône d'installation à droite de la barre d'adresse.

Une fois installée, Bibi s'ouvre sans barre d'adresse, fonctionne **hors ligne en mode réduit** (tes notes, tâches et conversations restent lisibles ; Bibi ne peut pas répondre sans internet) et se met à jour toute seule : un bandeau propose de recharger quand une nouvelle version est prête.

## 7. Les voix

Page **Voix**. Bibi sait parler (synthèse vocale) et t'écouter (reconnaissance vocale).

- **Voix du navigateur** (gratuit, rien à installer) : la liste vient de ton appareil. Bibi **n'invente aucune voix** : si ton appareil n'en a aucune, la page le dit. Recherche par langue ou par nom, bouton « Écouter un exemple ».
- **Piper** et **Kokoro** (gratuits, que tu héberges toi-même) : renseigne `PIPER_URL` / `KOKORO_URL`.
- **ElevenLabs** (voix très naturelles) : gratuit jusqu'à un petit quota puis **payant** → il faut `ALLOW_PAID_PROVIDERS=true` **et** une clé.
- **Écoute (micro)** : le micro ne démarre **jamais** tout seul, seulement quand tu touches 🎤. Sur Chrome, la reconnaissance du navigateur envoie le son aux serveurs de Google (c'est comme ça que Chrome fonctionne). Si elle n'existe pas sur ton appareil, Bibi peut passer par Whisper via Groq (clé Groq requise).
- **Mode mains libres** : Bibi t'écoute, répond à voix haute, puis se remet à l'écoute. Elle ne s'écoute pas elle-même (anti-boucle) et un bouton l'arrête à tout moment.

## 8. Ma mémoire avec Bibi

Page **Mémoire**. Dis par exemple « *Retiens que je n'aime pas la coriandre* » : Bibi te **demande confirmation** avant d'enregistrer. Tu peux ensuite modifier, désactiver, supprimer chaque souvenir, tout exporter ou tout oublier.

- Elle ne retient **jamais** seule, et **refuse** les données sensibles (mots de passe, numéro de carte, IBAN, clés, numéro de sécurité sociale), même si tu insistes.
- Elle n'invente jamais de souvenir : seuls les souvenirs **activés** sont donnés à l'IA.
- Interrupteur général dans *Paramètres → Mémoire et confidentialité*.

> Les souvenirs activés sont envoyés au fournisseur d'IA que tu choisis, avec ta question, pour que Bibi puisse s'en servir. Ne mets rien que tu ne voudrais pas lui confier.

## Rappels : ce qui est vrai

Les rappels sont **locaux** : ils sonnent (notification du système si tu l'autorises, sinon bandeau dans la page) **seulement quand Bibi est ouverte** ou installée et active en arrière-plan. Aucun serveur n'envoie de notification « push » : ce n'est pas configuré, et l'écran le dit. Si Bibi est fermée à l'heure du rappel, il sonne à la réouverture.

## 9. Sauvegarder tes données

- **Sur l'appareil** : *Paramètres → Mes données → Exporter tout (JSON)* télécharge un fichier avec conversations, souvenirs, notes, tâches, rappels et réglages.
- **Sur le serveur** : copie le dossier `DATA_DIR` (fichier `bibi.db`) Bibi arrêtée. Les clés d'IA saisies dans l'application y sont chiffrées avec `SESSION_SECRET` : **garde cette phrase**, sans elle les clés enregistrées sont perdues.
- **Tout effacer** : *Paramètres → Mes données* (sur l'appareil) et *Effacer mes données du serveur* (si la synchronisation est active).

## 10. Synchronisation entre appareils (facultatif)

Avec `ENABLE_CLOUD_SYNC=true`, tu crées un compte (le premier compte est toujours permis, les suivants seulement avec `ALLOW_REGISTRATION=true`). Les données restent d'abord **sur ton appareil** ; la synchronisation envoie les changements au serveur et récupère ceux des autres appareils. En cas de modification du même élément sur deux appareils, **le plus récent gagne**. La base est **SQLite** (un fichier). Supabase / PostgreSQL ne sont **pas** pris en charge dans cette version.

## 11. Mettre Bibi sur Internet

Voir [`docs/deploiement.md`](docs/deploiement.md) (Render, Railway, Vercel, serveur VPS, Supabase, avec coûts et limites réels) et [`docs/confidentialite-et-securite.md`](docs/confidentialite-et-securite.md).

## 12. Si ça ne marche pas

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Configuration invalide (.env)` au démarrage | une valeur du `.env` est mal écrite | lis la ligne indiquée ; **les commentaires `#` vont sur leur propre ligne** |
| `SESSION_SECRET doit faire au moins 32 caractères` | mode production sans secret | génère-en un (commande dans `.env.example`) |
| `En production, protège Bibi…` | aucun code d'accès ni compte | mets `BIBI_ACCESS_CODE=...` |
| « Aucune clé configurée » dans le chat | pas de clé d'IA | *Paramètres → Intelligence artificielle* |
| « Clé refusée » | clé mal copiée ou révoquée | recrée-la chez le fournisseur, puis « Tester » |
| « Limite atteinte, réessaie dans N s » | quota gratuit épuisé | attends, ou active le repli vers un autre fournisseur gratuit |
| `Cannot find module 'node:sqlite'` | Node trop ancien | installe Node 22.5 ou plus |
| Le micro ne démarre pas | page en `http://` ou micro refusé | utilise `https://` (ou `localhost`) et autorise le micro |
| Pas de bouton « Installer » | page en `http://` | utilise `https://` |
| Je ne vois pas la nouvelle version | ancien cache | recharge quand le bandeau le propose ; sinon ferme et rouvre l'appli |
| Aucune voix dans la liste | ton appareil n'en a pas dans cette langue | installe une voix dans les réglages du système, ou branche Piper/Kokoro |
| Port déjà utilisé | un autre programme sur 3000 | change `PORT` dans `.env` |

## 13. Pour les curieux : l'organisation du code

```
bibi-assistant/
├─ src/        l'application (React + TypeScript) : pages, composants, données locales (IndexedDB)
├─ server/     le serveur (Fastify) : IA, voix, comptes, synchronisation, base SQLite
├─ public/     icônes, manifeste d'installation, service worker (mode hors ligne)
├─ tests/      tests automatiques (serveur et application)
├─ scripts/    construction des icônes, lancement développeur, test dans un vrai navigateur
└─ docs/       déploiement, confidentialité et sécurité, limites
```

Les clés d'API n'existent que côté serveur : elles ne sont jamais écrites dans le code envoyé au navigateur, ni dans les journaux, ni dans les réponses (des tests automatiques le vérifient).
