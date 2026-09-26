/**
 * Régression v13.4.316 — Kevin 2026-06-08 « vérifie qu'Apex utilise bien ces
 * outils comme toi, clone ».
 *
 * Parité Apex AI ↔ Claude Code : Apex a `run_ios_e2e` (son équivalent Playwright
 * = apex-ios-simulator.yml, npx playwright test WebKit iPhone). Mais dispatchWorkflow
 * envoyait TOUJOURS event_type 'apex-execute' → le workflow Playwright iPhone
 * (qui écoute 'apex_e2e_request') ne se déclenchait JAMAIS (Erreur #28 : parité
 * "test visuel" déclarée mais morte). Fix : routage event_type par task.
 *
 * Câblé dans test:ci → la parité visuelle d'Apex ne doit plus jamais casser.
 */
import { describe, it, expect } from 'vitest';

import { eventTypeForTask } from '../../services/admin/apex-execute.js';

describe('v13.4.316 — parité Apex : routage event_type repository_dispatch', () => {
  it('run_ios_e2e → apex_e2e_request (déclenche le Playwright iPhone d’Apex)', () => {
    expect(eventTypeForTask('run_ios_e2e')).toBe('apex_e2e_request');
  });

  it('toutes les autres tasks → apex-execute (runner générique)', () => {
    expect(eventTypeForTask('modify_file')).toBe('apex-execute');
    expect(eventTypeForTask('run_test')).toBe('apex-execute');
    expect(eventTypeForTask('run_lint')).toBe('apex-execute');
    expect(eventTypeForTask('create_pr')).toBe('apex-execute');
    expect(eventTypeForTask('spawn_subagent')).toBe('apex-execute');
    expect(eventTypeForTask('audit_repo')).toBe('apex-execute');
  });
});
