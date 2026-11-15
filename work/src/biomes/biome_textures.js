import * as THREE from 'three';

function hash2(x, y, seed = 1) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function valueNoiseTile(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);
  return (n00 + (n10 - n00) * xf) * (1 - yf) + (n01 + (n11 - n01) * xf) * yf;
}

function fbmTile(u, v, baseFreq, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoiseTile(u * freq, v * freq, freq, seed + i * 37);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function voronoiTile(u, v, cells, seed) {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let f1 = 999;
  let f2 = 999;
  let cellId = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ((ix + dx) % cells + cells) % cells;
      const cy = ((iy + dy) % cells + cells) % cells;
      const px = ix + dx + 0.16 + 0.68 * hash2(cx, cy, seed);
      const py = iy + dy + 0.16 + 0.68 * hash2(cx, cy, seed + 91);
      const d = Math.hypot(px - gx, py - gy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cellId = hash2(cx, cy, seed + 211);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, edge: f2 - f1, id: cellId };
}

function blurHeightTile(src, size, passes = 1) {
  let cur = Float32Array.from(src);
  let nxt = new Float32Array(size * size);
  const mask = size - 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const ym = (y - 1) & mask;
      const yp = (y + 1) & mask;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1) & mask;
        const xp = (x + 1) & mask;
        nxt[y * size + x] =
          (cur[y * size + x] * 4 +
            cur[ym * size + x] +
            cur[yp * size + x] +
            cur[y * size + xm] +
            cur[y * size + xp]) / 8;
      }
    }
    const tmp = cur;
    cur = nxt;
    nxt = tmp;
  }
  return cur;
}

function heightToNormalCanvas(height, size, strength = 2.8, blurPasses = 1) {
  const smoothed = blurPasses > 0 ? blurHeightTile(height, size, blurPasses) : height;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const mask = size - 1;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const tl = smoothed[ym * size + xm];
      const t = smoothed[ym * size + x];
      const tr = smoothed[ym * size + xp];
      const l = smoothed[y * size + xm];
      const r = smoothed[y * size + xp];
      const bl = smoothed[yp * size + xm];
      const b = smoothed[yp * size + x];
      const br = smoothed[yp * size + xp];

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;

      const idx = (y * size + x) * 4;
      d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function makeCanvasTex(canvas, srgb = false, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function buildThemeSigilTexture(biome) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 7;

  const ring = (r, lw = 2.2, dash = []) => {
    ctx.beginPath();
    ctx.lineWidth = lw;
    ctx.setLineDash(dash);
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  const st = biome.sigilStyle;
  if (st === 'druidic') {
    ring(64, 2.4);
    ring(146, 2.0, [10, 8]);
    ring(210, 2.5);
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -64);
      ctx.bezierCurveTo(42, -102, -42, -158, 0, -210);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -138, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (st === 'necrotic') {
    ring(58, 2.5);
    ring(128, 1.8, [5, 7]);
    ring(208, 2.8);
    ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-10, -58);
      ctx.lineTo(-4, -196);
      ctx.lineTo(0, -214);
      ctx.lineTo(4, -196);
      ctx.lineTo(10, -58);
      ctx.stroke();
      ctx.restore();
    }
  } else if (st === 'alchemical') {
    ring(54, 2.2);
    ring(98, 1.5, [8, 6]);
    ring(154, 2.2);
    ring(196, 1.6);
    ring(214, 2.4);
    ctx.setLineDash([]);
    // Graduated astrolabe degree ticks around outer bezel
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI) / 18;
      const rIn = i % 3 === 0 ? 196 : 203;
      ctx.lineWidth = i % 3 === 0 ? 2.0 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * 213, Math.sin(a) * 213);
      ctx.stroke();
    }
    // Inscribed Hermetic octagram (two 45-deg rotated squares)
    for (let s = 0; s < 2; s++) {
      ctx.save();
      ctx.rotate(s * (Math.PI / 4));
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const x = Math.cos(a) * 154;
        const y = Math.sin(a) * 154;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    // Cardinal planetary nodes & meridian crosshairs
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const nx = Math.cos(a) * 154;
      const ny = Math.sin(a) * 154;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(nx, ny, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 54, Math.sin(a) * 54);
      ctx.lineTo(Math.cos(a) * 140, Math.sin(a) * 140);
      ctx.stroke();
    }
  } else if (st === 'forge') {
    ring(74, 3.0);
    ring(156, 2.2, [16, 10]);
    ring(206, 3.2);
    ctx.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 6);
      ctx.lineWidth = 2.6;
      ctx.strokeRect(-12, -216, 24, 28);
      ctx.beginPath();
      ctx.moveTo(0, -74);
      ctx.lineTo(0, -156);
      ctx.stroke();
      ctx.restore();
    }
  } else if (st === 'inquisition') {
    ring(60, 2.4);
    ring(148, 2.0);
    ring(210, 2.6);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.lineTo(0, -220);
      ctx.moveTo(-26, -172);
      ctx.lineTo(26, -172);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -62);
      ctx.lineTo(14, -148);
      ctx.lineTo(0, -198);
      ctx.lineTo(-14, -148);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  } else if (st === 'royal') {
    ring(54, 2.6);
    ring(136, 2.2);
    ring(212, 3.0);
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.lineWidth = 2.2;
      ctx.strokeRect(-24, -186, 48, 48);
      ctx.beginPath();
      ctx.moveTo(0, -54);
      ctx.lineTo(0, -212);
      ctx.stroke();
      ctx.restore();
    }
  } else if (st === 'celestial') {
    ring(48, 2.0);
    ring(112, 1.8, [4, 8]);
    ring(176, 2.2);
    ring(214, 1.8, [18, 6]);
    ctx.setLineDash([]);
    ctx.save();
    ctx.scale(1.0, 0.52);
    ring(204, 2.2);
    ctx.restore();
    ctx.save();
    ctx.rotate(Math.PI / 2);
    ctx.scale(1.0, 0.52);
    ring(204, 2.2);
    ctx.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 176, Math.sin(a) * 176, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  } else {
    ring(68, 2.4);
    ring(78, 1.2, [6, 6]);
    ring(142, 2.1);
    ring(154, 1.4, [12, 6]);
    ring(212, 2.5);
    ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -68);
      ctx.lineTo(18, -142);
      ctx.lineTo(0, -212);
      ctx.lineTo(-18, -142);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
  return makeCanvasTex(c, true, false);
}

function buildBiomeEnvMap(renderer, biome) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(40, 32, 24);
  const es = biome.envSky;
  const moonExp = biome.archStyle === 'obsidian' ? '7.0' : '16.0';
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uZenith: { value: new THREE.Vector3(...es.zenith) },
      uHorizon: { value: new THREE.Vector3(...es.horizon) },
      uGround: { value: new THREE.Vector3(...es.ground) },
      uMoon: { value: new THREE.Vector3(...es.moon) },
      uFire: { value: new THREE.Vector3(...es.fire) }
    },
    vertexShader: [
      'varying vec3 vPos;',
      'void main() {', 
      '  vPos = normalize(position);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vPos;',
      'uniform vec3 uZenith;',
      'uniform vec3 uHorizon;',
      'uniform vec3 uGround;',
      'uniform vec3 uMoon;',
      'uniform vec3 uFire;',
      'void main() {', 
      '  float y = vPos.y;',
      '  vec3 col = y >= 0.0 ? mix(uHorizon, uZenith, pow(y, 0.62)) : mix(uHorizon * 0.45, uGround, pow(-y, 0.58));',
      '  vec3 moonDir = normalize(vec3(-0.48, 0.72, -0.50));',
      '  float m = max(0.0, dot(vPos, moonDir));',
      `  col += uMoon * pow(m, ${moonExp});`,
      '  col += uMoon * 0.28 * pow(m, 5.0);',
      '  vec3 fireDir1 = normalize(vec3(0.60, 0.22, 0.58));',
      '  vec3 fireDir2 = normalize(vec3(-0.55, 0.18, 0.65));',
      '  col += uFire * pow(max(0.0, dot(vPos, fireDir1)), 7.0);',
      '  col += uFire * 0.80 * pow(max(0.0, dot(vPos, fireDir2)), 8.0);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  const envRT = pmrem.fromScene(envScene, 0.035);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
  return envRT;
}

const _biomePackCache = new WeakMap();

export function getBiomeTexturePack(renderer, baseTex, biome) {
  let rendererMap = _biomePackCache.get(renderer);
  if (!rendererMap) {
    rendererMap = new Map();
    _biomePackCache.set(renderer, rendererMap);
  }
  if (rendererMap.has(biome.id)) {
    return rendererMap.get(biome.id);
  }

  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const pal = biome.palette;
  const style = biome.archStyle;
  const seedBase = biome.depth * 311 + (biome.variant === 'B' ? 977 : 131);

  const flSize = 512;
  const flHeight = new Float32Array(flSize * flSize);
  const flAlbC = document.createElement('canvas');
  flAlbC.width = flAlbC.height = flSize;
  const fActx = flAlbC.getContext('2d');
  const fAimg = fActx.createImageData(flSize, flSize);

  const flOrmC = document.createElement('canvas');
  flOrmC.width = flOrmC.height = flSize;
  const fOctx = flOrmC.getContext('2d');
  const fOimg = fOctx.createImageData(flSize, flSize);

  const pudC = document.createElement('canvas');
  pudC.width = pudC.height = flSize;
  const pMctx = pudC.getContext('2d');
  const pMimg = pMctx.createImageData(flSize, flSize);

  const veinC = document.createElement('canvas');
  veinC.width = veinC.height = flSize;
  const vMctx = veinC.getContext('2d');
  const vMimg = vMctx.createImageData(flSize, flSize);

  for (let y = 0; y < flSize; y++) {
    const v = y / flSize;
    for (let x = 0; x < flSize; x++) {
      const u = x / flSize;
      const nFine = fbmTile(u, v, 20, 3, seedBase + 17);
      const nMicro = fbmTile(u, v, 40, 2, seedBase + 89);
      const nMacro = fbmTile(u, v, 4, 4, seedBase + 53);
      const crack = voronoiTile(u, v, style === 'foundry' ? 9 : 14, seedBase + 97);

      let mortar = 1.0;
      let tileId = 0.5;
      let isTrim = false;
      let trimBlend = 0.0;
      let veinMask = 0.0;
      let h = 0.5;

      if (style === 'roothollow') {
        const vor = voronoiTile(u, v, 7, seedBase + 211);
        tileId = vor.id;
        mortar = clamp01((vor.edge - 0.018) / 0.048);
        const rootWave = Math.abs(Math.sin((u * 3.0 + Math.sin(v * Math.PI * 2) * 0.22 + (nMacro - 0.5) * 0.35) * Math.PI * 2));
        isTrim = rootWave < 0.075;
        veinMask = clamp01((0.042 - crack.edge) / 0.042) * smoothstep(clamp01((nMacro - 0.35) * 2.2));
        h = mortar * (0.58 + 0.18 * tileId) + (isTrim ? 0.22 : 0.0) + (nFine - 0.5) * 0.16;
      } else if (style === 'ossuary') {
        const grid = 6;
        const gx = u * grid;
        const gy = v * grid;
        const cx = Math.floor(gx);
        const cy = Math.floor(gy);
        const fx = gx - cx;
        const fy = gy - cy;
        tileId = hash2(cx, cy, seedBase + 303);
        const cornerCut = (Math.abs(fx - 0.5) + Math.abs(fy - 0.5)) > 0.78 ? 0.0 : 1.0;
        const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
        mortar = clamp01(edge / 0.055) * cornerCut;
        isTrim = cornerCut < 0.5 && (nFine > 0.44);
        veinMask = (1.0 - mortar) * 0.35 * clamp01((nMacro - 0.45) * 2.4);
        h = mortar * (0.64 + 0.14 * tileId) + (isTrim ? 0.14 : 0.0) + (nFine - 0.5) * 0.13;
      } else if (style === 'alchemica') {
        // Classical octagonal dark-slate flagstones with antique copper diamond keystones (zero neon grid!)
        const grid = 5;
        const warpX = (nMacro - 0.5) * 0.018;
        const warpY = (nFine - 0.5) * 0.012;
        const gx = (u + warpX + 1.0) * grid;
        const gy = (v + warpY + 1.0) * grid;
        const cx = Math.floor(gx);
        const cy = Math.floor(gy);
        const fx = gx - cx;
        const fy = gy - cy;
        const dxC = Math.min(fx, 1 - fx);
        const dyC = Math.min(fy, 1 - fy);
        const cornerSum = dxC + dyC;
        const lozengeR = 0.24;
        const inLozenge = cornerSum < lozengeR;
        const jointDist = inLozenge
          ? (lozengeR - cornerSum)
          : Math.min(Math.min(dxC, dyC), cornerSum - lozengeR);
        mortar = smoothstep(clamp01(jointDist / 0.032));

        if (inLozenge) {
          const kx = ((cx + (fx > 0.5 ? 1 : 0)) % grid + grid) % grid;
          const ky = ((cy + (fy > 0.5 ? 1 : 0)) % grid + grid) % grid;
          const keyId = hash2(kx, ky, seedBase + 463);
          tileId = 0.36 + 0.36 * keyId;
          // Patinated antique bronze/copper diamond medallion at octagon intersections
          const innerBevel = smoothstep(clamp01((jointDist - 0.015) / 0.035));
          trimBlend = innerBevel * (0.44 + 0.24 * keyId);
          h = mortar * 0.69 + innerBevel * 0.035 + (nFine - 0.5) * 0.05;
        } else {
          tileId = hash2(((cx % grid) + grid) % grid, ((cy % grid) + grid) % grid, seedBase + 409);
          const carvedStep = 1.0 - smoothstep(clamp01(Math.abs(jointDist - 0.068) / 0.022));
          trimBlend = tileId > 0.72 ? carvedStep * 0.22 : 0.0;
          h = mortar * (0.64 + 0.10 * tileId) - carvedStep * 0.025 + (nFine - 0.5) * 0.09;
        }
        // Only subtle organic spilled-elixir shimmer inside natural stone fractures
        veinMask = clamp01((0.024 - crack.edge) / 0.024) * smoothstep(clamp01((nMacro - 0.54) * 2.4)) * 0.65;
      } else if (style === 'foundry') {
        const vor = voronoiTile(u, v, 8, seedBase + 517);
        tileId = vor.id;
        mortar = clamp01((vor.edge - 0.022) / 0.050);
        const gridSeam = Math.min(Math.abs(((u * 4) % 1) - 0.5), Math.abs(((v * 4) % 1) - 0.5));
        isTrim = gridSeam < 0.032 && mortar > 0.4;
        veinMask = clamp01((0.052 - vor.edge) / 0.052) * (0.55 + 0.45 * nMacro);
        h = mortar * (0.68 + 0.14 * tileId) + (isTrim ? 0.15 : 0.0) + (nFine - 0.5) * 0.14;
      } else if (style === 'inquisition') {
        const du = (u + v) * 4.0;
        const dv = (u - v + 2.0) * 4.0;
        const cx = Math.floor(du);
        const cy = Math.floor(dv);
        const fx = du - cx;
        const fy = dv - cy;
        tileId = ((cx + cy) & 1) ? 0.82 : 0.22;
        const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
        mortar = clamp01(edge / 0.045);
        isTrim = edge >= 0.042 && edge < 0.072 && ((cx + cy) % 2 === 0);
        veinMask = clamp01((0.028 - crack.edge) / 0.028) * 0.5;
        h = mortar * 0.68 + (isTrim ? 0.08 : 0.0) + (nFine - 0.5) * 0.07;
      } else if (style === 'obsidian') {
        const grid = 3;
        const gx = u * grid;
        const gy = v * grid;
        const cx = Math.floor(gx);
        const cy = Math.floor(gy);
        const fx = gx - cx;
        const fy = gy - cy;
        tileId = hash2(cx, cy, seedBase + 613);
        const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
        mortar = smoothstep(clamp01(edge / 0.055));
        // Wide, soft-feathered royal gold inlay band so camera motion never sub-pixel strobes
        const borderBand = 1.0 - smoothstep(clamp01(Math.abs(edge - 0.135) / 0.038));
        const centerMedallion = tileId > 0.58
          ? (1.0 - smoothstep(clamp01(Math.abs(Math.hypot(fx - 0.5, fy - 0.5) - 0.24) / 0.036))) * 0.75
          : 0.0;
        trimBlend = clamp01(Math.max(borderBand, centerMedallion)) * 0.62;
        veinMask = smoothstep(clamp01((0.042 - edge) / 0.042)) * 0.42;
        h = mortar * 0.68 + trimBlend * 0.025 + (nFine - 0.5) * 0.018;
      } else if (style === 'astral') {
        const grid = 5;
        const gx = u * grid;
        const gy = v * grid;
        const cx = Math.floor(gx);
        const cy = Math.floor(gy);
        const fx = gx - cx;
        const fy = gy - cy;
        tileId = hash2(cx, cy, seedBase + 733);
        const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
        mortar = clamp01(edge / 0.042);
        const ringDist = Math.abs(Math.hypot(fx - 0.5, fy - 0.5) - 0.28);
        const crossLine = (Math.abs(fx - 0.5) < 0.022 || Math.abs(fy - 0.5) < 0.022) && Math.hypot(fx - 0.5, fy - 0.5) > 0.28;
        const conduit = ringDist < 0.020 || (tileId > 0.35 && crossLine);
        isTrim = Math.abs(ringDist - 0.032) < 0.012;
        veinMask = clamp01((conduit ? 0.92 : 0.0) + (1.0 - mortar) * 0.55);
        h = mortar * 0.68 - (conduit ? 0.12 : 0.0) + (nFine - 0.5) * 0.06;
      } else {
        const grid = 6;
        const gy = v * grid;
        const row = Math.floor(gy);
        const fy = gy - row;
        const shift = (row % 2) * 0.5 + ((row % 3 === 0) ? 0.25 : 0.0);
        const gx = u * grid + shift + (nMacro - 0.5) * 0.035;
        const col = Math.floor(gx);
        const fx = gx - col;
        tileId = hash2(((col % grid) + grid) % grid, row, 313);
        const subSplit = tileId > 0.68 ? clamp01(Math.abs(fx - 0.5) / 0.040) : 1.0;
        const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
        mortar = clamp01(edge / 0.048) * subSplit;
        isTrim = (row === 0 && fy > 0.05 && fy < 0.15);
        h = mortar * (0.62 + 0.14 * tileId) + (isTrim ? 0.12 : 0.0) + (nFine - 0.5) * 0.13;
      }

      const crackMask = clamp01((crack.edge - 0.015) / 0.028);
      flHeight[y * flSize + x] = h + (nMicro - 0.5) * (style === 'obsidian' ? 0.008 : 0.035);

      let puddle = smoothstep(clamp01((pal.puddleBias - nMacro) * 2.8));
      puddle = clamp01(puddle * 0.85 + (1 - mortar) * 0.24);
      if (isTrim || trimBlend > 0.01) puddle *= (1.0 - Math.max(isTrim ? 0.85 : 0.0, trimBlend * 0.80));
      if (style === 'obsidian') {
        puddle = clamp01((0.26 + 0.34 * smoothstep(clamp01((0.62 - nMacro) * 1.6))) * mortar * (1.0 - trimBlend * 0.75));
      }

      let rCol;
      let gCol;
      let bCol;
      let rough;
      let metal = 0.05;

      const effTrim = isTrim ? 1.0 : trimBlend;
      if (effTrim >= 0.999) {
        const tarn = clamp01((nFine - 0.28) * 1.5);
        rCol = pal.trimColor[0] * (0.78 + 0.34 * tarn);
        gCol = pal.trimColor[1] * (0.78 + 0.34 * tarn);
        bCol = pal.trimColor[2] * (0.78 + 0.34 * tarn);
        rough = style === 'roothollow' ? 0.68 : 0.32 + (1 - tarn) * 0.18;
        metal = (style === 'roothollow' || style === 'ossuary') ? 0.18 : 0.86;
      } else {
        const moss = clamp01((nMacro - 0.60) * 2.5) * (1 - mortar * 0.35);
        const wetDarken = (style === 'foundry' || style === 'obsidian') ? 1.0 : (1.0 - puddle * 0.36);
        const ao = style === 'obsidian'
          ? (0.68 + 0.32 * mortar) * (0.88 + 0.12 * crackMask)
          : (0.42 + 0.58 * mortar) * (0.76 + 0.24 * crackMask);
        rCol = (pal.floorBase[0] + tileId * pal.floorVar[0] + (nFine - 0.5) * 16 + moss * pal.floorMoss[0]) * wetDarken * ao;
        gCol = (pal.floorBase[1] + tileId * pal.floorVar[1] + (nFine - 0.5) * 16 + moss * pal.floorMoss[1]) * wetDarken * ao;
        bCol = (pal.floorBase[2] + tileId * pal.floorVar[2] + (nFine - 0.5) * 16 + moss * pal.floorMoss[2]) * wetDarken * ao;

        if (style === 'obsidian') {
          // Satin-honed obsidian roughness prevents sharp sub-pixel specular strobing when walking
          rough = 0.44 - nMacro * 0.06 + (1.0 - mortar) * 0.12;
          metal = 0.14;
        } else {
          const baseRough = style === 'inquisition' ? 0.44 : 0.74;
          rough = (baseRough - nFine * 0.14 + (1 - mortar) * 0.14) * (1.0 - puddle * 0.75) + puddle * 0.13;
          metal = 0.06;
        }
        if (effTrim > 0.0) {
          const tarn = clamp01((nFine - 0.28) * 1.2);
          const trR = pal.trimColor[0] * (0.58 + 0.22 * tarn);
          const trG = pal.trimColor[1] * (0.58 + 0.22 * tarn);
          const trB = pal.trimColor[2] * (0.58 + 0.22 * tarn);
          rCol = rCol * (1.0 - effTrim) + trR * effTrim;
          gCol = gCol * (1.0 - effTrim) + trG * effTrim;
          bCol = bCol * (1.0 - effTrim) + trB * effTrim;
          rough = rough * (1.0 - effTrim) + 0.48 * effTrim;
          metal = metal * (1.0 - effTrim) + 0.52 * effTrim;
        }
      }

      const idx = (y * flSize + x) * 4;
      fAimg.data[idx] = clamp01(rCol / 255) * 255;
      fAimg.data[idx + 1] = clamp01(gCol / 255) * 255;
      fAimg.data[idx + 2] = clamp01(bCol / 255) * 255;
      fAimg.data[idx + 3] = 255;

      const aoByte = Math.round(clamp01(0.45 + 0.55 * mortar * crackMask) * 255);
      fOimg.data[idx] = aoByte;
      fOimg.data[idx + 1] = Math.round(clamp01(rough) * 255);
      fOimg.data[idx + 2] = Math.round(clamp01(metal) * 255);
      fOimg.data[idx + 3] = 255;

      const pByte = Math.round(clamp01(puddle) * 255);
      pMimg.data[idx] = pByte;
      pMimg.data[idx + 1] = pByte;
      pMimg.data[idx + 2] = pByte;
      pMimg.data[idx + 3] = 255;

      const vByte = Math.round(clamp01(veinMask) * 255);
      vMimg.data[idx] = vByte;
      vMimg.data[idx + 1] = vByte;
      vMimg.data[idx + 2] = vByte;
      vMimg.data[idx + 3] = 255;
    }
  }
  fActx.putImageData(fAimg, 0, 0);
  fOctx.putImageData(fOimg, 0, 0);
  pMctx.putImageData(pMimg, 0, 0);
  vMctx.putImageData(vMimg, 0, 0);

  const floorAlbedo = makeCanvasTex(flAlbC, true, true);
  const floorORM = makeCanvasTex(flOrmC, false, true);
  const puddleMask = makeCanvasTex(pudC, false, true);
  const veinMaskTex = makeCanvasTex(veinC, false, true);
  const floorNormal = heightToNormalCanvas(
    flHeight,
    flSize,
    style === 'obsidian' ? 0.95 : 3.0,
    style === 'obsidian' ? 3 : 1
  );

  const stSize = 512;
  const stHeight = new Float32Array(stSize * stSize);
  const stAlbC = document.createElement('canvas');
  stAlbC.width = stAlbC.height = stSize;
  const stActx = stAlbC.getContext('2d');
  const stAimg = stActx.createImageData(stSize, stSize);

  const stOrmC = document.createElement('canvas');
  stOrmC.width = stOrmC.height = stSize;
  const stOctx = stOrmC.getContext('2d');
  const stOimg = stOctx.createImageData(stSize, stSize);

  for (let y = 0; y < stSize; y++) {
    const v = y / stSize;
    for (let x = 0; x < stSize; x++) {
      const u = x / stSize;
      const rows = style === 'obsidian' ? 6 : 8;
      const cols = style === 'astral' ? 3 : 4;
      const ry = v * rows;
      const rId = Math.floor(ry);
      const rf = ry - rId;
      const cx = u * cols + (rId % 2) * 0.5;
      const cId = Math.floor(cx);
      const cf = cx - cId;

      const n1 = fbmTile(u, v, 16, 3, seedBase + 401);
      const vor = voronoiTile(u, v, 12, seedBase + 811);

      let joint = clamp01(Math.min(Math.min(cf, 1 - cf) * 1.8, Math.min(rf, 1 - rf)) / 0.058);
      if (style === 'roothollow') {
        const bark = Math.sin((u * 18 + n1 * 2.5) * Math.PI * 2) * 0.5 + 0.5;
        joint = joint * 0.72 + bark * 0.28;
      } else if (style === 'ossuary') {
        if (rId % 2 === 1 && rf > 0.22 && rf < 0.78) {
          const skullCell = Math.abs(((u * 16) % 1) - 0.5);
          joint *= skullCell < 0.28 ? 0.52 : 0.92;
        }
      } else if (style === 'alchemica') {
        // Recessed apothecary wainscoting panel relief on lower courses
        if (rId >= 5 && rf > 0.18 && rf < 0.82 && cf > 0.12 && cf < 0.88) {
          joint *= 0.84;
        }
      }

      const chip = clamp01((vor.edge - 0.012) / 0.03);
      const blockVar = hash2(rId, ((cId % cols) + cols) % cols, seedBase + 991);
      stHeight[y * stSize + x] = joint * (0.68 + 0.14 * blockVar) * (0.85 + 0.15 * chip) + (n1 - 0.5) * 0.15;

      const streak = fbmTile(u * 3, v * 0.5, 8, 3, seedBase + 555);
      const ao = (0.38 + 0.62 * joint) * (0.80 + 0.20 * chip);
      const vTone = (blockVar - 0.5) * 18 + (n1 - 0.5) * 20 - streak * 11;

      const idx = (y * stSize + x) * 4;
      stAimg.data[idx] = clamp01(((pal.wallBase[0] + vTone) * ao) / 255) * 255;
      stAimg.data[idx + 1] = clamp01(((pal.wallBase[1] + vTone) * ao) / 255) * 255;
      stAimg.data[idx + 2] = clamp01(((pal.wallBase[2] + vTone) * ao) / 255) * 255;
      stAimg.data[idx + 3] = 255;

      const baseRough = style === 'obsidian' ? 0.48 : 0.62;
      const rough = clamp01(baseRough + (1 - n1) * 0.24 - streak * 0.12);
      stOimg.data[idx] = Math.round(ao * 255);
      stOimg.data[idx + 1] = Math.round(rough * 255);
      stOimg.data[idx + 2] = style === 'obsidian' ? 38 : 14;
      stOimg.data[idx + 3] = 255;
    }
  }
  stActx.putImageData(stAimg, 0, 0);
  stOctx.putImageData(stOimg, 0, 0);

  const stoneAlbedo = makeCanvasTex(stAlbC, true, true);
  const stoneORM = makeCanvasTex(stOrmC, false, true);
  const stoneNormal = heightToNormalCanvas(stHeight, stSize, style === 'obsidian' ? 1.8 : 2.9, style === 'obsidian' ? 2 : 1);

  const sealTex = buildThemeSigilTexture(biome);
  const envRT = buildBiomeEnvMap(renderer, biome);

  const created = [
    floorAlbedo, floorORM, puddleMask, veinMaskTex, floorNormal,
    stoneAlbedo, stoneORM, stoneNormal, sealTex
  ];
  for (const t of created) {
    if (t && t.isTexture) t.anisotropy = maxAniso;
  }

  const pack = {
    ...baseTex,
    envMap: envRT.texture,
    _envRT: envRT,
    floorAlbedo,
    floorORM,
    puddleMask,
    veinMaskTex,
    floorNormal,
    stoneAlbedo,
    stoneORM,
    stoneNormal,
    sealTex
  };

  rendererMap.set(biome.id, pack);
  return pack;
}
