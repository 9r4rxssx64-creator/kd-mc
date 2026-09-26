/**
 * DIAG 2026-07-04 (Kevin bannière « Toutes les IA KO » + badge openai malgré v338) :
 * le proxy répond 200 à un body app-like avec 1 tool factice (mesuré CI) — la seule
 * différence restante avec le chat réel = les ~105 tools réels injectés (anthropic-only).
 * UN SEUL tool au nom/schéma invalide → HTTP 400 Anthropic sur TOUTES les requêtes
 * chat → anthropic marqué DEAD → openai répond. Ce test valide CHAQUE tool contre
 * les contraintes de l'API Anthropic et IMPRIME les fautifs (cause exacte, leçon #97).
 */
import { describe, expect, it } from 'vitest';

import { apexTools } from '../../services/core-svc/apex-tools.js';

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

describe('diag — tools Anthropic valides (cause « toujours openai » ?)', () => {
  it('chaque tool admin respecte les contraintes API Anthropic', () => {
    const tools = apexTools.toAnthropicFormat('admin') as Array<{
      name?: unknown;
      description?: unknown;
      input_schema?: { type?: unknown } | undefined;
    }>;
    expect(tools.length).toBeGreaterThan(0);

    const bad: string[] = [];
    const seen = new Set<string>();
    for (const t of tools) {
      const name = typeof t.name === 'string' ? t.name : `<name invalide: ${JSON.stringify(t.name)}>`;
      if (typeof t.name !== 'string' || !NAME_RE.test(t.name)) {
        bad.push(`NOM invalide (regex ^[a-zA-Z0-9_-]{1,64}$) : "${name}"`);
      }
      if (seen.has(name)) bad.push(`NOM dupliqué : "${name}"`);
      seen.add(name);
      if (typeof t.description !== 'string' || t.description.length === 0) {
        bad.push(`DESCRIPTION manquante : "${name}"`);
      }
      const schema = t.input_schema;
      if (!schema || schema.type !== 'object') {
        bad.push(`input_schema.type !== 'object' : "${name}" (type=${String(schema?.type)})`);
      }
      /* JSON-sérialisable (une valeur undefined/function casserait le body) */
      try {
        JSON.stringify(t);
      } catch (e) {
        bad.push(`NON sérialisable JSON : "${name}" (${(e as Error).message})`);
      }
    }

     
    console.log(`[diag] ${tools.length} tools admin — fautifs: ${bad.length}`);
     
    if (bad.length > 0) console.log('[diag] FAUTIFS:\n' + bad.join('\n'));
    expect(bad).toEqual([]);
  });

  it('le body anthropic complet (105 tools) reste < 900 Ko (limite requête)', () => {
    const tools = apexTools.toAnthropicFormat('admin');
    const size = JSON.stringify(tools).length;
     
    console.log(`[diag] taille JSON tools admin: ${size} octets (${Math.round(size / 1024)} Ko)`);
    expect(size).toBeLessThan(900_000);
  });
});
