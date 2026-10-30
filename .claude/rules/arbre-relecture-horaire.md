# Arbre — chaque modification, par n'importe quel compte, est relue et propagée (Kevin 29.10.2026, absolue)

« À chaque modification, peu importe par quel compte ou par qui, tout doit être mis à jour automatiquement, en toute autonomie, et vérifié sur erreur — toujours gratuit, sécurisé. »

Trois couches, toutes gratuites :
1. **Sur l'appareil qui saisit** : `propagerTextes` (date / lieu de naissance et de décès, mariage, métier) corrige les textes de la fiche et de ses proches ; un seul envoi par fiche (`_pousserTextes`).
2. **Sur chaque appareil qui reçoit** : `cloudPull` rejoue la même propagation pour toute fiche changée ailleurs (autre compte, robot). Garde : `tools/arbre/verify-suivi-ailleurs.mjs`.
3. **Chaque heure, dans la routine « Arbre : relire le pont et les branches », AVANT le pont** (coût en jetons minimal : on ne lit en détail que les seaux qui ont bougé) :
   a. `node tools/arbre/appliquer-nuage.mjs --exporter f.json` ; entrée `{"export": <f.json>, "vus": null}` → `node tools/arbre/session/relecture-modifs.mjs --sommes < entree.json` (un total par seau = 1re lettre de l'id) ;
   b. D1 `kdmc-pont` : `SELECT substr(id,1,1) b, count(*) n, sum(unicode(substr(h,1,1))*31+unicode(substr(h,2,1))*17+unicode(substr(h,3,1))*13+unicode(substr(h,4,1))*7) s FROM arbre_vu GROUP BY b` ; comparer ; **si tout est égal : rien n'a bougé, s'arrêter** ;
   c. pour les seaux qui diffèrent (ou nouveaux) : `SELECT id,h FROM arbre_vu WHERE substr(id,1,1) IN ('x','y')` → entrée `{"export":…, "vus":[{id,h}…], "seaux":["x","y"]}` → `node tools/arbre/session/relecture-modifs.mjs < entree.json` (rapport) puis `--sql` (les nouvelles empreintes, seulement les fiches qui ont bougé), à exécuter dans D1 **après** avoir traité ;
   - écart de texte sûr (année, lieu, date) → corriger par `ecrire.sh` (`notesReecrite` si le début change) ;
   - personne nouvelle sans preuve → mission au Lenovo (`arbre-pc`, contenu complet dans le message) : actes, sources, JO / archives, puis ses parents (on remonte) ;
   - filiation ou conjoint contredit → ne pas deviner : question à Kevin en une phrase ;
   - effacer l'export et l'entrée après (rien de familial dans le dépôt).
L'état D1 ne contient que l'id de la fiche et une empreinte ; rien de familial dans le dépôt. Garde : `tools/arbre/verify-relecture-modifs.mjs`.

4. **Moisson permanente par les robots gratuits (Kevin 30.10, « tourne en permanence, toute automatique »)**, à chaque passage de la routine, APRÈS la relecture : (a) collecter les travaux rendus : `node tools/arbre/session/moissonneur.mjs --collecte <n° des travaux postés au passage précédent>` ; chaque trouvaille est un PREMIER JET à vérifier (ouvrir l'adresse, nom ET lieu ou date concordants) avant tout `ecrire.sh` ; une vérification réussie va dans la fiche (source + extrait), le reste est écarté ; (b) poster le lot suivant : D1 `SELECT cle FROM arbre_moisson` → `{export, faits:[…]}` → `node tools/arbre/session/moissonneur.mjs --lot 8` → exécuter les `commandes` (file gratuite `jobs.mjs poster --pour lenovo`) puis passer le `sql` à D1 (`arbre_moisson(cle PRIMARY KEY, job, ts)`) ; (c) effacer l'export. DÉFUNTS seulement (une fiche « vivant », ou sans décès et née après 1930, n'est jamais citée) ; sources publiques gratuites ; Gallica et les API publiques limitent par adresse : le Lenovo les lit, pas le cloud. Garde : `tests/delegue-agent.test.mjs`.
