/* BEE MODIFIE L'ARBRE — comme Claude Code et Apex, mais derrière TON bouton ✅ (Kevin 15.10.2026 : « je veux qu'il puisse modifier, chercher,
 * arranger, etc., partout comme toi et Apex »).
 *
 * Où vivent les fiches : dans le nuage Firebase de l'arbre, sous /arbre/<empreinte du code famille>/persons/<id> — là où tous les appareils se
 * synchronisent (le plus récent `updatedAt` gagne). Bee écrit EXACTEMENT là, avec les mêmes précautions que l'outil de session
 * (tools/arbre/appliquer-nuage.mjs) et les règles de Kevin (« les modifications de tout le monde ne se perdent jamais ») :
 *   1. UNE ÉCRITURE = UNE ACTION CONFIRMÉE : l'IA propose, le serveur lit la fiche chez le nuage, fabrique le résumé (avant → après) avec les VRAIS noms,
 *      Kevin touche ✅ ; seulement alors le domaine écrit (signature 5 min, une seule fois, session admin prouvée — bee-agir.js) ;
 *   2. AJOUTER, jamais retirer : une info s'ajoute à celles qui existent ; un champ vide se remplit ; un champ DÉJÀ rempli ne change que si Kevin
 *      l'a demandé en toutes lettres (`remplacer`) — et l'ancienne valeur reste alors dans le tiroir de sauvegarde ; rien n'est supprimé ;
 *   3. COPIE AVANT CHAQUE ÉCRITURE : les champs touchés sont recopiés dans un tiroir à part (hors synchro, 40 gardées) et RELUS ; si la copie
 *      n'est pas relue, RIEN n'est écrit ;
 *   4. LE CONTRÔLE DES PERTES : l'écriture est refusée si elle ferait disparaître quoi que ce soit (nom, info, commentaire, source…) ;
 *   5. RELECTURE APRÈS : ce qui est écrit est relu ; s'il diffère, l'ancienne valeur est remise et Kevin est prévenu ;
 *   6. écriture CHAMP PAR CHAMP (PATCH) : les photos et les documents d'une fiche ne sont jamais réécrits ni même lus (temps de calcul gratuit) ;
 *   7. l'empreinte du code famille n'est ni écrite ni affichée nulle part (règle absolue : « le code ne s'écrit nulle part »).
 * Interrupteur BEE_ARBRE_ECRIRE = '0'. 0 €.
 * node services/kdmc-router/bee-arbre-ecrire.test.mjs */

export const FB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
export const FB_KEY = 'AIzaSyDciW-0sIIg9msdmgZjQHBksqzsfA6DCMs';   /* clé PUBLIQUE de l'app (déjà dans arbre/index.html) ; test:bee-arbre-ecrire vérifie qu'elle n'a pas dérivé */
export const TYPES_INFO = ['Téléphone', 'E-mail', 'Adresse postale', 'Réseau social', 'Site web', 'Anniversaire / Fête', 'Profession détaillée', 'Loisir', 'Santé', 'Autre', 'Champ libre'];
export const CHAMPS = ['naissance.date', 'naissance.lieu', 'deces.date', 'deces.lieu', 'metier', 'sexe'];
export const GARDES_MAX = 40;
const CHAMPS_LUS = ['id', 'prenom', 'nom', 'sexe', 'vivant', 'naissance', 'deces', 'metier', 'pere', 'mere', 'conjoints', 'infos', 'comments', 'notes', 'sources', 'updatedAt'];
const RE_ID = /^[A-Za-z0-9_-]{1,60}$/;
const RE_DATE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

export const RE_ARBRE_ECRIRE = /\b(?:ajoute|ajouter|compl[eè]te|compl[eé]ter|corrige|corriger|modifie|modifier|change|changer|met(?:s)? (?:à jour|a jour)|renseigne|renseigner|note|noter|rel(?:ie|ier)|rattache|cr[ée]e|cr[ée]er|arrange|arranger|range|ranger|fusionne|rectifie|remplis|remplir|enregistre)\b/i;

const propre = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_'’.,;:!?()«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const nomDe = (p) => ((p && p.prenom ? String(p.prenom) : '') + ' ' + (p && p.nom ? String(p.nom) : '')).trim() || '(sans nom)';
const sha256Hex = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
/* Firebase rend les clés d'un objet dans l'ordre alphabétique et ne garde ni les tableaux vides ni les null : on compare le CONTENU, pas l'ordre d'écriture. */
export function canon(x) {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) { const v = canon(x[k]); if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) o[k] = v; } return o; }
  return x;
}
const memeContenu = (a, b) => JSON.stringify(canon(a == null ? null : a)) === JSON.stringify(canon(b == null ? null : b));
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* La clé d'une info : EXACTEMENT celle de l'app (_cleInfo) — type + libellé + valeur, le téléphone sans espaces. */
export const nInfo = (s) => norm(s).replace(/[-_'’.,;:!?()«»"]/g, ' ').replace(/\s+/g, ' ').trim();
export function cleInfo(x) {
  if (!x || typeof x !== 'object') return '';
  const t = String(x.type == null ? '' : x.type).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const bas = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  let v = bas(x.valeur); if (t === 'telephone') v = v.replace(/[\s.\-()]/g, '');
  return t + '|' + bas(x.libelle) + '|' + v;
}
export function listeInfos(l) {
  const src = Array.isArray(l) ? l : (l && typeof l === 'object' ? Object.keys(l).map((k) => l[k]) : []);
  return src.filter((x) => x && typeof x === 'object' && String(x.valeur == null ? '' : x.valeur).trim());
}

/* ───────────────────────── le nuage (Firebase REST) ───────────────────────── */
/** `o` : { fetchFn, codehash: async () → 64 hex, now: () → ms }. Rend les opérations de lecture / écriture, toutes bornées dans le temps. */
export function nuage(o) {
  const F = o.fetchFn || fetch, now = o.now || Date.now;
  let _jeton = { v: '', exp: 0 }, _ch = '';
  async function appel(url, opt, ms) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 7000);
    try { return await F(url, Object.assign({ signal: c.signal }, opt || {})); } finally { clearTimeout(t); }
  }
  async function jeton() {
    if (_jeton.v && now() < _jeton.exp) return _jeton.v;
    const r = await appel('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB_KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.idToken) throw new Error('le nuage de l\'arbre refuse la connexion pour le moment');
    _jeton = { v: j.idToken, exp: now() + 45 * 60000 }; return _jeton.v;
  }
  async function ch() { if (_ch) return _ch; const c = String((await o.codehash()) || '').trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(c)) throw new Error('l\'arbre n\'est pas encore publié sur le domaine'); _ch = c; return c; }
  async function json(chemin, opt) {
    const tok = await jeton();
    const r = await appel(FB + chemin + (chemin.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(tok), opt);
    const t = await r.text();
    if (!r.ok) { const e = new Error('nuage HTTP ' + r.status); e.status = r.status; throw e; }
    return t ? JSON.parse(t) : null;
  }
  const base = async () => '/arbre/' + (await ch());
  const tiroir = async () => '/arbre/' + (await sha256Hex((await ch()) + ':sauvegardes'));
  return {
    /** Les champs utiles d'UNE fiche (jamais photos ni documents) ; null si la fiche n'existe pas. */
    async lire(id) {
      if (!RE_ID.test(String(id))) throw new Error('identifiant de fiche non valide');
      const b = await base();
      const vals = await Promise.all(CHAMPS_LUS.map((c) => json(b + '/persons/' + encodeURIComponent(id) + '/' + c + '.json')));
      const p = {}; CHAMPS_LUS.forEach((c, i) => { if (vals[i] != null) p[c] = vals[i]; });
      return p.prenom == null && p.nom == null && p.id == null ? null : p;
    },
    /** Écrit un PATCH sur une fiche existante, avec copie avant (relue), contrôle des pertes et relecture après. */
    async patcher(id, avant, patch, par) {
      const b = await base(), t = await tiroir();
      const cles = Object.keys(patch);
      if (!cles.length) throw new Error('rien à écrire');
      for (const c of cles) if (patch[c] === null || patch[c] === undefined) throw new Error('refus : une écriture ne supprime rien (' + c + ')');
      const pertes = trouverPertes(avant, Object.assign({}, avant, patch));
      if (pertes.length) throw new Error('écriture refusée, elle ferait perdre : ' + pertes.join(', '));
      /* 1. la copie, relue */
      const cle = 'b-' + String(now()).padStart(14, '0') + '-' + id;
      const copie = { ts: now(), id, par: par || 'bee', avant: Object.fromEntries(cles.map((c) => [c, avant[c] === undefined ? '' : avant[c]])), patch };
      await json(t + '/' + cle + '.json', { method: 'PUT', body: JSON.stringify(copie) });
      const relue = await json(t + '/' + cle + '/id.json');
      if (relue !== id) throw new Error('la copie de sauvegarde n\'a pas été relue : RIEN n\'a été écrit');
      /* 2. l'écriture, champ par champ */
      const charge = Object.assign({}, patch, { updatedAt: now(), updatedBy: 'Kevin (via Bee)' });
      await json(b + '/persons/' + encodeURIComponent(id) + '.json', { method: 'PATCH', body: JSON.stringify(charge) });
      /* 3. relecture : ce qui est écrit est ce qu'on voulait ; sinon on REMET l'ancien */
      for (const c of cles) {
        const lu = await json(b + '/persons/' + encodeURIComponent(id) + '/' + c + '.json');
        if (!memeContenu(lu, patch[c])) {
          /* on REMET l'ancien : un champ qui n'existait pas avant est retiré (null = champ effacé chez Firebase), jamais rempli de vide */
          const remise = Object.fromEntries(cles.map((k) => [k, avant[k] === undefined ? null : avant[k]]));
          try { await json(b + '/persons/' + encodeURIComponent(id) + '.json', { method: 'PATCH', body: JSON.stringify(remise) }); } catch (_) { /* on le dit quand même */ }
          throw new Error('la relecture ne correspond pas à ce qui devait être écrit : l\'ancienne valeur a été remise');
        }
      }
      /* 4. on ne garde que GARDES_MAX copies */
      try {
        const toutes = Object.keys((await json(t + '.json?shallow=true')) || {}).filter((k) => k.indexOf('b-') === 0).sort();
        for (const k of toutes.slice(0, Math.max(0, toutes.length - GARDES_MAX))) await json(t + '/' + k + '.json', { method: 'DELETE' });
      } catch (_) { /* le ménage des vieilles copies ne bloque jamais */ }
      return { copie: cle };
    },
    /** Crée UNE fiche neuve (jamais par-dessus une fiche existante). */
    async creer(id, fiche) {
      const b = await base();
      if (await json(b + '/persons/' + encodeURIComponent(id) + '/prenom.json') != null || await json(b + '/persons/' + encodeURIComponent(id) + '/nom.json') != null) throw new Error('cette fiche existe déjà : rien n\'est écrit');
      await json(b + '/persons/' + encodeURIComponent(id) + '.json', { method: 'PUT', body: JSON.stringify(fiche) });
      const relu = await json(b + '/persons/' + encodeURIComponent(id) + '/id.json');
      if (relu !== id) throw new Error('la nouvelle fiche n\'a pas été relue');
    },
  };
}

/** Une écriture ne doit rien faire DISPARAÎTRE (noms, infos, commentaires, sources, notes, liens). */
export function trouverPertes(avant, apres) {
  const out = [];
  for (const c of Object.keys(avant || {})) {
    const a = avant[c], b = (apres || {})[c];
    if (a == null || a === '') continue;
    if (b == null || b === '') { out.push(c + ' effacé'); continue; }
    if (Array.isArray(a) || (typeof a === 'object' && a)) {
      const la = Array.isArray(a) ? a : Object.keys(a).map((k) => a[k]);
      const lb = Array.isArray(b) ? b : Object.keys(b).map((k) => b[k]);
      if (lb.length < la.length) out.push(c + ' ' + la.length + '→' + lb.length);
    }
  }
  const ia = new Set(listeInfos(apres && apres.infos).map(cleInfo));
  const perdues = listeInfos(avant && avant.infos).filter((x) => !ia.has(cleInfo(x)));
  if (perdues.length) out.push('infos perdues : ' + perdues.length);
  return out;
}

/* ───────────────────────── les opérations (pures : fiche d'avant + demande → patch + phrase) ───────────────────────── */
const CIBLES_LIENS = { pere: 'père', mere: 'mère', conjoint: 'conjoint(e)', enfant: 'enfant' };
const libChamp = { 'naissance.date': 'sa date de naissance', 'naissance.lieu': 'son lieu de naissance', 'deces.date': 'sa date de décès', 'deces.lieu': 'son lieu de décès', metier: 'son métier', sexe: 'son sexe' };

export function preparerInfo(avant, c) {
  const type = TYPES_INFO.find((t) => norm(t) === norm(c.type));
  if (!type) return { erreur: 'Type d\'info inconnu. Types : ' + TYPES_INFO.join(', ') + '.' };
  const valeur = propre(c.valeur, 500); if (!valeur) return { erreur: 'Il manque la valeur de l\'info.' };
  const info = { type, libelle: propre(c.libelle, 80), valeur, par: 'Kevin (via Bee)', le: Date.now() };
  const existantes = listeInfos(avant.infos);
  if (existantes.some((x) => cleInfo(x) === cleInfo(info))) return { erreur: 'Cette info existe déjà sur la fiche : rien à ajouter.' };
  const suite = existantes.concat([info]);
  return { patch: { infos: suite }, phrase: 'AJOUTER à la fiche de ' + nomDe(avant) + ' : ' + type + (info.libelle ? ' (' + info.libelle + ')' : '') + ' → ' + valeur + '. Les infos déjà là restent.' };
}
export function preparerChamp(avant, c) {
  const champ = String(c.champ || '').trim();
  if (!CHAMPS.includes(champ)) return { erreur: 'Champ inconnu. Champs possibles : ' + CHAMPS.join(', ') + '.' };
  let valeur = propre(c.valeur, 80); if (!valeur) return { erreur: 'Il manque la valeur.' };
  if (champ.endsWith('.date') && !RE_DATE.test(valeur)) return { erreur: 'Écris la date sous la forme AAAA-MM-JJ (ou AAAA-MM, ou l\'année seule).' };
  if (champ === 'sexe') { valeur = /^f/i.test(valeur) ? 'F' : /^(m|h)/i.test(valeur) ? 'M' : ''; if (!valeur) return { erreur: 'Le sexe est « M » ou « F ».' }; }
  const [g, s] = champ.split('.');
  const actuel = s ? (avant[g] && avant[g][s]) : avant[g];
  const rempli = actuel != null && String(actuel).trim() !== '';
  if (rempli && String(actuel) === valeur) return { erreur: 'C\'est déjà ' + libChamp[champ] + ' : « ' + actuel + ' ».' };
  if (rempli && !c.remplacer) return { erreur: 'Ce champ est déjà rempli (« ' + actuel + ' »). Je ne remplace une valeur que si Kevin le demande en toutes lettres (« remplace… par… ») : redemande avec remplacer.' };
  const patch = {};
  if (s) { patch[g] = Object.assign({}, avant[g] && typeof avant[g] === 'object' ? avant[g] : {}, { [s]: valeur }); } else patch[g] = valeur;
  if (g === 'deces' && avant.vivant !== false) patch.vivant = false;
  const nom = nomDe(avant);
  return { patch, phrase: (rempli ? 'REMPLACER ' + libChamp[champ] + ' de ' + nom + ' : « ' + actuel + ' » → « ' + valeur + ' » (l\'ancienne valeur reste dans le tiroir de sauvegarde).' : 'RENSEIGNER ' + libChamp[champ] + ' de ' + nom + ' : « ' + valeur + ' ».') + (patch.vivant === false && avant.vivant !== false ? ' (La fiche passe en « décédé(e) ».)' : '') };
}
export function preparerCommentaire(avant, c) {
  const texte = propre(c.texte, 600); if (!texte) return { erreur: 'Il manque le texte du commentaire.' };
  const l = Array.isArray(avant.comments) ? avant.comments : (avant.comments && typeof avant.comments === 'object' ? Object.keys(avant.comments).map((k) => avant.comments[k]) : []);
  const nouveau = { id: uid(), text: texte, by: 'Kevin (via Bee)', ts: Date.now() };
  return { patch: { comments: l.concat([nouveau]) }, phrase: 'AJOUTER un commentaire à la fiche de ' + nomDe(avant) + ' : « ' + texte + ' ». Les commentaires déjà là restent.' };
}

/** Relier / créer : rend { ecritures: [{id, patch}], creations: [{id, fiche}], phrase } ; `autre` = la fiche liée (existante) ou null (à créer). */
export function preparerLien(avant, idAvant, c, autre, idAutre, doublon) {
  const lien = String(c.lien || '').trim().toLowerCase();
  if (!CIBLES_LIENS[lien]) return { erreur: 'Lien inconnu : père, mère, conjoint ou enfant.' };
  const creer = !idAutre;
  let nouv = null;
  if (creer) {
    const prenom = propre(c.prenom, 40), nom = propre(c.nom, 60);
    if (!prenom && !nom) return { erreur: 'Il manque le prénom ou le nom de la nouvelle personne.' };
    if (doublon) return { erreur: nomDe({ prenom, nom }) + ' est déjà dans l\'arbre (' + doublon + ') : demande-moi de les RELIER plutôt que de créer un doublon.' };
    const sexeImp = lien === 'pere' ? 'M' : lien === 'mere' ? 'F' : '';
    const sexeDem = /^f/i.test(String(c.sexe || '')) ? 'F' : /^(m|h)/i.test(String(c.sexe || '')) ? 'M' : '';
    nouv = { id: uid(), prenom, nom, sexe: sexeImp || sexeDem || '', conjoints: [], photos: [], sources: [], comments: [], notes: '', updatedAt: Date.now(), updatedBy: 'Kevin (via Bee)' };
    if (RE_DATE.test(propre(c.naissance_date, 12))) nouv.naissance = { date: propre(c.naissance_date, 12) };
    idAutre = nouv.id; autre = nouv;
  }
  const ecritures = [], nomAutre = nomDe(autre), nomAvant = nomDe(avant);
  if (lien === 'pere' || lien === 'mere') {
    const cle = lien;
    if (avant[cle] && String(avant[cle]).trim()) return { erreur: nomAvant + ' a déjà un ' + (lien === 'pere' ? 'père' : 'mère') + ' enregistré(e) : je ne le remplace pas.' };
    if (autre.sexe && ((lien === 'pere' && autre.sexe === 'F') || (lien === 'mere' && autre.sexe === 'M'))) return { erreur: nomAutre + ' est ' + (autre.sexe === 'F' ? 'une femme' : 'un homme') + ' : ce lien est incohérent.' };
    ecritures.push({ id: idAvant, patch: { [cle]: idAutre } });
  } else if (lien === 'enfant') {
    const cle = avant.sexe === 'M' ? 'pere' : avant.sexe === 'F' ? 'mere' : '';
    if (!cle) return { erreur: 'Je ne sais pas si ' + nomAvant + ' est le père ou la mère : renseigne d\'abord son sexe.' };
    if (autre[cle] && String(autre[cle]).trim() && autre[cle] !== idAvant) return { erreur: nomAutre + ' a déjà un ' + (cle === 'pere' ? 'père' : 'mère') + ' différent enregistré : je ne le remplace pas.' };
    if (creer) nouv[cle] = idAvant; else ecritures.push({ id: idAutre, patch: { [cle]: idAvant } });
  } else {
    const cj = (l) => (Array.isArray(l) ? l : (l && typeof l === 'object' ? Object.keys(l).map((k) => l[k]) : [])).filter(Boolean);
    const a = cj(avant.conjoints), b = cj(autre.conjoints);
    if (a.includes(idAutre) && b.includes(idAvant)) return { erreur: nomAvant + ' et ' + nomAutre + ' sont déjà liés comme conjoints.' };
    if (creer) nouv.conjoints = [idAvant]; else if (!b.includes(idAvant)) ecritures.push({ id: idAutre, patch: { conjoints: b.concat([idAvant]) } });
    if (!a.includes(idAutre)) ecritures.push({ id: idAvant, patch: { conjoints: a.concat([idAutre]) } });
  }
  const phrase = (creer ? 'CRÉER la fiche de ' + nomAutre + ' et la relier' : 'RELIER ' + nomAutre + ' à') + ' ' + (creer ? 'à ' : '') + nomAvant + ' comme ' + (lien === 'enfant' ? 'enfant' : lien === 'conjoint' ? 'conjoint(e)' : lien === 'pere' ? 'père' : 'mère') + (lien === 'enfant' ? ' (de ' + nomAvant + ')' : lien === 'pere' || lien === 'mere' ? ' de ' + nomAvant : '') + '. Rien n\'est supprimé.';
  return { ecritures, creations: nouv ? [{ id: nouv.id, fiche: nouv }] : [], phrase, nouvelId: nouv ? nouv.id : null };
}

/* ───────────────────────── les ACTIONS (catalogue signé de bee-agir.js) ───────────────────────── */
async function fiche(ctx, id) {
  if (!ctx || !ctx.arbre) return { erreur: 'Je ne peux pas joindre le nuage de l\'arbre pour le moment.' };
  let p; try { p = await ctx.arbre.lire(id); } catch (e) { return { erreur: 'Je n\'arrive pas à lire la fiche (' + String(e && e.message || e).slice(0, 80) + ').' }; }
  return p ? { p } : { erreur: 'Je ne trouve aucune fiche avec cet identifiant (' + propre(id, 60) + ') : cherche d\'abord la personne avec l\'outil arbre.' };
}
const idDe = (c) => propre(c && c.id, 60);

export const ACTIONS_ARBRE = {
  arbre_info: {
    titre: 'Ajouter une info à une fiche de l\'arbre', icone: '🌳', risque: 'moyen',
    aide: 'champs : id (identifiant de la fiche, donné par l\'outil arbre), type (Téléphone, E-mail, Adresse postale, Réseau social, Site web, Anniversaire / Fête, Profession détaillée, Loisir, Santé, Autre, Champ libre), libelle (facultatif), valeur',
    valider(c) { return RE_ID.test(idDe(c)) ? { champs: { id: idDe(c), type: propre(c.type, 40), libelle: propre(c.libelle, 80), valeur: propre(c.valeur, 500) } } : { erreur: 'Il manque l\'identifiant de la fiche : cherche la personne avec l\'outil arbre.' }; },
    async enrichir(c, ctx) { const f = await fiche(ctx, c.id); if (f.erreur) return f; const r = preparerInfo(f.p, c); return r.erreur ? r : { champs: Object.assign({}, c, { phrase: r.phrase }) }; },
    resume: (c) => c.phrase,
    async executer(env, c, o) { return ecrire(o, c, preparerInfo); },
  },
  arbre_champ: {
    titre: 'Renseigner ou corriger une fiche de l\'arbre', icone: '✏️', risque: 'moyen',
    aide: 'champs : id, champ (naissance.date, naissance.lieu, deces.date, deces.lieu, metier, sexe), valeur (date AAAA-MM-JJ), remplacer (true seulement si Kevin demande de REMPLACER une valeur déjà là)',
    valider(c) { return RE_ID.test(idDe(c)) ? { champs: { id: idDe(c), champ: propre(c.champ, 30), valeur: propre(c.valeur, 80), remplacer: c.remplacer === true } } : { erreur: 'Il manque l\'identifiant de la fiche : cherche la personne avec l\'outil arbre.' }; },
    async enrichir(c, ctx) { const f = await fiche(ctx, c.id); if (f.erreur) return f; const r = preparerChamp(f.p, c); return r.erreur ? r : { champs: Object.assign({}, c, { phrase: r.phrase }) }; },
    resume: (c) => c.phrase,
    async executer(env, c, o) { return ecrire(o, c, preparerChamp); },
  },
  arbre_commentaire: {
    titre: 'Ajouter un commentaire à une fiche de l\'arbre', icone: '💬', risque: 'faible',
    aide: 'champs : id, texte',
    valider(c) { return RE_ID.test(idDe(c)) ? { champs: { id: idDe(c), texte: propre(c.texte, 600) } } : { erreur: 'Il manque l\'identifiant de la fiche : cherche la personne avec l\'outil arbre.' }; },
    async enrichir(c, ctx) { const f = await fiche(ctx, c.id); if (f.erreur) return f; const r = preparerCommentaire(f.p, c); return r.erreur ? r : { champs: Object.assign({}, c, { phrase: r.phrase }) }; },
    resume: (c) => c.phrase,
    async executer(env, c, o) { return ecrire(o, c, preparerCommentaire); },
  },
  arbre_lien: {
    titre: 'Relier ou créer un proche dans l\'arbre', icone: '🔗', risque: 'moyen',
    aide: 'champs : id (la fiche de départ), lien (pere, mere, conjoint, enfant), id2 (une fiche EXISTANTE à relier) OU prenom + nom (+ sexe, naissance_date) pour CRÉER la personne',
    valider(c) {
      if (!RE_ID.test(idDe(c))) return { erreur: 'Il manque l\'identifiant de la fiche de départ : cherche la personne avec l\'outil arbre.' };
      const id2 = propre(c.id2, 60); if (id2 && !RE_ID.test(id2)) return { erreur: 'Identifiant de la 2ᵉ fiche non valide.' };
      return { champs: { id: idDe(c), lien: propre(c.lien, 12).toLowerCase(), id2, prenom: propre(c.prenom, 40), nom: propre(c.nom, 60), sexe: propre(c.sexe, 3), naissance_date: propre(c.naissance_date, 12) } };
    },
    async enrichir(c, ctx) {
      const f = await fiche(ctx, c.id); if (f.erreur) return f;
      let autre = null, doublon = '';
      if (c.id2) { const g = await fiche(ctx, c.id2); if (g.erreur) return g; autre = g.p; }
      else if (ctx.doublon) doublon = (await ctx.doublon(c.prenom, c.nom)) || '';
      const r = preparerLien(f.p, c.id, c, autre, c.id2 || '', doublon); return r.erreur ? r : { champs: Object.assign({}, c, { phrase: r.phrase }) };
    },
    resume: (c) => c.phrase,
    async executer(env, c, o) {
      const cl = o && o.arbre; if (!cl) return { ok: false, texte: 'Le nuage de l\'arbre est injoignable.' };
      let f, g = null;
      try { f = await cl.lire(c.id); if (c.id2) g = await cl.lire(c.id2); } catch (e) { return { ok: false, texte: 'Lecture impossible : ' + String(e && e.message || e).slice(0, 80) }; }
      if (!f || (c.id2 && !g)) return { ok: false, texte: 'Une des fiches n\'existe plus : rien n\'a été écrit.' };
      const r = preparerLien(f, c.id, c, g, c.id2 || '', '');
      if (r.erreur) return { ok: false, texte: r.erreur + ' Rien n\'a été écrit.' };
      try {
        for (const x of r.creations) await cl.creer(x.id, x.fiche);
        for (const w of r.ecritures) { const av = w.id === c.id ? f : g || {}; await cl.patcher(w.id, av, w.patch, 'bee'); }
      } catch (e) { return { ok: false, texte: 'Écriture interrompue : ' + String(e && e.message || e).slice(0, 140) + '. Rien n\'a été supprimé ; vérifie la fiche.' }; }
      return { ok: true, texte: '🔗 C\'est fait : ' + r.phrase.replace(/^[A-ZÉ]+ /, '').replace(/\. Rien n'est supprimé\.$/, '') + '. Une copie de sauvegarde est gardée.' };
    },
  },
};
export const NOMS_ACTIONS_ARBRE = Object.keys(ACTIONS_ARBRE);

async function ecrire(o, c, preparer) {
  const cl = o && o.arbre; if (!cl) return { ok: false, texte: 'Le nuage de l\'arbre est injoignable.' };
  let p; try { p = await cl.lire(c.id); } catch (e) { return { ok: false, texte: 'Lecture impossible : ' + String(e && e.message || e).slice(0, 80) }; }
  if (!p) return { ok: false, texte: 'Cette fiche n\'existe plus : rien n\'a été écrit.' };
  const r = preparer(p, c);
  if (r.erreur) return { ok: false, texte: r.erreur + ' Rien n\'a été écrit.' };
  try { await cl.patcher(c.id, p, r.patch, 'bee'); } catch (e) { return { ok: false, texte: 'Pas écrit : ' + String(e && e.message || e).slice(0, 160) }; }
  return { ok: true, texte: '🌳 C\'est fait : ' + r.phrase.replace(/^[A-ZÉ]+ /, '') + ' Une copie de sauvegarde est gardée.' };
}

/* ───────────────────────── les outils de LECTURE pour arranger : qu'est-ce qui manque, où sont les doublons ───────────────────────── */
export function auditerSeed(seed, critere, max) {
  const P = (seed && seed.persons) || {}; const ids = Object.keys(P); const k = Math.min(Math.max(+max || 8, 1), 15);
  const nom = (id) => nomDe(P[id]) + ' [id : ' + id + ']';
  const parNom = {}; ids.forEach((id) => { const n = norm(nomDe(P[id])); (parNom[n] = parNom[n] || []).push(id); });
  const manques = {
    'sans date de naissance': ids.filter((id) => !(P[id].naissance && P[id].naissance.date)),
    'sans parents': ids.filter((id) => !P[id].pere && !P[id].mere),
    'sans sexe': ids.filter((id) => !P[id].sexe),
    'décédés sans date de décès': ids.filter((id) => P[id].vivant === false && !(P[id].deces && P[id].deces.date)),
    'sans métier': ids.filter((id) => !P[id].metier),
  };
  const dbl = Object.keys(parNom).filter((n) => n && parNom[n].length > 1);
  const asym = ids.filter((id) => (Array.isArray(P[id].conjoints) ? P[id].conjoints : []).some((c) => P[c] && !(Array.isArray(P[c].conjoints) ? P[c].conjoints : []).includes(id)));
  const L = ['Bilan de l\'arbre (' + ids.length + ' personnes) :'];
  for (const [t, l] of Object.entries(manques)) L.push('• ' + l.length + ' ' + t);
  L.push('• ' + dbl.length + ' nom(s) en double' + ', ' + asym.length + ' lien(s) de couple à sens unique');
  const c = norm(critere || '');
  const choisi = /date|naiss/.test(c) ? 'sans date de naissance' : /parent|pere|mere/.test(c) ? 'sans parents' : /sexe/.test(c) ? 'sans sexe' : /deces|decede/.test(c) ? 'décédés sans date de décès' : /metier|profession/.test(c) ? 'sans métier' : '';
  if (choisi) L.push('', 'Exemples « ' + choisi + ' » :', ...manques[choisi].slice(0, k).map((id) => '  - ' + nom(id)));
  else if (/doubl/.test(c)) L.push('', 'Doublons :', ...dbl.slice(0, k).map((n) => '  - ' + parNom[n].map(nom).join(' = ')));
  else if (/sens|couple|conjoint/.test(c)) L.push('', 'Couples à sens unique :', ...asym.slice(0, k).map((id) => '  - ' + nom(id)));
  return L.join('\n');
}

/** Le doublon éventuel d'un nom complet dans la graine : « Prénom Nom [id : …] » ou ''. */
export function chercherDoublon(seed, prenom, nom) {
  const P = (seed && seed.persons) || {}, cible = norm(nomDe({ prenom, nom }));
  if (!cible || cible === '(sans nom)') return '';
  const id = Object.keys(P).find((k) => P[k] && norm(nomDe(P[k])) === cible);
  return id ? nomDe(P[id]) + ' [id : ' + id + ']' : '';
}
/** Les outils de lecture « arranger » + le doublon, à brancher à côté de l'outil arbre. `lireSeed()` rend la graine ou null. */
export function outilsBilan(lireSeed) {
  return { defs: DEFINITIONS_ARBRE_ECRIRE, exe: { arbre_bilan: async (a) => { const seed = await lireSeed(); if (!seed || !seed.persons) throw new Error('l\'arbre n\'est pas encore publié sur le domaine'); return auditerSeed(seed, a && a.critere); } } };
}

export const DEFINITIONS_ARBRE_ECRIRE = [
  { name: 'arbre_bilan', description: 'Le bilan de l\'ARBRE DE FAMILLE : combien de fiches sans date de naissance, sans parents, sans sexe, sans métier, décédés sans date, noms en double, couples à sens unique — avec des exemples et leur identifiant. À utiliser pour « qu\'est-ce qui manque dans l\'arbre ? », « arrange l\'arbre », « range les fiches ».',
    parameters: { type: 'object', properties: { critere: { type: 'string', description: 'facultatif : date de naissance, parents, sexe, décès, métier, doublons, couples' } }, required: [] } },
];
export const REGLES_ARBRE_ECRIRE = ' Tu peux MODIFIER l\'arbre, avec le bouton ✅ de Kevin : arbre_info (ajouter un téléphone, un e-mail, une adresse… à une fiche), arbre_champ (renseigner une date, un lieu, un métier, le sexe ; remplacer une valeur déjà là SEULEMENT si Kevin dit « remplace »), arbre_commentaire, arbre_lien (relier deux personnes ou en créer une : père, mère, conjoint, enfant). '
  + 'Procède ainsi : 1) cherche la personne avec l\'outil arbre pour avoir son identifiant (jamais deviné) ; 2) appelle proposer_action ; 3) dis « j\'ai préparé… confirme avec le bouton ». Tu ne supprimes JAMAIS une fiche, une info ni un lien : tu ajoutes et tu complètes ; une copie de sauvegarde est faite avant chaque écriture. '
  + 'Pour « arranger » ou « ranger », commence par arbre_bilan (ce qui manque, les doublons), puis propose les corrections UNE PAR UNE, en demandant à Kevin quand une info n\'est pas dans l\'arbre ; ne devine jamais une date, un lieu ou un lien de parenté : une valeur vient de Kevin ou d\'un document, jamais de toi.';
