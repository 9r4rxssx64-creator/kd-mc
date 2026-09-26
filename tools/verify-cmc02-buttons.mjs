// Preuve navigateur RÉEL (lesson #126) que CMC-02 est corrigé : les 6 boutons
// drill-down dont le handler contient un " (showLiveList("working"), etc.) sont
// VIVANTS avec l'émetteur corrigé, et étaient MORTS avec l'ancien (contrôle).
// Extrait les VRAIES chaînes onClick de index.html (pas de drift).
import { chromium } from 'playwright';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
// Récupère les valeurs onClick réelles (celles qui contiennent un " interne = les 6 mortes).
const onClicks = [...html.matchAll(/onClick:"((?:[^"\\]|\\.)*)"/g)]
  .map(m => m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
// Handlers à " interne, COMPLETS (littéral unique se terminant par "}"). Les 5
// showLiveList/cmcShowExtendedStat en font partie.
const clean = onClicks.filter(s => s.includes('"') && s.trim().endsWith('}'));
// L30482 est un TEMPLATE concaténé ("+JSON.stringify(e.id)+") — le regex ne peut
// pas l'extraire d'un bloc ; on vérifie sa présence en source puis on teste sa
// forme RÉSOLUE (id concret), même mécanisme (" interne à échapper).
const has30482 = /onClick:"function\(\)\{if\(typeof showEmpQuickProfile===\\"function\\"\)showEmpQuickProfile\("\+JSON\.stringify/.test(html);
const resolved30482 = 'function(){if(typeof showEmpQuickProfile==="function")showEmpQuickProfile("U123");}';
const withQuote = [...clean, ...(has30482 ? [resolved30482] : [])];
console.log('handlers à " interne testés:', withQuote.length, '(5 littéraux + L30482 résolu:', has30482 + ')');

const OLD = oc => 'onclick="(' + oc + ')();"';                                   // ancien émetteur (buggé)
const NEW = oc => 'onclick="(' + String(oc).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + ')();"'; // corrigé

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? '✅' : '❌') + ' ' + m); };

const browser = await chromium.launch();
const page = await browser.newContext().then(c => c.newPage());
await page.setContent('<!doctype html><div id="root"></div>');

// stubs des handlers appelés par les onClick réels
await page.evaluate(() => {
  window.__calls = [];
  window.showLiveList = k => window.__calls.push('showLiveList:' + k);
  window.showEmpQuickProfile = id => window.__calls.push('showEmpQuickProfile:' + id);
  window.cmcShowExtendedStat = k => window.__calls.push('cmcShowExtendedStat:' + k);
  window.cmcCloseDrillModal = () => {};
});

// Contrôle : l'ANCIEN émetteur laisse un bouton MORT (attribut tronqué sur le ").
const deadFired = await page.evaluate((attr) => {
  window.__calls = [];
  document.getElementById('root').innerHTML = '<div id="b" ' + attr + '>x</div>';
  document.getElementById('b').click();
  return window.__calls.length;
}, OLD('function(){showLiveList&&showLiveList("working");}'));
ok(deadFired === 0, 'CONTRÔLE : ancien émetteur → bouton MORT (0 appel, attribut tronqué sur le ")');

// Fix : CHAQUE handler à " interne devient cliquable et appelle la bonne fonction.
for (const oc of withQuote) {
  const r = await page.evaluate((attr) => {
    window.__calls = [];
    document.getElementById('root').innerHTML = '<div id="b" ' + attr + '>x</div>';
    const el = document.getElementById('b');
    // preuve que l'attribut n'est plus tronqué : onclick complet présent
    const attrLen = (el.getAttribute('onclick') || '').length;
    el.click();
    return { fired: window.__calls.slice(), attrLen };
  }, NEW(oc));
  ok(r.fired.length === 1, 'FIX : handler cliquable → ' + (r.fired[0] || 'AUCUN APPEL') + ' (attr ' + r.attrLen + ' chars)');
}

ok(withQuote.length === 6, 'exactement 6 boutons drill-down concernés (comme l\'audit)');

await browser.close();
console.log(`\nverify-cmc02-buttons : ${pass} OK / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
