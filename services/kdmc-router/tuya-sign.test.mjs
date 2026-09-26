/* Test de la signature Tuya OpenAPI v2 du worker (contrôle réel du robot piscine).
   Impossible de tester le vrai cloud Tuya ici (réseau sandboxé + clés de Kevin).
   Ce qui EST prouvable : que l'algo de signature du worker est correct — on le
   croise contre un calcul crypto Node indépendant (SHA-256 + HMAC-SHA256) sur des
   entrées figées. Si les deux coïncident, la signature envoyée à Tuya est conforme.
   node tuya-sign.test.mjs */
import { tuyaStringToSign, tuyaSign, tuyaSha256Hex, tuyaHmacHex } from './worker.js';
import { createHash, createHmac } from 'crypto';

const nSha = (s) => createHash('sha256').update(s || '').digest('hex');
const nHmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex').toUpperCase();

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* 1) SHA-256 du corps vide = valeur canonique connue + match Node */
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
ok((await tuyaSha256Hex('')) === EMPTY, 'SHA-256("") = valeur canonique');
ok((await tuyaSha256Hex('{"commands":[{"code":"switch","value":true}]}')) === nSha('{"commands":[{"code":"switch","value":true}]}'), 'SHA-256(body) == Node');

/* 2) HMAC-SHA256 hex MAJUSCULE == Node */
ok((await tuyaHmacHex('mysecret', 'hello')) === nHmac('mysecret', 'hello'), 'HMAC-SHA256 == Node (majuscule)');

/* 3) stringToSign = METHOD \n SHA256(body) \n <headers vides> \n url */
const s2s = await tuyaStringToSign('GET', '/v1.0/token?grant_type=1', '');
ok(s2s === 'GET\n' + EMPTY + '\n\n/v1.0/token?grant_type=1', 'stringToSign token (GET, corps vide)');
const s2sPost = await tuyaStringToSign('post', '/v1.0/devices/abc/commands', '{"commands":[]}');
ok(s2sPost === 'POST\n' + nSha('{"commands":[]}') + '\n\n/v1.0/devices/abc/commands', 'stringToSign POST (méthode normalisée + hash body)');

/* 4) sign token (sans access_token) = HMAC( clientId + t + "" + s2s ) */
const CID = 'clientXYZ', SEC = 'secret123', T = 1700000000000;
const signTok = await tuyaSign(CID, SEC, '', T, s2s);
ok(signTok === nHmac(SEC, CID + '' + T + '' + s2s), 'sign token = HMAC(clientId+t+s2s)');

/* 5) sign métier (avec access_token) = HMAC( clientId + token + t + "" + s2s ) */
const TOK = 'accessTok999';
const signBiz = await tuyaSign(CID, SEC, TOK, T, s2sPost);
ok(signBiz === nHmac(SEC, CID + TOK + T + '' + s2sPost), 'sign métier = HMAC(clientId+token+t+s2s)');

/* 6) déterministe : même entrée → même signature (pas de nonce aléatoire qui casserait Tuya) */
ok((await tuyaSign(CID, SEC, TOK, T, s2sPost)) === signBiz, 'signature déterministe (rejouable)');

/* 7) le token change la signature (garde-fou : token bien inclus) */
ok((await tuyaSign(CID, SEC, 'autreToken', T, s2sPost)) !== signBiz, 'access_token différent → signature différente');

console.log(`Tuya sign test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
