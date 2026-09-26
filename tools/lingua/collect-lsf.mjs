#!/usr/bin/env node
/* 🤟 RÉCOLTE DE LA VRAIE LANGUE DES SIGNES FRANÇAISE (LSF) — Kevin 2026-08-13
   « Intègre la vrai langue des signes. Enrichit +++. Va plus loin »

   LE POINT DUR : un signe INVENTÉ est pire que pas de signe. Une personne sourde le verrait
   tout de suite, et l'élève apprendrait un geste qui ne veut rien dire. Or je ne connais pas
   la LSF : je ne peux donc RIEN écrire de moi-même. Tout doit venir d'une source réelle.

   D'OÙ VIENT LE CONTENU : Wikimedia Commons — la médiathèque libre. Des vidéos et photos de
   signes LSF y sont publiées sous licence libre (CC BY-SA, CC BY, CC0, domaine public), avec
   leur auteur. On garde UNIQUEMENT ce qui porte une licence libre, on cite l'auteur et la
   licence, et on renvoie vers la page d'origine. Les dictionnaires édités (Elix, Sématos,
   Spread the Sign) sont sous droits : on y RENVOIE, on ne recopie rien.

   POURQUOI EN CI : depuis l'agent, internet est fermé (403). Ce script tourne donc dans
   l'ouvrage GitHub (réseau ouvert), qui écrit le résultat dans le dépôt.

     node tools/lingua/collect-lsf.mjs --titres    → montre comment les fichiers sont NOMMÉS
     node tools/lingua/collect-lsf.mjs --rapport   → dit seulement ce qui EXISTE (n'écrit rien)
     node tools/lingua/collect-lsf.mjs             → écrit lingua/lsf-sources.json
*/
import fs from 'fs';
import path from 'path';

const RACINE = path.resolve(new URL('../../', import.meta.url).pathname);
const SORTIE = path.join(RACINE, 'lingua', 'lsf-sources.json');
const RAPPORT_SEUL = process.argv.includes('--rapport');
const TITRES = process.argv.includes('--titres');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'KDMC-Lingua/1.0 (https://lingua.kd-mc.com ; apprentissage des langues)';

/* Licences acceptées : uniquement celles qui autorisent la réutilisation avec attribution.
   Tout le reste est écarté — mieux vaut moins de signes que du contenu qu'on n'a pas le droit
   de montrer. */
const LIBRES = /^(cc0|cc[- ]by([- ]sa)?([- ]\d(\.\d)?)?|public domain|pd-|gfdl)/i;

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.ok) return await r.json();
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 800 * (essai + 1)));
  }
  return null;
}

/* Les catégories candidates. On ne suppose pas qu'elles existent : on demande, et on dit
   lesquelles répondent. Une catégorie vide n'est pas un échec, c'est une information. */
const CATEGORIES = [
  'Category:French Sign Language',
  'Category:Videos of French Sign Language',
  'Category:French Sign Language alphabet',
  'Category:Fingerspelling in French Sign Language',
  'Category:French Sign Language signs',
  'Category:Langue des signes française',
  'Category:LSF',
  /* L'alphabet ne s'arrête pas à 26 lettres : il y a les accents et les chiffres.
     On demande aussi les catégories qui pourraient les contenir — une catégorie vide
     n'est pas un échec, c'est une information qu'on affiche. */
  'Category:French manual alphabet',
  'Category:Manual alphabets',
  'Category:Numbers in French Sign Language',
  'Category:Numerals in sign languages',
  'Category:Dactylologie',
];

/* Plusieurs façons de nommer la même chose : on ratisse large, puis on filtre sévèrement.
   Chercher peu, c'est trouver peu — et croire ensuite que « ça n'existe pas ». */
const RECHERCHES = [
  /* Ciblé, pas large. Une recherche trop large sur Commons ramène des journaux néerlandais
     et le Federal Register : 2300 fichiers de bruit qui n'apportent rien et masquent ce
     qu'on cherche vraiment dans le rapport. */
  'LL-Q33302',                       // toutes les vidéos Lingua Libre en LSF
  'LSF Lettre OR LSF Chiffre',       // l'alphabet et, s'ils existent, les chiffres
  'LSF Vocab OR LSF Exo',            // les séries de vocabulaire
  'dactylologie langue des signes française',
];

async function membres(cat, type) {
  const out = []; let cont = null;
  do {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: type,
      cmlimit: '500', ...(cont ? { cmcontinue: cont } : {}) });
    if (!j || !j.query) return out;
    (j.query.categorymembers || []).forEach((m) => out.push(m.title));
    cont = j.continue && j.continue.cmcontinue;
  } while (cont);
  return out;
}

/* On descend dans les sous-catégories : les signes y sont rangés par lettre, par thème ou
   par contributeur. DEUX niveaux, pas un — au premier passage, une coupe à un seul niveau
   et un plafond de 60 sous-catégories pouvaient laisser des fichiers dehors sans rien dire.
   Un ensemble « presque complet » sans le savoir est pire qu'un ensemble petit assumé.
   Le garde-fou contre la dérive dans tout Commons, ce n'est pas la profondeur : c'est le
   registre des catégories déjà visitées (les catégories forment des boucles) + le filtre
   sévère sur les noms de fichiers, en aval. */
const CAT_VUES = new Set();
async function fichiersDe(cat, profondeur = 2) {
  if (CAT_VUES.has(cat)) return [];
  CAT_VUES.add(cat);
  let fichiers = await membres(cat, 'file');
  if (profondeur > 0) {
    const sous = await membres(cat, 'subcat');
    for (const sc of sous) fichiers = fichiers.concat(await fichiersDe(sc, profondeur - 1));
  }
  return fichiers;
}

function nu(titre) {
  return titre.replace(/^File:/, '').replace(/_/g, ' ')
    .replace(/\.(webm|ogv|ogg|mp4|gif|jpe?g|png|svg)$/i, '').trim();
}

/* Le mot français que le fichier illustre.
   ATTENTION — ces règles ne sont PAS écrites de mémoire : elles viennent du passage
   `--titres`, qui a montré comment les fichiers s'appellent réellement sur Commons.
   Deux familles seulement, et rien d'autre. Un nom hors famille est ÉCARTÉ : on ne devine
   jamais quel signe montre une vidéo, sinon on finit par enseigner un geste faux.

     · « LL-Q33302 (fsl)-Laura Jauvert-Banane »   → Lingua Libre : signeur, puis le mot
     · « LSF Vocab configuration »                → série de vocabulaire LSF
*/
const LL = /^LL-Q33302 \(fsl\)-(.+)$/i;          // Q33302 = la LSF sur Wikidata, fsl = son code
function motDuTitre(titre) {
  const t = nu(titre);
  let mot = null, signeur = null;
  const m = t.match(LL);
  if (m) {
    /* « <signeur>-<mot> » : on coupe au PREMIER tiret.
       Couper au dernier semblait plus sûr — c'était faux, et dangereusement : les mots
       français à trait d'union se faisaient amputer. « pique-nique » devenait « nique »,
       « après-midi » devenait « midi », « week-end » devenait « end ». Douze mots faux
       auraient été enseignés avec la vidéo d'un autre signe. */
    const reste = m[1]; const coupe = reste.indexOf('-');
    if (coupe < 1) return null;
    signeur = reste.slice(0, coupe).trim(); mot = reste.slice(coupe + 1).trim();
  } else {
    const v = t.match(/^LSF Vocab\s+(.+)$/i);
    if (!v) return null;
    mot = v[1].trim();
  }
  /* Rejets : essais techniques de tournage. */
  if (/\b(cam|px|spots?|sunny|light|no sun|test|essai)\b/i.test(mot)) return null;

  /* « (?) » : la personne qui a enregistré n'était PAS sûre du mot. On n'enseigne pas un
     signe dont l'auteur lui-même doute. */
  if (/\(\s*\?\s*\)/.test(mot)) return null;

  /* « Histoire (2) », « journal (2) » : une DEUXIÈME prise du même mot, pas un mot nouveau.
     On retient le mot de base et on garde la vidéo comme variante — voir le même signe deux
     fois, c'est utile. Avant, le chiffre suffisait à faire jeter le fichier. */
  let prise = 0;
  const mp = mot.match(/^(.+?)\s*\((\d+)\)$/);
  if (mp) { mot = mp[1].trim(); prise = Number(mp[2]); }
  if (/\d/.test(mot)) return null;   // un chiffre AILLEURS reste un nom technique

  /* Le jeu de caractères était trop étroit et jetait de vrais signes, dont les plus utiles :
       · les mots-questions      « Où ? » « Pourquoi ? » « Quand ? » « Qui ? » « Quoi ? »
       · l'écriture inclusive     « Ami·e » « Seul·e » « Préféré·e »
       · un signe pour plusieurs mots  « Donner, rendre » « Ma, mes » « Son, sa, ses, leurs »
       · nom ou verbe             « conseiller (n.) » « conseiller (v.) »
       · les débuts de phrase     « Au bord de… » « … ou … »
     Vingt-quatre signes bien réels disparaissaient dans un compteur. */
  if (!/^[A-Za-zÀ-ÿ0-9'’ ()·,.…?!\/-]{2,60}$/.test(mot)) return null;
  mot = mot.replace(/\s*[?!]+\s*$/, '').trim();   // le « ? » est de la ponctuation, pas le mot
  if (mot.length < 2) return null;
  if (/^(video|file|image|photo|sign|signe|vocab|exo|thumb)$/i.test(mot)) return null;
  return { mot: mot.toLowerCase(), signeur, prise };
}

/* La lettre de l'alphabet dactylologique. Une seule série existe et elle est nette :
   « LSF LettreA.jpg » … « LSF LettreZ.jpg ». On n'accepte QUE celle-là — une gravure
   ancienne ou une main isolée ne dit pas de façon sûre quelle lettre elle montre. */
function lettreDuTitre(titre) {
  const m = nu(titre).match(/^LSF Lettre\s?([A-Za-z])$/i);
  return m ? m[1].toUpperCase() : null;
}

async function infos(titres) {
  const out = new Map();
  for (let i = 0; i < titres.length; i += 40) {
    const lot = titres.slice(i, i + 40);
    const j = await api({ action: 'query', titles: lot.join('|'), prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime', iiurlwidth: '480' });
    if (!j || !j.query) continue;
    Object.values(j.query.pages || {}).forEach((p) => {
      const ii = p.imageinfo && p.imageinfo[0]; if (!ii) return;
      const em = ii.extmetadata || {};
      /* L'API colle des paramètres de suivi (?utm_source=…) au bout des adresses. On les
         enlève : ce qu'on garde doit être l'adresse propre du fichier, rien d'autre. */
      const propre = (u) => (u ? String(u).split('?')[0] : null);
      out.set(p.title, {
        url: propre(ii.url),
        vignette: propre(ii.thumburl),
        page: ii.descriptionurl,
        mime: ii.mime || '',
        licence: (em.LicenseShortName && em.LicenseShortName.value) || '',
        /* Les licences CC BY exigent de citer l'auteur. Quand Commons ne le donne pas dans
           ses métadonnées, on prendra le nom du signeur inscrit dans le nom du fichier, et
           on renvoie de toute façon vers la page d'origine, qui porte le crédit complet. */
        auteur: ((em.Artist && em.Artist.value) || (em.Credit && em.Credit.value) || '')
          .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    });
  }
  return out;
}

(async () => {
  console.log('🤟 Récolte de la LSF sur Wikimedia Commons (sources libres uniquement)\n');
  /* On vérifie d'abord qu'on peut vraiment atteindre Commons. Sans ça, le script mouline
     sept fois dans le vide puis annonce « 0 signe » — ce qui se lit comme « il n'existe rien »
     alors que la vérité est « je n'ai rien pu regarder ». Ne rien vérifier n'est pas vérifier. */
  const ping = await api({ action: 'query', meta: 'siteinfo' });
  if (!ping) {
    console.log('❌ Wikimedia Commons est injoignable depuis ici (internet fermé côté agent).');
    console.log('   Rien n\'a été regardé — ce n\'est PAS « aucun signe n\'existe ».');
    /* L'ouvrage GitHub a été déplacé le 5.09 : son travail consiste à moissonner
       des sites tiers, ce que les conditions GitHub Actions excluent. Il vit
       désormais sur GitLab (job « lingua-lsf », stage veille, à la demande).
       Un message qui envoie au mauvais endroit fait perdre plus de temps que
       pas de message du tout. */
    console.log('   Lance le job GitLab « lingua-lsf » (stage veille) : c\'est lui qui a le réseau.');
    console.log('   Pipelines GitLab → Lancer un pipeline → variable LINGUA_LSF=1, ou le bouton du job.');
    process.exit(1);
  }
  const vus = new Set(); const parCat = [];
  for (const cat of CATEGORIES) {
    const f = await fichiersDe(cat);
    parCat.push({ cat, n: f.length });
    console.log((f.length ? '✅ ' : '·  ') + cat + ' → ' + f.length + ' fichier(s)');
    f.forEach((t) => vus.add(t));
  }
  /* Des recherches en plus : beaucoup de fichiers ne sont rangés dans aucune catégorie.
     On PAGINE (la première fois, on s'arrêtait aux 200 premiers résultats et on ne le
     savait même pas — un plafond silencieux fait croire qu'on a tout vu). */
  for (const q of RECHERCHES) {
    let trouves = 0, offset = 0;
    for (let page = 0; page < 6; page++) {
      const r = await api({ action: 'query', list: 'search', srnamespace: '6',
        srsearch: q, srlimit: '500', sroffset: String(offset) });
      const lot = (r && r.query && r.query.search) || [];
      lot.forEach((s) => vus.add(s.title));
      trouves += lot.length;
      if (!r || !r.continue || !r.continue.sroffset) break;
      offset = r.continue.sroffset;
    }
    console.log('🔎 « ' + q.slice(0, 48) + (q.length > 48 ? '…' : '') + ' » → ' + trouves + ' fichier(s)');
  }

  console.log('\n' + vus.size + ' fichier(s) distincts à examiner…');
  const meta = await infos([...vus]);

  /* Mode « comment c'est nommé » : avant d'écrire la moindre règle de lecture des titres,
     on REGARDE comment les fichiers s'appellent vraiment. Écrire des règles de mémoire, c'est
     exactement comme ça qu'on invente un signe. On groupe par début de nom, on montre le type
     de fichier et la licence : de quoi décider sur du réel, pas sur une supposition. */
  if (TITRES) {
    const familles = new Map();
    for (const [titre, m] of meta) {
      const nu = titre.replace(/^File:/, '').replace(/_/g, ' ');
      const cle = nu.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      if (!familles.has(cle)) familles.set(cle, { n: 0, ex: [], types: new Set(), lic: new Set() });
      const f = familles.get(cle);
      f.n++; if (f.ex.length < 3) f.ex.push(nu);
      f.types.add((m.mime || '?').split('/')[0]); f.lic.add(m.licence || '(sans licence lisible)');
    }
    const tri = [...familles.entries()].sort((a, b) => b[1].n - a[1].n);
    /* La question décisive : la série « LSF … » va-t-elle plus loin que A-Z ? Les accents,
       les chiffres ? On les liste TOUS, un par un, au lieu de se fier au classement par
       nombre — une lettre accentuée n'existe qu'en un exemplaire et tomberait sous le
       radar d'un top 40. C'est exactement comme ça qu'on croit qu'il n'y a que 26 lettres. */
    const serieLSF = [...meta.keys()].map(nu).filter((t) => /^LSF\s/i.test(t)).sort();
    console.log('\n🔠 TOUS les fichiers « LSF … » (' + serieLSF.length + ') :');
    serieLSF.forEach((t) => console.log('     ' + t));
    console.log('\n📛 Comment les fichiers sont nommés (' + tri.length + ' familles) :\n');
    tri.slice(0, 40).forEach(([cle, f]) => {
      console.log('· « ' + cle + ' » ×' + f.n + '  [' + [...f.types].join(',') + ']  licence: ' + [...f.lic].slice(0, 2).join(' | '));
      f.ex.forEach((e) => console.log('     ' + e));
    });
    console.log('\n(mode titres : rien n\'a été écrit)');
    return;
  }

  /* Les vignettes de la série « LSF VocabThumb <mot> » servent d'image d'attente à la vidéo
     du même mot : on les met de côté d'abord, puis on les rattache. */
  const vignettes = {};
  for (const [titre, m] of meta) {
    const v = nu(titre).match(/^LSF VocabThumb\s+(.+)$/i);
    if (v && m.licence && LIBRES.test(m.licence.trim())) vignettes[v[1].trim().toLowerCase()] = m.url;
  }

  /* Les vidéos d'ENTRAÎNEMENT de la série LSF : « F et T » (deux lettres qu'on confond)
     et « chiffres abc » (lettres et chiffres mélangés). Ce ne sont pas des signes de mots :
     elles ont leur place à côté de l'alphabet, pas dans le dictionnaire. */
  const exercices = [];
  const signes = {}; const alphabet = {}; const familleEcartee = {}; let ecartesLicence = 0, ecartesTitre = 0;
  /* Distinction qui change tout : un fichier rejeté HORS des familles connues est du bruit
     (un cargo « FSL Hamburg », une fête du logiciel libre au Portugal). Un fichier rejeté
     DANS une famille connue est une VRAIE PERTE — un signe qui existe et qu'on n'a pas pris.
     On les nomme un par un avec la raison : sans ça, 18 vidéos de signes disparaissaient
     dans un compteur global, invisibles. */
  const CONNUE = /^(LL-Q33302|LSF )/i;
  const perdus = [];
  const perdu = (titre, pourquoi) => { if (CONNUE.test(nu(titre))) perdus.push(nu(titre) + '  ← ' + pourquoi); };
  for (const [titre, m] of meta) {
    if (!m.licence || !LIBRES.test(m.licence.trim())) { ecartesLicence++; perdu(titre, 'licence « ' + (m.licence || 'absente') + ' »'); continue; }
    /* Les .ogv de Commons sont annoncés « application/ogg » : sans cette ligne, 30 vidéos
       de vocabulaire étaient jetées en silence alors qu'elles sont parfaitement valables. */
    const type = /^video\//.test(m.mime) || /ogg/i.test(m.mime) ? 'video'
      : /^image\//.test(m.mime) ? 'image' : null;
    if (!type) { perdu(titre, 'type de fichier « ' + (m.mime || '?') + ' »'); continue; }

    const exo = nu(titre).match(/^LSF Exo\s+(.+)$/i);
    if (exo && type === 'video') {
      exercices.push({ quoi: exo[1].trim(), url: m.url, page: m.page, licence: m.licence, auteur: m.auteur });
      continue;
    }
    if (/^LSF (ExoThumb|VocabThumb)\s/i.test(nu(titre))) continue;   // vignettes : déjà utilisées comme image d'attente

    const lettre = lettreDuTitre(titre);
    if (lettre) {
      if (!alphabet[lettre])
        alphabet[lettre] = { lettre, type, url: m.url, vignette: m.vignette, page: m.page, licence: m.licence, auteur: m.auteur, titre };
      continue;
    }

    const r = motDuTitre(titre);
    if (!r) { ecartesTitre++;
      /* On ne se contente pas de compter ce qu'on jette : on note SOUS QUEL NOM, pour
         pouvoir dire ce qui reste dehors — et voir tout de suite si une famille entière
         (les chiffres, les accents…) passe à la trappe. Un rejet muet cache un manque. */
      const cle = nu(titre).split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      familleEcartee[cle] = (familleEcartee[cle] || 0) + 1;
      perdu(titre, 'nom illisible pour en tirer un mot sûr');
      continue; }
    const fiche = { mot: r.mot, type, signeur: r.signeur || null, url: m.url,
      vignette: vignettes[r.mot] || m.vignette || null, page: m.page,
      licence: m.licence, auteur: m.auteur || r.signeur || '', titre };
    const dejaLa = signes[r.mot];
    /* Une deuxième prise n'est jamais l'entrée principale : elle complète celle qui existe. */
    if (dejaLa && r.prise) {
      if ((dejaLa.variantes || []).length < 3) dejaLa.variantes = (dejaLa.variantes || []).concat([fiche]);
      continue;
    }
    if (!dejaLa) { signes[r.mot] = fiche; continue; }
    /* Un même mot signé par plusieurs personnes, c'est une richesse : on garde la vidéo en
       premier (un signe est un mouvement) et on range les autres comme variantes — voir
       un deuxième signeur, c'est comprendre ce qui compte vraiment dans le geste. */
    if (type === 'video' && dejaLa.type === 'image') {
      fiche.variantes = (dejaLa.variantes || []).concat([dejaLa]).slice(0, 2);
      delete dejaLa.variantes; signes[r.mot] = fiche;
    } else if ((dejaLa.variantes || []).length < 2 && fiche.signeur !== dejaLa.signeur) {
      dejaLa.variantes = (dejaLa.variantes || []).concat([fiche]);
    }
  }

  const res = {
    langue: 'LSF — langue des signes française',
    recolte_le: new Date().toISOString().slice(0, 10),
    d_ou: 'Wikimedia Commons, licences libres uniquement (CC0 / CC BY / CC BY-SA / domaine public)',
    regle: 'Aucun signe inventé : chaque entrée porte son fichier d\'origine, son auteur et sa licence.',
    categories: parCat,
    alphabet, signes, exercices,
  };
  const tous = Object.values(signes);
  console.log('\n📊 Résultat : ' + Object.keys(alphabet).length + ' lettre(s) d\'alphabet · '
    + tous.length + ' signe(s) attesté(s) · ' + exercices.length + ' vidéo(s) d\'entraînement');
  console.log('   dont ' + tous.filter((s) => s.type === 'video').length + ' en vidéo · '
    + tous.filter((s) => (s.variantes || []).length).length + ' avec un second signeur');
  console.log('   écartés : ' + ecartesLicence + ' (licence non libre) · ' + ecartesTitre + ' (nom de fichier hors des familles connues — on ne devine pas)');
  const parSigneur = {}; tous.forEach((s) => { const k = s.signeur || '(série LSF Vocab)'; parSigneur[k] = (parSigneur[k] || 0) + 1; });
  console.log('   signeurs : ' + Object.entries(parSigneur).sort((a, b) => b[1] - a[1])
    .slice(0, 8).map(([k, v]) => k + ' (' + v + ')').join(' · '));
  const parLicence = {}; tous.forEach((s) => { parLicence[s.licence] = (parLicence[s.licence] || 0) + 1; });
  console.log('   licences : ' + Object.entries(parLicence).map(([k, v]) => k + ' (' + v + ')').join(' · '));
  /* Ce qui reste dehors, NOMMÉ. C'est la seule façon de voir qu'une famille entière manque. */
  if (perdus.length) {
    console.log('\n⚠️  ' + perdus.length + ' fichier(s) d\'une famille CONNUE n\'ont pas été pris — à vérifier un par un (essai de tournage ? autre sens de « LSF » ? vrai signe manquant ?) :');
    perdus.sort().forEach((x) => console.log('     ' + x));
  } else console.log('\n✅ Aucun fichier d\'une famille connue n\'a été laissé de côté.');
  const dehors = Object.entries(familleEcartee).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (dehors.length) console.log('   restés dehors (par famille de nom) : ' + dehors.map(([k, v]) => '« ' + k + ' » ×' + v).join(' · '));
  const exemples = Object.keys(signes).sort().slice(0, 20);
  if (exemples.length) console.log('   exemples : ' + exemples.join(', '));
  if (Object.keys(alphabet).length) console.log('   lettres  : ' + Object.keys(alphabet).sort().join(' '));

  if (RAPPORT_SEUL) { console.log('\n(mode rapport : rien n\'a été écrit)'); return; }
  fs.writeFileSync(SORTIE, JSON.stringify(res, null, 1), 'utf8');
  console.log('\n💾 écrit : lingua/lsf-sources.json');
})();
