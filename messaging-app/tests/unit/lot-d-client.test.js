// Lot D (finitions de l'ultra-audit, 15.10.2026) — côté APP : la VRAIE page (index.html), définitions
// extraites, jamais recopiées. Chaque bloc échoue si le correctif est retiré (sabotage via CLIENT_INDEX_PATH).
//  Item 1  position OBLIGATOIRE (décision de Kevin) : refusée sur l'iPhone → bandeau permanent, non bloquant,
//          « Comment faire » (44 px) qui explique Réglages → Safari → Position. Jamais d'écran bloquant.
//  Item 2  clavier iPhone : la page suit la fenêtre visible (visualViewport) ; les derniers messages restent en bas.
//  Item 3  iPhone dans Safari : le guide « écran d'accueil » AVANT le SMS (passable, mémorisé).
//  Item 5  médias : le jeton de session ne va JAMAIS dans une adresse ; sans ticket → « ⏳ Chargement… » puis le média.
//  Item 6  PIN : sel aléatoire propre à chaque personne, gardé avec le hash ; anciens hash migrés au déverrouillage.
//  Item 7  sourdine temporaire envoyée au serveur (bout en bout dans lot-d-serveur.test.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readIndex, extractDef, loadDefs, realEsc } from './client-extract.js';

const HTML = readIndex();
const def = (m, end) => extractDef(HTML, end ? { m, end } : m);
const FN_END = '\n}\n';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────────────────────────────────────────────────────── Item 1
describe('Item 1 — position obligatoire : bandeau permanent si l\'iPhone la refuse, jamais de blocage', () => {
  let K;
  function setup(user = { id: 'u1' }) {
    document.body.innerHTML = '<header id="topbar"></header><main id="app"><p id="contenu">Chats</p></main><div id="modal-host"></div>';
    K = { user, _startGeoWatch: vi.fn() };
    K._showModal = (t, h) => { document.getElementById('modal-host').innerHTML = '<div class="modal"><h2>' + t + '</h2>' + h + '</div>'; };
    K._closeModal = () => { document.getElementById('modal-host').innerHTML = ''; };
    loadDefs(['K._onGeoState = function(state){', 'K._renderGeoBanner = function(){', 'K._geoHelp = function(){', 'K._geoRecheck = function(){'],
      { K, toast: vi.fn() });
    globalThis.K = K;   // le bouton du bandeau appelle K._geoHelp() comme dans la page
    return K;
  }
  afterEach(() => { delete globalThis.K; });

  it('refusée → bandeau dans la page (avant le contenu, ne le recouvre pas), texte simple, bouton « Comment faire »', () => {
    setup();
    K._onGeoState('denied');
    const b = document.getElementById('geo-banner');
    expect(b).not.toBeNull();
    expect(b.nextElementSibling.id).toBe('app');           // dans le flux, pas par-dessus l'app
    expect(b.textContent).toMatch(/Position coupée/);
    expect(b.textContent).toMatch(/obligatoire/);
    const btn = b.querySelector('button');
    expect(btn.textContent).toBe('Comment faire');
    // Pas de blocage : aucune fenêtre ouverte, l'app reste là et utilisable.
    expect(document.getElementById('modal-host').innerHTML).toBe('');
    expect(document.getElementById('contenu')).not.toBeNull();
    K._onGeoState('denied');
    expect(document.querySelectorAll('#geo-banner').length).toBe(1);   // jamais en double
  });

  it('« Comment faire » explique Réglages → Safari → Position, avec un bouton pour revérifier', () => {
    setup();
    K._onGeoState('denied');
    const btn = document.querySelector('#geo-banner button');
    expect(btn.getAttribute('onclick')).toBe('K._geoHelp()');
    K._geoHelp();
    const t = document.getElementById('modal-host').textContent;
    expect(t).toMatch(/Réglages/);
    expect(t).toMatch(/Safari/);
    expect(t).toMatch(/Position/);
    expect(t).toMatch(/J'ai remis la position/);
  });

  it('autorisée (au démarrage ou après « J\'ai remis la position ») → bandeau retiré, suivi de position relancé', async () => {
    setup();
    K._onGeoState('denied');
    const geo = { getCurrentPosition: (ok) => ok({ coords: {} }) };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    K._geoRecheck();
    expect(document.getElementById('geo-banner')).toBeNull();
    expect(K._startGeoWatch).toHaveBeenCalled();
    // toujours refusée → le bandeau reste
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok, ko) => ko({ code: 1 }) }, configurable: true });
    K._geoRecheck();
    expect(document.getElementById('geo-banner')).not.toBeNull();
  });

  it('pas connecté → pas de bandeau ; « demander » (prompt) → pas de bandeau', () => {
    setup(null);
    K._onGeoState('denied');
    expect(document.getElementById('geo-banner')).toBeNull();
    setup();
    K._onGeoState('prompt');
    expect(document.getElementById('geo-banner')).toBeNull();
  });

  it('branché sur les vrais signaux : état de l\'autorisation (et ses changements), refus du suivi, écrans d\'autorisation', () => {
    expect(HTML).toMatch(/navigator\.permissions\.query\(\{ name: 'geolocation' \}\)\.then\(st => \{ K\._onGeoState\(st\.state\); st\.onchange = \(\) => \{ K\._onGeoState\(st\.state\); \}; \}\)/);
    expect(HTML).toMatch(/err => \{ if\(err && err\.code === 1\) K\._onGeoState\('denied'\);/);
    expect(HTML).toMatch(/if\(K\._renderGeoBanner\) K\._renderGeoBanner\(\);/);
    expect(HTML).toMatch(/\(e\) => \{ refused\+\+; try\{ if\(e && e\.code === 1\) K\._onGeoState\('denied'\)/);
  });

  it('style : bouton ≥ 44 px, texte ≥ 14 px', () => {
    expect(HTML).toMatch(/#geo-banner\{[^}]*font-size:14px/);
    expect(HTML).toMatch(/#geo-banner button\{[^}]*min-height:44px/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── Item 2
describe('Item 2 — clavier iPhone : la page suit la fenêtre visible, les derniers messages restent visibles', () => {
  let vv, K;
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = '<div id="chat-msgs"></div>';
    vv = { height: 844, offsetTop: 0, addEventListener() {} };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    K = { view: 'chat' };
    loadDefs(['K._syncViewportClass = function(){', 'K._applyViewport = function(){'], { K });
  });
  const box = (sh, ch, top) => {
    const b = document.getElementById('chat-msgs');
    Object.defineProperty(b, 'scrollHeight', { value: sh, configurable: true });
    Object.defineProperty(b, 'clientHeight', { value: ch, configurable: true });
    b.scrollTop = top;
    return b;
  };

  it('clavier ouvert (fenêtre visible 844 → 508 px) : hauteur de page = 508 px, classe kb-open, collé en bas', () => {
    const b = box(3000, 400, 0);
    K._chatBottomGap = 0;                 // la personne était en bas avant le clavier
    vv.height = 508;
    expect(K._applyViewport()).toEqual({ h: 508, kb: true });
    expect(document.documentElement.style.getPropertyValue('--ax-vvh')).toBe('508px');
    expect(document.documentElement.classList.contains('kb-open')).toBe(true);
    expect(document.documentElement.classList.contains('chat-view')).toBe(true);
    expect(b.scrollTop).toBe(3000);
  });

  it('la personne lisait plus haut : on garde la même lecture (même distance au bas), pas de saut', () => {
    const b = box(3000, 300, 0);
    K._chatBottomGap = 900;
    vv.height = 500;
    K._applyViewport();
    expect(b.scrollTop).toBe(3000 - 300 - 900);
  });

  it('clavier fermé → kb-open retiré ; hors conversation → pas de mode conversation', () => {
    vv.height = 500; K._applyViewport();
    vv.height = 844; K._applyViewport();
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
    K.view = 'chats'; K._syncViewportClass();
    expect(document.documentElement.classList.contains('chat-view')).toBe(false);
  });

  it('CSS : page = fenêtre visible en conversation, pas de barre du bas, saisie sans marge de 70 px, fenêtres ≤ 85 % du visible', () => {
    expect(HTML).toMatch(/html\.chat-view body\{height:var\(--ax-vvh, 100dvh\)/);
    expect(HTML).toMatch(/html\.chat-view #bnav\{display:none!important\}/);
    expect(HTML).toMatch(/html\.chat-view #app\.chat-mode \.chat-input\{padding-bottom:calc\(var\(--ax-safe-bottom\) \+ 8px\)\}/);
    expect(HTML).toMatch(/max-height:calc\(var\(--ax-vvh, 100dvh\) \* \.85\)/);
    expect(HTML).toMatch(/vv\.addEventListener\('resize', K\._applyViewport\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── Item 3
describe('Item 3 — iPhone dans Safari : guide d\'installation AVANT le SMS', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  function ecran({ ua = IPHONE, standalone = false, skipped = false } = {}) {
    document.body.innerHTML = '<div id="auth-step"></div>';
    localStorage.clear();
    if (skipped) localStorage.setItem('apex_chat_install_skip', '1');
    const $ = (s) => document.querySelector(s);
    const K = { authStep: 'phone', authData: {}, CGU_VERSION: 'x', _cguAccepted: () => false };
    const nav = { userAgent: ua, standalone };
    const win = { matchMedia: () => ({ matches: standalone }) };
    const g = { K, $, toast() {}, _safeCatch() {}, _kdmcPrefillName: vi.fn(), isKevinAdmin: () => false, API_BASE: 'https://api',
      __APEX_CHAT_VERSION__: 'v-test', navigator: nav, window: win, esc: realEsc() };
    const src = ['K._isIosSafariTab = function(){', 'K._installFirstNeeded = function(){', 'K._skipInstallFirst = function(){',
      'K._installFirstHtml = function(){', 'K._authPhoneMissing = function(){', 'K._authFail = function(msg, type, dur){',
      'K._handleAuthPhone = async function(){'].map((m) => def(m)).join('\n') + '\n' + def('function renderAuthStep(){', FN_END);
    // eslint-disable-next-line no-new-func
    const run = new Function(...Object.keys(g), src + '\nreturn renderAuthStep;')(...Object.values(g));
    window.renderAuthStep = run;   // le bouton « Continuer » rappelle renderAuthStep
    globalThis.K = K;
    run();
    return { K, g, $ };
  }
  afterEach(() => { delete globalThis.K; delete window.renderAuthStep; });

  it('iPhone + Safari : le guide (3 gestes) s\'affiche, PAS le champ du numéro ni le bouton SMS', () => {
    const { $ } = ecran();
    expect($('#install-first')).not.toBeNull();
    expect($('#auth-phone')).toBeNull();
    expect($('#btn-auth-phone')).toBeNull();
    const t = $('#install-first').textContent;
    expect(t).toMatch(/Partager/);
    expect(t).toMatch(/Sur l'écran d'accueil/);
    expect(t).toMatch(/qu'une seule fois/);
    expect($('#install-first ol').children.length).toBe(3);
  });

  it('« Continuer dans Safari quand même » (bouton ≥ 44 px) → le numéro s\'affiche, et le choix est mémorisé', () => {
    const { $ } = ecran();
    const skip = $('#btn-install-skip');
    expect(skip.getAttribute('style')).toMatch(/min-height:48px/);
    expect(skip.getAttribute('onclick')).toBe('K._skipInstallFirst()');
    globalThis.K._skipInstallFirst();
    expect($('#auth-phone')).not.toBeNull();
    expect(localStorage.getItem('apex_chat_install_skip')).toBe('1');
    const again = ecran({ skipped: true });
    expect(again.$('#install-first')).toBeNull();
    expect(again.$('#auth-phone')).not.toBeNull();
  });

  it('app installée (écran d\'accueil), Android, ordinateur, Chrome iPhone → directement le numéro', () => {
    for (const o of [{ standalone: true }, { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile' },
      { ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' }, { ua: IPHONE.replace('Version/18.0', 'CriOS/120') }]) {
      const { $ } = ecran(o);
      expect($('#install-first'), JSON.stringify(o)).toBeNull();
      expect($('#auth-phone'), JSON.stringify(o)).not.toBeNull();
    }
  });

  it('reconnu par le domaine kd-mc.com : l\'entrée automatique sans SMS reste possible depuis le guide', async () => {
    const { g } = ecran();
    await wait(5);
    expect(g._kdmcPrefillName).toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────── Item 5
describe('Item 5 — médias : jamais le jeton de session dans une adresse', () => {
  const API_BASE = 'https://apex-chat-api.9r4rxssx64.workers.dev';
  function setup(ensure) {
    document.body.innerHTML = '<div id="box"></div>';
    const K = { token: 'SECRET-SESSION', _mediaTicket: null };
    loadDefs(['const kcall = (name, args, opts) => {', 'K._API_ORIGIN = ', 'K._mediaUrlAllowed = function(url){', 'K._mediaSrc = function(url){',
      'K._mediaWaitTry = ', 'K._mediaWaitTimer = ', 'K._mediaWaitRetry = function(){', 'K._hydrateMediaWait = function(){',
      'K._fmtSize = function(b){', 'K._MEDIA_STYLE = ', 'K._renderMediaEl = function(m){'],
    { K, API_BASE, esc: realEsc(), _safeCatch() {} });
    K._ensureMediaTicket = vi.fn(ensure);
    return K;
  }

  it('ticket pas prêt → espace « Chargement… », aucune adresse avec le jeton ; ticket reçu → la photo avec ?mt=', async () => {
    const K = setup(async () => { K._mediaTicket = { v: 'TICKET-1', exp: Date.now() + 300000 }; return 'TICKET-1'; });
    expect(K._mediaSrc('/api/media/abc')).toBeNull();
    const html = K._renderMediaEl({ media_url: '/api/media/abc', media_type: 'image/png', media_name: 'photo.png' });
    expect(html).not.toContain('SECRET-SESSION');
    expect(html).not.toMatch(/token=/);
    expect(html).toMatch(/class="media-wait"/);
    expect(html).toMatch(/Chargement de photo\.png/);
    document.getElementById('box').innerHTML = html;
    await wait(20);
    const img = document.querySelector('#box img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(API_BASE + '/api/media/abc?mt=TICKET-1');
    expect(document.querySelector('.media-wait')).toBeNull();
    expect(document.getElementById('box').innerHTML).not.toContain('SECRET-SESSION');
  });

  it('pas de réseau pour le ticket → on attend et on réessaie plus tard ; toujours pas de jeton dans l\'adresse', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const K = setup(async () => { n++; if (n < 3) return null; K._mediaTicket = { v: 'T3', exp: Date.now() + 300000 }; return 'T3'; });
      document.getElementById('box').innerHTML = K._renderMediaEl({ media_url: '/api/media/v', media_type: 'video/mp4', media_name: 'v.mp4' });
      await vi.advanceTimersByTimeAsync(1);
      expect(n).toBe(1);
      expect(document.querySelector('.media-wait')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(2100);   // 2ᵉ essai après 2 s
      expect(n).toBe(2);
      await vi.advanceTimersByTimeAsync(4100);   // 3ᵉ essai après 4 s → ticket
      expect(n).toBe(3);
      expect(document.querySelector('#box video').getAttribute('src')).toBe(API_BASE + '/api/media/v?mt=T3');
      expect(document.getElementById('box').innerHTML).not.toMatch(/token=|SECRET-SESSION/);
    } finally { vi.useRealTimers(); }
  });

  it('dans toute la page : plus aucune adresse construite avec « token= » + le jeton ; média chiffré lu par en-tête seulement', () => {
    expect(HTML).not.toMatch(/'token=' \+/);
    expect(HTML).not.toMatch(/[?&]token=' *\+/);
    const i = HTML.indexOf('K._hydrateEncMedia = async function(){');
    const b = HTML.slice(i, i + 1500);
    expect(b).toContain("const encSrc = K._mediaUrlAllowed(String(url || ''));");
    expect(b).not.toContain('K._mediaSrc(url)');
  });
});

// ───────────────────────────────────────────────────────────────────────────── Item 6
describe('Item 6 — PIN : sel aléatoire propre à chaque personne (fini le sel fixe commun)', () => {
  function pinSandbox() {
    const store = {};
    const { K } = loadDefs(['K._PIN_HASH_ITER = ', 'K._PIN_LEGACY_SALT = ', 'K._hashPin = async function(pin, iterations, saltHex){', 'K._userPinVerify = async function(uid, pin){'], {
      K: {}, lg: (k, d) => (k in store ? store[k] : d), ls: (k, v) => { store[k] = v; }, _safeCatch() {},
    });
    K._PIN_HASH_ITER = 100000;   // plus rapide qu'à 600 000 (plancher de lecture = 100 000), même logique
    return { K, store };
  }
  it('deux personnes avec le MÊME PIN → deux sels et deux hash différents ; chacun se vérifie', async () => {
    const { K, store } = pinSandbox();
    store.user_pin_a = await K._hashPin('123456');
    store.user_pin_b = await K._hashPin('123456');
    const [, , sa, ha] = store.user_pin_a.split('$');
    const [, , sb, hb] = store.user_pin_b.split('$');
    expect(store.user_pin_a).toMatch(/^p3\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(sa).not.toBe(sb);
    expect(ha).not.toBe(hb);
    expect(await K._userPinVerify('a', '123456')).toBe(true);
    expect(await K._userPinVerify('b', '123456')).toBe(true);
    expect(await K._userPinVerify('a', '654321')).toBe(false);
  });
  it('le sel fixe « apex-chat-user-pin-v1 » n\'est plus utilisé pour un nouveau hash', async () => {
    const { K } = pinSandbox();
    const legacy = await K._hashPin('123456', 100000, K._PIN_LEGACY_SALT);
    const fresh = await K._hashPin('123456', 100000);
    expect(fresh.split('$')[3]).not.toBe(legacy);   // (100 000 → ancien format = hex nu)
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
  });
  it('anciens hash à sel fixe (v1.1.304-305 « p2$… », et hex nu d\'avant) : acceptés une fois, puis migrés au sel propre', async () => {
    const { K, store } = pinSandbox();
    store.user_pin_u = await K._hashPin('482915', 600000, K._PIN_LEGACY_SALT);   // format exact de v1.1.304-305
    expect(store.user_pin_u).toMatch(/^p2\$600000\$[0-9a-f]{64}$/);
    expect(await K._userPinVerify('u', '000000')).toBe(false);
    expect(store.user_pin_u).toMatch(/^p2\$/);                      // PIN faux → rien ne change
    expect(await K._userPinVerify('u', '482915')).toBe(true);
    expect(store.user_pin_u).toMatch(/^p3\$100000\$[0-9a-f]{32}\$/);   // migré au déverrouillage réussi
    expect(await K._userPinVerify('u', '482915')).toBe(true);
    // un hash p3 altéré (sel changé) est refusé
    store.user_pin_u = store.user_pin_u.replace(/\$([0-9a-f])/, (m, c) => '$' + (c === '0' ? '1' : '0'));
    expect(await K._userPinVerify('u', '482915')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────── Item 7
describe('Item 7 — sourdine temporaire envoyée au serveur (fini « sur ce téléphone seulement »)', () => {
  function sb(apiImpl) {
    const K = { token: 'jwt', conversations: [{ id: 'c1', name: 'Famille' }], render() {}, _closeModal() {}, _api: vi.fn(apiImpl) };
    const toasts = [];
    loadDefs(['K._setSnooze = function(convId, durationOrToken){', 'K._cancelSnooze = function(convId){', 'K._muteServerState = function(conv){',
      'K._syncConvMute = async function(conv, silent){', 'K._mergeMuted = function(serverConv, localConv){'],
    { K, ls() {}, toast: (m) => toasts.push(m), _safeCatch() {} });
    return { K, toasts };
  }
  it('sourdine 1 h → PUT …/mute {muted:true, until} ; annulée → {muted:false}', async () => {
    const { K } = sb(async () => ({ ok: true }));
    await K._setSnooze('c1', String(3600000));
    const until = K.conversations[0].snoozed_until;
    expect(K._api).toHaveBeenLastCalledWith('PUT', '/api/conversations/c1/mute', { muted: true, until });
    await K._cancelSnooze('c1');
    expect(K._api).toHaveBeenLastCalledWith('PUT', '/api/conversations/c1/mute', { muted: false });
  });
  it('hors ligne → gardée et marquée « à renvoyer » (renvoyée à la prochaine synchro), la personne est prévenue', async () => {
    const { K, toasts } = sb(async () => { throw new TypeError('Load failed'); });
    await K._setSnooze('c1', 'weekend_end');
    expect(K.conversations[0].mute_pending).toBe(true);
    expect(K._mergeMuted({ muted: false }, K.conversations[0])).toMatchObject({ mute_pending: true, snoozed_until: K.conversations[0].snoozed_until });
    expect(toasts.join(' ')).toMatch(/envoyé dès que possible/);
  });
  it('synchro de la liste : un muet serveur AVEC fin redevient une sourdine (💤), sans fin un muet permanent', () => {
    const { K } = sb(async () => ({ ok: true }));
    const t = Date.now() + 3600000;
    expect(K._mergeMuted({ muted: true, muted_until: t }, {})).toEqual({ muted: false, muted_until: t, snoozed_until: t });
    expect(K._mergeMuted({ muted: true, muted_until: null }, {})).toEqual({ muted: true, muted_until: null });
    expect(K._mergeMuted({ muted: false, muted_until: null }, { snoozed_until: t })).toEqual({ muted: false, muted_until: null });
  });
});
