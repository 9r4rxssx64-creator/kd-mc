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
