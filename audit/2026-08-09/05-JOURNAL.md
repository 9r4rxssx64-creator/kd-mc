# 05 — JOURNAL, DÉCISIONS & AUTO-CRITIQUE · Audit 2026-08-09

## Mission 1 — « vérifie que toutes tes règles soient respectées automatiquement »

**Réponse mesurée** (`npm run audit:rules`, outil créé pour ça) :

| | Nombre |
|---|---|
| Règles déclarées dans CLAUDE.md (uniques) | **131** (134 titres → **3 doublons**) |
| ✅ Tenues par un garde qui tourne | **28** |
| 🟡 Garde existant mais **hors** de `test:ci` | **10** |
| 🔵 Comportementales (ton, autonomie, méthode) — **non mécanisables** | **74** |
| 🔴 **Mécanisables mais sans aucun garde** = la vraie dette | **19** |
| **Couverture réelle des règles mécanisables** | **67 %** |

**Pourquoi séparer « comportemental »** : dire « 29 % de mes règles sont automatisées » serait alarmiste et faux. On ne peut pas écrire un test qui vérifie « parle simplement » ou « travaille en expert ». Les compter à part rend le chiffre honnête — et la dette restante actionnable.

**Correctif de cause racine** : le ratchet. Si une **nouvelle** règle est ajoutée à CLAUDE.md **sans** garde-fou, `test:improvements-guard` (dans `test:ci`) vire au rouge. Une règle ne peut plus vivre uniquement dans un document.

**Limite honnête** : 4 des 19 entrées 🔴 sont du **bruit d'analyse** (titres mal découpés : « EXTERNE », « CI », « PERMANENTE », « Méthode de travail »). La vraie dette est donc plutôt ~15 règles.

## Décisions prises pendant l'audit

1. **Corrigé** ce qui était sûr et vérifié : fuites du code admin, garantie planning, commentaire de l'arbre, cap de skills Apex.
2. **Pas corrigé à l'aveugle** : les workers **live** (secrets-proxy, crea-famille, worker de commande) et les **règles Firebase**. Raison : je ne peux pas les tester de bout en bout d'ici, et un durcissement raté casse les boutiques ou te verrouille dehors. Ma propre règle le dit : « un correctif architectural/risqué sans preuve = une recommandation, pas un patch aveugle ».
3. **Pas tranché seul** le défaut IA d'Apex : c'est un conflit entre deux de tes consignes, pas une erreur technique.

## Erreur que j'ai commise pendant cet audit (et rattrapée)
En corrigeant la fuite du PIN, **mon propre commentaire de correctif re-citait le PIN en clair**. C'est ma vérification post-correctif qui l'a vu. D'où : le garde `no-admin-pin-leak` cherche **par empreinte** et ne contient pas le code — sinon le test serait lui-même la fuite.

## 🔴 Ce que je n'ai PAS pu vérifier (angles morts déclarés)
- **Si `firebase-rules-apex.json` est bien la version publiée.** Tout le P0-d en dépend. Un simple `GET` sur l'URL de la base tranche en une seconde — mon accès réseau est bridé, je ne peux pas le faire d'ici. **C'est la vérification la plus rentable à faire.**
- **Les valeurs réelles des secrets Cloudflare** (`APEX_ADMIN_PIN_SHA256` posé ou non → le fail-open du P0-a est-il actif ; `COFFRE_PUBLIC_TOKEN` posé ou non).
- **Le CORS réel** de 7 sources de World Monitor (gdacs, celestrak, reddit, tfl, nominatim, georisques, apicarto) : mon egress renvoie 403, aucune sonde fiable.
- **Le rendu réel à 375 px** : les tailles de boutons et de polices sont **calculées depuis le code**, pas observées dans un navigateur.
- **L'exploitabilité effective** des XSS listés : ce sont des points d'injection potentiels ; je n'ai pas tracé chaque donnée jusqu'à une entrée attaquant.
- **Si les workers déployés correspondent au code du dépôt.**

## Auto-critique (obligatoire)
- **Le point le plus faible de cet audit** : il est à **95 % statique**. La passe live CI est verte, mais elle vérifie que les pages *chargent*, pas que chaque bouton fait la bonne chose. Un audit de **comportement** (cliquer réellement dans chaque app, connecté) reste à faire.
- **Ce que je n'ai pas pu vérifier** : voir la liste ci-dessus — surtout les règles Firebase publiées, dont dépend la gravité réelle de 4 findings P0.
- **Ce dont je ne suis pas certain** : la sévérité exacte du P0-a (elle dépend de la longueur réelle de ton PIN et du périmètre du jeton Cloudflare) ; et le fait que `la-detente.kd-mc.com` serve bien le dossier que j'ai audité.
- **Biais assumé** : les findings viennent de 6 sous-agents **et de moi** — tous Claude. Le second avis **non-Claude** (Qodo/GPT via `ai-review-independent.yml`) n'a pas tourné sur ce lot, car ce n'est pas une PR de code applicatif classique. **L'audit reste donc partiellement auto-relu.**
