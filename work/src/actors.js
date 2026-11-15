import * as THREE from 'three';
import { buildClassHeroRig } from './class_models.js';

export function createMaterials(tex) {
  return {
    silverSteel: new THREE.MeshPhysicalMaterial({
      color: 0xbac4d4,
      roughnessMap: tex.metalORM,
      roughness: 0.30,
      metalness: 0.92,
      clearcoat: 0.22,
      clearcoatRoughness: 0.34,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 1.25
    }),
    darkPlate: new THREE.MeshPhysicalMaterial({
      color: 0x3b424f,
      roughnessMap: tex.metalORM,
      roughness: 0.38,
      metalness: 0.88,
      clearcoat: 0.18,
      clearcoatRoughness: 0.38,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 1.15
    }),
    gildedBronze: new THREE.MeshPhysicalMaterial({
      color: 0xd4a459,
      roughnessMap: tex.metalORM,
      roughness: 0.32,
      metalness: 0.90,
      clearcoat: 0.20,
      clearcoatRoughness: 0.34,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      envMapIntensity: 1.25
    }),
    crimsonCloth: new THREE.MeshStandardMaterial({
      color: 0x5e131a,
      roughness: 0.88,
      metalness: 0.04,
      normalMap: tex.stoneNormal,
      normalScale: new THREE.Vector2(0.25, 0.25),
      side: THREE.DoubleSide
    }),
    obsidianArmor: new THREE.MeshPhysicalMaterial({
      color: 0x1e222b,
      roughnessMap: tex.metalORM,
      roughness: 0.34,
      metalness: 0.90,
      clearcoat: 0.22,
      clearcoatRoughness: 0.35,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.58, 0.58),
      envMapIntensity: 1.20
    }),
    tatteredShroud: new THREE.MeshStandardMaterial({
      color: 0x232732,
      roughness: 0.92,
      metalness: 0.03,
      side: THREE.DoubleSide
    }),
    boneIvory: new THREE.MeshStandardMaterial({
      color: 0xc5bca8,
      roughness: 0.68,
      metalness: 0.05,
      normalMap: tex.stoneNormal,
      normalScale: new THREE.Vector2(0.32, 0.32)
    })
  };
}

export function markIgnoreAO(obj) {
  obj.userData.ignoreAO = true;
  return obj;
}

export function createHeroRig(mats, initialTheme = null, classId = null) {
  if (mats) {
    return buildClassHeroRig(classId || 'ember_paladin', mats, initialTheme);
  }
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const clothMat = mats.crimsonCloth.clone();
  const armorMat = mats.silverSteel.clone();
  const trimMat = mats.gildedBronze.clone();

  const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.72, 10);
  const leftLeg = new THREE.Mesh(legGeo, mats.darkPlate);
  leftLeg.position.set(-0.16, 0.38, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, mats.darkPlate);
  rightLeg.position.set(0.16, 0.38, 0);
  rightLeg.castShadow = true;
  body.add(leftLeg, rightLeg);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.34, 10), clothMat);
  waist.position.y = 0.82;
  waist.castShadow = true;
  body.add(waist);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 18), trimMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.96;
  body.add(belt);

  const torso = new THREE.Group();
  torso.position.y = 1.24;
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.25, 0.58, 10), armorMat);
  chest.scale.set(1.12, 1, 0.78);
  chest.castShadow = true;
  chest.receiveShadow = true;
  torso.add(chest);

  const chestTrim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.54), trimMat);
  chestTrim.castShadow = true;
  torso.add(chestTrim);

  [-1, 1].forEach((side) => {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), armorMat);
    pauldron.position.set(side * 0.40, 0.18, 0);
    pauldron.rotation.z = -side * 0.42;
    pauldron.castShadow = true;
    torso.add(pauldron);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 8, 16), trimMat);
    rim.position.set(side * 0.40, 0.12, 0);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.y = -side * 0.42;
    torso.add(rim);
  });

  const head = new THREE.Group();
  head.position.y = 0.48;
  torso.add(head);

  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.20, 0.34, 12), armorMat);
  helm.castShadow = true;
  head.add(helm);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10), armorMat);
  dome.position.y = 0.14;
  dome.castShadow = true;
  head.add(dome);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.36), trimMat);
  crest.position.set(0, 0.16, -0.02);
  head.add(crest);

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffd299,
    emissive: 0xff9933,
    emissiveIntensity: 1.8,
    roughness: 0.4
  });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.08), visorMat);
  visor.position.set(0, 0.03, 0.17);
  head.add(visor);

  const capeGeo = new THREE.PlaneGeometry(0.68, 1.28, 6, 10);
  capeGeo.translate(0, -0.64, 0);
  const capeBasePos = Float32Array.from(capeGeo.attributes.position.array);
  const cape = new THREE.Mesh(capeGeo, clothMat);
  cape.position.set(0, 0.24, -0.22);
  cape.rotation.x = 0.16;
  cape.castShadow = true;
  torso.add(cape);

  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(-0.42, 0.14, 0.05);
  torso.add(rightShoulder);

  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.52, 8), mats.darkPlate);
  armMesh.position.set(0, -0.22, 0.12);
  armMesh.rotation.x = Math.PI * 0.32;
  armMesh.castShadow = true;
  rightShoulder.add(armMesh);

  const swordPivot = new THREE.Group();
  swordPivot.position.set(0, -0.36, 0.32);
  rightShoulder.add(swordPivot);

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8), mats.darkPlate);
  hilt.rotation.x = Math.PI / 2;
  swordPivot.add(hilt);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), mats.gildedBronze);
  pommel.position.z = -0.19;
  swordPivot.add(pommel);

  const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.075), mats.gildedBronze);
  crossguard.position.z = 0.16;
  crossguard.castShadow = true;
  swordPivot.add(crossguard);

  const bladeMat = new THREE.MeshPhysicalMaterial({
    color: 0xdde7f5,
    emissive: 0xff7722,
    emissiveIntensity: 0.38,
    roughness: 0.26,
    metalness: 0.92,
    clearcoat: 0.2
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.026, 1.55), bladeMat);
  blade.position.z = 0.95;
  blade.castShadow = true;
  swordPivot.add(blade);

  const runeStripMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.85
  });
  const runeStrip = markIgnoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 1.25), runeStripMat));
  runeStrip.position.z = 0.84;
  swordPivot.add(runeStrip);

  const bladeTip = new THREE.Object3D();
  bladeTip.position.set(0, 0, 1.75);
  swordPivot.add(bladeTip);

  const bladeBase = new THREE.Object3D();
  bladeBase.position.set(0, 0, 0.25);
  swordPivot.add(bladeBase);

  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.42, 0.14, 0.05);
  torso.add(leftShoulder);
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.50, 8), mats.darkPlate);
  leftArm.position.set(0, -0.22, 0.08);
  leftArm.rotation.x = 0.35;
  leftArm.rotation.z = 0.18;
  leftArm.castShadow = true;
  leftShoulder.add(leftArm);
  const offhandPivot = new THREE.Group();
  offhandPivot.position.set(0, -0.36, 0.28);
  leftShoulder.add(offhandPivot);

  // Soft steady fill light elevated above head so walking never strobes nearby stone normals
  const heroLight = new THREE.PointLight(0xffa860, 1.15, 10.5, 1.45);
  heroLight.position.set(0, 3.25, 0.25);
  root.add(heroLight);

  rightShoulder.rotation.set(0.15, -0.55, 0.15);

  function applyTheme(theme) {
    if (!theme) return;
    if (theme.clothHex !== undefined) clothMat.color.setHex(theme.clothHex);
    if (theme.armorHex !== undefined) armorMat.color.setHex(theme.armorHex);
    if (theme.trimHex !== undefined) trimMat.color.setHex(theme.trimHex);
    if (theme.visorHex !== undefined) {
      visorMat.emissive.setHex(theme.visorHex);
      heroLight.color.setHex(theme.visorHex);
    }
  }
  if (initialTheme) applyTheme(initialTheme);

  return {
    root,
    body,
    torso,
    leftLeg,
    rightLeg,
    rightShoulder,
    leftShoulder,
    offhandPivot,
    swordPivot,
    bladeMat,
    runeStripMat,
    bladeTip,
    bladeBase,
    cape,
    capeBasePos,
    heroLight,
    visorMat,
    clothMat,
    armorMat,
    trimMat,
    applyTheme,
    updateCape(time, speed) {
      const pos = cape.geometry.attributes.position;
      const arr = pos.array;
      const swaySpeed = 4.6;
      const amp = 0.035 + Math.min(0.025, speed * 0.012);
      for (let i = 0; i < arr.length; i += 3) {
        const bx = capeBasePos[i];
        const by = capeBasePos[i + 1];
        const weight = Math.min(1, -by / 1.28);
        const flutter = Math.sin(time * swaySpeed + by * 3.8 + bx * 2.6) * amp * weight;
        arr[i + 2] = capeBasePos[i + 2] - weight * weight * (0.14 + Math.min(0.12, speed * 0.05)) + flutter;
      }
      pos.needsUpdate = true;
      cape.geometry.computeVertexNormals();
    }
  };
}

const ENEMY_GEO_CACHE = new Map();
function getSharedEnemyGeo(key, createFn) {
  let g = ENEMY_GEO_CACHE.get(key);
  if (!g) {
    g = createFn();
    ENEMY_GEO_CACHE.set(key, g);
  }
  return g;
}

export function resetEnemyRig(rig) {
  if (!rig) return;
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  rig.root.visible = true;
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.body.scale.setScalar(rig.cfg.scale);
  if (rig.arm && rig.baseArmPos) {
    rig.arm.position.copy(rig.baseArmPos);
    rig.arm.rotation.set(0, 0, 0);
  }
  if (rig.leftLeg) rig.leftLeg.rotation.set(0, 0, 0);
  if (rig.rightLeg) rig.rightLeg.rotation.set(0, 0, 0);
  if (rig.flashMats) {
    for (let i = 0; i < rig.flashMats.length; i++) {
      rig.flashMats[i].emissive.setHex(0x000000);
    }
  }
}

export function createEnemyRig(type, mats) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const cfg = {
    thrall:     { scale: 0.96, glow: 0x44d5ff, armor: mats.darkPlate, weaponLen: 1.05 },
    stalker:    { scale: 0.94, glow: 0x55ffaa, armor: mats.obsidianArmor, weaponLen: 0.95 },
    acolyte:    { scale: 0.98, glow: 0xc955ff, armor: mats.tatteredShroud, weaponLen: 1.25 },
    juggernaut: { scale: 1.34, glow: 0xff4422, armor: mats.obsidianArmor, weaponLen: 1.45 },
    warden:     { scale: 1.78, glow: 0xff8811, armor: mats.obsidianArmor, weaponLen: 1.95 }
  }[type] || { scale: 1.0, glow: 0x44d5ff, armor: mats.darkPlate, weaponLen: 1.1 };

  body.scale.setScalar(cfg.scale);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: cfg.glow,
    emissiveIntensity: type === 'warden' ? 2.6 : 2.0,
    roughness: 0.3
  });

  const flashMats = [];
  const cloneMat = (m) => {
    const c = m.clone();
    flashMats.push(c);
    return c;
  };

  const mainArmor = cloneMat(cfg.armor);
  const trimMat = cloneMat(type === 'warden' ? mats.gildedBronze : mats.silverSteel);

  if (type === 'stalker') {
    const cloak = new THREE.Mesh(getSharedEnemyGeo('stk_cloak', () => new THREE.ConeGeometry(0.38, 1.25, 9)), mainArmor);
    cloak.position.y = 0.72;
    cloak.rotation.x = 0.18;
    cloak.castShadow = true;
    body.add(cloak);

    const hood = new THREE.Mesh(getSharedEnemyGeo('stk_hood', () => new THREE.ConeGeometry(0.21, 0.42, 8)), mainArmor);
    hood.position.set(0, 1.42, 0.08);
    hood.rotation.x = 0.22;
    body.add(hood);

    const mask = new THREE.Mesh(getSharedEnemyGeo('stk_mask', () => new THREE.BoxGeometry(0.18, 0.05, 0.12)), glowMat);
    mask.position.set(0, 1.34, 0.19);
    body.add(mask);

    const arm = new THREE.Group();
    arm.position.set(0, 1.05, 0.12);
    body.add(arm);
    const bladeGeo = getSharedEnemyGeo('stk_blade', () => new THREE.BoxGeometry(0.045, 0.025, 0.90));
    [-0.32, 0.32].forEach((sx) => {
      const blade = new THREE.Mesh(bladeGeo, glowMat);
      blade.position.set(sx, -0.12, 0.44);
      blade.rotation.y = sx * 0.28;
      arm.add(blade);
    });
    return {
      type,
      root,
      body,
      arm,
      baseArmPos: arm.position.clone(),
      leftLeg: null,
      rightLeg: null,
      glowMat,
      flashMats,
      cfg,
      stalker: true
    };
  }

  if (type === 'acolyte') {
    const robe = new THREE.Mesh(getSharedEnemyGeo('aco_robe', () => new THREE.ConeGeometry(0.42, 1.55, 10)), mainArmor);
    robe.position.y = 0.85;
    robe.castShadow = true;
    body.add(robe);

    const mantle = new THREE.Mesh(getSharedEnemyGeo('aco_mantle', () => new THREE.CylinderGeometry(0.36, 0.44, 0.36, 10)), trimMat);
    mantle.position.y = 1.38;
    body.add(mantle);

    const hood = new THREE.Mesh(getSharedEnemyGeo('aco_hood', () => new THREE.ConeGeometry(0.24, 0.46, 9)), mainArmor);
    hood.position.y = 1.76;
    body.add(hood);

    const eyes = new THREE.Mesh(getSharedEnemyGeo('aco_eyes', () => new THREE.BoxGeometry(0.18, 0.04, 0.12)), glowMat);
    eyes.position.set(0, 1.66, 0.14);
    body.add(eyes);

    const staffArm = new THREE.Group();
    staffArm.position.set(-0.38, 1.32, 0.1);
    body.add(staffArm);

    const staff = new THREE.Mesh(getSharedEnemyGeo('aco_staff', () => new THREE.CylinderGeometry(0.028, 0.032, 1.65, 8)), trimMat);
    staff.rotation.x = 0.25;
    staffArm.add(staff);

    const orb = new THREE.Mesh(getSharedEnemyGeo('aco_orb', () => new THREE.OctahedronGeometry(0.14, 0)), glowMat);
    orb.position.set(0, 0.82, 0.22);
    staffArm.add(orb);

    return {
      type,
      root,
      body,
      arm: staffArm,
      baseArmPos: staffArm.position.clone(),
      leftLeg: null,
      rightLeg: null,
      glowMat,
      flashMats,
      cfg,
      orb
    };
  }

  const isBoss = type === 'warden';
  const legGeo = getSharedEnemyGeo('std_leg', () => new THREE.CylinderGeometry(0.11, 0.09, 0.72, 8));
  const leftLeg = new THREE.Mesh(legGeo, mainArmor);
  leftLeg.position.set(-0.17, 0.36, 0);
  leftLeg.castShadow = isBoss;
  const rightLeg = new THREE.Mesh(legGeo, mainArmor);
  rightLeg.position.set(0.17, 0.36, 0);
  rightLeg.castShadow = isBoss;
  body.add(leftLeg, rightLeg);

  const chestW = type === 'juggernaut' ? 1.32 : (type === 'warden' ? 1.26 : 1.0);
  const torso = new THREE.Mesh(
    getSharedEnemyGeo(`torso_${type}`, () => new THREE.CylinderGeometry(0.34 * chestW, 0.24 * chestW, 0.68, 10)),
    mainArmor
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  torso.receiveShadow = true;
  body.add(torso);

  if (type === 'juggernaut' || type === 'warden') {
    const core = new THREE.Mesh(getSharedEnemyGeo('heavy_core', () => new THREE.SphereGeometry(0.19, 10, 8)), glowMat);
    core.position.set(0, 1.14, 0.16);
    body.add(core);
  }

  const pauldronGeo = getSharedEnemyGeo(
    `pauldron_${type === 'juggernaut' ? 'jug' : 'std'}`,
    () => new THREE.DodecahedronGeometry(type === 'juggernaut' ? 0.28 : 0.21, 0)
  );
  [-1, 1].forEach((s) => {
    const p = new THREE.Mesh(pauldronGeo, trimMat);
    p.position.set(s * 0.42 * chestW, 1.38, 0);
    p.castShadow = isBoss;
    body.add(p);
  });

  const helm = new THREE.Mesh(getSharedEnemyGeo('std_helm', () => new THREE.CylinderGeometry(0.17, 0.20, 0.34, 9)), trimMat);
  helm.position.y = 1.66;
  helm.castShadow = isBoss;
  body.add(helm);

  const visor = new THREE.Mesh(getSharedEnemyGeo('std_visor', () => new THREE.BoxGeometry(0.22, 0.045, 0.12)), glowMat);
  visor.position.set(0, 1.66, 0.15);
  body.add(visor);

  let bossLight = null;
  if (type === 'warden') {
    for (let k = 0; k < 5; k++) {
      const ka = (k - 2) * 0.48;
      const spike = new THREE.Mesh(
        getSharedEnemyGeo(k === 2 ? 'w_spike_tall' : 'w_spike_short', () => new THREE.ConeGeometry(0.04, 0.28 + (k === 2 ? 0.14 : 0), 6)),
        mats.gildedBronze
      );
      spike.position.set(Math.sin(ka) * 0.17, 1.94, Math.cos(ka) * 0.17);
      body.add(spike);
    }
    const bossCape = new THREE.Mesh(getSharedEnemyGeo('w_cape', () => new THREE.PlaneGeometry(0.88, 1.35)), mats.tatteredShroud);
    bossCape.position.set(0, 0.92, -0.26);
    bossCape.rotation.x = 0.18;
    bossCape.castShadow = true;
    body.add(bossCape);

    const bLight = new THREE.PointLight(0xff6611, 5.2, 9.0, 1.7);
    bLight.position.set(0, 2.2, 0.3);
    root.add(bLight);
    bossLight = bLight;
  }

  const arm = new THREE.Group();
  arm.position.set(-0.44 * chestW, 1.34, 0.06);
  body.add(arm);

  const forearm = new THREE.Mesh(getSharedEnemyGeo('std_forearm', () => new THREE.CylinderGeometry(0.09, 0.08, 0.52, 8)), mainArmor);
  forearm.position.set(0, -0.22, 0.14);
  forearm.rotation.x = 0.9;
  arm.add(forearm);

  const shaft = new THREE.Mesh(
    getSharedEnemyGeo(`shaft_${type}`, () => new THREE.BoxGeometry(0.08, 0.05, cfg.weaponLen)),
    trimMat
  );
  shaft.position.set(0, -0.34, 0.35 + cfg.weaponLen * 0.45);
  shaft.castShadow = isBoss;
  arm.add(shaft);

  if (type === 'juggernaut' || type === 'warden') {
    const headBlock = new THREE.Mesh(
      getSharedEnemyGeo(`head_${type}`, () => new THREE.BoxGeometry(type === 'warden' ? 0.46 : 0.38, 0.22, 0.38)),
      trimMat
    );
    headBlock.position.set(0, -0.34, 0.35 + cfg.weaponLen * 0.86);
    headBlock.castShadow = isBoss;
    arm.add(headBlock);

    const edgeGlow = new THREE.Mesh(getSharedEnemyGeo('heavy_edge', () => new THREE.BoxGeometry(0.48, 0.05, 0.40)), glowMat);
    edgeGlow.position.copy(headBlock.position);
    arm.add(edgeGlow);
  }

  return {
    type,
    root,
    body,
    arm,
    baseArmPos: arm.position.clone(),
    leftLeg,
    rightLeg,
    glowMat,
    bossLight,
    flashMats,
    cfg
  };
}

export class VFXSystem {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;

    // 1. World-wrapped falling rain streaks (anchored on fixed world grid so moving hero NEVER drags rain!)
    this.rainCount = 420;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 34;
      rainPos[i * 3 + 1] = Math.random() * 14;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x8fb4de,
      size: 0.11,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.rain = markIgnoreAO(new THREE.Points(rainGeo, rainMat));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // Drifting ground mist sprites anchored to world grid cells (never dragged rigidly with hero, and ignored by GTAO!)
    this.mistSprites = [];
    this.mistGroup = markIgnoreAO(new THREE.Group());
    scene.add(this.mistGroup);
    for (let i = 0; i < 14; i++) {
      const mm = new THREE.SpriteMaterial({
        map: tex.softParticleTex,
        color: 0x6c88b5,
        transparent: true,
        opacity: 0.042,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sp = markIgnoreAO(new THREE.Sprite(mm));
      sp.scale.set(6.0 + (i % 4) * 1.3, 2.0, 1);
      this.mistGroup.add(sp);
      this.mistSprites.push({
        sp,
        wx: ((i % 5) - 2) * 7.5,
        wz: (Math.floor(i / 5) - 1) * 9.0,
        phase: i * 1.4
      });
    }

    // 2. Dynamic Burst Sparks / Embers
    this.maxParticles = 380;
    this.pData = [];
    const pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.maxParticles * 3);
    this.pCol = new Float32Array(this.maxParticles * 3);
    for (let i = 0; i < this.maxParticles; i++) {
      this.pPos[i * 3 + 1] = -999;
      this.pData.push({ active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, gravity: 9.8 });
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.25,
      map: tex.softParticleTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particles = markIgnoreAO(new THREE.Points(pGeo, pMat));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.pCursor = 0;

    // 3. Expanding Ground Shockwave / Engraved Rune Telegraph Rings
    this.rings = [];
    this.ringPool = { filled: [], ring: [] };
    this.sharedFillPlaneGeo = new THREE.PlaneGeometry(2, 2);
    this.sharedRingGeo = new THREE.RingGeometry(0.84, 1.0, 44);

    // 3b. Directional Melee Slash Sector & Linear Thrust / Whip-Crack Waves
    this.slashWaves = [];
    this.slashGeoCache = new Map();
    this.slashPool = new Map();
    this.lancePool = [];
    this.sharedLanceGeo = new THREE.PlaneGeometry(1, 1);
    this.sharedLanceGeo.translate(0, -0.5, 0);

    // 4. Sword Ribbon Trail Mesh
    this.trailMax = 18;
    this.trailPts = [];
    const tGeo = new THREE.BufferGeometry();
    const tVerts = new Float32Array(this.trailMax * 2 * 3);
    const tColors = new Float32Array(this.trailMax * 2 * 4);
    tGeo.setAttribute('position', new THREE.BufferAttribute(tVerts, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 4));
    const indices = [];
    for (let i = 0; i < this.trailMax - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    tGeo.setIndex(indices);
    const tMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.trailMesh = markIgnoreAO(new THREE.Mesh(tGeo, tMat));
    this.trailMesh.frustumCulled = false;
    scene.add(this.trailMesh);

    this.flashLight = new THREE.PointLight(0xffaa44, 0, 9, 1.6);
    scene.add(this.flashLight);
  }

  burst(x, y, z, colorHex, count = 18, speed = 5.5, gravity = 11.0) {
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.maxParticles;
      const p = this.pData[idx];
      p.active = true;
      const a = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.15) * Math.PI * 0.65;
      const sp = speed * (0.35 + Math.random() * 0.85);
      p.vx = Math.cos(a) * Math.cos(elev) * sp;
      p.vy = Math.abs(Math.sin(elev)) * sp + 1.2;
      p.vz = Math.sin(a) * Math.cos(elev) * sp;
      p.gravity = gravity;
      p.maxLife = 0.32 + Math.random() * 0.45;
      p.life = p.maxLife;
      this.pPos[idx * 3] = x;
      this.pPos[idx * 3 + 1] = y;
      this.pPos[idx * 3 + 2] = z;
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;
      this.pCol[idx * 3] = col.r;
      this.pCol[idx * 3 + 1] = col.g;
      this.pCol[idx * 3 + 2] = col.b;
    }
  }

  flash(x, y, z, colorHex = 0xffaa44, intensity = 11) {
    this.flashLight.color.setHex(colorHex);
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = intensity;
  }

  spawnRing(x, z, maxRadius, duration, colorHex = 0xff5522, filled = false) {
    const poolList = filled ? this.ringPool.filled : this.ringPool.ring;
    const baseOp = filled ? 0.68 : 0.82;
    let m = poolList.pop();
    if (m) {
      m.material.color.setHex(colorHex);
      m.material.opacity = baseOp;
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.scale.set(0.05, 0.05, 1);
      m.visible = true;
    } else {
      const geo = filled ? this.sharedFillPlaneGeo : this.sharedRingGeo;
      const mat = new THREE.MeshBasicMaterial({
        map: filled ? this.tex.sealTex : null,
        color: colorHex,
        transparent: true,
        opacity: baseOp,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      m = markIgnoreAO(new THREE.Mesh(geo, mat));
      m.rotation.x = -Math.PI / 2;
    }
    m.position.set(x, 0.035, z);
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0, duration, maxRadius, filled, baseOp });
    return m;
  }

  spawnSlashArc(x, z, yaw, maxRadius, arcHalf = 1.48, duration = 0.24, colorHex = 0xff8533, tiltZ = 0) {
    const clampedArc = Math.min(Math.PI, Math.max(0.45, arcHalf));
    const key = Math.round(clampedArc * 20);
    let geo = this.slashGeoCache.get(key);
    if (!geo) {
      const ah = key / 20;
      geo = new THREE.RingGeometry(0.66, 1.0, 32, 1, -Math.PI / 2 - ah, ah * 2);
      this.slashGeoCache.set(key, geo);
    }
    let bucket = this.slashPool.get(key);
    if (!bucket) {
      bucket = [];
      this.slashPool.set(key, bucket);
    }
    const baseOp = 0.76;
    let m = bucket.pop();
    if (m) {
      m.material.color.setHex(colorHex);
      m.material.opacity = baseOp;
      m.visible = true;
    } else {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: baseOp,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      m = markIgnoreAO(new THREE.Mesh(geo, mat));
      m.rotation.order = 'YXZ';
    }
    m.rotation.set(-Math.PI / 2, yaw, tiltZ);
    m.position.set(x, 0.88, z);
    m.scale.set(maxRadius * 0.56, maxRadius * 0.56, 1);
    this.scene.add(m);
    this.slashWaves.push({ kind: 'arc', key, mesh: m, t: 0, duration, maxRadius, width: maxRadius, baseOp });
    return m;
  }

  spawnThrustLance(x, z, yaw, length, width = 1.1, duration = 0.22, colorHex = 0x68d8ff) {
    const baseOp = 0.82;
    let m = this.lancePool.pop();
    if (m) {
      m.material.color.setHex(colorHex);
      m.material.opacity = baseOp;
      m.visible = true;
    } else {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: baseOp,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      m = markIgnoreAO(new THREE.Mesh(this.sharedLanceGeo, mat));
      m.rotation.order = 'YXZ';
    }
    m.rotation.set(-Math.PI / 2, yaw, 0);
    m.position.set(x, 0.92, z);
    m.scale.set(width, length * 0.45, 1);
    this.scene.add(m);
    this.slashWaves.push({ kind: 'lance', key: 0, mesh: m, t: 0, duration, maxRadius: length, width, baseOp });
    return m;
  }

  pushBladeSample(basePos, tipPos, colorHex = 0xffaa44, active = true) {
    if (active) {
      this.trailPts.unshift({
        bx: basePos.x, by: basePos.y, bz: basePos.z,
        tx: tipPos.x, ty: tipPos.y, tz: tipPos.z,
        age: 0,
        col: new THREE.Color(colorHex)
      });
      if (this.trailPts.length > this.trailMax) this.trailPts.pop();
    }
  }

  update(dt, braziers, centerX = 0, centerZ = 0, simTime = 0) {
    if (braziers && braziers.length > 0 && Math.random() < 0.45) {
      const b = braziers[Math.floor(Math.random() * braziers.length)];
      this.burst(b.x + (Math.random() - 0.5) * 0.35, b.y, b.z + (Math.random() - 0.5) * 0.35, b.colorHex || 0xff8822, 1, 1.0, -1.5);
    }

    // Wrap individual raindrops in world space around player so rain never translates rigidly with movement!
    if (this.rain.visible) {
      const rArr = this.rain.geometry.attributes.position.array;
      const halfSpan = 17.0;
      for (let i = 0; i < this.rainCount; i++) {
        const ix = i * 3;
        rArr[ix + 1] -= dt * 15.0;
        rArr[ix] -= dt * 1.8;
        if (rArr[ix + 1] < 0) {
          rArr[ix + 1] = 13.5 + Math.random() * 2.0;
          rArr[ix] = centerX + (Math.random() - 0.5) * 34;
          rArr[ix + 2] = centerZ + (Math.random() - 0.5) * 34;
        } else {
          if (rArr[ix] - centerX > halfSpan) rArr[ix] -= halfSpan * 2;
          else if (rArr[ix] - centerX < -halfSpan) rArr[ix] += halfSpan * 2;
          if (rArr[ix + 2] - centerZ > halfSpan) rArr[ix + 2] -= halfSpan * 2;
          else if (rArr[ix + 2] - centerZ < -halfSpan) rArr[ix + 2] += halfSpan * 2;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // Wrap mist sprites cleanly on world cells so they stay anchored in world space!
    const mistSpan = 22.0;
    for (const m of this.mistSprites) {
      while (m.wx - centerX > mistSpan) m.wx -= mistSpan * 2;
      while (m.wx - centerX < -mistSpan) m.wx += mistSpan * 2;
      while (m.wz - centerZ > mistSpan) m.wz -= mistSpan * 2;
      while (m.wz - centerZ < -mistSpan) m.wz += mistSpan * 2;
      m.sp.position.set(
        m.wx + Math.sin(simTime * 0.25 + m.phase) * 1.4,
        0.48 + Math.cos(simTime * 0.35 + m.phase) * 0.08,
        m.wz + Math.cos(simTime * 0.22 + m.phase) * 1.4
      );
    }

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pData[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.pPos[i * 3 + 1] = -999;
        continue;
      }
      p.vy -= p.gravity * dt;
      this.pPos[i * 3] += p.vx * dt;
      let ny = this.pPos[i * 3 + 1] + p.vy * dt;
      if (ny < 0.04 && p.gravity > 0) {
        ny = 0.04;
        p.vy = Math.abs(p.vy) * 0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.pPos[i * 3 + 1] = ny;
      this.pPos[i * 3 + 2] += p.vz * dt;
      const ratio = p.life / p.maxLife;
      this.pCol[i * 3] = p.r * ratio;
      this.pCol[i * 3 + 1] = p.g * ratio;
      this.pCol[i * 3 + 2] = p.b * ratio;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.duration);
      const ease = 1 - Math.pow(1 - k, 2.4);
      const sc = r.filled ? r.maxRadius * (0.25 + 0.75 * k) : Math.max(0.05, r.maxRadius * ease);
      r.mesh.scale.set(sc, sc, 1);
      if (r.filled) r.mesh.rotation.z = r.t * 0.9;
      r.mesh.material.opacity = r.baseOp * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        const poolList = r.filled ? this.ringPool.filled : this.ringPool.ring;
        if (poolList.length < 32) {
          poolList.push(r.mesh);
        } else {
          r.mesh.material.dispose();
        }
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.slashWaves.length - 1; i >= 0; i--) {
      const sw = this.slashWaves[i];
      sw.t += dt;
      const k = Math.min(1, sw.t / sw.duration);
      const ease = 1 - Math.pow(1 - k, 2.8);
      if (sw.kind === 'lance') {
        const curLen = sw.maxRadius * (0.45 + 0.58 * ease);
        const curWid = sw.width * (1.08 - 0.52 * k);
        sw.mesh.scale.set(Math.max(0.08, curWid), Math.max(0.1, curLen), 1);
      } else {
        const sc = sw.maxRadius * (0.58 + 0.44 * ease);
        sw.mesh.scale.set(sc, sc, 1);
      }
      sw.mesh.material.opacity = sw.baseOp * (1 - k * k);
      if (k >= 1) {
        this.scene.remove(sw.mesh);
        if (sw.kind === 'lance') {
          if (this.lancePool.length < 16) this.lancePool.push(sw.mesh);
          else sw.mesh.material.dispose();
        } else {
          const bucket = this.slashPool.get(sw.key);
          if (bucket && bucket.length < 16) bucket.push(sw.mesh);
          else sw.mesh.material.dispose();
        }
        this.slashWaves.splice(i, 1);
      }
    }

    for (let i = this.trailPts.length - 1; i >= 0; i--) {
      this.trailPts[i].age += dt;
      if (this.trailPts[i].age > 0.16) this.trailPts.splice(i, 1);
    }
    const posAttr = this.trailMesh.geometry.attributes.position;
    const colAttr = this.trailMesh.geometry.attributes.color;
    const vArr = posAttr.array;
    const cArr = colAttr.array;
    const n = this.trailPts.length;
    for (let i = 0; i < this.trailMax; i++) {
      const pt = n > 0 ? this.trailPts[Math.min(i, n - 1)] : null;
      const vi = i * 6;
      const ci = i * 8;
      if (!pt || n < 2) {
        vArr[vi] = vArr[vi + 1] = vArr[vi + 2] = 0;
        vArr[vi + 3] = vArr[vi + 4] = vArr[vi + 5] = 0;
        for (let q = 0; q < 8; q++) cArr[ci + q] = 0;
      } else {
        const fade = Math.max(0, 1 - pt.age / 0.16) * (1 - i / this.trailMax);
        vArr[vi] = pt.bx; vArr[vi + 1] = pt.by; vArr[vi + 2] = pt.bz;
        vArr[vi + 3] = pt.tx; vArr[vi + 4] = pt.ty; vArr[vi + 5] = pt.tz;
        cArr[ci] = pt.col.r * 0.4; cArr[ci + 1] = pt.col.g * 0.4; cArr[ci + 2] = pt.col.b * 0.4; cArr[ci + 3] = fade * 0.25;
        cArr[ci + 4] = pt.col.r; cArr[ci + 5] = pt.col.g; cArr[ci + 6] = pt.col.b; cArr[ci + 7] = fade * 0.92;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (this.flashLight.intensity > 0.01) {
      this.flashLight.intensity *= Math.pow(0.001, dt * 3.8);
    } else {
      this.flashLight.intensity = 0;
    }
  }
}
