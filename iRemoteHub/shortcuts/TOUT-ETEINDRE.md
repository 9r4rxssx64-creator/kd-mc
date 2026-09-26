# Raccourci — iRemoteHub - Tout éteindre

## Description

Éteint en parallèle tous les appareils pilotables de la maison :
- TV (via bridge → tous adapters)
- Enceintes Sonos / AirPlay / Bluetooth (stop + pause)
- Lumières HomeKit / Hue
- Prises Kasa / Tapo / Shelly
- Scène HomeKit "Au revoir" si définie

Temps d'exécution cible : < 3 secondes.

## Lien iCloud

*(à générer une fois le Raccourci publié — placeholder)*
```
https://www.icloud.com/shortcuts/XXXXXXXXXXXX
```

## Étapes (recréation manuelle)

1. **Obtenir dans la liste → variables depuis le presse-papiers ou Keychain**
   - Clé `iremotehub_bridge_url`
   - Clé `iremotehub_bridge_token`

2. **Si `iremotehub_bridge_url` est vide**
   - Afficher alerte : « Bridge non appairé. Ouvrez iRemoteHub → Paramètres → Bridge. »
   - Arrêter.

3. **En parallèle (action "Répéter en parallèle")** :
   - **A)** Obtenir le contenu de l'URL :
     - URL : `[bridge_url]/macro/all-off`
     - Méthode : POST
     - Header : `X-Auth-Token: [bridge_token]`
     - Body JSON : `{"confirm":true,"source":"ios-shortcut"}`
   - **B)** Définir la scène HomeKit "Au revoir" (si existe).
   - **C)** Mettre en pause la lecture (action "Lecture/pause").

4. **Si l'étape A renvoie une erreur** :
   - Vibrer → haptique "Erreur".
   - Afficher toast : « Échec partiel. Vérifier bridge. »

5. **Sinon** :
   - Haptique "Succès".
   - Afficher notification : « 🌙 Tout est éteint. »

6. **Callback x-success** :
   - Ouvrir URL : `iremotehub://done?macro=all-off`

## Variables à préconfigurer

| Clé Keychain | Valeur |
|--------------|--------|
| `iremotehub_bridge_url` | `http://192.168.1.X:7070` |
| `iremotehub_bridge_token` | (collé depuis QR code) |

## Widget écran verrouillé

Modifier écran d'accueil → Widgets → Raccourcis (taille S) → iRemoteHub - Tout éteindre.
Pression longue du lock screen → 1 tap éteint tout.

## Test

1. Allumer 2-3 appareils pilotés (lampe Hue + Sonos).
2. Lancer le Raccourci.
3. Vérifier que tout s'éteint en < 3s.
4. En cas d'échec, lire les logs bridge : `tail -f ~/iremotehub.log`.
