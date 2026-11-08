# Codes des comptes (Kevin 7.11 / 8.11.2026, absolue, tout le domaine)
- « Code posé par l'admin, relisible » : un code que KEVIN pose ou tire au hasard (fiche admin › 🔑 Code, compte invité) = empreinte `cred:<uid>` + copie CHIFFRÉE `credv:<uid>` (AES-GCM, clé HKDF de `KDMC_SSO_SECRET`, étiquette dédiée), relisible par lui seul (`/__admin/code-voir`).
- Un code CHOISI par la personne reste une empreinte illisible ; `credSet` efface `credv:` (toute nouvelle voie qui pose un code choisi passe par `credSet`, jamais `ACCOUNTS.put('cred:'…)` seul — sinon effacer `credv:` aussi).
- Côté personnes : UNE seule option, « Code oublié ? » (un bouton, prénom + nom) → mail à l'e-mail de la fiche, lien signé 1 h, usage unique, page « nouveau code + confirmation ». Pas de « Changer mon code », pas de SMS. Réponse toujours identique (on ne dit jamais qui a un compte).
- Jamais : le code dans `audLog`, le pont, un message, un document ; jamais pour le compte admin ; jamais une porte Bee vers ces routes.
- Fiche admin = 4 rubriques repliables (Identité · Activité · Droits · Code), essentiel sur la ligne fermée, rien en double ; code affiché effacé après 30 s ; boutons ≥ 44 px.
- Gardes : `npm run test:codes-comptes` (SABOTAGE=signature|credv|unique|journal) et `npm run test:codes-comptes-ecran` (SABOTAGE=1|oublie). Récit : CLAUDE-HISTOIRE.md § « CODES DES COMPTES ».
