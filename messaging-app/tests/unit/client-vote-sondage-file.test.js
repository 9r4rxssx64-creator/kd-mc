// Vote de sondage perdu quand la socket n'est pas ouverte (robot « toutes les fonctions », 05.11.2026, rouge intermittent
// « Sondage : A voit le vote de B » : chez B le vote est bien compté, mais A ne le reçoit jamais).
// Cause lue dans le code : K._votePoll n'envoyait le vote QUE si K.ws était ouverte à cet instant, et le jetait sinon, sans bruit,
// sans le renvoyer. Or K._openWs ferme l'ancienne socket et met K.ws à null le temps du ticket réseau. Le serveur (ConversationDO,
// poll_vote) enregistre et rejoue bien les votes qu'il reçoit : la perte se passait AVANT lui, dans l'app.
// La VRAIE page (index.html) : définitions extraites, jamais recopiées. SABOTAGE=1 retire la mise en file → doit être rouge.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

let HTML = readIndex();
if (process.env.SABOTAGE) HTML = HTML.replace('att[trame.poll_id] = { convId, trame };', '/* sabotage : le vote n\'est plus gardé */');

const DEFS = ['K._votePoll = function(msgId, optIdx){', 'K._envoyerVote = function(convId, trame){', 'K._flushVotesFor = function(convId){']
  .map((m) => extractDef(HTML, m)).join('\n');

function monde() {
  const stock = {};
  const K = { user: { id: 'u-b' }, viewData: { id: 'conv1' }, messages: {}, render: vi.fn(), ws: null, _wsConvId: null };
  K.messages.conv1 = [{ id: 'poll1', poll: { votes: {}, anon: false } }];
  const g = { K, ls: (k, v) => { stock[k] = JSON.parse(JSON.stringify(v)); return true; }, lg: (k, d) => (k in stock ? JSON.parse(JSON.stringify(stock[k])) : d), _safeCatch: vi.fn() };
  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(g), `${DEFS}`)(...Object.values(g));
  return { K, stock };
}
const socket = (etat = 1) => ({ readyState: etat, send: vi.fn() });

describe('vote de sondage : jamais perdu quand la socket n\'est pas ouverte', () => {
  let m;
  beforeEach(() => { m = monde(); });

  it('socket ouverte sur la bonne conversation : le vote part tout de suite, rien ne reste en file', () => {
    m.K.ws = socket(1); m.K._wsConvId = 'conv1';
    m.K._votePoll('poll1', 0);
    expect(m.K.ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.K.ws.send.mock.calls[0][0])).toEqual({ type: 'poll_vote', poll_id: 'poll1', votes: [0], voter: 'u-b' });
    expect(m.stock.votes_attente || {}).toEqual({});
  });

  it('socket absente (reconnexion en cours, K.ws = null) : le vote reste en file et PARTIT à l\'ouverture', () => {
    m.K.ws = null;
    m.K._votePoll('poll1', 1);
    expect(Object.keys(m.stock.votes_attente || {})).toEqual(['poll1']);
    // la socket de la conversation s'ouvre (événement « open » de K._openWs)
    m.K.ws = socket(1); m.K._wsConvId = 'conv1';
    expect(m.K._flushVotesFor('conv1')).toBe(1);
    expect(m.K.ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.K.ws.send.mock.calls[0][0])).toMatchObject({ type: 'poll_vote', poll_id: 'poll1', votes: [1], voter: 'u-b' });
    expect(m.stock.votes_attente).toEqual({});
  });

  it('socket en cours de connexion (readyState 0) : mis en file, pas envoyé dans le vide', () => {
    m.K.ws = socket(0); m.K._wsConvId = 'conv1';
    m.K._votePoll('poll1', 0);
    expect(m.K.ws.send).not.toHaveBeenCalled();
    expect(Object.keys(m.stock.votes_attente)).toEqual(['poll1']);
  });

  it('plusieurs changements d\'avis hors-ligne : UN seul vote part, le dernier', () => {
    m.K._votePoll('poll1', 0); m.K._votePoll('poll1', 1); m.K._votePoll('poll1', 0);
    m.K.ws = socket(1); m.K._wsConvId = 'conv1';
    expect(m.K._flushVotesFor('conv1')).toBe(1);
    expect(JSON.parse(m.K.ws.send.mock.calls[0][0]).votes).toEqual([0]);
  });

  it('socket ouverte mais sur une AUTRE conversation : le vote n\'est jamais envoyé à la mauvaise, il attend', () => {
    m.K.ws = socket(1); m.K._wsConvId = 'autre';
    m.K._votePoll('poll1', 0);
    expect(m.K.ws.send).not.toHaveBeenCalled();
    expect(Object.keys(m.stock.votes_attente)).toEqual(['poll1']);
    expect(m.K._flushVotesFor('conv1')).toBe(0);   // la socket d'une autre conversation ne vide rien
    expect(m.K.ws.send).not.toHaveBeenCalled();
  });

  it('l\'envoi lève une erreur : le vote reste en file (pas perdu)', () => {
    m.K.ws = socket(1); m.K._wsConvId = 'conv1';
    m.K.ws.send.mockImplementation(() => { throw new Error('socket fermée'); });
    m.K._votePoll('poll1', 0);
    expect(Object.keys(m.stock.votes_attente)).toEqual(['poll1']);
  });

  it('sondage anonyme : la trame ne porte JAMAIS l\'identité du votant, ni en direct ni après la file', () => {
    m.K.messages.conv1[0].poll.anon = true;
    m.K._votePoll('poll1', 0);
    m.K.ws = socket(1); m.K._wsConvId = 'conv1';
    m.K._flushVotesFor('conv1');
    const trame = JSON.parse(m.K.ws.send.mock.calls[0][0]);
    expect(trame.anon).toBe(true);
    expect(trame.voter).toBeUndefined();
  });

  it('la vraie page appelle le renvoi à l\'ouverture de la socket (juste après la boîte d\'envoi)', () => {
    const i = HTML.indexOf("try{ K._flushOutboxFor(convId); }catch(_e){_safeCatch('silent',_e)}");
    expect(i).toBeGreaterThan(0);
    expect(HTML.slice(i, i + 400)).toContain('K._flushVotesFor(convId)');
  });
});
