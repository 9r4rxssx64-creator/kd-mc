/* DIAGNOSTIC LECTURE SEULE — que garde le serveur du coffre Finances de Kevin ? (12.10.2026)
   node tools/audit/diag-finances.mjs      — exige CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID

   Kevin : « Plus d'historique. Plus rien nulle part ». On lit UNIQUEMENT des métadonnées : la fiche `fin:meta:main` (date, taille, nombre
   d'opérations), la TAILLE du bloc chiffré (jamais son contenu : il est illisible sans le code de Kevin), les clés `fin:*`, et les événements
   `fin_backup` du journal d'audit (date, taille). Aucune écriture. */
const T = process.env.CLOUDFLARE_API_TOKEN;
const A = process.env.CLOUDFLARE_ACCOUNT_ID;
const NS = '8cfa33a28ac045adb7b7a9556ca8a073';   /* KV partagé « ACCOUNTS » (id figé, services/kdmc-router/wrangler.toml) */
const ID_CF = /^[0-9a-f]{32}$/;
if (!T || !A || !ID_CF.test(A)) { console.error('jeton absent, ou identifiant de compte invalide'); process.exit(1); }
const H = { authorization: 'Bearer ' + T };
const propre = (v, n = 200) => String(v ?? '').replaceAll(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const dit = (m) => console.log(propre(m, 400));
const base = ['accounts', A, 'storage', 'kv', 'namespaces', NS].map((s) => encodeURIComponent(s)).join('/');
const valeur = async (cle) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/${base}/values/${encodeURIComponent(cle)}`, { headers: H });
  return { st: r.status, txt: r.ok ? await r.text() : '' };
};
const quand = (ts) => (ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '?');

dit('== 1. Les clés fin:* du KV ==');
const l = await fetch(`https://api.cloudflare.com/client/v4/${base}/keys?prefix=fin%3A&limit=100`, { headers: H }).then((x) => x.json()).catch(() => null);
if (l?.success) {
  for (const k of l.result) {
    dit('  ' + propre(k.name, 80) + (k.expiration ? ' (expire ' + quand(k.expiration * 1000) + ')' : ''));
  }
  if (l.result.length === 0) dit('  AUCUNE clé fin:* — le serveur ne garde rien');
}
else dit('⚠️ liste illisible : ' + propre(JSON.stringify(l?.errors ?? ''), 200));

dit('\n== 2. La fiche de la sauvegarde en ligne (fin:meta:main) ==');
const m = await valeur('fin:meta:main');
if (m.st === 200) { try { const j = JSON.parse(m.txt); dit(`  dernière sauvegarde : ${quand(j.savedAt)} · taille ${j.size} o · ${j.tx} opération(s)`); } catch { dit('  fiche illisible'); } }
else dit(`  absente (HTTP ${m.st})`);

dit('\n== 3. Le bloc chiffré (taille seulement) ==');
const v = await valeur('fin:vault:main');
if (v.st === 200) dit(`  présent : ${v.txt.length} octets (contenu non lu)`); else dit(`  absent (HTTP ${v.st})`);

dit('\n== 4. Les envois de sauvegarde vus par le journal d\'audit (200 derniers événements du domaine) ==');
const a = await valeur('aud:log');
if (a.st === 200) {
  let ev = []; try { ev = JSON.parse(a.txt); } catch { /* */ }
  const f = ev.filter((e) => /^fin_|^mail_/.test(e.ev ?? ''));
  dit(`  ${ev.length} événements au total, du ${quand(ev.at(-1)?.ts)} au ${quand(ev[0]?.ts)} ; ${f.length} concernant Finances / mails :`);
  for (const e of f.slice(0, 40)) dit(`  ${quand(e.ts)}  ${propre(e.ev, 30)}  ${e.size !== undefined ? 'taille ' + e.size : ''}${e.n !== undefined ? ' n=' + e.n : ''}`);
} else dit(`  journal illisible (HTTP ${a.st})`);
