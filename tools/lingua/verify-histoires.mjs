#!/usr/bin/env node
/* 📜 GARDE — « l'histoire et les anecdotes de chaque langue » (Kevin 2026-08-13).

   POURQUOI : une anecdote fausse est pire que pas d'anecdote. On l'affiche comme un fait,
   l'élève la retient, et il la répète. La règle de Kevin est « vérité, rien de faux, partout
   toujours » — donc ce contenu passe la même porte que le reste de Lingua :

     --struct   (défaut, 0 clé, tourne à CHAQUE changement) : contrôle mécanique.
                Chaque langue enseignée a son histoire ; chaque fait porte une SOURCE non vide ;
                rien de vide, rien en double ; et surtout : le fichier est VRAIMENT branché
                dans l'app (chargé, affiché, mis en cache) — sinon c'est du contenu mort.
     --semantic : SECOND AVIS INDÉPENDANT (Gemini/Mistral, un modèle qui n'a pas écrit ce
                texte). Il ne corrige RIEN : il écrit un rapport des faits douteux
                (audit/lingua-histoires-verite.md), que je relis avant de toucher quoi que ce
                soit — un juge IA se trompe aussi (règle « vérifier avant d'agir »).

   Lance : node tools/lingua/verify-histoires.mjs [--semantic]
*/
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const SEMANTIC = process.argv.includes('--semantic');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- chargement ---------- */
function charge(fichier) { const ctx = {}; vm.createContext(ctx); vm.runInContext(lire(fichier), ctx); return ctx; }
const data = charge('data.js');
const hist = charge('histoires-langues.js');
const LANG_HISTOIRE = hist.LANG_HISTOIRE || {};
const COURS = Object.keys(data.COURSES || {});

const errs = [];
const ko = (m) => errs.push(m);

/* ---------- 1. Contrôle mécanique du contenu ---------- */
/* Les planchers montent avec la vague « Enrichit +++ » (Kevin 2026-08-13) : chaque langue a
   désormais un vrai dossier — une histoire développée, dix anecdotes, des chiffres repères et
   des mots qui ont voyagé. Un plancher qui NE MONTE PAS avec le contenu ne protège plus rien :
   il laisserait re-glisser en douce une langue à 4 anecdotes sans que personne le voie. */
const MINI_HISTOIRE = 400;   // en dessous, ce n'est plus un dossier, c'est une étiquette
const MINI_FAIT = 25;
const MINI_FAITS = 8;        // le dossier promet « le sais-tu ? », pas trois lignes
const MINI_CHIFFRES = 3;     // les repères qu'on retient d'un coup d'œil
const MINI_MOTS = 4;         // les mots qui ont voyagé entre cette langue et le français
const MINI_EXPLIC = 20;      // une explication de mot plus courte n'explique rien

COURS.forEach((lg) => { if (!LANG_HISTOIRE[lg]) ko('langue enseignée SANS histoire : ' + lg); });

/* Contrôles communs à tout élément publié : du texte, une source, pas de HTML, pas de doublon. */
function verifieListe(ou, liste, mini, nomListe, champs) {
  if (liste.length < mini) ko(ou + ' : ' + liste.length + ' ' + nomListe + ', il en faut au moins ' + mini);
  const vus = new Set();
  liste.forEach((x, i) => {
    const q = ou + ', ' + nomListe.replace(/s$/, '') + ' ' + (i + 1);
    champs.forEach(([champ, mini2]) => {
      const v = x[champ];
      if (typeof v !== 'string' || v.trim().length < mini2) ko(q + ' : « ' + champ + ' » absent ou trop court');
    });
    if (!x.src || !String(x.src).trim()) ko(q + ' : SANS SOURCE — rien ne se publie sans source');
    if (x.url != null && !/^https?:\/\//.test(String(x.url))) ko(q + ' : « url » présente mais ce n\'est pas une adresse http(s)');
    const cle = String(x[champs[0][0]] || '').trim().toLowerCase();
    if (vus.has(cle)) ko(q + ' : répété à l\'identique dans la même langue'); vus.add(cle);
    const tout = champs.map(([c]) => String(x[c] || '')).join('') + String(x.src || '');
    if (/[<>]/.test(tout)) ko(q + ' : contient du HTML — interdit (le texte est affiché tel quel)');
  });
}

Object.keys(LANG_HISTOIRE).forEach((lg) => {
  const h = LANG_HISTOIRE[lg];
  const ou = 'langue « ' + lg + ' »';
  if (!h.nom || !String(h.nom).trim()) ko(ou + ' : nom manquant');
  if (!h.src || !String(h.src).trim()) ko(ou + ' : source de l\'histoire manquante');
  if (typeof h.histoire !== 'string' || h.histoire.trim().length < MINI_HISTOIRE) ko(ou + ' : histoire absente ou trop courte (< ' + MINI_HISTOIRE + ' caractères)');
  verifieListe(ou, Array.isArray(h.faits) ? h.faits : [], MINI_FAITS, 'anecdotes', [['t', MINI_FAIT]]);
  verifieListe(ou, Array.isArray(h.chiffres) ? h.chiffres : [], MINI_CHIFFRES, 'chiffres', [['k', 3], ['v', 2]]);
  verifieListe(ou, Array.isArray(h.mots) ? h.mots : [], MINI_MOTS, 'mots', [['m', 2], ['d', MINI_EXPLIC]]);
});

/* ---------- 2. Le contenu est-il VRAIMENT branché ? (Déclaration ≠ Déploiement) ---------- */
const app = lire('app.js'), html = lire('index.html'), sw = lire('sw.js');
const brancher = [
  ['index.html charge histoires-langues.js', /<script src="histoires-langues\.js"><\/script>/.test(html)],
  ['le fichier est mis en cache hors-ligne (sw.js)', /histoires-langues\.js/.test(sw)],
  ['la vue vHistoire existe', /function vHistoire\(\)/.test(app)],
  ['la vue est réellement affichée (render)', /VIEW==="histoire"\)\s*app\.appendChild\(vHistoire\(\)\)/.test(app)],
  ['une carte y mène depuis l\'accueil', /go\("histoire"\)/.test(app)],
  ['l\'anecdote du jour tourne (pas toujours la même)', /function anecdoteDuJour\(\)/.test(app) && /anecdoteDuJour\(\)/.test(app.replace(/function anecdoteDuJour\(\)/, ''))],
  ['chaque source est cliquable vers son article', /function wikiLien\(/.test(app) && /lienSrc\(f\)/.test(app)],
  ['le texte est inséré sans HTML (anti-injection)', /tx\.textContent=f\.t/.test(app)],
  /* « Enrichit +++ » : les trois nouvelles sections doivent être VISIBLES, pas juste écrites
     dans le fichier de contenu — sinon c'est du contenu mort (Déclaration ≠ Déploiement). */
  ['les chiffres repères sont affichés', /hist-chiffres/.test(app) && /textContent=x\.v/.test(app)],
  ['les mots qui ont voyagé sont affichés', /hist-mots/.test(app) && /textContent=w\.d/.test(app)],
  ['une source hors Wikipédia peut être pointée (champ url)', /function lienSrc\(/.test(app)],
  ['le style des nouvelles sections existe', /\.hist-chiffres/.test(html) && /\.hist-mot\b/.test(html)],
];
brancher.forEach(([quoi, ok]) => { if (!ok) ko('PAS BRANCHÉ : ' + quoi); });

/* ---------- 3. Verdict structurel ---------- */
const nb = Object.keys(LANG_HISTOIRE).length;
const somme = (champ) => Object.values(LANG_HISTOIRE).reduce((s, h) => s + ((h[champ] || []).length), 0);
const nbFaits = somme('faits');
console.log('📜 Dossiers des langues — ' + nb + ' langue(s) · ' + nbFaits + ' anecdote(s) · '
  + somme('chiffres') + ' chiffre(s) repère · ' + somme('mots') + ' mot(s) voyageur(s) — tout sourcé.');
brancher.forEach(([quoi, ok]) => console.log((ok ? '✅ ' : '❌ ') + quoi));
if (errs.length) { console.log('\n❌ ' + errs.length + ' problème(s) :'); errs.forEach((e) => console.log('   · ' + e)); }
else console.log('✅ Contrôle mécanique : rien à signaler.');

/* ---------- 4. Second avis INDÉPENDANT (ne corrige jamais, signale) ---------- */
async function callMistral(messages) {
  if (!process.env.MISTRAL_API_KEY) return null;
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.MISTRAL_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: 1200, temperature: 0.1, response_format: { type: 'json_object' } }) });
  if (!r.ok) return null; const j = await r.json(); return j?.choices?.[0]?.message?.content;
}
async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) return null;
  const sys = messages.find((m) => m.role === 'system'); const rest = messages.filter((m) => m.role !== 'system');
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system_instruction: sys ? { parts: [{ text: sys.content }] } : undefined, contents: rest.map((m) => ({ role: 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1200, temperature: 0.1 } }) });
  if (!r.ok) return null; const j = await r.json(); return j?.candidates?.[0]?.content?.parts?.[0]?.text;
}
const parse = (t) => { if (!t) return null; try { const m = t.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : t); } catch { return null; } };

if (SEMANTIC) {
  const douteux = [];
  for (const lg of Object.keys(LANG_HISTOIRE)) {
    const h = LANG_HISTOIRE[lg];
    /* Le juge relit TOUT ce qui est publié — pas seulement les anecdotes. Un chiffre faux
       (« 26 lettres ») ou une étymologie inventée se lit comme un fait : même porte. */
    const liste = [{ t: h.histoire, src: h.src, quoi: 'présentation' }]
      .concat((h.faits || []).map((f, i) => ({ t: f.t, src: f.src, quoi: 'anecdote ' + (i + 1) })))
      .concat((h.chiffres || []).map((c, i) => ({ t: c.k + ' : ' + c.v, src: c.src, quoi: 'chiffre ' + (i + 1) })))
      .concat((h.mots || []).map((w, i) => ({ t: '« ' + w.m +
        ' » — ' + w.d, src: w.src, quoi: 'mot ' + (i + 1) })));
    const sys = "Tu es vérificateur de faits, rigoureux et PRUDENT. Tu ne signales QUE ce qui est FACTUELLEMENT FAUX ou invérifiable, jamais le style, jamais une formulation que tu aurais tournée autrement.";
    const user = 'Voici des affirmations destinées à une application d\'apprentissage des langues, sur le ' + (h.nom || lg) + '.\n'
      + liste.map((x, i) => (i + 1) + '. [' + x.quoi + '] ' + x.t + '   (source annoncée : « ' + x.src + ' »)').join('\n')
      + '\n\nPour CHACUNE, dis si elle est vraie. RÈGLES ANTI-FAUSSE-ALERTE, à respecter absolument :'
      + '\n- une formulation prudente (« environ », « souvent présenté comme ») N\'EST PAS une erreur ;'
      + '\n- une simplification pédagogique correcte n\'est pas une erreur ;'
      + '\n- ne signale pas une reformulation que tu préfères : uniquement du FAUX (date, chiffre, nom, attribution, événement).'
      + '\n- si tu n\'es pas sûr, NE SIGNALE PAS.'
      + '\nRéponds UNIQUEMENT en JSON : {"faux": [{"num": 1, "probleme": "ce qui est faux, en 12 mots max", "correction": "la version exacte"}]}. Liste VIDE si tout est correct.';
    const raw = (await callGemini([{ role: 'system', content: sys }, { role: 'user', content: user }]))
      || (await callMistral([{ role: 'system', content: sys }, { role: 'user', content: user }]));
    const j = parse(raw);
    if (!j) { douteux.push({ langue: lg, note: 'juge indisponible (ni Gemini ni Mistral) — rien n\'a été vérifié pour cette langue' }); continue; }
    (Array.isArray(j.faux) ? j.faux : []).forEach((f) => {
      const src = liste[(f.num | 0) - 1];
      if (!src) return;
      douteux.push({ langue: lg, quoi: src.quoi, texte: src.t, probleme: f.probleme, correction: f.correction, source: src.src });
    });
    console.log('· juge ' + lg + ' : ' + (Array.isArray(j.faux) ? j.faux.length : 0) + ' point(s) signalé(s)');
  }
  fs.mkdirSync(path.join(ROOT, '..', 'audit'), { recursive: true });
  const md = ['# Second avis indépendant — histoire & anecdotes des langues', '',
    'Rapport du ' + new Date().toISOString().slice(0, 10) + '. Un modèle qui n\'a PAS écrit ces textes les relit.',
    'Ce rapport ne modifie rien : chaque point est à vérifier à la main contre la source avant correction.', '',
    douteux.length ? '## ' + douteux.length + ' point(s) à vérifier' : '## Aucun point signalé', ''];
  douteux.forEach((d) => md.push('- **' + d.langue + '** ' + (d.quoi ? '(' + d.quoi + ')' : '') + ' — ' + (d.note || (d.probleme + '\n  - texte : « ' + d.texte + ' »\n  - correction proposée : ' + d.correction + '\n  - source annoncée : ' + d.source))));
  fs.writeFileSync(path.join(ROOT, '..', 'audit', 'lingua-histoires-verite.md'), md.join('\n') + '\n', 'utf8');
  console.log('\nRapport : audit/lingua-histoires-verite.md — ' + douteux.length + ' point(s) à relire (rien n\'a été modifié).');
}

/* ---------- 5. Mode LIENS : on OUVRE vraiment chaque source (CI, réseau ouvert) ----------
   Un titre d'article Wikipédia écrit de mémoire peut ne pas exister : le lien tombe alors sur
   une page « créer cet article », et l'élève se retrouve dans le vide. Déjà vécu avec les
   adresses des académies (deux inventées, mortes). Donc : la CI clique à ma place. */
async function ouvre(url) {
  const essai = async (method) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: ctl.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; KDMC-Lingua/1.0; +https://lingua.kd-mc.com)' } });
      return r.status;
    } catch (_) { return 0; } finally { clearTimeout(t); }
  };
  let code = await essai('HEAD');
  if (code === 0 || code === 405) { const g = await essai('GET'); if (g) code = g; }
  return code;
}
const wikiLien = (titre) => 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(String(titre || '').replace(/ /g, '_'));

if (process.argv.includes('--liens')) {
  /* On dédoublonne : le même article sert souvent à plusieurs langues. */
  const cibles = new Map();   // url -> [où on l'utilise]
  Object.keys(LANG_HISTOIRE).forEach((lg) => {
    const h = LANG_HISTOIRE[lg];
    const ajoute = (x, quoi) => {
      const u = x.url || wikiLien(x.src);
      if (!cibles.has(u)) cibles.set(u, []);
      cibles.get(u).push(lg + '/' + quoi);
    };
    ajoute({ src: h.src }, 'présentation');
    (h.faits || []).forEach((f, i) => ajoute(f, 'anecdote ' + (i + 1)));
    (h.chiffres || []).forEach((c, i) => ajoute(c, 'chiffre ' + (i + 1)));
    (h.mots || []).forEach((w, i) => ajoute(w, 'mot ' + (i + 1)));
  });
  console.log('\n🔗 Vérification réelle de ' + cibles.size + ' source(s) distincte(s)…\n');
  const morts = []; let robots = 0, vus = 0, lotsRates = 0;

  /* Wikipédia : on demande 50 titres d'un coup à son interface de requête. C'est ~40× plus
     rapide que 161 ouvertures de page, et surtout plus JUSTE : elle répond « missing » pour
     un article qui n'existe pas, là où une simple ouverture peut être trompée par une
     redirection. Le reste (sites de lexique) est ouvert normalement. */
  const wiki = [...cibles.keys()].filter((u) => u.startsWith('https://fr.wikipedia.org/wiki/'));
  const autres = [...cibles.keys()].filter((u) => !u.startsWith('https://fr.wikipedia.org/wiki/'));
  const titreDe = (u) => decodeURIComponent(u.slice('https://fr.wikipedia.org/wiki/'.length)).replace(/_/g, ' ');
  for (let i = 0; i < wiki.length; i += 50) {
    const lot = wiki.slice(i, i + 50);
    const api = 'https://fr.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles='
      + encodeURIComponent(lot.map(titreDe).join('|'));
    let j = null;
    try { const r = await fetch(api, { headers: { 'user-agent': 'KDMC-Lingua/1.0 (https://lingua.kd-mc.com)' } }); if (r.ok) j = await r.json(); } catch (_) {}
    /* NE RIEN VÉRIFIER ≠ VÉRIFIER OK : si Wikipédia ne répond pas, on le DIT et on échoue,
       sinon un réseau capricieux ferait passer au vert des titres jamais contrôlés. */
    if (!j || !j.query) { lotsRates += lot.length; console.log('⚠️  Wikipédia n\'a pas répondu pour un lot de ' + lot.length + ' titres — NON VÉRIFIÉS.'); continue; }
    /* l'interface normalise et suit les redirections : on refait le lien titre → adresse */
    const absents = new Set(Object.values(j.query.pages || {}).filter((p) => p.missing !== undefined).map((p) => p.title));
    const remis = new Map();  // titre demandé -> titre final
    (j.query.normalized || []).forEach((n) => remis.set(n.from, n.to));
    (j.query.redirects || []).forEach((n) => remis.set(remis.has(n.from) ? n.from : n.from, n.to));
    for (const u of lot) {
      vus++;
      let t = titreDe(u);
      let garde = 0; while (remis.has(t) && garde++ < 5) t = remis.get(t);
      if (absents.has(t) || absents.has(titreDe(u))) { morts.push({ url: u, code: 404, ou: cibles.get(u) }); console.log('❌ article INEXISTANT : « ' + titreDe(u) + ' »   ← ' + cibles.get(u).join(', ')); }
    }
  }
  for (const u of autres) {
    vus++;
    const code = await ouvre(u);
    /* Même honnêteté que pour les académies : un site qui REFUSE les robots (401/403/429)
       n'est pas un lien mort — l'adresse est bonne, un humain passe. Seul le 404 condamne. */
    if (code >= 200 && code < 400) continue;
    if ([401, 403, 429].includes(code)) { robots++; console.log('🤖 ' + code + '  ' + u + '   (refuse les robots, adresse bonne)'); continue; }
    morts.push({ url: u, code, ou: cibles.get(u) }); console.log('❌ ' + (code || 'injoignable') + '  ' + u + '   ← ' + cibles.get(u).join(', '));
  }
  console.log('\n' + (vus - morts.length - robots) + ' source(s) existent · ' + robots + ' refusent les robots · '
    + morts.length + ' introuvable(s) · ' + lotsRates + ' non vérifiée(s) (sur ' + (vus + lotsRates) + ').');
  if (lotsRates) errs.push(lotsRates + ' source(s) n\'ont PAS PU être vérifiées (Wikipédia injoignable) — un contrôle qui ne contrôle rien ne doit pas passer au vert');
  if (morts.length) {
    console.log('Une source introuvable envoie l\'élève dans le vide : à corriger AVANT de publier.');
    errs.push(morts.length + ' source(s) introuvable(s) — voir la liste ci-dessus');
  }
}

process.exit(errs.length ? 1 : 0);
