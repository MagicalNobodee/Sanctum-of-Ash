import * as THREE from 'three';
import {
  WALL_THICK,
  PORTAL_CLEAR_HALF,
  CORR_WALL_THICK,
  CORR_WALL_OFFSET,
  CORR_FLOOR_HALF_W
} from './seam_spec.js';

// Corridor wall body [2.48 .. 3.04], plinth [2.41 .. 3.11] (h=0.42), coping [2.42 .. 3.10] (h=3.75..3.99)
// Strictly nested inside Portal Jamb Pier [2.40 .. 3.20] (plinth [2.32 .. 3.28], h=0.78, pier h=4.15..5.35)
// End tucks 15cm inside Jamb Pier outer face (zFloor + 0.92 vs Jamb outer zFloor + 1.07) -> zero gap & zero Z-fighting!

function buildCorridorSideWall(parent, mats, wallSolids, tag, x1, z1, x2, z2, height) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.15) return;
  const mx = (x1 + x2) * 0.5;
  const mz = (z1 + z2) * 0.5;
  const g = new THREE.Group();
  g.position.set(mx, 0, mz);
  g.rotation.y = Math.atan2(x2 - x1, z2 - z1);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(CORR_WALL_THICK, height, len), mats.wallMat);
  wall.position.y = height * 0.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(CORR_WALL_THICK + 0.14, 0.42, len), mats.capMat);
  plinth.position.y = 0.21;
  plinth.receiveShadow = true;
  g.add(plinth);

  const coping = new THREE.Mesh(new THREE.BoxGeometry(CORR_WALL_THICK + 0.12, 0.22, len), mats.capMat);
  coping.position.y = height + 0.11;
  coping.castShadow = true;
  g.add(coping);

  parent.add(g);

  if (wallSolids) {
    const isZRun = Math.abs(x2 - x1) < 0.05;
    const ht = CORR_WALL_THICK * 0.5;
    wallSolids.push({
      tag,
      minX: isZRun ? mx - ht : Math.min(x1, x2),
      maxX: isZRun ? mx + ht : Math.max(x1, x2),
      minZ: isZRun ? Math.min(z1, z2) : mz - ht,
      maxZ: isZRun ? Math.max(z1, z2) : mz + ht
    });
  }
}

function addCorridorThematicBays(parent, mats, biome, isNS, midX, midZ, wallSpan) {
  if (wallSpan < 4.8) return;
  const style = biome.archStyle;
  const bayCount = Math.max(1, Math.min(3, Math.floor(wallSpan / 5.2)));

  for (let i = 0; i < bayCount; i++) {
    const offset = ((i + 0.5) / bayCount - 0.5) * (wallSpan - 2.6);
    const bx = isNS ? midX : midX + offset;
    const bz = isNS ? midZ + offset : midZ;

    const bay = new THREE.Group();
    bay.position.set(bx, 0, bz);
    if (!isNS) bay.rotation.y = Math.PI / 2;

    [-1, 1].forEach((side) => {
      const isLowSouth = !isNS && side === -1;
      const ribH = isLowSouth ? 2.40 : 3.60;
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, ribH, 0.42),
        (style === 'roothollow' || style === 'alchemica') ? mats.darkMetalMat : mats.pillarMat
      );
      rib.position.set(side * (PORTAL_CLEAR_HALF + 0.12), ribH * 0.5, 0);
      rib.castShadow = true;
      bay.add(rib);

      if (style === 'alchemica') {
        const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, ribH - 0.16, 8), mats.trimMat);
        riser.position.set(side * (PORTAL_CLEAR_HALF + 0.11), ribH * 0.5, 0.24);
        bay.add(riser);
        if (!isLowSouth) {
          const gaugeRim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10), mats.trimMat);
          gaugeRim.rotation.z = Math.PI / 2;
          gaugeRim.position.set(side * (PORTAL_CLEAR_HALF + 0.05), 2.22, 0);
          bay.add(gaugeRim);
          const gaugeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 10), mats.amberGlowMat);
          gaugeFace.rotation.z = Math.PI / 2;
          gaugeFace.position.set(side * (PORTAL_CLEAR_HALF + 0.045), 2.22, 0);
          bay.add(gaugeFace);
        }
      } else if (!isLowSouth && (style === 'foundry' || style === 'astral')) {
        const node = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.22), mats.glowCoreMat);
        node.position.set(side * (PORTAL_CLEAR_HALF + 0.03), 2.15, 0);
        bay.add(node);
      }
    });

    if (isNS) {
      if (style === 'roothollow') {
        [-1, 1].forEach((side) => {
          const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.18, 2.9, 6), mats.darkMetalMat);
          limb.position.set(side * 1.45, 3.88, 0);
          limb.rotation.z = side * 1.18;
          bay.add(limb);
        });
      } else {
        const archBeam = new THREE.Mesh(
          new THREE.BoxGeometry(CORR_WALL_OFFSET * 2 + 0.4, 0.30, 0.46),
          style === 'alchemica' ? mats.darkMetalMat : (style === 'obsidian' ? mats.trimMat : mats.capMat)
        );
        archBeam.position.set(0, 4.02, 0);
        archBeam.castShadow = true;
        bay.add(archBeam);
        if (style === 'alchemica') {
          [-0.14, 0.14].forEach((pz) => {
            const conduit = new THREE.Mesh(
              new THREE.CylinderGeometry(0.058, 0.058, CORR_WALL_OFFSET * 2 + 0.36, 10),
              mats.trimMat
            );
            conduit.rotation.z = Math.PI / 2;
            conduit.position.set(0, 3.82, pz);
            bay.add(conduit);
          });
          const union = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.40, 10), mats.trimMat);
          union.rotation.x = Math.PI / 2;
          union.position.set(0, 3.82, 0);
          bay.add(union);
        }
      }
    }

    parent.add(bay);
  }
}

export function buildCorridorModule({
  roomA,
  roomB,
  dirFromA,
  biome,
  mats,
  floorMat,
  floorMeshes,
  floorFootprints,
  wallSolids
}) {
  const group = new THREE.Group();
  const id = roomA.id < roomB.id ? `corr_${roomA.id}_${roomB.id}` : `corr_${roomB.id}_${roomA.id}`;
  group.name = id;

  const isNS = dirFromA.dx === 0;
  // Room wall outer face is at +0.90m, Portal Jamb outer face is at +1.07m.
  // Starting corridor wall at +0.92m keeps it 2cm clear of room wall & 15cm tucked inside solid jamb!
  const jambSocketStart = WALL_THICK + 0.02;

  if (isNS) {
    const northR = roomA.cz < roomB.cz ? roomA : roomB;
    const southR = roomA.cz < roomB.cz ? roomB : roomA;
    const corrX = northR.cx;

    const zFloorTop = northR.cz + northR.halfD;
    const zFloorBot = southR.cz - southR.halfD;
    const floorSpan = Math.max(0.2, zFloorBot - zFloorTop);
    const midZ = (zFloorTop + zFloorBot) * 0.5;

    const cGeo = new THREE.PlaneGeometry(CORR_FLOOR_HALF_W * 2, floorSpan);
    cGeo.setAttribute('uv2', cGeo.attributes.uv);
    const cf = new THREE.Mesh(cGeo, floorMat);
    cf.rotation.x = -Math.PI / 2;
    cf.position.set(corrX, 0, midZ);
    cf.receiveShadow = true;
    group.add(cf);
    floorMeshes.push(cf);
    floorFootprints.push({
      tag: id,
      minX: corrX - PORTAL_CLEAR_HALF,
      maxX: corrX + PORTAL_CLEAR_HALF,
      minZ: zFloorTop,
      maxZ: zFloorBot
    });

    const zWallTop = zFloorTop + jambSocketStart;
    const zWallBot = zFloorBot - jambSocketStart;
    const wallSpan = Math.max(0.2, zWallBot - zWallTop);

    buildCorridorSideWall(group, mats, wallSolids, `${id}_W`, corrX - CORR_WALL_OFFSET, zWallTop, corrX - CORR_WALL_OFFSET, zWallBot, 3.75);
    buildCorridorSideWall(group, mats, wallSolids, `${id}_E`, corrX + CORR_WALL_OFFSET, zWallTop, corrX + CORR_WALL_OFFSET, zWallBot, 3.75);
    addCorridorThematicBays(group, mats, biome, true, corrX, (zWallTop + zWallBot) * 0.5, wallSpan);

    return {
      group,
      corridorRecord: {
        id,
        axis: 'NS',
        span: floorSpan,
        minX: corrX - PORTAL_CLEAR_HALF,
        maxX: corrX + PORTAL_CLEAR_HALF,
        minZ: zFloorTop - 0.85,
        maxZ: zFloorBot + 0.85,
        walkMinX: corrX - PORTAL_CLEAR_HALF,
        walkMaxX: corrX + PORTAL_CLEAR_HALF,
        walkMinZ: zFloorTop,
        walkMaxZ: zFloorBot,
        seamAX: corrX,
        seamAZ: zFloorTop,
        seamBX: corrX,
        seamBZ: zFloorBot
      }
    };
  }

  const westR = roomA.cx < roomB.cx ? roomA : roomB;
  const eastR = roomA.cx < roomB.cx ? roomB : roomA;
  const corrZ = westR.cz;

  const xFloorLeft = westR.cx + westR.halfW;
  const xFloorRight = eastR.cx - eastR.halfW;
  const floorSpan = Math.max(0.2, xFloorRight - xFloorLeft);
  const midX = (xFloorLeft + xFloorRight) * 0.5;

  const cGeo = new THREE.PlaneGeometry(floorSpan, CORR_FLOOR_HALF_W * 2);
  cGeo.setAttribute('uv2', cGeo.attributes.uv);
  const cf = new THREE.Mesh(cGeo, floorMat);
  cf.rotation.x = -Math.PI / 2;
  cf.position.set(midX, 0, corrZ);
  cf.receiveShadow = true;
  group.add(cf);
  floorMeshes.push(cf);
  floorFootprints.push({
    tag: id,
    minX: xFloorLeft,
    maxX: xFloorRight,
    minZ: corrZ - PORTAL_CLEAR_HALF,
    maxZ: corrZ + PORTAL_CLEAR_HALF
  });

  const xWallLeft = xFloorLeft + jambSocketStart;
  const xWallRight = xFloorRight - jambSocketStart;
  const wallSpan = Math.max(0.2, xWallRight - xWallLeft);

  buildCorridorSideWall(group, mats, wallSolids, `${id}_N`, xWallLeft, corrZ - CORR_WALL_OFFSET, xWallRight, corrZ - CORR_WALL_OFFSET, 3.75);
  buildCorridorSideWall(group, mats, wallSolids, `${id}_S`, xWallLeft, corrZ + CORR_WALL_OFFSET, xWallRight, corrZ + CORR_WALL_OFFSET, 2.55);
  addCorridorThematicBays(group, mats, biome, false, (xWallLeft + xWallRight) * 0.5, corrZ, wallSpan);

  return {
    group,
    corridorRecord: {
      id,
      axis: 'EW',
      span: floorSpan,
      minX: xFloorLeft - 0.85,
      maxX: xFloorRight + 0.85,
      minZ: corrZ - PORTAL_CLEAR_HALF,
      maxZ: corrZ + PORTAL_CLEAR_HALF,
      walkMinX: xFloorLeft,
      walkMaxX: xFloorRight,
      walkMinZ: corrZ - PORTAL_CLEAR_HALF,
      walkMaxZ: corrZ + PORTAL_CLEAR_HALF,
      seamAX: xFloorLeft,
      seamAZ: corrZ,
      seamBX: xFloorRight,
      seamBZ: corrZ
    }
  };
}
