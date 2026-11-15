import * as THREE from 'three';
import {
  CLASS_CATEGORIES,
  HERO_CLASSES,
  DEFAULT_CLASS_ID,
  getHeroClass,
  getClassText
} from './classes.js';
import {
  buildClassHeroRig,
  createSkeletonMinionRig,
  createAutoturretRig,
  createSlimelingRig,
  createFateDieMesh,
  createChronosphereMesh,
  createSanctumDomeMesh
} from './class_models.js';
import { rollWeaponInstance, buildWeaponVisuals } from './weapons.js';
import { getPlayerTheme } from './multiplayer.js';
import { getLang, getWeaponText } from './i18n.js';
import { UI_SVG } from './weapon_preview.js';

const CLASS_STORAGE_KEY = 'sanctum_of_ash_selected_class';

export function initClassSystem(game) {
  let savedId = DEFAULT_CLASS_ID;
  try {
    const raw = localStorage.getItem(CLASS_STORAGE_KEY);
    if (raw && HERO_CLASSES.some((c) => c.id === raw)) {
      savedId = raw;
    }
  } catch (_) {}
  game.selectedClassId = savedId;
  game.selectedCategoryId = getHeroClass(savedId).categoryId;
  game.classRuntime = {
    minions: [],
    turrets: [],
    slimelings: [],
    decoys: [],
    zones: [],
    dice: [],
    dome: null,
    remoteDomes: []
  };
  initClassPreviewStage(game);
  bindClassSelectionEvents(game);
}

function initClassPreviewStage(game) {
  const canvas = document.getElementById('class-preview-canvas');
  if (!canvas) return;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(260, 300, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
  } catch (_) {
    return;
  }

  const scene = new THREE.Scene();
  if (game.tex && game.tex.envMap) {
    scene.environment = game.tex.envMap;
  }
  const cw0 = canvas.clientWidth || 220;
  const ch0 = canvas.clientHeight || 238;
  renderer.setSize(cw0, ch0, false);
  const camera = new THREE.PerspectiveCamera(37, cw0 / ch0, 0.2, 30);
  camera.position.set(0, 1.58, 4.95);
  camera.lookAt(0, 1.08, 0);

  const amb = new THREE.HemisphereLight(0xdbe8ff, 0x1a1520, 1.15);
  const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.35);
  keyLight.position.set(2.6, 4.2, 3.4);
  const rimLight = new THREE.DirectionalLight(0x6ad4ff, 1.65);
  rimLight.position.set(-2.8, 2.6, -2.8);
  const baseGlow = new THREE.PointLight(0xff9838, 2.1, 6.0, 1.4);
  baseGlow.position.set(0, 0.35, 0.8);
  scene.add(amb, keyLight, rimLight, baseGlow);

  // Carved Obsidian & Gilded Runic Turntable Pedestal
  const stagePivot = new THREE.Group();
  scene.add(stagePivot);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.16, 0.20, 28),
    game.mats.obsidianArmor
  );
  plinth.position.y = -0.10;
  const rimTorus = new THREE.Mesh(
    new THREE.TorusGeometry(1.03, 0.028, 8, 36),
    game.mats.gildedBronze
  );
  rimTorus.rotation.x = Math.PI / 2;
  rimTorus.position.y = 0.0;
  const runeRingMat = new THREE.MeshBasicMaterial({ color: 0xff9838, transparent: true, opacity: 0.78 });
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.015, 6, 36), runeRingMat);
  runeRing.rotation.x = Math.PI / 2;
  runeRing.position.y = 0.012;
  stagePivot.add(plinth, rimTorus, runeRing);

  const heroHolder = new THREE.Group();
  stagePivot.add(heroHolder);

  const stage = {
    canvas,
    renderer,
    scene,
    camera,
    stagePivot,
    heroHolder,
    baseGlow,
    runeRingMat,
    rig: null,
    mountedClassId: null,
    yaw: 0.38,
    dragging: false,
    lastX: 0,
    manualHoldTimer: 0
  };

  canvas.addEventListener('pointerdown', (e) => {
    stage.dragging = true;
    stage.lastX = e.clientX;
    stage.manualHoldTimer = 3.0;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stage.dragging) return;
    const dx = e.clientX - stage.lastX;
    stage.lastX = e.clientX;
    stage.yaw += dx * 0.016;
    stage.manualHoldTimer = 3.0;
  });
  const stopDrag = () => { stage.dragging = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  game._classPreviewStage = stage;
  refreshPreviewRig(game);
}

export function refreshPreviewRig(game) {
  const stage = game._classPreviewStage;
  if (!stage) return;
  const cls = getHeroClass(game.selectedClassId);
  while (stage.heroHolder.children.length > 0) {
    stage.heroHolder.remove(stage.heroHolder.children[0]);
  }
  const rig = buildClassHeroRig(cls.id, game.mats, null);
  rig.heroLight.intensity = 0.55;
  const wpn0 = rollWeaponInstance(cls.stats.weapons[0] || 'greatsword', 2, false);
  const vis = buildWeaponVisuals(wpn0, game.mats);
  while (rig.swordPivot.children.length > 0) rig.swordPivot.remove(rig.swordPivot.children[0]);
  while (rig.offhandPivot.children.length > 0) rig.offhandPivot.remove(rig.offhandPivot.children[0]);
  rig.swordPivot.add(vis.group);
  if (vis.offhand) rig.offhandPivot.add(vis.offhand);
  stage.heroHolder.add(rig.root);
  stage.rig = rig;
  stage.mountedClassId = cls.id;
  stage.baseGlow.color.setHex(cls.accentHex);
  stage.runeRingMat.color.setHex(cls.accentHex);
}

export function renderClassPreviewFrame(game, dt) {
  const stage = game._classPreviewStage;
  if (!stage || !stage.renderer) return;
  if (game.mode !== 'title' || game.titleStage !== 'char-select') return;
  const cw = stage.canvas.clientWidth || 220;
  const ch = stage.canvas.clientHeight || 238;
  if (stage.cw !== cw || stage.ch !== ch) {
    stage.cw = cw;
    stage.ch = ch;
    stage.renderer.setSize(cw, ch, false);
    stage.camera.aspect = cw / Math.max(1, ch);
    stage.camera.updateProjectionMatrix();
  }
  if (stage.mountedClassId !== game.selectedClassId) {
    refreshPreviewRig(game);
  }
  if (!stage.dragging) {
    if (stage.manualHoldTimer > 0) {
      stage.manualHoldTimer = Math.max(0, stage.manualHoldTimer - dt);
    } else {
      stage.yaw += dt * 0.62;
    }
  }
  stage.stagePivot.rotation.y = stage.yaw;
  if (stage.rig) {
    const t = game.time || 0;
    stage.rig.updateCape(t, 0.55);
    stage.rig.leftLeg.rotation.x = Math.sin(t * 2.2) * 0.06;
    stage.rig.rightLeg.rotation.x = -Math.sin(t * 2.2) * 0.06;
  }
  stage.renderer.render(stage.scene, stage.camera);
}

export function selectHeroClass(game, classId, persist = true, opts = {}) {
  if (opts.userBrowse && game.isCoopCharSelectLocked?.()) return;
  const cls = getHeroClass(classId);
  game.selectedClassId = cls.id;
  game.selectedCategoryId = cls.categoryId;
  if (opts.userBrowse) {
    game.browsedClassId = cls.id;
    game.coopOnCharBrowse?.(cls.id);
  }
  if (persist) {
    try { localStorage.setItem(CLASS_STORAGE_KEY, cls.id); } catch (_) {}
  }
  if (game.mode === 'title' || game.mode === 'lobby') {
    game.resetHeroStats();
  }
  refreshPreviewRig(game);
  renderClassSelectionUI(game);
  if (!opts.silentNet && game.lan && game.lan.inRoom && !(game.coopCharSelect && game.coopCharSelect.active)) {
    game.lan.updateProfile?.({ classId: cls.id });
    game.lan.relay?.({ kind: 'lobby_class_sync', classId: cls.id }, 'others');
  }
  if (game.coopRefreshLobbyUI) {
    game.coopRefreshLobbyUI();
  }
}

function bindClassSelectionEvents(game) {
  const prevBtn = document.getElementById('btn-class-prev');
  const nextBtn = document.getElementById('btn-class-next');
  const stepClass = (dir) => {
    if (game.isCoopCharSelectLocked?.()) return;
    const idx = HERO_CLASSES.findIndex((c) => c.id === game.selectedClassId);
    const next = HERO_CLASSES[(idx + dir + HERO_CLASSES.length) % HERO_CLASSES.length];
    if (next) {
      game.sfx?.uiHeroBrowse?.(next.categoryId);
      selectHeroClass(game, next.id, true, { userBrowse: true });
    }
  };
  if (prevBtn) prevBtn.addEventListener('click', () => stepClass(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => stepClass(1));
}

export function renderClassSelectionUI(game) {
  const zh = getLang() === 'zh';
  const cls = getHeroClass(game.selectedClassId);
  const ct = getClassText(cls);
  const activeCatId = game.selectedCategoryId || cls.categoryId;
  const hubBox = document.getElementById('class-select-hub');
  if (hubBox) {
    hubBox.classList.toggle('is-locked', !!game.isCoopCharSelectLocked?.());
  }

  // 1. Category Tabs
  const catTabs = document.getElementById('class-cat-tabs');
  if (catTabs) {
    catTabs.innerHTML = CLASS_CATEGORIES.map((cat) => {
      const isAct = cat.id === activeCatId;
      const cName = zh ? cat.zhName : cat.enName;
      return `<button type="button" class="cls-cat-tab${isAct ? ' active' : ''}" data-cat="${cat.id}" style="--cat-accent:${cat.accent}"><span class="cls-cat-ico">${cat.icon}</span><span>${cName}</span></button>`;
    }).join('');
    catTabs.querySelectorAll('.cls-cat-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (game.isCoopCharSelectLocked?.()) return;
        game.sfx?.uiTabSwitch?.();
        const cid = btn.dataset.cat;
        game.selectedCategoryId = cid;
        const firstInCat = HERO_CLASSES.find((c) => c.categoryId === cid);
        if (firstInCat) selectHeroClass(game, firstInCat.id, true, { userBrowse: true });
        else renderClassSelectionUI(game);
      });
    });
  }

  // 2. Characters inside Active Category
  const rosterEl = document.getElementById('class-roster-list');
  if (rosterEl) {
    const list = HERO_CLASSES.filter((c) => c.categoryId === activeCatId);
    rosterEl.innerHTML = list.map((item) => {
      const it = getClassText(item);
      const isSel = item.id === cls.id;
      const shTxt = item.stats.maxShield > 0
        ? (zh ? `护盾 ${item.stats.maxShield}` : `SHD ${item.stats.maxShield}`)
        : (zh ? '纯血狂战' : 'NO SHIELD');
      return `
        <button type="button" class="cls-pick-card${isSel ? ' active' : ''}" data-cls="${item.id}" style="--cls-accent:${item.accent}">
          <div class="cls-pick-top">
            <span class="cls-pick-badge">${it.badge}</span>
            <span class="cls-pick-mini">HP ${item.stats.maxHp} · ${shTxt}</span>
          </div>
          <div class="cls-pick-name">${it.name}</div>
          <div class="cls-pick-sub">${it.activeShort} [X] · ${it.passiveName}</div>
        </button>
      `;
    }).join('');
    rosterEl.querySelectorAll('.cls-pick-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (game.isCoopCharSelectLocked?.()) return;
        const picked = HERO_CLASSES.find((c) => c.id === btn.dataset.cls);
        game.sfx?.uiHeroBrowse?.(picked ? picked.categoryId : activeCatId);
        selectHeroClass(game, btn.dataset.cls, true, { userBrowse: true });
      });
    });
  }

  // 3. Quick 12-dot index & turntable caption
  const stageName = document.getElementById('cls-stage-name');
  if (stageName) {
    stageName.textContent = ct.name;
    stageName.style.color = cls.accent;
  }
  const stageHint = document.getElementById('cls-stage-hint');
  if (stageHint) {
    stageHint.textContent = zh ? '拖拽 360° 旋转' : 'Drag 360°';
  }
  const hubHeroBadge = document.getElementById('hub-active-hero');
  if (hubHeroBadge) {
    hubHeroBadge.textContent = `${ct.catIcon} ${ct.name}`;
    hubHeroBadge.style.color = cls.accent;
  }

  // 4. Right Detail Panel: Lore, Stats, Passive, Single Active Skill [X]
  const detailEl = document.getElementById('class-detail-box');
  if (detailEl) {
    detailEl.style.setProperty('--cls-accent', cls.accent);
    const w0 = getWeaponText(rollWeaponInstance(cls.stats.weapons[0], 1, false)).name;
    const w1 = getWeaponText(rollWeaponInstance(cls.stats.weapons[1], 1, false)).name;
    const s = cls.stats;
    const statsHtml = [
      [UI_SVG.hp, zh ? '生命' : 'HP', `${s.maxHp}`, '#ff7585'],
      [UI_SVG.aegis, zh ? '护盾' : 'SHD', s.maxShield > 0 ? `${s.maxShield}` : '—', '#72e6ff'],
      [UI_SVG.energy, zh ? '灵能' : 'AETHER', `${s.maxEnergy || 200}`, '#d89eff'],
      [UI_SVG.spd, zh ? '移速/暴击' : 'SPD/CRIT', `${s.moveSpeed.toFixed(1)} · ${Math.round(s.critChance * 100)}%`, '#8ef5c8'],
      [UI_SVG.flask, zh ? '圣药' : 'ELIXIR', `${s.flasks} · -${Math.round(s.dmgReduction * 100)}%`, '#d8c5ff'],
      [UI_SVG.dmg, zh ? '初始' : 'ARMS', `${w0} · ${w1}`, '#f6d794']
    ].map(([ico, lbl, v, col]) => `
      <div class="cls-stat-cell" title="${lbl}">
        <span class="cls-stat-ico" style="color:${col}">${ico}</span>
        <strong class="cls-stat-v" style="color:${col}">${v}</strong>
      </div>
    `).join('');

    detailEl.innerHTML = `
      <div class="cls-det-head">
        <div>
          <div class="cls-det-cat">${ct.catIcon} ${ct.catName} · ${HERO_CLASSES.indexOf(cls) + 1}/${HERO_CLASSES.length}</div>
          <div class="cls-det-title">${ct.name} <span class="cls-det-epithet">· ${ct.title}</span></div>
        </div>
      </div>
      <div class="cls-det-lore">${ct.lore}</div>
      <div class="cls-stat-grid">${statsHtml}</div>
      <div class="cls-skill-pair">
        <div class="cls-skill-box passive">
          <div class="cls-sk-tag">${zh ? '被动天赋' : 'PASSIVE'} · ${ct.passiveName}</div>
          <div class="cls-sk-desc">${ct.passiveDesc}</div>
        </div>
        <div class="cls-skill-box active-sk">
          <div class="cls-sk-tag">${zh ? '主动技 [X]' : 'ACTIVE SKILL [X]'} · ${ct.activeName} <span>(${ct.activeCd}s)</span></div>
          <div class="cls-sk-desc">${ct.activeDesc}</div>
        </div>
      </div>
    `;
  }

  // 5. LAN Multiplayer Lobby Class Picker Strip
  const lanPicker = document.getElementById('lan-class-select');
  if (lanPicker) {
    lanPicker.innerHTML = HERO_CLASSES.map((item) => {
      const it = getClassText(item);
      return `<option value="${item.id}"${item.id === cls.id ? ' selected' : ''}>[${it.catName}] ${it.name} — ${it.activeShort}</option>`;
    }).join('');
    if (!lanPicker._boundClassChange) {
      lanPicker._boundClassChange = true;
      lanPicker.addEventListener('change', () => {
        selectHeroClass(game, lanPicker.value, true);
      });
    }
  }
  const lblLanCls = document.getElementById('lbl-lan-class');
  if (lblLanCls) lblLanCls.textContent = zh ? '出战职业' : 'HERO CLASS';
  game.renderCharSelectMetaUI?.();
}

export function rebuildLocalHeroRig(game, classId) {
  const targetId = classId || game.selectedClassId || DEFAULT_CLASS_ID;
  if (game.heroRig && game.heroRig.classId === targetId) return;
  const oldPos = game.heroRig ? game.heroRig.root.position.clone() : new THREE.Vector3(0, 0, 2.2);
  const oldYaw = game.heroRig ? game.heroRig.root.rotation.y : Math.PI;
  if (game.heroRig) {
    if (game.localDownedBeacon && game.localDownedBeacon.root.parent === game.heroRig.root) {
      game.heroRig.root.remove(game.localDownedBeacon.root);
    }
    game.scene.remove(game.heroRig.root);
  }
  const newRig = buildClassHeroRig(targetId, game.mats, getPlayerTheme(game.localThemeIdx || 0));
  if (game.localDownedBeacon) {
    newRig.root.add(game.localDownedBeacon.root);
  }
  newRig.root.position.copy(oldPos);
  newRig.root.rotation.y = oldYaw;
  game.scene.add(newRig.root);
  game.heroRig = newRig;
}

export function applyClassStatsToHero(game) {
  const cls = getHeroClass(game.selectedClassId);
  const s = cls.stats;
  rebuildLocalHeroRig(game, cls.id);
  clearClassEntities(game, true);

  const h = game.hero;
  h.classId = cls.id;
  h.hp = s.maxHp;
  h.maxHp = s.maxHp;
  h.shield = s.maxShield;
  h.maxShield = s.maxShield;
  h.shieldRegenDelay = s.shieldRegenDelay;
  h.shieldRegenRate = s.shieldRegenRate;
  h.shieldRegenTimer = 0;
  h.maxEnergy = s.maxEnergy || 200;
  h.energy = h.maxEnergy;
  h.energyGainMult = 1.0;
  h.energyOnKill = 0;
  h.freeShotChance = 0;
  h.energyCritIcd = 0;
  h.dmgReduction = s.dmgReduction;
  h.baseDmgReduction = s.dmgReduction;
  h.moveSpeed = s.moveSpeed;
  h.baseMoveSpeed = s.moveSpeed;
  h.moveSpeedBonusPct = 0;
  h.atkSpeed = s.atkSpeed;
  h.dmgMult = s.dmgMult;
  h.critChance = s.critChance;
  h.critMult = s.critMult;
  h.shieldBreakMult = s.shieldBreakMult;
  h.flasks = s.flasks;
  h.maxFlasks = s.maxFlasks;
  h.cinders = s.cinders;
  h.cinderGainMult = 1.0;
  h.dashCdMult = s.dashCdMult;
  h.baseDashCdMult = s.dashCdMult;
  h.dashHaste = 0;
  h.dashStrideBoost = 0;
  h.postDashSpeedTimer = 0;
  h.arcCdMult = s.arcCdMult;
  h.baseArcCdMult = s.arcCdMult;
  h.skillHaste = 0;
  h.bonusPierce = s.bonusPierce;
  h.chainLightning = s.chainLightning;
  h.vampKill = cls.id === 'crimson_flagellant' ? 10 : s.vampKill;
  h.trapImmune = s.trapImmune;
  h.cinderScaling = s.cinderScaling;

  h.ultCd = 0;
  h.ultCdMax = cls.active.cd;
  h.sanctumDomeTimer = 0;
  h.sanctumPulseAccum = 0;
  h.bloodRageTimer = 0;
  h.bloodLifestealIcd = 0;
  h.shadowGuaranteeCritTimer = 0;
  h.omnislashState = null;
  h.gamblerJackpotTimer = 0;
  h.gamblerCoinIcd = 0;
  h.necroKillAccum = 0;
  h.necroFrenzyTimer = 0;
  h.stormWrathTimer = 0;
  h.stormBoltAccum = 0;
  h.tinkerOverclockTimer = 0;
  h.slimeDmgAccum = 0;
  h.slimeKillAccum = 0;
  h.slimeJumpState = null;
  h.classHitCounter = 0;
  h.inChronosphere = false;

  h.weapons = [
    rollWeaponInstance(s.weapons[0] || 'greatsword', 1, false),
    rollWeaponInstance(s.weapons[1] || 'crossbow', 1, false)
  ];
  h.activeSlot = 0;

  if (cls.id === 'bone_necromancer') {
    spawnSkeletonWraith(game, h.x - 1.2, h.z - 0.8, true);
  }
}

export function clearClassEntities(game, fullReset = false) {
  const rt = game.classRuntime;
  if (!rt) return;
  for (const m of rt.minions) {
    if (fullReset || !m.permanent || m.visualOnly) {
      game.scene.remove(m.rig.root);
    }
  }
  rt.minions = fullReset ? [] : rt.minions.filter((m) => m.permanent && !m.visualOnly);
  for (const t of rt.turrets) game.scene.remove(t.rig.root);
  rt.turrets = [];
  for (const sl of rt.slimelings) game.scene.remove(sl.rig.root);
  rt.slimelings = [];
  for (const dc of rt.decoys) game.scene.remove(dc.rig.root);
  rt.decoys = [];
  for (const z of rt.zones) game.scene.remove(z.mesh);
  rt.zones = [];
  for (const d of rt.dice) game.scene.remove(d.mesh);
  rt.dice = [];
  if (rt.dome) {
    game.scene.remove(rt.dome.root);
    rt.dome = null;
  }
  if (rt.remoteDomes) {
    for (const rd of rt.remoteDomes) {
      if (rd.dome && rd.dome.root) game.scene.remove(rd.dome.root);
    }
    rt.remoteDomes = [];
  }
  if (game.hero && !fullReset) {
    for (const m of rt.minions) {
      m.x = game.hero.x - 1.2;
      m.z = game.hero.z - 0.8;
      m.rig.root.position.set(m.x, 0, m.z);
    }
  }
}

// ==================== PASSIVE & SHIELD HOOKS ====================
export function isHeroTrapImmune(h) {
  if (!h) return false;
  if (h.trapImmune) return true;
  if (h.sanctumDomeTimer > 0 || h.slimeJumpState || h.omnislashState) return true;
  if (h.classId === 'ember_paladin' && h.shield > 0) return true;
  return false;
}

export function getClassBonusDmgMult(h) {
  if (!h) return 1.0;
  let m = 1.0;
  if (h.classId === 'crimson_flagellant') {
    const miss = Math.max(0, 1 - h.hp / Math.max(1, h.maxHp));
    m *= 1 + Math.min(0.63, miss * 0.70);
  }
  if (h.classId === 'fortune_gambler') {
    m *= 1 + Math.min(0.30, Math.floor((h.cinders || 0) / 30) * 0.02);
  }
  if (h.gamblerJackpotTimer > 0) m *= 1.35;
  return m;
}

export function getClassEffectiveAtkSpeed(h) {
  if (!h) return 1.0;
  let spd = h.atkSpeed || 1.0;
  if (h.classId === 'crimson_flagellant') {
    const miss = Math.max(0, 1 - h.hp / Math.max(1, h.maxHp));
    spd *= 1 + Math.min(0.45, miss * 0.50);
  }
  if (h.bloodRageTimer > 0) spd *= 1.32;
  if (h.inChronosphere) spd *= 1.35;
  if (h.tinkerOverclockTimer > 0) spd *= 1.25;
  if (h.gamblerJackpotTimer > 0) spd *= 1.35;
  return spd;
}

export function getClassBonusMoveMult(h) {
  if (!h) return 1.0;
  let m = 1.0;
  if (h.bloodRageTimer > 0) m *= 1.28;
  if (h.gamblerJackpotTimer > 0) m *= 1.20;
  if (h.postDashSpeedTimer > 0) m *= 1 + (h.dashStrideBoost || 0.08);
  return m;
}

export function getClassBonusCritChance(h) {
  if (!h) return 0;
  if (h.shadowGuaranteeCritTimer > 0) return 1.0;
  let add = 0;
  if (h.classId === 'fortune_gambler') {
    add += Math.min(0.225, Math.floor((h.cinders || 0) / 30) * 0.015);
  }
  if (h.gamblerJackpotTimer > 0) add += 0.35;
  return add;
}

export function handleClassHeroDamage(game, rawDmg, srcX, srcZ, labelOverride = null) {
  const h = game.hero;
  if (!h || h.downed || h.hp <= 0 || h.invuln > 0) {
    return { absorbedAll: true, hpDmg: 0 };
  }
  const zh = getLang() === 'zh';

  // Invulnerable active states
  if (h.sanctumDomeTimer > 0) {
    h.invuln = 0.32;
    game.sfx.aegisReflect({ x: h.x, z: h.z });
    game.vfx.burst(h.x, 1.2, h.z, 0xffc857, 18, 5.2, 6.0);
    game.vfx.spawnRing(h.x, h.z, 2.8, 0.35, 0xffaa33, false);
    game.spawnFloatingText(h.x, 2.25, h.z, zh ? '圣盾免疫' : 'AEGIS IMMUNE', '#ffd978', 'callout');
    game.coopBroadcastPlayerAction?.({
      act: 'ring_burst_vfx',
      x: +h.x.toFixed(2),
      z: +h.z.toFixed(2),
      radius: 2.8,
      dur: 0.35,
      colorHex: 0xffaa33,
      fill: false,
      burstCount: 18
    });
    for (const e of [...game.enemies]) {
      if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.2 + e.radius) {
        game.damageEnemy(e, Math.round(42 * game.effectiveDmgMult()), h.x, h.z, {
          allowCrit: false,
          inflictBurn: true,
          fxColor: 0xffaa33,
          stagger: 0.45
        });
      }
    }
    return { absorbedAll: true, hpDmg: 0 };
  }
  if (h.slimeJumpState || h.omnislashState) {
    return { absorbedAll: true, hpDmg: 0 };
  }

  const effDr = Math.min(0.42, Math.max(0, h.dmgReduction || 0));
  const dmg = Math.max(2, Math.round(rawDmg * (1 - effDr)));
  h.shieldRegenTimer = h.shieldRegenDelay || 5.2;

  // Abyssal Ooze Passive: Mitosis Split every 32 damage received
  if (h.classId === 'abyssal_ooze') {
    h.slimeDmgAccum = (h.slimeDmgAccum || 0) + dmg;
    while (h.slimeDmgAccum >= 32) {
      h.slimeDmgAccum -= 32;
      spawnExplosiveSlimeling(game, h.x, h.z);
    }
  }

  if (h.shield >= 0.5) {
    if (h.shield >= dmg) {
      h.shield -= dmg;
      game.sfx.heroShieldHit({ x: h.x, z: h.z });
      game.cameraShake = Math.max(game.cameraShake, 0.18);
      game.vfx.burst(h.x, 1.15, h.z, 0x63dcff, 16, 4.8, 7.5);
      game.spawnFloatingText(
        h.x,
        2.15,
        h.z,
        labelOverride || (zh ? `-${dmg} 护盾` : `-${dmg} SHD`),
        '#7ee8ff',
        'shield'
      );
      game.updateHUD();
      return { absorbedAll: true, hpDmg: 0 };
    }
    const overflow = Math.max(0, dmg - Math.ceil(h.shield));
    h.shield = 0;
    game.sfx.shieldBreak(false, true, { x: h.x, z: h.z });
    game.vfx.burst(h.x, 1.2, h.z, 0x63dcff, 26, 6.2, 7.0);
    game.vfx.spawnRing(h.x, h.z, 2.4, 0.40, 0x63dcff, false);
    game.coopBroadcastPlayerAction?.({
      act: 'ring_burst_vfx',
      x: +h.x.toFixed(2),
      z: +h.z.toFixed(2),
      radius: 2.4,
      dur: 0.40,
      colorHex: 0x63dcff,
      fill: false,
      burstCount: 24
    });

    // Ember Paladin Passive: Pyre Aegis Shockwave on Shield Break!
    if (h.classId === 'ember_paladin') {
      game.sfx.aegisReflect({ x: h.x, z: h.z });
      game.vfx.spawnRing(h.x, h.z, 4.0, 0.48, 0xffa838, true);
      game.spawnFloatingText(h.x, 2.45, h.z, zh ? '圣火震波!' : 'PYRE AEGIS!', '#ffbe55', 'callout');
      game.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        x: +h.x.toFixed(2),
        z: +h.z.toFixed(2),
        radius: 4.0,
        dur: 0.48,
        colorHex: 0xffa838,
        fill: true,
        burstCount: 20
      });
      const burstDmg = Math.round(68 * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 4.0 + e.radius) {
          game.damageEnemy(e, burstDmg, h.x, h.z, {
            allowCrit: false,
            inflictBurn: true,
            fxColor: 0xffa838,
            stagger: 1.2
          });
        }
      }
    }
    if (overflow <= 0) {
      game.updateHUD();
      return { absorbedAll: true, hpDmg: 0 };
    }
    return { absorbedAll: false, hpDmg: overflow, shieldBroke: true };
  }
  if (h.shield > 0) h.shield = 0;

  return { absorbedAll: false, hpDmg: dmg };
}

export function onClassEnemyDamaged(game, e, amount, isCrit, opts = {}) {
  const h = game.hero;
  if (!h || opts.isClassProc || opts.isDot) return;

  // Crimson Flagellant Active Frenzy Lifesteal
  if (h.classId === 'crimson_flagellant' && h.bloodRageTimer > 0 && (h.bloodLifestealIcd || 0) <= 0 && !opts.attackerId && !h.downed) {
    h.bloodLifestealIcd = 0.18;
    const steal = Math.max(8, Math.round(h.maxHp * (h.hp < h.maxHp * 0.45 ? 0.045 : 0.035)));
    h.hp = Math.min(h.maxHp, h.hp + steal);
    game.spawnFloatingText(h.x, 2.05, h.z, `+${steal}`, '#ff6b85', 'heal');
  }

  // Iron Juggernaut Passive: Every 4th attack vents electromagnetic ring
  if (h.classId === 'iron_juggernaut' && !opts.attackerId) {
    h.classHitCounter = (h.classHitCounter || 0) + 1;
    if (h.classHitCounter % 4 === 0) {
      game.sfx.empPulse({ x: h.x, z: h.z });
      game.vfx.spawnRing(h.x, h.z, 3.4, 0.36, 0x63dcff, false);
      const pulseDmg = Math.round(48 * game.effectiveDmgMult());
      for (const foe of [...game.enemies]) {
        if (foe.hp > 0 && Math.hypot(foe.x - h.x, foe.z - h.z) <= 3.4 + foe.radius) {
          game.damageEnemy(foe, pulseDmg, h.x, h.z, {
            allowCrit: false,
            isClassProc: true,
            attackerShieldBreak: 2.0,
            fxColor: 0x63dcff
          });
        }
      }
    }
  }

  // Fortune Gambler Passive: Loaded Deck coin ricochet on Crit
  if (h.classId === 'fortune_gambler' && isCrit && h.gamblerCoinIcd <= 0 && Math.random() < 0.30) {
    h.gamblerCoinIcd = 0.28;
    game.sfx.coinRicochet({ x: e.x, z: e.z });
    game.spawnCinderOrbs(e.x, e.z, 3);
    const other = game.enemies.find((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < 7.5) || e;
    game.spawnLightningBolt(e.x, e.z, other.x, other.z, 0xffd86b);
    game.damageEnemy(other, Math.round(46 * game.effectiveDmgMult()), e.x, e.z, {
      allowCrit: false,
      isClassProc: true,
      fxColor: 0xffd86b
    });
  }

  // Plague Apothecary Passive: Virulent Contagion poison & slow
  if (h.classId === 'plague_apothecary' && !opts.attackerId) {
    e.poisonTimer = Math.max(e.poisonTimer || 0, 3.8);
    e.poisonDps = Math.max(e.poisonDps || 0, Math.round(24 * game.effectiveDmgMult()));
    e.chillTimer = Math.max(e.chillTimer || 0, 1.4);
  }
}

export function onClassEnemyKilled(game, e, wasCrit = false) {
  const h = game.hero;
  if (!h) return;
  const zh = getLang() === 'zh';

  if (h.classId === 'wraith_assassin' && (wasCrit || h.omnislashState || h.shadowGuaranteeCritTimer > 0)) {
    h.dashCd = 0;
    h.ultCd = Math.max(0, h.ultCd - 2.0);
  }

  if (h.classId === 'plague_apothecary' && (e.poisonTimer > 0 || e.miasmaVulnTimer > 0)) {
    game.sfx.contagionPop({ x: e.x, z: e.z });
    game.vfx.spawnRing(e.x, e.z, 3.0, 0.40, 0x5eff7a, false);
    game.vfx.burst(e.x, 1.0, e.z, 0x5eff7a, 22, 5.2, 6.0);
    const popDmg = Math.round(52 * game.effectiveDmgMult());
    for (const foe of [...game.enemies]) {
      if (foe.hp > 0 && Math.hypot(foe.x - e.x, foe.z - e.z) <= 3.0 + foe.radius) {
        foe.poisonTimer = Math.max(foe.poisonTimer || 0, 4.0);
        foe.poisonDps = Math.max(foe.poisonDps || 0, Math.round(24 * game.effectiveDmgMult()));
        game.damageEnemy(foe, popDmg, e.x, e.z, { allowCrit: false, isClassProc: true, fxColor: 0x5eff7a });
      }
    }
  }

  if (h.classId === 'bone_necromancer') {
    h.necroKillAccum = (h.necroKillAccum || 0) + 1;
    if (h.necroKillAccum >= 3) {
      h.necroKillAccum = 0;
      if (game.classRuntime.minions.length < 4) {
        game.sfx.wraithRise({ x: e.x, z: e.z });
        spawnSkeletonWraith(game, e.x, e.z, false);
        game.spawnFloatingText(e.x, 2.1, e.z, zh ? '唤醒骨卫!' : 'WRAITH RISEN!', '#62ffad', 'callout');
      }
    }
  }

  if (h.classId === 'brass_artificer') {
    grantTinkerOverclock(game);
  }

  if (h.classId === 'abyssal_ooze') {
    h.slimeKillAccum = (h.slimeKillAccum || 0) + 1;
    if (h.slimeKillAccum >= 2) {
      h.slimeKillAccum = 0;
      spawnExplosiveSlimeling(game, e.x, e.z);
    }
  }

  if (h.classId === 'cursed_mimic') {
    const bonus = Math.max(1, Math.round((e.cinders || 5) * 0.30));
    game.spawnCinderOrbs(e.x, e.z, bonus);
  }
}

export function onClassDash(game, ox, oz) {
  const h = game.hero;
  if (!h) return;
  if (h.dashStrideBoost > 0) {
    h.postDashSpeedTimer = 1.0;
  }
  if (h.classId === 'wraith_assassin') {
    h.shadowGuaranteeCritTimer = 1.8;
  }
  if (h.classId === 'storm_invoker') {
    game.delayedHazards.push({
      friendly: true,
      lightningSky: true,
      timer: 0.14,
      x: ox,
      z: oz,
      radius: 2.6,
      dmg: Math.round(58 * game.effectiveDmgMult()),
      colorHex: 0x63d8ff,
      stagger: 0.35
    });
  }
}

export function onClassWeaponSkill(game) {
  const h = game.hero;
  if (!h) return;
  if (h.classId === 'chrono_astromancer') {
    for (let i = -1; i <= 1; i += 2) {
      const yaw = h.yaw + i * 0.28;
      const nearTarget = game.enemies.find((e) => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) < 15.0) || null;
      game.spawnPlayerProjectile({
        kind: 'orb',
        x: h.x + Math.sin(yaw) * 0.7,
        z: h.z + Math.cos(yaw) * 0.7,
        yaw,
        speed: 16.5,
        life: 0.95,
        dmg: Math.round(44 * game.effectiveDmgMult()),
        colorHex: 0x92b6ff,
        homingTarget: nearTarget,
        bouncesLeft: 1,
        pierce: 1,
        radius: 0.26
      });
    }
    game.updateHUD();
  }
}

export function onClassPropBroken(game) {
  if (game.hero && game.hero.classId === 'brass_artificer') {
    grantTinkerOverclock(game);
  }
}

export function onClassCinderPickup(game) {
  const h = game.hero;
  if (h && h.classId === 'cursed_mimic' && !h.downed) {
    h.hp = Math.min(h.maxHp, h.hp + 2);
  }
}

function grantTinkerOverclock(game) {
  const h = game.hero;
  h.tinkerOverclockTimer = 3.0;
}

// ==================== SUMMON SPAWNERS ====================
export function spawnSkeletonWraith(game, x, z, permanent = false, opts = {}) {
  const rig = createSkeletonMinionRig(game.mats);
  rig.root.position.set(x, 0, z);
  game.scene.add(rig.root);
  game.vfx.burst(x, 0.9, z, 0x62ffad, 18, 4.2, 4.5);
  game.classRuntime.minions.push({
    rig,
    x,
    z,
    yaw: 0,
    permanent,
    life: permanent ? 999999 : 18.0,
    atkCd: 0.2,
    visualOnly: !!opts.visualOnly,
    ownerPeer: opts.ownerPeer || null,
    frenzyTimer: opts.frenzyTimer || 0
  });
  if (!opts.visualOnly && !permanent && !opts.skipBroadcast) {
    game.coopBroadcastPlayerAction?.({
      act: 'class_summon_vfx',
      sub: 'wraith',
      x: +x.toFixed(2),
      z: +z.toFixed(2)
    });
  }
}

function spawnAutoturret(game, x, z, opts = {}) {
  const rt = game.classRuntime;
  if (!opts.visualOnly) {
    const ownTurrets = rt.turrets.filter((t) => !t.visualOnly);
    if (ownTurrets.length >= 2) {
      const idx = rt.turrets.indexOf(ownTurrets[0]);
      if (idx !== -1) rt.turrets.splice(idx, 1);
      detonateTurret(game, ownTurrets[0]);
    }
  }
  const rig = createAutoturretRig(game.mats);
  rig.root.position.set(x, 0, z);
  game.scene.add(rig.root);
  game.vfx.burst(x, 0.8, z, 0xffae42, 22, 4.8, 5.0);
  game.vfx.spawnRing(x, z, 1.6, 0.35, 0xffae42, false);
  rt.turrets.push({
    rig,
    x,
    z,
    yaw: opts.yaw ?? game.hero.yaw,
    life: 14.0,
    fireCd: 0.15,
    shotCount: 0,
    recoil: 0,
    visualOnly: !!opts.visualOnly
  });
}

function detonateTurret(game, tur) {
  game.scene.remove(tur.rig.root);
  game.vfx.burst(tur.x, 0.9, tur.z, 0xff8533, 28, 6.2, 7.5);
  game.vfx.spawnRing(tur.x, tur.z, 3.2, 0.38, 0xff8533, false);
  if (tur.visualOnly) return;
  const blast = Math.round(88 * game.effectiveDmgMult());
  for (const e of [...game.enemies]) {
    if (e.hp > 0 && Math.hypot(e.x - tur.x, e.z - tur.z) <= 3.2 + e.radius) {
      game.damageEnemy(e, blast, tur.x, tur.z, {
        allowCrit: false,
        isClassProc: true,
        inflictBurn: true,
        fxColor: 0xff8533,
        stagger: 0.5
      });
    }
  }
}

export function spawnExplosiveSlimeling(game, x, z, opts = {}) {
  if (game.classRuntime.slimelings.length >= 10) return;
  const rig = createSlimelingRig();
  const ang = Math.random() * Math.PI * 2;
  const sx = x + Math.cos(ang) * 0.65;
  const sz = z + Math.sin(ang) * 0.65;
  rig.root.position.set(sx, 0, sz);
  game.scene.add(rig.root);
  game.vfx.burst(sx, 0.5, sz, 0x42f5b3, 10, 3.4, 4.0);
  game.classRuntime.slimelings.push({
    rig,
    x: sx,
    z: sz,
    life: 8.5,
    phase: Math.random() * 6.28,
    visualOnly: !!opts.visualOnly
  });
  if (!opts.visualOnly) {
    game.coopBroadcastPlayerAction?.({
      act: 'class_summon_vfx',
      sub: 'slimeling',
      x: +sx.toFixed(2),
      z: +sz.toFixed(2)
    });
  }
}

function spawnShadowDecoy(game, x, z, yaw, opts = {}) {
  const rig = buildClassHeroRig('wraith_assassin', game.mats, null);
  rig.root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      obj.material = new THREE.MeshBasicMaterial({
        color: 0x3ef0ff,
        transparent: true,
        opacity: 0.42,
        wireframe: false
      });
    }
  });
  rig.heroLight.intensity = 0.8;
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = yaw;
  game.scene.add(rig.root);
  game.classRuntime.decoys.push({ rig, x, z, life: 2.8, visualOnly: !!opts.visualOnly });
}

// ==================== SINGLE INDEPENDENT ACTIVE SKILL [X] ====================
export function tryHeroActiveSkill(game, fromBuffer = false) {
  if (game.mode !== 'explore') return;
  const h = game.hero;
  if (!h || h.downed || h.slimeJumpState || h.omnislashState) return;

  if (h.ultCd > 0) {
    if (!fromBuffer && h.ultCd <= 0.22) {
      game.queueInputBuffer('ult');
    } else if (!fromBuffer) {
      game.pulseSlotReject('slot-ult');
    }
    return;
  }

  const cls = getHeroClass(h.classId);
  const ct = getClassText(cls);
  const zh = getLang() === 'zh';
  const sc = game.floorCfg ? game.floorCfg.boonScale : 1.0;
  const cdMult = Math.max(0.45, h.arcCdMult || 1.0);
  h.ultCdMax = +(cls.active.cd * cdMult).toFixed(2);
  h.ultCd = h.ultCdMax;
  const cdUltNumEl = document.getElementById('cd-ult-num');
  if (cdUltNumEl) {
    cdUltNumEl.textContent = h.ultCd.toFixed(1);
    cdUltNumEl.classList.remove('hidden');
  }
  h.atkState = null;

  const aimDx = game.aimWorld.x - h.x;
  const aimDz = game.aimWorld.z - h.z;
  const aimDist = Math.hypot(aimDx, aimDz);
  const aimYaw = aimDist > 0.2 ? Math.atan2(aimDx, aimDz) : h.yaw;
  h.yaw = aimYaw;

  game.sfx.classSkill(cls.id, { x: h.x, z: h.z });
  game.spawnFloatingText(h.x, 2.38, h.z, ct.activeName, cls.accent, 'callout');

  const castOriginX = h.x;
  const castOriginZ = h.z;
  const netSkillMeta = {};

  switch (cls.id) {
    // 1. EMBER PALADIN — Sanctum Dome
    case 'ember_paladin': {
      h.sanctumDomeTimer = 4.0;
      h.sanctumPulseAccum = 0.45;
      if (game.classRuntime.dome) game.scene.remove(game.classRuntime.dome.root);
      const dome = createSanctumDomeMesh(2.65);
      dome.root.position.set(h.x, 1.05, h.z);
      game.scene.add(dome.root);
      game.classRuntime.dome = dome;
      game.vfx.spawnRing(h.x, h.z, 3.6, 0.45, 0xffb844, true);
      game.vfx.flash(h.x, 1.5, h.z, 0xffb844, 18);
      break;
    }

    // 2. CRIMSON FLAGELLANT — Sanguine Rapture
    case 'crimson_flagellant': {
      const cost = Math.max(0, Math.min(h.hp - 1, Math.floor(h.hp * 0.25)));
      h.hp = Math.max(1, h.hp - cost);
      h.bloodRageTimer = 5.0;
      h.invuln = Math.max(h.invuln, 0.45);
      game.cameraShake = Math.max(game.cameraShake, 0.34);
      game.vfx.spawnRing(h.x, h.z, 4.3, 0.50, 0xff2848, true);
      game.vfx.burst(h.x, 1.1, h.z, 0xff2848, 42, 7.2, 8.0);
      const novaDmg = Math.round((115 + cost * 1.4) * sc * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 4.3 + e.radius) {
          game.damageEnemy(e, novaDmg, h.x, h.z, {
            fxColor: 0xff2848,
            stagger: 0.75
          });
        }
      }
      break;
    }

    // 3. IRON JUGGERNAUT — Graviton Crush
    case 'iron_juggernaut': {
      const leapDist = Math.min(4.4, Math.max(1.2, aimDist));
      const ox = h.x;
      const oz = h.z;
      h.x += Math.sin(aimYaw) * leapDist;
      h.z += Math.cos(aimYaw) * leapDist;
      if (game.dungeon) game.dungeon.resolveMovement(h, ox, oz, 0.46);
      h.invuln = Math.max(h.invuln, 0.50);
      game.cameraShake = Math.max(game.cameraShake, 0.42);
      game.vfx.spawnRing(h.x, h.z, 5.5, 0.52, 0x63dcff, true);
      game.vfx.burst(h.x, 1.0, h.z, 0xffc84a, 38, 7.5, 9.0);
      const crushDmg = Math.round(118 * sc * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (!e || e.hp <= 0) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z);
        if (d <= 5.8 + e.radius) {
          // Pull toward vortex center!
          const pullRatio = e.boss ? 0.30 : 0.74;
          const px = e.x + (h.x - e.x) * pullRatio;
          const pz = e.z + (h.z - e.z) * pullRatio;
          if (game.dungeon) {
            const prevEx = e.x;
            const prevEz = e.z;
            e.x = px;
            e.z = pz;
            game.dungeon.resolveMovement(e, prevEx, prevEz, e.radius || 0.5);
          }
          e.stunTimer = Math.max(e.stunTimer, e.boss ? 0.9 : 1.8);
          game.damageEnemy(e, crushDmg, h.x, h.z, {
            attackerShieldBreak: 2.5,
            fxColor: 0x63dcff,
            stagger: 1.8
          });
        }
      }
      break;
    }

    // 4. WRAITH ASSASSIN — Omnislash Mirage
    case 'wraith_assassin': {
      spawnShadowDecoy(game, h.x, h.z, h.yaw);
      h.invuln = Math.max(h.invuln, 0.85);
      h.shadowGuaranteeCritTimer = 2.6;
      h.omnislashState = {
        strikesLeft: 5,
        stepTimer: 0.02,
        originX: h.x,
        originZ: h.z
      };
      break;
    }

    // 5. FORTUNE GAMBLER — Fate High Roll
    case 'fortune_gambler': {
      const tx = h.x + Math.sin(aimYaw) * Math.min(4.2, Math.max(2.0, aimDist));
      const tz = h.z + Math.cos(aimYaw) * Math.min(4.2, Math.max(2.0, aimDist));
      const dieMesh = createFateDieMesh();
      dieMesh.position.set(h.x, 1.6, h.z);
      game.scene.add(dieMesh);
      const roll = 1 + Math.floor(Math.random() * 6);
      netSkillMeta.tx = +tx.toFixed(2);
      netSkillMeta.tz = +tz.toFixed(2);
      netSkillMeta.roll = roll;
      game.classRuntime.dice.push({
        mesh: dieMesh,
        sx: h.x,
        sz: h.z,
        tx,
        tz,
        age: 0,
        dur: 0.52,
        roll,
        visualOnly: false
      });
      break;
    }

    // 6. PLAGUE APOTHECARY — Miasma Concoction
    case 'plague_apothecary': {
      const baseDist = Math.min(5.2, Math.max(2.2, aimDist));
      const cx = h.x + Math.sin(aimYaw) * baseDist;
      const cz = h.z + Math.cos(aimYaw) * baseDist;
      netSkillMeta.cx = +cx.toFixed(2);
      netSkillMeta.cz = +cz.toFixed(2);
      const offsets = [[0, 0], [-1.7, 1.1], [1.7, -1.1]];
      for (const [ox, oz] of offsets) {
        const px = cx + ox;
        const pz = cz + oz;
        const poolGeo = new THREE.CircleGeometry(2.55, 24);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMat = new THREE.MeshBasicMaterial({
          color: 0x42ff75,
          transparent: true,
          opacity: 0.30,
          depthWrite: false
        });
        const poolMesh = new THREE.Mesh(poolGeo, poolMat);
        poolMesh.position.set(px, 0.06, pz);
        poolMesh.userData.ignoreAO = true;
        game.scene.add(poolMesh);
        game.vfx.burst(px, 0.6, pz, 0x5eff7a, 20, 4.8, 5.5);
        game.classRuntime.zones.push({
          kind: 'miasma',
          mesh: poolMesh,
          mat: poolMat,
          x: px,
          z: pz,
          radius: 2.55,
          life: 5.0,
          tickAccum: 0.35
        });
      }
      break;
    }

    // 7. BONE NECROMANCER — Legion of Ash
    case 'bone_necromancer': {
      for (let i = 0; i < 2; i++) {
        if (game.classRuntime.minions.length < 4) {
          const ang = aimYaw + (i === 0 ? -0.7 : 0.7);
          spawnSkeletonWraith(game, h.x + Math.sin(ang) * 1.4, h.z + Math.cos(ang) * 1.4, false, { skipBroadcast: true });
        }
      }
      h.necroFrenzyTimer = 6.5;
      for (const m of game.classRuntime.minions) {
        if (!m.permanent) m.life = 18.0;
        game.vfx.spawnRing(m.x, m.z, 2.2, 0.36, 0x62ffad, false);
      }
      break;
    }

    // 8. CHRONO ASTROMANCER — Stasis Chronosphere
    case 'chrono_astromancer': {
      const radius = 6.6;
      const chrono = createChronosphereMesh(radius);
      chrono.root.position.set(h.x, 0.02, h.z);
      game.scene.add(chrono.root);
      game.vfx.spawnRing(h.x, h.z, radius, 0.55, 0xffd978, false);
      game.vfx.flash(h.x, 1.8, h.z, 0x92b6ff, 22);
      game.classRuntime.zones.push({
        kind: 'chronosphere',
        mesh: chrono.root,
        chrono,
        x: h.x,
        z: h.z,
        radius,
        life: 4.0
      });
      break;
    }

    // 9. STORM INVOKER — Heavens Wrath
    case 'storm_invoker': {
      h.stormWrathTimer = 4.5;
      h.stormBoltAccum = 0.05;
      game.vfx.spawnRing(h.x, h.z, 3.8, 0.42, 0x63d8ff, true);
      for (const e of [...game.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.8 + e.radius) {
          game.damageEnemy(e, Math.round(68 * sc * game.effectiveDmgMult()), h.x, h.z, {
            fxColor: 0x63d8ff,
            stagger: 0.65
          });
        }
      }
      break;
    }

    // 10. BRASS ARTIFICER — Deploy Autoturret
    case 'brass_artificer': {
      const tx = h.x + Math.sin(aimYaw) * 1.25;
      const tz = h.z + Math.cos(aimYaw) * 1.25;
      netSkillMeta.tx = +tx.toFixed(2);
      netSkillMeta.tz = +tz.toFixed(2);
      spawnAutoturret(game, tx, tz);
      grantTinkerOverclock(game);
      break;
    }

    // 11. ABYSSAL OOZE — King Slime Slam
    case 'abyssal_ooze': {
      h.invuln = Math.max(h.invuln, 1.35);
      h.slimeJumpState = {
        bouncesLeft: 3,
        phase: 0,
        dur: 0.36,
        startX: h.x,
        startZ: h.z,
        targetX: h.x + Math.sin(aimYaw) * 2.8,
        targetZ: h.z + Math.cos(aimYaw) * 2.8
      };
      break;
    }

    // 12. CURSED MIMIC — Ravenous Jackpot
    case 'cursed_mimic': {
      const ox = h.x;
      const oz = h.z;
      h.x += Math.sin(aimYaw) * 2.6;
      h.z += Math.cos(aimYaw) * 2.6;
      if (game.dungeon) game.dungeon.resolveMovement(h, ox, oz, 0.44);
      h.invuln = Math.max(h.invuln, 0.45);
      game.cameraShake = Math.max(game.cameraShake, 0.36);
      game.vfx.spawnRing(h.x, h.z, 3.8, 0.42, 0xffbe3b, true);
      game.vfx.burst(h.x, 1.1, h.z, 0xffbe3b, 36, 7.0, 8.0);

      let devouredAny = false;
      const biteDmg = Math.round(135 * sc * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (!e || e.hp <= 0) continue;
        if (Math.hypot(e.x - h.x, e.z - h.z) <= 3.85 + e.radius) {
          devouredAny = true;
          const execPct = (e.affixes && e.affixes.length > 0) ? 0.08 : 0.15;
          if (!e.boss && e.hp <= e.maxHp * execPct) {
            e.shield = 0;
            game.spawnFloatingText(e.x, 2.2, e.z, zh ? '一口吞噬!' : 'DEVOURED!', '#ffbe3b', 'callout');
            game.damageEnemy(e, e.hp + 999, h.x, h.z, { allowCrit: false, fxColor: 0xffbe3b });
          } else {
            game.damageEnemy(e, biteDmg, h.x, h.z, {
              attackerCritChance: 1.0,
              fxColor: 0xffbe3b,
              stagger: 0.8
            });
          }
        }
      }
      // Erupt 12 ricocheting gold coins in 360 degrees!
      for (let i = 0; i < 12; i++) {
        const cyaw = (i / 12) * Math.PI * 2;
        game.spawnPlayerProjectile({
          kind: 'orb',
          x: h.x + Math.sin(cyaw) * 0.5,
          z: h.z + Math.cos(cyaw) * 0.5,
          yaw: cyaw,
          speed: 17.5,
          life: 0.72,
          dmg: Math.round(42 * sc * game.effectiveDmgMult()),
          colorHex: 0xffd24c,
          bouncesLeft: 1,
          pierce: 1,
          radius: 0.24
        });
      }
      if (devouredAny) {
        game.spawnCinderOrbs(h.x, h.z, 10);
      }
      break;
    }
  }

  if (game.coopBroadcastPlayerAction) {
    game.coopBroadcastPlayerAction({
      act: 'class_skill',
      classId: cls.id,
      x: +castOriginX.toFixed(2),
      z: +castOriginZ.toFixed(2),
      tx: +(netSkillMeta.tx ?? h.x).toFixed(2),
      tz: +(netSkillMeta.tz ?? h.z).toFixed(2),
      yaw: +aimYaw.toFixed(2),
      ...netSkillMeta
    });
  }

  game.updateHUD();
}

export function onRemoteClassSkill(game, peer, payload) {
  const cls = getHeroClass(payload.classId || peer?.classId);
  const ct = getClassText(cls);
  const x = payload.x ?? (peer ? peer.x : 0);
  const z = payload.z ?? (peer ? peer.z : 0);
  const tx = payload.tx ?? x;
  const tz = payload.tz ?? z;
  const yaw = payload.yaw ?? (peer ? peer.yaw : 0);
  const rt = game.classRuntime;

  game.sfx.classSkill(cls.id, { x, z });
  game.spawnFloatingText(x, 2.38, z, ct.activeName, cls.accent, 'callout');

  switch (cls.id) {
    case 'ember_paladin': {
      if (rt.remoteDomes) {
        for (let i = rt.remoteDomes.length - 1; i >= 0; i--) {
          if (rt.remoteDomes[i].ownerPeer === peer) {
            game.scene.remove(rt.remoteDomes[i].dome.root);
            rt.remoteDomes.splice(i, 1);
          }
        }
        const dome = createSanctumDomeMesh(2.65);
        dome.root.position.set(x, 1.05, z);
        game.scene.add(dome.root);
        rt.remoteDomes.push({
          dome,
          ownerPeer: peer || null,
          x,
          z,
          timer: 4.0,
          pulseAccum: 0.45
        });
      }
      game.vfx.spawnRing(x, z, 3.6, 0.45, 0xffb844, true);
      game.vfx.flash(x, 1.5, z, 0xffb844, 18);
      break;
    }
    case 'crimson_flagellant': {
      game.vfx.spawnRing(x, z, 4.3, 0.50, 0xff2848, true);
      game.vfx.burst(x, 1.1, z, 0xff2848, 42, 7.2, 8.0);
      if (peer) peer.bloodRageTimer = 5.0;
      break;
    }
    case 'iron_juggernaut': {
      game.vfx.burst(x, 1.0, z, 0xffc84a, 16, 4.5, 4.0);
      game.vfx.spawnRing(tx, tz, 5.5, 0.52, 0x63dcff, true);
      game.vfx.burst(tx, 1.0, tz, 0xffc84a, 38, 7.5, 9.0);
      break;
    }
    case 'wraith_assassin': {
      spawnShadowDecoy(game, x, z, yaw, { visualOnly: true });
      game.vfx.spawnRing(x, z, 2.8, 0.36, 0x4df0ff, false);
      game.vfx.burst(x, 1.1, z, 0x4df0ff, 22, 5.4, 5.0);
      break;
    }
    case 'fortune_gambler': {
      const dieMesh = createFateDieMesh();
      dieMesh.position.set(x, 1.6, z);
      game.scene.add(dieMesh);
      rt.dice.push({
        mesh: dieMesh,
        sx: x,
        sz: z,
        tx,
        tz,
        age: 0,
        dur: 0.52,
        roll: payload.roll || 6,
        visualOnly: true
      });
      break;
    }
    case 'plague_apothecary': {
      const cx = payload.cx ?? (x + Math.sin(yaw) * 3.6);
      const cz = payload.cz ?? (z + Math.cos(yaw) * 3.6);
      const offsets = [[0, 0], [-1.7, 1.1], [1.7, -1.1]];
      for (const [ox, oz] of offsets) {
        const px = cx + ox;
        const pz = cz + oz;
        const poolGeo = new THREE.CircleGeometry(2.55, 24);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMat = new THREE.MeshBasicMaterial({
          color: 0x42ff75,
          transparent: true,
          opacity: 0.30,
          depthWrite: false
        });
        const poolMesh = new THREE.Mesh(poolGeo, poolMat);
        poolMesh.position.set(px, 0.06, pz);
        poolMesh.userData.ignoreAO = true;
        game.scene.add(poolMesh);
        game.vfx.burst(px, 0.6, pz, 0x5eff7a, 20, 4.8, 5.5);
        rt.zones.push({
          kind: 'miasma',
          mesh: poolMesh,
          mat: poolMat,
          x: px,
          z: pz,
          radius: 2.55,
          life: 5.0,
          tickAccum: 0.35,
          visualOnly: true
        });
      }
      break;
    }
    case 'bone_necromancer': {
      for (let i = 0; i < 2; i++) {
        const ang = yaw + (i === 0 ? -0.7 : 0.7);
        const wx = x + Math.sin(ang) * 1.4;
        const wz = z + Math.cos(ang) * 1.4;
        spawnSkeletonWraith(game, wx, wz, false, {
          visualOnly: true,
          ownerPeer: peer || null,
          frenzyTimer: 6.5
        });
        game.vfx.spawnRing(wx, wz, 2.2, 0.36, 0x62ffad, false);
      }
      break;
    }
    case 'chrono_astromancer': {
      const radius = 6.6;
      const chrono = createChronosphereMesh(radius);
      chrono.root.position.set(x, 0.02, z);
      game.scene.add(chrono.root);
      game.vfx.spawnRing(x, z, radius, 0.55, 0xffd978, false);
      game.vfx.flash(x, 1.8, z, 0x92b6ff, 22);
      rt.zones.push({
        kind: 'chronosphere',
        mesh: chrono.root,
        chrono,
        x,
        z,
        radius,
        life: 4.0,
        visualOnly: true
      });
      break;
    }
    case 'storm_invoker': {
      game.vfx.spawnRing(x, z, 3.8, 0.42, 0x63d8ff, true);
      game.vfx.burst(x, 1.2, z, 0x63d8ff, 26, 6.0, 6.5);
      break;
    }
    case 'brass_artificer': {
      spawnAutoturret(game, tx, tz, { visualOnly: true, yaw });
      break;
    }
    case 'abyssal_ooze': {
      if (peer) peer.slimeScaleTimer = 1.08;
      game.vfx.spawnRing(x, z, 2.8, 0.35, 0x42f5b3, false);
      game.vfx.burst(x, 0.8, z, 0x42f5b3, 22, 5.5, 5.5);
      break;
    }
    case 'cursed_mimic': {
      game.vfx.spawnRing(tx, tz, 3.8, 0.42, 0xffbe3b, true);
      game.vfx.burst(tx, 1.1, tz, 0xffbe3b, 36, 7.0, 8.0);
      break;
    }
    default: {
      game.vfx.spawnRing(x, z, 3.2, 0.42, cls.accentHex, false);
      game.vfx.burst(x, 1.1, z, cls.accentHex, 24, 5.6, 5.5);
      break;
    }
  }
}

function resolveFateDieRoll(game, d) {
  const h = game.hero;
  const zh = getLang() === 'zh';
  const sc = game.floorCfg ? game.floorCfg.boonScale : 1.0;
  const roll = d.roll;
  game.sfx.diceResolve(roll, { x: d.tx, z: d.tz });
  game.vfx.burst(d.tx, 1.0, d.tz, 0xffd86b, 32, 6.8, 7.5);
  game.vfx.spawnRing(d.tx, d.tz, 3.6, 0.42, 0xffd86b, false);
  if (d.visualOnly) {
    if (roll <= 2) {
      game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? `🎲 [${roll}] 皇家飞牌!` : `🎲 [${roll}] ROYAL FLUSH!`, '#ff758f', 'callout');
    } else if (roll <= 4) {
      game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? `🎲 [${roll}] 极寒冰封!` : `🎲 [${roll}] DIAMOND FREEZE!`, '#7ee8ff', 'callout');
      game.vfx.spawnRing(d.tx, d.tz, 7.5, 0.5, 0x63dcff, true);
    } else if (roll === 5) {
      game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? '🎲 [5] 红心彩池!' : '🎲 [5] HEART POT!', '#6ff0a8', 'callout');
    } else {
      for (const e of game.enemies.slice(0, 5)) {
        if (e.hp > 0) {
          game.delayedHazards.push({
            friendly: true,
            visualOnly: true,
            lightningSky: true,
            timer: 0.12,
            x: e.x,
            z: e.z,
            radius: 2.8,
            dmg: 0,
            colorHex: 0xffd86b,
            mesh: null
          });
        }
      }
      game.spawnFloatingText(d.tx, 2.5, d.tz, zh ? '🎲 [6] 天胡大满贯 777!!' : '🎲 [6] TRIPLE JACKPOT 777!!', '#ffe270', 'callout');
    }
    return;
  }
  for (const e of [...game.enemies]) {
    if (e.hp > 0 && Math.hypot(e.x - d.tx, e.z - d.tz) <= 3.6 + e.radius) {
      game.damageEnemy(e, Math.round(80 * sc * game.effectiveDmgMult()), d.tx, d.tz, { fxColor: 0xffd86b });
    }
  }

  const firePokerFan = () => {
    const baseYaw = Math.atan2(d.tx - h.x, d.tz - h.z);
    for (let i = 0; i < 10; i++) {
      const yaw = baseYaw - 0.72 + (i / 9) * 1.44;
      game.spawnPlayerProjectile({
        kind: 'bolt',
        x: d.tx,
        z: d.tz,
        yaw,
        speed: 22.0,
        life: 0.72,
        dmg: Math.round(50 * sc * game.effectiveDmgMult()),
        colorHex: i % 2 === 0 ? 0xff4d6d : 0xffd86b,
        pierce: 3,
        radius: 0.28
      });
    }
  };

  if (roll <= 2) {
    game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? `🎲 [${roll}] 皇家飞牌!` : `🎲 [${roll}] ROYAL FLUSH!`, '#ff758f', 'callout');
    firePokerFan();
  } else if (roll <= 4) {
    game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? `🎲 [${roll}] 极寒冰封!` : `🎲 [${roll}] DIAMOND FREEZE!`, '#7ee8ff', 'callout');
    game.vfx.spawnRing(d.tx, d.tz, 7.5, 0.5, 0x63dcff, true);
    for (const e of [...game.enemies]) {
      if (e.hp > 0 && Math.hypot(e.x - d.tx, e.z - d.tz) <= 8.0 + e.radius) {
        e.stunTimer = Math.max(e.stunTimer, e.boss ? 1.2 : 2.4);
        e.chillTimer = Math.max(e.chillTimer, 5.0);
        e.miasmaVulnTimer = Math.max(e.miasmaVulnTimer || 0, 5.0);
      }
    }
  } else if (roll === 5) {
    const heal = Math.round(h.maxHp * 0.40);
    h.hp = Math.min(h.maxHp, h.hp + heal);
    game.spawnCinderOrbs(d.tx, d.tz, 26);
    game.spawnFloatingText(d.tx, 2.3, d.tz, zh ? `🎲 [5] 红心彩池 +${heal}!` : `🎲 [5] HEART POT +${heal}!`, '#6ff0a8', 'callout');
  } else {
    // JACKPOT 6!
    h.gamblerJackpotTimer = 5.5;
    game.spawnCinderOrbs(d.tx, d.tz, 32);
    firePokerFan();
    for (const e of game.enemies.slice(0, 5)) {
      if (e.hp > 0) {
        game.delayedHazards.push({
          friendly: true,
          lightningSky: true,
          timer: 0.12,
          x: e.x,
          z: e.z,
          radius: 2.8,
          dmg: Math.round(92 * sc * game.effectiveDmgMult()),
          colorHex: 0xffd86b,
          stagger: 0.8
        });
      }
    }
    game.spawnFloatingText(d.tx, 2.5, d.tz, zh ? '🎲 [6] 天胡大满贯 777!!' : '🎲 [6] TRIPLE JACKPOT 777!!', '#ffe270', 'callout');
  }
  game.updateHUD();
}

// ==================== PER-FRAME SIMULATION UPDATE ====================
export function updateClassSystems(game, dt) {
  const h = game.hero;
  if (!h) return;
  const rt = game.classRuntime;
  const sc = game.floorCfg ? game.floorCfg.boonScale : 1.0;

  // Cooldowns & buff timers
  const cdRate = h.inChronosphere ? 2.0 : 1.0;
  h.ultCd = Math.max(0, (h.ultCd || 0) - dt);
  if (h.inChronosphere && h.arcCd > 0) {
    h.arcCd = Math.max(0, h.arcCd - dt * (cdRate - 1.0));
  }
  h.bloodRageTimer = Math.max(0, (h.bloodRageTimer || 0) - dt);
  h.bloodLifestealIcd = Math.max(0, (h.bloodLifestealIcd || 0) - dt);
  h.postDashSpeedTimer = Math.max(0, (h.postDashSpeedTimer || 0) - dt);
  h.shadowGuaranteeCritTimer = Math.max(0, (h.shadowGuaranteeCritTimer || 0) - dt);
  h.gamblerJackpotTimer = Math.max(0, (h.gamblerJackpotTimer || 0) - dt);
  h.gamblerCoinIcd = Math.max(0, (h.gamblerCoinIcd || 0) - dt);
  h.necroFrenzyTimer = Math.max(0, (h.necroFrenzyTimer || 0) - dt);
  h.tinkerOverclockTimer = Math.max(0, (h.tinkerOverclockTimer || 0) - dt);

  // HUD [X] cooldown veil
  const cdUltEl = document.getElementById('cd-ult');
  if (cdUltEl) {
    cdUltEl.style.height = `${Math.max(0, Math.min(100, (h.ultCd / Math.max(0.1, h.ultCdMax || 8)) * 100))}%`;
  }
  const cdUltNumEl = document.getElementById('cd-ult-num');
  if (cdUltNumEl) {
    if (h.ultCd > 0.05) {
      cdUltNumEl.textContent = h.ultCd.toFixed(1);
      cdUltNumEl.classList.remove('hidden');
    } else {
      cdUltNumEl.classList.add('hidden');
    }
  }

  // Shield regeneration
  if (h.maxShield > 0 && !h.downed) {
    h.shieldRegenTimer = Math.max(0, (h.shieldRegenTimer || 0) - dt);
    if (h.shieldRegenTimer <= 0 && h.shield < h.maxShield) {
      const prevInt = Math.ceil(h.shield);
      h.shield = Math.min(h.maxShield, h.shield + (h.shieldRegenRate || 5) * dt);
      if (Math.ceil(h.shield) !== prevInt) {
        updateClassHUD(game);
      }
    }
  }
  if (game.heroRig && game.heroRig.shieldAura) {
    game.heroRig.shieldAura.visible = !h.downed && h.shield > 0.5;
  }

  // 1. Sanctum Dome follow & searing pulses
  if (h.sanctumDomeTimer > 0) {
    h.sanctumDomeTimer = Math.max(0, h.sanctumDomeTimer - dt);
    if (rt.dome) {
      rt.dome.root.position.set(h.x, 1.05, h.z);
      rt.dome.shell.rotation.y += dt * 1.4;
    }
    h.sanctumPulseAccum -= dt;
    if (h.sanctumPulseAccum <= 0) {
      h.sanctumPulseAccum = 0.55;
      game.vfx.spawnRing(h.x, h.z, 3.0, 0.32, 0xffb844, false);
      const pDmg = Math.round(38 * sc * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.0 + e.radius) {
          game.damageEnemy(e, pDmg, h.x, h.z, { allowCrit: false, inflictBurn: true, fxColor: 0xffb844 });
        }
      }
    }
    if (h.sanctumDomeTimer <= 0 && rt.dome) {
      game.scene.remove(rt.dome.root);
      rt.dome = null;
    }
  }
  if (rt.remoteDomes && rt.remoteDomes.length > 0) {
    for (let i = rt.remoteDomes.length - 1; i >= 0; i--) {
      const rd = rt.remoteDomes[i];
      rd.timer -= dt;
      if (rd.ownerPeer) {
        rd.x = rd.ownerPeer.x;
        rd.z = rd.ownerPeer.z;
      }
      rd.dome.root.position.set(rd.x, 1.05, rd.z);
      rd.dome.shell.rotation.y += dt * 1.4;
      rd.pulseAccum -= dt;
      if (rd.pulseAccum <= 0) {
        rd.pulseAccum = 0.55;
        game.vfx.spawnRing(rd.x, rd.z, 3.0, 0.32, 0xffb844, false);
      }
      if (rd.timer <= 0 || (rd.ownerPeer && rd.ownerPeer.downed)) {
        game.scene.remove(rd.dome.root);
        rt.remoteDomes.splice(i, 1);
      }
    }
  }

  // 4. Wraith Assassin Omnislash sequence
  if (h.omnislashState) {
    const st = h.omnislashState;
    st.stepTimer -= dt;
    h.invuln = Math.max(h.invuln, 0.25);
    if (st.stepTimer <= 0) {
      const living = game.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 10.5);
      if (st.strikesLeft <= 0 || living.length === 0) {
        h.omnislashState = null;
      } else {
        const target = living[(5 - st.strikesLeft) % living.length];
        const ang = Math.random() * Math.PI * 2;
        const nx = target.x + Math.cos(ang) * 0.85;
        const nz = target.z + Math.sin(ang) * 0.85;
        game.spawnLightningBolt(h.x, h.z, nx, nz, 0x4df0ff, true);
        const prevX = h.x;
        const prevZ = h.z;
        h.x = nx;
        h.z = nz;
        if (game.dungeon) game.dungeon.resolveMovement(h, prevX, prevZ, 0.42);
        h.yaw = Math.atan2(target.x - h.x, target.z - h.z);
        game.sfx.assassinBlinkStrike(st.strikesLeft, { x: target.x, z: target.z });
        game.vfx.burst(target.x, 1.1, target.z, 0x4df0ff, 18, 5.8, 7.0);
        game.coopBroadcastPlayerAction?.({
          act: 'bolt_vfx',
          x1: +prevX.toFixed(2),
          z1: +prevZ.toFixed(2),
          x2: +h.x.toFixed(2),
          z2: +h.z.toFixed(2),
          colorHex: 0x4df0ff,
          burstX: +target.x.toFixed(2),
          burstZ: +target.z.toFixed(2)
        });
        game.damageEnemy(target, Math.round(72 * sc * game.effectiveDmgMult()), h.x, h.z, {
          attackerCritChance: 1.0,
          chillDuration: 2.5,
          fxColor: 0x4df0ff
        });
        st.strikesLeft--;
        st.stepTimer = 0.095;
      }
    }
  }

  // 9. Storm Invoker Heavens Wrath sky thunderbolts
  if (h.stormWrathTimer > 0) {
    h.stormWrathTimer = Math.max(0, h.stormWrathTimer - dt);
    h.stormBoltAccum -= dt;
    if (h.stormBoltAccum <= 0) {
      h.stormBoltAccum = 0.42;
      const candidates = game.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 11.5);
      let bx = h.x + (Math.random() - 0.5) * 5.0;
      let bz = h.z + (Math.random() - 0.5) * 5.0;
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        bx = pick.x;
        bz = pick.z;
      }
      game.delayedHazards.push({
        friendly: true,
        lightningSky: true,
        timer: 0.06,
        x: bx,
        z: bz,
        radius: 2.5,
        dmg: Math.round(64 * sc * game.effectiveDmgMult()),
        colorHex: 0x63d8ff,
        stagger: 0.45
      });
      game.coopBroadcastPlayerAction?.({
        act: 'hazard_vfx',
        waves: [{
          timer: 0.06,
          x: +bx.toFixed(2),
          z: +bz.toFixed(2),
          radius: 2.5,
          colorHex: 0x63d8ff,
          lightningSky: true
        }]
      });
    }
  }

  // 11. Abyssal Ooze King Slime 3-bounce Giant Slam
  if (h.slimeJumpState) {
    const sj = h.slimeJumpState;
    sj.phase += dt / sj.dur;
    h.invuln = Math.max(h.invuln, 0.25);
    const t = Math.min(1, sj.phase);
    const nx = sj.startX + (sj.targetX - sj.startX) * t;
    const nz = sj.startZ + (sj.targetZ - sj.startZ) * t;
    const prevX = h.x;
    const prevZ = h.z;
    h.x = nx;
    h.z = nz;
    if (game.dungeon) game.dungeon.resolveMovement(h, prevX, prevZ, 0.48);

    const arcY = Math.sin(t * Math.PI) * 3.1;
    game.heroRig.body.position.y = arcY;
    game.heroRig.torso.scale.setScalar(2.05);

    if (sj.phase >= 1) {
      game.heroRig.body.position.y = 0;
      game.cameraShake = Math.max(game.cameraShake, 0.32);
      game.sfx.slimeBounceImpact(sj.bouncesLeft, { x: h.x, z: h.z });
      game.vfx.spawnRing(h.x, h.z, 3.9, 0.42, 0x42f5b3, true);
      game.vfx.burst(h.x, 0.6, h.z, 0x42f5b3, 30, 6.6, 7.5);
      game.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        x: +h.x.toFixed(2),
        z: +h.z.toFixed(2),
        radius: 3.9,
        dur: 0.42,
        colorHex: 0x42f5b3,
        fill: true,
        burstCount: 28
      });
      let hitCount = 0;
      const slamDmg = Math.round(84 * sc * game.effectiveDmgMult());
      for (const e of [...game.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.9 + e.radius) {
          hitCount++;
          game.damageEnemy(e, slamDmg, h.x, h.z, {
            chillDuration: 2.8,
            fxColor: 0x42f5b3,
            stagger: 0.55
          });
        }
      }
      if (hitCount > 0) {
        h.hp = Math.min(h.maxHp, h.hp + hitCount * 11);
        game.updateHUD();
      }
      sj.bouncesLeft--;
      if (sj.bouncesLeft <= 0) {
        game.heroRig.torso.scale.setScalar(1.0);
        h.slimeJumpState = null;
      } else {
        sj.phase = 0;
        sj.startX = h.x;
        sj.startZ = h.z;
        const near = game.enemies.find((e) => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) < 7.5);
        if (near) {
          const dx = near.x - h.x;
          const dz = near.z - h.z;
          const l = Math.hypot(dx, dz) || 1;
          sj.targetX = h.x + (dx / l) * Math.min(3.4, l);
          sj.targetZ = h.z + (dz / l) * Math.min(3.4, l);
        } else {
          sj.targetX = h.x + Math.sin(h.yaw) * 2.2;
          sj.targetZ = h.z + Math.cos(h.yaw) * 2.2;
        }
      }
    }
  } else if (game.heroRig && game.heroRig.torso.scale.x !== 1) {
    game.heroRig.torso.scale.setScalar(1.0);
  }

  // 5. Tumbling 3D Fate Dice
  for (let i = rt.dice.length - 1; i >= 0; i--) {
    const d = rt.dice[i];
    d.age += dt;
    const p = Math.min(1, d.age / d.dur);
    const x = d.sx + (d.tx - d.sx) * p;
    const z = d.sz + (d.tz - d.sz) * p;
    const y = 0.45 + Math.sin(p * Math.PI) * 2.4;
    d.mesh.position.set(x, y, z);
    d.mesh.rotation.x += dt * 14;
    d.mesh.rotation.y += dt * 11;
    if (p >= 1) {
      game.scene.remove(d.mesh);
      rt.dice.splice(i, 1);
      resolveFateDieRoll(game, d);
    }
  }

  // Ground Zones: Miasma Pools & Chronosphere
  h.inChronosphere = false;
  for (let i = rt.zones.length - 1; i >= 0; i--) {
    const z = rt.zones[i];
    z.life -= dt;
    if (z.life <= 0) {
      game.scene.remove(z.mesh);
      rt.zones.splice(i, 1);
      continue;
    }
    if (z.kind === 'miasma') {
      z.mat.opacity = Math.min(0.32, z.life * 0.15) + Math.sin(game.time * 5.0 + i) * 0.04;
      if (z.visualOnly) continue;
      z.tickAccum -= dt;
      if (z.tickAccum <= 0) {
        z.tickAccum = 0.48;
        const tickDmg = Math.round(26 * sc * game.effectiveDmgMult());
        for (const e of [...game.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - z.x, e.z - z.z) <= z.radius + e.radius) {
            e.miasmaVulnTimer = 0.85;
            e.poisonTimer = Math.max(e.poisonTimer || 0, 3.0);
            e.poisonDps = Math.max(e.poisonDps || 0, Math.round(26 * game.effectiveDmgMult()));
            game.damageEnemy(e, tickDmg, z.x, z.z, {
              allowCrit: false,
              isDot: true,
              isClassProc: true,
              chillDuration: 1.0,
              fxColor: 0x5eff7a
            });
          }
        }
      }
    } else if (z.kind === 'chronosphere') {
      z.chrono.handMin.rotation.y += dt * 4.2;
      z.chrono.handHour.rotation.y += dt * 0.8;
      z.chrono.innerRing.rotation.z -= dt * 1.1;
      if (Math.hypot(h.x - z.x, h.z - z.z) <= z.radius) {
        h.inChronosphere = true;
      }
      if (z.visualOnly) continue;
      // Freeze enemies by rewinding 88% of their movement & attack progress, and vaporize enemy projectiles!
      for (const e of game.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - z.x, e.z - z.z) <= z.radius + e.radius) {
          e.chillTimer = Math.max(e.chillTimer || 0, 0.35);
          e.vx *= 0.2;
          e.vz *= 0.2;
          e.cd = (e.cd || 0) + dt * 0.85;
          if (!e.boss) e.stunTimer = Math.max(e.stunTimer || 0, 0.16);
        }
      }
      for (let pIdx = game.projectiles.length - 1; pIdx >= 0; pIdx--) {
        const p = game.projectiles[pIdx];
        if (!p.friendly && Math.hypot(p.x - z.x, p.z - z.z) <= z.radius) {
          game.vfx.burst(p.x, 0.9, p.z, 0xffd978, 8, 3.0, 4.0);
          if (game.destroyProjectile) game.destroyProjectile(p);
          else game.scene.remove(p.mesh);
          game.projectiles.splice(pIdx, 1);
        }
      }
    }
  }

  // Enemy Poison DoT & Miasma Vulnerability decay
  for (const e of [...game.enemies]) {
    if (!e || e.hp <= 0) continue;
    if (e.miasmaVulnTimer > 0) e.miasmaVulnTimer = Math.max(0, e.miasmaVulnTimer - dt);
    if (e.poisonTimer > 0) {
      e.poisonTimer -= dt;
      e._poisonTick = (e._poisonTick || 0) + dt;
      if (e._poisonTick >= 0.55) {
        e._poisonTick = 0;
        game.damageEnemy(e, Math.max(2, Math.round((e.poisonDps || 14) * 0.55)), e.x, e.z, {
          allowCrit: false,
          isDot: true,
          isClassProc: true,
          fxColor: 0x5eff7a
        });
      }
    }
  }

  // 7. Autonomous Skeletal Wraith Minions AI
  const frenzy = h.necroFrenzyTimer > 0;
  for (let i = rt.minions.length - 1; i >= 0; i--) {
    const m = rt.minions[i];
    if (!m.permanent) {
      m.life -= dt;
      if (m.life <= 0) {
        game.scene.remove(m.rig.root);
        rt.minions.splice(i, 1);
        continue;
      }
    }
    if (m.frenzyTimer > 0) m.frenzyTimer = Math.max(0, m.frenzyTimer - dt);
    const mFrenzy = m.visualOnly ? (m.frenzyTimer > 0) : frenzy;
    m.atkCd = Math.max(0, m.atkCd - dt * (mFrenzy ? 1.9 : 1.0));
    m.rig.root.scale.setScalar(mFrenzy ? 1.22 : 1.0);

    // Pick nearest enemy or orbit hero
    let bestE = null;
    let bestD = 13.0;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - m.x, e.z - m.z);
      if (d < bestD) {
        bestD = d;
        bestE = e;
      }
    }
    if (bestE) {
      const dx = bestE.x - m.x;
      const dz = bestE.z - m.z;
      const dist = Math.hypot(dx, dz) || 1;
      m.yaw = Math.atan2(dx, dz);
      const stopR = 1.15 + (bestE.radius || 0.5);
      if (dist > stopR) {
        const spd = (mFrenzy ? 10.5 : 6.8) * dt;
        m.x += (dx / dist) * spd;
        m.z += (dz / dist) * spd;
      } else if (m.atkCd <= 0) {
        m.atkCd = 0.78;
        m.swingTimer = 0.24;
        if (!m.visualOnly) {
          const wDmg = Math.round((mFrenzy ? 60 : 38) * sc * game.effectiveDmgMult());
          game.damageEnemy(bestE, wDmg, m.x, m.z, {
            allowCrit: false,
            isClassProc: true,
            fxColor: 0x62ffad
          });
        } else {
          game.vfx.burst(bestE.x, 1.0, bestE.z, 0x62ffad, 8, 3.6, 5.0);
        }
        if (mFrenzy) {
          game.vfx.spawnRing(bestE.x, bestE.z, 2.0, 0.26, 0x62ffad, false);
        }
      }
    } else {
      const anchor = (m.visualOnly && m.ownerPeer) ? m.ownerPeer : h;
      const orbitAng = game.time * 1.5 + (i * Math.PI * 2) / Math.max(1, rt.minions.length);
      const tx = anchor.x + Math.cos(orbitAng) * 1.75;
      const tz = anchor.z + Math.sin(orbitAng) * 1.75;
      m.x += (tx - m.x) * Math.min(1, dt * 6.5);
      m.z += (tz - m.z) * Math.min(1, dt * 6.5);
      m.yaw = orbitAng + Math.PI * 0.5;
    }
    if (m.swingTimer > 0) {
      m.swingTimer = Math.max(0, m.swingTimer - dt);
      m.rig.armPivot.rotation.x = Math.sin((m.swingTimer / 0.24) * Math.PI) * 1.35;
    } else {
      m.rig.armPivot.rotation.x = 0;
    }
    m.rig.root.position.set(m.x, Math.sin(game.time * 4.2 + i) * 0.08, m.z);
    m.rig.root.rotation.y = m.yaw;
  }

  // 10. Twin-Barrel Brass Autoturrets AI
  for (let i = rt.turrets.length - 1; i >= 0; i--) {
    const tur = rt.turrets[i];
    tur.life -= dt;
    if (tur.life <= 0) {
      rt.turrets.splice(i, 1);
      game.sfx.turretDetonate({ x: tur.x, z: tur.z });
      detonateTurret(game, tur);
      continue;
    }
    tur.recoil = Math.max(0, tur.recoil - dt * 6.0);
    tur.rig.barrelGroup.position.z = -tur.recoil * 0.14;
    tur.fireCd -= dt;

    let target = null;
    let bestD = 13.5;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - tur.x, e.z - tur.z);
      if (d < bestD) {
        bestD = d;
        target = e;
      }
    }
    if (target) {
      const tyaw = Math.atan2(target.x - tur.x, target.z - tur.z);
      const diff = Math.atan2(Math.sin(tyaw - tur.yaw), Math.cos(tyaw - tur.yaw));
      tur.yaw += diff * Math.min(1, dt * 12.0);
      tur.rig.headPivot.rotation.y = tur.yaw;
      if (tur.fireCd <= 0) {
        tur.fireCd = 0.36;
        tur.shotCount++;
        tur.recoil = 1.0;
        const isGrenadeShot = tur.shotCount % 5 === 0;
        game.sfx.brassTurretShot(isGrenadeShot, { x: tur.x, z: tur.z });
        if (!tur.visualOnly) {
          const isGrenade = isGrenadeShot;
          game.spawnPlayerProjectile({
            kind: isGrenade ? 'cannon_shell' : 'bolt',
            x: tur.x + Math.sin(tur.yaw) * 0.72,
            z: tur.z + Math.cos(tur.yaw) * 0.72,
            yaw: tur.yaw,
            speed: isGrenade ? 18.0 : 23.0,
            life: 0.78,
            dmg: Math.round((isGrenade ? 72 : 30) * sc * game.effectiveDmgMult()),
            colorHex: isGrenade ? 0xff6238 : 0xffbe55,
            splashRadius: isGrenade ? 2.6 : 0,
            pierce: isGrenade ? 1 : 2,
            radius: isGrenade ? 0.30 : 0.20
          });
        }
      }
    } else {
      tur.yaw += dt * 0.9;
      tur.rig.headPivot.rotation.y = tur.yaw;
    }
  }

  // 11. Explosive Bouncing Slimelings AI
  for (let i = rt.slimelings.length - 1; i >= 0; i--) {
    const sl = rt.slimelings[i];
    sl.life -= dt;
    if (sl.life <= 0) {
      game.scene.remove(sl.rig.root);
      rt.slimelings.splice(i, 1);
      continue;
    }
    let near = null;
    let bestD = 12.0;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - sl.x, e.z - sl.z);
      if (d < bestD) {
        bestD = d;
        near = e;
      }
    }
    if (near) {
      const dx = near.x - sl.x;
      const dz = near.z - sl.z;
      const d = Math.hypot(dx, dz) || 1;
      sl.x += (dx / d) * 7.8 * dt;
      sl.z += (dz / d) * 7.8 * dt;
      if (d <= 0.85 + (near.radius || 0.5)) {
        game.sfx.slimelingPop({ x: sl.x, z: sl.z });
        game.vfx.burst(sl.x, 0.5, sl.z, 0x42f5b3, 18, 4.8, 5.5);
        game.vfx.spawnRing(sl.x, sl.z, 2.2, 0.30, 0x42f5b3, false);
        if (!sl.visualOnly) {
          for (const foe of [...game.enemies]) {
            if (foe.hp > 0 && Math.hypot(foe.x - sl.x, foe.z - sl.z) <= 2.2 + foe.radius) {
              game.damageEnemy(foe, Math.round(52 * sc * game.effectiveDmgMult()), sl.x, sl.z, {
                allowCrit: false,
                isClassProc: true,
                chillDuration: 2.0,
                fxColor: 0x42f5b3
              });
            }
          }
        }
        game.scene.remove(sl.rig.root);
        rt.slimelings.splice(i, 1);
        continue;
      }
    }
    const hop = Math.abs(Math.sin(game.time * 8.5 + sl.phase));
    sl.rig.root.position.set(sl.x, hop * 0.42, sl.z);
    sl.rig.blob.scale.set(1 + (0.5 - hop) * 0.25, 0.85 + hop * 0.3, 1 + (0.5 - hop) * 0.25);
  }

  // 4. Shadow Decoys Taunt & Expiry Burst
  for (let i = rt.decoys.length - 1; i >= 0; i--) {
    const dc = rt.decoys[i];
    dc.life -= dt;
    // Gently pull enemy aggro nearby
    if (!dc.visualOnly) {
      for (const e of game.enemies) {
        if (e.hp > 0 && !e.boss && Math.hypot(e.x - dc.x, e.z - dc.z) < 6.5) {
          const dx = dc.x - e.x;
          const dz = dc.z - e.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d > 1.1) {
            e.x += (dx / d) * 2.2 * dt;
            e.z += (dz / d) * 2.2 * dt;
          }
        }
      }
    }
    if (dc.life <= 0) {
      game.sfx.shadowDecoyBurst({ x: dc.x, z: dc.z });
      game.vfx.burst(dc.x, 1.0, dc.z, 0x4df0ff, 20, 5.2, 5.5);
      game.vfx.spawnRing(dc.x, dc.z, 2.6, 0.34, 0x4df0ff, false);
      if (!dc.visualOnly) {
        for (const e of [...game.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - dc.x, e.z - dc.z) <= 2.6 + e.radius) {
            game.damageEnemy(e, Math.round(56 * sc * game.effectiveDmgMult()), dc.x, dc.z, {
              allowCrit: false,
              isClassProc: true,
              chillDuration: 1.8,
              fxColor: 0x4df0ff
            });
          }
        }
      }
      game.scene.remove(dc.rig.root);
      rt.decoys.splice(i, 1);
    }
  }
}

export function updateClassHUD(game) {
  const h = game.hero;
  if (!h) return;
  const cls = getHeroClass(h.classId || game.selectedClassId);
  const ct = getClassText(cls);
  const zh = getLang() === 'zh';

  // Top-left / Vitality Class Pill
  const clsPill = document.getElementById('hero-class-pill');
  if (clsPill) {
    clsPill.textContent = `${ct.catIcon} ${ct.name}`;
    clsPill.style.color = cls.accent;
    clsPill.style.borderColor = `${cls.accent}66`;
  }

  // Shield Bar inside Vitality Cluster
  const shRow = document.getElementById('shield-row');
  const shFrame = document.getElementById('shield-frame');
  if (shRow && shFrame) {
    if (h.maxShield > 0) {
      shRow.classList.remove('hidden');
      shFrame.classList.remove('hidden');
      const shLabel = document.getElementById('shield-label');
      if (shLabel) {
        shLabel.innerHTML = UI_SVG.aegis;
        shLabel.title = zh ? '护盾' : 'SHIELD';
      }
      const shText = document.getElementById('shield-text');
      if (shText) shText.textContent = `${Math.max(0, Math.ceil(h.shield))} / ${h.maxShield}`;
      const shFill = document.getElementById('shield-fill');
      if (shFill) shFill.style.width = `${Math.max(0, Math.min(100, (h.shield / h.maxShield) * 100))}%`;
    } else {
      shRow.classList.add('hidden');
      shFrame.classList.add('hidden');
    }
  }

  // Astral Aether Bar right below HP inside Vitality Cluster
  const enRow = document.getElementById('energy-row');
  const enFrame = document.getElementById('energy-frame');
  if (enRow && enFrame) {
    const maxEn = Math.max(1, h.maxEnergy || 200);
    const curEn = Math.max(0, Math.min(maxEn, h.energy ?? maxEn));
    const enLabel = document.getElementById('energy-label');
    if (enLabel) {
      enLabel.innerHTML = UI_SVG.energy;
      enLabel.title = zh ? '星魄灵能（远程消耗）' : 'ASTRAL AETHER';
    }
    const enText = document.getElementById('energy-text');
    if (enText) enText.textContent = `${Math.floor(curEn)} / ${maxEn}`;
    const enFill = document.getElementById('energy-fill');
    if (enFill) enFill.style.width = `${Math.max(0, Math.min(100, (curEn / maxEn) * 100))}%`;
    enFrame.classList.toggle('low-energy', curEn < Math.max(12, maxEn * 0.18));
  }

  // Independent Active Skill Slot [X]
  const slotUlt = document.getElementById('slot-ult');
  if (slotUlt) {
    slotUlt.style.setProperty('--ult-accent', cls.accent);
  }
  const ultTitle = document.getElementById('slot-ult-title');
  if (ultTitle) {
    ultTitle.textContent = ct.activeShort;
  }
}
