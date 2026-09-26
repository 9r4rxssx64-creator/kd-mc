# Deployer le Push Worker Apex sur Cloudflare

Ce guide t'aide a installer le serveur qui envoie les notifications push iPhone.
**Duree : 5 minutes. Aucun codage. Pas de carte bancaire (offre gratuite Cloudflare suffit).**

---

## Etape 1 - Creer le Worker (1 min)

1. Ouvre dans Safari iPhone : **https://dash.cloudflare.com/?to=/:account/workers**
2. Connecte-toi (ou cree un compte gratuit)
3. Clique sur **Create Worker**
4. Donne-lui un nom : `apex-push-worker`
5. Clique **Deploy**

Tu vois maintenant un editeur de code en ligne. Bien.

---

## Etape 2 - Coller le code du Worker (1 min)

1. Ouvre l'autre fichier : **`apex-push-worker.js`** (dans ton telephone, depuis le repo CMCteams/tools/cloudflare/)
2. Copie tout son contenu (selectionner tout, copier)
3. Retourne dans Cloudflare, clique **Edit code** (bouton en haut a droite)
4. Efface tout le code par defaut, colle le tien
5. Clique **Save and deploy** (en haut a droite)

---

## Etape 3 - Generer tes cles VAPID (1 min)

Les "cles VAPID" sont 2 cles cryptographiques qui prouvent que toi seul peux envoyer des push.

1. Ouvre dans Safari : **`tools/cloudflare/gen-vapid.html`** depuis ton repo (ou heberge-le 30s)
2. Clique **Generer mes cles VAPID**
3. Tu vois 2 longues chaines :
   - `VAPID_PUBLIC_KEY` (commence par `B...`)
   - `VAPID_PRIVATE_KEY` (chaine plus courte)
4. **Sauvegarde-les dans 1Password / iCloud Notes** (besoin tout de suite + plus tard).

**ATTENTION** : la cle privee ne doit JAMAIS etre partagee. La cle publique peut l'etre.

---

## Etape 4 - Configurer le Worker (2 min)

Dans Cloudflare, sur la page de ton worker `apex-push-worker` :

1. Clique sur l'onglet **Settings** (en haut)
2. Scroll a **Variables and Secrets**
3. Ajoute ces 5 variables (clique **Add** puis **Encrypt** pour chacune) :

| Nom | Valeur | Encrypt ? |
|-----|--------|-----------|
| `VAPID_PUBLIC_KEY` | (la cle publique generee a l'etape 3) | OUI |
| `VAPID_PRIVATE_KEY` | (la cle privee generee a l'etape 3) | OUI |
| `VAPID_EMAIL` | ton@email.com (le tien) | NON |
| `FIREBASE_URL` | `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app` | NON |
| `ADMIN_TOKEN` | un mot de passe random 32+ chars que toi seul connais | OUI |

**Astuce ADMIN_TOKEN** : tape ce site **https://passwordsgenerator.net** > genere 32 chars, copie.
Sauvegarde-le dans iCloud Notes (besoin pour configurer Apex).

4. Clique **Save and deploy** apres avoir tout ajoute.

---

## Etape 5 - Recuperer l'URL du Worker (10 sec)

En haut de la page Cloudflare, tu vois l'URL de ton worker, du genre :
```
https://apex-push-worker.tonusername.workers.dev
```

Copie-la dans iCloud Notes.

**Test** : ouvre cette URL + `/health` dans Safari :
```
https://apex-push-worker.tonusername.workers.dev/health
```
Tu dois voir : `{"ok":true,"version":"v1.0","configured":true,...}`

Si `configured: false` -> tu as oublie une variable a l'etape 4.

---

## Etape 6 - Configurer Apex (30 sec)

1. Ouvre l'app Apex sur ton iPhone
2. Va dans **Coffre** (menu Reglages -> Coffre, ou onglet Coffre)
3. Cherche : **Infrastructure technique**
4. Tu vois 2 nouvelles entrees :
   - **URL Cloudflare Push Worker** -> colle l'URL recuperee etape 5
   - **Token admin du Push Worker** -> colle le mot de passe ADMIN_TOKEN etape 4
5. Egalement (Coffre, IA / Multimedia) : **Cle publique VAPID** dans `AX_VAPID_PUBLIC` (a coller manuellement la 1ere fois dans le code -> voir note ci-dessous)

**Note technique cle VAPID publique** :
La 1ere fois, il faut remplacer dans `apex-ai/index.html` la ligne :
```js
var AX_VAPID_PUBLIC="BEl62iUYgUivxIkv69yViEuiBIa1HI9hRmKvSzg_TvNh4zRDEtv2JzHE8MqQgqp7XeKQHEKZ4ETZiB2EW3YcQyc";
```
par TA cle publique generee a l'etape 3. Push commit (Claude Code peut le faire si tu lui demandes).

---

## Etape 7 - Tester ! (30 sec)

1. Sur ton iPhone, dans Apex, va dans **Reglages**
2. Active les notifications (banner doree "Activer les notifications")
3. Accepte la demande iOS
4. Apex appelle automatiquement le Worker -> tu recois ton 1er push !

Sinon, tu peux le forcer dans la console JS de Safari :
```js
axSendPushFromAdmin([K.user.id], {title:"Test", body:"Hello depuis le Worker"})
```

---

## Test direct du Worker (sans Apex)

Si tu veux verifier que le Worker fonctionne :

```bash
curl -X POST https://apex-push-worker.tonusername.workers.dev/test \
  -H "Authorization: Bearer TON_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"kdmc_admin","payload":{"title":"Test","body":"Hello"}}'
```

Ou stats :
```bash
curl https://apex-push-worker.tonusername.workers.dev/stats \
  -H "Authorization: Bearer TON_ADMIN_TOKEN"
```

---

## Cout

- Cloudflare Workers free tier : **100 000 requetes/jour** -> largement assez (1 push = 1 requete)
- Aucune carte bancaire requise
- Si depassement : 5$/mois pour 10 millions de requetes

---

## Probleme ?

| Symptome | Cause probable | Solution |
|----------|----------------|----------|
| `/health` repond `configured:false` | variable manquante | re-verifie etape 4 |
| Push pas recu sur iPhone | iOS 16.4+ requis + app installee ecran d'accueil | iOS Reglages > Notifications > Apex > Autoriser |
| `unauthorized` | mauvais ADMIN_TOKEN | verifie que celui dans Apex Coffre = celui dans Cloudflare Settings |
| `no_subscribers` | personne n'a active push | demande a l'utilisateur d'activer dans Reglages Apex |
| Cle VAPID invalide | base64url mal copie | regenere avec gen-vapid.html, copie sans espace |

Si bloque : envoie message dans la boite admin Apex, l'agent Claude Code prend le relais.

---

Version : v1.0 (Apex v12.200, 2026-04-25)
