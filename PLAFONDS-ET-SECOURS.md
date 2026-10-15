# PLAFONDS-ET-SECOURS.md — ne plus jamais être bloqué (Kevin 15.10.2026)

> « Économise le forfait action. Au maximum, trouve des solutions pour ne jamais plus être bloqué. N'importe où. Partout. »
> Tableau fait à partir de ce qui est ÉCRIT dans le dépôt (jamais de chiffre inventé : « non écrit » veut dire non écrit). Rien n'est confirmé chez les fournisseurs.

## 1. GitHub Actions du coffre — mesuré, puis traité
**Mesure (9 jours, 6→15.10, 700 runs, API GitHub)** : 2 170 min. Le 9.10 : 1 137 min en un jour ; le quota a sauté le 12.10.
| Robot | Minutes | Runs | Cause |
|---|---|---|---|
| Chaîne privée du coffre | 1 104 | 61 | ~18 min/run (27 min aujourd'hui), lancée à chaque fusion avant le 13.10 |
| Arbre — appliquer des corrections | 540 | 212 | ~2,5 min/run, relancé à chaque correction |
| Audit runtime CMCteams | 207 | 106 | ~2 min/run, à chaque fusion/PR avant le 13.10 |
| Synchronisation du code vers le dépôt public | 181 | 178 | 1 min/run (le minimum facturé), un run par fusion |
Depuis le 13.10 : tout est à la main sauf la synchronisation (1 min par fusion, déjà regroupée : GitHub ne garde qu'UN run en attente par groupe → 82 runs sur 249 ont coûté 0).
**Ce qui est maintenant en place (15.10)**
1. **Porte de ration** (`tools/ci/porte-ration.sh`, garde `test:porte-ration`) : les 6 gros robots (chaîne privée 30 min, audit runtime 10, Arbre 4, vérif réelle 15, audit Lingua 10, voir-comme-Kevin 8) lisent la ration du jour AVANT d'installer quoi que ce soit et ne démarrent pas si elle ne les couvre pas. Contournement : l'entrée « forcer », avec l'accord de Kevin. Fail-ouvert si la ration est illisible.
2. **La ration à l'ouverture de chaque session** (hook `etat-du-moment.sh`, garde `test:ration-hook`) : toutes les branches la voient.
3. **Publier sans Actions** (`tools/depot-public/publier-local.mjs`, garde `test:publier-local`) : même export, même vérificateur, même plancher de 80 % que le robot, depuis une session ; à blanc par défaut, `--envoyer` pour pousser. Quota mangé = on publie quand même. Jeton : `KDMC_PUBLIC_PAT` ou dépôt public attaché en écriture.
4. Option déjà prévue : `KDMC_RUNNER=kdmc-lenovo` envoie les robots lourds sur le Lenovo de Kevin (illimité, gratuit) — demande que l'ordinateur soit allumé.

## 2. Les autres plafonds (source dans le dépôt)
| Service | Plafond écrit | Mesuré | À 100 % | Secours en place |
|---|---|---|---|---|
| Cloudflare Workers, requêtes/jour (un compte pour toutes les adresses) | 100 000/jour (`tools/audit/mesure-requetes.mjs:27`) | à la main ; 7.10 : 49 008 | **tout le domaine en 429** (27.09) jusqu'à 00h UTC | cache navigateur ; robots coupés à 60 % (`budget-requetes`, 6 robots) ; pas de bascule auto (Workers Paid 5 $/mois « reste à Kevin ») |
| KV écritures/jour | 1 000 (`mesure-kv.mjs:25`) | à la main ; 4→8.10 : 105-306 | dégradé : comptes, sauvegardes, cache voix n'écrivent plus | écritures déplacées vers D1 ; `souslePlafond` |
| KV lectures/jour | **non écrit** | non | inconnu | aucun |
| Crons Workers | 5 par compte, tous pris | non | un déploiement échoue | `kdmc-outlook` sert d'horloge |
| D1 | 100 000 écritures/jour (`wrangler.toml`) ; lectures/taille non écrits | non | inconnu | aucun |
| Pages | 500 builds/mois (450 déjà comptés) | non lisible | plus de publication | publication manuelle via le dépôt public |
| Workers AI | 10 000 neurones/jour | **non** | Qwen s'arrête (IA principale) | cascade de 11 IA gratuites (`ia-route.js`) |
| Firebase RTDB (Blaze) | pas de plafond dur ; alerte 20 €/mois dépassée | oui (poids) | **la facture grimpe** | alléger `/apex` (5,6 Mo) comme `/cmcteams` |
| Fournisseurs d'IA gratuits | non écrits (8 sans clé) | sonde à la main | pause du moteur, on passe au suivant | oui (relais de même niveau) |
| E-mail (EmailJS 200/mois, Resend 100/jour), Email Routing, R2 | non écrits / non lisibles | non | mails perdus | aucun |
| Forfait Claude de Kevin | « Max » | non | sessions bloquées | mémoire compacte ; la règle « le bon modèle » économise |

## 3. Les 10 trous restants, par risque (le correctif gratuit le plus petit)
1. **Workers 100 000 req/jour, sans alerte** → push à Kevin à 70 % (dans `kdmc-outlook`, déjà cadencé ; pas de nouveau cron).
2. **Firebase Blaze sans frein** → alléger `/apex` (même recette que `/cmcteams`).
3. **Workers AI sans mesure** → ajouter le jeu de données neurones à `mesure-requetes.mjs`.
4. **Actions** → fait ci-dessus ; reste : donner au jeton le droit « Plan : lecture » pour lire la facture.
5. **KV lectures non comptées** → écrire le plafond officiel à côté de `PLAFOND_ECRITURES` et le mesurer.
6. **D1 non mesuré** → même outil (`d1AnalyticsAdaptiveGroups`).
7. **`kdmc-outlook` seul point de défaillance des 5 crons** → `kdmc-uptime` lit son `/health` et alerte (une lecture, pas un cron).
8. **IA gratuites : paliers non écrits, 8 clés manquantes** → poser les clés déjà branchées, écrire chaque palier.
9. **Pages 450/500** → un seul envoi groupé par jour.
10. **E-mails / Email Routing / R2 / API tierces sans mesure** → droit de lecture Email Routing au jeton ; une ligne « compteur du mois » dans l'alerte du soir.
