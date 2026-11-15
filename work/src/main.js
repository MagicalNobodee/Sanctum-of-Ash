import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { buildAllTextures } from './textures.js';
import {
  buildBiomeDungeonWorld,
  drawBiomeMinimap,
  isInsideDoorKeepOut,
  DIR_BY_KEY,
  createSeededRng,
  BIOME_BY_ID,
  pickBiomeForFloor,
  generateRandomDungeonGraph,
  serializeDungeonBlueprint,
  deserializeDungeonBlueprint
} from './biomes/index.js';
import { createMaterials, createHeroRig, createEnemyRig, resetEnemyRig, VFXSystem } from './actors.js';
import { SoundEngine } from './audio.js';
import { pickThreeBoons, glyphSvg } from './roguelike.js';
import {
  FLOOR_CONFIGS,
  MAX_FLOORS,
  DIFFICULTY_TIERS,
  DEFAULT_DIFFICULTY_ID,
  getDifficultyConfig,
  BIOME_BOSS_NAMES,
  ELITE_AFFIXES,
  rollEnemyAffixes,
  createDescentPortal,
  createExplorationCurio
} from './floors.js';
import {
  WEAPON_DEFS,
  WEAPON_LIST,
  WEAPON_RARITIES,
  RARITY_ORDER,
  rollWeaponInstance,
  pickRandomWeaponDrop,
  pickBossMythicDrop,
  temperWeaponInstance,
  findNearestEnemyToCursor,
  buildWeaponVisuals,
  createLockReticle,
  createWeaponPedestal,
  getMeleeStepSpec
} from './weapons.js';
import {
  getLang,
  setLang,
  toggleLang,
  tUI,
  ELEMENT_I18N,
  WEAPON_RARITY_I18N,
  IMPACT_I18N,
  WEAPON_I18N,
  getEnemyName,
  getBiomeText,
  getRoomText,
  getBossName,
  getWeaponText,
  getBoonText,
  getRarityLabel,
  describeInteractable
} from './i18n.js';
import {
  getPlayerTheme,
  getMultiplayerScaling,
  createDownedBeacon,
  serializeWeaponInst,
  deserializeWeaponInst
} from './multiplayer.js';
import {
  initCoopSystem,
  START_SLOT_OFFSETS,
  updateCoopHudWidgets,
  checkCoopPartyWipe
} from './coop_controller.js';
import { HERO_CLASSES, DEFAULT_CLASS_ID } from './classes.js';
import {
  initClassSystem,
  renderClassPreviewFrame,
  selectHeroClass,
  renderClassSelectionUI,
  applyClassStatsToHero,
  clearClassEntities,
  isHeroTrapImmune,
  getClassBonusDmgMult,
  getClassEffectiveAtkSpeed,
  getClassBonusMoveMult,
  getClassBonusCritChance,
  handleClassHeroDamage,
  onClassEnemyDamaged,
  onClassEnemyKilled,
  onClassDash,
  onClassWeaponSkill,
  onClassPropBroken,
  onClassCinderPickup,
  tryHeroActiveSkill,
  updateClassSystems,
  updateClassHUD
} from './class_abilities.js';
import {
  WeaponPreviewStudio,
  UI_SVG,
  getElementBadgeInfo,
  romanTierMark,
  impactNumScore
} from './weapon_preview.js';

const AFFIX_BY_ID = Object.fromEntries(ELITE_AFFIXES.map((a) => [a.id, a]));

const CinematicLensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTrauma: { value: 0.0 },
    uVignette: { value: 0.36 },
    uTime: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTrauma;
    uniform float uVignette;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      float ca = (0.0010 + uTrauma * 0.009) * smoothstep(0.14, 0.72, dist);
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);

      float r = texture2D(tDiffuse, vUv + dir * ca).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * ca).b;
      vec3 col = vec3(r, g, b);

      col = mix(col, smoothstep(0.0, 1.0, col), 0.08);

      float vig = smoothstep(0.90, 0.24, dist * (0.86 + uVignette * 0.52));
      col *= mix(0.48, 1.05, vig);

      float grain = fract(sin(dot(vUv * vec2(1298.98, 7823.3) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.0055;

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `
};

const SETTINGS_STORAGE_KEY = 'sanctum_of_ash_settings';

class SanctumGame {
  constructor() {
    setLang(getLang());
    window.__SANCTUM__ = this;
    this.bootComplete = false;
    this.titleStage = 'landing';
    this.showcaseShots = [];
    this.showcaseShotIdx = 0;
    this.showcaseShotTimer = 0;
    this._showcaseFocus = { x: 0, z: 0 };

    this.canvas = document.getElementById('game-canvas');
    this.dmgLayer = document.getElementById('dmg-layer');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapHdCanvas = document.getElementById('minimap-hd-canvas');
    this.minimapHdCtx = this.minimapHdCanvas ? this.minimapHdCanvas.getContext('2d') : null;
    this.interactEl = document.getElementById('interact-prompt');
    this.worldPinEl = document.getElementById('world-interact-pin');
    this.worldPinLabelEl = document.getElementById('world-pin-label');
    this.sfx = new SoundEngine();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    this.localThemeIdx = 0;
    this.enemySeq = 1;
    this.floorIndex = 0;
    this.floorConfigs = FLOOR_CONFIGS;
    this.floorCfg = FLOOR_CONFIGS[0];
    this.usedBiomeIds = new Set();
    this.lastVariantByDepth = {};
    this.nextFloorBiome = null;

    this.quality = 'ultra';
    this.mapVisible = true;
    this.selectedDifficultyId = DEFAULT_DIFFICULTY_ID;
    this.settings = {
      screenShake: 'full',
      damageNumbers: true,
      autoPauseBlur: true,
      mapExpanded: false
    };
    this.loadUserSettings();

    this.mode = 'boot';
    this.time = 0;
    this.hitStop = 0;
    this.cameraShake = 0;
    this.lensTrauma = 0;

    this.keys = {};
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.aimWorld = new THREE.Vector3(0, 0, -4);
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
    this.mouseDownL = false;
    this.mouseDownR = false;
    this.inputBuffer = null;
    this._lastRejectFeedbackMs = 0;
    this._pauseAutoTriggered = false;

    this.enemies = [];
    this.projectiles = [];
    this.cinderOrbs = [];
    this.enemyRigPool = new Map();
    this.sharedEnemyFxGeos = new Map();
    this.orbSpritePool = [];
    this._cinderOrbMat = null;
    this._vitalityOrbMat = null;
    this._energyOrbMat = null;
    this._projGeoCache = new Map();
    this.lightningLines = [];
    this.delayedHazards = [];
    this.summons = [];
    this.acidPools = [];
    this.orbitalBlades = [];
    this.prismHeat = 0;
    this.prismHeatDecay = 0;
    this.compendiumFilter = 'all';
    this._compendiumOpen = false;
    this.floorObjects = [];
    this.descentPortal = null;
    this.lockedEnemy = null;
    this.pinnedEnemy = null;
    this.pendingWeaponPedestal = null;
    this.pendingBoonQueue = [];
    this.floorMasteryGranted = false;
    this.totalRoomsExplored = 0;
    this.floorsCleared = 0;

    this.takenBoons = new Set();
    this.acquiredBoons = [];
    this.currentBoons = [];
    this.boonRerollCount = 0;
    this.combatRoomsClearedForFlask = 0;
    this._lastBoonKickerSpec = null;
    this._lastRunVictory = false;
    this._floatRecentBuckets = [];
    this._interactRenderSig = '';
    this.kills = 0;
    this.runTime = 0;
    this.activeInteractable = null;

    this.lastNow = performance.now();
    this.fpsFrames = 0;
    this.fpsAccum = 0;
    this.fps = 60;
    this.frameTimeMs = 16.7;

    this.animate = this.animate.bind(this);
    this.bootPromise = this.runStagedBoot();
  }

  setBootProgress(pct, stageIdx = 0) {
    const ui = tUI();
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const fill = document.getElementById('boot-bar-fill');
    if (fill) fill.style.width = `${clamped}%`;
    const pctEl = document.getElementById('boot-pct');
    if (pctEl) pctEl.textContent = `${clamped}%`;
    const stageEl = document.getElementById('boot-stage');
    if (stageEl && Array.isArray(ui.bootStages)) {
      stageEl.textContent = ui.bootStages[Math.min(ui.bootStages.length - 1, stageIdx)] || '';
    }
    const bootTitle = document.getElementById('boot-title');
    if (bootTitle) bootTitle.textContent = ui.titleMain;
  }

  async yieldBootPaint() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 16));
    });
  }

  async runStagedBoot() {
    this.setBootProgress(12, 0);
    await this.yieldBootPaint();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a12);
    this.scene.fog = new THREE.FogExp2(0x080d18, 0.019);

    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.5, 118);
    this.camera.position.set(0, 14.5, 13.5);
    this.camera.lookAt(0, 0.8, 0);
    this.setupLighting();

    this.setBootProgress(36, 1);
    await this.yieldBootPaint();

    this.tex = buildAllTextures(this.renderer);
    this.scene.environment = this.tex.envMap;
    this.mats = createMaterials(this.tex);

    this.heroRig = createHeroRig(this.mats, getPlayerTheme(0));
    this.localDownedBeacon = createDownedBeacon(this.tex, getPlayerTheme(0).accentHex);
    this.heroRig.root.add(this.localDownedBeacon.root);
    this.scene.add(this.heroRig.root);

    this.lockReticle = createLockReticle(this.tex);
    this.scene.add(this.lockReticle.root);
    this.vfx = new VFXSystem(this.scene, this.tex);

    this.setupPostProcessing();
    this.setQuality(this.quality, false);
    try {
      const qParam = new URLSearchParams(window.location.search || '').get('gfx');
      if (qParam === 'high') this.setQuality('high', false);
    } catch (_) {}

    this.setBootProgress(64, 2);
    await this.yieldBootPaint();

    initCoopSystem(this);
    initClassSystem(this);
    this.selectClass = (id) => selectHeroClass(this, id);
    this.tryClassSkill = (fromBuf = false) => tryHeroActiveSkill(this, fromBuf);
    this.resetHeroStats();
    this.buildFloorWorld(0, { initialTitle: true, biomeId: 'sunken_cathedral' });
    this.buildTitleShowcaseShots();

    this.setBootProgress(86, 3);
    await this.yieldBootPaint();

    this.weaponStudio = new WeaponPreviewStudio(this);
    const modalNewCanvas = document.getElementById('wpn-modal-new-canvas');
    if (modalNewCanvas) this.weaponStudio.bindInteractiveCanvas(modalNewCanvas);
    this.weaponStudio.warmInitialWeapons();
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (_) {}

    this.setBootProgress(96, 4);
    await this.yieldBootPaint();

    this.time = 0.25;
    this.updateTitleShowcaseCamera(0.016, true);
    if (this.dungeon) {
      this.dungeon.update(this.time, 0.016, this._showcaseFocus.x, this._showcaseFocus.z, 0);
      if (this.quality === 'ultra' && this.dungeon.renderPlanarReflection) {
        this.dungeon.renderPlanarReflection(this.renderer, this.camera);
      }
    }
    this.composer.render();
    try {
      this.renderer.getContext()?.finish?.();
    } catch (_) {}

    this.setBootProgress(100, 4);
    await this.yieldBootPaint();

    this.mode = 'title';
    this.bootComplete = true;
    this.applyMinimapLayout(false);
    this.bindEvents();
    this.setTitleStage('landing');
    this.applyLanguageUI();
    document.getElementById('title-overlay')?.classList.remove('hidden');
    this.syncPauseButtonVisibility();
    this.coopCheckUrlRoom();

    const bootEl = document.getElementById('boot-screen');
    if (bootEl) bootEl.classList.add('boot-done');
    this.lastNow = performance.now();
    requestAnimationFrame(this.animate);
  }

  setTitleStage(stage = 'landing') {
    this.titleStage = (stage === 'hub' || stage === 'char-select') ? stage : 'landing';
    const titleOv = document.getElementById('title-overlay');
    if (titleOv) titleOv.setAttribute('data-stage', this.titleStage);
    this.syncPauseButtonVisibility();
    if (this.titleStage === 'char-select') {
      renderClassSelectionUI(this);
      this.renderCharSelectMetaUI();
    }
  }

  openSoloCharSelect() {
    this.sfx.init();
    this.sfx.uiToggle(true);
    if (this.lan && this.lan.inRoom) {
      this.coopDisconnectRoom?.();
    }
    this.charSelectContext = 'solo';
    const initialId = this.selectedClassId || DEFAULT_CLASS_ID;
    this.browsedClassId = initialId;
    selectHeroClass(this, initialId, false, { silentNet: true });
    this.setTitleStage('char-select');
  }

  confirmCharSelect() {
    this.sfx.init();
    if (this.isCoopCharSelectActive && this.isCoopCharSelectActive()) {
      this.coopConfirmCharSelect?.();
      return;
    }
    this.sfx.uiRunStart();
    const finalId = this.selectedClassId || DEFAULT_CLASS_ID;
    selectHeroClass(this, finalId, true, { silentNet: true });
    this.startRun(false, true);
  }

  backFromCharSelect() {
    this.sfx.init();
    if (this.isCoopCharSelectActive && this.isCoopCharSelectActive()) {
      this.coopBackFromCharSelect?.();
      return;
    }
    this.sfx.uiBack();
    this.setTitleStage('hub');
  }

  renderCharSelectMetaUI() {
    if (this.isCoopCharSelectActive && this.isCoopCharSelectActive()) {
      this.coopRenderCharSelectMeta?.();
      return;
    }
    const ui = tUI();
    document.getElementById('char-timer-box')?.classList.add('hidden');
    document.getElementById('char-party-strip')?.classList.add('hidden');
    document.getElementById('solo-diff-section')?.classList.remove('hidden');
    document.getElementById('btn-char-unlock')?.classList.add('hidden');
    document.getElementById('class-select-hub')?.classList.remove('is-locked');
    this.renderHubDifficultyUI();
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setTxt('char-select-kicker', ui.charSoloKicker || '');
    setTxt('char-select-title', ui.charSoloTitle || '');
    setTxt('btn-char-back', ui.charBackHub || '');
    setTxt('char-rule-hint', ui.charRuleSolo || '');
    const confirmBtn = document.getElementById('btn-char-confirm');
    if (confirmBtn) {
      confirmBtn.classList.remove('coop-btn');
      confirmBtn.disabled = false;
      confirmBtn.textContent = ui.charConfirmSolo || ui.btnStart;
    }
  }

  buildTitleShowcaseShots() {
    if (!this.dungeon || !this.dungeon.rooms || this.dungeon.rooms.length === 0) {
      this.showcaseShots = [];
      return;
    }
    const rooms = this.dungeon.rooms;
    const startRoom = rooms.find((r) => r.type === 'start') || rooms[0];
    const pedInter = this.dungeon.interactables.find((it) => it.kind === 'weapon_pedestal');
    const vaultOrSanctuary = rooms.find((r) => r.type === 'vault' || r.type === 'sanctuary') || rooms[Math.min(1, rooms.length - 1)];
    const trialInter = this.dungeon.interactables.find((it) => it.kind === 'trial_obelisk');
    const combatRoom = (trialInter && trialInter.room) || rooms.find((r) => r.type === 'combat') || startRoom;
    const bossRoom = rooms.find((r) => r.type === 'boss') || rooms[rooms.length - 1];

    const heroMidX = pedInter ? (this.hero.x * 0.58 + pedInter.x * 0.42) : this.hero.x;
    const heroMidZ = pedInter ? (this.hero.z * 0.58 + pedInter.z * 0.42) : this.hero.z;
    const safeRad = (room, pref) => Math.max(4.6, Math.min(pref, Math.min(room.halfW, room.halfD) - 1.75));

    this.showcaseShots = [
      {
        room: startRoom,
        cx: heroMidX,
        cz: heroMidZ,
        radius: safeRad(startRoom, 6.2),
        height: 5.8,
        baseYaw: 0.22,
        sweep: 0.30,
        leftFramingBias: 1.45
      },
      {
        room: vaultOrSanctuary,
        cx: vaultOrSanctuary.cx,
        cz: vaultOrSanctuary.cz,
        radius: safeRad(vaultOrSanctuary, 7.2),
        height: 6.8,
        baseYaw: -0.28,
        sweep: 0.34,
        leftFramingBias: 1.75
      },
      {
        room: combatRoom,
        cx: trialInter ? trialInter.x : combatRoom.cx,
        cz: trialInter ? trialInter.z : combatRoom.cz,
        radius: safeRad(combatRoom, 7.8),
        height: 7.2,
        baseYaw: 0.32,
        sweep: -0.34,
        leftFramingBias: 1.9
      },
      {
        room: bossRoom,
        cx: bossRoom.cx,
        cz: bossRoom.cz,
        radius: safeRad(bossRoom, 10.8),
        height: 9.6,
        baseYaw: -0.18,
        sweep: 0.38,
        leftFramingBias: 2.3
      }
    ];
    this.showcaseShotIdx = 0;
    this.showcaseShotTimer = 0;
    this.updateShowcaseBadgeUI();
  }

  selectShowcaseShot(idx) {
    if (!this.showcaseShots.length) return;
    this.showcaseShotIdx = ((idx % this.showcaseShots.length) + this.showcaseShots.length) % this.showcaseShots.length;
    this.showcaseShotTimer = 0;
    this.updateShowcaseBadgeUI();
  }

  rerollLandingShowcaseBiome() {
    if (this.mode !== 'title') return;
    this.sfx.init();
    this.sfx.uiClick?.();
    const nextDepth = ((this.showcaseBiomeCycle || 0) % 4);
    this.showcaseBiomeCycle = (this.showcaseBiomeCycle || 0) + 1;
    this.buildFloorWorld(nextDepth, { initialTitle: true });
    this.floorIndex = 0;
    this.floorCfg = FLOOR_CONFIGS[0];
    this.buildTitleShowcaseShots();
  }

  updateShowcaseBadgeUI() {
    const shot = this.showcaseShots[this.showcaseShotIdx];
    const lbl = document.getElementById('landing-cam-label');
    if (lbl && this.dungeon && shot) {
      const bName = getBiomeText(this.dungeon.biome).name;
      const rName = getRoomText(shot.room).title;
      lbl.textContent = tUI().landingCamLabel(bName, rName);
    }
    document.querySelectorAll('#landing-cam-dots .cam-shot-dot').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === this.showcaseShotIdx);
    });
  }

  updateTitleShowcaseCamera(rawDt, snapImmediate = false) {
    if (!this.showcaseShots || this.showcaseShots.length === 0) {
      this.buildTitleShowcaseShots();
    }
    if (!this.showcaseShots.length) return;

    const shotDuration = 9.5;
    if (this.titleStage === 'landing' && !snapImmediate) {
      this.showcaseShotTimer += rawDt;
      if (this.showcaseShotTimer >= shotDuration) {
        this.showcaseShotTimer = 0;
        this.showcaseShotIdx = (this.showcaseShotIdx + 1) % this.showcaseShots.length;
        this.updateShowcaseBadgeUI();
      }
    }

    const shot = (this.titleStage === 'hub' || this.titleStage === 'char-select')
      ? this.showcaseShots[0]
      : (this.showcaseShots[this.showcaseShotIdx] || this.showcaseShots[0]);
    const u = Math.min(1, this.showcaseShotTimer / shotDuration);
    const smoothU = u * u * (3 - 2 * u);
    const ang = shot.baseYaw + (smoothU - 0.5) * shot.sweep + Math.sin(this.time * 0.25) * 0.06;
    const biasX = this.titleStage === 'landing' ? -shot.leftFramingBias : 0;

    const desiredCamX = shot.cx + Math.sin(ang) * shot.radius + biasX * 0.45;
    const desiredCamY = shot.height + Math.sin(this.time * 0.35) * 0.22;
    const desiredCamZ = shot.cz + Math.cos(ang) * shot.radius;
    const lookX = shot.cx + biasX;
    const lookZ = shot.cz - 0.6;

    if (snapImmediate || Math.hypot(desiredCamX - this.camera.position.x, desiredCamZ - this.camera.position.z) > 16) {
      this.camera.position.set(desiredCamX, desiredCamY, desiredCamZ);
      this._showcaseLookX = lookX;
      this._showcaseLookZ = lookZ;
    } else {
      const k = Math.min(1, rawDt * 2.4);
      this.camera.position.x += (desiredCamX - this.camera.position.x) * k;
      this.camera.position.y += (desiredCamY - this.camera.position.y) * k;
      this.camera.position.z += (desiredCamZ - this.camera.position.z) * k;
      this._showcaseLookX = (this._showcaseLookX ?? lookX) + (lookX - (this._showcaseLookX ?? lookX)) * k;
      this._showcaseLookZ = (this._showcaseLookZ ?? lookZ) + (lookZ - (this._showcaseLookZ ?? lookZ)) * k;
    }
    this._showcaseFocus.x = shot.cx;
    this._showcaseFocus.z = shot.cz;
    this.camera.lookAt(this._showcaseLookX ?? lookX, 1.15, this._showcaseLookZ ?? lookZ);
  }

  setupLighting() {
    this.moonLight = new THREE.DirectionalLight(0xa4c6ff, 3.6);
    this.moonLight.position.set(-13, 24, -11);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.camera.near = 4;
    this.moonLight.shadow.camera.far = 56;
    const d = 19.5;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.moonLight.shadow.bias = -0.0005;
    this.moonLight.shadow.normalBias = 0.025;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    this.warmFill = new THREE.DirectionalLight(0xff8c42, 0.88);
    this.warmFill.position.set(10, 7, 12);
    this.scene.add(this.warmFill);

    this.hemiLight = new THREE.HemisphereLight(0x5274ab, 0x26170c, 1.02);
    this.scene.add(this.hemiLight);
  }

  setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.gtaoPass = new GTAOPass(
      this.scene,
      this.camera,
      Math.round(this.width * 0.5),
      Math.round(this.height * 0.5)
    );
    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
    this.gtaoPass.blendIntensity = 0.68;
    this.gtaoPass.updateGtaoMaterial({
      radius: 0.38,
      distanceExponent: 1.5,
      thickness: 0.85,
      scale: 0.92,
      samples: 8,
      distanceFallOff: 1.0,
      screenSpaceRadius: false
    });
    this.gtaoPass._overrideVisibility = function () {
      const scene = this.scene;
      const cache = this._visibilityCache;
      scene.traverseVisible(function (object) {
        if (object === scene) return;
        if (object.isPoints || object.isLine || object.isLine2 || object.isSprite || object.userData.ignoreAO) {
          object.visible = false;
          cache.push(object);
          return;
        }
        const mat = object.material;
        if (!mat) return;
        if (Array.isArray(mat)) {
          for (let i = 0; i < mat.length; i++) {
            const m = mat[i];
            if (m && (m.transparent || m.depthWrite === false || m.blending !== THREE.NormalBlending)) {
              object.visible = false;
              cache.push(object);
              return;
            }
          }
        } else {
          if (mat._aoSkip === undefined) {
            mat._aoSkip = !!(mat.transparent || mat.depthWrite === false || mat.blending !== THREE.NormalBlending);
          }
          if (mat._aoSkip) {
            object.visible = false;
            cache.push(object);
          }
        }
      });
    };
    this.composer.addPass(this.gtaoPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.32,
      0.52,
      0.95
    );
    this.composer.addPass(this.bloomPass);

    this.lensPass = new ShaderPass(CinematicLensShader);
    this.composer.addPass(this.lensPass);

    this.smaaPass = new SMAAPass();
    this.composer.addPass(this.smaaPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  loadUserSettings() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.quality === 'high' || parsed.quality === 'ultra') this.quality = parsed.quality;
      if (typeof parsed.mapVisible === 'boolean') this.mapVisible = parsed.mapVisible;
      if (parsed.screenShake === 'full' || parsed.screenShake === 'soft' || parsed.screenShake === 'off') {
        this.settings.screenShake = parsed.screenShake;
      }
      if (typeof parsed.damageNumbers === 'boolean') this.settings.damageNumbers = parsed.damageNumbers;
      if (typeof parsed.autoPauseBlur === 'boolean') this.settings.autoPauseBlur = parsed.autoPauseBlur;
      if (typeof parsed.mapExpanded === 'boolean') this.settings.mapExpanded = parsed.mapExpanded;
      if (parsed.difficultyId && DIFFICULTY_TIERS.some((d) => d.id === parsed.difficultyId)) {
        this.selectedDifficultyId = parsed.difficultyId;
      }
    } catch (_) {}
  }

  saveUserSettings() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          quality: this.quality,
          mapVisible: this.mapVisible,
          difficultyId: this.selectedDifficultyId,
          ...this.settings
        }));
      }
    } catch (_) {}
  }

  setDifficulty(diffId, persist = true) {
    const cfg = getDifficultyConfig(diffId);
    this.selectedDifficultyId = cfg.id;
    if (persist) this.saveUserSettings();
    this.renderHubDifficultyUI();
    if (this.hero) this.updateHUD();
  }

  renderHubDifficultyUI() {
    const zh = getLang() === 'zh';
    const ui = tUI();
    const cur = getDifficultyConfig(this.selectedDifficultyId);
    const lbl = document.getElementById('hub-diff-label');
    if (lbl && ui.diffLabel) lbl.textContent = ui.diffLabel;
    const wrap = document.getElementById('hub-diff-picker');
    if (wrap) {
      wrap.innerHTML = DIFFICULTY_TIERS.map((d) => {
        const active = d.id === cur.id;
        const name = zh ? d.zhName : d.enName;
        const badge = zh ? d.zhBadge : d.enBadge;
        return `<button type="button" class="diff-pill-btn ${active ? 'active' : ''}" data-diff-id="${d.id}" style="--diff-col:${d.accent}"><span>${name}</span><em>${badge}</em></button>`;
      }).join('');
    }
    const descEl = document.getElementById('hub-diff-desc');
    if (descEl) {
      const sc = getMultiplayerScaling(1, cur.id);
      descEl.textContent = ui.soloScalePreview ? ui.soloScalePreview(sc) : ui.lanScalePreview(sc);
      descEl.style.color = '';
    }
  }

  getShakeScale() {
    if (this.settings.screenShake === 'off') return 0;
    if (this.settings.screenShake === 'soft') return 0.42;
    return 1.0;
  }

  syncPauseButtonVisibility() {
    if (!this.bootComplete) {
      document.body.dataset.uiStage = 'boot';
    } else if (this.mode === 'title') {
      document.body.dataset.uiStage = this.titleStage || 'landing';
    } else {
      document.body.dataset.uiStage = this.mode || 'explore';
    }
  }

  setQuality(q, persist = true) {
    this.quality = q;
    const ultra = q === 'ultra';
    this.gtaoPass.enabled = ultra;
    this.smaaPass.enabled = ultra;
    if (persist) this.saveUserSettings();
    if (this.mode === 'paused') this.renderPauseMenu();
  }

  resetHeroStats() {
    const slot0 = rollWeaponInstance('greatsword', 1, false);
    const slot1 = rollWeaponInstance('crossbow', 1, false);
    this.hero = {
      x: 0,
      z: 2.2,
      vx: 0,
      vz: 0,
      yaw: Math.PI,
      hp: 135,
      maxHp: 135,
      energy: 200,
      maxEnergy: 200,
      energyGainMult: 1.0,
      energyOnKill: 0,
      freeShotChance: 0,
      energyCritIcd: 0,
      flasks: 2,
      maxFlasks: 4,
      cinders: 0,
      cinderGainMult: 1.0,
      cinderScaling: false,
      trapImmune: false,
      moveSpeed: 6.9,
      atkSpeed: 1.0,
      dmgMult: 1.0,
      rangedDmgMult: 1.0,
      shieldBreakMult: 1.0,
      bonusPierce: 0,
      bonusProjectiles: 0,
      critChance: 0.14,
      critMult: 1.75,
      reachMult: 1.0,
      dashCd: 0,
      dashCdMult: 1.0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirZ: -1,
      invuln: 0,
      arcCd: 0,
      arcCdMax: 3.0,
      arcCdMult: 1.0,
      arcProjectiles: 1,
      comboStep: 0,
      comboWindow: 0,
      rangedShotCounter: 0,
      rangedCooldown: 0,
      rangedAnimTimer: 0,
      atkState: null,
      burnDps: 0,
      chainLightning: 0,
      vampKill: 0,
      vampCrit: 0,
      vampCritIcd: 0,
      flaskHealBonus: 0,
      elixirStacks: 0,
      boonChillDur: 0,
      chilledDmgBonus: 0,
      boonStacks: {},
      dashNova: 0,
      finisherWave: false,
      dmgReduction: 0,
      thornsNova: 0,
      hitCounter: 0,
      bladeColor: 0xff8533,
      weapons: [slot0, slot1],
      activeSlot: 0,
      downed: false,
      bleedout: 0,
      reviveProgress: 0
    };
    applyClassStatsToHero(this);
    this._suppressWeaponSync = true;
    this.mountActiveWeapon();
    this._suppressWeaponSync = false;
    this.heroRig.applyTheme(getPlayerTheme(this.localThemeIdx || 0));
    this.heroRig.body.position.y = 0;
    this.heroRig.torso.rotation.x = 0;
    this.heroRig.root.position.set(this.hero.x, 0, this.hero.z);
    this.heroRig.root.rotation.y = this.hero.yaw;
  }

  activeWeapon() {
    return this.hero.weapons[this.hero.activeSlot] || this.hero.weapons[0];
  }

  mountActiveWeapon() {
    const wpn = this.activeWeapon();
    if (!wpn) return;
    while (this.heroRig.swordPivot.children.length > 0) {
      this.heroRig.swordPivot.remove(this.heroRig.swordPivot.children[0]);
    }
    while (this.heroRig.offhandPivot.children.length > 0) {
      this.heroRig.offhandPivot.remove(this.heroRig.offhandPivot.children[0]);
    }
    const vis = buildWeaponVisuals(wpn, this.mats);
    this.heroRig.swordPivot.add(vis.group);
    if (vis.offhand) {
      this.heroRig.offhandPivot.add(vis.offhand);
    }
    this.mountedWeaponVis = vis;
    this.hero.bladeColor = wpn.def.accentHex;
    if (this.isCoopActive && this.isCoopActive()) {
      this.heroRig.visorMat.emissive.setHex(getPlayerTheme(this.localThemeIdx || 0).visorHex);
    } else {
      this.heroRig.visorMat.emissive.setHex(wpn.def.accentHex);
    }
    this.updateWeaponHUD();
    if (!this._suppressWeaponSync && this.coopOnWeaponChanged) {
      this.coopOnWeaponChanged();
    }
  }

  swapWeaponSlot(slotIdx = null) {
    if (this.mode !== 'explore' || (this.hero && this.hero.downed)) return;
    const h = this.hero;
    if (h.dashTimer > 0.02) {
      this.queueInputBuffer('swap', slotIdx);
      return;
    }
    const target = slotIdx === null ? (h.activeSlot === 0 ? 1 : 0) : slotIdx;
    if (target < 0 || target > 1 || target === h.activeSlot) return;
    h.activeSlot = target;
    h.atkState = null;
    h.comboStep = 0;
    h.comboWindow = 0;
    this.mountActiveWeapon();
    const wpn = this.activeWeapon();
    this.sfx.weaponSwap(wpn);
    this.vfx.burst(h.x, 1.15, h.z, wpn.def.accentHex, 14, 3.8, 3.5);
    this.updateHUD();
  }

  effectiveDmgMult(weaponInst = this.activeWeapon()) {
    const h = this.hero;
    const cinderBonus = h.cinderScaling
      ? 1 + Math.min(0.45, Math.floor((h.cinders || 0) / 30) * 0.025)
      : 1.0;
    const catMult = weaponInst && weaponInst.def.category === 'ranged' ? (h.rangedDmgMult || 1.0) : 1.0;
    return h.dmgMult * cinderBonus * catMult * getClassBonusDmgMult(h);
  }

  findSafeSpotInRoom(room, preferredOffsets = [[0, 0]], clearance = 1.25) {
    const isSpotClear = (ox, oz) => {
      const wx = room.cx + ox;
      const wz = room.cz + oz;
      if (Math.abs(ox) > room.halfW - 1.9 || Math.abs(oz) > room.halfD - 1.9) return null;
      const hitCol = room.colliders.some((c) => Math.hypot(wx - c.x, wz - c.z) < c.r + clearance);
      if (hitCol) return null;
      if (isInsideDoorKeepOut(room, wx, wz, Math.max(1.0, clearance * 0.9))) return null;
      const hitInter = room.interactables.some((it) => Math.hypot(wx - it.x, wz - it.z) < 1.85);
      if (hitInter) return null;
      const hitTrap = room.traps.some((tr) => Math.abs(wx - tr.x) < tr.half + 0.85 && Math.abs(wz - tr.z) < tr.half + 0.85);
      if (hitTrap) return null;
      if (room.props) {
        const hitProp = room.props.some((p) => !p.broken && Math.hypot(wx - p.x, wz - p.z) < p.r + clearance * 0.85);
        if (hitProp) return null;
      }
      return { x: wx, z: wz };
    };

    for (const [ox, oz] of preferredOffsets) {
      if (Math.abs(ox) > room.halfW - 1.9 || Math.abs(oz) > room.halfD - 1.9) continue;
      const ok = isSpotClear(ox, oz);
      if (ok) return ok;
    }
    for (const rad of [2.5, 3.8, 1.5, 4.9]) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.39;
        const ox = Math.cos(a) * rad;
        const oz = Math.sin(a) * rad;
        if (Math.abs(ox) > room.halfW - 1.9 || Math.abs(oz) > room.halfD - 1.9) continue;
        const ok = isSpotClear(ox, oz);
        if (ok) return ok;
      }
    }
    return { x: room.cx, z: room.cz };
  }

  pickDispersedRoomSpawns(room, types, opts = {}) {
    if (!room || !Array.isArray(types) || types.length === 0) return [];
    const minAnchorDist = opts.minAnchorDist ?? 4.0;
    const phaseOffset = opts.phaseOffset ?? 0;
    const avoidPoints = [];
    if (this.hero) avoidPoints.push({ x: this.hero.x, z: this.hero.z, minD: minAnchorDist });
    if (this.remotePlayers) {
      for (const rp of this.remotePlayers.values()) {
        if (rp && !rp.downed) avoidPoints.push({ x: rp.x, z: rp.z, minD: minAnchorDist * 0.9 });
      }
    }
    if (Array.isArray(opts.extraAvoid)) {
      for (const ap of opts.extraAvoid) {
        if (ap && Number.isFinite(ap.x) && Number.isFinite(ap.z)) {
          avoidPoints.push({ x: ap.x, z: ap.z, minD: ap.minD ?? minAnchorDist });
        }
      }
    }

    const placed = [];
    for (const ex of this.enemies) {
      if (ex && ex.hp > 0 && ex.room === room) {
        placed.push({ x: ex.x, z: ex.z, type: ex.type });
      }
    }
    if (Array.isArray(opts.existingPeers)) {
      for (const ep of opts.existingPeers) {
        if (ep && Number.isFinite(ep.x) && Number.isFinite(ep.z)) {
          placed.push({ x: ep.x, z: ep.z, type: ep.type || 'boss' });
        }
      }
    }

    const marginX = Math.min(1.85, room.halfW * 0.28);
    const marginZ = Math.min(1.85, room.halfD * 0.28);
    const usableW = Math.max(1.8, room.halfW - marginX);
    const usableD = Math.max(1.8, room.halfD - marginZ);

    const isCandidateClear = (wx, wz, clearance = 0.72) => {
      if (Math.abs(wx - room.cx) > usableW || Math.abs(wz - room.cz) > usableD) return false;
      if (this.dungeon && !this.dungeon.isPointWalkable(wx, wz, clearance)) return false;
      if (room.colliders && room.colliders.some((c) => Math.hypot(wx - c.x, wz - c.z) < c.r + clearance)) return false;
      if (isInsideDoorKeepOut(room, wx, wz, 1.05)) return false;
      if (room.interactables && room.interactables.some((it) => Math.hypot(wx - it.x, wz - it.z) < 1.65)) return false;
      if (room.traps && room.traps.some((tr) => Math.abs(wx - tr.x) < tr.half + 0.72 && Math.abs(wz - tr.z) < tr.half + 0.72)) return false;
      if (room.props && room.props.some((p) => !p.broken && Math.hypot(wx - p.x, wz - p.z) < p.r + clearance * 0.8)) return false;
      return true;
    };

    const results = [];
    const total = types.length;
    const goldenAngle = 2.399963229728653;

    for (let idx = 0; idx < total; idx++) {
      const type = types[idx];
      if (type === 'warden') {
        const bossSpot = this.findSafeSpotInRoom(
          room,
          [[0, -2.8], [0, -1.5], [0, 2.4], [-2.8, -2.0], [2.8, -2.0], [0, 0]],
          1.15
        );
        placed.push({ x: bossSpot.x, z: bossSpot.z, type });
        results.push(bossSpot);
        continue;
      }

      const isRanged = type === 'acolyte';
      const clearance = type === 'juggernaut' ? 0.86 : 0.68;
      let bestSpot = null;
      let bestScore = -Infinity;

      for (let c = 0; c < 32; c++) {
        let ox = 0;
        let oz = 0;
        if (c < 10) {
          const baseAng = idx * goldenAngle + phaseOffset + (c - 4.5) * 0.27;
          const ringFrac = isRanged
            ? 0.62 + ((idx + c * 3) % 5) * 0.082
            : 0.34 + ((idx * 3 + c * 2) % 7) * 0.088;
          ox = Math.cos(baseAng) * usableW * Math.min(0.96, ringFrac);
          oz = Math.sin(baseAng) * usableD * Math.min(0.96, ringFrac);
        } else {
          const u = (((idx * 17 + c * 31) % 53) / 53 + Math.random() * 0.18) % 1;
          const v = (((idx * 29 + c * 13) % 47) / 47 + Math.random() * 0.18) % 1;
          ox = (u * 2 - 1) * usableW * 0.95;
          oz = (v * 2 - 1) * usableD * 0.95;
        }

        const wx = room.cx + ox;
        const wz = room.cz + oz;
        if (!isCandidateClear(wx, wz, clearance)) continue;

        let minAvoid = Infinity;
        let avoidPenalty = 0;
        for (const ap of avoidPoints) {
          const d = Math.hypot(wx - ap.x, wz - ap.z);
          if (d < minAvoid) minAvoid = d;
          if (d < ap.minD) {
            avoidPenalty += (ap.minD - d) * 6.5;
          }
        }

        let minPeer = 7.5;
        let minSameRanged = 9.0;
        for (const p of placed) {
          const d = Math.hypot(wx - p.x, wz - p.z);
          if (d < minPeer) minPeer = d;
          if (isRanged && p.type === 'acolyte' && d < minSameRanged) {
            minSameRanged = d;
          }
        }

        const normExtent = Math.max(Math.abs(ox) / usableW, Math.abs(oz) / usableD);
        let roleBonus = 0;
        if (isRanged) {
          roleBonus += normExtent >= 0.56 ? 1.85 : -1.1;
          roleBonus += Math.min(minAvoid, 10.5) * 0.36;
          roleBonus += Math.min(minSameRanged, 7.0) * 1.15;
        } else {
          roleBonus += (normExtent >= 0.30 && normExtent <= 0.90) ? 0.85 : 0;
          roleBonus += Math.min(minAvoid, 7.5) * 0.18;
        }

        const score = Math.min(minPeer, 6.2) * 2.45 + roleBonus - avoidPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestSpot = { x: wx, z: wz };
        }
      }

      if (!bestSpot) {
        const fbAng = idx * goldenAngle + phaseOffset;
        bestSpot = this.findSafeSpotInRoom(
          room,
          [
            [Math.cos(fbAng) * usableW * 0.65, Math.sin(fbAng) * usableD * 0.65],
            [-usableW * 0.55, -usableD * 0.55],
            [usableW * 0.55, usableD * 0.55],
            [-usableW * 0.55, usableD * 0.55],
            [usableW * 0.55, -usableD * 0.55]
          ],
          clearance
        );
      }
      placed.push({ x: bestSpot.x, z: bestSpot.z, type });
      results.push(bestSpot);
    }
    return results;
  }

  chooseBiomeForDepth(depth, options = {}) {
    if (options.biomeId || options.variant) {
      const picked = pickBiomeForFloor(depth, {
        biomeId: options.biomeId || null,
        variant: options.variant || null
      });
      this.lastVariantByDepth[depth] = picked.variant;
      return picked;
    }
    const prevVar = this.lastVariantByDepth[depth];
    const nextVar = prevVar ? (prevVar === 'A' ? 'B' : 'A') : (Math.random() < 0.5 ? 'A' : 'B');
    const picked = pickBiomeForFloor(depth, { variant: nextVar });
    this.lastVariantByDepth[depth] = picked.variant;
    return picked;
  }

  createFloorInitPayload(floorIdx, isNewRun = false) {
    const clampedIdx = Math.max(0, Math.min(MAX_FLOORS - 1, floorIdx));
    const depth = FLOOR_CONFIGS[clampedIdx].depth;
    if (isNewRun) this.usedBiomeIds.clear();
    const chosen = (!isNewRun && clampedIdx > 0 && this.nextFloorBiome)
      ? this.nextFloorBiome
      : this.chooseBiomeForDepth(depth);
    const seed = Math.floor(Math.random() * 900000 + 100000);
    const propSeed = ((seed * 2654435761) >>> 0) || 13579;
    const targetRoomCount = Math.min(10, 7 + Math.floor((depth + 1) / 2));
    const generated = generateRandomDungeonGraph({ biome: chosen, seed, targetRoomCount });
    const armoryRng = createSeededRng(propSeed);
    const armoryWpn = pickRandomWeaponDrop(depth, [], armoryRng);
    const payload = {
      kind: 'floor_init',
      floorIndex: clampedIdx,
      difficultyId: this.selectedDifficultyId || DEFAULT_DIFFICULTY_ID,
      biomeId: chosen.id,
      seed,
      propSeed,
      roomsBlueprint: serializeDungeonBlueprint(generated.rooms),
      armoryWeapon: serializeWeaponInst(armoryWpn),
      isNewRun
    };
    this.lastAuthoritativeFloorInit = payload;
    this.consumedOneTimeNetIds = new Set();
    return payload;
  }

  startCoopRunFromInit(floorInit, isLateJoin = false) {
    this.sfx.init();
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.lastAuthoritativeFloorInit = floorInit;
    if (floorInit.difficultyId) {
      this.setDifficulty(floorInit.difficultyId, false);
    }
    this.consumedOneTimeNetIds = new Set(Array.isArray(floorInit.usedNetIds) ? floorInit.usedNetIds : []);
    if (!isLateJoin) {
      this.takenBoons.clear();
      this.acquiredBoons = [];
      this.pendingBoonQueue = [];
      this.pendingWeaponPedestal = null;
      this.combatRoomsClearedForFlask = 0;
      this.kills = 0;
      this.runTime = 0;
      this.totalRoomsExplored = 1;
      this.floorsCleared = floorInit.floorIndex || 0;
      this.usedBiomeIds.clear();
      this.resetHeroStats();
      document.getElementById('relic-strip').innerHTML = '';
    }

    this.buildFloorWorld(floorInit.floorIndex || 0, {
      initialTitle: true,
      biomeId: floorInit.biomeId,
      seed: floorInit.seed,
      propSeed: floorInit.propSeed,
      roomsBlueprint: floorInit.roomsBlueprint || null,
      armoryWeapon: floorInit.armoryWeapon || null
    });
    if (this.consumedOneTimeNetIds.size > 0 && this.dungeon) {
      for (const inter of this.dungeon.interactables) {
        if (this.consumedOneTimeNetIds.has(inter.netId)) {
          this.consumeOneTimeInteractableVisual(inter);
        }
      }
    }
    this.mode = 'explore';
    this.sfx.setPausedDamp(false);
    this.inputBuffer = null;

    document.getElementById('title-overlay')?.classList.add('hidden');
    document.getElementById('lan-overlay')?.classList.add('hidden');
    document.getElementById('end-overlay')?.classList.add('hidden');
    document.getElementById('boon-overlay')?.classList.add('hidden');
    document.getElementById('weapon-overlay')?.classList.add('hidden');
    document.getElementById('pause-overlay')?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    this.syncPauseButtonVisibility();

    const bt = getBiomeText(this.dungeon.biome);
    const rt = getRoomText(this.currentRoom);
    this.showBanner(
      tUI().hudFloorShort(this.floorCfg.roman, bt.name),
      rt.subtitle || bt.sub
    );
    this.coopOnWeaponChanged?.();
    this.updateHUD();
    this.drawMinimap();
  }

  executeSyncedFloorTransition(floorInit) {
    if (this.mode === 'transition') return;
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.lastAuthoritativeFloorInit = floorInit;
    if (floorInit.difficultyId) {
      this.setDifficulty(floorInit.difficultyId, false);
    }
    this.consumedOneTimeNetIds = new Set();
    const nextIdx = floorInit.floorIndex;
    const nextCfg = FLOOR_CONFIGS[nextIdx];
    const nextBiome = BIOME_BY_ID[floorInit.biomeId] || this.chooseBiomeForDepth(nextCfg.depth, { biomeId: floorInit.biomeId });
    this.mode = 'transition';
    this.sfx.setPausedDamp(false);
    this.pendingBoonQueue = [];
    this.pendingWeaponPedestal = null;
    this.inputBuffer = null;
    document.getElementById('boon-overlay')?.classList.add('hidden');
    document.getElementById('weapon-overlay')?.classList.add('hidden');
    document.getElementById('pause-overlay')?.classList.add('hidden');
    this.syncPauseButtonVisibility();
    this.sfx.portalDescend();
    this.activeInteractable = null;
    this.updateInteractPromptUI();

    const ui = tUI();
    const nextBt = getBiomeText(nextBiome);
    const veil = document.getElementById('transition-veil');
    document.getElementById('transition-title').textContent = ui.transitionTitle(nextCfg.roman, nextBt.name);
    document.getElementById('transition-sub').textContent = nextBt.sub;
    veil.classList.add('active');

    setTimeout(() => {
      this.floorsCleared = Math.max(this.floorsCleared, nextIdx);
      if (this.hero.downed) {
        this.reviveLocalHero(0.45, true);
      } else {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.30));
      }
      this.hero.energy = Math.min(this.hero.maxEnergy, (this.hero.energy ?? this.hero.maxEnergy) + Math.round(this.hero.maxEnergy * 0.55));
      this.hero.flasks = Math.min(this.hero.maxFlasks, this.hero.flasks + 2);
      this.buildFloorWorld(nextIdx, {
        initialTitle: false,
        biomeId: nextBiome.id,
        seed: floorInit.seed,
        propSeed: floorInit.propSeed,
        roomsBlueprint: floorInit.roomsBlueprint || null,
        armoryWeapon: floorInit.armoryWeapon || null
      });
      this.camera.position.set(this.hero.x, 13.6, this.hero.z + 11.8);

      setTimeout(() => {
        veil.classList.remove('active');
        this.mode = 'explore';
        this.syncPauseButtonVisibility();
        const curBt = getBiomeText(this.dungeon.biome);
        const curRt = getRoomText(this.currentRoom);
        this.showBanner(
          tUI().hudFloorShort(this.floorCfg.roman, curBt.name),
          curRt.subtitle || curBt.sub
        );
        this.updateHUD();
        this.drawMinimap();
      }, 360);
    }, 460);
  }

  buildFloorWorld(floorIdx, options = {}) {
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.pendingBoonQueue = [];
    this.clearEntities();
    if (this.dungeon) {
      this.dungeon.dispose();
      this.dungeon = null;
    }
    this.floorIndex = Math.max(0, Math.min(MAX_FLOORS - 1, floorIdx));
    this.floorCfg = FLOOR_CONFIGS[this.floorIndex];
    this.floorMasteryGranted = false;
    this.descentPortal = null;
    this.nextFloorBiome = null;

    const depth = this.floorCfg.depth;
    const chosenBiome = this.chooseBiomeForDepth(depth, {
      biomeId: options.biomeId || null,
      variant: options.variant || null
    });
    this.usedBiomeIds.add(chosenBiome.id);
    this.sfx.setBiomeAmbience(chosenBiome.id, false);

    const actualSeed = options.seed ?? Math.floor(Math.random() * 900000 + 100000);
    const propSeed = options.propSeed ?? (((actualSeed * 2654435761) >>> 0) || 24680);
    this.currentFloorSeed = actualSeed;
    this.currentPropSeed = propSeed;

    const targetRoomCount = Math.min(10, 7 + Math.floor((depth + 1) / 2));
    const hydratedRooms = options.roomsBlueprint ? deserializeDungeonBlueprint(options.roomsBlueprint) : null;
    this.dungeon = buildBiomeDungeonWorld({
      renderer: this.renderer,
      scene: this.scene,
      baseTex: this.tex,
      biomeId: chosenBiome.id,
      depth,
      seed: actualSeed,
      roomsBlueprint: hydratedRooms,
      targetRoomCount,
      isMobile: this.width < 820,
      applySceneAtmosphere: true,
      lights: {
        moonLight: this.moonLight,
        warmFill: this.warmFill,
        hemiLight: this.hemiLight
      }
    });

    if (this.vfx.rain) {
      this.vfx.rain.visible = chosenBiome.liquidMode === 'water';
    }
    if (this.vfx.mistSprites) {
      for (const m of this.vfx.mistSprites) {
        m.sp.material.color.setHex(chosenBiome.lighting.hemiSky);
      }
    }
    if (this.heroRig && this.heroRig.heroLight) {
      this.heroRig.heroLight.intensity = chosenBiome.archStyle === 'obsidian' ? 0.55 : 1.15;
    }
    if (chosenBiome.lighting && Array.isArray(chosenBiome.lighting.keyOffset)) {
      this._shadowOffset = new THREE.Vector3(...chosenBiome.lighting.keyOffset);
      const fwd = this._shadowOffset.clone().negate().normalize();
      this._shadowRight = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      this._shadowUp = new THREE.Vector3().crossVectors(this._shadowRight, fwd).normalize();
      this._shadowTexel = (19.5 * 2) / 2048;
      this._shadowBasisInit = true;
    }

    for (const inter of this.dungeon.interactables) {
      if (inter.kind === 'forge_anvil') {
        inter.cost = this.floorCfg.anvilBaseCost || 65;
      } else if (inter.kind === 'cinder_shrine') {
        inter.baseCost = Math.round(95 * this.floorCfg.cinderMult);
        inter.cost = inter.baseCost;
        inter.uses = 0;
        inter.maxUses = 2;
        inter.used = false;
      }
    }

    this.populateFloorExplorationProps(propSeed, options.armoryWeapon || null);
    this.dungeon.interactables.forEach((it, idx) => {
      it.netId = `inter_${idx}`;
    });
    this.dungeon.destructibles.forEach((pr, idx) => {
      pr.netId = `prop_${idx}`;
    });
    this.refreshInteractableLabels();

    const startRoom = this.dungeon.rooms.find((r) => r.type === 'start') || this.dungeon.rooms[0];
    startRoom.visited = true;
    this.currentRoom = startRoom;
    const slotIdx = this.coopSlotIndex ? (this.coopSlotIndex() % 4) : 0;
    const heroSpot = this.findSafeSpotInRoom(
      startRoom,
      START_SLOT_OFFSETS[slotIdx] || START_SLOT_OFFSETS[0],
      0.8
    );
    this.hero.x = heroSpot.x;
    this.hero.z = heroSpot.z;
    this.hero.vx = 0;
    this.hero.vz = 0;
    this.hero.yaw = Math.PI;
    this.heroRig.root.position.set(this.hero.x, 0, this.hero.z);
    this.heroRig.root.rotation.y = this.hero.yaw;
    this.coopResetPeersToStartRoom?.(startRoom);
    this._netStateAccum = 1.0;

    if (!options.initialTitle) {
      this.totalRoomsExplored += 1;
    }
    this.updateHUD();
    this.drawMinimap();
  }

  populateFloorExplorationProps(propSeed = null, forcedArmoryWeapon = null) {
    const rng = propSeed !== null ? createSeededRng(propSeed) : Math.random;
    const depth = this.floorCfg.depth;
    const rooms = this.dungeon.rooms;
    const startRoom = rooms.find((r) => r.type === 'start') || rooms[0];
    const combatRooms = rooms.filter((r) => r.type === 'combat');
    const vaultRoom = rooms.find((r) => r.type === 'vault');

    const excludeOwned = (this.isCoopActive && this.isCoopActive()) ? [] : this.hero.weapons.map((w) => w.id);
    const armoryWpn = forcedArmoryWeapon
      ? deserializeWeaponInst(forcedArmoryWeapon)
      : pickRandomWeaponDrop(depth, excludeOwned, rng);
    const armorySpot = this.findSafeSpotInRoom(startRoom, [[3.4, -2.8], [3.2, 2.8], [-3.2, 2.8], [0, -3.2]], 1.15);
    this.spawnWeaponPedestalInteractable(startRoom, armorySpot.x, armorySpot.z, armoryWpn);

    if (combatRooms.length > 0) {
      const obRoom = combatRooms[combatRooms.length - 1];
      const obSpot = this.findSafeSpotInRoom(obRoom, [[0, 0], [-3.4, 0], [3.4, 0], [0, -3.4], [0, 3.4]], 1.15);
      const curio = createExplorationCurio('trial_obelisk', this.mats, this.tex, obSpot.x, obSpot.z);
      (obRoom.group || this.dungeon.root).add(curio.root);
      const obCollider = { x: obSpot.x, z: obSpot.z, r: 0.78 };
      obRoom.colliders.push(obCollider);
      const inter = {
        kind: 'trial_obelisk',
        room: obRoom,
        x: obSpot.x,
        z: obSpot.z,
        used: false,
        crystal: curio.crystal,
        curio,
        collider: obCollider,
        label: `[F] UNSEAL BLOOD TRIAL OBELISK (ELITE AMBUSH -> TIER ${Math.min(4, depth + 1)} WEAPON)`
      };
      this.dungeon.interactables.push(inter);
      obRoom.interactables.push(inter);
      this.floorObjects.push({ type: 'curio', obj: curio, room: obRoom });
    }

    const cacheRoom = combatRooms.length > 1 ? combatRooms[0] : vaultRoom;
    if (cacheRoom) {
      const cacheSpot = this.findSafeSpotInRoom(cacheRoom, [[-3.8, -3.6], [3.8, 3.6], [-3.8, 3.6], [3.8, -3.6]], 1.05);
      const cache = createExplorationCurio('soul_cache', this.mats, this.tex, cacheSpot.x, cacheSpot.z);
      (cacheRoom.group || this.dungeon.root).add(cache.root);
      const cacheCollider = { x: cacheSpot.x, z: cacheSpot.z, r: 0.72 };
      cacheRoom.colliders.push(cacheCollider);
      const cVal = Math.round(45 * this.floorCfg.cinderMult);
      const inter = {
        kind: 'soul_cache',
        room: cacheRoom,
        x: cacheSpot.x,
        z: cacheSpot.z,
        used: false,
        curio: cache,
        collider: cacheCollider,
        crystal: cache.crystal,
        halo: cache.halo,
        cinderReward: cVal,
        label: `[F] CLAIM LOST SOUL CACHE (+${cVal} CINDERS & +25% HEAL)`
      };
      this.dungeon.interactables.push(inter);
      cacheRoom.interactables.push(inter);
      this.floorObjects.push({ type: 'curio', obj: cache, room: cacheRoom });
    }
  }

  spawnWeaponPedestalInteractable(room, x, z, weaponInst, extra = {}) {
    const ped = createWeaponPedestal(weaponInst, this.mats, this.tex, x, z);
    (room.group || this.dungeon.root).add(ped.root);
    const pedCollider = { x, z, r: 0.76 };
    room.colliders.push(pedCollider);
    const catTag = weaponInst.def.category === 'ranged' ? 'RANGED LOCK' : 'MELEE';
    const inter = {
      kind: 'weapon_pedestal',
      netId: `inter_dyn_${this.dungeon.interactables.length}`,
      room,
      x,
      z,
      used: false,
      weaponInst,
      pedestal: ped,
      collider: pedCollider,
      bossChoiceGroup: extra.bossChoiceGroup || null,
      label: `[F] INSPECT ${weaponInst.def.name.toUpperCase()} (${weaponInst.tierLabel} · ${catTag})`
    };
    this.dungeon.interactables.push(inter);
    room.interactables.push(inter);
    this.floorObjects.push({ type: 'pedestal', obj: ped, room });
    return inter;
  }

  spawnBossVictoryPortal(bossRoom, forcedNextBiomeId = null, forcedBossWpn = null) {
    if (this.descentPortal) return null;
    const nextCfg = FLOOR_CONFIGS[this.floorIndex + 1];
    const nextBiome = forcedNextBiomeId && BIOME_BY_ID[forcedNextBiomeId]
      ? BIOME_BY_ID[forcedNextBiomeId]
      : this.chooseBiomeForDepth(nextCfg.depth);
    this.nextFloorBiome = nextBiome;
    const portalSpot = this.findSafeSpotInRoom(bossRoom, [[0, -3.2], [0, 0], [0, 3.2]], 1.4);
    const portal = createDescentPortal(this.tex, this.mats, portalSpot.x, portalSpot.z, nextCfg, nextBiome);
    (bossRoom.group || this.dungeon.root).add(portal.root);
    this.descentPortal = portal;
    bossRoom.hasPortal = true;
    this.sfx.portalSpawn({ x: portalSpot.x, z: portalSpot.z });

    const inter = {
      kind: 'descent_portal',
      netId: 'inter_portal',
      room: bossRoom,
      x: portalSpot.x,
      z: portalSpot.z,
      used: false,
      portal,
      label: `[F] ENTER ABYSSAL PORTAL -> FLOOR ${nextCfg.roman} (${nextBiome.name})`
    };
    this.dungeon.interactables.push(inter);
    bossRoom.interactables.push(inter);

    const dropTier = Math.min(4, this.floorCfg.depth + 1);
    const excludeIds = this.hero.weapons.map((w) => w.id);
    let bossWpnList = [];
    if (Array.isArray(forcedBossWpn) && forcedBossWpn.length > 0) {
      bossWpnList = forcedBossWpn.map((s) => deserializeWeaponInst(s));
    } else if (forcedBossWpn) {
      const wA = deserializeWeaponInst(forcedBossWpn);
      const wB = pickBossMythicDrop(dropTier, [...excludeIds, wA.id]);
      bossWpnList = [wA, wB];
    } else {
      const wA = pickBossMythicDrop(dropTier, excludeIds);
      const wB = pickBossMythicDrop(dropTier, [...excludeIds, wA.id]);
      bossWpnList = [wA, wB];
    }
    const spotPrefs = [
      [[3.4, -2.2], [3.2, 2.2], [2.8, 0]],
      [[-3.4, -2.2], [-3.2, 2.2], [-2.8, 0]]
    ];
    bossWpnList.forEach((bw, bIdx) => {
      const wpnSpot = this.findSafeSpotInRoom(bossRoom, spotPrefs[bIdx] || spotPrefs[0], 1.1);
      this.spawnWeaponPedestalInteractable(bossRoom, wpnSpot.x, wpnSpot.z, bw, {
        bossChoiceGroup: 'boss_mythic_altar'
      });
    });

    const pHex = portal.vortexHex || 0x62b6ff;
    this.refreshInteractableLabels();
    this.vfx.spawnRing(portalSpot.x, portalSpot.z, 4.8, 0.85, pHex, false);
    this.vfx.flash(portalSpot.x, 1.8, portalSpot.z, pHex, 22);
    this.drawMinimap();
    return {
      nextBiomeId: nextBiome.id,
      bossWeapon: serializeWeaponInst(bossWpnList[0]),
      bossWeapons: bossWpnList.map((bw) => serializeWeaponInst(bw))
    };
  }

  descendToNextFloor() {
    if (this.floorIndex >= MAX_FLOORS - 1 || this.mode === 'transition') return;
    if (this.isCoopClient && this.isCoopClient()) {
      this.lan.relay({ kind: 'interact_sync', sub: 'portal_req' }, 'host');
      return;
    }
    if (this.isCoopHost && this.isCoopHost()) {
      const floorInit = this.createFloorInitPayload(this.floorIndex + 1, false);
      this.lan.relay(floorInit, 'all');
      return;
    }
    const nextIdx = this.floorIndex + 1;
    const nextCfg = FLOOR_CONFIGS[nextIdx];
    const nextBiome = this.nextFloorBiome || this.chooseBiomeForDepth(nextCfg.depth);
    this.mode = 'transition';
    this.sfx.portalDescend();
    this.activeInteractable = null;
    this.updateInteractPromptUI();

    const ui = tUI();
    const nextBt = getBiomeText(nextBiome);
    const veil = document.getElementById('transition-veil');
    document.getElementById('transition-title').textContent = ui.transitionTitle(nextCfg.roman, nextBt.name);
    document.getElementById('transition-sub').textContent = nextBt.sub;
    veil.classList.add('active');

    setTimeout(() => {
      this.floorsCleared = Math.max(this.floorsCleared, nextIdx);
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.30));
      this.hero.energy = Math.min(this.hero.maxEnergy, (this.hero.energy ?? this.hero.maxEnergy) + Math.round(this.hero.maxEnergy * 0.55));
      this.hero.flasks = Math.min(this.hero.maxFlasks, this.hero.flasks + 2);
      this.buildFloorWorld(nextIdx, { initialTitle: false, biomeId: nextBiome.id });
      this.camera.position.set(this.hero.x, 13.6, this.hero.z + 11.8);

      setTimeout(() => {
        veil.classList.remove('active');
        this.mode = 'explore';
        const curBt = getBiomeText(this.dungeon.biome);
        const curRt = getRoomText(this.currentRoom);
        this.showBanner(
          tUI().hudFloorShort(this.floorCfg.roman, curBt.name),
          curRt.subtitle || curBt.sub
        );
        this.updateHUD();
        this.drawMinimap();
      }, 280);
    }, 380);
  }

  startRun(rebuildDungeon = true, forceSolo = false) {
    this.sfx.init();
    if (forceSolo && this.lan && this.lan.inRoom) {
      this.lan.leaveRoom();
    }
    if (!forceSolo && this.isCoopActive && this.isCoopActive()) {
      if (this.isCoopHost()) {
        const floorInit = this.createFloorInitPayload(0, true);
        this.lan.launchRun(floorInit);
      }
      return;
    }
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.takenBoons.clear();
    this.acquiredBoons = [];
    this.pendingBoonQueue = [];
    this.pendingWeaponPedestal = null;
    this.combatRoomsClearedForFlask = 0;
    this.kills = 0;
    this.runTime = 0;
    this.totalRoomsExplored = 1;
    this.floorsCleared = 0;
    this.usedBiomeIds.clear();

    clearClassEntities(this, true);
    this.resetHeroStats();
    if (rebuildDungeon || !this.dungeon || this.floorIndex !== 0) {
      this.buildFloorWorld(0, { initialTitle: true });
    } else {
      const startRoom = this.dungeon.rooms.find((r) => r.type === 'start') || this.dungeon.rooms[0];
      this.currentRoom = startRoom;
      const spot = this.findSafeSpotInRoom(startRoom, [[0, 2.0], [0, 0], [-2.2, 1.8], [2.2, 1.8]], 0.8);
      this.hero.x = spot.x;
      this.hero.z = spot.z;
      this.heroRig.root.position.set(spot.x, 0, spot.z);
      this.totalRoomsExplored = 1;
    }
    this.mode = 'explore';
    this.sfx.setPausedDamp(false);
    this.inputBuffer = null;

    document.getElementById('title-overlay').classList.add('hidden');
    document.getElementById('end-overlay').classList.add('hidden');
    document.getElementById('boon-overlay').classList.add('hidden');
    document.getElementById('weapon-overlay').classList.add('hidden');
    document.getElementById('pause-overlay')?.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.syncPauseButtonVisibility();
    document.getElementById('relic-strip').innerHTML = '';
    const cdArcNum = document.getElementById('cd-arc-num');
    if (cdArcNum) cdArcNum.classList.add('hidden');
    const cdDashNum = document.getElementById('cd-dash-num');
    if (cdDashNum) cdDashNum.classList.add('hidden');
    const cdUltNum = document.getElementById('cd-ult-num');
    if (cdUltNum) cdUltNum.classList.add('hidden');

    const bt = getBiomeText(this.dungeon.biome);
    const rt = getRoomText(this.currentRoom);
    this.showBanner(
      tUI().hudFloorShort(this.floorCfg.roman, bt.name),
      rt.subtitle || bt.sub
    );
    this.updateHUD();
    this.drawMinimap();
  }

  getSharedProjGeo(key, createFn) {
    let g = this._projGeoCache.get(key);
    if (!g) {
      g = createFn();
      this._projGeoCache.set(key, g);
    }
    return g;
  }

  destroyProjectile(p) {
    if (!p) return;
    if (p.mesh) this.scene.remove(p.mesh);
    if (p._ownedMats) {
      for (let i = 0; i < p._ownedMats.length; i++) {
        p._ownedMats[i].dispose();
      }
      p._ownedMats = null;
    }
  }

  acquireEnemyRig(type) {
    let list = this.enemyRigPool.get(type);
    if (list && list.length > 0) {
      const rig = list.pop();
      resetEnemyRig(rig);
      return rig;
    }
    return createEnemyRig(type, this.mats);
  }

  releaseEnemyRig(e) {
    if (!e || !e.rig) return;
    this.scene.remove(e.rig.root);
    if (e.rig._shieldMesh) e.rig._shieldMesh.visible = false;
    if (e.rig._affixRing) e.rig._affixRing.visible = false;
    resetEnemyRig(e.rig);
    const t = e.type || e.rig.type || 'thrall';
    let list = this.enemyRigPool.get(t);
    if (!list) {
      list = [];
      this.enemyRigPool.set(t, list);
    }
    if (list.length < 48) {
      list.push(e.rig);
    } else {
      if (e.rig.glowMat) e.rig.glowMat.dispose();
      if (e.rig.flashMats) e.rig.flashMats.forEach((m) => m.dispose());
      if (e.rig._shieldMesh) e.rig._shieldMesh.material.dispose();
      if (e.rig._affixRing) e.rig._affixRing.material.dispose();
    }
  }

  acquireOrbSprite(orbKind = 'cinder') {
    if (!this._cinderOrbMat) {
      this._cinderOrbMat = new THREE.SpriteMaterial({
        map: this.tex.softParticleTex,
        color: 0xffa63b,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      this._vitalityOrbMat = new THREE.SpriteMaterial({
        map: this.tex.softParticleTex,
        color: 0x5effc8,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      this._energyOrbMat = new THREE.SpriteMaterial({
        map: this.tex.softParticleTex,
        color: 0xc77dff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.94,
        depthWrite: false
      });
    }
    const kind = orbKind === true ? 'vitality' : (orbKind || 'cinder');
    const mat = kind === 'vitality'
      ? this._vitalityOrbMat
      : (kind === 'energy' ? this._energyOrbMat : this._cinderOrbMat);
    let sp = this.orbSpritePool.pop();
    if (sp) {
      sp.material = mat;
      sp.visible = true;
    } else {
      sp = new THREE.Sprite(mat);
      sp.userData.ignoreAO = true;
    }
    const sz = kind === 'vitality' ? 0.68 : (kind === 'energy' ? 0.62 : 0.55);
    sp.scale.set(sz, sz, 1);
    return sp;
  }

  releaseOrbSprite(sp) {
    if (!sp) return;
    this.scene.remove(sp);
    if (this.orbSpritePool.length < 96) {
      this.orbSpritePool.push(sp);
    }
  }

  clearEntities() {
    clearClassEntities(this, false);
    for (const e of this.enemies) this.releaseEnemyRig(e);
    this.enemies = [];
    for (const p of this.projectiles) this.destroyProjectile(p);
    this.projectiles = [];
    for (const c of this.cinderOrbs) this.releaseOrbSprite(c.mesh);
    this.cinderOrbs = [];
    for (const l of this.lightningLines) {
      this.scene.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
    }
    this.lightningLines = [];
    for (const hz of this.delayedHazards) {
      if (hz.mesh) this.scene.remove(hz.mesh);
    }
    this.delayedHazards = [];
    for (const sm of this.summons) {
      if (sm.mesh) this.scene.remove(sm.mesh);
    }
    this.summons = [];
    for (const ap of this.acidPools) {
      if (ap.mesh) this.scene.remove(ap.mesh);
    }
    this.acidPools = [];
    for (const ob of this.orbitalBlades) {
      if (ob.mesh) this.scene.remove(ob.mesh);
    }
    this.orbitalBlades = [];
    const disposeExtraGroup = (grp) => {
      if (!grp) return;
      if (grp.parent) grp.parent.remove(grp);
      grp.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    };
    for (const fo of this.floorObjects) {
      if (fo.obj && fo.obj.root) disposeExtraGroup(fo.obj.root);
    }
    this.floorObjects = [];
    if (this.descentPortal && this.descentPortal.root) {
      disposeExtraGroup(this.descentPortal.root);
    }
    this.lockedEnemy = null;
    this.pinnedEnemy = null;
    this.lockReticle.root.visible = false;
    document.getElementById('boss-bar-wrap').classList.add('hidden');
  }

  computeRoomEntryDoorKey(room, enterX, enterZ) {
    const doorKeys = Object.keys((room && room.doors) || {});
    if (doorKeys.length === 0) return 'S';
    let bestKey = doorKeys[0];
    let bestDist = Infinity;
    for (const k of doorKeys) {
      const d = DIR_BY_KEY[k];
      if (!d) continue;
      const doorX = room.cx + d.dx * room.halfW;
      const doorZ = room.cz + d.dz * room.halfD;
      const dist = Math.hypot(enterX - doorX, enterZ - doorZ);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = k;
      }
    }
    return bestKey;
  }

  computeDoorRallySpot(room, doorKey, slotIdx = 0) {
    const openKeys = Object.keys((room && room.doors) || {});
    const validKey = (doorKey && room.doors && room.doors[doorKey]) ? doorKey : (openKeys[0] || 'S');
    const d = DIR_BY_KEY[validKey] || DIR_BY_KEY.S;
    const inX = -d.dx;
    const inZ = -d.dz;
    const latX = -d.dz;
    const latZ = d.dx;
    const doorX = room.cx + d.dx * room.halfW;
    const doorZ = room.cz + d.dz * room.halfD;
    const spread = [-1.05, -0.35, 0.35, 1.05][((slotIdx % 4) + 4) % 4];
    let wx = doorX + inX * 2.15 + latX * spread;
    let wz = doorZ + inZ * 2.15 + latZ * spread;
    wx = Math.max(room.cx - room.halfW + 1.15, Math.min(room.cx + room.halfW - 1.15, wx));
    wz = Math.max(room.cz - room.halfD + 1.15, Math.min(room.cz + room.halfD - 1.15, wz));
    for (const c of room.colliders || []) {
      const dx = wx - c.x;
      const dz = wz - c.z;
      const dist = Math.hypot(dx, dz);
      const minD = c.r + 0.55;
      if (dist < minD && dist > 0.0001) {
        wx += (dx / dist) * (minD - dist);
        wz += (dz / dist) * (minD - dist);
      }
    }
    return { x: wx, z: wz, yaw: Math.atan2(inX, inZ) };
  }

  teleportHeroToRoomDoor(room, doorKey, enteredByName = '') {
    if (!room || !this.hero) return;
    if (this.mode === 'weapon') {
      this.closeWeaponModalWithoutTaking();
    } else if (this.mode === 'paused') {
      this.closePauseMenu();
    }
    const slotIdx = this.coopSlotIndex ? this.coopSlotIndex() : 0;
    const spot = this.computeDoorRallySpot(room, doorKey, slotIdx);
    this.hero.x = spot.x;
    this.hero.z = spot.z;
    this.hero.vx = 0;
    this.hero.vz = 0;
    this.hero.dashTimer = 0;
    this.hero.yaw = spot.yaw;
    if (!this.hero.downed) {
      this.hero.invuln = Math.max(this.hero.invuln || 0, 0.65);
    }
    if (this.heroRig && this.heroRig.root) {
      this.heroRig.root.position.set(spot.x, 0, spot.z);
      this.heroRig.root.rotation.y = spot.yaw;
    }
    this.currentRoom = room;
    this._netStateAccum = 1.0;
    this.vfx.spawnRing(spot.x, spot.z, 1.65, 0.42, 0x63dcff, false);
    this.vfx.burst(spot.x, 1.05, spot.z, 0x63dcff, 16, 4.2, 3.2);
    if (enteredByName) {
      this.spawnFloatingText(spot.x, 2.25, spot.z, tUI().floatRoomRallied(enteredByName), '#8ce8ff', 'callout');
    }
  }

  enterRoom(room, fromNetwork = false, meta = null) {
    if (this.isCoopClient && this.isCoopClient() && !fromNetwork) {
      this.currentRoom = room;
      const needsHostEnter = !room.visited || (!room.cleared && room.spawns.length > 0 && !room.locked);
      if (needsHostEnter) {
        const nowMs = performance.now();
        if (!room._enterReqAt || nowMs - room._enterReqAt > 500) {
          room._enterReqAt = nowMs;
          this.lan.relay({
            kind: 'room_enter_req',
            floorIndex: this.floorIndex || 0,
            roomId: room.id,
            enterX: +this.hero.x.toFixed(2),
            enterZ: +this.hero.z.toFixed(2)
          }, 'host');
        }
      }
      this.updateHUD();
      this.drawMinimap();
      return;
    }

    const firstVisit = !room.visited;
    const isCombatType = room.type === 'combat' || room.type === 'elite' || room.type === 'boss';
    const needsCombatLock = isCombatType && !room.cleared && room.spawns.length > 0 && !room.locked;
    const inCoop = !!(this.isCoopActive && this.isCoopActive());
    const enteredById = (meta && meta.enteredById) ? meta.enteredById : (inCoop ? this.lan.clientId : null);
    const enterX = (meta && Number.isFinite(meta.enterX)) ? meta.enterX : this.hero.x;
    const enterZ = (meta && Number.isFinite(meta.enterZ)) ? meta.enterZ : this.hero.z;
    const rallyDoorKey = (inCoop && needsCombatLock)
      ? this.computeRoomEntryDoorKey(room, enterX, enterZ)
      : null;
    const enteredByName = enteredById === this.lan?.clientId
      ? this.localPlayerName
      : (this.remotePlayers?.get(enteredById)?.name || 'Ally');

    room.visited = true;
    const isLocalEntrant = !inCoop || !enteredById || enteredById === this.lan?.clientId;
    if (inCoop && needsCombatLock && rallyDoorKey && !isLocalEntrant) {
      const alreadyInside = Math.abs(this.hero.x - room.cx) <= room.halfW - 1.6
        && Math.abs(this.hero.z - room.cz) <= room.halfD - 1.6;
      if (!alreadyInside) {
        this.teleportHeroToRoomDoor(room, rallyDoorKey, enteredByName);
      } else {
        this.currentRoom = room;
      }
    } else if (isLocalEntrant) {
      this.currentRoom = room;
    }

    if (firstVisit) {
      this.totalRoomsExplored++;
      if (needsCombatLock || this.currentRoom === room) {
        const rt = getRoomText(room);
        this.showBanner(rt.title, rt.subtitle);
      }
    }

    if (needsCombatLock) {
      room.locked = true;
      this.sfx.setBiomeAmbience(this.dungeon?.biome?.id, true);
      this.sfx.gateSlam(false);
      this.cameraShake = Math.max(this.cameraShake, 0.25);
      if (room.type === 'boss') this.sfx.bossRoar(false, { x: room.cx, z: room.cz });

      const dx = room.cx - this.hero.x;
      const dz = room.cz - this.hero.z;
      if (Math.abs(dx) <= room.halfW + 1.8 && Math.abs(dz) <= room.halfD + 1.8) {
        if (Math.abs(dx) > room.halfW - 1.6) {
          this.hero.x = room.cx - Math.sign(dx) * (room.halfW - 1.95);
        }
        if (Math.abs(dz) > room.halfD - 1.6) {
          this.hero.z = room.cz - Math.sign(dz) * (room.halfD - 1.95);
        }
      }

      const sc = this.getActiveScaling
        ? this.getActiveScaling()
        : { extraSpawns: 0, bossExtraGuards: 0, spawnMult: 1.0, maxCombatWaves: 2, maxEliteWaves: 2, difficultyId: 'standard' };
      const rawList = [];
      room.spawns.forEach((s) => {
        for (let i = 0; i < s.count; i++) rawList.push(s.type);
      });
      const bonusPool = this.floorCfg.depth >= 3
        ? ['thrall', 'stalker', 'acolyte', 'juggernaut']
        : ['thrall', 'stalker', 'acolyte'];
      const totalExtra = this.floorCfg.extraSpawns + (sc.extraSpawns || 0);
      const list = [];
      room.pendingWaves = [];
      room.waveIndex = 1;
      room.totalWaves = 1;

      if (room.type === 'boss') {
        list.push(...rawList);
        if ((sc.bossExtraGuards || 0) > 0) {
          const bossGuards = ['acolyte', 'stalker', 'juggernaut'];
          for (let g = 0; g < sc.bossExtraGuards; g++) {
            list.push(bossGuards[g % bossGuards.length]);
          }
        }
      } else {
        const combined = [...rawList];
        for (let b = 0; b < totalExtra; b++) {
          combined.push(bonusPool[(room.id + b) % bonusPool.length]);
        }
        const spawnMult = sc.spawnMult || 1.0;
        const wave1Count = Math.max(5, Math.round(combined.length * spawnMult));
        for (let i = 0; i < wave1Count; i++) {
          list.push(combined[i % Math.max(1, combined.length)]);
        }
        let totalWaves = 2;
        const diffId = sc.difficultyId || this.selectedDifficultyId || 'standard';
        if (room.type === 'elite') {
          if (diffId === 'bloodfire' || diffId === 'abyssal') totalWaves = 3;
          else if (diffId === 'standard' && this.floorCfg.depth >= 3) totalWaves = 3;
          else totalWaves = sc.maxEliteWaves || 2;
        } else {
          if (diffId === 'pilgrim') totalWaves = (room.id % 3 === 0) ? 2 : 1;
          else if (diffId === 'bloodfire') totalWaves = (room.id % 2 === 0) ? 3 : 2;
          else if (diffId === 'abyssal') totalWaves = 3;
          else totalWaves = sc.maxCombatWaves || 2;
        }
        room.totalWaves = totalWaves;
        for (let w = 2; w <= totalWaves; w++) {
          const wCount = Math.max(5, Math.round(wave1Count * (w === 2 ? 0.88 : 0.80)));
          const waveTypes = [];
          for (let k = 0; k < wCount; k++) {
            const poolSrc = (k % 3 === 0) ? bonusPool : combined;
            waveTypes.push(poolSrc[(room.id + w * 5 + k) % poolSrc.length]);
          }
          room.pendingWaves.push({ types: waveTypes });
        }
      }

      const doorAnchor = rallyDoorKey
        ? this.computeDoorRallySpot(room, rallyDoorKey, 1)
        : { x: this.hero.x, z: this.hero.z };
      const spots = this.pickDispersedRoomSpawns(room, list, {
        minAnchorDist: 4.1,
        phaseOffset: room.id * 0.77 + 0.35,
        extraAvoid: [{ x: doorAnchor.x, z: doorAnchor.z, minD: 4.3 }]
      });
      const spawnedEnemies = [];
      list.forEach((type, idx) => {
        const safe = spots[idx] || { x: room.cx, z: room.cz };
        spawnedEnemies.push(this.spawnEnemy(type, safe.x, safe.z, room));
      });

      if (this.isCoopHost && this.isCoopHost()) {
        this.lan.relay({
          kind: 'room_lock_spawn',
          floorIndex: this.floorIndex || 0,
          roomId: room.id,
          firstVisit,
          locked: true,
          isTrial: false,
          rallyDoorKey,
          enteredById,
          enteredByName,
          enemies: spawnedEnemies.map((e) => ({
            eid: e.eid,
            type: e.type,
            x: +e.x.toFixed(2),
            z: +e.z.toFixed(2),
            yaw: +e.yaw.toFixed(2),
            hp: e.hp,
            maxHp: e.maxHp,
            shield: e.shield,
            maxShield: e.maxShield,
            dmg: e.dmg,
            cinders: e.cinders,
            affixes: e.affixes
          }))
        }, 'others');
      }
    } else if (firstVisit && this.isCoopHost && this.isCoopHost()) {
      this.lan.relay({
        kind: 'room_lock_spawn',
        floorIndex: this.floorIndex || 0,
        roomId: room.id,
        firstVisit: true,
        locked: false,
        isTrial: false,
        rallyDoorKey: null,
        enteredById,
        enteredByName,
        enemies: []
      }, 'others');
    }

    this.checkFloorExplorationMastery();
    this.updateHUD();
    this.drawMinimap();
  }

  spawnNextRoomWave(room) {
    if (!room || !Array.isArray(room.pendingWaves) || room.pendingWaves.length === 0) return false;
    if (this.isCoopClient && this.isCoopClient()) return false;
    const nextWave = room.pendingWaves.shift();
    const waveTypes = Array.isArray(nextWave) ? nextWave : (nextWave.types || []);
    if (waveTypes.length === 0) return false;

    room.waveIndex = (room.waveIndex || 1) + 1;
    const totalWaves = Math.max(room.waveIndex, room.totalWaves || room.waveIndex);
    const ui = tUI();
    const bannerTitle = ui.bannerWaveTitle(room.waveIndex, totalWaves);
    const bannerSub = ui.bannerWaveSub;
    this.showBanner(bannerTitle, bannerSub);
    this.sfx.waveHorn();
    this.cameraShake = Math.max(this.cameraShake, 0.22);
    this.vfx.spawnRing(room.cx, room.cz, 4.2, 0.55, 0xff7b42, false);

    const spawnedEnemies = [];
    const spots = this.pickDispersedRoomSpawns(room, waveTypes, {
      minAnchorDist: 3.8,
      phaseOffset: room.waveIndex * 1.31 + room.id * 0.53
    });
    waveTypes.forEach((type, idx) => {
      const safe = spots[idx] || { x: room.cx, z: room.cz };
      const forcedAffix = nextWave.trialWave
        ? (idx === 0 ? ['warded', 'frenzied'] : (idx % 2 === 0 ? ['volatile'] : undefined))
        : undefined;
      spawnedEnemies.push(this.spawnEnemy(type, safe.x, safe.z, room, forcedAffix ? { affixes: forcedAffix } : {}));
    });

    if (this.isCoopHost && this.isCoopHost()) {
      this.lan.relay({
        kind: 'room_wave_spawn',
        floorIndex: this.floorIndex || 0,
        roomId: room.id,
        bannerTitle,
        bannerSub,
        enemies: spawnedEnemies.map((ev) => ({
          eid: ev.eid,
          type: ev.type,
          x: +ev.x.toFixed(2),
          z: +ev.z.toFixed(2),
          yaw: +ev.yaw.toFixed(2),
          hp: ev.hp,
          maxHp: ev.maxHp,
          shield: ev.shield,
          maxShield: ev.maxShield,
          dmg: ev.dmg,
          cinders: ev.cinders,
          affixes: ev.affixes,
          bossSummon: false
        }))
      }, 'others');
    }
    this.updateHUD();
    this.drawMinimap();
    return true;
  }

  spawnBossSummonWave(bossEnemy) {
    if (!bossEnemy || !bossEnemy.room) return;
    if (this.isCoopClient && this.isCoopClient()) return;
    const room = bossEnemy.room;
    const sc = this.getActiveScaling ? this.getActiveScaling() : { bossExtraGuards: 0, spawnMult: 1.0 };
    const guardCount = Math.min(8, Math.max(4, Math.round((4 + Math.floor(this.floorIndex * 0.7) + (sc.bossExtraGuards || 0)) * Math.max(0.85, sc.spawnMult || 1.0))));
    const guardPool = this.floorCfg.depth >= 3
      ? ['thrall', 'stalker', 'acolyte', 'juggernaut']
      : ['thrall', 'stalker', 'acolyte'];
    const ui = tUI();
    const bannerTitle = ui.bannerBossGuardsTitle;
    const bannerSub = ui.bannerBossGuardsSub;
    this.showBanner(bannerTitle, bannerSub);
    this.sfx.bossRoar(true, { x: bossEnemy.x, z: bossEnemy.z });
    this.cameraShake = Math.max(this.cameraShake, 0.34);
    this.vfx.spawnRing(bossEnemy.x, bossEnemy.z, 4.4, 0.60, 0xff5522, true);

    const guardTypes = [];
    for (let i = 0; i < guardCount; i++) {
      guardTypes.push(guardPool[(i + this.floorIndex) % guardPool.length]);
    }
    const spots = this.pickDispersedRoomSpawns(room, guardTypes, {
      minAnchorDist: 3.8,
      phaseOffset: (bossEnemy.summoned35 ? 1.85 : 0.55) + this.floorIndex,
      extraAvoid: [{ x: bossEnemy.x, z: bossEnemy.z, minD: 2.8 }]
    });
    const spawnedEnemies = [];
    for (let i = 0; i < guardTypes.length; i++) {
      const safe = spots[i] || { x: room.cx, z: room.cz };
      const type = guardTypes[i];
      spawnedEnemies.push(this.spawnEnemy(type, safe.x, safe.z, room, { bossSummon: true }));
    }
    if (this.isCoopHost && this.isCoopHost()) {
      this.lan.relay({
        kind: 'room_wave_spawn',
        floorIndex: this.floorIndex || 0,
        roomId: room.id,
        bannerTitle,
        bannerSub,
        enemies: spawnedEnemies.map((ev) => ({
          eid: ev.eid,
          type: ev.type,
          x: +ev.x.toFixed(2),
          z: +ev.z.toFixed(2),
          yaw: +ev.yaw.toFixed(2),
          hp: ev.hp,
          maxHp: ev.maxHp,
          shield: ev.shield,
          maxShield: ev.maxShield,
          dmg: ev.dmg,
          cinders: ev.cinders,
          affixes: ev.affixes,
          bossSummon: true
        }))
      }, 'others');
    }
    this.updateHUD();
  }

  checkFloorExplorationMastery() {
    if (this.floorMasteryGranted || !this.dungeon) return;
    const allVisitedAndCleared = this.dungeon.rooms.every((r) => r.visited && r.cleared);
    if (!allVisitedAndCleared) return;
    this.floorMasteryGranted = true;
    const bonusCinders = Math.round(75 * this.floorCfg.cinderMult * (this.hero?.cinderGainMult || 1.0));
    this.hero.cinders += bonusCinders;
    this.hero.maxHp += 15;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 30);
    this.sfx.floorMasteryFanfare();
    this.vfx.spawnRing(this.hero.x, this.hero.z, 4.2, 0.65, 0xffd166, false);
    const ui = tUI();
    this.spawnFloatingText(
      this.hero.x,
      2.5,
      this.hero.z,
      `${ui.bannerMasteryTitle(this.floorCfg.roman)} · ${ui.floatCinders(bonusCinders)}`,
      '#ffe29e',
      'callout'
    );
    this.updateHUD();
  }

  spawnEnemy(type, x, z, room, customOpts = {}) {
    const rig = this.acquireEnemyRig(type);
    rig.root.position.set(x, 0, z);
    this.scene.add(rig.root);

    const baseStats = {
      thrall:     { hp: 380,   speed: 3.30, radius: 0.50, dmg: 18, range: 1.90, cd: 1.22, cinders: 4 },
      stalker:    { hp: 330,   speed: 4.28, radius: 0.46, dmg: 22, range: 5.10, cd: 1.45, cinders: 5 },
      acolyte:    { hp: 340,   speed: 3.80, radius: 0.48, dmg: 20, range: 11.60, cd: 1.25, cinders: 6 },
      juggernaut: { hp: 1120,  speed: 2.23, radius: 0.76, dmg: 34, range: 2.60, cd: 2.15, cinders: 14, poise: true },
      warden:     { hp: 15000, speed: 3.07, radius: 1.05, dmg: 36, range: 3.25, cd: 1.65, cinders: 135, poise: true, boss: true }
    }[type];

    const fc = this.floorCfg;
    const sc = this.getActiveScaling ? this.getActiveScaling() : {
      playerCount: 1,
      mobHpMult: 1,
      bossHpMult: 1,
      shieldMult: 1,
      dmgMult: 1,
      enemySpeedMult: 1,
      enemyAtkRateMult: 1,
      cinderMult: 1
    };
    const affixes = customOpts.affixes || rollEnemyAffixes(fc, type, !!baseStats.boss, sc);
    const isEliteMob = !baseStats.boss && affixes.length > 0;
    const eliteHpBoost = isEliteMob ? 1.65 : 1.0;
    const eliteDmgBoost = isEliteMob ? 1.18 : 1.0;

    const unscaledMaxHp = baseStats.boss
      ? (fc.bossBaseHp || Math.round(baseStats.hp * fc.hpMult))
      : Math.round(baseStats.hp * fc.hpMult * eliteHpBoost);
    const hpMult = baseStats.boss ? sc.bossHpMult : sc.mobHpMult;
    const maxHp = customOpts.maxHp ?? Math.round(unscaledMaxHp * hpMult);
    const dmg = customOpts.dmg ?? Math.round(baseStats.dmg * eliteDmgBoost * fc.dmgMult * sc.dmgMult);
    const speed = baseStats.speed * fc.speedMult * (sc.enemySpeedMult || 1.0);
    const atkRateMult = Math.max(0.6, sc.enemyAtkRateMult || 1.0);
    const cinderGain = this.hero?.cinderGainMult || 1.0;
    const cinders = customOpts.cinders ?? Math.max(1, Math.round(baseStats.cinders * fc.cinderMult * (isEliteMob ? 1.50 : 1.0) * sc.cinderMult * cinderGain));

    let maxShield = 0;
    let unscaledMaxShield = 0;
    let shieldMesh = null;
    const hasBossShield = baseStats.boss && ((fc.bossShieldHp || 0) > 0 || sc.forceCoopBossWard || affixes.includes('warded'));
    if (affixes.includes('warded') || hasBossShield) {
      unscaledMaxShield = baseStats.boss
        ? ((fc.bossShieldHp || 0) > 0 ? fc.bossShieldHp : Math.round(unscaledMaxHp * 0.24))
        : Math.round(unscaledMaxHp * 0.35);
      maxShield = customOpts.maxShield ?? Math.round(unscaledMaxShield * (baseStats.boss ? sc.bossHpMult : sc.shieldMult));
      if (!rig._shieldMesh) {
        const shKey = `sh_${type}`;
        let shGeo = this.sharedEnemyFxGeos.get(shKey);
        if (!shGeo) {
          shGeo = new THREE.SphereGeometry(baseStats.radius * 1.45, 14, 10);
          this.sharedEnemyFxGeos.set(shKey, shGeo);
        }
        const shMat = new THREE.MeshBasicMaterial({
          color: 0x55ccff,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        rig._shieldMesh = new THREE.Mesh(shGeo, shMat);
        rig._shieldMesh.userData.ignoreAO = true;
        rig._shieldMesh.position.y = baseStats.boss ? 1.55 : 1.05;
        rig.root.add(rig._shieldMesh);
      }
      rig._shieldMesh.material.opacity = 0.24;
      rig._shieldMesh.visible = true;
      shieldMesh = rig._shieldMesh;
    } else if (rig._shieldMesh) {
      rig._shieldMesh.visible = false;
    }

    let affixRing = null;
    if (isEliteMob) {
      rig.body.scale.multiplyScalar(1.12);
      const affDef = AFFIX_BY_ID[affixes[0]];
      const affColor = affDef ? affDef.color : 0xffaa33;
      if (!rig._affixRing) {
        const rk = `aff_${type}`;
        let rGeo = this.sharedEnemyFxGeos.get(rk);
        if (!rGeo) {
          rGeo = new THREE.RingGeometry(baseStats.radius * 1.05, baseStats.radius * 1.24, 24);
          this.sharedEnemyFxGeos.set(rk, rGeo);
        }
        const rMat = new THREE.MeshBasicMaterial({
          color: affColor,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        rig._affixRing = new THREE.Mesh(rGeo, rMat);
        rig._affixRing.userData.ignoreAO = true;
        rig._affixRing.rotation.x = -Math.PI / 2;
        rig._affixRing.position.y = 0.03;
        rig.root.add(rig._affixRing);
      } else {
        rig._affixRing.material.color.setHex(affColor);
      }
      rig._affixRing.visible = true;
      affixRing = rig._affixRing;
    } else if (rig._affixRing) {
      rig._affixRing.visible = false;
    }

    const seqNum = this.enemySeq;
    const enemy = {
      eid: customOpts.eid || `e_${this.enemySeq++}`,
      type,
      room,
      rig,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw: 0,
      aiSeed: (seqNum * 1.6180339887) % (Math.PI * 2),
      strafeDir: (seqNum % 2 === 0) ? 1 : -1,
      flankAngle: ((seqNum % 7) - 3) * (type === 'juggernaut' ? 0.11 : 0.21),
      steerSide: (seqNum % 2 === 0) ? 1 : -1,
      steerTimer: 0,
      hp: maxHp,
      maxHp,
      unscaledMaxHp,
      shield: maxShield,
      maxShield,
      unscaledMaxShield,
      shieldMesh,
      affixRing,
      affixes,
      threatMap: {},
      enraged: false,
      chillTimer: 0,
      stunTimer: 0,
      stormTimer: affixes.includes('stormcaller') ? 2.4 + Math.random() * 1.5 : 0,
      speed,
      radius: baseStats.radius,
      dmg,
      range: baseStats.range,
      baseCd: +(baseStats.cd / atkRateMult).toFixed(3),
      cinders,
      poise: !!baseStats.poise || maxShield > 0,
      boss: !!baseStats.boss,
      isEliteMob,
      bossSummon: !!customOpts.bossSummon,
      summoned70: false,
      summoned35: false,
      summoned18: false,
      bossEnraged: false,
      bossStyle: baseStats.boss ? fc.bossStyle : null,
      cooldown: ((0.45 + Math.random() * 0.50) * (type === 'acolyte' ? 0.5 : 1.0)) / atkRateMult,
      state: 'chase',
      stateTimer: 0,
      strikeHitDone: false,
      burnTimer: 0,
      burnDps: 0,
      flashTimer: 0,
      trapImmunityTimer: 0,
      leapTargetX: 0,
      leapTargetZ: 0,
      leapStartX: 0,
      leapStartZ: 0,
      bossCycle: 0
    };

    const biomeId = this.dungeon ? this.dungeon.biome.id : null;
    if (enemy.boss && this.dungeon && this.dungeon.biome) {
      const bossHex = this.dungeon.biome.palette.bossFlameHex;
      rig.glowMat.emissive.setHex(bossHex);
      rig.cfg.glow = bossHex;
      if (rig.bossLight) rig.bossLight.color.setHex(bossHex);
    }
    this.vfx.burst(x, 1.0, z, rig.cfg.glow, 18, 4.2, 6.0);
    this.vfx.spawnRing(x, z, enemy.boss ? 2.8 : 1.3, 0.55, rig.cfg.glow, false);
    this.enemies.push(enemy);

    if (enemy.boss) {
      document.getElementById('boss-name').textContent = getBossName(biomeId, fc);
      document.getElementById('boss-bar-wrap').classList.remove('hidden');
      document.getElementById('boss-fill').style.width = '100%';
      const bossHpNum = document.getElementById('boss-hp-num');
      if (bossHpNum) {
        bossHpNum.textContent = enemy.maxShield > 0
          ? `${enemy.hp} / ${enemy.maxHp} · ⛨${enemy.shield}`
          : `${enemy.hp} / ${enemy.maxHp}`;
      }
      const shTrack = document.getElementById('boss-shield-track');
      if (enemy.maxShield > 0) {
        shTrack.classList.remove('hidden');
        document.getElementById('boss-shield-fill').style.width = '100%';
      } else {
        shTrack.classList.add('hidden');
      }
    }
    return enemy;
  }

  makeOrbDropSeed(x, z, totalValue = 0) {
    this._orbSeq = ((this._orbSeq || 0) + 1) & 0x7fffffff;
    return (
      ((Math.round(x * 100) * 73856093) ^
        (Math.round(z * 100) * 19349663) ^
        ((totalValue | 0) * 83492791) ^
        (this._orbSeq * 2654435761)) >>>
      0
    ) || 1;
  }

  spawnCinderOrbs(x, z, totalValue, opts = {}) {
    if (!totalValue || totalValue <= 0) return;
    const orbKind = opts.orbKind || 'cinder';
    const seed = (opts.seed >>> 0) || this.makeOrbDropSeed(x, z, totalValue);
    if (!opts.fromNet && !opts.handledByEvent && !opts.localOnly && this.isCoopActive && this.isCoopActive()) {
      this.lan.relay({
        kind: 'cinder_orbs_spawn',
        x: +x.toFixed(2),
        z: +z.toFixed(2),
        totalValue: Math.round(totalValue),
        orbKind,
        seed
      }, 'others');
    }
    let s = seed;
    const nextRand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const isVitality = orbKind === 'vitality';
    const isEnergy = orbKind === 'energy';
    const totalInt = Math.max(1, Math.round(totalValue));
    const count = isVitality
      ? 1
      : (isEnergy ? Math.min(4, Math.max(1, Math.round(totalInt / 6))) : Math.min(7, Math.max(2, Math.round(totalInt / 6))));
    const baseEach = Math.max(1, Math.floor(totalInt / count));
    const rem = Math.max(0, totalInt - baseEach * count);
    for (let i = 0; i < count; i++) {
      const sp = this.acquireOrbSprite(orbKind);
      const ang = nextRand() * Math.PI * 2;
      const spd = (isVitality ? 1.8 : (isEnergy ? 2.15 : 2.5)) + nextRand() * 2.8;
      sp.position.set(x, 0.65, z);
      this.scene.add(sp);
      this.cinderOrbs.push({
        mesh: sp,
        orbKind,
        x,
        y: 0.65,
        z,
        vx: Math.cos(ang) * spd,
        vy: 3.2 + nextRand() * 2.0,
        vz: Math.sin(ang) * spd,
        value: i < rem ? baseEach + 1 : baseEach,
        phase: nextRand() * Math.PI * 2,
        age: 0
      });
    }
  }

  breakProp(prop, fromRemote = false, netDrop = null) {
    if (prop.broken) return;
    prop.broken = true;
    prop.mesh.visible = false;
    const baseDrop = netDrop && Number.isFinite(netDrop.cinderDrop)
      ? netDrop.cinderDrop
      : Math.max(2, Math.round((3 + Math.floor(Math.random() * 4)) * this.floorCfg.cinderMult * (this.hero?.cinderGainMult || 1.0)));
    const vitalityDrop = netDrop && Number.isFinite(netDrop.vitalityDrop)
      ? netDrop.vitalityDrop
      : (Math.random() < 0.18 ? Math.max(8, Math.round((this.hero?.maxHp || 160) * 0.07)) : 0);
    const energyDrop = netDrop && Number.isFinite(netDrop.energyDrop)
      ? netDrop.energyDrop
      : (Math.random() < 0.26 ? 10 : 0);
    const orbSeed = (netDrop && netDrop.orbSeed) || this.makeOrbDropSeed(prop.x, prop.z, baseDrop);
    if (!fromRemote && this.isCoopActive && this.isCoopActive() && prop.netId) {
      this.lan.relay({
        kind: 'interact_sync',
        sub: 'prop_break',
        netId: prop.netId,
        cinderDrop: baseDrop,
        vitalityDrop,
        energyDrop,
        orbSeed
      }, 'others');
    }
    this.sfx.propBreak(prop.kind, { x: prop.x, z: prop.z });
    const pal = this.dungeon && this.dungeon.biome ? this.dungeon.biome.palette : null;
    const col = pal
      ? (prop.kind === 'barrel' ? pal.propSecondaryHex : pal.propPrimaryHex)
      : (prop.kind === 'barrel' ? 0xc47d3b : 0xd8ceb8);
    this.vfx.burst(prop.x, 0.55, prop.z, col, 20, 5.2, 11.0);
    this.dungeon.addFloorDecal(prop.x, prop.z, pal ? pal.decalHex : 0x16110d, 1.35, 0.55);
    this.spawnCinderOrbs(prop.x, prop.z, baseDrop, { handledByEvent: true, seed: orbSeed });
    if (vitalityDrop > 0) {
      this.spawnCinderOrbs(prop.x, prop.z, vitalityDrop, {
        handledByEvent: true,
        orbKind: 'vitality',
        seed: (orbSeed ^ 0x9e3779b9) >>> 0
      });
    }
    if (energyDrop > 0) {
      this.spawnCinderOrbs(prop.x, prop.z, energyDrop, {
        handledByEvent: true,
        orbKind: 'energy',
        seed: (orbSeed ^ 0x51f7a3d1) >>> 0
      });
    }
    if (!fromRemote) onClassPropBroken(this);
  }

  showBanner(title, sub) {
    const el = document.getElementById('wave-banner');
    document.getElementById('banner-title').textContent = title;
    document.getElementById('banner-sub').textContent = sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  recordConsumedOneTimeNetId(netId) {
    if (!netId) return;
    if (!this.consumedOneTimeNetIds) this.consumedOneTimeNetIds = new Set();
    this.consumedOneTimeNetIds.add(netId);
  }

  consumeOneTimeInteractableVisual(inter) {
    if (!inter) return;
    inter.used = true;
    inter._claiming = false;
    if (inter.meshRoot) inter.meshRoot.visible = false;
    if (inter.glow) inter.glow.visible = false;
    if (inter.curio && inter.curio.root) inter.curio.root.visible = false;
    if (inter.crystal) inter.crystal.visible = false;
    if (inter.halo) inter.halo.visible = false;
    if (inter.pedestal && inter.pedestal.root) inter.pedestal.root.visible = false;
    if (inter.room && inter.collider && Array.isArray(inter.room.colliders)) {
      const cIdx = inter.room.colliders.indexOf(inter.collider);
      if (cIdx !== -1) inter.room.colliders.splice(cIdx, 1);
    }
    if (inter.bossChoiceGroup && !(this.isCoopActive && this.isCoopActive()) && this.dungeon) {
      for (const sib of this.dungeon.interactables) {
        if (sib !== inter && !sib.used && sib.bossChoiceGroup === inter.bossChoiceGroup) {
          sib.used = true;
          if (sib.pedestal && sib.pedestal.root) sib.pedestal.root.visible = false;
          if (sib.room && sib.collider && Array.isArray(sib.room.colliders)) {
            const sIdx = sib.room.colliders.indexOf(sib.collider);
            if (sIdx !== -1) sib.room.colliders.splice(sIdx, 1);
          }
          this.vfx.burst(sib.x, 1.15, sib.z, 0xffae2b, 22, 4.8, 5.0);
        }
      }
    }
    if (this.activeInteractable === inter) {
      this.activeInteractable = null;
      this.updateInteractPromptUI();
    }
    this.refreshInteractableLabels();
    this.drawMinimap();
    this.updateHUD();
  }

  spawnSharedInteractableGroundOrbs(inter, seedOverride = null) {
    if (!inter) return;
    const gainMult = this.hero?.cinderGainMult || 1.0;
    if (inter.kind === 'soul_cache') {
      const val = Math.round((inter.cinderReward || 45) * gainMult);
      const seed = seedOverride || this.makeOrbDropSeed(inter.x, inter.z, val);
      this.spawnCinderOrbs(inter.x, inter.z, val, { handledByEvent: true, seed });
    } else if (inter.kind === 'vault_chest') {
      const val = Math.round(45 * this.floorCfg.cinderMult * gainMult);
      const seed = seedOverride || this.makeOrbDropSeed(inter.x, inter.z + 1.0, val);
      this.spawnCinderOrbs(inter.x, inter.z + 1.0, val, { handledByEvent: true, seed });
    }
  }

  grantOneTimeInteractableReward(inter, opts = {}) {
    if (!inter) return;
    const h = this.hero;
    if (inter.kind === 'soul_cache') {
      const heal = Math.round(h.maxHp * 0.25);
      h.hp = Math.min(h.maxHp, h.hp + heal);
      this.sfx.soulCacheOpen({ x: inter.x, z: inter.z });
      this.vfx.burst(inter.x, 1.15, inter.z, 0x62ffd6, 30, 5.5, 5.0);
      this.spawnSharedInteractableGroundOrbs(inter, opts.orbSeed);
      this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatSoulCache(heal), '#6ff0d0', 'heal');
      this.updateHUD();
      return;
    }
    if (inter.kind === 'vault_chest') {
      this.sfx.vaultChestOpen({ x: inter.x, z: inter.z });
      this.vfx.burst(inter.x, 1.2, inter.z, 0xffd166, 36, 6.5, 6.0);
      this.vfx.flash(inter.x, 1.6, inter.z, 0xffd166, 18);
      this.spawnSharedInteractableGroundOrbs(inter, opts.orbSeed);
      const vaultRoom = inter.room || this.currentRoom;
      this.openBoonShrine(() => tUI().bannerVaultUnlocked(getRoomText(vaultRoom).title));
      return;
    }
    if (inter.kind === 'weapon_pedestal') {
      const choiceIdx = opts.choiceIdx ?? 0;
      const wpn = inter.weaponInst;
      if (choiceIdx === 0 || choiceIdx === 1) {
        h.weapons[choiceIdx] = wpn;
        h.activeSlot = choiceIdx;
        this.mountActiveWeapon();
        this.sfx.weaponEquip(wpn);
        this.vfx.burst(h.x, 1.2, h.z, wpn.def.accentHex, 32, 6.2, 5.0);
        this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatEquipped(getWeaponText(wpn).name), wpn.def.accent, 'callout');
      } else {
        const val = opts.salvageVal ?? this._pendingSalvageValue ?? 35;
        h.cinders += val;
        h.hp = Math.min(h.maxHp, h.hp + 18);
        this.sfx.weaponSalvage({ x: inter.x, z: inter.z });
        this.vfx.burst(inter.x, 1.2, inter.z, 0xffaa44, 28, 5.8, 6.0);
        this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatCinders(val), '#ffb85c', 'callout');
      }
      this.pendingWeaponPedestal = null;
      document.getElementById('weapon-overlay')?.classList.add('hidden');
      if (this.mode === 'weapon') this.mode = 'explore';
      this.refreshInteractableLabels();
      this.updateHUD();
      if (this.pendingBoonQueue.length > 0) {
        const nextKicker = this.pendingBoonQueue.shift();
        const epoch = this.stateEpoch;
        setTimeout(() => {
          if (this.stateEpoch === epoch) this.openBoonShrine(nextKicker);
        }, 180);
      }
    }
  }

  triggerTrialObelisk(inter, triggeredById = null) {
    if (!inter || inter.used) return;
    this.consumeOneTimeInteractableVisual(inter);
    this.recordConsumedOneTimeNetId(inter.netId);
    const room = inter.room;
    if (!room.visited) {
      room.visited = true;
      this.totalRoomsExplored++;
    }
    const rallyDoorKey = this.computeRoomEntryDoorKey(room, inter.x, inter.z);
    const h = this.hero;
    if (Math.abs(h.x - room.cx) > room.halfW - 0.8 || Math.abs(h.z - room.cz) > room.halfD - 0.8) {
      this.teleportHeroToRoomDoor(room, rallyDoorKey);
    }
    this.currentRoom = room;
    room.locked = true;
    room.cleared = false;
    room.isTrialActive = true;
    const dx = room.cx - h.x;
    const dz = room.cz - h.z;
    if (Math.abs(dx) <= room.halfW + 1.8 && Math.abs(dz) <= room.halfD + 1.8) {
      if (Math.abs(dx) > room.halfW - 1.6) h.x = room.cx - Math.sign(dx) * (room.halfW - 1.95);
      if (Math.abs(dz) > room.halfD - 1.6) h.z = room.cz - Math.sign(dz) * (room.halfD - 1.95);
    }
    this.sfx.setBiomeAmbience(this.dungeon?.biome?.id, true);
    this.sfx.trialObeliskActivate({ x: inter.x, z: inter.z });
    this.cameraShake = Math.max(this.cameraShake, 0.35);
    this.vfx.spawnRing(inter.x, inter.z, 4.2, 0.65, 0xff2a55, true);
    const ui = tUI();
    this.showBanner(ui.bannerTrialStartTitle, ui.bannerTrialStartSub);

    const sc = this.getActiveScaling ? this.getActiveScaling() : { playerCount: 1, spawnMult: 1.0, maxEliteWaves: 2 };
    const baseWaveCount = Math.max(6, Math.round((6 + Math.floor(this.floorCfg.depth * 0.6) + (sc.playerCount - 1) * 2) * (sc.spawnMult || 1.0)));
    const pool = ['juggernaut', 'stalker', 'acolyte', 'thrall', 'stalker', 'acolyte'];
    const trialTypes = [];
    for (let k = 0; k < baseWaveCount; k++) {
      trialTypes.push(pool[k % pool.length]);
    }
    const totalTrialWaves = Math.max(2, sc.maxEliteWaves || 2);
    room.waveIndex = 1;
    room.totalWaves = totalTrialWaves;
    room.pendingWaves = [];
    for (let w = 2; w <= totalTrialWaves; w++) {
      const wTypes = [];
      for (let k = 0; k < baseWaveCount; k++) {
        wTypes.push(pool[(k + w) % pool.length]);
      }
      room.pendingWaves.push({ types: wTypes, trialWave: true });
    }
    const spawned = [];
    const trialSpots = this.pickDispersedRoomSpawns(room, trialTypes, {
      minAnchorDist: 3.8,
      phaseOffset: room.id * 0.91 + 0.6
    });
    trialTypes.forEach((t, idx) => {
      const spot = trialSpots[idx] || { x: room.cx, z: room.cz };
      const forcedAffix = idx === 0 ? ['warded', 'frenzied'] : ['volatile'];
      spawned.push(this.spawnEnemy(t, spot.x, spot.z, room, { affixes: forcedAffix }));
    });
    if (this.isCoopHost && this.isCoopHost()) {
      const trigId = triggeredById || this.lan.clientId;
      const trigName = trigId === this.lan.clientId
        ? this.localPlayerName
        : (this.remotePlayers?.get(trigId)?.name || 'Ally');
      this.lan.relay({
        kind: 'room_lock_spawn',
        floorIndex: this.floorIndex || 0,
        roomId: room.id,
        locked: true,
        isTrial: true,
        rallyDoorKey,
        enteredById: trigId,
        enteredByName: trigName,
        enemies: spawned.map((e) => ({
          eid: e.eid,
          type: e.type,
          x: +e.x.toFixed(2),
          z: +e.z.toFixed(2),
          yaw: +e.yaw.toFixed(2),
          hp: e.hp,
          maxHp: e.maxHp,
          shield: e.shield,
          maxShield: e.maxShield,
          dmg: e.dmg,
          cinders: e.cinders,
          affixes: e.affixes
        }))
      }, 'others');
    }
    this.updateHUD();
    this.drawMinimap();
  }

  tryInteract() {
    if (this.mode !== 'explore' || !this.activeInteractable || this.hero.downed) return;
    const inter = this.activeInteractable;
    const h = this.hero;

    if (inter.kind === 'revive_ally') {
      const peer = this.remotePlayers.get(inter.peerId);
      if (peer && peer.downed) {
        this.revivingPeerId = peer.id;
        peer.reviveProgress = Math.min(1.0, (peer.reviveProgress || 0) + 0.36);
        this.sfx.revivePulse(peer.reviveProgress, { x: peer.x, z: peer.z });
        this.vfx.spawnRing(peer.x, peer.z, 2.2, 0.35, 0x5effc8, false);
        this.lan.relay({
          kind: 'revive_progress',
          targetId: peer.id,
          progress: peer.reviveProgress
        }, 'all');
      }
      return;
    }

    if (inter.kind === 'descent_portal') {
      this.descendToNextFloor();
      return;
    }
    if (inter.kind === 'weapon_pedestal' && !inter.used) {
      this.openWeaponModal(inter);
      return;
    }
    if (inter.kind === 'trial_obelisk' && !inter.used) {
      if (this.isCoopClient && this.isCoopClient()) {
        this.lan.relay({ kind: 'interact_sync', sub: 'trial_req', netId: inter.netId }, 'host');
      } else {
        this.triggerTrialObelisk(inter);
      }
      return;
    }
    if (inter.kind === 'soul_cache' && !inter.used) {
      if (inter._claiming) return;
      if (this.isCoopClient && this.isCoopClient()) {
        inter._claiming = true;
        this.lan.relay({
          kind: 'interact_sync',
          sub: 'claim_one_time_req',
          netId: inter.netId,
          itemKind: 'soul_cache'
        }, 'host');
        return;
      }
      this.consumeOneTimeInteractableVisual(inter);
      const orbSeed = this.makeOrbDropSeed(inter.x, inter.z, inter.cinderReward || 35);
      if (this.isCoopHost && this.isCoopHost()) {
        this.recordConsumedOneTimeNetId(inter.netId);
        this.lan.relay({
          kind: 'interact_sync',
          sub: 'one_time_claimed',
          netId: inter.netId,
          itemKind: 'soul_cache',
          winnerId: this.lan.clientId,
          winnerName: this.localPlayerName,
          orbSeed
        }, 'others');
      }
      this.grantOneTimeInteractableReward(inter, { orbSeed });
      return;
    }
    if (inter.kind === 'vault_chest' && !inter.used) {
      if (inter._claiming) return;
      if (this.isCoopClient && this.isCoopClient()) {
        inter._claiming = true;
        this.lan.relay({
          kind: 'interact_sync',
          sub: 'claim_one_time_req',
          netId: inter.netId,
          itemKind: 'vault_chest'
        }, 'host');
        return;
      }
      this.consumeOneTimeInteractableVisual(inter);
      const orbSeed = this.makeOrbDropSeed(inter.x, inter.z + 1.0, 45);
      if (this.isCoopHost && this.isCoopHost()) {
        this.recordConsumedOneTimeNetId(inter.netId);
        this.lan.relay({
          kind: 'interact_sync',
          sub: 'one_time_claimed',
          netId: inter.netId,
          itemKind: 'vault_chest',
          winnerId: this.lan.clientId,
          winnerName: this.localPlayerName,
          orbSeed
        }, 'others');
      }
      this.grantOneTimeInteractableReward(inter, { orbSeed });
    } else if (inter.kind === 'healing_font' && !inter.used) {
      // Personal facility: each player uses their own charge independently
      inter.used = true;
      if (inter.waterPool) inter.waterPool.material.color.setHex(0x1f3640);
      h.hp = h.maxHp;
      h.energy = h.maxEnergy;
      h.flasks = Math.min(h.maxFlasks, h.flasks + 1);
      this.sfx.healingFontDrink({ x: inter.x, z: inter.z });
      this.vfx.burst(h.x, 1.2, h.z, 0x55ffd2, 34, 5.5, 4.0);
      this.vfx.spawnRing(inter.x, inter.z, 3.0, 0.55, 0x55ffd2, false);
      this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatVitalityFull, '#6ff0d0', 'callout');
      this.updateHUD();
    } else if (inter.kind === 'blood_pact' && !inter.used) {
      inter.used = true;
      if (inter.crystal) inter.crystal.visible = false;
      const costHp = Math.max(1, Math.min(h.hp - 1, Math.round(h.hp * 0.30)));
      h.hp -= costHp;
      const pactBonus = 0.08;
      h.dmgMult = +((h.dmgMult || 1) + pactBonus).toFixed(4);
      this.sfx.bloodPactSacrifice({ x: inter.x, z: inter.z });
      this.vfx.burst(inter.x, 1.4, inter.z, 0xff2244, 38, 6.8, 7.0);
      this.dungeon.addFloorDecal(inter.x, inter.z, 0x3b050e, 2.4, 0.78);
      this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatPact(costHp, Math.round(pactBonus * 100)), '#ff5c6c', 'callout');
      this.updateHUD();
      this.updateWeaponHUD();
      const epoch = this.stateEpoch;
      setTimeout(() => {
        if (this.stateEpoch === epoch) this.openBoonShrine(() => tUI().bannerBloodPact);
      }, 260);
    } else if (inter.kind === 'cinder_shrine' && !inter.used) {
      const maxUses = inter.maxUses || 2;
      if ((inter.uses || 0) >= maxUses) {
        inter.used = true;
        this.sfx.uiReject();
        this.spawnFloatingText(inter.x, 1.9, inter.z, tUI().floatShrineEmpty, '#ff8866', 'callout');
        return;
      }
      if (h.cinders < inter.cost) {
        this.sfx.uiReject();
        this.spawnFloatingText(inter.x, 1.9, inter.z, tUI().floatNeedCinders(inter.cost), '#ff8866', 'callout');
        return;
      }
      h.cinders -= inter.cost;
      inter.uses = (inter.uses || 0) + 1;
      if (inter.uses >= maxUses) {
        inter.used = true;
        if (inter.crystal) inter.crystal.visible = false;
        if (inter.haloRing) inter.haloRing.visible = false;
        if (this.activeInteractable === inter) this.activeInteractable = null;
      } else {
        const baseCost = inter.baseCost || Math.round(85 * this.floorCfg.cinderMult);
        inter.cost = Math.round(baseCost * 1.35);
      }
      this.sfx.cinderShrineOffer({ x: inter.x, z: inter.z });
      this.vfx.burst(inter.x, 1.25, inter.z, 0xffd166, 36, 6.2, 6.5);
      this.vfx.spawnRing(inter.x, inter.z, 3.0, 0.50, 0xffd166, false);
      this.refreshInteractableLabels();
      this.updateHUD();
      this.updateInteractPromptUI();
      const epoch = this.stateEpoch;
      setTimeout(() => {
        if (this.stateEpoch === epoch) this.openBoonShrine(() => tUI().bannerCinderShrine);
      }, 140);
    } else if (inter.kind === 'forge_anvil') {
      if (h.cinders < inter.cost) {
        this.sfx.uiReject();
        this.spawnFloatingText(inter.x, 1.9, inter.z, tUI().floatNeedCinders(inter.cost), '#ff8866', 'callout');
        return;
      }
      h.cinders -= inter.cost;
      inter.uses++;
      inter.cost += this.floorCfg.anvilStepCost || Math.round(45 * this.floorCfg.cinderMult);
      h.dmgMult = +((h.dmgMult || 1) + (this.floorCfg.anvilDmgPct || 0.05)).toFixed(4);
      h.critChance += this.floorCfg.anvilCritBonus;
      h.maxHp += this.floorCfg.anvilHpBonus;
      h.hp = Math.min(h.maxHp, h.hp + this.floorCfg.anvilHpBonus + 8);
      const curWpn = this.activeWeapon();
      if (curWpn) {
        temperWeaponInstance(curWpn);
        this.mountActiveWeapon();
      }
      this.refreshInteractableLabels();
      this.sfx.forgeAnvilTemper(inter.uses, { x: inter.x, z: inter.z });
      this.vfx.burst(inter.x, 1.15, inter.z, 0xff9933, 35, 6.8, 9.0);
      this.vfx.flash(inter.x, 1.5, inter.z, 0xff9933, 20);
      this.spawnFloatingText(h.x, 2.2, h.z, tUI().floatTempered(inter.uses), '#ffd45c', 'callout');
      this.updateHUD();
      this.updateWeaponHUD();
      this.updateInteractPromptUI();
    }
  }

  openWeaponModal(pedestalInter) {
    if (this.mode !== 'explore') return;
    this.mode = 'weapon';
    this.pendingWeaponPedestal = pedestalInter;
    if (this.weaponStudio) {
      this.weaponStudio.modalYaw = 0.42;
      this.weaponStudio.modalHoldTimer = 0;
    }
    this.sfx.weaponModalOpen(pedestalInter.weaponInst?.def?.rarity || 'common');
    this.updateInteractPromptUI();

    const wpn = pedestalInter.weaponInst;
    const ov = document.getElementById('weapon-overlay');
    const rarBase = wpn.rarityInfo ? wpn.rarityInfo.salvageBase : 35;
    this._pendingSalvageValue = Math.round((rarBase + wpn.tier * 18) * this.floorCfg.cinderMult * (this.hero?.cinderGainMult || 1.0));
    this.renderWeaponModal();
    ov.classList.remove('hidden');
    this.syncPauseButtonVisibility();
  }

  renderWeaponModal() {
    if (!this.pendingWeaponPedestal) return;
    const wpn = this.pendingWeaponPedestal.weaponInst;
    const ui = tUI();
    const wt = getWeaponText(wpn);
    const rarBase = wpn.rarityInfo ? wpn.rarityInfo.salvageBase : 35;
    const salvageCinders = this._pendingSalvageValue ?? Math.round((rarBase + wpn.tier * 18) * this.floorCfg.cinderMult * (this.hero?.cinderGainMult || 1.0));
    const isBoss = !!(wpn.bossOnly || wpn.def?.bossOnly);
    const zh = getLang() === 'zh';

    const showcaseEl = document.getElementById('wpn-new-showcase');
    if (showcaseEl) showcaseEl.style.setProperty('--new-rar-col', wpn.tierColor || '#f5dfb0');
    const kickerEl = document.getElementById('wpn-kicker');
    if (kickerEl) {
      kickerEl.textContent = isBoss ? ui.wpnKickerBoss : ui.wpnKicker;
      kickerEl.style.color = isBoss ? '#ffca58' : '';
    }
    const dragHintEl = document.getElementById('wpn-drag-hint');
    if (dragHintEl) dragHintEl.textContent = ui.wpnDragHint || (zh ? '拖拽旋转 360°' : 'Drag 360°');

    const newBadgesEl = document.getElementById('wpn-new-badges');
    if (newBadgesEl) {
      const catSvg = wpn.def.category === 'ranged' ? UI_SVG.ranged : UI_SVG.melee;
      const elInfo = getElementBadgeInfo(wpn.def.element);
      const affixPill = wt.affix ? `<span class="wpn-tag-pill" style="color:#f5dfb0">✦ ${wt.affix}</span>` : '';
      newBadgesEl.innerHTML = `
        <span class="wpn-tag-pill" style="color:${wpn.tierColor};border-color:${wpn.tierColor}55">${wt.tier}</span>
        <span class="wpn-tag-pill" title="${wt.cat}">${catSvg}</span>
        <span class="wpn-tag-pill" style="color:${elInfo.color}" title="${wt.elem}">${elInfo.svg}<span>${wt.elem}</span></span>
        ${affixPill}
      `;
    }

    const titleEl = document.getElementById('wpn-modal-title');
    const subEl = document.getElementById('wpn-modal-sub');
    const stripEl = document.getElementById('wpn-stat-strip');
    const cardsEl = document.getElementById('wpn-modal-cards');
    const leaveBtn = document.getElementById('btn-wpn-leave');
    if (leaveBtn) leaveBtn.textContent = ui.wpnLeaveShort || ui.wpnLeaveBtn;

    titleEl.textContent = wt.name;
    titleEl.style.color = wpn.tierColor;
    const effCd = +(wpn.def.skillCd * (wpn.skillCdMult || 1.0)).toFixed(1);
    subEl.textContent = `[${wt.skill} · ${effCd}s] ${wt.summary}`;

    const newTotRaw = wpn.dmg * (wpn.pellets || wpn.def.pellets || 1);
    const newRng = wpn.range || wpn.def.range;
    const newCrit = Math.round((wpn.critBonus || 0) * 100);
    const newEnCost = this.getWeaponShotEnergyCost(wpn);
    const newSkCost = this.getWeaponSkillEnergyCost(wpn);
    if (stripEl) {
      const chips = [
        [UI_SVG.dmg, ui.wpnStatDmg, wt.dmgDisplay, Math.min(100, Math.round((newTotRaw / 115) * 100)), '#ff9e66'],
        [UI_SVG.spd, ui.wpnStatSpd, `${wpn.atkRate}x`, Math.min(100, Math.round((wpn.atkRate / 2.4) * 100)), '#6ef2b8'],
        [UI_SVG.energy, ui.wpnStatEnergy, newEnCost > 0 ? `${newEnCost} / ${newSkCost}` : '0', newEnCost > 0 ? Math.min(100, Math.round((newEnCost / 12) * 100)) : 14, '#d89eff'],
        [UI_SVG.rng, ui.wpnStatRange, `${newRng}m`, Math.min(100, Math.round((newRng / 16.5) * 100)), '#72cbff'],
        [UI_SVG.crit, ui.wpnStatCrit, `+${newCrit}%`, Math.min(100, Math.round(((wpn.critBonus || 0) / 0.28) * 100)), '#ffd85e'],
        [UI_SVG.skl, ui.wpnStatSkill, `${effCd}s`, 100, wpn.tierColor]
      ];
      stripEl.innerHTML = chips
        .map(([ico, lbl, val, pct, col]) => `<div class="wpn-stat-chip" title="${lbl}" style="--stat-col:${col}"><span class="chip-ico">${ico}</span><strong>${val}</strong><div class="wpn-stat-bar"><i style="width:${Math.max(14, pct)}%"></i></div></div>`)
        .join('');
    }

    const fmtDelta = (diff, suffix = '', digits = 0) => {
      const eps = digits > 0 ? 0.009 : 0.4;
      if (Math.abs(diff) <= eps) return '<span class="wpn-delta same">—</span>';
      const cls = diff > 0 ? 'up' : 'down';
      const sign = diff > 0 ? '▲+' : '▼';
      const num = digits > 0 ? diff.toFixed(digits) : Math.round(diff);
      return `<span class="wpn-delta ${cls}">${sign}${num}${suffix}</span>`;
    };

    cardsEl.innerHTML = '';
    for (let slotIdx = 0; slotIdx < 2; slotIdx++) {
      const curW = this.hero.weapons[slotIdx];
      const curT = getWeaponText(curW);
      const curTot = curW.dmg * (curW.pellets || curW.def?.pellets || 1);
      const curRng = curW.range || curW.def.range;
      const curCrit = Math.round((curW.critBonus || 0) * 100);
      const curEn = this.getWeaponShotEnergyCost(curW);
      const catSvg = curW.def.category === 'ranged' ? UI_SVG.ranged : UI_SVG.melee;
      const elInfo = getElementBadgeInfo(curW.def.element);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wpn-choice-card boon-card';
      btn.style.setProperty('--boon-accent', wpn.tierColor || wpn.def.accent);
      btn.style.setProperty('--slot-rar-col', curW.tierColor || '#94a3b8');
      btn.innerHTML = `
        <div class="wpn-c-top">
          <span class="wpn-c-key">[${slotIdx + 1}]</span>
          <span class="wpn-c-name" style="color:${curW.tierColor}">${curT.name}</span>
          <span class="wpn-ico-row">
            <span class="wpn-ico-badge">${catSvg}</span>
            <span class="wpn-ico-badge" style="color:${elInfo.color}">${elInfo.svg}</span>
            <span class="wpn-tier-mark" style="color:${curW.tierColor}">${romanTierMark(curW.tier)}</span>
          </span>
        </div>
        <div class="wpn-c-stage">
          <canvas id="wpn-choice-canvas-${slotIdx}" class="wpn-choice-canvas" width="214" height="90"></canvas>
        </div>
        <div class="wpn-c-stats">
          <div class="wpn-c-metric"><span class="wpn-c-val" style="color:#ffad7a">${UI_SVG.dmg}${curT.dmgDisplay}</span>${fmtDelta(newTotRaw - curTot)}</div>
          <div class="wpn-c-metric"><span class="wpn-c-val" style="color:#7ef2c2">${UI_SVG.spd}${curW.atkRate}x</span>${fmtDelta(wpn.atkRate - curW.atkRate, 'x', 2)}</div>
          <div class="wpn-c-metric" title="${ui.wpnStatEnergy}"><span class="wpn-c-val" style="color:#d89eff">${UI_SVG.energy}${curEn}</span><span class="wpn-delta same">${newEnCost}</span></div>
          <div class="wpn-c-metric"><span class="wpn-c-val" style="color:#ffd85e">${UI_SVG.crit}+${curCrit}%</span>${fmtDelta(newCrit - curCrit, '%')}</div>
        </div>
        <div class="wpn-c-cta">${ui.wpnReplaceAction ? ui.wpnReplaceAction(slotIdx + 1) : ui.wpnEquipBtn(slotIdx + 1)}</div>
      `;
      btn.addEventListener('click', () => this.resolveWeaponChoice(slotIdx, salvageCinders));
      cardsEl.appendChild(btn);
    }

    const salvageBtn = document.createElement('button');
    salvageBtn.type = 'button';
    salvageBtn.className = 'wpn-choice-card boon-card';
    salvageBtn.style.setProperty('--boon-accent', '#ffb85c');
    salvageBtn.style.setProperty('--slot-rar-col', '#ffb85c');
    salvageBtn.innerHTML = `
      <div class="wpn-c-top">
        <span class="wpn-c-key">[3]</span>
        <span class="wpn-c-name" style="color:#ffd285">${ui.wpnSalvageTier}</span>
        <span class="wpn-tier-mark" style="color:#ffb85c">✦</span>
      </div>
      <div class="wpn-c-stage">
        <div class="salvage-visual">${UI_SVG.salvage}</div>
      </div>
      <div class="salvage-yield-row">
        <span class="salvage-pill" style="color:#ffd166">${UI_SVG.cinder}+${salvageCinders}</span>
        <span class="salvage-pill" style="color:#ff7e8e">${UI_SVG.hp}+18</span>
      </div>
      <div class="wpn-c-cta">${ui.wpnSalvageAction || ui.wpnSalvageName(salvageCinders)}</div>
    `;
    salvageBtn.addEventListener('click', () => this.resolveWeaponChoice(2, salvageCinders));
    cardsEl.appendChild(salvageBtn);

    if (this.weaponStudio) {
      this.weaponStudio.updateFrame(0.016);
    }
  }

  resolveWeaponChoice(choiceIdx, salvageOverride = null) {
    if (this.mode !== 'weapon' || !this.pendingWeaponPedestal) return;
    const inter = this.pendingWeaponPedestal;
    if (inter.used || inter._claiming) {
      this.closeWeaponModalWithoutTaking();
      return;
    }
    const salvageVal = salvageOverride ?? this._pendingSalvageValue ?? 35;
    if (this.isCoopClient && this.isCoopClient()) {
      inter._claiming = true;
      this.lan.relay({
        kind: 'interact_sync',
        sub: 'claim_one_time_req',
        netId: inter.netId,
        itemKind: 'weapon_pedestal',
        choiceIdx,
        salvageVal
      }, 'host');
      return;
    }
    this.consumeOneTimeInteractableVisual(inter);
    if (this.isCoopHost && this.isCoopHost()) {
      this.recordConsumedOneTimeNetId(inter.netId);
      this.lan.relay({
        kind: 'interact_sync',
        sub: 'one_time_claimed',
        netId: inter.netId,
        itemKind: 'weapon_pedestal',
        winnerId: this.lan.clientId,
        winnerName: this.localPlayerName
      }, 'others');
    }
    this.grantOneTimeInteractableReward(inter, { choiceIdx, salvageVal });
  }

  closeWeaponModalWithoutTaking() {
    if (this.mode !== 'weapon') return;
    this.pendingWeaponPedestal = null;
    document.getElementById('weapon-overlay')?.classList.add('hidden');
    this.mode = 'explore';
    this.sfx.uiBack();
    this.refreshInteractableLabels();
    this.updateHUD();
    this.updateInteractPromptUI();

    if (this.pendingBoonQueue.length > 0) {
      const nextKicker = this.pendingBoonQueue.shift();
      const epoch = this.stateEpoch;
      setTimeout(() => {
        if (this.stateEpoch === epoch) this.openBoonShrine(nextKicker);
      }, 180);
    }
  }

  queueInputBuffer(act, arg = null, windowSec = 0.26) {
    this.inputBuffer = {
      act,
      arg,
      expiresAt: this.time + windowSec
    };
  }

  flushInputBuffer() {
    if (!this.inputBuffer || this.mode !== 'explore') return;
    if (this.time > this.inputBuffer.expiresAt) {
      this.inputBuffer = null;
      return;
    }
    const h = this.hero;
    if (!h || h.downed) {
      this.inputBuffer = null;
      return;
    }
    const { act, arg } = this.inputBuffer;
    const wpn = this.activeWeapon();
    if (act === 'dash' && h.dashCd <= 0 && h.dashTimer <= 0) {
      this.inputBuffer = null;
      this.tryDash(true);
    } else if (act === 'skill' && h.arcCd <= 0 && h.dashTimer <= 0.04) {
      this.inputBuffer = null;
      this.tryWeaponSkill(true);
    } else if (act === 'class_skill' && (h.classSkillCd || 0) <= 0 && h.dashTimer <= 0.04) {
      this.inputBuffer = null;
      tryHeroActiveSkill(this, true);
    } else if (act === 'swap' && h.dashTimer <= 0.02) {
      this.inputBuffer = null;
      this.swapWeaponSlot(arg);
    } else if (act === 'attack' && h.dashTimer <= 0) {
      const ready = wpn && wpn.def.category === 'ranged' ? (h.rangedCooldown <= 0) : !h.atkState;
      if (ready) {
        this.inputBuffer = null;
        this.tryAttack(true);
      }
    }
  }

  pulseSlotReject(slotId, floatMsg = null) {
    const now = performance.now();
    if (now - this._lastRejectFeedbackMs < 240) return;
    this._lastRejectFeedbackMs = now;
    this.sfx.init();
    this.sfx.uiReject();
    const el = document.getElementById(slotId);
    if (el) {
      el.classList.remove('slot-reject');
      void el.offsetWidth;
      el.classList.add('slot-reject');
      setTimeout(() => el.classList.remove('slot-reject'), 240);
    }
    if (floatMsg && this.hero) {
      this.spawnFloatingText(this.hero.x, 2.15, this.hero.z, floatMsg, '#ff8597', 'callout');
    }
  }

  getWeaponShotEnergyCost(wpn) {
    if (!wpn || !wpn.def || wpn.def.category !== 'ranged') return 0;
    return Math.max(1, Math.round(wpn.energyCost ?? wpn.def.energyCost ?? 4));
  }

  getWeaponSkillEnergyCost(wpn) {
    return this.getWeaponShotEnergyCost(wpn) * 2;
  }

  pulseEnergyReject(slotId) {
    const enFrame = document.getElementById('energy-frame');
    if (enFrame) {
      enFrame.classList.remove('energy-reject');
      void enFrame.offsetWidth;
      enFrame.classList.add('energy-reject');
      setTimeout(() => enFrame.classList.remove('energy-reject'), 280);
    }
    this.pulseSlotReject(slotId, tUI().floatNoEnergy);
  }

  gainHeroEnergy(baseAmount, opts = {}) {
    const h = this.hero;
    if (!h || !baseAmount || baseAmount <= 0) return 0;
    const mult = opts.raw ? 1.0 : (h.energyGainMult || 1.0);
    const scaled = +(baseAmount * mult).toFixed(2);
    const before = h.energy ?? h.maxEnergy ?? 200;
    h.energy = Math.min(h.maxEnergy || 200, +(before + scaled).toFixed(2));
    const actual = Math.round(h.energy - before);
    const shownVal = actual > 0 ? actual : Math.max(1, Math.round(scaled));
    if (opts.showFloat && actual > 0) {
      this.spawnFloatingText(h.x, 2.08, h.z, tUI().floatEnergyGain(shownVal), '#d89eff', 'heal');
    }
    updateClassHUD(this);
    this.updateWeaponSkillDepletedState();
    return actual;
  }

  updateWeaponSkillDepletedState() {
    const h = this.hero;
    if (!h) return;
    const activeWpn = this.activeWeapon();
    const shotCost = this.getWeaponShotEnergyCost(activeWpn);
    const skillCost = shotCost * 2;
    const curEn = h.energy ?? 0;
    const primSlot = document.getElementById('slot-primary');
    if (primSlot) primSlot.classList.toggle('depleted', shotCost > 0 && curEn < shotCost);
    const skillSlot = document.getElementById('slot-skill');
    if (skillSlot) skillSlot.classList.toggle('depleted', skillCost > 0 && curEn < skillCost);
  }

  validatePinnedEnemy(maxRange = 16.5) {
    if (!this.pinnedEnemy) return null;
    if (
      this.pinnedEnemy.hp <= 0 ||
      !this.enemies.includes(this.pinnedEnemy) ||
      Math.hypot(this.pinnedEnemy.x - this.hero.x, this.pinnedEnemy.z - this.hero.z) > maxRange + 5.5
    ) {
      this.pinnedEnemy = null;
      return null;
    }
    return this.pinnedEnemy;
  }

  togglePinTarget() {
    if (this.mode !== 'explore' || !this.hero || this.hero.downed) return;
    const wpn = this.activeWeapon();
    const range = wpn && wpn.def.category === 'ranged' ? wpn.def.range : 14.5;
    const candidate = findNearestEnemyToCursor(this.enemies, this.hero, this.aimWorld, range + 2.0);
    const ui = tUI();
    if (this.pinnedEnemy && this.pinnedEnemy.hp > 0) {
      if (candidate && candidate !== this.pinnedEnemy && Math.hypot(candidate.x - this.aimWorld.x, candidate.z - this.aimWorld.z) < 2.4) {
        this.pinnedEnemy = candidate;
        this.sfx.uiPinTarget(true);
        this.spawnFloatingText(candidate.x, candidate.boss ? 2.9 : 2.1, candidate.z, ui.floatTargetPinned(getEnemyName(candidate.type)), '#ffd470', 'callout');
      } else {
        this.pinnedEnemy = null;
        this.sfx.uiPinTarget(false);
        this.spawnFloatingText(this.hero.x, 2.15, this.hero.z, ui.floatTargetUnpinned, '#9be8ff', 'callout');
      }
    } else if (candidate) {
      this.pinnedEnemy = candidate;
      this.sfx.uiPinTarget(true);
      this.spawnFloatingText(candidate.x, candidate.boss ? 2.9 : 2.1, candidate.z, ui.floatTargetPinned(getEnemyName(candidate.type)), '#ffd470', 'callout');
    }
    this.updateRangedLockTarget();
    this.updateHUD();
  }

  updateRangedLockTarget() {
    const wpn = this.activeWeapon();
    const pinned = this.validatePinnedEnemy(wpn ? wpn.def.range : 14.5);
    if (!wpn || wpn.def.category !== 'ranged' || this.mode !== 'explore') {
      this.lockedEnemy = null;
      this.lockReticle.update(this.time, null);
      return null;
    }
    const target = pinned || findNearestEnemyToCursor(this.enemies, this.hero, this.aimWorld, wpn.def.range);
    this.lockedEnemy = target;
    this.lockReticle.update(this.time, target, pinned ? 0xffca58 : wpn.def.accentHex);
    return target;
  }

  computeRangedAim(wpn) {
    const h = this.hero;
    const pinned = this.validatePinnedEnemy(wpn.def.range);
    const locked = pinned || findNearestEnemyToCursor(this.enemies, h, this.aimWorld, wpn.def.range);
    this.lockedEnemy = locked;
    if (locked) {
      const dist = Math.hypot(locked.x - h.x, locked.z - h.z);
      const leadT = Math.min(0.28, dist / Math.max(12, wpn.def.projSpeed || 20));
      const tx = locked.x + (locked.vx || 0) * leadT * 0.35;
      const tz = locked.z + (locked.vz || 0) * leadT * 0.35;
      return { yaw: Math.atan2(tx - h.x, tz - h.z), target: locked };
    }
    const dx = this.aimWorld.x - h.x;
    const dz = this.aimWorld.z - h.z;
    const yaw = (dx * dx + dz * dz > 0.01) ? Math.atan2(dx, dz) : h.yaw;
    return { yaw, target: null };
  }

  tryAttack(fromBuffer = false) {
    if (this.mode !== 'explore') return;
    const h = this.hero;
    if (h.downed) return;
    if (h.dashTimer > 0) {
      if (!fromBuffer) this.queueInputBuffer('attack');
      return;
    }
    const wpn = this.activeWeapon();

    if (wpn.def.category === 'ranged') {
      if (h.rangedCooldown > 0) {
        if (!fromBuffer && h.rangedCooldown <= 0.15) this.queueInputBuffer('attack');
        return;
      }
      const shotCost = this.getWeaponShotEnergyCost(wpn);
      if ((h.energy ?? 0) < shotCost) {
        this.pulseEnergyReject('slot-primary');
        return;
      }
      const freeShot = (h.freeShotChance || 0) > 0 && Math.random() < Math.min(0.60, h.freeShotChance);
      if (!freeShot && shotCost > 0) {
        h.energy = Math.max(0, +((h.energy ?? 0) - shotCost).toFixed(2));
      }
      updateClassHUD(this);
      this.updateWeaponSkillDepletedState();
      const { yaw, target } = this.computeRangedAim(wpn);
      h.yaw = yaw;
      const fireInterval = 1.0 / (wpn.atkRate * getClassEffectiveAtkSpeed(h));
      h.rangedCooldown = Math.max(0.20, fireInterval);
      h.rangedAnimTimer = Math.min(0.22, h.rangedCooldown * 0.85);
      h.rangedShotCounter++;

      const baseDmg = wpn.dmg * this.effectiveDmgMult(wpn);
      const muzX = h.x + Math.sin(yaw) * 0.85;
      const muzZ = h.z + Math.cos(yaw) * 0.85;
      this.sfx.rangedShot(wpn.id, {
        empowered: (wpn.id === 'crossbow' && h.rangedShotCounter % 4 === 0) || (wpn.id === 'autoturret' && h.rangedShotCounter % 5 === 0),
        heat: this.prismHeat || 0
      });

      if (wpn.id === 'crossbow') {
        const empowered = h.rangedShotCounter % 4 === 0;
        this.spawnPlayerProjectile({
          kind: 'bolt',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed * (empowered ? 1.18 : 1.0),
          dmg: baseDmg * (empowered ? 1.40 : 1.0),
          colorHex: empowered ? 0xffe066 : wpn.def.accentHex,
          radius: empowered ? 0.56 : 0.42,
          life: 0.95,
          pierce: empowered ? 99 : (1 + h.bonusPierce),
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.1, muzZ, empowered ? 0xffe066 : 0x9be8ff, empowered ? 14 : 7, 4.2, 4.0);
      } else if (wpn.id === 'chakram') {
        this.spawnPlayerProjectile({
          kind: 'chakram_disc',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 19.5,
          dmg: baseDmg,
          colorHex: wpn.def.accentHex,
          radius: 0.62,
          life: 2.2,
          pierce: 99,
          isBoomerang: true,
          maxTravel: (wpn.range || wpn.def.range || 12.0) * 0.82,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.1, muzZ, wpn.def.accentHex, 9, 4.0, 3.0);
      } else if (wpn.id === 'plagueflask') {
        this.spawnPlayerProjectile({
          kind: 'plague_flask',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 15.8,
          dmg: baseDmg,
          colorHex: wpn.def.accentHex,
          radius: 0.52,
          life: 0.82,
          pierce: 1,
          splashRadius: wpn.def.splashRadius || 2.15,
          spawnAcidPool: true,
          inflictBlight: true,
          chillDuration: 1.5,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.12, muzZ, 0x76ff4d, 10, 4.0, 4.5);
      } else if (wpn.id === 'scattergun') {
        const count = (wpn.pellets || wpn.def.pellets || 6) + (h.bonusProjectiles || 0);
        h.vx -= Math.sin(yaw) * 1.8;
        h.vz -= Math.cos(yaw) * 1.8;
        this.cameraShake = Math.max(this.cameraShake, 0.14);
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) * 0.5) * 0.095 + (Math.random() - 0.5) * 0.04;
          this.spawnPlayerProjectile({
            kind: 'bolt',
            x: muzX,
            z: muzZ,
            yaw: yaw + spread,
            speed: (wpn.def.projSpeed || 24.5) * (0.92 + Math.random() * 0.16),
            dmg: baseDmg,
            colorHex: wpn.def.accentHex,
            radius: 0.36,
            life: 0.42,
            pierce: 1 + Math.floor(h.bonusPierce * 0.5),
            pointBlankBonus: true,
            originX: h.x,
            originZ: h.z,
            weaponInst: wpn
          });
        }
        this.vfx.burst(muzX, 1.1, muzZ, 0xffae63, 20, 6.2, 6.0);
      } else if (wpn.id === 'voidstaff') {
        this.spawnPlayerProjectile({
          kind: 'void_orb',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed,
          dmg: baseDmg,
          colorHex: wpn.def.accentHex,
          radius: 0.52,
          life: 1.35,
          pierce: 1,
          bouncesLeft: (wpn.def.bounceCount || 2) + h.bonusPierce,
          homingTarget: target,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.15, muzZ, 0xc77dff, 10, 3.6, 2.0);
      } else if (wpn.id === 'prismbeam') {
        this.prismHeat = Math.min(1.0, (this.prismHeat || 0) + 0.24);
        this.prismHeatDecay = 1.15;
        const heatMult = 1.0 + this.prismHeat * 0.85;
        this.fireInstantPrismBeam(muzX, muzZ, yaw, wpn.range || wpn.def.range || 14.5, baseDmg * heatMult, wpn, this.prismHeat >= 0.42);
      } else if (wpn.id === 'buzzsaw') {
        this.spawnPlayerProjectile({
          kind: 'sawblade',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 21.0,
          dmg: baseDmg,
          colorHex: wpn.def.accentHex,
          radius: 0.58,
          life: 1.55,
          pierce: 4 + h.bonusPierce,
          ricochetLeft: 3,
          inflictBleed: true,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.08, muzZ, 0x8be2ff, 11, 4.4, 5.0);
      } else if (wpn.id === 'handcannon') {
        h.vx -= Math.sin(yaw) * 2.4;
        h.vz -= Math.cos(yaw) * 2.4;
        this.cameraShake = Math.max(this.cameraShake, 0.18);
        this.spawnPlayerProjectile({
          kind: 'cannon_shell',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed,
          dmg: baseDmg,
          colorHex: wpn.def.accentHex,
          radius: 0.58,
          life: 0.88,
          pierce: 1 + Math.floor(h.bonusPierce * 0.5),
          splashRadius: wpn.def.splashRadius || 2.55,
          inflictBurn: true,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.12, muzZ, 0xff7733, 18, 5.8, 6.0);
        this.vfx.flash(muzX, 1.3, muzZ, 0xff7733, 12);
      } else if (wpn.id === 'autoturret') {
        const dropPylon = h.rangedShotCounter % 5 === 0;
        this.spawnPlayerProjectile({
          kind: 'bolt',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 23.5,
          dmg: baseDmg * (dropPylon ? 1.25 : 1.0),
          colorHex: dropPylon ? 0x9ef8ff : wpn.def.accentHex,
          radius: 0.45,
          life: 0.95,
          pierce: 1 + h.bonusPierce,
          voltaicArc: dropPylon,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.12, muzZ, 0xffe066, 9, 4.0, 3.0);
      } else if (wpn.id === 'flyingdaggers') {
        const count = (wpn.pellets || 2) + Math.min(2, h.bonusProjectiles || 0);
        for (let i = 0; i < count; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const ang = yaw + side * (0.28 + Math.floor(i / 2) * 0.12);
          this.spawnPlayerProjectile({
            kind: 'spirit_sword',
            x: h.x + Math.sin(ang) * 0.7,
            z: h.z + Math.cos(ang) * 0.7,
            yaw: ang,
            speed: wpn.def.projSpeed || 25.0,
            dmg: baseDmg,
            colorHex: wpn.def.accentHex,
            radius: 0.44,
            life: 1.25,
            pierce: 1 + h.bonusPierce,
            homingTarget: target,
            swordMarkHit: true,
            weaponInst: wpn
          });
        }
        this.vfx.burst(muzX, 1.15, muzZ, 0x8ef5ff, 10, 4.2, 2.5);
      } else if (wpn.id === 'starfallbow') {
        this.spawnPlayerProjectile({
          kind: 'star_arrow',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 28.0,
          dmg: baseDmg,
          colorHex: 0xffdf6e,
          radius: 0.56,
          life: 1.1,
          pierce: 99,
          starfallTrigger: true,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.15, muzZ, 0xffdf6e, 16, 5.2, 3.0);
      } else if (wpn.id === 'soulgrimoire') {
        const count = (wpn.pellets || 2) + Math.min(2, h.bonusProjectiles || 0);
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.22;
          this.spawnPlayerProjectile({
            kind: 'void_orb',
            x: h.x + Math.sin(ang) * 0.8,
            z: h.z + Math.cos(ang) * 0.8,
            yaw: ang,
            speed: wpn.def.projSpeed || 19.0,
            dmg: baseDmg,
            colorHex: 0x52ffbc,
            radius: 0.48,
            life: 1.3,
            pierce: 1 + h.bonusPierce,
            homingTarget: target,
            lifestealOnHit: 2,
            weaponInst: wpn
          });
        }
        if (h.rangedShotCounter % 3 === 0) {
          this.spawnWraithSkull(baseDmg * 1.35, wpn);
        }
        this.vfx.burst(muzX, 1.15, muzZ, 0x52ffbc, 12, 3.8, 2.5);
      } else if (wpn.id === 'sunforgecannon') {
        h.vx -= Math.sin(yaw) * 2.8;
        h.vz -= Math.cos(yaw) * 2.8;
        this.cameraShake = Math.max(this.cameraShake, 0.22);
        this.spawnPlayerProjectile({
          kind: 'mini_sun',
          x: muzX,
          z: muzZ,
          yaw,
          speed: wpn.def.projSpeed || 9.2,
          dmg: baseDmg,
          pulseDmg: baseDmg * 0.42,
          pulseTimer: 0.16,
          colorHex: 0xffb833,
          radius: 0.78,
          life: 1.45,
          pierce: 99,
          splashRadius: wpn.def.splashRadius || 3.15,
          solarZapper: true,
          inflictBurn: true,
          weaponInst: wpn
        });
        this.vfx.burst(muzX, 1.18, muzZ, 0xffca44, 24, 6.0, 4.0);
        this.vfx.flash(muzX, 1.35, muzZ, 0xffb833, 15);
      }
      return;
    }

    if (h.atkState) {
      if (!fromBuffer && h.atkState.timer >= h.atkState.duration * 0.48) {
        this.queueInputBuffer('attack');
      }
      return;
    }
    const rawStep = h.comboWindow > 0 ? h.comboStep : 0;
    const { profile, step: stepSpec, stepIndex: step, maxSteps } = getMeleeStepSpec(wpn.id, rawStep);
    const isFinisher = !!stepSpec.isFinisher || step === maxSteps - 1;
    const rate = wpn.atkRate * getClassEffectiveAtkSpeed(h);
    const duration = Math.max(0.11, (stepSpec.dur || (isFinisher ? 0.42 : 0.30)) / rate);

    const dx = this.aimWorld.x - h.x;
    const dz = this.aimWorld.z - h.z;
    if (dx * dx + dz * dz > 0.01) h.yaw = Math.atan2(dx, dz);

    const lunge = stepSpec.lunge ?? 3.4;
    h.vx += Math.sin(h.yaw) * lunge;
    h.vz += Math.cos(h.yaw) * lunge;

    const effReach = (wpn.range || wpn.def.range) * h.reachMult * (stepSpec.reachMult || 1.0);
    const wCol = wpn.def.accentHex;
    if (stepSpec.shape === 'line') {
      this.vfx.spawnThrustLance(h.x, h.z, h.yaw, effReach, (stepSpec.halfWidth || 0.78) * 1.55, Math.min(0.28, duration * 0.88), wCol);
      if (wpn.id === 'chainwhip') {
        const tipX = h.x + Math.sin(h.yaw) * (effReach * 0.90);
        const tipZ = h.z + Math.cos(h.yaw) * (effReach * 0.90);
        this.vfx.burst(tipX, 0.95, tipZ, wCol, 9, 3.8, 4.5);
      }
    } else if (stepSpec.shape === 'crater') {
      const slamReach = ((stepSpec.impactOffset || 2.5) + (stepSpec.craterRadius || 2.6) * 0.65) * h.reachMult;
      this.vfx.spawnSlashArc(h.x, h.z, h.yaw, slamReach, 0.56, Math.min(0.28, duration * 0.72), wCol, 0);
    } else {
      const tilt = stepSpec.anim === 'spin' ? 0 : (step % 2 === 0 ? 0.14 : -0.14);
      this.vfx.spawnSlashArc(h.x, h.z, h.yaw, effReach, stepSpec.arcHalf || 1.48, Math.min(0.30, duration * 0.86), wCol, tilt);
    }

    h.atkState = {
      weaponInst: wpn,
      step,
      maxSteps,
      isFinisher,
      stepSpec,
      moveSlow: profile.moveSlow ?? wpn.def.moveSlow ?? 0.76,
      timer: 0,
      duration,
      hitSet: new Set(),
      secondStrikeFired: false,
      craterFired: false,
      waveFired: false
    };
    h.comboStep = (step + 1) % maxSteps;
    h.comboWindow = profile.comboWindow || 1.05;
    this.sfx.meleeSwing(wpn.id, step % 3, isFinisher);
    if (this.coopBroadcastPlayerAction) {
      this.coopBroadcastPlayerAction({
        act: 'melee_swing',
        yaw: +h.yaw.toFixed(3),
        step,
        isFinisher,
        anim: stepSpec.anim || 'cleaveR',
        duration: +duration.toFixed(2)
      });
    }
  }

  tryWeaponSkill(fromBuffer = false) {
    if (this.mode !== 'explore') return;
    const h = this.hero;
    if (h.downed) return;
    if (h.arcCd > 0) {
      if (!fromBuffer && h.arcCd <= 0.18) {
        this.queueInputBuffer('skill');
      } else if (!fromBuffer) {
        this.pulseSlotReject('slot-skill');
      }
      return;
    }
    if (h.dashTimer > 0.04) {
      if (!fromBuffer) this.queueInputBuffer('skill');
      return;
    }
    if (h.atkState) {
      const checkWpn = this.activeWeapon();
      const preSkillCost = this.getWeaponSkillEnergyCost(checkWpn);
      if (preSkillCost > 0 && (h.energy ?? 0) < preSkillCost) {
        this.pulseEnergyReject('slot-skill');
        return;
      }
      h.atkState = null;
      this.heroRig.torso.rotation.y = 0;
    }

    const wpn = this.activeWeapon();
    const skillCost = this.getWeaponSkillEnergyCost(wpn);
    if (skillCost > 0 && (h.energy ?? 0) < skillCost) {
      this.pulseEnergyReject('slot-skill');
      return;
    }
    if (skillCost > 0) {
      const freeCast = (h.freeShotChance || 0) > 0 && Math.random() < Math.min(0.60, h.freeShotChance);
      if (!freeCast) {
        h.energy = Math.max(0, +((h.energy ?? 0) - skillCost).toFixed(2));
      }
      updateClassHUD(this);
      this.updateWeaponSkillDepletedState();
    }
    const bonus = h.bonusProjectiles || 0;
    h.arcCdMax = wpn.def.skillCd * (wpn.skillCdMult || 1.0) * h.arcCdMult;
    h.arcCd = h.arcCdMax;
    onClassWeaponSkill(this);
    this.sfx.weaponSkill(wpn.id);

    if (wpn.def.category === 'ranged') {
      const { yaw, target } = this.computeRangedAim(wpn);
      h.yaw = yaw;
      h.rangedAnimTimer = 0.26;
      const baseDmg = wpn.dmg * this.effectiveDmgMult(wpn);

      if (wpn.id === 'crossbow') {
        const count = 5 + bonus * 2;
        const spread = 0.13;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * spread;
          this.spawnPlayerProjectile({
            kind: 'bolt',
            x: h.x + Math.sin(ang) * 0.85,
            z: h.z + Math.cos(ang) * 0.85,
            yaw: ang,
            speed: 25.0,
            dmg: baseDmg * 1.15,
            colorHex: 0x9be8ff,
            radius: 0.48,
            life: 0.95,
            pierce: 2 + h.bonusPierce,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.cameraShake = Math.max(this.cameraShake, 0.18);
      } else if (wpn.id === 'voidstaff') {
        const count = 1 + (bonus > 0 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.24;
          this.spawnPlayerProjectile({
            kind: 'singularity',
            x: h.x + Math.sin(ang) * 1.0,
            z: h.z + Math.cos(ang) * 1.0,
            yaw: ang,
            speed: 8.2,
            dmg: baseDmg * 1.85,
            pulseDmg: baseDmg * 0.48,
            pulseTimer: 0.20,
            colorHex: 0xc77dff,
            radius: 1.35,
            pullRadius: 4.8,
            life: 1.45,
            pierce: 99,
            homingTarget: target,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.cameraShake = Math.max(this.cameraShake, 0.22);
      } else if (wpn.id === 'handcannon') {
        h.vx -= Math.sin(yaw) * 4.2;
        h.vz -= Math.cos(yaw) * 4.2;
        const count = 5 + bonus * 2;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.16;
          this.spawnPlayerProjectile({
            kind: 'cannon_shell',
            x: h.x + Math.sin(ang) * 0.9,
            z: h.z + Math.cos(ang) * 0.9,
            yaw: ang,
            speed: 18.5 - Math.abs(i - (count - 1) * 0.5) * 0.8,
            dmg: baseDmg * 0.92,
            colorHex: 0xff6238,
            radius: 0.52,
            life: 0.62,
            pierce: 1,
            splashRadius: 2.0,
            inflictBurn: true,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.vfx.burst(h.x + Math.sin(yaw) * 1.1, 1.1, h.z + Math.cos(yaw) * 1.1, 0xff6238, 32, 7.5, 6.0);
        this.coopBroadcastPlayerAction?.({
          act: 'ring_burst_vfx',
          x: +(h.x + Math.sin(yaw) * 1.1).toFixed(2),
          z: +(h.z + Math.cos(yaw) * 1.1).toFixed(2),
          radius: 0,
          colorHex: 0xff6238,
          burstCount: 28
        });
        this.cameraShake = Math.max(this.cameraShake, 0.30);
      } else if (wpn.id === 'chakram') {
        const count = 3 + bonus * 2;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.28;
          this.spawnPlayerProjectile({
            kind: 'chakram_disc',
            x: h.x + Math.sin(ang) * 0.9,
            z: h.z + Math.cos(ang) * 0.9,
            yaw: ang,
            speed: 20.5,
            dmg: baseDmg * 1.25,
            colorHex: 0xffe066,
            radius: 0.78,
            life: 2.5,
            pierce: 99,
            isBoomerang: true,
            maxTravel: 11.2,
            inflictBurn: true,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.cameraShake = Math.max(this.cameraShake, 0.20);
      } else if (wpn.id === 'plagueflask') {
        const count = 3 + bonus;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.32;
          this.spawnPlayerProjectile({
            kind: 'plague_flask',
            x: h.x + Math.sin(ang) * 0.85,
            z: h.z + Math.cos(ang) * 0.85,
            yaw: ang,
            speed: 14.5 + i * 1.2,
            dmg: baseDmg * 1.15,
            colorHex: 0x76ff4d,
            radius: 0.58,
            life: 0.78,
            pierce: 1,
            splashRadius: 2.5,
            spawnAcidPool: true,
            inflictBlight: true,
            isSkill: true,
            weaponInst: wpn
          });
        }
        for (const e of [...this.enemies]) {
          if (e.hp > 0 && e.blightTimer > 0) {
            this.vfx.spawnRing(e.x, e.z, 2.3, 0.38, 0x76ff4d, false);
            this.damageEnemy(e, baseDmg * 1.75, e.x, e.z, { weaponInst: wpn, fxColor: 0x76ff4d });
          }
        }
        this.cameraShake = Math.max(this.cameraShake, 0.22);
      } else if (wpn.id === 'scattergun') {
        h.vx -= Math.sin(yaw) * 3.8;
        h.vz -= Math.cos(yaw) * 3.8;
        const count = 9 + bonus * 2;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.11;
          this.spawnPlayerProjectile({
            kind: 'sawblade',
            x: h.x + Math.sin(ang) * 0.85,
            z: h.z + Math.cos(ang) * 0.85,
            yaw: ang,
            speed: 23.5,
            dmg: baseDmg * 1.45,
            colorHex: 0xffc46b,
            radius: 0.42,
            life: 1.25,
            pierce: 3,
            ricochetLeft: 2,
            inflictBurn: true,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.cameraShake = Math.max(this.cameraShake, 0.28);
      } else if (wpn.id === 'prismbeam') {
        const beams = 7 + bonus * 2;
        const colors = [0x58f7ff, 0x78b8ff, 0xc77dff, 0xff77c8, 0xffd166, 0x6ef7a8, 0x58f7ff];
        for (let i = 0; i < beams; i++) {
          const ang = yaw + (i - (beams - 1) * 0.5) * 0.13;
          this.fireInstantPrismBeam(h.x + Math.sin(ang) * 0.8, h.z + Math.cos(ang) * 0.8, ang, 15.5, baseDmg * 1.58, wpn, false, colors[i % colors.length]);
        }
        this.prismHeat = 1.0;
        this.prismHeatDecay = 1.6;
        this.cameraShake = Math.max(this.cameraShake, 0.26);
      } else if (wpn.id === 'buzzsaw') {
        this.spawnOrbitalSawblades(3 + bonus, baseDmg * 0.72, 6.5, wpn);
        this.vfx.spawnRing(h.x, h.z, 2.6, 0.38, 0x8be2ff, false);
        this.coopBroadcastPlayerAction?.({
          act: 'orbital_vfx',
          sub: 'saw',
          count: 3 + bonus,
          duration: 6.5
        });
        this.coopBroadcastPlayerAction?.({
          act: 'ring_burst_vfx',
          x: +h.x.toFixed(2),
          z: +h.z.toFixed(2),
          radius: 2.6,
          dur: 0.38,
          colorHex: 0x8be2ff,
          fill: false,
          burstCount: 0
        });
      } else if (wpn.id === 'autoturret') {
        const tx = h.x + Math.sin(yaw) * 2.2;
        const tz = h.z + Math.cos(yaw) * 2.2;
        const spot = (this.dungeon.isPointWalkable(tx, tz, 0.45) && !this.dungeon.isPointBlockedByCover?.(tx, tz, 0.50))
          ? { x: tx, z: tz }
          : { x: h.x, z: h.z };
        this.spawnTeslaTurret(spot.x, spot.z, baseDmg * 0.92, wpn);
      } else if (wpn.id === 'flyingdaggers') {
        const count = 10 + bonus * 2;
        for (let i = 0; i < count; i++) {
          const ang = yaw + ((i / count) * Math.PI * 2);
          const lockT = this.enemies.length > 0 ? this.enemies[i % this.enemies.length] : target;
          this.spawnPlayerProjectile({
            kind: 'spirit_sword',
            x: h.x + Math.sin(ang) * 0.95,
            z: h.z + Math.cos(ang) * 0.95,
            yaw: ang,
            speed: 24.5,
            dmg: baseDmg * 1.08,
            colorHex: 0x8ef5ff,
            radius: 0.46,
            life: 1.45,
            pierce: 2,
            homingTarget: lockT,
            swordMarkHit: true,
            isSkill: true,
            weaponInst: wpn
          });
        }
        this.vfx.spawnRing(h.x, h.z, 2.8, 0.36, 0x8ef5ff, false);
        this.coopBroadcastPlayerAction?.({
          act: 'ring_burst_vfx',
          x: +h.x.toFixed(2),
          z: +h.z.toFixed(2),
          radius: 2.8,
          dur: 0.36,
          colorHex: 0x8ef5ff,
          fill: false,
          burstCount: 0
        });
        this.cameraShake = Math.max(this.cameraShake, 0.22);
      } else if (wpn.id === 'starfallbow') {
        const cx = target ? target.x : (h.x + Math.sin(yaw) * 7.5);
        const cz = target ? target.z : (h.z + Math.cos(yaw) * 7.5);
        const waves = 7 + bonus * 2;
        const netWaves = [];
        for (let w = 0; w < waves; w++) {
          const a = (w / waves) * Math.PI * 2;
          const rad = w === 0 ? 0 : 2.1 + (w % 2) * 1.1;
          const mx = cx + Math.cos(a) * rad;
          const mz = cz + Math.sin(a) * rad;
          this.vfx.spawnRing(mx, mz, 2.65, 0.28 + w * 0.09, 0xffdf6e, true);
          this.delayedHazards.push({
            friendly: true,
            timer: 0.22 + w * 0.09,
            x: mx,
            z: mz,
            radius: 2.65,
            dmg: baseDmg * 1.42,
            colorHex: 0xffdf6e,
            lightningSky: true,
            weaponInst: wpn,
            stagger: 0.8,
            mesh: null
          });
          netWaves.push({
            timer: +(0.22 + w * 0.09).toFixed(2),
            x: +mx.toFixed(2),
            z: +mz.toFixed(2),
            radius: 2.65,
            colorHex: 0xffdf6e,
            lightningSky: true,
            preRing: true
          });
        }
        this.coopBroadcastPlayerAction?.({ act: 'hazard_vfx', waves: netWaves });
        this.cameraShake = Math.max(this.cameraShake, 0.32);
      } else if (wpn.id === 'soulgrimoire') {
        const count = 8 + bonus * 2;
        for (let i = 0; i < count; i++) {
          const ang = yaw + (i - (count - 1) * 0.5) * 0.24;
          const lockT = this.enemies.length > 0 ? this.enemies[i % this.enemies.length] : target;
          this.spawnPlayerProjectile({
            kind: 'void_orb',
            x: h.x + Math.sin(ang) * 0.85,
            z: h.z + Math.cos(ang) * 0.85,
            yaw: ang,
            speed: 19.5,
            dmg: baseDmg * 1.12,
            colorHex: 0x52ffbc,
            radius: 0.52,
            life: 1.45,
            pierce: 2,
            homingTarget: lockT,
            lifestealOnHit: 3,
            isSkill: true,
            weaponInst: wpn
          });
        }
        for (let k = 0; k < 3; k++) this.spawnWraithSkull(baseDmg * 1.45, wpn);
        this.vfx.spawnRing(h.x, h.z, 3.0, 0.42, 0x52ffbc, false);
        this.coopBroadcastPlayerAction?.({
          act: 'orbital_vfx',
          sub: 'wraith_skull',
          count: 3,
          duration: 14.0
        });
        this.coopBroadcastPlayerAction?.({
          act: 'ring_burst_vfx',
          x: +h.x.toFixed(2),
          z: +h.z.toFixed(2),
          radius: 3.0,
          dur: 0.42,
          colorHex: 0x52ffbc,
          fill: false,
          burstCount: 0
        });
      } else if (wpn.id === 'sunforgecannon') {
        h.vx -= Math.sin(yaw) * 4.5;
        h.vz -= Math.cos(yaw) * 4.5;
        this.fireInstantPrismBeam(h.x + Math.sin(yaw) * 1.0, h.z + Math.cos(yaw) * 1.0, yaw, 17.5, baseDmg * 2.85, wpn, false, 0xffca44, 1.55);
        const netWaves = [];
        for (let s = 1; s <= 4; s++) {
          const sx = h.x + Math.sin(yaw) * (s * 3.4);
          const sz = h.z + Math.cos(yaw) * (s * 3.4);
          if (
            !this.dungeon.isPointWalkable(sx, sz, 0.3) ||
            this.dungeon.isPointBlockedByCover?.(sx, sz, 0.28) ||
            this.dungeon.isSegmentBlockedByCover?.(h.x, h.z, sx, sz, 0.10)
          ) break;
          this.delayedHazards.push({
            friendly: true,
            timer: 0.25 + s * 0.08,
            x: sx,
            z: sz,
            radius: 2.4,
            dmg: baseDmg * 1.1,
            colorHex: 0xffae2b,
            weaponInst: wpn,
            stagger: 0.8,
            mesh: null
          });
          netWaves.push({
            timer: +(0.25 + s * 0.08).toFixed(2),
            x: +sx.toFixed(2),
            z: +sz.toFixed(2),
            radius: 2.4,
            colorHex: 0xffae2b
          });
        }
        if (netWaves.length > 0) {
          this.coopBroadcastPlayerAction?.({ act: 'hazard_vfx', waves: netWaves });
        }
        this.cameraShake = Math.max(this.cameraShake, 0.44);
      }
      return;
    }

    const dx = this.aimWorld.x - h.x;
    const dz = this.aimWorld.z - h.z;
    if (dx * dx + dz * dz > 0.01) h.yaw = Math.atan2(dx, dz);
    const baseDmg = wpn.dmg * this.effectiveDmgMult(wpn);

    if (wpn.id === 'twinblades') {
      const stepDist = 5.4;
      const ox = h.x;
      const oz = h.z;
      for (let s = 1; s <= 6; s++) {
        const nx = ox + Math.sin(h.yaw) * (stepDist * (s / 6));
        const nz = oz + Math.cos(h.yaw) * (stepDist * (s / 6));
        if (this.dungeon.isPointWalkable(nx, nz, 0.46)) {
          h.x = nx;
          h.z = nz;
        }
      }
      h.invuln = Math.max(h.invuln, 0.32);
      this.vfx.burst(ox, 1.0, oz, 0x63dcff, 22, 5.2, 3.0);
      this.vfx.spawnRing(h.x, h.z, 2.8, 0.38, 0x63dcff, false);
      if (this.coopBroadcastPlayerAction) {
        this.coopBroadcastPlayerAction({
          act: 'twinblades_lunge',
          ox: +ox.toFixed(2),
          oz: +oz.toFixed(2),
          nx: +h.x.toFixed(2),
          nz: +h.z.toFixed(2)
        });
      }

      for (const e of [...this.enemies]) {
        const distLine = this.pointToSegmentDist(e.x, e.z, ox, oz, h.x, h.z);
        if (distLine <= 1.85 + e.radius) {
          this.damageEnemy(e, baseDmg * 2.05, h.x, h.z, {
            allowCrit: true,
            fxColor: 0x63dcff,
            weaponInst: wpn,
            chillDuration: 3.6,
            stagger: 0.65
          });
          if (h.chainLightning > 0) this.triggerChainLightning(e, h.chainLightning);
        }
      }
      const shardCount = 3 + bonus * 2;
      for (let i = 0; i < shardCount; i++) {
        const ang = h.yaw + (i - (shardCount - 1) * 0.5) * 0.24;
        this.spawnPlayerProjectile({
          kind: 'bolt',
          x: h.x + Math.sin(ang) * 0.7,
          z: h.z + Math.cos(ang) * 0.7,
          yaw: ang,
          speed: 20.5,
          dmg: baseDmg * 0.85,
          colorHex: 0x63dcff,
          radius: 0.45,
          life: 0.65,
          pierce: 2,
          chillDuration: 2.5,
          isSkill: true,
          weaponInst: wpn
        });
      }
      this.cameraShake = Math.max(this.cameraShake, 0.22);
    } else if (wpn.id === 'warhammer') {
      const waves = 3 + bonus;
      const fwdX = Math.sin(h.yaw);
      const fwdZ = Math.cos(h.yaw);
      const netWaves = [];
      for (let w = 0; w < waves; w++) {
        const dist = 2.0 + w * 2.5;
        const wx = h.x + fwdX * dist;
        const wz = h.z + fwdZ * dist;
        this.delayedHazards.push({
          friendly: true,
          timer: w * 0.11,
          x: wx,
          z: wz,
          radius: 2.45,
          dmg: baseDmg * 1.48,
          colorHex: 0xffd257,
          weaponInst: wpn,
          stagger: 1.0,
          mesh: null
        });
        netWaves.push({
          timer: +(w * 0.11).toFixed(2),
          x: +wx.toFixed(2),
          z: +wz.toFixed(2),
          radius: 2.45,
          dmg: 0,
          colorHex: 0xffd257
        });
      }
      if (this.coopBroadcastPlayerAction) {
        this.coopBroadcastPlayerAction({ act: 'warhammer_slam', waves: netWaves });
      }
      this.cameraShake = Math.max(this.cameraShake, 0.34);
    } else if (wpn.id === 'chainwhip') {
      const hookLen = 7.2;
      const ex = h.x + Math.sin(h.yaw) * hookLen;
      const ez = h.z + Math.cos(h.yaw) * hookLen;
      this.spawnLightningBolt(h.x, h.z, ex, ez, 0xff5a6e);
      this.vfx.burst(ex, 1.0, ez, 0xff5a6e, 20, 5.2, 4.0);
      this.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        x: +ex.toFixed(2),
        z: +ez.toFixed(2),
        radius: 0,
        colorHex: 0xff5a6e,
        burstCount: 18
      });
      for (const e of [...this.enemies]) {
        if (!e || e.hp <= 0) continue;
        const dLine = this.pointToSegmentDist(e.x, e.z, h.x, h.z, ex, ez);
        if (dLine <= 1.35 + e.radius) {
          if (!e.boss) {
            const pullX = h.x + Math.sin(h.yaw) * 1.9;
            const pullZ = h.z + Math.cos(h.yaw) * 1.9;
            if (this.dungeon.isPointWalkable(pullX, pullZ, e.radius)) {
              e.x = pullX;
              e.z = pullZ;
            }
          }
          this.damageEnemy(e, baseDmg * 1.68, h.x, h.z, {
            allowCrit: true,
            forceCrit: true,
            inflictBleed: true,
            stagger: 1.25,
            fxColor: 0xff5a6e,
            weaponInst: wpn
          });
        }
      }
      this.cameraShake = Math.max(this.cameraShake, 0.24);
    } else if (wpn.id === 'bloodscythe') {
      const stepDist = 3.8;
      for (let s = 1; s <= 4; s++) {
        const nx = h.x + Math.sin(h.yaw) * (stepDist / 4);
        const nz = h.z + Math.cos(h.yaw) * (stepDist / 4);
        if (this.dungeon.isPointWalkable(nx, nz, 0.45)) {
          h.x = nx;
          h.z = nz;
        }
      }
      h.invuln = Math.max(h.invuln, 0.36);
      this.vfx.spawnRing(h.x, h.z, 3.65, 0.45, 0xff2952, false);
      this.vfx.burst(h.x, 1.1, h.z, 0xff2952, 34, 6.8, 4.0);
      this.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        x: +h.x.toFixed(2),
        z: +h.z.toFixed(2),
        radius: 3.65,
        dur: 0.45,
        colorHex: 0xff2952,
        fill: false,
        burstCount: 30
      });
      let drainHeal = 0;
      for (const e of [...this.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.65 + e.radius) {
          drainHeal += 5;
          this.damageEnemy(e, baseDmg * 2.15, h.x, h.z, {
            allowCrit: true,
            inflictBleed: true,
            executePct: 0.25,
            fxColor: 0xff2952,
            stagger: 0.7,
            weaponInst: wpn
          });
        }
      }
      if (drainHeal > 0) {
        const healed = Math.min(25, drainHeal);
        h.hp = Math.min(h.maxHp, h.hp + healed);
        this.spawnFloatingText(h.x, 2.15, h.z, `+${healed}`, '#6ff0a8', 'heal');
      }
      this.cameraShake = Math.max(this.cameraShake, 0.28);
    } else if (wpn.id === 'eclipseblade') {
      const blinkDist = 4.8;
      const ox = h.x;
      const oz = h.z;
      for (let s = 1; s <= 6; s++) {
        const nx = ox + Math.sin(h.yaw) * (blinkDist * (s / 6));
        const nz = oz + Math.cos(h.yaw) * (blinkDist * (s / 6));
        if (this.dungeon.isPointWalkable(nx, nz, 0.46)) {
          h.x = nx;
          h.z = nz;
        }
      }
      h.invuln = Math.max(h.invuln, 0.48);
      this.vfx.burst(ox, 1.1, oz, 0xc76bff, 24, 5.8, 2.5);
      this.vfx.spawnRing(h.x, h.z, 4.2, 0.55, 0xffdf6e, false);
      const cuts = 5 + bonus;
      const netWaves = [];
      for (let c = 0; c < cuts; c++) {
        const ang = (c / cuts) * Math.PI * 2;
        const cx = h.x + Math.cos(ang) * (c === 0 ? 0 : 1.5);
        const cz = h.z + Math.sin(ang) * (c === 0 ? 0 : 1.5);
        const cHex = c % 2 === 0 ? 0xc76bff : 0xffdf6e;
        this.delayedHazards.push({
          friendly: true,
          timer: 0.08 + c * 0.09,
          x: cx,
          z: cz,
          radius: 3.6,
          dmg: baseDmg * 0.88,
          colorHex: cHex,
          weaponInst: wpn,
          stagger: 0.55,
          mesh: null
        });
        netWaves.push({
          timer: +(0.08 + c * 0.09).toFixed(2),
          x: +cx.toFixed(2),
          z: +cz.toFixed(2),
          radius: 3.6,
          colorHex: cHex
        });
      }
      this.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        ox: +ox.toFixed(2),
        oz: +oz.toFixed(2),
        originColorHex: 0xc76bff,
        x: +h.x.toFixed(2),
        z: +h.z.toFixed(2),
        radius: 4.2,
        dur: 0.55,
        colorHex: 0xffdf6e,
        fill: false,
        burstCount: 0
      });
      this.coopBroadcastPlayerAction?.({ act: 'hazard_vfx', waves: netWaves });
      this.cameraShake = Math.max(this.cameraShake, 0.34);
    } else if (wpn.id === 'mjolnir') {
      this.spawnPlayerProjectile({
        kind: 'storm_halberd',
        x: h.x + Math.sin(h.yaw) * 0.95,
        z: h.z + Math.cos(h.yaw) * 0.95,
        yaw: h.yaw,
        speed: 22.0,
        dmg: baseDmg * 1.95,
        pulseDmg: baseDmg * 0.52,
        pulseTimer: 0.18,
        colorHex: 0x62d8ff,
        radius: 0.95,
        life: 2.6,
        pierce: 99,
        isBoomerang: true,
        maxTravel: 11.8,
        solarZapper: true,
        isSkill: true,
        weaponInst: wpn
      });
      this.cameraShake = Math.max(this.cameraShake, 0.32);
    } else {
      const count = Math.max(h.arcProjectiles, 1) + bonus * 2;
      const spread = 0.22;
      for (let i = 0; i < count; i++) {
        const ang = h.yaw + (i - (count - 1) * 0.5) * spread;
        this.spawnPlayerProjectile({
          kind: 'crescent',
          x: h.x + Math.sin(ang) * 0.85,
          z: h.z + Math.cos(ang) * 0.85,
          yaw: ang,
          speed: 16.8,
          dmg: baseDmg * 1.52,
          colorHex: wpn.def.accentHex,
          radius: 0.88,
          life: 1.2,
          pierce: 99,
          inflictBurn: true,
          isSkill: true,
          weaponInst: wpn
        });
      }
      this.cameraShake = Math.max(this.cameraShake, 0.20);
    }
  }

  pointToSegmentDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax;
    const vz = bz - az;
    const wx = px - ax;
    const wz = pz - az;
    const c1 = vx * wx + vz * wz;
    if (c1 <= 0) return Math.hypot(px - ax, pz - az);
    const c2 = vx * vx + vz * vz;
    if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
    const b = c1 / c2;
    return Math.hypot(px - (ax + b * vx), pz - (az + b * vz));
  }

  spawnPlayerProjectile(cfg) {
    const group = new THREE.Group();
    group.position.set(cfg.x, 1.05, cfg.z);
    group.rotation.y = cfg.yaw;
    group.userData.ignoreAO = true;

    const mat = new THREE.MeshBasicMaterial({
      color: cfg.colorHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.94,
      depthWrite: false
    });

    if (cfg.kind === 'crescent') {
      const mesh = new THREE.Mesh(
        this.getSharedProjGeo('crescent', () => new THREE.TorusGeometry(0.68, 0.075, 8, 20, Math.PI * 0.85)),
        mat
      );
      mesh.userData.ignoreAO = true;
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = Math.PI * 0.08;
      group.add(mesh);
    } else if (cfg.kind === 'chakram_disc' || cfg.kind === 'sawblade') {
      const rad = cfg.kind === 'chakram_disc' ? (cfg.radius * 0.72) : 0.36;
      const rKey = `${cfg.kind}_${rad.toFixed(3)}`;
      const ring = new THREE.Mesh(
        this.getSharedProjGeo(`${rKey}_ring`, () => new THREE.TorusGeometry(rad, 0.06, 8, cfg.kind === 'sawblade' ? 10 : 20)),
        mat
      );
      ring.userData.ignoreAO = true;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      const cross = new THREE.Mesh(
        this.getSharedProjGeo(`${rKey}_cross`, () => new THREE.BoxGeometry(rad * 1.8, 0.03, 0.08)),
        mat
      );
      cross.userData.ignoreAO = true;
      group.add(cross);
    } else if (cfg.kind === 'spirit_sword' || cfg.kind === 'star_arrow') {
      const blade = new THREE.Mesh(
        this.getSharedProjGeo(`blade_${cfg.kind}`, () => new THREE.ConeGeometry(cfg.kind === 'star_arrow' ? 0.11 : 0.08, 0.95, 4)),
        mat
      );
      blade.userData.ignoreAO = true;
      blade.rotation.x = Math.PI / 2;
      group.add(blade);
    } else if (cfg.kind === 'storm_halberd') {
      const haft = new THREE.Mesh(this.getSharedProjGeo('halberd_haft', () => new THREE.BoxGeometry(0.10, 0.06, 1.35)), mat);
      haft.userData.ignoreAO = true;
      group.add(haft);
      const head = new THREE.Mesh(this.getSharedProjGeo('halberd_head', () => new THREE.BoxGeometry(0.68, 0.12, 0.32)), mat);
      head.userData.ignoreAO = true;
      head.position.z = 0.42;
      group.add(head);
    } else if (cfg.kind === 'mini_sun') {
      const core = new THREE.Mesh(this.getSharedProjGeo('sun_core', () => new THREE.SphereGeometry(0.46, 16, 12)), mat);
      core.userData.ignoreAO = true;
      group.add(core);
      const corona = new THREE.Mesh(this.getSharedProjGeo('sun_corona', () => new THREE.TorusGeometry(0.72, 0.055, 8, 24)), mat);
      corona.userData.ignoreAO = true;
      corona.rotation.x = Math.PI / 2;
      group.add(corona);
    } else if (cfg.kind === 'bolt') {
      const shaft = new THREE.Mesh(this.getSharedProjGeo('bolt_shaft', () => new THREE.CylinderGeometry(0.032, 0.032, 0.95, 6)), mat);
      shaft.userData.ignoreAO = true;
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);
    } else if (cfg.kind === 'singularity') {
      const core = new THREE.Mesh(this.getSharedProjGeo('sing_core', () => new THREE.SphereGeometry(0.42, 14, 12)), mat);
      core.userData.ignoreAO = true;
      group.add(core);
      const ring = new THREE.Mesh(this.getSharedProjGeo('sing_ring', () => new THREE.TorusGeometry(0.75, 0.05, 8, 24)), mat);
      ring.userData.ignoreAO = true;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    } else {
      const isShell = cfg.kind === 'cannon_shell';
      const orb = new THREE.Mesh(
        this.getSharedProjGeo(isShell ? 'orb_shell' : 'orb_std', () => new THREE.OctahedronGeometry(isShell ? 0.24 : 0.22, 1)),
        mat
      );
      orb.userData.ignoreAO = true;
      group.add(orb);
    }

    const glowMat = new THREE.SpriteMaterial({
      map: this.tex.softParticleTex,
      color: cfg.colorHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: cfg.kind === 'singularity' ? 0.78 : 0.58,
      depthWrite: false
    });
    const glow = new THREE.Sprite(glowMat);
    glow.userData.ignoreAO = true;
    const gScale = cfg.kind === 'singularity' ? 2.4 : (cfg.kind === 'crescent' ? 1.8 : 1.15);
    glow.scale.set(gScale, gScale, 1);
    group.add(glow);

    this.scene.add(group);
    let traceStartX = cfg.x;
    let traceStartZ = cfg.z;
    const backPX = cfg.x - Math.sin(cfg.yaw) * 0.62;
    const backPZ = cfg.z - Math.cos(cfg.yaw) * 0.62;
    if (
      this.dungeon &&
      this.dungeon.isPointWalkable(backPX, backPZ, 0.14) &&
      !this.dungeon.isPointBlockedByCover?.(backPX, backPZ, 0.14)
    ) {
      traceStartX = backPX;
      traceStartZ = backPZ;
    }
    this.projectiles.push({
      mesh: group,
      _ownedMats: [mat, glowMat],
      kind: cfg.kind,
      x: cfg.x,
      z: cfg.z,
      prevTraceX: traceStartX,
      prevTraceZ: traceStartZ,
      firstTracePending: true,
      vx: Math.sin(cfg.yaw) * cfg.speed,
      vz: Math.cos(cfg.yaw) * cfg.speed,
      speed: cfg.speed,
      friendly: true,
      visualOnly: !!cfg.visualOnly,
      ownerPeer: cfg.ownerPeer || null,
      dmg: cfg.dmg,
      pulseDmg: cfg.pulseDmg || 0,
      pulseTimer: cfg.pulseTimer || 0,
      pullRadius: cfg.pullRadius || 0,
      colorHex: cfg.colorHex,
      radius: cfg.radius || 0.45,
      life: cfg.life || 1.1,
      pierceLeft: cfg.pierce || 1,
      bouncesLeft: cfg.bouncesLeft || 0,
      ricochetLeft: cfg.ricochetLeft || 0,
      isBoomerang: !!cfg.isBoomerang,
      boomerangPhase: 0,
      hoverTimer: 0,
      travelDist: 0,
      maxTravel: cfg.maxTravel || 9.5,
      splashRadius: cfg.splashRadius || 0,
      spawnAcidPool: !!cfg.spawnAcidPool,
      inflictBurn: !!cfg.inflictBurn,
      inflictBleed: !!cfg.inflictBleed,
      inflictBlight: !!cfg.inflictBlight,
      pointBlankBonus: !!cfg.pointBlankBonus,
      originX: cfg.originX ?? cfg.x,
      originZ: cfg.originZ ?? cfg.z,
      voltaicArc: !!cfg.voltaicArc,
      swordMarkHit: !!cfg.swordMarkHit,
      starfallTrigger: !!cfg.starfallTrigger,
      lifestealOnHit: cfg.lifestealOnHit || 0,
      solarZapper: !!cfg.solarZapper,
      chillDuration: cfg.chillDuration || 0,
      homingTarget: cfg.homingTarget || null,
      isSkill: !!cfg.isSkill,
      weaponInst: cfg.weaponInst || null,
      hitSet: new Set()
    });

    if (!cfg.visualOnly && this.coopBroadcastPlayerAction && this.isCoopActive && this.isCoopActive()) {
      this.coopBroadcastPlayerAction({
        act: 'spawn_proj',
        list: [{
          kind: cfg.kind,
          x: +cfg.x.toFixed(2),
          z: +cfg.z.toFixed(2),
          yaw: +cfg.yaw.toFixed(3),
          speed: cfg.speed,
          dmg: 0,
          colorHex: cfg.colorHex,
          radius: cfg.radius || 0.45,
          life: cfg.life || 1.0,
          pierce: cfg.pierce || 1,
          splashRadius: cfg.splashRadius || 0,
          isBoomerang: !!cfg.isBoomerang,
          maxTravel: cfg.maxTravel || 9.5,
          ricochetLeft: cfg.ricochetLeft || 0,
          bouncesLeft: cfg.bouncesLeft || 0,
          spawnAcidPool: !!cfg.spawnAcidPool
        }]
      });
    }
  }

  spawnVisualPrismBeam(ox, oz, endX, endZ, colorHex = 0x58f7ff) {
    const pts = [
      new THREE.Vector3(ox, 1.12, oz),
      new THREE.Vector3((ox + endX) * 0.5, 1.14, (oz + endZ) * 0.5),
      new THREE.Vector3(endX, 1.12, endZ)
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 1.0 })
    );
    line.userData.ignoreAO = true;
    this.scene.add(line);
    this.lightningLines.push({ mesh: line, life: 0.16 });
    this.vfx.burst(endX, 1.1, endZ, colorHex, 10, 4.2, 5.0);
  }

  fireInstantPrismBeam(ox, oz, yaw, maxRange, dmg, wpn, canRefract = false, colorHex = 0x58f7ff, beamWidth = 0.72) {
    const backBX = ox - Math.sin(yaw) * 0.55;
    const backBZ = oz - Math.cos(yaw) * 0.55;
    const traceStartX = (
      this.dungeon &&
      this.dungeon.isPointWalkable(backBX, backBZ, 0.12) &&
      !this.dungeon.isPointBlockedByCover?.(backBX, backBZ, 0.12)
    ) ? backBX : ox;
    const traceStartZ = traceStartX === backBX ? backBZ : oz;
    const totalSpan = maxRange + Math.hypot(ox - traceStartX, oz - traceStartZ);
    let endX = traceStartX;
    let endZ = traceStartZ;
    const steps = 36;
    for (let s = 1; s <= steps; s++) {
      const d = (s / steps) * totalSpan;
      const tx = traceStartX + Math.sin(yaw) * d;
      const tz = traceStartZ + Math.cos(yaw) * d;
      if (this.dungeon) {
        const segHit = this.dungeon.traceProjectileObstruction
          ? this.dungeon.traceProjectileObstruction(endX, endZ, tx, tz, 0.12)
          : (!this.dungeon.isPointWalkable(tx, tz, 0.12) ? { x: endX, z: endZ } : null);
        if (segHit) {
          endX = segHit.x;
          endZ = segHit.z;
          break;
        }
      }
      endX = tx;
      endZ = tz;
    }
    const pts = [
      new THREE.Vector3(ox, 1.12, oz),
      new THREE.Vector3((ox + endX) * 0.5, 1.14, (oz + endZ) * 0.5),
      new THREE.Vector3(endX, 1.12, endZ)
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 1.0 })
    );
    line.userData.ignoreAO = true;
    this.scene.add(line);
    this.lightningLines.push({ mesh: line, life: 0.16 });
    this.vfx.burst(endX, 1.1, endZ, colorHex, 10, 4.2, 5.0);
    this.coopBroadcastPlayerAction?.({
      act: 'beam_vfx',
      ox: +ox.toFixed(2),
      oz: +oz.toFixed(2),
      ex: +endX.toFixed(2),
      ez: +endZ.toFixed(2),
      colorHex
    });

    if (this.dungeon) {
      for (const d of this.dungeon.destructibles) {
        if (!d.broken && this.pointToSegmentDist(d.x, d.z, ox, oz, endX, endZ) <= beamWidth + d.r) {
          this.breakProp(d);
        }
      }
    }
    let firstHit = null;
    for (const e of [...this.enemies]) {
      if (!e || e.hp <= 0) continue;
      if (
        this.pointToSegmentDist(e.x, e.z, ox, oz, endX, endZ) <= beamWidth + e.radius &&
        !this.dungeon?.isSegmentBlockedByCover?.(traceStartX, traceStartZ, e.x, e.z, 0.04)
      ) {
        if (!firstHit) firstHit = e;
        this.damageEnemy(e, dmg, ox, oz, {
          weaponInst: wpn,
          fxColor: colorHex,
          inflictBurn: beamWidth > 1.0
        });
      }
    }
    if (canRefract && firstHit) {
      for (const other of this.enemies) {
        if (other === firstHit || !other || other.hp <= 0) continue;
        if (Math.hypot(other.x - firstHit.x, other.z - firstHit.z) <= 6.8) {
          this.spawnLightningBolt(firstHit.x, firstHit.z, other.x, other.z, 0xc77dff);
          this.damageEnemy(other, dmg * 0.58, firstHit.x, firstHit.z, {
            weaponInst: wpn,
            fxColor: 0xc77dff
          });
          break;
        }
      }
    }
  }

  spawnAcidPoolAt(x, z, radius, dps, wpn, visualOnly = false) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.15, radius, 24),
      new THREE.MeshBasicMaterial({
        color: 0x6dff47,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.userData.ignoreAO = true;
    this.scene.add(mesh);
    this.acidPools.push({
      mesh,
      x,
      z,
      radius,
      dps,
      life: 3.6,
      maxLife: 3.6,
      tick: 0.15,
      weaponInst: wpn,
      visualOnly: !!visualOnly
    });
  }

  spawnRemoteWeaponOrbitals(peer, sub = 'saw', count = 3, duration = 6.5) {
    if (!peer) return;
    if (sub === 'saw') {
      for (let i = this.orbitalBlades.length - 1; i >= 0; i--) {
        if (this.orbitalBlades[i].visualOnly && this.orbitalBlades[i].ownerPeer === peer && this.orbitalBlades[i].kind === 'saw') {
          this.scene.remove(this.orbitalBlades[i].mesh);
          this.orbitalBlades.splice(i, 1);
        }
      }
      for (let k = 0; k < count; k++) {
        const grp = new THREE.Group();
        grp.userData.ignoreAO = true;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x8be2ff,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.92,
          depthWrite: false
        });
        const disc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 6, 12), mat);
        disc.rotation.x = Math.PI / 2;
        grp.add(disc);
        this.scene.add(grp);
        this.orbitalBlades.push({
          kind: 'saw',
          mesh: grp,
          angle: (k / count) * Math.PI * 2,
          orbitRad: 2.25,
          dmg: 0,
          life: duration,
          visualOnly: true,
          ownerPeer: peer,
          hitCdMap: new Map()
        });
      }
    } else if (sub === 'wraith_skull') {
      for (let k = 0; k < count; k++) {
        const grp = new THREE.Group();
        grp.userData.ignoreAO = true;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x52ffbc,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.92,
          depthWrite: false
        });
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 1), mat);
        grp.add(orb);
        this.scene.add(grp);
        this.orbitalBlades.push({
          kind: 'wraith_skull',
          mesh: grp,
          angle: Math.random() * Math.PI * 2,
          orbitRad: 1.75,
          dmg: 0,
          life: duration,
          armDelay: 0.35,
          visualOnly: true,
          ownerPeer: peer,
          hitCdMap: new Map()
        });
      }
    }
  }

  spawnOrbitalSawblades(count, dmg, duration, wpn) {
    for (let i = this.orbitalBlades.length - 1; i >= 0; i--) {
      if (this.orbitalBlades[i].kind === 'saw') {
        this.scene.remove(this.orbitalBlades[i].mesh);
        this.orbitalBlades.splice(i, 1);
      }
    }
    for (let k = 0; k < count; k++) {
      const grp = new THREE.Group();
      grp.userData.ignoreAO = true;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8be2ff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      const disc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 6, 12), mat);
      disc.rotation.x = Math.PI / 2;
      grp.add(disc);
      this.scene.add(grp);
      this.orbitalBlades.push({
        kind: 'saw',
        mesh: grp,
        angle: (k / count) * Math.PI * 2,
        orbitRad: 2.25,
        dmg,
        life: duration,
        weaponInst: wpn,
        hitCdMap: new Map()
      });
    }
  }

  spawnWraithSkull(dmg, wpn) {
    const activeSkulls = this.orbitalBlades.filter((o) => o.kind === 'wraith_skull');
    if (activeSkulls.length >= 5) return;
    const grp = new THREE.Group();
    grp.userData.ignoreAO = true;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x52ffbc,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 1), mat);
    grp.add(orb);
    this.scene.add(grp);
    this.orbitalBlades.push({
      kind: 'wraith_skull',
      mesh: grp,
      angle: Math.random() * Math.PI * 2,
      orbitRad: 1.75,
      dmg,
      life: 14.0,
      armDelay: 0.35,
      weaponInst: wpn,
      hitCdMap: new Map()
    });
  }

  spawnTeslaTurret(x, z, zapDmg, wpn, visualOnly = false) {
    if (!visualOnly) {
      const own = this.summons.filter((s) => !s.visualOnly);
      while (own.length >= 2) {
        const old = own.shift();
        const idx = this.summons.indexOf(old);
        if (idx !== -1) this.summons.splice(idx, 1);
        if (old && old.mesh) this.scene.remove(old.mesh);
      }
    }
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.userData.ignoreAO = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.22, 12), this.mats.gildedBronze);
    base.position.y = 0.11;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.78, 10), this.mats.silverSteel);
    mast.position.y = 0.52;
    const coilMat = new THREE.MeshBasicMaterial({ color: 0x7ef5ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95 });
    const coil = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), coilMat);
    coil.position.y = 1.05;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 18), coilMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.92;
    root.add(base, mast, coil, ring);
    this.scene.add(root);
    this.vfx.spawnRing(x, z, 2.2, 0.38, 0x7ef5ff, false);
    this.vfx.burst(x, 0.9, z, 0xffe066, 20, 4.8, 4.0);
    this.summons.push({
      mesh: root,
      coil,
      ring,
      x,
      z,
      zapDmg,
      zapTimer: 0.20,
      life: 14.0,
      weaponInst: wpn,
      visualOnly: !!visualOnly
    });
    if (!visualOnly) {
      this.coopBroadcastPlayerAction?.({
        act: 'tesla_turret_vfx',
        x: +x.toFixed(2),
        z: +z.toFixed(2)
      });
    }
  }

  spawnEnemyProjectile(x, z, yaw, dmg, colorHex = 0xff3322, speed = 6.3, fromNet = false) {
    if (!fromNet && this.isCoopHost && this.isCoopHost()) {
      this.coopBroadcastEnemyAttack({
        sub: 'proj',
        x: +x.toFixed(2),
        z: +z.toFixed(2),
        yaw: +yaw.toFixed(3),
        dmg,
        colorHex,
        speed
      });
    }
    const group = new THREE.Group();
    group.position.set(x, 1.05, z);
    group.rotation.y = yaw;
    group.userData.ignoreAO = true;

    const orbMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(
      this.getSharedProjGeo('enemy_orb_geo', () => new THREE.OctahedronGeometry(0.24, 1)),
      orbMat
    );
    mesh.userData.ignoreAO = true;
    group.add(mesh);
    const haloMat = new THREE.SpriteMaterial({
      map: this.tex.softParticleTex,
      color: colorHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });
    const halo = new THREE.Sprite(haloMat);
    halo.userData.ignoreAO = true;
    halo.scale.set(0.95, 0.95, 1);
    group.add(halo);

    this.scene.add(group);
    let traceStartX = x;
    let traceStartZ = z;
    const backEX = x - Math.sin(yaw) * 0.55;
    const backEZ = z - Math.cos(yaw) * 0.55;
    if (
      this.dungeon &&
      this.dungeon.isPointWalkable(backEX, backEZ, 0.14) &&
      !this.dungeon.isPointBlockedByCover?.(backEX, backEZ, 0.14)
    ) {
      traceStartX = backEX;
      traceStartZ = backEZ;
    }
    this.projectiles.push({
      mesh: group,
      _ownedMats: [orbMat, haloMat],
      kind: 'enemy_orb',
      x,
      z,
      prevTraceX: traceStartX,
      prevTraceZ: traceStartZ,
      firstTracePending: true,
      vx: Math.sin(yaw) * speed,
      vz: Math.cos(yaw) * speed,
      speed,
      friendly: false,
      dmg,
      colorHex,
      radius: 0.35,
      life: 2.8,
      hitSet: new Set()
    });
  }

  tryDash(fromBuffer = false) {
    if (this.mode !== 'explore') return;
    const h = this.hero;
    if (h.downed || h.dashTimer > 0) return;
    if (h.dashCd > 0) {
      if (!fromBuffer && h.dashCd <= 0.18) {
        this.queueInputBuffer('dash');
      } else if (!fromBuffer) {
        this.pulseSlotReject('slot-dash');
      }
      return;
    }

    let mx = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    let mz = (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) - (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0);
    if (mx === 0 && mz === 0) {
      mx = Math.sin(h.yaw);
      mz = Math.cos(h.yaw);
    } else {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      h.yaw = Math.atan2(mx, mz);
    }

    const ox = h.x;
    const oz = h.z;
    h.dashDirX = mx;
    h.dashDirZ = mz;
    h.dashTimer = 0.19;
    h.invuln = 0.32;
    h.dashCd = Math.max(0.42, 0.92 * h.dashCdMult);
    h.atkState = null;

    this.sfx.dash(h.classId, { x: ox, z: oz });
    this.vfx.burst(ox, 1.0, oz, 0xb47cff, 20, 4.8, 3.0);
    this.vfx.spawnRing(ox, oz, 1.35, 0.35, 0xb47cff, false);
    if (this.coopBroadcastPlayerAction) {
      this.coopBroadcastPlayerAction({ act: 'dash', x: +ox.toFixed(2), z: +oz.toFixed(2) });
    }

    if (h.dashNova > 0) {
      this.vfx.spawnRing(ox, oz, 3.2, 0.42, 0xb47cff, true);
      this.vfx.flash(ox, 1.2, oz, 0xb47cff, 14);
      for (const e of [...this.enemies]) {
        if (Math.hypot(e.x - ox, e.z - oz) <= 3.2 + e.radius) {
          this.damageEnemy(e, h.dashNova, ox, oz, { allowCrit: false, fxColor: 0xb47cff });
        }
      }
    }
    onClassDash(this, ox, oz);
  }

  tryHealFlask() {
    if (this.mode !== 'explore') return;
    const h = this.hero;
    if (h.downed) return;
    if (h.flasks <= 0) {
      this.pulseSlotReject('slot-flask', tUI().floatNoFlasks);
      return;
    }
    if (h.hp >= h.maxHp) {
      this.pulseSlotReject('slot-flask', tUI().floatHpAlreadyFull);
      return;
    }
    h.flasks--;
    const healPct = 0.42 + (h.classId === 'plague_apothecary' ? 0.15 : 0) + (h.flaskHealBonus || 0);
    const heal = Math.round(h.maxHp * healPct);
    h.hp = Math.min(h.maxHp, h.hp + heal);
    this.sfx.healFlask();
    this.vfx.burst(h.x, 1.1, h.z, 0xffd166, 28, 5.0, 4.0);
    this.vfx.spawnRing(h.x, h.z, 2.2, 0.48, 0xffd166, false);
    this.vfx.flash(h.x, 1.5, h.z, 0xffd166, 15);
    this.spawnFloatingText(h.x, 2.1, h.z, `+${heal}`, '#6ff0a8', 'heal');
    this.updateHUD();
  }

  damageEnemy(e, rawDmg, srcX, srcZ, opts = {}) {
    if (!e || e.hp <= 0) return;
    if (this.isCoopClient && this.isCoopClient() && !opts.fromHost) {
      this.coopSendDamageReq(e, rawDmg, srcX, srcZ, opts);
      return;
    }
    const h = this.hero;
    const allowCrit = opts.allowCrit !== false;
    const wpn = opts.weaponInst || this.activeWeapon();
    const fxColor = opts.fxColor || null;

    const baseCritChance = opts.attackerCritChance ?? h.critChance;
    const baseCritMult = opts.attackerCritMult ?? h.critMult;
    const rawCritChance = baseCritChance + (wpn ? wpn.critBonus : 0) + (opts.attackerId ? 0 : getClassBonusCritChance(h));
    const overflowCrit = Math.max(0, rawCritChance - 1.0);
    const critChance = Math.min(1.0, rawCritChance);
    const critMult = baseCritMult + (wpn ? wpn.critMultBonus : 0) + overflowCrit;
    const isCrit = opts.forceCrit || (allowCrit && Math.random() < critChance);

    let bonusMult = 1.0;
    const isSlowed = e.chillTimer > 0 || (e.blightTimer || 0) > 0 || (e.poisonTimer || 0) > 0;
    if (isSlowed && (h.chilledDmgBonus || 0) > 0) bonusMult *= 1 + h.chilledDmgBonus;
    if (e.chillTimer > 0 && h.rangedDmgMult > 1.02) bonusMult *= 1.18;
    if (e.chillTimer > 0 && wpn && wpn.id === 'twinblades') bonusMult *= 1.20;
    let amount = Math.max(1, Math.round(rawDmg * bonusMult * (isCrit ? critMult : 1.0)));

    const atkId = opts.attackerId || (this.lan && this.lan.clientId) || 'local';
    if (e.threatMap) {
      e.threatMap[atkId] = (e.threatMap[atkId] || 0) + amount;
    }

    const chillDur = Math.max(
      opts.chillDuration || 0,
      (wpn && wpn.affixChill) || 0,
      (!opts.attackerId && allowCrit) ? (h.boonChillDur || 0) : 0
    );
    if (chillDur > 0 && !opts.isDot) {
      e.chillTimer = Math.max(e.chillTimer, chillDur);
    }
    const effMult = this.effectiveDmgMult(wpn);
    const atkBurn = opts.attackerBurnDps ?? h.burnDps;
    if ((atkBurn > 0 && allowCrit) || opts.inflictBurn || (wpn && wpn.affixBurn && !opts.isDot) || (wpn && wpn.def.element === 'PYRE' && allowCrit)) {
      e.burnTimer = Math.max(e.burnTimer, 2.5);
      const baseBurn = atkBurn > 0 ? atkBurn : 18;
      e.burnDps = Math.max(e.burnDps, Math.round(baseBurn * effMult));
    }
    if (opts.inflictBleed) {
      e.bleedTimer = Math.max(e.bleedTimer || 0, 3.0);
      e.bleedDps = Math.max(e.bleedDps || 0, Math.round(24 * effMult));
    }
    if (opts.inflictBlight) {
      e.blightTimer = Math.max(e.blightTimer || 0, 3.6);
      e.blightDps = Math.max(e.blightDps || 0, Math.round(22 * effMult));
    }
    const totalVampCrit = (h.vampCrit || 0) + (wpn ? (wpn.vampCrit || 0) : 0);
    if (!opts.attackerId && isCrit && totalVampCrit > 0 && (h.vampCritIcd || 0) <= 0) {
      h.vampCritIcd = 0.25;
      h.hp = Math.min(h.maxHp, h.hp + totalVampCrit);
    }
    if (!opts.attackerId && isCrit && wpn && (wpn.energyCrit || 0) > 0 && (h.energyCritIcd || 0) <= 0) {
      h.energyCritIcd = 0.22;
      this.gainHeroEnergy(wpn.energyCrit, { raw: true, showFloat: false });
    }

    let shieldBroke = false;
    if (e.shield > 0) {
      const atkShBreak = opts.attackerShieldBreak ?? (h.shieldBreakMult || 1.0);
      const shMult = atkShBreak;
      const shieldDmg = Math.max(1, Math.round(amount * shMult));
      if (shieldDmg < e.shield) {
        e.shield -= shieldDmg;
        e.flashTimer = 0.07;
        this.vfx.burst(e.x, 1.2, e.z, 0x63dcff, 12, 4.8, 8.0);
        this.sfx.impactEnemyShield(isCrit, { x: e.x, z: e.z });
        this.spawnFloatingText(e.x, e.boss ? 2.9 : 2.05, e.z, tUI().floatShieldHit(shieldDmg), '#7ee8ff', 'shield');
        if (e.boss && e.maxShield > 0) {
          document.getElementById('boss-shield-fill').style.width = `${Math.max(0, (e.shield / e.maxShield) * 100)}%`;
        }
        if (this.isCoopHost && this.isCoopHost()) {
          this.lan.relay({
            kind: 'enemy_damaged',
            eid: e.eid,
            hp: Math.ceil(e.hp),
            shield: Math.ceil(e.shield),
            amount: shieldDmg,
            shieldHit: true,
            shieldBroke: false,
            isCrit
          }, 'others');
        }
        this.updateHUD();
        return;
      }
      const overflow = Math.max(0, Math.round((shieldDmg - e.shield) / Math.max(1, shMult)));
      e.shield = 0;
      shieldBroke = true;
      e.poise = !!e.boss;
      e.stunTimer = Math.max(e.stunTimer, e.boss ? 1.5 : 2.1);
      if (e.shieldMesh) e.shieldMesh.visible = false;
      if (e.boss) {
        document.getElementById('boss-shield-fill').style.width = '0%';
        document.getElementById('boss-shield-track').classList.add('hidden');
      }
      this.sfx.shieldBreak(!!e.boss, false, { x: e.x, z: e.z });
      this.cameraShake = Math.max(this.cameraShake, 0.30);
      this.vfx.burst(e.x, 1.25, e.z, 0x63dcff, 34, 7.2, 7.5);
      this.vfx.spawnRing(e.x, e.z, e.boss ? 3.8 : 2.3, 0.45, 0x63dcff, false);
      this.spawnFloatingText(e.x, e.boss ? 3.2 : 2.35, e.z, tUI().floatShieldBreak, '#7ee8ff', 'callout');
      amount = Math.max(4, overflow);
    }

    e.hp -= amount;
    e.flashTimer = 0.09;

    const scytheExec = e.isEliteMob ? 0.08 : 0.14;
    const execThreshold = opts.executePct || (wpn && wpn.id === 'bloodscythe' && !opts.isDot ? scytheExec : 0);
    if (execThreshold > 0 && !e.boss && e.hp > 0 && e.hp <= e.maxHp * execThreshold) {
      e.hp = 0;
      this.sfx.executeSlash({ x: e.x, z: e.z });
      this.vfx.burst(e.x, 1.25, e.z, 0xff2952, 28, 7.0, 9.0);
      this.spawnFloatingText(e.x, 2.35, e.z, getLang() === 'zh' ? '⚡处决!' : 'EXECUTE!', '#ff4d6d', 'callout');
    }

    if (!e.enraged && e.affixes.includes('frenzied') && e.hp > 0 && e.hp <= e.maxHp * 0.55) {
      e.enraged = true;
      e.speed *= 1.36;
      e.baseCd *= 0.72;
      this.vfx.spawnRing(e.x, e.z, 1.9, 0.38, 0xff2a55, false);
      this.spawnFloatingText(e.x, 2.25, e.z, tUI().floatFrenzied, '#ff4d6d', 'callout');
    }

    if (opts.stagger && !e.boss && e.shield <= 0) {
      const stagDur = opts.stagger * (e.isEliteMob ? 0.55 : 1.0);
      e.stunTimer = Math.max(e.stunTimer, stagDur);
    }

    const dx = e.x - srcX;
    const dz = e.z - srcZ;
    const dist = Math.hypot(dx, dz) || 1;
    const kbBase = opts.knockbackOverride !== undefined
      ? opts.knockbackOverride
      : (wpn && wpn.knockback ? wpn.knockback : 4.8);
    const stateArmor = (e.state === 'windup' || e.state === 'strike') ? 0.35 : 1.0;
    const kbMult = e.poise ? 0.20 : (e.isEliteMob ? 0.36 : 0.56);
    const kb = kbBase * kbMult * stateArmor;
    e.vx += (dx / dist) * kb;
    e.vz += (dz / dist) * kb;

    const sparkColor = fxColor || (isCrit ? 0xffdf66 : h.bladeColor);
    this.vfx.burst(e.x, 1.15, e.z, sparkColor, isCrit ? 22 : 13, isCrit ? 6.8 : 5.0, 12.0);
    this.vfx.flash(e.x, 1.3, e.z, sparkColor, isCrit ? 16 : 9);
    this.sfx.impactEnemy({
      heavy: isCrit || !!e.boss || (wpn?.def?.impactClass === 'heavy'),
      crit: isCrit,
      element: wpn?.def?.element || 'PIERCE',
      isDot: !!opts.isDot,
      pos: { x: e.x, z: e.z }
    });
    if (opts.isDot) {
      this.spawnFloatingText(e.x, e.boss ? 2.65 : 1.85, e.z, `${amount}`, '#ff9b54', 'dot');
    } else {
      this.spawnFloatingText(
        e.x,
        e.boss ? 2.8 : 1.95,
        e.z,
        isCrit ? `${amount}!` : `${amount}`,
        isCrit ? '#ffd45c' : '#f2ede4',
        isCrit ? 'crit' : 'normal'
      );
    }

    if (isCrit) {
      this.hitStop = Math.max(this.hitStop, 0.032);
      this.cameraShake = Math.max(this.cameraShake, 0.22);
      this.dungeon.addFloorDecal(e.x, e.z, 0x24070c, 1.45, 0.55);
    } else {
      this.cameraShake = Math.max(this.cameraShake, 0.09);
    }

    if (allowCrit && h.chainLightning > 0) {
      h.hitCounter++;
      if (h.hitCounter % 3 === 0) this.triggerChainLightning(e, Math.round(h.chainLightning * effMult));
    }
    if (isCrit && wpn && wpn.affixShock > 0 && e.hp > 0) {
      this.triggerChainLightning(e, Math.round(wpn.affixShock * effMult));
    }
    if (e.boss) {
      document.getElementById('boss-fill').style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      if (e.hp > 0 && !(this.isCoopClient && this.isCoopClient())) {
        const hpRatio = e.hp / Math.max(1, e.maxHp);
        if (!e.bossEnraged && hpRatio <= 0.50) {
          e.bossEnraged = true;
          e.speed *= 1.20;
          e.baseCd = +(e.baseCd * 0.78).toFixed(3);
          this.spawnCinderOrbs(e.x, e.z, 26, {
            orbKind: 'energy',
            seed: this.makeOrbDropSeed(e.x, e.z, 26)
          });
          this.vfx.spawnRing(e.x, e.z, 3.8, 0.55, 0xff2a55, true);
          this.sfx.bossRoar(true, { x: e.x, z: e.z });
        }
        if (!e.summoned70 && hpRatio <= 0.70) {
          e.summoned70 = true;
          this.spawnBossSummonWave(e);
        } else if (!e.summoned35 && hpRatio <= 0.35) {
          e.summoned35 = true;
          this.spawnBossSummonWave(e);
        } else if (!e.summoned18 && hpRatio <= 0.18 && this.selectedDifficultyId === 'abyssal') {
          e.summoned18 = true;
          this.spawnBossSummonWave(e);
        }
      }
    }
    if (e.hp > 0 && this.isCoopHost && this.isCoopHost()) {
      this.lan.relay({
        kind: 'enemy_damaged',
        eid: e.eid,
        hp: Math.ceil(e.hp),
        shield: Math.ceil(e.shield),
        amount,
        shieldHit: false,
        shieldBroke,
        isCrit
      }, 'others');
    }
    onClassEnemyDamaged(this, e, amount, isCrit, opts);
    if (e.hp <= 0) this.killEnemy(e);
    this.updateHUD();
  }

  triggerChainLightning(sourceEnemy, dmg) {
    let jumped = 0;
    for (const other of this.enemies) {
      if (other === sourceEnemy || other.hp <= 0) continue;
      if (Math.hypot(other.x - sourceEnemy.x, other.z - sourceEnemy.z) < 7.2 && jumped < 2) {
        jumped++;
        this.spawnLightningBolt(sourceEnemy.x, sourceEnemy.z, other.x, other.z);
        this.damageEnemy(other, dmg, sourceEnemy.x, sourceEnemy.z, { allowCrit: false, fxColor: 0x5ec2ff });
      }
    }
    if (jumped > 0) this.sfx.chainLightningZap({ x: sourceEnemy.x, z: sourceEnemy.z });
    else this.vfx.spawnRing(sourceEnemy.x, sourceEnemy.z, 1.8, 0.28, 0x5ec2ff, false);
  }

  spawnLightningBolt(x1, z1, x2, z2, colorHex = 0x8be0ff, fromNet = false) {
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const j = (i === 0 || i === 7) ? 0 : 0.52;
      pts.push(new THREE.Vector3(
        x1 + (x2 - x1) * t + (Math.random() - 0.5) * j,
        1.15 + (Math.random() - 0.5) * j * 0.6,
        z1 + (z2 - z1) * t + (Math.random() - 0.5) * j
      ));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 1.0 })
    );
    line.userData.ignoreAO = true;
    this.scene.add(line);
    this.lightningLines.push({ mesh: line, life: 0.18 });
    if (!fromNet) {
      this.coopBroadcastPlayerAction?.({
        act: 'bolt_vfx',
        x1: +x1.toFixed(2),
        z1: +z1.toFixed(2),
        x2: +x2.toFixed(2),
        z2: +z2.toFixed(2),
        colorHex
      });
    }
  }

  killEnemy(e, fromHost = false, netPayload = null) {
    const idx = this.enemies.indexOf(e);
    if (idx !== -1) this.enemies.splice(idx, 1);
    this.releaseEnemyRig(e);
    if (this.lockedEnemy === e) this.lockedEnemy = null;
    this.kills++;
    this.sfx.enemyKill(e.type, !!e.isEliteMob, !!e.boss, { x: e.x, z: e.z });

    const orbSeed = (netPayload && netPayload.orbSeed) || this.makeOrbDropSeed(e.x, e.z, e.cinders);
    const killMsg = (!fromHost && this.isCoopHost && this.isCoopHost())
      ? {
          kind: 'enemy_killed',
          eid: e.eid,
          x: +e.x.toFixed(2),
          z: +e.z.toFixed(2),
          cinders: e.cinders,
          orbSeed,
          isTrialClear: false,
          trialWeapon: null,
          bossPortal: null,
          victory: false
        }
      : null;

    this.dungeon.addFloorDecal(e.x, e.z, 0x1e060a, e.boss ? 3.8 : 1.9, 0.72);
    this.spawnCinderOrbs(e.x, e.z, e.cinders, { handledByEvent: true, seed: orbSeed });
    if (!fromHost) {
      const scDrop = this.getActiveScaling ? this.getActiveScaling() : { spawnMult: 1.0, mobHpMult: 1.0 };
      if (e.boss) {
        this.spawnCinderOrbs(e.x, e.z, 48, {
          orbKind: 'energy',
          seed: (orbSeed ^ 0x3b9aca07) >>> 0
        });
      } else {
        const enDensityDamp = Math.pow(Math.max(1.0, scDrop.spawnMult || 1.0), 0.35);
        const enHpScale = Math.pow(Math.max(1.0, scDrop.mobHpMult || 1.0), 0.32);
        const isHeavyOrElite = !!(e.isEliteMob || e.type === 'juggernaut');
        const enChance = e.bossSummon
          ? 0.88
          : ((isHeavyOrElite ? 0.82 : 0.54) / enDensityDamp);
        if (Math.random() < enChance) {
          const baseEn = e.bossSummon ? 15 : (isHeavyOrElite ? 16 : 11);
          const enVal = Math.max(6, Math.round(baseEn * enHpScale));
          this.spawnCinderOrbs(e.x, e.z, enVal, {
            orbKind: 'energy',
            seed: (orbSeed ^ 0x3b9aca07) >>> 0
          });
        }
      }
    }
    if (!fromHost && !e.boss) {
      const scDrop = this.getActiveScaling ? this.getActiveScaling() : { spawnMult: 1.0 };
      const densityDamp = Math.sqrt(Math.max(1.0, scDrop.spawnMult || 1.0));
      const vitChance = (e.bossSummon ? 0.32 : (e.isEliteMob ? 0.11 : 0.035)) / densityDamp;
      if (Math.random() < vitChance) {
        const vitVal = Math.max(8, Math.round((this.hero?.maxHp || 160) * 0.06));
        this.spawnCinderOrbs(e.x, e.z, vitVal, {
          orbKind: 'vitality',
          seed: (orbSeed ^ 0x77aa33cc) >>> 0
        });
      }
    }

    if (!this.hero.downed && this.hero.vampKill > 0) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.vampKill);
      this.spawnFloatingText(this.hero.x, 2.0, this.hero.z, `+${this.hero.vampKill}`, '#6ff0a8', 'heal');
    }
    if (!this.hero.downed && (this.hero.energyOnKill || 0) > 0) {
      this.gainHeroEnergy(this.hero.energyOnKill, { raw: true, showFloat: false });
    }
    onClassEnemyKilled(this, e, false);

    if (e.blightTimer > 0 && !fromHost) {
      this.vfx.spawnRing(e.x, e.z, 2.55, 0.36, 0x76ff4d, false);
      for (const other of [...this.enemies]) {
        if (other && other.hp > 0 && Math.hypot(other.x - e.x, other.z - e.z) <= 2.6 + other.radius) {
          this.damageEnemy(other, Math.round(34 * this.effectiveDmgMult()), e.x, e.z, {
            allowCrit: false,
            inflictBlight: true,
            fxColor: 0x76ff4d,
            isDot: true
          });
        }
      }
    }

    const curActiveWpn = this.activeWeapon();
    if (curActiveWpn && !this.hero.downed && !fromHost) {
      if (curActiveWpn.id === 'bloodscythe' && this.enemies.length > 0) {
        const near = this.enemies[0];
        const wyaw = Math.atan2(near.x - e.x, near.z - e.z);
        this.spawnPlayerProjectile({
          kind: 'void_orb',
          x: e.x,
          z: e.z,
          yaw: wyaw,
          speed: 17.5,
          dmg: curActiveWpn.dmg * this.effectiveDmgMult(curActiveWpn) * 0.78,
          colorHex: 0xff2952,
          radius: 0.45,
          life: 1.25,
          pierce: 1,
          homingTarget: near,
          lifestealOnHit: 3,
          weaponInst: curActiveWpn
        });
      } else if (curActiveWpn.id === 'soulgrimoire') {
        this.spawnWraithSkull(curActiveWpn.dmg * this.effectiveDmgMult(curActiveWpn) * 1.3, curActiveWpn);
      }
    }

    if (e.affixes && e.affixes.includes('volatile')) {
      const scVol = this.getActiveScaling ? this.getActiveScaling() : { dmgMult: 1.0 };
      const warn = this.vfx.spawnRing(e.x, e.z, 2.85, 0.95, 0xff5a22, true);
      this.delayedHazards.push({
        friendly: false,
        timer: 0.95,
        x: e.x,
        z: e.z,
        radius: 2.75,
        dmg: Math.round(28 * this.floorCfg.dmgMult * (scVol.dmgMult || 1.0)),
        colorHex: 0xff5a22,
        mesh: warn
      });
    }

    this.vfx.burst(e.x, 1.1, e.z, e.rig.cfg.glow, e.boss ? 65 : 28, e.boss ? 8.5 : 5.8, 8.5);
    this.vfx.spawnRing(e.x, e.z, e.boss ? 4.5 : 1.65, e.boss ? 0.85 : 0.42, e.rig.cfg.glow, false);
    this.vfx.flash(e.x, 1.4, e.z, e.rig.cfg.glow, e.boss ? 28 : 14);

    if (e.boss) {
      document.getElementById('boss-bar-wrap').classList.add('hidden');
      this.hitStop = 0.09;
      this.cameraShake = 0.55;
    }

    const room = e.room;
    let remainingInRoom = this.enemies.filter((o) => o.room === room && o.hp > 0).length;
    const waveTriggerRem = (this.selectedDifficultyId === 'bloodfire' || this.selectedDifficultyId === 'abyssal') ? 4 : 3;
    if (room && Array.isArray(room.pendingWaves) && room.pendingWaves.length > 0 && remainingInRoom <= waveTriggerRem && !(this.isCoopClient && this.isCoopClient())) {
      this.spawnNextRoomWave(room);
      remainingInRoom = this.enemies.filter((o) => o.room === room && o.hp > 0).length;
    }
    const hasPendingWaves = !!(room && Array.isArray(room.pendingWaves) && room.pendingWaves.length > 0);
    if (room && remainingInRoom === 0 && !hasPendingWaves) {
      room.cleared = true;
      room.locked = false;
      this.sfx.setBiomeAmbience(this.dungeon?.biome?.id, false);
      this.sfx.gateSlam(true);
      if (this.hero.downed) {
        this.reviveLocalHero(0.35, false);
      }
      const clearEnergyBase = room.type === 'boss'
        ? 65
        : ((room.type === 'elite' || room.isTrialActive) ? 40 : 28);
      this.gainHeroEnergy(clearEnergyBase, { showFloat: true });
      this.checkFloorExplorationMastery();
      this.drawMinimap();
      this.updateHUD();

      if (room.isTrialActive) {
        room.isTrialActive = false;
        const highTier = Math.min(4, this.floorCfg.depth + 1);
        const trialWpn = netPayload && netPayload.trialWeapon
          ? deserializeWeaponInst(netPayload.trialWeapon)
          : pickRandomWeaponDrop(highTier, this.hero.weapons.map((w) => w.id), Math.random, {
              guaranteedAffix: true,
              minRarityRank: 2
            });
        const dropSpot = netPayload && netPayload.trialDropSpot
          ? netPayload.trialDropSpot
          : this.findSafeSpotInRoom(room, [[2.2, 0], [-2.2, 0], [0, 2.2]], 1.0);
        if (killMsg) {
          killMsg.isTrialClear = true;
          killMsg.trialWeapon = serializeWeaponInst(trialWpn);
          killMsg.trialDropSpot = { x: +dropSpot.x.toFixed(2), z: +dropSpot.z.toFixed(2) };
          this.lan.relay(killMsg, 'others');
        }
        this.spawnWeaponPedestalInteractable(room, dropSpot.x, dropSpot.z, trialWpn);
        this.refreshInteractableLabels();
        this.spawnCinderOrbs(dropSpot.x, dropSpot.z, Math.round(70 * this.floorCfg.cinderMult * (this.hero?.cinderGainMult || 1.0)), {
          handledByEvent: true,
          seed: (orbSeed ^ 0x55aa55aa) >>> 0
        });
        const twt = getWeaponText(trialWpn);
        const ui = tUI();
        this.showBanner(ui.bannerTrialWinTitle, ui.bannerTrialWinSub(twt.name, twt.tier));
        if (this.pendingBoonQueue.length > 0) {
          const epoch = this.stateEpoch;
          const nextK = this.pendingBoonQueue.shift();
          setTimeout(() => {
            if (this.stateEpoch === epoch) this.openBoonShrine(nextK);
          }, 420);
        }
        return;
      }

      const epoch = this.stateEpoch;
      if (room.type === 'boss') {
        if (this.floorIndex < MAX_FLOORS - 1) {
          const portalMeta = this.spawnBossVictoryPortal(
            room,
            netPayload?.bossPortal?.nextBiomeId || null,
            netPayload?.bossPortal?.bossWeapons || netPayload?.bossPortal?.bossWeapon || null
          );
          if (killMsg) killMsg.bossPortal = portalMeta;
          const nextCfg = FLOOR_CONFIGS[this.floorIndex + 1];
          const nextBt = getBiomeText(this.nextFloorBiome);
          const ui = tUI();
          this.showBanner(ui.bannerPortalTitle, ui.bannerPortalSub(nextCfg.roman, nextBt.name || nextCfg.name));
          const slainRoman = this.floorCfg.roman;
          setTimeout(() => {
            if (this.stateEpoch === epoch) this.openBoonShrine(() => tUI().bannerGuardianSlain(slainRoman));
          }, 580);
        } else {
          this.floorsCleared = MAX_FLOORS;
          if (killMsg) killMsg.victory = true;
          setTimeout(() => {
            if (this.stateEpoch === epoch) this.finishRun(true);
          }, 720);
        }
      } else {
        setTimeout(() => {
          if (this.stateEpoch === epoch) this.openBoonShrine(() => tUI().bannerRoomPurified(getRoomText(room).title));
        }, 500);
      }
    }
    if (killMsg) {
      this.lan.relay(killMsg, 'others');
    }
  }

  reviveLocalHero(hpPct = 0.50, silent = false) {
    const h = this.hero;
    h.downed = false;
    h.bleedout = 0;
    h.reviveProgress = 0;
    h.hp = Math.max(15, Math.round(h.maxHp * hpPct));
    if (h.maxShield > 0) h.shield = Math.round(h.maxShield * 0.5);
    h.energy = Math.max(h.energy || 0, Math.round((h.maxEnergy || 200) * 0.5));
    h.invuln = 2.2;
    this.heroRig.body.position.y = 0;
    this.heroRig.torso.rotation.x = 0;
    if (!silent) {
      this.spawnFloatingText(h.x, 2.25, h.z, tUI().floatRevived, '#5effc8', 'heal');
    }
    this.updateHUD();
    this.drawMinimap();
  }

  handleHeroZeroHp() {
    const h = this.hero;
    const hasLivingAlly = this.isCoopActive && this.isCoopActive() && [...this.remotePlayers.values()].some((p) => !p.downed && p.hp > 0);
    if (hasLivingAlly) {
      h.downed = true;
      h.hp = 0;
      h.bleedout = 25.0;
      h.reviveProgress = 0;
      h.atkState = null;
      h.invuln = 1.0;
      this.sfx.allyDownedAlert();
      this.spawnFloatingText(h.x, 2.25, h.z, tUI().floatDowned, '#ff4d6d', 'callout');
      this.lan.relay({ kind: 'ally_downed' }, 'others');
      this.updateHUD();
      this.drawMinimap();
      return;
    }
    if (this.isCoopActive && this.isCoopActive()) {
      checkCoopPartyWipe(this, true);
    } else {
      this.finishRun(false);
    }
  }

  damageHero(rawDmg, srcX, srcZ, labelOverride = null) {
    const h = this.hero;
    if (!h || h.downed || h.hp <= 0 || h.invuln > 0) return;
    if (this.mode === 'title' || this.mode === 'lobby' || this.mode === 'transition' || this.mode === 'victory' || this.mode === 'defeat') {
      return;
    }

    const res = handleClassHeroDamage(this, rawDmg, srcX, srcZ, labelOverride);
    if (!res || res.absorbedAll || !(res.hpDmg > 0)) {
      this._netStateAccum = 1.0;
      return;
    }

    const hpLoss = Math.max(1, Math.round(res.hpDmg));
    h.hp = Math.max(0, h.hp - hpLoss);

    if (Number.isFinite(srcX) && Number.isFinite(srcZ)) {
      const kdx = h.x - srcX;
      const kdz = h.z - srcZ;
      const kd = Math.hypot(kdx, kdz) || 1;
      h.vx += (kdx / kd) * 4.2;
      h.vz += (kdz / kd) * 4.2;
      const kv = Math.hypot(h.vx, h.vz);
      if (kv > 8.5) {
        h.vx = (h.vx / kv) * 8.5;
        h.vz = (h.vz / kv) * 8.5;
      }
    }

    this.sfx.playerHurt(hpLoss >= 18);
    this.cameraShake = Math.max(this.cameraShake, 0.32);
    this.lensTrauma = Math.max(this.lensTrauma, 0.45);
    this.vfx.burst(h.x, 1.15, h.z, 0xff3348, 22, 5.6, 7.5);
    this.spawnFloatingText(
      h.x,
      2.15,
      h.z,
      labelOverride ? `${labelOverride} -${hpLoss}` : `-${hpLoss}`,
      '#ff5268',
      'crit'
    );

    if (h.thornsNova > 0) {
      this.vfx.spawnRing(h.x, h.z, 3.6, 0.40, 0x7ce8ff, false);
      this.coopBroadcastPlayerAction?.({
        act: 'ring_burst_vfx',
        x: +h.x.toFixed(2),
        z: +h.z.toFixed(2),
        radius: 3.6,
        dur: 0.40,
        colorHex: 0x7ce8ff,
        fill: false,
        burstCount: 16
      });
      for (const e of [...this.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= 3.6 + e.radius) {
          this.damageEnemy(e, h.thornsNova, h.x, h.z, {
            allowCrit: false,
            chillDuration: 2.2,
            fxColor: 0x7ce8ff,
            stagger: 0.45
          });
        }
      }
    }

    this._netStateAccum = 1.0;
    this.updateHUD();
    if (h.hp <= 0) {
      this.handleHeroZeroHp();
    }
  }

  openBoonShrine(kickerSpec = null) {
    if (this.mode === 'weapon' || this.mode === 'boon' || this.mode === 'paused' || (this.currentRoom && this.currentRoom.locked)) {
      this.pendingBoonQueue.push(kickerSpec);
      return;
    }
    if (this.mode !== 'explore') return;
    this.mode = 'boon';
    this.boonRerollCount = 0;
    this._lastBoonKickerSpec = kickerSpec;
    this.updateInteractPromptUI();
    this.syncPauseButtonVisibility();
    this.sfx.boonModalOpen();
    this.currentBoons = pickThreeBoons(this.takenBoons, this.floorCfg.boonScale, this.floorCfg.boonRarityLabel, {
      classId: this.hero?.classId
    });

    this.renderBoonModal();
    document.getElementById('boon-overlay').classList.remove('hidden');
  }

  getBoonRerollCost() {
    const rc = this.boonRerollCount || 0;
    if (rc === 0) return 25;
    if (rc === 1) return 45;
    if (rc === 2) return 70;
    return 70 + (rc - 2) * 30;
  }

  rerollBoons() {
    if (this.mode !== 'boon' || !this.hero) return;
    const cost = this.getBoonRerollCost();
    if (this.hero.cinders < cost) {
      this.sfx.uiReject();
      return;
    }
    this.hero.cinders -= cost;
    this.boonRerollCount = (this.boonRerollCount || 0) + 1;
    const excludeIds = this.currentBoons.map((b) => b.id);
    this.currentBoons = pickThreeBoons(this.takenBoons, this.floorCfg.boonScale, this.floorCfg.boonRarityLabel, {
      classId: this.hero?.classId,
      excludeIds
    });
    this.sfx.boonReroll();
    this.renderBoonModal();
    this.updateHUD();
  }

  renderBoonModal() {
    const ui = tUI();
    const overlay = document.getElementById('boon-overlay');
    const kickerText = typeof this._lastBoonKickerSpec === 'function'
      ? this._lastBoonKickerSpec()
      : (this._lastBoonKickerSpec || ui.boonKickerDefault);
    const kickerEl = document.getElementById('boon-kicker') || overlay.querySelector('.crest-kicker');
    if (kickerEl) kickerEl.textContent = kickerText;
    const headerEl = document.getElementById('boon-header');
    if (headerEl) headerEl.textContent = ui.boonHeader;
    const subLabel = document.getElementById('boon-sub-label');
    if (subLabel) {
      subLabel.textContent = ui.boonSub(this.floorCfg.roman, getRarityLabel(this.floorCfg.depth));
    }

    const container = document.getElementById('boon-cards');
    container.innerHTML = '';
    this.currentBoons.forEach((boon, idx) => {
      const bt = getBoonText(boon, this.floorCfg.boonScale, this.floorCfg.depth);
      const curStack = (this.hero?.boonStacks && this.hero.boonStacks[boon.id]) || 0;
      const stackBadge = ui.boonStackBadge ? ui.boonStackBadge(curStack, curStack + 1) : `Lv.${curStack + 1}`;
      const card = document.createElement('button');
      card.className = 'boon-card';
      card.style.setProperty('--boon-accent', boon.color);
      card.innerHTML = `
        <div class="boon-key">[${idx + 1}]</div>
        <div class="boon-icon">${glyphSvg(boon.glyph, boon.color)}</div>
        <div class="boon-tier">${bt.tier}</div>
        <div class="boon-stack-pill">${stackBadge}</div>
        <div class="boon-name">${bt.name}</div>
        <div class="boon-desc">${bt.desc}</div>
      `;
      card.addEventListener('click', () => this.selectBoon(idx));
      container.appendChild(card);
    });

    const rerollBtn = document.getElementById('btn-boon-reroll');
    if (rerollBtn) {
      const cost = this.getBoonRerollCost();
      const cinders = this.hero?.cinders || 0;
      rerollBtn.textContent = ui.boonRerollBtn ? ui.boonRerollBtn(cost, cinders) : `↻ Reroll (${cost})`;
      rerollBtn.disabled = cinders < cost;
    }
  }

  selectBoon(idx) {
    if (this.mode !== 'boon') return;
    const boon = this.currentBoons[idx];
    if (!boon) return;

    this.takenBoons.add(boon.id);
    if (typeof boon.triggerApply === 'function') boon.triggerApply(this.hero);
    else {
      if (!this.hero.boonStacks) this.hero.boonStacks = {};
      this.hero.boonStacks[boon.id] = (this.hero.boonStacks[boon.id] || 0) + 1;
      boon.apply(this.hero, this.floorCfg.boonScale);
    }
    const existingEntry = this.acquiredBoons.find((e) => e.boon.id === boon.id);
    if (existingEntry) {
      existingEntry.stacks = (this.hero.boonStacks && this.hero.boonStacks[boon.id]) || ((existingEntry.stacks || 1) + 1);
    } else {
      this.acquiredBoons.push({
        boon,
        scale: this.floorCfg.boonScale,
        depth: this.floorCfg.depth,
        stacks: (this.hero.boonStacks && this.hero.boonStacks[boon.id]) || 1
      });
    }
    this.sfx.boonSelect();
    this.renderRelicStrip();

    document.getElementById('boon-overlay').classList.add('hidden');
    this.mode = 'explore';
    this.syncPauseButtonVisibility();
    this.vfx.burst(this.hero.x, 1.2, this.hero.z, this.hero.bladeColor, 32, 6.2, 5.0);
    this.vfx.spawnRing(this.hero.x, this.hero.z, 3.6, 0.50, 0xffaa44, false);
    this.refreshInteractableLabels();
    this.updateHUD();
    this.updateWeaponHUD();

    if (this.pendingBoonQueue.length > 0) {
      const nextK = this.pendingBoonQueue.shift();
      const epoch = this.stateEpoch;
      setTimeout(() => {
        if (this.stateEpoch === epoch) this.openBoonShrine(nextK);
      }, 180);
    }
  }

  renderRelicStrip() {
    const strip = document.getElementById('relic-strip');
    if (!strip) return;
    strip.innerHTML = '';
    for (const entry of this.acquiredBoons) {
      const bt = getBoonText(entry.boon, entry.scale, entry.depth);
      const count = (this.hero?.boonStacks && this.hero.boonStacks[entry.boon.id]) || entry.stacks || 1;
      const stackLabel = count > 1 ? `<span style="font-size:10px;font-weight:800;color:#ffe08a;margin-left:2px">×${count}</span>` : '';
      const badge = document.createElement('div');
      badge.className = 'relic-pill';
      badge.style.borderColor = entry.boon.color;
      badge.innerHTML = `${glyphSvg(entry.boon.glyph, entry.boon.color)}${stackLabel}<div class="relic-tooltip"><strong>${bt.name} · Lv.${count}</strong><span>${bt.desc}</span></div>`;
      strip.appendChild(badge);
    }
  }

  finishRun(victory) {
    this.sfx.setPausedDamp(false);
    this.sfx.setBiomeAmbience(this.dungeon?.biome?.id, false);
    if (victory) this.sfx.victoryFanfare();
    else this.sfx.defeatDirge();
    document.getElementById('pause-overlay')?.classList.add('hidden');
    this.mode = victory ? 'victory' : 'defeat';
    this._lastRunVictory = victory;
    this.inputBuffer = null;
    this.syncPauseButtonVisibility();
    this.updateInteractPromptUI();
    const ov = document.getElementById('end-overlay');
    this.renderEndOverlay(victory);
    ov.classList.remove('hidden');
  }

  renderEndOverlay(victory) {
    const ui = tUI();
    const kicker = document.getElementById('end-kicker');
    if (kicker) kicker.textContent = ui.endKicker;
    const title = document.getElementById('end-title');
    const sub = document.getElementById('end-sub');
    const stats = document.getElementById('end-stats');
    title.textContent = victory ? ui.endVictoryTitle : ui.endDefeatTitle;
    title.className = victory ? 'end-title victory' : 'end-title defeat';
    const w0Name = getWeaponText(this.hero.weapons[0]).name;
    const w1Name = getWeaponText(this.hero.weapons[1]).name;
    const btName = getBiomeText(this.dungeon ? this.dungeon.biome : null).name;
    sub.textContent = victory
      ? ui.endVictorySub(w0Name, w1Name)
      : ui.endDefeatSub(this.floorCfg.roman, btName);
    const mins = Math.floor(this.runTime / 60);
    const secs = Math.floor(this.runTime % 60).toString().padStart(2, '0');
    stats.innerHTML = `
      <div><span>${ui.statDepth}</span><strong>${ui.statDepthVal(this.floorCfg.roman)}</strong></div>
      <div><span>${ui.statChambers}</span><strong>${this.totalRoomsExplored}</strong></div>
      <div><span>${ui.statVanquished}</span><strong>${this.kills}</strong></div>
      <div><span>${ui.statDuration}</span><strong>${mins}:${secs}</strong></div>
    `;
    const inCoop = !!(this.isCoopActive && this.isCoopActive());
    const isClient = !!(this.isCoopClient && this.isCoopClient());
    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
      btnRetry.disabled = isClient;
      btnRetry.textContent = isClient ? ui.btnRetryWaitHost : ui.btnRetry;
    }
    const btnEndLobby = document.getElementById('btn-end-lobby');
    if (btnEndLobby) {
      btnEndLobby.textContent = ui.btnEndLobby;
      btnEndLobby.classList.toggle('hidden', !inCoop);
    }
    const btnEndTitle = document.getElementById('btn-end-title');
    if (btnEndTitle) btnEndTitle.textContent = ui.btnEndTitle;
  }

  spawnFloatingText(wx, wy, wz, text, color = '#ece6da', isCritOrVariant = false) {
    if (!this.dmgLayer) return;
    const variant = isCritOrVariant === true
      ? 'crit'
      : (typeof isCritOrVariant === 'string' ? isCritOrVariant : 'normal');
    if (!this.settings.damageNumbers && variant !== 'callout' && variant !== 'heal') {
      return;
    }
    const v = new THREE.Vector3(wx, wy, wz).project(this.camera);
    if (v.z > 1) return;

    let sx = (v.x * 0.5 + 0.5) * this.width;
    let sy = (-v.y * 0.5 + 0.5) * this.height;
    if (variant === 'callout') {
      sy -= 26;
    } else if (variant === 'shield') {
      sx -= 12;
      sy -= 8;
    } else if (variant === 'dot') {
      sx += (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 8);
      sy += 4;
    } else {
      sx += (Math.random() - 0.5) * 16;
      sy += (Math.random() - 0.5) * 8;
    }

    const now = performance.now();
    this._floatRecentBuckets = this._floatRecentBuckets.filter((b) => now - b.t < 480);
    let step = 0;
    for (const b of this._floatRecentBuckets) {
      if (Math.abs(sx - b.x) < 48 && Math.abs(sy - b.y) < 22 && step < 4) {
        sy -= 21;
        sx += (step % 2 === 0 ? 12 : -12);
        step++;
      }
    }
    this._floatRecentBuckets.push({ x: sx, y: sy, t: now });

    const el = document.createElement('div');
    el.className = variant && variant !== 'normal' ? `dmg-num ${variant}` : 'dmg-num';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.textContent = text;
    this.dmgLayer.appendChild(el);
    const ttl = variant === 'callout' ? 980 : (variant === 'dot' ? 540 : 780);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ttl);
  }

  drawMinimap() {
    if (!this.dungeon || !this.minimapCtx) return;
    const floorLbl = document.getElementById('minimap-floor-label');
    if (floorLbl) floorLbl.textContent = tUI().hudMapTitle(this.floorCfg.roman);
    const expLbl = document.getElementById('rooms-explored');
    if (expLbl) {
      const vis = this.dungeon.rooms.filter((r) => r.visited).length;
      expLbl.textContent = `${vis} / ${this.dungeon.rooms.length}`;
    }
    if (!this.mapVisible) return;
    const allyDots = this.remotePlayers
      ? [...this.remotePlayers.values()].map((p) => ({
          x: p.x,
          z: p.z,
          color: p.theme ? p.theme.accent : '#5ec2ff',
          downed: !!p.downed
        }))
      : [];
    drawBiomeMinimap(
      this.minimapCtx,
      this.minimapCanvas.width,
      this.minimapCanvas.height,
      this.dungeon,
      this.currentRoom,
      this.hero,
      true,
      allyDots
    );
    if (this.minimapHdCanvas && this.minimapHdCtx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const lw = this.minimapCanvas.width;
      const lh = this.minimapCanvas.height;
      const pw = Math.round(lw * dpr);
      const ph = Math.round(lh * dpr);
      if (this.minimapHdCanvas.width !== pw || this.minimapHdCanvas.height !== ph) {
        this.minimapHdCanvas.width = pw;
        this.minimapHdCanvas.height = ph;
      }
      this.minimapHdCtx.save();
      this.minimapHdCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBiomeMinimap(this.minimapHdCtx, lw, lh, this.dungeon, this.currentRoom, this.hero, true, allyDots);
      this.minimapHdCtx.restore();
    }
  }

  updateWeaponHUD() {
    const h = this.hero;
    if (!h || !h.weapons) return;
    const ui = tUI();
    for (let i = 0; i < 2; i++) {
      const w = h.weapons[i];
      const card = document.getElementById(`wpn-slot-${i}`);
      if (!w || !card) continue;
      const wt = getWeaponText(w);
      card.classList.toggle('active', h.activeSlot === i);
      card.title = `${wt.name} · ${wt.tier}`;
      card.style.setProperty('--wpn-accent', w.def.accent || '#f6d794');
      card.style.setProperty('--wpn-rarity', w.tierColor || '#f6d794');
      const catSpan = document.getElementById(`wpn-cat-${i}`) || card.querySelector('.wpn-top span:first-child');
      if (catSpan) {
        const catSvg = w.def.category === 'ranged' ? UI_SVG.ranged : UI_SVG.melee;
        const elInfo = getElementBadgeInfo(w.def.element);
        catSpan.innerHTML = `<span class="wpn-ico-badge" title="${wt.catShort}">${catSvg}</span><span class="wpn-ico-badge" style="color:${elInfo.color}" title="${wt.elem}">${elInfo.svg}</span>`;
      }
      const tierEl = document.getElementById(`wpn-tier-${i}`);
      if (tierEl) {
        tierEl.textContent = `${w.bossOnly ? '👑' : ''}${romanTierMark(w.tier)}`;
        tierEl.style.color = w.tierColor;
      }
      const nameEl = document.getElementById(`wpn-name-${i}`);
      if (nameEl) {
        nameEl.textContent = wt.name;
        nameEl.style.color = h.activeSlot === i ? '#fff8eb' : w.tierColor;
      }
      const metaEl = document.getElementById(`wpn-meta-${i}`);
      if (metaEl) {
        const effDmg = Math.round(w.dmg * this.effectiveDmgMult(w));
        const pCount = w.pellets || w.def?.pellets || 1;
        const dmgStr = pCount > 1 ? `${effDmg}×${pCount}` : `${effDmg}`;
        const effCrit = Math.round((h.critChance + (w.critBonus || 0)) * 100);
        const wCost = this.getWeaponShotEnergyCost(w);
        metaEl.innerHTML = `
          <span class="wpn-m-chip" style="color:#ffad7a" title="${ui.wpnStatDmg}">${UI_SVG.dmg}${dmgStr}</span>
          <span class="wpn-m-chip" style="color:#7ef2c2" title="${ui.wpnStatSpd}">${UI_SVG.spd}${w.atkRate}</span>
          <span class="wpn-m-chip" style="color:${wCost > 0 ? '#d89eff' : '#94a3b8'}" title="${ui.wpnStatEnergy}">${UI_SVG.energy}${wCost}</span>
          <span class="wpn-m-chip" style="color:#ffd86b" title="${ui.wpnStatCrit}">${UI_SVG.crit}${effCrit}%</span>
        `;
      }
      const hudCanvas = document.getElementById(`wpn-canvas-${i}`);
      if (hudCanvas && this.weaponStudio) {
        this.weaponStudio.renderToCanvas(hudCanvas, w, {
          yaw: h.activeSlot === i ? (Math.sin((this.time || 0) * 1.45) * 0.28) : 0.14,
          pitch: 0.06,
          camZ: 2.10,
          showHalo: h.activeSlot === i && (w.rarityRank || 1) >= 4
        });
      }
    }
    const activeWpn = this.activeWeapon();
    if (activeWpn) {
      const awt = getWeaponText(activeWpn);
      const shotCost = this.getWeaponShotEnergyCost(activeWpn);
      const skillCost = shotCost * 2;
      const primLabel = activeWpn.def.category === 'ranged' ? `${ui.hudPrimaryRanged} · ${shotCost}` : ui.hudPrimaryMelee;
      const primEl = document.getElementById('slot-primary-title');
      if (primEl) primEl.textContent = primLabel;
      const primSlot = document.getElementById('slot-primary');
      if (primSlot) primSlot.title = primLabel;
      const primIco = document.getElementById('ico-slot-primary');
      if (primIco) primIco.innerHTML = activeWpn.def.category === 'ranged' ? UI_SVG.ranged : UI_SVG.melee;
      const skillLabel = skillCost > 0 ? `${awt.skill} · ${skillCost}` : awt.skill;
      const skillEl = document.getElementById('slot-skill-title');
      if (skillEl) skillEl.textContent = skillLabel;
      const skillSlot = document.getElementById('slot-skill');
      if (skillSlot) skillSlot.title = skillLabel;
      const skillIco = document.getElementById('ico-slot-skill');
      if (skillIco) {
        const elInfo = getElementBadgeInfo(activeWpn.def.element);
        skillIco.innerHTML = elInfo.svg;
        skillIco.style.color = elInfo.color;
      }
      this.updateWeaponSkillDepletedState();
    }
    const ultIco = document.getElementById('ico-slot-ult');
    if (ultIco && !ultIco.innerHTML) ultIco.innerHTML = UI_SVG.skl;
    const dashIco = document.getElementById('ico-slot-dash');
    if (dashIco && !dashIco.innerHTML) dashIco.innerHTML = UI_SVG.dash;
    const flaskIco = document.getElementById('ico-slot-flask');
    if (flaskIco && !flaskIco.innerHTML) {
      flaskIco.innerHTML = UI_SVG.flask;
      flaskIco.style.color = '#ff7285';
    }
  }

  updateTelemetryHUD() {
    const fpsVal = document.getElementById('tel-fps-val');
    if (!fpsVal) return;
    const fps = Math.max(1, Math.round(this.fps || 60));
    const ms = Number.isFinite(this.frameTimeMs) ? this.frameTimeMs : +(1000 / fps).toFixed(1);
    fpsVal.textContent = `${fps}`;
    const msVal = document.getElementById('tel-ms-val');
    if (msVal) msVal.textContent = `${ms.toFixed(1)}ms`;

    const fpsChip = document.getElementById('tel-fps-chip');
    const fpsTier = fps >= 50 ? 'good' : (fps >= 30 ? 'warn' : 'bad');
    if (fpsChip) {
      fpsChip.classList.remove('good', 'warn', 'bad');
      fpsChip.classList.add(fpsTier);
    }

    const inCoop = !!(this.isCoopActive && this.isCoopActive());
    const coopGroup = document.getElementById('tel-coop-group');
    let netTier = 'good';
    if (coopGroup) {
      coopGroup.classList.toggle('hidden', !inCoop);
      if (inCoop && this.lan) {
        const rawPing = (this.lan.p2pPeerCount > 0 && Number.isFinite(this.lan.p2pPingMs))
          ? this.lan.p2pPingMs
          : (this.lan.pingMs ?? 1);
        const ping = Math.max(1, Math.round(rawPing));
        netTier = ping <= 45 ? 'good' : (ping <= 110 ? 'warn' : 'bad');
        const pingVal = document.getElementById('tel-ping-val');
        if (pingVal) pingVal.textContent = `${ping}ms`;
        const pingChip = document.getElementById('tel-ping-chip');
        if (pingChip) {
          pingChip.classList.remove('good', 'warn', 'bad');
          pingChip.classList.add(netTier);
        }
        const peersVal = document.getElementById('tel-peers-val');
        if (peersVal) peersVal.textContent = `${this.lan.playerCount}/4`;
      }
    }

    const led = document.getElementById('tel-led');
    if (led) {
      led.classList.remove('warn', 'bad');
      if (fpsTier === 'bad' || netTier === 'bad') led.classList.add('bad');
      else if (fpsTier === 'warn' || netTier === 'warn') led.classList.add('warn');
    }
  }

  updateHUD() {
    const h = this.hero;
    if (!h) return;
    const ui = tUI();
    const zh = getLang() === 'zh';
    const diffPill = document.getElementById('hud-diff-pill');
    if (diffPill) {
      const dCfg = getDifficultyConfig(this.selectedDifficultyId);
      diffPill.textContent = zh ? dCfg.zhName : dCfg.enName;
      diffPill.style.color = dCfg.accent || '#ffd166';
    }
    const floorPill = document.getElementById('floor-pill');
    if (floorPill) {
      const bName = this.dungeon ? getBiomeText(this.dungeon.biome).name : this.floorCfg.name;
      floorPill.title = ui.hudFloorShort(this.floorCfg.roman, bName);
      const floorVal = document.getElementById('floor-val');
      if (floorVal) floorVal.textContent = `${(this.floorIndex || 0) + 1} / ${MAX_FLOORS}`;
    }
    const roomPill = document.getElementById('room-pill');
    if (roomPill && this.currentRoom) {
      roomPill.textContent = getRoomText(this.currentRoom).title;
    }
    const foePill = document.getElementById('foe-pill');
    if (foePill) {
      if (this.enemies.length > 0) {
        foePill.textContent = ui.hudFoesRemain(this.enemies.length);
        foePill.classList.add('in-combat');
      } else {
        foePill.textContent = ui.hudChamberClear;
        foePill.classList.remove('in-combat');
      }
    }
    const cinderPill = document.getElementById('cinder-pill');
    if (cinderPill) {
      cinderPill.title = ui.cindersUnit;
      const cinderVal = document.getElementById('cinder-val');
      if (cinderVal) cinderVal.textContent = `${h.cinders}`;
    }
    this.updateTelemetryHUD();
    const lockPill = document.getElementById('lock-pill');
    const wpn = this.activeWeapon();
    if (lockPill && wpn) {
      if (wpn.def.category === 'ranged') {
        lockPill.classList.remove('hidden');
        const isPinned = !!(this.pinnedEnemy && this.pinnedEnemy === this.lockedEnemy && this.pinnedEnemy.hp > 0);
        lockPill.classList.toggle('pinned', isPinned);
        if (isPinned) {
          lockPill.textContent = zh
            ? `🔒 ${getEnemyName(this.lockedEnemy.type)} [C]`
            : `🔒 ${getEnemyName(this.lockedEnemy.type).toUpperCase()} [C]`;
        } else {
          lockPill.textContent = this.lockedEnemy
            ? (zh ? `⌖ ${getEnemyName(this.lockedEnemy.type)}` : `⌖ ${getEnemyName(this.lockedEnemy.type).toUpperCase()}`)
            : (zh ? '⌖ 自动锁定' : '⌖ LOCK READY');
        }
      } else {
        lockPill.classList.add('hidden');
        lockPill.classList.remove('pinned');
      }
    }
    const hpPct = Math.max(0, Math.min(100, (h.hp / Math.max(1, h.maxHp)) * 100));
    const hpText = document.getElementById('hp-text');
    if (hpText) hpText.textContent = `${Math.max(0, Math.ceil(h.hp))} / ${h.maxHp}`;
    const hpFill = document.getElementById('hp-fill');
    if (hpFill) hpFill.style.width = `${hpPct}%`;
    const hpTrail = document.getElementById('hp-trail');
    if (hpTrail) hpTrail.style.width = `${hpPct}%`;

    const statsLine = document.getElementById('hero-stats-line');
    if (statsLine) {
      const dmgBonusPct = Math.round((this.effectiveDmgMult(wpn) - 1) * 100);
      const critPct = Math.round((h.critChance + (wpn ? wpn.critBonus : 0)) * 100);
      const sign = dmgBonusPct >= 0 ? '+' : '';
      statsLine.innerHTML = `
        <span class="hud-stat-ico" style="color:#ffad7a">${UI_SVG.dmg}${sign}${dmgBonusPct}%</span>
        <span class="hud-stat-ico" style="color:#ffd86b">${UI_SVG.crit}${critPct}%</span>
      `;
    }

    const flaskCount = document.getElementById('flask-count');
    if (flaskCount) flaskCount.textContent = `${h.flasks}`;
    const slotFlask = document.getElementById('slot-flask');
    if (slotFlask) slotFlask.classList.toggle('depleted', h.flasks <= 0);

    const boss = this.enemies.find((e) => e.boss && e.hp > 0);
    if (boss) {
      const biomeId = this.dungeon && this.dungeon.biome ? this.dungeon.biome.id : null;
      const bossNameEl = document.getElementById('boss-name');
      if (bossNameEl) bossNameEl.textContent = getBossName(biomeId, this.floorCfg);
      const bossHpNum = document.getElementById('boss-hp-num');
      if (bossHpNum) {
        bossHpNum.textContent = boss.shield > 0
          ? `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp} · ⛨${Math.ceil(boss.shield)}`
          : `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
      }
    }

    this.updateWeaponHUD();
    updateClassHUD(this);
    updateCoopHudWidgets(this);
  }

  refreshInteractableLabels() {
    if (!this.dungeon || !this.dungeon.interactables) return;
    for (const inter of this.dungeon.interactables) {
      const desc = describeInteractable(inter, this);
      if (desc && desc.plainLabel) inter.label = desc.plainLabel;
    }
  }

  updateInteractPromptUI() {
    const inter = this.mode === 'explore' ? this.activeInteractable : null;
    if (!inter) {
      if (this.interactEl) this.interactEl.classList.add('hidden');
      if (this.worldPinEl) this.worldPinEl.classList.add('hidden');
      this._interactRenderSig = '';
      return;
    }
    const desc = describeInteractable(inter, this);
    if (!desc) return;
    inter.label = desc.plainLabel;

    const sig = `${getLang()}|${inter.kind}|${inter.x.toFixed(1)},${inter.z.toFixed(1)}|${inter.cost || 0}|${inter.uses || 0}|${inter.progress ? inter.progress.toFixed(2) : 0}|${Math.ceil(inter.bleedout || 0)}|${this.hero.cinders}|${this.hero.activeSlot}|${desc.title}`;
    if (this.interactEl) {
      if (this._interactRenderSig !== sig) {
        this._interactRenderSig = sig;
        this.interactEl.style.setProperty('--ip-accent', desc.accent || '#d8ac5e');
        const badgeEl = document.getElementById('ip-badge');
        const titleEl = document.getElementById('ip-title');
        const pillsEl = document.getElementById('ip-pills');
        if (badgeEl) badgeEl.textContent = desc.badge;
        if (titleEl) titleEl.textContent = desc.title;
        if (pillsEl) {
          pillsEl.innerHTML = (desc.pills || [])
            .map((p) => `<span class="ip-pill ${p.tone || ''}">${p.text}</span>`)
            .join('');
        }
      }
      this.interactEl.classList.remove('hidden');
    }

    if (this.worldPinEl) {
      this.worldPinEl.style.setProperty('--pin-accent', desc.accent || '#f6d794');
      if (this.worldPinLabelEl) this.worldPinLabelEl.textContent = desc.title;
      this.projectWorldInteractPin();
    }
  }

  projectWorldInteractPin() {
    if (!this.worldPinEl) return;
    const inter = this.mode === 'explore' ? this.activeInteractable : null;
    if (!inter) {
      this.worldPinEl.classList.add('hidden');
      return;
    }
    const pinY = inter.kind === 'descent_portal'
      ? 2.55
      : (inter.kind === 'trial_obelisk' ? 2.35 : (inter.kind === 'weapon_pedestal' ? 2.10 : 1.80));
    const v = new THREE.Vector3(inter.x, pinY, inter.z).project(this.camera);
    if (v.z > 1) {
      this.worldPinEl.classList.add('hidden');
      return;
    }
    const sx = Math.max(80, Math.min(this.width - 80, (v.x * 0.5 + 0.5) * this.width));
    const sy = Math.max(64, Math.min(this.height - 140, (-v.y * 0.5 + 0.5) * this.height));
    this.worldPinEl.style.left = `${sx}px`;
    this.worldPinEl.style.top = `${sy}px`;
    this.worldPinEl.classList.remove('hidden');
  }

  updateAudioButtonText() {
    const ui = tUI();
    const txt = (!this.sfx || this.sfx.muted || this.sfx.volume <= 0.001)
      ? ui.sysAudioOff
      : ui.sysAudioVol(Math.round(this.sfx.volume * 100));
    const btnLandAudio = document.getElementById('btn-landing-audio');
    if (btnLandAudio) btnLandAudio.textContent = txt;
  }

  updateFullscreenButtonText() {
    const ui = tUI();
    const isFull = !!document.fullscreenElement;
    const txt = isFull ? ui.sysFullExit : ui.sysFullEnter;
    const pauseBtn = document.getElementById('btn-set-fullscreen');
    if (pauseBtn) {
      pauseBtn.textContent = txt;
      pauseBtn.classList.toggle('active', isFull);
    }
  }

  toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.()?.catch?.(() => {});
      } else {
        document.exitFullscreen?.()?.catch?.(() => {});
      }
    } catch (_) {}
  }

  openPauseMenu(autoTriggered = false) {
    if (this.mode !== 'explore') return;
    this._pauseAutoTriggered = !!autoTriggered;
    this.mode = 'paused';
    this.keys = {};
    this.mouseDownL = false;
    this.mouseDownR = false;
    this.inputBuffer = null;
    const inCoop = !!(this.isCoopActive && this.isCoopActive());
    if (!inCoop) {
      this.sfx.setPausedDamp(true);
    }
    if (!autoTriggered) {
      this.sfx.init();
      this.sfx.uiPauseOpen();
    }
    this.updateInteractPromptUI();
    this.renderPauseMenu();
    document.getElementById('pause-overlay')?.classList.remove('hidden');
    this.syncPauseButtonVisibility();
  }

  closePauseMenu() {
    if (this.mode !== 'paused') return;
    this._pauseAutoTriggered = false;
    this.sfx.setPausedDamp(false);
    this.sfx.uiPauseClose();
    document.getElementById('pause-overlay')?.classList.add('hidden');
    this.mode = 'explore';
    this.lastNow = performance.now();
    this.syncPauseButtonVisibility();
    this.updateHUD();
    this.updateInteractPromptUI();
    if (this.pendingBoonQueue.length > 0 && !(this.currentRoom && this.currentRoom.locked)) {
      const nextK = this.pendingBoonQueue.shift();
      const epoch = this.stateEpoch;
      setTimeout(() => {
        if (this.stateEpoch === epoch) this.openBoonShrine(nextK);
      }, 140);
    }
  }

  togglePauseMenu() {
    if (this.mode === 'paused') this.closePauseMenu();
    else if (this.mode === 'explore') this.openPauseMenu(false);
  }

  swapEquippedWeaponOrder() {
    if (!this.hero || !this.hero.weapons) return;
    const [w0, w1] = this.hero.weapons;
    this.hero.weapons = [w1, w0];
    this.hero.activeSlot = this.hero.activeSlot === 0 ? 1 : 0;
    this.mountActiveWeapon();
    this.sfx.init();
    this.sfx.uiSettingTick(true);
    this.updateHUD();
    if (this.mode === 'paused') this.renderPauseMenu();
  }

  returnToTitle() {
    this.sfx.setPausedDamp(false);
    this.sfx.init();
    this.sfx.uiBack();
    this.coopDisconnectRoom?.();
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.pendingBoonQueue = [];
    this.pendingWeaponPedestal = null;
    this.inputBuffer = null;
    this.pinnedEnemy = null;
    this.keys = {};
    this.mouseDownL = false;
    this.mouseDownR = false;

    document.getElementById('pause-overlay')?.classList.add('hidden');
    document.getElementById('end-overlay')?.classList.add('hidden');
    document.getElementById('boon-overlay')?.classList.add('hidden');
    document.getElementById('weapon-overlay')?.classList.add('hidden');
    document.getElementById('lan-overlay')?.classList.add('hidden');
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('transition-veil')?.classList.remove('active');

    this.resetHeroStats();
    this.buildFloorWorld(0, { initialTitle: true });
    this.buildTitleShowcaseShots();
    this.mode = 'title';
    this.activeInteractable = null;
    this.updateInteractPromptUI();
    document.getElementById('title-overlay')?.classList.remove('hidden');
    this.setTitleStage('hub');
    this.syncPauseButtonVisibility();
    this.updateHUD();
  }

  leaveToLobbyFromMenu(leaveRoom = false) {
    this.sfx.setPausedDamp(false);
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    this.pendingBoonQueue = [];
    this.pendingWeaponPedestal = null;
    this.inputBuffer = null;
    this.pinnedEnemy = null;
    this.keys = {};
    this.mouseDownL = false;
    this.mouseDownR = false;
    if (leaveRoom) {
      this.coopDisconnectRoom?.();
      this.resetHeroStats();
      this.buildFloorWorld(0, { initialTitle: true });
    }
    this.coopOpenLobby?.(false);
    this.syncPauseButtonVisibility();
  }

  renderPauseMenu() {
    const ui = tUI();
    const zh = getLang() === 'zh';
    const h = this.hero;
    if (!h) return;
    const inCoop = !!(this.isCoopActive && this.isCoopActive());
    const isClient = !!(this.isCoopClient && this.isCoopClient());

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt(
      'pause-kicker',
      inCoop ? ui.pauseKickerCoop : (this._pauseAutoTriggered ? ui.pauseKickerAuto : ui.pauseKickerSolo)
    );
    setTxt('pause-title', inCoop ? ui.pauseTitleCoop : ui.pauseTitleSolo);
    const mins = Math.floor(this.runTime / 60);
    const secs = Math.floor(this.runTime % 60).toString().padStart(2, '0');
    const bName = this.dungeon ? getBiomeText(this.dungeon.biome).name : '';
    setTxt('pause-run-line', `${ui.pauseStatRun(this.floorCfg.roman, this.kills, `${mins}:${secs}`)}${bName ? ` · ${bName}` : ''}`);

    setTxt('pause-sec-build', ui.pauseSecBuild);
    setTxt('btn-pause-swap-order', ui.pauseSwapOrderBtn);
    setTxt('pause-sec-settings', ui.pauseSecSettings);
    setTxt('lbl-set-lang', ui.pauseSetLanguage);
    setTxt('btn-set-lang', ui.sysLang);
    setTxt('lbl-set-vol', ui.pauseSetVolume);
    setTxt('lbl-set-gfx', ui.pauseSetQuality);
    setTxt('set-gfx-ultra', ui.pauseOptUltra);
    setTxt('set-gfx-high', ui.pauseOptHigh);
    setTxt('lbl-set-shake', ui.pauseSetShake);
    setTxt('set-shake-full', ui.pauseShakeFull);
    setTxt('set-shake-soft', ui.pauseShakeSoft);
    setTxt('set-shake-off', ui.pauseShakeOff);
    setTxt('lbl-set-dmgnum', ui.pauseSetDmgNum);
    setTxt('lbl-set-autopause', ui.pauseSetAutoPause);
    setTxt('lbl-set-map', ui.pauseSetMapMode);
    setTxt('set-map-normal', ui.pauseMapNormal);
    setTxt('set-map-large', ui.pauseMapLarge);
    setTxt('set-map-hidden', ui.pauseMapHidden);
    setTxt('lbl-set-full', ui.pauseSetFullscreen);
    setTxt('pause-keys-title', ui.pauseControlsTitle);
    setTxt('btn-pause-resume', ui.pauseBtnResume);
    setTxt('btn-pause-lobby', ui.pauseBtnLobby);
    setTxt('btn-pause-title', ui.pauseBtnTitle);

    const btnRestart = document.getElementById('btn-pause-restart');
    if (btnRestart) {
      btnRestart.disabled = isClient;
      btnRestart.textContent = isClient ? ui.pauseBtnRestartHostOnly : ui.pauseBtnRestart;
    }
    document.getElementById('btn-pause-lobby')?.classList.toggle('hidden', !inCoop);

    const activeWpn = this.activeWeapon();
    const dmgBonusPct = Math.round((this.effectiveDmgMult(activeWpn) - 1) * 100);
    const critPct = Math.round((h.critChance + (activeWpn ? activeWpn.critBonus : 0)) * 100);
    const critMultPct = Math.round((h.critMult + (activeWpn ? activeWpn.critMultBonus : 0)) * 100);
    const wardPct = Math.round((h.shieldBreakMult || 1) * 100);
    const drPct = Math.round((h.dmgReduction || 0) * 100);
    const enGainPct = Math.round(((h.energyGainMult || 1) - 1) * 100);
    const statGrid = document.getElementById('pause-stat-grid');
    if (statGrid) {
      const chips = [
        [ui.pauseStatHp, `${Math.ceil(h.hp)}/${h.maxHp}`],
        [ui.pauseStatEnergy, `${Math.floor(h.energy ?? h.maxEnergy)}/${h.maxEnergy} · +${enGainPct}%`],
        [ui.pauseStatDmg, `${dmgBonusPct >= 0 ? '+' : ''}${dmgBonusPct}%`],
        [ui.pauseStatCrit, `${critPct}% · ${critMultPct}%`],
        [ui.pauseStatSpd, `${h.atkSpeed.toFixed(2)}x · ${h.moveSpeed.toFixed(1)}`],
        [ui.pauseStatWard, `${wardPct}% · -${drPct}%`]
      ];
      statGrid.innerHTML = chips
        .map(([k, v]) => `<div class="pause-stat-chip"><span>${k}</span><strong>${v}</strong></div>`)
        .join('');
    }

    const wpnList = document.getElementById('pause-wpn-list');
    if (wpnList) {
      wpnList.innerHTML = [0, 1].map((idx) => {
        const w = h.weapons[idx];
        if (!w) return '';
        const wt = getWeaponText(w);
        const effDmg = Math.round(w.dmg * this.effectiveDmgMult(w));
        const wCost = this.getWeaponShotEnergyCost(w);
        const affixPart = wt.affix ? ` · ${wt.affix}` : '';
        const snapUrl = this.weaponStudio ? this.weaponStudio.getWeaponSnapshotUrl(w, 168, 76) : '';
        const thumbTag = snapUrl ? `<img class="pause-wpn-thumb" src="${snapUrl}" alt="${wt.name}" />` : '';
        return `
          <div class="pause-wpn-card ${h.activeSlot === idx ? 'is-active' : ''}" style="--wpn-accent:${w.def.accent}">
            <div class="pause-wpn-top"><span>[${idx + 1}] ${wt.catShort}</span><span style="color:${w.tierColor}">${wt.tierShort}${affixPart}</span></div>
            ${thumbTag}
            <div class="pause-wpn-name">${wt.name}</div>
            <div class="pause-wpn-sub">
              <span class="wpn-m-chip" style="color:#ffad7a">${UI_SVG.dmg}${effDmg}</span>
              <span class="wpn-m-chip" style="color:#7ef2c2">${UI_SVG.spd}${w.atkRate}x</span>
              <span class="wpn-m-chip" style="color:${wCost > 0 ? '#d89eff' : '#94a3b8'}" title="${ui.wpnStatEnergy}">${UI_SVG.energy}${wCost}</span>
              <span class="wpn-m-chip" style="color:#ffd85e">${UI_SVG.crit}+${Math.round((w.critBonus || 0) * 100)}%</span>
              <span class="wpn-m-chip" style="color:#f5dfb0">${UI_SVG.skl}${wt.skill}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const totalSigilStacks = this.acquiredBoons.reduce((sum, entry) => {
      return sum + ((this.hero?.boonStacks && this.hero.boonStacks[entry.boon.id]) || entry.stacks || 1);
    }, 0);
    setTxt('pause-relics-head', ui.pauseRelicsHeader(totalSigilStacks));
    const relicsList = document.getElementById('pause-relics-list');
    if (relicsList) {
      if (this.acquiredBoons.length === 0) {
        relicsList.innerHTML = `<div class="pause-empty-note">${ui.pauseRelicsEmpty}</div>`;
      } else {
        relicsList.innerHTML = this.acquiredBoons.map((entry) => {
          const bt = getBoonText(entry.boon, entry.scale, entry.depth);
          const cnt = (this.hero?.boonStacks && this.hero.boonStacks[entry.boon.id]) || entry.stacks || 1;
          return `
            <div class="pause-relic-row" style="border-left:3px solid ${entry.boon.color}">
              <div class="pause-relic-icon">${glyphSvg(entry.boon.glyph, entry.boon.color)}</div>
              <div class="pause-relic-info"><strong>${bt.name} · Lv.${cnt}</strong><span>${bt.desc}</span></div>
            </div>
          `;
        }).join('');
      }
    }

    const volPct = this.sfx.muted ? 0 : Math.round(this.sfx.volume * 100);
    const slider = document.getElementById('set-vol-slider');
    if (slider) slider.value = String(Math.round(this.sfx.volume * 100));
    setTxt('set-vol-val', `${volPct}%`);
    const muteBtn = document.getElementById('btn-set-mute');
    if (muteBtn) {
      muteBtn.textContent = this.sfx.muted ? ui.pauseSetUnmute : ui.pauseSetMute;
      muteBtn.classList.toggle('active', this.sfx.muted);
    }

    document.getElementById('set-gfx-ultra')?.classList.toggle('active', this.quality === 'ultra');
    document.getElementById('set-gfx-high')?.classList.toggle('active', this.quality === 'high');

    document.getElementById('set-shake-full')?.classList.toggle('active', this.settings.screenShake === 'full');
    document.getElementById('set-shake-soft')?.classList.toggle('active', this.settings.screenShake === 'soft');
    document.getElementById('set-shake-off')?.classList.toggle('active', this.settings.screenShake === 'off');

    const dmgBtn = document.getElementById('btn-set-dmgnum');
    if (dmgBtn) {
      dmgBtn.textContent = this.settings.damageNumbers ? ui.pauseOptOn : ui.pauseOptOff;
      dmgBtn.classList.toggle('active', this.settings.damageNumbers);
    }
    const autoBtn = document.getElementById('btn-set-autopause');
    if (autoBtn) {
      autoBtn.textContent = this.settings.autoPauseBlur ? ui.pauseOptOn : ui.pauseOptOff;
      autoBtn.classList.toggle('active', this.settings.autoPauseBlur);
    }

    const curMapMode = !this.mapVisible ? 'hidden' : (this.settings.mapExpanded ? 'large' : 'normal');
    document.getElementById('set-map-normal')?.classList.toggle('active', curMapMode === 'normal');
    document.getElementById('set-map-large')?.classList.toggle('active', curMapMode === 'large');
    document.getElementById('set-map-hidden')?.classList.toggle('active', curMapMode === 'hidden');

    this.updateFullscreenButtonText();

    const keyGrid = document.getElementById('pause-keys-grid');
    if (keyGrid) {
      const items = zh
        ? [
            ['WASD', '八向移动'],
            ['左键 / J', '普攻 / 射击'],
            ['右键 / E', '武器战技'],
            ['空格 / Shift', '无敌冲刺'],
            ['1·2·R·滚轮', '快切双武器'],
            ['中键 / C', '锁定指定敌人'],
            ['Q / F', '饮药 / 场景交互'],
            ['TAB / M', '放大 / 开关地图']
          ]
        : [
            ['WASD', 'Move'],
            ['LMB / J', 'Attack / Shoot'],
            ['RMB / E', 'Weapon Skill'],
            ['SPC / Shift', 'Shadow Dash'],
            ['1·2·R·Wheel', 'Swap Weapons'],
            ['MMB / C', 'Pin Target Lock'],
            ['Q / F', 'Elixir / Interact'],
            ['TAB / M', 'Zoom / Hide Map']
          ];
      keyGrid.innerHTML = items.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('');
    }
  }

  handleToggleLanguage() {
    this.sfx.init();
    this.sfx.uiSettingTick(true);
    toggleLang();
    this._interactRenderSig = '';
    this.applyLanguageUI();
  }

  applyLanguageUI() {
    const ui = tUI();
    const zh = getLang() === 'zh';
    document.title = ui.pageTitle;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('floor-label', ui.hudFloorLabel);
    setTxt('cinder-label', ui.cindersUnit);
    this.updateAudioButtonText();
    this.updateFullscreenButtonText();

    setTxt('title-kicker', ui.landingTagline || ui.titleKicker);
    setTxt('title-main', ui.titleMain);
    setTxt('title-sub', ui.landingDesc || ui.titleSub);
    setTxt('lbl-enter-sanctum', ui.btnEnterSanctum || (zh ? '进入圣所' : 'ENTER SANCTUM'));
    setTxt('landing-enter-hint', ui.landingEnterHint || '');
    setTxt('btn-landing-lang', zh ? '中文 / EN' : 'EN / 中文');
    setTxt('btn-landing-reroll', zh ? '换景 ↻' : 'Biome ↻');
    setTxt('btn-back-landing', `← ${ui.hubBackCover || (zh ? '封面' : 'Cover')}`);
    setTxt('hub-kicker', ui.hubKicker || 'SANCTUM EXPEDITION HUB');
    setTxt('hub-title', ui.hubTitle || (zh ? '选择远征模式' : 'Choose Your Path'));
    setTxt('hub-solo-title', ui.hubSoloTitle || ui.btnStart);
    setTxt('hub-solo-sub', ui.hubSoloSub || '');
    setTxt('hub-solo-cue', ui.hubSoloCue || '');
    setTxt('hub-coop-title', ui.hubCoopTitle || ui.btnLanLobby);
    setTxt('hub-coop-sub', ui.hubCoopSub || '');
    setTxt('hub-coop-cue', ui.hubCoopCue || '');
    setTxt('hub-codex-title', ui.hubCodexTitle || (zh ? '兵装图鉴' : 'Arsenal Codex'));
    setTxt('hub-codex-sub', `${ui.hubCodexSub || ''} [B]`);
    setTxt('hub-codex-cue', ui.hubCodexCue || '');
    setTxt('btn-pause-compendium', ui.btnCompendium);
    setTxt('codex-kicker', ui.codexKicker);
    setTxt('codex-title', ui.codexTitle);
    setTxt('codex-sub', ui.codexSub);
    setTxt('btn-codex-close', ui.codexCloseBtn);
    setTxt('btn-title-lang', ui.btnTitleLang);
    setTxt('btn-retry', ui.btnRetry);
    setTxt('btn-end-lobby', ui.btnEndLobby);
    setTxt('btn-end-title', ui.btnEndTitle);
    setTxt('btn-wpn-leave', ui.wpnLeaveShort || ui.wpnLeaveBtn);

    setTxt('leg-combat', ui.legendCombat);
    setTxt('leg-elite', ui.legendElite);
    setTxt('leg-wpn', ui.legendWpn);
    setTxt('leg-trial', ui.legendTrial);
    setTxt('leg-vault', ui.legendVault);
    setTxt('leg-spring', ui.legendSpring);
    setTxt('leg-portal', ui.legendPortal);
    setTxt('leg-boss', ui.legendBoss);
    setTxt('leg-state-cur', ui.legendStateCur);
    setTxt('leg-state-vis', ui.legendStateVis);
    setTxt('leg-state-unvis', ui.legendStateUnvis);
    setTxt('minimap-zoom-hint', ui.mapZoomHint);

    const vitLbl = document.getElementById('vit-label');
    if (vitLbl) {
      vitLbl.innerHTML = UI_SVG.hp;
      vitLbl.title = ui.hudVitality;
    }
    setTxt('key-lmb', ui.keyLmb);
    setTxt('key-rmb', ui.keyRmb);
    setTxt('key-space', ui.keySpace);
    setTxt('slot-dash-title', ui.hudDash);
    setTxt('slot-elixir-title', ui.hudElixir);
    this.updateShowcaseBadgeUI();

    this.refreshInteractableLabels();
    this.renderRelicStrip();
    if (this.mode === 'boon') this.renderBoonModal();
    if (this.mode === 'weapon' && this.pendingWeaponPedestal) this.renderWeaponModal();
    if (this.mode === 'victory' || this.mode === 'defeat') this.renderEndOverlay(this._lastRunVictory);
    if (this.mode === 'paused') this.renderPauseMenu();
    if (this._compendiumOpen) this.renderCompendium();
    if (this.coopApplyLanguageUI) this.coopApplyLanguageUI();
    renderClassSelectionUI(this);
    this.renderCharSelectMetaUI();
    this.renderHubDifficultyUI();

    this.updateHUD();
    this.drawMinimap();
    this.updateInteractPromptUI();
  }

  updateAimRay() {
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    this.raycaster.ray.intersectPlane(this.aimPlane, this.aimWorld);
  }

  openCompendium(filter = null) {
    if (filter) this.compendiumFilter = filter;
    this._compendiumOpen = true;
    this.sfx.init();
    this.sfx.uiCompendiumOpen();
    this.renderCompendium();
    document.getElementById('compendium-overlay')?.classList.remove('hidden');
  }

  closeCompendium() {
    if (!this._compendiumOpen) return;
    this._compendiumOpen = false;
    this.sfx.uiCompendiumClose();
    document.getElementById('compendium-overlay')?.classList.add('hidden');
  }

  toggleCompendium() {
    if (this._compendiumOpen) {
      this.closeCompendium();
    } else if (this.mode === 'title' || this.mode === 'paused' || this.mode === 'explore') {
      if (this.mode === 'explore') this.openPauseMenu(false);
      this.openCompendium();
    }
  }

  renderCompendium() {
    const ui = tUI();
    const zh = getLang() === 'zh';
    const filtersEl = document.getElementById('codex-filters');
    const gridEl = document.getElementById('codex-grid');
    if (!filtersEl || !gridEl) return;

    const tabs = [
      { key: 'all', label: ui.codexFilterAll(WEAPON_LIST.length), color: '#f6d794' },
      ...RARITY_ORDER.map((rk) => {
        const cnt = WEAPON_LIST.filter((w) => w.rarity === rk).length;
        const rTxt = WEAPON_RARITY_I18N[rk] || WEAPON_RARITY_I18N.common;
        const rCol = WEAPON_RARITIES[rk]?.color || '#d8d2c5';
        return { key: rk, label: `${zh ? rTxt.zh : rTxt.en} (${cnt})`, color: rCol };
      })
    ];
    filtersEl.innerHTML = '';
    for (const tb of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `codex-filter-btn ${this.compendiumFilter === tb.key ? 'active' : ''}`;
      btn.style.setProperty('--rar-col', tb.color);
      btn.textContent = tb.label;
      btn.addEventListener('click', () => {
        this.compendiumFilter = tb.key;
        this.sfx.uiTabSwitch();
        this.renderCompendium();
      });
      filtersEl.appendChild(btn);
    }

    const list = this.compendiumFilter === 'all'
      ? WEAPON_LIST
      : WEAPON_LIST.filter((w) => w.rarity === this.compendiumFilter);

    gridEl.innerHTML = list.map((def) => {
      const wi = WEAPON_I18N[def.id];
      const rar = WEAPON_RARITY_I18N[def.rarity] || WEAPON_RARITY_I18N.common;
      const rarCol = WEAPON_RARITIES[def.rarity]?.color || '#d8d2c5';
      const el = ELEMENT_I18N[def.element] || { zh: def.element, en: def.element };
      const name = wi ? (zh ? wi.zhName : wi.enName) : def.name;
      const skill = wi ? (zh ? wi.zhSkill : wi.enSkill) : def.skillName;
      const summary = wi ? (zh ? wi.zhSummary : wi.enSummary) : def.summary;
      const dmgStr = (def.pellets || 1) > 1 ? `${def.baseDmg}×${def.pellets}` : `${def.baseDmg}`;
      const catSvg = def.category === 'ranged' ? UI_SVG.ranged : UI_SVG.melee;
      const elInfo = getElementBadgeInfo(def.element);
      const snapUrl = this.weaponStudio ? this.weaponStudio.getWeaponSnapshotUrl(def, 180, 108) : '';
      const srcBadge = def.bossOnly
        ? `<span class="codex-badge boss">${ui.codexSourceBoss}</span>`
        : `<span class="codex-badge">${ui.codexSourceStandard}</span>`;
      return `
        <div class="codex-card ${def.bossOnly ? 'is-boss' : ''}" style="--rar-col:${rarCol}">
          <img class="codex-wpn-thumb" src="${snapUrl}" alt="${name}" />
          <div class="codex-card-body">
            <div class="codex-card-top">
              <span class="codex-card-name">${name}</span>
              <div class="codex-card-badges">
                <span class="codex-badge" style="color:${rarCol}">${zh ? rar.zh : rar.en}</span>
                <span class="codex-badge" style="color:${elInfo.color}">${catSvg} ${zh ? el.zh : el.en}</span>
                ${srcBadge}
              </div>
            </div>
            <div class="codex-metrics">
              <div class="codex-metric" title="${ui.wpnStatDmg}"><span style="color:#ff9e66">${UI_SVG.dmg}</span><strong>${dmgStr}</strong></div>
              <div class="codex-metric" title="${ui.wpnStatSpd}"><span style="color:#6ef2b8">${UI_SVG.spd}</span><strong>${def.atkRate}x</strong></div>
              <div class="codex-metric" title="${ui.wpnStatEnergy}"><span style="color:#d89eff">${UI_SVG.energy}</span><strong>${def.category === 'ranged' ? (def.energyCost ?? 4) : 0}</strong></div>
              <div class="codex-metric" title="${ui.wpnStatRange}"><span style="color:#72cbff">${UI_SVG.rng}</span><strong>${def.range}m</strong></div>
              <div class="codex-metric" title="${ui.wpnStatCrit}"><span style="color:#ffd85e">${UI_SVG.crit}</span><strong>+${Math.round((def.critChance ?? def.critBonus ?? 0) * 100)}%</strong></div>
            </div>
            <div class="codex-desc"><strong style="color:#f6d794">[${skill} · ${def.skillCd}s]</strong> ${summary}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    this._lastWheelSwap = 0;

    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.composer.setSize(this.width, this.height);
      this.gtaoPass.setSize(Math.round(this.width * 0.5), Math.round(this.height * 0.5));
      this.bloomPass.resolution.set(this.width, this.height);
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseNdc.x = (e.clientX / Math.max(1, this.width)) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / Math.max(1, this.height)) * 2 + 1;
      this.updateAimRay();
    });

    window.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest('button, input, select, .lan-panel, .pause-panel, .codex-panel, .wpn-swap-shell, .boon-card, .weapon-card-hud, .ability-slot, #interact-prompt, #minimap-wrap, #lock-pill')) return;
      if (this.mode !== 'explore') return;
      this.sfx.init();
      this.mouseNdc.x = (e.clientX / Math.max(1, this.width)) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / Math.max(1, this.height)) * 2 + 1;
      this.updateAimRay();
      if (e.button === 0) {
        this.mouseDownL = true;
        this.tryAttack();
      } else if (e.button === 1) {
        e.preventDefault();
        this.togglePinTarget();
      } else if (e.button === 2) {
        this.mouseDownR = true;
        this.tryWeaponSkill();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownL = false;
      if (e.button === 2) this.mouseDownR = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouseDownL = false;
      this.mouseDownR = false;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keys = {};
        this.mouseDownL = false;
        this.mouseDownR = false;
        const inCoop = !!(this.isCoopActive && this.isCoopActive());
        if (!inCoop && this.mode === 'explore' && this.settings.autoPauseBlur) {
          this.openPauseMenu(true);
        }
      }
    });

    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenButtonText();
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      if (this.mode !== 'explore') return;
      const now = performance.now();
      if (now - this._lastWheelSwap > 190 && Math.abs(e.deltaY) > 4) {
        this._lastWheelSwap = now;
        this.swapWeaponSlot();
      }
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyL' && !e.repeat) {
        this.handleToggleLanguage();
        return;
      }
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        if (this._compendiumOpen) {
          this.closeCompendium();
          return;
        }
        if (this.mode === 'paused') {
          this.closePauseMenu();
        } else if (this.mode === 'weapon') {
          this.closeWeaponModalWithoutTaking();
        } else if (this.mode === 'explore') {
          this.openPauseMenu(false);
        } else if (this.mode === 'victory' || this.mode === 'defeat') {
          this.returnToTitle();
        } else if (this.mode === 'lobby') {
          if (this.lan && this.lan.inRoom) {
            this.coopOpenLobby?.(true);
          } else {
            this.coopCloseLobbyToTitle?.();
          }
        } else if (this.mode === 'title' && this.titleStage === 'char-select') {
          this.backFromCharSelect();
        } else if (this.mode === 'title' && this.titleStage === 'hub') {
          this.setTitleStage('landing');
        }
        return;
      }
      if (this.mode === 'title' && this.titleStage === 'char-select' && !this._compendiumOpen && !e.repeat) {
        if (e.code === 'Enter') {
          e.preventDefault();
          this.confirmCharSelect();
          return;
        }
        if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !(this.isCoopCharSelectLocked && this.isCoopCharSelectLocked())) {
          e.preventDefault();
          const dir = e.code === 'ArrowRight' ? 1 : -1;
          const idx = HERO_CLASSES.findIndex((c) => c.id === this.selectedClassId);
          const next = HERO_CLASSES[(idx + dir + HERO_CLASSES.length) % HERO_CLASSES.length];
          if (next) {
            this.sfx.uiHeroBrowse(next.categoryId);
            selectHeroClass(this, next.id, true, { userBrowse: true });
          }
          return;
        }
      }
      if (this.mode === 'title' && this.titleStage === 'landing' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        e.preventDefault();
        this.sfx.init();
        this.sfx.uiEnterSanctum();
        this.setTitleStage('hub');
        return;
      }
      if (e.code === 'KeyP' && !e.repeat && (this.mode === 'explore' || this.mode === 'paused')) {
        this.togglePauseMenu();
        return;
      }
      if (e.code === 'KeyB' && !e.repeat) {
        this.toggleCompendium();
        return;
      }
      if (this.mode === 'victory' || this.mode === 'defeat') {
        if ((e.code === 'KeyR' || e.code === 'Enter') && !e.repeat) {
          if (!(this.isCoopClient && this.isCoopClient())) {
            this.startRun(true);
          }
        }
        return;
      }
      if (this.mode === 'boon') {
        if (e.code === 'Digit1') this.selectBoon(0);
        else if (e.code === 'Digit2') this.selectBoon(1);
        else if (e.code === 'Digit3') this.selectBoon(2);
        else if (e.code === 'KeyR' && !e.repeat) this.rerollBoons();
        return;
      }
      if (this.mode === 'weapon') {
        if (e.code === 'Digit1') this.resolveWeaponChoice(0);
        else if (e.code === 'Digit2') this.resolveWeaponChoice(1);
        else if (e.code === 'Digit3') this.resolveWeaponChoice(2);
        return;
      }
      if (this.mode !== 'explore') return;
      if (e.code === 'Digit1' && !e.repeat) this.swapWeaponSlot(0);
      else if (e.code === 'Digit2' && !e.repeat) this.swapWeaponSlot(1);
      else if (e.code === 'KeyR' && !e.repeat) {
        e.preventDefault();
        this.swapWeaponSlot();
      } else if (e.code === 'Tab' && !e.repeat) {
        e.preventDefault();
        this.toggleMinimapExpand();
      } else if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
        e.preventDefault();
        this.tryDash();
      } else if (e.code === 'KeyJ' && !e.repeat) {
        this.tryAttack();
      } else if (e.code === 'KeyE' && !e.repeat) {
        this.tryWeaponSkill();
      } else if (e.code === 'KeyX' && !e.repeat) {
        tryHeroActiveSkill(this);
      } else if (e.code === 'KeyQ' && !e.repeat) {
        this.tryHealFlask();
      } else if (e.code === 'KeyF' && !e.repeat) {
        this.tryInteract();
      } else if (e.code === 'KeyC' && !e.repeat) {
        this.togglePinTarget();
      } else if (e.code === 'KeyM' && !e.repeat) {
        this.toggleMinimap();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this._lastHoverEl = null;
    document.addEventListener('mouseover', (e) => {
      if (!this.sfx || !this.sfx.started) return;
      const el = e.target && e.target.closest?.('button, .boon-card, .cls-pick-card, .cls-cat-tab, .diff-pill-btn, .codex-filter-btn, .weapon-card-hud, .ability-slot');
      if (el && el !== this._lastHoverEl && !el.disabled) {
        this._lastHoverEl = el;
        this.sfx.uiHover();
      } else if (!el) {
        this._lastHoverEl = null;
      }
    }, { passive: true });

    document.getElementById('btn-enter-sanctum')?.addEventListener('click', () => {
      this.sfx.init();
      this.sfx.uiEnterSanctum();
      this.setTitleStage('hub');
    });
    document.getElementById('btn-back-landing')?.addEventListener('click', () => {
      this.sfx.init();
      this.sfx.uiBack();
      this.setTitleStage('landing');
    });
    document.getElementById('btn-landing-lang')?.addEventListener('click', () => this.handleToggleLanguage());
    document.getElementById('btn-landing-audio')?.addEventListener('click', () => {
      this.sfx.init();
      this.sfx.toggleMute();
      this.updateAudioButtonText();
    });
    document.getElementById('btn-landing-reroll')?.addEventListener('click', () => this.rerollLandingShowcaseBiome());
    document.querySelectorAll('#landing-cam-dots .cam-shot-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        this.sfx.init();
        this.sfx.uiClick?.();
        this.selectShowcaseShot(Number(dot.dataset.shot || 0));
      });
    });

    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', () => this.openSoloCharSelect());
    document.getElementById('hub-diff-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-diff-id]');
      if (!btn) return;
      this.sfx.init();
      const did = btn.getAttribute('data-diff-id');
      this.sfx.uiDifficultySelect(did);
      this.setDifficulty(did, true);
    });
    document.getElementById('btn-boon-reroll')?.addEventListener('click', () => this.rerollBoons());
    document.getElementById('btn-char-confirm')?.addEventListener('click', () => this.confirmCharSelect());
    document.getElementById('btn-char-unlock')?.addEventListener('click', () => this.coopUnlockCharSelect?.());
    document.getElementById('btn-char-back')?.addEventListener('click', () => this.backFromCharSelect());
    document.getElementById('btn-compendium')?.addEventListener('click', () => this.openCompendium());
    document.getElementById('btn-pause-compendium')?.addEventListener('click', () => this.openCompendium());
    document.getElementById('btn-codex-close')?.addEventListener('click', () => this.closeCompendium());

    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) btnRetry.addEventListener('click', () => { this.sfx.init(); this.sfx.uiRunStart(); this.startRun(true); });
    const btnEndLobby = document.getElementById('btn-end-lobby');
    if (btnEndLobby) btnEndLobby.addEventListener('click', () => this.leaveToLobbyFromMenu(false));
    const btnEndTitle = document.getElementById('btn-end-title');
    if (btnEndTitle) btnEndTitle.addEventListener('click', () => this.returnToTitle());

    const btnWpnLeave = document.getElementById('btn-wpn-leave');
    if (btnWpnLeave) btnWpnLeave.addEventListener('click', () => this.closeWeaponModalWithoutTaking());

    const slot0 = document.getElementById('wpn-slot-0');
    if (slot0) slot0.addEventListener('click', () => this.swapWeaponSlot(0));
    const slot1 = document.getElementById('wpn-slot-1');
    if (slot1) slot1.addEventListener('click', () => this.swapWeaponSlot(1));

    const slotPrimary = document.getElementById('slot-primary');
    if (slotPrimary) slotPrimary.addEventListener('click', () => this.tryAttack());
    const slotSkill = document.getElementById('slot-skill');
    if (slotSkill) slotSkill.addEventListener('click', () => this.tryWeaponSkill());
    const slotUlt = document.getElementById('slot-ult');
    if (slotUlt) slotUlt.addEventListener('click', () => tryHeroActiveSkill(this));
    const slotDash = document.getElementById('slot-dash');
    if (slotDash) slotDash.addEventListener('click', () => this.tryDash());
    const slotFlask = document.getElementById('slot-flask');
    if (slotFlask) slotFlask.addEventListener('click', () => this.tryHealFlask());

    const lockPillEl = document.getElementById('lock-pill');
    if (lockPillEl) lockPillEl.addEventListener('click', () => this.togglePinTarget());

    const minimapWrap = document.getElementById('minimap-wrap');
    if (minimapWrap) minimapWrap.addEventListener('click', () => this.toggleMinimapExpand());

    if (this.interactEl) {
      this.interactEl.addEventListener('click', () => this.tryInteract());
    }

    const btnLang = document.getElementById('btn-set-lang');
    if (btnLang) btnLang.addEventListener('click', () => this.handleToggleLanguage());
    const btnTitleLang = document.getElementById('btn-title-lang');
    if (btnTitleLang) btnTitleLang.addEventListener('click', () => this.handleToggleLanguage());

    // Pause & Tactical Menu controls
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => this.closePauseMenu());
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      if (this.isCoopClient && this.isCoopClient()) return;
      this.sfx.setPausedDamp(false);
      this.sfx.init();
      this.sfx.uiRunStart();
      this.startRun(true);
    });
    document.getElementById('btn-pause-lobby')?.addEventListener('click', () => this.leaveToLobbyFromMenu(true));
    document.getElementById('btn-pause-title')?.addEventListener('click', () => this.returnToTitle());
    document.getElementById('btn-pause-swap-order')?.addEventListener('click', () => this.swapEquippedWeaponOrder());

    const volSlider = document.getElementById('set-vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        this.sfx.init();
        this.sfx.setVolume(Number(volSlider.value) / 100);
        this.sfx.uiHover();
        this.updateAudioButtonText();
        this.renderPauseMenu();
      });
    }
    document.getElementById('btn-set-mute')?.addEventListener('click', () => {
      this.sfx.init();
      this.sfx.toggleMute();
      this.updateAudioButtonText();
      this.renderPauseMenu();
    });
    document.getElementById('set-gfx-ultra')?.addEventListener('click', () => { this.sfx.init(); this.sfx.uiSettingTick(true); this.setQuality('ultra'); });
    document.getElementById('set-gfx-high')?.addEventListener('click', () => { this.sfx.init(); this.sfx.uiSettingTick(false); this.setQuality('high'); });

    const setShake = (mode) => {
      this.sfx.init();
      this.sfx.uiSettingTick(mode !== 'off');
      this.settings.screenShake = mode;
      this.saveUserSettings();
      this.renderPauseMenu();
    };
    document.getElementById('set-shake-full')?.addEventListener('click', () => setShake('full'));
    document.getElementById('set-shake-soft')?.addEventListener('click', () => setShake('soft'));
    document.getElementById('set-shake-off')?.addEventListener('click', () => setShake('off'));

    document.getElementById('btn-set-dmgnum')?.addEventListener('click', () => {
      this.settings.damageNumbers = !this.settings.damageNumbers;
      this.sfx.init();
      this.sfx.uiSettingTick(this.settings.damageNumbers);
      this.saveUserSettings();
      this.renderPauseMenu();
    });
    document.getElementById('btn-set-autopause')?.addEventListener('click', () => {
      this.settings.autoPauseBlur = !this.settings.autoPauseBlur;
      this.sfx.init();
      this.sfx.uiSettingTick(this.settings.autoPauseBlur);
      this.saveUserSettings();
      this.renderPauseMenu();
    });
    document.getElementById('set-map-normal')?.addEventListener('click', () => this.setMinimapMode('normal'));
    document.getElementById('set-map-large')?.addEventListener('click', () => this.setMinimapMode('large'));
    document.getElementById('set-map-hidden')?.addEventListener('click', () => this.setMinimapMode('hidden'));
    document.getElementById('btn-set-fullscreen')?.addEventListener('click', () => { this.sfx.init(); this.sfx.uiSettingTick(true); this.toggleFullscreen(); });
  }

  applyMinimapLayout(persist = true) {
    const wrap = document.getElementById('minimap-wrap');
    if (wrap) {
      wrap.classList.toggle('hidden', !this.mapVisible);
      wrap.classList.toggle('expanded', !!this.settings.mapExpanded);
    }
    if (this.minimapCanvas) {
      const targetW = this.settings.mapExpanded ? 278 : 164;
      const targetH = this.settings.mapExpanded ? 248 : 148;
      if (this.minimapCanvas.width !== targetW || this.minimapCanvas.height !== targetH) {
        this.minimapCanvas.width = targetW;
        this.minimapCanvas.height = targetH;
      }
      if (this.minimapHdCanvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const pw = Math.round(targetW * dpr);
        const ph = Math.round(targetH * dpr);
        if (this.minimapHdCanvas.width !== pw || this.minimapHdCanvas.height !== ph) {
          this.minimapHdCanvas.width = pw;
          this.minimapHdCanvas.height = ph;
        }
      }
    }
    if (persist) this.saveUserSettings();
    if (this.mapVisible) this.drawMinimap();
    if (this.mode === 'paused') this.renderPauseMenu();
  }

  setMinimapMode(mode) {
    if (mode === 'hidden') {
      this.mapVisible = false;
    } else if (mode === 'large') {
      this.mapVisible = true;
      this.settings.mapExpanded = true;
    } else {
      this.mapVisible = true;
      this.settings.mapExpanded = false;
    }
    this.sfx.init();
    this.sfx.uiMapToggle(mode === 'large');
    this.applyMinimapLayout(true);
  }

  toggleMinimapExpand() {
    if (!this.mapVisible) {
      this.mapVisible = true;
      this.settings.mapExpanded = true;
    } else {
      this.settings.mapExpanded = !this.settings.mapExpanded;
    }
    this.sfx.init();
    this.sfx.uiMapToggle(!!this.settings.mapExpanded);
    this.applyMinimapLayout(true);
  }

  toggleMinimap() {
    this.mapVisible = !this.mapVisible;
    this.sfx.init();
    this.sfx.uiMapToggle(this.mapVisible);
    this.applyMinimapLayout(true);
  }

  detonateCannonSplash(p, directTarget = null) {
    if (p.spawnAcidPool) this.sfx.acidShatter({ x: p.x, z: p.z });
    else this.sfx.cannonExplosion({ x: p.x, z: p.z });
    this.vfx.burst(p.x, 1.05, p.z, p.colorHex, 28, 6.8, 9.0);
    this.vfx.spawnRing(p.x, p.z, p.splashRadius, 0.34, p.colorHex, false);
    this.vfx.flash(p.x, 1.35, p.z, p.colorHex, 16);
    this.cameraShake = Math.max(this.cameraShake, 0.20);

    for (const d of this.dungeon.destructibles) {
      if (!d.broken && Math.hypot(d.x - p.x, d.z - p.z) <= p.splashRadius + d.r) {
        this.breakProp(d);
      }
    }
    for (const e of [...this.enemies]) {
      if (e.hp <= 0) continue;
      const dist = Math.hypot(e.x - p.x, e.z - p.z);
      if (
        dist <= p.splashRadius + e.radius &&
        (e === directTarget || !this.dungeon?.isSegmentBlockedByCover?.(p.x, p.z, e.x, e.z, 0.04))
      ) {
        const mult = e === directTarget ? 1.0 : 0.72;
        this.damageEnemy(e, p.dmg * mult, p.x, p.z, {
          weaponInst: p.weaponInst,
          inflictBurn: p.inflictBurn,
          inflictBlight: p.inflictBlight,
          chillDuration: p.chillDuration || 0,
          fxColor: p.colorHex,
          stagger: 0.35
        });
      }
    }
    if (p.spawnAcidPool && !p._acidSpawned) {
      p._acidSpawned = true;
      this.spawnAcidPoolAt(p.x, p.z, p.splashRadius || 2.15, Math.max(8, Math.round(p.dmg * 0.42)), p.weaponInst);
    }
  }

  updateSummonsAndOrbitals(dt) {
    const h = this.hero;
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      const ap = this.acidPools[i];
      ap.life -= dt;
      if (ap.life <= 0) {
        this.scene.remove(ap.mesh);
        this.acidPools.splice(i, 1);
        continue;
      }
      ap.mesh.material.opacity = Math.min(0.45, (ap.life / ap.maxLife) * 0.48);
      ap.mesh.rotation.z += dt * 0.85;
      ap.tick -= dt;
      if (ap.tick <= 0) {
        ap.tick = 0.45;
        if (Math.random() < 0.7) this.vfx.burst(ap.x + (Math.random() - 0.5) * ap.radius, 0.25, ap.z + (Math.random() - 0.5) * ap.radius, 0x76ff4d, 3, 1.8, 2.0);
        if (ap.visualOnly) continue;
        for (const e of [...this.enemies]) {
          if (e && e.hp > 0 && Math.hypot(e.x - ap.x, e.z - ap.z) <= ap.radius + e.radius) {
            this.damageEnemy(e, Math.max(2, Math.round(ap.dps * 0.45)), ap.x, ap.z, {
              allowCrit: false,
              inflictBlight: true,
              chillDuration: 0.9,
              weaponInst: ap.weaponInst,
              fxColor: 0x76ff4d,
              isDot: true
            });
          }
        }
      }
    }

    for (let i = this.summons.length - 1; i >= 0; i--) {
      const sm = this.summons[i];
      sm.life -= dt;
      if (sm.life <= 0) {
        this.vfx.burst(sm.x, 0.8, sm.z, 0x7ef5ff, 14, 4.0, 4.0);
        this.scene.remove(sm.mesh);
        this.summons.splice(i, 1);
        continue;
      }
      if (sm.coil) sm.coil.rotation.y += dt * 3.8;
      if (sm.ring) sm.ring.rotation.z -= dt * 2.6;
      sm.zapTimer -= dt;
      if (sm.zapTimer <= 0) {
        let best = null;
        let bestD = 9.2;
        for (const e of this.enemies) {
          if (!e || e.hp <= 0) continue;
          if (this.dungeon?.isSegmentBlockedByCover?.(sm.x, sm.z, e.x, e.z, 0.06)) continue;
          const d = Math.hypot(e.x - sm.x, e.z - sm.z);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          sm.zapTimer = 0.54;
          this.sfx.rangedShot('autoturret', { pos: { x: sm.x, z: sm.z } });
          if (sm.visualOnly) {
            this.spawnLightningBolt(sm.x, sm.z, best.x, best.z, 0x7ef5ff, true);
          } else {
            this.spawnLightningBolt(sm.x, sm.z, best.x, best.z, 0x7ef5ff);
            this.damageEnemy(best, sm.zapDmg, sm.x, sm.z, {
              allowCrit: true,
              weaponInst: sm.weaponInst,
              fxColor: 0x7ef5ff
            });
            this.triggerChainLightning(best, Math.round(sm.zapDmg * 0.45));
          }
        } else {
          sm.zapTimer = 0.18;
        }
      }
    }

    for (let i = this.orbitalBlades.length - 1; i >= 0; i--) {
      const ob = this.orbitalBlades[i];
      ob.life -= dt;
      const anchor = (ob.visualOnly && ob.ownerPeer) ? ob.ownerPeer : h;
      if (ob.life <= 0 || !anchor || anchor.downed) {
        this.scene.remove(ob.mesh);
        this.orbitalBlades.splice(i, 1);
        continue;
      }
      ob.angle += dt * (ob.kind === 'saw' ? 5.8 : 3.2);
      const ox = anchor.x + Math.cos(ob.angle) * ob.orbitRad;
      const oz = anchor.z + Math.sin(ob.angle) * ob.orbitRad;
      ob.mesh.position.set(ox, 1.05, oz);
      ob.mesh.rotation.y += dt * 10.0;
      if (ob.visualOnly) {
        if (ob.kind === 'wraith_skull') {
          ob.armDelay = Math.max(0, (ob.armDelay || 0) - dt);
          if (ob.armDelay <= 0 && this.enemies.some((e) => e && e.hp > 0 && Math.hypot(e.x - ox, e.z - oz) < 6.8)) {
            this.scene.remove(ob.mesh);
            this.orbitalBlades.splice(i, 1);
          }
        }
        continue;
      }

      if (ob.kind === 'wraith_skull') {
        ob.armDelay = Math.max(0, (ob.armDelay || 0) - dt);
        if (ob.armDelay <= 0) {
          let target = null;
          let bestD = 6.8;
          for (const e of this.enemies) {
            if (!e || e.hp <= 0) continue;
            const d = Math.hypot(e.x - ox, e.z - oz);
            if (d < bestD) {
              bestD = d;
              target = e;
            }
          }
          if (target) {
            this.scene.remove(ob.mesh);
            this.orbitalBlades.splice(i, 1);
            this.spawnPlayerProjectile({
              kind: 'void_orb',
              x: ox,
              z: oz,
              yaw: Math.atan2(target.x - ox, target.z - oz),
              speed: 21.0,
              dmg: ob.dmg,
              colorHex: 0x52ffbc,
              radius: 0.55,
              life: 1.15,
              pierce: 1,
              splashRadius: 1.85,
              homingTarget: target,
              lifestealOnHit: 3,
              weaponInst: ob.weaponInst
            });
            continue;
          }
        }
      } else {
        for (const [enemyRef, cd] of ob.hitCdMap.entries()) {
          if (cd - dt <= 0) ob.hitCdMap.delete(enemyRef);
          else ob.hitCdMap.set(enemyRef, cd - dt);
        }
        for (const e of [...this.enemies]) {
          if (!e || e.hp <= 0 || ob.hitCdMap.has(e)) continue;
          if (Math.hypot(e.x - ox, e.z - oz) <= 0.55 + e.radius) {
            ob.hitCdMap.set(e, 0.34);
            this.damageEnemy(e, ob.dmg, h.x, h.z, {
              weaponInst: ob.weaponInst,
              inflictBleed: true,
              fxColor: 0x8be2ff
            });
          }
        }
      }
    }
  }

  updateProjectiles(dt) {
    const h = this.hero;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.friendly && p.splashRadius > 0) {
          if (p.visualOnly) {
            this.vfx.burst(p.x, 1.05, p.z, p.colorHex, 20, 5.6, 7.0);
            this.vfx.spawnRing(p.x, p.z, p.splashRadius, 0.34, p.colorHex, false);
            if (p.spawnAcidPool && !p._acidSpawned) {
              p._acidSpawned = true;
              this.spawnAcidPoolAt(p.x, p.z, p.splashRadius || 2.15, 0, null, true);
            }
          } else {
            this.detonateCannonSplash(p, null);
          }
        }
        this.destroyProjectile(p);
        this.projectiles.splice(i, 1);
        continue;
      }

      const prevPX = p.x;
      const prevPZ = p.z;

      if (p.friendly && p.isBoomerang) {
        if (p.boomerangPhase === 0) {
          const stepD = Math.hypot(p.vx, p.vz) * dt;
          p.travelDist += stepD;
          if (p.travelDist >= p.maxTravel) {
            p.boomerangPhase = 1;
            p.hoverTimer = 0.14;
            p.hitSet.clear();
          }
        } else if (p.boomerangPhase === 1) {
          p.hoverTimer -= dt;
          p.vx *= 0.75;
          p.vz *= 0.75;
          if (p.hoverTimer <= 0) {
            p.boomerangPhase = 2;
            p.hitSet.clear();
          }
        } else if (p.ownerPeer || h) {
          const retOwner = p.ownerPeer || h;
          const rx = retOwner.x - p.x;
          const rz = retOwner.z - p.z;
          const rDist = Math.hypot(rx, rz);
          if (rDist <= 0.88) {
            if (!p.visualOnly && h) h.arcCd = Math.max(0, h.arcCd - 0.50);
            this.sfx.boomerangCatch({ x: retOwner.x, z: retOwner.z });
            this.vfx.burst(retOwner.x, 1.1, retOwner.z, p.colorHex, 8, 3.2, 2.5);
            this.destroyProjectile(p);
            this.projectiles.splice(i, 1);
            continue;
          }
          const retSpd = p.speed * 1.24;
          p.vx = (rx / rDist) * retSpd;
          p.vz = (rz / rDist) * retSpd;
        }
      }

      if (p.friendly && p.homingTarget && p.homingTarget.hp > 0) {
        const tx = p.homingTarget.x - p.x;
        const tz = p.homingTarget.z - p.z;
        const desiredYaw = Math.atan2(tx, tz);
        const curYaw = Math.atan2(p.vx, p.vz);
        let diff = Math.atan2(Math.sin(desiredYaw - curYaw), Math.cos(desiredYaw - curYaw));
        const turnRate = p.kind === 'singularity' ? 2.6 : (p.kind === 'spirit_sword' ? 7.8 : 5.4);
        const nextYaw = curYaw + Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        p.vx = Math.sin(nextYaw) * p.speed;
        p.vz = Math.cos(nextYaw) * p.speed;
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;

      const traceX0 = p.firstTracePending ? (p.prevTraceX ?? prevPX) : prevPX;
      const traceZ0 = p.firstTracePending ? (p.prevTraceZ ?? prevPZ) : prevPZ;
      p.firstTracePending = false;

      const obsHit = this.dungeon.traceProjectileObstruction
        ? this.dungeon.traceProjectileObstruction(traceX0, traceZ0, p.x, p.z, 0.12)
        : (!this.dungeon.isPointWalkable(p.x, p.z, 0.14) ? { kind: 'wall', x: p.x, z: p.z, nx: 0, nz: 0 } : null);
      if (obsHit) {
        p.x = obsHit.x;
        p.z = obsHit.z;
      }

      p.mesh.position.set(p.x, 1.05, p.z);
      if (p.kind === 'chakram_disc' || p.kind === 'sawblade' || p.kind === 'storm_halberd') {
        p.mesh.rotation.y += dt * 18.0;
      } else {
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
      }
      if (p.kind === 'singularity' && p.mesh.children[1]) {
        p.mesh.children[1].rotation.z += dt * 4.8;
      } else if (p.kind === 'mini_sun' && p.mesh.children[1]) {
        p.mesh.children[1].rotation.z -= dt * 5.2;
      } else if (p.kind === 'void_orb' && p.mesh.children[0]) {
        p.mesh.children[0].rotation.y += dt * 6.5;
      }

      if (p.friendly && p.solarZapper && !p.visualOnly) {
        p.pulseTimer -= dt;
        if (p.pulseTimer <= 0) {
          p.pulseTimer = 0.20;
          for (const e of [...this.enemies]) {
            if (
              e &&
              e.hp > 0 &&
              Math.hypot(e.x - p.x, e.z - p.z) <= 3.6 + e.radius &&
              !this.dungeon.isSegmentBlockedByCover?.(p.x, p.z, e.x, e.z, 0.05)
            ) {
              this.spawnLightningBolt(p.x, p.z, e.x, e.z, p.colorHex);
              this.damageEnemy(e, p.pulseDmg || p.dmg * 0.42, p.x, p.z, {
                allowCrit: true,
                inflictBurn: p.kind === 'mini_sun',
                weaponInst: p.weaponInst,
                fxColor: p.colorHex
              });
            }
          }
        }
      }

      if (p.friendly && !p.visualOnly) {
        for (const d of this.dungeon.destructibles) {
          if (!d.broken && this.pointToSegmentDist(d.x, d.z, traceX0, traceZ0, p.x, p.z) <= p.radius + d.r) {
            this.breakProp(d);
          }
        }
      }

      const handleObstructionImpact = () => {
        if (p.friendly && p.isBoomerang && p.boomerangPhase < 2) {
          p.x = obsHit.kind === 'cover' ? obsHit.x + obsHit.nx * 0.06 : prevPX;
          p.z = obsHit.kind === 'cover' ? obsHit.z + obsHit.nz * 0.06 : prevPZ;
          p.mesh.position.set(p.x, 1.05, p.z);
          p.boomerangPhase = 2;
          p.hitSet.clear();
          this.vfx.burst(obsHit.x, 1.05, obsHit.z, p.colorHex, 8, 3.5, 5.0);
          return;
        }
        if (p.friendly && p.ricochetLeft > 0) {
          p.ricochetLeft--;
          this.sfx.ricochetSpark({ x: obsHit.x, z: obsHit.z });
          if (obsHit.kind === 'cover' && (obsHit.nx !== 0 || obsHit.nz !== 0)) {
            const dot = p.vx * obsHit.nx + p.vz * obsHit.nz;
            if (dot < 0) {
              p.vx -= 2 * dot * obsHit.nx;
              p.vz -= 2 * dot * obsHit.nz;
            }
            p.x = obsHit.x + obsHit.nx * 0.06;
            p.z = obsHit.z + obsHit.nz * 0.06;
          } else {
            const flipX = this.dungeon.isPointWalkable(prevPX, obsHit.z, 0.14);
            const flipZ = this.dungeon.isPointWalkable(obsHit.x, prevPZ, 0.14);
            p.x = prevPX;
            p.z = prevPZ;
            if (flipX && !flipZ) p.vx = -p.vx;
            else if (flipZ && !flipX) p.vz = -p.vz;
            else {
              p.vx = -p.vx;
              p.vz = -p.vz;
            }
          }
          p.mesh.position.set(p.x, 1.05, p.z);
          p.hitSet.clear();
          this.vfx.burst(obsHit.x, 1.05, obsHit.z, p.colorHex, 8, 3.8, 6.0);
          return;
        }
        if (p.friendly && p.splashRadius > 0 && !p.visualOnly) {
          if (obsHit.kind === 'cover') {
            p.x = obsHit.x + obsHit.nx * 0.08;
            p.z = obsHit.z + obsHit.nz * 0.08;
          }
          this.detonateCannonSplash(p, null);
        } else if (p.friendly && p.splashRadius > 0 && p.visualOnly) {
          const sx = obsHit.kind === 'cover' ? obsHit.x + obsHit.nx * 0.08 : obsHit.x;
          const sz = obsHit.kind === 'cover' ? obsHit.z + obsHit.nz * 0.08 : obsHit.z;
          this.vfx.burst(sx, 1.05, sz, p.colorHex, 20, 5.6, 7.0);
          this.vfx.spawnRing(sx, sz, p.splashRadius, 0.34, p.colorHex, false);
          if (p.spawnAcidPool && !p._acidSpawned) {
            p._acidSpawned = true;
            this.spawnAcidPoolAt(sx, sz, p.splashRadius || 2.15, 0, null, true);
          }
        } else {
          this.vfx.burst(obsHit.x, 1.05, obsHit.z, p.colorHex, 10, 4.0, 8.0);
        }
        this.destroyProjectile(p);
        this.projectiles.splice(i, 1);
      };

      if (p.friendly) {
        if (p.visualOnly) {
          let removedVis = false;
          let bouncedVis = false;
          for (const e of this.enemies) {
            if (!e || e.hp <= 0 || p.hitSet.has(e)) continue;
            if (
              this.pointToSegmentDist(e.x, e.z, traceX0, traceZ0, p.x, p.z) <= p.radius + e.radius &&
              !this.dungeon.isSegmentBlockedByCover?.(traceX0, traceZ0, e.x, e.z, 0.04)
            ) {
              p.hitSet.add(e);
              this.vfx.burst(p.x, 1.05, p.z, p.colorHex, 8, 3.8, 7.0);
              if (p.splashRadius > 0) {
                this.vfx.spawnRing(p.x, p.z, p.splashRadius, 0.34, p.colorHex, false);
                if (p.spawnAcidPool && !p._acidSpawned) {
                  p._acidSpawned = true;
                  this.spawnAcidPoolAt(p.x, p.z, p.splashRadius || 2.15, 0, null, true);
                }
              }
              if (p.bouncesLeft > 0) {
                p.bouncesLeft--;
                const nextE = this.enemies.find((o) => o && o !== e && o.hp > 0 && !p.hitSet.has(o) && Math.hypot(o.x - p.x, o.z - p.z) < 7.2 && !this.dungeon.isSegmentBlockedByCover?.(e.x, e.z, o.x, o.z, 0.06));
                if (nextE) {
                  p.x = e.x;
                  p.z = e.z;
                  p.mesh.position.set(p.x, 1.05, p.z);
                  const byaw = Math.atan2(nextE.x - p.x, nextE.z - p.z);
                  p.vx = Math.sin(byaw) * p.speed;
                  p.vz = Math.cos(byaw) * p.speed;
                  p.life = Math.max(p.life, 0.65);
                  bouncedVis = true;
                  break;
                }
              }
              p.pierceLeft--;
              if (p.pierceLeft <= 0) {
                this.destroyProjectile(p);
                this.projectiles.splice(i, 1);
                removedVis = true;
                break;
              }
            }
          }
          if (!removedVis && !bouncedVis && obsHit) handleObstructionImpact();
          continue;
        }
        if (p.kind === 'singularity') {
          if (obsHit) {
            handleObstructionImpact();
            continue;
          }
          p.pulseTimer -= dt;
          for (const e of this.enemies) {
            const dx = p.x - e.x;
            const dz = p.z - e.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.25 && dist < p.pullRadius) {
              const pull = (e.boss ? 1.35 : 3.8) * dt;
              const prevEX = e.x;
              const prevEZ = e.z;
              e.x += (dx / dist) * pull;
              e.z += (dz / dist) * pull;
              this.dungeon.resolveMovement(e, prevEX, prevEZ, e.radius);
            }
          }
          if (p.pulseTimer <= 0) {
            p.pulseTimer = 0.24;
            this.vfx.spawnRing(p.x, p.z, p.pullRadius * 0.72, 0.26, p.colorHex, false);
            for (const e of [...this.enemies]) {
              if (
                Math.hypot(e.x - p.x, e.z - p.z) <= p.pullRadius * 0.78 + e.radius &&
                !this.dungeon.isSegmentBlockedByCover?.(p.x, p.z, e.x, e.z, 0.04)
              ) {
                this.damageEnemy(e, p.pulseDmg, p.x, p.z, {
                  allowCrit: true,
                  weaponInst: p.weaponInst,
                  fxColor: p.colorHex
                });
              }
            }
          }
          continue;
        }

        let removeProj = false;
        let bouncedThisTick = false;
        for (const e of [...this.enemies]) {
          if (!e || e.hp <= 0 || p.hitSet.has(e)) continue;
          if (
            this.pointToSegmentDist(e.x, e.z, traceX0, traceZ0, p.x, p.z) <= p.radius + e.radius &&
            !this.dungeon.isSegmentBlockedByCover?.(traceX0, traceZ0, e.x, e.z, 0.04)
          ) {
            p.hitSet.add(e);
            if (p.lifestealOnHit > 0 && !h.downed) {
              h.hp = Math.min(h.maxHp, h.hp + p.lifestealOnHit);
            }
            if (p.splashRadius > 0 && p.kind !== 'mini_sun') {
              this.detonateCannonSplash(p, e);
            } else {
              let hitDmg = p.dmg;
              if (p.pointBlankBonus && Math.hypot(p.x - p.originX, p.z - p.originZ) <= 4.5) {
                hitDmg *= 1.35;
              }
              this.damageEnemy(e, hitDmg, p.x, p.z, {
                weaponInst: p.weaponInst,
                inflictBurn: p.inflictBurn,
                inflictBleed: p.inflictBleed,
                inflictBlight: p.inflictBlight,
                chillDuration: p.chillDuration || 0,
                fxColor: p.colorHex
              });
            }
            if (p.starfallTrigger) {
              p.starfallTrigger = false;
              this.vfx.spawnRing(e.x, e.z, 2.5, 0.34, 0xffdf6e, true);
              this.delayedHazards.push({
                friendly: true,
                timer: 0.34,
                x: e.x,
                z: e.z,
                radius: 2.5,
                dmg: p.dmg * 1.28,
                colorHex: 0xffdf6e,
                lightningSky: true,
                weaponInst: p.weaponInst,
                stagger: 0.7,
                mesh: null
              });
              for (let s = -1; s <= 1; s += 2) {
                const syaw = Math.atan2(p.vx, p.vz) + s * 0.55;
                this.spawnPlayerProjectile({
                  kind: 'spirit_sword',
                  x: e.x,
                  z: e.z,
                  yaw: syaw,
                  speed: 22.0,
                  dmg: p.dmg * 0.55,
                  colorHex: 0x9de6ff,
                  radius: 0.40,
                  life: 0.95,
                  pierce: 1,
                  homingTarget: this.enemies.find((o) => o !== e && o.hp > 0) || null,
                  weaponInst: p.weaponInst
                });
              }
            }
            if (p.swordMarkHit && e.hp > 0) {
              e.swordMarks = (e.swordMarks || 0) + 1;
              if (e.swordMarks >= 4) {
                e.swordMarks = 0;
                this.delayedHazards.push({
                  friendly: true,
                  timer: 0.14,
                  x: e.x,
                  z: e.z,
                  radius: 2.1,
                  dmg: p.dmg * 2.15,
                  colorHex: 0x8ef5ff,
                  lightningSky: true,
                  weaponInst: p.weaponInst,
                  stagger: 0.65,
                  mesh: null
                });
              }
            }
            if (p.voltaicArc && e.hp > 0) {
              this.triggerChainLightning(e, Math.round(p.dmg * 0.55));
            }
            if (p.isSkill && h.chainLightning > 0 && e.hp > 0) {
              this.triggerChainLightning(e, h.chainLightning);
            }
            if (p.bouncesLeft > 0) {
              let nextTarget = null;
              let bestD = 8.5;
              for (const other of this.enemies) {
                if (!other || other.hp <= 0 || p.hitSet.has(other)) continue;
                if (this.dungeon.isSegmentBlockedByCover?.(e.x, e.z, other.x, other.z, 0.06)) continue;
                const d = Math.hypot(other.x - p.x, other.z - p.z);
                if (d < bestD) {
                  bestD = d;
                  nextTarget = other;
                }
              }
              if (nextTarget) {
                p.bouncesLeft--;
                p.homingTarget = nextTarget;
                p.x = e.x;
                p.z = e.z;
                p.mesh.position.set(p.x, 1.05, p.z);
                const byaw = Math.atan2(nextTarget.x - p.x, nextTarget.z - p.z);
                p.vx = Math.sin(byaw) * p.speed;
                p.vz = Math.cos(byaw) * p.speed;
                p.life = Math.max(p.life, 0.65);
                bouncedThisTick = true;
                break;
              }
            }
            p.pierceLeft--;
            if (p.pierceLeft <= 0) {
              removeProj = true;
              break;
            }
          }
        }
        if (removeProj) {
          this.destroyProjectile(p);
          this.projectiles.splice(i, 1);
        } else if (!bouncedThisTick && obsHit) {
          handleObstructionImpact();
        }
      } else {
        if (
          this.pointToSegmentDist(h.x, h.z, traceX0, traceZ0, p.x, p.z) <= p.radius + 0.42 &&
          !this.dungeon.isSegmentBlockedByCover?.(traceX0, traceZ0, h.x, h.z, 0.04)
        ) {
          this.damageHero(p.dmg, p.x, p.z);
          this.destroyProjectile(p);
          this.projectiles.splice(i, 1);
        } else if (obsHit) {
          handleObstructionImpact();
        }
      }
    }
  }

  pickEnemyTarget(e) {
    const candidates = [];
    const h = this.hero;
    const myId = (this.lan && this.lan.clientId) || 'local';
    if (h && !h.downed && h.hp > 0) {
      candidates.push({ id: myId, x: h.x, z: h.z });
    }
    if (this.remotePlayers && this.remotePlayers.size > 0) {
      for (const peer of this.remotePlayers.values()) {
        if (peer.downed || peer.hp <= 0) continue;
        if (e.room && e.room.locked) {
          const inRoom = Math.abs(peer.x - e.room.cx) <= e.room.halfW + 3.0
            && Math.abs(peer.z - e.room.cz) <= e.room.halfD + 3.0;
          if (!inRoom && candidates.length > 0) continue;
        }
        candidates.push({ id: peer.id, x: peer.x, z: peer.z });
      }
    }
    if (candidates.length === 0) return h;
    let best = candidates[0];
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      const threat = e.threatMap ? (e.threatMap[c.id] || 0) : 0;
      const sticky = e.lastTargetId === c.id ? 0.85 : 0;
      const score = d - Math.min(4.5, threat * 0.018) - sticky;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    e.lastTargetId = best.id;
    return best;
  }

  isEnemyStepClear(e, nx, nz, extraPad = 0.14) {
    const rad = (e.radius || 0.48) + extraPad;
    if (this.dungeon && !this.dungeon.isPointWalkable(nx, nz, rad)) return false;
    const rm = e.room || this.currentRoom;
    if (rm) {
      if (rm.colliders) {
        for (const c of rm.colliders) {
          const dx = nx - c.x;
          const dz = nz - c.z;
          const lim = c.r + rad;
          if (dx * dx + dz * dz < lim * lim) return false;
        }
      }
      if (rm.props) {
        for (const p of rm.props) {
          if (p.broken) continue;
          const dx = nx - p.x;
          const dz = nz - p.z;
          const lim = p.r + rad * 0.85;
          if (dx * dx + dz * dz < lim * lim) return false;
        }
      }
      if (!e.poise && rm.traps) {
        for (const tr of rm.traps) {
          if (Math.abs(nx - tr.x) < tr.half + 0.35 && Math.abs(nz - tr.z) < tr.half + 0.35) return false;
        }
      }
    }
    return true;
  }

  computeEnemyMoveVector(e, tgt, dx, dz, distToHero, dt) {
    const ux = dx / distToHero;
    const uz = dz / distToHero;
    const perpX = -uz;
    const perpZ = ux;
    const rm = e.room || this.currentRoom;

    // 1) Tactical peer separation (prevents clumping & spreads ranged mobs wide)
    let sepX = 0;
    let sepZ = 0;
    for (const other of this.enemies) {
      if (other === e || other.hp <= 0 || other.room !== e.room) continue;
      let sdx = e.x - other.x;
      let sdz = e.z - other.z;
      let sd = Math.hypot(sdx, sdz);
      if (sd < 0.001) {
        sdx = Math.cos(e.aiSeed || 0);
        sdz = Math.sin(e.aiSeed || 0);
        sd = 0.001;
      }
      const bothRanged = e.type === 'acolyte' && other.type === 'acolyte';
      const anyRanged = e.type === 'acolyte' || other.type === 'acolyte';
      const desiredGap = bothRanged
        ? 4.8
        : (anyRanged ? 2.75 : (e.radius + other.radius + 1.38));
      if (sd < desiredGap) {
        const ratio = (desiredGap - sd) / desiredGap;
        const weight = bothRanged ? 1.50 : (anyRanged ? 0.78 : 0.96);
        sepX += (sdx / sd) * ratio * weight;
        sepZ += (sdz / sd) * ratio * weight;
      }
    }

    // 2) Role-specific tactical desire
    let goalX = 0;
    let goalZ = 0;
    if (e.type === 'acolyte') {
      const blockedLoS = this.dungeon?.isSegmentBlockedByCover?.(e.x, e.z, tgt.x, tgt.z, 0.08) || false;
      let radial = 0;
      let strafe = 0;
      const orbitWave = Math.cos(this.time * 0.9 + (e.aiSeed || 0));
      const sDir = (orbitWave >= -0.35 ? 1 : -1) * (e.strafeDir || 1);
      if (distToHero < 4.8) {
        radial = -1.08;
        strafe = 0.52 * sDir;
      } else if (distToHero < 6.8) {
        radial = -0.74;
        strafe = 0.58 * sDir;
      } else if (distToHero <= 10.2) {
        radial = blockedLoS ? 0.34 : (8.0 - distToHero) * 0.08;
        strafe = (blockedLoS ? 0.96 : 0.50) * sDir;
      } else {
        radial = 0.86;
        strafe = 0.36 * sDir;
      }
      goalX = ux * radial + perpX * strafe;
      goalZ = uz * radial + perpZ * strafe;

      // Corner/wall escape when retreating so ranged mobs slide out along room perimeter
      if (radial < -0.2 && rm) {
        const probeX = e.x + goalX * 1.45;
        const probeZ = e.z + goalZ * 1.45;
        if (!this.isEnemyStepClear(e, probeX, probeZ, 0.22)) {
          const toCenterX = rm.cx - e.x;
          const toCenterZ = rm.cz - e.z;
          const sideSign = (toCenterX * perpX + toCenterZ * perpZ) >= 0 ? 1 : -1;
          goalX = perpX * sideSign * 0.95 + ux * 0.12;
          goalZ = perpZ * sideSign * 0.95 + uz * 0.12;
        }
      }
    } else if (e.type === 'stalker') {
      if (distToHero > 1.48) {
        const flank = (e.flankAngle || 0) * Math.min(1, distToHero / 3.6) + Math.sin(this.time * 3.1 + (e.aiSeed || 0)) * 0.34;
        const ang = Math.atan2(ux, uz) + flank;
        goalX = Math.sin(ang);
        goalZ = Math.cos(ang);
      }
    } else if (distToHero > e.range * 0.76) {
      const surround = e.boss ? 0 : (e.flankAngle || 0) * Math.max(0, Math.min(1, (distToHero - 1.85) / 4.2));
      const ang = Math.atan2(ux, uz) + surround;
      goalX = Math.sin(ang);
      goalZ = Math.cos(ang);
    }

    let vx = goalX + sepX;
    let vz = goalZ + sepZ;
    const mag = Math.hypot(vx, vz);
    if (mag < 0.08) return { x: 0, z: 0, moving: false };
    vx /= mag;
    vz /= mag;

    // 3) Multi-angle Context Obstacle Avoidance around pillars, props & walls
    e.steerTimer = Math.max(0, (e.steerTimer || 0) - dt);
    const clearNear = this.isEnemyStepClear(e, e.x + vx * 0.95, e.z + vz * 0.95, 0.12);
    const clearFar = clearNear && this.isEnemyStepClear(e, e.x + vx * 1.75, e.z + vz * 1.75, 0.10);
    if (clearNear && clearFar) {
      return { x: vx, z: vz, moving: true };
    }

    const baseAng = Math.atan2(vx, vz);
    const pref = e.steerSide || 1;
    const offsets = [0.42, -0.42, 0.84, -0.84, 1.26, -1.26, 1.68, -1.68, 2.16, -2.16]
      .map((a) => a * pref);
    for (const off of offsets) {
      const candAng = baseAng + off;
      const cx = Math.sin(candAng);
      const cz = Math.cos(candAng);
      if (this.isEnemyStepClear(e, e.x + cx * 0.95, e.z + cz * 0.95, 0.10) &&
          this.isEnemyStepClear(e, e.x + cx * 1.60, e.z + cz * 1.60, 0.06)) {
        if (e.steerTimer <= 0) {
          e.steerSide = off >= 0 ? 1 : -1;
          e.steerTimer = 0.65;
        }
        return { x: cx, z: cz, moving: true };
      }
    }
    return { x: vx, z: vz, moving: true };
  }

  updateEnemies(dt) {
    if (this.isCoopClient && this.isCoopClient()) {
      this.coopInterpolateEnemies(dt);
      return;
    }
    const h = this.hero;
    const sc = this.getActiveScaling ? this.getActiveScaling() : { dmgMult: 1.0, enemyAtkRateMult: 1.0, difficultyId: 'standard' };
    const atkTempo = Math.max(0.7, sc.enemyAtkRateMult || 1.0);
    for (const e of [...this.enemies]) {
      if (!e || e.hp <= 0 || !this.enemies.includes(e)) continue;
      const tgt = this.pickEnemyTarget(e);

      e.trapImmunityTimer = Math.max(0, e.trapImmunityTimer - dt);

      if (e.flashTimer > 0) {
        e.flashTimer -= dt;
        const flashHex = e.flashTimer > 0 ? 0x665040 : 0x000000;
        for (const fm of e.rig.flashMats) fm.emissive.setHex(flashHex);
      }

      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.burnTick = (e.burnTick || 0) + dt;
        if (e.burnTick >= 0.5) {
          e.burnTick -= 0.5;
          this.vfx.burst(e.x, 1.1, e.z, 0xff6a1a, 5, 2.4, 3.0);
          this.damageEnemy(e, Math.max(1, Math.round(e.burnDps * 0.5)), e.x, e.z, {
            allowCrit: false,
            fxColor: 0xff6a1a,
            isDot: true
          });
          if (e.hp <= 0) continue;
        }
      }
      if (e.bleedTimer > 0) {
        e.bleedTimer -= dt;
        e.bleedTick = (e.bleedTick || 0) + dt;
        if (e.bleedTick >= 0.45) {
          e.bleedTick -= 0.45;
          this.vfx.burst(e.x, 1.05, e.z, 0xff2952, 5, 2.6, 4.0);
          this.damageEnemy(e, Math.max(1, Math.round((e.bleedDps || 14) * 0.45)), e.x, e.z, {
            allowCrit: false,
            fxColor: 0xff2952,
            isDot: true
          });
          if (e.hp <= 0) continue;
        }
      }
      if (e.blightTimer > 0) {
        e.blightTimer -= dt;
        e.blightTick = (e.blightTick || 0) + dt;
        if (e.blightTick >= 0.5) {
          e.blightTick -= 0.5;
          this.vfx.burst(e.x, 1.0, e.z, 0x76ff4d, 4, 2.2, 2.5);
          this.damageEnemy(e, Math.max(1, Math.round((e.blightDps || 14) * 0.5)), e.x, e.z, {
            allowCrit: false,
            fxColor: 0x76ff4d,
            isDot: true
          });
          if (e.hp <= 0) continue;
        }
      }

      const chillMult = e.chillTimer > 0 ? 0.56 : (e.blightTimer > 0 ? 0.78 : 1.0);
      e.chillTimer = Math.max(0, e.chillTimer - dt);

      if (e.shieldMesh && e.shield > 0) {
        e.shieldMesh.rotation.y += dt * 1.6;
        e.shieldMesh.material.opacity = 0.18 + 0.08 * Math.sin(this.time * 5.2);
      }
      if (e.affixRing) {
        e.affixRing.rotation.z += dt * 1.4;
      }

      if (e.affixes.includes('stormcaller')) {
        e.stormTimer -= dt;
        if (e.stormTimer <= 0 && e.stunTimer <= 0) {
          e.stormTimer = (e.boss ? 3.6 : 4.6) / Math.sqrt(atkTempo);
          const sx = tgt.x + (Math.random() - 0.5) * 1.0;
          const sz = tgt.z + (Math.random() - 0.5) * 1.0;
          const hzDmg = Math.round(25 * this.floorCfg.dmgMult * (sc.dmgMult || 1.0));
          this.vfx.spawnRing(sx, sz, 1.95, 0.85, 0xb975ff, true);
          this.delayedHazards.push({
            friendly: false,
            timer: 0.85,
            x: sx,
            z: sz,
            radius: 1.85,
            dmg: hzDmg,
            colorHex: 0xb975ff,
            lightningSky: true,
            mesh: null
          });
          if (this.isCoopHost && this.isCoopHost()) {
            this.coopBroadcastEnemyAttack({
              sub: 'hazard',
              timer: 0.85,
              x: +sx.toFixed(2),
              z: +sz.toFixed(2),
              radius: 1.85,
              dmg: hzDmg,
              colorHex: 0xb975ff,
              lightningSky: true
            });
          }
        }
      }

      const prevEX = e.x;
      const prevEZ = e.z;
      e.x += e.vx * dt;
      e.z += e.vz * dt;
      const edamp = Math.exp(-9.0 * dt);
      e.vx *= edamp;
      e.vz *= edamp;

      for (const other of this.enemies) {
        if (other === e || other.hp <= 0) continue;
        let sdx = e.x - other.x;
        let sdz = e.z - other.z;
        let sd = Math.hypot(sdx, sdz);
        if (sd < 0.001) {
          sdx = Math.cos(e.aiSeed || 0.5);
          sdz = Math.sin(e.aiSeed || 0.5);
          sd = 0.001;
        }
        const minSep = e.radius + other.radius + 0.36;
        if (sd < minSep) {
          const push = (minSep - sd) * 8.5 * dt;
          e.x += (sdx / sd) * push;
          e.z += (sdz / sd) * push;
        }
      }
      if (e.state !== 'leap') {
        this.dungeon.resolveMovement(e, prevEX, prevEZ, e.radius);
      }

      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        e.state = 'chase';
        e.rig.body.position.y = 0;
        e.rig.body.rotation.z = Math.sin(this.time * 20.0) * 0.06;
        e.rig.arm.rotation.x = 0.25;
        e.rig.root.position.set(e.x, 0, e.z);
        continue;
      }
      e.rig.body.rotation.z = 0;

      const dx = tgt.x - e.x;
      const dz = tgt.z - e.z;
      const distToHero = Math.hypot(dx, dz) || 0.001;
      const yawToHero = Math.atan2(dx, dz);

      if (e.state === 'chase') {
        e.cooldown -= dt * chillMult;
        const stepPrevX = e.x;
        const stepPrevZ = e.z;
        const effSpd = e.speed * chillMult;
        const moveVec = this.computeEnemyMoveVector(e, tgt, dx, dz, distToHero, dt);
        const moving = moveVec.moving;
        if (moving) {
          e.x += moveVec.x * effSpd * dt;
          e.z += moveVec.z * effSpd * dt;
        }

        this.dungeon.resolveMovement(e, stepPrevX, stepPrevZ, e.radius);
        e.yaw = yawToHero;

        const stride = moving ? Math.sin(this.time * effSpd * 2.6 + e.maxHp) * 0.45 : 0;
        if (e.rig.leftLeg) e.rig.leftLeg.rotation.x = stride;
        if (e.rig.rightLeg) e.rig.rightLeg.rotation.x = -stride;
        e.rig.arm.rotation.x += (0.08 - e.rig.arm.rotation.x) * Math.min(1, dt * 8.0);

        const triggerRange = e.boss ? 12.5 : (e.range + (e.type === 'stalker' ? 1.15 : 0.32));
        const acolyteBlocked = e.type === 'acolyte' && distToHero > 3.2 &&
          (this.dungeon?.isSegmentBlockedByCover?.(e.x, e.z, tgt.x, tgt.z, 0.08) || false);
        if (e.cooldown <= 0 && distToHero <= triggerRange && !acolyteBlocked) {
          if (e.boss) {
            e.bossCycle++;
            if (e.bossCycle % 2 === 0 || distToHero > 3.8) {
              e.state = 'leap';
              e.stateTimer = 0;
              e.leapStartX = e.x;
              e.leapStartZ = e.z;
              e.leapDur = +(0.64 / Math.sqrt(atkTempo)).toFixed(3);
              const rm = e.room || this.currentRoom;
              e.leapTargetX = rm ? Math.max(rm.cx - rm.halfW + 2.0, Math.min(rm.cx + rm.halfW - 2.0, tgt.x)) : tgt.x;
              e.leapTargetZ = rm ? Math.max(rm.cz - rm.halfD + 2.0, Math.min(rm.cz + rm.halfD - 2.0, tgt.z)) : tgt.z;
              this.vfx.spawnRing(e.leapTargetX, e.leapTargetZ, 3.45, e.leapDur, 0xff4d1f, true);
              this.sfx.bossRoar(false, { x: e.x, z: e.z });
            } else {
              e.state = 'windup';
              e.stateTimer = 0;
              e.windupDur = +(0.45 / Math.sqrt(atkTempo)).toFixed(3);
              e.strikeHitDone = false;
              this.vfx.spawnRing(e.x, e.z, 3.45, e.windupDur, 0xff6622, false);
            }
          } else {
            e.state = 'windup';
            e.stateTimer = 0;
            e.strikeHitDone = false;
            if (e.type === 'juggernaut') {
              e.windupDur = 0.50 / chillMult;
              this.vfx.spawnRing(e.x, e.z, 2.65, e.windupDur, 0xff4422, true);
            } else if (e.type === 'acolyte') {
              e.windupDur = 0.26 / chillMult;
            } else if (e.type === 'stalker') {
              e.windupDur = 0.28 / chillMult;
            } else {
              e.windupDur = 0.31 / chillMult;
            }
          }
        }
      } else if (e.state === 'windup') {
        e.stateTimer += dt;
        if (e.stateTimer < e.windupDur * 0.72) {
          if (e.type === 'acolyte' && (this.floorCfg.depth >= 2 || sc.difficultyId === 'bloodfire' || sc.difficultyId === 'abyssal')) {
            const leadT = Math.min(0.32, distToHero / 36.0);
            const lx = (tgt.x + (tgt.vx || 0) * leadT) - e.x;
            const lz = (tgt.z + (tgt.vz || 0) * leadT) - e.z;
            e.yaw = Math.atan2(lx, lz);
          } else {
            e.yaw = yawToHero;
          }
        }
        const wp = Math.min(1, e.stateTimer / Math.max(0.1, e.windupDur));
        e.rig.arm.rotation.x = -1.25 * wp;
        if (e.stateTimer >= e.windupDur) {
          e.state = 'strike';
          e.stateTimer = 0;
          e.strikeHitDone = false;
          if (e.type === 'stalker') {
            e.vx = Math.sin(e.yaw) * 16.5;
            e.vz = Math.cos(e.yaw) * 16.5;
            this.vfx.burst(e.x, 0.95, e.z, 0x55ffaa, 12, 4.2, 2.5);
          } else if (e.type !== 'acolyte') {
            e.vx = Math.sin(e.yaw) * 6.0;
            e.vz = Math.cos(e.yaw) * 6.0;
          }
        }
      } else if (e.state === 'strike') {
        e.stateTimer += dt;
        e.rig.arm.rotation.x = 0.95;
        const strikeFireTime = e.type === 'acolyte' ? 0.025 : 0.05;
        if (!e.strikeHitDone && e.stateTimer >= strikeFireTime) {
          e.strikeHitDone = true;
          if (e.type === 'acolyte') {
            this.sfx.enemyAttack('acolyte', { x: e.x, z: e.z });
            const depth = this.floorCfg.depth;
            const count = depth >= 4 ? 4 : ((depth >= 2 || sc.difficultyId === 'abyssal') ? 3 : 2);
            const spread = 0.19;
            const orbSpd = (10.6 + this.floorIndex * 1.15 + Math.max(0, atkTempo - 1.0) * 4.5) * 0.70;
            for (let k = 0; k < count; k++) {
              const ang = e.yaw + (k - (count - 1) * 0.5) * spread;
              this.spawnEnemyProjectile(e.x + Math.sin(ang) * 0.7, e.z + Math.cos(ang) * 0.7, ang, e.dmg, 0xff3322, orbSpd);
            }
            this.vfx.burst(e.x, 1.25, e.z, 0xff3322, 12, 3.8, 3.0);
          } else if (e.type === 'juggernaut') {
            this.sfx.enemyAttack('juggernaut', { x: e.x, z: e.z });
            this.cameraShake = Math.max(this.cameraShake, 0.24);
            this.vfx.burst(e.x, 0.6, e.z, 0xff4422, 26, 6.2, 9.0);
            this.vfx.spawnRing(e.x, e.z, 2.65, 0.34, 0xff4422, false);
            if (Math.hypot(h.x - e.x, h.z - e.z) <= 2.65) {
              this.damageHero(e.dmg, e.x, e.z);
            }
            if (this.isCoopHost && this.isCoopHost()) {
              this.coopBroadcastEnemyAttack({ sub: 'melee_aoe', x: +e.x.toFixed(2), z: +e.z.toFixed(2), radius: 2.65, dmg: e.dmg, colorHex: 0xff4422, vfxRing: true });
            }
            if (this.floorCfg.depth >= 3) {
              const mx = e.x + Math.sin(e.yaw) * 3.1;
              const mz = e.z + Math.cos(e.yaw) * 3.1;
              const slamDmg = Math.round(e.dmg * 0.85);
              this.vfx.spawnRing(mx, mz, 2.0, 0.55, 0xff6a1a, true);
              this.delayedHazards.push({
                friendly: false,
                timer: 0.55,
                x: mx,
                z: mz,
                radius: 1.95,
                dmg: slamDmg,
                colorHex: 0xff6a1a,
                mesh: null
              });
              if (this.isCoopHost && this.isCoopHost()) {
                this.coopBroadcastEnemyAttack({
                  sub: 'hazard',
                  timer: 0.55,
                  x: +mx.toFixed(2),
                  z: +mz.toFixed(2),
                  radius: 1.95,
                  dmg: slamDmg,
                  colorHex: 0xff6a1a
                });
              }
            }
          } else if (e.boss) {
            this.sfx.bossSlam(false, { x: e.x, z: e.z });
            this.cameraShake = Math.max(this.cameraShake, 0.28);
            this.vfx.burst(e.x + Math.sin(e.yaw) * 1.4, 0.9, e.z + Math.cos(e.yaw) * 1.4, 0xff6622, 30, 6.8, 8.5);
            this.vfx.spawnRing(e.x, e.z, 3.45, 0.36, 0xff6622, false);
            if (Math.hypot(h.x - e.x, h.z - e.z) <= 3.45) {
              this.damageHero(e.dmg, e.x, e.z);
            }
            if (this.isCoopHost && this.isCoopHost()) {
              this.coopBroadcastEnemyAttack({ sub: 'melee_aoe', x: +e.x.toFixed(2), z: +e.z.toFixed(2), radius: 3.45, dmg: e.dmg, colorHex: 0xff6622, vfxRing: true });
            }
            if (this.floorCfg.depth >= 2 || e.hp < e.maxHp * 0.75 || sc.difficultyId === 'bloodfire' || sc.difficultyId === 'abyssal') {
              const fanCount = 4 + this.floorIndex + (e.bossEnraged ? 2 : 0);
              for (let f = 0; f < fanCount; f++) {
                const ang = e.yaw + (f - (fanCount - 1) * 0.5) * 0.22;
                this.spawnEnemyProjectile(e.x + Math.sin(ang) * 1.0, e.z + Math.cos(ang) * 1.0, ang, Math.round(e.dmg * 0.80), 0xff5522, (11.8 + this.floorIndex * 1.1) * 0.70);
              }
            }
          } else {
            this.sfx.enemyAttack(e.type, { x: e.x, z: e.z });
            const hitReach = e.type === 'stalker' ? 2.15 : 2.05;
            if (Math.hypot(h.x - e.x, h.z - e.z) <= hitReach) {
              this.damageHero(e.dmg, e.x, e.z);
            }
            if (this.isCoopHost && this.isCoopHost()) {
              this.coopBroadcastEnemyAttack({ sub: 'melee_aoe', x: +e.x.toFixed(2), z: +e.z.toFixed(2), radius: hitReach, dmg: e.dmg, colorHex: 0xff3344, vfxRing: false });
            }
          }
        }
        const strikeRecoverTime = e.type === 'acolyte' ? 0.13 : 0.26;
        if (e.stateTimer >= strikeRecoverTime) {
          e.state = 'chase';
          e.cooldown = e.baseCd * (0.88 + Math.random() * 0.24);
        }
      } else if (e.state === 'leap') {
        e.stateTimer += dt;
        const dur = e.leapDur || 0.64;
        const k = Math.min(1, e.stateTimer / dur);
        e.x = e.leapStartX + (e.leapTargetX - e.leapStartX) * k;
        e.z = e.leapStartZ + (e.leapTargetZ - e.leapStartZ) * k;
        e.rig.body.position.y = Math.sin(k * Math.PI) * 4.6;
        e.rig.arm.rotation.x = -1.35 + k * 2.2;
        if (k >= 1) {
          e.rig.body.position.y = 0;
          this.dungeon.resolveMovement(e, e.leapStartX, e.leapStartZ, e.radius);
          this.sfx.bossSlam(true, { x: e.x, z: e.z });
          this.cameraShake = Math.max(this.cameraShake, 0.42);
          this.vfx.burst(e.x, 0.8, e.z, 0xff5522, 44, 7.8, 9.5);
          this.vfx.spawnRing(e.x, e.z, 3.45, 0.42, 0xff5522, false);
          this.vfx.flash(e.x, 1.5, e.z, 0xff6622, 22);
          this.dungeon.addFloorDecal(e.x, e.z, 0x1e0706, 3.2, 0.65);
          if (Math.hypot(h.x - e.x, h.z - e.z) <= 3.4) {
            this.damageHero(Math.round(e.dmg * 1.15), e.x, e.z);
          }
          if (this.isCoopHost && this.isCoopHost()) {
            this.coopBroadcastEnemyAttack({
              sub: 'melee_aoe',
              x: +e.x.toFixed(2),
              z: +e.z.toFixed(2),
              radius: 3.4,
              dmg: Math.round(e.dmg * 1.15),
              colorHex: 0xff5522,
              vfxRing: true
            });
          }
          const novaCount = 9 + this.floorIndex * 2 + (e.bossEnraged ? 2 : 0);
          for (let n = 0; n < novaCount; n++) {
            const ang = (n / novaCount) * Math.PI * 2 + (this.bossCycle || 0) * 0.25;
            this.spawnEnemyProjectile(e.x + Math.sin(ang) * 0.9, e.z + Math.cos(ang) * 0.9, ang, Math.round(e.dmg * 0.80), 0xff5522, (11.0 + this.floorIndex * 1.0) * 0.70);
          }
          e.state = 'chase';
          e.cooldown = e.baseCd * 0.96;
        }
      }

      e.rig.root.position.set(e.x, 0, e.z);
      e.rig.root.rotation.y = e.yaw;
    }
  }

  updateSimulation(dt) {
    const h = this.hero;
    this.runTime += dt;

    h.invuln = Math.max(0, h.invuln - dt);
    h.vampCritIcd = Math.max(0, (h.vampCritIcd || 0) - dt);
    h.energyCritIcd = Math.max(0, (h.energyCritIcd || 0) - dt);
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.arcCd = Math.max(0, h.arcCd - dt);
    h.comboWindow = Math.max(0, h.comboWindow - dt);
    h.rangedCooldown = Math.max(0, h.rangedCooldown - dt);
    h.rangedAnimTimer = Math.max(0, h.rangedAnimTimer - dt);
    if (this.prismHeatDecay > 0) {
      this.prismHeatDecay -= dt;
    } else if (this.prismHeat > 0) {
      this.prismHeat = Math.max(0, this.prismHeat - dt * 0.65);
    }

    const cdArcEl = document.getElementById('cd-arc');
    if (cdArcEl) {
      cdArcEl.style.height = `${Math.max(0, Math.min(100, (h.arcCd / Math.max(0.1, h.arcCdMax)) * 100))}%`;
    }
    const cdArcNumEl = document.getElementById('cd-arc-num');
    if (cdArcNumEl) {
      if (h.arcCd > 0.05) {
        cdArcNumEl.textContent = h.arcCd.toFixed(1);
        cdArcNumEl.classList.remove('hidden');
      } else {
        cdArcNumEl.classList.add('hidden');
      }
    }
    const cdDashEl = document.getElementById('cd-dash');
    const dashMax = Math.max(0.42, 0.92 * h.dashCdMult);
    if (cdDashEl) {
      cdDashEl.style.height = `${Math.max(0, Math.min(100, (h.dashCd / dashMax) * 100))}%`;
    }
    const cdDashNumEl = document.getElementById('cd-dash-num');
    if (cdDashNumEl) {
      if (h.dashCd > 0.05) {
        cdDashNumEl.textContent = h.dashCd.toFixed(1);
        cdDashNumEl.classList.remove('hidden');
      } else {
        cdDashNumEl.classList.add('hidden');
      }
    }

    this.updateAimRay();
    const prevLocked = this.lockedEnemy;
    const curLocked = this.updateRangedLockTarget();
    if (prevLocked !== curLocked) {
      this.updateHUD();
    }

    this.flushInputBuffer();
    const canControl = this.mode === 'explore';
    if (canControl && !h.downed && (this.mouseDownL || this.keys['KeyJ'])) {
      this.tryAttack();
    }

    const prevX = h.x;
    const prevZ = h.z;
    const wpn = this.activeWeapon();
    const wpnMove = wpn ? (wpn.moveBonus || wpn.def.moveBonus || 1.0) : 1.0;
    let moveInputLen = 0;

    if (h.dashTimer > 0 && !h.downed) {
      h.dashTimer -= dt;
      const dashSpd = 18.6;
      h.x += h.dashDirX * dashSpd * dt;
      h.z += h.dashDirZ * dashSpd * dt;
      if (Math.random() < 0.65) {
        this.vfx.burst(h.x, 0.85, h.z, 0xb47cff, 2, 1.8, 1.5);
      }
      if (h.dashTimer <= 0.04) {
        this.flushInputBuffer();
      }
    } else {
      let ix = canControl ? ((this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0)) : 0;
      let iz = canControl ? ((this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) - (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0)) : 0;
      moveInputLen = Math.hypot(ix, iz);
      const atkSlow = h.downed ? 0.28 : (h.atkState ? (h.atkState.moveSlow ?? 0.76) : (h.rangedAnimTimer > 0 ? 0.86 : 1.0));
      if (moveInputLen > 0) {
        ix /= moveInputLen;
        iz /= moveInputLen;
        const clsMove = getClassBonusMoveMult(h);
        h.x += ix * h.moveSpeed * wpnMove * clsMove * atkSlow * dt;
        h.z += iz * h.moveSpeed * wpnMove * clsMove * atkSlow * dt;
        if (!h.atkState && h.rangedAnimTimer <= 0) {
          if (wpn && wpn.def.category === 'ranged' && this.lockedEnemy) {
            const targetYaw = Math.atan2(this.lockedEnemy.x - h.x, this.lockedEnemy.z - h.z);
            const diff = Math.atan2(Math.sin(targetYaw - h.yaw), Math.cos(targetYaw - h.yaw));
            h.yaw += diff * Math.min(1, dt * 14.0);
          } else {
            const moveYaw = Math.atan2(ix, iz);
            const diff = Math.atan2(Math.sin(moveYaw - h.yaw), Math.cos(moveYaw - h.yaw));
            h.yaw += diff * Math.min(1, dt * 14.0);
          }
        }
      } else if (!h.atkState && h.rangedAnimTimer <= 0 && wpn && wpn.def.category === 'ranged') {
        const aimX = this.lockedEnemy ? this.lockedEnemy.x : this.aimWorld.x;
        const aimZ = this.lockedEnemy ? this.lockedEnemy.z : this.aimWorld.z;
        if ((aimX - h.x) ** 2 + (aimZ - h.z) ** 2 > 0.04) {
          const targetYaw = Math.atan2(aimX - h.x, aimZ - h.z);
          const diff = Math.atan2(Math.sin(targetYaw - h.yaw), Math.cos(targetYaw - h.yaw));
          h.yaw += diff * Math.min(1, dt * 12.0);
        }
      }

      h.x += h.vx * dt;
      h.z += h.vz * dt;
      const kdamp = Math.exp(-10.5 * dt);
      h.vx *= kdamp;
      h.vz *= kdamp;
    }

    if (this.dungeon) {
      this.dungeon.resolveMovement(h, prevX, prevZ, 0.44);
      const rm = this.dungeon.findRoomAt(h.x, h.z);
      if (rm && (rm !== this.currentRoom || !rm.visited || (!rm.cleared && rm.spawns.length > 0 && !rm.locked))) {
        this.enterRoom(rm);
      }
    }

    this.heroActualSpeed = Math.hypot(h.x - prevX, h.z - prevZ) / Math.max(0.0005, dt);

    // Animate hero legs, torso, arms & melee cleave hitbox
    const walkPhase = this.time * 11.5;
    const legAmp = moveInputLen > 0 ? 0.52 : 0.0;
    if (h.downed) {
      this.heroRig.body.position.y = -0.36;
      this.heroRig.torso.rotation.x = 0.58;
      this.heroRig.leftLeg.rotation.x = -0.45;
      this.heroRig.rightLeg.rotation.x = 0.25;
    } else {
      this.heroRig.torso.rotation.x += (0 - this.heroRig.torso.rotation.x) * Math.min(1, dt * 12);
      this.heroRig.leftLeg.rotation.x += (Math.sin(walkPhase) * legAmp - this.heroRig.leftLeg.rotation.x) * Math.min(1, dt * 14);
      this.heroRig.rightLeg.rotation.x += (-Math.sin(walkPhase) * legAmp - this.heroRig.rightLeg.rotation.x) * Math.min(1, dt * 14);
      this.heroRig.body.position.y = moveInputLen > 0 ? Math.abs(Math.sin(walkPhase)) * 0.055 : 0;
    }

    this.heroRig.root.position.set(h.x, 0, h.z);
    this.heroRig.root.rotation.y = h.yaw;
    this.sfx.setListener(h.x, h.z);
    if (moveInputLen > 0 && !h.downed && h.dashTimer <= 0 && this.heroActualSpeed > 1.5) {
      this.sfx.footstep(this.dungeon?.biome?.id, { x: h.x, z: h.z });
    }

    if (h.atkState) {
      const st = h.atkState;
      const spec = st.stepSpec || { shape: 'sector', arcHalf: st.isFinisher ? Math.PI : 1.5, reachMult: 1.0, dmgMult: 1.0, anim: st.isFinisher ? 'spin' : 'cleaveR' };
      st.timer += dt;
      const p = Math.min(1, st.timer / st.duration);
      const ease = 1 - Math.pow(1 - p, 2.5);
      const anim = spec.anim || (st.isFinisher ? 'spin' : (st.step % 2 === 0 ? 'cleaveR' : 'cleaveL'));

      if (anim === 'spin') {
        this.heroRig.torso.rotation.y = ease * Math.PI * 2;
        this.heroRig.rightShoulder.rotation.set(0.15, -1.35 + ease * 2.7, 0.25);
        this.heroRig.leftShoulder.rotation.set(0.25, 1.1 - ease * 2.2, 0.2);
      } else if (anim === 'thrust') {
        const thrustCurve = Math.sin(Math.min(1, p * 1.25) * Math.PI);
        this.heroRig.torso.rotation.x = 0.22 * thrustCurve;
        this.heroRig.torso.rotation.y = -0.26 + ease * 0.44;
        this.heroRig.rightShoulder.rotation.set(-0.98 + (1 - thrustCurve) * 0.55, 0.05, 0.06);
        if (st.weaponInst.id === 'twinblades') {
          this.heroRig.leftShoulder.rotation.set(-0.94 + (1 - thrustCurve) * 0.52, -0.05, -0.06);
        } else {
          this.heroRig.leftShoulder.rotation.set(0.32, 0.42, 0.22);
        }
      } else if (anim === 'overheadSlam') {
        if (p < 0.38) {
          const wu = p / 0.38;
          this.heroRig.torso.rotation.x = -0.28 * wu;
          this.heroRig.torso.rotation.y = -0.18 * wu;
          this.heroRig.rightShoulder.rotation.set(-2.15 * wu, -0.12, 0.10);
          this.heroRig.leftShoulder.rotation.set(-1.75 * wu, 0.22, -0.10);
        } else {
          const sm = Math.min(1, (p - 0.38) / 0.34);
          const smEase = 1 - Math.pow(1 - sm, 3.0);
          this.heroRig.torso.rotation.x = -0.28 + 0.62 * smEase;
          this.heroRig.torso.rotation.y = -0.18 + 0.24 * smEase;
          this.heroRig.rightShoulder.rotation.set(-2.15 + 2.05 * smEase, -0.06, 0.08);
          this.heroRig.leftShoulder.rotation.set(-1.75 + 1.85 * smEase, 0.18, -0.08);
        }
      } else if (anim === 'crossX') {
        const crossWave = p < 0.5 ? (p / 0.5) : ((p - 0.5) / 0.5);
        const dir = p < 0.5 ? 1 : -1;
        this.heroRig.torso.rotation.y = -0.36 * dir + crossWave * 0.72 * dir;
        this.heroRig.rightShoulder.rotation.set(0.14, (-1.25 + crossWave * 2.5) * dir, 0.16);
        this.heroRig.leftShoulder.rotation.set(0.14, (1.25 - crossWave * 2.5) * dir, -0.16);
      } else if (anim === 'iaidoDraw' || anim === 'whipSweep') {
        this.heroRig.torso.rotation.y = -0.88 + ease * 1.82;
        this.heroRig.rightShoulder.rotation.set(0.08, -1.72 + ease * 3.32, 0.14);
        this.heroRig.leftShoulder.rotation.set(0.32, 0.45, 0.18);
      } else if (anim === 'whipCrackR' || anim === 'whipCrackL') {
        const side = anim === 'whipCrackR' ? 1 : -1;
        const snap = Math.sin(Math.min(1, p * 1.35) * Math.PI);
        this.heroRig.torso.rotation.y = (-0.34 + ease * 0.68) * side;
        this.heroRig.rightShoulder.rotation.set(-0.78 * snap + 0.12, (-0.85 + ease * 1.55) * side, 0.14 * side);
        this.heroRig.leftShoulder.rotation.set(0.30, 0.35, 0.18);
      } else if (st.step % 2 === 0) {
        const sweepScale = (anim === 'scytheR') ? 1.24 : (anim === 'slashR' ? 0.78 : 1.0);
        this.heroRig.torso.rotation.y = (-0.55 + ease * 1.15) * sweepScale;
        this.heroRig.rightShoulder.rotation.set(0.12, (-1.45 + ease * 2.65) * sweepScale, 0.18);
        this.heroRig.leftShoulder.rotation.set(0.35, 0.3, 0.18);
      } else {
        const sweepScale = (anim === 'scytheL') ? 1.24 : (anim === 'slashL' ? 0.78 : 1.0);
        this.heroRig.torso.rotation.y = (0.55 - ease * 1.15) * sweepScale;
        this.heroRig.rightShoulder.rotation.set(0.18, (1.25 - ease * 2.55) * sweepScale, -0.18);
        if (st.weaponInst.id === 'twinblades') {
          this.heroRig.leftShoulder.rotation.set(0.15, (1.35 - ease * 2.6) * sweepScale, -0.15);
        }
      }

      if (spec.multiStrikeAt && !st.secondStrikeFired && p >= spec.multiStrikeAt) {
        st.secondStrikeFired = true;
        st.hitSet.clear();
        const reach2 = (st.weaponInst.range || st.weaponInst.def.range) * h.reachMult * (spec.reachMult || 1.0);
        this.vfx.spawnSlashArc(h.x, h.z, h.yaw, reach2, spec.arcHalf || 1.12, 0.18, st.weaponInst.def.accentHex, -0.18);
        this.sfx.meleeSwing(st.weaponInst.id, (st.step + 1) % 3, st.isFinisher);
      }

      this.heroRig.root.updateMatrixWorld(true);
      if (this.mountedWeaponVis) {
        const bPos = new THREE.Vector3();
        const tPos = new THREE.Vector3();
        this.mountedWeaponVis.baseNode.getWorldPosition(bPos);
        this.mountedWeaponVis.tipNode.getWorldPosition(tPos);
        this.vfx.pushBladeSample(bPos, tPos, st.weaponInst.def.accentHex, p >= 0.10 && p <= 0.88);
      }

      const hitStart = spec.shape === 'crater' ? 0.36 : 0.14;
      const hitEnd = spec.shape === 'crater' ? 0.78 : 0.84;
      if (p >= hitStart && p <= hitEnd) {
        const wid = st.weaponInst.id;
        const wColor = st.weaponInst.def.accentHex;
        const reachBase = (st.weaponInst.range || st.weaponInst.def.range) * h.reachMult * (spec.reachMult || 1.0);
        const fwdX = Math.sin(h.yaw);
        const fwdZ = Math.cos(h.yaw);
        const lineEndX = h.x + fwdX * reachBase;
        const lineEndZ = h.z + fwdZ * reachBase;
        const halfWidth = (spec.halfWidth || 0.78) * Math.max(1, h.reachMult * 0.95);
        const craterX = h.x + fwdX * ((spec.impactOffset || 2.5) * h.reachMult);
        const craterZ = h.z + fwdZ * ((spec.impactOffset || 2.5) * h.reachMult);
        const craterRad = (spec.craterRadius || 2.75) * h.reachMult;
        const arcHalf = spec.arcHalf || (st.isFinisher ? Math.PI : 1.48);

        if (spec.shape === 'crater' && !st.craterFired) {
          st.craterFired = true;
          this.sfx.meleeFinisherWave(wid, { x: craterX, z: craterZ });
          this.vfx.spawnRing(craterX, craterZ, craterRad, 0.42, wColor, true);
          this.vfx.spawnRing(craterX, craterZ, craterRad * 1.12, 0.36, wColor, false);
          this.vfx.burst(craterX, 0.9, craterZ, wColor, 26, 6.6, 8.5);
          this.vfx.flash(craterX, 1.25, craterZ, wColor, 16);
          this.cameraShake = Math.max(this.cameraShake, 0.30);
          if (wid === 'mjolnir') {
            this.delayedHazards.push({
              friendly: true,
              timer: 0.10,
              x: craterX,
              z: craterZ,
              radius: 2.35,
              dmg: st.weaponInst.dmg * this.effectiveDmgMult(st.weaponInst) * 0.55,
              colorHex: 0x62d8ff,
              lightningSky: true,
              weaponInst: st.weaponInst,
              stagger: 0.55,
              mesh: null
            });
          }
          this.coopBroadcastPlayerAction?.({
            act: 'ring_burst_vfx',
            x: +craterX.toFixed(2),
            z: +craterZ.toFixed(2),
            radius: +craterRad.toFixed(2),
            dur: 0.40,
            fill: true,
            colorHex: wColor,
            burstCount: 22
          });
        }

        const matchesHitShape = (tx, tz, tRadius) => {
          const ddx = tx - h.x;
          const ddz = tz - h.z;
          const dist = Math.hypot(ddx, ddz);
          if (dist > 4.2 && this.dungeon?.isSegmentBlockedByCover?.(h.x, h.z, tx, tz, 0.08)) {
            return { hit: false, dist };
          }
          if (spec.shape === 'line') {
            const fwdProj = ddx * fwdX + ddz * fwdZ;
            if (fwdProj < -0.38 || fwdProj > reachBase + tRadius) return { hit: false, dist };
            const segD = this.pointToSegmentDist(tx, tz, h.x, h.z, lineEndX, lineEndZ);
            return { hit: segD <= halfWidth + tRadius, dist };
          }
          if (spec.shape === 'crater') {
            const cDist = Math.hypot(tx - craterX, tz - craterZ);
            return { hit: cDist <= craterRad + tRadius || dist <= 1.65 + tRadius, dist };
          }
          if (dist > reachBase + tRadius) return { hit: false, dist };
          const ang = Math.atan2(ddx, ddz);
          const diff = Math.abs(Math.atan2(Math.sin(ang - h.yaw), Math.cos(ang - h.yaw)));
          return { hit: diff <= arcHalf, dist };
        };

        for (const d of this.dungeon.destructibles) {
          if (d.broken) continue;
          if (matchesHitShape(d.x, d.z, d.r + 0.32).hit) this.breakProp(d);
        }

        for (const e of [...this.enemies]) {
          if (!e || e.hp <= 0 || st.hitSet.has(e)) continue;
          const check = matchesHitShape(e.x, e.z, e.radius);
          if (check.hit) {
            const dist = check.dist;
            st.hitSet.add(e);
            const sweetTip = wid === 'chainwhip' && dist >= reachBase * (spec.sweetSpotStart || 0.58);
            const tipMult = sweetTip ? 1.22 : 1.0;
            const mult = (spec.dmgMult || (st.isFinisher ? 1.48 : 1.0)) * tipMult;
            const raw = st.weaponInst.dmg * this.effectiveDmgMult(st.weaponInst) * mult;
            if (wid === 'bloodscythe' && !h.downed) {
              h.hp = Math.min(h.maxHp, h.hp + (st.isFinisher ? 4 : 2));
            }
            let kbOverride;
            if (spec.pullInward) {
              kbOverride = dist > 2.0 ? -3.8 : 1.2;
            } else if (spec.kbScale) {
              kbOverride = (st.weaponInst.knockback || 5.2) * spec.kbScale;
            }
            const srcImpactX = spec.shape === 'crater' ? craterX : h.x;
            const srcImpactZ = spec.shape === 'crater' ? craterZ : h.z;
            const scytheExecBoost = (wid === 'bloodscythe' && st.isFinisher && !e.boss)
              ? (e.isEliteMob ? 0.11 : 0.18)
              : undefined;
            this.damageEnemy(e, raw, srcImpactX, srcImpactZ, {
              weaponInst: st.weaponInst,
              forceCrit: sweetTip,
              inflictBleed: wid === 'chainwhip' || wid === 'bloodscythe',
              inflictBurn: wid === 'greatsword' && st.isFinisher,
              chillDuration: st.weaponInst.def.chillDuration || 0,
              knockbackOverride: kbOverride,
              executePct: scytheExecBoost,
              stagger: st.weaponInst.def.staggerBonus ? (st.isFinisher ? 1.05 : 0.48) : (st.isFinisher ? 0.38 : 0)
            });
            if (sweetTip) {
              this.vfx.spawnRing(e.x, e.z, 1.55, 0.24, 0xff4769, false);
              this.vfx.burst(e.x, 1.15, e.z, 0xff85a1, 14, 5.2, 7.0);
            }
            if (wid === 'eclipseblade' && e.hp > 0) {
              this.delayedHazards.push({
                friendly: true,
                timer: 0.26,
                x: e.x,
                z: e.z,
                radius: st.isFinisher ? 2.35 : 1.95,
                dmg: raw * 0.56,
                colorHex: 0xc76bff,
                weaponInst: st.weaponInst,
                stagger: 0.32,
                mesh: null
              });
            } else if (wid === 'mjolnir' && spec.shape !== 'crater' && st.hitSet.size === 1 && e.hp > 0) {
              this.delayedHazards.push({
                friendly: true,
                timer: 0.12,
                x: e.x,
                z: e.z,
                radius: 2.15,
                dmg: raw * 0.48,
                colorHex: 0x62d8ff,
                lightningSky: true,
                weaponInst: st.weaponInst,
                stagger: 0.45,
                mesh: null
              });
            }
          }
        }
      }

      if (st.isFinisher && !st.waveFired && p >= 0.46) {
        st.waveFired = true;
        const wColor = st.weaponInst.def.accentHex;
        if (spec.finisherCrescent) {
          this.sfx.meleeFinisherWave(st.weaponInst.id, { x: h.x, z: h.z });
          const waveDmg = st.weaponInst.dmg * this.effectiveDmgMult(st.weaponInst) * 0.62;
          this.spawnPlayerProjectile({
            kind: 'crescent',
            x: h.x + Math.sin(h.yaw) * 0.95,
            z: h.z + Math.cos(h.yaw) * 0.95,
            yaw: h.yaw,
            speed: 15.8,
            dmg: waveDmg,
            colorHex: wColor,
            radius: 0.82,
            life: 0.42,
            pierce: 4,
            inflictBurn: true,
            weaponInst: st.weaponInst
          });
        }
        if (h.finisherWave) {
          this.sfx.meleeFinisherWave(st.weaponInst.id, { x: h.x, z: h.z });
          const waveRad = 4.25;
          this.vfx.spawnRing(h.x, h.z, waveRad, 0.38, wColor, false);
          this.vfx.flash(h.x, 1.1, h.z, wColor, 14);
          this.cameraShake = Math.max(this.cameraShake, 0.24);
          const shockDmg = st.weaponInst.dmg * this.effectiveDmgMult(st.weaponInst) * 0.68;
          for (const e of [...this.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= waveRad + e.radius) {
              this.damageEnemy(e, shockDmg, h.x, h.z, {
                allowCrit: false,
                weaponInst: st.weaponInst,
                fxColor: wColor,
                stagger: 0.45
              });
            }
          }
        } else if (spec.shape !== 'crater') {
          this.sfx.meleeFinisherWave(st.weaponInst.id, { x: h.x, z: h.z });
          const finRingRad = (st.weaponInst.range || st.weaponInst.def.range) * 0.85;
          this.vfx.spawnRing(h.x, h.z, finRingRad, 0.32, wColor, false);
        }
      }

      if (p >= 1) {
        h.atkState = null;
        this.heroRig.torso.rotation.x = 0;
        this.heroRig.torso.rotation.y = 0;
        this.flushInputBuffer();
      }
    } else {
      this.heroRig.torso.rotation.y += (0 - this.heroRig.torso.rotation.y) * Math.min(1, dt * 12);
      if (wpn && wpn.def.category === 'ranged') {
        const recoil = h.rangedAnimTimer > 0 ? -0.32 * (h.rangedAnimTimer / 0.22) : 0;
        this.heroRig.rightShoulder.rotation.set(-0.38 + recoil, -0.08, 0.06);
        this.heroRig.leftShoulder.rotation.set(-0.22, 0.24, 0.12);
      } else {
        this.heroRig.rightShoulder.rotation.x += (0.15 - this.heroRig.rightShoulder.rotation.x) * Math.min(1, dt * 10);
        this.heroRig.rightShoulder.rotation.y += (-0.55 - this.heroRig.rightShoulder.rotation.y) * Math.min(1, dt * 10);
        this.heroRig.rightShoulder.rotation.z += (0.15 - this.heroRig.rightShoulder.rotation.z) * Math.min(1, dt * 10);
        this.heroRig.leftShoulder.rotation.x += (0.20 - this.heroRig.leftShoulder.rotation.x) * Math.min(1, dt * 10);
        this.heroRig.leftShoulder.rotation.y += (0.35 - this.heroRig.leftShoulder.rotation.y) * Math.min(1, dt * 10);
      }
      this.vfx.pushBladeSample(this.heroRig.root.position, this.heroRig.root.position, h.bladeColor, false);
    }

    // Spike traps (damage hero if not immune, and punish enemies lured onto active spikes!)
    if (this.dungeon) {
      const trapFxHex = this.dungeon.biome ? this.dungeon.biome.palette.trapGlowHex : 0xff6a1a;
      for (const tr of this.dungeon.allTraps) {
        if (!tr.activeHit) {
          tr._heroHitThisThrust = false;
          continue;
        }
        if (!tr._heroHitThisThrust && !isHeroTrapImmune(h) && h.invuln <= 0 && Math.abs(h.x - tr.x) < tr.half && Math.abs(h.z - tr.z) < tr.half) {
          tr._heroHitThisThrust = true;
          this.sfx.spikeThrust({ x: tr.x, z: tr.z });
          this.damageHero(Math.max(8, Math.round(h.maxHp * 0.12)), tr.x, tr.z, tUI().floatSpikeTrap);
        }
        for (const e of [...this.enemies]) {
          if (e.hp > 0 && !e.boss && e.trapImmunityTimer <= 0 && Math.abs(e.x - tr.x) < tr.half && Math.abs(e.z - tr.z) < tr.half) {
            e.trapImmunityTimer = 0.95;
            const trapPct = e.isEliteMob ? 0.06 : 0.08;
            this.damageEnemy(e, Math.max(20, Math.round(e.maxHp * trapPct)), tr.x, tr.z, {
              allowCrit: false,
              fxColor: trapFxHex
            });
          }
        }
      }
    }

    // Delayed hazards (Warhammer Thunder Slam waves, Volatile rifts, Stormcaller bolts)
    for (let i = this.delayedHazards.length - 1; i >= 0; i--) {
      const hz = this.delayedHazards[i];
      hz.timer -= dt;
      if (hz.timer <= 0) {
        this.delayedHazards.splice(i, 1);
        this.vfx.burst(hz.x, 0.85, hz.z, hz.colorHex, 26, 6.4, 9.0);
        this.vfx.spawnRing(hz.x, hz.z, hz.radius, 0.36, hz.colorHex, false);
        this.vfx.flash(hz.x, 1.4, hz.z, hz.colorHex, 15);
        if (hz.lightningSky) {
          const skyPts = [
            new THREE.Vector3(hz.x + (Math.random() - 0.5) * 0.8, 8.5, hz.z + (Math.random() - 0.5) * 0.8),
            new THREE.Vector3(hz.x + (Math.random() - 0.5) * 0.6, 4.4, hz.z + (Math.random() - 0.5) * 0.6),
            new THREE.Vector3(hz.x, 0.2, hz.z)
          ];
          const skyBolt = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(skyPts),
            new THREE.LineBasicMaterial({ color: hz.colorHex, transparent: true, opacity: 1.0 })
          );
          skyBolt.userData.ignoreAO = true;
          this.scene.add(skyBolt);
          this.lightningLines.push({ mesh: skyBolt, life: 0.22 });
        }
        if (hz.friendly) {
          this.sfx.hazardDetonate(!!hz.lightningSky, true, { x: hz.x, z: hz.z });
          if (hz.visualOnly) continue;
          for (const d of this.dungeon.destructibles) {
            if (!d.broken && Math.hypot(d.x - hz.x, d.z - hz.z) <= hz.radius + d.r) {
              this.breakProp(d);
            }
          }
          for (const e of [...this.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - hz.x, e.z - hz.z) <= hz.radius + e.radius) {
              this.damageEnemy(e, hz.dmg, hz.x, hz.z, {
                weaponInst: hz.weaponInst,
                fxColor: hz.colorHex,
                stagger: hz.stagger || 0.5
              });
            }
          }
        } else {
          this.sfx.hazardDetonate(!!hz.lightningSky, false, { x: hz.x, z: hz.z });
          if (Math.hypot(h.x - hz.x, h.z - hz.z) <= hz.radius + 0.32) {
            this.damageHero(hz.dmg, hz.x, hz.z);
          }
        }
      }
    }

    this.updateProjectiles(dt);
    this.updateSummonsAndOrbitals(dt);
    this.updateEnemies(dt);
    updateClassSystems(this, dt);

    // Soul Cinder orb physics & magnet pickup
    for (let i = this.cinderOrbs.length - 1; i >= 0; i--) {
      const c = this.cinderOrbs[i];
      c.age += dt;
      c.vy -= 12.0 * dt;
      const nx = c.x + c.vx * dt;
      c.y += c.vy * dt;
      const nz = c.z + c.vz * dt;
      if (this.dungeon && (Math.abs(c.vx) > 0.05 || Math.abs(c.vz) > 0.05) && !this.dungeon.isPointWalkable(nx, nz, 0.22)) {
        c.vx *= -0.4;
        c.vz *= -0.4;
      } else {
        c.x = nx;
        c.z = nz;
      }
      if (c.y < 0.38) {
        c.y = 0.38;
        c.vy = Math.abs(c.vy) * 0.32;
        c.vx *= 0.65;
        c.vz *= 0.65;
      }
      const dx = h.x - c.x;
      const dz = h.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (!h.downed && c.age > 0.18 && dist < 7.2) {
        const pull = (10.5 + (7.2 - dist) * 1.8) * dt;
        c.x += (dx / Math.max(0.01, dist)) * pull;
        c.z += (dz / Math.max(0.01, dist)) * pull;
      }
      const bobY = c.y <= 0.40 && Math.abs(c.vy) < 0.15
        ? Math.sin(this.time * 4.2 + (c.phase || 0)) * 0.06
        : 0;
      c.mesh.position.set(c.x, c.y + bobY, c.z);
      if (!h.downed && dist < 0.88) {
        if (c.orbKind === 'vitality') {
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + c.value);
          const gained = Math.max(1, Math.round(h.hp - before)) || c.value;
          this.sfx.vitalityPickup({ x: c.x, z: c.z });
          this.spawnFloatingText(h.x, 2.05, h.z, tUI().floatSoulCache(gained), '#6ff0a8', 'heal');
        } else if (c.orbKind === 'energy') {
          const gained = this.gainHeroEnergy(c.value, { showFloat: false });
          this.sfx.energyPickup({ x: c.x, z: c.z });
          const shown = gained > 0 ? gained : Math.max(1, Math.round(c.value * (h.energyGainMult || 1)));
          this.spawnFloatingText(h.x, 2.02, h.z, tUI().floatEnergyGain(shown), '#d89eff', 'heal');
        } else {
          h.cinders += c.value;
          this.sfx.cinderPickup(c.value, { x: c.x, z: c.z });
          onClassCinderPickup(this);
          if (h.cinderScaling) this.updateWeaponHUD();
        }
        this.releaseOrbSprite(c.mesh);
        this.cinderOrbs.splice(i, 1);
        this.updateHUD();
      }
    }

    // Lightning arc decay
    for (let i = this.lightningLines.length - 1; i >= 0; i--) {
      const l = this.lightningLines[i];
      l.life -= dt;
      l.mesh.material.opacity = Math.max(0, l.life / 0.20);
      if (l.life <= 0) {
        this.scene.remove(l.mesh);
        l.mesh.geometry.dispose();
        l.mesh.material.dispose();
        this.lightningLines.splice(i, 1);
      }
    }

    // Animate weapon pedestals & descent portal
    for (const fo of this.floorObjects) {
      if (fo.type === 'pedestal' && fo.obj.floatPivot.visible && (!fo.room?.group || fo.room.group.visible)) {
        fo.obj.floatPivot.rotation.y = this.time * 1.35;
        fo.obj.floatPivot.position.y = 1.32 + Math.sin(this.time * 2.6) * 0.08;
      }
    }
    if (this.descentPortal) {
      this.descentPortal.update(this.time);
    }

    // Proximity check for [F] Interactables
    let nearestInter = null;
    let nearestDist = 2.65;
    if (!h.downed && this.remotePlayers && this.remotePlayers.size > 0) {
      let bestRevDist = 2.95;
      for (const peer of this.remotePlayers.values()) {
        if (!peer.downed) continue;
        const d = Math.hypot(h.x - peer.x, h.z - peer.z);
        if (d < bestRevDist) {
          bestRevDist = d;
          nearestInter = {
            kind: 'revive_ally',
            peerId: peer.id,
            targetName: peer.name,
            x: peer.x,
            z: peer.z,
            progress: peer.reviveProgress || 0,
            bleedout: peer.bleedout || 20
          };
        }
      }
    }
    if (!nearestInter && !h.downed && this.dungeon) {
      const combatLocked = this.currentRoom && this.currentRoom.locked;
      for (const inter of this.dungeon.interactables) {
        if (inter.used) continue;
        if (combatLocked && inter.kind !== 'healing_font') continue;
        const d = Math.hypot(h.x - inter.x, h.z - inter.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestInter = inter;
        }
      }
    }
    this.activeInteractable = nearestInter;
    this.updateInteractPromptUI();
  }

  animate() {
    requestAnimationFrame(this.animate);
    if (!this.bootComplete) return;

    const nowMs = performance.now();
    const minIntervalMs = this.mode === 'lobby' ? 33 : 0;
    if (minIntervalMs > 0 && this._lastSubmittedMs && (nowMs - this._lastSubmittedMs) < minIntervalMs) {
      return;
    }
    this._lastSubmittedMs = nowMs;

    const wallDtSec = Math.max(0.0005, (nowMs - this.lastNow) * 0.001);
    const rawDt = Math.min(0.05, wallDtSec);
    this.lastNow = nowMs;

    if (wallDtSec <= 1.0) {
      this.fpsFrames++;
      this.fpsAccum += wallDtSec;
      if (this.fpsAccum >= 0.45) {
        this.fps = Math.max(1, Math.round(this.fpsFrames / this.fpsAccum));
        this.frameTimeMs = +((this.fpsAccum * 1000) / this.fpsFrames).toFixed(1);
        this.fpsFrames = 0;
        this.fpsAccum = 0;
        if (this.mode === 'explore') this.drawMinimap();
        this.updateTelemetryHUD();
      }
    } else {
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    let simDt = rawDt;
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - rawDt);
      simDt = rawDt * 0.08;
    }
    const keepCoopLive = this.isCoopActive && this.isCoopActive() && (this.mode === 'boon' || this.mode === 'weapon' || this.mode === 'paused');
    const soloPaused = this.mode === 'paused' && !keepCoopLive;
    if (!soloPaused) {
      this.time += simDt;
    }

    if (this.mode === 'explore' || keepCoopLive) {
      this.updateSimulation(simDt);
    } else {
      this.heroActualSpeed = 0;
      if (!soloPaused) {
        for (const fo of this.floorObjects) {
          if (fo.type === 'pedestal' && fo.obj.floatPivot.visible) {
            fo.obj.floatPivot.rotation.y = this.time * 1.15;
            fo.obj.floatPivot.position.y = 1.32 + Math.sin(this.time * 2.4) * 0.08;
          }
        }
      }
      if (!soloPaused && this.descentPortal) this.descentPortal.update(this.time);
    }
    if (this.coopUpdate) {
      this.coopUpdate(simDt);
    }

    const h = this.hero;
    if (!soloPaused) {
      this.heroRig.updateCape(this.time, this.heroActualSpeed ? Math.min(1.6, 0.35 + this.heroActualSpeed * 0.16) : 0.35);
    }
    renderClassPreviewFrame(this, rawDt);
    if (this.weaponStudio) {
      this.weaponStudio.updateFrame(rawDt);
    }

    // Camera framing + trauma shake
    const shakeScale = soloPaused ? 0 : this.getShakeScale();
    this.cameraShake = Math.max(0, this.cameraShake - rawDt * 1.85);
    this.lensTrauma = Math.max(0, this.lensTrauma - rawDt * 1.45);
    this.lensPass.uniforms.uTrauma.value = this.lensTrauma * shakeScale;
    this.lensPass.uniforms.uTime.value = this.time;

    const shakeMag = this.cameraShake * this.cameraShake * 0.55 * shakeScale;
    const shakeX = (Math.random() - 0.5) * shakeMag;
    const shakeZ = (Math.random() - 0.5) * shakeMag;

    let shadowAnchorX = h.x;
    let shadowAnchorZ = h.z;
    if (this.mode === 'title') {
      this.updateTitleShowcaseCamera(rawDt, false);
      shadowAnchorX = this._showcaseFocus.x;
      shadowAnchorZ = this._showcaseFocus.z;
    } else if (this.mode === 'lobby') {
      const orbitAng = Math.sin(this.time * 0.22) * 0.28;
      const targetCamX = h.x + Math.sin(orbitAng) * 4.5;
      const targetCamZ = h.z + 12.2;
      this.camera.position.set(targetCamX, 13.4, targetCamZ);
      this.camera.lookAt(h.x, 1.1, h.z - 1.2);
    } else {
      const desiredX = h.x;
      const desiredY = 13.8;
      const desiredZ = h.z + 11.8;
      const camLerp = Math.min(1, rawDt * 7.5);
      this.camera.position.x += (desiredX - this.camera.position.x) * camLerp;
      this.camera.position.y += (desiredY - this.camera.position.y) * camLerp;
      this.camera.position.z += (desiredZ - this.camera.position.z) * camLerp;
      this.camera.position.x += shakeX;
      this.camera.position.z += shakeZ;
      this.camera.lookAt(h.x + shakeX * 0.35, 0.95, h.z - 0.65 + shakeZ * 0.35);
    }

    if (this.dungeon && !soloPaused) {
      this.dungeon.update(this.time, simDt, shadowAnchorX, shadowAnchorZ, this.heroActualSpeed || 0);
      this.vfx.update(simDt, this.dungeon.allBraziers, shadowAnchorX, shadowAnchorZ, this.time);
    } else if (this.dungeon && this.dungeon.updateVisibility) {
      this.dungeon.updateVisibility(shadowAnchorX, shadowAnchorZ);
    }

    // Texel-snapped directional shadow light so walking never causes shadow-edge strobing
    if (this._shadowBasisInit) {
      const anchor = new THREE.Vector3(shadowAnchorX, 0, shadowAnchorZ);
      const u = Math.round(anchor.dot(this._shadowRight) / this._shadowTexel) * this._shadowTexel;
      const v = Math.round(anchor.dot(this._shadowUp) / this._shadowTexel) * this._shadowTexel;
      const fwd = this._shadowOffset.clone().negate().normalize();
      const w = anchor.dot(fwd);
      const snapped = new THREE.Vector3()
        .addScaledVector(this._shadowRight, u)
        .addScaledVector(this._shadowUp, v)
        .addScaledVector(fwd, w);
      this.moonLight.target.position.copy(snapped);
      this.moonLight.position.copy(snapped).add(this._shadowOffset);
      this.moonLight.target.updateMatrixWorld();
    } else {
      this.moonLight.target.position.set(shadowAnchorX, 0, shadowAnchorZ);
      this.moonLight.position.set(shadowAnchorX - 13, 24, shadowAnchorZ - 11);
      this.moonLight.target.updateMatrixWorld();
    }

    const inMenuOverlay = this.mode === 'lobby';
    if (!document.hidden && !inMenuOverlay && this.quality === 'ultra' && this.dungeon && this.dungeon.renderPlanarReflection) {
      if (!this._reflHideCache) {
        this._reflHideCache = [this.vfx.rain, this.vfx.particles, this.vfx.mistGroup, this.vfx.trailMesh];
      }
      this.dungeon.renderPlanarReflection(this.renderer, this.camera, this._reflHideCache);
    }
    this.projectWorldInteractPin();
    if (this.coopProjectTags) this.coopProjectTags();
    if (inMenuOverlay) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__SANCTUM_ARSENAL__ = {
    WEAPON_DEFS,
    WEAPON_LIST,
    WEAPON_RARITIES,
    rollWeaponInstance,
    temperWeaponInstance,
    pickRandomWeaponDrop,
    pickBossWeaponDrop: pickBossMythicDrop
  };
  new SanctumGame();
});
