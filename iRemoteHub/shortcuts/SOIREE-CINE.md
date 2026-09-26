# Raccourci — iRemoteHub - Soirée ciné

## Description

Ambiance cinéma en 1 tap :
- Lumières salon → 15% chaud 2700K.
- TV allumée, input HDMI2 (BluRay/console).
- Volets fermés (HomeKit).
- Sonos / AirPlay → volume 30%, source TV.
- Mode "Ne pas déranger" activé.

## Étapes

1. **Activer "Ne pas déranger"** (Concentration → Cinéma).
2. **Définir la scène HomeKit "Cinéma"** (créer manuellement dans Maison.app).
3. **Appeler bridge** :
   - URL : `[bridge_url]/macro/cinema`
   - Body : `{"input":"HDMI2","volume":30}`
4. **Attendre 2 secondes**.
5. **Ouvrir l'app Apple TV** (pour browse Netflix/Disney+).
6. **Notification** : « 🎬 Bon film ! »

## Scène HomeKit à créer

Dans Maison.app → ➕ → **Scène** → Nom "Cinéma" :
- Lumières salon : 15% / 2700K
- Volets : fermer
- Chauffage : +1°C
- Enceinte HomePod : volume 30%, entrée "TV"
