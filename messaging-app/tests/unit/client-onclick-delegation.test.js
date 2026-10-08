// Garde SÉCU (audit client 10/2026) — aucune valeur venue d'un message, d'un pair,
// d'un lien ou d'une API tierce n'est écrite DANS LE CODE d'un gestionnaire inline.
//
// Pourquoi esc() ne suffit pas : dans onclick="K._f('${esc(v)}')", le navigateur
// DÉCODE les entités (&#39; → ', &quot; → ") AVANT d'exécuter le JS. Un message
// « x');alert(document.cookie);// » sortait donc de la chaîne JS et s'exécutait au
// clic (puce de réaction, citation de réponse, Copier/Traduire, tap sur image,
// lien d'invitation ?inviter=…). Désormais : kcall() écrit l'action + ses
// arguments en data-*, un seul écouteur délégué appelle la fonction.
//
// Discriminant : sans le correctif, le scan (test 1) liste les gestionnaires
// fautifs, et kcall / K._kcallDispatch n'existent pas (tests 2-4 échouent).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadDefs, realEsc, readIndex } from './client-extract.js';

// Valeurs contrôlées par un tiers qui ne doivent JAMAIS apparaître dans un
// ${…} à l'intérieur d'un attribut on*="…".
const INTERDITS = [
  'reply_to', 'esc(emo)', 'msg.text', 'rewritten', 'messageText', 'result.translated',
  'g.full', 'g.title', 'esc(src)', 'blobUrl', 'm.image_data', '_convName', 'esc(nm)', 'esc(name)',
  'conv.name', 'conv.pseudo', 'u.pseudo', 'scamReason', 'esc(tag)', 'esc(label)',
  'msg.from', 'msg.convId', 'inviterUserId', 'JSON.stringify',
];

function gestionnairesFautifs(html) {
  const out = [];
  const re = /\son[a-z]+=(["'])([^\n]*?)\1/g;
  const lines = html.split('\n');
  lines.forEach((line, n) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      const code = m[2];
      if (!code.includes('${')) continue;
      for (const bad of INTERDITS) {
        if (code.includes(bad)) out.push(`l.${n + 1} [${bad}] ${line.trim().slice(0, 140)}`);
      }
    }
  });
  return out;
}

describe('Gestionnaires inline : jamais de donnée tierce dans le code JS (audit client 10/2026)', () => {
  it('1. scan de la page : aucun on*="…${donnée tierce}…"', () => {
    const fautifs = gestionnairesFautifs(readIndex());
    expect(fautifs, 'gestionnaires inline encore fautifs :\n' + fautifs.join('\n')).toEqual([]);
  });

  describe('kcall + écouteur délégué', () => {
    let K, kcall, calls;
    beforeEach(() => {
      calls = [];
      K = {
        _toggleReaction: vi.fn((...a) => calls.push(['_toggleReaction', ...a])),
        _scrubVoice: vi.fn((...a) => calls.push(['_scrubVoice', ...a])),
        _notAllowed: vi.fn(),
        _closeModal: vi.fn(),
      };
      const html = readIndex();
      const loaded = loadDefs([
        'const kcall = (name, args, opts) => {',
        { m: 'K._KCALL_ALLOWED = new Set([', end: '\n]);' },
        'K._kcallSafeOpenUrl = function(u){',
        'K._kcallDispatch = function(ev){',
      ], { K, esc: realEsc(), _safeCatch: () => {}, toast: () => {} });
      kcall = loaded.kcall;
      expect(html).toContain("document.addEventListener('click', K._kcallDispatch, true)");
    });

    function rendreEtCliquer(markup) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
      const el = host.firstElementChild;
      const ev = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(ev, 'target', { value: el });
      K._kcallDispatch(ev);
      host.remove();
      return el;
    }

    it('2. une réaction piégée arrive TELLE QUELLE en argument, sans exécution', () => {
      globalThis.__pwned = false;
      const emo = "x');globalThis.__pwned=true;//";
      const id = 'id"&quot;\'<b>';
      const markup = `<span class="msg-reaction"${kcall('_toggleReaction', [id, emo])}>r</span>`;
      expect(markup).not.toMatch(/onclick/);
      rendreEtCliquer(markup);
      expect(calls).toEqual([['_toggleReaction', id, emo]]);
      expect(globalThis.__pwned).toBe(false);
    });

    it('3. seules les fonctions de la liste blanche sont appelables ; evt ajoute l\'événement', () => {
      rendreEtCliquer(`<b${kcall('_notAllowed', [1])}>x</b>`);
      expect(K._notAllowed).not.toHaveBeenCalled();
      rendreEtCliquer(`<b${kcall('_scrubVoice', ['m1'], { evt: true })}>x</b>`);
      expect(calls[0][0]).toBe('_scrubVoice');
      expect(calls[0][1]).toBe('m1');
      expect(calls[0][2]).toBeInstanceOf(Event);
    });

    it('4. __open n\'ouvre que http(s)/blob/data:image — jamais javascript:', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      rendreEtCliquer(`<img${kcall('__open', ['javascript:alert(1)'])}>`);
      rendreEtCliquer(`<img${kcall('__open', ['data:text/html,<script>alert(1)</script>'])}>`);
      expect(open).not.toHaveBeenCalled();
      rendreEtCliquer(`<img${kcall('__open', ['https://apex-chat-api.9r4rxssx64.workers.dev/api/media/a'])}>`);
      expect(open).toHaveBeenCalledWith('https://apex-chat-api.9r4rxssx64.workers.dev/api/media/a', '_blank', 'noopener');
      open.mockRestore();
    });
  });
});
