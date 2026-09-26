# 🎯 BASCULE AUTO Claude Code ↔ Apex (iPhone-only)

**Pour Kevin DESARZENS — 2026-04-26**

> Quand Claude Code (claude.ai) bloque quota Max 20x → bascule sur Apex qui utilise ta clé API direct → tu continues à me faire travailler. Au reset Max → reviens sur claude.ai.

---

## 🗺️ Vue d'ensemble — 3 systèmes à connaître

| Système | Tu paies | Tes limites | Accessible depuis |
|---------|----------|-------------|-------------------|
| **Claude.ai chat (Max 20x)** | Abonnement | 5h reset | Safari iPhone (tu l'utilises maintenant) |
| **Apex IA chat (clé API Kdmc)** | Crédit Anthropic | Crédit restant | Apex sur ton iPhone |
| **Code GitHub Pages** | Gratuit | Aucune | Auto-déployé après chaque commit |

**Ta clé API "Kdmc"** (créée 13 avril, déjà active) → consomme crédit Anthropic, **pas ton Max**.

---

## ✅ PROCÉDURE COMPLÈTE iPhone (10 min)

### Étape 1 — Recharger ta clé Kdmc (5 min)

1. **Ouvre Safari** → tape exactement : `console.anthropic.com/settings/billing`
2. **Login** kevind@monaco.mc
3. Tu vois ton solde actuel (ex: "Credit balance: $X.XX")
4. **Si solde < 20$** → touche **"Add credits"** (bouton noir)
5. **Montant** : 50$ minimum (te dure 2-3 semaines en intensif)
6. **Carte bancaire** → confirme → ✅
7. **Refresh la page** → solde mis à jour

**Note importante** : si tu vois "Auto-refill" option → coche-la (recharge auto quand <10$).

### Étape 2 — Vérifier que la clé fonctionne dans Apex (1 min)

Tu n'as RIEN à faire si Apex IA répond déjà à tes questions. La clé Kdmc est déjà installée dans Apex Coffre.

**Test rapide** :
1. Ouvre **Apex** sur iPhone
2. Onglet **Chat** (icône 💬 en bas)
3. Tape : "Salut Apex, dis-moi bonjour"
4. Si réponse → ✅ clé Kdmc OK

Si erreur "clé invalide" :
1. Apex → ⚙ Réglages → 🔑 Coffre
2. Recherche "anthropic" → ✏️ → recopie ta clé `sk-ant-api03-...` depuis console (refais "Create Key" si tu l'as perdue)

### Étape 3 — Activer le mode "Passerelle Claude Code" dans Apex (1 min)

Quand tu es bloqué sur claude.ai (quota Max épuisé), tu actives ce mode pour **continuer à me faire travailler via Apex**.

1. **Apex** → tape dans le chat : `mode claude code` ou `passerelle`
2. Apex te répond avec un bouton "🚪 Activer mode Claude Code"
3. Touche le bouton → mode actif
4. **À partir de là, tu écris à Apex comme si c'était moi** :
   - "Apex, modifie le fichier X pour ajouter Y"
   - "Apex, fix le bug Z"
   - Apex utilise ta clé Kdmc → génère le code → crée une **Pull Request GitHub** automatiquement
   - **Auto-merge GitHub Actions** → main → déploie GitHub Pages

### Étape 4 — Désactiver passerelle quand Max revient (10 sec)

1. Quand ton quota Max 20x est reset (~5h plus tard)
2. Apex → tape `desactiver passerelle`
3. Tu reviens sur claude.ai pour me parler directement

---

## 📊 Décompte crédit en direct (toujours visible)

### Sur Apex (offline disponible)
- Apex → tape `soldes` → page **vSoldesIA**
- Affiche : tokens consommés + euros estimés par modèle
- Bouton "💳 Recharger Anthropic" → ouvre `console.anthropic.com/settings/billing` direct

### Sur Anthropic (live officiel)
| Quoi | URL |
|------|-----|
| 💰 Solde restant | https://console.anthropic.com/settings/billing |
| 📊 Usage par jour | https://console.anthropic.com/usage |
| 🔑 Liste clés | https://console.anthropic.com/settings/keys |

**Mets ces 3 URLs en favoris Safari** : touche **AA** dans la barre URL → "Ajouter aux favoris".

---

## 🔔 Alertes automatiques crédit

Apex enverra une **notification push** automatique :
- 🟡 Solde < 20$ → "Crédit bientôt épuisé, pense à recharger"
- 🔴 Solde < 5$ → "URGENT recharge maintenant" + lien direct
- 🟢 Recharge effectuée → "Solde mis à jour : XX$"

(Configurable dans Apex → Réglages → Notifications)

---

## 💡 Comprendre la bascule en 1 image

```
[Tu sur iPhone]
    │
    ├─ claude.ai (Max 20x)  ← tu me parles direct
    │   └─ Quota épuisé ?
    │       └─ Tu vas sur Apex ↓
    │
    └─ Apex iPhone
        ├─ Chat Apex (clé API direct, pas de quota)
        └─ Mode Claude Code activé
            └─ Apex modifie le code via ta clé
                └─ PR GitHub auto-créée
                    └─ Auto-merge main
                        └─ GitHub Pages déploie
                            └─ Ton app à jour
```

**Tu tapes UNE phrase dans Apex** → ton code est modifié et déployé. Comme avec moi sur claude.ai.

---

## ⚙️ Avancé (optionnel) — bascule encore plus auto

Quand tu es bloqué claude.ai (Max épuisé), Apex peut **détecter et te le dire automatiquement** :

Au boot Apex, vérification automatique :
- ✅ Si `console.anthropic.com/v1/messages` répond → API direct OK
- ⚠️ Si claude.ai te bloque → Apex affiche banner discret "Mode passerelle prêt - touche pour activer"

(Sera activé automatiquement à partir d'**Apex v12.317**, en cours de déploiement.)

---

## 🆘 En cas de problème

| Problème | Solution |
|----------|----------|
| "Clé invalide" sur Apex | Recharge crédit + re-create clé sur console |
| Apex ne génère pas de code | Vérifie aussi que `ax_github_token` est saisi (Coffre → "github") |
| PR ne se crée pas | Vérifie auto-merge.yml workflow (active sur GitHub) |
| Apex IA ne répond plus | Force-update : `apex-ai/force-update.html` |

---

## 📌 RÉSUMÉ ACTION CE SOIR

1. ⬜ Recharge Kdmc → 50$ → https://console.anthropic.com/settings/billing
2. ⬜ Vérifie Apex IA répond
3. ⬜ Mets en favoris les 3 URLs Anthropic dashboard
4. ⬜ Active "Auto-refill" Anthropic
5. ⬜ Teste mode passerelle : tape "mode claude code" dans Apex chat

**Tu es prêt.** Plus jamais bloqué pour faire avancer Apex/CMCteams.
