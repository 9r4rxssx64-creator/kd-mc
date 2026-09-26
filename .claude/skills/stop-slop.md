---
name: stop-slop
description: Détecte et supprime les "AI tells" — tournures robotiques prévisibles qui trahissent un texte généré par IA. Rend la prose naturelle, humaine, directe.
when_to_use: Avant publication de tout texte généré (réponse client, email, doc, post, copy marketing) — Apex Chat, CMCteams, e-KDMC. Quand Kevin dit "ça fait IA", "rends ça naturel", "stop slop".
model: sonnet
allowed_tools: [Read, Edit, Grep]
---

# Skill : stop-slop

## Mission

Éliminer les **AI tells** : les patterns d'écriture prévisibles qui font qu'un
texte « sonne IA ». Référence concept : github.com/hardikpandya/stop-slop +
MCP Market « Stop Slop ». L'objectif est une prose **humaine, directe, sans
tics** — niveau rédacteur pro, pas niveau chatbot.

S'applique à tout texte sortant des projets Kevin : réponses Apex IA, emails
EmailJS, contenus e-KDMC, copy marketing, messages clients.

## Les AI tells à traquer (et supprimer)

### 1. Vocabulaire sur-utilisé par les LLM
- `delve`, `intricate`, `tapestry`, `realm`, `landscape`, `testament`,
  `navigate` (au figuré), `leverage`, `robust`, `seamless`, `crucial`,
  `vibrant`, `bustling`, `meticulous`, `elevate`, `unlock`, `harness`
- FR : `plonger au cœur de`, `riche`, `il est important de noter`,
  `force est de constater`, `dans le paysage de`, `véritable`

### 2. Structures formulaïques
- **« Ce n'est pas seulement X, c'est Y »** (`not just X, but Y`) — bannir
- **Triades** systématiques : « rapide, fiable et sécurisé » (3 adjectifs)
- **« En conclusion »**, « Pour résumer », « En somme » en fin de texte
- Phrase d'intro qui reformule la question avant de répondre
- Listes à puces là où 2 phrases suffisent

### 3. Tics de ponctuation / rythme
- Em-dash (—) en excès
- Phrases toutes de même longueur (rythme robotique)
- Parallélisme excessif (« On fait X. On fait Y. On fait Z. »)

### 4. Méta-langage / hedging
- « Il convient de », « Il est essentiel de comprendre que »
- « En tant qu'assistant IA… »
- Disclaimers inutiles, sur-prudence

### 5. Enthousiasme creux
- « Excellente question ! », « Avec plaisir ! », « Absolument ! »
- Exclamations marketing : « Découvrez ! », « Transformez ! »

## Méthode (3 passes)

1. **Scan** : repérer chaque tell ci-dessus dans le texte.
2. **Réécriture** : remplacer par une formulation directe, variée en rythme,
   sans tic. Couper le superflu. Phrases de longueurs différentes.
3. **Test mental** : « Un humain pressé et compétent écrirait-il ça ? Ou est-ce
   que ça sent le chatbot ? » Si ça sent l'IA → re-passer.

## Anti-patterns à NE PAS faire

- ❌ Sur-corriger jusqu'à rendre le texte sec/froid — garder le naturel
- ❌ Supprimer une triade légitime (parfois 3 items c'est juste la réalité)
- ❌ Bannir le mot « important » s'il est vraiment le bon mot
- ✅ Objectif : naturel, pas « anti-IA militant »

## Intégration Apex

Apex IA applique stop-slop en post-traitement avant d'afficher une réponse
longue (email, doc, copy). Toggle Réglages « Style naturel » (ON par défaut).
Le system prompt Apex inclut un rappel court : « écris naturel, pas de tells ».

## Test mental obligatoire

> *« Si je lis ce texte sans savoir qu'une IA l'a écrit, est-ce que je devine
> quand même que c'est une IA ? Si oui → il reste des tells, reprendre. »*
