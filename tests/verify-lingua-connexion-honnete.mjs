/* PREUVE — « Se connecter » de KDMC Lingua dit la VÉRITÉ, et l'identité est
 * PRÉNOM + NOM.
 * ===========================================================================
 * Kevin, 3.09.2026, capture à l'appui : il tape son prénom + son code sur
 * kdmc-site.pages.dev et l'app répond « Aucune sauvegarde pour ce prénom +
 * code 🤔 ». Sa phrase : « j'ai pourtant un compte ».
 *
 * CAUSE MESURÉE : la progression en ligne est servie par `/__lingua/load`, route
 * du Worker **kdmc-router** (services/kdmc-router/worker.js), sur
 * `lingua.kd-mc.com`. Quand cet appel échoue, le `.catch` renvoyait le MÊME
 * résultat que « le cloud a répondu : rien trouvé ». L'app annonçait donc une
 * perte de compte là où il n'y avait qu'un serveur injoignable. Mensonge
 * d'interface — exactement ce que la règle « toujours détailler les erreurs »
 * interdit.
 *
 * ⚠️ PRÉCISION 5.09 (mesurée, l'ancienne version de ce commentaire était fausse) :
 * `lingua.kd-mc.com` RÉSOUT bien en DNS (même IP que kd-mc.com) et le CORS de
 * `/__lingua/*` est ouvert à toutes les origines. « Domaine indisponible » n'a
 * jamais été vérifié — c'était une supposition. La cause du message reste le
 * repli fautif ci-dessus, quelle que soit la raison de l'échec de l'appel.
 *
 * 🔐 AJOUT 5.09 (Kevin : « ajoute nom et prénom pour la connexion, si 2 personnes
 * ont le même prénom ça va poser problème ») : l'identité est maintenant
 * PRÉNOM + NOM — c'est aussi la règle absolue du dépôt « LOGIN TOUJOURS PRÉNOM
 * + NOM ». La clé cloud est donc `hash(prénom+nom trié : code)`. Les comptes
 * créés AVANT cette règle (clé « prénom seul ») doivent RESTER retrouvables,
 * sinon on ferait perdre sa progression à tout le monde le jour du changement.
 *
 * Ce test charge la VRAIE page dans un vrai navigateur (aucun réseau : le
 * serveur de sauvegarde est simulé) et prouve les six cas :
 *   1. serveur injoignable   → « ne répond pas … n'est pas perdue »
 *   2. serveur OK mais vide  → « aucune sauvegarde », et les prénoms présents
 *      sur l'appareil sont proposés (cas « je me suis trompé de prénom »)
 *   3. stockage serveur absent (`{ok:false,reason:'kv_absent'}`, fail-open 200)
 *      → surtout PAS « aucune sauvegarde » : le compte n'est pas en cause
 *   4. sauvegarde sous une ANCIENNE clé (prénom seul) → on la retrouve quand même,
 *      et le compte est réenregistré sous le nom complet (jamais régresser)
 *   5. sauvegarde trouvée    → on entre, sans message d'erreur
 *   6. prénom SEUL (nom vide) → refusé avant tout appel réseau (homonymes)
 *
 * Lancer : node tests/verify-lingua-connexion-honnete.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const ADMIN_CODE = process.env.KDMC_ADMIN_CODE || '200807'; // code de TEST ; en CI → secret KDMC_ADMIN_CODE (le vrai code ne s'écrit jamais ici)

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PAGE = 'file://' + process.cwd() + '/lingua/index.html';

/* --- garde de source : le catch ne doit PLUS se confondre avec « rien trouvé » */
const src = readFileSync('lingua/app.js', 'utf8');
chk(/injoignable:true/.test(src), 'source : le cas « serveur injoignable » existe et est distinct');
chk(/return \{ok:false,none:true\}/.test(src), 'source : le cas « le cloud a répondu, rien trouvé » reste distinct');
chk(/function localNames/.test(src), 'source : on sait lister les prénoms présents sur l\'appareil');
/* --- garde de source : identité = prénom + nom (règle absolue du dépôt) ------ */
chk(/function fullNameOk/.test(src) && /nameTokens\(s\)\.length>=2/.test(src),
  'source : un seul mot ne suffit pas — prénom ET nom exigés');
chk(/function nameKey/.test(src) && /\.sort\(\)/.test(src),
  'source : la clé trie les mots — « Kevin Desarzens » et « Desarzens Kevin » = même compte');
chk(/function legacyCloudKeys/.test(src),
  'source : les anciennes clés (prénom seul) sont encore interrogées — rien n\'est perdu');
chk(/#lgPrenom|"lgPrenom"/.test(src) && /#lgNom|"lgNom"/.test(src) && !/lgName/.test(src),
  'source : l\'écran de connexion a bien DEUX champs (prénom, nom)');

const nav = await chromium.launch();
const ctx = await nav.newContext();

async function essai({ cloud, comptesLocaux, prenom = 'kevin', nom = 'desarzens' }) {
  const page = await ctx.newPage();
  await page.addInitScript(([cl, comptes]) => {
    /* départ propre à CHAQUE cas : sinon un compte créé par un test précédent
       déclenche la règle « reconnu auto » et l'écran de connexion n'apparaît
       jamais — le test suivant passerait au vert sans rien avoir vérifié. */
    try { localStorage.clear(); } catch (e) {}
    /* « legacy » : le serveur ne connaît la sauvegarde que sous une ANCIENNE clé
       (prénom seul, d'avant la règle prénom+nom) → il ne répond « trouvé » qu'à
       partir du 3ᵉ essai de clé. Prouve le repli multi-clés. */
    window.__nAppels = 0;
    /* comptes déjà présents sur cet appareil (avant tout chargement) */
    if (comptes) localStorage.setItem('lingua_g_accounts', JSON.stringify(comptes));  /* préfixe réel du stockage global : lingua_g_ */
    /* on remplace le serveur de sauvegarde : injoignable / vide / trouvé */
    const vrai = window.fetch;
    const j = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    const TROUVE = { ok: true, data: { v: 2, name: 'Kevin', avatar: '🐝', syncTs: 1, data: {} } };
    window.fetch = async (u, o) => {
      const url = String(u);
      if (url.includes('__lingua')) {
        if (url.includes('/load')) window.__nAppels++;
        if (cl === 'injoignable') throw new TypeError('Failed to fetch');
        if (cl === 'vide') return j({ ok: false });
        /* Le serveur RÉPOND, mais son stockage (KV) est absent — worker.js:340 renvoie
           {ok:false,reason:'kv_absent'} en 200 (fail-open). Ce n'est PAS une absence de compte. */
        if (cl === 'kv') return j({ ok: false, reason: 'kv_absent' });
        if (cl === 'legacy') {
          if (!url.includes('/load')) return j({ ok: true });      /* le réenregistrement */
          /* clés essayées dans l'ordre : prénom+nom trié, saisie brute, puis chaque
             mot seul. La sauvegarde de Kevin date d'avant la règle → 3ᵉ clé. */
          return j(window.__nAppels >= 3 ? TROUVE : { ok: false });
        }
        return j(TROUVE);
      }
      return vrai(u, o);
    };
  }, [cloud, comptesLocaux || null]);

  await page.goto(PAGE);
  /* on ATTEND que l'écran soit là plutôt que de deviner un délai : une machine
     lente (CI) rendait le test intermittent — 1 essai sur 6 au départ. */
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((b) => /déjà un compte/i.test(b.textContent)), null, { timeout: 15000 });
  /* on clique VRAIMENT « J'ai déjà un compte », comme Kevin (le code est dans
     une IIFE : rien n'est global, donc on passe par l'interface réelle) */
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => /déjà un compte/i.test(b.textContent)).click());
  await page.waitForSelector('#lgPrenom', { timeout: 5000 });
  await page.fill('#lgPrenom', prenom);
  await page.fill('#lgNom', nom);
  await page.fill('#lgCode', ADMIN_CODE);
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => /Retrouver mon compte/.test(b.textContent)).click());
  /* on attend le message (ou l'entrée dans l'app), sans délai fixe */
  await page.waitForFunction(() => document.querySelector('.toast') || !document.querySelector('#lgPrenom'),
    null, { timeout: 15000 }).catch(() => {});
  /* petit temps de repos : en cas de SUCCÈS le message de bienvenue apparaît
     AVANT que la fenêtre ne se referme — lire trop tôt ferait croire qu'on
     n'est pas entré. */
  await page.waitForTimeout(500);
  /* le message est un .toast dans le DOM — on lit ce que Kevin lit */
  const messages = (await page.evaluate(() =>
    [...document.querySelectorAll('.toast')].map((t) => t.textContent))).join(' | ');
  const entre = await page.evaluate(() => !document.querySelector('#lgPrenom'));
  const nAppels = await page.evaluate(() => window.__nAppels || 0);
  /* nom réellement enregistré sur l'appareil (pour vérifier la migration de clé) */
  const nomStocke = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]').slice(-1)[0] || {}).name || ''; }
    catch (e) { return ''; }
  });
  await page.close();
  return { messages, entre, nAppels, nomStocke };
}

/* --- 1. serveur injoignable (le cas réel de Kevin) ------------------------- */
let r = await essai({ cloud: 'injoignable' });
chk(/ne répond pas/i.test(r.messages) && /pas perdue/i.test(r.messages),
  `1. serveur injoignable → on dit la vérité (« ${r.messages.slice(0, 90) }… »)`);
chk(!/Aucune sauvegarde/i.test(r.messages),
  '1. et on n\'annonce PLUS « aucune sauvegarde » — c\'est ce qui a fait croire à Kevin qu\'il avait tout perdu');

/* --- 2. serveur OK mais rien, avec des comptes locaux sous d'autres codes --- */
/* Les codes locaux sont VOLONTAIREMENT différents de celui tapé : sinon la
   recherche locale trouverait le compte et on n'atteindrait jamais le cloud.
   Deux comptes, car avec un seul le boot entre AUTOMATIQUEMENT dedans (règle
   « reconnu auto ») et l'écran de connexion n'apparaît jamais. */
r = await essai({ cloud: 'vide', comptesLocaux: [
  { id: 'a1', name: 'Kevin', avatar: '🐝', code: '0000', created: 1 },
  { id: 'a2', name: 'Laurence', avatar: '🦊', code: '1234', created: 2 }] });
chk(/Aucune sauvegarde/i.test(r.messages), '2. serveur OK et vide → là, « aucune sauvegarde » est exact');
chk(/Kevin/.test(r.messages),
  `2. et on propose les prénoms présents sur l'appareil (« ${r.messages.slice(-70)} »)`);

/* --- 3. serveur OK mais SON stockage est absent → surtout pas « aucune sauvegarde » */
r = await essai({ cloud: 'kv' });
chk(!/Aucune sauvegarde/i.test(r.messages),
  '3. stockage serveur absent → on n\'annonce PAS une perte de compte');
chk(/pas perdue/i.test(r.messages),
  `3. et on rassure sur la progression (« ${r.messages.slice(0, 90)}… »)`);

/* --- 4. sauvegarde sous une ANCIENNE clé (prénom seul) --------------------- */
r = await essai({ cloud: 'legacy' });
chk(r.entre && !/Aucune sauvegarde/i.test(r.messages),
  `4. compte d'avant la règle prénom+nom → on le retrouve quand même (${r.nAppels} clés essayées)`);
chk(r.nAppels >= 3,
  '4. et on a bien essayé les anciennes clés, pas seulement la nouvelle');
chk(/desarzens/i.test(r.nomStocke) && /kevin/i.test(r.nomStocke),
  `4. le compte est réenregistré sous le nom COMPLET (« ${r.nomStocke} ») — la prochaine connexion tombe direct dessus`);

/* --- 5. sauvegarde trouvée → on entre ------------------------------------- */
r = await essai({ cloud: 'trouve' });
chk(r.entre && !/Aucune sauvegarde|ne répond pas/i.test(r.messages),
  '5. sauvegarde trouvée → on entre, sans message d\'erreur');

/* --- 6. prénom SEUL → refusé (deux personnes peuvent avoir le même prénom) -- */
r = await essai({ cloud: 'trouve', nom: '' });
chk(!r.entre, '6. prénom seul → on n\'entre PAS, même si le serveur avait une sauvegarde');
chk(/pr[ée]nom ET ton nom/i.test(r.messages),
  `6. et on explique quoi faire (« ${r.messages.slice(0, 60)} »)`);
chk(r.nAppels === 0,
  '6. rien n\'est même demandé au serveur — le nom manquant est refusé avant');

await nav.close();
R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
