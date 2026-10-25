/**
 * v13.4.392 (pont 970/971, Lighthouse + Chrome de Kevin) : un démarrage SILENCIEUX.
 * - aucune demande de permission de notification sans geste (audit « notification-on-start ») ;
 * - les icônes du manifeste se trouvent (le manifeste est servi depuis /assets/json/ : « ./assets/icons/… » donnait 404) ;
 * - les sentinelles (30 services externes sondés) ne démarrent pas pendant le premier affichage.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RACINE = process.cwd();
const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('démarrage silencieux', () => {
  it('push-auto-init : plus de demande automatique de permission (ni minuteur de 30 s)', () => {
    const src = lire('services/integrations/push-auto-init.ts');
    const auto = src.slice(src.indexOf('async autoInit('), src.indexOf('async requestPermissionAndSubscribe(')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(auto).not.toMatch(/requestPermission/);
    expect(auto).not.toMatch(/setTimeout/);
    expect(src).not.toContain('FIRST_BOOT_DELAY_MS');
    /* la demande reste possible sur un GESTE (onboarding, Réglages) */
    expect(src).toContain('async requestPermissionAndSubscribe(');
    expect(lire('features/settings/index.ts')).toContain('Notification.requestPermission');
    expect(lire('features/onboarding/index.ts')).toContain('Notification.requestPermission');
  });

  it('manifeste : chaque icône est une adresse absolue (vue depuis assets/json/ aussi)', () => {
    for (const f of ['manifest.json', 'assets/manifest.json']) {
    const m = JSON.parse(lire(f)) as { icons: Array<{ src: string }>; shortcuts?: Array<{ icons?: Array<{ src: string }> }> };
    const toutes = [...m.icons, ...(m.shortcuts ?? []).flatMap((s) => s.icons ?? [])].map((i) => i.src);
    expect(toutes.length).toBeGreaterThanOrEqual(4);
    // publicDir = 'assets' : assets/icons/X est servi à /icons/X (v13.4.393 : /assets/icons/ donnait 404 en ligne)
    expect(toutes.every((s) => s.startsWith('/icons/'))).toBe(true);
    for (const s of toutes) expect(existsSync(`${RACINE}/assets/${s.slice(1)}`)).toBe(true);
    }
  });

  it('sentinelles : le premier tick attend 20 s', () => {
    const src = lire('services/sentinels/sentinels.ts');
    expect(src).toMatch(/setTimeout\(tick, 20_000\)/);
    expect(src).not.toMatch(/setTimeout\(tick, 2000\)/);
  });
});

describe('Excel : une version qui existe', () => {
  it('le générateur et la sentinelle visent xlsx@0.18.5 (0.20.3 n’existe pas sur jsDelivr : 404)', () => {
    expect(lire('services/skills/xlsx-generator.ts')).toContain("xlsx@0.18.5/dist/xlsx.full.min.js'");
    expect(lire('services/sentinels/skills-watch.ts')).toContain('xlsx@0.18.5/package.json');
    expect(lire('services/skills/xlsx-generator.ts')).not.toMatch(/const XLSX_CDN = [^\n]*0\.20\.3/);
  });
});
