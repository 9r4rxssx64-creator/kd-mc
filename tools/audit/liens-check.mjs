#!/usr/bin/env node
/* VÉRIFICATEUR DE LIENS RÉELS — Kevin 2026-08-14 :
   « Tu as internet et les outils qu'il te faut. Arrête de me dire que tu ne peux pas. »

   POURQUOI CE FICHIER EXISTE : j'ai livré des liens en disant « je n'ai pas pu les
   vérifier ». C'était une capitulation : le sandbox bloque la sortie réseau, mais le
   runner GitHub, LUI, a internet. Ce script ping donc VRAIMENT chaque lien, et il est
   lancé par le job GitLab `liens-reels` (stage veille, à la demande).
   Il a quitté GitHub le 5.09 : son travail consiste à pinguer des centaines de
   sites TIERS, ce que les conditions GitHub Actions excluent explicitement.
   Résultat : plus jamais un lien mort livré sans le savoir.

   Usage :
     node tools/audit/liens-check.mjs                    # pages par défaut
     node tools/audit/liens-check.mjs <fichier.html> …   # pages précises
     node tools/audit/liens-check.mjs --json rapport.json
     node tools/audit/liens-check.mjs --report-only      # n'échoue jamais (informatif)

   Classement HONNÊTE (on ne crie pas au loup) :
     ✅ vivant      2xx/3xx
     🔒 protégé     401/403/429 → le site existe mais refuse les robots (pas un lien mort)
     ❌ MORT        404/410, domaine introuvable, connexion refusée, délai dépassé
*/
'use strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const REPORT_ONLY = args.includes('--report-only');
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const FICHIERS = args.filter((a, i) => !a.startsWith('--') && i !== jsonIdx + 1);

const DEFAUT = [
  'kdmc-home/osint/index.html',
  'kdmc-home/worldmonitor/index.html',
];
const CIBLES = (FICHIERS.length ? FICHIERS : DEFAUT).filter((f) => {
  if (existsSync(f)) return true;
  console.log(`   (ignoré, absent : ${f})`);
  return false;
});

const TIMEOUT = 15000;
const PARALLELE = 8;
const UA = 'Mozilla/5.0 (compatible; kd-mc-linkcheck/1.0; +https://kd-mc.com)';
/* Hôtes qui répondent volontairement mal aux robots : jamais comptés « morts ». */
const TOLERANTS = [/cloudflare/i, /instagram\.com/, /facebook\.com/, /x\.com/, /twitter\.com/, /linkedin\.com/];

/* --- extraction des liens (u:"https://…" du catalogue + href="https://…") --- */
function extraire(fichier) {
  const h = readFileSync(fichier, 'utf8');
  const vus = new Map();
  const pousser = (url, nom) => {
    const u = url.replace(/&amp;/g, '&').trim();
    if (!/^https:\/\//.test(u)) return;
    /* URL construite en JS (…'+esc(x.id)+'…, ${…}) → ce n'est pas un lien à pinguer. */
    if (/['"`]|\$\{|\+\s*esc\(|\bencodeURI/.test(u)) return;
    if (!vus.has(u)) vus.set(u, { url: u, nom: nom || u, fichier });
  };
  for (const m of h.matchAll(/\{n:"([^"]+)",u:"(https:\/\/[^"]+)"/g)) pousser(m[2], m[1]);
  for (const m of h.matchAll(/href="(https:\/\/[^"]+)"/g)) pousser(m[1]);
  return [...vus.values()];
}

/* --- un lien --- */
async function tester(lien) {
  const essai = async (method) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const r = await fetch(lien.url, {
        method, redirect: 'follow', signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'fr,en;q=0.8' },
      });
      return { status: r.status, final: r.url };
    } finally { clearTimeout(t); }
  };
  try {
    let r = await essai('HEAD');
    /* Beaucoup de sites n'implémentent pas HEAD → on retente en GET avant de juger. */
    if (r.status === 403 || r.status === 405 || r.status === 404 || r.status >= 500) {
      try { r = await essai('GET'); } catch (_) { /* on garde le HEAD */ }
    }
    const s = r.status;
    if (s >= 200 && s < 400) return { ...lien, etat: 'vivant', status: s, final: r.final };
    if (s === 401 || s === 403 || s === 429 || TOLERANTS.some((re) => re.test(lien.url)))
      return { ...lien, etat: 'protege', status: s };
    return { ...lien, etat: 'mort', status: s };
  } catch (e) {
    const msg = String(e && e.message || e);
    const cause = String(e && e.cause && e.cause.code || '');
    if (/abort/i.test(msg)) return { ...lien, etat: 'mort', status: 0, raison: 'délai dépassé (15 s)' };
    return { ...lien, etat: 'mort', status: 0, raison: cause || msg.slice(0, 80) };
  }
}

/* --- file d'attente parallèle --- */
async function tousTester(liens) {
  const out = []; let i = 0;
  const worker = async () => {
    while (i < liens.length) {
      const n = i++;
      out[n] = await tester(liens[n]);
      const r = out[n];
      const ico = r.etat === 'vivant' ? '✅' : r.etat === 'protege' ? '🔒' : '❌';
      console.log(`${ico} ${String(r.status || '—').padStart(3)}  ${r.nom}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLELE, liens.length) }, worker));
  return out;
}

/* --- exécution --- */
const liens = CIBLES.flatMap(extraire);
if (!liens.length) { console.log('✅ liens : rien à vérifier.'); process.exit(0); }
/* --lister : n'utilise PAS le réseau (permet de tester le script hors ligne). */
if (args.includes('--lister')) {
  liens.forEach((l) => console.log(`· ${l.nom}\n  ${l.url}`));
  console.log(`\n${liens.length} lien(s) trouvé(s) dans ${CIBLES.length} page(s).`);
  process.exit(0);
}
console.log(`🔗 Vérification RÉELLE de ${liens.length} lien(s) — ${CIBLES.join(', ')}\n`);

const res = await tousTester(liens);
const morts = res.filter((r) => r.etat === 'mort');
const proteges = res.filter((r) => r.etat === 'protege');
const vivants = res.filter((r) => r.etat === 'vivant');

console.log(`\n— ${vivants.length} vivant(s) · ${proteges.length} protégé(s) (normal) · ${morts.length} MORT(s)`);
if (morts.length) {
  console.log('\n❌ LIENS MORTS — à corriger ou retirer :');
  morts.forEach((m) => console.log(`   · ${m.nom}\n     ${m.url}\n     → ${m.raison || 'HTTP ' + m.status}  [${m.fichier}]`));
}
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ date: new Date().toISOString(), total: res.length, morts, proteges: proteges.map((p) => p.url), res }, null, 2));
  console.log(`\n📄 Rapport écrit : ${JSON_OUT}`);
}
if (morts.length && !REPORT_ONLY) process.exit(1);
console.log(morts.length ? '\n(mode informatif : pas d\'échec)' : '\n✅ Tous les liens répondent.');
process.exit(0);
