# 📨 Seconde demande à GitHub — texte prêt à envoyer

**▶️ [Formulaire de réactivation](https://support.github.com/contact/reinstatement)**
*(ou répondre directement au courriel du support, il reste dans le même dossier)*

---

## Pourquoi une seconde demande a du sens

Ta première demande passait par « Sign-in issues → I can't sign in ». GitHub a
donc répondu à une question de connexion, sans savoir que tu comptais corriger
quoi que ce soit.

Cette fois, trois choses changent :

1. **On connaît la raison** — ils l'ont écrite : Actions utilisé pour appeler des
   services tiers et faire du calcul général.
2. **C'est déjà corrigé**, pas promis : 97 exécutions automatiques par jour → 0,
   et 42 workflows retirés.
3. Ce n'est plus une **contestation** (« je n'ai rien fait ») mais une **demande
   de réactivation** (« j'ai compris, j'ai corrigé »). Leur propre politique
   distingue les deux et traite la seconde différemment.

**Sois honnête sur tes chances** : ils ont dit non une fois. Ça peut rester non.
C'est pour ça que la sortie Cloudflare est prête en parallèle — celle-là ne
dépend de personne.

---

## Le texte (à copier tel quel)

```
Hello,

Thank you for the explanation — it was genuinely useful, and I want to say
upfront that you were right.

I had accumulated GitHub Actions workflows that were not building or testing
my code. They were calling third-party services on a schedule: uptime checks
on my own website, image generation, health checks against APIs, backups, and
similar tasks. That is general computing, and it is not what Actions is for.
I had not realised how far it had drifted.

I have already fixed it, before writing to you. Measured, in my repository:

  - Scheduled runs:            ~97 per day  ->  0
  - Workflows with a schedule: 51           ->  0
  - Workflows that only called third-party services: 44 -> 0
    (moved out of .github/workflows/, they no longer run)
  - Workflows remaining:       168          ->  126, all of them building,
                               testing or deploying this repository's own code

I also added an automated check that fails the build if any scheduled trigger
or third-party-only workflow is ever reintroduced, so this cannot drift back.

This is a personal account. The repository holds a staff-scheduling tool I
wrote for my workplace, a few small web tools, and a personal website served
through GitHub Pages. It is not commercial, and nothing is aimed at other
users or at gaming any incentive system.

I am asking for reinstatement, not disputing the decision. If there is any
remaining limit you would like me to respect, please tell me and I will
comply. If there is anything else in the account that concerned you, I would
genuinely like to know so I can fix that too.

Thank you for reconsidering.
```

---

## Deux conseils

- **N'envoie qu'une fois.** Relancer plusieurs fois ralentit le traitement.
- **Ne crée surtout pas un autre compte** en attendant. Contourner une
  suspension transforme une sanction temporaire en bannissement définitif.

## Si la réponse est encore non

Rien n'est bloqué : tes sites tournent sur Cloudflare, ton code part sur GitLab,
et l'historique complet est dans la sauvegarde que tu as déjà. GitHub redevient
alors une simple option, plus une dépendance.
