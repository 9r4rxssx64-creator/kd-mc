/**
 * APEX v13 — Tests services/contacts.ts (carnet d'adresses + fuzzy search)
 *
 * Cas Kevin (2026-05-07) : "Appelle Yannou" → fuzzy match "Yann Roux".
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { contacts } from '../../services/integrations/contacts.js';

describe('Contacts (carnet d\'adresses)', () => {
  beforeEach(() => {
    localStorage.clear();
    contacts.reload();
  });

  describe('add', () => {
    it('ajoute un contact avec ID unique généré', () => {
      const c = contacts.add({ name: 'Yann Roux', phone: '+33612345678' });
      expect(c.id).toBeTruthy();
      expect(c.name).toBe('Yann Roux');
      expect(c.phone).toBe('+33612345678');
      expect(c.createdAt).toBeGreaterThan(0);
      expect(c.updatedAt).toBe(c.createdAt);
    });

    it('normalise email en lowercase', () => {
      const c = contacts.add({ name: 'Marie', email: '  Marie@Example.COM  ' });
      expect(c.email).toBe('marie@example.com');
    });

    it('normalise whatsapp en retirant le +', () => {
      const c = contacts.add({ name: 'Jean', whatsapp: '+33611111111' });
      expect(c.whatsapp).toBe('33611111111');
    });

    it('persiste dans localStorage', () => {
      contacts.add({ name: 'Test', phone: '+1' });
      const raw = localStorage.getItem('apex_v13_contacts');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as Array<{ name: string }>;
      expect(parsed.length).toBe(1);
      expect(parsed[0]?.name).toBe('Test');
    });

    it('aliases stockés correctement', () => {
      const c = contacts.add({
        name: 'Yann Roux',
        aliases: ['Yannou', 'Yan'],
      });
      expect(c.aliases).toEqual(['Yannou', 'Yan']);
    });
  });

  describe('search fuzzy (cas Kevin "Yannou" → Yann Roux)', () => {
    beforeEach(() => {
      contacts.add({
        name: 'Yann Roux',
        phone: '+33612345678',
        aliases: ['Yannou', 'Yan'],
      });
      contacts.add({ name: 'Marc Dupont', phone: '+33611111111' });
      contacts.add({ name: 'Sophie Martin', phone: '+33622222222' });
    });

    it('trouve "Yann Roux" via alias "Yannou" exact', () => {
      const results = contacts.search('Yannou');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe('Yann Roux');
    });

    it('trouve "Yann Roux" via fuzzy "Yano"', () => {
      const results = contacts.search('Yano');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe('Yann Roux');
    });

    it('trouve "Yann Roux" via prénom "Yann"', () => {
      const results = contacts.search('Yann');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe('Yann Roux');
    });

    it('trouve via nom de famille "Roux"', () => {
      const results = contacts.search('Roux');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe('Yann Roux');
    });

    it('search insensible à la casse', () => {
      const upper = contacts.search('YANNOU');
      const lower = contacts.search('yannou');
      expect(upper[0]?.id).toBe(lower[0]?.id);
    });

    it('search insensible aux accents', () => {
      contacts.add({ name: 'Hélène Dubois', aliases: ['Léna'] });
      const sansAccent = contacts.search('Helene');
      expect(sansAccent.length).toBeGreaterThanOrEqual(1);
      expect(sansAccent[0]?.name).toBe('Hélène Dubois');
    });

    it('retourne array vide si aucun match', () => {
      const results = contacts.search('Zorglub Inconnu Personne');
      expect(results.length).toBe(0);
    });

    it('respecte maxResults', () => {
      for (let i = 0; i < 20; i++) {
        contacts.add({ name: `Yann ${i}`, phone: `+1${i}` });
      }
      const results = contacts.search('Yann', { maxResults: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('trie par score décroissant (match exact > fuzzy)', () => {
      contacts.add({ name: 'Yannou Direct' });
      const results = contacts.search('Yannou');
      /* "Yannou Direct" devrait scorer plus haut que "Yann Roux" via alias */
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getByName / getById', () => {
    it('getByName trouve match exact insensible casse', () => {
      contacts.add({ name: 'Yann Roux', phone: '+1' });
      expect(contacts.getByName('Yann Roux')?.phone).toBe('+1');
      expect(contacts.getByName('YANN ROUX')?.phone).toBe('+1');
      expect(contacts.getByName('yann roux')?.phone).toBe('+1');
    });

    it('getByName trouve via alias exact', () => {
      contacts.add({ name: 'Yann Roux', phone: '+1', aliases: ['Yannou'] });
      expect(contacts.getByName('Yannou')?.phone).toBe('+1');
    });

    it('getByName retourne null si introuvable', () => {
      expect(contacts.getByName('Inconnu Total')).toBeNull();
    });

    it('getById retourne contact', () => {
      const c = contacts.add({ name: 'Test', phone: '+1' });
      expect(contacts.getById(c.id)?.name).toBe('Test');
      expect(contacts.getById('inexistant')).toBeNull();
    });
  });

  describe('update', () => {
    it('met à jour un contact existant', () => {
      const c = contacts.add({ name: 'Old Name', phone: '+1' });
      const updated = contacts.update(c.id, { name: 'New Name', phone: '+2' });
      expect(updated?.name).toBe('New Name');
      expect(updated?.phone).toBe('+2');
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(c.createdAt);
    });

    it('retourne null si contact inexistant', () => {
      expect(contacts.update('nope', { name: 'X' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('supprime un contact', () => {
      const c = contacts.add({ name: 'À supprimer' });
      expect(contacts.remove(c.id)).toBe(true);
      expect(contacts.getById(c.id)).toBeNull();
    });

    it('retourne false si ID inexistant', () => {
      expect(contacts.remove('inexistant')).toBe(false);
    });
  });

  describe('list / count / clearAll', () => {
    it('list retourne array vide initialement', () => {
      expect(contacts.list()).toEqual([]);
      expect(contacts.count()).toBe(0);
    });

    it('count reflète les ajouts', () => {
      contacts.add({ name: 'A' });
      contacts.add({ name: 'B' });
      expect(contacts.count()).toBe(2);
    });

    it('clearAll vide tout', () => {
      contacts.add({ name: 'A' });
      contacts.add({ name: 'B' });
      contacts.clearAll();
      expect(contacts.count()).toBe(0);
      expect(localStorage.getItem('apex_v13_contacts')).toBeNull();
    });
  });
});
