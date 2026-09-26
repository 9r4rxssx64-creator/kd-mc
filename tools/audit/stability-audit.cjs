#!/usr/bin/env node
/**
 * AUDIT STABILITÉ + COHÉRENCE — CMCteams (Kevin 2026-06-08 « ajoute tous ces tests à fais ton audit »)
 *
 * À LANCER À CHAQUE « fais l'audit » (axe 5 Fluidité, passe mesurée — CLAUDE.md) :
 *   node tools/audit/stability-audit.cjs           (statique seul, pas de navigateur)
 *   node tools/audit/stability-audit.cjs --browser (statique + mesure Playwright)
 *
 * Capture les classes de bugs vécues cette session :
 *  [A] CSP/fetch : un fetch/EventSource vers un domaine ABSENT de connect-src → "Load failed"
 *      (bug auth Firebase v9.791 : identitytoolkit.googleapis.com manquait dans la CSP).
 *  [B] Re-render au repos : render()/dc() doivent être ~0 sans interaction (boucle = scintillement).
 *  [C] Mutations DOM au repos par zone (#topbar/#content/#bnav) ≈ 0 ; >seuil = clignotement
 *      (bug badge sync non-idempotent v9.795 : #syncBadge mutait 49×/s, leçon #94).
 *  [D] Updaters DOM non-idempotents : textContent=/style.X=/innerHTML= sans garde "si change".
 *
 * Sortie : liste PASS/FAIL/WARN + exit code 1 si un FAIL bloquant. Chiffres réels (jamais estimés).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'index.html');
let fails = 0, warns = 0;
function ok(m){ console.log('  ✅ ' + m); }
function fail(m){ console.log('  ❌ ' + m); fails++; }
function warn(m){ console.log('  ⚠️  ' + m); warns++; }

const html = fs.readFileSync(HTML, 'utf8');

/* ───────────────── [A] CSP ⇄ fetch/EventSource ───────────────── */
console.log('\n[A] Cohérence CSP connect-src ⇄ domaines appelés (fetch/EventSource)');
const cspM = html.match(/connect-src([^;"]*)/);
if (!cspM) { fail('connect-src introuvable dans la CSP'); }
else {
  const allow = cspM[1].trim().split(/\s+/).filter(Boolean);
  // domaines réellement appelés en CONNECT (fetch / EventSource direct avec littéral https).
  // On NE scanne PAS les littéraux https arbitraires (liens, <link> polices, dashboards,
  // URLs d'autres projets) : ils relèvent de style-src/href, pas de connect-src → faux positifs.
  const used = new Set();
  const re = /(?:fetch|new EventSource|EventSource)\(\s*["'`]https:\/\/([a-z0-9.\-]+)/gi;
  let m; while ((m = re.exec(html))) used.add(m[1].toLowerCase());
  function covered(dom){
    return allow.some(a => {
      a = a.replace(/^https:\/\//,'');
      if (a === dom) return true;
      if (a.startsWith('*.')) return dom.endsWith(a.slice(1)); // *.x.com → .x.com
      return false;
    });
  }
  const miss = [...used].filter(d => !covered(d));
  console.log('     domaines appelés: ' + [...used].join(', '));
  if (miss.length) miss.forEach(d => fail('domaine appelé mais ABSENT de connect-src → "Load failed" garanti : ' + d));
  else ok(used.size + ' domaine(s) appelé(s), tous couverts par la CSP');
}

/* ───────────────── [D] Updaters DOM idempotents (statique) ───────────────── */
console.log('\n[D] Updaters de badges/indicateurs idempotents (anti-flicker, leçon #94)');
// les fonctions connues qui écrivent dans la barre du haut doivent comparer avant de muter
const guarded = [
  ['_updateSyncBadge', /function _updateSyncBadge[\s\S]{0,900}?(el\.textContent!==|el\.style\.display!==)/],
  ['_fbShowSyncBadge', /function _fbShowSyncBadge[\s\S]{0,900}?(el\.textContent!==|display!=="none"|_syncBadgeShowTimer)/],
  ['dc diff-guard',    /_cmcLastHtml!==_cmcNewHtml/],
];
guarded.forEach(([name, re]) => re.test(html) ? ok(name + ' : garde idempotent présent') : fail(name + ' : garde idempotent MANQUANT (risque flicker)'));
// valeur volatile (secondes live) dans le HTML rendu de la barre = défait les gardes
if (/_syncTitle[^\n]*\+_ts\b|connecté[^"]*"\+\(_ts/.test(html)) warn('valeur de secondes live ré-injectée dans la barre (défait le garde diff, cf v9.794)');
else ok('pas de compteur de secondes live dans le rendu de la barre');

/* ───────────────── [B/C] Mesure navigateur (optionnelle) ───────────────── */
async function browser(){
  console.log('\n[B/C] Mesure Playwright (re-render + mutations DOM au repos)');
  let chromium;
  try { chromium = require(path.join(ROOT,'apex-ai','v13','node_modules','playwright')).chromium; }
  catch(e){ warn('Playwright indisponible (' + e.message.slice(0,60) + ') — passe navigateur ignorée'); return; }
  const b = await chromium.launch(); const p = await b.newPage();
  await p.addInitScript(() => { try{localStorage.setItem('cmc_uid','U11804');localStorage.setItem('cmc_lastact',String(Date.now()));}catch(e){} });
  await p.goto('file://' + HTML, { waitUntil:'load' });
  await p.waitForTimeout(1800);
  for (const view of ['accueil','admin','monplanning']) {
    const r = await p.evaluate(async (v) => {
      var out={view:v}; var rc=0,dcc=0;
      var _r=window.render,_d=window.dc;
      window.render=function(){rc++;return _r.apply(this,arguments);};
      window.dc=function(){dcc++;return _d.apply(this,arguments);};
      try{A.view=v;dc();}catch(e){out.err=String(e).slice(0,80);}
      var rc0=rc,dcc0=dcc, zones={};
      ['topbar','content','bnav'].forEach(function(id){
        var el=document.getElementById(id); if(!el)return;
        zones[id]=0;
        var mo=new MutationObserver(function(ms){zones[id]+=ms.length;});
        mo.observe(el,{childList:true,subtree:true,attributes:true,characterData:true});
        el.__mo=mo;
      });
      await new Promise(r=>setTimeout(r,6000));
      ['topbar','content','bnav'].forEach(function(id){var el=document.getElementById(id);if(el&&el.__mo)el.__mo.disconnect();});
      out.render=rc-rc0; out.dc=dcc-dcc0; out.zones=zones;
      return out;
    }, view);
    const z = r.zones || {};
    const zs = Object.keys(z).map(k=>k+'='+z[k]).join(' ');
    const bad = (r.render>2) || (r.dc>2) || Object.values(z).some(n=>n>30);
    console.log(`     [${view}] render=${r.render} dc=${r.dc} mutations(6s): ${zs||'(vues absentes)'}`);
    if (r.render>2||r.dc>2) fail(`[${view}] re-render au repos (render=${r.render}, dc=${r.dc}) → boucle`);
    if (Object.values(z).some(n=>n>30)) fail(`[${view}] zone qui mute >30/6s au repos → clignotement`);
    if (!bad) ok(`[${view}] stable au repos`);
  }
  await b.close();
}

(async () => {
  if (process.argv.includes('--browser')) { try { await browser(); } catch(e){ warn('passe navigateur: ' + e.message.slice(0,80)); } }
  else console.log('\n[B/C] (passe navigateur ignorée — ajouter --browser pour mesurer render/dc/mutations)');
  console.log(`\n── Résultat audit stabilité : ${fails} FAIL, ${warns} WARN ──`);
  process.exit(fails > 0 ? 1 : 0);
})();
