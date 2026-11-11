/* 🔁 /improve-system — relire l'historique des sessions et proposer des améliorations (Kevin 11.11.2026 : « AB », d'après une vidéo
   « Claude garde tout l'historique… /improve-system »).
   Ce que ça fait : lit les messages RÉELS de Kevin dans les journaux de sessions (dossier ~/.claude/projects/*), écarte les messages
   automatiques, classe les THÈMES qu'il répète et les CORRECTIONS (« déjà », « encore », « je t'ai dit », « pourquoi »…), et dit quelles règles
   existent déjà pour chaque thème. Il n'ÉCRIT RIEN dans les règles : il rend un rapport ; c'est la session qui propose, Kevin valide.
   node tools/memory/improve-system.mjs [--dossier <dir>] [--regles <dir>] [--json]   |   fonction pure : analyser(messages, reglesTexte)
   --travail   : relit AUSSI notre travail (sorties d'outils) : les ERREURS qui reviennent et les SORTIES qui coûtent le plus de jetons (Kevin 11.11 : « apprendre de notre
                 travail… ne pas trop consommer mon abo »). Fonction pure : analyserTravail(lignes).
   --memoriser : écrit au plus 5 lignes GÉNÉRIQUES (thèmes + comptes, jamais une phrase de Kevin) dans la mémoire compacte (tools/memory/mem.cjs), sans doublon. Aucun modèle appelé. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const THEMES = {
  'vérifier en réel': /v[ée]rifi|r[ée]el/i,
  'toutes les branches': /branche/i,
  'le pont': /\bpont\b/i,
  'gratuit': /gratuit|free/i,
  'simple / un clic': /simple|un clic|cliquable/i,
  'noter / se rappeler': /\bnote[rz]?\b|rappelle/i,
  'tout automatiser': /\bauto(?:matis|nome)?|[àa] ma place|sans me demander/i,
  'aller au bout': /au bout|plus loin|jusqu.au bout/i,
};
export const CORRECTIONS = /d[ée]j[àa]|encore|je t.ai (?:d[ée]j[àa] )?dit|pourquoi|toujours pas|n.importe quoi|tu as (?:oubli|menti)|arr[êe]te|plus jamais/i;
/* Quelle règle du dépôt couvre quel thème (mots à retrouver dans .claude/rules/*.md ou CLAUDE.md). */
const COUVERTURE = {
  'vérifier en réel': 'verifier-reel', 'toutes les branches': 'tout-le-monde-corrige', 'le pont': 'pont-lenovo-manipulations',
  'gratuit': 'gratuit-public', 'simple / un clic': 'demandes-a-kevin', 'noter / se rappeler': 'docs-temps-reel',
  'tout automatiser': 'pont-lenovo-manipulations', 'aller au bout': 'au-bout',
};

/* Messages « humains » : on enlève les rappels système, les alertes de hooks, les redémarrages, les textes collés très longs. */
export function messageHumain(c) {
  if (typeof c !== 'string') return '';
  c = c.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!c || c.startsWith('<') || /SYSTEM NOTIFICATION|Stop hook feedback|worker process was restarted|^\[.*hook\]/i.test(c) || c.length > 600) return '';
  return c;
}

export function lireMessages(dossier) {
  const out = [];
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(path.join(dossier, f), 'utf8').split('\n')) {
      let d; try { d = JSON.parse(l); } catch { continue; }
      if (d.type !== 'user' || !d.message) continue;
      let c = d.message.content;
      if (Array.isArray(c)) { if (c.some((x) => x && x.type === 'tool_result')) continue; c = c.map((x) => (x && x.type === 'text' ? x.text : '')).join(' '); }
      const t = messageHumain(c); if (t) out.push({ ts: d.timestamp || '', texte: t });
    }
  }
  return out.sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

export function analyser(messages, reglesTexte) {
  const themes = Object.entries(THEMES).map(([nom, re]) => {
    const n = messages.filter((m) => re.test(m.texte)).length;
    const regle = COUVERTURE[nom];
    return { nom, n, regle, couvert: !!regle && String(reglesTexte || '').indexOf(regle) >= 0 };
  }).sort((a, b) => b.n - a.n);
  const corrections = messages.filter((m) => CORRECTIONS.test(m.texte)).map((m) => ({ ts: m.ts.slice(0, 10), texte: m.texte.slice(0, 160) }));
  /* Un thème répété (≥ 3) SANS règle trouvée = règle à proposer ; avec règle = problème d'application, pas d'écriture. */
  const aProposer = themes.filter((t) => t.n >= 3 && !t.couvert).map((t) => t.nom);
  const aAppliquer = themes.filter((t) => t.n >= 3 && t.couvert).map((t) => t.nom);
  return { total: messages.length, themes, corrections, aProposer, aAppliquer };
}


/* ── NOTRE TRAVAIL : erreurs répétées et sorties lourdes (le texte des résultats d'outils, lu en local, jamais envoyé) ── */
const texteDe = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join(' ') : '');
const normErr = (t) => String(t).split('\n').find((l) => /\S/.test(l) && !/^Exit code/i.test(l) && !/^\s*at /.test(l)) || String(t).split('\n')[0] || '';
export function analyserTravail(lignes) {
  const usages = {};   // tool_use_id → { outil, tete }
  const resultats = [];
  for (const d of lignes) {
    const c = d && d.message && d.message.content; if (!Array.isArray(c)) continue;
    for (const x of c) {
      if (d.type === 'assistant' && x && x.type === 'tool_use') usages[x.id] = { outil: x.name, tete: String((x.input && (x.input.command || x.input.file_path || x.input.pattern || x.input.query || x.input.sql)) || '').replace(/\s+/g, ' ').slice(0, 90) };
      if (d.type === 'user' && x && x.type === 'tool_result') resultats.push({ id: x.tool_use_id, texte: texteDe(x.content), erreur: !!x.is_error });
    }
  }
  const lourds = []; const parOutil = {}; const erreurs = {};
  for (const r of resultats) {
    const u = usages[r.id] || { outil: '?', tete: '' };
    const n = r.texte.length;
    parOutil[u.outil] = (parOutil[u.outil] || 0) + n;
    lourds.push({ n, outil: u.outil, tete: u.tete });
    if (r.erreur || /^Exit code [1-9]/.test(r.texte) || /\b(?:Error|Cannot find module|MODULE_NOT_FOUND|HTTP 4\d\d|RPC failed|merge conflicts)\b/.test(r.texte.slice(0, 400))) {
      const cle = normErr(r.texte).replace(/\d+/g, 'N').replace(/\/[\w./-]+/g, '/…').slice(0, 90);
      if (cle) erreurs[cle] = (erreurs[cle] || 0) + 1;
    }
  }
  lourds.sort((a, b) => b.n - a.n);
  return {
    resultats: resultats.length,
    total: resultats.reduce((a, r) => a + r.texte.length, 0),
    lourds: lourds.slice(0, 8),
    parOutil: Object.entries(parOutil).sort((a, b) => b[1] - a[1]).slice(0, 6),
    erreurs: Object.entries(erreurs).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8),
    /* seuil : au-delà de 15 000 caractères (≈ 4 000 jetons) un résultat se coupe (`| cut -c1-200`, `| head`, `--jq`) */
    gros: lourds.filter((x) => x.n > 15000).length,
  };
}
export function lireLignes(dossier) {
  const out = [];
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(dossier, f), 'utf8').split('\n')) { try { out.push(JSON.parse(l)); } catch { /* ligne cassée */ } }
  return out;
}
/* Les lignes GÉNÉRIQUES à garder (pas de phrase de Kevin) : thèmes répétés avec leur règle, sorties lourdes, erreurs qui reviennent. */
export function leconsAMemoriser(rapport, travail) {
  const l = [];
  const rep = (rapport.themes || []).filter((t) => t.n >= 5).slice(0, 3);
  if (rep.length) l.push('Appris (relecture de l\'historique): Kevin répète surtout ' + rep.map((t) => t.nom + ' (' + t.n + '×, règle ' + t.regle + ')').join(', ') + '. Relire la règle AVANT de répondre ; ne pas attendre qu\'il redise.');
  if (travail && travail.gros) l.push('Appris (consommation): ' + travail.gros + ' sorties d\'outils dépassaient 15 000 caractères dans la session lue (plus lourde: ' + (travail.lourds[0] ? travail.lourds[0].n + ' car., ' + travail.lourds[0].outil : '?') + '). Toujours couper : grep … | cut -c1-200, head, --jq, jamais une ligne géante de package.json.');
  for (const [e, n] of ((travail && travail.erreurs) || []).slice(0, 2)) l.push('Appris (erreur qui revient ' + n + '×): « ' + e + ' » — chercher la cause une fois, écrire le garde, ne pas re-découvrir.');
  return l.slice(0, 5);
}

function lireRegles(dir) {
  let t = '';
  try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) t += ' ' + f + ' ' + fs.readFileSync(path.join(dir, f), 'utf8'); } catch { /* absent */ }
  return t;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const dossier = arg('--dossier', path.join(os.homedir(), '.claude/projects/-home-user'));
  const regles = arg('--regles', path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.claude/rules'));
  const msgs = fs.existsSync(dossier) ? lireMessages(dossier) : [];
  const r = analyser(msgs, lireRegles(regles));
  const travail = process.argv.includes('--travail') || process.argv.includes('--memoriser') ? analyserTravail(fs.existsSync(dossier) ? lireLignes(dossier) : []) : null;
  if (process.argv.includes('--memoriser')) {
    const mem = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mem.cjs');
    const deja = fs.readFileSync(path.join(path.dirname(mem), 'store.jsonl'), 'utf8');
    let ecrites = 0;
    for (const t of leconsAMemoriser(r, travail)) {
      if (deja.includes(t.slice(0, 60))) continue;   // pas de doublon
      const res = spawnSync(process.execPath, [mem, 'add', t, '--tags', 'appris,improve-system', '--imp', '70', '--proj', 'multi'], { encoding: 'utf8' });
      if (res.status === 0) ecrites++;
    }
    console.log(ecrites + ' ligne(s) ajoutée(s) à la mémoire compacte (aucune phrase de Kevin).');
  } else if (process.argv.includes('--json')) console.log(JSON.stringify(travail ? { ...r, travail } : r, null, 1));
  else {
    console.log(`${r.total} messages de Kevin relus`);
    for (const t of r.themes) console.log(`  ${String(t.n).padStart(3)} × ${t.nom}  → ${t.couvert ? 'règle « ' + t.regle + ' » existe' : 'AUCUNE règle trouvée'}`);
    console.log('À proposer (thème répété sans règle) : ' + (r.aProposer.join(', ') || 'rien'));
    console.log('À mieux APPLIQUER (règle existante, répétée par Kevin) : ' + (r.aAppliquer.join(', ') || 'rien'));
    console.log(`Corrections de Kevin (${r.corrections.length}) :`); for (const c of r.corrections.slice(-12)) console.log('  ' + c.ts + ' | ' + c.texte.replace(/\n/g, ' '));
    if (travail) {
      console.log(`\nNOTRE TRAVAIL : ${travail.resultats} résultats d'outils, ${Math.round(travail.total / 1000)} k caractères au total, ${travail.gros} de plus de 15 000 caractères`);
      console.log('Les plus lourds :'); for (const x of travail.lourds.slice(0, 6)) console.log('  ' + String(x.n).padStart(7) + ' car. · ' + x.outil + ' · ' + x.tete);
      console.log('Par outil :', travail.parOutil.map(([o, n]) => o + ' ' + Math.round(n / 1000) + 'k').join(' · '));
      console.log('Erreurs qui reviennent :'); for (const [e, n] of travail.erreurs) console.log('  ' + n + '× ' + e);
    }
  }
}
