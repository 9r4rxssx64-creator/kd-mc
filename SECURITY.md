# Signaler un problème de sécurité

Ce dépôt est **public** : n'importe qui peut en lire le code. C'est voulu — le
code se lit, les **données**, elles, ne se lisent pas.

## Vous avez trouvé quelque chose ?

Merci. Écrivez à **kevin.desarzens@gmail.com**, avec :

- l'adresse concernée (page, worker, dépôt…) ;
- ce que vous avez pu faire, et comment le reproduire ;
- ce que ça permettrait à quelqu'un de mal intentionné.

**Merci de ne pas ouvrir d'issue publique** pour une faille : le temps qu'elle
soit corrigée, elle serait lisible par tout le monde.

Réponse sous quelques jours. Il n'y a pas de programme de récompense : c'est un
projet personnel, pas une entreprise.

## Ce qui est public **exprès**, et n'est donc pas une faille

- **La clé Firebase Web** (`AIzaSy…`) dans les pages. Elle est publique **par
  conception** : elle identifie le projet, elle n'autorise rien. L'accès est
  contrôlé par les règles Firebase côté serveur. La signaler comme « clé
  exposée » est un faux positif classique des scanners.
- **Les noms des secrets** dans les workflows (`${{ secrets.X }}`). Ce sont des
  noms, jamais des valeurs.
- **Le code des applications**, y compris celui du domaine `kd-mc.com`.

## Ce qui, en revanche, nous intéresse vraiment

- une **vraie clé** (jeton, mot de passe, clé privée) trouvée dans le dépôt ou
  dans son historique ;
- un moyen de **lire ou modifier des données** sans y avoir droit (planning des
  employés, arbre familial, comptes du domaine) ;
- un moyen de **faire tourner nos automatisations ou nos clés payantes** sans
  être le propriétaire du dépôt ;
- une page qui **publie des données personnelles** sans qu'on l'ait voulu.

## Ce qui est déjà en place, et vérifié automatiquement

| Contrôle | Ce qu'il empêche | Lancé par |
|---|---|---|
| `npm run test:depot-public-sain` | `pull_request_target`, action tierce sur branche mouvante, clé payante déclenchable par un inconnu, nouvelle chaîne en forme de secret | à chaque `test:ci` |
| `npm run test:documents-travail` | que le site publié serve des documents de travail (noms, dates de naissance) | à chaque `test:ci` |
| `npm run test:secret-jamais-persiste` | qu'un jeton finisse écrit sur le disque ou dans `.git/config` | à chaque `test:ci` |
| `npm run test:actions-conformes` | qu'une automatisation reparte toute seule à heure fixe | à chaque `test:ci` |
| `npm run test:no-pin-leak` | qu'un code admin apparaisse en clair **ou en empreinte** dans une page servie ou un document | à chaque `test:ci` |
| `npm run test:departs-pin` | qu'une page compare un code admin elle-même au lieu de le faire vérifier par le domaine | à chaque `test:ci` |
| `security-suite.yml` | secrets dans l'historique (gitleaks, TruffleHog), dépendances (OSV, Trivy), injections (Semgrep) | à la demande |
| audit d'exposition | ce qu'un inconnu peut réellement lire sur le site | **après chaque publication** de kd-mc.com |
