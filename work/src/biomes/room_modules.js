import * as THREE from 'three';
import {
  WALL_THICK,
  WALL_HALF_T,
  PORTAL_CLEAR_HALF,
  JAMB_INNER,
  JAMB_OUTER,
  DIRS,
  isInsideDoorKeepOut,
  pickLandmarkWall
} from './seam_spec.js';
import {
  markIgnoreAO,
  buildThemeColumn,
  decorateWallSegment,
  buildThemeBrazier,
  buildThemeDestructible,
  buildThemeObstacle,
  buildThemeBossLandmark,
  buildThemeGate
} from './biome_props.js';

const JAMB_W = JAMB_OUTER - JAMB_INNER;            // 0.80m
const JAMB_CENTER = (JAMB_INNER + JAMB_OUTER) * 0.5; // 2.80m
const JAMB_DEPTH = WALL_THICK + 0.34;              // 1.24m (> wall cornice 1.16m -> zero coplanar seam)
const CORNER_PIER_W = WALL_THICK + 0.32;           // 1.22m (> wall cornice 1.16m -> zero corner gap or poke-through)

function buildWallSegmentLocal(parent, mats, biome, wallSolids, tag, x1, z1, x2, z2, height = 4.6) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.20) return;
  const mx = (x1 + x2) * 0.5;
  const mz = (z1 + z2) * 0.5;
  const g = new THREE.Group();
  g.position.set(mx, 0, mz);
  g.rotation.y = Math.atan2(x2 - x1, z2 - z1);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK, height, len), mats.wallMat);
  wall.position.y = height * 0.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK + 0.22, 0.55, len), mats.capMat);
  plinth.position.y = 0.275;
  plinth.receiveShadow = true;
  g.add(plinth);

  const cornice = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK + 0.26, 0.30, len), mats.capMat);
  cornice.position.y = height + 0.14;
  cornice.castShadow = true;
  g.add(cornice);

  decorateWallSegment(g, mats, biome, len, height, WALL_THICK);
  parent.add(g);

  if (wallSolids) {
    const isZRun = Math.abs(x2 - x1) < 0.05;
    wallSolids.push({
      tag,
      minX: isZRun ? mx - WALL_HALF_T : Math.min(x1, x2),
      maxX: isZRun ? mx + WALL_HALF_T : Math.max(x1, x2),
      minZ: isZRun ? Math.min(z1, z2) : mz - WALL_HALF_T,
      maxZ: isZRun ? Math.max(z1, z2) : mz + WALL_HALF_T
    });
  }
}

function buildCornerBastionPier(parent, mats, biome, cx, cz, pierBodyH) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(CORNER_PIER_W + 0.18, 0.78, CORNER_PIER_W + 0.18), mats.capMat);
  plinth.position.y = 0.39;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  g.add(plinth);

  const pier = new THREE.Mesh(new THREE.BoxGeometry(CORNER_PIER_W, pierBodyH - 0.78, CORNER_PIER_W), mats.pillarMat);
  pier.position.y = 0.78 + (pierBodyH - 0.78) * 0.5;
  pier.castShadow = true;
  pier.receiveShadow = true;
  g.add(pier);

  const midBand = new THREE.Mesh(new THREE.BoxGeometry(CORNER_PIER_W + 0.10, 0.18, CORNER_PIER_W + 0.10), mats.trimMat);
  midBand.position.y = Math.min(2.65, pierBodyH * 0.58);
  g.add(midBand);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(CORNER_PIER_W + 0.18, 0.34, CORNER_PIER_W + 0.18), mats.capMat);
  cap.position.y = pierBodyH + 0.16;
  cap.castShadow = true;
  g.add(cap);

  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mats.glowCoreMat);
  finial.position.y = pierBodyH + 0.52;
  g.add(finial);

  parent.add(g);
}

function buildPortalSocketFrame(parent, mats, biome, room, cx, cz, halfW, halfD, dir) {
  const isNS = dir.dx === 0;
  const isSouthLow = dir.key === 'S';
  const jambH = isSouthLow ? 4.15 : 5.35;
  const lintelY = 4.25;

  const g = new THREE.Group();
  const socketX = cx + dir.dx * (halfW + WALL_HALF_T);
  const socketZ = cz + dir.dz * (halfD + WALL_HALF_T);
  g.position.set(socketX, 0, socketZ);
  if (!isNS) g.rotation.y = Math.PI / 2;

  [-1, 1].forEach((side) => {
    const jx = side * JAMB_CENTER;
    // Plinth [2.32 .. 3.28] x depth 1.38m x height 0.78m wraps both room plinth and corridor plinth cleanly
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W + 0.16, 0.78, JAMB_DEPTH + 0.14), mats.capMat);
    plinth.position.set(jx, 0.39, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const pier = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W, jambH - 0.78, JAMB_DEPTH), mats.pillarMat);
    pier.position.set(jx, 0.78 + (jambH - 0.78) * 0.5, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    g.add(pier);

    const trimBand = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W + 0.08, 0.16, JAMB_DEPTH + 0.06), mats.trimMat);
    trimBand.position.set(jx, 2.55, 0);
    g.add(trimBand);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W + 0.18, 0.36, JAMB_DEPTH + 0.16), mats.capMat);
    cap.position.set(jx, jambH + 0.16, 0);
    cap.castShadow = true;
    g.add(cap);

    const worldJambX = isNS ? socketX + jx : socketX;
    const worldJambZ = isNS ? socketZ : socketZ + jx;
    room.colliders.push({ x: worldJambX, z: worldJambZ, r: 0.46, isCornerOrJamb: true });
  });

  if (!isSouthLow) {
    const spanW = JAMB_OUTER * 2 + 0.16;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(spanW, 0.56, JAMB_DEPTH - 0.08), mats.capMat);
    lintel.position.set(0, lintelY, 0);
    lintel.castShadow = true;
    g.add(lintel);

    const trimArch = new THREE.Mesh(new THREE.BoxGeometry(PORTAL_CLEAR_HALF * 2 + 0.2, 0.14, JAMB_DEPTH + 0.02), mats.trimMat);
    trimArch.position.set(0, lintelY - 0.30, 0);
    g.add(trimArch);

    const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mats.glowCoreMat);
    keystone.position.set(0, lintelY, 0);
    g.add(keystone);
  }

  parent.add(g);
}

function buildWallSideSetpieces(parent, mats, biome, room, animCallbacks) {
  const { cx, cz, halfW, halfD } = room;
  const style = biome.archStyle;

  const anchors = [];
  if (!room.doors.W) {
    anchors.push({ x: cx - halfW + 0.65, z: cz, rotY: Math.PI / 2 });
  } else if (halfD >= 10.2) {
    anchors.push({ x: cx - halfW + 0.65, z: cz - 5.6, rotY: Math.PI / 2 });
  }
  if (!room.doors.E) {
    anchors.push({ x: cx + halfW - 0.65, z: cz, rotY: -Math.PI / 2 });
  } else if (halfD >= 10.2) {
    anchors.push({ x: cx + halfW - 0.65, z: cz + 5.6, rotY: -Math.PI / 2 });
  }

  for (const anc of anchors) {
    if (isInsideDoorKeepOut(room, anc.x, anc.z, 0.9)) continue;
    const g = new THREE.Group();
    g.position.set(anc.x, 0, anc.z);
    g.rotation.y = anc.rotY;

    if (style === 'roothollow') {
      [-1.2, 1.2].forEach((oz) => {
        const rootTendril = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.30, 4.4, 7), mats.darkMetalMat);
        rootTendril.position.set(oz, 2.15, 0);
        rootTendril.rotation.z = oz < 0 ? -0.24 : 0.24;
        g.add(rootTendril);
      });
      const spore = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mats.glowCoreMat);
      spore.scale.set(1.3, 0.55, 0.9);
      spore.position.set(0, 0.38, 0.18);
      g.add(spore);
    } else if (style === 'ossuary') {
      const sarc = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.68, 0.72), mats.capMat);
      sarc.position.set(0, 0.34, 0.08);
      sarc.castShadow = true;
      g.add(sarc);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 0.78), mats.boneDetailMat);
      lid.position.set(0.04, 0.75, 0.10);
      g.add(lid);
    } else if (style === 'alchemica') {
      const baseCab = new THREE.Mesh(new THREE.BoxGeometry(2.10, 0.72, 0.62), mats.darkMetalMat);
      baseCab.position.set(0, 0.36, -0.02);
      baseCab.castShadow = true;
      baseCab.receiveShadow = true;
      g.add(baseCab);
      const counterTop = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.08, 0.68), mats.trimMat);
      counterTop.position.set(0, 0.74, -0.02);
      g.add(counterTop);
      [-0.96, 0.96].forEach((ox) => {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.24, 0.44), mats.darkMetalMat);
        upright.position.set(ox, 1.88, -0.08);
        upright.castShadow = true;
        g.add(upright);
      });
      const midShelf = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.07, 0.42), mats.trimMat);
      midShelf.position.set(0, 1.82, -0.08);
      g.add(midShelf);
      const topManifold = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.14, 0.48), mats.trimMat);
      topManifold.position.set(0, 3.02, -0.06);
      topManifold.castShadow = true;
      g.add(topManifold);
      [-0.58, 0, 0.58].forEach((vx) => {
        const core = markIgnoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.52, 10), mats.propPrimaryMat));
        core.position.set(vx, 1.08, -0.04);
        g.add(core);
        const glass = markIgnoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.72, 10), mats.glassShellMat));
        glass.position.set(vx, 1.16, -0.04);
        g.add(glass);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.10, 0.12, 8), mats.trimMat);
        neck.position.set(vx, 1.56, -0.04);
        g.add(neck);
      });
      [-0.46, 0.46].forEach((px) => {
        const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.08, 8), mats.trimMat);
        riser.position.set(px, 2.40, -0.08);
        g.add(riser);
      });
      const dialRim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12), mats.trimMat);
      dialRim.rotation.x = Math.PI / 2;
      dialRim.position.set(0, 2.42, 0.10);
      g.add(dialRim);
      const dialFace = markIgnoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 10), mats.amberGlowMat));
      dialFace.rotation.x = Math.PI / 2;
      dialFace.position.set(0, 2.42, 0.11);
      g.add(dialFace);
    } else if (style === 'foundry') {
      const trough = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.68), mats.darkMetalMat);
      trough.position.set(0, 0.21, 0.08);
      g.add(trough);
      const molten = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.44), mats.glowCoreMat);
      molten.position.set(0, 0.44, 0.08);
      g.add(molten);
    } else if (style === 'inquisition') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.20, 4.2, 0.82), mats.darkMetalMat);
      post.position.set(0, 2.1, 0.05);
      g.add(post);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.30, 0.98, 7, 1, true), mats.darkMetalMat);
      cage.position.set(0, 2.35, 0.36);
      g.add(cage);
      if (animCallbacks) {
        cage.userData.dynamicSubtree = true;
        animCallbacks.push((time) => {
          cage.rotation.z = Math.sin(time * 1.3 + anc.x) * 0.05;
        });
      }
    } else if (style === 'obsidian') {
      [-1.05, 1.05].forEach((ox) => {
        const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 3.6, 8), mats.trimMat);
        lance.position.set(ox, 1.8, 0.08);
        g.add(lance);
      });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.2), mats.propPrimaryMat);
      banner.position.set(0, 2.4, 0.12);
      g.add(banner);
    } else if (style === 'astral') {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), mats.glowCoreMat);
      shard.scale.set(0.75, 1.8, 0.75);
      shard.position.set(0, 2.2, 0.18);
      g.add(shard);
      if (animCallbacks) {
        shard.userData.dynamicSubtree = true;
        animCallbacks.push((time) => {
          shard.position.y = 2.2 + Math.sin(time * 2.0 + anc.z) * 0.12;
        });
      }
    } else {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.52, 0.66), mats.capMat);
      bench.position.set(0, 0.26, 0.08);
      bench.castShadow = true;
      g.add(bench);
    }
    parent.add(g);
  }
}

export function buildRoomModule({
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
  animCallbacks
}) {
  const roomGroup = new THREE.Group();
  roomGroup.name = `room_${room.id}_${room.type}`;
  const { cx, cz, halfW, halfD } = room;
  const pal = biome.palette;

  // 1. Exact interior floor [cx - halfW .. cx + halfW] x [cz - halfD .. cz + halfD]
  const fGeo = new THREE.PlaneGeometry(halfW * 2, halfD * 2);
  fGeo.setAttribute('uv2', fGeo.attributes.uv);
  const fMesh = new THREE.Mesh(fGeo, floorMat);
  fMesh.rotation.x = -Math.PI / 2;
  fMesh.position.set(cx, 0, cz);
  fMesh.receiveShadow = true;
  roomGroup.add(fMesh);
  floorMeshes.push(fMesh);
  floorFootprints.push({
    tag: `room_${room.id}`,
    minX: cx - halfW,
    maxX: cx + halfW,
    minZ: cz - halfD,
    maxZ: cz + halfD
  });

  // 2. Thematic floor sigil
  const sigColor = room.type === 'boss'
    ? pal.bossSigilHex
    : (room.type === 'sanctuary' ? pal.sanctuaryFlameHex : pal.sigilHex);
  const sigSize = room.type === 'boss' ? 14.0 : (room.type === 'combat' ? 6.8 : 8.2);
  const sig = markIgnoreAO(new THREE.Mesh(
    new THREE.PlaneGeometry(sigSize, sigSize),
    new THREE.MeshBasicMaterial({
      map: tex.sealTex,
      color: sigColor,
      transparent: true,
      opacity: room.type === 'boss' ? 0.48 : (room.type === 'combat' ? 0.18 : 0.30),
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  ));
  sig.rotation.x = -Math.PI / 2;
  sig.position.set(cx, 0.012, cz);
  roomGroup.add(sig);

  // 3. Perimeter walls tucking 0.14m inside solid 1.22m Corner Bastion Piers and 0.80m Portal Jambs
  // Corner Bastion Pier spans [half - 0.16 .. half + 1.06], Wall stops at half -> 0.16m solid tuck, 0.000m gap!
  const jambStop = JAMB_OUTER - 0.14; // 3.06m -> tucks 0.14m inside jamb [2.40 .. 3.20]
  const zNorthWall = cz - halfD - WALL_HALF_T;
  const zSouthWall = cz + halfD + WALL_HALF_T;
  const xWestWall = cx - halfW - WALL_HALF_T;
  const xEastWall = cx + halfW + WALL_HALF_T;

  const landmarkSide = room.type === 'boss' ? (!room.doors.N ? 'N' : (pickLandmarkWall(room) || 'E')) : null;
  const northWallH = landmarkSide === 'N' ? 6.8 : 4.6;
  const southWallH = 3.1;
  const westWallH = landmarkSide === 'W' ? 6.8 : 4.6;
  const eastWallH = landmarkSide === 'E' ? 6.8 : 4.6;

  if (room.doors.N) {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_N1`, cx - halfW, zNorthWall, cx - jambStop, zNorthWall, 4.6);
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_N2`, cx + jambStop, zNorthWall, cx + halfW, zNorthWall, 4.6);
    buildPortalSocketFrame(roomGroup, mats, biome, room, cx, cz, halfW, halfD, DIRS[0]);
  } else {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_N`, cx - halfW, zNorthWall, cx + halfW, zNorthWall, northWallH);
  }

  if (room.doors.S) {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_S1`, cx - halfW, zSouthWall, cx - jambStop, zSouthWall, southWallH);
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_S2`, cx + jambStop, zSouthWall, cx + halfW, zSouthWall, southWallH);
    buildPortalSocketFrame(roomGroup, mats, biome, room, cx, cz, halfW, halfD, DIRS[1]);
  } else {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_S`, cx - halfW, zSouthWall, cx + halfW, zSouthWall, southWallH);
  }

  if (room.doors.W) {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_W1`, xWestWall, cz - halfD, xWestWall, cz - jambStop, 4.6);
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_W2`, xWestWall, cz + jambStop, xWestWall, cz + halfD, 4.6);
    buildPortalSocketFrame(roomGroup, mats, biome, room, cx, cz, halfW, halfD, DIRS[3]);
  } else {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_W`, xWestWall, cz - halfD, xWestWall, cz + halfD, westWallH);
  }

  if (room.doors.E) {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_E1`, xEastWall, cz - halfD, xEastWall, cz - jambStop, 4.6);
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_E2`, xEastWall, cz + jambStop, xEastWall, cz + halfD, 4.6);
    buildPortalSocketFrame(roomGroup, mats, biome, room, cx, cz, halfW, halfD, DIRS[2]);
  } else {
    buildWallSegmentLocal(roomGroup, mats, biome, wallSolids, `r${room.id}_E`, xEastWall, cz - halfD, xEastWall, cz + halfD, eastWallH);
  }

  // 4. Four Corner Bastion Piers + Diagonal Braziers
  const brazierTint = room.type === 'sanctuary'
    ? pal.sanctuaryFlameHex
    : (room.type === 'boss' ? pal.bossFlameHex : pal.brazierCoreHex);

  const spawnRoomBrazier = (bx, bz) => {
    if (isInsideDoorKeepOut(room, bx, bz, 0.72)) return;
    const flameSprites = buildThemeBrazier(
      roomGroup,
      tex,
      mats,
      biome,
      bx,
      bz,
      brazierTint,
      pal.brazierHaloHex,
      allBraziers.length
    );
    const bObj = {
      id: allBraziers.length,
      x: bx,
      y: 1.55,
      z: bz,
      colorHex: brazierTint,
      flameSprites,
      phase: allBraziers.length * 1.31,
      slotIndex: -1,
      fadeWeight: 0
    };
    allBraziers.push(bObj);
    room.braziers.push(bObj);
    room.colliders.push({ x: bx, z: bz, r: 0.68 });
  };

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const maxAdjWallH = Math.max(
      sz < 0 ? northWallH : southWallH,
      sx < 0 ? westWallH : eastWallH
    );
    buildCornerBastionPier(
      roomGroup,
      mats,
      biome,
      cx + sx * (halfW + WALL_HALF_T),
      cz + sz * (halfD + WALL_HALF_T),
      maxAdjWallH + 0.55,
      animCallbacks
    );
    spawnRoomBrazier(cx + sx * (halfW - 2.05), cz + sz * (halfD - 2.05));
  });

  buildWallSideSetpieces(roomGroup, mats, biome, room, animCallbacks);

  const cone = markIgnoreAO(new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 4.2, 20, 16, 1, true),
    new THREE.MeshBasicMaterial({
      map: tex.godrayTex,
      color: room.type === 'sanctuary' ? pal.sanctuaryFlameHex : pal.godrayHex,
      transparent: true,
      opacity: pal.godrayOpacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  ));
  cone.position.set(cx - 1.1, 9.5, cz - 0.8);
  cone.rotation.z = -0.32;
  cone.rotation.x = 0.22;
  roomGroup.add(cone);

  const placeObstacleSafe = (ox, oz, tall = false) => {
    const wx = cx + ox;
    const wz = cz + oz;
    if (isInsideDoorKeepOut(room, wx, wz, 1.05)) return;
    buildThemeObstacle(roomGroup, mats, biome, wx, wz, tall, animCallbacks);
    room.colliders.push({ x: wx, z: wz, r: tall ? 0.96 : 0.90 });
  };

  const placeDestructibleSafe = (ox, oz, kind = 'urn') => {
    const wx = cx + ox;
    const wz = cz + oz;
    if (isInsideDoorKeepOut(room, wx, wz, 0.65)) return;
    const g = buildThemeDestructible(roomGroup, mats, biome, wx, wz, kind);
    const prop = { mesh: g, x: wx, z: wz, r: 0.45, hp: 1, kind, broken: false, room };
    destructibles.push(prop);
    room.props.push(prop);
  };

  // 5. Modular Interior Layouts
  if (room.type === 'start') {
    anvilBuilder(roomGroup, room, cx - 4.4, cz - 4.0);
    placeDestructibleSafe(4.8, -4.4, 'barrel');
    placeDestructibleSafe(5.6, -3.5, 'urn');
    placeDestructibleSafe(-5.4, 4.3, 'urn');
    placeDestructibleSafe(-4.4, 5.1, 'urn');
    placeDestructibleSafe(4.8, 4.4, 'barrel');
  } else if (room.type === 'combat') {
    if (room.layout === 'spike_gauntlet') {
      [[-3.9, -4.4], [3.9, -4.4], [-3.9, 4.4], [3.9, 4.4]].forEach(([ox, oz]) => placeObstacleSafe(ox, oz, false));
      trapBuilder(roomGroup, room, cx, cz - 3.0, 0.0);
      trapBuilder(roomGroup, room, cx, cz, 1.2);
      trapBuilder(roomGroup, room, cx, cz + 3.0, 2.4);
    } else if (room.layout === 'quad_colonnade') {
      [[-4.5, -3.8], [4.5, -3.8], [-4.5, 3.8], [4.5, 3.8]].forEach(([ox, oz]) => placeObstacleSafe(ox, oz, true));
      trapBuilder(roomGroup, room, cx - 2.3, cz, 0.0);
      trapBuilder(roomGroup, room, cx + 2.3, cz, 1.8);
    } else if (room.layout === 'ritual_ring') {
      placeObstacleSafe(0, 0, true);
      placeObstacleSafe(-4.2, -3.8, false);
      placeObstacleSafe(4.2, 3.8, false);
      trapBuilder(roomGroup, room, cx - 2.6, cz + 2.2, 0.4);
      trapBuilder(roomGroup, room, cx + 2.6, cz - 2.2, 2.2);
    } else {
      placeObstacleSafe(-3.9, -3.4, false);
      placeObstacleSafe(3.9, 3.4, false);
      trapBuilder(roomGroup, room, cx, cz - 2.2, 0.0);
      trapBuilder(roomGroup, room, cx, cz + 2.2, 1.8);
    }
    placeDestructibleSafe(-(halfW - 2.8), halfD - 3.4, 'barrel');
    placeDestructibleSafe(halfW - 2.8, -(halfD - 3.4), 'urn');
    placeDestructibleSafe(halfW - 3.6, -(halfD - 2.7), 'urn');
  } else if (room.type === 'elite') {
    [[-4.5, -4.4], [4.5, -4.4], [-4.5, 4.4], [4.5, 4.4]].forEach(([ox, oz]) => placeObstacleSafe(ox, oz, true));
    trapBuilder(roomGroup, room, cx - 2.4, cz, 0.0);
    trapBuilder(roomGroup, room, cx + 2.4, cz, 1.8);
    trapBuilder(roomGroup, room, cx, cz - 2.6, 0.9);
    placeDestructibleSafe(-(halfW - 2.8), halfD - 3.4, 'barrel');
    placeDestructibleSafe(halfW - 2.8, -(halfD - 3.4), 'barrel');
  } else if (room.type === 'vault') {
    const dais = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 3.4), mats.capMat);
    dais.position.set(cx, 0.18, cz);
    dais.receiveShadow = true;
    roomGroup.add(dais);

    const chestGroup = new THREE.Group();
    chestGroup.userData.dynamicSubtree = true;
    chestGroup.position.set(cx, 0.36, cz);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.72, 0.92), mats.darkMetalMat);
    box.position.y = 0.36;
    box.castShadow = true;
    chestGroup.add(box);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.72, -0.44);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.45, 12, 1, false, 0, Math.PI), mats.trimMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0, 0.44);
    lid.castShadow = true;
    lidPivot.add(lid);
    chestGroup.add(lidPivot);

    const chestGlow = markIgnoreAO(new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.softParticleTex,
      color: pal.sigilHex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.80,
      depthWrite: false
    })));
    chestGlow.position.set(0, 1.15, 0);
    chestGlow.scale.set(2.1, 2.1, 1);
    chestGroup.add(chestGlow);
    roomGroup.add(chestGroup);
    const chestCollider = { x: cx, z: cz, r: 0.95 };
    room.colliders.push(chestCollider);

    const inter = {
      kind: 'vault_chest',
      room,
      x: cx,
      z: cz,
      used: false,
      label: `[F] OPEN ${biome.roomNames.vault[0]}`,
      meshRoot: chestGroup,
      collider: chestCollider,
      lidPivot,
      glow: chestGlow
    };
    interactables.push(inter);
    room.interactables.push(inter);

    placeDestructibleSafe(-4.8, -4.2, 'urn');
    placeDestructibleSafe(4.8, -4.2, 'urn');
    placeDestructibleSafe(-4.8, 4.2, 'barrel');
  } else if (room.type === 'sanctuary') {
    const fx = cx - 4.0;
    const fz = cz - 3.9;
    const fontGroup = new THREE.Group();
    fontGroup.position.set(fx, 0, fz);
    const fPed = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 1.1, 10), mats.capMat);
    fPed.position.y = 0.55;
    fPed.castShadow = true;
    fontGroup.add(fPed);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.45, 0.45, 14), mats.trimMat);
    basin.position.y = 1.25;
    basin.castShadow = true;
    fontGroup.add(basin);
    const waterPool = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 16),
      new THREE.MeshStandardMaterial({
        color: pal.sanctuaryFlameHex,
        emissive: pal.sanctuaryFlameHex,
        emissiveIntensity: 1.25,
        roughness: 0.18,
        metalness: 0.1
      })
    );
    waterPool.rotation.x = -Math.PI / 2;
    waterPool.position.y = 1.48;
    waterPool.userData.dynamicSubtree = true;
    fontGroup.add(waterPool);
    roomGroup.add(fontGroup);
    room.colliders.push({ x: fx, z: fz, r: 0.95 });

    const fontInter = {
      kind: 'healing_font',
      room,
      x: fx,
      z: fz,
      used: false,
      label: '[F] DRINK SACRED SPRING (FULL HEAL + ELIXIR)',
      waterPool
    };
    interactables.push(fontInter);
    room.interactables.push(fontInter);

    const px = cx + 4.0;
    const pz = cz - 3.9;
    const pactGroup = new THREE.Group();
    pactGroup.position.set(px, 0, pz);
    const pBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 1.0), mats.darkMetalMat);
    pBase.position.y = 0.575;
    pBase.castShadow = true;
    pactGroup.add(pBase);
    const pCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({
        color: pal.bossFlameHex,
        emissive: pal.bossFlameHex,
        emissiveIntensity: 2.2,
        roughness: 0.25
      })
    );
    pCrystal.position.y = 1.65;
    pCrystal.userData.dynamicSubtree = true;
    pactGroup.add(pCrystal);
    roomGroup.add(pactGroup);
    room.colliders.push({ x: px, z: pz, r: 0.92 });

    const pactInter = {
      kind: 'blood_pact',
      room,
      x: px,
      z: pz,
      used: false,
      label: '[F] BLOOD PACT (-30% HP FOR ATTRIBUTE CARD + +8% DMG)',
      crystal: pCrystal
    };
    interactables.push(pactInter);
    room.interactables.push(pactInter);

    anvilBuilder(roomGroup, room, cx - 4.0, cz + 3.9);

    const sx = cx + 4.0;
    const sz = cz + 3.9;
    const shrineGroup = new THREE.Group();
    shrineGroup.position.set(sx, 0, sz);
    const sPed = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.78, 1.02, 8), mats.capMat);
    sPed.position.y = 0.51;
    sPed.castShadow = true;
    shrineGroup.add(sPed);
    const sBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.42, 0.36, 10), mats.trimMat);
    sBowl.position.y = 1.15;
    sBowl.castShadow = true;
    shrineGroup.add(sBowl);
    const sHaloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.045, 8, 24),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xff9f2e,
        emissiveIntensity: 1.5,
        roughness: 0.25,
        metalness: 0.65
      })
    );
    sHaloRing.position.y = 1.66;
    sHaloRing.userData.dynamicSubtree = true;
    shrineGroup.add(sHaloRing);
    const sGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffe082,
        emissive: 0xff9924,
        emissiveIntensity: 2.3,
        roughness: 0.18
      })
    );
    sGem.position.y = 1.66;
    sGem.userData.dynamicSubtree = true;
    shrineGroup.add(sGem);
    roomGroup.add(shrineGroup);
    room.colliders.push({ x: sx, z: sz, r: 0.90 });
    animCallbacks.push((time) => {
      if (sGem.visible) {
        sGem.rotation.y = time * 1.6;
        sGem.position.y = 1.66 + Math.sin(time * 2.8) * 0.07;
        sHaloRing.rotation.y = -time * 0.9;
        sHaloRing.rotation.x = Math.sin(time * 1.4) * 0.35;
      }
    });

    const shrineInter = {
      kind: 'cinder_shrine',
      room,
      x: sx,
      z: sz,
      used: false,
      uses: 0,
      maxUses: 2,
      cost: 85,
      crystal: sGem,
      haloRing: sHaloRing,
      label: '[F] CINDER SHRINE (OFFER CINDERS FOR ATTRIBUTE BLESSING)'
    };
    interactables.push(shrineInter);
    room.interactables.push(shrineInter);
  } else if (room.type === 'boss') {
    [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]].forEach(([ox, oz]) => {
      buildThemeColumn(roomGroup, mats, biome, cx + ox, cz + oz, 7.6, animCallbacks);
      room.colliders.push({ x: cx + ox, z: cz + oz, r: 0.95 });
    });

    const landmarkHolder = new THREE.Group();
    if (landmarkSide === 'N') {
      buildThemeBossLandmark(landmarkHolder, mats, biome, cx, cz, halfD, animCallbacks);
    } else if (landmarkSide === 'E') {
      landmarkHolder.position.set(cx, 0, cz);
      landmarkHolder.rotation.y = -Math.PI / 2;
      buildThemeBossLandmark(landmarkHolder, mats, biome, 0, 0, halfW, animCallbacks);
    } else if (landmarkSide === 'W') {
      landmarkHolder.position.set(cx, 0, cz);
      landmarkHolder.rotation.y = Math.PI / 2;
      buildThemeBossLandmark(landmarkHolder, mats, biome, 0, 0, halfW, animCallbacks);
    }
    roomGroup.add(landmarkHolder);
  }

  // 6. Portcullis Gates
  if (room.type === 'combat' || room.type === 'elite' || room.type === 'boss') {
    for (const d of DIRS) {
      if (!room.doors[d.key]) continue;
      const gx = cx + d.dx * (halfW + WALL_HALF_T);
      const gz = cz + d.dz * (halfD + WALL_HALF_T);
      const gateGroup = buildThemeGate(roomGroup, mats, biome, gx, gz, d.dx !== 0, PORTAL_CLEAR_HALF);
      gates.push({ room, dir: d, x: gx, z: gz, mesh: gateGroup });
    }
  }

  return roomGroup;
}
