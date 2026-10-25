# Le pont : toutes les sessions Claude de Kevin se parlent (17.10.2026)

Kevin : « Que vous sachiez tout, que vous échangiez tout en réel… je veux que mes deux applications n'en fassent qu'une. »
Les sessions **cloud** (claude.ai/code, iPhone) et les sessions **ordinateur** (Claude Desktop, avec son Chrome) partagent UNE boîte : la base Cloudflare D1 **`kdmc-pont`** (id `ad7b5970-cbed-426b-a1b3-dea57116f6c8`), lue et écrite par le connecteur **Cloudflare** (`d1_database_query`), présent des deux côtés. Pourquoi pas le message direct : une session cloud ne peut pas encore envoyer de message à une autre session (refus « auth » mesuré le 17.10) ; l'ordinateur, lui, peut écrire au cloud par SendMessage — on garde les deux.

## Tables
- `sessions(id, lieu, sujet, etat, maj)` — qui travaille sur quoi (`lieu` = cloud | pc). `maj` en millisecondes.
- `messages(id, ts, de, a, sujet, corps, pj, lu_par)` — `ts` = entier en **millisecondes** (`CAST(strftime('%s','now') AS INTEGER)*1000`), jamais des secondes ni un texte (21.10 : 61 messages en secondes ou en texte se rangeaient en 1970, convertis) ; `a` = id d'une session ou `toutes` ; `lu_par` = « id1;id2; » ; `pj` = où trouver les pièces (ex. « Gmail [PONT→CLOUD] 1 »).

## Ce que fait CHAQUE session (règle `.claude/rules/pont.md`)
1. **En commençant** : se déclarer, puis lire ses messages :
   `INSERT OR REPLACE INTO sessions VALUES('<moi>','cloud|pc','<sujet>','actif',<ms>)`
   `SELECT * FROM messages WHERE (a='<moi>' OR a='toutes') AND instr(lu_par,'<moi>;')=0 ORDER BY id`
2. **Après chaque étape utile** : écrire ce qu'elle a trouvé ou fait (un fait daté, sa source), et marquer lu ce qu'elle a traité :
   `UPDATE messages SET lu_par=lu_par||'<moi>;' WHERE id=<n>`
3. **Avant de s'arrêter** : relire ses messages, mettre `etat` à jour.
4. Les **images** (actes, captures) passent par Gmail (mail de Kevin à Kevin, sujet `[PONT→CLOUD] …`, pièces jointes) ; le message D1 dit où les trouver.

## Rôles (pour ne jamais se marcher dessus)
- **arbre-cloud** : seule session qui ÉCRIT dans l'arbre (sauvegarde, garde « rien perdu », contrôle des textes), le dépôt et Gmail sortant aux mairies.
- **arbre-pc** (Claude Desktop) : cherche avec le Chrome de Kevin (archives06, Geneanet, Gallica, sites qui refusent le cloud) ; Kevin clique lui-même un captcha ; n'écrit jamais dans l'arbre.
- Toute autre session : se déclare avec un id clair (`cmcteams-pc`, `apex-cloud`…), lit `toutes`.

## Interdits
Aucun secret dans la base (ni code, ni clé, ni empreinte) ; pas de données de santé ; les faits familiaux restent courts et sourcés.

## Règle de Kevin (20.10.2026) : les manipulations vont ICI, le Lenovo les fait
Voir `.claude/rules/pont-lenovo-manipulations.md` : avant d'écrire « Kevin doit faire X », poser la mission au pont (`pc-config` / `arbre-pc`). Kevin ne garde que mot de passe, code, paiement, décision irréversible.

## Réveil en un clic (25.10.2026) — table `reveils`
`reveils(session_id PK, titre, pont_id, trigger_id, actif, dernier_reveil, note)` : une ligne par session Claude, avec son déclencheur SANS horaire (`create_trigger` + `persistent_session_id`, prompt « pont — RÉVEIL… »). Le Tableau KDMC écrit au pont puis appelle `fire_trigger` sur chaque `trigger_id` actif : la session se réveille et lit ses messages. Une session du Lenovo crée elle-même son déclencheur (refus « bridge » sinon) et écrit son `trigger_id` ici. Nouvelle session : créer son déclencheur et sa ligne.

## Quota de lecture de D1 dépassé — le pont de secours (25.10.2026)
- Signe : `code 7500 … exceeded D1's free tier daily row read limit`. Le quota GRATUIT (5 M lignes lues par jour, pour TOUT le compte Cloudflare, donc aussi Apex Chat, l'arbre…) est dépassé : même `SELECT … WHERE id=1` ou `CREATE INDEX` est refusé jusqu'à minuit UTC. Ne PAS réessayer en boucle (chaque essai compte).
- Cause mesurée : le Tableau KDMC relisait la table entière (~1 700 lignes × 5 requêtes) toutes les 30 s. Corrigé : Tableau v42 (toutes les 5 min, pause 30 min dès que le quota est signalé) + `tools/pont/reparation-quota.sql` (index + marquage « lu » automatique), à passer après minuit UTC.
- Pendant la panne : discussion privée n° 5236 du dépôt CMCteams. Cloud : `node tools/pont/secours.mjs ecrire|lire|rejouer`. Lenovo : connecteur GitHub (`add_issue_comment`, `issue_read`). Au retour de D1 : `node tools/pont/secours.mjs rejouer` imprime le SQL (sans doublon : repère `[secours#id]`) à passer par le connecteur Cloudflare.
- Lire pas cher (une fois les index posés) : `SELECT … FROM messages WHERE id > <dernier id lu> AND (a='<moi>' OR a='toutes') ORDER BY id LIMIT 50` — jamais de `SELECT *` sans `WHERE id >`, jamais de `instr(...)` sur toute la table.
