import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIOME_BY_ID, pickBiomeForFloor } from './biome_defs.js';
import { getBiomeTexturePack } from './biome_textures.js';
import { markIgnoreAO, createBiomeMaterialSet } from './biome_props.js';
import {
  GRID_STEP,
  PORTAL_CLEAR_HALF,
  DIRS,
  createSeededRng,
  auditDungeonSeamIntegrity
} from './seam_spec.js';
import { generateRandomDungeonGraph } from './dungeon_generator.js';
import { buildRoomModule } from './room_modules.js';
import { buildCorridorModule } from './corridor_modules.js';

export { GRID_STEP };

function batchStaticMeshesInGroup(targetGroup, excludeSet = null) {
  if (!targetGroup) return;
  targetGroup.updateMatrixWorld(true);
  const invRoot = targetGroup.matrixWorld.clone().invert();
  const buckets = new Map();

  function collect(node) {
    if (node !== targetGroup && node.userData && node.userData.dynamicSubtree) return;
    if (node.isMesh) {
      const mat = node.material;
      const geo = node.geometry;
      if (
        geo &&
        mat &&
        !Array.isArray(mat) &&
        !mat.transparent &&
        (!excludeSet || !excludeSet.has(node))
      ) {
        const attrSig = Object.keys(geo.attributes).sort().join(',');
        const key = `${mat.uuid}|${node.castShadow ? 1 : 0}|${node.receiveShadow ? 1 : 0}|${node.userData?.ignoreAO ? 1 : 0}|${geo.index ? 1 : 0}|${attrSig}`;
        let list = buckets.get(key);
        if (!list) {
          list = [];
          buckets.set(key, list);
        }
        list.push(node);
      }
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      collect(children[i]);
    }
  }

  collect(targetGroup);

  const relMat = new THREE.Matrix4();
  const disposedOriginals = new Set();
  for (const entries of buckets.values()) {
    if (entries.length < 2) continue;
    const clones = [];
    for (let i = 0; i < entries.length; i++) {
      const m = entries[i];
      const c = m.geometry.clone();
      relMat.copy(invRoot).multiply(m.matrixWorld);
      c.applyMatrix4(relMat);
      clones.push(c);
    }
    const merged = mergeGeometries(clones, false);
    for (let i = 0; i < clones.length; i++) clones[i].dispose();
    if (!merged) continue;

    const sample = entries[0];
    const batched = new THREE.Mesh(merged, sample.material);
    batched.castShadow = sample.castShadow;
    batched.receiveShadow = sample.receiveShadow;
    if (sample.userData && sample.userData.ignoreAO) {
      batched.userData.ignoreAO = true;
    }
    targetGroup.add(batched);

    for (let i = 0; i < entries.length; i++) {
      const m = entries[i];
      if (m.parent) m.parent.remove(m);
      if (m.geometry && !disposedOriginals.has(m.geometry)) {
        disposedOriginals.add(m.geometry);
        m.geometry.dispose();
      }
    }
  }
}

export function applyBiomeAtmosphere(biome, targets = {}) {
  const lt = biome.lighting;
  const { renderer, scene, texPack, moonLight, warmFill, hemiLight } = targets;
  if (scene) {
    scene.background = new THREE.Color(lt.bgHex);
    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.color.setHex(lt.fogHex);
      scene.fog.density = lt.fogDensity;
    } else {
      scene.fog = new THREE.FogExp2(lt.fogHex, lt.fogDensity);
    }
    if (texPack && texPack.envMap) {
      scene.environment = texPack.envMap;
    }
  }
  if (renderer && typeof lt.exposure === 'number') {
    renderer.toneMappingExposure = lt.exposure;
  }
  if (moonLight) {
    moonLight.color.setHex(lt.keyColor);
    moonLight.intensity = lt.keyIntensity;
  }
  if (warmFill) {
    warmFill.color.setHex(lt.fillColor);
    warmFill.intensity = lt.fillIntensity;
  }
  if (hemiLight) {
    hemiLight.color.setHex(lt.hemiSky);
    hemiLight.groundColor.setHex(lt.hemiGround);
    hemiLight.intensity = lt.hemiIntensity;
  }
}

export function drawBiomeMinimap(ctx, w, h, dungeon, currentRoom, hero, discoveredOnly = true, allies = []) {
  ctx.clearRect(0, 0, w, h);
  if (!dungeon || !dungeon.rooms || dungeon.rooms.length === 0) return;

  const isExpanded = w >= 220;

  // 1. Deep obsidian tactical backdrop + subtle grid so lit rooms pop sharply
  ctx.save();
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 8, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  bgGrad.addColorStop(0, 'rgba(13, 20, 36, 0.94)');
  bgGrad.addColorStop(1, 'rgba(4, 6, 12, 0.98)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  const gridStep = isExpanded ? 24 : 18;
  ctx.strokeStyle = 'rgba(140, 175, 230, 0.042)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = (w % gridStep) * 0.5; gx < w; gx += gridStep) {
    const px = Math.round(gx) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  for (let gy = (h % gridStep) * 0.5; gy < h; gy += gridStep) {
    const py = Math.round(gy) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();
  ctx.restore();

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of dungeon.rooms) {
    const known = !discoveredOnly || r.visited || Object.values(r.doors).some((nb) => nb && nb.visited);
    if (!known) continue;
    minX = Math.min(minX, r.cx - r.halfW);
    maxX = Math.max(maxX, r.cx + r.halfW);
    minZ = Math.min(minZ, r.cz - r.halfD);
    maxZ = Math.max(maxZ, r.cz + r.halfD);
  }
  if (!Number.isFinite(minX)) {
    minX = -20; maxX = 20; minZ = -20; maxZ = 20;
  }
  const pad = isExpanded ? 20 : 13;
  const spanX = Math.max(42, maxX - minX);
  const spanZ = Math.max(42, maxZ - minZ);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;

  const toMapX = (wx) => w * 0.5 + (wx - midX) * scale;
  const toMapY = (wz) => h * 0.5 + (wz - midZ) * scale;

  // 2. Corridors: bright solid road between visited rooms vs dim dashed line to unvisited rooms
  const corrBaseW = Math.max(2.4, Math.min(isExpanded ? 6.2 : 4.4, 4.4 * scale * 0.85));
  const drawnPairs = new Set();
  for (const r of dungeon.rooms) {
    for (const nb of Object.values(r.doors)) {
      if (!nb) continue;
      const pairKey = r.id < nb.id ? `${r.id}-${nb.id}` : `${nb.id}-${r.id}`;
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);
      if (discoveredOnly && !r.visited && !nb.visited) continue;

      const x1 = toMapX(r.cx);
      const y1 = toMapY(r.cz);
      const x2 = toMapX(nb.cx);
      const y2 = toMapY(nb.cz);
      const bothVis = !discoveredOnly || (r.visited && nb.visited);

      ctx.save();
      ctx.lineCap = 'round';
      if (bothVis) {
        ctx.strokeStyle = 'rgba(3, 6, 12, 0.92)';
        ctx.lineWidth = corrBaseW + 2.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(230, 198, 132, 0.88)';
        ctx.lineWidth = corrBaseW;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(106, 124, 158, 0.44)';
        ctx.lineWidth = Math.max(1.5, corrBaseW * 0.58);
        ctx.setLineDash([2.8, 2.6]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 3. Rooms: stark bright/lit (visited) vs dark/fogged (unvisited) + colored vector icons
  for (const r of dungeon.rooms) {
    const vis = !discoveredOnly || !!r.visited;
    const known = vis || Object.values(r.doors).some((nb) => nb && nb.visited);
    if (!known) continue;

    const mx = toMapX(r.cx);
    const my = toMapY(r.cz);
    const rw = Math.max(isExpanded ? 24 : 15, r.halfW * 2 * scale * 0.86);
    const rh = Math.max(isExpanded ? 20 : 13, r.halfD * 2 * scale * 0.86);
    const rrw = Math.round(rw);
    const rrh = Math.round(rh);
    const rx = Math.round(mx - rrw * 0.5) + 0.5;
    const ry = Math.round(my - rrh * 0.5) + 0.5;
    const rad = Math.min(isExpanded ? 4.5 : 3.2, Math.min(rrw, rrh) * 0.2);

    const iconSpec = resolveMinimapRoomSpec(r, vis);
    const palette = MINIMAP_ICON_PALETTE[iconSpec.primary] || MINIMAP_ICON_PALETTE.combat;

    ctx.save();
    if (!vis) {
      // Unvisited room: pitch-dark shrouded tile + diagonal mist stripes + dim dashed border
      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.fillStyle = 'rgba(7, 10, 18, 0.96)';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(122, 144, 184, 0.11)';
      ctx.lineWidth = 1;
      const step = isExpanded ? 6 : 4.5;
      ctx.beginPath();
      for (let d = -rrh; d < rrw + rrh; d += step) {
        ctx.moveTo(rx + d, ry);
        ctx.lineTo(rx + d - rrh, ry + rrh);
      }
      ctx.stroke();
      ctx.restore();

      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.strokeStyle = 'rgba(116, 136, 172, 0.50)';
      ctx.lineWidth = 1.05;
      ctx.setLineDash([2.8, 2.2]);
      ctx.stroke();
    } else if (r === currentRoom) {
      // Current room: glowing sunlit gold (or crimson-gold if in active combat)
      ctx.shadowColor = r.cleared ? 'rgba(255, 214, 108, 0.58)' : 'rgba(255, 92, 108, 0.62)';
      ctx.shadowBlur = isExpanded ? 11 : 7;
      const grad = ctx.createLinearGradient(rx, ry, rx, ry + rrh);
      if (r.cleared) {
        grad.addColorStop(0, 'rgba(154, 122, 62, 0.97)');
        grad.addColorStop(1, 'rgba(96, 74, 35, 0.97)');
      } else {
        grad.addColorStop(0, 'rgba(176, 56, 60, 0.97)');
        grad.addColorStop(1, 'rgba(112, 30, 36, 0.97)');
      }
      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner top bevel
      ctx.strokeStyle = 'rgba(255, 246, 210, 0.40)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + rad, ry + 1);
      ctx.lineTo(rx + rrw - rad, ry + 1);
      ctx.stroke();

      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.strokeStyle = r.cleared ? '#ffe48f' : '#ff8592';
      ctx.lineWidth = isExpanded ? 2.2 : 1.9;
      ctx.stroke();
    } else if (r.cleared) {
      // Visited & cleared room: unmistakably bright illuminated cool-stone tile
      const grad = ctx.createLinearGradient(rx, ry, rx, ry + rrh);
      grad.addColorStop(0, 'rgba(84, 114, 150, 0.96)');
      grad.addColorStop(1, 'rgba(52, 74, 102, 0.96)');
      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle room-type tint wash
      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.fillStyle = palette.tint;
      ctx.fill();

      // Crisp top light highlight
      ctx.strokeStyle = 'rgba(226, 242, 255, 0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + rad, ry + 1);
      ctx.lineTo(rx + rrw - rad, ry + 1);
      ctx.stroke();

      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.strokeStyle = 'rgba(198, 222, 248, 0.88)';
      ctx.lineWidth = 1.35;
      ctx.stroke();
    } else {
      // Visited & uncleared combat room: lit crimson-ember tile
      const grad = ctx.createLinearGradient(rx, ry, rx, ry + rrh);
      grad.addColorStop(0, 'rgba(162, 42, 56, 0.96)');
      grad.addColorStop(1, 'rgba(100, 22, 32, 0.96)');
      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.fillStyle = grad;
      ctx.fill();

      traceRoundRect(ctx, rx, ry, rrw, rrh, rad);
      ctx.strokeStyle = '#ff6476';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    // 4. Crisp colored room-type vector icon
    const minDim = Math.min(rrw, rrh);
    const badgeR = Math.max(isExpanded ? 8.4 : 5.8, Math.min(isExpanded ? 12.6 : 8.5, minDim * 0.42));
    drawMinimapVectorIcon(ctx, iconSpec.primary, mx, my, badgeR, vis, iconSpec.depleted);

    // Secondary corner mini-badge when an extra curio/weapon coexists in the room
    if (iconSpec.badge) {
      const subR = Math.max(isExpanded ? 5.2 : 3.8, badgeR * 0.54);
      const bx = rx + rrw - subR * 0.55;
      const by = ry + subR * 0.55;
      drawMinimapVectorIcon(ctx, iconSpec.badge, bx, by, subR, true, false);
    }
  }

  // 5. Player directional beacon
  if (hero) {
    const hx = toMapX(hero.x);
    const hy = toMapY(hero.z);
    const pR = isExpanded ? 3.6 : 2.8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, pR + (isExpanded ? 2.6 : 2.0), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124, 232, 255, 0.25)';
    ctx.fill();

    if (Number.isFinite(hero.yaw)) {
      const dx = Math.sin(hero.yaw);
      const dy = Math.cos(hero.yaw);
      const tipDist = pR + (isExpanded ? 3.2 : 2.4);
      ctx.beginPath();
      ctx.moveTo(hx + dx * tipDist, hy + dy * tipDist);
      ctx.lineTo(hx - dy * pR * 0.85, hy + dx * pR * 0.85);
      ctx.lineTo(hx + dy * pR * 0.85, hy - dx * pR * 0.85);
      ctx.closePath();
      ctx.fillStyle = '#7ce8ff';
      ctx.strokeStyle = '#050811';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(hx, hy, pR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#050811';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  // 6. Co-op allies
  if (Array.isArray(allies) && allies.length > 0) {
    for (const al of allies) {
      if (!al || !Number.isFinite(al.x) || !Number.isFinite(al.z)) continue;
      const ax = toMapX(al.x);
      const ay = toMapY(al.z);
      ctx.save();
      ctx.fillStyle = al.downed ? '#ff4d6d' : (al.color || '#5ec2ff');
      ctx.beginPath();
      ctx.arc(ax, ay, al.downed ? 3.6 : 2.8, 0, Math.PI * 2);
      ctx.strokeStyle = al.downed ? '#ffffff' : '#050811';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }
}

const MINIMAP_ICON_PALETTE = {
  start:     { main: '#5cc8ff', hi: '#d9f4ff', ring: 'rgba(92, 200, 255, 0.72)',  tint: 'rgba(92, 200, 255, 0.08)' },
  combat:    { main: '#ff8c42', hi: '#ffd2b0', ring: 'rgba(255, 140, 66, 0.68)',  tint: 'rgba(255, 140, 66, 0.07)' },
  elite:     { main: '#c77dff', hi: '#f2d9ff', ring: 'rgba(199, 125, 255, 0.78)', tint: 'rgba(199, 125, 255, 0.12)' },
  vault:     { main: '#ffc83d', hi: '#fff3b8', ring: 'rgba(255, 200, 61, 0.80)',  tint: 'rgba(255, 200, 61, 0.12)' },
  sanctuary: { main: '#2ee88e', hi: '#c2ffe2', ring: 'rgba(46, 232, 142, 0.78)',  tint: 'rgba(46, 232, 142, 0.12)' },
  boss:      { main: '#ff4757', hi: '#ffb3ba', ring: 'rgba(255, 71, 87, 0.84)',   tint: 'rgba(255, 71, 87, 0.14)' },
  portal:    { main: '#33e8ff', hi: '#dcffff', ring: 'rgba(51, 232, 255, 0.86)',  tint: 'rgba(51, 232, 255, 0.15)' },
  weapon:    { main: '#ffaa33', hi: '#ffebb3', ring: 'rgba(255, 170, 51, 0.82)',  tint: 'rgba(255, 170, 51, 0.11)' },
  trial:     { main: '#ff5ca8', hi: '#ffc4e1', ring: 'rgba(255, 92, 168, 0.82)',  tint: 'rgba(255, 92, 168, 0.12)' },
  cache:     { main: '#4df7d4', hi: '#c9fff3', ring: 'rgba(77, 247, 212, 0.80)',  tint: 'rgba(77, 247, 212, 0.10)' }
};

function traceRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function resolveMinimapRoomSpec(r, vis) {
  const inters = Array.isArray(r.interactables) ? r.interactables : [];
  const hasUnusedObelisk = vis && inters.some((i) => !i.used && i.kind === 'trial_obelisk');
  const hasUnusedWeapon = vis && inters.some((i) => !i.used && i.kind === 'weapon_pedestal');
  const hasUnusedCache = vis && inters.some((i) => !i.used && i.kind === 'soul_cache');
  const hasVaultChest = inters.some((i) => i.kind === 'vault_chest');
  const hasUnusedVault = !vis || !hasVaultChest || inters.some((i) => !i.used && i.kind === 'vault_chest');
  const hasSpring = inters.some((i) => i.kind === 'healing_font');
  const hasUnusedSpring = !vis || !hasSpring || inters.some((i) => !i.used && i.kind === 'healing_font');

  if (r.hasPortal) {
    return { primary: 'portal', depleted: false, badge: hasUnusedWeapon ? 'weapon' : null };
  }
  if (r.type === 'boss') {
    return { primary: 'boss', depleted: vis && !!r.cleared, badge: hasUnusedWeapon ? 'weapon' : null };
  }
  if (r.type === 'vault') {
    return {
      primary: 'vault',
      depleted: vis && !hasUnusedVault,
      badge: hasUnusedWeapon ? 'weapon' : (hasUnusedCache ? 'cache' : null)
    };
  }
  if (r.type === 'sanctuary') {
    return { primary: 'sanctuary', depleted: vis && !hasUnusedSpring, badge: hasUnusedWeapon ? 'weapon' : null };
  }
  if (r.type === 'elite') {
    return { primary: 'elite', depleted: false, badge: hasUnusedWeapon ? 'weapon' : null };
  }
  if (r.type === 'start') {
    if (hasUnusedWeapon) return { primary: 'weapon', depleted: false, badge: null };
    return { primary: 'start', depleted: false, badge: null };
  }
  // combat rooms
  if (vis && r.cleared) {
    if (hasUnusedWeapon) return { primary: 'weapon', depleted: false, badge: null };
    if (hasUnusedObelisk) return { primary: 'trial', depleted: false, badge: hasUnusedCache ? 'cache' : null };
    if (hasUnusedCache) return { primary: 'cache', depleted: false, badge: null };
    return { primary: 'combat', depleted: true, badge: null };
  }
  let combatBadge = null;
  if (hasUnusedObelisk) combatBadge = 'trial';
  else if (hasUnusedWeapon) combatBadge = 'weapon';
  else if (hasUnusedCache) combatBadge = 'cache';
  return { primary: 'combat', depleted: false, badge: combatBadge };
}

function drawMinimapVectorIcon(ctx, kind, cx, cy, badgeR, vis, depleted) {
  const pal = MINIMAP_ICON_PALETTE[kind] || MINIMAP_ICON_PALETTE.combat;
  const s = badgeR * 0.72;
  const lw = Math.max(1.15, badgeR * 0.20);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // High-contrast dark medallion backing + colored ring
  ctx.beginPath();
  ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = vis ? 'rgba(8, 12, 22, 0.84)' : 'rgba(5, 8, 15, 0.90)';
  ctx.fill();
  ctx.strokeStyle = pal.main;
  ctx.globalAlpha = !vis ? 0.48 : (depleted ? (kind === 'combat' ? 0.62 : 0.38) : 0.84);
  ctx.lineWidth = Math.max(0.95, badgeR * 0.14);
  ctx.stroke();

  ctx.globalAlpha = !vis ? 0.78 : (depleted ? (kind === 'combat' ? 0.82 : 0.48) : 1.0);
  ctx.strokeStyle = pal.main;
  ctx.fillStyle = pal.main;
  ctx.lineWidth = lw;

  if (kind === 'combat') {
    // Crossed Swords
    ctx.beginPath();
    ctx.moveTo(-0.75 * s, 0.75 * s);
    ctx.lineTo(0.75 * s, -0.75 * s);
    ctx.moveTo(-0.56 * s, 0.18 * s);
    ctx.lineTo(-0.18 * s, 0.56 * s);
    ctx.moveTo(0.75 * s, 0.75 * s);
    ctx.lineTo(-0.75 * s, -0.75 * s);
    ctx.moveTo(0.18 * s, 0.56 * s);
    ctx.lineTo(0.56 * s, 0.18 * s);
    ctx.stroke();
  } else if (kind === 'elite') {
    // 3-Pointed Royal Violet Crown
    ctx.beginPath();
    ctx.moveTo(-0.74 * s, 0.56 * s);
    ctx.lineTo(-0.84 * s, -0.34 * s);
    ctx.lineTo(-0.30 * s, 0.12 * s);
    ctx.lineTo(0, -0.78 * s);
    ctx.lineTo(0.30 * s, 0.12 * s);
    ctx.lineTo(0.84 * s, -0.34 * s);
    ctx.lineTo(0.74 * s, 0.56 * s);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.38;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = Math.max(1.05, lw * 0.85);
    ctx.stroke();
  } else if (kind === 'boss') {
    // Horned Boss Skull
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = Math.max(1.1, lw * 0.9);
    ctx.beginPath();
    ctx.moveTo(-0.38 * s, -0.22 * s);
    ctx.quadraticCurveTo(-0.88 * s, -0.34 * s, -0.88 * s, -0.82 * s);
    ctx.moveTo(0.38 * s, -0.22 * s);
    ctx.quadraticCurveTo(0.88 * s, -0.34 * s, 0.88 * s, -0.82 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -0.06 * s, 0.58 * s, Math.PI, 0, false);
    ctx.lineTo(0.42 * s, 0.68 * s);
    ctx.lineTo(-0.42 * s, 0.68 * s);
    ctx.closePath();
    ctx.fillStyle = pal.main;
    ctx.fill();

    ctx.fillStyle = vis && !depleted ? '#fff3a1' : '#120408';
    ctx.beginPath();
    ctx.arc(-0.22 * s, -0.02 * s, Math.max(0.85, 0.16 * s), 0, Math.PI * 2);
    ctx.arc(0.22 * s, -0.02 * s, Math.max(0.85, 0.16 * s), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'vault') {
    // Radiant Treasure Chest
    ctx.beginPath();
    ctx.moveTo(-0.76 * s, -0.12 * s);
    ctx.quadraticCurveTo(-0.76 * s, -0.68 * s, 0, -0.68 * s);
    ctx.quadraticCurveTo(0.76 * s, -0.68 * s, 0.76 * s, -0.12 * s);
    ctx.lineTo(0.76 * s, 0.66 * s);
    ctx.lineTo(-0.76 * s, 0.66 * s);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.36;
    ctx.fill();
    ctx.restore();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-0.76 * s, -0.06 * s);
    ctx.lineTo(0.76 * s, -0.06 * s);
    ctx.stroke();

    ctx.fillStyle = pal.hi;
    ctx.beginPath();
    ctx.arc(0, -0.06 * s, Math.max(1.0, 0.22 * s), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'sanctuary') {
    // Emerald Sacred Cross
    const arm = 0.78 * s;
    const th = 0.29 * s;
    ctx.beginPath();
    ctx.moveTo(-th, -arm);
    ctx.lineTo(th, -arm);
    ctx.lineTo(th, -th);
    ctx.lineTo(arm, -th);
    ctx.lineTo(arm, th);
    ctx.lineTo(th, th);
    ctx.lineTo(th, arm);
    ctx.lineTo(-th, arm);
    ctx.lineTo(-th, th);
    ctx.lineTo(-arm, th);
    ctx.lineTo(-arm, -th);
    ctx.lineTo(-th, -th);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = Math.max(0.8, lw * 0.55);
    ctx.stroke();
  } else if (kind === 'portal') {
    // Swirling Cyan Astral Portal
    ctx.beginPath();
    ctx.arc(0, 0, 0.76 * s, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -0.98 * s); ctx.lineTo(0, -0.64 * s);
    ctx.moveTo(0, 0.64 * s);  ctx.lineTo(0, 0.98 * s);
    ctx.moveTo(-0.98 * s, 0); ctx.lineTo(-0.64 * s, 0);
    ctx.moveTo(0.64 * s, 0);  ctx.lineTo(0.98 * s, 0);
    ctx.stroke();

    ctx.fillStyle = pal.hi;
    ctx.beginPath();
    ctx.moveTo(0, -0.44 * s);
    ctx.lineTo(0.44 * s, 0);
    ctx.lineTo(0, 0.44 * s);
    ctx.lineTo(-0.44 * s, 0);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'weapon') {
    // Vertical Broadsword
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = Math.max(1.25, lw * 1.05);
    ctx.beginPath();
    ctx.moveTo(0, -0.86 * s);
    ctx.lineTo(0, 0.34 * s);
    ctx.stroke();

    ctx.strokeStyle = pal.main;
    ctx.lineWidth = Math.max(1.15, lw * 0.95);
    ctx.beginPath();
    ctx.moveTo(-0.56 * s, 0.28 * s);
    ctx.lineTo(0.56 * s, 0.28 * s);
    ctx.moveTo(0, 0.28 * s);
    ctx.lineTo(0, 0.82 * s);
    ctx.stroke();
  } else if (kind === 'trial') {
    // Crimson-Magenta Trial Obelisk
    ctx.beginPath();
    ctx.moveTo(0, -0.88 * s);
    ctx.lineTo(0.44 * s, 0.56 * s);
    ctx.lineTo(-0.44 * s, 0.56 * s);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.42;
    ctx.fill();
    ctx.restore();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-0.68 * s, 0.68 * s);
    ctx.lineTo(0.68 * s, 0.68 * s);
    ctx.stroke();

    ctx.fillStyle = pal.hi;
    ctx.beginPath();
    ctx.arc(0, -0.08 * s, Math.max(0.9, 0.18 * s), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'cache') {
    // Turquoise Faceted Soul Gem
    ctx.beginPath();
    ctx.moveTo(0, -0.84 * s);
    ctx.lineTo(0.74 * s, 0);
    ctx.lineTo(0, 0.84 * s);
    ctx.lineTo(-0.74 * s, 0);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.34;
    ctx.fill();
    ctx.restore();
    ctx.stroke();

    ctx.fillStyle = pal.hi;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.9, 0.22 * s), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Start Narthex Sanctuary Compass
    ctx.beginPath();
    ctx.moveTo(0, -0.82 * s);
    ctx.lineTo(0.82 * s, 0);
    ctx.lineTo(0, 0.82 * s);
    ctx.lineTo(-0.82 * s, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = pal.hi;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.0, 0.28 * s), 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny emerald completion dot on visited depleted rooms
  if (vis && depleted) {
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(badgeR * 0.68, badgeR * 0.68, Math.max(1.4, badgeR * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = '#38ef94';
    ctx.strokeStyle = '#050811';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fill();
  }

  ctx.restore();
}

function buildAmbientMoteField(root, tex, biome) {
  const count = 120;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = 0.5 + Math.random() * 6.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: tex.softParticleTex,
    color: biome.palette.brazierCoreHex,
    size: biome.archStyle === 'foundry' ? 0.28 : 0.24,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pts = markIgnoreAO(new THREE.Points(geo, mat));
  root.add(pts);

  const riseSpeed = biome.liquidMode === 'water' ? -1.6 : (biome.archStyle === 'foundry' ? 1.25 : 0.45);
  return {
    points: pts,
    update(dt, time, heroX, heroZ) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        arr[ix] += Math.sin(time * 0.9 + seeds[i]) * dt * 0.25;
        arr[ix + 1] += riseSpeed * dt;
        const outY = riseSpeed < 0 ? arr[ix + 1] < 0.2 : arr[ix + 1] > 7.2;
        const farXZ = Math.abs(arr[ix] - heroX) > 22 || Math.abs(arr[ix + 2] - heroZ) > 22;
        if (outY || farXZ) {
          arr[ix + 1] = riseSpeed < 0 ? 6.8 : 0.3 + Math.random() * 2.0;
          arr[ix] = heroX + (Math.random() - 0.5) * 30;
          arr[ix + 2] = heroZ + (Math.random() - 0.5) * 30;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    }
  };
}

export function buildBiomeDungeonWorld({
  renderer,
  scene,
  baseTex,
  biomeId = null,
  depth = 1,
  variant = null,
  seed = null,
  rng = null,
  roomsBlueprint = null,
  targetRoomCount = 8,
  isMobile = false,
  applySceneAtmosphere = true,
  lights = null
}) {
  const seededRng = rng || (seed !== null ? createSeededRng(seed) : Math.random);
  const biome = biomeId && BIOME_BY_ID[biomeId]
    ? BIOME_BY_ID[biomeId]
    : pickBiomeForFloor(depth, { variant, rng: seededRng });

  const tex = getBiomeTexturePack(renderer, baseTex, biome);
  if (applySceneAtmosphere) {
    applyBiomeAtmosphere(biome, {
      renderer,
      scene,
      texPack: tex,
      moonLight: lights ? lights.moonLight : null,
      warmFill: lights ? lights.warmFill : null,
      hemiLight: lights ? lights.hemiLight : null
    });
  }

  const root = new THREE.Group();
  root.name = `dungeon_world_${biome.id}`;
  scene.add(root);

  const generated = roomsBlueprint
    ? { seed: seed || 0, rooms: roomsBlueprint }
    : generateRandomDungeonGraph({ biome, seed, rng: seededRng, targetRoomCount });

  const rooms = generated.rooms;
  const roomsGroup = new THREE.Group();
  roomsGroup.name = 'modular_rooms';
  const corridorsGroup = new THREE.Group();
  corridorsGroup.name = 'modular_corridors';
  root.add(roomsGroup, corridorsGroup);

  const corridors = [];
  const gates = [];
  const allBraziers = [];
  const allTraps = [];
  const destructibles = [];
  const interactables = [];
  const dynamicPointLights = [];
  const animCallbacks = [];
  const floorMeshes = [];
  const floorFootprints = [];
  const wallSolids = [];

  const pal = biome.palette;
  const isObsidian = biome.archStyle === 'obsidian';

  const rtSize = isMobile ? 256 : 384;
  const reflRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    samples: isMobile ? 0 : 2,
    depthBuffer: true
  });
  const reflCamera = new THREE.PerspectiveCamera();
  const reflMatrix = new THREE.Matrix4();
  const clipPlane = new THREE.Vector4();
  const qVec = new THREE.Vector4();
  const reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const reflLastCamPos = new THREE.Vector3(1e6, 1e6, 1e6);
  const reflLastCamQuat = new THREE.Quaternion();
  let reflFrameCount = 0;

  const floorUniforms = {
    uReflectTex: { value: reflRT.texture },
    uReflectMatrix: { value: reflMatrix },
    uPuddleMask: { value: tex.puddleMask },
    uVeinMask: { value: tex.veinMaskTex },
    uRippleNormal: { value: tex.rippleNormal },
    uTime: { value: 0 },
    uHeroPos: { value: new THREE.Vector3() },
    uWakeStrength: { value: 0.0 },
    uLiquidTint: { value: new THREE.Vector3(...pal.liquidTint) },
    uVeinEmissive: { value: new THREE.Vector3(...pal.veinEmissive) },
    uReflStrength: { value: pal.reflStrength },
    uRainDrops: { value: biome.liquidMode === 'water' ? 1.0 : (isObsidian ? 0.0 : 0.25) },
    uWaterRippleAmp: { value: isObsidian ? 0.0 : 1.0 },
    uReflMipLod: { value: isObsidian ? 2.2 : 0.85 }
  };

  const floorNormScale = isObsidian ? 0.32 : 1.05;
  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.floorAlbedo,
    aoMap: tex.floorORM,
    aoMapIntensity: 1.18,
    roughnessMap: tex.floorORM,
    roughness: 1.0,
    metalnessMap: tex.floorORM,
    metalness: 1.0,
    normalMap: tex.floorNormal,
    normalScale: new THREE.Vector2(floorNormScale, floorNormScale),
    envMapIntensity: isObsidian ? 0.72 : 1.15
  });

  floorMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform mat4 uReflectMatrix;
         varying vec4 vReflectUv;
         varying vec3 vWorldFloor;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vec4 wpFloor = modelMatrix * vec4(position, 1.0);
         vWorldFloor = wpFloor.xyz;
         vReflectUv = uReflectMatrix * wpFloor;
         #ifdef USE_MAP
           vMapUv = wpFloor.xz * 0.145;
         #endif
         #ifdef USE_NORMALMAP
           vNormalMapUv = wpFloor.xz * 0.145;
         #endif
         #ifdef USE_ROUGHNESSMAP
           vRoughnessMapUv = wpFloor.xz * 0.145;
         #endif
         #ifdef USE_METALNESSMAP
           vMetalnessMapUv = wpFloor.xz * 0.145;
         #endif
         #ifdef USE_AOMAP
           vAoMapUv = wpFloor.xz * 0.145;
         #endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uReflectTex;
         uniform sampler2D uPuddleMask;
         uniform sampler2D uVeinMask;
         uniform sampler2D uRippleNormal;
         uniform float uTime;
         uniform vec3 uHeroPos;
         uniform float uWakeStrength;
         uniform vec3 uLiquidTint;
         uniform vec3 uVeinEmissive;
         uniform float uReflStrength;
         uniform float uRainDrops;
         uniform float uWaterRippleAmp;
         uniform float uReflMipLod;
         varying vec4 vReflectUv;
         varying vec3 vWorldFloor;

         vec2 rainRipple(vec2 p, float t) {
           vec2 cell = floor(p);
           vec2 f = fract(p) - 0.5;
           float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
           float life = fract(t * 0.65 + rnd);
           vec2 center = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.42;
           vec2 d = f - center;
           float r = length(d);
           float ring = sin((r - life * 0.40) * 34.0) * exp(-r * 8.5) * (1.0 - life) * smoothstep(0.0, 0.08, r);
           return (r > 0.001 ? d / r : vec2(0.0)) * ring;
         }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         if (uWaterRippleAmp > 0.001) {
           vec2 pudUv = vWorldFloor.xz * 0.055;
           float puddleAmt = texture2D(uPuddleMask, pudUv).r;
           vec2 rUv1 = vWorldFloor.xz * 0.28 + vec2(uTime * 0.012, uTime * 0.009);
           vec2 rUv2 = vWorldFloor.xz * 0.39 - vec2(uTime * 0.010, uTime * 0.014);
           vec3 ripN = normalize(
             (texture2D(uRippleNormal, rUv1).xyz * 2.0 - 1.0) +
             (texture2D(uRippleNormal, rUv2).xyz * 2.0 - 1.0)
           );
           vec2 drops = rainRipple(vWorldFloor.xz * 1.15, uTime) * uRainDrops;
           vec2 toHero = vWorldFloor.xz - uHeroPos.xz;
           float hd = length(toHero);
           vec2 wake = (hd > 0.08 && hd < 1.65)
             ? (toHero / hd) * sin(hd * 5.2 - uTime * 4.2) * exp(-hd * 2.2) * (0.065 * uWakeStrength)
             : vec2(0.0);
           vec3 waterN = normalize(vec3((ripN.xy * 0.075 + drops * 0.12 + wake) * uWaterRippleAmp, 1.0));
           vec3 worldWaterN = normalize(mat3(viewMatrix) * vec3(waterN.x, 1.0, waterN.y));
           normal = normalize(mix(normal, worldWaterN, smoothstep(0.34, 0.82, puddleAmt) * uWaterRippleAmp));
         }`
      )
      .replace(
        '#include <dithering_fragment>',
        `float puddle = texture2D(uPuddleMask, vWorldFloor.xz * 0.055).r;
         float vein = texture2D(uVeinMask, vWorldFloor.xz * 0.145).r;
         float veinPulse = 0.86 + 0.14 * sin(uTime * 1.8 + vWorldFloor.x * 0.25 + vWorldFloor.z * 0.25);
         gl_FragColor.rgb += uVeinEmissive * vein * veinPulse;
         if (puddle > 0.06 && vReflectUv.w > 0.0) {
           vec2 dropsR = rainRipple(vWorldFloor.xz * 1.15, uTime) * 0.012 * uRainDrops;
           vec2 rOff = ((texture2D(uRippleNormal, vWorldFloor.xz * 0.30 + uTime * 0.014).xy * 2.0 - 1.0) * 0.016 + dropsR) * puddle * uWaterRippleAmp;
           vec4 projUv = vReflectUv;
           projUv.xy += rOff * projUv.w;
           vec2 uvClamped = clamp(projUv.xy / projUv.w, vec2(0.002), vec2(0.998));
           vec3 reflCol = min(textureLod(uReflectTex, uvClamped, uReflMipLod).rgb * uLiquidTint, vec3(1.15));
           vec3 viewDirW = normalize(cameraPosition - vWorldFloor);
           float fresnel = 0.14 + 0.86 * pow(clamp(1.0 - max(dot(viewDirW, vec3(0.0, 1.0, 0.0)), 0.0), 0.0, 1.0), 3.0);
           float reflMix = clamp(puddle * fresnel * uReflStrength, 0.0, 0.82);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, reflCol * 0.94, reflMix);
         }
         #include <dithering_fragment>`
      );
  };

  const mats = createBiomeMaterialSet(tex, biome);

  const lightSlots = [];
  for (let i = 0; i < 8; i++) {
    const pl = new THREE.PointLight(pal.brazierCoreHex, 0, 16.5, 1.7);
    scene.add(pl);
    dynamicPointLights.push(pl);
    lightSlots.push({ light: pl, brazier: null });
  }

  const spikeSteelMat = new THREE.MeshStandardMaterial({
    color: biome.archStyle === 'astral' ? pal.propPrimaryHex : (biome.archStyle === 'ossuary' ? 0xd8ceb8 : 0xb9c2d0),
    roughnessMap: tex.metalORM,
    roughness: 0.30,
    metalness: biome.archStyle === 'ossuary' ? 0.18 : 0.88,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.45, 0.45)
  });
  spikeSteelMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldSpikeY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldSpikeY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldSpikeY;')
      .replace('#include <clipping_planes_fragment>', 'if (vWorldSpikeY < 0.015) discard;\n#include <clipping_planes_fragment>');
  };

  const trapPlateMat = new THREE.MeshStandardMaterial({
    map: tex.trapPlateTex,
    color: pal.wallTintHex,
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.76,
    metalness: 0.34,
    transparent: true,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });

  const spikeConeParts = [];
  for (let sx = -1; sx <= 1; sx++) {
    for (let sz = -1; sz <= 1; sz++) {
      const sc = new THREE.ConeGeometry(0.082, 0.74, 8);
      sc.translate(sx * 0.576, 0.37, sz * 0.576);
      spikeConeParts.push(sc);
    }
  }
  const sharedSpikesGeo = mergeGeometries(spikeConeParts, false);
  for (const sc of spikeConeParts) sc.dispose();

  const trapBuilder = (parent, room, x, z, phaseOffset = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const plate = markIgnoreAO(new THREE.Mesh(new THREE.PlaneGeometry(2.16, 2.16), trapPlateMat));
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.008;
    plate.receiveShadow = true;
    g.add(plate);

    [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]].forEach(([rx, rz]) => {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.045, 8), mats.trimMat);
      bolt.position.set(rx, 0.022, rz);
      bolt.receiveShadow = true;
      g.add(bolt);
    });

    const runeWarnMat = new THREE.MeshBasicMaterial({
      map: tex.trapGlowTex,
      color: pal.trapGlowHex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const warnPlane = markIgnoreAO(new THREE.Mesh(new THREE.PlaneGeometry(2.16, 2.16), runeWarnMat));
    warnPlane.rotation.x = -Math.PI / 2;
    warnPlane.position.y = 0.014;
    warnPlane.visible = false;
    warnPlane.userData.dynamicSubtree = true;
    g.add(warnPlane);

    const spikesGroup = new THREE.Group();
    spikesGroup.position.y = -0.78;
    spikesGroup.visible = false;
    spikesGroup.userData.dynamicSubtree = true;
    for (let sx = -1; sx <= 1; sx++) {
      for (let sz = -1; sz <= 1; sz++) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.024, 6, 12), mats.darkMetalMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(sx * 0.576, 0.016, sz * 0.576);
        g.add(collar);
      }
    }
    const spBatch = markIgnoreAO(new THREE.Mesh(sharedSpikesGeo, spikeSteelMat));
    spBatch.castShadow = true;
    spikesGroup.add(spBatch);
    g.add(spikesGroup);
    parent.add(g);

    const trap = {
      room,
      x,
      z,
      half: 0.96,
      phase: phaseOffset,
      cycle: 3.6,
      spikesGroup,
      warnPlane,
      runeWarnMat,
      activeHit: false
    };
    allTraps.push(trap);
    room.traps.push(trap);
  };

  const anvilBuilder = (parent, room, ax, az) => {
    const anvilG = new THREE.Group();
    anvilG.position.set(ax, 0, az);
    const aPed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.1), mats.capMat);
    aPed.position.y = 0.275;
    aPed.castShadow = true;
    anvilG.add(aPed);
    const aBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 0.62), mats.darkMetalMat);
    aBody.position.y = 0.80;
    aBody.castShadow = true;
    anvilG.add(aBody);
    const aHorn = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 6), mats.trimMat);
    aHorn.rotation.z = Math.PI / 2;
    aHorn.position.set(0.75, 0.86, 0);
    anvilG.add(aHorn);
    const emberRune = markIgnoreAO(new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.28),
      new THREE.MeshBasicMaterial({
        map: tex.trapGlowTex,
        color: pal.sigilHex,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    ));
    emberRune.rotation.x = -Math.PI / 2;
    emberRune.position.y = 1.07;
    anvilG.add(emberRune);
    parent.add(anvilG);
    room.colliders.push({ x: ax, z: az, r: 0.88 });
    const inter = {
      kind: 'forge_anvil',
      room,
      x: ax,
      z: az,
      used: false,
      cost: 30,
      uses: 0,
      label: '[F] TEMPER WEAPON (30 CINDERS: +20% DMG & +15 MAX HP)'
    };
    interactables.push(inter);
    room.interactables.push(inter);
  };

  // STEP A: Assemble Independent Room Modules
  for (const room of rooms) {
    room.animCallbacks = [];
    const rGroup = buildRoomModule({
      room,
      biome,
      tex,
      mats,
      floorMat,
      trapBuilder,
      anvilBuilder,
      floorMeshes,
      floorFootprints,
      wallSolids,
      allBraziers,
      destructibles,
      interactables,
      gates,
      animCallbacks: room.animCallbacks
    });
    room.group = rGroup;
    roomsGroup.add(rGroup);
  }

  // STEP B: Assemble Independent Corridor Connector Modules between every linked room pair
  const builtPairs = new Set();
  for (const room of rooms) {
    for (const d of DIRS) {
      const nb = room.doors[d.key];
      if (!nb) continue;
      const pairKey = room.id < nb.id ? `${room.id}-${nb.id}` : `${nb.id}-${room.id}`;
      if (builtPairs.has(pairKey)) continue;
      builtPairs.add(pairKey);

      const { group, corridorRecord } = buildCorridorModule({
        roomA: room,
        roomB: nb,
        dirFromA: d,
        biome,
        mats,
        floorMat,
        floorMeshes,
        floorFootprints,
        wallSolids
      });
      corridorRecord.group = group;
      corridorRecord.roomA = room;
      corridorRecord.roomB = nb;
      corridorsGroup.add(group);
      corridors.push(corridorRecord);
    }
  }

  const floorMeshSet = new Set(floorMeshes);
  for (const d of destructibles) {
    batchStaticMeshesInGroup(d.mesh, floorMeshSet);
  }
  for (const g of gates) {
    batchStaticMeshesInGroup(g.mesh, floorMeshSet);
  }
  for (const room of rooms) {
    batchStaticMeshesInGroup(room.group, floorMeshSet);
  }
  for (const c of corridors) {
    batchStaticMeshesInGroup(c.group, floorMeshSet);
  }

  const moteField = buildAmbientMoteField(root, tex, biome);

  const maxDecals = 90;
  const decalMeshes = [];
  const decalGroup = new THREE.Group();
  decalGroup.userData.ignoreAO = true;
  decalGroup.visible = false;
  root.add(decalGroup);
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < maxDecals; i++) {
    const m = markIgnoreAO(new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: tex.decalTex,
      color: pal.decalHex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4
    })));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -99;
    m.visible = false;
    decalGroup.add(m);
    decalMeshes.push(m);
  }
  let decalCursor = 0;

  function addFloorDecal(x, z, colorHex = pal.decalHex, size = 1.6, opacity = 0.52) {
    decalGroup.visible = true;
    const m = decalMeshes[decalCursor];
    decalCursor = (decalCursor + 1) % maxDecals;
    m.position.set(x, 0.018 + (decalCursor % 6) * 0.0008, z);
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.set(size, size, 1);
    m.material.color.setHex(colorHex);
    m.material.opacity = opacity;
    m.visible = true;
  }

  function isPointWalkable(x, z, pad = 0.42) {
    for (const r of rooms) {
      const inX = x >= r.cx - r.halfW + pad && x <= r.cx + r.halfW - pad;
      const inZ = z >= r.cz - r.halfD + pad && z <= r.cz + r.halfD - pad;
      if (inX && inZ) return true;
      if (!r.locked) {
        if (r.doors.N && Math.abs(x - r.cx) <= PORTAL_CLEAR_HALF - pad && z >= r.cz - r.halfD - 1.2 && z <= r.cz - r.halfD + 1.2) return true;
        if (r.doors.S && Math.abs(x - r.cx) <= PORTAL_CLEAR_HALF - pad && z >= r.cz + r.halfD - 1.2 && z <= r.cz + r.halfD + 1.2) return true;
        if (r.doors.W && Math.abs(z - r.cz) <= PORTAL_CLEAR_HALF - pad && x >= r.cx - r.halfW - 1.2 && x <= r.cx - r.halfW + 1.2) return true;
        if (r.doors.E && Math.abs(z - r.cz) <= PORTAL_CLEAR_HALF - pad && x >= r.cx + r.halfW - 1.2 && x <= r.cx + r.halfW + 1.2) return true;
      }
    }
    for (const c of corridors) {
      const inX = c.axis === 'NS'
        ? (x >= c.walkMinX + pad && x <= c.walkMaxX - pad)
        : (x >= c.walkMinX - 0.8 && x <= c.walkMaxX + 0.8);
      const inZ = c.axis === 'NS'
        ? (z >= c.walkMinZ - 0.8 && z <= c.walkMaxZ + 0.8)
        : (z >= c.walkMinZ + pad && z <= c.walkMaxZ - pad);
      if (inX && inZ) {
        let blockedByGate = false;
        for (const g of gates) {
          if (!g.room.locked) continue;
          const isEWGate = g.dir && g.dir.dx !== 0;
          const hitGate = isEWGate
            ? (Math.abs(x - g.x) < 0.72 + pad && Math.abs(z - g.z) < PORTAL_CLEAR_HALF + 0.35)
            : (Math.abs(z - g.z) < 0.72 + pad && Math.abs(x - g.x) < PORTAL_CLEAR_HALF + 0.35);
          if (hitGate) {
            blockedByGate = true;
            break;
          }
        }
        if (!blockedByGate) return true;
      }
    }
    return false;
  }

  function resolveMovement(entity, prevX, prevZ, radius = 0.45) {
    if (!isPointWalkable(entity.x, entity.z, radius)) {
      if (isPointWalkable(entity.x, prevZ, radius)) {
        entity.z = prevZ;
      } else if (isPointWalkable(prevX, entity.z, radius)) {
        entity.x = prevX;
      } else {
        entity.x = prevX;
        entity.z = prevZ;
      }
    }

    for (const r of rooms) {
      if (Math.abs(entity.x - r.cx) > r.halfW + 3 || Math.abs(entity.z - r.cz) > r.halfD + 3) continue;
      for (const c of r.colliders) {
        const dx = entity.x - c.x;
        const dz = entity.z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = radius + c.r;
        if (d < minD && d > 0.0001) {
          entity.x += (dx / d) * (minD - d);
          entity.z += (dz / d) * (minD - d);
        }
      }
      for (const p of r.props) {
        if (p.broken) continue;
        const dx = entity.x - p.x;
        const dz = entity.z - p.z;
        const d = Math.hypot(dx, dz);
        const minD = radius + p.r;
        if (d < minD && d > 0.0001) {
          entity.x += (dx / d) * (minD - d);
          entity.z += (dz / d) * (minD - d);
        }
      }
    }
  }

  function isPointBlockedByCover(x, z, pad = 0.12) {
    for (const r of rooms) {
      if (Math.abs(x - r.cx) > r.halfW + 3 || Math.abs(z - r.cz) > r.halfD + 3) continue;
      for (const c of r.colliders) {
        const solidR = (c.bulletR !== undefined ? c.bulletR : c.r * 0.84) + pad;
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz <= solidR * solidR) return true;
      }
    }
    return false;
  }

  function isSegmentBlockedByCover(x0, z0, x1, z1, pad = 0.06) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) return false;
    const midX = (x0 + x1) * 0.5;
    const midZ = (z0 + z1) * 0.5;
    const halfSpan = Math.sqrt(lenSq) * 0.5 + 2.5;
    for (const r of rooms) {
      if (Math.abs(midX - r.cx) > r.halfW + halfSpan || Math.abs(midZ - r.cz) > r.halfD + halfSpan) continue;
      for (const c of r.colliders) {
        const R = (c.bulletR !== undefined ? c.bulletR : c.r * 0.80) + pad;
        const t = Math.max(0.02, Math.min(0.98, ((c.x - x0) * dx + (c.z - z0) * dz) / lenSq));
        const px = x0 + dx * t - c.x;
        const pz = z0 + dz * t - c.z;
        if (px * px + pz * pz <= R * R) return true;
      }
    }
    return false;
  }

  function traceProjectileObstruction(x0, z0, x1, z1, pad = 0.12) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const lenSq = dx * dx + dz * dz;
    const midX = (x0 + x1) * 0.5;
    const midZ = (z0 + z1) * 0.5;
    const halfSpan = Math.sqrt(lenSq) * 0.5 + 3.0;

    let bestT = Infinity;
    let bestHit = null;

    for (const r of rooms) {
      if (Math.abs(midX - r.cx) > r.halfW + halfSpan || Math.abs(midZ - r.cz) > r.halfD + halfSpan) continue;
      for (const c of r.colliders) {
        const R = (c.bulletR !== undefined ? c.bulletR : c.r * 0.84) + pad;
        const fx = x0 - c.x;
        const fz = z0 - c.z;
        const dist0Sq = fx * fx + fz * fz;
        if (dist0Sq <= R * R) {
          const fx1 = x1 - c.x;
          const fz1 = z1 - c.z;
          if (fx1 * fx1 + fz1 * fz1 <= R * R || fx * dx + fz * dz < 0) {
            const d0 = Math.sqrt(dist0Sq);
            const len = Math.sqrt(lenSq) || 1;
            const nx = d0 > 0.001 ? fx / d0 : -dx / len;
            const nz = d0 > 0.001 ? fz / d0 : -dz / len;
            bestT = 0;
            bestHit = { kind: 'cover', collider: c, t: 0, x: c.x + nx * R, z: c.z + nz * R, nx, nz };
            break;
          }
        } else if (lenSq > 1e-8) {
          const bHalf = fx * dx + fz * dz;
          if (bHalf < 0) {
            const cTerm = dist0Sq - R * R;
            const disc = bHalf * bHalf - lenSq * cTerm;
            if (disc >= 0) {
              const t = (-bHalf - Math.sqrt(disc)) / lenSq;
              if (t >= 0 && t <= 1 && t < bestT) {
                const hx = x0 + dx * t;
                const hz = z0 + dz * t;
                const invR = 1 / (Math.hypot(hx - c.x, hz - c.z) || 1);
                bestT = t;
                bestHit = { kind: 'cover', collider: c, t, x: hx, z: hz, nx: (hx - c.x) * invR, nz: (hz - c.z) * invR };
              }
            }
          }
        }
      }
      if (bestT === 0) break;
    }

    if (bestHit) {
      if (bestT > 0.5 && !isPointWalkable(midX, midZ, 0.14)) {
        return { kind: 'wall', t: 0.5, x: midX, z: midZ, nx: 0, nz: 0 };
      }
      return bestHit;
    }

    if (!isPointWalkable(midX, midZ, 0.14)) {
      return { kind: 'wall', t: 0.5, x: midX, z: midZ, nx: 0, nz: 0 };
    }
    if (!isPointWalkable(x1, z1, 0.14)) {
      return { kind: 'wall', t: 1, x: x1, z: z1, nx: 0, nz: 0 };
    }
    return null;
  }

  function findRoomAt(x, z) {
    for (const r of rooms) {
      if (Math.abs(x - r.cx) <= r.halfW - 0.6 && Math.abs(z - r.cz) <= r.halfD - 0.6) {
        return r;
      }
    }
    return null;
  }

  let lastVisX = 1e6;
  let lastVisZ = 1e6;
  function updateVisibility(focusX, focusZ, force = false) {
    if (!force && Math.abs(focusX - lastVisX) < 1.2 && Math.abs(focusZ - lastVisZ) < 1.2) return;
    lastVisX = focusX;
    lastVisZ = focusZ;

    let focusRoom = null;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (Math.abs(focusX - r.cx) <= r.halfW + 1.5 && Math.abs(focusZ - r.cz) <= r.halfD + 1.5) {
        focusRoom = r;
        break;
      }
    }

    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (!r.group) continue;
      const dx = Math.max(0, Math.abs(focusX - r.cx) - r.halfW);
      const dz = Math.max(0, Math.abs(focusZ - r.cz) - r.halfD);
      let vis = dx < 28 && dz < 30;
      if (!vis && focusRoom) {
        if (
          r === focusRoom ||
          focusRoom.doors.N === r ||
          focusRoom.doors.S === r ||
          focusRoom.doors.E === r ||
          focusRoom.doors.W === r
        ) {
          vis = true;
        }
      }
      r.group.visible = vis;
    }

    for (let i = 0; i < corridors.length; i++) {
      const c = corridors[i];
      if (!c.group) continue;
      c.group.visible = !!((c.roomA?.group?.visible) || (c.roomB?.group?.visible));
    }
  }

  if (rooms.length > 0) {
    updateVisibility(rooms[0].cx, rooms[0].cz, true);
  }

  function renderPlanarReflection(activeRenderer, camera, extraHideList = null) {
    if (floorUniforms.uReflStrength.value <= 0.01) return;
    camera.updateMatrixWorld();
    const camMovedSq = reflLastCamPos.distanceToSquared(camera.position);
    const quatDot = Math.abs(reflLastCamQuat.dot(camera.quaternion));
    const camJumped = camMovedSq > 0.85 || quatDot < 0.9985;
    reflFrameCount++;
    if (!camJumped && (reflFrameCount & 1) === 1) {
      return;
    }
    reflLastCamPos.copy(camera.position);
    reflLastCamQuat.copy(camera.quaternion);

    reflCamera.copy(camera);
    reflCamera.position.y = -camera.position.y;

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    lookDir.y = -lookDir.y;
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    upVec.y = -upVec.y;
    reflCamera.up.copy(upVec);
    reflCamera.lookAt(reflCamera.position.clone().add(lookDir));
    reflCamera.updateMatrixWorld();

    reflCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflCamera.projectionMatrix.elements[0] *= -1;
    reflCamera.projectionMatrix.elements[8] *= -1;
    reflCamera.projectionMatrix.elements[12] *= -1;

    reflMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    reflMatrix.multiply(reflCamera.projectionMatrix);
    reflMatrix.multiply(reflCamera.matrixWorldInverse);

    reflPlane.set(new THREE.Vector3(0, 1, 0), -0.02);
    reflPlane.applyMatrix4(reflCamera.matrixWorldInverse);
    clipPlane.set(reflPlane.normal.x, reflPlane.normal.y, reflPlane.normal.z, reflPlane.constant);
    const pm = reflCamera.projectionMatrix;
    qVec.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    qVec.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    qVec.z = -1.0;
    qVec.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(qVec));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1.0 - 0.003;
    pm.elements[14] = clipPlane.w;

    for (const fm of floorMeshes) fm.visible = false;
    const prevDecalVis = decalGroup.visible;
    decalGroup.visible = false;
    const hiddenExtras = [];
    if (extraHideList) {
      for (let i = 0; i < extraHideList.length; i++) {
        const obj = extraHideList[i];
        if (obj && obj.visible) {
          obj.visible = false;
          hiddenExtras.push(obj);
        }
      }
    }
    const prevShadowAuto = activeRenderer.shadowMap.autoUpdate;
    activeRenderer.shadowMap.autoUpdate = false;
    const prevTarget = activeRenderer.getRenderTarget();
    const gl = activeRenderer.getContext();
    activeRenderer.setRenderTarget(reflRT);
    activeRenderer.clear();
    gl.frontFace(gl.CW);
    activeRenderer.render(scene, reflCamera);
    gl.frontFace(gl.CCW);
    activeRenderer.setRenderTarget(prevTarget);
    activeRenderer.shadowMap.autoUpdate = prevShadowAuto;
    for (const fm of floorMeshes) fm.visible = true;
    decalGroup.visible = prevDecalVis;
    for (let i = 0; i < hiddenExtras.length; i++) {
      hiddenExtras[i].visible = true;
    }
  }

  const instance = {
    seed: generated.seed,
    biome,
    tex,
    mats,
    root,
    roomsGroup,
    corridorsGroup,
    rooms,
    corridors,
    gates,
    allBraziers,
    allTraps,
    destructibles,
    interactables,
    floorFootprints,
    wallSolids,
    floorUniforms,
    addFloorDecal,
    isPointWalkable,
    isPointBlockedByCover,
    isSegmentBlockedByCover,
    traceProjectileObstruction,
    resolveMovement,
    findRoomAt,
    updateVisibility,
    renderPlanarReflection,
    auditSeams() {
      return auditDungeonSeamIntegrity(instance);
    },
    dispose() {
      for (const pl of dynamicPointLights) scene.remove(pl);
      moteField.dispose();
      sharedSpikesGeo.dispose();
      decalGeo.dispose();
      for (const dm of decalMeshes) {
        if (dm.material) dm.material.dispose();
      }
      const sharedDungeonMats = new Set([
        floorMat,
        spikeSteelMat,
        trapPlateMat,
        ...Object.values(mats)
      ]);
      [roomsGroup, corridorsGroup].forEach((grp) => {
        grp.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material && !sharedDungeonMats.has(obj.material)) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      });
      [mats.wallMat, mats.pillarMat, mats.capMat].forEach((sm) => {
        if (!sm) return;
        if (sm.map) sm.map.dispose();
        if (sm.aoMap) sm.aoMap.dispose();
        if (sm.normalMap) sm.normalMap.dispose();
      });
      for (const sm of sharedDungeonMats) {
        if (sm && typeof sm.dispose === 'function') sm.dispose();
      }
      scene.remove(root);
      reflRT.dispose();
    },
    update(time, dt, heroX, heroZ, heroSpeed = 0) {
      updateVisibility(heroX, heroZ);
      floorUniforms.uTime.value = time;
      floorUniforms.uHeroPos.value.set(heroX, 0, heroZ);
      const targetWake = Math.min(1.0, heroSpeed * 0.18);
      floorUniforms.uWakeStrength.value += (targetWake - floorUniforms.uWakeStrength.value) * Math.min(1, dt * 6.0);

      moteField.update(dt, time, heroX, heroZ);
      for (let i = 0; i < animCallbacks.length; i++) {
        animCallbacks[i](time, dt);
      }
      for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
        const rm = rooms[rIdx];
        if (rm.group && !rm.group.visible) continue;
        const cbs = rm.animCallbacks;
        if (cbs) {
          for (let i = 0; i < cbs.length; i++) cbs[i](time, dt);
        }
      }

      // Hysteresis-stabilized light ranking: already-bound braziers get a 3.5m retention margin
      // and full steady brightness within 26m so walking inside any chamber never modulates floor reflections.
      const effDist = (b) => Math.hypot(b.x - heroX, b.z - heroZ) - (b.slotIndex !== -1 ? 3.5 : 0.0);
      const ranked = [...allBraziers].sort(
        (a, b) => effDist(a) - effDist(b)
      );
      const desiredSet = new Set(ranked.slice(0, 8).filter((b) => Math.hypot(b.x - heroX, b.z - heroZ) < 38));

      for (const slot of lightSlots) {
        if (!slot.brazier) continue;
        const b = slot.brazier;
        const d = Math.hypot(b.x - heroX, b.z - heroZ);
        const distAtten = Math.max(0, Math.min(1, (38.0 - d) / 12.0));
        const targetW = desiredSet.has(b) ? distAtten : 0.0;
        b.fadeWeight += (targetW - b.fadeWeight) * Math.min(1, dt * 3.0);
        if (!desiredSet.has(b) && b.fadeWeight < 0.015) {
          b.fadeWeight = 0;
          b.slotIndex = -1;
          slot.brazier = null;
          slot.light.intensity = 0;
        }
      }

      for (const b of desiredSet) {
        if (b.slotIndex !== -1) continue;
        const freeIdx = lightSlots.findIndex((s) => s.brazier === null);
        if (freeIdx !== -1) {
          b.slotIndex = freeIdx;
          b.fadeWeight = 0.02;
          lightSlots[freeIdx].brazier = b;
        }
      }

      for (const slot of lightSlots) {
        const pl = slot.light;
        const b = slot.brazier;
        if (b) {
          const flickScale = isObsidian ? 0.24 : 1.0;
          const flick = (Math.sin(time * 3.2 + b.phase) * 0.45 + Math.sin(time * 5.4 + b.phase * 1.7) * 0.18) * flickScale;
          pl.color.setHex(b.colorHex);
          pl.intensity = (7.8 + flick * 1.05) * b.fadeWeight;
          pl.position.set(b.x, 2.15, b.z);
        } else {
          pl.intensity = 0;
        }
      }

      for (const b of allBraziers) {
        if (Math.abs(b.x - heroX) > 28 || Math.abs(b.z - heroZ) > 28) continue;
        for (const fs of b.flameSprites) {
          const w = Math.sin(time * 5.8 + fs.phase);
          fs.sp.position.y = fs.baseY + w * 0.04;
          fs.sp.scale.x = fs.sz * (0.73 + 0.05 * w);
          fs.sp.scale.y = fs.sz * (1.33 - 0.06 * w);
        }
      }

      for (const g of gates) {
        if (g.room.locked) g.mesh.visible = true;
        const targetY = g.room.locked ? 0.0 : -4.2;
        g.mesh.position.y += (targetY - g.mesh.position.y) * Math.min(1, dt * 9.5);
        if (!g.room.locked && g.mesh.position.y < -3.9) {
          g.mesh.visible = false;
        }
      }

      for (const tr of allTraps) {
        const t = (time + tr.phase) % tr.cycle;
        if (tr.room && tr.room.group && !tr.room.group.visible) {
          tr.activeHit = t >= 2.65 && t < 3.25;
          continue;
        }
        if (t < 1.9) {
          tr.runeWarnMat.opacity = 0.0;
          tr.warnPlane.visible = false;
          tr.spikesGroup.position.y += (-0.78 - tr.spikesGroup.position.y) * Math.min(1, dt * 10);
          if (tr.spikesGroup.position.y < -0.72) tr.spikesGroup.visible = false;
          tr.activeHit = false;
        } else if (t < 2.65) {
          const p = (t - 1.9) / 0.75;
          tr.warnPlane.visible = true;
          tr.runeWarnMat.opacity = 0.30 + 0.55 * Math.sin(p * Math.PI);
          tr.spikesGroup.visible = true;
          tr.spikesGroup.position.y = -0.62;
          tr.activeHit = false;
        } else if (t < 3.25) {
          tr.warnPlane.visible = true;
          tr.runeWarnMat.opacity = 0.45;
          tr.spikesGroup.visible = true;
          tr.spikesGroup.position.y += (0.0 - tr.spikesGroup.position.y) * Math.min(1, dt * 24);
          tr.activeHit = true;
        } else {
          tr.runeWarnMat.opacity *= 0.82;
          if (tr.runeWarnMat.opacity < 0.02) tr.warnPlane.visible = false;
          tr.spikesGroup.position.y += (-0.78 - tr.spikesGroup.position.y) * Math.min(1, dt * 10);
          tr.activeHit = false;
        }
      }

      for (const inter of interactables) {
        if (inter.room && inter.room.group && !inter.room.group.visible) continue;
        if (inter.crystal && !inter.used) {
          inter.crystal.rotation.y = time * 1.4;
          inter.crystal.position.y = 1.65 + Math.sin(time * 2.4) * 0.08;
        }
        if (inter.used && inter.lidPivot) {
          inter.lidPivot.rotation.x += (-1.95 - inter.lidPivot.rotation.x) * Math.min(1, dt * 6.0);
        }
      }
    }
  };

  return instance;
}
