import * as THREE from 'three';
import { createHeroRig } from './actors.js';
import { buildWeaponVisuals, rollWeaponInstance, getMeleeStepSpec } from './weapons.js';
import { HERO_CLASSES, DEFAULT_CLASS_ID, getHeroClass, getClassText } from './classes.js';
import { DIFFICULTY_TIERS, DEFAULT_DIFFICULTY_ID, getDifficultyConfig } from './floors.js';
import {
  selectHeroClass,
  renderClassSelectionUI,
  onRemoteClassSkill,
  spawnSkeletonWraith,
  spawnExplosiveSlimeling
} from './class_abilities.js';
import {
  getLang,
  tUI,
  getRoomText,
  getWeaponText
} from './i18n.js';
import {
  getPlayerTheme,
  getMultiplayerScaling,
  serializeWeaponInst,
  deserializeWeaponInst,
  createAllyGroundRing,
  createDownedBeacon,
  LanClient,
  parseJoinTarget,
  isPublicRemoteHost,
  resolveDefaultWsUrl
} from './multiplayer.js';

export const START_SLOT_OFFSETS = [
  [[0, 2.0], [0, 0], [-2.2, 1.8], [2.2, 1.8]],
  [[-2.1, 2.0], [-2.2, 0.4], [-1.6, 2.6], [0, 2.0]],
  [[2.1, 2.0], [2.2, 0.4], [1.6, 2.6], [0, 2.0]],
  [[0, 3.3], [-1.8, 3.1], [1.8, 3.1], [0, 0.6]]
];

export const CHAR_SELECT_COUNTDOWN_SEC = 25;

function resolveCharSelectDuration() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const raw = Number(params.get('charTimer'));
    if (Number.isFinite(raw) && raw >= 3 && raw <= 120) return raw;
  } catch (_) {}
  return CHAR_SELECT_COUNTDOWN_SEC;
}

export function initCoopSystem(game) {
  game.remotePlayers = new Map();
  game._peerClassMap = new Map();
  game.coopCharSelect = {
    active: false,
    sessionId: '',
    duration: CHAR_SELECT_COUNTDOWN_SEC,
    remaining: CHAR_SELECT_COUNTDOWN_SEC,
    deadlineMs: 0,
    committed: false,
    picks: {},
    timerHandle: null,
    lastTickBroadcastMs: 0
  };
  game.allyTagsLayer = document.getElementById('ally-tags-layer');
  game.revivingPeerId = null;
  game._netStateAccum = 0;
  game._netEnemyAccum = 0;
  game._lanErrorText = '';
  game.localPlayerName = getLang() === 'zh' ? '烬火骑士' : 'Ashen Knight';

  const wsInput = document.getElementById('lan-ws-input');
  if (wsInput) wsInput.value = '';

  game.lan = new LanClient({
    onStatusChange: () => {
      renderLanLobbyUI(game);
      game.updateTelemetryHUD?.();
    },
    onPing: () => {
      renderLanLobbyUI(game);
      game.updateTelemetryHUD?.();
    },
    onLobbyUpdate: () => {
      syncRemoteRosterFromLobby(game);
      renderLanLobbyUI(game);
      if (game.isCoopCharSelectActive?.()) {
        syncCharSelectPicksWithLobby(game);
        renderCoopCharSelectUI(game);
      }
      game.updateHUD();
    },
    onRoomError: (reason, code) => {
      const ui = tUI();
      if (reason === 'not_found') game._lanErrorText = ui.lanErrNotFound(code);
      else if (reason === 'full') game._lanErrorText = ui.lanErrFull(code);
      else game._lanErrorText = ui.lanErrConnect;
      renderLanLobbyUI(game);
    },
    onRoomJoined: (msg) => {
      game._lanErrorText = '';
      if (Number.isInteger(msg.themeIdx)) {
        setLocalTheme(game, msg.themeIdx, false);
      }
      game.lan.relay({ kind: 'lobby_class_sync', classId: game.selectedClassId || DEFAULT_CLASS_ID }, 'others');
      renderLanLobbyUI(game);
      if (msg.inGame && msg.lastFloorInit) {
        document.getElementById('lan-overlay')?.classList.add('hidden');
        document.getElementById('pause-overlay')?.classList.add('hidden');
        game.sfx?.setPausedDamp?.(false);
        game.startCoopRunFromInit(msg.lastFloorInit, true);
      }
    },
    onPlayerJoined: (player, playerCount) => {
      game.sfx?.coopPlayerJoin?.();
      game.lan.relay({ kind: 'lobby_class_sync', classId: game.selectedClassId || DEFAULT_CLASS_ID }, 'others');
      if (game.isCoopCharSelectActive?.() && game.isCoopHost?.()) {
        syncCharSelectPicksWithLobby(game);
        renderCoopCharSelectUI(game);
        const cs = game.coopCharSelect;
        game.lan.relay({
          kind: 'char_select_begin',
          sessionId: cs.sessionId,
          duration: cs.duration,
          remaining: cs.remaining,
          picks: cs.picks
        }, player.id);
        game.lan.relay({
          kind: 'char_select_roster',
          sessionId: cs.sessionId,
          remaining: cs.remaining,
          picks: cs.picks
        }, 'others');
      }
      const ui = tUI();
      if (game.mode !== 'title' && game.mode !== 'lobby') {
        game.spawnFloatingText(game.hero.x, 2.35, game.hero.z, ui.floatPartyJoin(player.name), '#9be8ff', 'callout');
        rescaleExistingEnemiesForParty(game, playerCount);
        if (game.isCoopHost && game.isCoopHost() && game.consumedOneTimeNetIds && game.consumedOneTimeNetIds.size > 0) {
          game.lan.relay({
            kind: 'interact_sync',
            sub: 'consumed_snapshot',
            usedNetIds: [...game.consumedOneTimeNetIds]
          }, player.id);
        }
      }
      game.updateHUD();
    },
    onPlayerLeft: (msg) => {
      game.sfx?.coopPlayerLeave?.();
      removeRemotePlayer(game, msg.playerId);
      if (game.isCoopCharSelectActive?.()) {
        delete game.coopCharSelect.picks[msg.playerId];
        syncCharSelectPicksWithLobby(game);
        renderCoopCharSelectUI(game);
        if (game.isCoopHost?.()) {
          checkAndFinalizeCoopCharSelect(game, false);
        }
      }
      const ui = tUI();
      if (game.mode !== 'title' && game.mode !== 'lobby') {
        game.spawnFloatingText(game.hero.x, 2.35, game.hero.z, ui.floatPartyLeave(msg.playerName || 'Ally'), '#ffb85c', 'callout');
        rescaleExistingEnemiesForParty(game, msg.playerCount || 1);
        checkCoopPartyWipe(game);
      }
      game.updateHUD();
    },
    onRunLaunched: (msg) => {
      stopCoopCharSelect(game);
      const cmap = msg && msg.floorInit && msg.floorInit.classMap;
      if (cmap && typeof cmap === 'object') {
        for (const [pid, cid] of Object.entries(cmap)) {
          if (!cid) continue;
          game._peerClassMap?.set(pid, cid);
          const lp = game.lan.players.find((x) => x.id === pid);
          if (lp) lp.classId = cid;
        }
        const myAssigned = cmap[game.lan.clientId];
        if (myAssigned) {
          selectHeroClass(game, myAssigned, true, { silentNet: true });
          game.lan.updateProfile?.({ classId: myAssigned });
        }
      }
      syncRemoteRosterFromLobby(game);
      document.getElementById('title-overlay')?.classList.add('hidden');
      document.getElementById('lan-overlay')?.classList.add('hidden');
      document.getElementById('pause-overlay')?.classList.add('hidden');
      document.getElementById('end-overlay')?.classList.add('hidden');
      game.sfx?.setPausedDamp?.(false);
      game.sfx?.uiRunStart?.();
      if (msg.floorInit) {
        game.startCoopRunFromInit(msg.floorInit, false);
      }
    },
    onRelay: (fromId, payload) => {
      handleCoopRelay(game, fromId, payload);
    },
    onDisconnected: () => {
      stopCoopCharSelect(game);
      clearAllRemotePlayers(game);
      game.updateHUD();
    }
  });

  game.isCoopActive = () => !!(game.lan && game.lan.inRoom);
  game.isCoopHost = () => !!(game.lan && game.lan.inRoom && game.lan.isHost);
  game.isCoopClient = () => !!(game.lan && game.lan.inRoom && !game.lan.isHost);
  game.isCoopCharSelectActive = () => !!(game.coopCharSelect && game.coopCharSelect.active);
  game.isCoopCharSelectLocked = () => {
    if (!game.isCoopCharSelectActive()) return false;
    const entry = game.coopCharSelect.picks[game.lan.clientId];
    return !!(entry && entry.locked);
  };
  game.coopOnCharBrowse = (classId) => {
    if (!game.isCoopCharSelectActive()) return;
    const cs = game.coopCharSelect;
    if (cs.committed) return;
    syncCharSelectPicksWithLobby(game);
    const me = cs.picks[game.lan.clientId];
    if (!me || me.locked) return;
    me.browsedClassId = classId;
    renderCoopCharSelectUI(game);
    game.lan.relay({
      kind: 'char_select_browse',
      sessionId: cs.sessionId,
      classId
    }, 'others');
  };
  game.coopConfirmCharSelect = () => {
    if (!game.isCoopCharSelectActive()) return;
    const cs = game.coopCharSelect;
    if (cs.committed) return;
    syncCharSelectPicksWithLobby(game);
    const me = cs.picks[game.lan.clientId];
    if (!me || me.locked) return;
    const chosenId = me.browsedClassId || game.browsedClassId || HERO_CLASSES[0].id;
    me.browsedClassId = chosenId;
    me.locked = true;
    me.lockedClassId = chosenId;
    game.browsedClassId = chosenId;
    game.sfx?.coopLockHero?.();
    selectHeroClass(game, chosenId, true, { silentNet: true });
    renderCoopCharSelectUI(game);
    game.lan.relay({
      kind: 'char_select_lock',
      sessionId: cs.sessionId,
      locked: true,
      classId: chosenId
    }, 'others');
    if (game.isCoopHost()) {
      checkAndFinalizeCoopCharSelect(game, false);
    }
  };
  game.coopUnlockCharSelect = () => {
    if (!game.isCoopCharSelectActive()) return;
    const cs = game.coopCharSelect;
    if (cs.committed) return;
    const me = cs.picks[game.lan.clientId];
    if (!me || !me.locked) return;
    me.locked = false;
    me.lockedClassId = null;
    game.sfx?.uiBack?.();
    renderClassSelectionUI(game);
    renderCoopCharSelectUI(game);
    game.lan.relay({
      kind: 'char_select_lock',
      sessionId: cs.sessionId,
      locked: false,
      classId: me.browsedClassId
    }, 'others');
  };
  game.coopBackFromCharSelect = () => {
    if (!game.isCoopCharSelectActive()) return;
    const cs = game.coopCharSelect;
    if (game.isCoopHost()) {
      const sid = cs.sessionId;
      game.lan.relay({ kind: 'char_select_abort', sessionId: sid }, 'others');
      abortCoopCharSelectToLobby(game);
    } else {
      stopCoopCharSelect(game);
      game.coopOpenLobby(true);
    }
  };
  game.coopRenderCharSelectMeta = () => renderCoopCharSelectUI(game);
  game.getActiveScaling = () => getMultiplayerScaling(
    game.isCoopActive() ? game.lan.playerCount : 1,
    game.selectedDifficultyId || DEFAULT_DIFFICULTY_ID
  );
  game.coopSlotIndex = () => {
    if (!game.isCoopActive()) return 0;
    const me = game.lan.players.find((p) => p.id === game.lan.clientId);
    return me ? (me.slot || 0) : 0;
  };
  game.coopApplyLanguageUI = () => applyCoopLanguageUI(game);
  game.coopRefreshLobbyUI = () => renderLanLobbyUI(game);
  game.coopOnWeaponChanged = () => {
    if (!game.isCoopActive()) return;
    const wpn = game.activeWeapon();
    game.lan.relay({
      kind: 'weapon_changed',
      activeSlot: game.hero.activeSlot,
      wpn0: serializeWeaponInst(game.hero.weapons[0]),
      wpn1: serializeWeaponInst(game.hero.weapons[1]),
      equippedWeaponId: wpn ? wpn.id : null
    }, 'others');
  };
  game.coopUpdate = (dt) => updateCoopFrame(game, dt);
  game.coopProjectTags = () => projectAllAllyWorldTags(game);
  game.coopInterpolateEnemies = (dt) => interpolateClientEnemies(game, dt);
  game.coopSendDamageReq = (e, rawDmg, srcX, srcZ, opts = {}) => {
    if (!e || !e.eid || !game.isCoopClient()) return;
    const wpn = opts.weaponInst || game.activeWeapon();
    game.vfx.burst(e.x, 1.15, e.z, opts.fxColor || game.hero.bladeColor, 9, 4.4, 9.0);
    game.lan.relay({
      kind: 'damage_req',
      eid: e.eid,
      rawDmg,
      srcX,
      srcZ,
      allowCrit: opts.allowCrit !== false,
      fxColor: opts.fxColor || null,
      chillDuration: opts.chillDuration || 0,
      inflictBurn: !!opts.inflictBurn,
      stagger: opts.stagger || 0,
      isDot: !!opts.isDot,
      weapon: serializeWeaponInst(wpn),
      attackerCritChance: game.hero.critChance,
      attackerCritMult: game.hero.critMult,
      attackerShieldBreak: game.hero.shieldBreakMult || 1.0,
      attackerBurnDps: game.hero.burnDps || 0
    }, 'host');
  };
  game.coopBroadcastPlayerAction = (action) => {
    if (!game.isCoopActive()) return;
    game.lan.relay({ kind: 'player_action', ...action }, 'others');
  };
  game.coopBroadcastEnemyAttack = (spec) => {
    if (!game.isCoopHost()) return;
    game.lan.relay({ kind: 'enemy_attack', ...spec }, 'others');
  };
  game.coopResetPeersToStartRoom = (startRoom) => {
    if (!startRoom || !game.remotePlayers) return;
    for (const peer of game.remotePlayers.values()) {
      const pSlot = ((peer.slot || 0) % 4 + 4) % 4;
      const spot = game.findSafeSpotInRoom(
        startRoom,
        START_SLOT_OFFSETS[pSlot] || START_SLOT_OFFSETS[0],
        0.8
      );
      peer.x = spot.x;
      peer.z = spot.z;
      peer.targetX = spot.x;
      peer.targetZ = spot.z;
      peer.vx = 0;
      peer.vz = 0;
      peer.floorIndex = game.floorIndex || 0;
      peer.floorSynced = false;
      if (peer.rig && peer.rig.root) {
        peer.rig.root.position.set(spot.x, 0, spot.z);
      }
    }
  };
  game.coopDisconnectRoom = () => {
    stopCoopCharSelect(game);
    if (game.lan && game.lan.inRoom) {
      game.lan.leaveRoom();
    }
    clearAllRemotePlayers(game);
  };
  game.coopOpenLobby = (leaveCurrentRoom = false) => {
    if (leaveCurrentRoom) {
      game.coopDisconnectRoom();
    }
    openLanLobby(game);
  };
  game.coopCloseLobbyToTitle = () => closeLanLobbyToTitle(game);
  game.coopCheckUrlRoom = () => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      let code = params.get('room');
      if (!code || !code.trim()) {
        const pathSeg = (window.location.pathname || '').replace(/^\/+|\/+$/g, '');
        if (/^[A-Za-z0-9]{3,6}$/.test(pathSeg) && !/^(index|ws)$/i.test(pathSeg)) {
          code = pathSeg;
        }
      }
      if (code && code.trim()) {
        openLanLobby(game, true);
        const codeInput = document.getElementById('lan-code-input');
        if (codeInput) codeInput.value = code.trim().toUpperCase();
      }
    } catch (_) {}
  };

  bindLanLobbyEvents(game);
}

export function setLocalTheme(game, themeIdx, notifyServer = true) {
  const clamped = ((themeIdx % 4) + 4) % 4;
  game.localThemeIdx = clamped;
  const theme = getPlayerTheme(clamped);
  if (game.heroRig && game.heroRig.applyTheme) {
    game.heroRig.applyTheme(theme);
  }
  if (game.localDownedBeacon) {
    game.localDownedBeacon.fillMat.color.setHex(theme.accentHex);
  }
  document.querySelectorAll('#lan-color-picker .lan-swatch').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.theme) === clamped);
  });
  if (notifyServer && game.lan && game.lan.inRoom) {
    game.lan.updateProfile({ themeIdx: clamped });
  }
}

export function openLanLobby(game, fromAutoUrl = false) {
  if (!fromAutoUrl) {
    game.sfx.init();
    game.sfx?.uiToggle?.(true);
  }
  game.sfx.setPausedDamp?.(false);
  game.mode = 'lobby';
  game._lanErrorText = '';
  document.getElementById('title-overlay')?.classList.add('hidden');
  document.getElementById('end-overlay')?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');
  document.getElementById('boon-overlay')?.classList.add('hidden');
  document.getElementById('weapon-overlay')?.classList.add('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  document.getElementById('lan-overlay')?.classList.remove('hidden');
  game.syncPauseButtonVisibility?.();

  const wsInput = document.getElementById('lan-ws-input');
  const customWs = wsInput && wsInput.value.trim() ? wsInput.value.trim() : null;
  renderLanLobbyUI(game);

  game.lan.connect(customWs).then(() => {
    game.lan.requestRooms();
    renderLanLobbyUI(game);
  }).catch(() => {
    renderLanLobbyUI(game);
  });
}

export function closeLanLobbyToTitle(game) {
  stopCoopCharSelect(game);
  game.sfx?.uiBack?.();
  if (game.lan && game.lan.inRoom) {
    game.lan.leaveRoom();
  }
  clearAllRemotePlayers(game);
  document.getElementById('lan-overlay')?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');
  document.getElementById('title-overlay')?.classList.remove('hidden');
  game.mode = 'title';
  game.setTitleStage?.('hub');
  game.syncPauseButtonVisibility?.();
  game.updateHUD();
}

function bindLanLobbyEvents(game) {
  const btnOpen = document.getElementById('btn-lan-lobby');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => openLanLobby(game));
  }

  const nameInput = document.getElementById('lan-name-input');
  if (nameInput) {
    nameInput.addEventListener('change', () => {
      const val = nameInput.value.trim().slice(0, 16);
      if (val) {
        game.localPlayerName = val;
        if (game.lan.inRoom) game.lan.updateProfile({ name: val });
      }
    });
  }

  document.querySelectorAll('#lan-color-picker .lan-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.theme) || 0;
      game.sfx?.init?.();
      game.sfx?.uiSettingTick?.(true);
      setLocalTheme(game, idx, true);
    });
  });

  const getFormValues = () => {
    const rawWs = document.getElementById('lan-ws-input')?.value.trim() || '';
    const nmVal = document.getElementById('lan-name-input')?.value.trim().slice(0, 16) || game.localPlayerName || 'P1';
    game.localPlayerName = nmVal;
    return { wsUrl: rawWs || null, name: nmVal };
  };

  const btnCreate = document.getElementById('btn-lan-create');
  if (btnCreate) {
    btnCreate.addEventListener('click', async () => {
      game.sfx?.init?.();
      game._lanErrorText = '';
      const { wsUrl, name } = getFormValues();
      try {
        await game.lan.createRoom({ name, themeIdx: game.localThemeIdx, classId: game.selectedClassId || DEFAULT_CLASS_ID, wsUrl });
        game.sfx?.coopPlayerJoin?.();
      } catch (_) {
        game.sfx?.uiReject?.();
        game._lanErrorText = tUI().lanErrConnect;
        renderLanLobbyUI(game);
      }
    });
  }

  const btnJoin = document.getElementById('btn-lan-join');
  const codeInput = document.getElementById('lan-code-input');
  const triggerJoinByCode = async (overrideCode = null) => {
    game.sfx?.init?.();
    const rawTarget = overrideCode || codeInput?.value || '';
    const parsed = parseJoinTarget(rawTarget);
    const code = parsed.code;
    if (!code) {
      game.sfx?.uiReject?.();
      return;
    }
    game._lanErrorText = '';
    const { wsUrl, name } = getFormValues();
    const effectiveWs = parsed.wsUrl || wsUrl;
    try {
      await game.lan.joinRoom({ code, name, themeIdx: game.localThemeIdx, classId: game.selectedClassId || DEFAULT_CLASS_ID, wsUrl: effectiveWs });
      game.sfx?.coopPlayerJoin?.();
    } catch (_) {
      game.sfx?.uiReject?.();
      game._lanErrorText = tUI().lanErrConnect;
      renderLanLobbyUI(game);
    }
  };
  if (btnJoin) btnJoin.addEventListener('click', () => triggerJoinByCode());
  if (codeInput) {
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerJoinByCode();
    });
  }

  const btnRefresh = document.getElementById('btn-lan-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      game.sfx?.init?.();
      game.sfx?.uiClick?.();
      const { wsUrl } = getFormValues();
      try {
        await game.lan.connect(wsUrl);
        game.lan.requestRooms();
      } catch (_) {
        game.sfx?.uiReject?.();
        game._lanErrorText = tUI().lanErrConnect;
        renderLanLobbyUI(game);
      }
    });
  }

  const btnBack = document.getElementById('btn-lan-back');
  if (btnBack) btnBack.addEventListener('click', () => closeLanLobbyToTitle(game));

  const btnLeave = document.getElementById('btn-lan-leave');
  if (btnLeave) {
    btnLeave.addEventListener('click', () => {
      game.sfx?.init?.();
      game.sfx?.coopPlayerLeave?.();
      game.lan.leaveRoom();
      clearAllRemotePlayers(game);
      renderLanLobbyUI(game);
    });
  }

  const btnReady = document.getElementById('btn-lan-ready');
  if (btnReady) {
    btnReady.addEventListener('click', () => {
      const me = game.lan.players.find((p) => p.id === game.lan.clientId);
      if (!me) return;
      game.sfx?.init?.();
      game.sfx?.coopReadyToggle?.(!me.ready);
      game.lan.updateProfile({ ready: !me.ready });
    });
  }

  const btnLaunch = document.getElementById('btn-lan-launch');
  if (btnLaunch) {
    btnLaunch.addEventListener('click', () => {
      if (!game.lan.isHost) return;
      const allReady = game.lan.players.every((p) => p.ready || p.isHost);
      if (!allReady) {
        game.sfx?.init?.();
        game.sfx?.uiReject?.();
        return;
      }
      startCoopCharSelect(game);
    });
  }

  const copyHelper = (btnId, getTextFn) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      game.sfx?.init?.();
      game.sfx?.uiSettingTick?.(true);
      const txt = getTextFn();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).catch(() => {});
      }
      const orig = btn.textContent;
      btn.textContent = tUI().lanCopied;
      setTimeout(() => {
        btn.textContent = orig;
        renderLanLobbyUI(game);
      }, 1100);
    });
  };
  copyHelper('btn-copy-code', () => game.lan.roomCode || '');
  copyHelper('btn-copy-url', () => computeShareInviteUrl(game));

  const btnCopyWan = document.getElementById('btn-copy-wan-url');
  if (btnCopyWan) {
    btnCopyWan.addEventListener('click', () => {
      game.sfx?.init?.();
      game.sfx?.uiSettingTick?.(true);
      const wanInvite = computeWanInviteUrl(game);
      if (wanInvite) {
        game._pendingWanAutoCopy = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(wanInvite).catch(() => {});
        }
        btnCopyWan.dataset.flashing = '1';
        btnCopyWan.textContent = tUI().lanCopied;
        setTimeout(() => {
          delete btnCopyWan.dataset.flashing;
          renderLanLobbyUI(game);
        }, 1200);
      } else {
        game._pendingWanAutoCopy = true;
        game.lan.ensureWanTunnel?.({ force: true });
        renderLanLobbyUI(game);
      }
    });
  }

  const btnRefreshWan = document.getElementById('btn-refresh-wan');
  if (btnRefreshWan) {
    btnRefreshWan.addEventListener('click', () => {
      game.sfx?.init?.();
      game.sfx?.uiSettingTick?.(true);
      game.lan.ensureWanTunnel?.({ refresh: true, force: true });
      renderLanLobbyUI(game);
    });
  }

  const lanDiffWrap = document.getElementById('lan-diff-picker');
  if (lanDiffWrap) {
    lanDiffWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-diff-id]');
      if (!btn || (game.lan.inRoom && !game.lan.isHost)) return;
      const diffId = btn.getAttribute('data-diff-id');
      game.sfx?.init?.();
      game.sfx?.uiDifficultySelect?.(diffId);
      game.setDifficulty?.(diffId, true);
      if (game.lan.inRoom && game.lan.isHost) {
        game.lan.relay({ kind: 'difficulty_changed', difficultyId: diffId }, 'others');
      }
      renderLanLobbyUI(game);
    });
  }

  const roomsListEl = document.getElementById('lan-rooms-list');
  if (roomsListEl) {
    roomsListEl.addEventListener('click', (e) => {
      const joinBtn = e.target.closest('[data-join-room]');
      if (joinBtn) {
        triggerJoinByCode(joinBtn.getAttribute('data-join-room'));
      }
    });
  }
}

function computeShareInviteUrl(game) {
  const code = game.lan.roomCode || '';
  const urls = game.lan.lanUrls || [];
  const lanPreferred = urls.find((u) => !u.includes('127.0.0.1') && !u.includes('localhost')) || urls[0];
  if (lanPreferred) {
    return code ? `${lanPreferred}/?room=${code}` : lanPreferred;
  }
  if (window.location.protocol.startsWith('http')) {
    return `${window.location.origin}${window.location.pathname}?room=${code}`;
  }
  return `http://127.0.0.1:18765/?room=${code}`;
}

function computeWanInviteUrl(game) {
  const code = game.lan.roomCode || '';
  if (game.lan && game.lan.wanUrl) {
    const base = String(game.lan.wanUrl).replace(/\/+$/, '');
    if (/\.serveo/i.test(base)) {
      return code
        ? `${base}/${code}?serveo-skip-browser-warning=true`
        : `${base}/?serveo-skip-browser-warning=true`;
    }
    return code ? `${base}/?room=${code}` : `${base}/`;
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' || isPublicRemoteHost(window.location.hostname))
  ) {
    return code
      ? `${window.location.origin}${window.location.pathname}?room=${code}`
      : `${window.location.origin}${window.location.pathname}`;
  }
  return '';
}

export function applyCoopLanguageUI(game) {
  const ui = tUI();
  const zh = getLang() === 'zh';
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt('hub-coop-title', ui.hubCoopTitle || ui.btnLanLobby);
  setTxt('hub-coop-sub', ui.hubCoopSub || '');
  setTxt('hub-coop-cue', ui.hubCoopCue || '');
  setTxt('lan-kicker', ui.lanKicker);
  setTxt('lan-header', ui.lanHeader);
  setTxt('lan-sub', ui.lanSub);
  setTxt('lbl-lan-ws', ui.lanServerLabel);
  setTxt('lbl-lan-name', ui.lanNameLabel);
  setTxt('lbl-lan-color', ui.lanColorLabel);
  setTxt('btn-lan-create', ui.lanCreateBtn);
  setTxt('btn-lan-join', ui.lanJoinBtn);
  setTxt('btn-lan-refresh', ui.lanRefreshBtn);
  setTxt('btn-lan-back', ui.lanBackBtn);
  setTxt('lan-active-rooms-title', ui.lanActiveRoomsTitle);
  setTxt('lan-cli-hint', ui.lanServerHint);
  setTxt('lbl-room-code', ui.lanRoomCodeLabel);
  setTxt('lbl-share-url', ui.lanShareUrlLabel);
  setTxt('lbl-wan-share-url', ui.lanWanShareUrlLabel);
  setTxt('btn-copy-code', ui.lanCopyCodeBtn);
  setTxt('btn-copy-url', ui.lanCopyUrlBtn);
  setTxt('btn-lan-leave', ui.lanLeaveBtn);
  const refreshWanBtn = document.getElementById('btn-refresh-wan');
  if (refreshWanBtn && ui.lanWanRefreshTitle) refreshWanBtn.title = ui.lanWanRefreshTitle;
  setTxt(
    'lan-create-desc',
    zh
      ? '作为房主创建 1–4 人联机房间，同时生成同 Wi‑Fi 链接与异地好友公网网址，自动同步秘境种子与动态难度。'
      : 'Host a 1–4P room with instant LAN & Online Invite URLs, synced 4-floor seeds & dynamic scaling.'
  );
  setTxt(
    'lan-join-desc',
    zh
      ? '输入同伴分享的房间码、粘贴异地邀请网址，或从下方公开房间列表一键加入。'
      : 'Enter a 4-letter Room Code, paste an Online Invite URL, or join an open room below.'
  );
  const codeInp = document.getElementById('lan-code-input');
  if (codeInp) codeInp.placeholder = ui.lanJoinPlaceholder;

  const nameInp = document.getElementById('lan-name-input');
  if (nameInp && (nameInp.value === '烬火骑士' || nameInp.value === 'Ashen Knight')) {
    nameInp.value = zh ? '烬火骑士' : 'Ashen Knight';
    game.localPlayerName = nameInp.value;
  }

  renderLanLobbyUI(game);
  if (game.isCoopCharSelectActive?.()) {
    renderCoopCharSelectUI(game);
  }
  updateCoopHudWidgets(game);
}

export function renderLanLobbyUI(game) {
  const overlay = document.getElementById('lan-overlay');
  if (!overlay) return;
  const ui = tUI();
  const zh = getLang() === 'zh';
  const lan = game.lan;

  const connPill = document.getElementById('lan-conn-pill');
  if (connPill) {
    if (lan.connected) {
      if (lan.transportMode === 'embedded') {
        connPill.textContent = ui.lanStatusEmbedded || ui.lanStatusConnected(lan.pingMs);
      } else if (lan.p2pPeerCount > 0 && ui.lanStatusP2PActive) {
        connPill.textContent = ui.lanStatusP2PActive(lan.pingMs);
      } else if (lan.isWanClient && ui.lanStatusWanClient) {
        connPill.textContent = ui.lanStatusWanClient(lan.pingMs);
      } else if (lan.wanUrl && ui.lanStatusConnectedWanReady) {
        connPill.textContent = ui.lanStatusConnectedWanReady(lan.pingMs);
      } else {
        connPill.textContent = ui.lanStatusConnected(lan.pingMs);
      }
      connPill.classList.add('online');
    } else if (lan.connecting) {
      connPill.textContent = ui.lanStatusConnecting;
      connPill.classList.remove('online');
    } else {
      connPill.textContent = ui.lanStatusOffline;
      connPill.classList.remove('online');
    }
  }

  const errBox = document.getElementById('lan-error-box');
  if (errBox) errBox.textContent = game._lanErrorText || '';

  const entryPanel = document.getElementById('lan-entry-panel');
  const roomPanel = document.getElementById('lan-room-panel');
  if (!lan.inRoom) {
    entryPanel?.classList.remove('hidden');
    roomPanel?.classList.add('hidden');

    const listEl = document.getElementById('lan-rooms-list');
    if (listEl) {
      if (!lan.roomsList || lan.roomsList.length === 0) {
        listEl.innerHTML = `<div style="font-size:12.5px;color:#8c98ad;padding:8px 2px">${ui.lanNoRooms}</div>`;
      } else {
        listEl.innerHTML = lan.roomsList.map((r) => `
          <div class="lan-room-item">
            <div>
              <strong style="color:#f6d794;letter-spacing:0.1em;margin-right:10px">${r.code}</strong>
              <span style="color:#e2e8f0">${escapeHtml(r.hostName)}</span>
              <span style="color:#94a3b8;margin-left:10px;font-size:11.5px">${ui.lanRoomMeta(r.playerCount, r.maxPlayers, r.inGame)}</span>
            </div>
            <button type="button" class="sys-btn" data-join-room="${r.code}" style="border-color:#5ec2ff;color:#9be8ff">${ui.lanOpenJoinBtn}</button>
          </div>
        `).join('');
      }
    }
    return;
  }

  entryPanel?.classList.add('hidden');
  roomPanel?.classList.remove('hidden');

  const codeVal = document.getElementById('lan-room-code-val');
  if (codeVal) codeVal.textContent = lan.roomCode;
  const shareVal = document.getElementById('lan-share-url-val');
  if (shareVal) shareVal.textContent = computeShareInviteUrl(game);

  const wanRow = document.getElementById('wan-share-row');
  if (wanRow) {
    wanRow.classList.toggle('hidden', lan.transportMode === 'embedded');
    const wanValEl = document.getElementById('wan-share-url-val');
    const btnCopyWan = document.getElementById('btn-copy-wan-url');
    const wanInvite = computeWanInviteUrl(game);
    if (wanInvite) {
      if (wanValEl) wanValEl.textContent = wanInvite;
      if (game._pendingWanAutoCopy) {
        game._pendingWanAutoCopy = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(wanInvite).catch(() => {});
        }
        if (btnCopyWan) {
          btnCopyWan.dataset.flashing = '1';
          btnCopyWan.textContent = ui.lanCopied;
          setTimeout(() => {
            delete btnCopyWan.dataset.flashing;
            renderLanLobbyUI(game);
          }, 1200);
        }
      } else if (btnCopyWan && !btnCopyWan.dataset.flashing) {
        btnCopyWan.textContent = ui.lanCopyWanUrlBtn || ui.lanCopyUrlBtn;
      }
    } else if (lan.wanStatus === 'connecting') {
      if (wanValEl) wanValEl.textContent = ui.lanWanGenerating || '...';
      if (btnCopyWan && !btnCopyWan.dataset.flashing) {
        btnCopyWan.textContent = zh ? '生成中…' : 'GENERATING...';
      }
    } else {
      if (wanValEl) wanValEl.textContent = ui.lanWanIdleHint || '';
      if (btnCopyWan && !btnCopyWan.dataset.flashing) {
        btnCopyWan.textContent = ui.lanEnableWanUrlBtn || ui.lanCopyWanUrlBtn;
      }
    }
  }
  const curDiff = getDifficultyConfig(game.selectedDifficultyId);
  const lanDiffWrap = document.getElementById('lan-diff-picker');
  if (lanDiffWrap) {
    lanDiffWrap.innerHTML = DIFFICULTY_TIERS.map((d) => {
      const active = d.id === curDiff.id;
      const name = zh ? d.zhName : d.enName;
      const badge = zh ? d.zhBadge : d.enBadge;
      const disabledAttr = !lan.isHost ? 'disabled' : '';
      return `<button type="button" class="diff-pill-btn ${active ? 'active' : ''}" data-diff-id="${d.id}" style="--diff-col:${d.accent}" ${disabledAttr}><span>${name}</span><em>${badge}</em></button>`;
    }).join('');
  }

  const sc = getMultiplayerScaling(lan.playerCount, curDiff.id);
  const scaleBanner = document.getElementById('lan-scale-banner');
  if (scaleBanner) scaleBanner.textContent = ui.lanScalePreview(sc);

  const slotsGrid = document.getElementById('lan-slots-grid');
  if (slotsGrid) {
    const cards = [];
    for (let i = 0; i < 4; i++) {
      const p = lan.players[i];
      if (p) {
        const th = getPlayerTheme(p.themeIdx);
        const roleTitle = `${zh ? th.zhName : th.enName} · ${ui.lanSlotPostPick || ''}`;
        const badges = [];
        if (p.isHost) badges.push(ui.lanHostTag);
        if (p.id === lan.clientId) badges.push(ui.lanYouTag);
        const badgeStr = badges.length > 0 ? ` · ${badges.join(' / ')}` : '';
        const isReady = p.ready || p.isHost;
        cards.push(`
          <div class="lan-slot-card occupied" style="--slot-color:${th.accent}">
            <div>
              <div class="lan-slot-badge">P${i + 1}${badgeStr}</div>
              <div class="lan-slot-name">${escapeHtml(p.name)}</div>
              <div class="lan-slot-role">${roleTitle}</div>
            </div>
            <div class="lan-ready-pill ${isReady ? 'ready' : ''}">${isReady ? ui.lanReadyTag : ui.lanNotReadyTag}</div>
          </div>
        `);
      } else {
        cards.push(`
          <div class="lan-slot-card">
            <div>
              <div class="lan-slot-badge">P${i + 1}</div>
              <div class="lan-slot-name" style="color:#64748b;font-size:13px;font-weight:500">${ui.lanEmptySlot}</div>
            </div>
            <div class="lan-ready-pill" style="opacity:0.45">—</div>
          </div>
        `);
      }
    }
    slotsGrid.innerHTML = cards.join('');
  }

  const me = lan.players.find((p) => p.id === lan.clientId);
  const btnReady = document.getElementById('btn-lan-ready');
  const btnLaunch = document.getElementById('btn-lan-launch');
  if (btnReady) {
    if (lan.isHost) {
      btnReady.classList.add('hidden');
    } else {
      btnReady.classList.remove('hidden');
      btnReady.textContent = me && me.ready ? ui.lanUnreadyBtn : ui.lanReadyBtn;
    }
  }
  if (btnLaunch) {
    const allReady = lan.players.every((p) => p.ready || p.isHost);
    if (lan.isHost) {
      btnLaunch.disabled = !allReady;
      btnLaunch.textContent = allReady ? ui.lanLaunchBtn : ui.lanWaitReadyBtn;
    } else {
      btnLaunch.disabled = true;
      btnLaunch.textContent = ui.lanWaitHostBtn;
    }
  }
}

function syncRemoteRosterFromLobby(game) {
  if (!game.lan || !game.lan.inRoom) {
    clearAllRemotePlayers(game);
    return;
  }
  const activeIds = new Set();
  for (const p of game.lan.players) {
    if (p.id === game.lan.clientId) {
      if (Number.isInteger(p.themeIdx) && p.themeIdx !== game.localThemeIdx) {
        setLocalTheme(game, p.themeIdx, false);
      }
      continue;
    }
    activeIds.add(p.id);
    if (p.classId) {
      game._peerClassMap?.set(p.id, p.classId);
    }
    const existing = ensureRemotePlayer(game, p.id, p);
    existing.name = p.name;
    existing.slot = p.slot;
    const desiredClassId = p.classId || game._peerClassMap?.get(p.id) || existing.classId;
    if (desiredClassId && desiredClassId !== existing.classId) {
      existing.classId = desiredClassId;
      existing.rig.root.remove(existing.allyRing.root);
      existing.rig.root.remove(existing.downedBeacon.root);
      game.scene.remove(existing.rig.root);
      existing.rig = createHeroRig(game.mats, existing.theme, existing.classId);
      existing.rig.root.add(existing.allyRing.root);
      existing.rig.root.add(existing.downedBeacon.root);
      existing.rig.root.position.set(existing.x, 0, existing.z);
      existing.rig.root.rotation.y = existing.yaw;
      game.scene.add(existing.rig.root);
      existing.mountedWeaponKey = '';
      mountRemotePlayerWeapon(game, existing);
    }
    if (existing.themeIdx !== p.themeIdx) {
      existing.themeIdx = p.themeIdx;
      existing.theme = getPlayerTheme(p.themeIdx);
      existing.rig.applyTheme(existing.theme);
      existing.allyRing.setThemeHex(existing.theme.accentHex);
      existing.downedBeacon.fillMat.color.setHex(existing.theme.accentHex);
      if (existing.tagEl) {
        existing.tagEl.style.setProperty('--ally-color', existing.theme.accent);
      }
    }
    if (existing.tagNameEl) existing.tagNameEl.textContent = p.name;
  }
  for (const peerId of [...game.remotePlayers.keys()]) {
    if (!activeIds.has(peerId)) {
      removeRemotePlayer(game, peerId);
    }
  }
}

function ensureRemotePlayer(game, peerId, meta = {}) {
  if (game.remotePlayers.has(peerId)) return game.remotePlayers.get(peerId);
  const themeIdx = Number.isInteger(meta.themeIdx) ? meta.themeIdx : (game.remotePlayers.size + 1) % 4;
  const theme = getPlayerTheme(themeIdx);
  const classId = meta.classId || game._peerClassMap?.get(peerId) || DEFAULT_CLASS_ID;
  const rig = createHeroRig(game.mats, theme, classId);
  const allyRing = createAllyGroundRing(theme.accentHex);
  const downedBeacon = createDownedBeacon(game.tex, theme.accentHex);
  rig.root.add(allyRing.root);
  rig.root.add(downedBeacon.root);

  const startX = game.hero ? game.hero.x + (game.remotePlayers.size + 1) * 1.3 : 0;
  const startZ = game.hero ? game.hero.z : 2.0;
  rig.root.position.set(startX, 0, startZ);
  game.scene.add(rig.root);

  const wpn0 = rollWeaponInstance('greatsword', 1, false);
  const wpn1 = rollWeaponInstance('crossbow', 1, false);
  const vis = buildWeaponVisuals(wpn0, game.mats);
  while (rig.swordPivot.children.length > 0) rig.swordPivot.remove(rig.swordPivot.children[0]);
  rig.swordPivot.add(vis.group);

  const tagEl = document.createElement('div');
  tagEl.className = 'ally-world-tag hidden';
  tagEl.style.setProperty('--ally-color', theme.accent);
  tagEl.innerHTML = `
    <div class="ally-tag-name">${escapeHtml(meta.name || 'Ally')}</div>
    <div class="ally-tag-bar"><div class="ally-tag-fill" style="width:100%"></div></div>
  `;
  game.allyTagsLayer?.appendChild(tagEl);

  const peer = {
    id: peerId,
    name: meta.name || 'Ally',
    slot: meta.slot || 1,
    themeIdx,
    theme,
    classId,
    x: startX,
    z: startZ,
    targetX: startX,
    targetZ: startZ,
    vx: 0,
    vz: 0,
    yaw: Math.PI,
    targetYaw: Math.PI,
    moveSpeed: 0,
    floorIndex: game.floorIndex || 0,
    floorSynced: false,
    slimeScaleTimer: 0,
    bloodRageTimer: 0,
    hp: 135,
    maxHp: 135,
    downed: false,
    bleedout: 25,
    reviveProgress: 0,
    activeSlot: 0,
    weapons: [wpn0, wpn1],
    mountedWeaponKey: 'greatsword_1',
    mountedVis: vis,
    atkTimer: 0,
    atkDur: 0.3,
    atkStep: 0,
    atkFinisher: false,
    rangedAnimTimer: 0,
    rig,
    allyRing,
    downedBeacon,
    tagEl,
    tagNameEl: tagEl.querySelector('.ally-tag-name'),
    tagFillEl: tagEl.querySelector('.ally-tag-fill')
  };
  game.remotePlayers.set(peerId, peer);
  return peer;
}

function mountRemotePlayerWeapon(game, peer) {
  const wpn = peer.weapons[peer.activeSlot] || peer.weapons[0];
  if (!wpn) return;
  const key = `${wpn.id}_${wpn.tier}`;
  if (peer.mountedWeaponKey === key) return;
  peer.mountedWeaponKey = key;
  while (peer.rig.swordPivot.children.length > 0) {
    peer.rig.swordPivot.remove(peer.rig.swordPivot.children[0]);
  }
  while (peer.rig.offhandPivot.children.length > 0) {
    peer.rig.offhandPivot.remove(peer.rig.offhandPivot.children[0]);
  }
  const vis = buildWeaponVisuals(wpn, game.mats);
  peer.rig.swordPivot.add(vis.group);
  if (vis.offhand) peer.rig.offhandPivot.add(vis.offhand);
  peer.mountedVis = vis;
}

function removeRemotePlayer(game, peerId) {
  const peer = game.remotePlayers.get(peerId);
  if (!peer) return;
  game.scene.remove(peer.rig.root);
  if (peer.tagEl && peer.tagEl.parentNode) peer.tagEl.parentNode.removeChild(peer.tagEl);
  game.remotePlayers.delete(peerId);
}

function clearAllRemotePlayers(game) {
  for (const peerId of [...game.remotePlayers.keys()]) {
    removeRemotePlayer(game, peerId);
  }
}

function rescaleExistingEnemiesForParty(game, newPlayerCount) {
  if (!game.enemies || game.enemies.length === 0) return;
  const sc = getMultiplayerScaling(newPlayerCount, game.selectedDifficultyId || DEFAULT_DIFFICULTY_ID);
  for (const e of game.enemies) {
    if (!e || e.hp <= 0) continue;
    const hpRatio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    const baseHp = e.unscaledMaxHp || e.maxHp;
    e.unscaledMaxHp = baseHp;
    const mult = e.boss ? sc.bossHpMult : sc.mobHpMult;
    e.maxHp = Math.max(10, Math.round(baseHp * mult));
    e.hp = Math.max(1, Math.round(e.maxHp * hpRatio));
    if (e.maxShield > 0) {
      const shRatio = e.shield / e.maxShield;
      const baseSh = e.unscaledMaxShield || e.maxShield;
      e.unscaledMaxShield = baseSh;
      e.maxShield = Math.max(8, Math.round(baseSh * sc.shieldMult));
      e.shield = Math.round(e.maxShield * shRatio);
    }
  }
}

export function updateCoopHudWidgets(game) {
  const coopPill = document.getElementById('coop-scale-pill');
  const partyStrip = document.getElementById('party-strip');
  const downedBanner = document.getElementById('downed-hud-banner');
  const ui = tUI();

  if (!game.isCoopActive()) {
    coopPill?.classList.add('hidden');
    partyStrip?.classList.add('hidden');
    downedBanner?.classList.add('hidden');
    game.updateTelemetryHUD?.();
    return;
  }

  game.updateTelemetryHUD?.();
  const sc = game.getActiveScaling();
  if (coopPill) {
    coopPill.classList.remove('hidden');
    const txtEl = document.getElementById('coop-scale-text');
    const ttTitle = document.getElementById('coop-tt-title');
    const ttBody = document.getElementById('coop-tt-body');
    if (txtEl) txtEl.textContent = ui.hudCoopPill(sc.playerCount, sc.overallMult);
    if (ttTitle) ttTitle.textContent = ui.hudCoopTooltipTitle(sc.playerCount, sc.overallMult);
    if (ttBody) ttBody.textContent = ui.hudCoopTooltipBody(sc);
  }

  if (partyStrip) {
    partyStrip.classList.remove('hidden');
    const rows = [];
    const meTheme = getPlayerTheme(game.localThemeIdx);
    const myHpPct = Math.max(0, Math.min(100, (game.hero.hp / Math.max(1, game.hero.maxHp)) * 100));
    const myState = game.hero.downed
      ? (game.hero.reviveProgress > 0.02 ? ui.partyReviving(game.hero.reviveProgress) : ui.partyDowned(game.hero.bleedout))
      : `${Math.ceil(game.hero.hp)}/${game.hero.maxHp}`;
    rows.push(`
      <div class="party-card ${game.hero.downed ? 'is-downed' : ''}" style="--ally-color:${meTheme.accent}">
        <div class="party-row-top">
          <span class="party-name">${escapeHtml(game.localPlayerName)} (${ui.lanYouTag})</span>
          <span class="party-state">${myState}</span>
        </div>
        <div class="party-hp-track"><div class="party-hp-fill" style="width:${game.hero.downed ? Math.round(game.hero.reviveProgress * 100) : myHpPct}%"></div></div>
      </div>
    `);
    for (const peer of game.remotePlayers.values()) {
      const pct = Math.max(0, Math.min(100, (peer.hp / Math.max(1, peer.maxHp)) * 100));
      const stTxt = peer.downed
        ? (peer.reviveProgress > 0.02 ? ui.partyReviving(peer.reviveProgress) : ui.partyDowned(peer.bleedout))
        : `${Math.ceil(peer.hp)}/${peer.maxHp}`;
      rows.push(`
        <div class="party-card ${peer.downed ? 'is-downed' : ''}" style="--ally-color:${peer.theme.accent}">
          <div class="party-row-top">
            <span class="party-name">${escapeHtml(peer.name)}</span>
            <span class="party-state">${stTxt}</span>
          </div>
          <div class="party-hp-track"><div class="party-hp-fill" style="width:${peer.downed ? Math.round(peer.reviveProgress * 100) : pct}%"></div></div>
        </div>
      `);
    }
    partyStrip.innerHTML = rows.join('');
  }

  if (downedBanner) {
    if (game.hero.downed && game.mode === 'explore') {
      downedBanner.classList.remove('hidden');
      const dTitle = document.getElementById('downed-banner-title');
      const dSub = document.getElementById('downed-banner-sub');
      if (dTitle) dTitle.textContent = ui.downedBannerTitle;
      if (dSub) dSub.textContent = ui.downedBannerSub(game.hero.bleedout, game.hero.reviveProgress);
    } else {
      downedBanner.classList.add('hidden');
    }
  }
}

function updateCoopFrame(game, dt) {
  const h = game.hero;
  if (game.localDownedBeacon) {
    game.localDownedBeacon.update(game.time, h.downed, h.reviveProgress);
  }

  if (!game.isCoopActive()) return;

  if (h.downed) {
    if (h.reviveProgress <= 0.01) {
      h.bleedout = Math.max(0, h.bleedout - dt);
      if (h.bleedout <= 0) {
        checkCoopPartyWipe(game, true);
      }
    } else if (performance.now() - (h._lastRevivePacketMs || 0) > 450) {
      h.reviveProgress = Math.max(0, h.reviveProgress - dt * 0.25);
    }
  }

  if (game.revivingPeerId && !h.downed) {
    const target = game.remotePlayers.get(game.revivingPeerId);
    if (!target || !target.downed || Math.hypot(target.x - h.x, target.z - h.z) > 3.65) {
      game.revivingPeerId = null;
    } else {
      target.reviveProgress = Math.min(1.0, (target.reviveProgress || 0) + dt / 0.95);
      game.lan.relay({
        kind: 'revive_progress',
        targetId: target.id,
        progress: target.reviveProgress
      }, 'all');
      if (target.reviveProgress >= 1.0) {
        game.revivingPeerId = null;
        target.downed = false;
        target.reviveProgress = 0;
        target.hp = Math.round(target.maxHp * 0.5);
        game.lan.relay({
          kind: 'revive_complete',
          targetId: target.id,
          rescuerName: game.localPlayerName
        }, 'all');
        onPeerRevivedVisuals(game, target.x, target.z, target.name);
      }
    }
  }

  for (const peer of game.remotePlayers.values()) {
    const dx = peer.targetX - peer.x;
    const dz = peer.targetZ - peer.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 5.5) {
      peer.x = peer.targetX;
      peer.z = peer.targetZ;
    } else {
      const k = Math.min(1, dt * 16.0);
      peer.x += dx * k;
      peer.z += dz * k;
    }
    const yawDiff = Math.atan2(Math.sin(peer.targetYaw - peer.yaw), Math.cos(peer.targetYaw - peer.yaw));
    peer.yaw += yawDiff * Math.min(1, dt * 16.0);

    peer.rig.root.position.set(peer.x, 0, peer.z);
    peer.rig.root.rotation.y = peer.yaw;

    if (peer.downed) {
      peer.rig.body.position.y = -0.36;
      peer.rig.torso.rotation.x = 0.58;
      peer.rig.torso.rotation.y = 0;
      peer.rig.torso.scale.setScalar(1.0);
      peer.rig.leftLeg.rotation.x = -0.45;
      peer.rig.rightLeg.rotation.x = 0.25;
    } else {
      peer.rig.torso.rotation.x += (0 - peer.rig.torso.rotation.x) * Math.min(1, dt * 12);
      const moving = peer.moveSpeed > 0.35 || dist > 0.04;
      const phase = game.time * 11.5 + peer.slot * 1.4;
      const amp = moving ? 0.50 : 0.0;
      peer.rig.leftLeg.rotation.x += (Math.sin(phase) * amp - peer.rig.leftLeg.rotation.x) * Math.min(1, dt * 14);
      peer.rig.rightLeg.rotation.x += (-Math.sin(phase) * amp - peer.rig.rightLeg.rotation.x) * Math.min(1, dt * 14);
      if (peer.slimeScaleTimer > 0) {
        peer.slimeScaleTimer = Math.max(0, peer.slimeScaleTimer - dt);
        peer.rig.torso.scale.setScalar(2.05);
        peer.rig.body.position.y = Math.abs(Math.sin(peer.slimeScaleTimer * Math.PI * 3.0)) * 2.8;
      } else {
        if (peer.rig.torso.scale.x !== 1) peer.rig.torso.scale.setScalar(1.0);
        peer.rig.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : 0;
      }
      if (peer.bloodRageTimer > 0) {
        peer.bloodRageTimer = Math.max(0, peer.bloodRageTimer - dt);
        if (Math.random() < dt * 7.5) {
          game.vfx.burst(peer.x, 1.1, peer.z, 0xff2848, 3, 2.5, 4.0);
        }
      }

      if (peer.atkTimer > 0) {
        peer.atkTimer = Math.max(0, peer.atkTimer - dt);
        const p = 1 - peer.atkTimer / Math.max(0.12, peer.atkDur);
        const anim = peer.atkAnim || (peer.atkFinisher ? 'spin' : (peer.atkStep % 2 === 0 ? 'cleaveR' : 'cleaveL'));
        if (anim === 'spin') {
          peer.rig.torso.rotation.y = p * Math.PI * 2;
          peer.rig.rightShoulder.rotation.set(0.15, -1.35 + p * 2.7, 0.25);
        } else if (anim === 'thrust') {
          const tc = Math.sin(Math.min(1, p * 1.25) * Math.PI);
          peer.rig.torso.rotation.x = 0.22 * tc;
          peer.rig.torso.rotation.y = -0.24 + p * 0.42;
          peer.rig.rightShoulder.rotation.set(-0.95 + (1 - tc) * 0.52, 0.05, 0.06);
        } else if (anim === 'overheadSlam') {
          if (p < 0.38) {
            const wu = p / 0.38;
            peer.rig.torso.rotation.x = -0.26 * wu;
            peer.rig.rightShoulder.rotation.set(-2.1 * wu, -0.10, 0.10);
          } else {
            const sm = Math.min(1, (p - 0.38) / 0.35);
            peer.rig.torso.rotation.x = -0.26 + 0.58 * sm;
            peer.rig.rightShoulder.rotation.set(-2.1 + 2.0 * sm, -0.06, 0.08);
          }
        } else if (anim === 'crossX') {
          const cw = p < 0.5 ? (p / 0.5) : ((p - 0.5) / 0.5);
          const dir = p < 0.5 ? 1 : -1;
          peer.rig.torso.rotation.y = -0.34 * dir + cw * 0.68 * dir;
          peer.rig.rightShoulder.rotation.set(0.14, (-1.2 + cw * 2.4) * dir, 0.16);
          peer.rig.leftShoulder.rotation.set(0.14, (1.2 - cw * 2.4) * dir, -0.16);
        } else if (anim === 'iaidoDraw' || anim === 'whipSweep') {
          peer.rig.torso.rotation.y = -0.85 + p * 1.75;
          peer.rig.rightShoulder.rotation.set(0.08, -1.68 + p * 3.25, 0.14);
        } else if (peer.atkStep % 2 === 0) {
          peer.rig.torso.rotation.y = -0.55 + p * 1.15;
          peer.rig.rightShoulder.rotation.set(0.12, -1.45 + p * 2.65, 0.18);
        } else {
          peer.rig.torso.rotation.y = 0.55 - p * 1.15;
          peer.rig.rightShoulder.rotation.set(0.18, 1.25 - p * 2.55, -0.18);
        }
      } else {
        peer.rig.torso.rotation.y += (0 - peer.rig.torso.rotation.y) * Math.min(1, dt * 12);
        peer.rangedAnimTimer = Math.max(0, peer.rangedAnimTimer - dt);
        const wpn = peer.weapons[peer.activeSlot] || peer.weapons[0];
        if (wpn && wpn.def.category === 'ranged') {
          const recoil = peer.rangedAnimTimer > 0 ? -0.30 * (peer.rangedAnimTimer / 0.22) : 0;
          peer.rig.rightShoulder.rotation.set(-0.38 + recoil, -0.08, 0.06);
          peer.rig.leftShoulder.rotation.set(-0.22, 0.24, 0.12);
        } else {
          peer.rig.rightShoulder.rotation.set(0.15, -0.55, 0.15);
          peer.rig.leftShoulder.rotation.set(0.20, 0.35, 0.18);
        }
      }
    }

    peer.rig.updateCape(game.time + peer.slot, peer.moveSpeed || 0.4);
    peer.downedBeacon.update(game.time, peer.downed, peer.reviveProgress);

    const coopCanTriggerRoom = game.mode === 'explore' || game.mode === 'boon' || game.mode === 'weapon' || game.mode === 'paused';
    if (game.isCoopHost() && coopCanTriggerRoom && peer.floorSynced && !peer.downed && game.dungeon) {
      const rm = game.dungeon.findRoomAt(peer.x, peer.z);
      if (rm && (!rm.visited || (!rm.cleared && rm.spawns.length > 0 && !rm.locked))) {
        game.enterRoom(rm, true, {
          enteredById: peer.id,
          enterX: peer.x,
          enterZ: peer.z
        });
      }
    }
  }

  game._netStateAccum += dt;
  if (game._netStateAccum >= 0.045) {
    game._netStateAccum = 0;
    game.lan.relay({
      kind: 'player_state',
      floorIndex: game.floorIndex || 0,
      name: game.localPlayerName,
      themeIdx: game.localThemeIdx,
      classId: h.classId || game.selectedClassId || DEFAULT_CLASS_ID,
      x: +h.x.toFixed(3),
      z: +h.z.toFixed(3),
      vx: +h.vx.toFixed(2),
      vz: +h.vz.toFixed(2),
      yaw: +h.yaw.toFixed(3),
      moveSpeed: +(game.heroActualSpeed || 0).toFixed(2),
      hp: Math.ceil(h.hp),
      maxHp: h.maxHp,
      shield: Math.ceil(h.shield || 0),
      maxShield: h.maxShield || 0,
      downed: !!h.downed,
      bleedout: +h.bleedout.toFixed(1),
      reviveProgress: +h.reviveProgress.toFixed(2),
      activeSlot: h.activeSlot,
      wpn0: serializeWeaponInst(h.weapons[0]),
      wpn1: serializeWeaponInst(h.weapons[1])
    }, 'others');
  }

  if (game.isCoopHost()) {
    game._netEnemyAccum += dt;
    if (game._netEnemyAccum >= 0.055) {
      game._netEnemyAccum = 0;
      if (game.enemies.length > 0 || game._hadEnemiesLastSync) {
        game._hadEnemiesLastSync = game.enemies.length > 0;
        game.lan.relay({
          kind: 'enemies_sync',
          hostTime: +game.time.toFixed(3),
          enemies: game.enemies.map((e) => ({
            eid: e.eid,
            type: e.type,
            roomId: e.room ? e.room.id : 0,
            x: +e.x.toFixed(2),
            z: +e.z.toFixed(2),
            y: +(e.rig.body.position.y || 0).toFixed(2),
            yaw: +e.yaw.toFixed(2),
            hp: Math.ceil(e.hp),
            maxHp: e.maxHp,
            shield: Math.ceil(e.shield),
            maxShield: e.maxShield,
            affixes: e.affixes,
            state: e.state,
            stun: e.stunTimer > 0,
            chill: e.chillTimer > 0,
            enraged: !!e.enraged
          }))
        }, 'others');
      }
    }
  }

  updateCoopHudWidgets(game);
}

function projectAllAllyWorldTags(game) {
  if (!game.allyTagsLayer) return;
  const show = game.isCoopActive() && (game.mode === 'explore' || game.mode === 'boon' || game.mode === 'weapon');
  for (const peer of game.remotePlayers.values()) {
    if (!peer.tagEl) continue;
    if (!show) {
      peer.tagEl.classList.add('hidden');
      continue;
    }
    const v = new THREE.Vector3(peer.x, peer.downed ? 1.55 : 2.38, peer.z).project(game.camera);
    if (v.z > 1) {
      peer.tagEl.classList.add('hidden');
      continue;
    }
    const sx = (v.x * 0.5 + 0.5) * game.width;
    const sy = (-v.y * 0.5 + 0.5) * game.height;
    if (sx < -60 || sx > game.width + 60 || sy < -40 || sy > game.height + 40) {
      peer.tagEl.classList.add('hidden');
      continue;
    }
    peer.tagEl.style.left = `${sx}px`;
    peer.tagEl.style.top = `${sy}px`;
    peer.tagEl.classList.toggle('downed', !!peer.downed);
    const ui = tUI();
    if (peer.tagNameEl) {
      peer.tagNameEl.textContent = peer.downed
        ? `${peer.name} · ${ui.partyDowned(peer.bleedout)}`
        : peer.name;
    }
    if (peer.tagFillEl) {
      const pct = peer.downed
        ? Math.round((peer.reviveProgress || 0) * 100)
        : Math.max(0, Math.min(100, (peer.hp / Math.max(1, peer.maxHp)) * 100));
      peer.tagFillEl.style.width = `${pct}%`;
    }
    peer.tagEl.classList.remove('hidden');
  }
}

function interpolateClientEnemies(game, dt) {
  for (const e of game.enemies) {
    if (!e || e.hp <= 0) continue;
    if (e.flashTimer > 0) {
      e.flashTimer -= dt;
      const flashHex = e.flashTimer > 0 ? 0x665040 : 0x000000;
      for (const fm of e.rig.flashMats) fm.emissive.setHex(flashHex);
    }
    if (e.shieldMesh && e.shield > 0) {
      e.shieldMesh.rotation.y += dt * 1.6;
      e.shieldMesh.material.opacity = 0.18 + 0.08 * Math.sin(game.time * 5.2);
    }
    if (e.affixRing) e.affixRing.rotation.z += dt * 1.4;

    if (Number.isFinite(e.netTargetX)) {
      const dx = e.netTargetX - e.x;
      const dz = e.netTargetZ - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 8.0) {
        e.x = e.netTargetX;
        e.z = e.netTargetZ;
      } else {
        const k = Math.min(1, dt * 15.0);
        e.x += dx * k;
        e.z += dz * k;
      }
      const yDiff = (e.netTargetY || 0) - e.rig.body.position.y;
      e.rig.body.position.y += yDiff * Math.min(1, dt * 16.0);
      const yawDiff = Math.atan2(Math.sin((e.netTargetYaw || 0) - e.yaw), Math.cos((e.netTargetYaw || 0) - e.yaw));
      e.yaw += yawDiff * Math.min(1, dt * 15.0);

      const stride = dist > 0.03 ? Math.sin(game.time * e.speed * 2.6 + e.maxHp) * 0.42 : 0;
      if (e.rig.leftLeg) e.rig.leftLeg.rotation.x = stride;
      if (e.rig.rightLeg) e.rig.rightLeg.rotation.x = -stride;
    }
    if (e.state === 'windup') e.rig.arm.rotation.x = -1.1;
    else if (e.state === 'strike') e.rig.arm.rotation.x = 0.95;
    else e.rig.arm.rotation.x += (0.08 - e.rig.arm.rotation.x) * Math.min(1, dt * 8.0);

    e.rig.root.position.set(e.x, 0, e.z);
    e.rig.root.rotation.y = e.yaw;
  }
}

function onPeerRevivedVisuals(game, x, z, name) {
  const ui = tUI();
  game.sfx.reviveComplete({ x, z });
  game.vfx.burst(x, 1.2, z, 0x5effc8, 36, 6.2, 5.0);
  game.vfx.spawnRing(x, z, 3.2, 0.55, 0x5effc8, false);
  game.vfx.flash(x, 1.6, z, 0x5effc8, 18);
  game.showBanner(ui.bannerAllyRevivedTitle(name), ui.bannerAllyRevivedSub);
  game.updateHUD();
}

export function checkCoopPartyWipe(game, forceCheck = false) {
  if (!game.isCoopActive()) {
    if (game.hero.hp <= 0) game.finishRun(false);
    return;
  }
  if (game.remotePlayers.size === 0) {
    if (game.hero.hp <= 0 || game.hero.downed) game.finishRun(false);
    return;
  }
  const localOut = game.hero.downed || game.hero.hp <= 0;
  if (!localOut && !forceCheck) return;
  const anyRemoteAlive = [...game.remotePlayers.values()].some((p) => !p.downed && p.hp > 0);
  if (!anyRemoteAlive && localOut) {
    if (game.isCoopHost()) {
      game.lan.relay({ kind: 'run_ended', victory: false }, 'all');
    }
    game.finishRun(false);
  }
}

function handleCoopRelay(game, fromId, payload) {
  if (!payload || typeof payload.kind !== 'string') return;

  if (payload.kind === 'floor_init') {
    if (payload.floorIndex === 0 && payload.isNewRun) {
      game.startCoopRunFromInit(payload, false);
    } else {
      game.executeSyncedFloorTransition(payload);
    }
    return;
  }

  if (payload.kind === 'lobby_class_sync') {
    if (payload.classId) {
      game._peerClassMap?.set(fromId, payload.classId);
      if (game.mode === 'lobby') renderLanLobbyUI(game);
    }
    return;
  }

  if (payload.kind === 'char_select_begin') {
    enterCoopCharSelectSession(game, payload);
    return;
  }

  if (payload.kind === 'char_select_roster') {
    const cs = game.coopCharSelect;
    if (cs && cs.active && payload.sessionId === cs.sessionId && payload.picks) {
      cs.picks = JSON.parse(JSON.stringify(payload.picks));
      if (typeof payload.remaining === 'number') {
        cs.remaining = payload.remaining;
        cs.deadlineMs = Date.now() + payload.remaining * 1000;
      }
      renderCoopCharSelectUI(game);
    }
    return;
  }

  if (payload.kind === 'char_select_browse') {
    const cs = game.coopCharSelect;
    if (cs && cs.active && payload.sessionId === cs.sessionId && payload.classId) {
      syncCharSelectPicksWithLobby(game);
      const entry = cs.picks[fromId];
      if (entry && !entry.locked) {
        entry.browsedClassId = payload.classId;
        renderCoopCharSelectUI(game);
      }
    }
    return;
  }

  if (payload.kind === 'char_select_lock') {
    const cs = game.coopCharSelect;
    if (cs && cs.active && payload.sessionId === cs.sessionId) {
      syncCharSelectPicksWithLobby(game);
      const entry = cs.picks[fromId];
      if (entry) {
        if (payload.locked) {
          const cid = payload.classId || entry.browsedClassId || HERO_CLASSES[0].id;
          entry.browsedClassId = cid;
          entry.locked = true;
          entry.lockedClassId = cid;
        } else {
          entry.locked = false;
          entry.lockedClassId = null;
          if (payload.classId) entry.browsedClassId = payload.classId;
        }
        renderCoopCharSelectUI(game);
        if (game.isCoopHost()) {
          checkAndFinalizeCoopCharSelect(game, false);
        }
      }
    }
    return;
  }

  if (payload.kind === 'char_select_tick') {
    const cs = game.coopCharSelect;
    if (cs && cs.active && payload.sessionId === cs.sessionId && typeof payload.remaining === 'number') {
      cs.remaining = Math.max(0, payload.remaining);
      cs.deadlineMs = Date.now() + cs.remaining * 1000;
      updateCharTimerDOM(game);
    }
    return;
  }

  if (payload.kind === 'char_select_abort') {
    const cs = game.coopCharSelect;
    if (cs && cs.active && (!payload.sessionId || payload.sessionId === cs.sessionId)) {
      abortCoopCharSelectToLobby(game);
    }
    return;
  }

  if (payload.kind === 'player_state') {
    const peer = ensureRemotePlayer(game, fromId, payload);
    peer.name = payload.name || peer.name;
    if (payload.classId && payload.classId !== peer.classId) {
      peer.classId = payload.classId;
      game._peerClassMap?.set(fromId, payload.classId);
      peer.rig.root.remove(peer.allyRing.root);
      peer.rig.root.remove(peer.downedBeacon.root);
      game.scene.remove(peer.rig.root);
      peer.rig = createHeroRig(game.mats, peer.theme, peer.classId);
      peer.rig.root.add(peer.allyRing.root);
      peer.rig.root.add(peer.downedBeacon.root);
      peer.rig.root.position.set(peer.x, 0, peer.z);
      peer.rig.root.rotation.y = peer.yaw;
      game.scene.add(peer.rig.root);
      peer.mountedWeaponKey = '';
    }
    if (Number.isInteger(payload.themeIdx) && payload.themeIdx !== peer.themeIdx) {
      peer.themeIdx = payload.themeIdx;
      peer.theme = getPlayerTheme(payload.themeIdx);
      peer.rig.applyTheme(peer.theme);
      peer.allyRing.setThemeHex(peer.theme.accentHex);
      peer.downedBeacon.fillMat.color.setHex(peer.theme.accentHex);
      if (peer.tagEl) peer.tagEl.style.setProperty('--ally-color', peer.theme.accent);
    }
    const sameFloor = !Number.isInteger(payload.floorIndex) || payload.floorIndex === game.floorIndex;
    if (sameFloor && game.mode !== 'transition') {
      peer.targetX = payload.x;
      peer.targetZ = payload.z;
      peer.vx = payload.vx || 0;
      peer.vz = payload.vz || 0;
      peer.targetYaw = payload.yaw || 0;
      peer.moveSpeed = payload.moveSpeed || 0;
      peer.floorIndex = game.floorIndex || 0;
      peer.floorSynced = true;
    }
    peer.hp = payload.hp;
    peer.maxHp = payload.maxHp || 135;
    peer.shield = payload.shield || 0;
    peer.maxShield = payload.maxShield || 0;
    if (peer.rig && peer.rig.shieldAura) {
      peer.rig.shieldAura.visible = !peer.downed && peer.shield > 0;
    }
    if (game.revivingPeerId !== fromId) {
      peer.downed = !!payload.downed;
      peer.reviveProgress = payload.reviveProgress ?? 0;
    }
    peer.bleedout = payload.bleedout ?? 25;
    peer.activeSlot = payload.activeSlot || 0;
    if (payload.wpn0) peer.weapons[0] = deserializeWeaponInst(payload.wpn0);
    if (payload.wpn1) peer.weapons[1] = deserializeWeaponInst(payload.wpn1);
    mountRemotePlayerWeapon(game, peer);
    return;
  }

  if (payload.kind === 'weapon_changed') {
    const peer = game.remotePlayers.get(fromId);
    if (!peer) return;
    peer.activeSlot = payload.activeSlot || 0;
    if (payload.wpn0) peer.weapons[0] = deserializeWeaponInst(payload.wpn0);
    if (payload.wpn1) peer.weapons[1] = deserializeWeaponInst(payload.wpn1);
    mountRemotePlayerWeapon(game, peer);
    if (payload.equippedWeaponId) {
      const wpn = peer.weapons[peer.activeSlot];
      if (wpn) {
        game.vfx.burst(peer.x, 1.2, peer.z, wpn.def.accentHex, 22, 5.2, 4.5);
        game.spawnFloatingText(
          peer.x,
          2.35,
          peer.z,
          tUI().floatAllyEquipped(peer.name, getWeaponText(wpn).name),
          wpn.def.accent,
          'callout'
        );
      }
    }
    return;
  }

  if (payload.kind === 'player_action') {
    const peer = game.remotePlayers.get(fromId);
    if (payload.act === 'melee_swing' && peer) {
      peer.yaw = payload.yaw ?? peer.yaw;
      peer.targetYaw = peer.yaw;
      peer.atkStep = payload.step || 0;
      peer.atkFinisher = !!payload.isFinisher;
      peer.atkAnim = payload.anim || null;
      peer.atkDur = payload.duration || 0.3;
      peer.atkTimer = peer.atkDur;
      const peerWpn = peer.weapons[peer.activeSlot] || peer.weapons[0];
      const wid = peerWpn ? peerWpn.id : 'greatsword';
      const wCol = peerWpn ? peerWpn.def.accentHex : 0xff8533;
      const { step: spec } = getMeleeStepSpec(wid, peer.atkStep);
      const reach = (peerWpn ? (peerWpn.range || peerWpn.def.range) : 4.65) * (spec.reachMult || 1.0);
      if (spec.shape === 'line') {
        game.vfx.spawnThrustLance?.(peer.x, peer.z, peer.yaw, reach, (spec.halfWidth || 0.78) * 1.5, Math.min(0.28, peer.atkDur * 0.85), wCol);
      } else if (spec.shape !== 'crater') {
        const tilt = spec.anim === 'spin' ? 0 : (peer.atkStep % 2 === 0 ? 0.14 : -0.14);
        game.vfx.spawnSlashArc?.(peer.x, peer.z, peer.yaw, reach, spec.arcHalf || 1.48, Math.min(0.28, peer.atkDur * 0.85), wCol, tilt);
      }
      game.sfx.meleeSwing(wid, peer.atkStep % 3, peer.atkFinisher, { x: peer.x, z: peer.z });
      if (peer.atkFinisher && spec.shape !== 'crater') {
        const wpn = peer.weapons[peer.activeSlot] || peer.weapons[0];
        game.vfx.spawnRing(peer.x, peer.z, 2.55, 0.30, wpn ? wpn.def.accentHex : 0xff8533, false);
      }
    } else if (payload.act === 'dash' && peer) {
      game.sfx.dash(peer.classId, { x: payload.x, z: payload.z });
      game.vfx.burst(payload.x, 1.0, payload.z, 0xb47cff, 16, 4.5, 3.0);
      game.vfx.spawnRing(payload.x, payload.z, 1.35, 0.35, 0xb47cff, false);
    } else if (payload.act === 'spawn_proj') {
      if (peer) peer.rangedAnimTimer = 0.22;
      for (const pCfg of payload.list || []) {
        game.spawnPlayerProjectile({ ...pCfg, visualOnly: true, ownerPeer: peer || null });
      }
    } else if (payload.act === 'twinblades_lunge' && peer) {
      game.vfx.burst(payload.ox, 1.0, payload.oz, 0x63dcff, 18, 5.0, 3.0);
      game.vfx.spawnRing(payload.nx, payload.nz, 2.6, 0.36, 0x63dcff, false);
    } else if (payload.act === 'warhammer_slam' || payload.act === 'hazard_vfx') {
      for (const hz of payload.waves || []) {
        if (hz.preRing) {
          game.vfx.spawnRing(hz.x, hz.z, hz.radius, hz.timer || 0.35, hz.colorHex, true);
        }
        game.delayedHazards.push({ ...hz, friendly: true, visualOnly: true, dmg: 0, mesh: null });
      }
    } else if (payload.act === 'beam_vfx') {
      game.spawnVisualPrismBeam?.(payload.ox, payload.oz, payload.ex, payload.ez, payload.colorHex);
    } else if (payload.act === 'bolt_vfx') {
      game.spawnLightningBolt?.(payload.x1, payload.z1, payload.x2, payload.z2, payload.colorHex || 0x8be0ff, true);
      if (Number.isFinite(payload.burstX) && Number.isFinite(payload.burstZ)) {
        game.vfx.burst(payload.burstX, 1.1, payload.burstZ, payload.colorHex || 0x4df0ff, 16, 5.2, 6.0);
      }
    } else if (payload.act === 'ring_burst_vfx') {
      if (Number.isFinite(payload.ox) && Number.isFinite(payload.oz)) {
        game.vfx.burst(payload.ox, 1.05, payload.oz, payload.originColorHex || payload.colorHex, 20, 5.2, 3.5);
      }
      if (payload.radius > 0) {
        game.vfx.spawnRing(payload.x, payload.z, payload.radius, payload.dur || 0.38, payload.colorHex, !!payload.fill);
      }
      if (payload.burstCount > 0) {
        game.vfx.burst(payload.x, 1.05, payload.z, payload.colorHex, payload.burstCount, 5.8, 5.5);
      }
    } else if (payload.act === 'orbital_vfx' && peer) {
      game.spawnRemoteWeaponOrbitals?.(peer, payload.sub || 'saw', payload.count || 3, payload.duration || 6.5);
    } else if (payload.act === 'tesla_turret_vfx') {
      game.spawnTeslaTurret?.(payload.x, payload.z, 0, null, true);
    } else if (payload.act === 'class_summon_vfx') {
      if (payload.sub === 'wraith') {
        spawnSkeletonWraith(game, payload.x, payload.z, false, { visualOnly: true, ownerPeer: peer || null });
      } else if (payload.sub === 'slimeling') {
        spawnExplosiveSlimeling(game, payload.x, payload.z, { visualOnly: true });
      }
    } else if (payload.act === 'class_skill') {
      onRemoteClassSkill(game, peer, payload);
    }
    return;
  }

  if (payload.kind === 'room_enter_req' && game.isCoopHost()) {
    if (game.mode === 'transition') return;
    if (Number.isInteger(payload.floorIndex) && payload.floorIndex !== game.floorIndex) return;
    const room = game.dungeon?.rooms.find((r) => r.id === payload.roomId);
    if (room) {
      const peer = game.remotePlayers.get(fromId);
      game.enterRoom(room, true, {
        enteredById: fromId,
        enterX: Number.isFinite(payload.enterX) ? payload.enterX : (peer ? peer.x : room.cx),
        enterZ: Number.isFinite(payload.enterZ) ? payload.enterZ : (peer ? peer.z : room.cz)
      });
    }
    return;
  }

  if (payload.kind === 'difficulty_changed') {
    if (payload.difficultyId) {
      game.setDifficulty?.(payload.difficultyId, false);
      renderLanLobbyUI(game);
    }
    return;
  }

  if (payload.kind === 'room_wave_spawn' && game.isCoopClient()) {
    if (!game.dungeon || game.mode === 'transition') return;
    const room = game.dungeon.rooms.find((r) => r.id === payload.roomId) || game.currentRoom;
    if (!room) return;
    if (payload.bannerTitle) {
      game.showBanner(payload.bannerTitle, payload.bannerSub || '');
    }
    game.sfx.waveHorn();
    for (const es of payload.enemies || []) {
      if (game.enemies.some((ex) => ex.eid === es.eid)) continue;
      const spawned = game.spawnEnemy(es.type, es.x, es.z, room, {
        eid: es.eid,
        affixes: es.affixes,
        maxHp: es.maxHp,
        maxShield: es.maxShield,
        dmg: es.dmg,
        cinders: es.cinders,
        bossSummon: !!es.bossSummon
      });
      spawned.hp = es.hp;
      spawned.shield = es.shield;
      spawned.netTargetX = es.x;
      spawned.netTargetZ = es.z;
      spawned.netTargetYaw = es.yaw || 0;
    }
    game.updateHUD();
    return;
  }

  if (payload.kind === 'room_lock_spawn' && game.isCoopClient()) {
    if (!game.dungeon) return;
    if (game.mode === 'transition') return;
    if (Number.isInteger(payload.floorIndex) && payload.floorIndex !== game.floorIndex) return;
    const room = game.dungeon.rooms.find((r) => r.id === payload.roomId);
    if (!room) return;
    const wasVisited = room.visited;
    room.visited = true;

    if (payload.locked !== false && payload.rallyDoorKey) {
      if (payload.enteredById && payload.enteredById !== game.lan.clientId) {
        const alreadyInside = Math.abs(game.hero.x - room.cx) <= room.halfW - 1.6
          && Math.abs(game.hero.z - room.cz) <= room.halfD - 1.6;
        if (!alreadyInside) {
          game.teleportHeroToRoomDoor(room, payload.rallyDoorKey, payload.enteredByName || '');
        } else {
          game.currentRoom = room;
        }
      } else {
        game.currentRoom = room;
      }
    }

    if (!wasVisited && !payload.isTrial) {
      game.totalRoomsExplored++;
      if (payload.locked !== false || game.currentRoom === room) {
        const rt = getRoomText(room);
        game.showBanner(rt.title, rt.subtitle);
      }
    }

    if (payload.locked !== false) {
      room.locked = true;
      room.cleared = false;
      if (payload.isTrial) {
        room.isTrialActive = true;
        const ob = room.interactables.find((i) => i.kind === 'trial_obelisk');
        if (ob) {
          game.consumeOneTimeInteractableVisual(ob);
        }
        const ui = tUI();
        game.showBanner(ui.bannerTrialStartTitle, ui.bannerTrialStartSub);
        game.sfx.trialObeliskActivate({ x: room.cx, z: room.cz });
      } else {
        game.sfx.gateSlam(false);
        if (room.type === 'boss') game.sfx.bossRoar(false, { x: room.cx, z: room.cz });
      }
      game.cameraShake = Math.max(game.cameraShake, 0.25);

      if (Math.abs(game.hero.x - room.cx) <= room.halfW + 1.8 && Math.abs(game.hero.z - room.cz) <= room.halfD + 1.8) {
        game.currentRoom = room;
        const dx = room.cx - game.hero.x;
        const dz = room.cz - game.hero.z;
        if (Math.abs(dx) > room.halfW - 1.6) game.hero.x = room.cx - Math.sign(dx) * (room.halfW - 1.95);
        if (Math.abs(dz) > room.halfD - 1.6) game.hero.z = room.cz - Math.sign(dz) * (room.halfD - 1.95);
      }

      for (const es of payload.enemies || []) {
        if (game.enemies.some((ex) => ex.eid === es.eid)) continue;
        const spawned = game.spawnEnemy(es.type, es.x, es.z, room, {
          eid: es.eid,
          affixes: es.affixes,
          maxHp: es.maxHp,
          maxShield: es.maxShield,
          dmg: es.dmg,
          cinders: es.cinders
        });
        spawned.hp = es.hp;
        spawned.shield = es.shield;
        spawned.netTargetX = es.x;
        spawned.netTargetZ = es.z;
        spawned.netTargetYaw = es.yaw || 0;
      }
    }
    game.checkFloorExplorationMastery?.();
    game.updateHUD();
    game.drawMinimap();
    return;
  }

  if (payload.kind === 'enemies_sync' && game.isCoopClient()) {
    if (Number.isFinite(payload.hostTime) && Math.abs(payload.hostTime - game.time) > 0.08) {
      game.time += (payload.hostTime - game.time) * 0.35;
    }
    const byId = new Map(game.enemies.map((e) => [e.eid, e]));
    for (const snap of payload.enemies || []) {
      let e = byId.get(snap.eid);
      if (!e && game.dungeon) {
        const rm = game.dungeon.rooms.find((r) => r.id === snap.roomId) || game.currentRoom || game.dungeon.rooms[0];
        e = game.spawnEnemy(snap.type, snap.x, snap.z, rm, {
          eid: snap.eid,
          affixes: snap.affixes || [],
          maxHp: snap.maxHp,
          maxShield: snap.maxShield
        });
      }
      if (!e) continue;
      e.netTargetX = snap.x;
      e.netTargetZ = snap.z;
      e.netTargetY = snap.y || 0;
      e.netTargetYaw = snap.yaw || 0;
      e.hp = snap.hp;
      e.maxHp = snap.maxHp;
      e.shield = snap.shield;
      e.maxShield = snap.maxShield;
      e.state = snap.state || 'chase';
      if (e.shieldMesh) e.shieldMesh.visible = e.shield > 0;
      if (e.boss) {
        document.getElementById('boss-fill').style.width = `${Math.max(0, (e.hp / Math.max(1, e.maxHp)) * 100)}%`;
        if (e.maxShield > 0) {
          document.getElementById('boss-shield-fill').style.width = `${Math.max(0, (e.shield / e.maxShield) * 100)}%`;
          document.getElementById('boss-shield-track').classList.toggle('hidden', e.shield <= 0);
        }
      }
    }
    game.updateHUD();
    return;
  }

  if (payload.kind === 'damage_req' && game.isCoopHost()) {
    const e = game.enemies.find((x) => x.eid === payload.eid);
    if (!e || e.hp <= 0) return;
    const wpn = payload.weapon ? deserializeWeaponInst(payload.weapon) : null;
    game.damageEnemy(e, payload.rawDmg, payload.srcX, payload.srcZ, {
      allowCrit: payload.allowCrit,
      weaponInst: wpn,
      fxColor: payload.fxColor,
      chillDuration: payload.chillDuration,
      inflictBurn: payload.inflictBurn,
      stagger: payload.stagger,
      isDot: payload.isDot,
      attackerId: fromId,
      attackerCritChance: payload.attackerCritChance,
      attackerCritMult: payload.attackerCritMult,
      attackerShieldBreak: payload.attackerShieldBreak,
      attackerBurnDps: payload.attackerBurnDps
    });
    return;
  }

  if (payload.kind === 'enemy_damaged' && game.isCoopClient()) {
    const e = game.enemies.find((x) => x.eid === payload.eid);
    if (!e) return;
    e.hp = payload.hp;
    e.shield = payload.shield;
    e.flashTimer = 0.08;
    if (payload.shieldBroke) {
      if (e.shieldMesh) e.shieldMesh.visible = false;
      game.sfx.shieldBreak(!!e.boss, false, { x: e.x, z: e.z });
      game.vfx.spawnRing(e.x, e.z, e.boss ? 3.8 : 2.3, 0.45, 0x63dcff, false);
      game.spawnFloatingText(e.x, e.boss ? 3.2 : 2.35, e.z, tUI().floatShieldBreak, '#7ee8ff', 'callout');
    } else if (payload.shieldHit) {
      game.sfx.impactEnemyShield(!!payload.isCrit, { x: e.x, z: e.z });
      game.spawnFloatingText(e.x, e.boss ? 2.9 : 2.05, e.z, tUI().floatShieldHit(payload.amount), '#7ee8ff', 'shield');
    } else {
      game.spawnFloatingText(
        e.x,
        e.boss ? 2.8 : 1.95,
        e.z,
        payload.isCrit ? `${payload.amount}!` : `${payload.amount}`,
        payload.isCrit ? '#ffd45c' : '#f2ede4',
        payload.isCrit ? 'crit' : 'normal'
      );
    }
    if (e.boss) {
      document.getElementById('boss-fill').style.width = `${Math.max(0, (e.hp / Math.max(1, e.maxHp)) * 100)}%`;
      if (e.maxShield > 0) {
        document.getElementById('boss-shield-fill').style.width = `${Math.max(0, (e.shield / e.maxShield) * 100)}%`;
        document.getElementById('boss-shield-track').classList.toggle('hidden', e.shield <= 0);
      }
    }
    game.updateHUD();
    return;
  }

  if (payload.kind === 'cinder_orbs_spawn') {
    if (Number.isFinite(payload.x) && Number.isFinite(payload.z) && payload.totalValue > 0) {
      game.spawnCinderOrbs(payload.x, payload.z, payload.totalValue, {
        fromNet: true,
        orbKind: payload.orbKind || 'cinder',
        seed: payload.seed
      });
    }
    return;
  }

  if (payload.kind === 'enemy_killed' && game.isCoopClient()) {
    const e = game.enemies.find((x) => x.eid === payload.eid);
    if (e) {
      if (Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
        e.x = payload.x;
        e.z = payload.z;
      }
      if (Number.isFinite(payload.cinders) && payload.cinders > 0) {
        e.cinders = payload.cinders;
      }
      game.killEnemy(e, true, payload);
    } else if (Number.isFinite(payload.x) && Number.isFinite(payload.z) && payload.cinders > 0) {
      game.spawnCinderOrbs(payload.x, payload.z, payload.cinders, {
        fromNet: true,
        seed: payload.orbSeed
      });
    }
    return;
  }

  if (payload.kind === 'enemy_attack' && game.isCoopClient()) {
    if (payload.sub === 'proj') {
      game.spawnEnemyProjectile(payload.x, payload.z, payload.yaw, payload.dmg, payload.colorHex, payload.speed, true);
    } else if (payload.sub === 'hazard') {
      game.vfx.spawnRing(payload.x, payload.z, payload.radius + 0.1, payload.timer, payload.colorHex, true);
      game.delayedHazards.push({
        friendly: false,
        timer: payload.timer,
        x: payload.x,
        z: payload.z,
        radius: payload.radius,
        dmg: payload.dmg,
        colorHex: payload.colorHex,
        lightningSky: !!payload.lightningSky,
        mesh: null
      });
    } else if (payload.sub === 'melee_aoe') {
      if (payload.vfxRing) {
        game.vfx.spawnRing(payload.x, payload.z, payload.radius, 0.36, payload.colorHex || 0xff5522, false);
      }
      if (!game.hero.downed && Math.hypot(game.hero.x - payload.x, game.hero.z - payload.z) <= payload.radius) {
        game.damageHero(payload.dmg, payload.x, payload.z);
      }
    }
    return;
  }

  if (payload.kind === 'interact_sync') {
    if (!game.dungeon) return;
    if (payload.sub === 'consumed_snapshot' && Array.isArray(payload.usedNetIds)) {
      for (const nid of payload.usedNetIds) {
        const it = game.dungeon.interactables.find((i) => i.netId === nid);
        if (it) game.consumeOneTimeInteractableVisual(it);
      }
      return;
    }
    if (payload.sub === 'trial_req' && game.isCoopHost()) {
      const ob = game.dungeon.interactables.find((i) => i.netId === payload.netId || i.kind === 'trial_obelisk');
      if (ob && !ob.used) {
        game.triggerTrialObelisk(ob, fromId);
      }
      return;
    }
    if (payload.sub === 'portal_req' && game.isCoopHost()) {
      game.descendToNextFloor();
      return;
    }
    const inter = game.dungeon.interactables.find((i) => i.netId === payload.netId);
    if (payload.sub === 'claim_one_time_req' && game.isCoopHost()) {
      if (!inter || inter.used) {
        game.lan.relay({
          kind: 'interact_sync',
          sub: 'claim_rejected',
          netId: payload.netId
        }, fromId);
        return;
      }
      if (game.mode === 'weapon' && game.pendingWeaponPedestal === inter) {
        game.closeWeaponModalWithoutTaking();
      }
      const ix = inter.x;
      const iz = inter.z;
      const itemKind = inter.kind;
      const winnerName = game.remotePlayers.get(fromId)?.name || 'Ally';
      const orbSeed = game.makeOrbDropSeed(ix, iz, inter.cinderReward || 28);
      game.consumeOneTimeInteractableVisual(inter);
      game.recordConsumedOneTimeNetId(inter.netId);
      game.spawnSharedInteractableGroundOrbs(inter, orbSeed);
      game.vfx.burst(ix, 1.2, iz, 0xffd166, 20, 4.8, 4.2);
      game.spawnFloatingText(ix, 2.0, iz, tUI().floatClaimedByAlly(winnerName), '#ffd166', 'callout');
      game.lan.relay({
        kind: 'interact_sync',
        sub: 'one_time_claimed',
        netId: inter.netId,
        itemKind,
        winnerId: fromId,
        winnerName,
        choiceIdx: payload.choiceIdx,
        salvageVal: payload.salvageVal,
        orbSeed
      }, 'others');
      return;
    }
    if (payload.sub === 'one_time_claimed') {
      if (!inter) return;
      if (payload.winnerId === game.lan.clientId) {
        game.consumeOneTimeInteractableVisual(inter);
        game.grantOneTimeInteractableReward(inter, {
          choiceIdx: payload.choiceIdx,
          salvageVal: payload.salvageVal,
          orbSeed: payload.orbSeed
        });
      } else {
        if (game.mode === 'weapon' && game.pendingWeaponPedestal === inter) {
          game.closeWeaponModalWithoutTaking();
        }
        const ix = inter.x;
        const iz = inter.z;
        game.consumeOneTimeInteractableVisual(inter);
        game.spawnSharedInteractableGroundOrbs(inter, payload.orbSeed);
        game.vfx.burst(ix, 1.2, iz, 0xffd166, 20, 4.8, 4.2);
        game.spawnFloatingText(
          ix,
          2.0,
          iz,
          tUI().floatClaimedByAlly(payload.winnerName || 'Ally'),
          '#ffd166',
          'callout'
        );
      }
      return;
    }
    if (payload.sub === 'claim_rejected') {
      if (inter) {
        if (game.mode === 'weapon' && game.pendingWeaponPedestal === inter) {
          game.closeWeaponModalWithoutTaking();
        }
        game.consumeOneTimeInteractableVisual(inter);
      }
      game.spawnFloatingText(game.hero.x, 2.2, game.hero.z, tUI().floatLootGone, '#ff8866', 'callout');
      return;
    }
    if (payload.sub === 'prop_break') {
      const prop = game.dungeon.destructibles.find((p) => p.netId === payload.netId);
      if (prop && !prop.broken) game.breakProp(prop, true, payload);
    }
    return;
  }

  if (payload.kind === 'ally_downed') {
    const peer = game.remotePlayers.get(fromId);
    if (peer) {
      peer.downed = true;
      peer.hp = 0;
      peer.bleedout = 25;
      peer.reviveProgress = 0;
      const ui = tUI();
      game.sfx.allyDownedAlert();
      game.showBanner(ui.bannerAllyDownTitle(peer.name), ui.bannerAllyDownSub);
      game.drawMinimap();
      game.updateHUD();
      checkCoopPartyWipe(game);
    }
    return;
  }

  if (payload.kind === 'revive_progress') {
    if (payload.targetId === game.lan.clientId) {
      game.hero.reviveProgress = payload.progress;
      game.hero._lastRevivePacketMs = performance.now();
      updateCoopHudWidgets(game);
    } else if (game.revivingPeerId !== payload.targetId) {
      const peer = game.remotePlayers.get(payload.targetId);
      if (peer) peer.reviveProgress = payload.progress;
    }
    return;
  }

  if (payload.kind === 'revive_complete') {
    if (payload.targetId === game.lan.clientId) {
      game.reviveLocalHero(0.50, false);
      onPeerRevivedVisuals(game, game.hero.x, game.hero.z, game.localPlayerName);
    } else {
      const peer = game.remotePlayers.get(payload.targetId);
      if (peer) {
        peer.downed = false;
        peer.reviveProgress = 0;
        peer.hp = Math.round(peer.maxHp * 0.50);
        onPeerRevivedVisuals(game, peer.x, peer.z, peer.name);
      }
    }
    return;
  }

  if (payload.kind === 'run_ended') {
    game.finishRun(!!payload.victory);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncCharSelectPicksWithLobby(game) {
  const cs = game.coopCharSelect;
  if (!cs || !game.lan || !game.lan.inRoom) return;
  const nextPicks = {};
  const players = game.lan.players || [];
  players.forEach((p, idx) => {
    const prev = cs.picks[p.id];
    nextPicks[p.id] = {
      id: p.id,
      name: p.name,
      slot: idx,
      themeIdx: p.themeIdx,
      isHost: !!p.isHost,
      browsedClassId: prev ? prev.browsedClassId : null,
      locked: prev ? !!prev.locked : false,
      lockedClassId: prev ? prev.lockedClassId : null
    };
  });
  cs.picks = nextPicks;
}

export function stopCoopCharSelect(game) {
  const cs = game && game.coopCharSelect;
  if (!cs) return;
  if (cs.timerHandle) {
    clearInterval(cs.timerHandle);
    cs.timerHandle = null;
  }
  cs.active = false;
  cs.committed = false;
}

function abortCoopCharSelectToLobby(game) {
  stopCoopCharSelect(game);
  game.charSelectContext = 'solo';
  openLanLobby(game, true);
}

export function startCoopCharSelect(game) {
  if (!game.lan || !game.lan.inRoom || !game.lan.isHost) return;
  const duration = resolveCharSelectDuration();
  const sessionId = `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const picks = {};
  (game.lan.players || []).forEach((p, idx) => {
    picks[p.id] = {
      id: p.id,
      name: p.name,
      slot: idx,
      themeIdx: p.themeIdx,
      isHost: !!p.isHost,
      browsedClassId: null,
      locked: false,
      lockedClassId: null
    };
  });
  const payload = {
    kind: 'char_select_begin',
    sessionId,
    duration,
    remaining: duration,
    picks
  };
  enterCoopCharSelectSession(game, payload);
  game.lan.relay(payload, 'others');
}

function enterCoopCharSelectSession(game, payload) {
  stopCoopCharSelect(game);
  const cs = game.coopCharSelect;
  const duration = Number(payload.duration) > 0 ? Number(payload.duration) : CHAR_SELECT_COUNTDOWN_SEC;
  const remaining = typeof payload.remaining === 'number' ? Math.max(0, payload.remaining) : duration;
  cs.active = true;
  cs.committed = false;
  cs.sessionId = payload.sessionId || `cs_${Date.now()}`;
  cs.duration = duration;
  cs.remaining = remaining;
  cs.deadlineMs = Date.now() + remaining * 1000;
  cs.lastTickBroadcastMs = Date.now();
  cs.picks = payload.picks ? JSON.parse(JSON.stringify(payload.picks)) : {};
  syncCharSelectPicksWithLobby(game);

  game.browsedClassId = null;
  game.charSelectContext = 'coop';

  document.getElementById('lan-overlay')?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');
  document.getElementById('end-overlay')?.classList.add('hidden');
  document.getElementById('boon-overlay')?.classList.add('hidden');
  document.getElementById('weapon-overlay')?.classList.add('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  document.getElementById('title-overlay')?.classList.remove('hidden');

  game.mode = 'title';
  selectHeroClass(game, HERO_CLASSES[0].id, false, { silentNet: true });
  game.setTitleStage?.('char-select');
  game.sfx?.uiToggle?.(true);
  renderCoopCharSelectUI(game);

  cs.timerHandle = setInterval(() => {
    if (!cs.active || cs.committed) return;
    const prevSec = Math.ceil(cs.remaining);
    cs.remaining = Math.max(0, (cs.deadlineMs - Date.now()) / 1000);
    const nextSec = Math.ceil(cs.remaining);
    if (nextSec !== prevSec && nextSec > 0 && nextSec <= 8) {
      game.sfx?.coopCountdownTick?.(nextSec <= 3);
    }
    updateCharTimerDOM(game);
    if (game.isCoopHost()) {
      const now = Date.now();
      if (now - cs.lastTickBroadcastMs >= 950) {
        cs.lastTickBroadcastMs = now;
        game.lan.relay({
          kind: 'char_select_tick',
          sessionId: cs.sessionId,
          remaining: cs.remaining
        }, 'others');
      }
      if (cs.remaining <= 0) {
        checkAndFinalizeCoopCharSelect(game, true);
      }
    }
  }, 120);
}

function checkAndFinalizeCoopCharSelect(game, forceTimeout = false) {
  const cs = game.coopCharSelect;
  if (!cs || !cs.active || cs.committed || !game.isCoopHost()) return;
  syncCharSelectPicksWithLobby(game);
  const players = game.lan.players || [];
  if (players.length === 0) return;

  const allLocked = players.every((p) => cs.picks[p.id] && cs.picks[p.id].locked);
  const timedOut = forceTimeout || cs.remaining <= 0 || Date.now() >= cs.deadlineMs;
  if (!allLocked && !timedOut) return;

  cs.committed = true;
  const defaultFirstId = HERO_CLASSES[0].id;
  const classMap = {};
  for (const p of players) {
    const entry = cs.picks[p.id];
    const finalId = (entry && entry.locked && entry.lockedClassId)
      ? getHeroClass(entry.lockedClassId).id
      : ((entry && entry.browsedClassId) ? getHeroClass(entry.browsedClassId).id : defaultFirstId);
    classMap[p.id] = finalId;
  }

  const hostClassId = classMap[game.lan.clientId] || defaultFirstId;
  selectHeroClass(game, hostClassId, true, { silentNet: true });
  game.lan.updateProfile?.({ classId: hostClassId });
  for (const [pid, cid] of Object.entries(classMap)) {
    game._peerClassMap?.set(pid, cid);
    const lp = players.find((x) => x.id === pid);
    if (lp) lp.classId = cid;
  }

  const floorInit = game.createFloorInitPayload(0, true);
  floorInit.classMap = classMap;
  stopCoopCharSelect(game);
  game.lan.launchRun(floorInit);
}

function updateCharTimerDOM(game) {
  const cs = game.coopCharSelect;
  const timerBox = document.getElementById('char-timer-box');
  if (!timerBox) return;
  if (!cs || !cs.active) {
    timerBox.classList.add('hidden');
    return;
  }
  timerBox.classList.remove('hidden');
  const ui = tUI();
  const secVal = Math.max(0, Math.ceil(cs.remaining));
  const pct = Math.max(0, Math.min(100, (cs.remaining / Math.max(1, cs.duration)) * 100));
  timerBox.classList.toggle('urgent', cs.remaining <= 6);
  const lbl = document.getElementById('char-timer-label');
  if (lbl) lbl.textContent = ui.charTimerLabel || 'TIMER';
  const secEl = document.getElementById('char-timer-sec');
  if (secEl) secEl.textContent = `${secVal}s`;
  const fillEl = document.getElementById('char-timer-fill');
  if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;
}

export function renderCoopCharSelectUI(game) {
  const cs = game.coopCharSelect;
  if (!cs || !cs.active) return;
  syncCharSelectPicksWithLobby(game);
  updateCharTimerDOM(game);
  document.getElementById('solo-diff-section')?.classList.add('hidden');

  const ui = tUI();
  const players = game.lan.players || [];
  const stripEl = document.getElementById('char-party-strip');
  if (stripEl) {
    stripEl.classList.remove('hidden');
    const cards = [];
    for (let i = 0; i < 4; i++) {
      const p = players[i];
      if (p) {
        const th = getPlayerTheme(p.themeIdx);
        const entry = cs.picks[p.id] || {};
        const shownId = (entry.locked && entry.lockedClassId)
          ? entry.lockedClassId
          : (entry.browsedClassId || HERO_CLASSES[0].id);
        const cls = getHeroClass(shownId);
        const ct = getClassText(cls);
        const suffix = entry.locked
          ? ''
          : (entry.browsedClassId ? (ui.charBrowsingSuffix || '') : (ui.charDefaultSuffix || ''));
        const tags = [`P${i + 1}`];
        if (p.isHost) tags.push(ui.lanHostTag);
        if (p.id === game.lan.clientId) tags.push(ui.lanYouTag);
        cards.push(`
          <div class="char-peer-card${entry.locked ? ' locked' : ''}" style="--peer-col:${th.accent}">
            <div class="char-peer-top">
              <span class="char-peer-name">${tags.join('·')} ${escapeHtml(p.name)}</span>
              <span class="char-peer-state">${entry.locked ? ui.charLockedTag : ui.charPickingTag}</span>
            </div>
            <div class="char-peer-cls" style="color:${cls.accent}">${ct.catIcon} ${ct.name}${suffix}</div>
          </div>
        `);
      } else {
        cards.push(`
          <div class="char-peer-card empty">
            <div class="char-peer-top">
              <span class="char-peer-name">P${i + 1}</span>
              <span class="char-peer-state">—</span>
            </div>
            <div class="char-peer-cls" style="color:#64748b">${ui.lanEmptySlot}</div>
          </div>
        `);
      }
    }
    stripEl.innerHTML = cards.join('');
  }

  const kicker = document.getElementById('char-select-kicker');
  if (kicker) kicker.textContent = ui.charCoopKicker;
  const title = document.getElementById('char-select-title');
  if (title) title.textContent = ui.charCoopTitle;
  const backBtn = document.getElementById('btn-char-back');
  if (backBtn) backBtn.textContent = game.isCoopHost() ? ui.charBackLobby : ui.charLeaveCoop;
  const ruleEl = document.getElementById('char-rule-hint');
  if (ruleEl) ruleEl.textContent = ui.charRuleCoop;

  const lockedCount = players.filter((p) => cs.picks[p.id] && cs.picks[p.id].locked).length;
  const totalCount = Math.max(1, players.length);
  const meLocked = game.isCoopCharSelectLocked();

  const unlockBtn = document.getElementById('btn-char-unlock');
  if (unlockBtn) {
    unlockBtn.textContent = ui.charUnlockBtn;
    unlockBtn.classList.toggle('hidden', !meLocked);
  }
  const confirmBtn = document.getElementById('btn-char-confirm');
  if (confirmBtn) {
    confirmBtn.classList.add('coop-btn');
    confirmBtn.disabled = meLocked;
    confirmBtn.textContent = meLocked
      ? ui.charLockedWait(lockedCount, totalCount)
      : ui.charConfirmCoop;
  }
}
