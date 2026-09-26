/**
 * Tests admin-commands-listener deep v13.4.160 (Kevin "100/100 réel").
 *
 * Module : services/admin-commands-listener.ts (168 stmts, était 60.1%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockStore, mockEvents, mockFirebase, mockAuditLog } = vi.hoisted(() => ({
  mockStore: { get: vi.fn() },
  mockEvents: { on: vi.fn(), emit: vi.fn(), eventBus: new Map() as Map<string, Array<(payload: unknown) => void>> },
  mockFirebase: { write: vi.fn() },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../core/store.js', () => ({ store: mockStore }));
vi.mock('../../core/events.js', () => ({
  events: {
    on: (event: string, handler: (payload: unknown) => void): void => {
      mockEvents.on(event, handler);
      const list = mockEvents.eventBus.get(event) ?? [];
      list.push(handler);
      mockEvents.eventBus.set(event, list);
    },
    emit: (event: string, payload: unknown): void => {
      const list = mockEvents.eventBus.get(event) ?? [];
      list.forEach((h) => h(payload));
    },
  },
}));
vi.mock('../../services/storage/firebase.js', () => ({ firebase: mockFirebase }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { adminCommandsListener } from '../../services/admin/admin-commands-listener.js';

describe('admin-commands-listener deep (v13.4.160)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockEvents.eventBus.clear();
    adminCommandsListener.__resetForTests();
    mockStore.get.mockReturnValue({ id: 'laurence_sp' });
    mockFirebase.write.mockResolvedValue(undefined);
    mockAuditLog.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    adminCommandsListener.__resetForTests();
  });

  describe('startListening', () => {
    it('idempotent', () => {
      adminCommandsListener.startListening();
      adminCommandsListener.startListening();
      expect(adminCommandsListener.isListening()).toBe(true);
    });

    it('isListening retourne true après start', () => {
      adminCommandsListener.startListening();
      expect(adminCommandsListener.isListening()).toBe(true);
    });
  });

  describe('handleCommand via firebase event', () => {
    it('ignore commande non admin Kevin', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'ax_admin_commands_pending',
        data: [{
          id: 'cmd_1',
          command: 'reset_pin',
          target_uid: 'laurence_sp',
          issued_by: 'other_user',
          ts: Date.now(),
          processed: false,
        }],
      });
      /* Wait micro-tick */
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('ignore commande pas pour ce uid', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'ax_admin_commands_pending',
        data: [{
          id: 'cmd_2',
          command: 'reset_pin',
          target_uid: 'other_target',
          issued_by: 'kdmc_admin',
          ts: Date.now(),
          processed: false,
        }],
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('ignore commande déjà processed', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'ax_admin_commands_pending',
        data: [{
          id: 'cmd_3',
          command: 'reset_pin',
          target_uid: 'laurence_sp',
          issued_by: 'kdmc_admin',
          ts: Date.now(),
          processed: true,
        }],
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('handleCommand direct ajoute id à processedIds', () => {
      /* Test direct du dispatcher privé pour confirmer flow OK */
      const cmdId = 'cmd_reset_direct';
      const handleCommand = (adminCommandsListener as unknown as { handleCommand: (c: unknown) => void }).handleCommand.bind(adminCommandsListener);
      handleCommand({
        id: cmdId,
        command: 'reset_pin',
        target_uid: 'laurence_sp',
        issued_by: 'kdmc_admin',
        ts: Date.now(),
        processed: false,
      });
      const ids = (adminCommandsListener as unknown as { processedIds: Set<string> }).processedIds;
      expect(ids.has(cmdId)).toBe(true);
    });

    it('handleCommand direct setup_account', () => {
      const cmdId = 'cmd_setup_direct';
      const handleCommand = (adminCommandsListener as unknown as { handleCommand: (c: unknown) => void }).handleCommand.bind(adminCommandsListener);
      handleCommand({
        id: cmdId,
        command: 'setup_account',
        target_uid: 'laurence_sp',
        issued_by: 'kdmc_admin',
        ts: Date.now(),
        processed: false,
        pin_hash: 'a'.repeat(64),
      });
      const ids = (adminCommandsListener as unknown as { processedIds: Set<string> }).processedIds;
      expect(ids.has(cmdId)).toBe(true);
    });

    it('refuse setup_account sans pin_hash', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'ax_admin_commands_pending',
        data: [{
          id: 'cmd_6',
          command: 'setup_account',
          target_uid: 'laurence_sp',
          issued_by: 'kdmc_admin',
          ts: Date.now(),
          processed: false,
        }],
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBeNull();
    });

    it('ignore commande sans id', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'ax_admin_commands_pending',
        data: [{
          command: 'reset_pin',
          target_uid: 'laurence_sp',
          issued_by: 'kdmc_admin',
          ts: Date.now(),
        }],
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('ignore key non pertinent', async () => {
      adminCommandsListener.startListening();
      mockEvents.emit('firebase:remote_change', {
        key: 'other_key',
        data: [{ id: 'cmd_x', command: 'reset_pin' }],
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });
  });
});
