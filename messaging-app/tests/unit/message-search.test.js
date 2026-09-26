import { describe, it, expect } from 'vitest';
import {
  normalizeForSearch,
  searchableText,
  findInMessages,
  nextMatchIndex,
} from '../../lib/message-search.js';

describe('normalizeForSearch', () => {
  it('minuscule + retire les accents', () => {
    expect(normalizeForSearch('ÉLÈVE Où Ça')).toBe('eleve ou ca');
  });
  it('gère null/undefined/nombre', () => {
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
    expect(normalizeForSearch(42)).toBe('42');
  });
});

describe('searchableText', () => {
  it('texte, transcription, légende, nom de fichier', () => {
    expect(searchableText({ text: 'Bonjour' })).toBe('Bonjour');
    expect(searchableText({ voice_text: 'audio dit' })).toBe('audio dit');
    expect(searchableText({ alt: 'une photo' })).toBe('une photo');
    expect(searchableText({ media_name: 'rapport.pdf' })).toBe('rapport.pdf');
    expect(searchableText({ text: 'a', voice_text: 'b', alt: 'c', media_name: 'd' })).toBe('a b c d');
  });
  it('ignore null, message supprimé', () => {
    expect(searchableText(null)).toBe('');
    expect(searchableText({ text: 'x', deleted: true })).toBe('');
  });
  it('ignore le ciphertext quand le détecteur le signale', () => {
    const looks = (t) => t.startsWith('E2E1:');
    expect(searchableText({ text: 'E2E1:zzz' }, looks)).toBe('');
    expect(searchableText({ text: 'clair' }, looks)).toBe('clair');
  });
});

describe('findInMessages', () => {
  const msgs = [
    { id: 'a', text: 'Rendez-vous au Café demain' },
    { id: 'b', text: 'Autre chose' },
    { id: 'c', voice_text: 'le CAFÉ était bon' },
    { id: 'd', text: 'supprimé', deleted: true },
  ];
  it('trouve insensible casse+accents, dans l’ordre', () => {
    const r = findInMessages(msgs, 'cafe');
    expect(r.ids).toEqual(['a', 'c']);
    expect(r.total).toBe(2);
    expect(r.query).toBe('cafe');
  });
  it('requête vide → aucun résultat', () => {
    expect(findInMessages(msgs, '   ').ids).toEqual([]);
    expect(findInMessages(msgs, '').total).toBe(0);
  });
  it('entrée non-tableau → vide', () => {
    expect(findInMessages(null, 'x').ids).toEqual([]);
  });
  it('passe le détecteur de ciphertext', () => {
    const looks = (t) => t.includes('CIPHER');
    const r = findInMessages([{ id: 'z', text: 'CIPHER-café' }], 'cafe', looks);
    expect(r.ids).toEqual([]);
  });
});

describe('exposition navigateur', () => {
  it('window.ApexSearch expose les helpers', () => {
    expect(window.ApexSearch).toBeTruthy();
    expect(window.ApexSearch.findInMessages).toBe(findInMessages);
    expect(window.ApexSearch.nextMatchIndex).toBe(nextMatchIndex);
  });
});

describe('nextMatchIndex', () => {
  it('aucun résultat → -1', () => {
    expect(nextMatchIndex(-1, 0, 1)).toBe(-1);
    expect(nextMatchIndex(2, -3, 1)).toBe(-1);
  });
  it('premier accès : suivant→0, précédent→dernier', () => {
    expect(nextMatchIndex(-1, 5, 1)).toBe(0);
    expect(nextMatchIndex(-1, 5, -1)).toBe(4);
  });
  it('boucle avant/arrière', () => {
    expect(nextMatchIndex(4, 5, 1)).toBe(0);
    expect(nextMatchIndex(0, 5, -1)).toBe(4);
    expect(nextMatchIndex(1, 5, 1)).toBe(2);
    expect(nextMatchIndex(3, 5, -1)).toBe(2);
  });
});
