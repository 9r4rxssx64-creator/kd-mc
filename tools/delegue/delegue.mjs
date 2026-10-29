#!/usr/bin/env node
/* DÉLÉGUER AUX IA GRATUITES, VÉRIFIER, PUIS LIVRER (Kevin 29.10.2026 : « trouve une solution… pour économiser au maximum mon forfait de token quand tu travailles…
 * intègre toutes les IA gratuites, crée ce qu'il faut pour leur déléguer du travail que tu vérifies avant de mettre en ligne… cloud, téléphone, Lenovo… toujours
 * la plus performante dans le domaine de la question »).
 *
 * Principe : le gros modèle (le forfait de Kevin) pense, décide et VÉRIFIE ; la matière première (premier jet de code, résumé d'un long document, traduction,
 * relecture, rédaction, reformulation, tableau de comparaison) est demandée à une IA gratuite choisie PAR DOMAINE. Ce qui revient est un BROUILLON :
 * jamais livré sans passer `verifier.mjs` (syntaxe, secrets, innerHTML sans esc()) et sans relecture.
 *
 *   node tools/delegue/delegue.mjs <domaine> "<consigne>" [--fichier f]… [--sortie f [--extraire]] [--double] [--max n]
 *     (--extraire : n'écrit que le premier bloc de code, dans un fichier du bon type, avec l'en-tête BROUILLON en commentaire)
 *   node tools/delegue/delegue.mjs sonde            quelles voies répondent MAINTENANT (en vrai, 1 mot demandé à chacune)
 *   node tools/delegue/delegue.mjs stats            appels faits et jetons du forfait épargnés (estimation = caractères / 4)
 * Domaines : code · revue · resume · traduction · raisonnement · redaction · general   (voir ROUTES)
 * Voies : (1) `domaine` = apis.kd-mc.com/delegue (les meilleures IA gratuites À CLÉ du domaine : Groq, Cerebras, Gemini, Mistral… ; jeton `DELEGUE_JETON` ou fichier posé par jeton.mjs),
 *         (2) `llm7` et (3) `pollinations` = SANS CLÉ, marchent dans toute session (cloud, Lenovo, téléphone) dès la première seconde.
 * Interdits (refus net, avant tout envoi) : clé / jeton / empreinte / mot de passe, adresses e-mail, numéros de téléphone, IBAN — et, par règle écrite
 * (`.claude/rules/delegue-gratuit.md`), tout ce qui est donnée de PERSONNES (arbre, comptes, clients) : on délègue du code et du texte public, pas des vies. */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SECRET = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|bearer\s+[A-Za-z0-9._-]{20,}|\b[0-9a-f]{40,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:mot de passe|password|passwd|pwd)\s*[:=]\s*\S{4,})/i;
export const PERSONNEL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d{2}[\s.-]?\d(?:[\s.-]?\d{2}){3,5}|\b0[1-9](?:[\s.-]?\d{2}){4}\b|\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b)/;

/* Qui fait quoi (mesuré le 29.10.2026 : codestral, minimax-m2.7, nemotron-3-nano, mistral-Nemo, gpt-oss:20b répondent sans clé sur llm7 ; pollinations « openai » aussi).
   Ordre = du plus adapté au domaine au plus général ; chaque voie est SAUTÉE si elle échoue ou rend un brouillon inutilisable. */
export const ROUTES = {
  code: [['domaine', 'code'], ['llm7', 'codestral-latest'], ['llm7', 'minimax-m2.7'], ['llm7', 'nemotron-3-nano:30b'], ['pollinations', 'openai']],
  revue: [['domaine', 'reasoning'], ['llm7', 'minimax-m2.7'], ['llm7', 'nemotron-3-nano:30b'], ['llm7', 'gpt-oss:20b'], ['pollinations', 'openai']],
  resume: [['domaine', 'long_context'], ['llm7', 'nemotron-3-nano:30b'], ['llm7', 'minimax-m2.7'], ['pollinations', 'openai']],
  traduction: [['domaine', 'translation'], ['llm7', 'mistral-Nemo-Instruct-2407'], ['llm7', 'minimax-m2.7'], ['pollinations', 'openai']],
  raisonnement: [['domaine', 'reasoning'], ['llm7', 'gpt-oss:20b'], ['llm7', 'minimax-m2.7'], ['llm7', 'nemotron-3-nano:30b']],
  redaction: [['domaine', 'creative'], ['llm7', 'minimax-m2.7'], ['llm7', 'mistral-Nemo-Instruct-2407'], ['pollinations', 'openai']],
  general: [['domaine', 'general'], ['llm7', 'minimax-m2.7'], ['pollinations', 'openai'], ['llm7', 'nemotron-3-nano:30b']],
};
export const DOMAINES = Object.keys(ROUTES);
const SYSTEME = {
  code: 'Tu es un ingénieur senior. Réponds par du code complet et exécutable dans un bloc de code, puis au plus 5 lignes d\'explication. Aucun secret, aucune donnée personnelle. JavaScript : jamais d\'innerHTML avec une donnée non échappée.',
  revue: 'Tu es relecteur critique. Liste les défauts réels (bug, faille, cas limite oublié, incohérence) du plus grave au moins grave, avec la ligne ou l\'extrait concerné et le correctif. Si tu ne trouves rien, dis-le. N\'invente rien.',
  resume: 'Tu résumes fidèlement : faits, chiffres et décisions, rien d\'ajouté. Réponds en français, en puces courtes.',
  traduction: 'Tu traduis fidèlement, sans rien ajouter ni retirer, en gardant le ton et la mise en forme. Réponds seulement par la traduction.',
  raisonnement: 'Tu raisonnes étape par étape puis donnes la conclusion en dernière ligne, précédée de « Conclusion : ».',
  redaction: 'Tu rédiges en français clair, simple et sobre. Pas de remplissage.',
  general: 'Tu réponds en français, précis et concis.',
};

export function controleEnvoi(texte) {
  if (SECRET.test(texte)) return 'refusé : le texte ressemble à un secret (clé, jeton, empreinte, mot de passe) — on ne l\'envoie à aucune IA';
  if (PERSONNEL.test(texte)) return 'refusé : le texte contient une adresse e-mail, un téléphone ou un IBAN — les données de personnes ne sont jamais déléguées';
  return null;
}

/* Un brouillon est inutilisable s'il est vide, tronqué net, ou s'il est un refus / un bavardage sans contenu. */
export function brouillonUtilisable(domaine, texte) {
  const t = String(texte || '').trim();
  if (t.length < 2) return 'vide';
  if (/^(je ne peux pas|i can(?:no|')t|i'm sorry|désolé, je ne)/i.test(t) && t.length < 400) return 'refus';
  if (domaine === 'code' && !/```|function |=>|class |import |const |def |<\w+/.test(t)) return 'pas de code';
  return null;
}

export function extraireCode(texte) {
  const blocs = [...String(texte).matchAll(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g)].map((m) => ({ langue: m[1].toLowerCase(), code: m[2] }));
  return blocs;
}

function enleverRaisonnement(t) { return String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

async function appelOpenAI(url, modele, messages, { maxTokens = 2500, delaiMs = 90000, entetes = {}, fetchImpl = fetch, essai2 = false } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), delaiMs);
  try {
    const r = await fetchImpl(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify({ model: modele, messages, max_tokens: maxTokens, temperature: 0.2 }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String((d && (d.error && (d.error.message || d.error) || d.message)) || '').slice(0, 120);
      const attente = r.status === 429 && /retry after (\d+) second/i.exec(msg);
      if (attente && +attente[1] <= 10 && !essai2) { await new Promise((ok) => setTimeout(ok, (+attente[1] + 1) * 1000)); return appelOpenAI(url, modele, messages, { maxTokens, delaiMs, entetes, fetchImpl, essai2: true }); }   // limite par minute courte : on attend UNE fois
      throw new Error('HTTP ' + r.status + ' ' + msg);
    }
    const c = d && d.choices && d.choices[0];
    const texte = enleverRaisonnement(c && c.message && c.message.content);
    return { texte, fin: c && c.finish_reason, jetons: d && d.usage };
  } finally { clearTimeout(t); }
}

const VOIES = {
  llm7: (modele, messages, o) => appelOpenAI('https://api.llm7.io/v1/chat/completions', modele, messages, { ...o, entetes: { authorization: 'Bearer unused' } }),
  pollinations: (modele, messages, o) => appelOpenAI('https://text.pollinations.ai/openai', modele, messages, o),
  domaine: async (domaineIA, messages, o) => {
    const jeton = jetonCourant(o.env || process.env);
    if (!jeton) throw new Error('pas de jeton DELEGUE_JETON (voie du domaine ignorée)');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.delaiMs || 90000);
    try {
      const r = await (o.fetchImpl || fetch)((o.env || process.env).DELEGUE_URL || 'https://apis.kd-mc.com/delegue', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jeton }, body: JSON.stringify({ domain: domaineIA, messages, max_tokens: o.maxTokens || 2500 }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error('HTTP ' + r.status + ' ' + String(d.error || d.detail || '').slice(0, 120));
      return { texte: enleverRaisonnement(d.text), fin: 'stop', modele: (d.provider || '?') + '/' + String(d.model || '').split('/').pop() };
    } finally { clearTimeout(t); }
  },
};

/** Délègue : essaie les voies du domaine dans l'ordre, rend { ok, texte, voie, modele, essais }. Aucune exception : un échec se lit dans `essais`. */
export async function deleguer(domaine, consigne, { fichiers = [], maxTokens = 2500, fetchImpl, env, voies = VOIES, journal = true, controle = controleEnvoi } = {}) {
  if (!ROUTES[domaine]) return { ok: false, erreur: 'domaine inconnu : ' + domaine + ' (' + DOMAINES.join(', ') + ')', essais: [] };
  const contenu = fichiers.map((f) => '\n\n=== ' + f.nom + ' ===\n' + f.texte).join('');
  const refus = controle(consigne + contenu);
  if (refus) return { ok: false, erreur: refus, essais: [] };
  const messages = [{ role: 'system', content: SYSTEME[domaine] }, { role: 'user', content: consigne + contenu }];
  const essais = [];
  for (const [voie, modele] of ROUTES[domaine]) {
    if (voie === 'domaine' && !jetonCourant(env || process.env)) { essais.push({ voie, saute: 'pas de jeton' }); continue; }
    const t0 = Date.now();
    try {
      const r = await voies[voie](modele, messages, { maxTokens, fetchImpl, env });
      const defaut = brouillonUtilisable(domaine, r.texte);
      if (defaut) { essais.push({ voie, modele, echec: defaut, ms: Date.now() - t0 }); continue; }
      const sortie = { ok: true, texte: r.texte, voie, modele: r.modele || modele, essais, ms: Date.now() - t0, tronque: r.fin === 'length' };
      if (journal) noter({ domaine, voie, modele: sortie.modele, entree: (consigne + contenu).length, sortie: r.texte.length });
      return sortie;
    } catch (e) { essais.push({ voie, modele, echec: String(e && e.message).slice(0, 140), ms: Date.now() - t0 }); }
  }
  return { ok: false, erreur: 'aucune voie gratuite n\'a rendu un brouillon utilisable', essais };
}

export const FICHIER_JETON = () => process.env.DELEGUE_FICHIER_JETON || join(tmpdir(), 'delegue-jeton');
/** Le jeton de session : variable DELEGUE_JETON, sinon le fichier posé par `jeton.mjs nouveau`. Jamais écrit dans le dépôt. */
export function jetonCourant(env = process.env) {
  if (env.DELEGUE_JETON) return env.DELEGUE_JETON;
  try { return readFileSync(FICHIER_JETON(), 'utf8').trim() || ''; } catch (_) { return ''; }
}
const JOURNAL = () => process.env.DELEGUE_JOURNAL || join(tmpdir(), 'delegue-journal.jsonl');
function noter(l) { try { appendFileSync(JOURNAL(), JSON.stringify({ ts: Date.now(), ...l }) + '\n'); } catch (_) { /* le journal n'est jamais bloquant */ } }
export function statistiques(chemin = JOURNAL()) {
  if (!existsSync(chemin)) return { appels: 0, caracteres: 0, jetonsEpargnes: 0, parVoie: {} };
  const l = readFileSync(chemin, 'utf8').split('\n').filter(Boolean).map((x) => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean);
  const parVoie = {}; let car = 0;
  for (const e of l) { parVoie[e.voie + '/' + e.modele] = (parVoie[e.voie + '/' + e.modele] || 0) + 1; car += (e.entree || 0) + (e.sortie || 0); }
  return { appels: l.length, caracteres: car, jetonsEpargnes: Math.round(car / 4), parVoie };
}

/* ---- ligne de commande ---- */
if (process.argv[1] && /(^|[\\/])delegue\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'stats') { console.log(JSON.stringify(statistiques(), null, 2)); process.exit(0); }
  if (cmd === 'sonde') {
    for (const dom of DOMAINES) {
      const r = await deleguer(dom, 'Réponds par un seul mot : OK', { maxTokens: 400, journal: false });
      console.log((r.ok ? '✅' : '❌') + ' ' + dom.padEnd(12) + (r.ok ? r.voie + '/' + r.modele + ' · ' + r.ms + ' ms' : r.erreur) + (r.essais.length ? '  [sautés : ' + r.essais.map((e) => e.voie + (e.modele ? '/' + e.modele : '') + ' ' + (e.echec || e.saute)).join(' ; ') + ']' : ''));
    }
    process.exit(0);
  }
  const fichiers = []; let sortie = null; let double = false; let extraire = false; let maxTokens = 2500; const mots = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--fichier') { const nom = args[++i]; fichiers.push({ nom, texte: readFileSync(nom, 'utf8') }); }
    else if (args[i] === '--sortie') sortie = args[++i];
    else if (args[i] === '--double') double = true;
    else if (args[i] === '--extraire') extraire = true;
    else if (args[i] === '--max') maxTokens = Math.min(8000, parseInt(args[++i], 10) || 2500);
    else mots.push(args[i]);
  }
  const consigne = mots.join(' ') || readFileSync(0, 'utf8');
  if (!cmd || !consigne.trim()) { console.error('usage : delegue.mjs <' + DOMAINES.join('|') + '> "<consigne>" [--fichier f] [--sortie f [--extraire]] [--double] [--max n] | sonde | stats'); process.exit(2); }
  const r = await deleguer(cmd, consigne, { fichiers, maxTokens });
  if (!r.ok) { console.error('❌ ' + r.erreur + '\n' + JSON.stringify(r.essais)); process.exit(1); }
  let texte = r.texte;
  if (double) {   // deuxième avis, d'une AUTRE voie : on montre l'écart, c'est à moi de trancher
    const autre = await deleguer('revue', 'Relis ce travail et dis ce qui est faux ou manquant, sinon réponds « RAS ».\n\nDEMANDE :\n' + consigne + '\n\nTRAVAIL :\n' + r.texte, { maxTokens });
    texte += '\n\n--- DEUXIÈME AVIS (' + (autre.ok ? autre.voie + '/' + autre.modele : 'indisponible') + ') ---\n' + (autre.ok ? autre.texte : autre.erreur);
  }
  if (extraire && sortie) {   // le premier bloc de code seul, dans un fichier du bon type : en-tête en commentaire de ce langage
    const bloc = extraireCode(r.texte)[0];
    if (!bloc) { console.error('❌ --extraire : aucun bloc de code dans la réponse'); process.exit(1); }
    const marque = 'BROUILLON IA GRATUITE (' + r.voie + '/' + r.modele + ') — NON VÉRIFIÉ : tools/delegue/verifier.mjs puis relire';
    writeFileSync(sortie, (/\.(html?|md)$/i.test(sortie) ? '<!-- ' + marque + ' -->\n' : /\.json$/i.test(sortie) ? '' : '// ' + marque + '\n') + bloc.code);
    console.error('✍️  code écrit dans ' + sortie + ' (' + r.voie + '/' + r.modele + ', ' + r.ms + ' ms' + (r.tronque ? ', TRONQUÉ' : '') + ')'); process.exit(0);
  }
  const entete = '<!-- BROUILLON IA GRATUITE (' + r.voie + '/' + r.modele + ') — NON VÉRIFIÉ : passer tools/delegue/verifier.mjs puis relire avant de livrer -->\n';
  if (sortie) { writeFileSync(sortie, entete + texte + '\n'); console.error('✍️  brouillon écrit dans ' + sortie + ' (' + r.voie + '/' + r.modele + ', ' + r.ms + ' ms' + (r.tronque ? ', TRONQUÉ' : '') + ')'); }
  else console.log(entete + texte);
}
