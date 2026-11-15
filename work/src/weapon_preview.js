import * as THREE from 'three';
import { buildWeaponVisuals, rollWeaponInstance, WEAPON_RARITIES } from './weapons.js';

export const UI_SVG = {
  dmg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 2.2 13.8 3.2 6.7 10.3l-2.3.5.5-2.3L12 1.4z"/><path d="M3.5 10.5 6.5 13.5"/><path d="M2.2 13.8l2.1-2.1"/></svg>',
  spd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 1.8 4.2 8.4h4.1l-.9 5.8 5.2-6.8H8.4z"/></svg>',
  rng: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="5.2"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/><path d="M8 1.3v2M8 12.7v2M1.3 8h2M12.7 8h2"/></svg>',
  crit: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.2 9.8 6.2 14.8 8 9.8 9.8 8 14.8 6.2 9.8 1.2 8 6.2 6.2z"/></svg>',
  shd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8 13.2 3.8v4.1c0 3.3-2.2 5.4-5.2 6.5-3-1.1-5.2-3.2-5.2-6.5V3.8z"/><path d="M9.2 4.8 6.8 8.2h2.3l-1.4 3.2"/></svg>',
  imp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.5h10"/><path d="M8 2.2v6.6"/><path d="M5.2 6.2 8 9l2.8-2.8"/><path d="M2.4 10.2l1.8 1M13.6 10.2l-1.8 1"/></svg>',
  skl: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6 14.4 8 8 14.4 1.6 8z"/><circle cx="8" cy="8" r="2.1" fill="currentColor" stroke="none"/></svg>',
  melee: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2.6 6.2 9.8"/><path d="M10.8 2.4h2.8v2.8"/><path d="M4.6 8.2 7.8 11.4"/><path d="M2.6 13.4l3.4-3.4"/></svg>',
  ranged: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 2.4c4.8 1.2 7.2 3.6 8.4 8.4"/><path d="M3.2 12.8 12.4 3.6"/><path d="M9.4 3.6h3v3"/></svg>',
  hp: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 13.8s-5.4-3.3-5.4-7.2C2.6 4.4 4.3 2.8 6.3 2.8c1.1 0 2.1.5 1.7 1.5.4-1 1.4-1.5 2.5-1.5 2 0 3.7 1.6 3.7 3.8 0 3.9-6.2 7.2-6.2 7.2z"/></svg>',
  aegis: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.6 13.4 3.7v4.2c0 3.5-2.3 5.6-5.4 6.7-3.1-1.1-5.4-3.2-5.4-6.7V3.7z"/></svg>',
  energy: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.8 1.1 3.4 8.5h4.1l-1.1 6.4 6.2-7.6H8.5z"/></svg>',
  cinder: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.2 12.5 7.6 8 14.8 3.5 7.6z"/></svg>',
  flask: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 2.2h3.6"/><path d="M6.8 2.2v3l-3.2 5.4a2 2 0 0 0 1.7 3h5.4a2 2 0 0 0 1.7-3L9.2 5.2v-3"/><path d="M4.7 10.4h6.6"/></svg>',
  dash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 7.5 8 3 11.5"/><path d="M8.2 4.5 12.7 8 8.2 11.5"/></svg>',
  salvage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 19.5 11 12 21.5 4.5 11z"/><path d="M12 6.5 15.6 11 12 16.5 8.4 11z" fill="currentColor" fill-opacity="0.28"/><path d="M4 4.5l2.2 2.2M20 4.5l-2.2 2.2"/></svg>'
};

export const ELEMENT_VISUALS = {
  PYRE:   { color: '#ff8a47', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1.5c.4 2.4-1.6 3.5-1.2 5.4.3 1.1 1.5 1.5 2.1.4.8 1.3 1.2 3 .5 4.5-.8 1.8-2.9 2.7-4.7 1.9-2-.9-2.7-3.4-1.4-5.4.9-1.4 2.2-2.4 4.7-6.8z"/></svg>' },
  FROST:  { color: '#7ce8ff', svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.6v12.8M2.4 4.8l11.2 6.4M13.6 4.8 2.4 11.2"/></svg>' },
  STORM:  { color: '#74c8ff', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.4 1.4 3.8 8.6h4l-1.2 6 5.6-7.2h-4z"/></svg>' },
  PIERCE: { color: '#e6edf7', svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 13.6 13.6 2.4"/><path d="M8.6 2.4h5v5"/></svg>' },
  VOID:   { color: '#c580ff', svg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="4.6"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/></svg>' },
  BLOOD:  { color: '#ff5c77', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.8S3.6 7 3.6 10.1a4.4 4.4 0 0 0 8.8 0C12.4 7 8 1.8 8 1.8z"/></svg>' },
  BLIGHT: { color: '#6df29c', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="2.1"/><circle cx="5.2" cy="10.2" r="2.1"/><circle cx="10.8" cy="10.2" r="2.1"/></svg>' },
  ASTRAL: { color: '#ffe07d', svg: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1 9.6 6.4 15 8l-5.4 1.6L8 15 6.4 9.6 1 8l5.4-1.6z"/></svg>' }
};

export function getElementBadgeInfo(elemKey) {
  return ELEMENT_VISUALS[elemKey] || ELEMENT_VISUALS.PIERCE;
}

export function romanTierMark(tier = 1) {
  return ['I', 'II', 'III', 'IV'][Math.max(0, Math.min(3, (tier || 1) - 1))];
}

export function impactNumScore(impactClass = 'medium', knockback = 4.8) {
  if (knockback) return knockback.toFixed(1);
  const map = { light: '3.4', medium: '4.8', heavy: '6.4', colossal: '8.2' };
  return map[impactClass] || '4.8';
}

export class WeaponPreviewStudio {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = 360;
    this.offscreen.height = 220;
    this.renderer = null;
    this.rigCache = new Map();
    this.snapshotCache = new Map();
    this.modalYaw = 0.58;
    this.modalPitch = -0.28;
    this.modalDragging = false;
    this.modalLastX = 0;
    this.modalHoldTimer = 0;
    this._hudLastRenderMs = 0;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.offscreen,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.28;
      this.renderer.setClearColor(0x000000, 0);
    } catch (_) {
      return;
    }

    this.scene = new THREE.Scene();
    if (game.tex && game.tex.envMap) {
      this.scene.environment = game.tex.envMap;
    }
    this.camera = new THREE.PerspectiveCamera(34, 360 / 220, 0.1, 24);
    this.camera.position.set(0, 0.04, 2.18);
    this.camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xf4f8ff, 0x3b3348, 2.25);
    const key = new THREE.DirectionalLight(0xfff4e0, 3.65);
    key.position.set(2.4, 3.2, 4.2);
    const fill = new THREE.DirectionalLight(0x8fd4ff, 2.45);
    fill.position.set(-3.4, 1.6, 3.2);
    const backRim = new THREE.DirectionalLight(0xffe2a8, 1.95);
    backRim.position.set(0.4, -2.6, 2.4);
    this.rimLight = new THREE.PointLight(0xff9d47, 3.4, 8.0, 1.2);
    this.rimLight.position.set(0, 0.1, 1.65);
    this.scene.add(hemi, key, fill, backRim, this.rimLight);

    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);

    const haloGeo = new THREE.RingGeometry(0.68, 0.72, 42);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0xf6d794,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.haloMesh = new THREE.Mesh(haloGeo, this.haloMat);
    this.haloMesh.rotation.x = Math.PI * 0.36;
    this.haloMesh.position.set(0, -0.06, -0.18);
    this.scene.add(this.haloMesh);

    this.holder = new THREE.Group();
    this.stageRoot.add(this.holder);
    this.activeCacheKey = null;
    this.ready = true;
  }

  bindInteractiveCanvas(canvas) {
    if (!canvas || canvas._wpnDragBound) return;
    canvas._wpnDragBound = true;
    canvas.addEventListener('pointerdown', (e) => {
      this.modalDragging = true;
      this.modalLastX = e.clientX;
      this.modalHoldTimer = 2.6;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.modalDragging) return;
      const dx = e.clientX - this.modalLastX;
      this.modalLastX = e.clientX;
      this.modalYaw += dx * 0.018;
      this.modalHoldTimer = 2.6;
    });
    const stop = () => { this.modalDragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  _getPreparedEntry(weaponInst) {
    if (!weaponInst || !weaponInst.def) return null;
    const key = `${weaponInst.id}|t${weaponInst.tier || 1}|r${weaponInst.rarity || weaponInst.def.rarity || 'common'}`;
    if (this.rigCache.has(key)) {
      return { key, ...this.rigCache.get(key) };
    }
    if (this.rigCache.size >= 28) {
      const oldestKey = this.rigCache.keys().next().value;
      this.rigCache.delete(oldestKey);
    }

    const vis = buildWeaponVisuals(weaponInst, this.game.mats);
    const assembly = new THREE.Group();
    assembly.add(vis.group);
    if (vis.offhand) {
      if (weaponInst.id === 'twinblades') {
        vis.group.position.set(0.14, 0.02, 0.06);
        vis.group.rotation.y = 0.14;
        vis.offhand.position.set(-0.16, -0.02, -0.06);
        vis.offhand.rotation.y = -0.18;
      } else {
        vis.offhand.position.set(-0.34, 0.04, 0.16);
        vis.offhand.rotation.set(0.12, 0.24, -0.16);
      }
      assembly.add(vis.offhand);
    }

    // Lift dark plate materials slightly so hilts/barrels read crisply on obsidian glass
    assembly.traverse((obj) => {
      if (obj.isMesh && obj.material && !obj.material.emissiveIntensity) {
        const m = obj.material.clone();
        const lum = m.color ? (m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11) : 0.5;
        if (lum < 0.22 && m.color) {
          m.color.offsetHSL(0, 0, 0.14);
        }
        m.roughness = Math.max(0.18, (m.roughness ?? 0.4) * 0.78);
        obj.material = m;
      }
    });

    // Tilt weapon X-Z broadside toward +Z camera and angle diagonally across the frame
    const orient = new THREE.Group();
    assembly.rotation.set(-Math.PI * 0.44, 0.08, 0.12);
    orient.add(assembly);
    orient.rotation.z = -0.62;
    orient.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(orient);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxSpan = Math.max(0.42, size.x * 0.92, size.y * 1.18);
    const fitScale = 1.86 / maxSpan;

    const normalized = new THREE.Group();
    orient.position.sub(center);
    normalized.add(orient);
    normalized.scale.setScalar(fitScale);

    const rDef = WEAPON_RARITIES[weaponInst.rarity || weaponInst.def.rarity] || WEAPON_RARITIES.common;
    const entry = {
      node: normalized,
      rarityHex: rDef.hex,
      accentHex: weaponInst.def.accentHex || rDef.hex,
      rank: rDef.rank || 1
    };
    this.rigCache.set(key, entry);
    return { key, ...entry };
  }

  renderToCanvas(targetCanvas, weaponInst, opts = {}) {
    if (!this.ready || !targetCanvas || !weaponInst) return;
    const entry = this._getPreparedEntry(weaponInst);
    if (!entry) return;

    const cssW = Math.max(64, Math.round(opts.width || targetCanvas.clientWidth || targetCanvas.width || 160));
    const cssH = Math.max(44, Math.round(opts.height || targetCanvas.clientHeight || targetCanvas.height || 90));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);

    if (targetCanvas.width !== pxW || targetCanvas.height !== pxH) {
      targetCanvas.width = pxW;
      targetCanvas.height = pxH;
    }
    if (this.offscreen.width !== pxW || this.offscreen.height !== pxH) {
      this.renderer.setSize(pxW, pxH, false);
    }
    this.camera.aspect = pxW / Math.max(1, pxH);
    this.camera.fov = opts.fov || 32;
    this.camera.position.set(0, 0.02, opts.camZ || 2.18);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    if (this.activeCacheKey !== entry.key) {
      while (this.holder.children.length > 0) {
        this.holder.remove(this.holder.children[0]);
      }
      this.holder.add(entry.node);
      this.activeCacheKey = entry.key;
    }

    const yaw = opts.yaw ?? 0.16;
    const bob = opts.bob ?? 0;
    this.stageRoot.rotation.set(opts.pitch ?? 0.06, yaw, 0);
    this.stageRoot.position.y = bob;

    this.rimLight.color.setHex(entry.accentHex);
    this.rimLight.intensity = 2.2 + entry.rank * 0.35;
    this.haloMesh.visible = !!opts.showHalo;
    if (opts.showHalo) {
      this.haloMat.color.setHex(entry.rarityHex);
      this.haloMat.opacity = entry.rank >= 5 ? 0.42 : 0.22;
      this.haloMesh.rotation.z = (this.game.time || 0) * 0.45;
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    const ctx = targetCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, pxW, pxH);
      ctx.drawImage(this.offscreen, 0, 0, pxW, pxH);
    }
  }

  getWeaponSnapshotUrl(weaponDefOrInst, width = 156, height = 84) {
    if (!this.ready || !weaponDefOrInst) return '';
    const inst = weaponDefOrInst.def
      ? weaponDefOrInst
      : rollWeaponInstance(weaponDefOrInst.id, weaponDefOrInst.bossOnly ? 3 : 2, false, () => 0.5);
    const snapKey = `${inst.id}|t${inst.tier || 1}|${width}x${height}`;
    if (this.snapshotCache.has(snapKey)) {
      return this.snapshotCache.get(snapKey);
    }
    const tmp = document.createElement('canvas');
    this.renderToCanvas(tmp, inst, {
      width,
      height,
      yaw: 0.18,
      pitch: 0.06,
      camZ: 2.14,
      showHalo: (inst.rarityRank || 1) >= 4
    });
    const url = tmp.toDataURL('image/png');
    this.snapshotCache.set(snapKey, url);
    return url;
  }

  warmInitialWeapons() {
    if (!this.ready || !this.game.hero || !this.game.hero.weapons) return;
    for (const w of this.game.hero.weapons) {
      if (w) this._getPreparedEntry(w);
    }
  }

  updateFrame(dt) {
    if (!this.ready) return;
    const t = this.game.time || 0;

    // 1. Live 3D Weapon Inspection & Swap Modal
    if (this.game.mode === 'weapon' && this.game.pendingWeaponPedestal) {
      if (!this.modalDragging) {
        if (this.modalHoldTimer > 0) {
          this.modalHoldTimer = Math.max(0, this.modalHoldTimer - dt);
        } else {
          this.modalYaw = Math.sin(t * 1.15) * 0.42;
        }
      }
      const newCanvas = document.getElementById('wpn-modal-new-canvas');
      if (newCanvas) {
        this.renderToCanvas(newCanvas, this.game.pendingWeaponPedestal.weaponInst, {
          yaw: this.modalYaw,
          pitch: 0.06,
          bob: Math.sin(t * 2.4) * 0.035,
          camZ: 2.06,
          showHalo: true
        });
      }
      for (let i = 0; i < 2; i++) {
        const eqCanvas = document.getElementById(`wpn-choice-canvas-${i}`);
        const eqWpn = this.game.hero?.weapons?.[i];
        if (eqCanvas && eqWpn) {
          this.renderToCanvas(eqCanvas, eqWpn, {
            yaw: Math.sin(t * 1.25 + i * 1.6) * 0.32,
            pitch: 0.06,
            bob: Math.sin(t * 2.1 + i) * 0.025,
            camZ: 2.14,
            showHalo: (eqWpn.rarityRank || 1) >= 4
          });
        }
      }
      return;
    }

    // 2. In-Game HUD Dual Weapon 3D Models (throttled to ~24fps for zero combat overhead)
    if (this.game.mode === 'explore' && this.game.hero?.weapons) {
      const nowMs = performance.now();
      if (nowMs - this._hudLastRenderMs < 85) return;
      this._hudLastRenderMs = nowMs;
      for (let i = 0; i < 2; i++) {
        const c = document.getElementById(`wpn-canvas-${i}`);
        const w = this.game.hero.weapons[i];
        if (!c || !w) continue;
        const isActive = this.game.hero.activeSlot === i;
        const cw = c.clientWidth || 72;
        const ch = c.clientHeight || 46;
        const baseSig = `${w.id}|t${w.tier || 1}|r${w.rarity || w.def?.rarity || 'common'}|${cw}x${ch}`;
        if (!isActive) {
          const idleSig = `${baseSig}|idle`;
          if (c._lastHudSig === idleSig) continue;
          c._lastHudSig = idleSig;
          this.renderToCanvas(c, w, {
            yaw: 0.14,
            pitch: 0.06,
            bob: 0,
            camZ: 2.10,
            showHalo: false
          });
          continue;
        }
        c._lastHudSig = `${baseSig}|active`;
        this.renderToCanvas(c, w, {
          yaw: Math.sin(t * 1.45) * 0.28,
          pitch: 0.06,
          bob: Math.sin(t * 2.6) * 0.024,
          camZ: 2.10,
          showHalo: (w.rarityRank || 1) >= 4
        });
      }
    }
  }
}
