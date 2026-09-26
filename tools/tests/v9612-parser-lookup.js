/* Test isolé v9.612 — Vérifie la logique lookup CODES après normalisation
 * Simule le parsing _applyCodeArr lookup chain sur des cas réels SBM.
 */
'use strict';

const CODES = {
  '22/6': { l: '22h-6h' },
  '19/4': { l: '19h-4h' },
  '19/4*': { l: '19h-4h CDP' },
  '19/4\'': { l: 'Convention' },
  '16/20': { l: '16h-20h' },
  '19/2': { l: '19h-2h' },
  '12H30/19': { l: '12h30-19h' },
  '12h30/19': { l: '12h30-19h alias' },
  'RH': { l: 'Repos Hebdo' },
  'CP': { l: 'Congé' },
  'M': { l: 'Maladie' },
  'AF': { l: 'Formation' },
};

/* Logique v9.612 extraite de _applyCodeArr */
function lookupCode(raw) {
  const _rawNoTag = String(raw).replace(/\{\{[A-Z]*\}?\}?/g, '').trim();
  const _acRaw = _rawNoTag.toUpperCase()
    .replace(/[∕⁄／]/g, '/')
    .replace(/[“”]/g, '"')
    .replace(/[‘’ʼ]/g, "'");
  let _ac = null;
  if (_acRaw && CODES[_acRaw]) _ac = _acRaw;
  if (!_ac) {
    const _acT2 = _acRaw.replace(/["'`]+$/, '').replace(/[:;]+$/, '');
    if (_acT2 && CODES[_acT2]) _ac = _acT2;
  }
  if (!_ac) {
    const _acT3 = _acRaw.replace(/["'`]/g, '').trim();
    if (_acT3 && CODES[_acT3]) _ac = _acT3;
  }
  if (!_ac) _ac = _acRaw.replace(/["'`]/g, '').trim();
  return _ac;
}

const tests = [
  /* Format : [input, expected, description] */
  ['22/6', '22/6', 'Code base CMC simple'],
  ['19/4', '19/4', 'Code base CCDP simple'],
  ['19/4*', '19/4*', 'Code CDP avec étoile préservé'],
  ['19/4\'', '19/4\'', 'Convention CMC apostrophe PRÉSERVÉE (sémantique)'],
  ['22/6\'', '22/6', 'Variant 22/6\' → strip vers base 22/6'],
  ['22/6"', '22/6', 'Variant 22/6" → strip vers base'],
  ['22/6"\'', '22/6', 'Variant double quote+apostrophe → strip'],
  ['19/2:', '19/2', 'Variant colon → strip suffix'],
  ['19/2;', '19/2', 'Variant semicolon → strip suffix'],
  ['12h30/19', '12H30/19', 'Lowercase h12 → uppercase H12 (uppercase first)'],
  /* iOS Safari paste unicode slash */
  ['22∕6', '22/6', 'Unicode slash U+2215 → /'],
  /* Curly quotes iOS */
  ['19/4’', '19/4\'', 'Curly apostrophe ’ → \' (préservé Convention)'],
  ['22/6”', '22/6', 'Curly quote ” → " stripped'],
  /* Codes lettres */
  ['RH', 'RH', 'RH simple'],
  ['CP', 'CP', 'CP simple'],
  ['M', 'M', 'M maladie simple'],
  /* Codes invalides (devraient retourner string mais pas dans CODES) */
  ['XYZ', 'XYZ', 'Code inconnu retourné tel quel pour fallback'],
];

let pass = 0, fail = 0;
const failures = [];
tests.forEach(([input, expected, desc]) => {
  const result = lookupCode(input);
  if (result === expected) {
    pass++;
    console.log(`✅ ${desc}: "${input}" → "${result}"`);
  } else {
    fail++;
    failures.push({ input, expected, got: result, desc });
    console.log(`❌ ${desc}: "${input}" → expected "${expected}" GOT "${result}"`);
  }
});
console.log(`\n=== ${pass}/${pass + fail} pass (${fail} failures) ===`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.desc}: "${f.input}" → got "${f.got}" expected "${f.expected}"`));
  process.exit(1);
}
process.exit(0);
