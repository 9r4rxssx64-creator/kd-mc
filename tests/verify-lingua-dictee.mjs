/* Kevin 8.11.2026 (atelier prononciation, iPad) : « j'ai dit le mot, il n'entend pas, il ne valide pas, c'est bloqué sur “…je t'écoute” ».
 * Cause : dictate() ne rappelait l'écran que sur onresult / onerror. Un navigateur qui termine SANS résultat (Safari : silence, Siri coupé)
 * laissait l'écran en attente pour toujours. Garde : la fonction réelle de lingua/app.js est exécutée contre de FAUX moteurs de
 * reconnaissance ; le rappel doit partir UNE fois dans chaque cas. Sabotage : APP=<ancien app.js> doit être rouge. */
import fs from 'node:fs'; import vm from 'node:vm';
const APP = process.env.APP || 'lingua/app.js';
const src = fs.readFileSync(APP, 'utf8');
let n = 0, ko = 0; const chk = (c, l) => { n++; if (!c) ko++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const a = src.indexOf('function dictate(cb,lang){'); const z = src.indexOf('\n\n/* ============ LEÇON', a);
const dm = src.slice(0, a).lastIndexOf('var _DICTEE_MS'); const debut = dm >= 0 && a - dm < 3000 ? dm : a;
const code = src.slice(debut, z);
function essai(SR, attente) {
  return new Promise((ok) => {
    const appels = []; const toasts = [];
    const ctx = { window: { SpeechRecognition: SR }, toast: (m) => toasts.push(m), _sonEcoute() {}, setTimeout, clearTimeout, console };
    vm.createContext(ctx); vm.runInContext(code + '\nthis.dictate=dictate; this._set=function(v){_DICTEE_MS=v};', ctx);
    if (ctx._set) ctx._set(150);
    ctx.dictate((t, alts) => appels.push([t, alts]), 'en-US');
    setTimeout(() => ok({ appels, toasts }), attente);
  });
}
const faux = (corps) => class { constructor() { this.abortes = 0; } start() { corps(this); } stop() { this.stopped = true; } abort() { this.abortes++; } };
let r;
r = await essai(faux((m) => setTimeout(() => m.onend && m.onend(), 50)), 1200);
chk(r.appels.length === 1 && r.appels[0][0] === '', 'fin SANS résultat (Safari muet) : l\'écran est rappelé UNE fois, texte vide');
r = await essai(faux(() => {}), 2200);
chk(r.appels.length === 1 && r.appels[0][0] === '', 'le micro ne répond jamais : le chien de garde rend la main UNE fois');
r = await essai(faux((m) => setTimeout(() => { m.onresult && m.onresult({ results: [[{ transcript: 'fruit' }, { transcript: 'fruits' }]] }); m.onend && m.onend(); }, 50)), 1200);
chk(r.appels.length === 1 && r.appels[0][0] === 'fruit' && r.appels[0][1].length === 2, 'un résultat suivi de la fin : UNE seule réponse, avec les 2 hypothèses');
r = await essai(faux((m) => setTimeout(() => m.onerror && m.onerror({ error: 'no-speech' }), 50)), 800);
chk(r.appels.length === 1 && r.appels[0][0] === '', 'erreur « rien entendu » : UN rappel');
r = await essai(faux((m) => setTimeout(() => m.onerror && m.onerror({ error: 'not-allowed' }), 50)), 800);
chk(r.appels.length === 1 && r.toasts.some((t) => /Micro refusé/.test(t)), 'micro refusé : UN rappel ET un message clair');
r = await essai(faux((m) => setTimeout(() => m.onnomatch && m.onnomatch(), 50)), 800);
chk(r.appels.length === 1, '« rien compris » (nomatch) : UN rappel');
r = await essai(undefined, 300);
chk(r.appels.length === 1, 'aucun moteur de reconnaissance : UN rappel');
chk(/function _webSpeak[\s\S]{0,2000}getVoices\(\)\|\|\[\]\)\.length\)\{ _wsSpeak\(u\); return; \}/.test(src), 'la voix de l\'appareil parle même quand Safari n\'a pas encore chargé sa liste de voix (sinon silence au 1er mot)');
console.log(`\n${n - ko}/${n} contrôles OK`); process.exit(ko ? 1 : 0);
