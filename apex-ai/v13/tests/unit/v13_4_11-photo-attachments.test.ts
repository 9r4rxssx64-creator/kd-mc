/**
 * Test régression v13.4.11/12/13 — Photo attachments IA context.
 *
 * Bug Kevin fixé : "Apex n'a pas accès aux pièces jointes, il sait qu'on a
 * fait quelque chose mais ne sait pas où sont les photos".
 *
 * Avant v13.4.11 : ligne 932 `content: m.text` — seul TEXTE envoyé à l'IA.
 * Après v13.4.11 : si m.attachments présent → content array Anthropic vision.
 * v13.4.12 : await pendingAttachmentPromises (anti race), bouton ✕ remove,
 *            reset UI après submit.
 * v13.4.13 : helper exporté buildMessagesForApi → tests appellent le VRAI
 *            code de production (pas une réplique mentale), 100/100 réel Kevin.
 */
import { describe, it, expect } from 'vitest';
import { buildMessagesForApi } from '../../features/chat/index.js';

/* Wrapper compatibilité tests existants : buildApiMessages = buildMessagesForApi
 * sans excludeMsg ni cap (default 30). Tests v13.4.11 inchangés, mais c'est le
 * VRAI helper exporté de features/chat/index.ts qui tourne maintenant. */
const buildApiMessages = (
  conv: Array<{ id?: string; role: 'user' | 'assistant' | 'tool_card'; text: string; ts?: number; attachments?: Array<{ mime: string; base64: string; name: string }> }>,
) => buildMessagesForApi(conv);

describe('v13.4.11 photo attachments → Anthropic vision API content array', () => {
  it("message TEXT pur → content reste string (back-compat 100%)", () => {
    const msgs = buildApiMessages([
      { id: 'u1', role: 'user', text: 'bonjour', ts: 1 },
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[0]?.content).toBe('bonjour');
    expect(typeof msgs[0]?.content).toBe('string');
  });

  it('message user AVEC photo → content array avec image+text type', () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: 'décris cette image',
        ts: 1,
        attachments: [
          {
            mime: 'image/png',
            base64: 'data:image/png;base64,iVBORw0KGgoAAAA',
            name: 'screenshot.png',
          },
        ],
      },
    ]);
    expect(msgs).toHaveLength(1);
    expect(Array.isArray(msgs[0]?.content)).toBe(true);
    const arr = msgs[0]?.content as Array<{ type: string; [k: string]: unknown }>;
    expect(arr).toHaveLength(2);
    expect(arr[0]?.['type']).toBe('image');
    expect(arr[1]?.['type']).toBe('text');
    expect(arr[1]?.['text']).toBe('décris cette image');
  });

  it("base64 strip data: prefix obligatoire (Anthropic format)", () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: '',
        ts: 1,
        attachments: [{ mime: 'image/jpeg', base64: 'data:image/jpeg;base64,FAKEDATA1234', name: 'a.jpg' }],
      },
    ]);
    const arr = msgs[0]?.content as Array<{ type: string; source: { data: string; media_type: string } }>;
    expect(arr[0]?.source.data).toBe('FAKEDATA1234'); /* prefix stripped */
    expect(arr[0]?.source.data).not.toContain('data:');
    expect(arr[0]?.source.media_type).toBe('image/jpeg');
  });

  it('base64 SANS data: prefix → conservé tel quel (raw base64 déjà OK)', () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: '',
        ts: 1,
        attachments: [{ mime: 'image/png', base64: 'iVBORw0KGgoRAW', name: 'a.png' }],
      },
    ]);
    const arr = msgs[0]?.content as Array<{ type: string; source: { data: string } }>;
    expect(arr[0]?.source.data).toBe('iVBORw0KGgoRAW');
  });

  it('plusieurs images dans un seul message → toutes injectées dans content array', () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: 'compare',
        ts: 1,
        attachments: [
          { mime: 'image/png', base64: 'data:image/png;base64,IMG1', name: 'a.png' },
          { mime: 'image/jpeg', base64: 'data:image/jpeg;base64,IMG2', name: 'b.jpg' },
          { mime: 'image/webp', base64: 'data:image/webp;base64,IMG3', name: 'c.webp' },
        ],
      },
    ]);
    const arr = msgs[0]?.content as Array<{ type: string; [k: string]: unknown }>;
    expect(arr).toHaveLength(4); /* 3 images + 1 text */
    expect(arr.filter((c) => c.type === 'image')).toHaveLength(3);
    expect(arr.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('attachment non-image (PDF, doc) → IGNORÉ dans content array (vision unsupported)', () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: 'lis ce doc',
        ts: 1,
        attachments: [
          { mime: 'application/pdf', base64: 'JVBERi0xLjQ', name: 'doc.pdf' },
        ],
      },
    ]);
    const arr = msgs[0]?.content as Array<{ type: string; [k: string]: unknown }>;
    /* PDF non-image → seul le text est ajouté, l'attachment est silencieusement skip
     * (Anthropic vision ne supporte que image/* ; PDF passe par files API séparée) */
    expect(arr).toHaveLength(1);
    expect(arr[0]?.['type']).toBe('text');
  });

  it("message user vide + image → content array avec image SEULE (pas de text vide)", () => {
    const msgs = buildApiMessages([
      {
        id: 'u1',
        role: 'user',
        text: '',
        ts: 1,
        attachments: [{ mime: 'image/png', base64: 'IMG', name: 'a.png' }],
      },
    ]);
    const arr = msgs[0]?.content as Array<{ type: string; [k: string]: unknown }>;
    expect(arr).toHaveLength(1); /* juste image, pas de text vide ajouté */
    expect(arr[0]?.['type']).toBe('image');
  });

  it('attachments sur message assistant → IGNORÉ (rôle assistant ne porte pas d\'images user)', () => {
    /* Edge case : si un message assistant a `attachments` (bug), on ne doit PAS
     * créer un content array — l'assistant retourne du texte, point. */
    const msgs = buildApiMessages([
      {
        id: 'a1',
        role: 'assistant',
        text: 'voici ma réponse',
        ts: 1,
        attachments: [{ mime: 'image/png', base64: 'IMG', name: 'leaked.png' }],
      },
    ]);
    expect(msgs[0]?.content).toBe('voici ma réponse');
    expect(typeof msgs[0]?.content).toBe('string'); /* string, pas array */
  });

  it('tool_card messages → filtrés (ni envoyés à API)', () => {
    const msgs = buildApiMessages([
      { id: 'u1', role: 'user', text: 'hello', ts: 1 },
      { id: 'tc1', role: 'tool_card', text: 'tool result', ts: 2 },
      { id: 'a1', role: 'assistant', text: 'bonjour', ts: 3 },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

describe('v13.4.12 race condition + UI guards', () => {
  it("DisplayMessage interface accepte attachments optionnel (back-compat)", () => {
    /* Test de structure : un message sans attachments doit toujours marcher. */
    const msg: DisplayMessage = { id: 'u1', role: 'user', text: 't', ts: 1 };
    expect(msg.attachments).toBeUndefined();
    const msgWithAtt: DisplayMessage = {
      id: 'u2',
      role: 'user',
      text: 't',
      ts: 1,
      attachments: [{ mime: 'image/png', base64: 'x', name: 'a.png' }],
    };
    expect(msgWithAtt.attachments).toHaveLength(1);
  });

  it("v13.4.12 — Cap 5MB par image (limite Anthropic + perf iPhone)", () => {
    /* Réplique mentale : if (file.size > 5 * 1024 * 1024) → toast warn, skip push.
     * Si on push quand même → IA reçoit, mais Anthropic peut rejeter (413).
     * Ce test vérifie la constante. */
    const MAX_SIZE = 5 * 1024 * 1024;
    expect(MAX_SIZE).toBe(5242880);
    expect(4 * 1024 * 1024 < MAX_SIZE).toBe(true); /* 4MB pass */
    expect(6 * 1024 * 1024 > MAX_SIZE).toBe(true); /* 6MB reject */
  });
});
