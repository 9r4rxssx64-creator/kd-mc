// Tests PURS (node --test) de la logique du connecteur Monaco Telecom.
// worker.js importe `cloudflare:sockets` (indispo en node) → on teste lib.js,
// qui contient toute la logique risquée (parseur MIME + parseur IMAP + garde admin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesInvoice, keepAttachment, parseMimeAttachments, extractBodyText, decodeQP, htmlToText, subjectOf, fromOf,
  imapDate, parseSearchUids, parseTaggedResponse, imapQuote, adminOk, sha256Hex
} from './lib.js';

const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
// Petit b64 (ASCII) pour simuler une pièce jointe.
const PDF_B64 = Buffer.from('%PDF-1.4 fake invoice').toString('base64');
const IMG_B64 = Buffer.from('\x89PNG fake photo').toString('base64');

function mimeMessage(subject) {
  return [
    'From: Fournisseur <billing@edf.fr>',
    'To: kevind@monaco.mc',
    'Subject: ' + subject,
    'Content-Type: multipart/mixed; boundary="BND1"',
    '',
    '--BND1',
    'Content-Type: text/plain',
    '',
    'Bonjour, votre document en pièce jointe.',
    '--BND1',
    'Content-Type: application/pdf; name="facture-juillet.pdf"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="facture-juillet.pdf"',
    '',
    PDF_B64,
    '--BND1',
    'Content-Type: image/png; name="scan.png"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="scan.png"',
    '',
    IMG_B64,
    '--BND1--',
    ''
  ].join('\r\n');
}

test('parseMimeAttachments extrait le PDF et l\'image (2 pièces)', () => {
  const atts = parseMimeAttachments(mimeMessage('Votre facture de juillet'));
  assert.equal(atts.length, 2);
  const pdf = atts.find((a) => a.mime === 'application/pdf');
  const img = atts.find((a) => a.mime === 'image/png');
  assert.ok(pdf && img);
  assert.equal(pdf.filename, 'facture-juillet.pdf');
  assert.equal(pdf.b64, PDF_B64);
  assert.equal(img.b64, IMG_B64);
});

// La facture est parfois ÉCRITE dans le corps du mail (Kevin « vérifier partout, même des écrits »).
test('extractBodyText : corps text/plain en quoted-printable (€ décodé)', () => {
  const raw = [
    'From: EDF <noreply@edf.fr>', 'Subject: Votre facture', 'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable', '',
    'Bonjour,', 'Votre facture de janvier : montant 45,90=E2=82=AC TTC (dont TVA 7,65=E2=82=AC).', 'Merci.'
  ].join('\r\n');
  const body = extractBodyText(raw);
  assert.match(body, /45,90€ TTC/);
  assert.match(body, /TVA 7,65€/);
  assert.ok(matchesInvoice(subjectOf(raw), body, fromOf(raw)), 'reconnu comme facture via le corps');
});

test('extractBodyText : préfère le text/plain, sinon nettoie le HTML', () => {
  const html = [
    'From: Shop <no@shop.com>', 'Subject: Reçu', 'Content-Type: text/html; charset=utf-8', '',
    '<html><head><style>b{}</style></head><body><h1>Re&ccedil;u</h1><p>Total : 12,00&euro; TTC</p></body></html>'
  ].join('\r\n');
  const body = extractBodyText(html);
  assert.match(body, /Total : 12,00€ TTC/);
  assert.ok(!/</.test(body), 'plus de balises HTML');
});

test('extractBodyText : multipart (plain gagne, pièces jointes ignorées)', () => {
  const raw = mimeMessage('Facture #123'); // a un text/plain + 2 pièces jointes
  const body = extractBodyText(raw);
  assert.match(body, /votre document en pièce jointe/i);
  assert.ok(!/%PDF/.test(body) && !/PNG/.test(body), 'les pièces jointes ne polluent pas le texte');
});

test('decodeQP / htmlToText : bases', () => {
  assert.equal(decodeQP('a=3Db'), 'a=b');
  assert.equal(decodeQP('fin=\r\nsuite'), 'finsuite'); // soft line break
  assert.match(htmlToText('<p>A</p><p>B</p>'), /A\nB/);
});

test('subjectOf / fromOf lisent l\'entête', () => {
  const raw = mimeMessage('Facture #123');
  assert.equal(subjectOf(raw), 'Facture #123');
  assert.match(fromOf(raw), /billing@edf\.fr/);
});

test('matchesInvoice : garde les factures, ignore le bruit', () => {
  assert.ok(matchesInvoice('Votre facture', 'x.pdf', 'edf'));
  assert.ok(matchesInvoice('Newsletter', 'devis-2026.pdf', 'a@b'));
  assert.ok(!matchesInvoice('Photos vacances', 'plage.jpg', 'ami@x'));
});

test('parseTaggedResponse : FETCH avec littéral → RAW extrait intégralement', () => {
  const raw = mimeMessage('Votre facture');
  const resp = '* 3 FETCH (UID 42 BODY[] {' + raw.length + '}\r\n' + raw + ')\r\nA1 OK FETCH completed\r\n';
  const r = parseTaggedResponse(bytes(resp), 'A1');
  assert.ok(r, 'réponse complète');
  assert.equal(r.status, 'OK');
  assert.equal(r.literals.length, 1);
  assert.equal(r.literals[0], raw, 'le message brut est reconstruit octet pour octet');
  assert.equal(r.consumed, resp.length);
  // et le RAW extrait redonne bien les 2 pièces jointes
  assert.equal(parseMimeAttachments(r.literals[0]).length, 2);
});

test('parseTaggedResponse : données incomplètes → null (il faut lire plus)', () => {
  const raw = mimeMessage('Votre facture');
  const full = '* 3 FETCH (UID 42 BODY[] {' + raw.length + '}\r\n' + raw + ')\r\nA1 OK\r\n';
  // coupe au milieu du littéral
  assert.equal(parseTaggedResponse(bytes(full.slice(0, 60)), 'A1'), null);
  // entête complet mais tag de fin manquant
  const noTag = '* 3 FETCH (UID 42 BODY[] {' + raw.length + '}\r\n' + raw + ')\r\n';
  assert.equal(parseTaggedResponse(bytes(noTag), 'A1'), null);
});

test('parseTaggedResponse + parseSearchUids : SEARCH', () => {
  const r = parseTaggedResponse(bytes('* SEARCH 3 7 42\r\nA2 OK SEARCH completed\r\n'), 'A2');
  assert.equal(r.status, 'OK');
  assert.deepEqual(parseSearchUids(r.untagged), [3, 7, 42]);
  // SEARCH vide
  const e = parseTaggedResponse(bytes('* SEARCH\r\nA3 OK\r\n'), 'A3');
  assert.deepEqual(parseSearchUids(e.untagged), []);
});

test('parseTaggedResponse : NO/BAD remontés', () => {
  const r = parseTaggedResponse(bytes('A1 NO [AUTHENTICATIONFAILED] Invalid credentials\r\n'), 'A1');
  assert.equal(r.status, 'NO');
  assert.match(r.line, /AUTHENTICATIONFAILED/);
});

test('imapDate : format DD-Mon-YYYY', () => {
  assert.equal(imapDate(new Date(Date.UTC(2026, 6, 5))), '05-Jul-2026');
  assert.equal(imapDate(new Date(Date.UTC(2026, 0, 31))), '31-Jan-2026');
});

test('imapQuote : échappe guillemets et backslash', () => {
  assert.equal(imapQuote('pass'), '"pass"');
  assert.equal(imapQuote('a"b\\c'), '"a\\"b\\\\c"');
});

test('adminOk : hash client OU code en clair, sinon refus', async () => {
  const code = '123456';
  const secret = await sha256Hex(code);
  const env = { KDMC_ADMIN_PIN_SHA256: secret };
  const req = (v) => ({ headers: { get: (k) => (k.toLowerCase() === 'x-apex-pin' ? v : null) } });
  assert.equal(await adminOk(req(secret), env), true);   // client envoie le hash
  assert.equal(await adminOk(req(code), env), true);     // client envoie le code clair
  assert.equal(await adminOk(req('mauvais'), env), false);
  assert.equal(await adminOk(req(secret), {}), false);   // pas de secret configuré → fail-closed
  assert.equal(await adminOk(req(''), env), false);
});

test('keepAttachment : garde le VRAI PDF du devis (Kevin « toujours doc origine »)', () => {
  // (1) PDF à nom générique + sujet neutre, MAIS corps avec un montant € → gardé (c'est le vrai devis).
  assert.equal(keepAttachment('Votre projet villa', 'contact@nive-bat.mc', 'scan001.pdf', 'application/pdf',
    'Bonjour, veuillez trouver notre proposition. Total : 23 100,00 €'), true);
  // (2) PDF dont le sujet dit « devis » → gardé même sans montant dans le corps.
  assert.equal(keepAttachment('Devis rénovation', 'x@y.mc', 'doc.pdf', 'application/pdf', 'à bientôt'), true);
  // (3) Image (logo de signature) sur un mail neutre → PAS gardée (évite le bruit).
  assert.equal(keepAttachment('Votre projet villa', 'contact@nive-bat.mc', 'logo.png', 'image/png',
    'Total : 23 100,00 €'), false);
  // (4) PDF sur une PUB avec montant (promo) → PAS gardé (pub, pas facture).
  assert.equal(keepAttachment('Offre spéciale -50% soldes', 'promo@shop.com', 'flyer.pdf', 'application/pdf',
    'Vente flash ! -50% : à saisir 19,99 €'), false);
  // (5) PDF sur mail neutre SANS montant ni mot-clé → PAS gardé (rien n'indique une facture).
  assert.equal(keepAttachment('Photos week-end', 'ami@gmail.com', 'album.pdf', 'application/pdf',
    'coucou voici les photos'), false);
  // (6) Image AVEC mot-clé facture dans le nom → gardée (ticket photographié).
  assert.equal(keepAttachment('reçu', 'caisse@magasin.fr', 'ticket-facture.jpg', 'image/jpeg', ''), true);
});
