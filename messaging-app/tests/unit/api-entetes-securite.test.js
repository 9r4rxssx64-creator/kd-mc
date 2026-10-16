/**
 * Les réponses des workers portent des en-têtes de sécurité (audit Apex Chat 16.10.2026).
 * Un seul point les pose (applyCors) ; une route qui a déjà choisi sa valeur la garde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCors, durcirEntetes } from '../../workers/lib/cors.js';

const req = { headers: { get: () => null } };
const json = (h = {}) => new Response('{}', { headers: { 'Content-Type': 'application/json', ...h } });

describe('en-têtes de sécurité des workers', () => {
  it('pose nosniff, HSTS et no-store sur une réponse JSON', () => {
    const r = applyCors(req, json());
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('ne met pas no-store sur autre chose que du JSON (flux, pièces jointes)', () => {
    const r = applyCors(req, new Response('x', { headers: { 'Content-Type': 'text/event-stream' } }));
    expect(r.headers.get('Cache-Control')).toBeNull();
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('respecte la valeur déjà choisie par une route', () => {
    const r = applyCors(req, json({ 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' }));
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('laisse passer un upgrade WebSocket (101) sans le reconstruire', () => {
    const ws = { status: 101, headers: new Headers() };
    expect(applyCors(req, ws)).toBe(ws);
  });

  it('durcirEntetes fonctionne seul sur des en-têtes vides', () => {
    const h = new Headers();
    durcirEntetes(h);
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('Cache-Control')).toBeNull();
  });

  it('aucune clé d\'API ne voyage dans une adresse (elle finirait dans les journaux)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workers/api-worker.js'), 'utf8');
    expect(src).not.toMatch(/[?&]key=\$\{/);
  });

  it('une panne de base ne montre jamais son détail interne au client', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workers/api-worker.js'), 'utf8');
    expect(src).not.toMatch(/err\('DB error: ' \+ e\.message/);
  });
});
