// @vitest-environment jsdom
/* eslint-disable no-script-url -- Test fixtures intentionnels (vérifient sanitization XSS) */
/* v13.4.324 : ce fichier tourne sous jsdom (pas happy-dom global). DOMPurify 3.x
 * + happy-dom a un bug d'incompatibilité connu qui SUPPRIME tous les <a> (même
 * sans href) → faux échecs sur la préservation de href. jsdom est l'environnement
 * de référence de DOMPurify → comportement réel (href https préservé, javascript:
 * et iframe strippés). Aucun changement du sanitizer, aucun affaiblissement XSS. */

/**
 * Test régression v13.4.32 — core/html-safe.ts sanitizeHtml() async (DOMPurify lazy).
 *
 * Complète v13.4.17 qui testait escapeHtml + sanitizeUrl + safeSetHTML sync.
 * sanitizeHtml() async charge DOMPurify lazy → mieux pour HTML produit (markdown,
 * réponses IA HTML) que stripDangerousHtml sync.
 *
 * Si DOMPurify pas dispo dans test env → graceful fallback (catch interne).
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../core/html-safe.js';

describe('v13.4.32 sanitizeHtml async — DOMPurify lazy load', () => {
  it("retourne string (pas undefined/null)", async () => {
    const r = await sanitizeHtml('<p>hello</p>');
    expect(typeof r).toBe('string');
  });

  it("strip <script> tags (anti-XSS)", async () => {
    const evil = 'before <script>alert(1)</script> after';
    const r = await sanitizeHtml(evil);
    expect(r).not.toContain('<script');
    expect(r).not.toContain('alert(1)');
  });

  it("strip event handlers (onerror, onclick)", async () => {
    const evil = '<img src="x" onerror="alert(1)" onclick="evil()">';
    const r = await sanitizeHtml(evil);
    expect(r).not.toContain('onerror');
    expect(r).not.toContain('onclick');
  });

  it("preserve markdown HTML safe (p, strong, em, ul, li, a)", async () => {
    const safe = '<p><strong>Kevin</strong> <em>ok</em></p><ul><li>item</li></ul>';
    const r = await sanitizeHtml(safe);
    expect(r).toContain('<p>');
    expect(r).toContain('<strong>');
    expect(r).toContain('Kevin');
  });

  it("strip <iframe> (anti-clickjacking)", async () => {
    const r = await sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(r).not.toContain('<iframe');
  });

  it("strip javascript: dans href", async () => {
    const r = await sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(r).not.toContain('javascript:');
  });

  it("preserve href https valide", async () => {
    const r = await sanitizeHtml('<a href="https://anthropic.com">link</a>');
    expect(r).toContain('href');
    expect(r).toContain('anthropic.com');
  });

  it("empty string → empty (no crash)", async () => {
    const r = await sanitizeHtml('');
    expect(r).toBe('');
  });

  it("texte sans HTML → préservé tel quel", async () => {
    const r = await sanitizeHtml('bonjour kevin');
    expect(r).toContain('bonjour kevin');
  });

  it("HTML imbriqué profond → traité sans crash", async () => {
    const deep = '<div><div><div><p><span>nested</span></p></div></div></div>';
    const r = await sanitizeHtml(deep);
    expect(r).toContain('nested');
  });

  it("XSS via SVG onload → strip", async () => {
    const r = await sanitizeHtml('<svg onload="alert(1)"><circle /></svg>');
    expect(r).not.toContain('onload');
    expect(r).not.toContain('alert(1)');
  });

  it("multiple appels concurrent → tous résolvent (DOMPurify mis en cache)", async () => {
    const results = await Promise.all([
      sanitizeHtml('<p>1</p>'),
      sanitizeHtml('<p>2</p>'),
      sanitizeHtml('<p>3</p>'),
      sanitizeHtml('<p>4</p>'),
      sanitizeHtml('<p>5</p>'),
    ]);
    expect(results.every((r) => typeof r === 'string')).toBe(true);
    expect(results.length).toBe(5);
  });

  it("résultat est toujours string (pas null/undefined même si tout strippé)", async () => {
    /* DOMPurify peut strip <img> selon config restrictive — c'est OK,
     * le test vérifie juste qu'on a string déterministe. */
    const r = await sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo" alt="test">');
    expect(typeof r).toBe('string');
  });
});
