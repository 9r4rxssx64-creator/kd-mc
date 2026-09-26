# 📱 KEVIN_DEVICE_STATE — Mémoire persistante de l'iPhone Kevin

**Dernière mise à jour** : 2026-05-16

Ce fichier est lu PAR CLAUDE et PAR APEX au boot pour ne PAS redemander à Kevin
ce qu'il a déjà confirmé. NE JAMAIS redemander une info marquée ✅.

---

## Configuration iOS confirmée par Kevin

| Réglage iPhone | Valeur | Confirmé |
|---|---|---|
| Accessibilité → Zoom | OFF | ✅ 2026-05-16 ("Non pas de zoom dans mon iPhone accessibilité") |
| Affichage → Texte plus grand (Dynamic Type) | défaut (slider milieu) | ✅ 2026-05-16 ("Pas de zoom ni de dynamic") |
| Affichage → Zoom de l'écran | Standard | ✅ 2026-05-16 |
| Safari → Demander site bureau | OFF (présumé, à confirmer) | ⏳ |
| Safari → AA → Taille texte | 100% (présumé) | ⏳ |

**→ Donc tout problème de "zoom" perçu dans Apex N'EST PAS device-level iOS.
Cause = code Apex OU version stale.**

---

## État Apex sur iPhone Kevin

| Info | Valeur | Source |
|---|---|---|
| Dernière version OBSERVÉE sur son iPhone | **v13.4.99** | Screenshot toast Diagnostic 2026-05-16 15h53 |
| Dernière version PUSHÉE par Claude | v13.4.189 | git log 2026-05-16 |
| Écart | **+90 versions** | MAJ auto force ne marche pas |
| PWA installée comme icône écran d'accueil | OUI | Présumé (mode standalone) |

**→ Cause probable : SW v13.4.99 cache stale + PWA install bloque rafraîchissement.
Force-update auto que j'ai ajouté en v13.4.188 ne peut PAS aider tant que Kevin
est sur v13.4.99 (catch-22 : il faut être sur v13.4.188+ pour bénéficier du fix).**

---

## Solution nuclear (la seule qui débloque vraiment)

1. **Supprimer l'icône Apex de l'écran d'accueil iPhone**
   - Appui long sur l'icône → "Supprimer l'app"
2. **Vider données Safari pour le site**
   - Réglages → Safari → Avancé → Données de site web
   - Cherche "github.io" → balayer gauche → Effacer
3. **Réinstaller PWA fresh**
   - Safari → https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/?_force_upd_NEW
   - Bouton Partager → "Sur l'écran d'accueil"
   - Ouvre la NOUVELLE icône Apex

---

## Tokens/credentials Kevin

| Provider | Dernière rotation | Statut |
|---|---|---|
| Cloudflare API | 2026-05-16 (après-midi) | ❌ Erreur HTTP 503 "INVALIDE" après rotation. À investiguer. |
| Firebase | (inconnu) | KO selon Diagnostic v13.4.99 |

---

## Préférences communication Kevin

| Sujet | Préférence | Confirmé |
|---|---|---|
| Emails GitHub | Outlook (pas Gmail) | ✅ 2026-05-16 |
| Filtre Outlook GitHub-bot | Pas encore créé | ⏳ Guide fourni dans `tools/reduce-github-emails-guide.md` |
| Fréquence MAJ Apex | Auto-silencieuse toujours (règle ABSOLUE) | ✅ 2026-05-16 |
| Badge version | Visible permanent tous projets | ✅ 2026-05-16 |

---

## RÈGLE POUR CLAUDE — Avant chaque réponse à Kevin

Test mental obligatoire :
> *"Ai-je déjà demandé à Kevin cette info dans la session courante OU sessions
> passées ? Si oui (✅ ici), JAMAIS redemander."*

Si je ne sais pas, je dois CHERCHER dans ce fichier AVANT de redemander.
