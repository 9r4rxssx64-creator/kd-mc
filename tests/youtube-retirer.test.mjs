// Retrait YouTube (08.10.2026) : on passe en privé SANS écraser le reste du statut,
// et le robot refuse de toucher à une autre chaîne / sans le droit de modifier.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { corpsStatut } from '../tools/social/youtube-retirer.mjs';

const c = corpsStatut('abc', { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true, license: 'youtube', uploadStatus: 'processed' });
assert.equal(c.id, 'abc');
assert.equal(c.status.privacyStatus, 'private');
assert.equal(c.status.selfDeclaredMadeForKids, false, 'la déclaration enfants doit être recopiée');
assert.equal(c.status.containsSyntheticMedia, true, 'la déclaration IA doit être recopiée');
assert.equal(c.status.uploadStatus, undefined, 'un champ en lecture seule ne doit pas être renvoyé');

const src = readFileSync(new URL('../tools/social/youtube-retirer.mjs', import.meta.url), 'utf8');
assert.ok(!/method:\s*'DELETE'/.test(src), 'jamais de suppression : privé = réversible');
assert.ok(/CHAINE && ch\?\.id !== CHAINE/.test(src), 'garde chaîne attendue');
assert.ok(/ne permet que d’envoyer/.test(src), 'garde droits du jeton');
assert.ok(!/console\.log\([^)]*access_token/.test(src), 'le jeton ne s’affiche jamais');

const wf = readFileSync(new URL('../.github/workflows/youtube-retirer.yml', import.meta.url), 'utf8');
assert.ok(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf), 'bouton seulement, aucun cron');
assert.ok(/timeout-minutes:\s*5\b/.test(wf), 'borné');
console.log('youtube-retirer : 9/9 ✓');
