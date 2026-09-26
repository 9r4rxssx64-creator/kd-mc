# ⛔ Workflows désactivés — 15/08/2026

Ces workflows **ne s'exécutent plus**. GitHub ne lit que `.github/workflows/`,
donc les déplacer ici suffit à les éteindre. **Rien n'est supprimé** : il suffit
de remettre un fichier dans `.github/workflows/` pour le réactiver.

## Pourquoi

Le compte GitHub de Kevin a été **suspendu**, et le support a refusé de lever la
restriction. Raison donnée mot pour mot :

> *any repositories that use GitHub Actions solely to interact with 3rd party websites, to engage in incentivized activities, or for general computing purposes may fall afoul of the GitHub Additional Product Terms*

(Citation reproduite **sur une seule ligne et sans mise en forme**, pour rester
exactement le texte reçu — un test vérifie qu'on ne l'a pas reformulée.)

Ces workflows correspondaient exactement à cette description. *(Le chiffre « 42 » longtemps cité n'est pas vérifiable : le dossier contient **35** `.yml` au 6.09.2026, dont **6** ajoutés le 5.09 pour le crypto-bot → **29** issus du déplacement du 15/08. Tout le dossier ayant été ajouté en un seul commit, l'historique ne permet pas de trancher.)* : génération
d'images (Replicate, OpenAI), surveillance de sites, pilotage de Railway et
Vercel, sauvegardes Firebase et Cloudflare KV, bulletins d'actualité, photos
Pexels, alertes sismiques… Aucun ne construisait ni ne testait le code du dépôt.

En plus de ça, **toutes** les exécutions programmées (cron) ont été retirées des
workflows restants : on est passé d'environ **97 exécutions par jour à 0**.

## La règle à tenir désormais

GitHub Actions sert à **construire, tester et déployer le code de ce dépôt**.
Rien d'autre.

- ✅ compiler, lancer les tests, publier le site, déployer un Worker
- ❌ appeler des APIs tierces en boucle, surveiller des sites, générer des
  images, faire tourner un robot, sauvegarder autre chose que ce dépôt

Ce qui a besoin de tourner régulièrement doit vivre **ailleurs** : un Cloudflare
Worker avec son propre déclencheur horaire, ou une machine à soi.

**Ne remettez pas de `cron:` dans ce dépôt.** Un test l'empêche désormais.

---

## 5.09.2026 — les 6 workflows du bot crypto sont rangés ici, pas perdus

En unifiant les deux lignées, j'ai constaté que `crypto-bot-analysis`,
`crypto-bot-deploy`, `crypto-bot-fleet-deploy`, `crypto-bot-research`,
`crypto-bot-status` et `crypto-bot-verify` avaient été **supprimés** de GitHub le
2.09 pour la conformité — et que leur **seule copie survivante** était la branche
`main` de GitLab, restée à l'état d'avant la suspension.

Les effacer en synchronisant les deux dépôts les aurait perdus définitivement.
Ils sont donc rangés ici, **intacts et inertes** : GitHub n'exécute que
`.github/workflows/`, et la garde `test:actions-conformes` n'inspecte que ce
dossier-là. Le projet `crypto-bot/` lui-même vit toujours dans le dépôt.

**Ils ne doivent PAS revenir dans `.github/workflows/`** : les conditions
d'utilisation de GitHub nomment explicitement le « Cryptomining » parmi les
usages interdits d'Actions. Leur foyer, si le bot doit être redéployé un jour,
est **GitLab CI** ou un **Cloudflare Worker** (voir `ORGANISATION.md`).
