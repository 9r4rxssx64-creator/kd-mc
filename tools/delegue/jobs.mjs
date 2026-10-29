#!/usr/bin/env node
/* LA FILE DE TRAVAUX DES BRANCHES — déposer un travail, le relire (Kevin 29.10.2026 : « toutes les branches puissent déléguer… faire remonter les résultats à tes branches »).
 *   node tools/delegue/jobs.mjs poster --pour lenovo --consigne "…" --urls https://… https://… [--domaine resume] [--pages 6]
 *   node tools/delegue/jobs.mjs lire <id>          état et résultat (rapport JSON : pages, trouvailles VÉRIFIÉES, synthèse)
 *   node tools/delegue/jobs.mjs lister [n]         mes derniers travaux
 * Jeton : variable DELEGUE_JETON ou fichier posé par `jeton.mjs nouveau` (voir .claude/rules/delegue-gratuit.md). Tout ce qui est déposé est public ou anonyme : jamais de
 * secret, d'e-mail, de téléphone, ni de personne VIVANTE (noms de défunts à l'état civil public : permis). Le travail est fait par l'agent gratuit du Lenovo (agent.mjs). */
import { jetonCourant } from './delegue.mjs';

export const BASE = () => (process.env.DELEGUE_BASE || 'https://apis.kd-mc.com/delegue/jobs').replace(/\/+$/, '');
export async function api(chemin, { methode = 'GET', corps, jeton = jetonCourant(), fetchImpl = fetch, base = BASE() } = {}) {
  if (!jeton) throw new Error('pas de jeton : node tools/delegue/jeton.mjs nouveau <ma-session>, puis passer le SQL imprimé à la base D1 kdmc-delegue');
  const r = await fetchImpl(base + chemin, { method: methode, signal: AbortSignal.timeout(30000), headers: { authorization: 'Bearer ' + jeton, 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error('HTTP ' + r.status + ' ' + (d.error || '') + ' ' + String(d.detail || '').slice(0, 160));
  return d;
}
export const poster = (c, o) => api('', { ...o, methode: 'POST', corps: c });
export const lire = (id, o) => api('/' + Number(id), o);
export const lister = (n, o) => api('?limite=' + (Number(n) || 10), o);

if (process.argv[1] && /(^|[\\/])jobs\.mjs$/.test(process.argv[1])) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === 'poster') {
      const c = { pour: 'lenovo', urls: [] }; let mode = null;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === '--pour') { c.pour = a[++i]; mode = null; } else if (a[i] === '--consigne') { c.consigne = a[++i]; mode = null; } else if (a[i] === '--domaine') { c.domaine = a[++i]; mode = null; } else if (a[i] === '--pages') { c.max_pages = Number(a[++i]); mode = null; } else if (a[i] === '--urls') mode = 'urls'; else if (mode === 'urls') c.urls.push(a[i]);
      }
      const r = await poster(c); if (r.deja) console.error(`↩️  même travail déjà ${r.statut === 'fait' ? 'rendu' : r.statut === 'en_cours' ? 'en cours' : 'en attente'} (n° ${r.id}, demandé par ${r.demande_par}) : ne le refais pas, lis-le avec « jobs.mjs lire ${r.id} »`); console.log(JSON.stringify(r));
    } else if (cmd === 'lire') console.log(JSON.stringify((await lire(a[0])).job, null, 2));
    else if (cmd === 'lister') console.log(JSON.stringify((await lister(a[0])).jobs, null, 2));
    else { console.error('usage : jobs.mjs poster --pour lenovo --consigne "…" --urls <https://…>… | lire <id> | lister [n]'); process.exit(2); }
  } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
}
