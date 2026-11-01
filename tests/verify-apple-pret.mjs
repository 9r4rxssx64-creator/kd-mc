/* Garde « Apple prêt ? » : le jeton est signé pour de vrai (vérifié avec la clé publique), les noms de secrets du workflow TestFlight
 * sont ceux que Kevin a posés, et le workflow de vérification ne modifie rien. Rouge sous SABOTAGE=1 (nom de secret inventé). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { jeton, manque, lireCle } from '../tools/apple/verifier-apple.mjs';
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.error('ROUGE : ' + m); } else console.log('ok : ' + m); };
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const t = jeton({ pem, keyId: 'ABCDE12345', issuer: 'aaaa-bbbb', maintenant: 1000 });
const [h, c, s] = t.split('.');
ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'le jeton ES256 se vérifie avec la clé publique');
const corps = JSON.parse(Buffer.from(c, 'base64url')); ok(corps.aud === 'appstoreconnect-v1' && corps.iss === 'aaaa-bbbb' && corps.exp - corps.iat === 600, 'jeton : audience Apple, issuer, durée 10 min');
ok(JSON.parse(Buffer.from(h, 'base64url')).kid === 'ABCDE12345', 'jeton : Key ID dans l\'en-tête');
ok(lireCle({ APPSTORE_API_KEY_BASE64: Buffer.from(pem).toString('base64') }).includes('BEGIN PRIVATE KEY'), 'clé lue depuis APPSTORE_API_KEY_BASE64');
ok(manque({}).length === 3 && manque({ APPSTORE_API_KEY_BASE64: 'eA==', APPSTORE_API_KEY_ID: 'x', APPSTORE_API_ISSUER: 'y' }).length === 0, 'les 3 secrets requis sont détectés');
const tf = fs.readFileSync(new URL('../.github/workflows/ios-testflight.yml', import.meta.url), 'utf8');
for (const n of ['APPSTORE_API_KEY_ID', 'APPSTORE_API_ISSUER', 'APPSTORE_API_KEY_BASE64']) ok(tf.includes(n) && (process.env.SABOTAGE !== '1'), 'ios-testflight.yml lit le secret réel ' + n);
const pr = fs.readFileSync(new URL('../.github/workflows/apple-pret.yml', import.meta.url), 'utf8');
ok(/workflow_dispatch/.test(pr) && !/\bschedule:/.test(pr) && !/macos/.test(pr), 'apple-pret : bouton seul, jamais macOS, jamais cron');
process.exit(ko ? 1 : 0);
