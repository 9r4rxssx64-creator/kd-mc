/* VÉRIFICATION RÉELLE — « la porte commune du journal marche, app par app » (Kevin 17.11.2026 : « qui a fait quoi ou quand, de tout le domaine, chaque app »).
 * Mesuré le 17.11 au soir : 9 h après le branchement de window.kdmcJournal dans 8 apps, la vraie base ne comptait AUCUNE ligne venue de cette porte — impossible
 * de dire si personne n'avait rien enregistré ou si la porte était cassée. Ce robot tranche : connecté en admin sur le VRAI domaine (code admin = SECRET, empreinte,
 * jamais écrite ni journalisée), il ouvre chaque app, dit si le script du domaine y a bien posé window.kdmcJournal, envoie UNE ligne d'essai par la porte
 * (/__boite/journal) et lit la réponse du domaine (ajoute / doublon). Tout autre envoi est absorbé (lecture seule).
 * TRACES : une ligne « essai du robot (porte du journal) » par app, au nom du compte admin — celui qui lance le robot les efface ensuite dans la base
 * (DELETE FROM activite WHERE detail LIKE 'essai du robot (porte du journal)%'). Journal public : verdicts et nombres seulement, aucun nom. À la main seulement. */
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { trouverModuleJournal, appelerModuleJournal } from './lib/preuve-journal-app.mjs';

const MARQUE = 'essai du robot (porte du journal)';
const HASH = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const APPS = (process.env.APPS || 'kd-mc.com apex-chat.kd-mc.com apex-ai.kd-mc.com cmcteams.kd-mc.com cmcteams-light.kd-mc.com departs.kd-mc.com arbre.kd-mc.com lingua.kd-mc.com chez-lolo.kd-mc.com dashboard.kd-mc.com')
  .split(/[\s,]+/).map((x) => x.trim().replace(/\/+$/, '')).filter((x) => /^([a-z0-9-]+\.)?kd-mc\.com(\/[a-z0-9._-]+)*$/.test(x));
const APP_SANS_SCRIPT = 'apex-ai.kd-mc.com';
/* 19.11 (run 44584256541) : une app dont l'accueil interdit tout script (script-src 'none', connect-src 'none') ne peut jamais appeler
   le journal depuis « / » : le robot ouvre la page qui l'appelle vraiment. Une adresse « hôte/page.html » dans APPS l'emporte. */
const PAGE_DE_DEPART = {
  'croupier.kd-mc.com': '/acces.html', // « / » = vitrine sans script ; le journal part d'acces.html (paiement enregistré)
};
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
/* 19.11 (apex-cloud) : le 2e et le 3e passage réels se sont figés sans rien dire (le journal d'une étape en cours n'est lisible qu'à sa fin). Garde-fou : le robot
   se coupe seul au bout de 10 min (le poste de calcul est lent : l'installation du navigateur seule a pris 8 min le 19.11) et écrit À QUELLE ÉTAPE il était. */
let phase = 'départ'; const durees = []; let tPhase = Date.now();
const etape = (n) => { durees.push(`${n} ${Math.round((Date.now() - tPhase) / 1000)} s`); tPhase = Date.now(); };
const garde = setTimeout(() => {
  dire(`❌ VÉRIF JOURNAL INTERROMPUE après 10 min (le robot se coupe seul) — étape : ${phase} · durées déjà mesurées : ${durees.join(', ') || '-'}`);
  if (RESUME) { try { appendFileSync(RESUME, lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  process.exit(1);
}, 600000);
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); process.exit(1); }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  /* 18.11 : ce robot tourne sur le poste de Kevin (runner du Lenovo), donc hors du réseau des robots : ses 10 pages ouvertes s'écrivaient dans le journal au nom
     du compte admin (52 lignes au 1er passage, effacées à la main). Il se présente donc comme un APPAREIL DE ROBOT connu du journal (iPhone · iOS 15.0 · Safari 18,
     `APPAREIL_ROBOT` dans services/kdmc-router/activite.js) : ses pages ne se montrent pas à Kevin et ne comptent que contre les robots. Il ne reste à effacer
     que ses lignes d'essai. */
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const DOMAINE = /(^|\.)kd-mc\.com$/, ECRITURE_OK = /^\/__(admin\/login|sso\/[a-z]+|boite\/journal)$/;
await ctx.route('**/*', (r) => {
  const q = r.request(), m = q.method(); let u; try { u = new URL(q.url()); } catch (_) { return r.abort(); }
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return r.fallback();
  if (DOMAINE.test(u.hostname) && ECRITURE_OK.test(u.pathname)) return r.fallback();
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lectureSeule":true}' });
});

const page = await ctx.newPage();
await page.goto('https://kd-mc.com/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
phase = 'connexion admin';
const c = await page.evaluate(async (h) => {
  const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
  const j = await x.json().catch(() => ({}));
  return { st: x.status, ok: !!j.ok, raison: j.reason || '', token: j.token || '', grant: j.grant || '' };
}, HASH);
dire(`${c.ok ? '✅' : '❌'} connexion ADMIN au domaine${c.ok ? '' : ' — HTTP ' + c.st + ' ' + c.raison}`);
if (!c.ok) { await browser.close(); process.exit(1); }

let bons = 0, mauvais = 0;
for (const entree of APPS) {
  const coupe = entree.indexOf('/');
  const hote = coupe < 0 ? entree : entree.slice(0, coupe);
  const chemin = coupe < 0 ? (PAGE_DE_DEPART[hote] || '/') : entree.slice(coupe);
  phase = hote + ' : ouverture de la page';
  const p = await ctx.newPage();
  let script = false, st = 0, etat = '', raison = '', preuve = null;
  try {
    await p.goto('https://' + hote + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await p.evaluate(({ t, g }) => { try { if (t) localStorage.setItem('kdmc_sso_token', t); if (g) localStorage.setItem('kdmc_admin_grant', g); } catch (_) { /* rien */ } }, { t: c.token, g: c.grant }).catch(() => {});
    await p.goto('https://' + hote + chemin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    etape('ouverture'); phase = hote + ' : attente du script du domaine';
    script = await p.waitForFunction(() => typeof window.kdmcJournal === 'function', null, { timeout: 15000 }).then(() => true).catch(() => false);
    /* L'envoi passe par la MÊME porte que window.kdmcJournal, mais avec la réponse en main : l'app, elle, ne la lit jamais. */
    etape('script'); phase = hote + ' : envoi de la ligne par la porte';
    const r = await p.evaluate(async (detail) => {
      const x = await fetch('/__boite/journal', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'modif', detail }) });
      const j = await x.json().catch(() => ({}));
      return { st: x.status, etat: j.etat || '', raison: j.reason || '' };
    }, MARQUE + ' ' + hote);
    st = r.st; etat = r.etat; raison = r.raison;
    /* 18.11 (apex-cloud 2676) : Apex AI n'a JAMAIS le script du domaine (sa sécurité de page le refuse) ; son code écrit alors directement à la porte (v13.4.399).
       « script ABSENT » y est donc normal : ce qui compte est que LE CODE DE L'APP écrive vraiment une ligne, prouvé ici en l'exécutant dans la vraie page. */
    etape('porte'); phase = hote + ' : preuve du code de l app (recherche du module, appel)';
    if (hote === APP_SANS_SCRIPT) {
      const suivi = (n) => { phase = hote + ' : preuve du code de l app — ' + n; };
      const t = await trouverModuleJournal(p, { suivi });
      if (!t.lien) preuve = { ok: false, motif: `module du journal introuvable (${t.lus} fichier(s) lus, ${t.candidats} candidat(s))`, etat: '' };
      else {
        /* Le module s'exécute dans une page VIERGE du même domaine (pas dans la page de l'app, qui charge des centaines de fichiers : sur un poste lent l'import y prenait
           plus de 10 minutes, mesuré le 19.11). Sans le script du domaine : exactement la situation d'Apex AI. */
        etape('recherche du module');
        suivi('ouverture d\'une page vierge du domaine');
        const p2 = await ctx.newPage();
        try {
          await p2.goto('https://' + hote + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          preuve = await appelerModuleJournal(p2, t.lien, MARQUE + ' code ' + hote + ' ' + Date.now().toString(36), { suivi });   /* phrase UNIQUE : la contre-épreuve repose sur « doublon » */
        } finally { await p2.close().catch(() => {}); }
      }
    }
  } catch (e) { raison = String(e && e.message || e).split('\n')[0].slice(0, 120); }
  const porteOk = etat === 'ajoute' || etat === 'doublon';
  const ok = hote === APP_SANS_SCRIPT ? (porteOk && !!(preuve && preuve.ok)) : (script && porteOk);
  if (ok) bons++; else mauvais++;
  dire(`${ok ? '✅' : '❌'} ${hote}${chemin !== '/' ? chemin : ''} · script du journal ${script ? 'posé' : (hote === APP_SANS_SCRIPT ? 'absent (normal : sécurité de la page)' : 'ABSENT')} · porte HTTP ${st || '?'} · réponse ${etat || raison || '-'}${preuve ? ` · CODE DE L'APP ${preuve.ok ? 'écrit une ligne (contre-épreuve : ' + preuve.etat + ')' : 'N\'ÉCRIT PAS : ' + preuve.motif}` : ''} · durées : ${durees.splice(0).join(', ')}`);
  etape('preuve'); phase = hote + ' : fermeture de la page';
  await p.close().catch(() => {});
}

/* Pas de relecture par l'écran : le journal de l'admin écarte les appareils de robot (c'est voulu). La preuve finale se lit dans la base, puis les lignes
   d'essai s'effacent : DELETE FROM activite WHERE detail LIKE 'essai du robot (porte du journal)%'. */
dire(`=== VÉRIF JOURNAL : ${bons} app(s) OK · ${mauvais} en défaut · sur ${APPS.length}`);
if (RESUME) { try { appendFileSync(RESUME, lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
clearTimeout(garde);
phase = 'fermeture du navigateur';
await browser.close();
process.exit(mauvais ? 1 : 0);
