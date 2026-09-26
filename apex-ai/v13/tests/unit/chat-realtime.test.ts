/**
 * Tests chat-realtime.ts (Apex Chat = WhatsApp-like Kevin).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { chatRealtime } from '../../services/ai/chat-realtime.js';

describe('Chat Realtime (DM + groupes + calls WebRTC)', () => {
  beforeEach(() => {
    localStorage.clear();
    chatRealtime.endCall(); /* cleanup any active call */
  });

  describe('DM creation', () => {
    it('createDM idempotent (même DM uid1+uid2)', () => {
      const a = chatRealtime.createDM('kevin', 'laurence');
      const b = chatRealtime.createDM('kevin', 'laurence');
      expect(a.id).toBe(b.id);
      expect(a.id).toContain('dm_');
    });

    it('DM id ordre uid stable (peu importe ordre args)', () => {
      const a = chatRealtime.createDM('kevin', 'laurence');
      const b = chatRealtime.createDM('laurence', 'kevin');
      expect(a.id).toBe(b.id);
    });

    it('DM members tri alphabétique', () => {
      const dm = chatRealtime.createDM('kevin', 'laurence');
      expect(dm.members_uids).toEqual(['kevin', 'laurence']);
    });
  });

  describe('Groups', () => {
    it('createGroup avec creator + members', () => {
      const g = chatRealtime.createGroup('Famille', 'kevin', ['laurence', 'enfant1']);
      expect(g.type).toBe('group');
      expect(g.name).toBe('Famille');
      expect(g.members_uids).toContain('kevin');
      expect(g.members_uids).toContain('laurence');
      expect(g.admin_uids).toContain('kevin');
    });

    it('addMemberToGroup admin only', () => {
      const g = chatRealtime.createGroup('Test', 'kevin', ['laurence']);
      const ok1 = chatRealtime.addMemberToGroup(g.id, 'paul', 'kevin');
      expect(ok1).toBe(true);
      const ok2 = chatRealtime.addMemberToGroup(g.id, 'eve', 'paul'); /* paul not admin */
      expect(ok2).toBe(false);
    });

    it('removeMemberFromGroup admin OR self', () => {
      const g = chatRealtime.createGroup('T', 'kevin', ['laurence', 'paul']);
      /* Self leave OK */
      const ok1 = chatRealtime.removeMemberFromGroup(g.id, 'paul', 'paul');
      expect(ok1).toBe(true);
      /* Non-admin remove autre → refuse */
      const g2 = chatRealtime.createGroup('T2', 'kevin', ['laurence', 'paul']);
      const ok2 = chatRealtime.removeMemberFromGroup(g2.id, 'paul', 'laurence');
      expect(ok2).toBe(false);
    });

    it('listConversations filter par uid', () => {
      chatRealtime.createDM('kevin', 'laurence');
      chatRealtime.createGroup('A', 'kevin', ['laurence']);
      chatRealtime.createGroup('B', 'paul', ['eve']);
      const kevList = chatRealtime.listConversations('kevin');
      expect(kevList.length).toBe(2); /* DM + groupe A */
      const paulList = chatRealtime.listConversations('paul');
      expect(paulList.length).toBe(1); /* groupe B */
    });
  });

  describe('Messages', () => {
    it('sendMessage requires member of conv', () => {
      const dm = chatRealtime.createDM('kevin', 'laurence');
      const m1 = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'kevin',
        sender_name: 'Kevin',
        type: 'text',
        content: 'hello',
      });
      expect(m1).not.toBeNull();
      const m2 = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'paul', /* not member */
        sender_name: 'Paul',
        type: 'text',
        content: 'hack',
      });
      expect(m2).toBeNull();
    });

    it('listMessages tri par ts asc + filter conversation_id', () => {
      const dm = chatRealtime.createDM('a', 'b');
      const m1 = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: 'msg1',
      });
      const m2 = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'b',
        sender_name: 'B',
        type: 'text',
        content: 'msg2',
      });
      const list = chatRealtime.listMessages(dm.id);
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe(m1?.id);
      expect(list[1]?.id).toBe(m2?.id);
    });

    it('content limit 5000 chars', () => {
      const dm = chatRealtime.createDM('a', 'b');
      const long = 'X'.repeat(10000);
      const m = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: long,
      });
      expect(m?.content.length).toBeLessThanOrEqual(5000);
    });

    it('markAsRead reset unread + add to read_by', () => {
      const dm = chatRealtime.createDM('a', 'b');
      chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: 'unread for B',
      });
      const conv = chatRealtime.getConversation(dm.id);
      expect(conv?.unread_count_per_user['b']).toBe(1);
      const count = chatRealtime.markAsRead(dm.id, 'b');
      expect(count).toBeGreaterThanOrEqual(1);
      const conv2 = chatRealtime.getConversation(dm.id);
      expect(conv2?.unread_count_per_user['b']).toBe(0);
    });

    it('reactToMessage toggle emoji', () => {
      const dm = chatRealtime.createDM('a', 'b');
      const m = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: 'react me',
      });
      expect(m).not.toBeNull();
      chatRealtime.reactToMessage(m!.id, 'b', '👍');
      const all = chatRealtime.listMessages(dm.id);
      expect(all[0]?.reactions['👍']).toContain('b');
      /* Toggle off */
      chatRealtime.reactToMessage(m!.id, 'b', '👍');
      const all2 = chatRealtime.listMessages(dm.id);
      expect(all2[0]?.reactions['👍']).not.toContain('b');
    });

    it('editMessage sender only', () => {
      const dm = chatRealtime.createDM('a', 'b');
      const m = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: 'original',
      });
      expect(chatRealtime.editMessage(m!.id, 'a', 'edited')).toBe(true);
      expect(chatRealtime.editMessage(m!.id, 'b', 'hack')).toBe(false);
      const all = chatRealtime.listMessages(dm.id);
      expect(all[0]?.content).toBe('edited');
      expect(all[0]?.edited_ts).toBeDefined();
    });

    it('deleteMessage soft delete sender only', () => {
      const dm = chatRealtime.createDM('a', 'b');
      const m = chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'a',
        sender_name: 'A',
        type: 'text',
        content: 'delete me',
      });
      expect(chatRealtime.deleteMessage(m!.id, 'a')).toBe(true);
      const all = chatRealtime.listMessages(dm.id);
      expect(all.length).toBe(0); /* deleted=true filtered out */
    });
  });

  describe('Typing indicators', () => {
    it('setTyping + isTyping window 5s', () => {
      const dm = chatRealtime.createDM('a', 'b');
      chatRealtime.setTyping(dm.id, 'a');
      expect(chatRealtime.isTyping(dm.id, 'a')).toBe(true);
      expect(chatRealtime.isTyping(dm.id, 'b')).toBe(false);
    });
  });

  describe('Calls (WebRTC env happy-dom)', () => {
    it('startCall sans MediaDevices → ok=false reason', async () => {
      const dm = chatRealtime.createDM('a', 'b');
      const r = await chatRealtime.startCall({
        conversation_id: dm.id,
        type: 'audio',
        initiator_uid: 'a',
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
    });

    it('endCall sans active → ok=false', () => {
      const r = chatRealtime.endCall();
      expect(r.ok).toBe(false);
    });

    it('isCallActive false par défaut', () => {
      expect(chatRealtime.isCallActive()).toBe(false);
    });
  });

  describe('Stats dashboard', () => {
    it('getStats agrège conversations + messages + unread', () => {
      const dm = chatRealtime.createDM('kevin', 'laurence');
      chatRealtime.sendMessage({
        conversation_id: dm.id,
        sender_uid: 'kevin',
        sender_name: 'Kevin',
        type: 'text',
        content: 'msg1',
      });
      const stats = chatRealtime.getStats('kevin');
      expect(stats.total_conversations).toBeGreaterThanOrEqual(1);
      expect(stats.total_messages).toBeGreaterThanOrEqual(1);
      expect(stats.active_call).toBe(false);
    });
  });
});
