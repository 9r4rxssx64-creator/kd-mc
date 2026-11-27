/* ESSAIM — beaucoup d'IA gratuites en parallèle, UNE recherche par IA (Kevin 26.11.2026 : « une IA par recherche par personne… multiplie les IA,
 * les tâches… que chaque IA travaille individuellement et que tu ramènes le travail »).
 *  · une TÂCHE = une personne × une source (une page) ; un TRAVAILLEUR = un modèle précis d'une voie (omniroute/<modèle> ou local/<modèle>) avec son plafond par minute ;
 *  · répartition tournante, chaque travailleur dans ses quotas (jamais d'attente en boucle : une tâche en trop passe au travailleur suivant) ;
 *  · une tâche d'une fiche FERMÉE n'est donnée qu'à un travailleur LOCAL ; une panne passe la tâche à un AUTRE travailleur (3 essais au plus) ;
 *  · deux avis : une trouvaille « sûre » d'une fiche ouverte n'est retenue sûre que si DEUX travailleurs différents la voient ; sinon elle reste « piste » (À retrouver) ;
 *  · tout est rendu en un rapport, sans jamais écrire dans l'arbre (c'est arbre-cloud, avec ecrire.sh, qui écrit). */
import { niveau } from './confidentialite.mjs';
import { nouveauSuivi } from './deblocage.mjs';

export function planifier(lotsOuverts, lotsFermes, P, { pagesParSource = (id, source) => [] } = {}) {
  const taches = [];
  for (const lot of [...lotsOuverts, ...lotsFermes]) for (const source of lot.sources) for (const url of pagesParSource(lot.id, source) || []) taches.push({ id: lot.id + '|' + source + '|' + url, personne: lot.id, source, url, niveau: lot.niveau || niveau(P[lot.id]) });
  return taches;
}

export async function essaim({ taches, travailleurs, executer, maxEssais = 3, maintenant = () => Date.now(), urlsSecours = () => [] }) {
  const suivi = nouveauSuivi(maintenant);
  const etat = travailleurs.map((w) => ({ ...w, enCours: 0, appelsMinute: [], faits: 0, pannes: 0 }));
  const rapport = { faites: 0, abandonnees: [], parTravailleur: {}, trouvailles: {} };
  const file = taches.map((t) => ({ ...t, essais: 0, evites: new Set() }));
  const libre = (w, t) => {
    if (t.evites.has(w.nom) || !suivi.disponible(w.nom)) return false;
    if (suivi.sourcesBloquees.has(t.source)) return false;
    if (t.niveau !== 'ouvert' && w.voie !== 'local') return false;      // fiche fermée : modèle local seulement
    const now = maintenant(); w.appelsMinute = w.appelsMinute.filter((x) => now - x < 60000);
    return w.enCours < (w.concurrence || 1) && w.appelsMinute.length < (w.parMinute || 20);
  };
  let curseur = 0;
  const pris = (t) => { for (let k = 0; k < etat.length; k++) { const w = etat[(curseur + k) % etat.length]; if (libre(w, t)) { curseur = (curseur + k + 1) % etat.length; return w; } } return null; };
  const executerUne = async (t, w) => {
    w.enCours++; w.appelsMinute.push(maintenant());
    try {
      const r = await executer(t, w);
      w.faits++; rapport.faites++; suivi.reussite(w.nom);
      for (const f of r.trouvailles || []) {
        rapport.trouvailles[t.personne] = rapport.trouvailles[t.personne] || [];
        rapport.trouvailles[t.personne].push({ ...f, travailleur: w.nom, tache: t.id });
      }
    } catch (e) {
      w.pannes++; const parade = suivi.panne(w.nom, t, e);
      if (parade.type === 'mur') { for (const u of parade.secours ? urlsSecours(t, parade.secours) : []) file.push({ ...t, id: t.id + '>' + parade.secours, source: parade.secours, url: u, essais: 0, evites: new Set() }); return; }
      t.essais++; t.evites.add(w.nom);
      if (t.essais >= maxEssais || !etat.some((x) => !t.evites.has(x.nom) && (t.niveau === 'ouvert' || x.voie === 'local'))) rapport.abandonnees.push({ tache: t.id, raison: String(e.message).slice(0, 100) });
      else file.push(t);
    } finally { w.enCours--; }
  };
  const attendreRepos = () => file.some((t) => etat.some((w) => !t.evites.has(w.nom) && !suivi.sourcesBloquees.has(t.source) && (t.niveau === 'ouvert' || w.voie === 'local') && !suivi.disponible(w.nom)));
  const enVol = new Set(); let attenteMax = 120; const pauseRepos = 250;   // un travailleur au repos (quota) est attendu au plus ~30 s par passe, jamais en boucle serrée
  while (file.length || enVol.size) {
    let progres = false;
    for (let i = 0; i < file.length;) {
      const t = file[i], w = pris(t);
      if (!w) { i++; continue; }
      file.splice(i, 1); progres = true;
      const p = executerUne(t, w).finally(() => enVol.delete(p)); enVol.add(p);
    }
    if (enVol.size) await Promise.race(enVol);
    else if (!progres && attendreRepos() && attenteMax-- > 0) await new Promise((r) => setTimeout(r, pauseRepos));
    else if (!progres) { for (const t of file.splice(0)) rapport.abandonnees.push({ tache: t.id, raison: 'aucun travailleur autorisé ou disponible (fiche fermée sans modèle local ?)' }); }
  }
  deuxAvis(rapport);
  rapport.blocages = suivi.rapport;
  for (const w of etat) rapport.parTravailleur[w.nom] = { faits: w.faits, pannes: w.pannes };
  return rapport;
}

/** Équipe de départ : 1 local + OmniRoute ×3 ; on y ajoute `travailleursDisponibles()` (omniroute.mjs : llm7, pollinations sans clé ; OpenRouter, Groq, Cerebras, Mistral, NVIDIA, GitHub Models, SambaNova dès que leur clé gratuite est posée), après sonde réelle. */
export const EQUIPE = [
  { nom: 'local/principal', voie: 'local', concurrence: 1, parMinute: 6 },
  { nom: 'omniroute/auto-1', voie: 'omniroute', modele: 'auto', concurrence: 3, parMinute: 20 },
  { nom: 'omniroute/auto-2', voie: 'omniroute', modele: 'auto', concurrence: 3, parMinute: 20 },
  { nom: 'omniroute/auto-3', voie: 'omniroute', modele: 'auto', concurrence: 3, parMinute: 20 },
];

/** Deux avis : « sûr » seulement si deux travailleurs différents ont vu la même trouvaille (même extrait) ; sinon « piste ». */
export function deuxAvis(rapport) {
  for (const liste of Object.values(rapport.trouvailles)) {
    const parExtrait = new Map();
    for (const f of liste) {
      if (!parExtrait.has(f.extrait)) parExtrait.set(f.extrait, new Set());
      parExtrait.get(f.extrait).add(f.travailleur);
    }
    for (const f of liste) { f.avis = parExtrait.get(f.extrait).size; if (f.certitude === 'sur' && f.avis < 2) f.certitude = 'piste'; }
  }
}
