import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { buildAllTextures } from '../textures.js';
import { createMaterials, createHeroRig } from '../actors.js';
import {
  BIOME_DEFS,
  BIOME_BY_ID,
  buildBiomeDungeonWorld,
  drawBiomeMinimap
} from './index.js';

class BiomeShowcaseApp {
  constructor() {
    this.canvas = document.getElementById('showcase-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

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
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.5, 120);

    this.baseTex = buildAllTextures(this.renderer);
    this.setupLights();
    this.actorMats = createMaterials(this.baseTex);
    this.heroRig = createHeroRig(this.actorMats);
    this.scene.add(this.heroRig.root);

    this.setupPost();

    this.keys = {};
    this.hero = { x: 0, z: 2.2, yaw: Math.PI, speed: 8.6, actualSpeed: 0 };
    this.camOffset = { x: 0, y: 13.6, z: 11.8, lookY: 0.95, lookZOff: -0.6 };
    this.time = 0;
    this.lastNow = performance.now();
    this.fps = 60;
    this.fpsFrames = 0;
    this.fpsAccum = 0;
    this.dungeon = null;
    this.currentBiome = null;
    this.currentRoom = null;
    this.lastAudit = null;

    this.buildUI();
    this.bindEvents();
    this.loadBiome(BIOME_DEFS[0].id, 102401);

    window.__BIOME_SHOWCASE__ = this;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLights() {
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

  setupPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.gtaoPass = new GTAOPass(
      this.scene,
      this.camera,
      Math.round(this.width * 0.5),
      Math.round(this.height * 0.5)
    );
    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
    this.gtaoPass.blendIntensity = 0.66;
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
        const mat = object.material;
        const isTrans = mat && (
          Array.isArray(mat)
            ? mat.some((m) => m.transparent || m.depthWrite === false || m.blending !== THREE.NormalBlending)
            : (mat.transparent || mat.depthWrite === false || mat.blending !== THREE.NormalBlending)
        );
        if (object.isPoints || object.isLine || object.isLine2 || object.isSprite || object.userData.ignoreAO || isTrans) {
          object.visible = false;
          cache.push(object);
        }
      });
    };
    this.composer.addPass(this.gtaoPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.32, 0.52, 0.95);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
  }

  buildUI() {
    const list = document.getElementById('biome-buttons');
    list.innerHTML = '';
    BIOME_DEFS.forEach((b, idx) => {
      const btn = document.createElement('button');
      btn.className = 'biome-btn';
      btn.dataset.biomeId = b.id;
      btn.innerHTML = `<span class="b-idx">[${idx + 1}] F${b.depth}${b.variant}</span><strong>${b.cnName.split('·')[1].trim()}</strong>`;
      btn.addEventListener('click', () => this.loadBiome(b.id));
      list.appendChild(btn);
    });

    document.querySelectorAll('[data-room-jump]').forEach((btn) => {
      btn.addEventListener('click', () => this.jumpToRoomType(btn.dataset.roomJump));
    });

    const rerollBtn = document.getElementById('btn-reroll');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => this.rerollLayout());
    }
    const seamBtn = document.getElementById('btn-seam');
    if (seamBtn) {
      seamBtn.addEventListener('click', () => this.jumpToSeam('NS'));
    }
  }

  rerollLayout() {
    if (!this.currentBiome) return;
    const nextSeed = Math.floor(Math.random() * 900000 + 100000);
    this.loadBiome(this.currentBiome.id, nextSeed);
  }

  loadBiome(biomeId, explicitSeed = null) {
    if (!BIOME_BY_ID[biomeId]) return;
    if (this.dungeon) {
      this.dungeon.dispose();
      this.dungeon = null;
    }
    const seed = explicitSeed !== null ? explicitSeed : Math.floor(Math.random() * 900000 + 100000);
    this.dungeon = buildBiomeDungeonWorld({
      renderer: this.renderer,
      scene: this.scene,
      baseTex: this.baseTex,
      biomeId,
      seed,
      targetRoomCount: 8,
      isMobile: this.width < 820,
      applySceneAtmosphere: true,
      lights: {
        moonLight: this.moonLight,
        warmFill: this.warmFill,
        hemiLight: this.hemiLight
      }
    });
    this.currentBiome = this.dungeon.biome;
    this.lastAudit = this.dungeon.auditSeams();
    if (this.heroRig && this.heroRig.heroLight) {
      this.heroRig.heroLight.intensity = this.currentBiome.archStyle === 'obsidian' ? 0.55 : 1.15;
    }
    if (this.currentBiome.lighting && Array.isArray(this.currentBiome.lighting.keyOffset)) {
      this._shadowOffset = new THREE.Vector3(...this.currentBiome.lighting.keyOffset);
      const fwd = this._shadowOffset.clone().negate().normalize();
      this._shadowRight = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      this._shadowUp = new THREE.Vector3().crossVectors(this._shadowRight, fwd).normalize();
      this._shadowTexel = (19.5 * 2) / 2048;
      this._shadowBasisInit = true;
    }
    for (const r of this.dungeon.rooms) r.visited = true;
    this.camOffset = { x: 0, y: 13.6, z: 11.8, lookY: 0.95, lookZOff: -0.6 };
    this.jumpToRoomType('start');

    document.querySelectorAll('.biome-btn').forEach((el) => {
      el.classList.toggle('active', el.dataset.biomeId === biomeId);
    });
    document.getElementById('biome-cn').textContent = this.currentBiome.cnName;
    document.getElementById('biome-en').textContent = `${this.currentBiome.name} · ${this.currentBiome.themeTag}`;
    document.getElementById('biome-desc').textContent = this.currentBiome.subtitle;
    const seedEl = document.getElementById('seed-meta');
    if (seedEl) {
      seedEl.textContent = `SEED #${this.dungeon.seed} · ${this.dungeon.rooms.length} 房间 / ${this.dungeon.corridors.length} 走廊`;
    }
    this.drawMinimap();
  }

  jumpToRoomType(roomType) {
    if (!this.dungeon) return;
    this.camOffset = { x: 0, y: 13.6, z: 11.8, lookY: 0.95, lookZOff: -0.6 };
    const room = this.dungeon.rooms.find((r) => r.type === roomType) || this.dungeon.rooms[0];
    this.currentRoom = room;
    let ox = 0;
    let oz = 2.0;
    if (roomType === 'vault') oz = 2.6;
    else if (roomType === 'sanctuary') { ox = 0; oz = 0; }
    else if (roomType === 'boss') oz = 3.8;
    else if (roomType === 'combat' || roomType === 'elite') { ox = 0; oz = 3.6; }
    this.hero.x = room.cx + ox;
    this.hero.z = room.cz + oz;
    this.hero.yaw = Math.PI;
    this.heroRig.root.position.set(this.hero.x, 0, this.hero.z);
    this.heroRig.root.rotation.y = this.hero.yaw;
    this.camera.position.set(this.hero.x + this.camOffset.x, this.camOffset.y, this.hero.z + this.camOffset.z);
    this.camera.lookAt(this.hero.x, this.camOffset.lookY, this.hero.z + this.camOffset.lookZOff);
    this.updateRoomBanner(room);
    this.drawMinimap();
  }

  jumpToSeam(preferAxis = 'NS') {
    if (!this.dungeon || this.dungeon.corridors.length === 0) return;
    const corr = this.dungeon.corridors.find((c) => c.axis === preferAxis) || this.dungeon.corridors[0];
    if (corr.axis === 'NS') {
      this.hero.x = corr.seamBX;
      this.hero.z = corr.seamBZ - 1.2;
      this.hero.yaw = Math.PI;
      this.camOffset = { x: 2.2, y: 7.4, z: 7.8, lookY: 1.5, lookZOff: -1.5 };
    } else {
      this.hero.x = corr.seamAX + 1.2;
      this.hero.z = corr.seamAZ;
      this.hero.yaw = Math.PI / 2;
      this.camOffset = { x: -5.2, y: 7.8, z: 7.8, lookY: 1.5, lookZOff: -0.4 };
    }
    this.heroRig.root.position.set(this.hero.x, 0, this.hero.z);
    this.heroRig.root.rotation.y = this.hero.yaw;
    this.camera.position.set(this.hero.x + this.camOffset.x, this.camOffset.y, this.hero.z + this.camOffset.z);
    this.camera.lookAt(this.hero.x, this.camOffset.lookY, this.hero.z + this.camOffset.lookZOff);
    this.drawMinimap();
  }

  updateRoomBanner(room) {
    if (!room) return;
    document.getElementById('room-title').textContent = room.title;
    document.getElementById('room-sub').textContent = `${room.subtitle} (${room.layout})`;
  }

  drawMinimap() {
    if (!this.dungeon) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const lw = 174;
    const lh = 168;
    const pw = Math.round(lw * dpr);
    const ph = Math.round(lh * dpr);
    if (this.minimapCanvas.width !== pw || this.minimapCanvas.height !== ph) {
      this.minimapCanvas.width = pw;
      this.minimapCanvas.height = ph;
      this.minimapCanvas.style.width = `${lw}px`;
      this.minimapCanvas.style.height = `${lh}px`;
    }
    this.minimapCtx.save();
    this.minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBiomeMinimap(this.minimapCtx, lw, lh, this.dungeon, this.currentRoom, this.hero, false);
    this.minimapCtx.restore();
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.composer.setSize(this.width, this.height);
      this.gtaoPass.setSize(Math.round(this.width * 0.5), Math.round(this.height * 0.5));
    });
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR' && !e.repeat) {
        this.rerollLayout();
        return;
      }
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.replace('Digit', '')) - 1;
        if (n >= 0 && n < BIOME_DEFS.length) this.loadBiome(BIOME_DEFS[n].id);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  animate() {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) * 0.001));
    this.lastNow = now;
    this.time += dt;

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      this.drawMinimap();
    }

    const h = this.hero;
    const prevX = h.x;
    const prevZ = h.z;
    let ix = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    let iz = (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) - (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0);
    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
      h.x += ix * h.speed * dt;
      h.z += iz * h.speed * dt;
      h.yaw = Math.atan2(ix, iz);
      this.camOffset = { x: 0, y: 13.6, z: 11.8, lookY: 0.95, lookZOff: -0.6 };
    }
    if (this.dungeon) {
      this.dungeon.resolveMovement(h, prevX, prevZ, 0.44);
      const rm = this.dungeon.findRoomAt(h.x, h.z);
      if (rm && rm !== this.currentRoom) {
        this.currentRoom = rm;
        this.updateRoomBanner(rm);
      }
      h.actualSpeed = Math.hypot(h.x - prevX, h.z - prevZ) / dt;
      this.dungeon.update(this.time, dt, h.x, h.z, h.actualSpeed);
    }

    this.heroRig.root.position.set(h.x, 0, h.z);
    this.heroRig.root.rotation.y = h.yaw;
    this.heroRig.updateCape(this.time, len > 0 ? 1.2 : 0.35);

    const tx = h.x + this.camOffset.x;
    const ty = this.camOffset.y;
    const tz = h.z + this.camOffset.z;
    this.camera.position.x += (tx - this.camera.position.x) * Math.min(1, dt * 6.5);
    this.camera.position.y += (ty - this.camera.position.y) * Math.min(1, dt * 6.5);
    this.camera.position.z += (tz - this.camera.position.z) * Math.min(1, dt * 6.5);
    this.camera.lookAt(h.x, this.camOffset.lookY, h.z + this.camOffset.lookZOff);

    if (this._shadowBasisInit) {
      const anchor = new THREE.Vector3(h.x, 0, h.z);
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
      const off = this.currentBiome ? this.currentBiome.lighting.keyOffset : [-13, 24, -11];
      this.moonLight.target.position.set(h.x, 0, h.z);
      this.moonLight.position.set(h.x + off[0], off[1], h.z + off[2]);
      this.moonLight.target.updateMatrixWorld();
    }

    if (this.dungeon && this.dungeon.renderPlanarReflection) {
      this.dungeon.renderPlanarReflection(this.renderer, this.camera);
    }
    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new BiomeShowcaseApp();
});
