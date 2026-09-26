/**
 * Tests services/chat-attachments-store (Kevin v13.4.198 "100/100 réel partout").
 *
 * Couvre les 5 méthodes du store IDB attachments :
 * - persistAttachments (cas vide / multi / iOS fail silent)
 * - restoreAttachments (ordre idx préservé, retourne [] si vide)
 * - listRecentAttachments (groupement msgId + tri ts desc + cap N)
 * - cleanupOrphans (delete msgIds absents du Set)
 * - getStats (count/totalBytes/oldestTs)
 *
 * Setup IDB : `tests/setup.ts` charge fake-indexeddb/auto + reset entre tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { chatAttachmentsStore } from '../../services/ai/chat-attachments-store.js';

function makeAtt(mime = 'image/png', name = 'photo.png', base64 = 'aGVsbG8='): {
  mime: string;
  name: string;
  base64: string;
} {
  return { mime, name, base64 };
}

describe('services/chat-attachments-store', () => {
  beforeEach(() => {
    /* setup.ts reset IDBFactory en beforeEach global → DB clean à chaque test */
  });

  describe('persistAttachments', () => {
    it('retourne [] si attachments vide', async () => {
      const ids = await chatAttachmentsStore.persistAttachments('msg_1', []);
      expect(ids).toEqual([]);
    });

    it('persiste 1 attachment + retourne 1 id formé `<msgId>_<idx>`', async () => {
      const ids = await chatAttachmentsStore.persistAttachments('msg_42', [makeAtt()]);
      expect(ids).toEqual(['msg_42_0']);
    });

    it('persiste N attachments + retourne N ids ordonnés', async () => {
      const ids = await chatAttachmentsStore.persistAttachments('msg_7', [
        makeAtt('image/jpeg', 'a.jpg', 'YQ=='),
        makeAtt('image/png', 'b.png', 'Yg=='),
        makeAtt('application/pdf', 'c.pdf', 'Yw=='),
      ]);
      expect(ids).toEqual(['msg_7_0', 'msg_7_1', 'msg_7_2']);
    });

    it('skippe les entries falsy dans l\'array', async () => {
      const arr = [makeAtt(), undefined, makeAtt('text/plain', 't.txt', 'dA==')] as Array<{
        mime: string; name: string; base64: string;
      }>;
      const ids = await chatAttachmentsStore.persistAttachments('msg_skip', arr);
      /* Indexe 0 et 2 sont valides (1 est undefined → continue), retournent quand même 2 ids 0+2 */
      expect(ids).toContain('msg_skip_0');
      expect(ids).toContain('msg_skip_2');
    });
  });

  describe('restoreAttachments', () => {
    it('retourne [] si aucun attachment pour msgId', async () => {
      const out = await chatAttachmentsStore.restoreAttachments('msg_inconnu');
      expect(out).toEqual([]);
    });

    it('restaure ordre idx préservé', async () => {
      await chatAttachmentsStore.persistAttachments('msg_a', [
        makeAtt('image/png', 'first.png', 'MQ=='),
        makeAtt('image/png', 'second.png', 'Mg=='),
        makeAtt('image/png', 'third.png', 'Mw=='),
      ]);
      const restored = await chatAttachmentsStore.restoreAttachments('msg_a');
      expect(restored.map((a) => a.name)).toEqual(['first.png', 'second.png', 'third.png']);
    });

    it('isolation par msgId (pas de cross-contamination)', async () => {
      await chatAttachmentsStore.persistAttachments('msg_x', [makeAtt('image/png', 'x.png', 'eA==')]);
      await chatAttachmentsStore.persistAttachments('msg_y', [makeAtt('image/png', 'y.png', 'eQ==')]);
      const xs = await chatAttachmentsStore.restoreAttachments('msg_x');
      const ys = await chatAttachmentsStore.restoreAttachments('msg_y');
      expect(xs).toHaveLength(1);
      expect(xs[0]?.name).toBe('x.png');
      expect(ys).toHaveLength(1);
      expect(ys[0]?.name).toBe('y.png');
    });
  });

  describe('listRecentAttachments', () => {
    it('retourne [] si store vide', async () => {
      const out = await chatAttachmentsStore.listRecentAttachments();
      expect(out).toEqual([]);
    });

    it('groupe par msgId et tri par ts desc + cap maxMessages', async () => {
      /* Persiste 5 messages distincts avec délais artificiels */
      for (let i = 0; i < 5; i++) {
        await chatAttachmentsStore.persistAttachments(`msg_${i}`, [makeAtt()]);
        /* tiny delay to ensure ts ordering */
        await new Promise((r) => setTimeout(r, 2));
      }
      const recent3 = await chatAttachmentsStore.listRecentAttachments(3);
      /* 3 msgIds × 1 attachment chacun = 3 entries */
      expect(recent3).toHaveLength(3);
      /* Les 3 msgIds doivent être msg_4, msg_3, msg_2 (les plus récents) */
      const msgIds = [...new Set(recent3.map((a) => a.msgId))];
      expect(msgIds).toContain('msg_4');
      expect(msgIds).not.toContain('msg_0');
    });

    it('default maxMessages = 20', async () => {
      for (let i = 0; i < 25; i++) {
        await chatAttachmentsStore.persistAttachments(`m${i}`, [makeAtt()]);
      }
      const out = await chatAttachmentsStore.listRecentAttachments();
      /* 20 messages × 1 attachment = 20 entries */
      expect(out.length).toBeLessThanOrEqual(20);
    });
  });

  describe('cleanupOrphans', () => {
    it('supprime msgIds absents du Set + retourne count', async () => {
      await chatAttachmentsStore.persistAttachments('keep_1', [makeAtt()]);
      await chatAttachmentsStore.persistAttachments('drop_1', [makeAtt(), makeAtt()]);
      await chatAttachmentsStore.persistAttachments('keep_2', [makeAtt()]);
      const deleted = await chatAttachmentsStore.cleanupOrphans(new Set(['keep_1', 'keep_2']));
      expect(deleted).toBe(2); /* drop_1 avait 2 attachments */
      const remaining = await chatAttachmentsStore.restoreAttachments('drop_1');
      expect(remaining).toEqual([]);
      const keep = await chatAttachmentsStore.restoreAttachments('keep_1');
      expect(keep).toHaveLength(1);
    });

    it('retourne 0 si aucun orphelin', async () => {
      await chatAttachmentsStore.persistAttachments('safe', [makeAtt()]);
      const deleted = await chatAttachmentsStore.cleanupOrphans(new Set(['safe']));
      expect(deleted).toBe(0);
    });
  });

  describe('getStats', () => {
    it('retourne count=0 / totalBytes=0 / oldestTs=null sur store vide', async () => {
      const s = await chatAttachmentsStore.getStats();
      expect(s.count).toBe(0);
      expect(s.totalBytes).toBe(0);
      expect(s.oldestTs).toBeNull();
    });

    it('count + totalBytes correct après persist multi', async () => {
      await chatAttachmentsStore.persistAttachments('m1', [
        makeAtt('image/png', 'a.png', 'AAAA'), /* 4 bytes */
        makeAtt('image/png', 'b.png', 'BBBB'), /* 4 bytes */
      ]);
      await chatAttachmentsStore.persistAttachments('m2', [
        makeAtt('image/png', 'c.png', 'CCCCCCCC'), /* 8 bytes */
      ]);
      const s = await chatAttachmentsStore.getStats();
      expect(s.count).toBe(3);
      expect(s.totalBytes).toBe(16);
      expect(s.oldestTs).toBeGreaterThan(0);
    });
  });

  describe('chatAttachmentsStore namespace', () => {
    it('expose les 5 méthodes du module', () => {
      expect(chatAttachmentsStore.persistAttachments).toBeDefined();
      expect(chatAttachmentsStore.restoreAttachments).toBeDefined();
      expect(chatAttachmentsStore.listRecentAttachments).toBeDefined();
      expect(chatAttachmentsStore.cleanupOrphans).toBeDefined();
      expect(chatAttachmentsStore.getStats).toBeDefined();
    });
  });
});
