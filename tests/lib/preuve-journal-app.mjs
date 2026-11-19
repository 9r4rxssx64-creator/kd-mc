/* Preuve que LE VRAI CODE d'une app écrit au journal du domaine (pas seulement que la porte répond).
   Apex AI (18.11, cloud-installer 2748 / apex-cloud 2676) : la sécurité de la page refuse le script du domaine, donc `window.kdmcJournal` n'existe pas ; l'app
   (ui/journal.ts, v13.4.399) écrit alors DIRECTEMENT à /__boite/journal. Ce robot ne peut pas faire une vraie action de personne (lecture seule) : il charge le
   module de l'app tel que la page le sert, l'appelle avec une phrase d'essai et lit la réponse de la porte.
   Retour : { ok, motif, etat } — jamais de texte de page. */
export async function preuveCodeApp(page, phrase, { delaiMs = 15000 } = {}) {
  /* Le module du journal n'est chargé qu'à la première action d'une personne (messages, projets, réglages) : on ne le cherche donc PAS parmi les fichiers déjà
     chargés, on suit les références à partir du fichier principal et des préchargements (au plus 120 lectures), et on garde le fichier « journal-… » qui contient
     `kdmcJournal` (Apex AI en a deux : l'autre n'a rien à voir). Mesuré le 19.11 (run 44431598500) : « module introuvable » quand on ne regardait que le chargé. */
  const borne = (p, ms, repli) => Promise.race([p, new Promise((r) => setTimeout(() => r(repli), ms))]);
  const trouve = await borne(page.evaluate(async () => {
    const vus = new Set(), file = [], essayes = new Set(); let lus = 0, lien = '';
    const ajouter = (u) => { try { const x = new URL(u, location.href); const a = x.href; if (x.origin === location.origin && /\.js$/.test(x.pathname) && !vus.has(a)) { vus.add(a); file.push(a); } } catch (_) { /* adresse invalide */ } };
    performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.js(\?|$)/.test(n)).forEach(ajouter);
    document.querySelectorAll('script[src],link[rel="modulepreload"]').forEach((e) => ajouter(e.src || e.href));
    const t0 = Date.now();
    const lire = async (u) => { const c = new AbortController(); const m = setTimeout(() => c.abort(), 6000); try { return await (await fetch(u, { signal: c.signal })).text(); } finally { clearTimeout(m); } };
    while (file.length && lus < 120 && !lien && Date.now() - t0 < 40000) {
      const u = file.shift(); lus++;
      let t = ''; try { t = await lire(u); } catch (_) { continue; }
      if (/(^|\/)journal-[\w-]+\.js(\?|$)/.test(u) && t.indexOf('kdmcJournal') >= 0) { lien = u.split('?')[0]; break; }
      for (const m of t.matchAll(/(?<![\w-])((?:\.{1,2}\/)(?:[\w-]+\/)*)?([\w.-]+-[A-Za-z0-9_-]{6,}\.js)(?![\w-])/g)) {
        const cible = m[1] ? new URL(m[1] + m[2], u).href : new URL('/chunks/' + m[2], location.origin).href;
        if (/(^|\/)journal-[\w-]+\.js$/.test(cible) && !essayes.has(cible)) {
          essayes.add(cible);
          try { const c = await lire(cible); if (c.indexOf('kdmcJournal') >= 0) { lien = cible; break; } } catch (_) { /* suivant */ }
        }
        ajouter(cible);
      }
    }
    return { lien, lus, candidats: essayes.size };
  }).catch(() => ({ lien: '', lus: 0, candidats: 0 })), 60000, { lien: '', lus: 0, candidats: 0 });
  const lien = trouve.lien;
  if (!lien) return { ok: false, motif: `module du journal introuvable (${trouve.lus} fichier(s) lus, ${trouve.candidats} candidat(s) journal-…)`, etat: '' };
  const attente = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/__boite/journal', { timeout: delaiMs }).catch(() => null);
  const lance = await page.evaluate(async ({ u, p }) => {
    const m = await import(u);
    const f = Object.values(m).find((x) => typeof x === 'function');
    if (!f) return 'aucune fonction exportée';
    f(p, 'modif');
    return '';
  }, { u: lien, p: phrase }).catch((e) => String(e && e.message || e).slice(0, 100));
  if (lance) return { ok: false, motif: lance, etat: '' };
  const rep = await attente;
  if (!rep) return { ok: false, motif: 'aucune requête vers /__boite/journal après l\'appel du code de l\'app', etat: '' };
  const j = await rep.json().catch(() => ({}));
  const etat = j.etat || '';
  return { ok: rep.status() === 200 && (etat === 'ajoute' || etat === 'doublon'), motif: rep.status() === 200 ? (etat ? '' : 'réponse sans état') : 'HTTP ' + rep.status(), etat };
}
