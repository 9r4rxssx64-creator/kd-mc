# Raccourci — iRemoteHub - Faire sonner mon iPhone

## Description

Joue un son d'alerte à volume maximum sur l'iPhone courant.
Utile quand on le cherche dans la maison.

## Étapes

1. **Obtenir le volume actuel** → sauvegarder dans variable `old_volume`.
2. **Définir le volume** → 100%.
3. **Vibrer** (haptique "Succès" répété 5 fois).
4. **Lire le son** → fichier système `Alarm.caf` ou son custom.
   - Action : **Lire son** (Raccourcis > Média).
5. **Attendre 10 secondes**.
6. **Restaurer volume** → `old_volume`.
7. **Callback** : `iremotehub://done?macro=ring-iphone`.

## Variante avec Find My

Si l'iPhone cherché n'est pas celui-ci :
- Utiliser action **"Trouver mes appareils"** → Sélectionner l'appareil → **Faire sonner**.
- Nécessite le même compte iCloud.

## Widget

Placer en raccourci double-tap arrière iPhone (Réglages → Accessibilité → Toucher → Toucher arrière).
