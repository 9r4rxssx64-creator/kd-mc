# Raccourci — iRemoteHub - Réveil matin

## Description

Démarrage de journée progressif. À déclencher via automatisation iOS (heure fixe ou sortie de sommeil).

## Étapes

1. **Scène HomeKit "Matin"** :
   - Lumières chambre : 30% chaud, puis montée progressive.
   - Volets : ouverture 50%.
   - Chauffage : 20°C.
2. **Attendre 2 minutes** (transition douce).
3. **Lancer playlist Apple Music** "Morning".
4. **Ouvrir météo du jour** (app Météo).
5. **Lire à voix haute** : « Bonjour. Il est [heure]. Dehors [température] degrés. »
6. **Notification** : « ☀️ Bonne journée ! »

## Automatisation

Raccourcis → Automatisation → Créer pour moi :
- Déclencheur : **Heure** : 7h00, jours ouvrés.
- Action : Lancer `iRemoteHub - Réveil matin`.
- Désactiver « Demander avant d'exécuter ».
