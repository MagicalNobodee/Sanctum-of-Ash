#!/usr/bin/env node
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const APP_ID = 'sanctum-of-ash-lan';
export const DEFAULT_PORT = 18765;
export const CANDIDATE_PORTS = [18765, 18766, 18767, 18768];
const MAX_PLAYERS = 4;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function parsePortArg() {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = Number(process.argv[idx + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return { port: p, explicit: true };
  }
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) return { port: envPort, explicit: true };
  return { port: DEFAULT_PORT, explicit: false };
}

function probeExistingSanctumServer(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/lan-info`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          resolve(data && data.app === APP_ID && data.ok ? data : null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function checkLoopbackFree(port) {
  if (port === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.listen(port, '127.0.0.1', () => {
      tester.close(() => resolve(true));
    });
  });
}

export function getLanAddresses(port) {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const fam = typeof net.family === 'string' ? net.family : (net.family === 4 ? 'IPv4' : 'IPv6');
      if (fam === 'IPv4' && !net.internal && net.address) {
        ips.push(net.address);
      }
    }
  }
  const isPrivateLan = (ip) => (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
  const uniqueIps = [...new Set(ips)]// prioritize real Wi-Fi/LAN IPs over virtual TUN interfaces
    .filter((ip) => !ip.startsWith('169.254.') && !ip.startsWith('198.18.') && !ip.startsWith('198.19.'))
    .sort((a, b) => Number(isPrivateLan(b)) - Number(isPrivateLan(a)));
  const urls = uniqueIps.map((ip) => `http://${ip}:${port}`);
  urls.push(`http://127.0.0.1:${port}`);
  return { ips: uniqueIps, urls };
}

function isWanUpgradeRequest(req) {
  if (!req || !req.headers) return false;
  if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return true;
  if (req.headers['x-forwarded-proto'] === 'https') return true;
  const rawHost = String(req.headers.host || '').split(':')[0].trim().toLowerCase();
  if (!rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1') return false;
  if (
    rawHost.startsWith('192.168.') ||
    rawHost.startsWith('10.') ||
    rawHost.startsWith('198.18.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(rawHost)
  ) {
    return false;
  }
  return true;
}

function encodeWsFrame(payloadStr, opcode = 0x01) {
  const payload = Buffer.isBuffer(payloadStr) ? payloadStr : Buffer.from(String(payloadStr), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class WsConnection {
  constructor(socket, id) {
    this.socket = socket;
    this.id = id;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.closed = false;
    this.roomCode = null;

    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15000);
  }

  isBackpressured(limitBytes = 20480) {
    if (this.closed || !this.socket || this.socket.destroyed) return true;
    return (this.socket.writableLength || 0) > limitBytes;
  }

  send(obj, opts = null) {
    if (this.closed || this.socket.destroyed) return;
    if (opts && opts.droppable && this.isBackpressured(opts.maxBuffer || 18432)) {
      return;
    }
    try {
      const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
      this.socket.write(encodeWsFrame(raw, 0x01));
    } catch (_) {
      this.close();
    }
  }

  sendRawFrame(buf, opcode) {
    if (this.closed || this.socket.destroyed) return;
    try {
      this.socket.write(encodeWsFrame(buf, opcode));
    } catch (_) {
      this.close();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (!this.socket.destroyed) {
        this.socket.write(encodeWsFrame(Buffer.alloc(0), 0x08));
        this.socket.end();
      }
    } catch (_) {
      try { this.socket.destroy(); } catch (__) {}
    }
  }

  feed(chunk, onMessage, onClose) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        const bigLen = this.buffer.readBigUInt64BE(2);
        if (bigLen > 8_000_000n) {
          this.close();
          onClose();
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      const frameTotal = offset + maskLen + payloadLen;
      if (this.buffer.length < frameTotal) return;

      let payload = this.buffer.subarray(offset + maskLen, frameTotal);
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ mask[i & 3];
        }
        payload = unmasked;
      } else {
        payload = Buffer.from(payload);
      }

      this.buffer = this.buffer.subarray(frameTotal);

      if (opcode === 0x08) {
        this.close();
        onClose();
        return;
      }
      if (opcode === 0x09) {
        this.sendRawFrame(payload, 0x0a);
        continue;
      }
      if (opcode === 0x0a) {
        continue;
      }

      if (opcode === 0x01 || opcode === 0x00) {
        this.fragments.push(payload);
        if (fin) {
          const full = this.fragments.length === 1
            ? this.fragments[0]
            : Buffer.concat(this.fragments);
          this.fragments = [];
          onMessage(full.toString('utf8'));
        }
      }
    }
  }
}

export function createLanServer({ port = DEFAULT_PORT, host = '0.0.0.0', enableWan = null } = {}) {
  const clients = new Map();
  const rooms = new Map();
  const fileCache = new Map();
  let clientSeq = 1;
  const wanAllowed = enableWan !== null
    ? !!enableWan
    : (!process.argv.includes('--no-wan') && (process.argv.includes('--wan') || !parsePortArg().explicit));

  let wanStatus = 'idle';
  let wanUrl = null;
  let wanProc = null;
  let wanProviderIdx = 0;
  let wanRetryTimer = null;
  let wanBootTimer = null;
  let wanClosing = false;
  let lastActiveAt = Date.now();

  const WAN_PROVIDERS = [
    {
      id: 'serveo',
      target: 'serveo.net',
      urlRe: /https:\/\/[a-z0-9.-]+\.serveo[a-z0-9.-]*/i
    },
    {
      id: 'lhr',
      target: 'nokey@localhost.run',
      urlRe: /https:\/\/[a-z0-9.-]+\.lhr\.life/i
    }
  ];

  function getCachedHtmlAsset(filePath) {
    const stat = fs.statSync(filePath);
    const prev = fileCache.get(filePath);
    if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
      return prev;
    }
    const raw = fs.readFileSync(filePath);
    const br = zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
    });
    const gz = zlib.gzipSync(raw, { level: 6 });
    const entry = { mtimeMs: stat.mtimeMs, size: stat.size, raw, br, gz };
    fileCache.set(filePath, entry);
    return entry;
  }

  function broadcastWanStatus() {
    const pkt = JSON.stringify({ type: 'wan_status', wanStatus, wanUrl });
    for (const conn of clients.values()) {
      conn.send(pkt);
    }
  }

  function touchActivity() {
    lastActiveAt = Date.now();
  }

  function stopWanTunnel(resetToIdle = true) {
    if (wanRetryTimer) {
      clearTimeout(wanRetryTimer);
      wanRetryTimer = null;
    }
    if (wanBootTimer) {
      clearTimeout(wanBootTimer);
      wanBootTimer = null;
    }
    if (wanProc) {
      const p = wanProc;
      wanProc = null;
      try { p.kill('SIGTERM'); } catch (_) {}
    }
    if (resetToIdle) {
      const changed = wanStatus !== 'idle' || wanUrl !== null;
      wanStatus = 'idle';
      wanUrl = null;
      if (changed) broadcastWanStatus();
    }
  }

  function ensureWanTunnel({ forceRestart = false, forceAllow = false } = {}) {
    if (wanClosing) return;
    if (!wanAllowed && !forceAllow) return;
    touchActivity();
    if (!forceRestart && (wanStatus === 'ready' || wanStatus === 'connecting') && wanProc) {
      return;
    }
    stopWanTunnel(false);
    const p = actualPort();
    if (!p || p <= 0) return;

    const provider = WAN_PROVIDERS[wanProviderIdx % WAN_PROVIDERS.length];
    wanStatus = 'connecting';
    wanUrl = null;
    broadcastWanStatus();

    const sshArgs = [
      '-T',
      '-C',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'TCPKeepAlive=yes',
      '-o', 'ServerAliveInterval=12',
      '-o', 'ServerAliveCountMax=4',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ConnectTimeout=8',
      '-R', `80:127.0.0.1:${p}`,
      provider.target
    ];

    let child;
    try {
      child = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) {
      wanStatus = 'error';
      broadcastWanStatus();
      return;
    }
    wanProc = child;
    let matchedUrl = false;

    const onChunk = (buf) => {
      if (wanProc !== child) return;
      const text = buf.toString('utf8');
      const m = text.match(provider.urlRe);
      if (m && !matchedUrl) {
        matchedUrl = true;
        if (wanBootTimer) {
          clearTimeout(wanBootTimer);
          wanBootTimer = null;
        }
        wanUrl = m[0].replace(/\/+$/, '');
        wanStatus = 'ready';
        broadcastWanStatus();
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    wanBootTimer = setTimeout(() => {
      if (wanProc === child && !matchedUrl) {
        wanProviderIdx = (wanProviderIdx + 1) % WAN_PROVIDERS.length;
        try { child.kill('SIGTERM'); } catch (_) {}
      }
    }, 9500);

    const onExit = () => {
      if (wanProc !== child) return;
      wanProc = null;
      if (wanBootTimer) {
        clearTimeout(wanBootTimer);
        wanBootTimer = null;
      }
      if (wanClosing) return;
      if (!matchedUrl) {
        wanProviderIdx = (wanProviderIdx + 1) % WAN_PROVIDERS.length;
      }
      const hasActiveUsers = rooms.size > 0 || clients.size > 0;
      if (hasActiveUsers && (wanAllowed || forceAllow)) {
        wanStatus = 'connecting';
        wanUrl = null;
        broadcastWanStatus();
        wanRetryTimer = setTimeout(() => {
          wanRetryTimer = null;
          ensureWanTunnel({ forceAllow });
        }, 1600);
      } else {
        wanStatus = 'idle';
        wanUrl = null;
        broadcastWanStatus();
      }
    };
    child.once('exit', onExit);
    child.once('error', onExit);
  }

  const idleSweepTimer = setInterval(() => {
    if (wanProc && rooms.size === 0 && clients.size === 0 && Date.now() - lastActiveAt > 30 * 60 * 1000) {
      stopWanTunnel(true);
    }
  }, 60 * 1000);
  if (idleSweepTimer.unref) idleSweepTimer.unref();

  function genRoomCode(preferred = '') {
    const clean = String(preferred || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (clean.length >= 3 && !rooms.has(clean)) return clean;
    for (let attempt = 0; attempt < 60; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
      }
      if (!rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-3).toUpperCase()}`;
  }

  function serializeRoomSummary(room) {
    const hostPlayer = room.players.find((p) => p.id === room.hostId) || room.players[0];
    return {
      code: room.code,
      hostId: room.hostId,
      hostName: hostPlayer ? hostPlayer.name : 'Host',
      playerCount: room.players.length,
      maxPlayers: MAX_PLAYERS,
      inGame: room.inGame,
      floorIndex: room.floorIndex || 0,
      biomeId: room.biomeId || null
    };
  }

  function listPublicRooms() {
    const out = [];
    for (const room of rooms.values()) {
      if (room.players.length > 0 && room.players.length < MAX_PLAYERS) {
        out.push(serializeRoomSummary(room));
      }
    }
    return out;
  }

  function serializeLobbyState(room) {
    const lanInfo = getLanAddresses(actualPort());
    return {
      type: 'lobby_state',
      code: room.code,
      hostId: room.hostId,
      inGame: room.inGame,
      floorIndex: room.floorIndex,
      biomeId: room.biomeId,
      maxPlayers: MAX_PLAYERS,
      lanUrls: lanInfo.urls,
      wanUrl,
      wanStatus,
      players: room.players.map((p, idx) => ({
        id: p.id,
        slot: idx,
        name: p.name,
        themeIdx: p.themeIdx,
        classId: p.classId || null,
        ready: p.ready,
        isHost: p.id === room.hostId,
        isWan: !!p.isWan,
        reconnecting: !!p.reconnecting
      }))
    };
  }

  function broadcastRoom(room, msg, excludeId = null, sendOpts = null) {
    const raw = JSON.stringify(msg);
    for (const p of room.players) {
      if (p.id === excludeId) continue;
      const conn = clients.get(p.id);
      if (conn) conn.send(raw, sendOpts);
    }
  }

  function broadcastIdleRoomsList() {
    const msg = JSON.stringify({ type: 'rooms_list', rooms: listPublicRooms() });
    for (const conn of clients.values()) {
      if (!conn.roomCode) conn.send(msg);
    }
  }

  function pickFreeTheme(room, preferredTheme) {
    const used = new Set(room.players.map((p) => p.themeIdx));
    if (Number.isInteger(preferredTheme) && preferredTheme >= 0 && preferredTheme < 4 && !used.has(preferredTheme)) {
      return preferredTheme;
    }
    for (let t = 0; t < 4; t++) {
      if (!used.has(t)) return t;
    }
    return room.players.length % 4;
  }

  function finalizePlayerDeparture(room, playerId) {
    if (!room) return;
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const departed = room.players[idx];
    if (departed.graceTimer) {
      clearTimeout(departed.graceTimer);
      departed.graceTimer = null;
    }
    room.players.splice(idx, 1);

    if (room.players.length === 0 || room.players.every((p) => p.reconnecting)) {
      for (const p of room.players) {
        if (p.graceTimer) clearTimeout(p.graceTimer);
      }
      rooms.delete(room.code);
      broadcastIdleRoomsList();
      return;
    }

    let hostChanged = false;
    if (room.hostId === departed.id) {
      const nextHost = room.players.find((p) => !p.reconnecting) || room.players[0];
      room.hostId = nextHost.id;
      nextHost.ready = true;
      hostChanged = true;
    }

    broadcastRoom(room, {
      type: 'player_left',
      playerId: departed.id,
      playerName: departed.name,
      hostId: room.hostId,
      hostChanged,
      playerCount: room.players.length
    });
    broadcastRoom(room, serializeLobbyState(room));
    broadcastIdleRoomsList();
  }

  function removeClientFromRoom(conn, { allowGrace = false } = {}) {
    const code = conn.roomCode;
    if (!code) return;
    conn.roomCode = null;
    const room = rooms.get(code);
    if (!room) return;

    const idx = room.players.findIndex((p) => p.id === conn.id);
    if (idx === -1) return;
    const player = room.players[idx];

    if (allowGrace && player.resumeToken && (player.isWan || room.inGame)) {
      player.reconnecting = true;
      if (player.graceTimer) clearTimeout(player.graceTimer);
      player.graceTimer = setTimeout(() => {
        player.graceTimer = null;
        if (player.reconnecting) {
          finalizePlayerDeparture(room, player.id);
        }
      }, 45000);
      if (player.graceTimer.unref) player.graceTimer.unref();
      broadcastRoom(room, serializeLobbyState(room), player.id);
      return;
    }

    finalizePlayerDeparture(room, conn.id);
  }

  function handleWsMessage(conn, rawText) {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch (_) {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'ping_check') {
      conn.send({ type: 'pong_check', clientTs: msg.clientTs, serverTs: Date.now() });
      return;
    }

    if (msg.type === 'list_rooms') {
      touchActivity();
      conn.send({ type: 'rooms_list', rooms: listPublicRooms() });
      return;
    }

    if (msg.type === 'ensure_wan') {
      ensureWanTunnel({ forceRestart: !!msg.refresh, forceAllow: !!msg.force });
      conn.send({ type: 'wan_status', wanStatus, wanUrl });
      return;
    }

    if (msg.type === 'create_room') {
      touchActivity();
      ensureWanTunnel();
      removeClientFromRoom(conn);
      const code = genRoomCode(msg.preferredCode);
      const name = String(msg.name || 'P1').trim().slice(0, 18) || 'P1';
      const themeIdx = Number.isInteger(msg.themeIdx) ? (msg.themeIdx & 3) : 0;
      const classId = typeof msg.classId === 'string' && msg.classId.trim() ? msg.classId.trim().slice(0, 32) : null;
      const resumeToken = crypto.randomBytes(12).toString('hex');
      const room = {
        code,
        hostId: conn.id,
        inGame: false,
        floorIndex: 0,
        biomeId: null,
        lastFloorInit: null,
        players: [
          {
            id: conn.id,
            name,
            themeIdx,
            classId,
            ready: true,
            isWan: !!(conn.isWan || msg.isWan),
            resumeToken,
            reconnecting: false,
            graceTimer: null
          }
        ]
      };
      rooms.set(code, room);
      conn.roomCode = code;
      conn.send({
        type: 'room_joined',
        code,
        clientId: conn.id,
        hostId: room.hostId,
        slot: 0,
        themeIdx,
        resumeToken
      });
      broadcastRoom(room, serializeLobbyState(room));
      broadcastIdleRoomsList();
      return;
    }

    if (msg.type === 'resume_room') {
      touchActivity();
      const code = String(msg.code || '').trim().toUpperCase();
      const token = String(msg.resumeToken || '').trim();
      const room = rooms.get(code);
      if (!room || !token) {
        conn.send({ type: 'resume_failed', code });
        return;
      }
      const slot = room.players.findIndex((p) => p.resumeToken === token);
      if (slot === -1) {
        conn.send({ type: 'resume_failed', code });
        return;
      }
      const player = room.players[slot];
      if (player.graceTimer) {
        clearTimeout(player.graceTimer);
        player.graceTimer = null;
      }
      if (conn.id !== player.id) {
        const prevConn = clients.get(player.id);
        if (prevConn && prevConn !== conn) {
          prevConn.roomCode = null;
          try { prevConn.close(); } catch (_) {}
        }
        clients.delete(conn.id);
        conn.id = player.id;
        clients.set(conn.id, conn);
      }
      player.reconnecting = false;
      player.isWan = !!(conn.isWan || msg.isWan || player.isWan);
      conn.roomCode = code;
      conn.send({
        type: 'room_resumed',
        code,
        clientId: conn.id,
        hostId: room.hostId,
        slot,
        themeIdx: player.themeIdx,
        inGame: room.inGame,
        resumeToken: player.resumeToken
      });
      broadcastRoom(room, serializeLobbyState(room));
      return;
    }

    if (msg.type === 'join_room') {
      touchActivity();
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        conn.send({ type: 'room_error', reason: 'not_found', code });
        return;
      }
      if (room.players.length >= MAX_PLAYERS) {
        conn.send({ type: 'room_error', reason: 'full', code });
        return;
      }
      removeClientFromRoom(conn);
      const slot = room.players.length;
      const themeIdx = pickFreeTheme(room, msg.themeIdx);
      const fallbackName = `P${slot + 1}`;
      const name = String(msg.name || fallbackName).trim().slice(0, 18) || fallbackName;
      const classId = typeof msg.classId === 'string' && msg.classId.trim() ? msg.classId.trim().slice(0, 32) : null;
      const resumeToken = crypto.randomBytes(12).toString('hex');
      const newPlayer = {
        id: conn.id,
        name,
        themeIdx,
        classId,
        ready: !!msg.autoReady || room.inGame,
        isWan: !!(conn.isWan || msg.isWan),
        resumeToken,
        reconnecting: false,
        graceTimer: null
      };
      room.players.push(newPlayer);
      conn.roomCode = code;

      conn.send({
        type: 'room_joined',
        code,
        clientId: conn.id,
        hostId: room.hostId,
        slot,
        themeIdx,
        inGame: room.inGame,
        lastFloorInit: room.lastFloorInit,
        resumeToken
      });
      broadcastRoom(room, {
        type: 'player_joined',
        player: {
          id: newPlayer.id,
          slot,
          name: newPlayer.name,
          themeIdx: newPlayer.themeIdx,
          classId: newPlayer.classId,
          ready: newPlayer.ready,
          isHost: false,
          isWan: !!newPlayer.isWan
        },
        playerCount: room.players.length
      }, conn.id);
      broadcastRoom(room, serializeLobbyState(room));
      broadcastIdleRoomsList();
      return;
    }

    if (msg.type === 'leave_room') {
      removeClientFromRoom(conn);
      conn.send({ type: 'room_left', rooms: listPublicRooms() });
      return;
    }

    const room = conn.roomCode ? rooms.get(conn.roomCode) : null;
    if (!room) return;
    const me = room.players.find((p) => p.id === conn.id);
    if (!me) return;

    if (msg.type === 'update_profile') {
      if (typeof msg.name === 'string' && msg.name.trim()) {
        me.name = msg.name.trim().slice(0, 18);
      }
      if (Number.isInteger(msg.themeIdx) && msg.themeIdx >= 0 && msg.themeIdx < 4) {
        me.themeIdx = msg.themeIdx;
      }
      if (typeof msg.classId === 'string' && msg.classId.trim()) {
        me.classId = msg.classId.trim().slice(0, 32);
      }
      if (typeof msg.ready === 'boolean') {
        me.ready = me.id === room.hostId ? true : msg.ready;
      }
      broadcastRoom(room, serializeLobbyState(room));
      return;
    }

    if (msg.type === 'launch_run') {
      if (conn.id !== room.hostId) return;
      room.inGame = true;
      if (msg.floorInit) {
        room.lastFloorInit = msg.floorInit;
        room.floorIndex = msg.floorInit.floorIndex || 0;
        room.biomeId = msg.floorInit.biomeId || null;
      }
      broadcastRoom(room, {
        type: 'run_launched',
        hostId: room.hostId,
        playerCount: room.players.length,
        players: serializeLobbyState(room).players,
        floorInit: msg.floorInit || null
      });
      broadcastIdleRoomsList();
      return;
    }

    if (msg.type === 'return_lobby') {
      if (conn.id !== room.hostId) return;
      room.inGame = false;
      room.lastFloorInit = null;
      broadcastRoom(room, serializeLobbyState(room));
      broadcastIdleRoomsList();
      return;
    }

    if (msg.type === 'relay') {
      const payload = msg.payload;
      if (!payload || typeof payload !== 'object') return;
      if (payload.kind === 'floor_init' && conn.id === room.hostId) {
        room.lastFloorInit = payload;
        room.floorIndex = payload.floorIndex || 0;
        room.biomeId = payload.biomeId || null;
      }
      const isEphemeral = !!msg.ephemeral || payload.kind === 'player_state' || payload.kind === 'enemies_sync' || payload.kind === 'p' || payload.kind === 'e';
      const sendOpts = isEphemeral ? { droppable: true, maxBuffer: 18432 } : null;
      const envelope = {
        type: 'relay',
        from: conn.id,
        payload
      };
      const target = msg.target || 'others';
      if (target === 'all') {
        broadcastRoom(room, envelope, null, sendOpts);
      } else if (target === 'others') {
        broadcastRoom(room, envelope, conn.id, sendOpts);
      } else if (target === 'host') {
        const hostConn = clients.get(room.hostId);
        if (hostConn) hostConn.send(envelope, sendOpts);
      } else {
        const dest = clients.get(target);
        if (dest && dest.roomCode === room.code) dest.send(envelope, sendOpts);
      }
    }
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/lan-info') {
      const p = actualPort();
      const info = getLanAddresses(p);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        app: APP_ID,
        port: p,
        lanIps: info.ips,
        urls: info.urls,
        wanUrl,
        wanStatus,
        roomCount: rooms.size,
        rooms: listPublicRooms()
      }));
      return;
    }

    if (pathname === '/api/wan-tunnel') {
      const force = parsedUrl.searchParams.get('force') === '1';
      const refresh = parsedUrl.searchParams.get('refresh') === '1';
      ensureWanTunnel({ forceRestart: refresh, forceAllow: force || true });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, wanStatus, wanUrl }));
      return;
    }

    if (pathname === '/api/rooms') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: listPublicRooms() }));
      return;
    }

    let targetFile = null;
    const isShortRoomPath = /^\/[A-Za-z0-9]{3,6}\/?$/.test(pathname) && pathname.toLowerCase() !== '/ws';
    if (pathname === '/' || pathname === '/index.html' || pathname === '/sanctum-of-ash.html' || isShortRoomPath) {
      targetFile = path.join(OUTPUTS_DIR, 'sanctum-of-ash.html');
    } else if (pathname === '/biome-showcase.html') {
      targetFile = path.join(OUTPUTS_DIR, 'biome-showcase.html');
    }

    if (targetFile && fs.existsSync(targetFile)) {
      const asset = getCachedHtmlAsset(targetFile);
      const acceptEnc = String(req.headers['accept-encoding'] || '');
      let bodyBuf = asset.raw;
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Vary': 'Accept-Encoding'
      };
      if (/\bbr\b/.test(acceptEnc)) {
        bodyBuf = asset.br;
        headers['Content-Encoding'] = 'br';
      } else if (/\bgzip\b/.test(acceptEnc)) {
        bodyBuf = asset.gz;
        headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = bodyBuf.length;
      res.writeHead(200, headers);
      res.end(bodyBuf);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      ''
    ];
    socket.write(headers.join('\r\n'));

    const clientId = `p${clientSeq++}_${crypto.randomBytes(2).toString('hex')}`;
    const conn = new WsConnection(socket, clientId);
    conn.isWan = isWanUpgradeRequest(req);
    clients.set(clientId, conn);
    touchActivity();
    ensureWanTunnel();

    const info = getLanAddresses(actualPort());
    conn.send({
      type: 'welcome',
      app: APP_ID,
      clientId,
      isWan: conn.isWan,
      lanUrls: info.urls,
      wanUrl,
      wanStatus,
      rooms: listPublicRooms()
    });

    const cleanup = () => {
      if (clients.get(conn.id) === conn) {
        clients.delete(conn.id);
      }
      removeClientFromRoom(conn, { allowGrace: true });
    };

    socket.on('data', (chunk) => {
      conn.feed(chunk, (text) => handleWsMessage(conn, text), cleanup);
    });
    socket.on('close', cleanup);
    socket.on('end', cleanup);
    socket.on('error', cleanup);
  });

  const shutdownWan = () => {
    wanClosing = true;
    clearInterval(idleSweepTimer);
    stopWanTunnel(false);
  };
  server.on('close', shutdownWan);
  process.once('exit', shutdownWan);
  process.once('SIGTERM', () => { shutdownWan(); process.exit(0); });
  process.once('SIGINT', () => { shutdownWan(); process.exit(0); });

  function actualPort() {
    const addr = server.address();
    return addr && typeof addr === 'object' ? addr.port : port;
  }

  async function start() {
    if (host === '0.0.0.0' && port > 0) {
      const loopbackOk = await checkLoopbackFree(port);
      if (!loopbackOk) {
        const err = new Error(`Loopback 127.0.0.1:${port} is already in use`);
        err.code = 'EADDRINUSE';
        throw err;
      }
    }
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        const p = actualPort();
        const info = getLanAddresses(p);
        resolve({ port: p, urls: info.urls, server });
      });
    });
  }

  return { server, start, rooms, clients, ensureWanTunnel, stopWanTunnel, getWanState: () => ({ wanStatus, wanUrl }) };
}

function openBrowserUrl(url) {
  const cmd = process.platform === 'darwin'
    ? 'open'
    : (process.platform === 'win32' ? 'cmd' : 'xdg-open');
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (_) {}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { port: requestedPort, explicit } = parsePortArg();
  const shouldOpen = process.argv.includes('--open');

  (async () => {
    if (!explicit) {
      for (const p of CANDIDATE_PORTS) {
        const existing = await probeExistingSanctumServer(p);
        if (existing) {
          const localUrl = `http://127.0.0.1:${existing.port}/`;
          console.log(`[Sanctum of Ash LAN] Already active on port ${existing.port}`);
          if (shouldOpen) openBrowserUrl(localUrl);
          return;
        }
      }
    }

    const portsToTry = explicit ? [requestedPort] : CANDIDATE_PORTS;
    let lastErr = null;
    for (const candidate of portsToTry) {
      const lan = createLanServer({ port: candidate });
      try {
        const { port: boundPort, urls } = await lan.start();
        console.log(`[Sanctum of Ash LAN] Listening on port ${boundPort}`);
        for (const u of urls) {
          console.log(`  -> ${u}`);
        }
        if (shouldOpen) {
          openBrowserUrl(`http://127.0.0.1:${boundPort}/`);
        }
        return;
      } catch (err) {
        lastErr = err;
        if (explicit || err.code !== 'EADDRINUSE') break;
      }
    }
    throw lastErr || new Error('No available port found');
  })().catch((err) => {
    console.error('[Sanctum of Ash LAN] Failed to start server:', err);
    process.exit(1);
  });
}
