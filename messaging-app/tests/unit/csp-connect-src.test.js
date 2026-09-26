// Garde CSP ⇄ réseau (audit 17/09/2026, P2 sécu + leçon « CSP⇄fetch »).
//
// Avant : `connect-src 'self' https: wss:` — n'importe quel hôte joignable, donc en cas de
// faille XSS, exfiltration libre. Maintenant : liste blanche des hôtes réellement appelés.
// Le danger inverse (leçon CSP⇄fetch) : un fetch vers un hôte oublié échoue en silence
// (« Load failed »). Ce garde relit la page et les modules, repère chaque hôte https/wss
// utilisé dans un appel réseau (fetch / WebSocket / EventSource / constantes d'API) et exige
// qu'il soit couvert par connect-src. Il refuse aussi le retour de `https:` générique.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(APP, 'index.html'), 'utf8');
const libs = readdirSync(join(APP, 'lib')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(APP, 'lib', f), 'utf8'));

function connectSrc() {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  const csp = m ? m[1] : '';
  const dir = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src '));
  return dir ? dir.replace('connect-src ', '').split(/\s+/) : [];
}

/** Hôtes https/wss qui apparaissent dans un contexte d'appel réseau. */
function hotesReseau(src) {
  const out = new Set();
  const rx = /(https|wss):\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = rx.exec(src))) {
    const avant = src.slice(Math.max(0, m.index - 160), m.index);
    if (/fetch\s*\(|new\s+WebSocket\s*\(|new\s+EventSource\s*\(|API_BASE\s*=|_API_URL__\s*\|\||WORKER_URL\s*=|apiBase\s*=|\bapiUrl\s*=|sendBeacon\s*\(/.test(avant)) {
      out.add(m[1] + '://' + m[2].toLowerCase());
    }
  }
  return [...out].sort();
}

function couvert(origine, liste) {
  const [scheme, host] = origine.split('://');
  return liste.some((entry) => {
    if (entry === "'self'") return false;
    if (entry === scheme + ':' || entry === 'https:' || entry === 'wss:') return true;
    const [es, eh] = entry.includes('://') ? entry.split('://') : [scheme, entry];
    if (es !== scheme) return false;
    if (eh.startsWith('*.')) return host.endsWith(eh.slice(1)) && host !== eh.slice(2);
    return eh === host;
  });
}

describe('CSP connect-src = liste blanche des hôtes réellement appelés', () => {
  const liste = connectSrc();

  it('plus de « https: » ni « wss: » générique dans connect-src', () => {
    expect(liste.length).toBeGreaterThan(3);
    expect(liste).not.toContain('https:');
    expect(liste).not.toContain('wss:');
  });

  const hotes = hotesReseau(html + '\n' + libs.join('\n'));
  it('la mesure trouve bien des hôtes réseau (garde non vide)', () => {
    expect(hotes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(hotes)('%s est autorisé par connect-src', (h) => {
    expect(couvert(h, liste), `${h} appelé par le code mais absent de connect-src → « Load failed » silencieux`).toBe(true);
  });

  it('garde discriminant : un hôte hors liste est refusé', () => {
    expect(couvert('https://exfil.example.com', liste)).toBe(false);
    expect(couvert('https://apex-chat-api.9r4rxssx64.workers.dev', liste)).toBe(true);
    expect(couvert('wss://apex-chat.kd-mc.com', liste)).toBe(true);
  });
});
