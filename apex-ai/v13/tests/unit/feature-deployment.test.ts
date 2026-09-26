/**
 * Tests feature-deployment.ts (Kevin "boutons admin déploiement + modes IA").
 * Tests minutieux qualité expert — pas rapide.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { featureDeployment } from '../../services/auth/feature-deployment.js';

describe('Feature Deployment (boutons admin + AI modes)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Feature flags CRUD', () => {
    it('setFlag + listFlags persiste avec timestamps', () => {
      featureDeployment.setFlag({
        id: 'test_feat',
        name: 'Test Feature',
        description: 'Test',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      const all = featureDeployment.listFlags();
      expect(all.length).toBe(1);
      expect(all[0]?.created_at).toBeGreaterThan(0);
      expect(all[0]?.updated_at).toBeGreaterThan(0);
    });

    it('setFlag update si déjà existant (no duplicate)', () => {
      featureDeployment.setFlag({
        id: 'feat',
        name: 'A',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      featureDeployment.setFlag({
        id: 'feat',
        name: 'A_v2',
        description: '',
        enabled: false,
        scope: { type: 'group', group: 'all' },
      });
      const all = featureDeployment.listFlags();
      expect(all.length).toBe(1);
      expect(all[0]?.name).toBe('A_v2');
      expect(all[0]?.enabled).toBe(false);
    });

    it('toggleFlag enable/disable', () => {
      featureDeployment.setFlag({
        id: 'tog',
        name: 'X',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      expect(featureDeployment.toggleFlag('tog', false)).toBe(true);
      expect(featureDeployment.listFlags()[0]?.enabled).toBe(false);
    });

    it('toggleFlag inconnu → false', () => {
      expect(featureDeployment.toggleFlag('inexistant', true)).toBe(false);
    });

    it('deleteFlag retire entry', () => {
      featureDeployment.setFlag({
        id: 'del_test',
        name: 'Del',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      expect(featureDeployment.deleteFlag('del_test')).toBe(true);
      expect(featureDeployment.listFlags().length).toBe(0);
      expect(featureDeployment.deleteFlag('del_test')).toBe(false); /* idempotent */
    });
  });

  describe('isEnabled : Admin Kevin TOUJOURS toutes features', () => {
    it('admin Kevin → true même feature désactivée', () => {
      featureDeployment.setFlag({
        id: 'kill_test',
        name: 'Killed',
        description: '',
        enabled: false,
        scope: { type: 'group', group: 'all' },
      });
      expect(featureDeployment.isEnabled('kill_test', 'kdmc_admin')).toBe(true);
      expect(featureDeployment.isEnabled('kill_test', 'autre', 'admin')).toBe(true);
    });

    it('admin Kevin → true même feature inexistante (jamais bloqué)', () => {
      expect(featureDeployment.isEnabled('inexistant_xyz', 'kdmc_admin')).toBe(true);
    });
  });

  describe('isEnabled scope user', () => {
    it('scope user uid match → true', () => {
      featureDeployment.setFlag({
        id: 'beta',
        name: 'Beta',
        description: '',
        enabled: true,
        scope: { type: 'user', uid: 'kevin_beta' },
      });
      expect(featureDeployment.isEnabled('beta', 'kevin_beta')).toBe(true);
      expect(featureDeployment.isEnabled('beta', 'autre')).toBe(false);
    });
  });

  describe('isEnabled scope group', () => {
    it('group=all → true pour tous', () => {
      featureDeployment.setFlag({
        id: 'pub',
        name: 'Public',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      expect(featureDeployment.isEnabled('pub', 'u1', 'family')).toBe(true);
      expect(featureDeployment.isEnabled('pub', 'u2', 'client_free')).toBe(true);
    });

    it('group=family → true seulement family', () => {
      featureDeployment.setFlag({
        id: 'fam',
        name: 'Family Only',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'family' },
      });
      expect(featureDeployment.isEnabled('fam', 'u1', 'family')).toBe(true);
      expect(featureDeployment.isEnabled('fam', 'u2', 'client_pro')).toBe(false);
    });

    it('group=pro_clients restreint', () => {
      featureDeployment.setFlag({
        id: 'pro',
        name: 'Pro',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'pro_clients' },
      });
      expect(featureDeployment.isEnabled('pro', 'u1', 'client_pro')).toBe(true);
      expect(featureDeployment.isEnabled('pro', 'u2', 'client_free')).toBe(false);
    });
  });

  describe('isEnabled scope rollout (déterministe)', () => {
    it('rollout 100% → tous activés', () => {
      featureDeployment.setFlag({
        id: 'roll',
        name: 'R',
        description: '',
        enabled: true,
        scope: { type: 'rollout', pct: 100 },
      });
      expect(featureDeployment.isEnabled('roll', 'u1')).toBe(true);
      expect(featureDeployment.isEnabled('roll', 'u2')).toBe(true);
    });

    it('rollout 0% → personne activé', () => {
      featureDeployment.setFlag({
        id: 'no_roll',
        name: 'NR',
        description: '',
        enabled: true,
        scope: { type: 'rollout', pct: 0 },
      });
      expect(featureDeployment.isEnabled('no_roll', 'u1')).toBe(false);
      expect(featureDeployment.isEnabled('no_roll', 'u2')).toBe(false);
    });

    it('rollout deterministe : même uid → même résultat', () => {
      featureDeployment.setFlag({
        id: 'r50',
        name: '50%',
        description: '',
        enabled: true,
        scope: { type: 'rollout', pct: 50 },
      });
      const r1 = featureDeployment.isEnabled('r50', 'kevin');
      const r2 = featureDeployment.isEnabled('r50', 'kevin');
      const r3 = featureDeployment.isEnabled('r50', 'kevin');
      expect(r1).toBe(r2);
      expect(r2).toBe(r3); /* Stickiness */
    });
  });

  describe('Kill switch + setRolloutPct', () => {
    it('killSwitch désactive + audit log entry', () => {
      featureDeployment.setFlag({
        id: 'critical',
        name: 'Critical',
        description: '',
        enabled: true,
        scope: { type: 'group', group: 'all' },
      });
      const ok = featureDeployment.killSwitch('critical', 'Bug détecté');
      expect(ok).toBe(true);
      expect(featureDeployment.listFlags()[0]?.enabled).toBe(false);
    });

    it('setRolloutPct ajuste pct + valide [0, 100]', () => {
      featureDeployment.setFlag({
        id: 'r',
        name: 'R',
        description: '',
        enabled: true,
        scope: { type: 'rollout', pct: 10 },
      });
      expect(featureDeployment.setRolloutPct('r', 50)).toBe(true);
      const flag = featureDeployment.listFlags()[0];
      if (flag?.scope.type === 'rollout') {
        expect(flag.scope.pct).toBe(50);
      }
      expect(featureDeployment.setRolloutPct('r', 150)).toBe(false);
      expect(featureDeployment.setRolloutPct('r', -10)).toBe(false);
    });
  });

  describe('AI Modes (admin TOUJOURS optimal)', () => {
    it('admin Kevin → admin_optimal jamais autre', () => {
      featureDeployment.setAiMode('kdmc_admin', 'economic'); /* refused */
      expect(featureDeployment.getAiMode('kdmc_admin')).toBe('admin_optimal');
      expect(featureDeployment.getAiMode(null, 'admin')).toBe('admin_optimal');
    });

    it('client_pro default → performance', () => {
      expect(featureDeployment.getAiMode('u1', 'client_pro')).toBe('performance');
      expect(featureDeployment.getAiMode('u2', 'pro')).toBe('performance');
    });

    it('family default → normal', () => {
      expect(featureDeployment.getAiMode('u1', 'family')).toBe('normal');
      expect(featureDeployment.getAiMode('u2', 'laurence')).toBe('normal');
    });

    it('client_free default → economic', () => {
      expect(featureDeployment.getAiMode('u1', 'client_free')).toBe('economic');
      expect(featureDeployment.getAiMode(null)).toBe('economic');
    });

    it('setAiMode user persist + getAiMode reflète préférence', () => {
      const ok = featureDeployment.setAiMode('user1', 'performance');
      expect(ok).toBe(true);
      expect(featureDeployment.getAiMode('user1', 'client_free')).toBe('performance');
    });

    it('setAiMode invalide refuse', () => {
      const ok = featureDeployment.setAiMode('user2', 'unknown_mode' as 'normal');
      expect(ok).toBe(false);
    });

    it('setAiMode admin Kevin refusé (jamais downgrade)', () => {
      const ok = featureDeployment.setAiMode('kdmc_admin', 'economic');
      expect(ok).toBe(false);
      expect(featureDeployment.getAiMode('kdmc_admin')).toBe('admin_optimal');
    });

    it('getAiModeConfig retourne provider + model + max_tokens', () => {
      const cfg = featureDeployment.getAiModeConfig('admin_optimal');
      expect(cfg.provider).toBe('anthropic');
      expect(cfg.model).toBe('claude-opus-4-8');
      expect(cfg.max_tokens).toBe(8192);
    });

    it('listAiModes retourne 4 modes', () => {
      const modes = featureDeployment.listAiModes();
      expect(modes.length).toBe(4);
      expect(modes.map((m) => m.mode)).toEqual([
        'admin_optimal',
        'performance',
        'normal',
        'economic',
      ]);
    });
  });

  describe('Stats admin dashboard', () => {
    it('stats vides retourne defaults', () => {
      const s = featureDeployment.getStats();
      expect(s.total_flags).toBe(0);
      expect(s.enabled_flags).toBe(0);
    });

    it('stats avec flags reflète enabled/disabled + by_scope', () => {
      featureDeployment.setFlag({
        id: 'a',
        name: '',
        description: '',
        enabled: true,
        scope: { type: 'user', uid: 'u' },
      });
      featureDeployment.setFlag({
        id: 'b',
        name: '',
        description: '',
        enabled: false,
        scope: { type: 'group', group: 'all' },
      });
      featureDeployment.setFlag({
        id: 'c',
        name: '',
        description: '',
        enabled: true,
        scope: { type: 'rollout', pct: 50 },
      });
      const s = featureDeployment.getStats();
      expect(s.total_flags).toBe(3);
      expect(s.enabled_flags).toBe(2);
      expect(s.disabled_flags).toBe(1);
      expect(s.by_scope['user']).toBe(1);
      expect(s.by_scope['group']).toBe(1);
      expect(s.by_scope['rollout']).toBe(1);
    });
  });
});
