// Lot B vie privée — non-régression CLIENT (vraie page extraite, CLIENT_INDEX_PATH pour la preuve de sabotage).
//  A6-02 / A3 P1 : réponses suggérées — AUCUN envoi à la réception d'un message ; envoi seulement sur toucher du bouton ;
//                  interrupteur utilisateur + interrupteur admin respectés ; conversation chiffrée de bout en bout →
//                  confirmation claire, une fois par conversation.
//  A6-03 : note vocale TOUJOURS envoyable (transcription refusée / quota / panne → aperçu + envoi sans texte) ;
//          conversation chiffrée de bout en bout → l'audio ne part PAS tout seul à l'IA.
import { describe, it, expect, vi } from 'vitest';
import { readIndex, loadDefs, realEsc } from './client-extract.js';

const esc = realEsc();
const html = readIndex();

const SR_DEFS = [
  'K._loadSmartReplies = async function',
  'K._featureEnabledForUser = function',
  'K._smartReplyAllowed = function',
  'K._aiLeavesE2e = function',
  'K._SMART_REPLY_E2E_CONFIRM = ',
  'K._renderSmartReplyChips = async function',
  'K._askSmartReplies = async function',
  'K._showSmartReplyChips = function',
];

function smartHarness({ prefs = {}, store = {}, conv = { id: 'c1', type: 'group' }, e2eDm = false, e2eGroup = false, confirmAnswer = true } = {}) {
  const st = { privacy_prefs: prefs, ...store };
  const host = { innerHTML: '', _click: null,
    querySelector(sel) { return sel === '.smart-ask' && host.innerHTML.includes('smart-ask') ? { addEventListener: (_e, fn) => { host._click = fn; } } : null; },
    querySelectorAll: () => [] };
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, replies: ['Oui', 'Non'] })); });
  const confirmMock = vi.fn(() => confirmAnswer);
  const K = { token: 't', user: { id: 'u1' }, conversations: [conv], viewData: conv,
    _e2eAppliesTo: () => e2eDm, _grpApplies: () => e2eGroup, _useSmartReply() {} };
  loadDefs(SR_DEFS, {
    K, API_BASE: 'https://api', fetch: fetchMock, esc, $: () => host, document: { hidden: false },
    lg: (k, d) => (k in st ? st[k] : d), ls: (k, v) => { st[k] = v; }, confirm: confirmMock,
    AbortSignal: { timeout: () => undefined },
  });
  const msg = (id, text = 'Mon code de carte est 1234') => ({ id, from: 'u2', ts: Date.now(), text });
  return { K, host, calls, fetchMock, confirmMock, st, msg };
}

describe('Lot B — A6-02 / A3 P1 : réponses suggérées seulement sur toucher', () => {
  it('message reçu → AUCUN envoi ; seul le bouton « 💡 Suggestions » apparaît', async () => {
    const h = smartHarness();
    await h.K._renderSmartReplyChips('c1', h.msg('m1'));
    expect(h.calls).toHaveLength(0);
    expect(h.host.innerHTML).toContain('smart-ask');
    expect(h.host.innerHTML).toContain('Suggestions');
  });

  it('toucher le bouton (conversation non chiffrée de bout en bout) → 1 envoi, pas de confirmation, puces affichées', async () => {
    const h = smartHarness();
    await h.K._renderSmartReplyChips('c1', h.msg('m1'));
    await h.host._click();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toContain('/api/ai/smart-reply');
    expect(h.calls[0].body.last_message).toContain('1234');
    expect(h.confirmMock).not.toHaveBeenCalled();
    expect(h.host.innerHTML).toContain('Oui');
    // réaffichage du même message : depuis le cache, sans nouvel envoi
    await h.K._renderSmartReplyChips('c1', h.msg('m1'));
    expect(h.calls).toHaveLength(1);
  });

  it('interrupteur utilisateur coupé (Réglages → Confidentialité) → ni bouton, ni envoi, même en appelant la demande', async () => {
    const h = smartHarness({ prefs: { smartReply: false } });
    await h.K._renderSmartReplyChips('c1', h.msg('m1'));
    expect(h.host.innerHTML).toBe('');
    await h.K._askSmartReplies('c1', h.msg('m1'));
    expect(h.calls).toHaveLength(0);
  });

  it('interrupteur admin « Assistant IA » coupé (global ou pour ce compte) → aucun envoi', async () => {
    for (const store of [{ admin_toggles: { ai_assistant: false } }, { feature_toggle_user_u1: { ai_assistant: false } }]) {
      const h = smartHarness({ store });
      await h.K._renderSmartReplyChips('c1', h.msg('m1'));
      await h.K._askSmartReplies('c1', h.msg('m1'));
      expect(h.host.innerHTML).toBe('');
      expect(h.calls).toHaveLength(0);
    }
  });

  it('DM chiffré de bout en bout : confirmation refusée → AUCUN envoi, la question reviendra', async () => {
    const h = smartHarness({ conv: { id: 'c1', type: 'dm' }, e2eDm: true, confirmAnswer: false });
    await h.K._renderSmartReplyChips('c1', h.msg('m1'));
    expect(h.calls).toHaveLength(0);
    await h.host._click();
    expect(h.confirmMock).toHaveBeenCalledTimes(1);
    expect(h.confirmMock.mock.calls[0][0]).toMatch(/IA extérieure/);
    expect(h.confirmMock.mock.calls[0][0]).toMatch(/chiffrée de bout en bout/);
    expect(h.calls).toHaveLength(0);
    expect(h.st.smart_reply_e2e_ok_c1).toBeUndefined();
  });

  it('DM chiffré de bout en bout : confirmation acceptée → envoi ; question posée UNE fois par conversation', async () => {
    const h = smartHarness({ conv: { id: 'c1', type: 'dm' }, e2eDm: true, confirmAnswer: true });
    await h.K._askSmartReplies('c1', h.msg('m1'));
    expect(h.confirmMock).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(1);
    await h.K._askSmartReplies('c1', h.msg('m2', 'Et demain ?'));
    expect(h.confirmMock).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(2);
  });

  it('groupe chiffré de bout en bout → confirmation demandée aussi', async () => {
    const h = smartHarness({ conv: { id: 'g1', type: 'group' }, e2eGroup: true, confirmAnswer: false });
    await h.K._askSmartReplies('g1', h.msg('m1'));
    expect(h.confirmMock).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(0);
  });

  it('page : la demande n\'est branchée QUE sur le toucher du bouton, et la réception appelle toujours le rendu sans envoi', () => {
    const asks = html.split('K._askSmartReplies(').length - 1;
    expect(asks).toBe(1);
    expect(html).toMatch(/b\.addEventListener\('click', \(\) => \{ void K\._askSmartReplies\(convId, lastMsg\); \}\)/);
    expect(html).toMatch(/if\(msg\.from !== K\.user\?\.id\) void K\._renderSmartReplyChips\(convId, msg\);/);
    // l'interrupteur existe dans Réglages → Confidentialité et il est sauvegardé
    expect(html).toContain('id="pv-smartReply"');
    expect(html).toMatch(/smartReply: !!\$\('#pv-smartReply'\)\?\.checked/);
  });
});

// ---------------------------------------------------------------------------
class FakeRec {
  constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
  static isTypeSupported() { return true; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([new Uint8Array(5000)]) }); this.onstop(); }
}

function voiceHarness({ conv = { id: 'g1', type: 'group' }, e2eDm = false, e2eGroup = false, respond, confirmAnswer = true } = {}) {
  const els = { 'voice-preview-text': { value: '' }, 'voice-transcribe-status': { textContent: '' }, 'chat-mic-btn': { classList: { add() {}, remove() {} } } };
  const fetchMock = vi.fn(respond || (async () => new Response(JSON.stringify({ message: 'Limite gratuite atteinte (5/5)' }), { status: 429 })));
  const confirmMock = vi.fn(() => confirmAnswer);
  const toasts = [];
  const K = { token: 't', viewData: conv, _e2eAppliesTo: () => e2eDm, _grpApplies: () => e2eGroup,
    _showVoiceWaveform() {}, _hideVoiceWaveform() {} };
  K._showVoicePreview = vi.fn((p) => { K._voicePending = p; });
  loadDefs(['K._aiLeavesE2e = function', 'K._toggleVoiceRecord = async function', 'K._transcribeVoice = async function',
    'K._VOICE_E2E_CONFIRM = ', 'K._transcribeVoiceAsk = async function'], {
    K, API_BASE: 'https://api', fetch: fetchMock, toast: (m) => toasts.push(m), _safeCatch: () => {}, confirm: confirmMock,
    MediaRecorder: FakeRec, URL: { createObjectURL: () => 'blob:vocal' },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
    document: { getElementById: (id) => els[id] || null },
  });
  const record = async () => { await K._toggleVoiceRecord(); await K._toggleVoiceRecord(); await new Promise((r) => setTimeout(r, 20)); };
  return { K, els, fetchMock, confirmMock, toasts, record };
}

describe('Lot B — A6-03 : une note vocale est toujours envoyable', () => {
  it('quota de transcription atteint (429) → l\'aperçu s\'ouvre quand même avec l\'audio, simple message', async () => {
    const h = voiceHarness();
    await h.record();
    expect(h.K._showVoicePreview).toHaveBeenCalledTimes(1);
    expect(h.K._showVoicePreview.mock.calls[0][0].blob).toBeInstanceOf(Blob);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(String(h.fetchMock.mock.calls[0][0])).toBe('https://api/api/ai/voice-transcribe?lang=fr');
    expect(h.els['voice-transcribe-status'].textContent).toMatch(/envoyer le vocal sans texte/);
  });

  it('panne réseau / IA absente (503, exception) → aperçu ouvert, aucun blocage', async () => {
    for (const respond of [async () => new Response('{}', { status: 503 }), async () => { throw new Error('offline'); }]) {
      const h = voiceHarness({ respond });
      await h.record();
      expect(h.K._showVoicePreview).toHaveBeenCalledTimes(1);
      expect(h.els['voice-transcribe-status'].textContent).toMatch(/sans texte/);
    }
  });

  it('transcription réussie (conversation non chiffrée de bout en bout) → texte proposé, modifiable', async () => {
    const h = voiceHarness({ respond: async () => new Response(JSON.stringify({ ok: true, text: 'On se voit à 18 h' })) });
    await h.record();
    expect(h.els['voice-preview-text'].value).toBe('On se voit à 18 h');
  });

  it('conversation chiffrée de bout en bout → l\'audio ne part PAS à l\'IA tout seul ; « Transcrire » demande confirmation', async () => {
    const h = voiceHarness({ conv: { id: 'd1', type: 'dm' }, e2eDm: true, confirmAnswer: false,
      respond: async () => new Response(JSON.stringify({ ok: true, text: 'secret' })) });
    await h.record();
    expect(h.K._showVoicePreview).toHaveBeenCalledTimes(1);
    expect(h.K._showVoicePreview.mock.calls[0][0].e2e).toBe(true);
    expect(h.fetchMock).not.toHaveBeenCalled();
    await h.K._transcribeVoiceAsk();             // refus
    expect(h.confirmMock).toHaveBeenCalledTimes(1);
    expect(h.confirmMock.mock.calls[0][0]).toMatch(/IA extérieure/);
    expect(h.fetchMock).not.toHaveBeenCalled();
    h.confirmMock.mockReturnValue(true);
    await h.K._transcribeVoiceAsk();             // accord
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.els['voice-preview-text'].value).toBe('secret');
  });

  it('groupe chiffré de bout en bout → pas de transcription automatique non plus', async () => {
    const h = voiceHarness({ e2eGroup: true });
    await h.record();
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('envoi d\'un vocal SANS texte → le vocal part (légende « 🎙️ Message vocal »), au lieu de « Texte vide, annulé »', async () => {
    const conv = { id: 'd1', type: 'dm' };
    const K = { token: 't', viewData: conv, user: { id: 'u1' }, messages: {}, _convIsDm: () => true, render() {} };
    K._voicePending = { blob: new Blob([new Uint8Array(2000)], { type: 'audio/webm' }), text: '', audioUrl: 'blob:x' };
    K._sendMediaMessage = vi.fn(async () => {});
    K._dmMediaEncrypt = async () => ({});   // v1.1.304 : DM sans E2E sur l'appareil (le chiffrement du vocal E2E est prouvé dans lot-c1-chiffrement)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, url: '/api/media/v1', mime: 'audio/webm', name: 'vocal.webm', size: 2000 })));
    const toasts = [];
    loadDefs(['K._sendVoiceMessage = async function'], {
      K, API_BASE: 'https://api', fetch: fetchMock, toast: (m) => toasts.push(m), _safeCatch: () => {}, ls: () => {},
      URL: { revokeObjectURL() {} }, document: { getElementById: () => ({ value: '' }) },
    });
    await K._sendVoiceMessage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(K._sendMediaMessage).toHaveBeenCalledTimes(1);
    expect(K._sendMediaMessage.mock.calls[0][1]).toBe('🎙️ Message vocal');
    expect(toasts.join(' ')).not.toMatch(/Texte vide/);
  });
});
