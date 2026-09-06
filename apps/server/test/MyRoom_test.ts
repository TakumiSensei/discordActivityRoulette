import assert from 'node:assert/strict';
import { JWT } from '@colyseus/auth';
import { ColyseusTestServer, boot } from '@colyseus/testing';
import { Room } from '@colyseus/core';
import { Room as ClientRoom } from 'colyseus.js';
import appConfig from '../src/app.config';
import { MyRoomState } from '../src/rooms/MyRoom';
import { drawRoulette } from '../src/utils/rouletteDraw';

process.env.HISTORY_STORE = 'memory';

describe('shared roulette', () => {
  let server: ColyseusTestServer;
  let room: Room<MyRoomState>;
  let first: ClientRoom<MyRoomState>;
  let second: ClientRoom<MyRoomState>;

  before(async () => { server = await boot(appConfig, 2568); });
  after(async () => { await server.shutdown(); });
  beforeEach(async () => {
    await server.cleanup();
    server.sdk.auth.token = await JWT.sign({ id: 'test-user', username: 'Test' });
    room = await server.createRoom<MyRoomState>('my_room');
    first = await server.connectTo(room);
    second = await server.connectTo(room);
  });

  async function send(client: ClientRoom, type: string, payload: unknown = {}) {
    const received = room.waitForMessage(type);
    client.send(type, payload);
    await received;
  }

  async function eventually(condition: () => boolean) {
    const deadline = Date.now() + 3000;
    while (!condition()) {
      assert.ok(Date.now() < deadline, 'state did not synchronize');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  it('synchronizes adds/removals, trims names and rejects malformed or duplicate items', async () => {
    await send(first, 'add_item', { item: '  Alice  ' });
    await send(second, 'add_item', { item: 'Alice' });
    await send(first, 'add_item', { item: 123 });
    await send(first, 'add_item', null);
    await send(second, 'add_item', { item: 'Bob' });
    await eventually(() => first.state.roulette?.items.length === 2 && second.state.roulette?.items.length === 2);
    assert.deepEqual(Array.from(first.state.roulette.items), ['Alice', 'Bob']);
    assert.deepEqual(Array.from(second.state.roulette.items), ['Alice', 'Bob']);
    await send(second, 'remove_item', { item: 'Alice' });
    await eventually(() => first.state.roulette.items.length === 1);
    assert.deepEqual(Array.from(first.state.roulette.items), ['Bob']);
  });

  it('locks all edits and repeat spins, and shares a stable result with late joiners', async () => {
    await send(first, 'add_item', { item: 'Alice' });
    await send(second, 'add_item', { item: 'Bob' });
    await send(first, 'spin');
    const target = room.state.roulette.targetRotation;
    const result = room.state.roulette.resultItem;
    // With two items the old center-only implementation could only return these angles.
    assert.notEqual(target, 90);
    assert.notEqual(target, 270);
    await send(second, 'add_item', { item: 'Charlie' });
    await send(second, 'remove_item', { item: 'Alice' });
    await send(second, 'clear_items');
    await send(second, 'apply_history', { items: ['Replacement'] });
    await send(second, 'spin');
    assert.deepEqual(Array.from(room.state.roulette.items), ['Alice', 'Bob']);
    assert.equal(room.state.roulette.spinId, 1);
    assert.equal(room.state.roulette.targetRotation, target);
    const winnerIndex = Math.floor(((360 - target) % 360) / 180);
    assert.equal(result, room.state.roulette.items[winnerIndex]);
    const late = await server.connectTo(room);
    await eventually(() => late.state.roulette?.spinId === 1);
    assert.equal(late.state.roulette.resultItem, result);
    assert.equal(late.state.roulette.spinId, 1);
    await eventually(() => first.state.roulette?.spinId === 1 && second.state.roulette?.spinId === 1);
    for (const client of [first, second, late]) {
      assert.equal(client.state.roulette.targetRotation, target);
      assert.equal(client.state.roulette.resultItem, result);
    }
    assert.equal(first.state.roulette.resultItem, second.state.roulette.resultItem);
    await new Promise(resolve => setTimeout(resolve, 5100));
    assert.equal(room.state.roulette.isSpinning, false);
    assert.equal(room.state.roulette.resultItem, result);
    await send(second, 'remove_item', { item: 'Alice' });
    assert.deepEqual(Array.from(room.state.roulette.items), ['Bob']);
  });

  it('sends edge-adjacent stopping angles without rounding for current and late participants', async () => {
    for (let index = 0; index < 12; index++) {
      await send(first, 'add_item', { item: `Item ${index}` });
    }
    for (const edge of ['start', 'end']) {
      let calls = 0;
      const draw = drawRoulette(12, max => calls++ === 0 ? 0 : edge === 'start' ? 0 : max - 1);
      const roulette = room.state.roulette;
      roulette.targetRotation = draw.targetRotation;
      roulette.resultItem = roulette.items[draw.winnerIndex];
      roulette.spinId++;
      const late = await server.connectTo(room);
      await eventually(() => [first, second, late].every(client => client.state.roulette?.spinId === roulette.spinId));
      for (const client of [first, second, late]) {
        assert.equal(client.state.roulette.targetRotation, draw.targetRotation);
        const index = Math.floor((360 - client.state.roulette.targetRotation) / 30);
        assert.equal(client.state.roulette.items[index], client.state.roulette.resultItem);
      }
      await late.leave();
    }
  });

  it('saves a recoverable set before clear and before restoring history', async () => {
    await send(first, 'add_item', { item: '<b>Alice</b>' });
    await send(first, 'clear_items');
    assert.equal(room.state.roulette.items.length, 0);
    const saved = Array.from(room.state.roulette.history[0].items);
    assert.deepEqual(saved, ['<b>Alice</b>']);
    await send(first, 'add_item', { item: 'Bob' });
    await send(first, 'apply_history', { items: saved });
    assert.deepEqual(Array.from(room.state.roulette.items), saved);
    assert.deepEqual(Array.from(room.state.roulette.history[1].items), ['Bob']);
    await send(first, 'apply_history', null);
    await send(first, 'apply_history', { items: [null, 42, '  '] });
    assert.deepEqual(Array.from(room.state.roulette.items), saved);
  });

  it('keeps at most ten history sets and avoids consecutive duplicates', async () => {
    for (let index = 0; index < 12; index++) {
      await send(first, 'add_item', { item: `Set ${index}` });
      await send(first, 'clear_items');
    }
    assert.equal(room.state.roulette.history.length, 10);
    assert.deepEqual(Array.from(room.state.roulette.history[0].items), ['Set 2']);
    await send(first, 'add_item', { item: 'Set 11' });
    await send(first, 'clear_items');
    assert.equal(room.state.roulette.history.length, 10);
    assert.deepEqual(Array.from(room.state.roulette.history[8].items), ['Set 10']);
  });
});
