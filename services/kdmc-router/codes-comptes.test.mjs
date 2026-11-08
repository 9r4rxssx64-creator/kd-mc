/* GARDE — les codes des comptes (Kevin 7.11.2026 « Code posé par l'admin, relisible » ; 8.11 : côté personnes UNE seule option, « Code oublié ? »)
   node services/kdmc-router/codes-comptes.test.mjs
   Par le VRAI routeur (worker.js), registre KV simulé, EmailJS simulé.
   Sabotages (doivent rendre ce test ROUGE) :
     SABOTAGE=signature → la signature du jeton n'est plus vérifiée : un jeton FORGÉ réinitialise le code d'un autre (contrôle 9)
     SABOTAGE=credv     → credSet n'efface plus la copie relisible : l'ancien code posé par l'admin reste lisible (contrôles 7, 12)
     SABOTAGE=unique    → le jeton n'est plus effacé : un 2e envoi du même lien rechange le code (contrôle 13)
     SABOTAGE=journal   → (simulé ici) le code part dans le journal : contrôle 17 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { jetonReinit, lireJetonReinit, chiffrerCode, dechiffrerCode, codeAuHasard, REPONSE_OUBLIE } from './codes-comptes.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, EMAILJS_PRIVATE_KEY: 'cle-emailjs' };
const mails = [];
globalThis.fetch = async (u, init) => {
  if (String(u).includes('api.emailjs.com')) { mails.push(JSON.parse(init.body)); return new Response('OK', { status: 200 }); }
  return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
};
const enFond = [];
const ctx = { waitUntil(p) { enFond.push(p); } };
const vider = async () => { while (enFond.length) await enFond.shift(); };
const ADM = { 'x-kdmc-admin': signe('__kdmc_admin__', 1) };
const appel = async (path, { method = 'GET', body, headers = {}, form, origin = 'https://kd-mc.com' } = {}) => {
  const h = Object.assign({ 'cf-connecting-ip': '203.0.113.9' }, origin ? { origin } : {}, headers);
  let corps;
  if (form) { corps = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
  else if (body !== undefined) { corps = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await mod.fetch(new Request('https://kd-mc.com' + path, { method, headers: h, body: corps }), env, ctx);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* page */ }
  return { st: r.status, j, t, ct: r.headers.get('content-type') || '', csp: r.headers.get('content-security-policy') || '' };
};
const login = (name, code) => appel('/__sso/login', { method: 'POST', body: { name, code } });

console.log('\nCodes des comptes : voir, poser, effacer (admin) · « Code oublié ? » par e-mail (personnes)\n');

/* Mise en place : un compte réel du domaine, créé par la vraie porte, avec téléphone ; son e-mail est rangé dans la fiche */
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marie-curie', name: 'Marie Curie', cgu: true, code: '314159', telephone: '+377 06 12 34 56' } });
ok(r.j && r.j.ok === true, '0. compte « Marie Curie » créé par la porte du domaine', r.j);
{ const a = JSON.parse(kv.get('acc:marie-curie')); a.fiche = { ...(a.fiche || {}), email: 'marie@exemple.fr' }; kv.set('acc:marie-curie', JSON.stringify(a)); }
await vider();

/* 1-2. La barrière admin */
r = await appel('/__admin/code-voir?uid=marie-curie');
ok(r.st === 403 && !(r.j && r.j.code), '1. sans être admin : code-voir refusé', r);
r = await appel('/__admin/code-poser', { method: 'POST', body: { uid: 'marie-curie', code: '999999' } });
ok(r.st === 403 && (await login('Marie Curie', '999999')).st === 401, '2. sans être admin : code-poser refusé (le code ne change pas)', r);

/* 3. Code choisi par la personne : illisible */
r = await appel('/__admin/code-voir?uid=marie-curie&montrer=1', { headers: ADM });
ok(r.j && r.j.ok && r.j.etat === 'personne' && r.j.lisible === false && !r.j.code && r.j.telephone === '+377 06 12 34 56' && r.j.email_masque === 'm…e@exemple.fr',
  '3. code choisi par la personne → « illisible », téléphone et e-mail MASQUÉ visibles pour dicter', r.j);

/* 4-6. L'admin pose un code à la main → il marche, il est relisible, il ne vit nulle part en clair */
r = await appel('/__admin/code-poser', { method: 'POST', headers: ADM, body: { uid: 'marie-curie', code: '271828' } });
ok(r.j && r.j.ok && r.j.code === '271828' && r.j.au_hasard === false, '4. l\'admin pose « 271828 » : rendu UNE fois dans la réponse', r.j);
ok((await login('Marie Curie', '271828')).j.ok === true && (await login('Marie Curie', '314159')).st === 401, '5. le code posé ouvre la connexion ; l\'ancien ne marche plus');
r = await appel('/__admin/code-voir?uid=marie-curie', { headers: ADM });
const sansMontrer = r.j;
r = await appel('/__admin/code-voir?uid=marie-curie&montrer=1', { headers: ADM });
ok(sansMontrer.etat === 'admin_pose' && !sansMontrer.code && r.j.code === '271828' && r.j.lisible === true,
  '6. code posé par l\'admin : relisible par l\'admin (seulement sur demande « montrer »)', [sansMontrer, r.j]);
{ const vals = [...kv.entries()].filter(([k]) => k.startsWith('credv:')); const rec = JSON.parse(vals[0][1]);
  ok(vals.length === 1 && !vals[0][1].includes('271828') && rec.iv && rec.ct, '6b. la copie est CHIFFRÉE en KV credv:<uid> (le code n\'y est pas en clair)', vals); }

/* 7-8. Au hasard, puis « Effacer » */
r = await appel('/__admin/code-poser', { method: 'POST', headers: ADM, body: { uid: 'marie-curie' } });
const hasard = r.j && r.j.code;
ok(/^\d{8}$/.test(hasard || '') && r.j.au_hasard === true && (await login('Marie Curie', hasard)).j.ok === true, '7. « Générer au hasard » : 8 chiffres, qui marchent tout de suite', r.j);
r = await appel('/__admin/code', { method: 'POST', headers: ADM, body: { uid: 'marie-curie' } });
ok(r.j.ok && !kv.has('cred:marie-curie') && !kv.has('credv:marie-curie'), '8. « Effacer » enlève l\'empreinte ET la copie relisible', [...kv.keys()].filter((k) => k.includes('marie')));

/* remet un code posé par l'admin (relisible) pour la suite */
r = await appel('/__admin/code-poser', { method: 'POST', headers: ADM, body: { uid: 'marie-curie', code: '161803' } });

/* 9. Jeton forgé (sans la clé du domaine) → rien */
{ const charge = b64u(JSON.stringify({ u: 'marie-curie', n: 'x', x: Date.now() + 3600e3 }));
  const faux = charge + '.' + b64u(createHmac('sha256', 'pas-le-secret').update('code-reinit:' + charge).digest());
  kv.set('crr:marie-curie', JSON.stringify({ h: b64u(createHash('sha256').update('x').digest()), at: 0 }));   // même un nonce « deviné » rangé ne suffit pas
  r = await appel('/__sso/code/reinit', { method: 'POST', form: { t: faux, nouveau: '000000', confirme: '000000' } });
  ok(r.st === 410 && (await login('Marie Curie', '000000')).st === 401 && (await login('Marie Curie', '161803')).j.ok === true, '9. un jeton FORGÉ ne réinitialise rien', r.st);
  kv.delete('crr:marie-curie'); }

/* 10. « Code oublié ? » : réponse identique que le compte existe ou non */
const avant = mails.length;
const rInconnu = await appel('/__sso/code/oublie', { method: 'POST', body: { name: 'Personne Inconnue' } }); await vider();
ok(mails.length === avant, '10a. nom inconnu → aucun mail');
const rConnu = await appel('/__sso/code/oublie', { method: 'POST', body: { name: 'Curie Marie' } }); await vider();
ok(mails.length === avant + 1 && JSON.stringify(rInconnu.j) === JSON.stringify(rConnu.j) && rConnu.st === rInconnu.st && JSON.stringify(rConnu.j) === JSON.stringify(REPONSE_OUBLIE),
  '10b. nom connu (même dans l\'autre ordre) → UN mail, et la réponse est EXACTEMENT la même que pour un inconnu', [rInconnu.j, rConnu.j]);
const mail = mails[mails.length - 1];
const lien = (String(mail.template_params.message).match(/https:\/\/kd-mc\.com\/__sso\/code\/reinit\?t=\S+/) || [''])[0];
ok(mail.template_params.to_email === 'marie@exemple.fr' && lien && !String(mail.template_params.message).includes('161803'), '10c. le mail part à l\'e-mail de la fiche, avec le lien (jamais le code)', mail.template_params);
const t = decodeURIComponent(lien.split('t=')[1] || '');

/* 11. La page */
r = await appel('/__sso/code/reinit?t=' + encodeURIComponent(t), { origin: '' });
ok(r.st === 200 && r.ct.includes('text/html') && /name="nouveau"/.test(r.t) && /name="confirme"/.test(r.t) && (r.t.match(/<input /g) || []).length === 3 && /form-action 'self'/.test(r.csp) && /width=device-width/.test(r.t),
  '11. la page : UN écran, nouveau code + confirmation (2 champs visibles), CSP fermée, faite pour iPhone', r.t.slice(0, 200));
r = await appel('/__sso/code/reinit', { method: 'POST', form: { t, nouveau: '112233', confirme: '112234' } });
ok(r.st === 400 && /pas pareils/.test(r.t) && (await login('Marie Curie', '161803')).j.ok === true, '11b. deux codes différents → message simple, rien ne change');

/* 12. Réinitialiser → le nouveau marche, l'ancien non, la copie relisible a DISPARU */
r = await appel('/__sso/code/reinit', { method: 'POST', form: { t, nouveau: '112233', confirme: '112233' } });
ok(r.st === 200 && /C&#39;est fait/.test(r.t) && (await login('Marie Curie', '112233')).j.ok === true && (await login('Marie Curie', '161803')).st === 401, '12. le lien pose le nouveau code ; l\'ancien ne marche plus', r.t.slice(-300));
r = await appel('/__admin/code-voir?uid=marie-curie&montrer=1', { headers: ADM });
ok(!kv.has('credv:marie-curie') && r.j.etat === 'personne' && !r.j.code, '12b. code choisi par la personne → la copie relisible de l\'admin est EFFACÉE (l\'ancien code n\'est plus lisible)', r.j);

/* 13. Usage unique */
r = await appel('/__sso/code/reinit', { method: 'POST', form: { t, nouveau: '445566', confirme: '445566' } });
ok(r.st === 410 && (await login('Marie Curie', '445566')).st === 401, '13. le même lien une 2e fois → « ne marche plus » (usage unique)', r.st);
r = await appel('/__sso/code/reinit?t=' + encodeURIComponent(t), { origin: '' });
ok(r.st === 410, '13b. et la page le dit aussi');

/* 14. Jeton expiré / origine étrangère / débit */
{ const exp = await jetonReinit('sec', 'marie-curie', 'n', Date.now() - 2 * 3600e3);
  ok((await lireJetonReinit('sec', exp)) === null && (await lireJetonReinit('autre', await jetonReinit('sec', 'marie-curie', 'n'))) === null, '14. jeton expiré (> 1 h) ou signé par une autre clé → refusé'); }
r = await appel('/__sso/code/oublie', { method: 'POST', body: { name: 'Marie Curie' }, origin: 'https://exemple.com' });
ok(r.st === 403, '14b. « Code oublié ? » depuis un site étranger → refusé', r.st);
let dernier = null; for (let i = 0; i < 6; i++) dernier = await appel('/__sso/code/oublie', { method: 'POST', body: { name: 'Quelqu Un' }, headers: { 'cf-connecting-ip': '198.51.100.7' } });
ok(dernier.st === 429, '14c. au-delà de 5 demandes par heure et par adresse → « réessaie dans une heure »', dernier.st);
await vider();

/* 15. Jamais le compte de l'administrateur */
kv.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens', fiche: { email: 'kevin@exemple.fr' } }));
kv.set('nm:kevin desarzens', 'kdmc_admin');
r = await appel('/__admin/code-poser', { method: 'POST', headers: ADM, body: { uid: 'kdmc_admin', code: '123456' } });
ok(r.st === 403 && !kv.has('cred:kdmc_admin') && !kv.has('credv:kdmc_admin'), '15. poser un code sur le compte admin → refusé', r.j);
const m0 = mails.length;
r = await appel('/__sso/code/oublie', { method: 'POST', body: { name: 'Kevin Desarzens' }, headers: { 'cf-connecting-ip': '192.0.2.44' } }); await vider();
ok(mails.length === m0 && JSON.stringify(r.j) === JSON.stringify(REPONSE_OUBLIE), '15b. « Code oublié ? » pour l\'admin → aucun mail (même réponse que tout le monde)');

/* 16. Compte invité créé par l'admin : son code est relisible */
r = await appel('/__admin/compte-invite', { method: 'POST', headers: ADM, body: { prenom: 'Hugo', nom: 'Moreau', code: '135790', telephone: '+377 06 00 00 00' } });
const vu = await appel('/__admin/code-voir?uid=hugo-moreau&montrer=1', { headers: ADM });
ok(r.j && r.j.ok && vu.j.code === '135790', '16. compte invité : code posé par l\'admin → relisible par lui', [r.j, vu.j]);

/* 17. Le code en clair n'est dans AUCUN journal, aucune valeur KV */
{ const tout = [...kv.entries()].map(([k, v]) => k + '=' + v).join('\n') + (process.env.SABOTAGE === 'journal' ? '\n271828' : '');
  const fuites = ['271828', '161803', '112233', '135790', hasard].filter((c) => c && tout.includes(c));
  ok(fuites.length === 0, '17. aucun code en clair dans le registre (journal aud:log compris)', fuites); }

/* 18. Garde statique : aucun audLog du routeur ni de codes-comptes.js ne reçoit une variable de code */
{ const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('./codes-comptes.js', import.meta.url), 'utf8');
  /* chaque appel audLog(…) lu jusqu'à SA parenthèse fermante, chaînes de caractères sautées (et remplacées par '') */
  const appels = []; const re = /audLog\(/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + 7, prof = 1, out = 'audLog(';
    while (i < src.length && prof) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += "''"; i = j + 1; continue; }
      if (c === '(') prof++; else if (c === ')') prof--;
      out += c; i++;
    }
    appels.push(out);
  }
  /* une valeur ou une clé « code », « nouveau », « confirme », « clair », « hasard » dans les arguments = le code partirait au journal */
  /* seule exception connue : les noms de COMMANDES du robot aspirateur Tuya (« switch_go »…, `c.code`), qui ne sont pas un code de compte */
  const EXCEPTIONS = [/safe\.map\(\(c\) => c\.code\)/];
  const suspects = appels.filter((x) => x.length > 600 || /\b(code|nouveau|confirme|clair|hasard|codeClair)\b/.test(EXCEPTIONS.reduce((y, e) => y.replace(e, ''), x)));
  ok(appels.length > 50 && suspects.length === 0, `18. garde statique : ${appels.length} appels à audLog, aucun ne reçoit le code en clair`, suspects.slice(0, 3)); }

/* 19. Chiffrement : un enregistrement ne se lit pas sous un autre compte ni avec une autre clé */
{ const rec = await chiffrerCode('sec', 'a', '777777');
  ok((await dechiffrerCode('sec', 'a', rec)) === '777777' && (await dechiffrerCode('sec', 'b', rec)) === null && (await dechiffrerCode('autre', 'a', rec)) === null && /^\d{8}$/.test(codeAuHasard()),
    '19. AES-GCM lié au compte (uid) et à la clé du domaine'); }

/* 20-23. Les écrans (lus dans le code servi) */
{ const adm = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../kdmc-home/admin/tableau.css', import.meta.url), 'utf8');
  const portail = readFileSync(new URL('../../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
  const AVANT = ['Compte créé', 'CGU acceptée', 'Connexions', 'Sites utilisés', 'Appareils', 'Lieux', 'Dernière connexion', 'ficheRens(a.fiche)', 'blocAcces(a)', 'class="etatcompte"', 'class="revoke"', 'ouvrir-compte', 'lien-info', 'class="anom"', 'fsusp'];
  const manque = AVANT.filter((x) => !adm.includes(x));
  ok(manque.length === 0, '20. fiche admin : TOUT ce que l\'ancienne fiche montrait est toujours là (aucune régression)', manque);
  ok(['🪪 Identité', '📈 Activité', '🔐 Droits', '🔑 Code'].every((x) => adm.includes(x)) && /class="rub /.test(adm) && /etatCodeCourt\(a\)/.test(adm.slice(adm.indexOf('<summary class="fhead">'), adm.indexOf('<summary class="fhead">') + 400)),
    '21. fiche admin : 4 rubriques repliables ; l\'état du code est sur la ligne fermée');
  ok(['data-act="voir"', 'data-act="hasard"', 'data-act="poser"', 'data-act="effacer"', '/__admin/code-poser', '/__admin/code-voir', 'tel:'].every((x) => adm.includes(x)) && /setTimeout\(function \(\) \{ vu\.innerHTML = ''; vu\.hidden = true; \}, 30000\)/.test(adm)
    && /\.cbtn\{min-height:44px/.test(css) && /\.codein\{[^}]*min-height:44px/.test(css) && /\.rub>summary\{min-height:44px/.test(css) && /\.cbtn\[hidden\]/.test(css),
    '22. section 🔑 Code : voir / hasard / poser / effacer / appeler, boutons ≥ 44 px, le code affiché s\'efface après 30 s');
  ok(/\/__sso\/code\/oublie/.test(portail) && /Code oublié \?/.test(portail) && !/Changer mon code(?! admin)/.test(portail + adm) && !/\/__sso\/code\/changer/.test(readFileSync(new URL('./worker.js', import.meta.url), 'utf8') + readFileSync(new URL('./codes-comptes.js', import.meta.url), 'utf8')),
    '23. côté personnes : UNE seule option « Code oublié ? » (pas de « Changer mon code », Kevin 8.11)'); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
