/* DÉBLOCAGE AUTOMATIQUE — l'essaim ne reste jamais coincé (Kevin 26.11.2026 : « trouve des solutions pour tous les blocages… qu'ils ne soient jamais bloqués »).
 * Chaque panne est CLASSÉE, et la bonne parade est appliquée seule ; ce qui exige vraiment Kevin est regroupé en UN rapport (un lien, un clic), jamais en suite d'étapes.
 *   quota (429)        → le travailleur se repose (Retry-After, sinon 60 s), la tâche passe à un autre ; jamais de réessai en boucle.
 *   cle (401/403 API)  → travailleur coupé pour la passe ; « clé à vérifier » (une ligne, sans la clé).
 *   hors_service (5xx, réseau, modèle absent) → disjoncteur : 3 pannes de suite = travailleur coupé 10 min, puis un seul essai.
 *   delai              → la tâche passe à un autre travailleur, le premier est ralenti.
 *   mur (Cloudflare, anti-robot, captcha, HTTP 403 de la source) → JAMAIS contourné : la SOURCE est marquée bloquée pour la passe et la tâche est replanifiée
 *                         sur une source de secours (SECOURS) ; si aucune, elle va dans « pour Kevin » avec le lien exact.
 *   reponse_vide / json_invalide → un AUTRE modèle relit ; deux échecs = tâche abandonnée avec sa raison.
 * Aucun robot ne se connecte, ne remplit un formulaire ni ne contourne un captcha. */

export function classer(e) {
  const m = String((e && e.message) || e || '').toLowerCase();
  if (/captcha|just a moment|attention required|anubis|cloudflare|vérification de sécurité|robot|page refusée|access denied|http 40[13]\b.*(page|source)/.test(m) || /\bmur\b/.test(m)) return { type: 'mur', retry: false };
  if (/http (429|402)|rate.?limit|quota|allowance|too many requests|retry (after|in)|reply every/.test(m)) {
    const s = /(?:retry (?:after|in)|every) (\d+) ?s/.exec(m), sec = s ? +s[1] : 60;
    if (sec > 3600) return { type: 'quota_jour' };   // allocation du jour épuisée (ex. « free token allowance reached, retry in 64968 s ») : on n'insiste pas de la passe
    return { type: 'quota', repos: Math.min(sec, 300) * 1000 };
  }
  if (/http 40[13]|unauthori|invalid.*key|api key|forbidden/.test(m)) return { type: 'cle' };
  if (/timeout|timed out|abort|délai/.test(m)) return { type: 'delai', repos: 15000 };
  if (/json|vide|empty/.test(m)) return { type: 'reponse_vide' };
  return { type: 'hors_service', repos: 0 };
}

/** Source de secours quand une source est murée (ordre de préférence ; toutes publiques, lues par le navigateur neuf). */
export const SECOURS = {
  'Geneanet-public': ['FamilySearch-public', 'Gallica-presse', 'Wikisource'],
  'Gallica-presse': ['RetroNews-public', 'Europeana', 'Archive.org'],
  AD06: ['AD06-table-decennale', 'matchID-deces', 'Geneanet-public'],
  AD87: ['AD87-matricules', 'MemoireDesHommes'],
  'AD87-matricules': ['MemoireDesHommes'],
  MemoireDesHommes: ['AD87-matricules', 'Gallica-presse'],
  'matchID-deces': ['INSEE-deces'],
};

export function nouveauSuivi(maintenant = () => Date.now()) {
  const travailleurs = new Map(), sources = new Set(), rapport = { bloquees: [], pourKevin: [], cles: [], coupes: [] };
  const w = (nom) => travailleurs.get(nom) || travailleurs.set(nom, { suite: 0, repos: 0, coupe: false }).get(nom);
  return {
    rapport, sourcesBloquees: sources,
    disponible: (nom) => { const x = w(nom); return !x.coupe && maintenant() >= x.repos; },
    reussite: (nom) => { w(nom).suite = 0; },
    /** Applique la parade et dit quoi faire de la tâche : { relancer:boolean, source:… } */
    panne(nom, tache, e) {
      const c = classer(e), x = w(nom);
      if (c.type === 'quota' || c.type === 'delai') x.repos = maintenant() + (c.repos || 60000);
      if (c.type === 'quota_jour') { x.coupe = true; rapport.coupes.push(nom + ' (quota du jour)'); }
      if (c.type === 'cle') { x.coupe = true; rapport.cles.push(nom); rapport.coupes.push(nom); }
      if (c.type === 'hors_service') { x.suite++; if (x.suite >= 3) { x.repos = maintenant() + 600000; x.suite = 0; rapport.coupes.push(nom + ' (10 min)'); } }
      if (c.type === 'mur') {
        sources.add(tache.source); rapport.bloquees.push({ source: tache.source, url: tache.url });
        const alt = (SECOURS[tache.source] || []).find((s) => !sources.has(s));
        if (!alt) rapport.pourKevin.push({ source: tache.source, url: tache.url, action: 'ouvrir ce lien dans ton navigateur et déposer l\'image (un clic) — le robot ne contourne pas le mur' });
        return { type: c.type, relancer: false, secours: alt || null };
      }
      return { type: c.type, relancer: c.type !== 'cle' || true };
    },
  };
}
