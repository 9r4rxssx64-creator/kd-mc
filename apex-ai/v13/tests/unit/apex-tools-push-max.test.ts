/**
 * Tests v13.0.20 PUSH MAX — 25 nouveaux tools poussant le registre à 105+.
 *
 * Couvre :
 * - Registry count >= 100
 * - Catégories complètes (web, files, code, productivity, comms, finance, image)
 * - Anthropic format export
 * - Permissions tier
 * - Implémentations offline (json/regex/text/uuid/jwt/wordcount/lang/email/phone/whatsapp/vat/compound/mindmap/task)
 * - Implémentations fetch mockés (wikipedia/github/stackoverflow/youtube/unshorten/currency)
 * - Gestion erreurs (input vide, format invalide, etc.)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';

describe('Apex Tools PUSH MAX v13.0.20 — 100+ tools', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ============ REGISTRY COUNT + CATEGORIES ============ */

  describe('Registry expanded (≥100 tools)', () => {
    it('list() retourne au moins 100 tools', () => {
      const all = apexTools.list();
      expect(all.length).toBeGreaterThanOrEqual(100);
    });

    it('toAnthropicFormat admin retourne >= 100 tool entries', () => {
      const formatted = apexTools.toAnthropicFormat('admin');
      expect(Array.isArray(formatted)).toBe(true);
      expect(formatted.length).toBeGreaterThanOrEqual(100);
    });

    it('chaque tool a name + description + input_schema', () => {
      const all = apexTools.list();
      for (const t of all) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.inputSchema).toBeDefined();
        expect(t.inputSchema.type).toBe('object');
      }
    });

    it('catégories nouveaux tools toutes accessibles via getByName', () => {
      const newTools = [
        'wikipedia_lookup', 'youtube_search', 'github_search', 'stackoverflow_search', 'unshorten_url',
        'json_validate', 'csv_parse', 'text_diff', 'hash_text', 'base64_encode_decode',
        'regex_test', 'jwt_decode', 'uuid_generate',
        'summarize_text', 'word_count', 'detect_language', 'mind_map_generate', 'create_task',
        'email_validate', 'phone_validate', 'whatsapp_link',
        'vat_validate_eu', 'compound_interest', 'currency_convert',
        'image_compress',
      ];
      for (const name of newTools) {
        const t = apexTools.getByName(name);
        expect(t, `Tool ${name} doit exister`).not.toBeNull();
      }
    });

    it('anthropic format = même count que registry list', () => {
      const all = apexTools.list();
      const formatted = apexTools.toAnthropicFormat('admin');
      expect(formatted.length).toBe(all.length);
    });

    it('client_free filter exclut admin tools mais inclut nouveaux client_free', () => {
      const free = apexTools.listForTier('client_free');
      expect(free.find((t) => t.name === 'json_validate')).toBeDefined();
      expect(free.find((t) => t.name === 'wikipedia_lookup')).toBeDefined();
      expect(free.find((t) => t.name === 'edit_file')).toBeUndefined();
    });
  });

  /* ============ WEB EXTRAS (5 tools) ============ */

  describe('Web extras', () => {
    it('wikipedia_lookup query manquante → throw', async () => {
      const r = await apexToolsDispatch.execute('wikipedia_lookup', {}, 'client_free');
      expect(r.ok).toBe(false);
    });

    it('wikipedia_lookup mock fetch retourne extract', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ title: 'Monaco', extract: 'État souverain', content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Monaco' } } }), { status: 200 }),
      );
      const r = await apexToolsDispatch.execute('wikipedia_lookup', { query: 'Monaco' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { found: boolean; title?: string };
      expect(data.found).toBe(true);
      expect(data.title).toBe('Monaco');
    });

    it('wikipedia_lookup fetch fail → found=false', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network'));
      const r = await apexToolsDispatch.execute('wikipedia_lookup', { query: 'TestX' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { found: boolean };
      expect(data.found).toBe(false);
    });

    it('youtube_search retourne search_url + embed_url', async () => {
      const r = await apexToolsDispatch.execute('youtube_search', { query: 'react tutorial' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { search_url: string; embed_url: string };
      expect(data.search_url).toContain('youtube.com');
      expect(data.search_url).toContain('react%20tutorial');
    });

    it('github_search mock retourne items', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 2, items: [{ name: 'x' }, { name: 'y' }] }), { status: 200 }),
      );
      const r = await apexToolsDispatch.execute('github_search', { query: 'apex', type: 'repos' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { total: number; items: unknown[] };
      expect(data.total).toBe(2);
      expect(data.items.length).toBe(2);
    });

    it('github_search fetch fail → empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('rate limit'));
      const r = await apexToolsDispatch.execute('github_search', { query: 'x' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { total: number };
      expect(data.total).toBe(0);
    });

    it('stackoverflow_search mock', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          items: [{ title: 'Q1', link: 'https://stackoverflow.com/q/1', score: 5, is_answered: true, tags: ['typescript'] }],
        }), { status: 200 }),
      );
      const r = await apexToolsDispatch.execute('stackoverflow_search', { query: 'array map' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { questions: Array<{ title: string }> };
      expect(data.questions[0]?.title).toBe('Q1');
    });

    it('unshorten_url suit redirection', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200, headers: {} }),
      );
      const r = await apexToolsDispatch.execute('unshorten_url', { url: 'https://example.com' }, 'client_free');
      expect(r.ok).toBe(true);
    });
  });

  /* ============ FILES & DOCUMENTS (5 tools) ============ */

  describe('Files & Documents', () => {
    it('json_validate JSON valide retourne parsed + depth + keys_count', async () => {
      const r = await apexToolsDispatch.execute('json_validate', { json: '{"a":{"b":[1,2,{"c":3}]}}' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; depth: number; keys_count: number };
      expect(data.valid).toBe(true);
      expect(data.depth).toBeGreaterThanOrEqual(3);
      expect(data.keys_count).toBeGreaterThanOrEqual(3);
    });

    it('json_validate JSON invalide → valid=false + error', async () => {
      const r = await apexToolsDispatch.execute('json_validate', { json: '{invalid' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; error?: string };
      expect(data.valid).toBe(false);
      expect(data.error).toBeTruthy();
    });

    it('json_validate empty → valid=false', async () => {
      const r = await apexToolsDispatch.execute('json_validate', { json: '' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('csv_parse comma delimiter', async () => {
      const csv = 'name,age,city\nAlice,30,Paris\nBob,25,Lyon';
      const r = await apexToolsDispatch.execute('csv_parse', { csv }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { headers: string[]; rows: Array<Record<string, string>>; total: number };
      expect(data.headers).toEqual(['name', 'age', 'city']);
      expect(data.total).toBe(2);
      expect(data.rows[0]?.['name']).toBe('Alice');
    });

    it('csv_parse semicolon delimiter auto-detect', async () => {
      const csv = 'a;b\n1;2';
      const r = await apexToolsDispatch.execute('csv_parse', { csv }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { headers: string[] };
      expect(data.headers).toEqual(['a', 'b']);
    });

    it('text_diff calcule added/removed', async () => {
      const r = await apexToolsDispatch.execute('text_diff', {
        before: 'line1\nline2\nline3',
        after: 'line1\nline_NEW\nline3',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { added: string[]; removed: string[]; total_changes: number };
      expect(data.added).toContain('line_NEW');
      expect(data.removed).toContain('line2');
      expect(data.total_changes).toBe(2);
    });

    it('hash_text SHA-256', async () => {
      const r = await apexToolsDispatch.execute('hash_text', { text: 'hello', algo: 'SHA-256' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { algo: string; hash: string };
      expect(data.algo).toBe('SHA-256');
      expect(data.hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('hash_text invalid algo → fallback SHA-256', async () => {
      const r = await apexToolsDispatch.execute('hash_text', { text: 'a', algo: 'BAD' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { algo: string };
      expect(data.algo).toBe('SHA-256');
    });

    it('base64_encode + decode roundtrip UTF-8', async () => {
      const original = 'Bonjour Apex éàü 🚀';
      const enc = await apexToolsDispatch.execute('base64_encode_decode', { mode: 'encode', text: original }, 'client_free');
      const encResult = (enc.result as { result: string }).result;
      const dec = await apexToolsDispatch.execute('base64_encode_decode', { mode: 'decode', text: encResult }, 'client_free');
      expect((dec.result as { result: string }).result).toBe(original);
    });

    it('base64 mode invalid → throw', async () => {
      const r = await apexToolsDispatch.execute('base64_encode_decode', { mode: 'X', text: 'a' }, 'client_free');
      expect(r.ok).toBe(false);
    });
  });

  /* ============ CODE UTILS (3 tools) ============ */

  describe('Code utils', () => {
    it('regex_test global flag retourne tous matches', async () => {
      const r = await apexToolsDispatch.execute('regex_test', {
        pattern: '\\d+',
        text: 'abc 123 def 456',
        flags: 'g',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { matches: string[]; total: number; valid: boolean };
      expect(data.valid).toBe(true);
      expect(data.matches).toEqual(['123', '456']);
      expect(data.total).toBe(2);
    });

    it('regex_test pattern invalide → valid=false', async () => {
      const r = await apexToolsDispatch.execute('regex_test', {
        pattern: '[unclosed',
        text: 'x',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; error?: string };
      expect(data.valid).toBe(false);
      expect(data.error).toBeTruthy();
    });

    it('regex_test capture groups', async () => {
      const r = await apexToolsDispatch.execute('regex_test', {
        pattern: '(\\w+)=(\\d+)',
        text: 'a=1 b=2',
        flags: 'g',
      }, 'client_free');
      const data = r.result as { groups: string[][]; matches: string[] };
      expect(data.matches.length).toBe(2);
      expect(data.groups[0]).toEqual(['a', '1']);
    });

    it('jwt_decode token valide retourne header + payload', async () => {
      /* Token JWT minimal: {"alg":"HS256"}.{"sub":"123"} */
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
      const r = await apexToolsDispatch.execute('jwt_decode', { token }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; header: { alg?: string }; payload: { sub?: string } };
      expect(data.valid).toBe(true);
      expect(data.header.alg).toBe('HS256');
      expect(data.payload.sub).toBe('123');
    });

    it('jwt_decode mauvais format → valid=false', async () => {
      const r = await apexToolsDispatch.execute('jwt_decode', { token: 'invalid' }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('uuid_generate count=5 retourne 5 UUIDs uniques', async () => {
      const r = await apexToolsDispatch.execute('uuid_generate', { count: 5 }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { uuids: string[]; total: number };
      expect(data.total).toBe(5);
      expect(new Set(data.uuids).size).toBe(5);
      for (const u of data.uuids) {
        expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
    });

    it('uuid_generate count=0 → cap min 1', async () => {
      const r = await apexToolsDispatch.execute('uuid_generate', { count: 0 }, 'client_free');
      const data = r.result as { total: number };
      expect(data.total).toBe(1);
    });

    it('uuid_generate count=999 → cap max 50', async () => {
      const r = await apexToolsDispatch.execute('uuid_generate', { count: 999 }, 'client_free');
      const data = r.result as { total: number };
      expect(data.total).toBe(50);
    });
  });

  /* ============ PRODUCTIVITY (5 tools) ============ */

  describe('Productivity', () => {
    it('summarize_text retourne 3 phrases par défaut', async () => {
      const longText = `Apex est un assistant IA. Il aide Kevin tous les jours. Apex automatise les tâches répétitives. ` +
        `Le système est rapide et fiable. Apex utilise Claude Sonnet 4.6. La sécurité est primordiale dans Apex. ` +
        `Kevin pousse Apex au maximum. Apex respecte les règles permanentes.`;
      const r = await apexToolsDispatch.execute('summarize_text', { text: longText, sentences: 3 }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { summary: string; total_sentences: number };
      expect(data.summary.length).toBeGreaterThan(10);
      expect(data.total_sentences).toBeGreaterThanOrEqual(7);
    });

    it('summarize_text vide → throw', async () => {
      const r = await apexToolsDispatch.execute('summarize_text', { text: '' }, 'client_free');
      expect(r.ok).toBe(false);
    });

    it('word_count retourne stats complètes', async () => {
      const text = 'Hello world.\n\nThis is a test paragraph.';
      const r = await apexToolsDispatch.execute('word_count', { text }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { words: number; sentences: number; paragraphs: number; reading_time_minutes: number };
      expect(data.words).toBe(7);
      expect(data.sentences).toBe(2);
      expect(data.paragraphs).toBe(2);
      expect(data.reading_time_minutes).toBeGreaterThanOrEqual(1);
    });

    it('word_count empty retourne zéros', async () => {
      const r = await apexToolsDispatch.execute('word_count', { text: '' }, 'client_free');
      const data = r.result as { words: number; chars: number };
      expect(data.words).toBe(0);
      expect(data.chars).toBe(0);
    });

    it('detect_language français', async () => {
      const r = await apexToolsDispatch.execute('detect_language', {
        text: 'Le chat est sur la table avec un livre dans la maison',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { detected: string; confidence: number };
      expect(data.detected).toBe('fr');
      expect(data.confidence).toBeGreaterThan(0);
    });

    it('detect_language anglais', async () => {
      const r = await apexToolsDispatch.execute('detect_language', {
        text: 'The cat is on the table with a book in the house',
      }, 'client_free');
      const data = r.result as { detected: string };
      expect(data.detected).toBe('en');
    });

    it('mind_map_generate avec branches', async () => {
      const r = await apexToolsDispatch.execute('mind_map_generate', {
        topic: 'Apex AI',
        branches: ['Tools', 'Memory', 'Audit'],
      }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { markdown: string; nodes: number };
      expect(data.nodes).toBe(4);
      expect(data.markdown).toContain('# Apex AI');
      expect(data.markdown).toContain('Tools');
    });

    it('create_task ajoute dans apex_v13_tasks', async () => {
      const r = await apexToolsDispatch.execute('create_task', {
        title: 'Audit Apex',
        priority: 'high',
        description: 'Run brutal audit',
      }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { ok: boolean; task_id: string; total: number };
      expect(data.ok).toBe(true);
      expect(data.task_id).toMatch(/^task_/);
      expect(data.total).toBeGreaterThanOrEqual(1);
      const tasks = JSON.parse(localStorage.getItem('apex_v13_tasks') ?? '[]') as Array<{ title: string }>;
      expect(tasks.some((t) => t.title === 'Audit Apex')).toBe(true);
    });

    it('create_task title vide → throw', async () => {
      const r = await apexToolsDispatch.execute('create_task', { title: '' }, 'family');
      expect(r.ok).toBe(false);
    });
  });

  /* ============ COMMUNICATIONS VALIDATORS (3 tools) ============ */

  describe('Communications validators', () => {
    it('email_validate format valide', async () => {
      const r = await apexToolsDispatch.execute('email_validate', { email: 'kevin@example.com' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; domain?: string };
      expect(data.valid).toBe(true);
      expect(data.domain).toBe('example.com');
    });

    it('email_validate format invalide', async () => {
      const r = await apexToolsDispatch.execute('email_validate', { email: 'not-email' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; reason?: string };
      expect(data.valid).toBe(false);
      expect(data.reason).toBeTruthy();
    });

    it('email_validate trop long', async () => {
      const longEmail = 'a'.repeat(250) + '@b.co';
      const r = await apexToolsDispatch.execute('email_validate', { email: longEmail }, 'client_free');
      const data = r.result as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('phone_validate FR 0612345678 → +33612345678', async () => {
      const r = await apexToolsDispatch.execute('phone_validate', { phone: '06 12 34 56 78', country: 'FR' }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; normalized?: string };
      expect(data.valid).toBe(true);
      expect(data.normalized).toBe('+33612345678');
    });

    it('phone_validate FR avec préfixe 33', async () => {
      const r = await apexToolsDispatch.execute('phone_validate', { phone: '+33 6 12 34 56 78', country: 'FR' }, 'client_free');
      const data = r.result as { valid: boolean; normalized?: string };
      expect(data.valid).toBe(true);
      expect(data.normalized).toBe('+33612345678');
    });

    it('phone_validate FR invalide', async () => {
      const r = await apexToolsDispatch.execute('phone_validate', { phone: '12', country: 'FR' }, 'client_free');
      const data = r.result as { valid: boolean };
      expect(data.valid).toBe(false);
    });

    it('phone_validate Monaco', async () => {
      const r = await apexToolsDispatch.execute('phone_validate', { phone: '99 99 12 34', country: 'MC' }, 'client_free');
      const data = r.result as { valid: boolean; normalized?: string };
      expect(data.valid).toBe(true);
      expect(data.normalized).toBe('+37799991234');
    });

    it('phone_validate generic country', async () => {
      const r = await apexToolsDispatch.execute('phone_validate', { phone: '+1 555 0100', country: 'US' }, 'client_free');
      const data = r.result as { valid: boolean };
      expect(data.valid).toBe(true);
    });

    it('whatsapp_link génère URL wa.me valide', async () => {
      const r = await apexToolsDispatch.execute('whatsapp_link', {
        phone: '+33 6 12 34 56 78',
        text: 'Hello Kevin',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { url: string; phone_clean: string };
      expect(data.url).toContain('wa.me/33612345678');
      expect(data.url).toContain('Hello%20Kevin');
      expect(data.phone_clean).toBe('33612345678');
    });

    it('whatsapp_link sans text', async () => {
      const r = await apexToolsDispatch.execute('whatsapp_link', { phone: '33612345678' }, 'client_free');
      const data = r.result as { url: string };
      expect(data.url).toBe('https://wa.me/33612345678');
    });

    it('whatsapp_link phone invalid → error', async () => {
      const r = await apexToolsDispatch.execute('whatsapp_link', { phone: 'abc' }, 'client_free');
      expect(r.ok).toBe(false);
    });
  });

  /* ============ FINANCE EXTRAS (3 tools) ============ */

  describe('Finance extras', () => {
    it('vat_validate_eu format FR valide', async () => {
      const r = await apexToolsDispatch.execute('vat_validate_eu', { vat: 'FR12345678901' }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { valid: boolean; country: string; format_ok: boolean };
      expect(data.valid).toBe(true);
      expect(data.country).toBe('FR');
      expect(data.format_ok).toBe(true);
    });

    it('vat_validate_eu pays non-EU', async () => {
      const r = await apexToolsDispatch.execute('vat_validate_eu', { vat: 'XX123' }, 'family');
      const data = r.result as { valid: boolean; format_ok: boolean };
      expect(data.valid).toBe(false);
      expect(data.format_ok).toBe(true);
    });

    it('vat_validate_eu format invalide', async () => {
      const r = await apexToolsDispatch.execute('vat_validate_eu', { vat: '!!!' }, 'family');
      const data = r.result as { format_ok: boolean };
      expect(data.format_ok).toBe(false);
    });

    it('compound_interest 1000@5%/10ans/12 → 1647', async () => {
      const r = await apexToolsDispatch.execute('compound_interest', {
        principal: 1000,
        rate: 5,
        years: 10,
        frequency: 12,
      }, 'family');
      expect(r.ok).toBe(true);
      const data = r.result as { final_value: number; total_interest: number; effective_rate: number };
      expect(data.final_value).toBeGreaterThan(1640);
      expect(data.final_value).toBeLessThan(1650);
      expect(data.total_interest).toBeGreaterThan(640);
      expect(data.effective_rate).toBeCloseTo(5.12, 1);
    });

    it('compound_interest principal négatif → throw', async () => {
      const r = await apexToolsDispatch.execute('compound_interest', { principal: -100, rate: 5, years: 10 }, 'family');
      expect(r.ok).toBe(false);
    });

    it('currency_convert même devise → identity rate', async () => {
      const r = await apexToolsDispatch.execute('currency_convert', {
        amount: 100,
        from: 'EUR',
        to: 'EUR',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { converted: number; provider: string };
      expect(data.converted).toBe(100);
      expect(data.provider).toBe('identity');
    });

    it('currency_convert codes invalides', async () => {
      const r = await apexToolsDispatch.execute('currency_convert', {
        amount: 50,
        from: 'XX',
        to: 'YYY',
      }, 'client_free');
      const data = r.result as { error?: string };
      expect(data.error).toBeTruthy();
    });

    it('currency_convert mock fetch retourne result', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 110, info: { rate: 1.10 } }), { status: 200 }),
      );
      const r = await apexToolsDispatch.execute('currency_convert', {
        amount: 100,
        from: 'EUR',
        to: 'USD',
      }, 'client_free');
      expect(r.ok).toBe(true);
      const data = r.result as { converted?: number; rate?: number; provider?: string };
      expect(data.converted).toBe(110);
      expect(data.rate).toBe(1.10);
      expect(data.provider).toBe('exchangerate.host');
    });

    it('currency_convert fetch fail → error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network'));
      const r = await apexToolsDispatch.execute('currency_convert', {
        amount: 100,
        from: 'EUR',
        to: 'USD',
      }, 'client_free');
      const data = r.result as { error?: string };
      expect(data.error).toBeTruthy();
    });

    it('currency_convert amount NaN → throw', async () => {
      const r = await apexToolsDispatch.execute('currency_convert', {
        amount: NaN,
        from: 'EUR',
        to: 'USD',
      }, 'client_free');
      expect(r.ok).toBe(false);
    });
  });

  /* ============ IMAGE UTILS (1 tool) ============ */

  describe('Image utils', () => {
    it('image_compress empty → throw', async () => {
      const r = await apexToolsDispatch.execute('image_compress', { image_base64: '' }, 'client_free');
      expect(r.ok).toBe(false);
    });

    it('image_compress non-browser env → ok=false avec error', async () => {
      /* happy-dom : Image() ne fire jamais onload pour base64 → on simule erreur via stub Image */
      const OriginalImage = globalThis.Image;
      class FakeImage {
        onload: (() => void) | null = null;
        onerror: ((e: Event) => void) | null = null;
        src = '';
        width = 0;
        height = 0;
        constructor() {
          /* Trigger error async pour court-circuiter Promise */
          queueMicrotask(() => {
            if (this.onerror) this.onerror(new Event('error'));
          });
        }
      }
      // @ts-expect-error -- override pour test
      globalThis.Image = FakeImage;
      try {
        const minimalPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
        const r = await apexToolsDispatch.execute('image_compress', {
          image_base64: minimalPng,
          quality: 0.5,
        }, 'client_free');
        expect(r.ok).toBe(true);
        const data = r.result as { ok: boolean; error?: string };
        expect(data.ok).toBe(false);
        expect(data.error).toBeTruthy();
      } finally {
        globalThis.Image = OriginalImage;
      }
    });
  });

  /* ============ SECURITY / PERMISSIONS ============ */

  describe('Permission tier checks new tools', () => {
    it('client_free peut json_validate', async () => {
      const r = await apexToolsDispatch.execute('json_validate', { json: '{}' }, 'client_free');
      expect(r.ok).toBe(true);
    });

    it('client_free peut email_validate', async () => {
      const r = await apexToolsDispatch.execute('email_validate', { email: 'a@b.co' }, 'client_free');
      expect(r.ok).toBe(true);
    });

    it('client_free RESTREINT sur jwt_decode (family minTier)', async () => {
      const r = await apexToolsDispatch.execute('jwt_decode', { token: 'a.b.c' }, 'client_free');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('insuffisant');
    });

    it('client_free RESTREINT sur create_task (family minTier)', async () => {
      const r = await apexToolsDispatch.execute('create_task', { title: 'X' }, 'client_free');
      expect(r.ok).toBe(false);
    });

    it('admin OK sur tous nouveaux tools', () => {
      const newToolsSample = ['json_validate', 'regex_test', 'compound_interest', 'mind_map_generate'];
      for (const name of newToolsSample) {
        const can = apexTools.canExecute(name, 'admin');
        expect(can.allowed).toBe(true);
      }
    });
  });

  /* ============ CATÉGORIES MAX & ANTHROPIC FORMAT ============ */

  describe('Catégories MAX coverage', () => {
    it('registry contient au moins 1 tool par catégorie clé', () => {
      /* Sampling : 1 tool par catégorie principale doit exister */
      const sample = [
        { cat: 'web', name: 'wikipedia_lookup' },
        { cat: 'files', name: 'json_validate' },
        { cat: 'code', name: 'regex_test' },
        { cat: 'productivity', name: 'summarize_text' },
        { cat: 'comms', name: 'email_validate' },
        { cat: 'finance', name: 'compound_interest' },
        { cat: 'image', name: 'image_compress' },
        { cat: 'voice', name: 'parler' },
        { cat: 'apex', name: 'audit_self' },
        { cat: 'cross-app', name: 'cmc_read' },
        { cat: 'devices', name: 'ma_position' },
        { cat: 'badges', name: 'scan_badge' },
      ];
      for (const { cat, name } of sample) {
        expect(apexTools.getByName(name), `Catégorie ${cat} doit avoir ${name}`).not.toBeNull();
      }
    });

    it('Anthropic format : tous tools ont input_schema bien formé', () => {
      const formatted = apexTools.toAnthropicFormat('admin') as Array<{ name: string; description: string; input_schema: { type: string; properties: object } }>;
      for (const t of formatted) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.input_schema.type).toBe('object');
        expect(t.input_schema.properties).toBeDefined();
      }
    });
  });
});
