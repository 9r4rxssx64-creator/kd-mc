#!/usr/bin/env node
/* Sonde — « qu'est-ce que cette adresse sert VRAIMENT ? » (27.09.2026)
 *
 * Pourquoi. Le run verif-reelle 36338529559 a trouvé 6 surfaces rouges : la cuisine
 * sur ses 4 adresses (#cover absent) et kd-mc.com/worldmonitor/ + kd-mc.com/osint/
 * (.leaflet-container absent). Or #cover est écrit EN DUR dans tools/cuisine/index.html,
 * identique dans les deux dépôts, et bien présent dans le paquet publié (140 fichiers,
 * 8,1 Mo, mesuré). Le code n'est donc pas en cause : l'adresse sert AUTRE CHOSE.
 *
 * Piste : ces 6 surfaces sont exactement celles de la liste PORTES du routeur au niveau
 * « fiche » (Kevin 27.09 : « sites d'information = fiche AVANT d'entrer »), et les
 * « belles adresses » worldmonitor./osint. ne passent que parce que audit-live n'y
 * cherche que `body` — que la page de la porte possède aussi. Cette sonde tranche en
 * regardant le HTML servi, sans session : page de la porte (titre « … — connexion » ou
 * « … — accès », worker.js l.1047 et l.1113), vraie page (marqueur de l'app), ou autre.
 *
 * Lecture seule, anonyme, aucune clé. Le rapport sort en annotations : le journal du job
 * est servi par un hôte que le proxy d'agent refuse, les annotations non.
 */
const CIBLES = [
  // [adresse, marqueur qui prouve la VRAIE page, quoi]
  ['https://cuisine.kd-mc.com/', /id="cover"/, 'cuisine (sous-domaine)'],
  ['https://cujina.kd-mc.com/', /id="cover"/, 'cuisine (cujina)'],
  ['https://cocina.kd-mc.com/', /id="cover"/, 'cuisine (cocina)'],
  ['https://kd-mc.com/cujina/', /id="cover"/, 'cuisine (chemin)'],
  ['https://worldmonitor.kd-mc.com/', /leaflet/i, 'World Monitor (sous-domaine)'],
  ['https://kd-mc.com/worldmonitor/', /leaflet/i, 'World Monitor (chemin)'],
  ['https://osint.kd-mc.com/', /leaflet/i, 'OSINT (sous-domaine)'],
  ['https://kd-mc.com/osint/', /leaflet/i, 'OSINT (chemin)'],
  // Témoins : une page SANS porte, et deux autres pages derrière la porte « fiche ».
  ['https://lingua.kd-mc.com/', /APP_VER|lingua/i, 'témoin sans porte : Lingua'],
  ['https://tor.kd-mc.com/', /tor/i, 'témoin porte fiche : Tor'],
  ['https://dossiers.kd-mc.com/', /dossier/i, 'témoin porte fiche : Dossiers'],
];
const PORTE = /<title>[^<]*— (connexion|accès)<\/title>/;
const TEMPS = 25000;

const titreDe = (h) => ((h.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim().slice(0, 70);

async function sonder([url, marqueur, quoi]) {
  try {
    /* Comme un NAVIGATEUR (Accept: text/html) : c'est ce que voit une personne. Le routeur
       répond différemment à un navigateur (page de la porte) et à un script (401 texte de
       29 octets « Connexion au domaine requise. », en-tête x-kdmc-porte: fiche) — mesuré au
       1er run 36340745642 : sans Accept, les 9 adresses gardées rendaient ce 401. */
    const r = await fetch(url, {
      redirect: 'follow',
      headers: {
        'cache-control': 'no-cache',
        'accept': 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) kdmc-sonde-servi/2',
      },
      signal: AbortSignal.timeout(TEMPS),
    });
    const h = await r.text();
    const titre = titreDe(h);
    const porte = r.headers.get('x-kdmc-porte');
    let verdict;
    if (PORTE.test(h) || porte) verdict = '🚪 PORTE « fiche »';
    else if (marqueur.test(h)) verdict = '✅ vraie page';
    else verdict = '❓ autre chose';
    const suivi = r.url !== url ? ` → ${r.url}` : '';
    return `${verdict} · ${quoi} · HTTP ${r.status}${suivi}${porte ? ' · x-kdmc-porte: ' + porte : ''} · « ${titre || h.slice(0, 40).replace(/\s+/g, ' ')} » · ${h.length} o`;
  } catch (e) {
    return `⛔ injoignable · ${quoi} · ${String(e.message).slice(0, 60)}`;
  }
}

const lignes = await Promise.all(CIBLES.map(sonder));
lignes.forEach((l) => console.log(l));
const n = (re) => lignes.filter((l) => re.test(l)).length;
const bilan = `${n(/^🚪/)} porte(s) · ${n(/^✅/)} vraie(s) page(s) · ${n(/^❓/)} autre(s) · ${n(/^⛔/)} injoignable(s) — sur ${lignes.length}`;
console.log(bilan);
/* UNE seule annotation pour tout le rapport : GitHub n'en garde que 10 par type et par
   étape — au 1er run on en émettait 12, et Dossiers + le bilan ont disparu (mesuré). */
const enc = (t) => t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::notice title=Servi (${lignes.length} adresses)::${enc([...lignes, bilan].join('\n'))}`);
if (lignes.every((l) => l.startsWith('⛔'))) { console.error('MESURE IMPOSSIBLE : aucune adresse n\'a répondu.'); process.exit(2); }
