/* L'ATELIER DE BEE : documents, agenda, brouillon de mail, images — gratuit, pour Kevin SEUL (Kevin 17.10 : « qu'elle gère les mails, l'agenda, les documents, les
 * images, etc. Je veux la parité totale… Rappelle-toi qu'elle n'est que pour moi, dans toutes les applications, dans tout le domaine. Personne d'autre, tant que je ne
 * l'ai pas dit »).
 *
 * COMMENT, 0 € et sans nouvelle porte : ces outils ne s'ouvrent que dans /__javis/ai (session admin PROUVÉE par le domaine) ; ils ne font QUE préparer des « cartes » que le
 * widget affiche — rien n'est envoyé, rien n'est stocké côté serveur, rien ne sort du domaine :
 *   · `fichier`        un document (texte, Markdown, CSV, JSON, HTML nettoyé, agenda .ics, contact .vcf) que Kevin TÉLÉCHARGE d'un toucher ;
 *   · `agenda`         un rendez-vous au format .ics (l'iPhone propose « Ajouter au calendrier ») ;
 *   · `brouillon_mail` un mail PRÉ-REMPLI : un lien mailto:, Kevin l'envoie lui-même depuis son app Mail (Bee n'envoie jamais) ;
 *   · `image`          une image générée par Workers AI (FLUX, palier gratuit du compte), affichée dans la bulle, téléchargeable.
 * SÉCURITÉ : taille bornée, noms de fichiers nettoyés, formats en liste blanche, le HTML est assaini (ni script, ni cadre, ni on…=, ni javascript:), un fichier est
 * toujours TÉLÉCHARGÉ (jamais ouvert dans le domaine : pas d'exécution possible), mailto: seulement, adresses vérifiées. Le widget REVÉRIFIE tout.
 * Interrupteur BEE_ATELIER = '0'. node services/kdmc-router/bee-atelier.test.mjs */

export const MAX_CARTES = 4;
export const MAX_TEXTE = 120000;
export const MAX_IMAGE = 900000;               // caractères base64 (≈ 650 Ko)
export const MODELE_IMAGE = '@cf/black-forest-labs/flux-1-schnell';
export const FORMATS = { txt: 'texte', md: 'Markdown', csv: 'tableau CSV', json: 'JSON', html: 'page HTML', ics: 'agenda', vcf: 'contact' };
export const RE_ATELIER = /(?<![A-Za-z0-9\u00C0-\u017F])(?:document|fichier|t[eé]l[eé]charg\w*|exporte\w*|lettre|cv|contrat|devis|facture|tableau|csv|excel|word|pdf|agenda|calendrier|rendez[- ]?vous|rdv|r[eé]union|[eé]v[eéè]nement|ics|brouillon|vcard|vcf|images?|dessin\w*|illustr\w*|logo|affiche|visuel|(?:[eé]cris|[eé]crire|envoie\w*|pr[eé]pare\w*|r[eé]dige\w*|r[eé]ponds?|r[eé]pondre|fais|faire)\s+(?:[aà]\s+\w+\s+)?(?:un\s+|le\s+|ce\s+|son\s+|mon\s+)?(?:mail|e-?mail|courriel|courrier|message))\b/i;

export const REGLES_ATELIER = ' ATELIER : document → `fichier` (contenu COMPLET) ; rendez-vous daté → `agenda` ; mail → `brouillon_mail` (Kevin l\'envoie, tu n\'envoies RIEN) ; image → `image` (prompt en anglais). '
  + 'Les boutons apparaissent tout seuls : n\'y recopie pas le document, dis en une phrase ce que tu as préparé. Jamais « je ne peux pas créer de fichier / d\'image / d\'événement ». Dates : 2026-10-20T14:30 (Monaco).';

const s = (v, n) => String(v == null ? '' : v).slice(0, n);

/* ───── noms et formats ───── */
export function nomFichier(nom, ext) {
  const e = FORMATS[String(ext || '').toLowerCase()] ? String(ext).toLowerCase() : 'txt';
  let base = String(nom || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 60).replace(/[.-]+$/, '');
  if (!base) base = 'document';
  return base + '.' + e;
}
/* Le HTML qu'on remet à Kevin est un fichier à enregistrer, mais on le nettoie quand même : ni script, ni cadre, ni objet, ni gestionnaire on…=, ni javascript:. */
export function assainirHtml(t) {
  let x = String(t || '');
  for (let i = 0; i < 3; i++) {
    x = x.replace(/<\s*(script|iframe|object|embed|frame|frameset|applet|base|link|meta|form|style)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi, '')
      .replace(/<\s*(?:script|iframe|object|embed|frame|frameset|applet|base|link|meta|form|style)\b[^>]*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(?:href|src|action|formaction|xlink:href)\s*=\s*(["']?)\s*(?:javascript|vbscript|data)\s*:[^"'>\s]*\1/gi, '');
  }
  return x;
}
const echapIcs = (t) => String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
function plier(ligne) {
  const out = []; let l = ligne;
  while (octets(l) > 74) { let c = 74; while (octets(l.slice(0, c)) > 74) c--; out.push(l.slice(0, c)); l = ' ' + l.slice(c); }
  out.push(l); return out.join('\r\n');
}
function octets(t) { let n = 0; for (const ch of String(t)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; }

/* ───── agenda (.ics) ───── */
export function lireDate(v) {
  const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, a, mo, j, h, mi] = m; const An = +a, Mo = +mo, Jo = +j;
  const d = new Date(Date.UTC(An, Mo - 1, Jo));
  if (d.getUTCFullYear() !== An || d.getUTCMonth() !== Mo - 1 || d.getUTCDate() !== Jo) return null;
  if (h != null && (+h > 23 || +mi > 59)) return null;
  return { An, Mo, Jo, h: h == null ? null : +h, mi: h == null ? null : +mi, ms: Date.UTC(An, Mo - 1, Jo, h == null ? 0 : +h, h == null ? 0 : +mi) };
}
const p2 = (n) => String(n).padStart(2, '0');
const fmtLocal = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '00'; };
const fmtJour = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()); };
export function construireIcs(a, maintenant) {
  const deb = lireDate(a && a.debut);
  if (!deb) throw new Error('date de début illisible : donne 2026-10-20 ou 2026-10-20T14:30');
  const titre = s(a.titre, 120).trim(); if (!titre) throw new Error('il manque le titre du rendez-vous');
  const toute = deb.h == null;
  let fin = a.fin ? lireDate(a.fin) : null;
  if (a.fin && !fin) throw new Error('date de fin illisible');
  const duree = Math.max(5, Math.min(24 * 60 * 14, Math.round(+a.duree_minutes || 60)));
  const finMs = fin ? fin.ms : toute ? deb.ms + 86400000 : deb.ms + duree * 60000;
  if (finMs <= deb.ms) throw new Error('la fin doit être après le début');
  const t = new Date(maintenant == null ? Date.now() : maintenant);
  const stamp = t.getUTCFullYear() + p2(t.getUTCMonth() + 1) + p2(t.getUTCDate()) + 'T' + p2(t.getUTCHours()) + p2(t.getUTCMinutes()) + p2(t.getUTCSeconds()) + 'Z';
  const uid = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Date.now())) + '@kd-mc.com';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kd-mc.com//Bee//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp,
    toute ? 'DTSTART;VALUE=DATE:' + fmtJour(deb.ms) : 'DTSTART:' + fmtLocal(deb.ms), toute ? 'DTEND;VALUE=DATE:' + fmtJour(finMs) : 'DTEND:' + fmtLocal(finMs),
    'SUMMARY:' + echapIcs(titre)];
  if (a.lieu) L.push('LOCATION:' + echapIcs(s(a.lieu, 200)));
  if (a.description) L.push('DESCRIPTION:' + echapIcs(s(a.description, 2000)));
  const rap = a.rappel_minutes == null ? 30 : Math.max(0, Math.min(60 * 24 * 14, Math.round(+a.rappel_minutes) || 0));
  if (rap > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + echapIcs(titre), 'TRIGGER:-PT' + rap + 'M', 'END:VALARM');
  L.push('END:VEVENT', 'END:VCALENDAR');
  return L.map(plier).join('\r\n') + '\r\n';
}

/* ───── contact (.vcf) ───── */
export function construireVcf(c) {
  const nom = s(c && c.nom, 100).trim(); if (!nom) throw new Error('il manque le nom du contact');
  const L = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + echapIcs(nom), 'N:' + echapIcs(nom) + ';;;;'];
  if (c.telephone) L.push('TEL;TYPE=CELL:' + s(c.telephone, 30).replace(/[^0-9+ ().-]/g, ''));
  if (c.email && ADRESSE.test(String(c.email).trim())) L.push('EMAIL:' + String(c.email).trim());
  if (c.societe) L.push('ORG:' + echapIcs(s(c.societe, 100)));
  if (c.note) L.push('NOTE:' + echapIcs(s(c.note, 500)));
  L.push('END:VCARD');
  return L.map(plier).join('\r\n') + '\r\n';
}

/* ───── mail (brouillon) ───── */
export const ADRESSE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export function construireMailto(m) {
  const liste = (v) => String(v == null ? '' : v).split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
  const a = liste(m && m.a), cc = liste(m && m.cc);
  if (!a.length) throw new Error('il manque l\'adresse du destinataire');
  for (const x of a.concat(cc)) if (!ADRESSE.test(x)) throw new Error('adresse invalide : ' + s(x, 60));
  if (a.length + cc.length > 10) throw new Error('trop de destinataires');
  const q = [];
  if (cc.length) q.push('cc=' + encodeURIComponent(cc.join(',')));
  if (m.objet) q.push('subject=' + encodeURIComponent(s(m.objet, 200)));
  if (m.corps) q.push('body=' + encodeURIComponent(s(m.corps, 1500)));
  const url = 'mailto:' + a.map(encodeURIComponent).join(',').replace(/%40/g, '@') + (q.length ? '?' + q.join('&') : '');
  return { url, a, cc };
}

/* ───── les outils ───── */
function ajouter(sortie, carte) {
  const l = (sortie.cartes = sortie.cartes || []);
  if (l.length >= MAX_CARTES) throw new Error('assez de pièces pour cette réponse (' + MAX_CARTES + ' au plus) : propose le reste ensuite');
  l.push(carte);
}
/* o.ia : (prompt) => Promise<string base64 JPEG> ; absent → pas d'outil image. */
export function outilsAtelier(o, sortie) {
  const defs = [
    { name: 'fichier', description: 'Crée un document que Kevin télécharge (lettre, tableau, compte rendu, contact .vcf…).',
      parameters: { type: 'object', properties: { nom: { type: 'string' }, format: { type: 'string', enum: Object.keys(FORMATS) }, contenu: { type: 'string', description: 'tout le contenu' } }, required: ['nom', 'format', 'contenu'] } },
    { name: 'agenda', description: 'Prépare un rendez-vous pour le calendrier de l\'iPhone (.ics), heure de Monaco.',
      parameters: { type: 'object', properties: { titre: { type: 'string' }, debut: { type: 'string', description: '2026-10-20T14:30 ou 2026-10-20' }, fin: { type: 'string' }, duree_minutes: { type: 'number' }, lieu: { type: 'string' }, description: { type: 'string' }, rappel_minutes: { type: 'number' } }, required: ['titre', 'debut'] } },
    { name: 'brouillon_mail', description: 'Prépare un mail pré-rempli que Kevin envoie lui-même (tu n\'envoies rien).',
      parameters: { type: 'object', properties: { a: { type: 'string', description: 'adresse(s), séparées par une virgule' }, cc: { type: 'string' }, objet: { type: 'string' }, corps: { type: 'string' } }, required: ['a', 'objet', 'corps'] } },
  ];
  const exe = {
    fichier: async (a) => {
      const ext = String((a && a.format) || 'txt').toLowerCase();
      if (!FORMATS[ext]) throw new Error('format inconnu : ' + s(ext, 10) + ' (txt, md, csv, json, html, ics, vcf)');
      let texte = String((a && a.contenu) || '');
      if (!texte.trim()) throw new Error('le contenu est vide');
      if (texte.length > MAX_TEXTE) throw new Error('document trop long (' + MAX_TEXTE + ' caractères au plus) : coupe-le en deux fichiers');
      if (ext === 'html') texte = assainirHtml(texte);
      if (ext === 'json') { try { JSON.parse(texte); } catch (e) { throw new Error('JSON invalide : ' + s(e.message, 80)); } }
      const nom = nomFichier(a.nom, ext);
      ajouter(sortie, { t: 'fichier', nom, texte, libelle: FORMATS[ext] });
      return 'Fichier prêt : « ' + nom + ' » (' + texte.length + ' caractères). Un bouton de téléchargement est affiché à Kevin. Dis-lui en une phrase ce que contient le document.';
    },
    agenda: async (a) => {
      const ics = construireIcs(a || {}, o && o.now ? o.now() : undefined);
      const nom = nomFichier('rdv-' + s(a.titre, 40), 'ics');
      ajouter(sortie, { t: 'fichier', nom, texte: ics, libelle: 'agenda' });
      return 'Rendez-vous prêt : « ' + s(a.titre, 80) + ' » le ' + s(a.debut, 20) + '. Un bouton « Ajouter au calendrier » (fichier .ics) est affiché à Kevin. Rappelle-lui la date et l\'heure.';
    },
    brouillon_mail: async (a) => {
      const r = construireMailto(a || {});
      ajouter(sortie, { t: 'lien', url: r.url, libelle: 'Écrire à ' + s(r.a[0], 60) + (r.a.length > 1 ? ' +' + (r.a.length - 1) : '') });
      return 'Brouillon prêt pour ' + r.a.join(', ') + '. Un bouton ouvre son app Mail, déjà rempli ; Kevin relit et envoie lui-même (tu n\'envoies rien). Résume le mail en une phrase.';
    },
  };
  if (o && typeof o.ia === 'function') {
    defs.push({ name: 'image', description: 'Génère une image (logo, affiche, dessin) avec une IA gratuite ; une seule par réponse.',
      parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'en anglais, précis' }, legende: { type: 'string' } }, required: ['prompt'] } });
    exe.image = async (a) => {
      const p = s(a && a.prompt, 600).trim(); if (p.length < 4) throw new Error('décris l\'image (en anglais, au moins quelques mots)');
      if ((sortie.cartes || []).some((c) => c.t === 'image')) throw new Error('une seule image par réponse');
      const b64 = await o.ia(p);
      if (!b64 || typeof b64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error('l\'IA gratuite n\'a pas rendu d\'image pour l\'instant : réessaie dans une minute');
      if (b64.length > MAX_IMAGE) throw new Error('image trop lourde, demande un style plus simple');
      const mime = b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('UklGR') ? 'image/webp' : 'image/jpeg';
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      ajouter(sortie, { t: 'image', src: 'data:' + mime + ';base64,' + b64, alt: s(a.legende || p, 120), nom: nomFichier('image-' + s(a.legende || 'bee', 30), 'txt').replace(/\.txt$/, '.' + ext) });
      return 'Image prête (' + mime + '). Elle est affichée à Kevin dans la bulle avec un bouton pour l\'enregistrer. Décris-la en une phrase.';
    };
  }
  return { defs, exe };
}

/* L'image : Workers AI (FLUX-1-schnell), palier gratuit du compte. Rend du base64 ou ''. */
export async function imageGratuite(env, prompt) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') return '';
  const r = await Promise.race([env.AI.run(MODELE_IMAGE, { prompt: String(prompt).slice(0, 600), steps: 4 }), new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 20000))]);
  return r && typeof r.image === 'string' ? r.image : '';
}
