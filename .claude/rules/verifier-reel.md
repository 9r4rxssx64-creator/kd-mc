# Vérifier dans le réel, toujours (Kevin 16.10.2026)

Un test vert ne prouve pas que Kevin voit la chose. Avant de dire « en ligne » ou « ça marche » :
1. regarder le réel : fichier servi / dépôt public `kd-mc` (raw.githubusercontent.com), runs de déploiement (`gh api repos/…/actions/runs`), nuage, vrai navigateur sur vraies données ;
2. si le réel m'est fermé (arbre = code famille, admin = connexion) : écrire « non vérifié en ligne » + ce que j'ai vu à la place ;
3. finir chaque livraison par « Vérifié réel : … / Non vérifié : … ».

## Se connecter au domaine POUR DE VRAI, depuis la session (Kevin 16.10 nuit : « connecte-toi réel partout, même le domaine »)
Mesuré le 16.10 : une session **atteint kd-mc.com** (curl 200). L'ancienne phrase « kd-mc.com est injoignable depuis l'agent » est FAUSSE aujourd'hui.
- **`npm run reel`** (= `node tools/smoke/reel.mjs [url…]`) : vrai Chromium au format iPhone, connecté avec le pass du robot `ci_smoke`,
  une capture par page (`audit/captures-reel/*.png`, à ouvrir avec Read = VOIR la page), version servie, écran de connexion, erreurs JS,
  requêtes en échec. 🔒 401/403 = la porte refuse le robot (zone réservée), pas une panne.
- **Automatique dans chaque session depuis le 17.10** : le hook de démarrage lance `reel.mjs --confiance` → rien à faire, Playwright sur kd-mc.com marche tout de suite.
- Le seul obstacle était le navigateur (`ERR_CERT_AUTHORITY_INVALID`) : le script inscrit l'autorité du proxy de la session dans le
  magasin du navigateur (`certutil`, une fois). **Jamais** `ignoreHTTPSErrors` ni couper TLS (garde `npm run test:reel-outil`).
- Un appel d'API réel connecté : le pass du robot `ci_smoke` exige depuis le 17.10 une preuve signée avec le secret du domaine (en-tête `x-kdmc-robot`, voir `tools/smoke/reel.mjs`) — sans ce secret (cas d'une session), on ne voit que l'ANONYME : c'est voulu (avant, n'importe qui obtenait ce pass et lisait le planning). Jamais une nouvelle uid.
- Ce que le robot NE voit PAS : l'admin prouvé (code / Face ID de Kevin), l'arbre (code famille), CMCteams connecté (scope cmc).
  Pour ça : workflow `voir-comme-kevin.yml` / `verif-reelle.yml` au dépôt PUBLIC (secret CI, ration), sinon « Non vérifié » + ce qui a été vu.
- Après chaque mise en ligne : `npm run reel <les pages touchées>` et la version servie doit être celle du commit.
