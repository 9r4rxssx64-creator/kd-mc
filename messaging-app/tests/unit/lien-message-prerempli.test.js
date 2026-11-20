/**
 * Lien « message prérempli » (20.11.2026, parité Bee ⇄ Apex AI, javis-bee 2916) : ?to=<compte>&texte=<message> ouvre la conversation et met le texte
 * dans la zone de saisie, SANS jamais l'envoyer (messages chiffrés de bout en bout côté appareil : c'est Kevin qui relit et envoie).
 * Le test exécute le VRAI code de la page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
const lire = new Function(extractDef(html, 'function _lienDmDepuisAdresse(search){', '\n}\n') + '\nreturn _lienDmDepuisAdresse;')();

function monter({ token = 'jeton', pending = null, zone = true, start } = {}) {
  const storage = pending ? { apex_dm_pending: JSON.stringify(pending) } : {};
  const sess = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; }, removeItem: (k) => { delete storage[k]; } };
  const toasts = []; const envoyes = vi.fn();
  const z = zone ? { value: '', dispatchEvent: vi.fn(), focus: vi.fn() } : null;
  const doc = { getElementById: (id) => (id === 'msg-input' ? z : null) };
  const K = { token, _startConvWithUser: start || vi.fn(async () => {}), send: envoyes, sendMessage: envoyes };
  // eslint-disable-next-line no-new-func
  new Function('K', 'toast', '_safeCatch', 'sessionStorage', 'document', 'Event', extractDef(html, 'K._ouvrirDmPending = async function(){'))(
    K, (m) => toasts.push(m), () => {}, sess, doc, class { constructor(t) { this.type = t; } });
  return { K, z, toasts, storage, envoyes };
}

describe('lien « message prérempli »', () => {
  it('adresse valide → compte + texte', () => {
    expect(lire('?to=u_abc123&texte=Bonjour%20Marie')).toEqual({ to: 'u_abc123', texte: 'Bonjour Marie' });
  });
  it.each(['?to=u_abc123', '?texte=Salut', '?to=a&texte=x', '?to=u_ab%20c&texte=x', '?to=u_abc123&texte=%20%20', '?to=<script>&texte=x'])('refusé : %s', (s) => {
    expect(lire(s)).toBeNull();
  });
  it('texte coupé à 500 signes, caractères de contrôle retirés', () => {
    const r = lire('?to=u_abc123&texte=' + encodeURIComponent('a\u0007' + 'b'.repeat(600)));
    expect(r.texte.length).toBe(500); expect(r.texte).not.toMatch(/\u0007/);
  });
  it('ouvre la conversation, place le texte, ne l\'envoie PAS', async () => {
    const { K, z, envoyes, storage, toasts } = monter({ pending: { to: 'u_abc123', texte: 'Bonjour', at: Date.now() } });
    expect(await K._ouvrirDmPending()).toBe(true);
    expect(K._startConvWithUser).toHaveBeenCalledWith('u_abc123', '');
    expect(z.value).toBe('Bonjour'); expect(envoyes).not.toHaveBeenCalled();
    expect(storage.apex_dm_pending).toBeUndefined(); expect(toasts.join()).toMatch(/relis-le/);
  });
  it('pas encore connecté : on garde le lien pour l\'entrée', async () => {
    const { K, storage } = monter({ token: null, pending: { to: 'u_abc123', texte: 'Bonjour', at: Date.now() } });
    expect(await K._ouvrirDmPending()).toBe(false);
    expect(JSON.parse(storage.apex_dm_pending).to).toBe('u_abc123');
  });
  it('lien de plus d\'une heure : jeté, rien ne s\'ouvre', async () => {
    const { K, storage } = monter({ pending: { to: 'u_abc123', texte: 'Bonjour', at: Date.now() - 4000000 } });
    expect(await K._ouvrirDmPending()).toBe(false); expect(K._startConvWithUser).not.toHaveBeenCalled(); expect(storage.apex_dm_pending).toBeUndefined();
  });
  it('la page branche bien la lecture au chargement ET l\'ouverture à l\'entrée (2 chemins de connexion)', () => {
    expect(html).toMatch(/_lienDmDepuisAdresse\(location\.search\)/);
    expect((html.match(/K\._ouvrirDmPending && K\._ouvrirDmPending\(\)/g) || []).length).toBe(2);
  });
});
