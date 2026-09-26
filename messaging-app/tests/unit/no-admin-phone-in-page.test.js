// Garde anti-régression SÉCU + VIE PRIVÉE — audit 2026-09-05 (faille P0), réécrit le 2026-09-10 (finding P3).
//
// Histoire, en deux temps :
//  1. 05/09 — le numéro admin de Kevin était écrit EN CLAIR dans index.html (servi à chaque
//     visiteur). Ce numéro + le code de test suffisaient alors à obtenir un jeton admin de
//     30 jours → n'importe qui lisant la page devenait admin. Corrigé (v1.1.283-284), et ce
//     garde est né pour que le numéro ne revienne jamais dans la page.
//  2. 10/09 — ce garde portait LUI-MÊME le vrai numéro, sous 4 formes, dans un dépôt PUBLIC
//     (11 occurrences ici, 113 dans les tests). Un garde qui publie ce qu'il protège est une
//     fuite. Il a été réécrit : il ne cherche plus UN numéro connu, il refuse TOUT numéro de
//     téléphone dans la page — sauf les exemples pédagogiques listés ci-dessous, qui sont
//     volontairement faux. Plus aucun numéro réel n'est écrit dans le dépôt ; les vrais vivent
//     en secrets Cloudflare (KEVIN_PHONE_E164, LAURENCE_PHONE_E164), jamais ici.
//
// Prouvé discriminant (10/09) : ajouter n'importe quel numéro non listé dans index.html
// (ex. `+33 6 98 76 54 32`) → le test échoue en nommant la forme trouvée, masquée.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '..', '..');
const INDEX = join(APP, 'index.html');

/** Tout ce qui ressemble à un numéro français : +33 X XX XX XX XX ou 0X XX XX XX XX (espaces/points libres). */
const PHONE_RX = /\+33[\s.]?\d(?:[\s.]?\d{2}){4}|\b0[1-9](?:[\s.]?\d{2}){4}\b/g;
const norm = (s) => s.replace(/\D/g, '').replace(/^33/, '').replace(/^0/, '');
/** Affiché dans un message d'échec : jamais un numéro complet dans un journal public. */
const masque = (s) => s.slice(0, 5) + '…';

/** Exemples pédagogiques autorisés dans la PAGE (aide, placeholders). Tous faux. */
const EXEMPLES_PAGE = ['+33 6 12 34 56 78', '+33612345678', '0698765432', '06 12 34 56 78', '06 11 22 33 44'];

/** Fixtures autorisées dans les TESTS — toutes synthétiques (suites de 0, répétitions, 12345…). */
const FIXTURES_TESTS = [
  '+33612345678', '+33612345601', '+33612345602', '+33612345603', '+33612000000', '0612000000',
  '+33600000000', '+33600000001', '+33600000002', '+33600000010', '0600000010', '+33600000020', '0600000020',
  '+33600000091', '+33600000092', '0600000001',
  // 17/09/2026 : harnais tools/fonctions-reelles.mjs (hors tests/, donc scanné) — suites de zéros, synthétiques
  '+33600000003', '+33600000009',
  '+33611111111', '0611111111', '+33611112222', '+33622222222', '+33633333333', '+33699999999', '+33999999999',
];

function inconnus(texte, autorises) {
  const ok = new Set(autorises.map(norm));
  const vus = new Set();
  for (const m of texte.match(PHONE_RX) || []) if (!ok.has(norm(m))) vus.add(masque(m));
  return [...vus];
}

function fichiersTests(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fichiersTests(p, out);
    else if (/\.(m?js)$/.test(n)) out.push(p);
  }
  return out;
}

describe('Vie privée — aucun numéro de téléphone réel dans le dépôt', () => {
  const html = readFileSync(INDEX, 'utf8');

  it("index.html ne contient aucun numéro hors les exemples pédagogiques", () => {
    const trouve = inconnus(html, EXEMPLES_PAGE);
    expect(trouve, `Numéro(s) non listé(s) dans index.html : ${trouve.join(', ')}`).toEqual([]);
  });

  it("la reconnaissance admin côté client ne compare plus un numéro codé en dur", () => {
    // Aucune comparaison de type `=== '+33...'` ne doit rester : le serveur
    // (secret KEVIN_PHONE_E164) est seul juge, la page reconnaît par le NOM.
    expect(/===\s*['"]\+?33\d{9,}['"]/.test(html)).toBe(false);
  });

  it("les tests n'utilisent que des numéros synthétiques listés (jamais un vrai)", () => {
    const fautifs = [];
    const moi = fileURLToPath(import.meta.url);
    for (const f of fichiersTests(join(APP, 'tests'))) {
      if (f === moi) continue; // ce garde porte volontairement un numéro « inconnu » pour se prouver discriminant
      // Les exemples de la page sont faux aussi — ils apparaissent ici même, dans ce garde.
      const t = inconnus(readFileSync(f, 'utf8'), [...FIXTURES_TESTS, ...EXEMPLES_PAGE]);
      if (t.length) fautifs.push(`${f.replace(APP + '/', '')} → ${t.join(', ')}`);
    }
    expect(fautifs, 'Un numéro non listé est apparu dans les tests :\n' + fautifs.join('\n')).toEqual([]);
  });

  // 17/09/2026 (audit P0) : deux numéros RÉELS vivaient en clair dans
  // `.github/workflows/deploy-apex-chat.yml` sous un commentaire disant « jamais dans le
  // repo ». Ce garde ne regardait que la page et les tests → il passait au vert. Il couvre
  // désormais TOUT le dossier de l'app (code, workers, docs, config) et TOUS les workflows.
  it("ni le reste de l'app, ni les workflows GitHub ne portent un numéro réel", () => {
    const racines = [APP, join(APP, '..', '.github', 'workflows')];
    const exclus = /\/(node_modules|coverage|test-results|playwright-report|tests)\//;
    const fautifs = [];
    const walk = (dir) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { if (!exclus.test(p + '/')) walk(p); continue; }
        if (!/\.(m?js|html|md|toml|ya?ml|json|sh|txt|sql)$/.test(n)) continue;
        const t = inconnus(readFileSync(p, 'utf8'), [...EXEMPLES_PAGE, ...FIXTURES_TESTS]);
        if (t.length) fautifs.push(`${p.replace(APP + '/', '')} → ${t.join(', ')}`);
      }
    };
    for (const r of racines) walk(r);
    expect(fautifs, 'Numéro réel trouvé hors des exemples autorisés :\n' + fautifs.join('\n')).toEqual([]);
  });

  it('garde discriminant : un numéro inconnu est bien détecté', () => {
    expect(inconnus('appelle le +33 6 55 44 33 22 ce soir', EXEMPLES_PAGE)).toEqual(['+33 6…']);
    expect(inconnus('appelle le 0698765432', EXEMPLES_PAGE)).toEqual([]); // exemple autorisé
    expect(inconnus('ou le +33 6 98 76 54 32', EXEMPLES_PAGE)).toEqual([]); // même numéro, autre forme
  });
});
