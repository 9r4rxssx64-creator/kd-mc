# 05 — JOURNAL (décisions, hypothèses, non-vérifié, auto-critique)

## Décisions
- Réveil de la sonde par **kdmc-outlook** (worker sans propriétaire au registre) plutôt que par apex-chat-api (territoire apex-chat) : 6 lignes, fail-open, Service Binding.
- Clé de `/run` **dérivée** d'un secret déjà posé sur les deux workers (`APEX_ADMIN_PIN_SHA256`) : aucun nouveau secret GitHub à créer (l'API est fermée depuis la session, et Kevin ne doit pas cliquer pour ça).
- `claude/**` retiré des déploiements (relecteur sécurité) — et leçon #213 corrigée plutôt que laissée fausse.
- Les deux branches Lingua en doublon sont **inscrites** au registre (le garde l'exige) et signalées (m030), pas tranchées à leur place.

## Hypothèses (🔴 SUPPOSÉ, à confirmer)
- Les 6 workers « en panne » le sont pour des raisons différentes (rag = vieux code, apex-v13-backend = inexistant, les 4 autres = ?). Le prochain smoke annote code + cause par cible.
- Le droit manquant du jeton Cloudflare est « Vectorize : Edit » (message `code 10000` + chemin `/vectorize/v2/indexes`).
- `KDMC_SSO_SECRET` et d'autres noms « non documentés » existent bien côté GitHub (le routeur SSO fonctionne) : la liste de CLAUDE.md est incomplète, pas les secrets.

## Lu après coup (19h20)
- **Audit LIVE (run 33980752852, 3 min 45, vrai navigateur, 28 surfaces)** : **27 OK, 1 ❌ : `arbre.kd-mc.com`** (contrôle profond : déverrouillage + cartes ; l'arbre v3.17 sert désormais ses données par le domaine — le contrôle anonyme au code par défaut ne tient plus, ou la page ne rend pas de cartes : à trancher par la session arbre, message m034). Les 10 notices visibles : boutiques, outils, Lingua, Créa Studio, World Monitor, OSINT, les 4 variantes cuisine ✅.
- **Vercel** : voir `06-SECRETS-CONNECTEURS.md` — 40 déploiements inutiles par jour, corrigé.

## Non vérifié
- Le **premier passage réel via Outlook** (prochain `0 */2` après le déploiement d'Outlook sur main) : à lire via `modified_on`/`/` du worker au prochain tour.
- Les résultats de `audit-live.yml` (déclenché par 4c4a469) : à lire en annotations.
- Semgrep (PR #3652) : non lisible.
- Clics (`audit:clicks`) et a11y (`test:a11y`) : non exécutés localement (playwright absent, `npm i` échoue), tournent en CI.
- Réglages GitHub côté serveur (collaborateurs, protection de `main`), masquage des secrets dans `$GITHUB_STEP_SUMMARY`.

## Auto-critique (obligatoire)
- **Le point le plus faible de mon audit est** : aucune page réelle du domaine n'a été chargée par moi-même — tout le « live » passe par la CI, et ses résultats ne sont pas encore lus au moment d'écrire ceci.
- **Ce que je n'ai pas pu vérifier est** : que la sonde tourne bien toutes les 2 h par Outlook (le précédent 1042 rend le Service Binding nécessaire ; sa preuve est le prochain `modified_on`), et pourquoi 4 workers sains répondent « en panne ».
- **Ce dont je ne suis pas certain est** : que 5 min d'anti-rafale sur `/run` suffisent contre un abus (le cache est par datacenter — la clé, elle, est la vraie garde) ; que l'index Vectorize se crée dès le droit ajouté (le nom peut être pris par un index v1 legacy).


> 📌 **RÉSOLU LE 6.09.2026** — les « 6 workers en panne » du premier relevé n'étaient PAS une panne :
> un Cloudflare Worker **ne peut pas joindre une URL `*.workers.dev` du MÊME compte** (la requête ne
> sort jamais du réseau Cloudflare → 404 en 10-21 ms). C'était l'observateur, pas les cibles.
> Correctifs appliqués : `apex-v13-backend` **retiré** de `WORKERS` (il n'existe pas sur le compte) →
> la sonde couvre **31 cibles** (26 adresses du domaine + 5 workers), pas 32 ; et la santé des workers
> est désormais mesurée **depuis le runner CI** (`deploy-kdmc-uptime.yml`), qui lui a le réseau ouvert.
