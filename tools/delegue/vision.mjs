/* LES YEUX DES ROBOTS GRATUITS (Kevin 30.10.2026 : « ils doivent pouvoir tout lire »).
 * Une image (registre scanné, acte manuscrit) ou un PDF devient du TEXTE, lu par Gemini au palier GRATUIT (clé AI Studio d'un projet SANS facturation).
 * La clé reste HORS du dépôt : variable GEMINI_API_KEY_GRATUIT, ou fichier ~/.delegue-gemini (une ligne). Sans clé : erreur claire, rien n'est envoyé nulle part.
 * Le texte rendu passe ensuite par le filtre du chercheur (« extrait mot pour mot dans la page lue ») comme n'importe quelle page : une lecture inventée ne remonte pas
 * sans son extrait. Lecture seule : l'adresse doit être permise (https public), 15 Mo au plus. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { urlSure } from '../../services/kdmc-apis/adresses.mjs';

export const MODELE = process.env.DELEGUE_VISION_MODELE || 'gemini-3.5-flash';
export const MAX_OCTETS = 15 * 1024 * 1024;
export const TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'application/pdf': 1 };
export const estMedia = (url) => /\.(jpe?g|png|webp|pdf)(\?|#|$)/i.test(String(url || ''));
const CONSIGNE = 'Transcris FIDÈLEMENT tout le texte de ce document d\'état civil ou d\'archives (imprimé ou manuscrit), ligne par ligne, sans rien inventer. '
  + 'Pour un acte : date, lieu, noms, prénoms, âges, professions, parents, déclarants, mentions en marge, numéro d\'acte. Un mot illisible s\'écrit [illisible] ; un doute s\'écrit avec un point d\'interrogation.';

export function cleGratuite(env = process.env) {
  if (env.GEMINI_API_KEY_GRATUIT) return String(env.GEMINI_API_KEY_GRATUIT).trim();
  try { return fs.readFileSync(path.join(os.homedir(), '.delegue-gemini'), 'utf8').trim(); } catch (_) { return ''; }
}

/** Télécharge l'image/PDF (adresse permise) et la fait lire. Rend { texte, liens: [] }. */
export async function lireMedia(url, { fetchImpl = fetch, cle = cleGratuite(), modele = MODELE } = {}) {
  if (!urlSure(url)) throw new Error('adresse non permise');
  if (!cle) throw new Error('pas de clé Gemini gratuite (GEMINI_API_KEY_GRATUIT ou ~/.delegue-gemini)');
  const r = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; recherche-documentaire)' } });
  if (r.url && !urlSure(r.url)) throw new Error('redirigée hors des adresses permises');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type]) throw new Error('type non lu : ' + type.slice(0, 40));
  const octets = Buffer.from(await r.arrayBuffer());
  if (octets.length > MAX_OCTETS) throw new Error('fichier trop gros (15 Mo au plus)');
  return lireOctets(octets, type, { fetchImpl, cle, modele });
}

/** Les octets d'une image/PDF → texte (Gemini gratuit). Commun à l'adresse et au fichier local. */
export async function lireOctets(octets, type, { fetchImpl = fetch, cle = cleGratuite(), modele = MODELE } = {}) {
  if (!cle) throw new Error('pas de clé Gemini gratuite (GEMINI_API_KEY_GRATUIT ou ~/.delegue-gemini)');
  const g = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modele) + ':generateContent', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cle },
    body: JSON.stringify({ contents: [{ parts: [{ text: CONSIGNE }, { inline_data: { mime_type: type, data: octets.toString('base64') } }] }], generationConfig: { temperature: 0, maxOutputTokens: 4000 } }),
  });
  if (!g.ok) throw new Error('vision HTTP ' + g.status);
  const j = await g.json();
  const texte = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('\n').trim();
  if (!texte) throw new Error('vision : rien de lu');
  return { texte, liens: [] };
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
/** Un fichier local déposé dans le dossier d'entrée (capturé par le navigateur de Kevin) → texte. Le chemin doit rester DANS le dossier donné. */
export async function lireFichier(chemin, dossier, opts = {}) {
  const abs = path.resolve(chemin), racine = path.resolve(dossier) + path.sep;
  if (!abs.startsWith(racine)) throw new Error('fichier hors du dossier permis');
  const type = MIME[path.extname(abs).toLowerCase()];
  if (!type) throw new Error('type non lu : ' + path.extname(abs));
  const st = fs.statSync(abs);
  if (st.size > MAX_OCTETS) throw new Error('fichier trop gros (15 Mo au plus)');
  return lireOctets(fs.readFileSync(abs), type, opts);
}

/** Dossier d'entrée : chaque image/PDF sans « .transcription.txt » est lue, UNE par appel (cadence lente pour ne pas faire bloquer les sites ni dépasser le quota gratuit).
 *  Un « <nom>.consigne.txt » à côté peut dire ce qu'on cherche (sinon : transcription fidèle). Rend le nom traité ou null. */
export async function traiterDossier(dossier, { journal = () => {}, ...opts } = {}) {
  if (!dossier || !fs.existsSync(dossier)) return null;
  const faits = new Set(fs.readdirSync(dossier));
  const a = [...faits].sort().find((f) => MIME[path.extname(f).toLowerCase()] && !faits.has(f + '.transcription.txt') && !faits.has(f + '.erreur.txt'));
  if (!a) return null;
  const chemin = path.join(dossier, a);
  try {
    const r = await lireFichier(chemin, dossier, opts);
    fs.writeFileSync(chemin + '.transcription.txt', '[PREMIER JET d\'une IA gratuite — à vérifier, jamais un fait]\n' + r.texte + '\n');
    journal('image « ' + a + ' » lue (' + r.texte.length + ' caractères)');
  } catch (e) {
    fs.writeFileSync(chemin + '.erreur.txt', String(e && e.message || e).slice(0, 300) + '\n');
    journal('⚠️ image « ' + a + ' » : ' + (e && e.message));
  }
  return a;
}
