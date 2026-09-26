/**
 * Test régression v13.4.78 — Kevin "Apex bloqué Accès réservé".
 *
 * BUG critique présent depuis v13.0 jamais détecté : auth.restoreSession()
 * n'était PAS appelé dans bootstrap.ts. Conséquence : au reload, store.user
 * restait null → store.isAdmin restait false → toutes les vues admin
 * affichaient "Accès réservé" même pour Kevin loggué la veille.
 *
 * Test simule scénario réel : Kevin a fait login session N, ferme l'app,
 * rouvre session N+1 → DOIT être reconnu admin SANS retaper PIN.
 *
 * Anti-régression #45 (RECIDIVE) + #28 (DECLARATION ≠ DEPLOYMENT).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { auth } from '../../services/auth/auth.js';
import { store } from '../../core/store.js';

describe('v13.4.78 auth.restoreSession — Kevin admin reconnu après reload', () => {
  beforeEach(() => {
    /* Reset état store + localStorage entre tests */
    store.set('user', null);
    store.set('isAdmin', false);
    localStorage.clear();
  });

  it("Sans session précédente (localStorage vide) → user reste null, isAdmin false", () => {
    auth.restoreSession();
    expect(store.get('user')).toBeNull();
    expect(store.get('isAdmin')).toBe(false);
  });

  it("Avec session Kevin admin valide → store.user restauré + isAdmin=true", () => {
    /* Simule état localStorage après login Kevin session précédente */
    const kevinUser = { id: 'kdmc_admin', name: 'Kevin (DK)', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(kevinUser));
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    auth.restoreSession();

    const u = store.get('user') as { id?: string } | null;
    expect(u).not.toBeNull();
    expect(u?.id).toBe('kdmc_admin');
    expect(store.get('isAdmin')).toBe(true);
  });

  it("Avec session Laurence (non-admin) → store.user restauré + isAdmin=false", () => {
    const laurence = { id: 'laurence_sp', name: 'Laurence Saint-Polit', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(laurence));
    localStorage.setItem('apex_v13_uid', 'laurence_sp');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    auth.restoreSession();

    const u = store.get('user') as { id?: string } | null;
    expect(u?.id).toBe('laurence_sp');
    expect(store.get('isAdmin')).toBe(false);
  });

  it("Session > 8h (TTL expiré) → logout forcé, user null", () => {
    const kevinUser = { id: 'kdmc_admin', name: 'Kevin', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(kevinUser));
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    /* lastact = il y a 9h */
    localStorage.setItem('apex_v13_lastact', String(Date.now() - 9 * 60 * 60 * 1000));

    auth.restoreSession();

    expect(store.get('user')).toBeNull();
    expect(store.get('isAdmin')).toBe(false);
  });

  it("user.id ≠ uid (anti cross-device pollution) → logout forcé", () => {
    /* Pollution Firebase : user.id='laurence_sp' mais uid local='kdmc_admin' */
    const polluted = { id: 'laurence_sp', name: 'Laurence', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(polluted));
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    auth.restoreSession();

    expect(store.get('user')).toBeNull();
    expect(store.get('isAdmin')).toBe(false);
  });

  it("JSON.parse fail (corruption) → no-throw, no-crash", () => {
    localStorage.setItem('apex_v13_user', '{corrupt json');
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    expect(() => auth.restoreSession()).not.toThrow();
  });

  it("auth.isAdminSync() retourne true APRÈS restoreSession Kevin", () => {
    const kevin = { id: 'kdmc_admin', name: 'Kevin', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(kevin));
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    auth.restoreSession();

    expect(auth.isAdminSync()).toBe(true);
  });

  it("auth.isAdminSync() retourne false sans restoreSession (cold state)", () => {
    /* Pas de restoreSession → user reste null → isAdmin doit être false */
    expect(auth.isAdminSync()).toBe(false);
  });
});

describe('v13.4.78 store.isAdmin — synchronisé avec user.id', () => {
  beforeEach(() => {
    store.set('user', null);
    store.set('isAdmin', false);
    localStorage.clear();
  });

  it("Après restoreSession Kevin → store.get('isAdmin') === true", () => {
    /* Critique pour features/admin/index.ts qui lit store.get('isAdmin') ligne 807 */
    const kevin = { id: 'kdmc_admin', name: 'Kevin', email: '' };
    localStorage.setItem('apex_v13_user', JSON.stringify(kevin));
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_lastact', String(Date.now()));

    auth.restoreSession();

    /* Anti-régression directe pour ligne 807 features/admin/index.ts */
    expect(store.get('isAdmin')).toBe(true);
  });
});
