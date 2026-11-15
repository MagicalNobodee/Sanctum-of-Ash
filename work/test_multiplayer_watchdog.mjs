import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LanClient } from './src/multiplayer.js';

test('connection checks restart without duplication and stop on disconnect', (t) => {
  const timers = new Map();
  let nextId = 1;
  t.mock.method(globalThis, 'setInterval', (callback) => {
    const id = nextId++;
    timers.set(id, callback);
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));
  const client = new LanClient();
  const sync = t.mock.method(client, '_syncRtcPeers', () => {});
  client._startRtcWatchdog();
  client._startRtcWatchdog();
  assert.equal(timers.size, 1);
  const tick = [...timers.values()][0];
  tick();
  assert.equal(sync.mock.callCount(), 0);
  client.connected = true;
  tick();
  assert.equal(sync.mock.callCount(), 1);
  client.disconnect(true);
  assert.equal(timers.size, 0);
  assert.equal(client._rtcWatchdogTimer, null);
});
