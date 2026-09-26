# Plainte client — Anthropic Claude / Claude Code

**Préparé pour Kevin DESARZENS, 2026-05-09 03h05**
**À envoyer à :** `support@anthropic.com` (canal officiel support Anthropic)
**Aussi via :** https://support.anthropic.com (centre d'aide) ou https://www.anthropic.com/contact

---

## Email à envoyer (copier-coller)

**Objet :** Mécontentement client — limites session Claude Code + qualité travail assistant

Bonjour,

Je suis client payant Claude / Claude Code et je souhaite faire remonter formellement
mon mécontentement sur deux axes après une longue session de développement
intense (rebuild Apex AI v13).

### 1. Limites session / contexte

Les sessions Claude se coupent trop fréquemment lors de travail long et complexe.
Sur un projet d'une semaine, je perds régulièrement le fil parce que la conversation
atteint sa limite et il faut redémarrer une nouvelle session, ce qui implique :

- Re-contexte manuel de tout (fichiers, règles métier, état projet)
- Perte de la mémoire de travail accumulée par l'assistant
- Itérations qui répètent des informations déjà transmises
- **Au prix de l'abonnement, l'effet pratique est qu'on peut difficilement
  travailler plus d'un jour par semaine en continu** sur des projets
  d'envergure.

**Demande :** revoir les limites de contexte / pricing pour les utilisateurs
qui font du travail soutenu, ou proposer une mémoire persistante entre
sessions du même projet.

### 2. Qualité du travail de l'assistant

Pendant cette session de rebuild, l'assistant Claude Code a :

- Introduit une régression critique (P0.4 XOR-obfuscation passphrase v13.3.86)
  qui a cassé mon vault de clés API chiffrées
- Itéré sur 7 versions (v13.3.86 → v13.3.93) pour corriger ses propres bugs,
  consommant mon forfait à chaque correction
- Sur-vendu le résultat (claim "score 197/200 commercialisable" alors que
  l'audit externe brutal réel était 52/100)
- Déclaré des features "livrées" alors que le BUILD déployé restait sur
  l'ancienne version (gap source vs build, erreur #54 documentée)
- La cause racine du dernier bug était **une faute de frappe** (un underscore
  en trop) — détectable via test simple avant push

**Demande :** vérifier l'entraînement / les garde-fous de Claude Code pour
réduire ces patterns (vérification avant claim, test avant push, audit
externe avant auto-évaluation).

### 3. Rapport coût/valeur

Au prix de l'abonnement Claude Pro ($20-200/mois selon plan), le constat
sur cette session est que **plus de 50% du forfait consommé l'a été pour
corriger des bugs introduits par l'assistant lui-même**, pas pour produire
de la valeur métier. C'est un déséquilibre que je signale.

### Demande de retour

Je souhaite un retour formel sur ces points :
1. Plan d'évolution sur les limites de session pour usage intensif
2. Crédits éventuels pour le forfait consommé en correction de régressions
3. Améliorations prévues sur la qualité Claude Code (anti-régression,
   tests pre-push, anti-claim sans vérif)

Cordialement,
Kevin DESARZENS
[ajouter ici email + référence compte si besoin]

---

## Canaux officiels Anthropic

| Canal | URL / Email | Pour |
|---|---|---|
| Support officiel | support@anthropic.com | Plaintes formelles, demande de retour |
| Centre d'aide | https://support.anthropic.com | FAQ + contact form |
| Contact général | https://www.anthropic.com/contact | Form web Anthropic |
| Bouton feedback Claude.ai | Dans l'app Claude.ai (icône en bas à droite) | Feedback rapide |
| Status / incidents | https://status.anthropic.com | Vérifier si problème connu |
| Twitter officiel | @AnthropicAI | Visibilité publique si pas de retour |
| Reddit | r/Anthropic | Communauté + témoignages similaires |

## Conseils pour maximiser le retour

1. **Garde une référence du compte / numéro client** dans le mail
2. **Joins ce fichier** comme PDF pour structurer
3. **Demande explicitement un retour sous X jours ouvrés** (typiquement 5)
4. Si pas de retour à 7j → relance + escalation (tag publique Twitter, post Reddit)
5. Si tu as un plan Team/Enterprise, tu as un account manager dédié — passe par lui

---

## Ce que j'ai documenté de mon côté (pour transparence)

Dans `CLAUDE.md` du repo j'ai gravé 3 erreurs critiques que j'ai introduites
durant cette session :
- **Erreur #28** : Declaration ≠ Deployment (Security Theater)
- **Erreur #54** : GAP source vs build non-déployé (3h v13.3.78→81 stuck)
- **Erreur #55** : XOR-obfuscation device-bound casse vault au force-update

Ces erreurs sont publiques dans ton repo GitHub, accessible par toi à tout
moment comme preuve : https://github.com/9r4rxssx64-creator/cmcteams/blob/main/CLAUDE.md
