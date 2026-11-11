/* 🔁 /improve-system — relire l'historique des sessions et proposer des améliorations (Kevin 11.11.2026 : « AB », d'après une vidéo
   « Claude garde tout l'historique… /improve-system »).
   Ce que ça fait : lit les messages RÉELS de Kevin dans les journaux de sessions (dossier ~/.claude/projects/*), écarte les messages
   automatiques, classe les THÈMES qu'il répète et les CORRECTIONS (« déjà », « encore », « je t'ai dit », « pourquoi »…), et dit quelles règles
   existent déjà pour chaque thème. Il n'ÉCRIT RIEN dans les règles : il rend un rapport ; c'est la session qui propose, Kevin valide.
   node tools/memory/improve-system.mjs [--dossier <dir>] [--regles <dir>] [--json]   |   fonction pure : analyser(messages, reglesTexte) */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

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
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`${r.total} messages de Kevin relus`);
    for (const t of r.themes) console.log(`  ${String(t.n).padStart(3)} × ${t.nom}  → ${t.couvert ? 'règle « ' + t.regle + ' » existe' : 'AUCUNE règle trouvée'}`);
    console.log('À proposer (thème répété sans règle) : ' + (r.aProposer.join(', ') || 'rien'));
    console.log('À mieux APPLIQUER (règle existante, répétée par Kevin) : ' + (r.aAppliquer.join(', ') || 'rien'));
    console.log(`Corrections de Kevin (${r.corrections.length}) :`); for (const c of r.corrections.slice(-12)) console.log('  ' + c.ts + ' | ' + c.texte.replace(/\n/g, ' '));
  }
}
