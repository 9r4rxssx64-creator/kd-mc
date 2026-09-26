---
name: apex-domain-journal
description: « Qui se connecte » — le journal des personnes du domaine kd-mc.com (admin.kd-mc.com) : source unique des connexions, règle « un compte par personne », robots exclus, vie privée. À charger dès qu'on parle connexions, historique de quelqu'un, appareils, lieux, comptes en double, ou qu'on touche au routeur kdmc-router.
when_to_use: Auto. Kevin demande « qui s'est connecté », « l'historique de X », « les comptes en double », « d'où vient cette connexion », ou une action touche les fiches/comptes/connexions.
model: sonnet
allowed_tools: [read_repo_file, search_repo_code]
---

# Qui se connecte (parité Claude Code)

## La donnée EXISTE DÉJÀ — ne jamais en recréer une (leçon #164)

Le **routeur** `services/kdmc-router/` (qui sert kd-mc.com et TOUS les sous-domaines) enregistre
déjà chaque visite par personne dans le KV `ACCOUNTS` : `hits`, `history[]` (app, durée, lieu,
appareil), `devices`, `places`, `apps`, `last_*`, `hours`. **C'est la source unique.**
`services/kdmc-access/` sert la page admin et reçoit les **actions** des apps (`POST /log`).
La page fusionne les deux. Avant d'ajouter un stockage : chercher `hits`/`history`/`last_seen`, et
regarder ce que Kevin voit à l'écran — « ma base est vide » ne prouve jamais « la donnée n'existe pas ».

## Un compte par personne (règle absolue de Kevin)

- Annuaire `nm:<prénom nom>` → **un seul dossier** par personne ; **exige 2 mots** (un prénom seul
  ne regroupe rien).
- La fusion est **datée** (`merged_at`, re-passage ≤1×/semaine), **jamais « une seule fois »** :
  sinon un doublon né plus tard n'est jamais absorbé (vécu : 196 + 116 connexions au même nom, #166).
- **Identité stricte** : nom de famille **ET** prénom/initiale. Un patronyme partagé n'identifie
  personne (« Ronan Desarzens » ≠ Kevin).
- ⚠️ **Une fusion à tort ne se défait pas** (la fiche source devient un renvoi) → strict par défaut.

## Vie privée (non négociable)

Métadonnées seulement : qui, quand, quelle app, quel appareil, quelle ville, combien de temps.
**Jamais** de contenu (message, planning), jamais d'e-mail ni de jeton dans une réponse.

## Pièges

Robots de test ≠ personnes (« CI Smoke », « Vérification automatique ») · deux comptes du même nom
s'**additionnent** · « Oslo, NO » chez Kevin = **iCloud Private Relay**, pas une intrusion · une app
peut « envoyer » sans que ça passe si sa **CSP** n'autorise pas `admin.kd-mc.com`.

Version longue (côté Claude Code) : `.claude/skills/domain-journal/SKILL.md`.
