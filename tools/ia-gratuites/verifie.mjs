#!/usr/bin/env node
/* ============================================================================
   « VÉRIFIE LES IA GRATUITES » — l'œil qui me manquait.
   ----------------------------------------------------------------------------
   Kevin 2026-08-14 : « Trouve des solutions, des outils, sinon crée ce dont tu
   as besoin. » Le problème réel : depuis l'agent je n'atteins NI les sites des
   fournisseurs NI les pages de doc (le proxy bloque tout sauf Anthropic et les
   registres de paquets). Je lui écrivais donc « je n'ai pas pu ouvrir cette
   page » au lieu de vérifier. Et depuis que l'accès GitHub est tombé, je ne
   peux même plus lire le résultat d'un test lancé en CI.

   La solution : ce script tourne DANS la CI (réseau ouvert), teste pour de
   vrai, et ÉCRIT SON VERDICT DANS LE DÉPÔT (audit/ia-gratuites.md). Je le lis
   ensuite avec un simple « git pull ». Kevin aussi.

   Ce qu'il vérifie réellement :
     1. chaque lien que j'ai donné à Kevin répond-il ? (sinon je lui ai donné
        une adresse morte)
     2. chaque clé présente fonctionne-t-elle VRAIMENT ? (un appel minimal)
     3. le point le plus important : quel moteur ÉDITE la photo aujourd'hui,
        et est-ce le gratuit ou le payant ?

   Usage :  node tools/ia-gratuites/verifie.mjs [--sortie audit/ia-gratuites.md]
   Sans clé : le fournisseur est marqué « pas de clé », jamais en échec.
   ========================================================================== */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const ARGS = process.argv.slice(2);
const arg = (n, d) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : d; };
const SORTIE = arg('--sortie', 'audit/ia-gratuites.md');
const BASE = arg('--base', process.env.HEALTH_BASE || 'https://crea-ai.kd-mc.com');
const MINUTEUR = 25000;

/* --- les fournisseurs, exactement ceux annoncés à Kevin ------------------- */
const TEXTE = [
  { id: 'cerebras', secret: 'CEREBRAS_API_KEY', site: 'https://cloud.cerebras.ai/',
    url: 'https://api.cerebras.ai/v1/chat/completions', modele: 'llama-3.3-70b' },
  { id: 'nvidia', secret: 'NVIDIA_API_KEY', site: 'https://build.nvidia.com/',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions', modele: 'meta/llama-3.3-70b-instruct' },
  { id: 'sambanova', secret: 'SAMBANOVA_API_KEY', site: 'https://cloud.sambanova.ai/',
    url: 'https://api.sambanova.ai/v1/chat/completions', modele: 'Meta-Llama-3.3-70B-Instruct' },
  { id: 'huggingface', secret: 'HF_TOKEN', site: 'https://huggingface.co/settings/tokens',
    url: 'https://router.huggingface.co/v1/chat/completions', modele: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'nebius', secret: 'NEBIUS_API_KEY', site: 'https://studio.nebius.com/',
    url: 'https://api.studio.nebius.com/v1/chat/completions', modele: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'scaleway', secret: 'SCALEWAY_API_KEY', site: 'https://console.scaleway.com/',
    url: 'https://api.scaleway.ai/v1/chat/completions', modele: 'llama-3.3-70b-instruct' },
  { id: 'glm', secret: 'GLM_API_KEY', site: 'https://open.bigmodel.cn/',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', modele: 'glm-4-flash' },
  { id: 'qwen', secret: 'DASHSCOPE_API_KEY', site: 'https://modelstudio.console.alibabacloud.com/',
    url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', modele: 'qwen-turbo' },
  { id: 'xai (déjà à toi)', secret: 'XAI_API_KEY', site: 'https://console.x.ai/',
    url: 'https://api.x.ai/v1/chat/completions', modele: 'grok-2-latest' },
  { id: 'perplexity (déjà à toi)', secret: 'PERPLEXITI_API_KEY', site: 'https://www.perplexity.ai/settings/api',
    url: 'https://api.perplexity.ai/chat/completions', modele: 'sonar' },
];

const bilan = { liens: [], cles: [], edition: [], quand: new Date().toISOString().slice(0, 16).replace('T', ' ') };

async function avecMinuteur(p, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || MINUTEUR);
  try { return await p(ctl.signal); } finally { clearTimeout(t); }
}

/* --- 1. les liens donnés à Kevin sont-ils vivants ? ----------------------- */
async function testeLien(p) {
  try {
    const r = await avecMinuteur((signal) => fetch(p.site, { redirect: 'follow', signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; kdmc-verif/1.0)' } }), 15000);
    /* 403 = le site refuse les robots, PAS un lien mort (leçon vécue sur les
       liens marchands). On le distingue explicitement. */
    const etat = r.status === 403 || r.status === 401 ? '🟡 refuse les robots (le lien marche pour toi)'
      : r.ok ? '✅ répond' : '❌ ' + r.status;
    bilan.liens.push({ id: p.id, site: p.site, etat, code: r.status });
  } catch (e) {
    bilan.liens.push({ id: p.id, site: p.site, etat: '❌ injoignable (' + String(e.message).slice(0, 40) + ')', code: 0 });
  }
}

/* --- 2. la clé marche-t-elle vraiment ? ----------------------------------- */
async function testeCle(p) {
  const cle = process.env[p.secret];
  if (!cle) { bilan.cles.push({ id: p.id, secret: p.secret, etat: '⚪ pas de clé — rien à faire tant que tu n\'en veux pas', detail: '' }); return; }
  try {
    const r = await avecMinuteur((signal) => fetch(p.url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cle },
      body: JSON.stringify({ model: p.modele, max_tokens: 8, messages: [{ role: 'user', content: 'dis bonjour' }] }),
    }));
    const txt = await r.text();
    if (r.ok) {
      let mot = '';
      try { mot = (JSON.parse(txt).choices || [])[0]?.message?.content || ''; } catch (_) { /* rien */ }
      bilan.cles.push({ id: p.id, secret: p.secret, etat: '✅ marche', detail: String(mot).replace(/\s+/g, ' ').slice(0, 40) });
    } else {
      bilan.cles.push({ id: p.id, secret: p.secret, etat: '❌ refuse (' + r.status + ')', detail: txt.replace(/\s+/g, ' ').slice(0, 120) });
    }
  } catch (e) {
    bilan.cles.push({ id: p.id, secret: p.secret, etat: '❌ erreur', detail: String(e.message).slice(0, 90) });
  }
}

/* --- 3. LE point important : qui édite la photo aujourd'hui ? -------------- */
/* Un vrai PNG fabriqué ici (aucune dépendance, aucun fichier à stocker) :
   un carré clair avec une forme sombre au milieu — assez « photo » pour que
   les moteurs l'acceptent. */
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngTest(taille = 256) {
  const lignes = [];
  for (let y = 0; y < taille; y++) {
    const l = Buffer.alloc(1 + taille * 3);
    for (let x = 0; x < taille; x++) {
      const dx = x - taille / 2, dy = y - taille / 2.2;
      const dedans = (dx * dx) / (taille * 0.18) ** 2 + (dy * dy) / (taille * 0.24) ** 2 < 1;
      const o = 1 + x * 3;
      l[o] = dedans ? 205 : 232; l[o + 1] = dedans ? 170 : 236; l[o + 2] = dedans ? 150 : 244;
    }
    lignes.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(lignes))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* La CAUSE EXACTE, jamais le message poli tout seul (règle « toujours
   détailler les erreurs pour savoir la cause exacte »). Vécu le 2026-09-06 :
   le rapport n'affichait que « Je n'ai pas pu fabriquer les poses », et il a
   fallu relire le worker pour découvrir que c'était un simple dépassement de
   délai. `detail` porte la vraie chaîne d'échecs (gemini… | edit#1:timeout…). */
function cause(j) {
  const d = String((j && (j.detail || j.error)) || '').replace(/\s+/g, ' ').trim();
  return d ? '`' + d.slice(0, 220) + '`' : '';
}

async function testeEdition() {
  const photo = 'data:image/png;base64,' + pngTest().toString('base64');
  const essais = [
    { nom: 'figurine (garde ton visage)', chemin: '/magic', corps: { image: photo, preset: 'figurine', keep_face: true, identity: 'preserve' } },
    { nom: 'poses de danse', chemin: '/frames', corps: { image: photo, mode: 'dance', n: 2 } },
  ];
  for (const e of essais) {
    try {
      const r = await avecMinuteur((signal) => fetch(BASE + e.chemin, {
        method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(e.corps),
      }), 120000);
      const ct = r.headers.get('content-type') || '';
      const moteur = r.headers.get('x-crea-provider') || '';
      const qualite = r.headers.get('x-crea-quality') || '';
      if (r.ok && /image\//.test(ct)) {
        const taille = (await r.arrayBuffer()).byteLength;
        bilan.edition.push({ nom: e.nom, etat: '✅ image reçue (' + Math.round(taille / 1024) + ' Ko)',
          moteur, payant: /replicate/.test(moteur), qualite });
      } else if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const n = (j.frames || []).length;
        bilan.edition.push({ nom: e.nom, etat: n >= 2 ? '✅ ' + n + ' poses' : '❌ ' + (j.message || j.error || 'vide'),
          detail: cause(j), moteur: j.provider || moteur, payant: /replicate/.test(j.provider || ''), qualite });
      } else {
        const j = await r.json().catch(() => ({}));
        bilan.edition.push({ nom: e.nom, etat: '❌ ' + r.status + ' — ' + (j.message || j.error || 'sans message'),
          detail: cause(j), moteur: '', payant: false, qualite: '' });
      }
    } catch (err) {
      bilan.edition.push({ nom: e.nom, etat: '❌ ' + String(err.message).slice(0, 70), moteur: '', payant: false, qualite: '' });
    }
  }
}

/* --- rapport lisible par Kevin (et par moi au prochain git pull) ---------- */
function rapport() {
  const l = [];
  l.push('# 🔎 Les IA gratuites — vérifiées pour de vrai');
  l.push('');
  l.push('> Écrit automatiquement par la CI (elle a le réseau ouvert, pas moi).');
  l.push('> Dernier passage : **' + bilan.quand + ' UTC**. Rien n\'est recopié de mémoire.');
  l.push('');

  l.push('## 🎨 Qui transforme ta photo aujourd\'hui');
  l.push('');
  l.push('| Ce qu\'on teste | Résultat | Moteur qui a servi | Gratuit ? |');
  l.push('|---|---|---|---|');
  bilan.edition.forEach((e) => {
    const g = !e.moteur ? '—' : e.payant ? '💰 **payant**' : '🆓 gratuit';
    const q = e.qualite === 'approx' ? ' *(ressemblance approximative)*' : '';
    l.push(`| ${e.nom} | ${e.etat}${e.detail ? ' — ' + e.detail : ''} | ${e.moteur || '—'}${q} | ${g} |`);
  });
  const payantEnService = bilan.edition.some((e) => e.payant);
  const casse = bilan.edition.some((e) => e.etat.startsWith('❌'));
  l.push('');
  if (casse) l.push('> 🔴 **Quelque chose ne marche pas** — le détail est dans le tableau, avec la cause exacte.');
  else if (payantEnService) l.push('> 🟡 **Ça marche, mais ça passe par le payant.** Une clé Hugging Face (gratuite) ou du crédit Google remettrait ça en gratuit.');
  else l.push('> 🟢 **Tout passe en gratuit.** Rien à faire, rien à payer.');
  l.push('');

  l.push('## 🔑 Les clés');
  l.push('');
  l.push('| Fournisseur | Nom du secret | État | Ce qu\'il a répondu |');
  l.push('|---|---|---|---|');
  bilan.cles.forEach((c) => l.push(`| ${c.id} | \`${c.secret}\` | ${c.etat} | ${(c.detail || '').replace(/\|/g, '/') || '—'} |`));
  l.push('');

  l.push('## 🔗 Les liens que je t\'ai donnés répondent-ils ?');
  l.push('');
  l.push('| Fournisseur | Lien | État |');
  l.push('|---|---|---|');
  bilan.liens.forEach((x) => l.push(`| ${x.id} | [${x.site.replace(/^https:\/\//, '')}](${x.site}) | ${x.etat} |`));
  const morts = bilan.liens.filter((x) => x.etat.startsWith('❌'));
  l.push('');
  l.push(morts.length
    ? '> ⚠️ **' + morts.length + ' lien(s) mort(s)** ci-dessus : ne perds pas ton temps dessus, je les corrige.'
    : '> ✅ Tous les liens répondent — aucun ne t\'enverra dans le mur.');
  l.push('');
  l.push('---');
  l.push('');
  l.push('*« 🟡 refuse les robots » veut dire que le site bloque les visites automatiques :');
  l.push('le lien marche très bien depuis ton iPhone, c\'est juste la CI qu\'il refuse.*');
  return l.join('\n') + '\n';
}

/* --- exécution ------------------------------------------------------------ */
const seulement = arg('--seulement', '');
if (seulement !== 'edition') {
  await Promise.all(TEXTE.map((p) => testeLien(p)));
  for (const p of TEXTE) await testeCle(p);
}
if (seulement !== 'cles') await testeEdition();

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, rapport());
console.log(rapport());
console.log('→ rapport écrit dans ' + SORTIE);

/* On ne fait PAS échouer la CI sur une clé absente ni un site qui refuse les
   robots : ce ne sont pas des pannes. Seule une transformation cassée en est
   une — c'est ce que Kevin voit dans l'app. */
const grave = bilan.edition.filter((e) => e.etat.startsWith('❌'));
if (grave.length) {
  console.error('\n❌ ' + grave.length + ' transformation(s) cassée(s) :');
  /* La cause exacte DANS le journal CI, pas seulement dans le rapport : c'est
     la première chose qu'on lit quand le workflow passe au rouge. */
  grave.forEach((g) => console.error('   • ' + g.nom + ' → ' + g.etat + (g.detail ? '\n     cause : ' + g.detail.replace(/`/g, '') : '')));
  process.exit(1);
}
