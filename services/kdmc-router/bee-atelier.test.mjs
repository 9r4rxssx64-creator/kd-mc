/* GARDE — L'ATELIER DE BEE : documents, agenda, brouillon de mail, images — gratuit, et POUR KEVIN SEUL (Kevin 17.10 : « qu'elle gère les mails, l'agenda, les documents, les images…
 * parité totale… elle n'est que pour moi, dans toutes les applications, dans tout le domaine, personne d'autre tant que je ne l'ai pas dit »).
 *   1. documents : nom nettoyé, formats en liste blanche, HTML assaini (ni script, ni cadre, ni on…=, ni javascript:), JSON vérifié, taille bornée ;
 *   2. agenda : un VRAI .ics (début, fin, journée entière, rappel, accents, lignes pliées ≤ 75 octets), dates impossibles refusées ;
 *   3. mail : seulement un lien mailto: avec des adresses vérifiées (aucune injection d'en-tête), Bee n'envoie JAMAIS ;
 *   4. image : Workers AI gratuit, base64 vérifié, une seule par réponse, rien si l'IA ne rend rien ;
 *   5. de bout en bout avec le VRAI routeur : l'IA appelle l'outil → des « cartes » sortent ; un autre compte et un inconnu → 403, aucune carte ; BEE_ATELIER=0 coupe ; 0 € ;
 *   6. le widget REVÉRIFIE les cartes (mailto: seulement, data:image seulement, téléchargement forcé).
 * node services/kdmc-router/bee-atelier.test.mjs */
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const jetons = (s) => Math.round(String(s).length / 3.6);
const PLAFOND_BASE = 3200, PLAFOND_MAX = 6500;   /* jetons : sous les 8 000/min de Groq même avec un 2ᵉ tour, et la place de la conversation */

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const vraiFetch = globalThis.fetch;
const kv = new Map(); kv.set('cfg:apps_fermees', JSON.stringify(['lingua']));
const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; let IMAGE_PRET = 'ok';
const AI_VUES = []; const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String((url && url.url) || url); reseau.push(u);
  const R = (corps, st, type) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': type || 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R('<title>Page</title><body>ok</body>', 200, 'text/html; charset=utf-8');
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async (m, o) => { AI_VUES.push(JSON.stringify(o || {})); return /flux/.test(String(m)) ? (IMAGE_PRET === 'rien' ? {} : { image: PNG }) : { response: 'ancien chemin' }; } } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const login = await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const reset = () => { AI_VUES.length = 0; reseau = []; IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
const toolMsgs = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
const outilsVus = () => IA_VUES.flatMap((v) => (v.corps.tools || []).map((t) => t.function.name));
async function bee(texte, e2, headers) {
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), e2 || env, ctx);
  await Promise.allSettled(att.splice(0)); return { st: r.status, j: await r.json().catch(() => null) };
}


import { outilsAtelier, construireIcs, construireMailto, assainirHtml, nomFichier, lireDate, MAX_CARTES, MAX_TEXTE, RE_ATELIER } from './bee-atelier.js';
import { readFileSync } from 'node:fs';

/* ───── 1. documents ───── */
const mk = (o) => { const sortie = {}; return { sortie, t: outilsAtelier(Object.assign({ now: () => Date.UTC(2026, 9, 17, 12, 0, 0) }, o || {}), sortie) }; };
{
  ok(nomFichier('Lettre à la banque !', 'md') === 'Lettre-a-la-banque.md', '1a. nom nettoyé (accents, espaces, ponctuation)', nomFichier('Lettre à la banque !', 'md'));
  ok(nomFichier('../../etc/passwd', 'txt') === 'etcpasswd.txt' && !/[\/\\]/.test(nomFichier('a/b\\c', 'csv')), '1b. aucun chemin dans un nom de fichier', nomFichier('../../etc/passwd', 'txt'));
  ok(nomFichier('x', 'exe') === 'x.txt' && nomFichier('', 'md') === 'document.md', '1c. format inconnu → txt ; nom vide → document');
  const { sortie, t } = mk();
  const r = await t.exe.fichier({ nom: 'tableau', format: 'csv', contenu: 'a;b\n1;2' });
  ok(sortie.cartes.length === 1 && sortie.cartes[0].t === 'fichier' && sortie.cartes[0].nom === 'tableau.csv' && sortie.cartes[0].texte === 'a;b\n1;2' && /prêt/.test(r), '1d. un CSV devient une carte « fichier »');
  let e = ''; try { await t.exe.fichier({ nom: 'x', format: 'exe', contenu: 'MZ' }); } catch (x) { e = x.message; }
  ok(/format inconnu/.test(e), '1e. format hors liste blanche refusé', e);
  e = ''; try { await t.exe.fichier({ nom: 'x', format: 'txt', contenu: '   ' }); } catch (x) { e = x.message; }
  ok(/vide/.test(e), '1f. contenu vide refusé');
  e = ''; try { await t.exe.fichier({ nom: 'x', format: 'json', contenu: '{pas du json' }); } catch (x) { e = x.message; }
  ok(/JSON invalide/.test(e), '1g. JSON invalide refusé');
  e = ''; try { await t.exe.fichier({ nom: 'x', format: 'txt', contenu: 'a'.repeat(MAX_TEXTE + 1) }); } catch (x) { e = x.message; }
  ok(/trop long/.test(e), '1h. document trop long refusé');
  const sale = '<h1 onclick="x()">Titre</h1><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(2)">clic</a><img src=x onerror=alert(3)><style>body{}</style><form action="/x"><input></form><p>ok</p>';
  const propre = assainirHtml(sale);
  ok(!/<script|<iframe|onclick|onerror|javascript:|<style|<form/i.test(propre) && /<h1>Titre<\/h1>/.test(propre) && /<p>ok<\/p>/.test(propre), '1i. HTML assaini : ni script, ni cadre, ni on…=, ni javascript:, ni style/form — le contenu reste', propre);
  ok(!/<scr<script>ipt>/i.test(assainirHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')) && !/<script/i.test(assainirHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')), '1j. imbrication (<scr<script>ipt>) : toujours rien');
}
/* ───── 2. agenda ───── */
{
  const ics = construireIcs({ titre: 'Dentiste, Dr Müller', debut: '2026-10-20T14:30', lieu: '12 rue Grimaldi; Monaco', description: 'Apporter la carte\nVitale' }, Date.UTC(2026, 9, 17, 12, 0, 0));
  ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics) && /BEGIN:VEVENT/.test(ics) && /END:VEVENT/.test(ics) && /VERSION:2\.0/.test(ics), '2a. un vrai VCALENDAR / VEVENT');
  ok(/DTSTART:20261020T143000\r\n/.test(ics) && /DTEND:20261020T153000\r\n/.test(ics), '2b. début 14h30, fin +60 min par défaut', ics);
  ok(/SUMMARY:Dentiste\\, Dr Müller/.test(ics) && /LOCATION:12 rue Grimaldi\\; Monaco/.test(ics) && /DESCRIPTION:Apporter la carte\\nVitale/.test(ics), '2c. virgules, points-virgules et retours à la ligne échappés', ics.split('\r\n').filter((l) => /SUMMARY|LOCATION|DESCRIPTION|^ /.test(l)).join(' | '));
  ok(/BEGIN:VALARM[\s\S]*TRIGGER:-PT30M/.test(ics), '2d. rappel 30 min par défaut');
  ok(/DTSTAMP:20261017T120000Z/.test(ics) && /UID:[^\r\n]+@kd-mc\.com/.test(ics), '2e. DTSTAMP et UID présents');
  ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), '2f. aucune ligne au-dessus de 75 octets', ics.split('\r\n').find((l) => Buffer.byteLength(l) > 75));
  const longue = construireIcs({ titre: 'é'.repeat(100), debut: '2026-10-20T10:00', description: 'x'.repeat(400) });
  ok(longue.split('\r\n').every((l) => Buffer.byteLength(l) <= 75) && /\r\n [^\r\n]/.test(longue), '2g. lignes longues et accents pliés proprement');
  const jour = construireIcs({ titre: 'Anniversaire de Luka', debut: '2026-12-24', rappel_minutes: 0 });
  ok(/DTSTART;VALUE=DATE:20261224/.test(jour) && /DTEND;VALUE=DATE:20261225/.test(jour) && !/VALARM/.test(jour), '2h. journée entière : dates seules, fin = lendemain, rappel 0 = aucun');
  const e = (a) => { try { construireIcs(a); return ''; } catch (x) { return x.message; } };
  ok(/illisible/.test(e({ titre: 'x', debut: '2026-02-30' })) && /illisible/.test(e({ titre: 'x', debut: 'demain' })) && /illisible/.test(e({ titre: 'x', debut: '2026-10-20T25:00' })), '2i. dates impossibles ou en toutes lettres refusées');
  ok(/après le début/.test(e({ titre: 'x', debut: '2026-10-20T14:00', fin: '2026-10-20T13:00' })) && /titre/.test(e({ titre: ' ', debut: '2026-10-20' })), '2j. fin avant début / titre vide refusés');
  ok(!!lireDate('2026-02-28') && !lireDate('2026-02-29') && !!lireDate('2028-02-29'), '2k. années bissextiles justes');
  const inj = construireIcs({ titre: 'a\r\nEND:VEVENT\r\nBEGIN:VEVENT', debut: '2026-10-20' });
  ok(inj.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length === 1 && inj.split('\r\n').filter((l) => l === 'END:VEVENT').length === 1, '2l. un titre ne peut pas injecter un second événement');
  const { sortie, t } = mk(); await t.exe.agenda({ titre: 'Réunion', debut: '2026-10-21T09:00' });
  ok(sortie.cartes[0].nom === 'rdv-Reunion.ics' && /VEVENT/.test(sortie.cartes[0].texte), '2m. l\'outil agenda sort une carte .ics');
}
/* ───── 3. mail ───── */
{
  const m = construireMailto({ a: 'marc@example.com, luka@example.fr', cc: 'zelie@example.org', objet: 'Dîner & plus', corps: 'Salut,\nOn se voit à 20 h ?' });
  ok(/^mailto:marc@example\.com,luka@example\.fr\?cc=zelie%40example\.org&subject=D%C3%AEner%20%26%20plus&body=Salut%2C%0AOn%20se%20voit/.test(m.url), '3a. mailto: bien encodé (accents, &, retour à la ligne)', m.url);
  const e = (a) => { try { construireMailto(a); return ''; } catch (x) { return x.message; } };
  ok(/invalide/.test(e({ a: 'pas-un-mail', objet: 'x', corps: 'y' })) && /invalide/.test(e({ a: 'a@b.com\r\nBcc: evil@x.com', objet: 'x', corps: 'y' })) && /invalide/.test(e({ a: 'a@b.com?bcc=evil@x.com', objet: 'x', corps: 'y' })), '3b. adresses invalides / injection d\'en-tête / paramètre glissé : refusés');
  ok(/destinataire/.test(e({ a: '', objet: 'x', corps: 'y' })) && /trop/.test(e({ a: Array.from({ length: 11 }, (_, i) => 'a' + i + '@b.com').join(','), objet: 'x', corps: 'y' })), '3c. sans destinataire / trop de destinataires refusés');
  const q = construireMailto({ a: 'a@b.com', objet: 'x\r\nBcc: evil@x.com', corps: 'y' }).url;
  ok(!/\r|\n/.test(q) && !/[?&]bcc=/i.test(q), '3d. un objet piégé reste DANS l\'objet (encodé), jamais un nouvel en-tête', q);
  const { sortie, t } = mk(); await t.exe.brouillon_mail({ a: 'marc@example.com', objet: 'Salut', corps: 'Coucou' });
  ok(sortie.cartes[0].t === 'lien' && /^mailto:/.test(sortie.cartes[0].url) && !t.defs.some((d) => /envoie_mail|send/i.test(d.name)), '3e. une carte « lien mailto: » — et AUCUN outil d\'envoi n\'existe');
}
/* ───── 4. image ───── */
{
  ok(!mk().t.defs.some((d) => d.name === 'image') && !mk().t.exe.image, '4a. sans IA d\'images, l\'outil image n\'est pas offert');
  const A = mk({ ia: async () => PNG });
  ok(A.t.defs.some((d) => d.name === 'image'), '4b. avec l\'IA gratuite, l\'outil image est offert');
  await A.t.exe.image({ prompt: 'a golden bee logo, flat style', legende: 'Logo abeille' });
  const c = A.sortie.cartes[0];
  ok(c.t === 'image' && /^data:image\/png;base64,iVBOR/.test(c.src) && /\.png$/.test(c.nom) && c.alt === 'Logo abeille', '4c. une carte image (PNG détecté), nom .png');
  let e = ''; try { await A.t.exe.image({ prompt: 'another one please' }); } catch (x) { e = x.message; }
  ok(/une seule image/.test(e), '4d. une seule image par réponse');
  const B = mk({ ia: async () => '' }); e = ''; try { await B.t.exe.image({ prompt: 'a cat on a roof' }); } catch (x) { e = x.message; }
  ok(/pas rendu d'image/.test(e) && !(B.sortie.cartes || []).length, '4e. l\'IA ne rend rien : message honnête, aucune carte');
  const C = mk({ ia: async () => 'données<script>' }); e = ''; try { await C.t.exe.image({ prompt: 'a cat on a roof' }); } catch (x) { e = x.message; }
  ok(/pas rendu d'image/.test(e), '4f. une réponse qui n\'est pas du base64 pur est refusée');
  const D = mk({ ia: async () => 'A'.repeat(900001) }); e = ''; try { await D.t.exe.image({ prompt: 'a cat on a roof' }); } catch (x) { e = x.message; }
  ok(/trop lourde/.test(e), '4g. image trop lourde refusée');
  e = ''; try { await A.t.exe.image({ prompt: 'x' }); } catch (x) { e = x.message; }
  ok(/décris/.test(e), '4h. prompt vide refusé');
}
/* ───── 4b. plafond de cartes ───── */
{ const { t } = mk(); let n = 0, e = '';
  for (let i = 0; i < MAX_CARTES + 2; i++) { try { await t.exe.fichier({ nom: 'f' + i, format: 'txt', contenu: 'x' }); n++; } catch (x) { e = x.message; } }
  ok(n === MAX_CARTES && /assez de pièces/.test(e), '4i. ' + MAX_CARTES + ' pièces au plus par réponse'); }
/* ───── 5. de bout en bout, avec le VRAI routeur ───── */
{ reset(); IMAGE_PRET = 'ok';
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'agenda', { titre: 'Dentiste', debut: '2026-10-20T14:30', lieu: 'Monaco' }), outil('b', 'brouillon_mail', { a: 'marc@example.com', objet: 'Dîner', corps: 'Samedi 20 h ?' })] }, { content: 'Je te prépare le rendez-vous et le mail.' }];
  const r = await bee('prépare mon rdv chez le dentiste le 20 à 14h30 et un mail à Marc pour le dîner');
  ok(r.st === 200 && r.j.ok && r.j.cartes && r.j.cartes.length === 2 && r.j.cartes[0].t === 'fichier' && /BEGIN:VEVENT/.test(r.j.cartes[0].texte) && r.j.cartes[1].t === 'lien' && /^mailto:marc@example\.com/.test(r.j.cartes[1].url), '5a. agenda + brouillon de mail : deux cartes sortent par /__javis/ai', JSON.stringify(r.j).slice(0, 250));
  ok(r.j.provider !== undefined && r.j.gratuit !== false, '5b. gratuit (IA gratuite à outils)');
  ok(['fichier', 'agenda', 'brouillon_mail', 'image'].every((n) => outilsVus().includes(n)), '5c. le lot « atelier » est offert à l\'IA pour cette demande', outilsVus().join());
  ok(/ATELIER/.test(IA_VUES[0].corps.messages[0].content) && /tu n'envoies RIEN/.test(IA_VUES[0].corps.messages[0].content), '5d. le caractère dit : Kevin envoie lui-même, Bee n\'envoie rien'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'image', { prompt: 'a small golden bee with a crown, logo', legende: 'Bee' })] }, { content: 'Voilà ton logo.' }];
  const r = await bee('fais-moi un logo d\'abeille');
  ok(r.st === 200 && r.j.cartes && r.j.cartes.length === 1 && r.j.cartes[0].t === 'image' && /^data:image\/png;base64,/.test(r.j.cartes[0].src), '5e. une image générée par Workers AI sort en carte', JSON.stringify(r.j).slice(0, 200));
  ok(AI_VUES.some((v) => /bee with a crown/.test(v)) && !reseau.some((u) => /openai|replicate|stability|pollinations|dall/i.test(u)), '5f. gratuit : Workers AI du compte seulement, aucun service payant appelé'); }
{ reset(); IMAGE_PRET = 'rien'; IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', 'image', { prompt: 'a small golden bee with a crown' })] }, { content: 'Je n\'ai pas pu.' }];
  const r = await bee('dessine un logo d\'abeille'); IMAGE_PRET = 'ok';
  ok(r.st === 200 && !(r.j.cartes && r.j.cartes.length) && /ÉCHEC DE L'OUTIL/.test(toolMsgs()), '5g. l\'IA d\'image ne rend rien : ÉCHEC DE L\'OUTIL honnête, aucune carte factice'); }
{ reset(); const r = await bee('écris un mail à Marc', env, { cookie: 'kdmc_sso=' + signe('zelie_testard') });
  ok(r.st === 403 && IA_VUES.length === 0 && !AI_VUES.length, '5h. UN AUTRE COMPTE : 403, aucune IA appelée, aucune carte');
  const r2 = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'fais-moi un logo' }] }) }), env, ctx);
  ok(r2.status === 403 && IA_VUES.length === 0, '5i. UN INCONNU : 403');
  const r3 = await bee('fais-moi un logo', env, { cookie: 'kdmc_k=1' });
  ok(r3.st === 403 && IA_VUES.length === 0, '5j. le simple marqueur « Kevin » (cookie kdmc_k) ne donne AUCUN pouvoir : 403'); }
{ reset(); const e0 = Object.assign({}, env, { BEE_ATELIER: '0' }); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('prépare une lettre pour la banque', e0);
  ok(!outilsVus().some((n) => ['fichier', 'agenda', 'brouillon_mail', 'image'].includes(n)), '5k. BEE_ATELIER=0 : plus aucun outil d\'atelier'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }]; await bee('quel temps fait-il demain ?');
  ok(!outilsVus().some((n) => ['fichier', 'agenda', 'brouillon_mail', 'image'].includes(n)), '5l. une question de météo ne charge PAS l\'atelier (consigne légère)'); }
ok(RE_ATELIER.test('écris un mail à Marc') && RE_ATELIER.test('un événement samedi') && !RE_ATELIER.test('ajoute le mail de Zélie') && !RE_ATELIER.test('quel temps demain'), '5m. la détection de l\'atelier : oui pour un mail à écrire, non pour « le mail de Zélie »');
/* ───── 6. le widget revérifie ───── */
{ const W = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/function carteAtelier/.test(W) && /j\.cartes/.test(W), '6a. le widget affiche les cartes de l\'atelier');
  const bloc = W.slice(W.indexOf('function carteAtelier'), W.indexOf('function carteAtelier') + 4500);
  ok(/\^mailto:/.test(bloc) && !/window\.open\(/.test(bloc), '6b. le widget n\'ouvre que du mailto: (jamais une adresse web venue de la réponse)');
  ok(/\^data:image\\\/\(\?:png\|jpeg\|webp\);base64,/.test(bloc), '6c. le widget n\'affiche que data:image png/jpeg/webp en base64');
  ok(/download/.test(bloc) && /application\/octet-stream/.test(bloc) && !/innerHTML/.test(bloc), '6d. un fichier est TÉLÉCHARGÉ (octet-stream), jamais rendu ; aucun innerHTML');
  ok(['tools/javis/javis-widget.js', 'javis/javis-widget.js', 'arbre/javis-widget.js'].map((f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).every((x) => x === W), '6e. les trois copies du widget sont identiques'); }

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
