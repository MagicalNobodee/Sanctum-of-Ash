import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LanClient } from './src/multiplayer.js';
import { createLanServer, probePublicTunnel } from '../lan-server.mjs';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import crypto from 'node:crypto';

const waitFor = async (check, timeout = 6000) => {
  const until = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < until, 'condition did not become true');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

function roomClient(t) {
  const received = [];
  const sent = [];
  const client = new LanClient({ onRelay: (from, payload) => received.push({ from, payload }) });
  Object.assign(client, { connected: true, transportMode: 'lan', clientId: 'p1', roomCode: 'TEST', hostId: 'p1',
    _relayVersion: 1, players: [{ id: 'p1', relayVersion: 1 }, { id: 'p2', isWan: true, relayVersion: 1 }],
    ws: { readyState: WebSocket.OPEN, bufferedAmount: 0, send: (raw) => sent.push(JSON.parse(raw)), close() {} } });
  t.after(() => client.disconnect(true));
  return { client, sent, received };
}

async function serverRoom(t, options = {}) {
  const server = createLanServer({ port: 0, host: '127.0.0.1', enableWan: false, ...options });
  const { port } = await server.start();
  const events = [];
  const host = new LanClient({ onRelay: (from, payload) => events.push({ from, payload }) });
  const guest = new LanClient();
  t.after(async () => {
    host.disconnect(true);
    guest.disconnect(true);
    for (const conn of server.clients.values()) conn.socket.destroy();
    await new Promise((resolve) => server.server.close(resolve));
  });
  const url = `ws://127.0.0.1:${port}/ws`;
  await host.createRoom({ name: 'host', wsUrl: url });
  await waitFor(() => host.roomCode);
  await guest.joinRoom({ name: 'guest', code: host.roomCode, wsUrl: url });
  await waitFor(() => host.players.length === 2 && guest.players.length === 2);
  return { server, host, guest, events, url };
}

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

test('silent or congested direct channels fall back to WS; fresh snapshots use the lossy channel', (t) => {
  const { client, sent } = roomClient(t);
  const direct = [];
  const state = [];
  const entry = { open: true, lastPongAt: performance.now() - 5000, pc: { connectionState: 'connected', close() {} },
    dc: { readyState: 'open', bufferedAmount: 0, send: (raw) => direct.push(JSON.parse(raw)), close() {} },
    stateDc: { readyState: 'open', bufferedAmount: 0, send: (raw) => state.push(JSON.parse(raw)) } };
  client._rtcPeers.set('p2', entry);
  client.relay({ kind: 'player_state', x: 1 });
  assert.equal(sent.length, 1);
  assert.equal(direct.length, 0);
  entry.lastPongAt = performance.now();
  client.relay({ kind: 'player_state', x: 2 });
  assert.equal(state.length, 1);
  assert.equal(sent.length, 1);
  entry.stateDc.bufferedAmount = 40000;
  client.relay({ kind: 'player_state', x: 3 });
  assert.equal(sent.length, 2);
  client.ws.bufferedAmount = 40000;
  client.relay({ kind: 'player_state', x: 4 });
  assert.equal(sent.length, 2, 'congested socket must not queue stale snapshots');
  client.relay({ kind: 'enemy_hit', damage: 7 });
  assert.equal(sent.length, 3, 'important events are not discarded as snapshots');
});

test('important events survive silent P2P, are acknowledged and execute once across paths', (t) => {
  const { client, sent, received } = roomClient(t);
  client.relay({ kind: 'enemy_hit', damage: 7 });
  const seq = sent[0].seq;
  assert.equal(client._pendingRelays.size, 1);
  client._retryPendingRelays(performance.now() + 1600);
  assert.equal(sent.length, 2);
  client._receiveRelay('p2', { kind: '__relay_ack', seq });
  assert.equal(client._pendingRelays.size, 0);
  client._receiveRelay('p2', { kind: 'revive_complete' }, 10);
  client._receiveRelay('p2', { kind: 'revive_complete' }, 10);
  client._receiveRelay('p2', { kind: 'player_state', x: 9 }, 12);
  client._receiveRelay('p2', { kind: 'player_state', x: 8 }, 11);
  client._receiveRelay('p2', { kind: 'enemy_hit', damage: 1 }, 9);
  assert.deepEqual(received.map((e) => e.payload.kind), ['revive_complete', 'player_state', 'enemy_hit']);
  assert.equal(received[1].payload.x, 9, 'late snapshots from the old path must not rewind movement');
  client._receiveRelay('outsider', { kind: 'enemy_hit' }, 4);
  assert.equal(received.length, 3);
});

test('stuck RTC offers expire and retry with backoff, rather than blocking P2P forever', (t) => {
  const { client } = roomClient(t);
  let now = 15000;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(client, '_shouldUseP2P', () => true);
  const initiate = t.mock.method(client, '_initiatePeerRtc', () => {});
  client._rtcPeers.set('p2', { createdAt: 0, lastPongAt: null, pc: { close() {} } });
  client._syncRtcPeers();
  assert.equal(client._rtcPeers.size, 0);
  assert.equal(initiate.mock.callCount(), 0);
  now += 2100;
  client._syncRtcPeers();
  assert.equal(initiate.mock.callCount(), 1);
});

test('heartbeat probes every direct peer even while the room socket is disconnected', (t) => {
  const { client } = roomClient(t);
  const ticks = [];
  t.mock.method(globalThis, 'setInterval', (callback) => { ticks.push(callback); return 1; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  client.connected = false;
  const sent = [];
  for (const id of ['p2', 'p3']) client._rtcPeers.set(id, { open: true, lastPongAt: performance.now(),
    dc: { readyState: 'open', send: (raw) => sent.push([id, JSON.parse(raw)]), close() {} }, pc: { close() {} } });
  client._startPing();
  assert.deepEqual(sent.map(([id]) => id), ['p2', 'p3']);
  assert.equal(client.p2pPeerCount, 2);
});

test('WS blackholes trigger recovery even if no close event arrives', (t) => {
  const { client } = roomClient(t);
  t.mock.method(globalThis, 'setInterval', () => 1);
  t.mock.method(globalThis, 'clearInterval', () => {});
  const schedule = t.mock.method(client, '_scheduleWsReconnect', () => {});
  client.resumeToken = 'secret';
  client._lastWsPongAt = performance.now() - 10000;
  client._startPing();
  assert.equal(client.connected, false);
  assert.equal(client.reconnectingWs, true);
  assert.equal(schedule.mock.callCount(), 1);
});

test('others never echoes gameplay locally; all delivers locally exactly once', async (t) => {
  const { client, received } = roomClient(t);
  client.relay({ kind: 'player_state', x: 1 }, 'others');
  await Promise.resolve();
  assert.equal(received.length, 0);
  client.relay({ kind: 'revive_complete' }, 'all');
  await Promise.resolve();
  assert.equal(received.length, 1);
  assert.equal(received[0].from, client.clientId);
});

test('legacy peers receive each action once without unsupported ACK retries', (t) => {
  const { client, sent } = roomClient(t);
  client.players[1].relayVersion = 0;
  const direct = t.mock.method(client, '_sendPeerDirect', () => true);
  client.relay({ kind: 'enemy_hit', damage: 7 });
  assert.equal(direct.mock.callCount(), 1);
  assert.equal(sent.length, 0);
  assert.equal(client._pendingRelays.size, 0);
  client._relayVersion = 0;
  client.players[1].relayVersion = 1;
  client.relay({ kind: 'enemy_hit', damage: 7 });
  assert.equal(sent.length, 0, 'old server may strip seq, so it cannot carry duplicate copies');
  assert.equal(client._pendingRelays.size, 0);
});

test('embedded offline rooms do not run the WebSocket failure detector', (t) => {
  const { client } = roomClient(t);
  t.mock.method(globalThis, 'setInterval', () => 1);
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(performance, 'now', () => 20000);
  client.transportMode = 'embedded';
  const finished = t.mock.method(client, '_finishDisconnected', () => {});
  client._startPing();
  assert.equal(finished.mock.callCount(), 0);
  assert.equal(client.connected, true);
});

test('real WS-only room relays both ways and resumes the same player during a run', async (t) => {
  const { server, host, guest, events } = await serverRoom(t);
  assert.ok(guest.resumeToken);
  assert.equal(guest.p2pPeerCount, 0);
  guest.relay({ kind: 'player_state', x: 42 });
  await waitFor(() => events.some((e) => e.payload.x === 42));
  host.launchRun({ floorIndex: 1, seed: 123 });
  await waitFor(() => guest.inGame);
  const id = guest.clientId;
  const token = guest.resumeToken;
  server.clients.get(id).socket.destroy();
  await waitFor(() => guest.reconnectingWs);
  guest.relay({ kind: 'enemy_hit', damage: 9 });
  await waitFor(() => !guest.reconnectingWs && guest.connected);
  await waitFor(() => events.some((e) => e.payload.damage === 9));
  await waitFor(() => !guest._pendingRelays.size);
  assert.equal(guest.clientId, id);
  assert.equal(guest.resumeToken, token);
  assert.equal(guest.inGame, true);
  assert.equal(server.rooms.get(host.roomCode).players.length, 2);
  assert.equal(events.filter((e) => e.payload.damage === 9).length, 1);
  const incoming = [];
  guest.cb.onRelay = (from, payload) => incoming.push(payload);
  host.relay({ kind: 'player_state', x: 81 });
  await waitFor(() => incoming.some((p) => p.x === 81));
});

test('both players can resume after simultaneous lobby socket loss; explicit leave does not resume', async (t) => {
  const { server, host, guest } = await serverRoom(t);
  const code = host.roomCode;
  const ids = [host.clientId, guest.clientId];
  for (const id of ids) server.clients.get(id).socket.destroy();
  await waitFor(() => host.reconnectingWs && guest.reconnectingWs);
  assert.equal(server.rooms.get(code).players.length, 2);
  await waitFor(() => !host.reconnectingWs && !guest.reconnectingWs);
  assert.deepEqual([host.clientId, guest.clientId], ids);
  assert.equal(host.roomCode, code);
  guest.leaveRoom();
  await waitFor(() => host.players.length === 1);
  assert.equal(guest.resumeToken, null);
  assert.equal(guest._wsReconnectTimer, null);
  assert.equal(guest.inRoom, false);
});

test('resume includes a run launched while the guest was offline', async (t) => {
  const { server, host, guest } = await serverRoom(t);
  const resumed = [];
  guest.cb.onRoomResumed = (message) => resumed.push(message);
  server.clients.get(guest.clientId).socket.destroy();
  await waitFor(() => guest.reconnectingWs);
  host.launchRun({ kind: 'floor_init', floorIndex: 0, seed: 876, isNewRun: true });
  await waitFor(() => resumed.length);
  assert.equal(resumed[0].lastFloorInit.seed, 876);
  assert.equal(guest.inGame, true);
});

test('bad resume tokens cannot steal a seat; expired seats fail cleanly', async (t) => {
  const { server, host, guest } = await serverRoom(t, { resumeGraceMs: 50 });
  const code = host.roomCode;
  const guestId = guest.clientId;
  const failed = [];
  guest.cb.onRoomError = (...args) => failed.push(args);
  host.sendRaw({ type: 'resume_room', code, resumeToken: 'incorrect' });
  await waitFor(() => !host.inRoom);
  assert.equal(server.rooms.get(code).players.some((p) => p.id === guestId), true);
  server.clients.get(guestId).socket.destroy();
  await waitFor(() => failed.length);
  assert.equal(failed[0][0], 'resume_failed');
  assert.equal(guest.inRoom, false);
});

test('free tunnel selection checks the origin, handles split logs and rotates exactly once on timeout', async (t) => {
  const children = [];
  const timers = new Map();
  let nextTimer = 1;
  let probeOk = false;
  const lan = createLanServer({ port: 18844, enableWan: true,
    probeTunnel: async () => probeOk,
    spawnTunnel: (command, args) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => child.emit('exit', 1);
      children.push({ child, command, args });
      return child;
    } });
  t.after(() => lan.server.emit('close'));
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    const id = nextTimer++;
    timers.set(id, { callback, ms });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  const tick = async (ms) => {
    const pair = [...timers].find(([, timer]) => timer.ms === ms);
    assert.ok(pair, `missing ${ms}ms timer`);
    timers.delete(pair[0]);
    pair[1].callback();
    await Promise.resolve();
  };
  lan.clients.set('test', { send() {} });
  lan.ensureWanTunnel();
  assert.ok(children[0].command.includes('cloudflared'));
  children[0].child.stderr.emit('data', Buffer.from('https://free-test.trycloud'));
  children[0].child.stderr.emit('data', Buffer.from('flare.com\n'));
  await Promise.resolve();
  assert.equal(lan.getWanState().wanStatus, 'connecting', 'a printed URL alone is not a working tunnel');
  await tick(20000);
  await tick(1600);
  assert.equal(children[1].args.at(-1), 'serveo.net', 'do not advance the provider twice');
  probeOk = true;
  children[1].child.stdout.emit('data', Buffer.from('https://free-test.serveousercontent.com\n'));
  await Promise.resolve();
  assert.equal(lan.getWanState().wanStatus, 'ready');
  probeOk = false;
  await tick(20000);
  await tick(20000);
  await tick(20000);
  assert.equal(children[2].args.at(-1), 'nokey@localhost.run');
  assert.equal(lan.getWanState().wanUrl, null);
  lan.stopWanTunnel();
  assert.equal(timers.size, 0);
});

test('tunnel health checks reject warning pages, other servers and aborted responses', async (t) => {
  let body = '';
  let aborted = false;
  let blockedWs = false;
  let blockedPage = false;
  let pageRedirect = false;
  t.mock.method(https, 'get', (url, opts, callback) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    queueMicrotask(() => {
      const res = new EventEmitter();
      res.statusCode = 200;
      if (url.pathname === '/') {
        res.headers = { 'x-sanctum-instance': blockedPage ? 'warning' : 'mine' };
        res.destroy = res.resume = () => {};
        if (pageRedirect && !opts.headers.Cookie) {
          res.statusCode = 302;
          res.headers = { location: '/', 'set-cookie': ['accepted=true; Path=/'] };
          callback(res);
          return;
        }
        callback(res);
        res.emit('data', Buffer.from('game html'));
        res.emit('end');
        return;
      }
      if (url.pathname === '/ws') {
        if (blockedWs) { res.resume = () => {}; req.emit('response', res); return; }
        const socket = new EventEmitter();
        socket.setNoDelay = socket.setKeepAlive = socket.destroy = () => {};
        const key = opts.headers['Sec-WebSocket-Key'];
        res.headers = { 'sec-websocket-accept': crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') };
        const raw = Buffer.from(JSON.stringify({ type: 'welcome', app: 'sanctum-of-ash-lan', instanceId: 'mine' }));
        req.emit('upgrade', res, socket, Buffer.concat([Buffer.from([0x81, raw.length]), raw]));
        return;
      }
      callback(res);
      res.emit('data', Buffer.from(body));
      res.emit(aborted ? 'aborted' : 'end');
    });
    return req;
  });
  body = '<html>Browser warning</html>';
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), false);
  body = JSON.stringify({ app: 'sanctum-of-ash-lan', instanceId: 'other' });
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), false);
  body = JSON.stringify({ app: 'sanctum-of-ash-lan', instanceId: 'mine' });
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), true);
  pageRedirect = true;
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), true, 'browser redirect cookies must be preserved');
  blockedPage = true;
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), false, 'an accessible API with a browser warning page is unusable');
  blockedPage = false;
  blockedWs = true;
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), false, 'a working page with blocked gameplay WS is unusable');
  aborted = true;
  assert.equal(await probePublicTunnel('https://example.org', 'mine'), false);
});

test('RTC sends its offer before early ICE candidates and ignores stale negotiation replies', async (t) => {
  const { client, sent } = roomClient(t);
  const previousRtc = globalThis.RTCPeerConnection;
  const channels = [];
  globalThis.RTCPeerConnection = class {
    connectionState = 'connected';
    createDataChannel(label, options) {
      channels.push({ label, options });
      return { label, close() {} };
    }
    async createOffer() { return { type: 'offer', sdp: 'test' }; }
    async setLocalDescription(description) {
      this.localDescription = description;
      this.onicecandidate({ candidate: { candidate: 'candidate:1 1 udp 1 192.168.1.2 1234 typ host' } });
    }
    async setRemoteDescription() { assert.fail('stale answer must be ignored'); }
    close() {}
  };
  t.after(() => { globalThis.RTCPeerConnection = previousRtc; });
  await client._initiatePeerRtc('p2');
  assert.deepEqual(sent.map((m) => m.payload.sig), ['offer', 'ice']);
  assert.equal(sent[0].payload.sessionId, sent[1].payload.sessionId);
  assert.deepEqual(channels[1].options, { ordered: false, maxRetransmits: 0 });
  await client._handleRtcSignal('p2', { sig: 'answer', sdp: {}, sessionId: 'stale-session' });
  const entry = client._rtcPeers.get('p2');
  entry.pc.connectionState = 'disconnected';
  entry.pc.onconnectionstatechange();
  assert.equal(entry.closed, false, 'temporary disconnection should have time to recover');
});

test('a live host can update the free tunnel URL over P2P, but other peers cannot redirect it', (t) => {
  const { client } = roomClient(t);
  client.hostId = 'p2';
  client.isWanClient = true;
  client._receiveRelay('p2', { kind: '__wan_update', url: 'https://new.trycloudflare.com' });
  assert.equal(client.wsUrl, 'wss://new.trycloudflare.com/ws');
  client.hostId = 'p1';
  client._receiveRelay('p2', { kind: '__wan_update', url: 'https://other.example.org' });
  assert.equal(client.wsUrl, 'wss://new.trycloudflare.com/ws');
});
