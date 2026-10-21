/**
 * Capture de Kevin (21.10.2026) : 3 comptes « Parcours Robot… » de nos tests, EFFACÉS en base, restaient dans ses contacts (« vus il y a 3 j »). La liste fusionne avec le cache local et ne retire
 * un contact que si le serveur le renvoie « supprimé » — un compte effacé pour de bon n'est plus renvoyé du tout. Le test exécute le VRAI code de la page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
async function lister({ admin = true, cache, serveur, statut = 200 }) {
  const ls = vi.fn();
  const K = { user: { id: 'kdmc_kdmc_admin', is_admin: admin }, token: 'jeton', contacts: cache, conversations: [], view: 'chats', render() {}, _humanError: (e) => String(e), _lastContactsDiag: null };
  // eslint-disable-next-line no-new-func
  new Function('K', 'lg', 'ls', 'toast', '_safeCatch', 'fetch', 'API_BASE', 'AbortController', extractDef(html, 'K._dedupeContacts = function(list){') + '\n' + extractDef(html, 'K._fetchContacts = async function(silent){'))(
    K, (k, d) => d, ls, () => {}, () => {}, async () => ({ ok: statut === 200, status: statut, json: async () => ({ users: serveur }) }), 'https://api', AbortController);
  await K._fetchContacts(true);
  return { ids: K.contacts.map((c) => c.id).sort(), ls };
}
const c = (id, extra = {}) => ({ id, real_name: id, pseudo: id, ...extra });

describe('contacts fantômes (comptes effacés en base)', () => {
  it('admin : un compte du domaine absent de la liste du serveur disparaît du cache', async () => {
    const r = await lister({ cache: [c('kdmc_parcours-robotiiwkud'), c('kdmc_remy-ledren'), c('kdmc_parcours-robotdsmwfl')], serveur: [c('kdmc_remy-ledren'), c('kdmc_admin')] });
    expect(r.ids).toEqual(['kdmc_admin', 'kdmc_remy-ledren']);
  });
  it('admin : un contact LOCAL (numéro, ajouté à la main) reste', async () => {
    const r = await lister({ cache: [c('local_+33600000000'), c('x', { _local_only: true }), c('kdmc_fantome')], serveur: [c('kdmc_remy-ledren')] });
    expect(r.ids).toEqual(['kdmc_remy-ledren', 'local_+33600000000', 'x']);
  });
  it('liste du serveur vide (panne) : on ne vide JAMAIS le cache', async () => {
    const r = await lister({ cache: [c('kdmc_remy-ledren'), c('kdmc_laurence')], serveur: [] });
    expect(r.ids).toEqual(['kdmc_laurence', 'kdmc_remy-ledren']);
  });
  it('non-admin : la liste du serveur n\'est PAS complète (seulement ses interlocuteurs) → rien n\'est retiré', async () => {
    const r = await lister({ admin: false, cache: [c('kdmc_remy-ledren'), c('kdmc_ancien-pair')], serveur: [c('kdmc_remy-ledren')] });
    expect(r.ids).toEqual(['kdmc_ancien-pair', 'kdmc_remy-ledren']);
  });
  it('le serveur dit toujours « supprimé » : retiré comme avant', async () => {
    const r = await lister({ cache: [c('u1'), c('u2')], serveur: [c('u1', { status: 'deleted' }), c('u2')] });
    expect(r.ids).toEqual(['u2']);
  });
});
