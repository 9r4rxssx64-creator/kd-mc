# Raccourci — iRemoteHub - Appairer bridge

## Description

Configure l'URL et le token d'authentification du bridge Node.js. À lancer une seule fois, au premier usage.

## Étapes

1. **Demander texte** : « URL du bridge (ex: http://192.168.1.25:7070) » → variable `url`.
2. **Scanner QR code** (action "Lire un code QR") → variable `token`.
3. **Vérifier la connexion** :
   - GET `[url]/health` avec header `X-Auth-Token: [token]`.
   - Attendre réponse JSON `{"status":"ok"}`.
4. **Si OK** :
   - Enregistrer dans Keychain :
     - `iremotehub_bridge_url` = `url`
     - `iremotehub_bridge_token` = `token`
   - Notification : « ✅ Bridge appairé. »
5. **Si échec** :
   - Notification : « ❌ Connexion échouée. Vérifier URL/token. »

## Sécurité

- Le token est stocké dans Keychain iOS (chiffré matériel).
- Les autres Raccourcis iRemoteHub lisent ces valeurs à chaque exécution.
