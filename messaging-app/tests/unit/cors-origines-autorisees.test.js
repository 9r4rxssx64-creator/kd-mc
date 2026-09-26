/**
 * Audit P2b — l'API ne répond plus `Access-Control-Allow-Origin: *`
 * (v1.1.287).
 *
 * `*` laissait n'importe quel site du web appeler l'API depuis le navigateur
 * d'un visiteur. L'authentification passe par un en-tête `Bearer` (pas par un
 * cookie), donc un site tiers ne pouvait pas LIRE les données de Kevin — mais
 * il pouvait faire appeler les routes non authentifiées (envoi de SMS, test de
 * numéro) par les navigateurs de ses visiteurs : coût réel et fuite de vie
 * privée. On restreint donc aux origines d'où l'app est réellement servie.
 *
 * Ce fichier PROUVE le comportement ET verrouille la liste : le vrai hôte
 * GitHub Pages y est vérifié à partir des fichiers du dépôt, parce que c'est
 * précisément celui qu'on avait oublié ailleurs (leçon #218).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_ORIGINS, isAllowedOrigin, applyCors } from '../../workers/lib/cors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = join(ROOT, '..');

/** Requête minimale : seul `headers.get('Origin')` est lu par applyCors. */
const reqWith = (origin) => ({ headers: { get: (n) => (String(n).toLowerCase() === 'origin' ? origin : null) } });

describe('CORS : liste d\'origines au lieu de « tout le monde » (v1.1.287)', () => {
  it('accepte les origines réelles de l\'app', () => {
    expect(isAllowedOrigin('https://apex-chat.kd-mc.com')).toBe(true);
    expect(isAllowedOrigin('https://9r4rxssx64-creator.github.io')).toBe(true);
    expect(isAllowedOrigin('https://kd-mc.com')).toBe(true);
    expect(isAllowedOrigin('https://www.kd-mc.com')).toBe(true);
  });

  it('accepte le développement local, refuse tout le reste', () => {
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:54321')).toBe(true);
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    // 2026-09-10 — les tests navigateur se servent en HTTPS (tests/serve-https.sh,
    // exigé par WebKit) : `https://localhost:4173` DOIT passer, sinon les deux
    // voies iPhone de la CI sont rouges à chaque exécution (vécu, run 34519030133).
    expect(isAllowedOrigin('https://localhost:4173')).toBe(true);
    expect(isAllowedOrigin('https://127.0.0.1:4173')).toBe(true);
    expect(isAllowedOrigin('https://localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('https://apex-chat.kd-mc.com.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });

  it('renvoie l\'origine autorisée, et rien pour une origine inconnue', async () => {
    const base = () => new Response('x', { headers: { 'Access-Control-Allow-Origin': '*' } });

    const ok = applyCors(reqWith('https://apex-chat.kd-mc.com'), base());
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://apex-chat.kd-mc.com');
    expect(ok.headers.get('Vary')).toContain('Origin');

    // `Vary` s'ajoute au lieu d'écraser (compression négociée en amont).
    const varied = applyCors(reqWith('https://kd-mc.com'), new Response('x', { headers: { Vary: 'Accept-Encoding' } }));
    expect(varied.headers.get('Vary')).toContain('Accept-Encoding');
    expect(varied.headers.get('Vary')).toContain('Origin');
    expect(await ok.text()).toBe('x');            // le corps n'est pas perdu

    const ko = applyCors(reqWith('https://evil.example'), base());
    expect(ko.headers.get('Access-Control-Allow-Origin')).toBeNull();

    // Sans en-tête Origin (curl, appel serveur à serveur) : rien à autoriser.
    const noOrigin = applyCors(reqWith(null), base());
    expect(noOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('ne touche PAS un upgrade WebSocket (101) — sinon le temps réel casse', () => {
    // Une réponse 101 transporte un objet `webSocket` non reconstructible : on
    // doit renvoyer l'objet d'origine, pas une copie.
    const ws = { status: 101, headers: new Headers(), webSocket: {} };
    expect(applyCors(reqWith('https://evil.example'), ws)).toBe(ws);
  });

  it('la liste contient les hôtes réellement utilisés par le dépôt (leçon #218)', () => {
    // Domaine canonique déclaré dans la page…
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const canonical = (html.match(/<link rel="canonical" href="(https:\/\/[^/"]+)/) || [])[1];
    expect(canonical).toBeTruthy();
    expect(ALLOWED_ORIGINS).toContain(canonical);

    // …et hôte GitHub Pages réellement chargé par le test de bout en bout.
    const e2e = readFileSync(join(REPO, '.github', 'workflows', 'apex-chat-e2e.yml'), 'utf8');
    const pages = (e2e.match(/APEX_CHAT_URL:\s*(https:\/\/[^/\s]+)/) || [])[1];
    expect(pages).toBeTruthy();
    expect(ALLOWED_ORIGINS).toContain(pages);
  });
});
