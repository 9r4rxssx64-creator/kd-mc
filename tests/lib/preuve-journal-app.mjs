/* Preuve que LE VRAI CODE d'une app écrit au journal du domaine (pas seulement que la porte répond).
   Apex AI (18.11, cloud-installer 2748 / apex-cloud 2676) : la sécurité de la page refuse le script du domaine, donc `window.kdmcJournal` n'existe pas ; l'app
   (ui/journal.ts, v13.4.399) écrit alors DIRECTEMENT à /__boite/journal. Ce robot ne peut pas faire une vraie action de personne (lecture seule) : il charge le
   module de l'app tel que la page le sert, l'appelle avec une phrase d'essai et lit la réponse de la porte.
   Retour : { ok, motif, etat } — jamais de texte de page. */
const borne = (p, ms, repli) => Promise.race([p, new Promise((r) => setTimeout(() => r(repli), ms))]);

/* ÉTAPE 1 — chercher l'adresse du module du journal dans la page de l'app (lectures seulement). */
export async function trouverModuleJournal(page, { sansEntrees = false, suivi = () => {} } = {}) {
  suivi('recherche du module');
  /* Le module du journal n'est chargé qu'à la première action d'une personne (messages, projets, réglages) : on ne le cherche donc PAS parmi les fichiers déjà
     chargés, on suit les références à partir du fichier principal et des préchargements (au plus 120 lectures), et on garde le fichier « journal-… » qui contient
     `kdmcJournal` (Apex AI en a deux : l'autre n'a rien à voir). Mesuré le 19.11 (run 44431598500) : « module introuvable » quand on ne regardait que le chargé. */
  const trouve = await borne(page.evaluate(async (sansEntrees) => {
    const vus = new Set(), prio = [], norm = [], essayes = new Set(); let lus = 0, lien = '';
    const ajouter = (u) => { try { const x = new URL(u, location.href); const a = x.href; if (x.origin === location.origin && /\.js$/.test(x.pathname) && !vus.has(a)) { vus.add(a); (/\/index-[\w-]+\.js$/.test(x.pathname) ? prio : norm).push(a); } } catch (_) { /* adresse invalide */ } };
    if (!sansEntrees) performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.js(\?|$)/.test(n)).forEach(ajouter);
    document.querySelectorAll('script[src],link[rel="modulepreload"]').forEach((e) => ajouter(e.src || e.href));
    const t0 = Date.now();
    const lire = async (u) => { const c = new AbortController(); const m = setTimeout(() => c.abort(), 6000); try { return await (await fetch(u, { signal: c.signal })).text(); } finally { clearTimeout(m); } };
    const traiter = async (u) => {
      let t = ''; try { t = await lire(u); } catch (_) { return; }
      lus++;
      if (/(^|\/)journal-[\w-]+\.js(\?|$)/.test(u) && t.indexOf('kdmcJournal') >= 0) { lien = lien || u.split('?')[0]; return; }
      for (const m of t.matchAll(/(?<![\w-])((?:\.{1,2}\/)(?:[\w-]+\/)*)?([\w.-]+-[A-Za-z0-9_-]{6,}\.js)(?![\w-])/g)) {
        const cible = m[1] ? new URL(m[1] + m[2], u).href : new URL('/chunks/' + m[2], location.origin).href;
        if (/(^|\/)journal-[\w-]+\.js$/.test(cible) && !essayes.has(cible)) {
          essayes.add(cible);
          try { const c = await lire(cible); if (c.indexOf('kdmcJournal') >= 0) { lien = lien || cible; return; } } catch (_) { /* suivant */ }
        }
        ajouter(cible);
      }
    };
    /* Par lots de 12 lectures ; les fichiers « index-… » d'abord (ce sont les entrées des fonctions qui appellent le journal). */
    while ((prio.length || norm.length) && lus < 700 && !lien && Date.now() - t0 < 50000) {
      const lot = [];
      while (lot.length < 12 && (prio.length || norm.length)) lot.push(prio.length ? prio.shift() : norm.shift());
      await Promise.all(lot.map(traiter));
    }
    return { lien, lus, candidats: essayes.size };
  }, sansEntrees).catch(() => ({ lien: '', lus: 0, candidats: 0 })), 70000, { lien: '', lus: 0, candidats: 0 });
  return trouve;
}

/* ÉTAPE 2 — charger le module à cette adresse, l'appeler avec la phrase d'essai et lire la réponse de la porte. Bornée à chaque étape. */
export async function appelerModuleJournal(page, lien, phrase, { delaiMs = 15000, suivi = () => {} } = {}) {
  suivi('attente de la réponse de la porte');
  const attente = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/__boite/journal', { timeout: delaiMs }).catch(() => null);
  suivi('chargement du module et appel');
  const lance = await borne(page.evaluate(async ({ u, p }) => {
    const m = await import(u);
    const f = Object.values(m).find((x) => typeof x === 'function');
    if (!f) return 'aucune fonction exportée';
    f(p, 'modif');
    return '';
  }, { u: lien, p: phrase }).catch((e) => String(e && e.message || e).slice(0, 100)), delaiMs + 5000, 'chargement du module trop lent (' + Math.round((delaiMs + 5000) / 1000) + ' s)');
  if (lance) return { ok: false, motif: lance, etat: '' };
  suivi('lecture de la réponse');
  const rep = await attente;
  if (!rep) return { ok: false, motif: 'aucune requête vers /__boite/journal après l\'appel du code de l\'app', etat: '' };
  const j = await borne(rep.json().catch(() => ({})), 5000, {});
  const etat = j.etat || '';
  return { ok: rep.status() === 200 && (etat === 'ajoute' || etat === 'doublon'), motif: rep.status() === 200 ? (etat ? '' : 'réponse sans état') : 'HTTP ' + rep.status(), etat };
}

/* Les deux étapes sur la MÊME page (essais locaux). Le robot réel, lui, appelle le module dans une page vierge du même domaine : la page de l'app charge des
   centaines de fichiers et un poste lent retarde l'import (mesuré le 19.11 : plus de 10 minutes). */
export async function preuveCodeApp(page, phrase, { delaiMs = 15000, sansEntrees = false, suivi = () => {} } = {}) {
  const trouve = await trouverModuleJournal(page, { sansEntrees, suivi });
  if (!trouve.lien) return { ok: false, motif: `module du journal introuvable (${trouve.lus} fichier(s) lus, ${trouve.candidats} candidat(s) journal-…)`, etat: '' };
  return appelerModuleJournal(page, trouve.lien, phrase, { delaiMs, suivi });
}
