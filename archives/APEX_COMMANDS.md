# 📒 APEX — Mode d'emploi des commandes du chat

> **Pour Kevin.** Toutes les commandes utilisables dans le chat Apex.
> Mis à jour v13.4.252 — **63 commandes**.

## Comment ça marche

- Dans le chat Apex, **tape `/`** au début d'un message → la liste s'affiche (autocomplete).
- Tape les premières lettres pour filtrer : `/v` → `vault`, `video`, `voice`, `version`…
- **`/help`** affiche la liste complète à tout moment.
- Une commande = une ligne. Certaines prennent un argument (ex : `/search facture`).

---

## 💬 Conversation & chat

| Commande | Rôle | Utilisation |
|----------|------|-------------|
| `/help` | Affiche la liste de toutes les commandes | `/help` |
| `/clear` | Efface la conversation en cours | `/clear` |
| `/fork` | Démarre une nouvelle conversation à partir d'ici (garde le contexte) | `/fork` |
| `/regen` | Régénère la dernière réponse d'Apex | `/regen` |
| `/copy` | Copie la dernière réponse d'Apex dans le presse-papier | `/copy` |
| `/search` | Cherche un mot dans la conversation | `/search <mot-clé>` |
| `/export` | Exporte la conversation en fichier Markdown | `/export` |
| `/voice` | Active/désactive la lecture vocale automatique des réponses | `/voice` |
| `/snippets` | Liste les bouts de code sauvés dans le Coffre | `/snippets` |

## 📟 Infos & état

| Commande | Rôle | Utilisation |
|----------|------|-------------|
| `/version` | Affiche la version d'Apex | `/version` |
| `/statusline` | État synthétique d'Apex : version, réseau, boucle autonome, nb de messages | `/statusline` |
| `/rules` | Affiche les règles permanentes d'Apex (filtre optionnel) | `/rules` ou `/rules sécurité` |

## 🔍 Audit & diagnostic *(admin)*

| Commande | Rôle | Utilisation |
|----------|------|-------------|
| `/ultrareview` | Audit complet d'Apex sur 8 axes, mode brutal → score /100. Alias : `/ultra-review`, `/audit`, `/review`, `/ultra` | `/ultrareview` |
| `/diag` | Diagnostic runtime : santé live d'Apex (checks OK / échec) | `/diag` |
| `/test` | Lance les auto-tests runtime (réussis / échoués / ignorés) | `/test` |

## 🤖 Planification & autonomie

| Commande | Rôle | Utilisation |
|----------|------|-------------|
| `/plan` | Génère un plan structuré avant d'exécuter un objectif | `/plan <objectif>` |
| `/ooda` | Analyse un objectif selon la méthode OODA (Observe → Orient → Decide → Act) | `/ooda <objectif>` |
| `/loop` | File de tâches autonomes en boucle : ajoute, liste, met en pause… Alias : `/schedule` n'est PAS lié (voir Navigation) | `/loop <tâche>` · `/loop list` · `/loop pause` · `/loop resume` · `/loop clear` |
| `/autonomous` | Mode autonome : Apex travaille seul jusqu'à la fin ou le quota. Alias : `/auto`, `/autonome` | `/autonomous <objectif>` · `/autonomous status` · `/autonomous stop` |
| `/resume` | Reprend la boucle autonome qui était en pause | `/resume` |

## 🧭 Navigation — sections principales

> Ces commandes ouvrent directement une section d'Apex.

| Commande | Ouvre… |
|----------|--------|
| `/settings` | Les réglages |
| `/vault` | Le Coffre (clés API, secrets, mots de passe) |
| `/dashboard` | Le tableau de bord |
| `/notes` | Les notes |
| `/calendar` · `/schedule` | L'agenda / calendrier |
| `/legal` | Le module juridique |
| `/browser` · `/chrome` | Le navigateur intégré (Apex Chrome). Alias : `/claude-chrome` |
| `/crypto` | Le module crypto |
| `/calc` | Les calculatrices |
| `/knowledge` | La base de connaissances |
| `/sentinels` | Les sentinelles (agents de surveillance) |
| `/billing` | L'abonnement / facturation |
| `/studios` | Le hub des studios créatifs |
| `/remote` · `/remote-control` | La télécommande universelle |
| `/domotique` | La domotique (maison connectée) |
| `/geo` | La géolocalisation |
| `/workflow` | Les workflows |
| `/marketplace` | La marketplace |
| `/plugins` | Les plugins |
| `/archive` | Les archives |
| `/pro` | L'espace pro |
| `/toolbox` | La boîte à outils Apex |
| `/mcp` | Les serveurs MCP |
| `/innovation` | La veille innovation |
| `/iot` | Les fournisseurs IoT |
| `/device` | Les appareils connectés |
| `/voicebio` | La biométrie vocale |
| `/smartrouter` | Le routeur IA intelligent |
| `/team-onboarding` | L'accueil / onboarding équipe |
| `/skill-creator` | Le catalogue des skills Apex 2026 |

## 🎨 Navigation — studios créatifs

| Commande | Ouvre le studio… |
|----------|------------------|
| `/music` | Musique |
| `/video` | Vidéo |
| `/photo` | Photo |
| `/cv` | CV |
| `/facture` | Facture / devis |
| `/logo` | Logo |
| `/scan` | Scan / OCR |
| `/pdf` | PDF |
| `/prefecture` | Dossier préfecture |
| `/presentation` | Présentation |

---

## ⚠️ Commande demandée mais en attente de précision

- **`/l99`** — sens inconnu. Dis-moi ce qu'elle doit déclencher et je la câble.
- `/rename` — abandonnée (décision Kevin, non ajoutée).

---

## 🛠 Pour les développeurs (où est le code)

- Définition des commandes : `apex-ai/v13/services/admin/slash-commands.ts`
  (tableau `SLASH_COMMANDS`).
- Exécution : `apex-ai/v13/features/chat/index.ts` (fonction de dispatch
  `switch (cmd.name)` + handlers `handle*Command`).
- Ajouter une commande de **navigation** : une ligne dans `SLASH_COMMANDS`
  avec un champ `route` → aucun code supplémentaire (handler générique).
- Ajouter une commande **d'action** : une ligne dans `SLASH_COMMANDS` +
  un `case` + une fonction `handle<Nom>Command`.
