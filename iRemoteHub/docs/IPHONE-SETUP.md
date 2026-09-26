# iPhone — Setup

Sur iPhone, Safari limite certaines APIs. On compense avec **Raccourcis Apple** pour accéder à HomeKit, AirPlay, Find My, Apple Music, et toutes les intégrations natives.

## 1. Installer la PWA

1. Ouvrir **Safari** (pas Chrome iOS — il ne permet pas l'install PWA).
2. Aller sur l'URL GitHub Pages de iRemoteHub.
3. Bouton **Partager** → **Sur l'écran d'accueil**.
4. L'icône iRemoteHub apparaît, lancement plein écran sans barre Safari.

## 2. Importer les Raccourcis Apple

Chaque fichier `shortcuts/*.md` contient le lien iCloud d'un Raccourci prêt à l'emploi.

### Raccourcis livrés

| Nom | Rôle |
|-----|------|
| `iRemoteHub - Tout éteindre` | Appelle le bridge `/macro/all-off` ET déclenche la scène HomeKit "Au revoir" |
| `iRemoteHub - Faire sonner mon iPhone` | Find My avec son max |
| `iRemoteHub - Soirée ciné` | HomeKit + Apple Music + Apple TV input HDMI |
| `iRemoteHub - Panique Silence` | Mute toutes les enceintes détectées |
| `iRemoteHub - Appairer bridge` | Ajoute l'URL/token du bridge dans Keychain |

### Procédure d'import

1. Ouvrir le lien `.shortcut` partagé (iCloud) sur l'iPhone.
2. Tap **Obtenir le raccourci** → Ajouter à la bibliothèque.
3. Autoriser les permissions demandées (HomeKit, Musique, Localisation, URL).

## 3. Appeler un Raccourci depuis la PWA

La PWA utilise le schema iOS :
```
shortcuts://x-callback-url/run-shortcut?name=iRemoteHub%20-%20Tout%20%C3%A9teindre&x-success=iremotehub://done
```

## 4. Intégration HomeKit

Les Raccourcis accèdent à HomeKit via l'action **"Définir la scène"**. iRemoteHub suggère des scènes préconfigurées :
- `Tout allumer`, `Tout éteindre`, `Nuit`, `Matin`, `Au revoir`, `Soirée ciné`.

Créer ces scènes dans **Maison.app** avant usage.

## 5. Widget écran verrouillé (iOS 16+)

- Modifier l'écran d'accueil → Widgets → Raccourcis → choisir `iRemoteHub - Tout éteindre`.
- Déclenchement en 1 tap depuis le lock screen.

## 6. Apple Watch

Chaque Raccourci est disponible sur Apple Watch (app Raccourcis watchOS) + complication sur cadran.

## 7. Bluefy (optionnel)

Pour scanner en Bluetooth LE depuis iPhone (Safari n'a pas Web Bluetooth) :
- Installer **Bluefy - Web BLE Browser** (App Store, gratuit).
- Ouvrir iRemoteHub dans Bluefy pour les scans BLE.
