// Apex Chat E2E — fixtures partagées (08.10.2026).
//
// Depuis la porte générale du domaine (#4313, « aucune consultation sans compte,
// nulle part »), le routeur refuse la page, ses scripts et ses fichiers (401) à
// qui n'a ni compte ni en-tête de sonde. Le robot d'Apex Chat ne se déclarait
// pas : il voyait l'écran « Connexion au domaine requise » au lieu de l'app
// (run 37801862467 : version introuvable, SEO en timeout, robots.txt refusé,
// WebSocket impossible depuis la page). On réutilise le marquage commun des
// sondes (tools/smoke/marquer-sonde.mjs) : UNIQUEMENT l'origine d'Apex Chat,
// jamais l'API (workers.dev, hors routeur) ni d'autres domaines (CORS).
import { test as base, expect, request as pwRequest } from '@playwright/test';
import { marquerSonde } from '../../tools/smoke/marquer-sonde.mjs';

export const SITE = process.env.APEX_CHAT_URL || 'https://apex-chat.kd-mc.com/';
const NOM = 'apex-chat-e2e';

/** À appeler sur chaque contexte créé à la main (browser.newContext()). */
export const marquer = (ctx) => marquerSonde(ctx, NOM, [SITE]);

export const test = base.extend({
  context: async ({ context }, use) => { await marquer(context); await use(context); },
  // Requêtes directes (robots.txt, sitemap…) : l'en-tête suffit, pas de CORS ici.
  request: async ({ playwright, baseURL }, use) => {
    const r = await playwright.request.newContext({
      baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { 'x-kdmc-sonde': NOM },
    });
    await use(r);
    await r.dispose();
  },
});

export { expect, pwRequest };
