/* GARDE — « APEX RÉPOND SANS CLÉ, PAR LES IA GRATUITES DU DOMAINE » (Kevin 15.10.2026 : « Apex ne fonctionne plus.
 * Répare, vérifie, corrige, améliore tout, niveau commercial »).
 *
 * MESURÉ le 15.10 dans un vrai Chromium (Apex v13.4.369 ouverte comme Kevin) : « Bonjour Apex… » →
 * « ⚠ Aucune clé API configurée. Va dans le Coffre ». Apex ne répondait qu'avec des clés rangées dans le
 * téléphone ; sa route serveur exigeait l'empreinte du code admin (401 sur /qwen, /groq, /cerebras), et un
 * écran « tape ton code » recouvrait le chat après chaque connexion. Réparé en v13.4.370 : la passerelle
 * apis.kd-mc.com/ai (gratuit d'abord, conférence, outils pour Kevin vérifié).
 *
 * Ce garde verrouille, dans le code source d'Apex :
 *   1. sans clé → la passerelle répond (plus jamais « Aucune clé » tant qu'elle est allumée) ;
 *   2. toutes les clés en panne → dernier recours, la passerelle ;
 *   3. la date de Monaco part avec chaque question ; question courte = rapide, travail = conférence ;
 *   4. la page autorise apis.kd-mc.com (CSP) ; l'écran de code et l'alerte rouge se taisent ;
 *   5. version cohérente (badge, service worker = mise à jour forcée) ;
 *   6. sabotage : chaque contrôle rougit quand on retire la réparation.
 * node tests/verify-apex-passerelle.mjs */
import { readFileSync } from 'node:fs';

const R = 'apex-ai/v13/';
const lire = (f) => readFileSync(R + f, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };

export function controles(src) {
  const { router, gw, pin, rot, chat, html, sw, boot, pkg } = src;
  const csp = html.slice(html.indexOf('connect-src'), html.indexOf(';', html.indexOf('connect-src')));
  const ver = (boot.match(/APP_VER = '(v[\d.]+)'/) || [])[1];
  return [
    [/const noLocalKey = !this\.hasAnyKey\(\);\s*\n\s*if \(noLocalKey && !gatewayEnabled\(\)\)/.test(router), '1. « Aucune clé API » seulement si la passerelle est éteinte'],
    [/if \(noLocalKey\) \{[\s\S]{0,600}this\.askGateway\(filteredMessages, system, ctrl\.signal, wrappedOnChunk\)/.test(router), '1b. sans clé : la question part à la passerelle'],
    [/Toutes les clés ont échoué[\s\S]{0,400}gatewayEnabled\(\) && textOnly[\s\S]{0,200}this\.askGateway\(/.test(router), '2. toutes les clés en panne : dernier recours, la passerelle (avant le message d\'échec)'],
    [/KDMC_AI_URL = 'https:\/\/apis\.kd-mc\.com\/ai'/.test(gw) && /'x-kdmc-sso'/.test(gw), '2b. passerelle du domaine + jeton de Kevin (outils : météo, web, calcul)'],
    [/'Nous sommes le ' \+ dateMonaco\(\)/.test(gw) && /timeZone: 'Europe\/Monaco', weekday: 'long'/.test(gw), '3. la date exacte de Monaco accompagne chaque question'],
    [/return \{ analyse: 'regex', domain: 'speed' \}/.test(gw) && /length > 400\) return \{ analyse: 'regex' \}/.test(gw), '3b. demande courte → rapide (1,2 à 4 s mesurés) ; demande longue → conférence'],
    [csp.includes('https://apis.kd-mc.com'), '4. la page autorise apis.kd-mc.com (sinon le navigateur bloque l\'appel)'],
    [/if \(gatewayEnabled\(\)\) return false;/.test(pin), '4b. l\'écran « tape ton code » ne recouvre plus le chat (le code ne s\'écrit nulle part)'],
    [/if \(gatewayEnabled\(\)\) \{\s*\n\s*logger\.info\('ai-key-rotation'/.test(rot), '4c. pas d\'alerte rouge « toutes les IA KO » quand la passerelle prend le relais'],
    [/const hasKey = aiRouter\.hasAnyKey\(\) \|\| gatewayEnabled\(\);/.test(chat), '4d. pas de bandeau « Pas de clé API » faux'],
    [!!ver && sw.includes(`'apex-${ver}'`) && html.includes(`data-app-ver="${ver}"`) && pkg.includes(`"version": "${ver.slice(1)}"`), '5. version cohérente partout (badge + service worker → mise à jour forcée) : ' + ver],
  ];
}

const src = {
  router: lire('services/ai/ai-router.ts'), gw: lire('services/ai/kdmc-gateway.ts'), pin: lire('services/auth/proxy-pin-activation.ts'),
  rot: lire('services/ai/ai-key-rotation.ts'), chat: lire('features/chat/index.ts'), html: lire('index.html'), sw: lire('sw.js'),
  boot: lire('core/bootstrap.ts'), pkg: lire('package.json'),
};
for (const [c, m] of controles(src)) ok(c, m);

/* 6. sabotage : chaque réparation retirée → son contrôle rougit */
const sabotages = [
  ['router', (s) => s.replace('if (noLocalKey && !gatewayEnabled())', 'if (noLocalKey)'), 0],
  ['router', (s) => s.replace('const g = await this.askGateway(filteredMessages, system, ctrl.signal, wrappedOnChunk);\n      if (g === \'aborted\' || g === \'ok\')', 'const g = \'x\';\n      if (g === \'aborted\' || g === \'ok\')'), 1],
  ['router', (s) => s.replace('gatewayEnabled() && textOnly && !ctrl.signal.aborted', 'false'), 2],
  ['gw', (s) => s.replace("'Nous sommes le ' + dateMonaco()", "''"), 4],
  ['gw', (s) => s.replace("return { analyse: 'regex', domain: 'speed' };", "return { analyse: 'regex' };"), 5],
  ['html', (s) => s.replace('https://apis.kd-mc.com\n', ''), 6],
  ['pin', (s) => s.replace('if (gatewayEnabled()) return false;', ''), 7],
  ['rot', (s) => s.replace("if (gatewayEnabled()) {\n      logger.info('ai-key-rotation'", "if (false) {\n      logger.info('ai-key-rotation'"), 8],
  ['chat', (s) => s.replace(' || gatewayEnabled();', ';'), 9],
  ['sw', (s) => s.replace(/'apex-v[\d.]+'/, "'apex-v0.0.0'"), 10],
];
for (const [cle, f, i] of sabotages) {
  const casse = Object.assign({}, src, { [cle]: f(src[cle]) });
  ok(casse[cle] !== src[cle] && controles(casse)[i][0] === false, '6. sabotage « ' + controles(src)[i][1].slice(0, 60) + '… » → rouge');
}
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
