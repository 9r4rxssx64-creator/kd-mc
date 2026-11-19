/* Preuve que LE VRAI CODE d'une app écrit au journal du domaine (pas seulement que la porte répond).
   Apex AI (18.11, cloud-installer 2748 / apex-cloud 2676) : la sécurité de la page refuse le script du domaine, donc `window.kdmcJournal` n'existe pas ; l'app
   (ui/journal.ts, v13.4.399) écrit alors DIRECTEMENT à /__boite/journal. Ce robot ne peut pas faire une vraie action de personne (lecture seule) : il charge le
   module de l'app tel que la page le sert, l'appelle avec une phrase d'essai et lit la réponse de la porte.
   Retour : { ok, motif, etat } — jamais de texte de page. */
export async function preuveCodeApp(page, phrase, { delaiMs = 15000 } = {}) {
  const lien = await page.evaluate(async () => {
    const noms = performance.getEntriesByType('resource').map((e) => e.name);
    let u = noms.find((n) => /\/chunks\/journal-[\w-]+\.js/.test(n));
    if (u) return u;
    for (const n of noms.filter((x) => /\/chunks\/[\w.-]+\.js/.test(x))) {
      try { const t = await (await fetch(n)).text(); const m = t.match(/(?<![\w-])journal-[\w-]+\.js/); if (m) return new URL('/chunks/' + m[0], location.origin).href; } catch (_) { /* suivant */ }
    }
    return '';
  }).catch(() => '');
  if (!lien) return { ok: false, motif: 'module du journal introuvable dans la page', etat: '' };
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
