import * as THREE from 'three';

export function markIgnoreAO(obj) {
  obj.userData.ignoreAO = true;
  return obj;
}

export function createBiomeMaterialSet(tex, biome) {
  const pal = biome.palette;
  const style = biome.archStyle;

  const stoneNormScale = style === 'obsidian' ? 0.52 : 1.05;
  const makeStone = (repU, repV, tintHex, roughBias = 0.86, metalBias = 0.06) => {
    const map = tex.stoneAlbedo.clone();
    map.needsUpdate = true;
    map.repeat.set(repU, repV);
    const orm = tex.stoneORM.clone();
    orm.needsUpdate = true;
    orm.repeat.set(repU, repV);
    const nrm = tex.stoneNormal.clone();
    nrm.needsUpdate = true;
    nrm.repeat.set(repU, repV);
    return new THREE.MeshStandardMaterial({
      color: tintHex,
      map,
      aoMap: orm,
      aoMapIntensity: 1.15,
      roughnessMap: orm,
      roughness: roughBias,
      metalnessMap: orm,
      metalness: metalBias,
      normalMap: nrm,
      normalScale: new THREE.Vector2(stoneNormScale, stoneNormScale),
      envMapIntensity: style === 'obsidian' ? 0.78 : 1.0
    });
  };

  const wallRough = style === 'obsidian' ? 0.54 : (style === 'inquisition' ? 0.62 : 0.86);
  const wallMetal = style === 'obsidian' ? 0.16 : 0.06;

  const wallMat = makeStone(3, 2, pal.wallTintHex, wallRough, wallMetal);
  const pillarMat = makeStone(2, 5, pal.pillarTintHex, wallRough * 0.96, wallMetal);
  const capMat = makeStone(2, 1, pal.capTintHex, wallRough * 0.94, style === 'obsidian' ? 0.30 : wallMetal);

  const trimMat = new THREE.MeshStandardMaterial({
    color: pal.trimHex,
    roughnessMap: tex.metalORM,
    roughness: style === 'roothollow' ? 0.72 : (style === 'ossuary' ? 0.58 : (style === 'obsidian' ? 0.48 : 0.32)),
    metalness: (style === 'roothollow' || style === 'ossuary') ? 0.16 : (style === 'obsidian' ? 0.68 : 0.90),
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(style === 'obsidian' ? 0.25 : 0.50, style === 'obsidian' ? 0.25 : 0.50),
    envMapIntensity: style === 'obsidian' ? 0.75 : 1.0
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: pal.darkMetalHex,
    roughnessMap: tex.metalORM,
    roughness: style === 'roothollow' ? 0.78 : (style === 'obsidian' ? 0.52 : 0.42),
    metalness: style === 'roothollow' ? 0.14 : (style === 'obsidian' ? 0.58 : 0.86),
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(style === 'obsidian' ? 0.30 : 0.62, style === 'obsidian' ? 0.30 : 0.62),
    envMapIntensity: style === 'obsidian' ? 0.75 : 1.0
  });

  const propPrimaryMat = new THREE.MeshStandardMaterial({
    color: style === 'alchemica' ? 0x115e50 : pal.propPrimaryHex,
    roughness: style === 'alchemica' ? 0.18 : (style === 'astral' ? 0.24 : 0.64),
    metalness: style === 'obsidian' ? 0.45 : 0.12,
    emissive: (style === 'alchemica' || style === 'astral') ? pal.propPrimaryHex : 0x000000,
    emissiveIntensity: style === 'alchemica' ? 0.68 : (style === 'astral' ? 0.55 : 0.0),
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.42, 0.42)
  });

  const propSecondaryMat = new THREE.MeshStandardMaterial({
    color: pal.propSecondaryHex,
    roughness: 0.72,
    metalness: style === 'obsidian' ? 0.72 : 0.12,
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.50, 0.50)
  });

  const glowCoreMat = new THREE.MeshStandardMaterial({
    color: 0x120c14,
    emissive: pal.brazierCoreHex,
    emissiveIntensity: 2.35,
    roughness: 0.32
  });

  const bossGlowMat = new THREE.MeshStandardMaterial({
    color: 0x140812,
    emissive: pal.bossFlameHex,
    emissiveIntensity: 2.6,
    roughness: 0.25
  });

  const boneDetailMat = new THREE.MeshStandardMaterial({
    color: 0xd6ccb8,
    roughness: 0.66,
    metalness: 0.05,
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.35, 0.35)
  });

  const amberGlowMat = new THREE.MeshStandardMaterial({
    color: 0x241104,
    emissive: 0xf59b34,
    emissiveIntensity: 2.15,
    roughness: 0.30
  });

  const glassShellMat = new THREE.MeshStandardMaterial({
    color: 0x8cc8c4,
    roughness: 0.14,
    metalness: 0.22,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });

  return {
    wallMat,
    pillarMat,
    capMat,
    trimMat,
    darkMetalMat,
    propPrimaryMat,
    propSecondaryMat,
    glowCoreMat,
    bossGlowMat,
    boneDetailMat,
    amberGlowMat,
    glassShellMat
  };
}

export function buildThemeColumn(parent, mats, biome, x, z, h = 6.4, animList = null) {
  const style = biome.archStyle;
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  if (style === 'roothollow') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.86, 0.75, 7), mats.capMat);
    plinth.position.y = 0.375;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.54, h, 9), mats.pillarMat);
    trunk.position.y = 0.75 + h * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    for (let r = 0; r < 3; r++) {
      const ang = (r * Math.PI * 2) / 3;
      const rootRib = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.22, h * 0.85, 6), mats.darkMetalMat);
      rootRib.position.set(Math.cos(ang) * 0.36, 0.65 + h * 0.38, Math.sin(ang) * 0.36);
      rootRib.rotation.z = -Math.cos(ang) * 0.11;
      rootRib.rotation.x = Math.sin(ang) * 0.11;
      rootRib.castShadow = true;
      g.add(rootRib);
    }

    const sporeCap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mats.glowCoreMat);
    sporeCap.scale.set(1.2, 0.55, 1.2);
    sporeCap.position.set(0.38, 2.35, 0.18);
    g.add(sporeCap);

    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.84, 0.75, 7), mats.capMat);
    crown.rotation.x = Math.PI;
    crown.position.y = 0.75 + h + 0.2;
    g.add(crown);
  } else if (style === 'ossuary') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.88, 1.38), mats.capMat);
    plinth.position.y = 0.44;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.50, h, 8), mats.pillarMat);
    shaft.position.y = 0.88 + h * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    [1.8, 3.3].forEach((ry) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.07, 6, 12), mats.boneDetailMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = ry;
      g.add(band);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), mats.boneDetailMat);
        skull.scale.set(0.88, 1.08, 0.95);
        skull.position.set(Math.cos(a) * 0.52, ry, Math.sin(a) * 0.52);
        g.add(skull);
      }
    });

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.52, 1.42), mats.capMat);
    cap.position.y = 0.88 + h + 0.24;
    g.add(cap);
  } else if (style === 'alchemica') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.82, 0.86, 8), mats.darkMetalMat);
    plinth.position.y = 0.43;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.12, 8), mats.trimMat);
    baseCollar.position.y = 0.88;
    g.add(baseCollar);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.43, h, 10), mats.pillarMat);
    shaft.position.y = 0.88 + h * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    // Four wrought-iron frame stanchions + twin burnished copper condenser risers
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.075, h * 0.92, 0.075), mats.darkMetalMat);
      rib.position.set(Math.cos(a) * 0.44, 0.90 + h * 0.46, Math.sin(a) * 0.44);
      g.add(rib);
    }
    [-1, 1].forEach((side) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, h * 0.94, 8), mats.trimMat);
      pipe.position.set(side * 0.47, 0.90 + h * 0.47, 0);
      pipe.castShadow = true;
      g.add(pipe);
    });

    [1.85, 2.95, 4.35].forEach((cy) => {
      if (cy < h + 0.4) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 6, 14), mats.trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = cy;
        g.add(ring);
      }
    });

    // Recessed caged sight-vial + warm amber pressure gauge dial
    const serumVial = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.76, 10), mats.propPrimaryMat);
    serumVial.position.set(0, 2.40, 0.36);
    g.add(serumVial);
    const gaugeRim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), mats.trimMat);
    gaugeRim.rotation.x = Math.PI / 2;
    gaugeRim.position.set(0, 3.32, 0.43);
    g.add(gaugeRim);
    const gaugeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 10), mats.amberGlowMat);
    gaugeFace.rotation.x = Math.PI / 2;
    gaugeFace.position.set(0, 3.32, 0.44);
    g.add(gaugeFace);

    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.48, 0.54, 8), mats.darkMetalMat);
    flange.position.y = 0.88 + h + 0.24;
    flange.castShadow = true;
    g.add(flange);
    const crownRim = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 1.36), mats.trimMat);
    crownRim.position.y = 0.88 + h + 0.54;
    g.add(crownRim);
  } else if (style === 'foundry') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.92, 1.46), mats.darkMetalMat);
    plinth.position.y = 0.46;
    plinth.castShadow = true;
    g.add(plinth);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.88, h, 0.88), mats.pillarMat);
    core.position.y = 0.92 + h * 0.5;
    core.castShadow = true;
    core.receiveShadow = true;
    g.add(core);

    const glowSlit = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.95, 0.24), mats.glowCoreMat);
    glowSlit.position.y = 2.05;
    g.add(glowSlit);

    [1.45, 2.65, 4.1].forEach((ry) => {
      const clampCollar = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.16, 1.06), mats.trimMat);
      clampCollar.position.y = ry;
      g.add(clampCollar);
    });

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.58, 1.52), mats.darkMetalMat);
    cap.position.y = 0.92 + h + 0.25;
    g.add(cap);
  } else if (style === 'inquisition') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.85, 1.36), mats.capMat);
    plinth.position.y = 0.425;
    plinth.castShadow = true;
    g.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, h, 8), mats.pillarMat);
    shaft.position.y = 0.85 + h * 0.5;
    shaft.castShadow = true;
    g.add(shaft);

    [2.1, 3.6].forEach((ry) => {
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.05, 6, 12), mats.darkMetalMat);
      shackle.rotation.x = Math.PI / 2;
      shackle.position.y = ry;
      g.add(shackle);
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2 + Math.PI / 4;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.34, 6), mats.trimMat);
        spike.position.set(Math.cos(a) * 0.62, ry, Math.sin(a) * 0.62);
        spike.rotation.z = -Math.cos(a) * (Math.PI / 2);
        spike.rotation.x = Math.sin(a) * (Math.PI / 2);
        g.add(spike);
      }
    });

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.46, 0.56, 8), mats.darkMetalMat);
    cap.position.y = 0.85 + h + 0.26;
    g.add(cap);
  } else if (style === 'obsidian') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.92, 1.44), mats.darkMetalMat);
    plinth.position.y = 0.46;
    plinth.castShadow = true;
    g.add(plinth);

    const goldBaseTrim = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.18, 1.50), mats.trimMat);
    goldBaseTrim.position.y = 0.92;
    g.add(goldBaseTrim);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.84, h, 0.84), mats.pillarMat);
    shaft.position.y = 0.96 + h * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    [[-0.41, -0.41], [0.41, -0.41], [-0.41, 0.41], [0.41, 0.41]].forEach(([rx, rz]) => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), mats.trimMat);
      rib.position.set(rx, 0.96 + h * 0.5, rz);
      g.add(rib);
    });

    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mats.glowCoreMat);
    crest.position.set(0, 2.85, 0);
    crest.scale.set(1.5, 1.5, 1.5);
    g.add(crest);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.48, 1.48), mats.trimMat);
    cap.position.y = 0.96 + h + 0.22;
    g.add(cap);
  } else if (style === 'astral') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.76, 6), mats.darkMetalMat);
    plinth.position.y = 0.38;
    plinth.castShadow = true;
    g.add(plinth);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 2.0, 6), mats.pillarMat);
    lower.position.y = 1.76;
    lower.castShadow = true;
    g.add(lower);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.30, 0), mats.glowCoreMat);
    core.position.y = 3.22;
    g.add(core);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 20), mats.trimMat);
    ring.position.y = 3.22;
    ring.rotation.x = 0.65;
    g.add(ring);

    const upperH = Math.max(1.6, h - 3.0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.26, upperH, 6), mats.pillarMat);
    upper.position.y = 3.85 + upperH * 0.5;
    upper.castShadow = true;
    g.add(upper);

    if (animList) {
      core.userData.dynamicSubtree = true;
      ring.userData.dynamicSubtree = true;
      animList.push((time) => {
        core.rotation.y = time * 1.4 + x * 0.2;
        ring.rotation.z = time * 0.9 + z * 0.2;
      });
    }
  } else {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.35), mats.capMat);
    plinth.position.y = 0.425;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.50, h, 12), mats.pillarMat);
    shaft.position.y = 0.85 + h * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.16, 12), mats.trimMat);
    ring.position.y = 2.8;
    g.add(ring);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.46, 0.55, 10), mats.capMat);
    cap.position.y = 0.85 + h + 0.25;
    cap.castShadow = true;
    g.add(cap);
  }

  parent.add(g);
  return g;
}

export function decorateWallSegment(wallGroup, mats, biome, len, height, thickness) {
  if (len < 4.2) return;
  const style = biome.archStyle;
  const count = Math.max(1, Math.min(3, Math.floor(len / 5.2)));

  for (let i = 0; i < count; i++) {
    const zPos = ((i + 0.5) / count - 0.5) * (len - 1.6);
    if (style === 'roothollow') {
      [-1, 1].forEach((side) => {
        const tendril = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, height * 0.82, 6), mats.darkMetalMat);
        tendril.position.set(side * (thickness * 0.5 + 0.06), height * 0.42, zPos);
        tendril.rotation.x = 0.14 * (i % 2 === 0 ? 1 : -1);
        wallGroup.add(tendril);
      });
    } else if (style === 'ossuary') {
      [-1, 1].forEach((side) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.15), mats.capMat);
        frame.position.set(side * (thickness * 0.5 + 0.05), 1.85, zPos);
        wallGroup.add(frame);
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), mats.boneDetailMat);
        skull.position.set(side * (thickness * 0.5 + 0.14), 1.85, zPos);
        wallGroup.add(skull);
      });
    } else if (style === 'alchemica') {
      const runLen = Math.min(len - 0.9, 3.6);
      [-1, 1].forEach((side) => {
        const sx = side * (thickness * 0.5 + 0.08);
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.18, height * 0.86, 0.34), mats.darkMetalMat);
        pilaster.position.set(sx, height * 0.44, zPos);
        wallGroup.add(pilaster);

        [1.45, 2.75].forEach((py, pIdx) => {
          if (py < height - 0.35) {
            const pipe = new THREE.Mesh(
              new THREE.CylinderGeometry(pIdx === 0 ? 0.065 : 0.048, pIdx === 0 ? 0.065 : 0.048, runLen, 8),
              mats.trimMat
            );
            pipe.rotation.x = Math.PI / 2;
            pipe.position.set(side * (thickness * 0.5 + 0.13), py, zPos);
            wallGroup.add(pipe);
          }
        });

        if (height >= 3.6) {
          const dialRim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), mats.trimMat);
          dialRim.rotation.z = Math.PI / 2;
          dialRim.position.set(side * (thickness * 0.5 + 0.16), 2.12, zPos);
          wallGroup.add(dialRim);
          const dialGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 10), mats.amberGlowMat);
          dialGlow.rotation.z = Math.PI / 2;
          dialGlow.position.set(side * (thickness * 0.5 + 0.17), 2.12, zPos);
          wallGroup.add(dialGlow);
        }
      });
    } else if (style === 'foundry') {
      [-1, 1].forEach((side) => {
        const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.24, height * 0.88, 0.48), mats.darkMetalMat);
        buttress.position.set(side * (thickness * 0.5 + 0.10), height * 0.45, zPos);
        wallGroup.add(buttress);
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.34), mats.glowCoreMat);
        vent.position.set(side * (thickness * 0.5 + 0.10), 0.95, zPos);
        wallGroup.add(vent);
      });
    } else if (style === 'inquisition') {
      [-1, 1].forEach((side) => {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, height * 0.82, 0.28), mats.darkMetalMat);
        rib.position.set(side * (thickness * 0.5 + 0.07), height * 0.45, zPos);
        wallGroup.add(rib);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 12), mats.trimMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(side * (thickness * 0.5 + 0.16), 2.1, zPos);
        wallGroup.add(ring);
      });
    } else if (style === 'obsidian') {
      [-1, 1].forEach((side) => {
        const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.14, height * 0.72, 0.30), mats.trimMat);
        inlay.position.set(side * (thickness * 0.5 + 0.04), height * 0.48, zPos);
        wallGroup.add(inlay);
      });
    } else if (style === 'astral') {
      [-1, 1].forEach((side) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, height * 0.66, 0.14), mats.glowCoreMat);
        strip.position.set(side * (thickness * 0.5 + 0.04), height * 0.50, zPos);
        wallGroup.add(strip);
      });
    } else {
      [-1, 1].forEach((side) => {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.16, height * 0.84, 0.42), mats.capMat);
        pilaster.position.set(side * (thickness * 0.5 + 0.06), height * 0.44, zPos);
        wallGroup.add(pilaster);
      });
    }
  }
}

export function buildThemeBrazier(root, tex, mats, biome, x, z, colorHex, haloHex, brazierIdx) {
  const style = biome.archStyle;
  const bg = new THREE.Group();
  bg.position.set(x, 0, z);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x140b12,
    emissive: colorHex,
    emissiveIntensity: 2.3,
    roughness: 0.35
  });

  if (style === 'roothollow') {
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.58, 0.86, 7), mats.darkMetalMat);
    stump.position.y = 0.43;
    stump.castShadow = true;
    bg.add(stump);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), coreMat);
    bulb.scale.set(0.95, 1.25, 0.95);
    bulb.position.y = 1.18;
    bg.add(bulb);
  } else if (style === 'ossuary') {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, 0.82, 8), mats.capMat);
    ped.position.y = 0.41;
    ped.castShadow = true;
    bg.add(ped);
    const skullBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.28, 0.42, 8), mats.boneDetailMat);
    skullBowl.position.y = 1.04;
    bg.add(skullBowl);
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), coreMat);
    coals.scale.set(1, 0.45, 1);
    coals.position.y = 1.22;
    bg.add(coals);
  } else if (style === 'alchemica') {
    // Victorian wrought-iron & copper alembic gaslight lantern with warm firebox + viridian spirit core
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.48, 8), mats.darkMetalMat);
    base.position.y = 0.24;
    base.castShadow = true;
    bg.add(base);

    const firebox = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.18, 8), mats.amberGlowMat);
    firebox.position.y = 0.56;
    bg.add(firebox);

    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.40, 12, 8), mats.trimMat);
    kettle.scale.set(1, 0.58, 1);
    kettle.position.y = 0.80;
    kettle.castShadow = true;
    bg.add(kettle);

    const coreVial = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.56, 10), coreMat);
    coreVial.position.y = 1.24;
    bg.add(coreVial);

    const glass = markIgnoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.60, 12), mats.glassShellMat));
    glass.position.y = 1.24;
    bg.add(glass);

    for (let r = 0; r < 4; r++) {
      const a = (r * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.66, 6), mats.darkMetalMat);
      strut.position.set(Math.cos(a) * 0.32, 1.24, Math.sin(a) * 0.32);
      bg.add(strut);
    }

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 8), mats.trimMat);
    cap.position.y = 1.70;
    cap.castShadow = true;
    bg.add(cap);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.24, 8), mats.darkMetalMat);
    finial.position.y = 1.96;
    bg.add(finial);
  } else if (style === 'foundry') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.68, 0.96), mats.darkMetalMat);
    base.position.y = 0.34;
    base.castShadow = true;
    bg.add(base);
    const vat = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.42, 0.52, 8), mats.darkMetalMat);
    vat.position.y = 0.94;
    vat.castShadow = true;
    bg.add(vat);
    const slag = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.48, 0.14, 10), coreMat);
    slag.position.y = 1.18;
    bg.add(slag);
  } else if (style === 'inquisition') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.48, 0.88, 8), mats.darkMetalMat);
    post.position.y = 0.44;
    post.castShadow = true;
    bg.add(post);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.30, 0.56, 8, 1, true), mats.darkMetalMat);
    cage.position.y = 1.14;
    bg.add(cage);
    const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), coreMat);
    heart.position.y = 1.16;
    bg.add(heart);
  } else if (style === 'obsidian') {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.88, 0.88), mats.pillarMat);
    ped.position.y = 0.44;
    ped.castShadow = true;
    bg.add(ped);
    const chalice = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.20, 0.52, 8), mats.trimMat);
    chalice.position.y = 1.12;
    chalice.castShadow = true;
    bg.add(chalice);
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), coreMat);
    coals.scale.set(1, 0.42, 1);
    coals.position.y = 1.34;
    bg.add(coals);
  } else if (style === 'astral') {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.54, 0.64, 6), mats.darkMetalMat);
    ped.position.y = 0.32;
    ped.castShadow = true;
    bg.add(ped);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), coreMat);
    crystal.scale.set(0.85, 1.55, 0.85);
    crystal.position.y = 1.28;
    bg.add(crystal);
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.03, 6, 18), mats.trimMat);
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = 1.28;
    bg.add(haloRing);
  } else {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.62, 0.72, 8), mats.capMat);
    ped.position.y = 0.36;
    ped.castShadow = true;
    bg.add(ped);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.26, 0.44, 10), mats.darkMetalMat);
    bowl.position.y = 1.05;
    bowl.castShadow = true;
    bg.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 18), mats.trimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.26;
    bg.add(rim);
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), coreMat);
    coals.scale.set(1, 0.4, 1);
    coals.position.y = 1.20;
    bg.add(coals);
  }

  const flameSprites = [];
  for (let f = 0; f < 2; f++) {
    const smat = new THREE.SpriteMaterial({
      map: tex.softParticleTex,
      color: f === 0 ? colorHex : haloHex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: f === 0 ? 0.74 : 0.86
    });
    const sp = markIgnoreAO(new THREE.Sprite(smat));
    const sz = f === 0 ? 1.40 : 0.72;
    sp.scale.set(sz * 0.75, sz * 1.32, 1);
    sp.position.set(0, 1.58 + f * 0.12, 0);
    bg.add(sp);
    flameSprites.push({ sp, baseY: sp.position.y, sz, phase: brazierIdx * 1.7 + f * 2.1 });
  }

  root.add(bg);
  return flameSprites;
}

export function buildThemeDestructible(root, mats, biome, x, z, kind = 'urn') {
  const style = biome.archStyle;
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  if (style === 'roothollow') {
    if (kind === 'barrel') {
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.84, 8), mats.propPrimaryMat);
      cask.position.y = 0.42;
      cask.castShadow = true;
      g.add(cask);
      const vine = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.04, 6, 10), mats.propSecondaryMat);
      vine.rotation.x = 1.2;
      vine.position.y = 0.46;
      g.add(vine);
    } else {
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.38, 9, 8), mats.propSecondaryMat);
      pod.scale.set(0.95, 1.25, 0.95);
      pod.position.y = 0.44;
      pod.castShadow = true;
      g.add(pod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.glowCoreMat);
      tip.position.y = 0.88;
      g.add(tip);
    }
  } else if (style === 'ossuary') {
    if (kind === 'barrel') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.68), mats.propSecondaryMat);
      crate.position.y = 0.39;
      crate.castShadow = true;
      g.add(crate);
      const skullTop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), mats.boneDetailMat);
      skullTop.position.y = 0.88;
      g.add(skullTop);
    } else {
      const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.20, 0.68, 8), mats.boneDetailMat);
      urn.position.y = 0.34;
      urn.castShadow = true;
      g.add(urn);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 8), mats.trimMat);
      lid.position.y = 0.82;
      g.add(lid);
    }
  } else if (style === 'alchemica') {
    if (kind === 'barrel') {
      // Oiled walnut apothecary cask with burnished copper hoops & brass spigot
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.32, 0.86, 10), mats.propSecondaryMat);
      drum.position.y = 0.43;
      drum.castShadow = true;
      drum.receiveShadow = true;
      g.add(drum);
      [0.20, 0.66].forEach((hy) => {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.028, 6, 14), mats.trimMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = hy;
        g.add(hoop);
      });
      const vialTag = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 8), mats.propPrimaryMat);
      vialTag.position.set(0.34, 0.46, 0);
      g.add(vialTag);
    } else {
      // Wrought-iron cradled swan-neck glass retort carboy
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.34, 8), mats.darkMetalMat);
      basket.position.y = 0.17;
      basket.castShadow = true;
      g.add(basket);
      const serumCore = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mats.propPrimaryMat);
      serumCore.position.y = 0.44;
      g.add(serumCore);
      const flask = markIgnoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mats.glassShellMat));
      flask.position.y = 0.45;
      flask.castShadow = true;
      g.add(flask);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 6, 12), mats.trimMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.72;
      g.add(collar);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.36, 8), mats.trimMat);
      neck.position.set(0.06, 0.88, 0);
      neck.rotation.z = -0.32;
      g.add(neck);
    }
  } else if (style === 'foundry') {
    if (kind === 'barrel') {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.88, 10), mats.darkMetalMat);
      drum.position.y = 0.44;
      drum.castShadow = true;
      g.add(drum);
      const emberTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 8), mats.glowCoreMat);
      emberTop.position.y = 0.88;
      g.add(emberTop);
    } else {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.68, 8), mats.propPrimaryMat);
      pot.position.y = 0.34;
      pot.castShadow = true;
      g.add(pot);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 12), mats.trimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.68;
      g.add(rim);
    }
  } else if (style === 'inquisition') {
    if (kind === 'barrel') {
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.86, 8), mats.propSecondaryMat);
      cask.position.y = 0.43;
      cask.castShadow = true;
      g.add(cask);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.76), mats.darkMetalMat);
      strap.position.y = 0.50;
      g.add(strap);
    } else {
      const amphora = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.18, 0.76, 10), mats.propPrimaryMat);
      amphora.position.y = 0.38;
      amphora.castShadow = true;
      g.add(amphora);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.28, 8), mats.trimMat);
      spike.position.y = 0.90;
      g.add(spike);
    }
  } else if (style === 'obsidian') {
    if (kind === 'barrel') {
      const coffer = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.68), mats.propPrimaryMat);
      coffer.position.y = 0.39;
      coffer.castShadow = true;
      g.add(coffer);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.72), mats.trimMat);
      trim.position.y = 0.72;
      g.add(trim);
    } else {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.22, 0.72, 8), mats.propPrimaryMat);
      jar.position.y = 0.36;
      jar.castShadow = true;
      g.add(jar);
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), mats.trimMat);
      crown.position.y = 0.88;
      g.add(crown);
    }
  } else if (style === 'astral') {
    if (kind === 'barrel') {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.86, 6), mats.darkMetalMat);
      pylon.position.y = 0.43;
      pylon.castShadow = true;
      g.add(pylon);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 6), mats.propPrimaryMat);
      core.position.y = 0.46;
      g.add(core);
    } else {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mats.propPrimaryMat);
      shard.scale.set(0.85, 1.35, 0.85);
      shard.position.y = 0.52;
      shard.castShadow = true;
      g.add(shard);
    }
  } else {
    if (kind === 'barrel') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.86, 10), mats.propSecondaryMat);
      body.position.y = 0.43;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      [0.22, 0.64].forEach((hy) => {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 14), mats.darkMetalMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = hy;
        g.add(hoop);
      });
    } else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.62, 10), mats.propPrimaryMat);
      base.position.y = 0.31;
      base.castShadow = true;
      g.add(base);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.30, 0.30, 10), mats.propPrimaryMat);
      neck.position.y = 0.74;
      neck.castShadow = true;
      g.add(neck);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 8), mats.trimMat);
      lid.position.y = 0.98;
      g.add(lid);
    }
  }

  root.add(g);
  g.userData.dynamicSubtree = true;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return g;
}

export function buildThemeObstacle(root, mats, biome, x, z, tall = false, animList = null) {
  const style = biome.archStyle;
  const h = tall ? 3.1 : 2.7;
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  if (style === 'roothollow') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.86, h, 7), mats.pillarMat);
    trunk.position.y = h * 0.5;
    trunk.castShadow = true;
    g.add(trunk);
    const shroom1 = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.22, 8), mats.glowCoreMat);
    shroom1.position.set(0.52, 1.1, 0.2);
    g.add(shroom1);
    const shroom2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 8), mats.glowCoreMat);
    shroom2.position.set(-0.46, 1.65, -0.25);
    g.add(shroom2);
  } else if (style === 'ossuary') {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.52, 1.42), mats.capMat);
    plinth.position.y = 0.26;
    plinth.castShadow = true;
    g.add(plinth);
    const stele = new THREE.Mesh(new THREE.BoxGeometry(1.06, h - 0.4, 0.86), mats.pillarMat);
    stele.position.y = 0.52 + (h - 0.4) * 0.5;
    stele.castShadow = true;
    g.add(stele);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mats.boneDetailMat);
    skull.position.set(0, h + 0.22, 0);
    g.add(skull);
  } else if (style === 'alchemica') {
    // Ornate Swan-Neck Copper Alembic Still & Wrought-Iron Conservatory Apparatus
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.88, 0.56, 8), mats.darkMetalMat);
    base.position.y = 0.28;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const baseRim = new THREE.Mesh(new THREE.CylinderGeometry(0.80, 0.80, 0.10, 8), mats.trimMat);
    baseRim.position.y = 0.58;
    g.add(baseRim);

    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.10), mats.amberGlowMat);
      hearth.position.set(Math.cos(a) * 0.77, 0.32, Math.sin(a) * 0.77);
      hearth.rotation.y = -a + Math.PI / 2;
      g.add(hearth);
    }

    const kettleBelly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mats.trimMat);
    kettleBelly.scale.set(1, 0.62, 1);
    kettleBelly.position.y = 0.86;
    kettleBelly.castShadow = true;
    g.add(kettleBelly);

    const chamberH = Math.max(1.05, h - 1.55);
    const chamberMidY = 1.12 + chamberH * 0.5;
    const serumCore = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, chamberH * 0.88, 12), mats.propPrimaryMat);
    serumCore.position.y = chamberMidY;
    g.add(serumCore);

    const glassSleeve = markIgnoreAO(new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, chamberH, 14),
      mats.glassShellMat
    ));
    glassSleeve.position.y = chamberMidY;
    g.add(glassSleeve);

    for (let r = 0; r < 4; r++) {
      const a = (r * Math.PI) / 2 + Math.PI / 4;
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.08, chamberH + 0.16, 0.08), mats.darkMetalMat);
      stanchion.position.set(Math.cos(a) * 0.49, chamberMidY, Math.sin(a) * 0.49);
      stanchion.castShadow = true;
      g.add(stanchion);
    }
    [-0.32, 0.32].forEach((offY) => {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.04, 6, 16), mats.trimMat);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = chamberMidY + offY * chamberH;
      g.add(strap);
    });

    const helmetY = 1.12 + chamberH;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.50, 14, 10), mats.trimMat);
    helmet.scale.set(1, 0.78, 1);
    helmet.position.y = helmetY + 0.14;
    helmet.castShadow = true;
    g.add(helmet);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 10), mats.trimMat);
    spire.position.y = helmetY + 0.64;
    spire.castShadow = true;
    g.add(spire);

    // Swan-neck copper distillation gooseneck + side condenser flask
    const swanArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.92, 8), mats.trimMat);
    swanArm.position.set(0.38, helmetY + 0.34, 0);
    swanArm.rotation.z = -1.05;
    g.add(swanArm);
    const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, chamberH + 0.45, 8), mats.trimMat);
    downTube.position.set(0.72, chamberMidY + 0.1, 0);
    g.add(downTube);
    const sideFlask = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.48, 10), mats.darkMetalMat);
    sideFlask.position.set(0.72, 0.80, 0);
    g.add(sideFlask);

    if (animList) {
      serumCore.userData.dynamicSubtree = true;
      animList.push((time) => {
        serumCore.scale.y = 0.94 + Math.sin(time * 2.1 + x * 0.5) * 0.05;
      });
    }
  } else if (style === 'foundry') {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.48, h * 0.65, 1.48), mats.darkMetalMat);
    block.position.y = h * 0.325;
    block.castShadow = true;
    g.add(block);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, h * 0.45, 8), mats.glowCoreMat);
    core.position.y = h * 0.80;
    g.add(core);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.32, 1.36), mats.trimMat);
    cap.position.y = h + 0.05;
    g.add(cap);
  } else if (style === 'inquisition') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.86, 0.45, 8), mats.capMat);
    base.position.y = 0.225;
    base.castShadow = true;
    g.add(base);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, h - 0.5, 8), mats.darkMetalMat);
    cage.position.y = 0.45 + (h - 0.5) * 0.5;
    cage.castShadow = true;
    g.add(cage);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.65, 8), mats.trimMat);
    finial.position.y = h + 0.25;
    g.add(finial);
  } else if (style === 'obsidian') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 1.42), mats.trimMat);
    base.position.y = 0.29;
    base.castShadow = true;
    g.add(base);
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.72, h, 4), mats.pillarMat);
    obelisk.rotation.y = Math.PI / 4;
    obelisk.position.y = 0.58 + h * 0.5;
    obelisk.castShadow = true;
    g.add(obelisk);
  } else if (style === 'astral') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 0.44, 6), mats.darkMetalMat);
    base.position.y = 0.22;
    base.castShadow = true;
    g.add(base);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), mats.propPrimaryMat);
    crystal.scale.set(0.85, 1.65, 0.85);
    crystal.position.y = 1.65;
    crystal.castShadow = true;
    g.add(crystal);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.04, 8, 24), mats.trimMat);
    orbit.position.y = 1.65;
    orbit.rotation.x = 0.8;
    g.add(orbit);
    if (animList) {
      crystal.userData.dynamicSubtree = true;
      orbit.userData.dynamicSubtree = true;
      animList.push((time) => {
        crystal.rotation.y = time * 1.1 + x;
        orbit.rotation.z = -time * 1.3 + z;
      });
    }
  } else {
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.85, h, 8), mats.pillarMat);
    ob.position.y = h * 0.5;
    ob.castShadow = true;
    ob.receiveShadow = true;
    g.add(ob);
  }

  root.add(g);
  return g;
}

export function buildThemeBossLandmark(root, mats, biome, cx, cz, halfD, animList = null) {
  const style = biome.archStyle;
  const zWall = cz - halfD + 0.65;
  const g = new THREE.Group();
  g.position.set(cx, 0, zWall);

  if (style === 'roothollow') {
    [-1, 1].forEach((side) => {
      const rootLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.78, 8.8, 8), mats.darkMetalMat);
      rootLimb.position.set(side * 3.2, 4.2, 0);
      rootLimb.rotation.z = side * 0.36;
      g.add(rootLimb);
    });
    const heartSeed = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 1), mats.bossGlowMat);
    heartSeed.position.set(0, 6.8, 0.3);
    g.add(heartSeed);
    if (animList) {
      heartSeed.userData.dynamicSubtree = true;
      animList.push((time) => {
        heartSeed.rotation.y = time * 0.7;
        heartSeed.scale.setScalar(1.0 + Math.sin(time * 2.6) * 0.06);
      });
    }
  } else if (style === 'ossuary') {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.32, 8, 20, Math.PI), mats.boneDetailMat);
    arch.position.set(0, 5.2, 0);
    g.add(arch);
    for (let i = -3; i <= 3; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 4.6 + (3 - Math.abs(i)) * 0.85, 8), mats.trimMat);
      pipe.position.set(i * 0.68, 5.6, -0.1);
      g.add(pipe);
    }
    const crownSkull = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), mats.bossGlowMat);
    crownSkull.position.set(0, 5.8, 0.25);
    g.add(crownSkull);
  } else if (style === 'alchemica') {
    // Monumental Royal Alchemica Astrolabe & Twin Copper Alembic Towers
    const dais = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.05, 1.35), mats.darkMetalMat);
    dais.position.set(0, 0.525, 0.15);
    dais.castShadow = true;
    g.add(dais);
    const daisTrim = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.16, 1.45), mats.trimMat);
    daisTrim.position.set(0, 1.08, 0.15);
    g.add(daisTrim);

    // Flanking copper & wrought-iron distillation towers with manifold bridges
    [-3.2, 3.2].forEach((ox) => {
      const sgn = Math.sign(ox);
      const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 1.2, 8), mats.darkMetalMat);
      towerBase.position.set(ox, 1.65, 0.18);
      g.add(towerBase);
      const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.18), mats.amberGlowMat);
      hearth.position.set(ox, 1.55, 0.92);
      g.add(hearth);

      const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), mats.trimMat);
      kettle.scale.set(1, 0.68, 1);
      kettle.position.set(ox, 2.55, 0.18);
      g.add(kettle);

      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 2.1, 12), mats.propPrimaryMat);
      core.position.set(ox, 3.95, 0.18);
      g.add(core);
      const sleeve = markIgnoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 2.25, 14), mats.glassShellMat));
      sleeve.position.set(ox, 3.95, 0.18);
      g.add(sleeve);
      for (let r = 0; r < 4; r++) {
        const a = (r * Math.PI) / 2 + Math.PI / 4;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 0.08), mats.darkMetalMat);
        bar.position.set(ox + Math.cos(a) * 0.54, 3.95, 0.18 + Math.sin(a) * 0.54);
        g.add(bar);
      }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 10), mats.trimMat);
      dome.position.set(ox, 5.25, 0.18);
      g.add(dome);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 10), mats.trimMat);
      spire.position.set(ox, 5.95, 0.18);
      g.add(spire);

      // Overhead copper feed pipe curving into central Astrolabe
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.35, 10), mats.trimMat);
      bridge.position.set(ox - sgn * 1.15, 5.85, 0.28);
      bridge.rotation.z = sgn * 1.28;
      g.add(bridge);
    });

    // Central Astrolabe Gimbal & Philosopher's Crucible Core
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.96, 2.6, 8), mats.darkMetalMat);
    pedestal.position.set(0, 2.35, 0.25);
    g.add(pedestal);

    const outerBezel = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.13, 10, 36), mats.trimMat);
    outerBezel.position.set(0, 6.0, 0.35);
    g.add(outerBezel);

    const midGimbal = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.09, 10, 32), mats.trimMat);
    midGimbal.position.set(0, 6.0, 0.35);
    g.add(midGimbal);

    const innerGimbal = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.075, 8, 28), mats.darkMetalMat);
    innerGimbal.position.set(0, 6.0, 0.35);
    g.add(innerGimbal);

    const crucibleCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), mats.bossGlowMat);
    crucibleCore.position.set(0, 6.0, 0.35);
    g.add(crucibleCore);

    const coreShell = markIgnoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.92, 16, 12), mats.glassShellMat));
    coreShell.position.set(0, 6.0, 0.35);
    g.add(coreShell);

    if (animList) {
      outerBezel.userData.dynamicSubtree = true;
      midGimbal.userData.dynamicSubtree = true;
      innerGimbal.userData.dynamicSubtree = true;
      crucibleCore.userData.dynamicSubtree = true;
      animList.push((time) => {
        outerBezel.rotation.z = time * 0.22;
        midGimbal.rotation.y = time * 0.58;
        midGimbal.rotation.x = Math.sin(time * 0.35) * 0.42;
        innerGimbal.rotation.x = -time * 0.78;
        innerGimbal.rotation.z = 0.52;
        crucibleCore.rotation.y = -time * 0.95;
      });
    }
  } else if (style === 'foundry') {
    const chute = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.95, 2.6, 10), mats.darkMetalMat);
    chute.position.set(0, 7.6, 0.2);
    chute.rotation.x = 0.28;
    g.add(chute);
    const lavaStream = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 6.8, 12), mats.bossGlowMat);
    lavaStream.position.set(0, 3.8, 0.45);
    g.add(lavaStream);
  } else if (style === 'inquisition') {
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 7.2, 0.42), mats.trimMat);
    vBar.position.set(0, 5.8, 0);
    g.add(vBar);
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.56, 0.42), mats.trimMat);
    hBar.position.set(0, 7.2, 0);
    g.add(hBar);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), mats.bossGlowMat);
    core.position.set(0, 7.2, 0.28);
    g.add(core);
  } else if (style === 'obsidian') {
    const sunRing = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.22, 10, 32), mats.trimMat);
    sunRing.position.set(0, 7.2, 0);
    g.add(sunRing);
    const eclipse = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), mats.pillarMat);
    eclipse.position.set(0, 7.2, -0.05);
    g.add(eclipse);
    const corona = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.45, 32), mats.bossGlowMat);
    corona.position.set(0, 7.2, 0.02);
    g.add(corona);
  } else if (style === 'astral') {
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 10, 36), mats.trimMat);
    ring1.position.set(0, 7.2, 0.4);
    g.add(ring1);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.10, 10, 32), mats.trimMat);
    ring2.position.set(0, 7.2, 0.4);
    g.add(ring2);
    const starCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.88, 1), mats.bossGlowMat);
    starCore.position.set(0, 7.2, 0.4);
    g.add(starCore);
    if (animList) {
      ring1.userData.dynamicSubtree = true;
      ring2.userData.dynamicSubtree = true;
      starCore.userData.dynamicSubtree = true;
      animList.push((time) => {
        ring1.rotation.z = time * 0.55;
        ring1.rotation.x = Math.sin(time * 0.4) * 0.45;
        ring2.rotation.y = time * 0.85;
        ring2.rotation.x = 0.65;
        starCore.rotation.y = -time * 1.2;
      });
    }
  } else {
    const rose = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.20, 10, 28), mats.trimMat);
    rose.position.set(0, 7.6, 0);
    g.add(rose);
    for (let s = 0; s < 6; s++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 4.7, 0.10), mats.trimMat);
      bar.position.set(0, 7.6, 0);
      bar.rotation.z = (s * Math.PI) / 6;
      g.add(bar);
    }
  }

  root.add(g);
  return g;
}

export function buildThemeGate(root, mats, biome, gx, gz, rotateY, gateHalfW) {
  const style = biome.archStyle;
  const gateGroup = new THREE.Group();
  gateGroup.position.set(gx, -4.2, gz);
  gateGroup.visible = false;
  if (rotateY) gateGroup.rotation.y = Math.PI / 2;

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(gateHalfW * 2, 0.30, 0.26), mats.trimMat);
  topBeam.position.y = 3.4;
  gateGroup.add(topBeam);

  const barMat = style === 'astral' ? mats.glowCoreMat : (style === 'ossuary' ? mats.boneDetailMat : mats.darkMetalMat);
  for (let b = -4; b <= 4; b++) {
    const radius = style === 'roothollow' ? 0.085 : 0.058;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, 3.5, 8), barMat);
    bar.position.set(b * 0.54, 1.7, 0);
    if (style === 'roothollow') bar.rotation.z = (b % 2 === 0 ? 1 : -1) * 0.04;
    bar.castShadow = true;
    gateGroup.add(bar);
  }
  if (style === 'alchemica') {
    const crossRail = new THREE.Mesh(new THREE.BoxGeometry(gateHalfW * 1.92, 0.16, 0.18), mats.trimMat);
    crossRail.position.y = 1.85;
    gateGroup.add(crossRail);
    const valveWheel = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 8, 16), mats.trimMat);
    valveWheel.position.set(0, 1.85, 0);
    gateGroup.add(valveWheel);
  }

  root.add(gateGroup);
  gateGroup.userData.dynamicSubtree = true;
  return gateGroup;
}
