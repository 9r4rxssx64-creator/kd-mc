#!/usr/bin/env bash
# Empêche Vercel de déployer — et de FAIRE ÉCHOUER — une branche orpheline.
#
# ── POURQUOI CE FICHIER EXISTE (Kevin 18.09.2026, capture d'un mail Vercel) ───
# Kevin reçoit « Preview deployment failed for kdmc-agent-monaco ». Cause exacte,
# lue dans le journal de build Vercel (pas supposée) :
#
#     The specified Root Directory "tools/agent" does not exist.
#
# Le projet Vercel `kdmc-agent-monaco` a pour dossier racine `tools/agent`. Or les
# branches de relecture (`claude/voir-<run>`, sauvegardes D1) sont ORPHELINES :
# un seul commit, quelques dizaines de fichiers, et RIEN d'autre. Vercel déploie
# toute branche poussée, ne trouve pas son dossier racine, échoue — et un mail
# part chez Kevin. Règle anti-spam : un robot ne remplit pas sa boîte.
#
# L'orphelinat est VOULU et ne doit pas être défait : une branche portant
# `.github/workflows` est refusée à la création par le jeton du job
# (« refusing to allow a GitHub App to create or update workflow », run
# 34601407690). On ne peut donc pas « remettre le dépôt entier » dessus.
#
# ── COMMENT ─────────────────────────────────────────────────────────────────
# Vercel lit sa configuration DANS la branche déployée, au dossier racine du
# projet. On dépose donc `tools/agent/vercel.json` sur la branche orpheline.
# Deux verrous, volontairement redondants :
#   1. `deploymentEnabled: false` → Vercel ne crée aucun déploiement ;
#   2. si un déploiement était malgré tout créé, le dossier `tools/agent/` EXISTE
#      désormais (plus de « Root Directory does not exist ») et `ignoreCommand`
#      sort en 0 → build ignoré proprement. Dans les deux cas : aucun échec,
#      donc aucun mail.
#
# AUCUNE clé en plus (pas de `_note`, pas de commentaire) : le schéma Vercel
# refuse les clés inconnues, et un vercel.json refusé = configuration IGNORÉE,
# c'est-à-dire exactement le problème qu'on corrige (vécu le 6.09 sur ce même
# fichier). Le « pourquoi » vit ici, dans le script, pas dans le JSON.
#
# CE SCRIPT EST PARTAGÉ, ET C'EST LE POINT. La sauvegarde D1 portait déjà ce
# correctif en clair dans son YAML depuis des semaines ; `voir-comme-kevin` ne
# l'a jamais reçu, et c'est LUI qui a fini par écrire à Kevin. Une parade
# recopiée dans un seul workflow ne protège que celui-là : on la met en commun
# pour que le prochain workflow à branche orpheline l'ait par construction.
#
# ── DEUXIÈME CEINTURE, dans `tools/agent/vercel.json` de main ───────────────
# `git.deploymentEnabled` y liste aussi `"claude/voir-*": false` (Vercel accepte
# les motifs minimatch). HONNÊTETÉ : je ne sais PAS si Vercel lit cette clé
# depuis la branche de production ou depuis la branche poussée. Dans le 2e cas
# elle ne sert à rien sur une orpheline (qui ne porte aucune config) — d'où ce
# script, qui lui est certain. Elle ne coûte rien et couvre le 1er cas.
#
# Garde : tests/verify-branches-robot.mjs (câblée dans test:ci).
# Usage : bash tools/vercel/museler-branche-orpheline.sh   (avant `git commit`)
set -eu

CIBLE="tools/agent/vercel.json"   # = dossier racine du projet Vercel kdmc-agent-monaco
mkdir -p "$(dirname "$CIBLE")"
printf '%s\n' '{ "git": { "deploymentEnabled": false }, "ignoreCommand": "exit 0" }' > "$CIBLE"
git add "$CIBLE"

echo "Vercel muselé sur cette branche ($CIBLE)."
