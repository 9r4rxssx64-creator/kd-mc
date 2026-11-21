/* « lis https://… » par le domaine (pont-check 2992) — la porte /__admin/lire-page : fermée sans session admin, câblée sur lire_page, adresse obligatoire.
   node services/kdmc-router/lire-page-admin.test.mjs */
import { readFileSync } from 'node:fs';
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/lire-page?url=https%3A%2F%2Fexample.org', { headers: { host: 'kd-mc.com' } }), env, { waitUntil() {} });
ok(rep.status === 401 || rep.status === 403, '1. fermée sans session admin', rep.status);
ok(!/Texte de la page/.test(await rep.text()), '2. aucun texte de page dans le refus');
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/path === '\/__admin\/lire-page'/.test(src) && /await lire_page\(\{ url: u \}\)/.test(src), '3. la porte appelle lire_page (https seulement, pas d\'adresse interne : voir outils-lecture)');
ok(/FOURNISSEURS_OUTILS, lire_page \}/.test(src), '4. lire_page importée de outils-lecture.js');
const { urlPermise } = await import('../_shared/outils-lecture.js');
ok(urlPermise('https://example.org/a') && !urlPermise('http://example.org') && !urlPermise('https://127.0.0.1/x') && !urlPermise('https://localhost/x') && !urlPermise('https://192.168.1.5/'), '5. adresses internes et http refusées par la garde de lecture');
/* le secours en direct (lecteur gratuit en 429) */
const { lireDirect, texteDeHtml } = await import('./lire-page-direct.js');
const rep200 = (corps, ty = 'text/html; charset=utf-8', st = 200, h = {}) => ({ ok: st < 400, status: st, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? ty : h[k.toLowerCase()] ?? null) }, text: async () => corps });
const lu = await lireDirect('https://example.org/', async () => rep200('<html><head><style>x{}</style><script>alert(1)</script></head><body><h1>Example Domain</h1><p>Ce domaine &eacute;tait &laquo;&nbsp;libre&nbsp;&raquo; &amp; utile.</p></body></html>'));
ok(/Example Domain/.test(lu) && /libre/.test(lu) && !/alert|x\{\}|<h1>/.test(lu) && /^Texte de la page/.test(lu), '6. secours : le texte de la page, sans script ni balises', lu);
ok(texteDeHtml('<p>a</p><p>b&#233;&#x41;</p>') === 'a\nbéA', '7. entités numériques décodées', texteDeHtml('<p>a</p><p>b&#233;&#x41;</p>'));
let e1 = ''; try { await lireDirect('https://example.org/', async () => rep200('', 'text/html', 302, { location: 'https://127.0.0.1/secret' })); } catch (e) { e1 = e.message; }
ok(/adresse refusée/.test(e1), '8. une redirection vers une adresse interne est refusée', e1);
let e2 = ''; try { await lireDirect('https://example.org/', async () => rep200('binaire', 'application/pdf')); } catch (e) { e2 = e.message; }
ok(/non lisible/.test(e2), '9. une page qui n\'est pas du texte est refusée', e2);
let e3 = ''; try { await lireDirect('http://example.org/', async () => rep200('x')); } catch (e) { e3 = e.message; }
ok(/adresse refusée/.test(e3), '10. http refusé avant tout appel', e3);
ok(/catch \(e1\)[\s\S]{0,400}lireDirect\(u\)/.test(src), '11. la porte bascule sur la lecture directe quand lire_page échoue (sauf adresse refusée)');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
