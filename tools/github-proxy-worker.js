/**
 * Cloudflare Worker — GitHub API proxy pour Apex AI
 *
 * Contourne les restrictions Safari iOS PWA qui bloquent les requêtes directes
 * vers api.github.com / raw.githubusercontent.com.
 *
 * DÉPLOIEMENT (3 min) :
 * 1. Va sur https://workers.cloudflare.com → "Create Worker"
 * 2. Colle ce code
 * 3. Variables d'environnement (onglet Settings > Variables) :
 *    - GITHUB_PAT : ton token (github_pat_11...) - chiffré côté worker
 *    - ALLOWED_ORIGIN : https://9r4rxssx64-creator.github.io
 * 4. Sauvegarde + Deploy
 * 5. Copie l'URL finale (ex: https://apex-github-proxy.xxx.workers.dev)
 * 6. Dans Apex Vault → clé `ax_github_proxy_url` → colle l'URL → OK
 *
 * SÉCURITÉ :
 * - Le PAT reste côté Worker (jamais exposé au navigateur)
 * - CORS limité à ton domaine github.io
 * - Rate limit natif Cloudflare (100k requests/jour gratuit)
 * - Whitelist du repo : uniquement 9r4rxssx64-creator/CMCteams
 */

const ALLOWED_REPO = "9r4rxssx64-creator/CMCteams";

/* Les seules pages autorisées à lire le dépôt par ce relais. */
const ORIGINES_AUTORISEES = [
  "https://kd-mc.com",
  "https://www.kd-mc.com",
  "https://9r4rxssx64-creator.github.io",
];

/* TOUT le domaine de Kevin, et lui seul.
 *
 * POURQUOI UNE RÈGLE ET PAS UNE LISTE : le 22.09, Apex ne pouvait plus relire
 * un seul de ses documents. Cause exacte : Apex est servi sur
 * `apex-ai.kd-mc.com`, une adresse qui ne figurait pas dans la liste
 * ci-dessus — donc le relais répondait 403, et le navigateur affichait
 * seulement « net::ERR_FAILED ». Tant que le dépôt était public, la panne
 * était invisible : Apex lisait GitHub en direct. Le jour où il est passé en
 * privé, ce relais est devenu le SEUL chemin, et il était fermé.
 *
 * Une liste recopiée à la main diverge toujours de la réalité (leçon #142) :
 * le domaine compte 31 adresses et en gagnera d'autres. La règle les couvre
 * toutes, sans rien à maintenir, et ne s'ouvre à personne d'autre : seul
 * Kevin peut créer une adresse sous kd-mc.com. */
const DOMAINE_KEVIN = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/;

/**
 * Cette page a-t-elle le droit de lire le dépôt par ce relais ?
 *
 * Fonction PURE et exportée : une garde qui se contente de RELIRE le code ne
 * prouve rien (un `if (false && …)` passerait au vert). Celle-ci s'exécute
 * pour de vrai, sur les 31 adresses du domaine.
 *
 * @param {string} origin  l'adresse de la page qui appelle
 * @param {string[]} [listeEnv]  réglage explicite du worker (ALLOWED_ORIGIN)
 */
export function origineAutorisee(origin, listeEnv) {
  const o = String(origin || "");
  /* Pas d'origine = pas un navigateur (outil en ligne de commande, serveur).
     Fermé par défaut : le jeton porté par ce relais ouvre un dépôt PRIVÉ. */
  if (!o) return false;
  if (DOMAINE_KEVIN.test(o)) return true;
  if (ORIGINES_AUTORISEES.includes(o)) return true;
  /* Le réglage explicite AJOUTE des adresses ; il n'en retire jamais.
     Sinon un `ALLOWED_ORIGIN` posé jadis sur le worker déployé (« github.io »
     seulement) continuerait de bloquer tout le domaine sans qu'on le voie. */
  return Array.isArray(listeEnv) && listeEnv.includes(o);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const liste = (env.ALLOWED_ORIGIN || "").trim()
      ? env.ALLOWED_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
      : ORIGINES_AUTORISEES;
    const autorisee = origineAutorisee(origin, liste);
    const pourEnTetes = autorisee ? origin : ORIGINES_AUTORISEES[0];

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(pourEnTetes)
      });
    }

    /* ⚠️ FERMÉ PAR DÉFAUT — corrigé le 2026-08-12.
     *
     * L'ancienne version disait : « si une origine est présente ET qu'elle
     * n'est pas la bonne, refuse ». Autrement dit, une requête SANS origine
     * passait. Or un navigateur envoie toujours une origine ; ce qui n'en
     * envoie pas, c'est un outil en ligne de commande ou un serveur.
     *
     * Tant que le dépôt est public, ça ne changeait rien. Mais ce relais
     * existe précisément pour le jour où il sera PRIVÉ : la porte grande
     * ouverte aurait alors laissé n'importe qui connaissant l'adresse lire
     * un dépôt fermé, avec le jeton de Kevin. On refuse donc par défaut, et
     * on n'autorise que ce qui est explicitement listé.
     */
    if (!autorisee) {
      return new Response("Origine non autorisée", {
        status: 403,
        headers: corsHeaders(pourEnTetes)
      });
    }
    const allowedOrigin = pourEnTetes;

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "read";
    const path = url.searchParams.get("path") || "";
    const branch = url.searchParams.get("branch") || "main";

    /* ⚠️ ÉCHAPPEMENT DU DÉPÔT — corrigé le 2026-08-12.
     *
     * `path` et `branch` sont recollés dans l'adresse GitHub. Sans contrôle,
     * un chemin contenant « .. » sort du dépôt whitelisté :
     *     path=../../autre-depot/main/secret.txt
     * devient, une fois l'adresse simplifiée, une lecture d'un AUTRE dépôt.
     *
     * Et le jeton porté par ce relais donne accès à TOUS les dépôts de
     * Kevin, pas seulement CMCteams. La liste blanche d'un seul dépôt ne
     * protégeait donc rien. On n'accepte que des chemins simples.
     */
    const cheminOk = /^[A-Za-z0-9._\-/]*$/.test(path) && !path.split("/").includes("..");
    const brancheOk = /^[A-Za-z0-9._\-/]+$/.test(branch) && !branch.split("/").includes("..");
    if (!cheminOk || !brancheOk) {
      return new Response("Chemin ou branche refusé", {
        status: 400,
        headers: corsHeaders(allowedOrigin)
      });
    }

    // Whitelist : uniquement le repo Kevin
    let githubUrl;
    if (action === "read") {
      // Lecture via raw.githubusercontent.com (contenu brut)
      githubUrl = `https://raw.githubusercontent.com/${ALLOWED_REPO}/${branch}/${path}`;
    } else if (action === "api") {
      // API GitHub pour métadonnées
      githubUrl = `https://api.github.com/repos/${ALLOWED_REPO}/contents/${path}?ref=${branch}`;
    } else if (action === "list") {
      // Lister un dossier
      githubUrl = `https://api.github.com/repos/${ALLOWED_REPO}/contents/${path}?ref=${branch}`;
    } else {
      return new Response("Invalid action", {
        status: 400,
        headers: corsHeaders(allowedOrigin)
      });
    }

    // Forward avec PAT côté worker (jamais exposé au client)
    const headers = {
      "User-Agent": "apex-github-proxy"
    };
    if (env.GITHUB_PAT) {
      headers["Authorization"] = `Bearer ${env.GITHUB_PAT}`;
    }

    try {
      const ghResponse = await fetch(githubUrl, { headers });
      const body = await ghResponse.text();

      return new Response(body, {
        status: ghResponse.status,
        headers: {
          ...corsHeaders(allowedOrigin),
          "Content-Type": ghResponse.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "public, max-age=60"
        }
      });
    } catch (e) {
      return new Response(`Proxy error: ${e.message}`, {
        status: 500,
        headers: corsHeaders(allowedOrigin)
      });
    }
  }
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
