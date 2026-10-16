// @vitest-environment node
/**
 * Audit 16.10.2026 : sans file de rebut, un message qui échoue 3 fois DISPARAÎT sans trace. Désormais 5 essais, puis
 * la file de rebut, dont le contenu est consigné (type, jamais le contenu) dans le journal d'audit.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { DLQ_NAME } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOML = readFileSync(join(ROOT, 'workers/wrangler.toml'), 'utf8');
const YML = readFileSync(join(ROOT, '..', '.github/workflows/deploy-apex-chat.yml'), 'utf8');
const consumers = TOML.split('[[queues.consumers]]').slice(1).map((b) => ({ queue: (b.match(/queue = "([^"]+)"/) || [])[1], bloc: b.split('\n\n')[0] }));

describe('configuration des files', () => {
  it('chaque file de travail a 5 essais ET la file de rebut ; la file de rebut a son consommateur', () => {
    const travail = consumers.filter((c) => c.queue !== DLQ_NAME);
    expect(travail.length).toBe(5);
    for (const c of travail) { expect(c.bloc, c.queue).toContain('max_retries = 5'); expect(c.bloc, c.queue).toContain('dead_letter_queue = "' + DLQ_NAME + '"'); }
    expect(consumers.some((c) => c.queue === DLQ_NAME)).toBe(true);
  });
  it('le déploiement CRÉE la file de rebut avant de déployer (sinon le déploiement échouerait)', () => {
    const i = YML.indexOf('Create Cloudflare Queues');
    expect(YML.slice(i, i + 500)).toContain(DLQ_NAME);
    expect(i).toBeLessThan(YML.indexOf('Deploy api-worker (official Cloudflare action)'));
  });
});

describe('consommation de la file de rebut', () => {
  it('chaque message mort est consigné au journal d\'audit (type, identifiant, essais) puis acquitté — sans le contenu', async () => {
    const DB = d1Reel();
    const mk = (body, attempts) => ({ body, attempts, ack: vi.fn(), retry: vi.fn() });
    const m1 = mk({ queue_type: 'timecapsule-open', capsule_id: 'tc9', ciphertext: 'SECRET' }, 5);
    const m2 = mk({ queue_type: 'letters-deliver', letter_id: 'l7' }, 5);
    await worker.queue({ queue: DLQ_NAME, messages: [m1, m2] }, ENV({ APEX_CHAT_DB: DB }));
    const rows = DB.raw.prepare("SELECT target_id, details FROM audit_log WHERE action='queue_dead_letter' ORDER BY id").all();
    expect(rows.map((r) => r.target_id)).toEqual(['timecapsule-open', 'letters-deliver']);
    expect(JSON.parse(rows[0].details)).toMatchObject({ type: 'timecapsule-open', id: 'tc9', essais: 5 });
    expect(rows[0].details).not.toContain('SECRET');
    expect(m1.ack).toHaveBeenCalled(); expect(m2.ack).toHaveBeenCalled();
    expect(m1.retry).not.toHaveBeenCalled();
  });
  it('journal en panne : le message est quand même acquitté (jamais de boucle sur la file de rebut)', async () => {
    const m = { body: { queue_type: 'x' }, ack: vi.fn(), retry: vi.fn() };
    const DB = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1'); } }) }) };
    await worker.queue({ queue: DLQ_NAME, messages: [m] }, ENV({ APEX_CHAT_DB: DB }));
    expect(m.ack).toHaveBeenCalled();
  });
});
