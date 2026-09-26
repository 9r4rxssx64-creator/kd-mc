# Raccourci — iRemoteHub - Panique Silence

## Description

Coupe instantanément toute source sonore dans la maison. Utile si alerte voisin, bébé qui dort, appel urgent.

## Étapes

1. **Mute iPhone** (mode silencieux ON).
2. **Stop lecture multimédia** locale.
3. **Appeler bridge** :
   - URL : `[bridge_url]/macro/panic-silence`
   - Body : `{}`
4. Le bridge exécute en parallèle :
   - Stop tous les Sonos.
   - Pause tous les Cast / AirPlay.
   - Mute toutes les TV (via adapters).
   - Stop radio web tuners.
5. **Vibrer** (haptique "Alerte").
6. **Notification** : « 🔇 Silence. »

## Widget

Idéal en double-tap arrière ou widget lock-screen pour accès 1 tap.
