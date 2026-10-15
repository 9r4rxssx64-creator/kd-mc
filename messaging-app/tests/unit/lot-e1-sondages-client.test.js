/**
 * Lot E1 (audit A5 F2, P0) — budget réseau du client.
 *
 * Le compte Cloudflare gratuit a 100 000 requêtes/jour pour TOUS les sites kd-mc (erreur 1027 vécue le 27.09).
 * Avant ce lot (constantes du code v1.1.305) : ~334 à 394 requêtes/h au premier plan et ~214/h dans un onglet
 * CACHÉ, par personne. Désormais tout sondage réseau périodique passe par l'ordonnanceur `_apexPoll`
 * (aucune minuterie onglet caché, intervalle allongé sans geste) et le budget est plafonné ici.
 *
 * Ces tests lisent la VRAIE page (index.html, ou CLIENT_INDEX_PATH) : retirer le correctif les fait échouer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';
import { handlePush } from '../../lib/sw-handlers.js';

const HTML = readIndex();
const HOUR = 3600000;
/** Plafond annoncé (audit A5 : cible < 40 req/h hors présence domaine ; présence domaine incluse, ≤ 100). */
const FOREGROUND_CEILING_PER_HOUR = 100;

/** Requêtes Worker par passage de chaque sondage (un nom inconnu = sondage non classé → échec). */
const REQUESTS_PER_RUN = {
  'sw-update': 1,          // GET sw.js (routeur kdmc-router)
  version: 1,              // HEAD de la page (routeur) ; la page entière seulement si elle a changé
  'force-update': 1,       // GET /api/admin/force-update-ts (API)
  heartbeat: 1,            // POST /api/users/heartbeat (API)
  conversations: 1,        // GET /api/conversations (API)
  premium: 1,              // GET /api/premium/status (API)
  'kdmc-presence': 1,      // GET /__sso/whoami (routeur)
  sentinelles: 0,          // local ; le ping /health est plafonné à part (SENTINEL_API_PER_HOUR)
};
const ADMIN_ONLY = new Set(['admin-map']);   // carte admin ouverte : hors budget d'une personne ordinaire

function makeDoc(hidden = false) {
  const l = {};
  return {
    hidden,
    addEventListener(t, fn) { (l[t] = l[t] || []).push(fn); },
    fire(t) { for (const fn of l[t] || []) fn({ type: t }); },
  };
}
function installScheduler(doc) {
  const src = extractDef(HTML, 'window._apexPollInstall = function(win, doc){');
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src + '\nwindow._apexPollInstall(window, arguments[1]);')(win, doc);
  return win;
}

afterEach(() => { vi.useRealTimers(); });

describe('Lot E1 — ordonnanceur _apexPoll (code réel de la page)', () => {
  it('onglet visible : un passage par intervalle', () => {
    vi.useFakeTimers();
    const doc = makeDoc(false);
    const win = installScheduler(doc);
    const fn = vi.fn();
    win._apexPoll('x', 3 * 60000, fn);   // pas de multiplicateur « sans geste » par défaut
    vi.advanceTimersByTime(HOUR);
    expect(fn).toHaveBeenCalledTimes(20);
    expect(fn).toHaveBeenCalledWith('interval');
  });

  it('onglet caché : ZÉRO passage et AUCUNE minuterie en attente pendant 1 h', () => {
    vi.useFakeTimers();
    const doc = makeDoc(true);
    const win = installScheduler(doc);
    const fn = vi.fn();
    win._apexPoll('a', 60000, fn);
    win._apexPoll('b', 3 * 60000, fn, { idle: 2 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(HOUR);
    expect(fn).not.toHaveBeenCalled();
  });

  it('caché en cours de route → arrêt net ; retour après longtemps → un passage aussitôt, puis reprise', () => {
    vi.useFakeTimers();
    const doc = makeDoc(false);
    const win = installScheduler(doc);
    const fn = vi.fn();
    win._apexPoll('a', 10 * 60000, fn);
    vi.advanceTimersByTime(10 * 60000);
    expect(fn).toHaveBeenCalledTimes(1);
    doc.hidden = true; doc.fire('visibilitychange');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5 * HOUR);
    expect(fn).toHaveBeenCalledTimes(1);
    doc.hidden = false; doc.fire('visibilitychange');
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(2);           // en retard → tout de suite
    vi.advanceTimersByTime(10 * 60000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retour rapide (sondage pas encore dû) : pas de passage en plus', () => {
    vi.useFakeTimers();
    const doc = makeDoc(false);
    const win = installScheduler(doc);
    const fn = vi.fn();
    win._apexPoll('a', 10 * 60000, fn);
    vi.advanceTimersByTime(60000);
    doc.hidden = true; doc.fire('visibilitychange');
    vi.advanceTimersByTime(60000);
    doc.hidden = false; doc.fire('visibilitychange');
    vi.advanceTimersByTime(7 * 60000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sans geste depuis 5 min : intervalle multiplié ; un geste revient au rythme normal', () => {
    vi.useFakeTimers();
    const doc = makeDoc(false);
    const win = installScheduler(doc);
    const fn = vi.fn();
    win._apexPoll('a', 5 * 60000, fn, { idle: 3 });
    vi.advanceTimersByTime(HOUR);
    // passages à 5 et 10 min (personne encore « active » jusqu'à 5 min), puis toutes les 15 min : 25, 40, 55
    expect(fn).toHaveBeenCalledTimes(5);
    doc.fire('keydown');                           // en retard au rythme normal → tout de suite, puis 5 min après
    vi.advanceTimersByTime(5 * 60000);
    expect(fn).toHaveBeenCalledTimes(7);
  });

  it('touch : un appel fait ailleurs repousse le prochain passage ; stop : plus rien ; erreurs avalées', async () => {
    vi.useFakeTimers();
    const doc = makeDoc(false);
    const win = installScheduler(doc);
    const fn = vi.fn(async () => { throw new Error('réseau'); });
    win._apexPoll('a', 60000, fn, { first: 1000 });
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50000);
    win._apexPollTouch('a');
    vi.advanceTimersByTime(50000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(2);
    win._apexPollTouch('inconnu');
    win._apexPollStop('a');
    win._apexPollStop('inconnu');
    vi.advanceTimersByTime(HOUR);
    expect(fn).toHaveBeenCalledTimes(2);
    win._apexPoll('s', 1000, () => { throw new Error('sync'); });
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});

/** Toutes les inscriptions `_apexPoll('nom', ms, …, { idle })` de la page, évaluées. */
function registrations() {
  const consts = { _VERSION_MIN_GAP_MS: Number(eval(HTML.match(/const _VERSION_MIN_GAP_MS = ([^;]+);/)[1])) }; // eslint-disable-line no-eval
  const out = [];
  const re = /_apexPoll\(\s*['"]([\w-]+)['"]\s*,\s*([^,]+?)\s*,([^\n]*)/g;
  let m;
  while ((m = re.exec(HTML))) {
    const expr = m[2].replace(/_VERSION_MIN_GAP_MS/g, String(consts._VERSION_MIN_GAP_MS));
    const ms = Number(eval(expr)); // eslint-disable-line no-eval
    const idle = (m[3].match(/idle\s*:\s*([\d.]+)/) || [])[1];
    out.push({ name: m[1], ms, idle: idle ? Number(idle) : 1 });
  }
  return out;
}

describe('Lot E1 — budget de requêtes calculé depuis les constantes du code', () => {
  const regs = registrations();
  const SENTINEL_API_PER_HOUR = HOUR / (Number(eval(HTML.match(/K\._lastApiPingTs \|\| 0\) >= ([^)]+)\)/)[1]))); // eslint-disable-line no-eval

  it('chaque sondage est classé (requêtes par passage connues)', () => {
    expect(regs.length).toBeGreaterThanOrEqual(8);
    for (const r of regs) {
      expect(ADMIN_ONLY.has(r.name) || Object.prototype.hasOwnProperty.call(REQUESTS_PER_RUN, r.name),
        `sondage « ${r.name} » non classé : ajoute-le à REQUESTS_PER_RUN avec son coût`).toBe(true);
      expect(Number.isFinite(r.ms) && r.ms >= 30000, `${r.name} : intervalle ${r.ms} ms`).toBe(true);
    }
  });

  it(`premier plan ≤ ${FOREGROUND_CEILING_PER_HOUR} req/h ; onglet caché = 0 (par construction de l'ordonnanceur)`, () => {
    let fg = 0; let idle = 0;
    const rows = [];
    for (const r of regs) {
      if (ADMIN_ONLY.has(r.name)) continue;
      const per = REQUESTS_PER_RUN[r.name];
      const a = (HOUR / r.ms) * per; const b = (HOUR / (r.ms * r.idle)) * per;
      fg += a; idle += b; rows.push([r.name, r.ms / 1000 + ' s', +a.toFixed(1), +b.toFixed(1)]);
    }
    fg += SENTINEL_API_PER_HOUR; idle += SENTINEL_API_PER_HOUR;
    rows.push(['sentinelles /health', '≥ 15 min', SENTINEL_API_PER_HOUR, SENTINEL_API_PER_HOUR]);
    // eslint-disable-next-line no-console
    console.log('[E1 budget] req/h (nom, intervalle, actif, sans geste) :', JSON.stringify(rows), 'total', fg.toFixed(1), idle.toFixed(1));
    expect(SENTINEL_API_PER_HOUR).toBeLessThanOrEqual(4);
    expect(fg).toBeLessThanOrEqual(FOREGROUND_CEILING_PER_HOUR);
    expect(idle).toBeLessThan(fg);
  });

  it('les déclencheurs hors minuterie sont bornés (version, mise à jour forcée, battement, liste)', () => {
    expect(registrations().find((r) => r.name === 'version').ms).toBeGreaterThanOrEqual(5 * 60000);
    // un contrôle de version au plus toutes les 5 min, quel que soit le déclencheur (sauf le tout premier)
    expect(HTML).toMatch(/if\(Date\.now\(\) - _lastVersionCheckTs < \(reason === 'boot' \? 8000 : _VERSION_MIN_GAP_MS\)\) return;/);
    expect(HTML).toMatch(/if\(Date\.now\(\) - _forceCheckTs < 5 \* 60000\) return;/);
    expect(HTML).toMatch(/const beatSoon = \(\) => \{ if\(!document\.hidden && Date\.now\(\) - \(K\._lastBeatTs \|\| 0\) > 60000\) K\._sendHeartbeat\(\); \};/);
    // la liste ne relance plus de contrôle de version à chaque rafraîchissement
    const refresh = extractDef(HTML, 'K._refreshConvs = async function(){');
    expect(refresh).not.toMatch(/_checkRemoteVersion/);
    expect(refresh).toMatch(/_apexPollTouch\('conversations'\)/);
  });
});

/** Texte de l'appel `setInterval( … )` (parenthèses équilibrées) — le corps de la minuterie. */
function intervalCall(text) {
  const start = text.indexOf('setInterval(');
  let depth = 0;
  for (let j = start + 'setInterval'.length; j < text.length; j++) {
    if (text[j] === '(') depth++;
    else if (text[j] === ')' && --depth === 0) return text.slice(start, j + 1);
  }
  return text.slice(start);
}

describe('Lot E1 — garde : aucune nouvelle minuterie périodique hors ordonnanceur', () => {
  // Minuterie LOCALE (aucune requête) ou essentielle, annotée « E1:locale <nom> » sur sa ligne.
  const INVENTAIRE = ['premium-lien', 'rappels', 'badge-non-lus', 'messages-programmes', 'compte-a-rebours-ia',
    'compte-a-rebours-otp', 'ping-ws', 'stats-appel', 'stats-appel', 'messages-ephemeres'];

  it('chaque setInterval de la page est annoté et inventorié (sinon : passer par _apexPoll)', () => {
    const lines = HTML.split('\n');
    const found = [];
    lines.forEach((l, i) => {
      if (!/setInterval\(/.test(l)) return;
      const m = l.match(/E1:locale ([\w-]+)/);
      expect(m, `index.html:${i + 1} — setInterval sans test de visibilité ni annotation : utilise window._apexPoll`).toBeTruthy();
      found.push(m[1]);
      // une minuterie dite « locale » n'appelle pas le réseau dans son corps
      const body = intervalCall(lines.slice(i, i + 40).join('\n'));
      expect(body, `index.html:${i + 1} (${m[1]}) appelle le réseau`).not.toMatch(/fetch\(|K\._api\(|sendBeacon/);
    });
    expect(found.sort()).toEqual([...INVENTAIRE].sort());
  });

  it('le ping WebSocket reste la trame exacte auto-répondue par le Durable Object', () => {
    expect(HTML).toMatch(/K\.ws\.send\(JSON\.stringify\(\{ type: 'ping' \}\)\);/);
  });
});

describe('Lot E1 — un message reçu par push relance la liste (app visible)', () => {
  it('service worker : message → « push-received » au client visible ; appel → « open-conv » (inchangé)', async () => {
    const registration = { showNotification: vi.fn(async () => {}) };
    const visible = { focused: false, visibilityState: 'visible', postMessage: vi.fn() };
    const hidden = { focused: false, visibilityState: 'hidden', postMessage: vi.fn() };
    const clients = { matchAll: vi.fn(async () => [hidden, visible]) };
    await handlePush({ data: { json: () => ({ title: 'A', body: 'b', payload: { type: 'message', convId: 'c1' } }) } }, { registration, clients });
    expect(visible.postMessage).toHaveBeenCalledWith({ type: 'push-received', convId: 'c1' });
    expect(hidden.postMessage).not.toHaveBeenCalled();
    await handlePush({ data: { json: () => ({ title: 'A', body: 'b', payload: { type: 'call', convId: 'c2' } }) } }, { registration, clients });
    expect(visible.postMessage).toHaveBeenLastCalledWith({ type: 'open-conv', convId: 'c2' });
  });

  it('la page relance la liste (au plus 1 fois / 5 s), jamais onglet caché', () => {
    expect(HTML).toMatch(/if\(e\.data\?\.type === 'push-received'\)\{\s*\n\s*if\(typeof K !== 'undefined' && K\._refreshConvsSoon\) K\._refreshConvsSoon\(5000\);/);
    expect(HTML).toMatch(/K\._refreshConvsSoon = function\(minGapMs\)\{\s*\n\s*if\(document\.hidden \|\|/);
  });
});
