# Apple : être prêt pour l'App Store (1.11.2026)

Écrit pour Kevin, sans jargon. Tout ce qui peut être fait sans toi est fait ou automatisé ; le reste est listé tout en bas.

## Comment ça marche, en 3 étapes
1. **TestFlight** (bêta privée d'Apple) : l'app s'installe sur ton iPhone comme une vraie app. Pas de validation longue : Apple fait un contrôle automatique de quelques heures.
2. **Vérification Apple** (« App Review ») : un humain chez Apple teste l'app, en général sous 24 à 48 h. Elle est acceptée ou refusée avec une raison écrite.
3. **Publication** : publique (tout le monde) ou **non listée** (uniquement par lien, idéal pour les outils internes comme CMCteams qui ne concernent que les employés).

## Ce qui est prêt
- Compte Apple Developer : contrat signé, équipe `Y45767LAGC`.
- Clé App Store Connect posée en secret (identifiant `D82YN6DW39`).
- Chaîne de fabrication : `mobile/apps.json` décrit les apps (CMCteams, Apex Chat, Lingua) ; le workflow `ios-testflight.yml` fabrique l'app, la **signe automatiquement avec la clé** (Apple crée certificat et profil tout seul) et l'envoie. Bouton seulement, jamais dans ton dos (un build Mac coûte 10× un build normal).
- Vérificateur gratuit : le workflow `apple-pret.yml` (un clic, rien ne change chez Apple) dit si la clé marche, et quelles apps / certificats Apple connaît déjà.
- Pages obligatoires en ligne : confidentialité, conditions (CGU), support, mentions légales.
- Suppression de compte dans l'app : exigée par Apple (règle 5.1.1), déjà présente (« Supprimer mon compte »).

## Ce qu'Apple regarde (et nos réponses)
| Règle Apple | Risque | Notre réponse |
|---|---|---|
| 4.2 « pas une simple coquille de site » | refus fréquent des apps web | le contenu est embarqué, l'app marche hors ligne |
| 5.1.1 politique de confidentialité + suppression de compte | refus si absente | pages en ligne + suppression présente |
| 2.1 compte de démonstration | refus si le testeur d'Apple ne peut pas entrer | il faut un compte de démo prêt (voir « Reste ») |
| 4.8 « Se connecter avec Apple » | exigé seulement si on propose Google/Facebook | notre connexion est par nom + code : non concernée |
| 1.2 contenus d'utilisateurs | messages entre personnes : signalement + blocage | à vérifier avant l'envoi d'Apex Chat |
| 5.3 jeux d'argent | refus si mises réelles | CMCteams est un planning, pas un jeu : à préciser dans la note de revue |

## Reste (ce qui demande toi, dans cet ordre)
1. **Dire quelle app en premier.** Recommandation : **CMCteams en distribution non listée** (outil interne, moins de risques) ou **Lingua** (public, simple).
2. **Issuer ID** : identifiant (pas un mot de passe) lisible dans App Store Connect → Utilisateurs et accès → Intégrations. Il manque peut-être en secret (`APPSTORE_API_ISSUER`) : le vérificateur le dit en un clic.
3. **Créer la fiche de l'app** dans App Store Connect (nom, identifiant d'app `com.kdmc.…`, langue) : une fois, 5 minutes ; possible depuis le Lenovo.
4. **Compte de démonstration** pour le testeur d'Apple (nom + code) : je le prépare et je l'efface après.
5. Captures d'écran (iPhone 6,7 pouces) : prises automatiquement par nos robots quand l'app est choisie.

## Ordre des opérations le jour J
`apple-pret.yml` (la clé marche ?) → `ios-testflight.yml` sans envoi (ça compile ?) → avec envoi (TestFlight) → test sur ton iPhone → soumission à Apple.
