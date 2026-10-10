/* GARDE — aucun `if:` de robot GitHub ne lit `secrets.` (10.10.2026)
   node tests/verify-workflows-if-secrets.mjs [dossier]

   Cause : deploy-kdmc-crea-ai.yml portait `if: ${{ inputs.selftest == true && secrets.KDMC_CI_PASS != '' }}`.
   GitHub interdit le contexte `secrets` dans un `if:` → il refuse TOUT le fichier : 0 tâche lancée,
   un rouge à chaque synchronisation du dépôt public, et le robot ne déploie plus rien.
   Le bon geste : passer le secret en `env:` et le tester DANS l'étape (`[ -z "$X" ] && exit 0`).

   Contrôles :
     1. aucun `if:` (étape ou tâche, sur une ligne ou en bloc) ne contient `secrets.` ;
     2. auto-contrôle : la détection attrape bien un faux robot fautif (sinon la garde ne prouve rien). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2] || new URL('../.github/workflows/', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };

/* Renvoie les lignes fautives : `if:` qui lit secrets, y compris un `if: |` / `if: >` sur plusieurs lignes. */
export function fautes(texte) {
  const lignes = texte.split('\n'), out = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^(\s*)(?:-\s+)?if:\s*(.*)$/);
    if (!m) continue;
    let valeur = m[2].replace(/\s+#.*$/, '');
    if (/^[|>][-+]?\s*$/.test(valeur)) {
      const retrait = m[1].length;
      for (let j = i + 1; j < lignes.length && (lignes[j].trim() === '' || lignes[j].search(/\S/) > retrait); j++) valeur += ' ' + lignes[j].trim();
    }
    if (/\bsecrets\s*\.|\bsecrets\s*\[/.test(valeur)) out.push(i + 1);
  }
  return out;
}

console.log('\n== 1. Les robots du dépôt ==');
const fichiers = readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f));
ok(fichiers.length > 0, `${fichiers.length} robots lus dans ${dossier}`);
const fautifs = [];
for (const f of fichiers) for (const l of fautes(readFileSync(join(dossier, f), 'utf8'))) fautifs.push(`${f}:${l}`);
ok(fautifs.length === 0, fautifs.length ? `\`secrets.\` dans un if: → GitHub refuse le fichier : ${fautifs.join(', ')}` : 'aucun `if:` ne lit `secrets.`');

console.log('\n== 2. La détection elle-même ==');
ok(fautes("      - name: x\n        if: ${{ inputs.a == true && secrets.X != '' }}\n").length === 1, 'attrape le cas réel du 10.10 (étape)');
ok(fautes('    if: |\n      github.event_name == \'push\' &&\n      secrets.Y != \'\'\n    runs-on: ubuntu-latest\n').length === 1, 'attrape un if: en bloc sur plusieurs lignes');
ok(fautes("        if: ${{ inputs.selftest == true }}   # le secret est testé dans l'étape (secrets.X)\n        env:\n          X: ${{ secrets.X }}\n").length === 0, "ne confond pas un commentaire ni un env: avec un if:");

console.log(`\n${fail ? '❌' : '✅'} workflows-if-secrets : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
