#!/usr/bin/env node
/* Rafraîchit tests/coffre-workflows-actifs.json depuis l'API GitHub (state=active). GH_TOKEN requis.
   Gratuit par défaut (Kevin 30.09.2026) : la liste des robots qui dépensent le quota du coffre doit être VRAIE. */
import { writeFileSync, readFileSync } from 'node:fs';
const T = process.env.GH_TOKEN || process.env.GITHUB_TOKEN; if (!T) { console.error('GH_TOKEN absent'); process.exit(2); }
const H = { authorization: 'Bearer ' + T, accept: 'application/vnd.github+json' };
const A = 'https://api.github.com/repos/9r4rxssx64-creator/CMCteams/actions/workflows?per_page=100&page=';
const tout = [];
for (let p = 1; p < 6; p++) { const j = await (await fetch(A + p, { headers: H })).json(); const w = j.workflows || []; tout.push(...w); if (w.length < 100) break; }
const actifs = tout.filter((w) => w.state === 'active' && w.path.startsWith('.github/workflows/')).map((w) => w.path.split('/').pop()).sort();
const f = new URL('../../tests/coffre-workflows-actifs.json', import.meta.url);
const d = JSON.parse(readFileSync(f, 'utf8')); d.actifs = actifs; d._date = new Date().toISOString().slice(0, 10);
writeFileSync(f, JSON.stringify(d, null, 2) + '\n'); console.log(`${actifs.length} robots actifs au coffre écrits dans tests/coffre-workflows-actifs.json`);
