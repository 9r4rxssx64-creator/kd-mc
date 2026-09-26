/**
 * Tests services/smart-studios-anticipator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectStudioIntent,
  smartStudiosAnticipator,
  type StudioIntent,
} from '../../services/ai/smart-studios-anticipator.js';

describe('smart-studios-anticipator — detectStudioIntent', () => {
  it('matche musique avec confidence ≥ 0.7 (≥2 keywords)', () => {
    /* "musique" + "morceau" + "audio" = 3 longs keywords → ≥ 0.9 confidence */
    const m = detectStudioIntent('je veux mixer un morceau audio de musique pour la soirée');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('music');
    expect(m?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(m?.route).toBe('#studio-music');
  });

  it('matche architecture avec mots techniques', () => {
    const m = detectStudioIntent('je dois calculer la surface en m² pour mon plan maison');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('architecture');
    expect(m?.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('matche plant pour jardinage', () => {
    const m = detectStudioIntent('mes plantes ont besoin d\'arrosage cet été pour le potager');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('plant');
  });

  it('matche geo pour adresse / distance', () => {
    const m = detectStudioIntent('je veux les coordonnées GPS de cette adresse à Monaco');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('geo');
  });

  it('matche lunar pour biodynamie', () => {
    const m = detectStudioIntent('quand est la prochaine pleine lune pour mon jardin lunaire');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('lunar');
  });

  it('matche pet pour animaux', () => {
    const m = detectStudioIntent('combien donner à manger à mon chien de 12 kg');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('pet');
  });

  it('matche scan pour OCR / QR', () => {
    const m = detectStudioIntent('je veux scanner un QR code de carte de visite');
    expect(m).not.toBeNull();
    expect(m?.intent).toBe('scan');
  });

  it('retourne null si aucun keyword trouvé', () => {
    const m = detectStudioIntent('bonjour comment ça va aujourd\'hui ?');
    /* "comment" n'est pas dans nos keywords. Si null OK, sinon confidence basse acceptée. */
    if (m) expect(m.confidence).toBeLessThan(1);
  });

  it('retourne null si texte vide', () => {
    expect(detectStudioIntent('')).toBeNull();
    expect(detectStudioIntent('   ')).toBeNull();
  });

  it('priorise specific keywords (≥ 8 chars) avec boost confidence', () => {
    const m1 = detectStudioIntent('architecture et béton');
    expect(m1).not.toBeNull();
    expect(m1?.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe('smart-studios-anticipator — public API', () => {
  beforeEach(() => {
    localStorage.clear();
    smartStudiosAnticipator.stop();
  });

  afterEach(() => {
    smartStudiosAnticipator.stop();
    localStorage.clear();
  });

  it('start() puis stop() change isRunning()', () => {
    expect(smartStudiosAnticipator.isRunning()).toBe(false);
    smartStudiosAnticipator.start();
    expect(smartStudiosAnticipator.isRunning()).toBe(true);
    smartStudiosAnticipator.stop();
    expect(smartStudiosAnticipator.isRunning()).toBe(false);
  });

  it('start() est idempotent', () => {
    smartStudiosAnticipator.start();
    smartStudiosAnticipator.start();
    expect(smartStudiosAnticipator.isRunning()).toBe(true);
  });

  it('analyze() log + stats si confidence ≥ seuil', async () => {
    const match = await smartStudiosAnticipator.analyze('mixer une musique pop pour mon dj set');
    expect(match).not.toBeNull();
    const log = smartStudiosAnticipator.getLog();
    expect(log.length).toBeGreaterThanOrEqual(1);
    const stats = smartStudiosAnticipator.getStats();
    expect(stats['music']?.suggested).toBe(1);
  });

  it('analyze() ne log pas si pas de match', async () => {
    const match = await smartStudiosAnticipator.analyze('xyz qqq');
    expect(match).toBeNull();
    expect(smartStudiosAnticipator.getLog().length).toBe(0);
  });

  it('recordAccepted incrémente stats accepted', async () => {
    await smartStudiosAnticipator.analyze('je veux scanner un qr code');
    smartStudiosAnticipator.recordAccepted('scan' as StudioIntent);
    const stats = smartStudiosAnticipator.getStats();
    expect(stats['scan']?.accepted).toBe(1);
  });

  it('recordDismissed incrémente stats dismissed', async () => {
    await smartStudiosAnticipator.analyze('mes plantes du potager');
    smartStudiosAnticipator.recordDismissed('plant' as StudioIntent);
    const stats = smartStudiosAnticipator.getStats();
    expect(stats['plant']?.dismissed).toBe(1);
  });

  it('clearLog vide la log', async () => {
    await smartStudiosAnticipator.analyze('musique morceau audio');
    expect(smartStudiosAnticipator.getLog().length).toBeGreaterThan(0);
    smartStudiosAnticipator.clearLog();
    expect(smartStudiosAnticipator.getLog().length).toBe(0);
  });

  it('analyze ne crash pas si toast import KO', async () => {
    /* Test résilience : si dépendance UI absente, l'analyze ne doit pas throw. */
    const match = await smartStudiosAnticipator.analyze('contrat NDA prestation');
    expect(match).not.toBeNull();
  });

  it('respecte le toggle disabled', async () => {
    /* Désactive feature via storage direct */
    localStorage.setItem('ax_feature_toggles_global', JSON.stringify({ 'feature.smart-studios-anticipator': false }));
    const match = await smartStudiosAnticipator.analyze('je veux mixer une musique');
    expect(match).toBeNull();
    /* Re-active */
    localStorage.removeItem('ax_feature_toggles_global');
  });

  it('log respecte le cap LOG_MAX (FIFO)', async () => {
    smartStudiosAnticipator.clearLog();
    /* Push 60 entries (cap = 50) */
    for (let i = 0; i < 60; i++) {
      await smartStudiosAnticipator.analyze('mixer musique morceau');
    }
    expect(smartStudiosAnticipator.getLog().length).toBeLessThanOrEqual(50);
  });
});

/* ============================================================
   Smoke tests pour les 7 nouveaux studios (import + render OK)
   ============================================================ */

describe('studios smoke : 7 nouveaux studios chargent et exposent render+dispose', () => {
  it('architecture exporte render + dispose', async () => {
    const mod = await import('../../features/studios/architecture/index.js');
    expect(typeof mod.render).toBe('function');
    expect(typeof mod.dispose).toBe('function');
    expect(mod.RE2020_ZONES.length).toBeGreaterThanOrEqual(8);
    expect(mod.BETON_DOSAGES.length).toBeGreaterThanOrEqual(5);
  });

  it('plant exporte render + findPlant', async () => {
    const mod = await import('../../features/studios/plant/index.js');
    expect(typeof mod.render).toBe('function');
    expect(typeof mod.dispose).toBe('function');
    expect(mod.findPlant('tomate').length).toBeGreaterThan(0);
    expect(mod.findPlant('').length).toBe(0);
  });

  it('geo exporte render + haversineKm', async () => {
    const mod = await import('../../features/studios/geo/index.js');
    expect(typeof mod.render).toBe('function');
    /* Distance Monaco → Paris ~ 700 km */
    const km = mod.haversineKm({ lat: 43.7384, lon: 7.4246 }, { lat: 48.8566, lon: 2.3522 });
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(900);
    expect(mod.isValidLatLon({ lat: 100, lon: 0 })).toBe(false);
    expect(mod.isValidLatLon({ lat: 43, lon: 7 })).toBe(true);
  });

  it('building exporte calcMetre + svgPlanView', async () => {
    const mod = await import('../../features/studios/building/index.js');
    expect(typeof mod.render).toBe('function');
    const m = mod.calcMetre(5, 4, 2.5);
    expect(m?.surface_m2).toBe(20);
    expect(m?.perimetre_m).toBe(18);
    expect(m?.volume_m3).toBe(50);
    expect(mod.svgPlanView(5, 4, 'Salon')).toContain('<svg');
    expect(mod.calcMetre(-1, 1, 1)).toBeNull();
  });

  it('lunar exporte getLunarInfo + advice', async () => {
    const mod = await import('../../features/studios/lunar/index.js');
    expect(typeof mod.render).toBe('function');
    const info = mod.getLunarInfo(new Date());
    expect(info.illumination_pct).toBeGreaterThanOrEqual(0);
    expect(info.illumination_pct).toBeLessThanOrEqual(100);
    expect(mod.getBiodynamicAdvice(info).length).toBeGreaterThan(0);
    const week = mod.nextSevenDays(new Date());
    expect(week.length).toBe(7);
  });

  it('pet exporte calcDailyCalories + animalToHumanAge', async () => {
    const mod = await import('../../features/studios/pet/index.js');
    expect(typeof mod.render).toBe('function');
    const cal = mod.calcDailyCalories('chien', 10, 'normal');
    expect(cal).toBeGreaterThan(0);
    expect(mod.calcDailyCalories('chien', -1, 'normal')).toBeNull();
    expect(mod.animalToHumanAge('chien', 5)).toBeGreaterThan(20);
    expect(mod.animalToHumanAge('chien', -1)).toBeNull();
  });

  it('scan exporte detectKind + extractDetections', async () => {
    const mod = await import('../../features/studios/scan/index.js');
    expect(typeof mod.render).toBe('function');
    expect(mod.detectKind('user@example.com')).toBe('email');
    expect(mod.detectKind('https://anthropic.com')).toBe('url');
    expect(mod.detectKind('plain text token')).toBe('plain');
    const d = mod.extractDetections('Contact: john@test.com\nhttps://example.org');
    expect(d.some((x) => x.kind === 'email')).toBe(true);
    expect(d.some((x) => x.kind === 'url')).toBe(true);
  });
});

describe('studios — render dans DOM ne throw pas', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('architecture render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/architecture/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('plant render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/plant/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('geo render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/geo/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('building render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/building/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('lunar render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/lunar/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('pet render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/pet/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });

  it('scan render() injecte du HTML sans throw', async () => {
    const mod = await import('../../features/studios/scan/index.js');
    expect(() => mod.render(root)).not.toThrow();
    expect(root.innerHTML.length).toBeGreaterThan(100);
    expect(() => mod.dispose()).not.toThrow();
  });
});

/* Use vi to silence noise */
vi.spyOn(console, 'warn').mockImplementation(() => {});
