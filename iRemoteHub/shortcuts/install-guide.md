# Raccourcis Apple — Guide d'installation

Ces Raccourcis donnent à iRemoteHub accès aux API natives Apple depuis l'iPhone.

## Pré-requis

- iPhone iOS 16+ (iOS 17 recommandé).
- App **Raccourcis** (pré-installée).
- PWA iRemoteHub installée.
- Bridge iRemoteHub déployé + appairé (optionnel mais recommandé).

## Méthode 1 — Import via lien iCloud

Chaque fichier `.md` de ce dossier contient :
- Description du Raccourci.
- **Lien iCloud direct** (à ouvrir sur iPhone).
- Paramètres à configurer (URL bridge, scènes HomeKit, etc.).

Taper le lien → **Obtenir le raccourci** → **Ajouter**.

## Méthode 2 — Création manuelle

Chaque fichier `.md` décrit aussi les **étapes** pour recréer le Raccourci à la main dans l'app Raccourcis.

## Autorisations à accorder

À la première exécution, iOS demande :
- **HomeKit** : pour piloter scènes / accessoires.
- **Apple Music** / **Multimédia** : pour contrôler la lecture.
- **Localisation** : pour déclencheurs géolocalisés (optionnel).
- **URL** : pour appeler le bridge.
- **Réseau local** : obligatoire pour ping le bridge.

## Structure type d'un Raccourci

```
1. Obtenir la variable "bridge_url" depuis iCloud Keychain
2. Si "bridge_url" vide → Afficher erreur "Appairer d'abord"
3. Sinon :
   a. Appeler URL : GET {bridge_url}/macro/<name>?token={bridge_token}
   b. Déclencher scène HomeKit correspondante
   c. Afficher toast de confirmation
4. Renvoyer callback x-success à la PWA
```

## Callback x-callback-url

Tous les Raccourcis iRemoteHub supportent :
- `x-success=iremotehub://done?macro=<name>` → renvoie vers la PWA avec confirmation.
- `x-error=iremotehub://error?msg=<msg>` → PWA affiche toast d'erreur.

## Liste des Raccourcis

| Fichier | Nom Raccourci | Usage |
|---------|---------------|-------|
| `TOUT-ETEINDRE.md` | iRemoteHub - Tout éteindre | Off tous appareils |
| `FAIRE-SONNER-IPHONE.md` | iRemoteHub - Faire sonner | Find My son max |
| `SOIREE-CINE.md` | iRemoteHub - Soirée ciné | Ambiance cinéma |
| `PANIQUE-SILENCE.md` | iRemoteHub - Panique Silence | Mute all |
| `REVEIL-MATIN.md` | iRemoteHub - Réveil matin | Scène matin + musique |
| `APPAIRER-BRIDGE.md` | iRemoteHub - Appairer bridge | Config URL + token |
