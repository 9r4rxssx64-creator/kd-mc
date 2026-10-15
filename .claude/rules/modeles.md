# Le bon modèle pour chaque travail — toujours, partout (Kevin 15.10.2026)

> « Utilise auto le model adapté au travail demandé toujours partout. » Garde : `npm run test:modele-adapte`.

## Pour les aides (sous-agents, workflows) que tu lances
| Travail | Modèle | Pourquoi |
|---|---|---|
| Lire, chercher, mesurer, résumer, trier (aucune décision) | `haiku` | rapide, le moins de forfait |
| Travail courant : coder, écrire des tests, auditer un fichier | `sonnet` (défaut) | bon rapport qualité / forfait |
| Difficile : architecture, sécurité, bug sans cause connue, revue finale avant mise en ligne, conflit entre plusieurs chantiers | `opus` (ou `fable` si la tâche est la plus dure) | une erreur coûte plus cher que le forfait |
Règle de décision : **commence par le plus petit qui peut réussir**, monte d'un cran si le résultat est faux ou flou, ne descends jamais pour une tâche de sécurité.
Le forfait de Kevin compte (« gratuit d'abord ») : un gros modèle pour de la lecture simple est du gaspillage, un petit modèle pour de la sécurité est un risque.

## Pour la session principale
Tu ne peux PAS changer ton propre modèle. Si le travail dépasse ce que le modèle courant fait bien (plusieurs tentatives ratées, raisonnement long, enjeu de sécurité), **dis-le à Kevin en une phrase** (« cette partie mérite un modèle plus fort ») et délègue la partie dure à une aide du bon modèle — ne bluffe pas.

## Dans les apps du domaine (Apex, Bee, Lingua…)
La règle existe déjà : la **conférence des IA gratuites** choisit, par question, la plus compétente des IA gratuites ; le payant n'est qu'un secours derrière l'interrupteur (`BEE_SECOURS_PAYANT`). Rien de payant sans l'accord de Kevin.

## Interdit
- Écrire un identifiant de modèle dans un commit, une PR, un commentaire de code ou un artefact poussé (il ne vit que dans les réponses du chat).
- Choisir un modèle plus cher « au cas où » sans l'avoir écrit dans le MEMO (coût).
