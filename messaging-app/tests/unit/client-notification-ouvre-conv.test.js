/**
 * iPhone : toucher une notification, app FERMÉE, ouvre la bonne conversation
 * (audit 16.10.2026 : l'adresse '?call=' n'était lue par personne, et un message n'avait pas d'identifiant).
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';
import * as sw from '../../lib/sw-handlers.js';

function charger(K) {
  const src = extractDef(readIndex(), 'K._openFromUrl = function(params, tries){', '\n  };');
  // eslint-disable-next-line no-new-func
  new Function('K', '_safeCatch', 'history', 'location', src)(K, () => {}, { replaceState: vi.fn() }, { pathname: '/p' });
  return K._openFromUrl;
}
const P = (q) => new URLSearchParams(q);
const pret = () => ({ user: { id: 'u' }, token: 't', openConv: vi.fn() });

describe('ouverture depuis une notification (app fermée)', () => {
  it('?conv= ouvre cette conversation', () => {
    const K = pret(); expect(charger(K)(P('conv=abc_1'))).toBe(true);
    expect(K.openConv).toHaveBeenCalledWith('abc_1');
  });
  it('?call= ouvre la conversation ET prépare le décrochage automatique', () => {
    const K = pret(); expect(charger(K)(P('call=abc'))).toBe(true);
    expect(K._autoAnswerConv).toBe('abc');
  });
  it('refuse un identifiant douteux (jamais de code injecté)', () => {
    const K = pret(); expect(charger(K)(P("conv=x');alert(1)//"))).toBe(false);
    expect(K.openConv).not.toHaveBeenCalled();
  });
  it('sans paramètre ou sans session prête : rien n\'est ouvert tout de suite', () => {
    expect(charger(pret())(P(''))).toBe(false);
    const K = { user: null, token: null, openConv: vi.fn() };
    vi.useFakeTimers(); expect(charger(K)(P('conv=a'))).toBe(false); vi.useRealTimers();
    expect(K.openConv).not.toHaveBeenCalled();
  });
  it('le service worker construit l\'adresse ?conv= quand la notification n\'en porte pas', () => {
    const src = require_text();
    expect(src).toContain("'./?conv=' + encodeURIComponent(event.notification.data.convId)");
  });
  it('le démarrage appelle bien la lecture de l\'adresse', () => {
    expect(readIndex()).toContain('K._openFromUrl(params);');
    expect(typeof sw).toBe('object');
  });
});
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
function require_text() { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib/sw-handlers.js'), 'utf8'); }
