import { describe, it, expect } from 'vitest';
import { events } from '../../core/events.js';

describe('events', () => {
  it('on + emit', () => {
    let payload: unknown = null;
    const off = events.on('store:change', (p) => { payload = p; });
    events.emit('store:change', { key: 'x', value: 1 });
    expect(payload).toEqual({ key: 'x', value: 1 });
    off();
  });
  it('off stops handler', () => {
    let count = 0;
    const off = events.on('store:change', () => { count++; });
    events.emit('store:change', { key: 'a', value: 1 });
    off();
    events.emit('store:change', { key: 'b', value: 2 });
    expect(count).toBe(1);
  });
  it('once fires only once', () => {
    let count = 0;
    events.once('boot:complete', () => { count++; });
    events.emit('boot:complete', { ctx: {}, bootMs: 100 });
    events.emit('boot:complete', { ctx: {}, bootMs: 200 });
    expect(count).toBe(1);
  });
  it('handler crash does not break bus', () => {
    events.on('store:change', () => { throw new Error('crash'); });
    let secondCalled = false;
    events.on('store:change', () => { secondCalled = true; });
    events.emit('store:change', { key: 'x', value: 1 });
    expect(secondCalled).toBe(true);
  });
});
