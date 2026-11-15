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

// Box-blur heightfield slightly before normal generation so specular highlights never sub-pixel strobe during camera motion
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
      nx *= inv; ny *= inv; nz *= inv;

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

export function buildAllTextures(renderer) {
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  // 1. SEAMLESS WORLD-SPACE DUNGEON FLAGSTONE + BRONZE INLAY + MACRO PUDDLE MASK (512x512)
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

  for (let y = 0; y < flSize; y++) {
    const v = y / flSize;
    for (let x = 0; x < flSize; x++) {
      const u = x / flSize;

      const nFine = fbmTile(u, v, 20, 3, 17);
      const nMicro = fbmTile(u, v, 40, 2, 89);
      const nMacro = fbmTile(u, v, 4, 4, 53);
      const crack = voronoiTile(u, v, 14, 97);

      const grid = 6;
      const gy = v * grid;
      const row = Math.floor(gy);
      const fy = gy - row;
      const shift = (row % 2) * 0.5 + ((row % 3 === 0) ? 0.25 : 0.0);
      const gx = u * grid + shift + (nMacro - 0.5) * 0.035;
      const col = Math.floor(gx);
      const fx = gx - col;

      const tileId = hash2(((col % grid) + grid) % grid, row, 313);
      let subSplit = 1.0;
      if (tileId > 0.68) {
        subSplit = clamp01(Math.abs(fx - 0.5) / 0.040);
      }

      const edgeX = Math.min(fx, 1 - fx);
      const edgeY = Math.min(fy, 1 - fy);
      const mortar = clamp01(Math.min(edgeX, edgeY) / 0.048) * subSplit;
      const crackMask = clamp01((crack.edge - 0.015) / 0.028);

      // Wider anti-aliased bronze border inlay so sub-pixel motion never shimmers
      const isBronzeTrim = (row === 0 && fy > 0.05 && fy < 0.15);

      let puddle = smoothstep(clamp01((0.50 - nMacro) * 2.9));
      puddle = clamp01(puddle * 0.88 + (1 - mortar) * 0.28);
      if (isBronzeTrim) puddle *= 0.12;

      let h = mortar * (0.62 + 0.14 * tileId) * (0.85 + 0.15 * crackMask);
      h += (nFine - 0.5) * 0.13 + (nMicro - 0.5) * 0.04;
      if (isBronzeTrim) h = 0.70;
      flHeight[y * flSize + x] = h;

      let rCol, gCol, bCol, rough, metal = 0.04;
      if (isBronzeTrim) {
        const tarn = clamp01((nFine - 0.30) * 1.6);
        rCol = 136 + tarn * 38;
        gCol = 104 + tarn * 30;
        bCol = 56 + tarn * 16;
        rough = 0.36 + (1 - tarn) * 0.20;
        metal = 0.84;
      } else {
        const baseTone = 30 + tileId * 17 + nFine * 18 + (nMicro - 0.5) * 6;
        const warmSlate = (tileId - 0.5) * 7;
        const moss = clamp01((nMacro - 0.64) * 2.6) * (1 - mortar * 0.45);
        const wetDarken = 1.0 - puddle * 0.40;
        const ao = (0.42 + 0.58 * mortar) * (0.75 + 0.25 * crackMask);
        rCol = (baseTone + warmSlate * 0.7 + moss * 5) * wetDarken * ao;
        gCol = (baseTone * 1.04 + moss * 15) * wetDarken * ao;
        bCol = (baseTone * 1.12 - warmSlate * 0.5 + moss * 7) * wetDarken * ao;
        // Clamp minimum puddle roughness to 0.12 to eliminate pinpoint specular aliasing when moving!
        rough = (0.76 - nFine * 0.18 + (1 - mortar) * 0.14) * (1.0 - puddle * 0.80) + puddle * 0.12;
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
    }
  }
  fActx.putImageData(fAimg, 0, 0);
  fOctx.putImageData(fOimg, 0, 0);
  pMctx.putImageData(pMimg, 0, 0);

  const floorAlbedo = makeCanvasTex(flAlbC, true, true);
  const floorORM = makeCanvasTex(flOrmC, false, true);
  const puddleMask = makeCanvasTex(pudC, false, true);
  const floorNormal = heightToNormalCanvas(flHeight, flSize, 3.1, 1);

  // 2. CATHEDRAL ASHLAR WALL & COLUMN MASONRY (512x512)
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
      const rows = 8;
      const cols = 4;
      const ry = v * rows;
      const rId = Math.floor(ry);
      const rf = ry - rId;
      const cx = u * cols + (rId % 2) * 0.5;
      const cId = Math.floor(cx);
      const cf = cx - cId;

      const n1 = fbmTile(u, v, 16, 3, 401);
      const n2 = fbmTile(u, v, 32, 2, 709);
      const vor = voronoiTile(u, v, 12, 811);

      const gx = Math.min(cf, 1 - cf) * 1.8;
      const gy = Math.min(rf, 1 - rf);
      const joint = clamp01(Math.min(gx, gy) / 0.058);
      const chip = clamp01((vor.edge - 0.012) / 0.03);
      const blockVar = hash2(rId, ((cId % cols) + cols) % cols, 991);

      stHeight[y * stSize + x] = joint * (0.68 + 0.14 * blockVar) * (0.85 + 0.15 * chip) + (n1 - 0.5) * 0.15 + (n2 - 0.5) * 0.05;

      const streak = fbmTile(u * 3, v * 0.5, 8, 3, 555);
      const base = 46 + blockVar * 22 + n1 * 22 - streak * 13;
      const ao = (0.38 + 0.62 * joint) * (0.80 + 0.20 * chip);
      const idx = (y * stSize + x) * 4;
      stAimg.data[idx] = clamp01((base * 1.01 * ao) / 255) * 255;
      stAimg.data[idx + 1] = clamp01((base * 1.04 * ao) / 255) * 255;
      stAimg.data[idx + 2] = clamp01((base * 1.11 * ao) / 255) * 255;
      stAimg.data[idx + 3] = 255;

      const rough = clamp01(0.58 + (1 - n1) * 0.26 - streak * 0.14);
      stOimg.data[idx] = Math.round(ao * 255);
      stOimg.data[idx + 1] = Math.round(rough * 255);
      stOimg.data[idx + 2] = 10;
      stOimg.data[idx + 3] = 255;
    }
  }
  stActx.putImageData(stAimg, 0, 0);
  stOctx.putImageData(stOimg, 0, 0);
  const stoneAlbedo = makeCanvasTex(stAlbC, true, true);
  const stoneORM = makeCanvasTex(stOrmC, false, true);
  const stoneNormal = heightToNormalCanvas(stHeight, stSize, 3.0, 1);

  // 3. BATTLE-SCARRED DAMASCUS STEEL & GILDED ARMOR (256x256, anti-aliased roughness)
  const mtSize = 256;
  const mtHeight = new Float32Array(mtSize * mtSize);
  const mtOrmC = document.createElement('canvas');
  mtOrmC.width = mtOrmC.height = mtSize;
  const mtOctx = mtOrmC.getContext('2d');
  const mtOimg = mtOctx.createImageData(mtSize, mtSize);
  for (let y = 0; y < mtSize; y++) {
    const v = y / mtSize;
    for (let x = 0; x < mtSize; x++) {
      const u = x / mtSize;
      const dent = fbmTile(u, v, 8, 3, 1201);
      const wave = Math.sin((u * 8 + dent * 1.6) * Math.PI * 2) * 0.03;
      const scratch1 = Math.abs(fbmTile(u * 3 + v * 0.5, v * 0.5, 12, 2, 1303) - 0.5);
      const scratchMask = scratch1 < 0.022 ? 0.72 : 1.0;
      mtHeight[y * mtSize + x] = dent * 0.58 + scratchMask * 0.32 + wave;
      const idx = (y * mtSize + x) * 4;
      mtOimg.data[idx] = 240;
      // Keep armor roughness >= 0.28 so specular highlights stay buttery smooth while running
      mtOimg.data[idx + 1] = Math.round(clamp01(0.28 + dent * 0.18 + (1 - scratchMask) * 0.26) * 255);
      mtOimg.data[idx + 2] = 242;
      mtOimg.data[idx + 3] = 255;
    }
  }
  mtOctx.putImageData(mtOimg, 0, 0);
  const metalORM = makeCanvasTex(mtOrmC, false, true);
  const metalNormal = heightToNormalCanvas(mtHeight, mtSize, 1.5, 2);

  // 4. WATER RIPPLE NORMAL MAP (256x256)
  const rpSize = 256;
  const rpHeight = new Float32Array(rpSize * rpSize);
  for (let y = 0; y < rpSize; y++) {
    const v = y / rpSize;
    for (let x = 0; x < rpSize; x++) {
      const u = x / rpSize;
      const w1 = fbmTile(u, v, 6, 3, 1777);
      const w2 = Math.sin((u * 5 + v * 4 + w1 * 0.5) * Math.PI * 2) * 0.5 + 0.5;
      rpHeight[y * rpSize + x] = w1 * 0.7 + w2 * 0.3;
    }
  }
  const rippleNormal = heightToNormalCanvas(rpHeight, rpSize, 1.2, 2);

  // 5. SACRED SIGIL OVERLAY FOR SHRINES & BOSS CHAMBER (512x512, guaranteed 0 alpha at border)
  const sealC = document.createElement('canvas');
  sealC.width = sealC.height = 512;
  const sctx = sealC.getContext('2d');
  sctx.clearRect(0, 0, 512, 512);
  sctx.save();
  sctx.translate(256, 256);
  sctx.strokeStyle = '#ffbb66';
  sctx.shadowColor = '#ff7722';
  sctx.shadowBlur = 8;
  const drawRing = (r, lw, dash = []) => {
    sctx.beginPath();
    sctx.lineWidth = lw;
    sctx.setLineDash(dash);
    sctx.arc(0, 0, r, 0, Math.PI * 2);
    sctx.stroke();
  };
  drawRing(68, 2.4);
  drawRing(78, 1.2, [6, 6]);
  drawRing(142, 2.1);
  drawRing(154, 1.4, [12, 6]);
  drawRing(212, 2.5);
  sctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    sctx.save();
    sctx.rotate((i * Math.PI) / 4);
    sctx.lineWidth = 1.8;
    sctx.beginPath();
    sctx.moveTo(0, -68);
    sctx.lineTo(18, -142);
    sctx.lineTo(0, -212);
    sctx.lineTo(-18, -142);
    sctx.closePath();
    sctx.stroke();
    sctx.restore();
  }
  sctx.restore();
  const sealTex = makeCanvasTex(sealC, true, false);

  // 6. PERSISTENT BATTLE SCORCH & BLOOD-ASH DECAL TEXTURE (guaranteed soft radial fade to 0 BEFORE r = 0.92 so NEVER a black square!)
  const decC = document.createElement('canvas');
  decC.width = decC.height = 256;
  const dctx = decC.getContext('2d');
  const dImg = dctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = x / 256;
      const v = y / 256;
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2;
      const r = Math.hypot(dx, dy);
      const n = fbmTile(u, v, 7, 3, 2909);
      // Hard circular falloff guarantees alpha === 0 for all r >= 0.90 (zero rectangular border artifacts!)
      const borderFade = smoothstep(clamp01((0.90 - r) / 0.34));
      const organic = clamp01((0.76 - r + (n - 0.5) * 0.42) * 2.2);
      const alpha = smoothstep(organic) * borderFade;
      const idx = (y * 256 + x) * 4;
      dImg.data[idx] = 255;
      dImg.data[idx + 1] = 255;
      dImg.data[idx + 2] = 255;
      dImg.data[idx + 3] = Math.round(alpha * 205);
    }
  }
  dctx.putImageData(dImg, 0, 0);
  const decalTex = makeCanvasTex(decC, false, false);

  // 7. DEDICATED SPIKE TRAP SOCKET & RUNE WARNING MASK (512x512)
  // Renders recessed weathered stone border + iron lattice + 9 dark circular sockets so spike traps blend organically into dungeon masonry!
  const trapAlbC = document.createElement('canvas');
  trapAlbC.width = trapAlbC.height = 256;
  const tActx = trapAlbC.getContext('2d');
  const tAimg = tActx.createImageData(256, 256);

  const trapGlowC = document.createElement('canvas');
  trapGlowC.width = trapGlowC.height = 256;
  const tGctx = trapGlowC.getContext('2d');
  const tGimg = tGctx.createImageData(256, 256);

  const holeCenters = [-0.533, 0.0, 0.533]; // matches sx,sz * 0.56 on a 2.1m plate
  for (let y = 0; y < 256; y++) {
    const ny = (y / 255) * 2 - 1;
    for (let x = 0; x < 256; x++) {
      const nx = (x / 255) * 2 - 1;
      const edgeDist = Math.max(Math.abs(nx), Math.abs(ny));
      const nStone = fbmTile(x / 256, y / 256, 12, 3, 4111);

      // Soft outer alpha feather so trap plate blends seamlessly into stone flagstones without a sharp square seam
      const outerAlpha = smoothstep(clamp01((0.99 - edgeDist) / 0.09));

      // Distance to nearest of the 9 spike sockets
      let minHoleD = 99;
      for (const hx of holeCenters) {
        for (const hy of holeCenters) {
          const d = Math.hypot(nx - hx, ny - hy);
          if (d < minHoleD) minHoleD = d;
        }
      }

      // Iron cross-bars & border frame
      const isStoneCurb = edgeDist > 0.84;
      const isIronGrid = !isStoneCurb && (
        Math.abs(Math.abs(nx) - 0.266) < 0.045 ||
        Math.abs(Math.abs(ny) - 0.266) < 0.045 ||
        edgeDist > 0.76
      );
      const isHole = minHoleD < 0.125;
      const isHoleRim = minHoleD >= 0.125 && minHoleD < 0.168;

      let rC, gC, bC;
      if (isHole) {
        // Deep dark recessed spike shaft
        rC = 6; gC = 7; bC = 10;
      } else if (isHoleRim) {
        // Worn bronze/iron socket collar
        rC = 64 + nStone * 22; gC = 54 + nStone * 18; bC = 42 + nStone * 14;
      } else if (isStoneCurb) {
        // Chiseled stone bevel matching floor flagstones
        const st = 28 + nStone * 22;
        rC = st; gC = st * 1.04; bC = st * 1.12;
      } else if (isIronGrid) {
        // Matte forged iron lattice
        const ir = 34 + nStone * 16;
        rC = ir; gC = ir * 1.03; bC = ir * 1.08;
      } else {
        // Sunken dark slate bed between bars
        const sl = 18 + nStone * 14;
        rC = sl; gC = sl * 1.04; bC = sl * 1.10;
      }

      const idx = (y * 256 + x) * 4;
      tAimg.data[idx] = rC;
      tAimg.data[idx + 1] = gC;
      tAimg.data[idx + 2] = bC;
      tAimg.data[idx + 3] = Math.round(outerAlpha * 255);

      // Warning glow ONLY emanates from inside the 9 circular sockets + carved rune ring (NEVER a flat red square!)
      const holeGlow = smoothstep(clamp01((0.185 - minHoleD) / 0.11));
      const runeCircle = Math.abs(Math.hypot(nx, ny) - 0.74) < 0.022 ? 0.55 : 0.0;
      const glowMask = clamp01(holeGlow + runeCircle) * outerAlpha;
      tGimg.data[idx] = 255;
      tGimg.data[idx + 1] = Math.round(95 + holeGlow * 75);
      tGimg.data[idx + 2] = 24;
      tGimg.data[idx + 3] = Math.round(glowMask * 255);
    }
  }
  tActx.putImageData(tAimg, 0, 0);
  tGctx.putImageData(tGimg, 0, 0);
  const trapPlateTex = makeCanvasTex(trapAlbC, true, false);
  const trapGlowTex = makeCanvasTex(trapGlowC, true, false);

  // 8. SOFT PARTICLE SPRITE & VOLUMETRIC CONE
  const partC = document.createElement('canvas');
  partC.width = partC.height = 128;
  const pctx = partC.getContext('2d');
  const grad = pctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,245,220,0.86)');
  grad.addColorStop(0.55, 'rgba(255,200,140,0.28)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, 128, 128);
  const softParticleTex = makeCanvasTex(partC, false, false);

  const coneC = document.createElement('canvas');
  coneC.width = 64;
  coneC.height = 256;
  const cctx = coneC.getContext('2d');
  const vgrad = cctx.createLinearGradient(0, 0, 0, 256);
  vgrad.addColorStop(0.0, 'rgba(255,255,255,0.0)');
  vgrad.addColorStop(0.18, 'rgba(255,255,255,0.52)');
  vgrad.addColorStop(0.75, 'rgba(255,255,255,0.16)');
  vgrad.addColorStop(1.0, 'rgba(0,0,0,0.0)');
  cctx.fillStyle = vgrad;
  cctx.fillRect(0, 0, 64, 256);
  const godrayTex = makeCanvasTex(coneC, false, false);

  // 9. SMOOTH DUAL-LOBE MOONLIT CATHEDRAL HDR ENVIRONMENT (softened lobe exponent prevents sharp IBL glint strobing)
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(40, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float y = vPos.y;
        vec3 zenith = vec3(0.06, 0.11, 0.23);
        vec3 horizon = vec3(0.18, 0.25, 0.38);
        vec3 ground = vec3(0.15, 0.09, 0.05);
        vec3 col = y >= 0.0 ? mix(horizon, zenith, pow(y, 0.62)) : mix(horizon * 0.45, ground, pow(-y, 0.58));
        vec3 moonDir = normalize(vec3(-0.48, 0.72, -0.50));
        float m = max(0.0, dot(vPos, moonDir));
        col += vec3(1.25, 1.50, 2.10) * pow(m, 18.0);
        col += vec3(0.35, 0.48, 0.72) * pow(m, 5.0);
        vec3 fireDir1 = normalize(vec3(0.60, 0.22, 0.58));
        vec3 fireDir2 = normalize(vec3(-0.55, 0.18, 0.65));
        col += vec3(0.75, 0.36, 0.10) * pow(max(0.0, dot(vPos, fireDir1)), 7.0);
        col += vec3(0.60, 0.26, 0.08) * pow(max(0.0, dot(vPos, fireDir2)), 8.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  const envRT = pmrem.fromScene(envScene, 0.035);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();

  const all = [
    floorAlbedo, floorORM, puddleMask, floorNormal,
    stoneAlbedo, stoneORM, stoneNormal,
    metalORM, metalNormal, rippleNormal,
    sealTex, decalTex, trapPlateTex, trapGlowTex,
    softParticleTex, godrayTex
  ];
  for (const t of all) {
    if (t && t.isTexture) t.anisotropy = maxAniso;
  }

  return {
    envMap: envRT.texture,
    floorAlbedo,
    floorORM,
    puddleMask,
    floorNormal,
    stoneAlbedo,
    stoneORM,
    stoneNormal,
    metalORM,
    metalNormal,
    rippleNormal,
    sealTex,
    decalTex,
    trapPlateTex,
    trapGlowTex,
    softParticleTex,
    godrayTex
  };
}
