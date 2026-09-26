# Sécurité — iRemoteHub

## Modèle de menace

Cette app pilote vos appareils IoT. Un attaquant qui compromet iRemoteHub peut :
- Allumer/éteindre vos lumières, TV, prises.
- Observer vos appareils connectés (fingerprint réseau).
- Injecter des commandes vocales via vos enceintes.

D'où les protections ci-dessous.

## 1. Authentification PWA ↔ Bridge

- Token aléatoire 256 bits généré au premier lancement du bridge.
- Partagé via QR code scanné depuis la PWA en local (jamais sur Internet).
- Stocké côté PWA dans IndexedDB chiffré (chiffrement natif navigateur).
- Tout appel HTTP au bridge doit inclure header `X-Auth-Token: <token>`.

## 2. Réseau local uniquement

- Le bridge refuse les connexions hors du sous-réseau local (vérifié par IP source).
- Aucune exposition Internet — pas de port forwarding, pas de STUN/TURN.
- Si accès distant voulu : utiliser Tailscale / WireGuard (hors scope iRemoteHub).

## 3. Clés API externes

- Anthropic API (Claude) : stockée côté bridge uniquement, jamais envoyée à la PWA.
- Variables d'environnement > fichier config en clair.
- `.gitignore` bannit `config.json` et `auth-token.txt`.

## 4. Respect de la vie privée

- Aucune télémétrie.
- Scan WiFi : cantonné au LAN de l'utilisateur.
- Partage KB communautaire : **opt-in explicite**, données anonymisées (MAC hashés, hostnames tronqués).
- Pas de géolocalisation sauf si nécessaire (HomeKit scènes géorepérées).

## 5. Limites légales claires

- **INTERDIT** : scanner un réseau tiers sans consentement (loi informatique & libertés, CFAA, LPM).
- **INTERDIT** : tenter d'accéder à des appareils d'autres personnes.
- **INTERDIT** : exfiltrer des credentials depuis des appareils scannés.

L'app affiche un avertissement au premier lancement et refuse de scanner si l'utilisateur n'accepte pas les CGU.

## 6. Mise à jour

- La PWA checke GitHub Pages pour une nouvelle version au démarrage.
- Le bridge check `git pull` au démarrage (optionnel, `auto_update: false` par défaut).
- Changelog visible dans l'onglet **À propos**.

## 7. Rapport de vulnérabilité

Ouvrir une issue GitHub privée ou contacter le mainteneur. Divulgation coordonnée 90 jours.

## 8. Hardening recommandé

- WiFi guest séparé pour l'IoT (ne pas mélanger avec PC/smartphones perso).
- Pare-feu local qui bloque le trafic IoT sortant sauf vers le bridge.
- Mots de passe uniques pour Hue/Sonos/TV (pas le mot de passe WiFi).
- Mise à jour régulière des firmwares appareils.
