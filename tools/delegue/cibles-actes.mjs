#!/usr/bin/env node
/* CIBLES D'ACTES POUR LES ROBOTS GRATUITS (Kevin 13.11 : « qu'ils fassent le travail de leur côté en autonomie »).
   Lit un export de l'arbre (entrée standard) et sort, par ordre de PROXIMITÉ de Kevin, la liste des actes à aller lire :
   pour chaque fiche sans parents qui a un lieu ET une année de naissance (actes de plus de 75 ans, donc publics), le travail est
   « lire l'acte de naissance de X, né en AAAA à LIEU » ; pour une fiche avec parents mais sans mariage des parents, « lire le mariage ».
   Aucun nom de personne vivante n'est cible (né après 1950 : acte non public) ; un mineur n'y figure jamais.
   Usage : node tools/delegue/cibles-actes.mjs [--max 30] < export.json  → JSON sur la sortie standard (un robot lit, n'écrit rien dans l'arbre). */
import fs from 'node:fs';

const an = (d) => { const m = /(\d{4})/.exec(String(d || '')); return m ? +m[1] : 0; };
const lieuCourt = (l) => String(l || '').split('(')[0].split(',')[0].trim();
const PUBLIC_JUSQUA = 1950; // acte de naissance de plus de 75 ans en 2026 (on garde 1950 comme borne large, actes en ligne des archives)

/** Distance en liens de parenté depuis la racine (parents, conjoints, enfants). */
export function distances(P, racine = 'seed_kevin') {
  const adj = {};
  const lie = (a, b) => {
    if (!P[a] || !P[b]) {
      return;
    }
    adj[a] = adj[a] || new Set();
    adj[b] = adj[b] || new Set();
    adj[a].add(b);
    adj[b].add(a);
  };
  for (const [id, p] of Object.entries(P)) {
    if (p.pere) {
      lie(id, p.pere);
    }
    if (p.mere) {
      lie(id, p.mere);
    }
    for (const c of p.conjoints || []) {
      lie(id, c);
    }
  }
  const d = { [racine]: 0 };
  const file = [racine];
  while (file.length) {
    const x = file.shift();
    for (const y of adj[x] || []) {
      if (!(y in d)) {
        d[y] = d[x] + 1;
        file.push(y);
      }
    }
  }
  return d;
}

export function cibles(export_, { max = 30, racine = 'seed_kevin' } = {}) {
  const P = export_.persons || export_.data?.persons || export_;
  const d = distances(P, racine);
  const out = [];
  for (const [id, p] of Object.entries(P)) {
    if (p.prive) continue; // un mineur ou une fiche privée n'est jamais une cible publique
    const y = an(p.naissance?.date), lieu = lieuCourt(p.naissance?.lieu);
    if (!y || y > PUBLIC_JUSQUA || !lieu) continue;
    const nom = `${p.prenom || ''} ${p.nom || ''}`.trim();
    if (!p.pere && !p.mere) out.push({ id, nom, type: 'naissance', annee: y, lieu, distance: d[id] ?? 99, but: `acte de naissance de ${nom}, né en ${y} à ${lieu} : donne les parents (noms, âges, professions)` });
    else if (p.pere && p.mere && !(p.unions || []).length && !(P[p.pere]?.unions || []).some((u) => u.avec === p.mere && u.date)) {
      out.push({ id, nom, type: 'mariage-des-parents', annee: y, lieu, distance: d[id] ?? 99, but: `mariage des parents de ${nom} (${P[p.pere].prenom || ''} ${P[p.pere].nom || ''} × ${P[p.mere].prenom || ''} ${P[p.mere].nom || ''}), avant ${y}, près de ${lieu}` });
    }
  }
  out.sort((a, b) => a.distance - b.distance || a.annee - b.annee);
  return out.slice(0, max);
}

if (process.argv[1]?.endsWith('cibles-actes.mjs')) {
  const i = process.argv.indexOf('--max');
  const e = JSON.parse(fs.readFileSync(0, 'utf8'));
  console.log(JSON.stringify(cibles(e, { max: i > 0 ? +process.argv[i + 1] : 30 }), null, 1));
}
