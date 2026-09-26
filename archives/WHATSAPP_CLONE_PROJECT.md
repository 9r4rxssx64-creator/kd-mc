# 📱 PROJET COPIE WHATSAPP — Spécifications Kevin

> Fichier de mémoire pour le projet de messagerie style WhatsApp.
> Créé 2026-04-27 pour ne pas mélanger avec Apex.

---

## Contexte

Kevin développe un clone WhatsApp en parallèle d'Apex et CMCteams. Les exigences ci-dessous concernent **ce projet uniquement**, pas Apex.

---

## Spécifications collectées

### 1. Authentification utilisateur (style WhatsApp)

> Kevin 2026-04-27 : "On prévoit la validation admin pour la connexion une fois fiches créées, mais tu restes vague, on demande juste nom, prénom, numéro de téléphone, c'est tout. On fait une vérification par le numéro de téléphone du coup. De l'identité, que ce soit le bon numéro de téléphone. Ensuite, on crée la fiche, tout tout en automatique. Pendant ce temps, tu sauvegardes à chaque fois, toujours le sauvegarde. Tu tiens à jour. Tout comme what's"

**Flow** :
1. Saisie minimale : **nom + prénom + numéro de téléphone**
2. Vérification automatique du numéro via SMS (style WhatsApp/Telegram/Signal)
3. Code 6 chiffres reçu par SMS → user le tape → vérifié
4. Création **automatique** de la fiche utilisateur
5. Sauvegarde temps réel (jamais perdu)

**Solution technique recommandée** :
- **Firebase Authentication Phone Provider** (gratuit 10K vérifications/mois)
- Setup : Console Firebase → Authentication → Sign-in method → activer "Phone"
- reCAPTCHA invisible v3 intégré
- Whitelist domaine GitHub Pages : `9r4rxssx64-creator.github.io`
- SDK : `firebase/auth` via CDN compat

> Kevin 2026-04-27 (clarification) : "Pas la validation admin une manière de vérifier le téléphone de la carte personne, un message, je ne sais pas. Vois comment il fait WhatsApp. Pour s'autologuer ou je n'en sais rien."

→ **Pas de validation admin manuelle** — vérification téléphone purement automatique.

---

### 2. Historique admin complet temps réel

> Kevin 2026-04-27 : "Dans les historiques admin, je veux que j'ai l'histoire l'historique de tout ce qui se passe chez tout le monde. bien sûr, tout est en temps réel, les sauvegardes et etc. tout se passe automatiquement comme dans apex, tu mets les mêmes choses en place plus ou moins tout ce qui va par rapport à ça."

**À mettre en place** (pattern identique à Apex) :
- Audit log par utilisateur : connexions, déconnexions, messages envoyés/reçus, fichiers, contacts ajoutés, paramètres modifiés
- Historique sync Firebase RTDB avec FB_FIX (cross-device admin)
- Sentinelles temps réel (admin-watch, presence-watch, anomaly-watch)
- Triple persistence : localStorage + IndexedDB shadow + Firebase
- Backup quotidien automatique
- Vue admin centralisée listant tous les utilisateurs avec leur activité

---

### 3. Fiche utilisateur enrichie automatiquement

> Kevin 2026-04-27 : "Dans la fiche de chaque personne, tu récupères un maximum de données automatiquement. Et comme le reste tu enrichis fur et à mesure des conversations, les données de chaque personne sur leur fiche en plus de l'historique des conversations, et caetera."

**Données à collecter automatiquement** :
- Identité : nom, prénom, téléphone (depuis l'auth)
- Device : userAgent, screen size, OS, navigateur, modèle
- Réseau : IP (via ipify), pays, ville, ISP, VPN/proxy détection
- Localisation : timezone, langue browser, géoloc avec consentement
- Patterns : fréquence connexion, heures actives, contacts fréquents
- Préférences : émojis utilisés, longueur messages, langues détectées

**Enrichissement par conversation** (pattern Apex `_enrichProfileFromMessage`) :
- Extraction faits depuis chaque message (regex + NLP simple)
- Stockage dans `fiche_<uid>` enrichie
- Synthèse 5-10 lignes auto-générée toutes 24h
- Score de complétude visible côté admin

---

## Architecture technique recommandée

| Composant | Solution |
|-----------|----------|
| **Frontend** | HTML/JS standalone (pattern Apex monofichier) |
| **Auth** | Firebase Auth Phone Provider |
| **DB** | Firebase Realtime Database (path `/whatsapp/`) |
| **Storage médias** | Firebase Storage (photos, vidéos, audio, docs) |
| **Push notifs** | Web Push API + Cloudflare Worker existant |
| **Chiffrement E2E** | Signal Protocol JS ou simple AES-GCM par conversation |
| **Hébergement** | GitHub Pages dossier `/whatsapp/` |

---

## Différenciation avec Apex et CMCteams

| Aspect | Apex | CMCteams | WhatsApp Clone |
|--------|------|----------|----------------|
| Cible | Assistant IA perso | Planning casino SBM | Messagerie publique |
| Auth | Login + PIN | Login employé + PIN | Téléphone + SMS |
| Validation | Manuelle admin | Manuelle admin | Auto par SMS |
| Effectif | Kevin + Laurence + clients | 258 employés | Sans limite |

---

## TODO Kevin pour activer auth téléphone

1. Console Firebase → Authentication → Sign-in method → activer **Phone**
2. Ajouter domaine GitHub Pages dans whitelist : `9r4rxssx64-creator.github.io`
3. (Optionnel) Configurer un compte Twilio pour SMS hors quota Firebase
4. Tester avec son propre numéro avant ouverture publique

---

## Note importante

Cette spec NE s'applique PAS à :
- Apex (assistant IA — auth nom + prénom + PIN, pas SMS)
- CMCteams (planning casino — auth employé + PIN admin)
- La page partage Apex (`apex-share/`) prévue ce soir — login Kevin passphrase + invité token gérable

---

## Historique conversations

À enrichir au fur et à mesure des prochains messages Kevin sur ce projet.
