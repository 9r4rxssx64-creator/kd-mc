/*
 * depot-github.ts — UNE seule porte pour lire les fichiers du dépôt CMCteams.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Apex relit ses documents (CLAUDE.md, NOTES_USER.md, ses skills, sa mémoire
 * compacte…) directement sur `raw.githubusercontent.com`, SANS jeton. Ça
 * marche uniquement parce que le dépôt est PUBLIC.
 *
 * Or le dépôt contient le dossier commercial ClayScore, la structure de
 * planning de 258 employés et la configuration d'Apex : il doit passer en
 * privé. Le jour où il passera en privé, ces lectures répondront 404.
 *
 * Le piège : le code est « fail-open » (un document manquant est ignoré en
 * silence). Apex ne planterait donc PAS — il arrêterait juste de relire ses
 * documents, sans le dire à personne. C'est exactement le genre de panne
 * invisible qu'on ne découvre que des semaines plus tard.
 *
 * Ce module rassemble les 10 endroits qui lisaient le dépôt chacun de leur
 * côté. Quand le passage en privé arrivera, il n'y aura qu'UN endroit à
 * basculer — et un test empêche d'en rouvrir un onzième ailleurs.
 *
 * COMMENT ÇA MARCHE
 * -----------------
 *   • Si l'adresse du relais est connue (clé `ax_github_proxy_url`) → on passe
 *     par le relais Cloudflare, qui détient le jeton côté serveur. Le jeton
 *     n'arrive JAMAIS dans le navigateur.
 *   • Sinon → lecture publique directe, exactement comme avant.
 *
 * Donc : tant que le relais n'est pas configuré, le comportement est
 * strictement identique à aujourd'hui. Rien ne change, rien ne casse.
 */

export const DEPOT = '9r4rxssx64-creator/CMCteams';

/** Clé où l'adresse du relais peut être rangée à la main (dépannage). */
export const CLE_RELAIS = 'ax_github_proxy_url';

/**
 * Adresse du relais écrite ICI, en dur, par le déploiement automatique
 * (workflow `deploy-apex-depot-relais.yml`).
 *
 * POURQUOI EN DUR ET PAS DANS UN FICHIER DE CONFIG : ce serait un
 * serpent qui se mord la queue. Un fichier de configuration vit DANS le
 * dépôt ; le jour où le dépôt devient privé, Apex ne peut plus le lire sans
 * relais… et l'adresse du relais serait justement dedans. L'adresse doit
 * donc être connue SANS avoir à lire le dépôt.
 *
 * Vide = aucun relais = lecture publique, comme aujourd'hui.
 */
export const RELAIS_PAR_DEFAUT = 'https://apex-depot-relais.9r4rxssx64.workers.dev';

function estAdresseValable(v: string): boolean {
  /* Uniquement https, et rien d'autre : une adresse bancale enverrait les
     lectures n'importe où. En cas de doute → pas de relais, lecture
     publique, plutôt qu'une lecture vers un inconnu. */
  return /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(v);
}

/**
 * L'adresse du relais, ou une chaîne vide s'il n'y en a pas.
 * Isolée dans sa propre fonction pour que les tests puissent la simuler.
 */
export function adresseRelais(): string {
  /* Une valeur posée à la main gagne : c'est la porte de secours si le
     relais déployé tombe et qu'il faut basculer sur un autre en urgence. */
  try {
    const v = (localStorage.getItem(CLE_RELAIS) || '').trim().replace(/\/+$/, '');
    if (v && estAdresseValable(v)) return v;
  } catch {
    /* localStorage indisponible — on continue avec la valeur par défaut. */
  }
  const parDefaut = RELAIS_PAR_DEFAUT.trim().replace(/\/+$/, '');
  return parDefaut && estAdresseValable(parDefaut) ? parDefaut : '';
}

/**
 * L'adresse à appeler pour LIRE un fichier du dépôt.
 * Fonction pure : c'est elle qui porte toute la logique, donc c'est elle
 * qu'on teste.
 */
export function urlLecture(chemin: string, branche = 'main'): string {
  const propre = String(chemin || '').replace(/^\/+/, '');
  const relais = adresseRelais();
  if (relais) {
    return `${relais}?action=read&path=${encodeURIComponent(propre)}&branch=${encodeURIComponent(branche)}`;
  }
  return `https://raw.githubusercontent.com/${DEPOT}/${branche}/${propre}`;
}

/**
 * L'adresse à appeler pour LISTER le contenu d'un dossier du dépôt.
 */
export function urlListe(chemin: string, branche = 'main'): string {
  const propre = String(chemin || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const relais = adresseRelais();
  if (relais) {
    return `${relais}?action=list&path=${encodeURIComponent(propre)}&branch=${encodeURIComponent(branche)}`;
  }
  return `https://api.github.com/repos/${DEPOT}/contents/${propre}?ref=${branche}`;
}

/**
 * Lit un fichier du dépôt. Renvoie son contenu, ou `null` si la lecture
 * échoue — jamais d'exception : un document manquant ne doit pas empêcher
 * Apex de démarrer.
 */
export async function lireFichier(
  chemin: string,
  opts?: { branche?: string; timeoutMs?: number },
): Promise<string | null> {
  return (await lireFichierDetaille(chemin, opts)).contenu;
}

/**
 * Même lecture, mais qui dit POURQUOI quand ça rate.
 *
 * Pourquoi les deux existent : la plupart des appelants se moquent de la
 * raison (un document manquant est simplement ignoré). Mais ceux qui
 * remontent une erreur à l'écran doivent garder la cause EXACTE — « HTTP
 * 404 » et « réseau coupé » n'appellent pas la même réaction. Un message
 * vague transforme un diagnostic de 10 secondes en enquête d'une heure.
 */
export async function lireFichierDetaille(
  chemin: string,
  opts?: { branche?: string; timeoutMs?: number },
): Promise<{ contenu: string | null; statut: number; raison: string }> {
  const url = urlLecture(chemin, opts?.branche ?? 'main');
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) {
      return {
        contenu: null,
        statut: r.status,
        raison:
          r.status === 404
            ? `HTTP 404 — fichier absent, ou dépôt privé sans relais (${chemin})`
            : `HTTP ${r.status}`,
      };
    }
    return { contenu: await r.text(), statut: r.status, raison: '' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const coupe = e instanceof Error && e.name === 'AbortError';
    return {
      contenu: null,
      statut: 0,
      raison: coupe ? `Délai dépassé (${opts?.timeoutMs ?? 12_000} ms)` : `Réseau : ${msg}`,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Liste les entrées d'un dossier du dépôt. Renvoie un tableau vide en cas
 * d'échec — même principe de repli silencieux.
 */
export async function listerDossier(
  chemin: string,
  opts?: { branche?: string; timeoutMs?: number },
): Promise<Array<{ name: string; type: string }>> {
  const url = urlListe(chemin, opts?.branche ?? 'main');
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) return [];
    const j = (await r.json()) as unknown;
    return Array.isArray(j) ? (j as Array<{ name: string; type: string }>) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Le dépôt est-il encore lisible ? Sert au diagnostic : si un jour Apex
 * arrête de relire ses documents, cette réponse dit POURQUOI au lieu de
 * laisser la panne invisible.
 */
export async function diagnostiquerAcces(): Promise<{
  ok: boolean;
  via: 'relais' | 'public';
  detail: string;
}> {
  const via = adresseRelais() ? 'relais' : 'public';
  const contenu = await lireFichier('CLAUDE.md', { timeoutMs: 8000 });
  if (contenu && contenu.length > 100) {
    return { ok: true, via, detail: `Lecture OK (${contenu.length} caractères).` };
  }
  return {
    ok: false,
    via,
    detail:
      via === 'public'
        ? "Lecture publique refusée. Si le dépôt vient de passer en privé, c'est attendu : il faut configurer le relais (clé ax_github_proxy_url)."
        : 'Le relais ne répond pas ou refuse. Vérifier son adresse et son jeton.',
  };
}
