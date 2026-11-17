/* Garde (17.11.2026, Kevin, 2 captures de « 📬 Mes messages » : « trop fouilli, pas clair du tout, trop d'infos mélangées ») :
   la carte d'UNE personne est RANGÉE — ⚠️ dernière alerte · 🕘 ce qui vient de se passer (le plus récent en haut, répétitions « ×3 ») · 👤 la personne ·
   🔧 détails techniques repliés · actions, « Déconnecter » à part et rouge — et la section « Inscriptions à valider » VIDE n'occupe plus le bas de la fenêtre.
   Données de la capture de Kevin (Davy, departs). SABOTAGE=1 : ancien kdmc-boite.js (origin/main, ou ANCIEN_BOITE) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let js = join(racine, 'kdmc-home', 'kdmc-boite.js'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'kdmc-home', '.kdmc-boite-ancien.tmp.js'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_BOITE || 'origin/main'}:kdmc-home/kdmc-boite.js`, { maxBuffer: 20e6 })); js = tmp; }
const css = join(racine, 'kdmc-home', 'kdmc-boite.css');
const T = (j, h = 12) => Date.UTC(2026, 10, j, h);   // novembre 2026
const O = (j, h = 12) => Date.UTC(2026, 9, j, h);     // octobre 2026
const NOW = Date.now();
const connDep = '🔓 s\'est connecté departs.kd-mc.com · 📲 K · Android 10';
const fil = [
  { texte: connDep, ts: O(14) }, { texte: connDep, ts: O(15) }, { texte: '🌐 a consulté / · 📲 K · Android 10', ts: O(15) },
  { texte: '🌐 a consulté / · 📲 K · Android 10', ts: O(17) }, { texte: connDep, ts: O(17) },
  { texte: '🔓 s\'est connecté kd-mc.com · 📲 iPhone · iOS 18.7', ts: NOW - 120e3 }, { texte: '📱 nouvel appareil iPhone · iOS 18.7 · Safari 27 (kd-mc)', ts: NOW - 60e3 },
].map((e) => ({ moi: false, ...e }));
const infos = [
  '👤 Davy Carpinelli (davy-carpinelli) · inscrit le 2026-10-13 · 8 session(s) · vu pour la dernière fois 2026-11-17',
  '📱 Apps : kd-mc 2× 0 min · departs 5× 0 min · cmcteams-light 1× 0 min',
  '🖥️ Appareils : mobile·Android, mobile·iOS',
  '📲 iPhone · iOS 18.7 · Safari 27 — 2 session(s), du 2026-11-17 au 2026-11-17 · Monaco · Monaco Telecom S.A. · 7 événement(s) en 7 jours',
  '📲 K · Android 10 · Chrome 143 — 6 session(s), du 2026-10-13 au 2026-10-17 · Monaco · Monaco Telecom S.A. / Internet Access',
  '📍 Lieux : Monaco, Municipality of Monaco, MC', '🛰️ Monaco Telecom S.A. (AS6758)', '🗣️ fr-FR · Europe/Monaco', '🔑 Portée : domaine (departs)',
  '📊 7 jours : 2 page(s) consultée(s) · 4 connexion(s)', '🔝 Pages les plus consultées : cmcteams-light.kd-mc.com/ ×1 · kd-mc.com/ ×1', '🖥️ iPhone · iOS 18.7', '🌍 Monaco, MC', '📱 departs',
];
const donnees = (ins) => ({ ok: true, maj: NOW, nonLus: 1, nonLusAlertes: 1, connectes: 1, sources: [{ id: 'alertes', nom: 'Alertes · domaine', icone: '🔔', etat: 'ok', total: 1, nonLus: 1, lien: '/admin/' }],
  messages: [{ cle: 'perso:u:davy-carpinelli', source: 'alertes', app: 'departs.kd-mc.com', de: 'Davy Carpinelli', ts: NOW - 60e3, texte: '📱 nouvel appareil iPhone · iOS 18.7 · Safari 27 (kd-mc)', perso: true, infos, nonLus: 1, lu: false, repondre: null, fil }],
  inscriptions: ins || [], codes: [], inscriptionsAdmin: [], enLigne: [] });
let ko = 0; const ok = (c, m, d) => { console.log((c ? '✅ ' : '❌ ') + m + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 200) : '')); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [nom, w, h] of [['iphone-13', 390, 664], ['portable', 1280, 720]]) {
    for (const avecIns of [false, true]) {
      const c = await b.newContext({ viewport: { width: w, height: h } });
      const D = donnees(avecIns ? [{ id: 'U1', nom: 'Marc DUPONTTEST', matricule: '123', ts: NOW - 5e3 }] : []);
      await c.route('https://kd-mc.test/**', (r) => { const u = r.request().url();
        if (u.endsWith('/__boite/admin')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(D) });
        return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--line:#2a3a2c;--card:#142016;--txt:#eaf3e2;--mut:#9fb59a;--gold:#e8b830;--gold2:#f3cf6a}body{margin:0;background:#0b110d;color:#eaf3e2;font:16px sans-serif}</style><a id="cercle-alerte" hidden></a>' }); });
      const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 90)));
      await p.goto('https://kd-mc.test/'); await p.addStyleTag({ path: css }); await p.addScriptTag({ path: js });
      await p.evaluate(() => window.kdmcBoite.demarrer()); await p.waitForTimeout(700);
      await p.evaluate(() => window.kdmcBoite.ouvrir()); await p.waitForTimeout(700);
      await p.evaluate(() => { const pu = [...document.querySelectorAll('#boite-fen .bf-p')].find((x) => /^🔔/.test(x.textContent)); if (pu) pu.click(); }); await p.waitForTimeout(300);
      await p.evaluate(() => { const l = document.querySelector('#boite-fen .bf-ch'); if (l) l.click(); }); await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const f = document.getElementById('boite-fen'), corps = f.querySelector('.bf-corps'); if (!corps) return { corps: false };
        const vis = corps.innerText, titres = [...corps.querySelectorAll('.bf-sec, .bf-alt')].map((x) => x.textContent.trim());
        const evs = [...corps.querySelectorAll('.bf-evs .bf-ev')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
        const tech = corps.querySelector('details.bf-plus:last-of-type, details.bf-plus'); const dets = [...corps.querySelectorAll('details')].map((d) => ({ ouvert: d.open, texte: d.textContent }));
        const btn = [...corps.querySelectorAll('button, a.bf-ouvrir')].map((x) => ({ t: x.textContent.trim().slice(0, 40), h: Math.round(x.getBoundingClientRect().height), rouge: /bf-revoke/.test(x.className), y: Math.round(x.getBoundingClientRect().top) }));
        const ins = document.getElementById('bf-inscriptions');
        return { corps: true, vis, titres, evs, dets, btn, insVisible: !!(ins && !ins.hidden && ins.getBoundingClientRect().height > 0), insTexte: ins && !ins.hidden ? ins.innerText : '', hauteurCorps: Math.round(corps.getBoundingClientRect().height), tech: !!tech };
      });
      const tag = `${nom}${avecIns ? ' + inscriptions' : ''}`;
      if (!avecIns) {
        ok(r.corps, `${tag} : la carte de la personne s'ouvre`);
        if (!r.corps) { await c.close(); continue; }
        ok(r.titres.join('|').indexOf('Dernière alerte') >= 0 && r.titres.join('|').indexOf('Ce qui vient de se passer') > r.titres.join('|').indexOf('Dernière alerte') && r.titres.join('|').indexOf('La personne') > r.titres.join('|').indexOf('Ce qui vient de se passer'), `${tag} : blocs dans l'ordre alerte → ce qui vient de se passer → la personne`, r.titres);
        ok(r.evs.length > 0 && /nouvel appareil/.test(r.evs[0]), `${tag} : le plus RÉCENT est en haut (1er = « ${(r.evs[0] || '').slice(0, 50)} »)`, r.evs);
        const dep = r.evs.filter((x) => /s'est connecté departs/.test(x));
        ok(dep.length === 1 && /×3/.test(dep[0]), `${tag} : les 3 connexions identiques sont UNE ligne « ×3 »`, dep);
        ok(r.evs.length + 0 <= 5, `${tag} : au plus 5 lignes d'événements visibles (${r.evs.length})`);
        ok(/departs ×5 · kd-mc ×2 · cmcteams-light ×1/.test(r.vis) && !/0 min/.test(r.vis), `${tag} : « Apps » lisible, sans « 0 min »`);
        ok(/inscrit le 13\/10 · 8 connexions · vu le 17\/11/.test(r.vis), `${tag} : une phrase sur la personne (inscrit le, connexions, vu le)`);
        ok(!/AS6758|Europe\/Monaco|Portée|Lieux :|Pages les plus consultées|Municipality/.test(r.vis), `${tag} : le technique (réseau, langue, portée, lieux, pages) n'est PAS dans le flot visible`);
        ok(r.dets.some((d) => !d.ouvert && /AS6758/.test(d.texte) && /Portée/.test(d.texte)), `${tag} : …mais il est gardé dans « Détails techniques » (replié)`);
        ok(!/^📱 departs$/m.test(r.vis), `${tag} : plus la ligne « 📱 departs » qui répète l'en-tête`, r.vis.slice(0, 120));
        ok(!/davy-carpinelli/.test(r.vis), `${tag} : plus d'identifiant technique dans le flot`);
        const rev = r.btn.find((x) => x.rouge), autres = r.btn.filter((x) => !x.rouge);
        ok(rev && rev.y > Math.max(...autres.map((x) => x.y)) && r.btn.every((x) => x.h >= 44), `${tag} : « Déconnecter » est à part, en bas, tous les boutons ≥ 44 px`, r.btn);
        ok(!r.insVisible, `${tag} : la section « Inscriptions à valider » vide est masquée`);
      } else {
        ok(r.insVisible && /Marc DUPONTTEST/.test(r.insTexte), `${tag} : avec une inscription en attente, la section reste visible`, r.insTexte);
      }
      ok(erreurs.length === 0, `${tag} : aucune erreur JavaScript` + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
      await c.close();
    }
  }
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
