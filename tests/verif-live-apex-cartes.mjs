/* VÉRIFICATION RÉELLE : la porte qui prépare les cartes ✅ d'Apex AI (POST /__admin/proposer), connecté en ADMIN comme Kevin, sur le vrai domaine.
 * Pourquoi (pc-config 3183, 26.11.2026 ; Kevin 26.11 « ne laisse rien non vérifié, jamais ») : la porte répondait 500 à TOUT admin (« ctx is not defined »), alors que ses
 * contrôles étaient verts (statiques, sans session). Ici on l'appelle pour de vrai avec une session admin prouvée par le domaine (empreinte du code → POST /__admin/login).
 * LECTURE SEULE : la porte ne fait que PROPOSER (rien n'est écrit, rien n'est envoyé : seul /__javis/agir exécute, après le ✅ de Kevin, et ce robot ne l'appelle jamais).
 * Aucun nom réel : une personne inventée (« Zzzzzz Qqqqq »). Nombres et verdicts seulement (dépôt public).
 *
 * Contrôles : A. connexion admin acceptée · B. sans session : porte fermée, aucune signature · C. message_direct : une proposition signée OU un refus clair, JAMAIS un 5xx ·
 * D. arbre_commentaire sur une fiche inconnue : « introuvable » clair, JAMAIS un 5xx · E. action hors liste : refusée (400) · F. aucune exécution : pas un seul appel à /__javis/agir · G. compte de test créé, carte « Écrire à » vers lui, puis supprimé et relu.
 * node tests/verif-live-apex-cartes.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; ESSAI_LOCAL=1 = le routeur du dépôt dans le processus, sans réseau ; SABOTAGE=500 = la porte « répond 500 »).
 */
import { createHash } from 'node:crypto';
const LOCAL = process.env.ESSAI_LOCAL === '1', SAB = process.env.SABOTAGE || '';
const BASE = 'https://kd-mc.com';
const CODE_LOCAL = '424242';
const HASH = LOCAL ? createHash('sha256').update(CODE_LOCAL).digest('hex') : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(HASH)) { console.log('❌ KDMC_ADMIN_PIN_SHA256 absent ou invalide (empreinte attendue)'); process.exit(1); }
let ko = 0, okn = 0; const noter = (c, t, d) => { if (c) okn++; else ko++; console.log(`${c ? '✅' : '❌'} ${t}${d ? ' — ' + String(d).slice(0, 160) : ''}`); };
let appelsAgir = 0;
let worker = null, envLocal = null;
if (LOCAL) {
  worker = (await import('../services/kdmc-router/worker.js')).default;
  const kv = new Map();
  envLocal = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
}
async function appel(chemin, { method = 'GET', headers = {}, corps } = {}) {
  if (/\/__javis\/agir/.test(chemin)) appelsAgir++;
  const h = Object.assign({ origin: BASE, 'x-kdmc-verif': '1' }, headers);
  if (SAB === '500' && chemin === '/__admin/proposer') return { status: 500, j: null };
  const init = { method, headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) };
  const rep = LOCAL ? await worker.fetch(new Request(BASE + chemin, init), envLocal) : await fetch(BASE + chemin, init);
  return { status: rep.status, j: await rep.json().catch(() => null) };
}
const JSONH = { 'content-type': 'application/json' };
try {
  const lg = await appel('/__admin/login', { method: 'POST', headers: JSONH, corps: { hash: HASH } });
  const grant = lg.j && lg.j.grant;
  noter(lg.status === 200 && lg.j && lg.j.ok === true && !!grant, 'A. connexion admin acceptée par le domaine (comme Kevin)', 'HTTP ' + lg.status + (lg.j && lg.j.reason ? ' · ' + lg.j.reason : ''));
  const fermee = await appel('/__admin/proposer', { method: 'POST', headers: JSONH, corps: { action: 'message_direct', nom: 'Zzzzzz Qqqqq', texte: 'essai' } });
  noter((fermee.status === 401 || fermee.status === 403) && !JSON.stringify(fermee.j || {}).includes('"jeton"'), 'B. SANS session admin : porte fermée, aucune signature', 'HTTP ' + fermee.status);
  if (grant) {
    const H = Object.assign({ 'x-kdmc-admin': grant }, JSONH);
    const md = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'message_direct', nom: 'Zzzzzz Qqqqq', texte: 'bonjour essai' } });
    const bonMd = md.status < 500 && md.j && ((md.status === 200 && md.j.ok === true && /^v1\./.test(String(md.j.proposition && md.j.proposition.jeton))) || (md.status >= 400 && md.j.ok === false && typeof md.j.texte === 'string' && md.j.texte));
    noter(!!bonMd, 'C. message_direct (personne inventée) : une proposition signée OU un refus clair, jamais un 5xx', 'HTTP ' + md.status + (md.j && md.j.reason ? ' · ' + md.j.reason : ''));
    const ac = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'arbre_commentaire', personne: 'Zzzzzz Qqqqq', texte: 'essai' } });
    const bonAc = ac.status < 500 && ac.j && ((ac.status === 404 && ac.j.reason === 'introuvable' && typeof ac.j.texte === 'string') || (ac.status === 200 && ac.j.ok === true));
    noter(!!bonAc, 'D. arbre_commentaire sur une fiche inconnue : « introuvable » clair, jamais un 5xx', 'HTTP ' + ac.status + (ac.j && ac.j.reason ? ' · ' + ac.j.reason : ''));
    const hl = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'compte_creer', nom: 'x' } });
    noter(hl.status === 400 && hl.j && hl.j.reason === 'action_non_ouverte', 'E. une action hors liste est refusée (400)', 'HTTP ' + hl.status);
    /* H-I (pc-connecteurs 3248/3251 : phrases 4 et 5 non mesurées à l'écran) : la porte des deux cartes d'écriture de l'arbre, sur une personne INVENTÉE : « introuvable » clair, jamais un 5xx. */
    const ch = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'arbre_champ', personne: 'Zzzzzz Qqqqq', champ: 'naissance', valeur: '1950-01-01' } });
    noter(ch.status < 500 && ch.j && ((ch.status === 404 && ch.j.reason === 'introuvable') || (ch.status === 200 && ch.j.ok === true)), 'H. arbre_champ (correction de date) sur une fiche inconnue : « introuvable » clair, jamais un 5xx', 'HTTP ' + ch.status + (ch.j && ch.j.reason ? ' · ' + ch.j.reason : ''));
    const inf = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'arbre_info', personne: 'Zzzzzz Qqqqq', texte: 'telephone fictif 0600000000' } });
    noter(inf.status < 500 && inf.j && ((inf.status === 404 && inf.j.reason === 'introuvable') || (inf.status === 200 && inf.j.ok === true)), 'I. arbre_info (numéro fictif) sur une fiche inconnue : « introuvable » clair, jamais un 5xx', 'HTTP ' + inf.status + (inf.j && inf.j.reason ? ' · ' + inf.j.reason : ''));
    /* G. compte de TEST créé exprès (Kevin 27.11 : « crée un autre compte pour ton test et efface-le ensuite ») : une carte « Écrire à » vers un VRAI compte, jamais confirmée ;
       le compte (« Parcours Robot… », préfixe de test connu) est supprimé dans tous les cas, puis RELU pour prouver qu'il n'existe plus. */
    let uidTest = '';
    const tok = lg.j && lg.j.token;
    const HT = Object.assign({ 'x-kdmc-sso': tok || '', 'x-kdmc-sonde': 'verif-apex-cartes' }, JSONH);
    try {
      const alea = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
      const nomTest = 'Parcours Robot' + alea;
      const cr = await appel('/__admin/compte-invite', { method: 'POST', headers: HT, corps: { prenom: 'Parcours', nom: 'Robot' + alea, code: 'rb' + alea.slice(0, 3) + '4821', telephone: '+33600000093', tel_mode: 'saisi' } });
      uidTest = (cr.j && cr.j.uid) || '';
      noter(cr.status === 200 && cr.j && cr.j.ok === true && !!uidTest, 'G1. compte de test créé (Parcours Robot…)', 'HTTP ' + cr.status);
      if (uidTest) {
        const mt = await appel('/__admin/proposer', { method: 'POST', headers: H, corps: { action: 'message_direct', nom: nomTest, texte: 'bonjour essai' } });
        noter(mt.status === 200 && mt.j && mt.j.ok === true && /^v1\./.test(String(mt.j.proposition && mt.j.proposition.jeton)), 'G2. message_direct vers un VRAI compte (le compte de test) : carte signée, jamais exécutée', 'HTTP ' + mt.status + (mt.j && mt.j.reason ? ' · ' + mt.j.reason : ''));
        const ac2 = await appel('/__admin/ecrire-apex-chat?q=' + encodeURIComponent(nomTest) + '&texte=' + encodeURIComponent('bonjour essai'), { headers: HT });
        noter(ac2.status === 200 && ac2.j && ac2.j.ok === true && ac2.j.correspondances >= 1, 'G4. écrire dans Apex Chat à un VRAI compte (le compte de test) : lien d\'écriture préparé, rien d\'envoyé', 'HTTP ' + ac2.status + ' · correspondances : ' + (ac2.j && ac2.j.correspondances));
      }
    } catch (e) { noter(false, 'G. erreur', e && e.message); }
    finally {
      if (uidTest) {
        const de = SAB === 'nodelete' ? { status: 0, j: null } : await appel('/__admin/compte-supprimer', { method: 'POST', headers: HT, corps: { uid: uidTest, confirmer: true } });
        const lst = await appel('/__admin/accounts?limit=500', { headers: HT });
        const reste = ((lst.j && lst.j.accounts) || []).some((a) => a.uid === uidTest);
        noter(de.status === 200 && de.j && de.j.ok === true && !reste, 'G3. compte de test supprimé puis relu : il n\'existe plus', 'HTTP ' + de.status + ' · reste : ' + (reste ? 'OUI' : 'non'));
      }
    }
  } else { noter(false, 'C-E. non essayés : pas de session admin'); }
  noter(appelsAgir === 0, 'F. aucune exécution : 0 appel à /__javis/agir (la porte ne fait que proposer)', appelsAgir + ' appel(s)');
} catch (e) { noter(false, 'ERREUR du robot', e && e.message); }
console.log(`\n=== VÉRIF APEX CARTES : ${okn} ✅ · ${ko} ❌`);
process.exit(ko ? 1 : 0);
