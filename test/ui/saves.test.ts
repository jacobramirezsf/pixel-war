// Save slots: a damaged current save falls back to the previous copy, and a slot that cannot load reports so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../../src/platform/storage.ts';

test('a broken save falls back to the previous copy and can be cleared', async () => {
  // The UI module touches the DOM at call time only; a minimal document lets the slot logic run.
  (globalThis as unknown as { document: unknown }).document = { getElementById: () => null, addEventListener: () => {}, hidden: false, querySelector: () => null };
  (globalThis as unknown as { window: unknown }).window = { addEventListener: () => {} };
  const { slotHealthy, clearSlot } = await import('../../src/ui/conquest.ts');
  const storage = new MemoryStorage();
  const app = { storage } as unknown as Parameters<typeof slotHealthy>[0];
  storage.set('realm-2', '{not json');
  assert.equal(slotHealthy(app, 2), false);
  storage.set('realm-prev-2', JSON.stringify({ v: 1 }));
  assert.equal(slotHealthy(app, 2), true, 'previous copy counts');
  clearSlot(app, 2);
  assert.equal(storage.get('realm-2'), null);
  assert.equal(storage.get('realm-prev-2'), null);
});
