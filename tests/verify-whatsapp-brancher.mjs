/* GARDE — le robot « WhatsApp — brancher la confirmation » (Kevin 10.10 : « automatise la validation WhatsApp »).
   node tests/verify-whatsapp-brancher.mjs
   On ne peut pas appeler Meta d'ici : on joue l'étape de DÉCOUVERTE avec de fausses réponses Meta (comme la CI les recevrait)
   et on vérifie les règles du dépôt (manuel seulement, secrets jamais dans le script, bon webhook, les deux workers). */
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 200) : ''}`); };
const brut = readFileSync('.github/workflows/whatsapp-brancher.yml', 'utf8');
const w = yaml.load(brut);
const steps = w.jobs.brancher.steps;
const runs = steps.map((s) => s.run || '').join('\n');

ok(Object.keys(w.on || w[true] || {}).join() === 'workflow_dispatch', '1. lancement manuel seulement (aucun cron, aucun push)');
ok(!/\$\{\{\s*secrets\./.test(runs), '2. aucun secret interpolé dans un script (tout passe par env:)');
ok(/::add-mask::\$WA_ACCESS_TOKEN/.test(runs) && /::add-mask::\$WA_APP_SECRET/.test(runs), '3. jeton et secret masqués dans le journal');
ok(runs.includes('callback_url=https://kd-mc.com/__sso/tel/webhook') && readFileSync('services/kdmc-router/tel-inscription.js', 'utf8').includes("'/__sso/tel/webhook'"), '4. le webhook réglé chez Meta est bien la route du domaine');
ok(/services\/kdmc-router services\/kdmc-vente/.test(runs) && ['WA_ACCESS_TOKEN', 'WA_APP_SECRET', 'WA_PHONE_NUMBER_ID', 'WA_NUMERO_PUBLIC', 'WA_VERIFY_TOKEN'].every((n) => runs.includes(n)), '5. les 5 secrets vont sur le domaine ET la caisse');
ok(/npm i -g --ignore-scripts [^\n]*wrangler@\d+\.\d+\.\d+/.test(runs) && !/wrangler@\d+\s*$/m.test(runs), '6b. wrangler : version figée et installée sans scripts (alerte SonarCloud 10.10)');
ok(/GRAPH: https:\/\/graph\.facebook\.com\/v2[3-9]\.0/.test(brut), '6. version de l\'API Meta encore servie (v23+)');

const decouvre = steps.find((s) => s.id === 'decouvre').run;
function joue(debug, phones) {
  const d = mkdtempSync(join(tmpdir(), 'wa-'));
  writeFileSync(join(d, 'debug.fake'), JSON.stringify(debug)); writeFileSync(join(d, 'phones.fake'), JSON.stringify(phones)); writeFileSync(join(d, 'out'), '');
  const script = decouvre.split('/tmp/').join(d + '/')
    .replace(/curl -sS[^\n]*debug_token[^\n]*/, `cp ${d}/debug.fake ${d}/debug.json`)
    .replace(/curl -sS[^\n]*phone_numbers[^\n]*/, `cp ${d}/phones.fake ${d}/phones.json`);
  try {
    const sortie = execFileSync('bash', ['-c', script], { env: { ...process.env, GITHUB_OUTPUT: join(d, 'out'), WA_APP_ID: '1', WA_APP_SECRET: 's', WA_ACCESS_TOKEN: 't', GRAPH: 'x' }, encoding: 'utf8' });
    return { code: 0, sortie, out: readFileSync(join(d, 'out'), 'utf8') };
  } catch (e) { return { code: e.status, sortie: String(e.stdout || ''), out: readFileSync(join(d, 'out'), 'utf8') }; }
}
let r = joue({ data: { is_valid: true, granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['111222333'] }] } }, { data: [{ id: '999888', display_phone_number: '+377 99 12 34 56' }] });
ok(r.code === 0 && /waba=111222333/.test(r.out) && /phone_id=999888/.test(r.out) && /numero=37799123456/.test(r.out), '7. découverte : compte WhatsApp, identifiant et numéro retrouvés tout seuls', r.out + r.sortie);
ok(!r.sortie.includes('37799123456'), '7b. le numéro complet n\'est pas écrit dans le journal (masqué)', r.sortie);
r = joue({ data: { is_valid: true, granular_scopes: [] } }, { data: [] });
ok(r.code !== 0 && /pas accès à un compte WhatsApp Business/.test(r.sortie), '8. jeton sans compte WhatsApp → arrêt avec la cause exacte', r.sortie);
r = joue({ data: { is_valid: false, error: { message: 'expired' } } }, { data: [] });
ok(r.code !== 0, '9. jeton refusé par Meta → arrêt (rien n\'est posé)');
r = joue({ data: { is_valid: true, granular_scopes: [{ scope: 'whatsapp_business_messaging', target_ids: ['5'] }] } }, { data: [] });
ok(r.code !== 0, '10. compte sans numéro → arrêt');

console.log(`\nROBOT WHATSAPP — ${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
