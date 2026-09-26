# 📱 Push Notifications iPhone — Guide Kevin (5 minutes, 0 code)

## 🎁 Tes clés sont DÉJÀ générées (juste copier-coller)

Tu n'as PAS besoin d'ouvrir gen-vapid.html. J'ai généré tes 3 secrets pour toi :

```
VAPID_PUBLIC_KEY  = BDA5GvwQr-qnrIxZss0taxz_BbB7cTMLWQFfpoNpFF3KnfPu7ItJerHdbXb-1gzQ4rCa-PN1UhzJmQq1DA02x04

VAPID_PRIVATE_KEY = VN_9KTrXVqfxdYVk9S2uRA5II2RLc8dIPJb84oOX8kg

ADMIN_TOKEN       = UHIL7jRJARAYHeH8d6STOHpXVX1z2RF4b7CN1c_fJ_I
```

⚠️ **Sauve ces 3 lignes dans iCloud Notes ou 1Password tout de suite** (tu vas en avoir besoin).

---

## 🎯 Ce que tu vas faire (5 étapes, pas-à-pas iPhone)

### ✅ ÉTAPE 1 — Créer le Worker Cloudflare (1 min)

**Tape sur ce lien direct iPhone** :  
👉 **https://dash.cloudflare.com/sign-up/workers-and-pages**

1. Crée un compte (gratuit, sans carte bancaire) avec ton email + mot de passe
2. Vérifie ton email (clic sur le lien dans le mail Cloudflare)
3. Tu arrives sur la page Workers
4. **Bouton "Create"** (ou "Créer") en haut à droite
5. **Choisis "Worker"** (pas Pages)
6. Nom : `apex-push-worker`
7. **Bouton "Deploy"** (ou "Déployer")

→ Cloudflare crée un worker "Hello World" par défaut. On va remplacer le code après.

---

### ✅ ÉTAPE 2 — Coller le code du Worker (1 min)

**Tape sur ce lien direct (le code à copier)** :  
👉 **https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/tools/cloudflare/apex-push-worker.js**

1. La page affiche du code (425 lignes)
2. **Tap long** dans le code → **"Tout sélectionner"** → **"Copier"**
3. Retour sur Cloudflare Dashboard (autre onglet)
4. Sur ton worker → **Bouton "Edit code"** (ou "Modifier le code") en haut à droite
5. Tu vois un éditeur de code en ligne
6. **Sélectionne tout** le code "Hello World" par défaut → **Supprime**
7. **Colle** ton code Apex
8. **Bouton "Save and deploy"** (ou "Enregistrer et déployer") en haut à droite
9. Confirme avec **"Save and deploy"** dans la modale

→ Le worker tourne maintenant avec le bon code.

---

### ✅ ÉTAPE 3 — Configurer les 5 variables (2 min)

Sur ton worker `apex-push-worker` dans Cloudflare :

1. **Onglet "Settings"** (en haut)
2. Scroll jusqu'à **"Variables and Secrets"** (Variables et Secrets)
3. **Bouton "+ Add"** (Ajouter)

Ajoute ces **5 variables** UNE PAR UNE (clic "+ Add" entre chaque) :

| Nom | Valeur | Type |
|-----|--------|------|
| `VAPID_PUBLIC_KEY` | `BDA5GvwQr-qnrIxZss0taxz_BbB7cTMLWQFfpoNpFF3KnfPu7ItJerHdbXb-1gzQ4rCa-PN1UhzJmQq1DA02x04` | **Encrypt** ✅ |
| `VAPID_PRIVATE_KEY` | `VN_9KTrXVqfxdYVk9S2uRA5II2RLc8dIPJb84oOX8kg` | **Encrypt** ✅ |
| `VAPID_EMAIL` | `kevin.desarzens@gmail.com` | Texte |
| `FIREBASE_URL` | `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app` | Texte |
| `ADMIN_TOKEN` | `UHIL7jRJARAYHeH8d6STOHpXVX1z2RF4b7CN1c_fJ_I` | **Encrypt** ✅ |

**Encrypt** = bouton "🔒 Encrypt" à cocher avant Save (cache la valeur, irrécupérable après)

4. **Bouton "Save and deploy"** (en bas) après avoir tout ajouté

---

### ✅ ÉTAPE 4 — Récupérer ton URL Worker (10 sec)

En haut de la page de ton worker dans Cloudflare, tu vois quelque chose comme :

```
https://apex-push-worker.kevin-desarzens.workers.dev
```

(le `kevin-desarzens` = ton username Cloudflare, pas ton email)

**Tap long sur l'URL → "Copier"** et **sauve dans iCloud Notes**.

**Test : ouvre ce lien dans Safari** :
```
https://apex-push-worker.TON-USERNAME.workers.dev/health
```

Tu dois voir un texte JSON qui commence par `{"ok":true,"configured":true,...}`.

→ Si oui : **C'EST BON**, ton worker fonctionne ! ✅  
→ Si `configured:false` : retour étape 3, une variable manque.

---

### ✅ ÉTAPE 5 — Brancher Apex sur le Worker (30 sec)

Sur ton iPhone, ouvre **Apex** :

1. Va dans **Réglages** (bouton ⚙️)
2. Section **"Notifications Push"**
3. Colle ton URL Worker dans `apex_v13_push_worker_url` :
   ```
   https://apex-push-worker.TON-USERNAME.workers.dev
   ```
4. Colle ton ADMIN_TOKEN dans `apex_v13_push_admin_token` :
   ```
   UHIL7jRJARAYHeH8d6STOHpXVX1z2RF4b7CN1c_fJ_I
   ```
5. Colle ta clé publique VAPID dans `ax_vapid_public` :
   ```
   BDA5GvwQr-qnrIxZss0taxz_BbB7cTMLWQFfpoNpFF3KnfPu7ItJerHdbXb-1gzQ4rCa-PN1UhzJmQq1DA02x04
   ```
6. **Bouton "Tester push"**
7. iOS demande l'autorisation notif → **Autoriser**

→ Tu reçois ton premier push ! 🎉

---

## 🎁 Vérif tout marche

Test rapide depuis Safari (remplace `TON-USERNAME`) :

```
https://apex-push-worker.TON-USERNAME.workers.dev/health
```

Doit afficher : `{"ok":true,"configured":true}` ✅

---

## ⚠️ Conditions iOS pour notifs app fermée

iOS Safari Web Push exige :
- **iOS 16.4+** (vérifie : Réglages → Général → Informations)
- **App Apex installée sur écran d'accueil** (PWA standalone)
  - Sur Apex dans Safari → bouton Partager (carré + flèche bas) → **"Sur l'écran d'accueil"**
  - Lance Apex depuis l'icône or de l'écran d'accueil (pas Safari)

Sans ça, push notifs marchent QUE quand l'app est ouverte (pas fermée).

---

## 💰 Coût Cloudflare

**Gratuit jusqu'à 100 000 push/jour**. Largement assez. Pas de carte bancaire requise.

Si jamais ton app cartonne et tu dépasses : 5$/mois pour 10 millions de requêtes.

---

## 🆘 Problème ?

| Symptôme | Solution |
|----------|----------|
| `/health` répond `configured:false` | Variable manquante → retour étape 3 |
| Push pas reçu sur iPhone | iOS 16.4+ requis + app installée écran d'accueil |
| `unauthorized` | ADMIN_TOKEN différent dans Apex et Cloudflare → recopier |
| Cle VAPID invalide | Espace en trop → retape sans espace |

Si bloqué : envoie-moi le message d'erreur, je règle.

---

## 📝 Récap rapide

```
1. Cloudflare → créer Worker "apex-push-worker"
2. Coller code depuis https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/tools/cloudflare/apex-push-worker.js
3. Settings → Variables → ajouter les 5 (clés ci-dessus)
4. Copier l'URL du worker (.workers.dev)
5. Apex → Réglages → Push Notifications → coller URL + token + VAPID public
```

**5 minutes, 0 code, 0 carte bancaire. 🚀**
