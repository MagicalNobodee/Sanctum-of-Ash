import * as THREE from 'three';
import { WEAPON_DEFS, WEAPON_TIERS, WEAPON_RARITIES } from './weapons.js';
import { getDifficultyConfig, DEFAULT_DIFFICULTY_ID } from './floors.js';

export const PLAYER_THEMES = [
  {
    idx: 0,
    id: 'ember',
    accent: '#ff8533',
    accentHex: 0xff8533,
    clothHex: 0x6b151e,
    armorHex: 0xbac4d4,
    trimHex: 0xd8a85a,
    visorHex: 0xff9933,
    zhName: '烬火先锋',
    enName: 'Ember Vanguard'
  },
  {
    idx: 1,
    id: 'frost',
    accent: '#5ec2ff',
    accentHex: 0x5ec2ff,
    clothHex: 0x13385c,
    armorHex: 0xb8d4eb,
    trimHex: 0x6fd4ff,
    visorHex: 0x63dcff,
    zhName: '霜誓守卫',
    enName: 'Frost Warden'
  },
  {
    idx: 2,
    id: 'verdant',
    accent: '#4ade80',
    accentHex: 0x4ade80,
    clothHex: 0x134a2e,
    armorHex: 0xb8d2c6,
    trimHex: 0x7be098,
    visorHex: 0x4ade80,
    zhName: '翠影游侠',
    enName: 'Verdant Ranger'
  },
  {
    idx: 3,
    id: 'astral',
    accent: '#c77dff',
    accentHex: 0xc77dff,
    clothHex: 0x3b1661,
    armorHex: 0xc9c0de,
    trimHex: 0xd59cff,
    visorHex: 0xc77dff,
    zhName: '星穹秘使',
    enName: 'Astral Arcanist'
  }
];

export function getPlayerTheme(idx = 0) {
  return PLAYER_THEMES[((idx % PLAYER_THEMES.length) + PLAYER_THEMES.length) % PLAYER_THEMES.length];
}

const SCALING_TABLE = {
  1: {
    playerCount: 1,
    overallMult: 1.00,
    mobHpMult: 1.00,
    bossHpMult: 1.00,
    shieldMult: 1.00,
    dmgMult: 1.00,
    extraSpawns: 0,
    bossExtraGuards: 0,
    eliteChanceAdd: 0.00,
    shieldedChanceAdd: 0.00,
    forceCoopBossWard: false,
    cinderMult: 1.00
  },
  2: {
    playerCount: 2,
    overallMult: 1.60,
    mobHpMult: 1.55,
    bossHpMult: 1.65,
    shieldMult: 1.55,
    dmgMult: 1.10,
    extraSpawns: 3,
    bossExtraGuards: 2,
    eliteChanceAdd: 0.12,
    shieldedChanceAdd: 0.10,
    forceCoopBossWard: true,
    cinderMult: 1.35
  },
  3: {
    playerCount: 3,
    overallMult: 2.15,
    mobHpMult: 2.05,
    bossHpMult: 2.25,
    shieldMult: 2.05,
    dmgMult: 1.20,
    extraSpawns: 6,
    bossExtraGuards: 3,
    eliteChanceAdd: 0.22,
    shieldedChanceAdd: 0.18,
    forceCoopBossWard: true,
    cinderMult: 1.68
  },
  4: {
    playerCount: 4,
    overallMult: 2.70,
    mobHpMult: 2.55,
    bossHpMult: 2.85,
    shieldMult: 2.55,
    dmgMult: 1.30,
    extraSpawns: 9,
    bossExtraGuards: 4,
    eliteChanceAdd: 0.32,
    shieldedChanceAdd: 0.26,
    forceCoopBossWard: true,
    cinderMult: 2.00
  }
};

export function getMultiplayerScaling(playerCount = 1, difficultyId = DEFAULT_DIFFICULTY_ID) {
  const clamped = Math.max(1, Math.min(4, Math.round(playerCount || 1)));
  const mp = SCALING_TABLE[clamped];
  const diff = getDifficultyConfig(difficultyId);
  return {
    ...mp,
    difficultyId: diff.id,
    diffCfg: diff,
    spawnMult: diff.spawnMult,
    maxCombatWaves: diff.maxCombatWaves,
    maxEliteWaves: diff.maxEliteWaves,
    overallMult: +(mp.overallMult * diff.mobHpMult).toFixed(2),
    mobHpMult: +(mp.mobHpMult * diff.mobHpMult).toFixed(3),
    bossHpMult: +(mp.bossHpMult * diff.bossHpMult).toFixed(3),
    shieldMult: +(mp.shieldMult * diff.mobHpMult).toFixed(3),
    dmgMult: +(mp.dmgMult * diff.enemyDmgMult).toFixed(3),
    enemySpeedMult: +(diff.enemySpeedMult || 1.0).toFixed(3),
    enemyAtkRateMult: +(diff.enemyAtkRateMult || 1.0).toFixed(3),
    eliteChanceAdd: +(mp.eliteChanceAdd + diff.eliteAdd).toFixed(3),
    shieldedChanceAdd: +(mp.shieldedChanceAdd + diff.shieldedAdd).toFixed(3),
    allowDualAffix: diff.id === 'bloodfire' || diff.id === 'abyssal',
    cinderMult: +(mp.cinderMult * diff.cinderMult).toFixed(3)
  };
}

export function serializeWeaponInst(w) {
  if (!w) return null;
  return {
    uid: w.uid,
    id: w.id,
    tier: w.tier,
    affix: w.affix ? { ...w.affix } : null,
    pellets: w.pellets || w.def?.pellets || 1,
    dmg: w.dmg,
    atkRate: w.atkRate,
    energyCost: w.def?.category === 'ranged' ? Math.max(1, w.energyCost ?? w.def.energyCost ?? 4) : 0,
    range: w.range ?? w.def?.range ?? 3.0,
    critBonus: w.critBonus,
    critMultBonus: w.critMultBonus,
    shieldMult: w.shieldMult,
    knockback: w.knockback ?? w.def?.knockback ?? 4.8,
    impactClass: w.impactClass || w.def?.impactClass || 'medium',
    moveBonus: w.moveBonus ?? w.def?.moveBonus ?? 1.0,
    skillCdMult: w.skillCdMult ?? 1.0,
    vampCrit: w.vampCrit || 0,
    energyCrit: w.energyCrit || 0,
    temperCount: w.temperCount || 0
  };
}

export function deserializeWeaponInst(data) {
  if (!data || !data.id) return null;
  const def = WEAPON_DEFS[data.id] || WEAPON_DEFS.greatsword;
  const rDef = WEAPON_RARITIES[def.rarity] || WEAPON_RARITIES.common;
  const t = WEAPON_TIERS[Math.max(0, Math.min(WEAPON_TIERS.length - 1, (data.tier || 1) - 1))];
  return {
    uid: data.uid || `${def.id}_t${t.tier}_net`,
    id: def.id,
    def,
    rarity: rDef.id,
    rarityRank: rDef.rank,
    rarityLabel: rDef.label,
    rarityColor: rDef.color,
    rarityHex: rDef.hex,
    rarityInfo: rDef,
    bossOnly: !!def.bossOnly,
    tier: t.tier,
    tierLabel: `${rDef.label} · ${t.shortLabel}`,
    tierColor: rDef.color,
    affix: data.affix || null,
    pellets: data.pellets ?? def.pellets ?? 1,
    dmg: data.dmg ?? Math.round(def.baseDmg * t.dmgMult),
    atkRate: data.atkRate ?? +(def.atkRate * t.spdBonus).toFixed(2),
    energyCost: def.category === 'ranged' ? Math.max(1, data.energyCost ?? def.energyCost ?? 4) : 0,
    range: data.range ?? def.range,
    critBonus: data.critBonus ?? +(def.critChance + t.critBonus).toFixed(2),
    critMultBonus: data.critMultBonus ?? def.critMult,
    shieldMult: data.shieldMult ?? def.shieldMult,
    knockback: data.knockback ?? def.knockback ?? 4.8,
    impactClass: data.impactClass || def.impactClass || 'medium',
    moveBonus: data.moveBonus ?? def.moveBonus ?? 1.0,
    skillCdMult: data.skillCdMult ?? 1.0,
    vampCrit: data.vampCrit || 0,
    energyCrit: data.energyCrit ?? (data.affix?.energyCrit || 0),
    affixChill: data.affix?.chillAdd || 0,
    affixBurn: !!data.affix?.burnAdd,
    affixShock: data.affix?.shockCrit ? 28 : 0,
    temperCount: data.temperCount || 0
  };
}

export function createAllyGroundRing(themeHex = 0x5ec2ff) {
  const g = new THREE.Group();
  g.userData.ignoreAO = true;
  const mat = new THREE.MeshBasicMaterial({
    color: themeHex,
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 28), mat);
  ring.userData.ignoreAO = true;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.026;
  g.add(ring);
  return {
    root: g,
    mat,
    setThemeHex(hex) {
      mat.color.setHex(hex);
    }
  };
}

export function createDownedBeacon(tex, themeHex = 0xff4d6d) {
  const g = new THREE.Group();
  g.visible = false;
  g.userData.ignoreAO = true;

  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff4d6d,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const outerRing = new THREE.Mesh(new THREE.RingGeometry(2.12, 2.32, 40), outerMat);
  outerRing.userData.ignoreAO = true;
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.035;
  g.add(outerRing);

  const fillMat = new THREE.MeshBasicMaterial({
    map: tex.sealTex,
    color: themeHex,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const sigil = new THREE.Mesh(new THREE.CircleGeometry(2.08, 32), fillMat);
  sigil.userData.ignoreAO = true;
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = 0.03;
  g.add(sigil);

  return {
    root: g,
    outerMat,
    fillMat,
    outerRing,
    sigil,
    update(time, downed, reviveProgress = 0) {
      g.visible = !!downed;
      if (!downed) return;
      sigil.rotation.z = time * 1.1;
      const pulse = 0.96 + Math.sin(time * 6.5) * 0.05;
      outerRing.scale.setScalar(pulse);
      if (reviveProgress > 0.01) {
        outerMat.color.setHex(0x5effc8);
        fillMat.color.setHex(0xffdf72);
        fillMat.opacity = 0.42 + reviveProgress * 0.38;
      } else {
        outerMat.color.setHex(0xff4d6d);
        fillMat.color.setHex(themeHex);
        fillMat.opacity = 0.28 + Math.sin(time * 5.0) * 0.10;
      }
    }
  };
}

export const LAN_APP_ID = 'sanctum-of-ash-lan';
export const LAN_CANDIDATE_PORTS = [18765, 18766, 18767, 18768];
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RTC_ICE_SERVERS = [
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.chat.bilibili.com:3478' },
  { urls: 'stun:stun.douyucdn.cn:18000' },
  { urls: 'stun:stun.qq.com:3478' }
];

function isFakeProxyCandidate(candStr) {
  if (!candStr) return false;
  return /\b198\.1[89]\.\d+\.\d+\b/.test(String(candStr)) || /\b169\.254\.\d+\.\d+\b/.test(String(candStr));
}

export function isPublicRemoteHost(hostOrUrl) {
  const raw = String(hostOrUrl || '').trim();
  if (!raw) return false;
  let hostname = raw;
  try {
    if (/^[a-z]+:\/\//i.test(raw)) {
      hostname = new URL(raw).hostname;
    } else {
      hostname = raw.split('/')[0].split(':')[0];
    }
  } catch (_) {
    hostname = raw.split('/')[0].split(':')[0];
  }
  const h = hostname.trim().toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return false;
  if (
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('169.254.') ||
    h.startsWith('198.18.') ||
    h.startsWith('198.19.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  ) {
    return false;
  }
  return true;
}

export function resolveDefaultWsUrl() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const explicitWs = params.get('ws');
    if (explicitWs) return explicitWs;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    }
  } catch (_) {}
  return `ws://127.0.0.1:${LAN_CANDIDATE_PORTS[0]}/ws`;
}

export function parseJoinTarget(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return { code: '', wsUrl: null };
  if (/^https?:\/\//i.test(trimmed) || /^wss?:\/\//i.test(trimmed) || trimmed.includes(':')) {
    try {
      const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
      const u = new URL(normalized);
      const proto = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${u.host}/ws`;
      const qCode = (u.searchParams.get('room') || '').trim().toUpperCase();
      const pathCode = u.pathname.replace(/\//g, '').trim().toUpperCase();
      const code = qCode || (pathCode && pathCode !== 'WS' ? pathCode : '');
      return { code, wsUrl };
    } catch (_) {}
  }
  return { code: trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), wsUrl: null };
}

async function probeLanHttpPort(host, port, timeoutMs = 420) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`http://${host}:${port}/api/lan-info`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.ok && (data.app === LAN_APP_ID || Array.isArray(data.urls))) {
      return `ws://${host}:${data.port || port}/ws`;
    }
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}

class EmbeddedLocalBus {
  constructor(clientId, onServerPacket) {
    this.clientId = clientId;
    this.onPacket = onServerPacket;
    this.channel = null;
    this.hostedRoom = null;
    this.joinedRoomCode = null;
    this.joinedHostId = null;
    this.knownRooms = new Map();
    this._unloadHandler = () => this.close();

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('sanctum_of_ash_coop_bus_v1');
        this.channel.onmessage = (ev) => this._onBusMessage(ev.data);
      }
    } catch (_) {
      this.channel = null;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this._unloadHandler);
    }
    this._postBus({ busType: 'discover_rooms', requesterId: this.clientId });
  }

  _postBus(packet) {
    if (!this.channel) return;
    try {
      this.channel.postMessage(packet);
    } catch (_) {}
  }

  _deliverToPeer(peerId, msg) {
    if (peerId === this.clientId) {
      queueMicrotask(() => this.onPacket(msg));
    } else {
      this._postBus({ busType: 'direct', to: peerId, from: this.clientId, msg });
    }
  }

  _genCode(preferred = '') {
    const clean = String(preferred || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (clean.length >= 3 && !this.knownRooms.has(clean)) return clean;
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    return code;
  }

  _roomSummary(room) {
    const hp = room.players.find((p) => p.id === room.hostId) || room.players[0];
    return {
      code: room.code,
      hostId: room.hostId,
      hostName: hp ? hp.name : 'Host',
      playerCount: room.players.length,
      maxPlayers: 4,
      inGame: room.inGame,
      floorIndex: room.floorIndex || 0,
      biomeId: room.biomeId || null
    };
  }

  _lobbyState(room) {
    const baseHref = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
    return {
      type: 'lobby_state',
      code: room.code,
      hostId: room.hostId,
      inGame: room.inGame,
      floorIndex: room.floorIndex,
      biomeId: room.biomeId,
      maxPlayers: 4,
      lanUrls: baseHref ? [baseHref] : [],
      players: room.players.map((p, idx) => ({
        id: p.id,
        slot: idx,
        name: p.name,
        themeIdx: p.themeIdx,
        classId: p.classId || null,
        ready: p.ready,
        isHost: p.id === room.hostId
      }))
    };
  }

  _announceHostedRoom() {
    if (!this.hostedRoom) return;
    if (this.hostedRoom.players.length > 0 && this.hostedRoom.players.length < 4) {
      const summary = this._roomSummary(this.hostedRoom);
      this.knownRooms.set(summary.code, summary);
      this._postBus({ busType: 'room_announce', summary });
    } else {
      this.knownRooms.delete(this.hostedRoom.code);
      this._postBus({ busType: 'room_closed', code: this.hostedRoom.code });
    }
  }

  _broadcastHosted(msg, excludeId = null) {
    if (!this.hostedRoom) return;
    for (const p of this.hostedRoom.players) {
      if (p.id === excludeId) continue;
      this._deliverToPeer(p.id, msg);
    }
  }

  sendClientMsg(msg) {
    if (!msg || typeof msg.type !== 'string') return true;
    if (msg.type === 'ping_check') {
      this._deliverToPeer(this.clientId, { type: 'pong_check', clientTs: msg.clientTs, serverTs: Date.now() });
      return true;
    }
    if (msg.type === 'list_rooms') {
      this._postBus({ busType: 'discover_rooms', requesterId: this.clientId });
      this._deliverToPeer(this.clientId, { type: 'rooms_list', rooms: [...this.knownRooms.values()] });
      return true;
    }
    if (msg.type === 'create_room') {
      this._leaveCurrent();
      const code = this._genCode(msg.preferredCode);
      const name = String(msg.name || 'P1').trim().slice(0, 18) || 'P1';
      const themeIdx = Number.isInteger(msg.themeIdx) ? (msg.themeIdx & 3) : 0;
      const classId = typeof msg.classId === 'string' && msg.classId.trim() ? msg.classId.trim().slice(0, 32) : null;
      this.hostedRoom = {
        code,
        hostId: this.clientId,
        inGame: false,
        floorIndex: 0,
        biomeId: null,
        lastFloorInit: null,
        players: [{ id: this.clientId, name, themeIdx, classId, ready: true }]
      };
      this.joinedRoomCode = code;
      this.joinedHostId = this.clientId;
      this._deliverToPeer(this.clientId, {
        type: 'room_joined',
        code,
        clientId: this.clientId,
        hostId: this.clientId,
        slot: 0,
        themeIdx
      });
      this._broadcastHosted(this._lobbyState(this.hostedRoom));
      this._announceHostedRoom();
      return true;
    }
    if (msg.type === 'join_room') {
      const code = String(msg.code || '').trim().toUpperCase();
      if (this.hostedRoom && this.hostedRoom.code === code) {
        return true;
      }
      this._leaveCurrent();
      if (!this.channel) {
        this._deliverToPeer(this.clientId, { type: 'room_error', reason: 'not_found', code });
        return true;
      }
      let answered = false;
      const joinReqId = `${this.clientId}_${Date.now()}`;
      this._pendingJoin = { joinReqId, code, resolve: () => { answered = true; } };
      this._postBus({
        busType: 'join_request',
        joinReqId,
        code,
        peerId: this.clientId,
        name: msg.name,
        themeIdx: msg.themeIdx,
        classId: msg.classId || null,
        autoReady: !!msg.autoReady
      });
      setTimeout(() => {
        if (!answered && this._pendingJoin && this._pendingJoin.joinReqId === joinReqId) {
          this._pendingJoin = null;
          this._deliverToPeer(this.clientId, { type: 'room_error', reason: 'not_found', code });
        }
      }, 450);
      return true;
    }
    if (msg.type === 'leave_room') {
      this._leaveCurrent();
      this._deliverToPeer(this.clientId, { type: 'room_left', rooms: [...this.knownRooms.values()] });
      return true;
    }
    if (this.hostedRoom && this.joinedRoomCode === this.hostedRoom.code) {
      this._handleHostAction(this.clientId, msg);
    } else if (this.joinedHostId) {
      this._postBus({ busType: 'to_host', hostId: this.joinedHostId, from: this.clientId, msg });
    }
    return true;
  }

  _leaveCurrent() {
    if (this.hostedRoom) {
      const code = this.hostedRoom.code;
      this._broadcastHosted({
        type: 'player_left',
        playerId: this.clientId,
        playerName: 'Host',
        hostId: null,
        hostChanged: true,
        playerCount: 0
      }, this.clientId);
      this.hostedRoom = null;
      this.knownRooms.delete(code);
      this._postBus({ busType: 'room_closed', code });
    } else if (this.joinedHostId && this.joinedRoomCode) {
      this._postBus({
        busType: 'to_host',
        hostId: this.joinedHostId,
        from: this.clientId,
        msg: { type: 'leave_room' }
      });
    }
    this.joinedRoomCode = null;
    this.joinedHostId = null;
  }

  _handleHostAction(senderId, msg) {
    const room = this.hostedRoom;
    if (!room) return;
    if (msg.type === 'leave_room') {
      const idx = room.players.findIndex((p) => p.id === senderId);
      if (idx !== -1) {
        const dep = room.players[idx];
        room.players.splice(idx, 1);
        this._broadcastHosted({
          type: 'player_left',
          playerId: dep.id,
          playerName: dep.name,
          hostId: room.hostId,
          hostChanged: false,
          playerCount: room.players.length
        });
        this._broadcastHosted(this._lobbyState(room));
        this._announceHostedRoom();
      }
      return;
    }
    const me = room.players.find((p) => p.id === senderId);
    if (!me) return;
    if (msg.type === 'update_profile') {
      if (typeof msg.name === 'string' && msg.name.trim()) me.name = msg.name.trim().slice(0, 18);
      if (Number.isInteger(msg.themeIdx) && msg.themeIdx >= 0 && msg.themeIdx < 4) me.themeIdx = msg.themeIdx;
      if (typeof msg.classId === 'string' && msg.classId.trim()) me.classId = msg.classId.trim().slice(0, 32);
      if (typeof msg.ready === 'boolean') me.ready = me.id === room.hostId ? true : msg.ready;
      this._broadcastHosted(this._lobbyState(room));
      return;
    }
    if (msg.type === 'launch_run' && senderId === room.hostId) {
      room.inGame = true;
      if (msg.floorInit) {
        room.lastFloorInit = msg.floorInit;
        room.floorIndex = msg.floorInit.floorIndex || 0;
        room.biomeId = msg.floorInit.biomeId || null;
      }
      this._broadcastHosted({
        type: 'run_launched',
        hostId: room.hostId,
        playerCount: room.players.length,
        players: this._lobbyState(room).players,
        floorInit: msg.floorInit || null
      });
      this._announceHostedRoom();
      return;
    }
    if (msg.type === 'return_lobby' && senderId === room.hostId) {
      room.inGame = false;
      room.lastFloorInit = null;
      this._broadcastHosted(this._lobbyState(room));
      this._announceHostedRoom();
      return;
    }
    if (msg.type === 'relay' && msg.payload) {
      if (msg.payload.kind === 'floor_init' && senderId === room.hostId) {
        room.lastFloorInit = msg.payload;
        room.floorIndex = msg.payload.floorIndex || 0;
        room.biomeId = msg.payload.biomeId || null;
      }
      const envelope = { type: 'relay', from: senderId, payload: msg.payload };
      const target = msg.target || 'others';
      if (target === 'all') this._broadcastHosted(envelope, null);
      else if (target === 'others') this._broadcastHosted(envelope, senderId);
      else if (target === 'host') this._deliverToPeer(room.hostId, envelope);
      else this._deliverToPeer(target, envelope);
    }
  }

  _onBusMessage(pkt) {
    if (!pkt || typeof pkt.busType !== 'string') return;
    if (pkt.busType === 'discover_rooms' && this.hostedRoom) {
      this._announceHostedRoom();
      return;
    }
    if (pkt.busType === 'room_announce' && pkt.summary) {
      this.knownRooms.set(pkt.summary.code, pkt.summary);
      if (!this.joinedRoomCode) {
        this.onPacket({ type: 'rooms_list', rooms: [...this.knownRooms.values()] });
      }
      return;
    }
    if (pkt.busType === 'room_closed' && pkt.code) {
      this.knownRooms.delete(pkt.code);
      if (!this.joinedRoomCode) {
        this.onPacket({ type: 'rooms_list', rooms: [...this.knownRooms.values()] });
      }
      return;
    }
    if (pkt.busType === 'join_request' && this.hostedRoom && pkt.code === this.hostedRoom.code) {
      const room = this.hostedRoom;
      if (room.players.length >= 4) {
        this._deliverToPeer(pkt.peerId, { type: 'room_error', reason: 'full', code: room.code });
        return;
      }
      const used = new Set(room.players.map((p) => p.themeIdx));
      let themeIdx = Number.isInteger(pkt.themeIdx) && !used.has(pkt.themeIdx) ? pkt.themeIdx : 0;
      if (used.has(themeIdx)) {
        for (let t = 0; t < 4; t++) { if (!used.has(t)) { themeIdx = t; break; } }
      }
      const slot = room.players.length;
      const name = String(pkt.name || `P${slot + 1}`).trim().slice(0, 18) || `P${slot + 1}`;
      const classId = typeof pkt.classId === 'string' && pkt.classId.trim() ? pkt.classId.trim().slice(0, 32) : null;
      const newP = { id: pkt.peerId, name, themeIdx, classId, ready: !!pkt.autoReady || room.inGame };
      room.players.push(newP);
      this._deliverToPeer(pkt.peerId, {
        type: 'room_joined',
        joinReqId: pkt.joinReqId,
        code: room.code,
        clientId: pkt.peerId,
        hostId: room.hostId,
        slot,
        themeIdx,
        inGame: room.inGame,
        lastFloorInit: room.lastFloorInit
      });
      this._broadcastHosted({
        type: 'player_joined',
        player: { id: newP.id, slot, name: newP.name, themeIdx: newP.themeIdx, classId: newP.classId, ready: newP.ready, isHost: false },
        playerCount: room.players.length
      }, pkt.peerId);
      this._broadcastHosted(this._lobbyState(room));
      this._announceHostedRoom();
      return;
    }
    if (pkt.busType === 'to_host' && pkt.hostId === this.clientId && this.hostedRoom) {
      this._handleHostAction(pkt.from, pkt.msg);
      return;
    }
    if (pkt.busType === 'direct' && pkt.to === this.clientId && pkt.msg) {
      if (pkt.msg.type === 'room_joined') {
        if (this._pendingJoin) {
          this._pendingJoin.resolve();
          this._pendingJoin = null;
        }
        this.joinedRoomCode = pkt.msg.code;
        this.joinedHostId = pkt.msg.hostId;
      } else if (pkt.msg.type === 'room_error' && this._pendingJoin) {
        this._pendingJoin.resolve();
        this._pendingJoin = null;
      }
      this.onPacket(pkt.msg);
    }
  }

  close() {
    this._leaveCurrent();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this._unloadHandler);
    }
    if (this.channel) {
      try { this.channel.close(); } catch (_) {}
      this.channel = null;
    }
  }
}

export class LanClient {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.ws = null;
    this.localBus = null;
    this.transportMode = 'offline';
    this.wsUrl = resolveDefaultWsUrl();
    this.connected = false;
    this.connecting = false;
    this.clientId = null;
    this.roomCode = null;
    this.hostId = null;
    this.inGame = false;
    this.players = [];
    this.roomsList = [];
    this.lanUrls = [];
    this.wanUrl = null;
    this.wanStatus = 'idle';
    this.isWanClient = false;
    this.p2pPeerCount = 0;
    this.p2pPingMs = null;
    this.pingMs = 1;
    this._pingTimer = null;
    this._connectPromise = null;
    this._rtcPeers = new Map();
    this._rtcWatchdogTimer = null;
    this._rtcAttemptCounts = new Map();
    this._wsReconnectTimer = null;
    this._wsReconnectStartedAt = 0;
    this.reconnectingWs = false;
    this.resumeToken = null;
    this._manualClose = false;
    this._txSeq = 0;
    this._rxSeq = new Map();
    this.forceP2P = false;
    try {
      const params = new URLSearchParams(window.location.search || '');
      this.forceP2P = params.get('p2p') === '1';
    } catch (_) {}
  }

  get inRoom() {
    return !!((this.connected || this.reconnectingWs || this.p2pPeerCount > 0) && this.roomCode);
  }

  get isHost() {
    return !!(this.inRoom && this.clientId && this.clientId === this.hostId);
  }

  get playerCount() {
    return this.inRoom ? Math.max(1, this.players.length) : 1;
  }

  async _discoverBestWsUrl(customWsUrl = null) {
    if (customWsUrl && customWsUrl.trim()) {
      const trimmed = customWsUrl.trim();
      const isWan = /^wss:/i.test(trimmed) || isPublicRemoteHost(trimmed);
      return {
        url: trimmed,
        isExplicitRemote: isWan || !/127\.0\.0\.1|localhost/i.test(trimmed),
        isWanTarget: isWan
      };
    }
    try {
      const params = new URLSearchParams(window.location.search || '');
      const qWs = params.get('ws');
      if (qWs && qWs.trim()) {
        const trimmed = qWs.trim();
        const isWan = /^wss:/i.test(trimmed) || isPublicRemoteHost(trimmed);
        return {
          url: trimmed,
          isExplicitRemote: isWan || !/127\.0\.0\.1|localhost/i.test(trimmed),
          isWanTarget: isWan
        };
      }
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isWan = window.location.protocol === 'https:' || isPublicRemoteHost(window.location.hostname);
        return {
          url: `${proto}//${window.location.host}/ws`,
          isExplicitRemote: isWan,
          isWanTarget: isWan
        };
      }
    } catch (_) {}

    for (const port of LAN_CANDIDATE_PORTS) {
      const found = await probeLanHttpPort('127.0.0.1', port, 420);
      if (found) return { url: found, isExplicitRemote: false, isWanTarget: false };
    }
    return { url: null, isExplicitRemote: false, isWanTarget: false };
  }

  _activateEmbeddedBus() {
    this._stopPing();
    this._stopRtcWatchdog();
    this._closeAllRtcPeers();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (!this.localBus) {
      const cid = `loc_${Math.random().toString(36).slice(2, 8)}`;
      this.clientId = cid;
      this.localBus = new EmbeddedLocalBus(cid, (msg) => this._handleMessage(msg));
    }
    this.transportMode = 'embedded';
    this.isWanClient = false;
    this.connected = true;
    this.connecting = false;
    this.pingMs = 1;
    this._startPing();
    if (this.cb.onStatusChange) this.cb.onStatusChange();
    if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
    return this;
  }

  async connect(customWsUrl = null) {
    if (
      this.connected &&
      this.transportMode === 'lan' &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      (!customWsUrl || customWsUrl.trim() === this.wsUrl)
    ) {
      return Promise.resolve(this);
    }
    if (this._connectPromise && (!customWsUrl || customWsUrl.trim() === this.wsUrl)) {
      return this._connectPromise;
    }

    this.connecting = true;
    if (this.cb.onStatusChange) this.cb.onStatusChange();

    this._connectPromise = (async () => {
      const { url: targetUrl, isExplicitRemote, isWanTarget } = await this._discoverBestWsUrl(customWsUrl);
      if (!targetUrl) {
        this._connectPromise = null;
        return this._activateEmbeddedBus();
      }
      const wsTimeout = isWanTarget ? 10500 : (isExplicitRemote ? 4200 : 1800);
      try {
        await this._openWebSocket(targetUrl, wsTimeout);
        this._connectPromise = null;
        return this;
      } catch (err) {
        if (isWanTarget) {
          try {
            await new Promise((r) => setTimeout(r, 450));
            await this._openWebSocket(targetUrl, wsTimeout);
            this._connectPromise = null;
            return this;
          } catch (retryErr) {
            this._connectPromise = null;
            this.connecting = false;
            if (this.cb.onStatusChange) this.cb.onStatusChange();
            throw retryErr;
          }
        }
        this._connectPromise = null;
        if (isExplicitRemote) {
          this.connecting = false;
          if (this.cb.onStatusChange) this.cb.onStatusChange();
          throw err;
        }
        return this._activateEmbeddedBus();
      }
    })();

    return this._connectPromise;
  }

  _openWebSocket(targetUrl, timeoutMs = 2200) {
    this._manualClose = false;
    if (this.localBus) {
      this.localBus.close();
      this.localBus = null;
    }
    if (this.ws) {
      const oldWs = this.ws;
      this.ws = null;
      try { oldWs.close(); } catch (_) {}
    }
    this.wsUrl = targetUrl;

    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(targetUrl);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch (_) {}
          reject(new Error('timeout'));
        }
      }, timeoutMs);

      ws.addEventListener('open', () => {
        this.transportMode = 'lan';
        this.connected = true;
        this.connecting = false;
        this._startPing();
        this._startRtcWatchdog();
        if (this.cb.onStatusChange) this.cb.onStatusChange();
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'welcome') {
          const resumingRoom = !!(this.reconnectingWs && this.roomCode && this.resumeToken);
          if (!resumingRoom) {
            this.clientId = msg.clientId;
          }
          this.isWanClient = !!msg.isWan || /^wss:/i.test(targetUrl) || isPublicRemoteHost(targetUrl);
          this.lanUrls = Array.isArray(msg.lanUrls) ? msg.lanUrls : [];
          if (typeof msg.wanUrl === 'string' || msg.wanUrl === null) this.wanUrl = msg.wanUrl;
          if (typeof msg.wanStatus === 'string') this.wanStatus = msg.wanStatus;
          this.roomsList = Array.isArray(msg.rooms) ? msg.rooms : [];
          this.transportMode = 'lan';
          if (resumingRoom) {
            this.sendRaw({
              type: 'resume_room',
              code: this.roomCode,
              resumeToken: this.resumeToken,
              isWan: !!this.isWanClient
            });
          }
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(this);
          }
          if (this.cb.onStatusChange) this.cb.onStatusChange();
          if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
          return;
        }
        this._handleMessage(msg);
      });

      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        if (this.ws !== ws) {
          if (!settled) {
            settled = true;
            reject(new Error('replaced'));
          }
          return;
        }
        this.ws = null;
        this.connected = false;
        this.connecting = false;
        if (!settled) {
          settled = true;
          reject(new Error('closed'));
          return;
        }
        if (!this._manualClose && this.roomCode && this.resumeToken) {
          this.reconnectingWs = true;
          if (!this._wsReconnectStartedAt) this._wsReconnectStartedAt = Date.now();
          this._scheduleWsReconnect();
          if (this.cb.onStatusChange) this.cb.onStatusChange();
          return;
        }
        const wasInRoom = !!this.roomCode;
        this._stopPing();
        this._stopRtcWatchdog();
        this._closeAllRtcPeers();
        this.transportMode = 'offline';
        this.roomCode = null;
        this.resumeToken = null;
        this.reconnectingWs = false;
        this.hostId = null;
        this.inGame = false;
        this.players = [];
        if (wasInRoom && this.cb.onDisconnected) this.cb.onDisconnected();
        if (this.cb.onStatusChange) this.cb.onStatusChange();
        if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
      });

      ws.addEventListener('error', () => {
        if (!settled) {
          clearTimeout(timeout);
          settled = true;
          reject(new Error('ws_error'));
        }
      });
    });
  }

  _startPing() {
    this._stopPing();
    const sendPing = () => {
      if (!this.connected) return;
      const now = performance.now();
      this.sendRaw({ type: 'ping_check', clientTs: now });
      if (this.p2pPeerCount > 0) {
        const preferredPeer = (!this.isHost && this.hostId && this._rtcPeers.get(this.hostId)?.open)
          ? this._rtcPeers.get(this.hostId)
          : [...this._rtcPeers.values()].find((e) => e.open);
        if (preferredPeer && preferredPeer.dc && preferredPeer.dc.readyState === 'open') {
          try {
            preferredPeer.dc.send(JSON.stringify({ k: 'ping', t: now }));
          } catch (_) {}
        }
      }
    };
    sendPing();
    this._pingTimer = setInterval(sendPing, 1500);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  _startRtcWatchdog() {
    this._stopRtcWatchdog();
    this._rtcWatchdogTimer = setInterval(() => {
      if (this.connected) this._syncRtcPeers();
    }, 3000);
  }

  _stopRtcWatchdog() {
    if (this._rtcWatchdogTimer) {
      clearInterval(this._rtcWatchdogTimer);
      this._rtcWatchdogTimer = null;
    }
  }

  _updateP2PCount() {
    let openCount = 0;
    for (const e of this._rtcPeers.values()) {
      if (e.open && e.dc && e.dc.readyState === 'open') openCount++;
    }
    const prev = this.p2pPeerCount;
    this.p2pPeerCount = openCount;
    if (openCount === 0) this.p2pPingMs = null;
    if (prev !== openCount && this.cb.onStatusChange) {
      this.cb.onStatusChange();
    }
  }

  _closePeerRtc(peerId) {
    const entry = this._rtcPeers.get(peerId);
    if (!entry) return;
    this._rtcPeers.delete(peerId);
    entry.closed = true;
    entry.open = false;
    if (entry.dc) {
      try { entry.dc.close(); } catch (_) {}
    }
    if (entry.pc) {
      try { entry.pc.close(); } catch (_) {}
    }
    this._updateP2PCount();
  }

  _closeAllRtcPeers() {
    for (const pid of [...this._rtcPeers.keys()]) {
      this._closePeerRtc(pid);
    }
    this.p2pPeerCount = 0;
    this.p2pPingMs = null;
  }

  _shouldUseP2P() {
    if (typeof RTCPeerConnection === 'undefined') return false;
    if (this.transportMode !== 'lan' || !this.inRoom || !this.clientId) return false;
    if (this.players.length < 2) return false;
    return !!(this.isWanClient || this.forceP2P || this.players.some((p) => p && p.isWan));
  }

  _createPeerRtcEntry(peerId) {
    this._closePeerRtc(peerId);
    const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
    const entry = {
      peerId,
      pc,
      dc: null,
      open: false,
      closed: false,
      pendingIce: []
    };
    this._rtcPeers.set(peerId, entry);

    pc.onicecandidate = (ev) => {
      if (entry.closed || !ev.candidate) return;
      this.sendRaw({
        type: 'relay',
        target: peerId,
        payload: { kind: '__rtc_sig', sig: 'ice', candidate: ev.candidate }
      });
    };

    pc.onconnectionstatechange = () => {
      if (entry.closed) return;
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        this._closePeerRtc(peerId);
      }
    };

    pc.ondatachannel = (ev) => {
      if (entry.closed || !ev.channel) return;
      this._bindRtcDataChannel(peerId, entry, ev.channel);
    };

    return entry;
  }

  _bindRtcDataChannel(peerId, entry, dc) {
    entry.dc = dc;
    dc.onopen = () => {
      if (entry.closed) return;
      entry.open = true;
      this._updateP2PCount();
      try {
        dc.send(JSON.stringify({ k: 'ping', t: performance.now() }));
      } catch (_) {}
    };
    dc.onmessage = (ev) => {
      if (entry.closed) return;
      let pkt;
      try {
        pkt = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (!pkt || typeof pkt.k !== 'string') return;
      if (pkt.k === 'ping') {
        try { dc.send(JSON.stringify({ k: 'pong', t: pkt.t })); } catch (_) {}
        return;
      }
      if (pkt.k === 'pong') {
        const rtt = Math.max(1, Math.round(performance.now() - (pkt.t || performance.now())));
        this.p2pPingMs = rtt;
        this.pingMs = rtt;
        if (this.cb.onPing) this.cb.onPing(rtt);
        if (this.cb.onStatusChange) this.cb.onStatusChange();
        return;
      }
      if (pkt.k === 'relay' && pkt.payload) {
        if (this.cb.onRelay) this.cb.onRelay(peerId, pkt.payload);
      }
    };
    const onClose = () => {
      if (entry.closed) return;
      entry.open = false;
      this._updateP2PCount();
    };
    dc.onclose = onClose;
    dc.onerror = onClose;
  }

  _syncRtcPeers() {
    if (!this._shouldUseP2P()) {
      this._closeAllRtcPeers();
      return;
    }
    const activeIds = new Set(this.players.map((p) => p.id));
    for (const pid of [...this._rtcPeers.keys()]) {
      if (!activeIds.has(pid) || pid === this.clientId) {
        this._closePeerRtc(pid);
      }
    }
    for (const p of this.players) {
      if (!p || !p.id || p.id === this.clientId) continue;
      const pairNeedsP2P = !!(this.isWanClient || p.isWan || this.forceP2P);
      if (!pairNeedsP2P) continue;
      if (this._rtcPeers.has(p.id)) continue;
      if (String(this.clientId) < String(p.id)) {
        this._initiatePeerRtc(p.id);
      }
    }
  }

  async _initiatePeerRtc(peerId) {
    try {
      const entry = this._createPeerRtcEntry(peerId);
      const dc = entry.pc.createDataChannel('sanctum-p2p', { ordered: true });
      this._bindRtcDataChannel(peerId, entry, dc);
      const offer = await entry.pc.createOffer();
      if (entry.closed) return;
      await entry.pc.setLocalDescription(offer);
      if (entry.closed) return;
      this.sendRaw({
        type: 'relay',
        target: peerId,
        payload: { kind: '__rtc_sig', sig: 'offer', sdp: entry.pc.localDescription }
      });
    } catch (_) {
      this._closePeerRtc(peerId);
    }
  }

  async _handleRtcSignal(fromId, payload) {
    if (!fromId || fromId === this.clientId || typeof RTCPeerConnection === 'undefined') return;
    try {
      if (payload.sig === 'offer' && payload.sdp) {
        const entry = this._createPeerRtcEntry(fromId);
        await entry.pc.setRemoteDescription(payload.sdp);
        if (entry.closed) return;
        while (entry.pendingIce.length > 0) {
          const c = entry.pendingIce.shift();
          try { await entry.pc.addIceCandidate(c); } catch (_) {}
        }
        const answer = await entry.pc.createAnswer();
        if (entry.closed) return;
        await entry.pc.setLocalDescription(answer);
        if (entry.closed) return;
        this.sendRaw({
          type: 'relay',
          target: fromId,
          payload: { kind: '__rtc_sig', sig: 'answer', sdp: entry.pc.localDescription }
        });
        return;
      }
      const entry = this._rtcPeers.get(fromId);
      if (!entry || entry.closed) return;
      if (payload.sig === 'answer' && payload.sdp) {
        await entry.pc.setRemoteDescription(payload.sdp);
        while (entry.pendingIce.length > 0) {
          const c = entry.pendingIce.shift();
          try { await entry.pc.addIceCandidate(c); } catch (_) {}
        }
        return;
      }
      if (payload.sig === 'ice' && payload.candidate) {
        if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
          try { await entry.pc.addIceCandidate(payload.candidate); } catch (_) {}
        } else {
          entry.pendingIce.push(payload.candidate);
        }
      }
    } catch (_) {}
  }

  _sendPeerDirect(peerId, payload) {
    const entry = this._rtcPeers.get(peerId);
    if (!entry || !entry.open || !entry.dc || entry.dc.readyState !== 'open') return false;
    try {
      entry.dc.send(JSON.stringify({ k: 'relay', payload }));
      return true;
    } catch (_) {
      return false;
    }
  }

  disconnect(silent = false) {
    this._stopPing();
    this._stopRtcWatchdog();
    this._closeAllRtcPeers();
    this._connectPromise = null;
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (this.localBus) {
      this.localBus.close();
      this.localBus = null;
    }
    this.transportMode = 'offline';
    this.connected = false;
    this.connecting = false;
    this.roomCode = null;
    this.hostId = null;
    this.inGame = false;
    this.players = [];
    if (!silent && this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
  }

  sendRaw(obj) {
    if (this.transportMode === 'embedded' && this.localBus) {
      return this.localBus.sendClientMsg(obj);
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch (_) {
      return false;
    }
  }

  requestRooms() {
    this.sendRaw({ type: 'list_rooms' });
  }

  ensureWanTunnel({ refresh = false, force = false } = {}) {
    if (this.transportMode !== 'lan') return false;
    return this.sendRaw({ type: 'ensure_wan', refresh: !!refresh, force: !!force });
  }

  async createRoom({ name, themeIdx = 0, classId = null, preferredCode = '', wsUrl = null } = {}) {
    await this.connect(wsUrl);
    this.sendRaw({ type: 'create_room', name, themeIdx, classId, preferredCode, isWan: !!this.isWanClient });
  }

  async joinRoom({ code, name, themeIdx = null, classId = null, autoReady = false, wsUrl = null } = {}) {
    await this.connect(wsUrl);
    this.sendRaw({ type: 'join_room', code, name, themeIdx, classId, autoReady, isWan: !!this.isWanClient });
  }

  leaveRoom() {
    this._closeAllRtcPeers();
    if (this.connected && this.roomCode) {
      this.sendRaw({ type: 'leave_room' });
    }
    this.roomCode = null;
    this.hostId = null;
    this.inGame = false;
    this.players = [];
    if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
  }

  updateProfile({ name, themeIdx, classId, ready } = {}) {
    this.sendRaw({ type: 'update_profile', name, themeIdx, classId, ready });
  }

  launchRun(floorInit) {
    if (!this.isHost) return;
    this.sendRaw({ type: 'launch_run', floorInit });
  }

  returnLobby() {
    if (!this.isHost) return;
    this.sendRaw({ type: 'return_lobby' });
  }

  relay(payload, target = 'others') {
    if (!this.inRoom || !payload) return;
    if (payload.kind === 'floor_init' || this.p2pPeerCount === 0 || this.transportMode !== 'lan') {
      this.sendRaw({ type: 'relay', target, payload });
      return;
    }
    if (target === 'all') {
      const myId = this.clientId;
      queueMicrotask(() => {
        if (this.cb.onRelay) this.cb.onRelay(myId, payload);
      });
      for (const p of this.players) {
        if (!p || p.id === myId) continue;
        if (!this._sendPeerDirect(p.id, payload)) {
          this.sendRaw({ type: 'relay', target: p.id, payload });
        }
      }
      return;
    }
    if (target === 'others') {
      for (const p of this.players) {
        if (!p || p.id === this.clientId) continue;
        if (!this._sendPeerDirect(p.id, payload)) {
          this.sendRaw({ type: 'relay', target: p.id, payload });
        }
      }
      return;
    }
    if (target === 'host') {
      if (this.hostId && this._sendPeerDirect(this.hostId, payload)) return;
      this.sendRaw({ type: 'relay', target: 'host', payload });
      return;
    }
    if (!this._sendPeerDirect(target, payload)) {
      this.sendRaw({ type: 'relay', target, payload });
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'pong_check') {
      if (this.p2pPeerCount > 0 && this.p2pPingMs !== null) return;
      const rtt = Math.max(1, Math.round(performance.now() - (msg.clientTs || performance.now())));
      this.pingMs = rtt;
      if (this.cb.onPing) this.cb.onPing(rtt);
      return;
    }
    if (msg.type === 'wan_status') {
      if (typeof msg.wanUrl === 'string' || msg.wanUrl === null) this.wanUrl = msg.wanUrl;
      if (typeof msg.wanStatus === 'string') this.wanStatus = msg.wanStatus;
      if (this.cb.onStatusChange) this.cb.onStatusChange();
      if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
      return;
    }
    if (msg.type === 'rooms_list') {
      this.roomsList = Array.isArray(msg.rooms) ? msg.rooms : [];
      if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
      return;
    }
    if (msg.type === 'room_error') {
      if (this.cb.onRoomError) this.cb.onRoomError(msg.reason, msg.code);
      return;
    }
    if (msg.type === 'room_joined') {
      this.roomCode = msg.code;
      this.hostId = msg.hostId;
      this.inGame = !!msg.inGame;
      if (this.cb.onRoomJoined) this.cb.onRoomJoined(msg);
      return;
    }
    if (msg.type === 'room_left') {
      this._closeAllRtcPeers();
      this.roomCode = null;
      this.hostId = null;
      this.inGame = false;
      this.players = [];
      this.roomsList = Array.isArray(msg.rooms) ? msg.rooms : [];
      if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate();
      return;
    }
    if (msg.type === 'lobby_state') {
      this.roomCode = msg.code;
      this.hostId = msg.hostId;
      this.inGame = !!msg.inGame;
      if (Array.isArray(msg.lanUrls) && msg.lanUrls.length > 0) {
        this.lanUrls = msg.lanUrls;
      }
      if (typeof msg.wanUrl === 'string' || msg.wanUrl === null) this.wanUrl = msg.wanUrl;
      if (typeof msg.wanStatus === 'string') this.wanStatus = msg.wanStatus;
      this.players = Array.isArray(msg.players) ? msg.players : [];
      this._syncRtcPeers();
      if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate(msg);
      return;
    }
    if (msg.type === 'player_joined') {
      if (this.cb.onPlayerJoined) this.cb.onPlayerJoined(msg.player, msg.playerCount);
      return;
    }
    if (msg.type === 'player_left') {
      this.hostId = msg.hostId;
      if (msg.playerId) this._closePeerRtc(msg.playerId);
      if (this.cb.onPlayerLeft) this.cb.onPlayerLeft(msg);
      return;
    }
    if (msg.type === 'run_launched') {
      this.inGame = true;
      this.hostId = msg.hostId;
      if (Array.isArray(msg.players)) this.players = msg.players;
      this._syncRtcPeers();
      if (this.cb.onRunLaunched) this.cb.onRunLaunched(msg);
      return;
    }
    if (msg.type === 'relay') {
      if (msg.payload && msg.payload.kind === '__rtc_sig') {
        this._handleRtcSignal(msg.from, msg.payload);
        return;
      }
      if (this.cb.onRelay) this.cb.onRelay(msg.from, msg.payload);
    }
  }
}
