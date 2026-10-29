/* La Détente : l'adresse la-detente.kd-mc.com montre la BOUTIQUE de textile, pas le « Pack identité visuelle »
   (Kevin 29.10.2026 : « montre la boutique »). Garde : la route et le fichier existent. */
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const m = src.match(/'la-detente\.kd-mc\.com':\s*'([^']+)'/);
assert.ok(m, 'route la-detente absente');
assert.equal(m[1], '/CMCteams/shops/la-detente', 'la-detente.kd-mc.com doit servir la boutique (shops/la-detente), pas le pack identité');
assert.ok(existsSync(new URL('../../shops/la-detente/index.html', import.meta.url)), 'la page de la boutique doit exister');
console.log('La Détente → boutique : 3 OK');
