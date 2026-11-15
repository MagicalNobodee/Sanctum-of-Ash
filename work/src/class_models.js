import * as THREE from 'three';
import { DEFAULT_CLASS_ID } from './classes.js';

function ignoreAO(obj) {
  obj.traverse((c) => {
    c.userData.ignoreAO = true;
  });
  obj.userData.ignoreAO = true;
  return obj;
}

function makeCapeMesh(clothMat, width = 0.68, length = 1.26, zOff = -0.22, yOff = 0.24) {
  const geo = new THREE.PlaneGeometry(width, length, 6, 10);
  geo.translate(0, -length * 0.5, 0);
  const basePos = Float32Array.from(geo.attributes.position.array);
  const mesh = new THREE.Mesh(geo, clothMat);
  mesh.position.set(0, yOff, zOff);
  mesh.rotation.x = 0.16;
  mesh.castShadow = true;
  return { mesh, basePos, length };
}

function animateCapeObj(capeObj, time, speed) {
  if (!capeObj) return;
  const pos = capeObj.mesh.geometry.attributes.position;
  const arr = pos.array;
  const base = capeObj.basePos;
  const len = capeObj.length;
  const amp = 0.035 + Math.min(0.03, speed * 0.014);
  for (let i = 0; i < arr.length; i += 3) {
    const bx = base[i];
    const by = base[i + 1];
    const w = Math.min(1, -by / len);
    const flutter = Math.sin(time * 4.8 + by * 3.9 + bx * 2.7) * amp * w;
    arr[i + 2] = base[i + 2] - w * w * (0.14 + Math.min(0.14, speed * 0.05)) + flutter;
  }
  pos.needsUpdate = true;
  capeObj.mesh.geometry.computeVertexNormals();
}

function createBaseScaffold(mats, palette) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const clothMat = mats.crimsonCloth.clone();
  clothMat.color.setHex(palette.clothHex);
  const armorMat = mats.silverSteel.clone();
  armorMat.color.setHex(palette.armorHex);
  if (palette.armorRoughness !== undefined) armorMat.roughness = palette.armorRoughness;
  if (palette.armorMetalness !== undefined) armorMat.metalness = palette.armorMetalness;
  const trimMat = mats.gildedBronze.clone();
  trimMat.color.setHex(palette.trimHex);
  const darkMat = mats.obsidianArmor.clone();
  if (palette.darkHex !== undefined) darkMat.color.setHex(palette.darkHex);

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: palette.glowHex,
    emissiveIntensity: 2.1,
    roughness: 0.32
  });

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.16, 0.72, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.16, 0.72, 0);
  body.add(leftLeg, rightLeg);

  const torso = new THREE.Group();
  torso.position.y = 1.24;
  body.add(torso);

  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(-0.42, 0.14, 0.05);
  rightShoulder.rotation.set(0.15, -0.55, 0.15);
  torso.add(rightShoulder);

  const swordPivot = new THREE.Group();
  swordPivot.position.set(0, -0.36, 0.32);
  rightShoulder.add(swordPivot);

  const bladeMat = new THREE.MeshPhysicalMaterial({
    color: 0xdde7f5,
    emissive: palette.glowHex,
    emissiveIntensity: 0.35,
    roughness: 0.26,
    metalness: 0.92
  });
  const runeStripMat = new THREE.MeshBasicMaterial({ color: palette.glowHex, transparent: true, opacity: 0.85 });
  const bladeTip = new THREE.Object3D();
  bladeTip.position.set(0, 0, 1.75);
  const bladeBase = new THREE.Object3D();
  bladeBase.position.set(0, 0, 0.25);
  swordPivot.add(bladeTip, bladeBase);

  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.42, 0.14, 0.05);
  torso.add(leftShoulder);

  const offhandPivot = new THREE.Group();
  offhandPivot.position.set(0, -0.36, 0.28);
  leftShoulder.add(offhandPivot);

  // Subtle runic shield ring around waist/ground when shield > 0
  const shieldAura = ignoreAO(new THREE.Group());
  const shRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x67e4ff, transparent: true, opacity: 0.38 })
  );
  shRing.rotation.x = Math.PI / 2;
  shRing.position.y = 0.96;
  shieldAura.add(shRing);
  shieldAura.visible = false;
  body.add(shieldAura);

  const heroLight = new THREE.PointLight(palette.glowHex, 1.18, 10.8, 1.45);
  heroLight.position.set(0, 3.25, 0.25);
  root.add(heroLight);

  return {
    root,
    body,
    torso,
    leftLeg,
    rightLeg,
    rightShoulder,
    leftShoulder,
    swordPivot,
    offhandPivot,
    bladeMat,
    runeStripMat,
    bladeTip,
    bladeBase,
    clothMat,
    armorMat,
    trimMat,
    darkMat,
    visorMat,
    heroLight,
    shieldAura,
    shRing
  };
}

function addArmoredBootsAndLegs(sc, legMat, kneeMat, bootTrimMat, scaleW = 1.0) {
  [sc.leftLeg, sc.rightLeg].forEach((leg) => {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.115 * scaleW, 0.095 * scaleW, 0.36, 10), legMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    const knee = new THREE.Mesh(new THREE.OctahedronGeometry(0.105 * scaleW, 1), kneeMat);
    knee.scale.set(1, 0.95, 1.15);
    knee.position.set(0, -0.36, 0.04);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * scaleW, 0.085 * scaleW, 0.34, 10), kneeMat);
    shin.position.y = -0.53;
    shin.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19 * scaleW, 0.11, 0.30), bootTrimMat);
    boot.position.set(0, -0.67, 0.05);
    boot.castShadow = true;
    leg.add(thigh, knee, shin, boot);
  });
}

function addStandardArms(sc, upperMat, vambraceMat, trimMat) {
  const buildArm = (shoulder, isRight) => {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.30, 9), upperMat);
    upper.position.set(0, -0.14, 0.06);
    upper.rotation.x = 0.45;
    upper.castShadow = true;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 8), trimMat);
    elbow.position.set(0, -0.25, 0.13);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.28, 9), vambraceMat);
    forearm.position.set(0, -0.32, 0.23);
    forearm.rotation.x = Math.PI * 0.36;
    forearm.castShadow = true;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 12), trimMat);
    cuff.position.set(0, -0.29, 0.19);
    cuff.rotation.x = Math.PI * 0.85;
    if (!isRight) {
      upper.rotation.z = 0.14;
    }
    shoulder.add(upper, elbow, forearm, cuff);
  };
  buildArm(sc.rightShoulder, true);
  buildArm(sc.leftShoulder, false);
}

// ==================== 1. EMBER PALADIN ====================
function buildEmberPaladin(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x7c1620,
    armorHex: 0xd5deeb,
    trimHex: 0xe6b455,
    darkHex: 0x2a3140,
    glowHex: 0xff9d3b
  });
  addArmoredBootsAndLegs(sc, sc.darkMat, sc.armorMat, sc.trimMat, 1.08);
  addStandardArms(sc, sc.darkMat, sc.armorMat, sc.trimMat);

  // Layered royal tabard & tassets
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.37, 0.36, 12), sc.clothMat);
  waist.position.y = 0.84;
  sc.body.add(waist);
  const frontTabard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56, 0.04), sc.clothMat);
  frontTabard.position.set(0, 0.72, 0.27);
  frontTabard.rotation.x = -0.08;
  const tabardTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.05), sc.trimMat);
  tabardTrim.position.set(0, 0.72, 0.275);
  tabardTrim.rotation.x = -0.08;
  sc.body.add(frontTabard, tabardTrim);

  [-1, 1].forEach((s) => {
    const tasset = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.26), sc.armorMat);
    tasset.position.set(s * 0.27, 0.82, 0);
    tasset.rotation.z = -s * 0.22;
    sc.body.add(tasset);
  });

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.04, 8, 20), sc.trimMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.98;
  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), sc.visorMat);
  buckle.position.set(0, 0.98, 0.31);
  sc.body.add(belt, buckle);

  // Sculpted breastplate + winged pauldrons
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.26, 0.60, 12), sc.armorMat);
  chest.scale.set(1.15, 1, 0.82);
  chest.castShadow = true;
  const plackart = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.50, 0.56), sc.trimMat);
  const sunCrest = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), sc.visorMat));
  sunCrest.position.set(0, 0.08, 0.29);
  sc.torso.add(chest, plackart, sunCrest);

  [-1, 1].forEach((s) => {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.64), sc.armorMat);
    pauldron.position.set(s * 0.43, 0.19, 0);
    pauldron.rotation.z = -s * 0.40;
    pauldron.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 8, 18), sc.trimMat);
    rim.position.set(s * 0.43, 0.13, 0);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.y = -s * 0.40;
    const wingFin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), sc.trimMat);
    wingFin.position.set(s * 0.50, 0.32, -0.04);
    wingFin.rotation.z = -s * 0.35;
    sc.torso.add(pauldron, rim, wingFin);
  });

  // Greathelm with winged crown + T-visor
  const head = new THREE.Group();
  head.position.y = 0.50;
  sc.torso.add(head);
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.36, 12), sc.armorMat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), sc.armorMat);
  dome.position.y = 0.15;
  const faceCrossV = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.06), sc.visorMat));
  faceCrossV.position.set(0, -0.01, 0.18);
  const faceCrossH = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.06), sc.visorMat));
  faceCrossH.position.set(0, 0.04, 0.18);
  head.add(helm, dome, faceCrossV, faceCrossH);
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.18), sc.trimMat);
    wing.position.set(s * 0.20, 0.16, -0.02);
    wing.rotation.z = -s * 0.28;
    wing.rotation.y = s * 0.22;
    head.add(wing);
  });

  // Floating burning Sunburst Halo behind shoulders
  const haloGroup = ignoreAO(new THREE.Group());
  haloGroup.position.set(0, 0.42, -0.28);
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.024, 8, 28), sc.visorMat);
  haloGroup.add(haloRing);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.15, 4), sc.trimMat);
    ray.position.set(Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0);
    ray.rotation.z = a - Math.PI / 2;
    haloGroup.add(ray);
  }
  sc.torso.add(haloGroup);

  const capeObj = makeCapeMesh(sc.clothMat, 0.76, 1.32, -0.23, 0.25);
  sc.torso.add(capeObj.mesh);

  return finalizeRig(sc, 'ember_paladin', (time, speed) => {
    animateCapeObj(capeObj, time, speed);
    haloGroup.rotation.z = time * 0.85;
  });
}

// ==================== 2. CRIMSON FLAGELLANT ====================
function buildCrimsonFlagellant(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x4e0b14,
    armorHex: 0xa6897c, // scarred ashen flesh tone
    armorRoughness: 0.76,
    armorMetalness: 0.08,
    trimHex: 0x3b3036,
    darkHex: 0x1c161b,
    glowHex: 0xff2848
  });
  addArmoredBootsAndLegs(sc, sc.clothMat, sc.darkMat, sc.trimMat, 1.0);
  addStandardArms(sc, sc.armorMat, sc.darkMat, sc.trimMat);

  // Tattered crimson loincloth + heavy chains
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.38, 0.42, 10), sc.clothMat);
  waist.position.y = 0.80;
  sc.body.add(waist);
  const beltChain = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.042, 8, 16), sc.trimMat);
  beltChain.rotation.x = Math.PI / 2;
  beltChain.position.y = 0.96;
  sc.body.add(beltChain);

  // Muscular bare scarred chest + diagonal iron chains + glowing blood brand
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.25, 0.58, 12), sc.armorMat);
  chest.scale.set(1.14, 1, 0.80);
  chest.castShadow = true;
  sc.torso.add(chest);

  [-1, 1].forEach((s) => {
    const chainBand = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 7, 20), sc.trimMat);
    chainBand.rotation.y = s * 0.65;
    chainBand.rotation.x = 0.72;
    sc.torso.add(chainBand);
    const spikePad = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.20, 5), sc.trimMat);
    spikePad.position.set(s * 0.39, 0.26, 0);
    spikePad.rotation.z = -s * 0.32;
    sc.torso.add(spikePad);
  });
  const bloodBrand = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), sc.visorMat));
  bloodBrand.scale.set(0.8, 1.5, 0.4);
  bloodBrand.position.set(0, 0.06, 0.26);
  sc.torso.add(bloodBrand);

  // Blindfolded head + Crown of Iron Thorns
  const head = new THREE.Group();
  head.position.y = 0.48;
  sc.torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10), sc.armorMat);
  skull.scale.set(0.95, 1.08, 0.98);
  const blindfold = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.09, 12), sc.clothMat);
  blindfold.position.y = 0.03;
  const bloodTearL = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.03), sc.visorMat));
  bloodTearL.position.set(-0.07, -0.02, 0.17);
  const bloodTearR = bloodTearL.clone();
  bloodTearR.position.x = 0.07;
  const thornCrown = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.024, 6, 16), sc.trimMat);
  thornCrown.rotation.x = Math.PI / 2 - 0.12;
  thornCrown.position.y = 0.11;
  head.add(skull, blindfold, bloodTearL, bloodTearR, thornCrown);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 4), sc.trimMat);
    thorn.position.set(Math.cos(a) * 0.19, 0.14, Math.sin(a) * 0.19);
    thorn.rotation.z = -Math.cos(a) * 0.4;
    head.add(thorn);
  }

  // Massive Iron Penitence Cross + swinging blood censer strapped on back
  const backCross = new THREE.Group();
  backCross.position.set(0, 0.22, -0.26);
  backCross.rotation.z = 0.18;
  const beamV = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.38, 0.11), sc.darkMat);
  const beamH = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.13, 0.11), sc.darkMat);
  beamH.position.y = 0.30;
  const crossCore = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0), sc.visorMat));
  crossCore.position.set(0, 0.30, -0.05);
  backCross.add(beamV, beamH, crossCore);
  sc.torso.add(backCross);

  const censerPivot = new THREE.Group();
  censerPivot.position.set(0.36, 0.52, -0.26);
  const censerChain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 6), sc.trimMat);
  censerChain.position.y = -0.19;
  const censerOrb = ignoreAO(new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), sc.visorMat));
  censerOrb.position.y = -0.40;
  censerPivot.add(censerChain, censerOrb);
  sc.torso.add(censerPivot);

  return finalizeRig(sc, 'crimson_flagellant', (time, speed) => {
    censerPivot.rotation.z = Math.sin(time * 4.5) * (0.18 + speed * 0.08);
    censerPivot.rotation.x = Math.cos(time * 3.6) * 0.15;
    bloodBrand.scale.y = 1.4 + Math.sin(time * 5.0) * 0.22;
  });
}

// ==================== 3. IRON JUGGERNAUT (CLOCKWORK AUTOMATON) ====================
function buildIronJuggernaut(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x3b2818,
    armorHex: 0xc89242, // heavy burnished brass
    armorRoughness: 0.28,
    armorMetalness: 0.94,
    trimHex: 0x4b5566, // gunmetal steel
    darkHex: 0x20252e,
    glowHex: 0xff8822
  });

  // Chunky hydraulic piston legs
  [sc.leftLeg, sc.rightLeg].forEach((leg) => {
    const piston = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.26), sc.armorMat);
    piston.position.y = -0.20;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.38, 8), mats.silverSteel);
    rod.position.set(0, -0.38, 0.08);
    const treadBoot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.22, 0.36), sc.trimMat);
    treadBoot.position.set(0, -0.58, 0.04);
    treadBoot.castShadow = true;
    leg.add(piston, rod, treadBoot);
  });

  // Piston arms
  [sc.rightShoulder, sc.leftShoulder].forEach((sh) => {
    const bulk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.32, 8), sc.trimMat);
    bulk.position.set(0, -0.15, 0.06);
    bulk.rotation.x = 0.4;
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.24), sc.armorMat);
    forearm.position.set(0, -0.31, 0.22);
    forearm.rotation.x = 1.05;
    sh.add(bulk, forearm);
  });

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.30, 0.30, 8), sc.trimMat);
  pelvis.position.y = 0.86;
  sc.body.add(pelvis);

  // Barrel-shaped riveted furnace torso
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.66, 12), sc.armorMat);
  boiler.castShadow = true;
  sc.torso.add(boiler);
  const furnaceRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 8, 18), sc.trimMat);
  furnaceRim.position.set(0, 0.05, 0.38);
  const furnaceCore = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 1), sc.visorMat));
  furnaceCore.position.set(0, 0.05, 0.35);
  sc.torso.add(furnaceRim, furnaceCore);

  [-1, 1].forEach((s) => {
    const domePad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 10), sc.armorMat);
    domePad.position.set(s * 0.48, 0.20, 0);
    domePad.rotation.z = -s * 0.65;
    sc.torso.add(domePad);
  });

  // Brass dome head + cyclops glowing optic lens
  const head = new THREE.Group();
  head.position.y = 0.46;
  sc.torso.add(head);
  const headDome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), sc.armorMat);
  headDome.scale.set(1.05, 0.92, 1.05);
  const opticRim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 16), sc.trimMat);
  opticRim.position.set(0, 0.02, 0.21);
  const opticEye = ignoreAO(new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x56dcff, emissiveIntensity: 2.6 })
  ));
  opticEye.position.set(0, 0.02, 0.20);
  head.add(headDome, opticRim, opticEye);

  // Twin brass exhaust smokestacks + giant spinning cogwheel on back
  [-1, 1].forEach((s) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.68, 10), sc.trimMat);
    pipe.position.set(s * 0.22, 0.42, -0.34);
    pipe.rotation.x = -0.18;
    const cap = ignoreAO(new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 6, 12), sc.visorMat));
    cap.rotation.x = Math.PI / 2 - 0.18;
    cap.position.set(s * 0.22, 0.75, -0.40);
    sc.torso.add(pipe, cap);
  });

  const mainCog = new THREE.Group();
  mainCog.position.set(0, 0.08, -0.40);
  const cogRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 18), sc.armorMat);
  mainCog.add(cogRing);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.05), sc.armorMat);
    tooth.position.set(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0);
    tooth.rotation.z = a;
    mainCog.add(tooth);
  }
  sc.torso.add(mainCog);

  return finalizeRig(sc, 'iron_juggernaut', (time, speed) => {
    mainCog.rotation.z = -time * (1.8 + speed * 0.5);
    furnaceCore.rotation.y = time * 3.2;
    furnaceCore.rotation.z = time * 2.1;
  });
}

// ==================== 4. WRAITH ASSASSIN ====================
function buildWraithAssassin(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x161b2c,
    armorHex: 0x252d3d,
    armorRoughness: 0.42,
    trimHex: 0x4be8ff,
    darkHex: 0x10131d,
    glowHex: 0x4df0ff
  });
  addArmoredBootsAndLegs(sc, sc.darkMat, sc.armorMat, sc.trimMat, 0.88);
  addStandardArms(sc, sc.darkMat, sc.armorMat, sc.trimMat);

  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.31, 0.34, 10), sc.clothMat);
  sash.position.y = 0.84;
  sc.body.add(sash);

  // Sleek assassin jerkin + glowing throwing-knife bandolier
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.56, 10), sc.armorMat);
  chest.scale.set(1.04, 1, 0.74);
  chest.castShadow = true;
  sc.torso.add(chest);
  for (let i = 0; i < 3; i++) {
    const kunai = ignoreAO(new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 4), sc.visorMat));
    kunai.position.set(-0.12 + i * 0.11, 0.14 - i * 0.08, 0.22);
    kunai.rotation.z = 0.65;
    sc.torso.add(kunai);
  }
  [-1, 1].forEach((s) => {
    const bladePad = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 4), sc.armorMat);
    bladePad.position.set(s * 0.38, 0.20, -0.02);
    bladePad.rotation.z = -s * 0.85;
    sc.torso.add(bladePad);
  });

  // Pointed assassin cowl + twin slanted cyan eyes
  const head = new THREE.Group();
  head.position.y = 0.48;
  sc.torso.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), sc.darkMat);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.44, 8), sc.clothMat);
  hood.position.set(0, 0.14, -0.04);
  hood.rotation.x = -0.25;
  [-1, 1].forEach((s) => {
    const eye = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.024, 0.04), sc.visorMat));
    eye.position.set(s * 0.065, 0.03, 0.155);
    eye.rotation.z = -s * 0.24;
    head.add(eye);
  });
  head.add(mask, hood);

  // Split twin shadow-scarf tails
  const scarfL = makeCapeMesh(sc.clothMat, 0.30, 1.38, -0.20, 0.28);
  scarfL.mesh.position.x = -0.18;
  const scarfR = makeCapeMesh(sc.clothMat, 0.30, 1.38, -0.20, 0.28);
  scarfR.mesh.position.x = 0.18;
  sc.torso.add(scarfL.mesh, scarfR.mesh);

  return finalizeRig(sc, 'wraith_assassin', (time, speed) => {
    animateCapeObj(scarfL, time, speed * 1.2);
    animateCapeObj(scarfR, time + 0.9, speed * 1.2);
  });
}

// ==================== 5. FORTUNE GAMBLER ====================
function buildFortuneGambler(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x3b1238, // royal velvet plum
    armorHex: 0x1b1d28, // tuxedo obsidian
    armorRoughness: 0.48,
    armorMetalness: 0.35,
    trimHex: 0xf7c95c, // casino gold
    darkHex: 0x14151e,
    glowHex: 0xffd86b
  });
  addArmoredBootsAndLegs(sc, sc.armorMat, sc.armorMat, sc.trimMat, 0.94);
  addStandardArms(sc, sc.armorMat, sc.clothMat, sc.trimMat);

  // Tuxedo waistcoat & gold lapel
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.23, 0.58, 12), sc.armorMat);
  chest.scale.set(1.08, 1, 0.76);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.48, 0.48), sc.clothMat);
  const cravat = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), sc.visorMat));
  cravat.position.set(0, 0.20, 0.25);
  sc.torso.add(chest, vest, cravat);

  // Porcelain phantom half-mask + tilted gilded Top Hat!
  const head = new THREE.Group();
  head.position.y = 0.49;
  sc.torso.add(head);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.28 })
  );
  const eyeGlow = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.04), sc.visorMat));
  eyeGlow.position.set(0.06, 0.03, 0.16);
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0.02, 0.13, 0);
  hatGroup.rotation.z = -0.14;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.03, 18), sc.armorMat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.17, 0.34, 16), sc.armorMat);
  crown.position.y = 0.18;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.176, 0.06, 16), sc.trimMat);
  ribbon.position.y = 0.05;
  const hatCard = ignoreAO(new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.13, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd86b, emissiveIntensity: 1.2 })
  ));
  hatCard.position.set(-0.18, 0.11, 0.04);
  hatCard.rotation.z = 0.28;
  hatGroup.add(brim, crown, ribbon, hatCard);
  head.add(face, eyeGlow, hatGroup);

  // Spinning Golden Roulette Wheel on back + 3 Orbiting Glowing Tarot Cards!
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.18, -0.28);
  const wOuter = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.032, 8, 24), sc.trimMat);
  const wInner = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), sc.visorMat));
  wheel.add(wOuter, wInner);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.022, 0.02), sc.trimMat);
    spoke.rotation.z = (i / 6) * Math.PI;
    wheel.add(spoke);
  }
  sc.torso.add(wheel);

  const cardOrbit = ignoreAO(new THREE.Group());
  const cardColors = [0xff4d6d, 0x5be7ff, 0xffd86b];
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.19, 0.014),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: cardColors[i], emissiveIntensity: 1.6 })
    );
    const a = (i / 3) * Math.PI * 2;
    card.position.set(Math.cos(a) * 0.62, 0.06 + (i - 1) * 0.08, Math.sin(a) * 0.62);
    card.rotation.y = -a;
    cardOrbit.add(card);
  }
  sc.torso.add(cardOrbit);

  const capeObj = makeCapeMesh(sc.clothMat, 0.62, 1.18, -0.21, 0.16);
  sc.torso.add(capeObj.mesh);

  return finalizeRig(sc, 'fortune_gambler', (time, speed) => {
    animateCapeObj(capeObj, time, speed);
    wheel.rotation.z = time * 1.6;
    cardOrbit.rotation.y = time * 2.2;
  });
}

// ==================== 6. PLAGUE APOTHECARY ====================
function buildPlagueApothecary(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x1d2922, // dark waxed leather coat
    armorHex: 0x2b362f,
    armorRoughness: 0.72,
    armorMetalness: 0.22,
    trimHex: 0x9b7a44, // aged brass buckles
    darkHex: 0x141916,
    glowHex: 0x5eff7a
  });
  addArmoredBootsAndLegs(sc, sc.clothMat, sc.darkMat, sc.trimMat, 0.96);
  addStandardArms(sc, sc.clothMat, sc.armorMat, sc.trimMat);

  // Long flared alchemist coat skirt + glowing potion belt
  const coatSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 0.56, 12), sc.clothMat);
  coatSkirt.position.y = 0.74;
  sc.body.add(coatSkirt);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.58, 12), sc.clothMat);
  sc.torso.add(chest);

  const vialColors = [0x5eff7a, 0xc77dff, 0x4df0ff, 0xffae42];
  for (let i = 0; i < 4; i++) {
    const vial = ignoreAO(new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.042, 0.13, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: vialColors[i], emissiveIntensity: 1.9, transparent: true, opacity: 0.9 })
    ));
    const ang = -0.55 + i * 0.36;
    vial.position.set(Math.sin(ang) * 0.31, -0.20, Math.cos(ang) * 0.27);
    vial.rotation.z = 0.18;
    sc.torso.add(vial);
  }

  // Iconic Stitched Bird-Beak Plague Mask + Emerald Goggles + Wide-Brimmed Hat!
  const head = new THREE.Group();
  head.position.y = 0.49;
  sc.torso.add(head);
  const hoodHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), sc.darkMat);
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.62 });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.38, 8), beakMat);
  beak.rotation.x = Math.PI * 0.44;
  beak.position.set(0, -0.03, 0.27);
  [-1, 1].forEach((s) => {
    const goggleRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 14), sc.trimMat);
    goggleRim.position.set(s * 0.075, 0.04, 0.155);
    const lens = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 8), sc.visorMat));
    lens.position.set(s * 0.075, 0.04, 0.15);
    head.add(goggleRim, lens);
  });
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 18), sc.darkMat);
  hatBrim.position.y = 0.13;
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.20, 14), sc.darkMat);
  hatTop.position.y = 0.23;
  head.add(hoodHead, beak, hatBrim, hatTop);

  // Giant Bubbling Glass Alembic Tank strapped to back!
  const tankGroup = new THREE.Group();
  tankGroup.position.set(0, 0.14, -0.32);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x99ffbb,
    transparent: true,
    opacity: 0.42,
    roughness: 0.1,
    clearcoat: 1.0
  });
  const glassCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.62, 14), glassMat);
  const toxinCore = ignoreAO(new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.145, 0.46, 12),
    new THREE.MeshStandardMaterial({ color: 0x3aff6e, emissive: 0x26e65c, emissiveIntensity: 1.8 })
  ));
  toxinCore.position.y = -0.04;
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 14), sc.trimMat);
  capTop.position.y = 0.32;
  const capBot = capTop.clone();
  capBot.position.y = -0.32;
  const bubble = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), sc.visorMat));
  tankGroup.add(glassCyl, toxinCore, capTop, capBot, bubble);
  sc.torso.add(tankGroup);

  return finalizeRig(sc, 'plague_apothecary', (time) => {
    const bCycle = (time * 1.4) % 1;
    bubble.position.set(Math.sin(time * 5) * 0.05, -0.20 + bCycle * 0.42, 0);
    bubble.scale.setScalar(0.7 + Math.sin(bCycle * Math.PI) * 0.55);
  });
}

// ==================== 7. BONE NECROMANCER ====================
function buildBoneNecromancer(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x1a1526, // necropolis violet-black shroud
    armorHex: 0xd8d0be, // aged bone ivory
    armorRoughness: 0.58,
    armorMetalness: 0.08,
    trimHex: 0x453b5c,
    darkHex: 0x120f1a,
    glowHex: 0x62ffad
  });
  addArmoredBootsAndLegs(sc, sc.clothMat, sc.armorMat, sc.darkMat, 0.92);
  addStandardArms(sc, sc.clothMat, sc.armorMat, sc.trimMat);

  const robeLower = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.46, 0.66, 12), sc.clothMat);
  robeLower.position.y = 0.68;
  sc.body.add(robeLower);

  // Dark robe chest + external sculpted bone ribcage & soul core
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.24, 0.58, 10), sc.clothMat);
  const soulHeart = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), sc.visorMat));
  soulHeart.position.set(0, 0.06, 0.19);
  sc.torso.add(chest, soulHeart);
  for (let r = 0; r < 3; r++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.27 - r * 0.02, 0.022, 6, 14, Math.PI * 1.2), sc.armorMat);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = -Math.PI * 0.1;
    rib.position.y = 0.16 - r * 0.11;
    sc.torso.add(rib);
  }
  [-1, 1].forEach((s) => {
    const skullPad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), sc.armorMat);
    skullPad.position.set(s * 0.40, 0.20, 0);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 6), sc.armorMat);
    horn.position.set(s * 0.50, 0.34, -0.04);
    horn.rotation.z = -s * 0.48;
    sc.torso.add(skullPad, horn);
  });

  // Horned Ram-Skull Crown + Blazing Soul-Fire Eye Sockets
  const head = new THREE.Group();
  head.position.y = 0.50;
  sc.torso.add(head);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), sc.armorMat);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.16), sc.armorMat);
  jaw.position.set(0, -0.11, 0.06);
  head.add(cranium, jaw);
  [-1, 1].forEach((s) => {
    const eye = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), sc.visorMat));
    eye.position.set(s * 0.068, 0.02, 0.155);
    const ramHorn = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.036, 7, 14, Math.PI * 1.35), sc.armorMat);
    ramHorn.position.set(s * 0.19, 0.09, -0.02);
    ramHorn.rotation.y = s * 1.1;
    head.add(eye, ramHorn);
  });

  // Floating Open Grimoire + Orbiting Bone Halo!
  const grimoire = new THREE.Group();
  grimoire.position.set(0.58, 0.28, 0.26);
  const coverL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.024), sc.trimMat);
  coverL.position.x = -0.07;
  coverL.rotation.y = 0.35;
  const coverR = coverL.clone();
  coverR.position.x = 0.07;
  coverR.rotation.y = -0.35;
  const pages = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.19, 0.02), sc.visorMat));
  pages.position.z = 0.02;
  grimoire.add(coverL, coverR, pages);
  sc.torso.add(grimoire);

  const boneRing = new THREE.Group();
  boneRing.position.set(0, 0.25, -0.28);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), sc.armorMat);
    shard.scale.set(0.7, 1.8, 0.7);
    shard.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
    shard.rotation.z = a;
    boneRing.add(shard);
  }
  sc.torso.add(boneRing);

  const capeObj = makeCapeMesh(sc.clothMat, 0.72, 1.32, -0.22, 0.24);
  sc.torso.add(capeObj.mesh);

  return finalizeRig(sc, 'bone_necromancer', (time, speed) => {
    animateCapeObj(capeObj, time, speed);
    boneRing.rotation.z = -time * 1.2;
    grimoire.position.y = 0.28 + Math.sin(time * 3.4) * 0.07;
    grimoire.rotation.y = Math.sin(time * 1.8) * 0.25 - 0.3;
  });
}

// ==================== 8. CHRONO ASTROMANCER ====================
function buildChronoAstromancer(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x121d42, // deep astral indigo
    armorHex: 0xe6be6a, // celestial brass-gold
    armorRoughness: 0.22,
    armorMetalness: 0.95,
    trimHex: 0xf6df9e,
    darkHex: 0x0b1026,
    glowHex: 0x82bdff
  });
  addArmoredBootsAndLegs(sc, sc.clothMat, sc.armorMat, sc.trimMat, 0.88);
  addStandardArms(sc, sc.clothMat, sc.armorMat, sc.trimMat);

  const starSkirt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.74, 14, 1, true), sc.clothMat);
  starSkirt.position.y = 0.66;
  sc.body.add(starSkirt);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.56, 12), sc.clothMat);
  const chestDial = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 20), sc.armorMat);
  chestDial.position.set(0, 0.08, 0.25);
  const dialCore = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), sc.visorMat));
  dialCore.position.set(0, 0.08, 0.25);
  sc.torso.add(chest, chestDial, dialCore);

  // Faceless Mirror-Gold Mask + Sun-Moon Crown
  const head = new THREE.Group();
  head.position.y = 0.52;
  sc.torso.add(head);
  const mirrorHead = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), sc.armorMat);
  mirrorHead.scale.set(0.92, 1.12, 0.96);
  const browStar = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), sc.visorMat));
  browStar.position.set(0, 0.06, 0.16);
  const crownArc = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 8, 24, Math.PI * 1.3), sc.trimMat);
  crownArc.rotation.z = -Math.PI * 0.15;
  crownArc.position.y = 0.08;
  head.add(mirrorHead, browStar, crownArc);

  // 3 Nested Orthogonal Rotating Brass Astrolabe Rings + Orbiting Star Orbs!
  const astrolabe = new THREE.Group();
  astrolabe.position.set(0, 0.08, 0);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.018, 8, 32), sc.armorMat);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.015, 8, 32), sc.trimMat);
  ringB.rotation.x = Math.PI / 3;
  const ringC = ignoreAO(new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.012, 8, 32), sc.visorMat));
  ringC.rotation.y = Math.PI / 3;
  const planetOrb = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), sc.visorMat));
  planetOrb.position.set(0.66, 0, 0);
  ringB.add(planetOrb);
  astrolabe.add(ringA, ringB, ringC);
  sc.torso.add(astrolabe);

  return finalizeRig(sc, 'chrono_astromancer', (time) => {
    // True levitation when not downed!
    if (sc.body.position.y > -0.20) {
      sc.body.position.y = 0.22 + Math.sin(time * 2.6) * 0.07;
    }
    ringA.rotation.y = time * 1.3;
    ringA.rotation.x = Math.sin(time * 0.9) * 0.45;
    ringB.rotation.z = -time * 1.7;
    ringC.rotation.x = time * 1.1;
    ringC.rotation.z = time * 0.8;
  });
}

// ==================== 9. STORM INVOKER ====================
function buildStormInvoker(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x142c3d, // storm-sea silk
    armorHex: 0xdce6f2,
    trimHex: 0xf0be54,
    darkHex: 0x161d29,
    glowHex: 0x5be2ff
  });
  addArmoredBootsAndLegs(sc, sc.clothMat, sc.darkMat, sc.trimMat, 0.96);
  addStandardArms(sc, sc.clothMat, sc.armorMat, sc.trimMat);

  const hakama = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.50, 10), sc.clothMat);
  hakama.position.y = 0.76;
  sc.body.add(hakama);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.56, 10), sc.clothMat);
  sc.torso.add(chest);
  // Prayer thunder-beads draped across chest
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.30;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 8, 8),
      i % 2 === 0 ? sc.trimMat : sc.visorMat
    );
    if (i % 2 === 1) ignoreAO(bead);
    bead.position.set(Math.sin(a) * 0.28, 0.18 - Math.cos(a) * 0.14, Math.cos(a) * 0.26);
    sc.torso.add(bead);
  }

  // Wide Gilded Conical Storm Kasa Hat + Crackling Visor Eyes
  const head = new THREE.Group();
  head.position.y = 0.48;
  sc.torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 10), sc.darkMat);
  const eyes = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.032, 0.05), sc.visorMat));
  eyes.position.set(0, 0.02, 0.16);
  const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.20, 18), sc.trimMat);
  kasa.position.y = 0.16;
  const kasaRim = ignoreAO(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.015, 6, 24), sc.visorMat));
  kasaRim.rotation.x = Math.PI / 2;
  kasaRim.position.y = 0.07;
  const finial = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), sc.visorMat));
  finial.position.y = 0.30;
  head.add(face, eyes, kasa, kasaRim, finial);

  // Raijin Ring of 5 Floating Thunder Taiko Drums behind back!
  const drumHalo = new THREE.Group();
  drumHalo.position.set(0, 0.34, -0.30);
  const backingRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.016, 6, 28), sc.trimMat);
  drumHalo.add(backingRing);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const drum = new THREE.Group();
    drum.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.09, 12), sc.trimMat);
    barrel.rotation.x = Math.PI / 2;
    const skin = ignoreAO(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.096, 12), sc.visorMat));
    skin.rotation.x = Math.PI / 2;
    drum.add(barrel, skin);
    drumHalo.add(drum);
  }
  sc.torso.add(drumHalo);

  const capeObj = makeCapeMesh(sc.clothMat, 0.58, 1.22, -0.22, 0.20);
  sc.torso.add(capeObj.mesh);

  return finalizeRig(sc, 'storm_invoker', (time, speed) => {
    animateCapeObj(capeObj, time, speed);
    drumHalo.rotation.z = time * 1.05;
  });
}

// ==================== 10. BRASS ARTIFICER ====================
function buildBrassArtificer(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x5c361e, // heavy forge leather apron
    armorHex: 0x566275, // workshop steel
    trimHex: 0xdfa247, // bright brass
    darkHex: 0x222630,
    glowHex: 0xffb844
  });
  addArmoredBootsAndLegs(sc, sc.armorMat, sc.trimMat, sc.darkMat, 1.05);
  addStandardArms(sc, sc.clothMat, sc.trimMat, sc.armorMat);

  const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.36, 0.46, 10), sc.clothMat);
  apron.position.y = 0.80;
  sc.body.add(apron);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.56, 10), sc.clothMat);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.52), sc.armorMat);
  const arcCell = ignoreAO(new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5be7ff, emissiveIntensity: 2.2 })
  ));
  arcCell.rotation.x = Math.PI / 2;
  arcCell.position.set(0, 0.08, 0.26);
  sc.torso.add(chest, chestPlate, arcCell);

  // Engineer Helmet + Triple Magnifying Goggles!
  const head = new THREE.Group();
  head.position.y = 0.47;
  sc.torso.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), sc.armorMat);
  const jawGuard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.20), sc.trimMat);
  jawGuard.position.set(0, -0.07, 0.07);
  head.add(cap, jawGuard);
  [[-0.08, 0.03, 0.048], [0.08, 0.03, 0.048], [0, 0.11, 0.042]].forEach(([gx, gy, gr], idx) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(gr, gr, 0.09, 10), sc.trimMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(gx, gy, 0.16);
    const lens = ignoreAO(new THREE.Mesh(
      new THREE.SphereGeometry(gr * 0.82, 8, 8),
      idx === 2
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5be7ff, emissiveIntensity: 2.4 })
        : sc.visorMat
    ));
    lens.position.set(gx, gy, 0.195);
    head.add(tube, lens);
  });

  // Heavy Power Backpack + Spinning Radar + Twin Articulated Spider-Mech Arms!
  const pack = new THREE.Group();
  pack.position.set(0, 0.12, -0.32);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.26), sc.armorMat);
  const radarPivot = new THREE.Group();
  radarPivot.position.set(0.14, 0.34, 0);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.08, 12, 1, true), sc.trimMat);
  dish.rotation.x = Math.PI * 0.35;
  radarPivot.add(dish);
  pack.add(box, radarPivot);

  const spiderArms = [];
  [-1, 1].forEach((s) => {
    const armRoot = new THREE.Group();
    armRoot.position.set(s * 0.22, 0.20, -0.04);
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8), sc.trimMat);
    seg1.position.set(s * 0.20, 0.18, 0);
    seg1.rotation.z = -s * 0.85;
    const clawPivot = new THREE.Group();
    clawPivot.position.set(s * 0.38, 0.34, 0.04);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.42, 8), sc.armorMat);
    seg2.position.set(s * 0.08, 0.08, 0.16);
    seg2.rotation.x = 0.95;
    const tipGlow = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), sc.visorMat));
    tipGlow.position.set(s * 0.10, 0.16, 0.34);
    clawPivot.add(seg2, tipGlow);
    armRoot.add(seg1, clawPivot);
    pack.add(armRoot);
    spiderArms.push({ armRoot, clawPivot, side: s });
  });
  sc.torso.add(pack);

  return finalizeRig(sc, 'brass_artificer', (time, speed) => {
    radarPivot.rotation.y = time * 2.6;
    for (const sa of spiderArms) {
      sa.armRoot.rotation.z = Math.sin(time * 3.4 + sa.side) * (0.12 + speed * 0.06);
      sa.clawPivot.rotation.x = Math.cos(time * 4.2 + sa.side) * 0.18;
    }
  });
}

// ==================== 11. ABYSSAL OOZE (GELATINOUS SOVEREIGN) ====================
function buildAbyssalOoze(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0x168060,
    armorHex: 0x2df2ad,
    trimHex: 0xffd24c,
    darkHex: 0x0c3b2e,
    glowHex: 0x42f5b3
  });

  // Move torso center down slightly so weapons sit neatly on jelly pseudopods
  sc.torso.position.y = 0.95;

  const jellyOuterMat = new THREE.MeshPhysicalMaterial({
    color: 0x28eb9c,
    emissive: 0x0b5e42,
    emissiveIntensity: 0.45,
    roughness: 0.10,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.68
  });

  // Stubby cute slime droplet feet
  [sc.leftLeg, sc.rightLeg].forEach((leg) => {
    leg.position.y = 0.30;
    const footBlob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), jellyOuterMat);
    footBlob.scale.set(1.1, 0.65, 1.35);
    footBlob.position.set(0, -0.16, 0.04);
    leg.add(footBlob);
  });

  // Jelly pseudopod arms
  [sc.rightShoulder, sc.leftShoulder].forEach((sh, i) => {
    sh.position.set(i === 0 ? -0.54 : 0.54, 0.08, 0.08);
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), jellyOuterMat);
    pod.scale.set(0.85, 0.85, 1.85);
    pod.position.set(0, -0.18, 0.18);
    pod.rotation.x = 0.55;
    sh.add(pod);
  });

  // Main Wobbling Translucent Slime Dome!
  const slimeShell = new THREE.Group();
  const mainBlob = new THREE.Mesh(new THREE.SphereGeometry(0.66, 18, 14), jellyOuterMat);
  mainBlob.scale.set(1.06, 0.96, 1.04);
  mainBlob.position.y = -0.08;
  mainBlob.castShadow = true;
  const baseSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.74, 0.34, 16), jellyOuterMat);
  baseSkirt.position.y = -0.52;
  slimeShell.add(mainBlob, baseSkirt);

  // Expressive Big Glossy Eyes + Tilted Royal Gold Crown on top!
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fffb, roughness: 0.15 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0c1b18, roughness: 0.1 });
  [-1, 1].forEach((s) => {
    const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), eyeWhiteMat);
    eyeW.position.set(s * 0.22, 0.12, 0.57);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), pupilMat);
    pupil.position.set(s * 0.23, 0.12, 0.65);
    slimeShell.add(eyeW, pupil);
  });

  const crown = new THREE.Group();
  crown.position.set(0.08, 0.56, 0.04);
  crown.rotation.z = -0.18;
  const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.14, 8), sc.trimMat);
  crown.add(crownBand);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), sc.trimMat);
    spike.position.set(Math.cos(a) * 0.21, 0.12, Math.sin(a) * 0.21);
    crown.add(spike);
  }
  slimeShell.add(crown);

  // Suspended Inside the Translucent Jelly: Glowing Nucleus + Floating Skull + Half-Dissolved Sword!
  const innerFloat = new THREE.Group();
  const nucleus = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), sc.visorMat));
  nucleus.position.set(0, -0.06, -0.05);
  const innerSkull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mats.boneIvory);
  innerSkull.position.set(-0.22, -0.14, -0.16);
  innerSkull.rotation.set(0.4, 0.5, -0.3);
  const innerSword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.02), mats.silverSteel);
  innerSword.position.set(0.20, -0.04, -0.14);
  innerSword.rotation.set(0.35, -0.2, 0.62);
  innerFloat.add(nucleus, innerSkull, innerSword);
  slimeShell.add(innerFloat);

  sc.torso.add(slimeShell);

  return finalizeRig(sc, 'abyssal_ooze', (time, speed) => {
    const wob = Math.sin(time * (5.2 + speed * 0.9)) * (0.065 + Math.min(0.08, speed * 0.015));
    slimeShell.scale.set(1 + wob, 1 - wob * 1.25, 1 + wob);
    innerFloat.rotation.y = time * 0.9;
    innerFloat.position.y = Math.sin(time * 3.1) * 0.06;
    crown.rotation.z = -0.18 + Math.sin(time * 4.2) * 0.06;
  });
}

// ==================== 12. CURSED MIMIC (GILDED TREASURE FIEND) ====================
function buildCursedMimic(mats) {
  const sc = createBaseScaffold(mats, {
    clothHex: 0xc91e3a, // crimson tongue
    armorHex: 0x452715, // dark ironwood chest
    armorRoughness: 0.65,
    armorMetalness: 0.18,
    trimHex: 0xf2b949, // heavy gilded treasure bands
    darkHex: 0x1a1216,
    glowHex: 0xffbe3b
  });

  sc.torso.position.y = 1.06;

  // Wiry Shadow-Demon Clawed Legs!
  [sc.leftLeg, sc.rightLeg].forEach((leg, i) => {
    leg.position.set(i === 0 ? -0.24 : 0.24, 0.74, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.065, 0.38, 8), sc.darkMat);
    upper.position.set(0, -0.18, -0.05);
    upper.rotation.x = -0.28;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.40, 8), sc.darkMat);
    lower.position.set(0, -0.48, 0.04);
    lower.rotation.x = 0.25;
    const clawFoot = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 4), sc.trimMat);
    clawFoot.rotation.x = Math.PI / 2;
    clawFoot.position.set(0, -0.66, 0.14);
    leg.add(upper, lower, clawFoot);
  });

  // Monster Clawed Arms emerging from chest sides
  [sc.rightShoulder, sc.leftShoulder].forEach((sh, i) => {
    sh.position.set(i === 0 ? -0.52 : 0.52, 0.04, 0.06);
    const clawArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.44, 8), sc.darkMat);
    clawArm.position.set(0, -0.20, 0.15);
    clawArm.rotation.x = 0.75;
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 12), sc.trimMat);
    shackle.position.set(0, -0.28, 0.22);
    sh.add(clawArm, shackle);
  });

  // Lower Treasure Chest Box + Gleaming Gold Hoard + Bottom Fangs + Wiggling Tongue!
  const chestBase = new THREE.Group();
  const baseBox = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.44, 0.64), sc.armorMat);
  baseBox.position.y = -0.12;
  baseBox.castShadow = true;
  chestBase.add(baseBox);
  [-0.36, 0, 0.36].forEach((bx) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.67), sc.trimMat);
    strap.position.set(bx, -0.12, 0);
    chestBase.add(strap);
  });
  const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.20, 0.06), sc.trimMat);
  lockPlate.position.set(0, 0.02, 0.33);
  chestBase.add(lockPlate);

  // Gold hoard mounds inside chest!
  const goldHoard = ignoreAO(new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdf6b, emissive: 0xffa61a, emissiveIntensity: 1.4, metalness: 0.85, roughness: 0.2 })
  ));
  goldHoard.scale.set(1.15, 0.42, 0.82);
  goldHoard.position.set(0, 0.09, 0.02);
  chestBase.add(goldHoard);

  // Lower jaw ivory fangs
  for (let i = -3; i <= 3; i++) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.13, 4), mats.boneIvory);
    fang.position.set(i * 0.105, 0.15, 0.28);
    chestBase.add(fang);
  }

  // Long Lashing Crimson Tongue!
  const tonguePivot = new THREE.Group();
  tonguePivot.position.set(0, 0.10, 0.18);
  const tongueSeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.38), sc.clothMat);
  tongueSeg1.position.set(0, 0.04, 0.18);
  tongueSeg1.rotation.x = 0.25;
  const tongueTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), sc.clothMat);
  tongueTip.rotation.x = Math.PI * 0.62;
  tongueTip.position.set(0, -0.04, 0.44);
  tonguePivot.add(tongueSeg1, tongueTip);
  chestBase.add(tonguePivot);

  // Hinged Chomping Upper Lid + Upper Fangs + Glowing Monster Eyes!
  const lidHinge = new THREE.Group();
  lidHinge.position.set(0, 0.10, -0.31);
  lidHinge.rotation.x = -0.58; // gaping maw!
  const lidVault = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.86, 12, 1, false, 0, Math.PI),
    sc.armorMat
  );
  lidVault.rotation.z = Math.PI / 2;
  lidVault.position.set(0, 0, 0.31);
  lidVault.castShadow = true;
  lidHinge.add(lidVault);
  [-0.36, 0, 0.36].forEach((bx) => {
    const lidBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.032, 6, 14, Math.PI),
      sc.trimMat
    );
    lidBand.rotation.y = Math.PI / 2;
    lidBand.position.set(bx, 0, 0.31);
    lidHinge.add(lidBand);
  });
  for (let i = -3; i <= 3; i++) {
    const uFang = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.14, 4), mats.boneIvory);
    uFang.rotation.x = Math.PI;
    uFang.position.set(i * 0.105, -0.05, 0.59);
    lidHinge.add(uFang);
  }
  // Glowing demonic eyes peering out from beneath the lid
  [-1, 1].forEach((s) => {
    const mEye = ignoreAO(new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3864, emissiveIntensity: 2.6 })
    ));
    mEye.position.set(s * 0.19, 0.19, 0.55);
    lidHinge.add(mEye);
  });

  sc.torso.add(chestBase, lidHinge);

  return finalizeRig(sc, 'cursed_mimic', (time, speed) => {
    const chompSpeed = 4.5 + speed * 1.4;
    lidHinge.rotation.x = -0.52 - Math.abs(Math.sin(time * chompSpeed)) * (0.28 + Math.min(0.32, speed * 0.05));
    tonguePivot.rotation.y = Math.sin(time * 6.5) * 0.32;
    tonguePivot.rotation.x = Math.cos(time * 5.2) * 0.16;
  });
}

function finalizeRig(sc, classId, customUpdate) {
  function applyTheme(theme) {
    if (!theme) return;
    if (theme.visorHex !== undefined) {
      sc.heroLight.color.setHex(theme.visorHex);
    }
  }

  return {
    root: sc.root,
    body: sc.body,
    torso: sc.torso,
    leftLeg: sc.leftLeg,
    rightLeg: sc.rightLeg,
    rightShoulder: sc.rightShoulder,
    leftShoulder: sc.leftShoulder,
    offhandPivot: sc.offhandPivot,
    swordPivot: sc.swordPivot,
    bladeMat: sc.bladeMat,
    runeStripMat: sc.runeStripMat,
    bladeTip: sc.bladeTip,
    bladeBase: sc.bladeBase,
    heroLight: sc.heroLight,
    visorMat: sc.visorMat,
    clothMat: sc.clothMat,
    armorMat: sc.armorMat,
    trimMat: sc.trimMat,
    shieldAura: sc.shieldAura,
    shRing: sc.shRing,
    classId,
    applyTheme,
    updateCape(time, speed) {
      if (customUpdate) customUpdate(time, speed);
      if (sc.shieldAura.visible) {
        sc.shRing.rotation.z = time * 1.8;
      }
    }
  };
}

const BUILDERS = {
  ember_paladin: buildEmberPaladin,
  crimson_flagellant: buildCrimsonFlagellant,
  iron_juggernaut: buildIronJuggernaut,
  wraith_assassin: buildWraithAssassin,
  fortune_gambler: buildFortuneGambler,
  plague_apothecary: buildPlagueApothecary,
  bone_necromancer: buildBoneNecromancer,
  chrono_astromancer: buildChronoAstromancer,
  storm_invoker: buildStormInvoker,
  brass_artificer: buildBrassArtificer,
  abyssal_ooze: buildAbyssalOoze,
  cursed_mimic: buildCursedMimic
};

export function buildClassHeroRig(classId, mats, initialTheme = null) {
  const fn = BUILDERS[classId] || BUILDERS[DEFAULT_CLASS_ID] || buildEmberPaladin;
  const rig = fn(mats);
  if (initialTheme) rig.applyTheme(initialTheme);
  return rig;
}

// ==================== SUMMON & SKILL 3D MODELS ====================
export function createSkeletonMinionRig(mats) {
  const root = new THREE.Group();
  const boneMat = mats.boneIvory.clone();
  const soulMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x5effb0,
    emissiveIntensity: 2.2,
    roughness: 0.3
  });
  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0x192826,
    emissive: 0x104d38,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide
  });

  const shroud = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 8, 1, true), shroudMat);
  shroud.position.y = 0.52;
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.52, 6), boneMat);
  spine.position.y = 0.92;
  const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.34, 8), boneMat);
  ribs.position.y = 1.02;
  const core = ignoreAO(new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0), soulMat));
  core.position.y = 1.00;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), boneMat);
  skull.position.y = 1.34;
  const eyes = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.05), soulMat));
  eyes.position.set(0, 1.35, 0.13);

  const armPivot = new THREE.Group();
  armPivot.position.set(-0.26, 1.08, 0.06);
  const scimitar = ignoreAO(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.92), soulMat));
  scimitar.position.set(0, -0.10, 0.42);
  armPivot.add(scimitar);

  root.add(shroud, spine, ribs, core, skull, eyes, armPivot);
  return { root, armPivot, soulMat };
}

export function createAutoturretRig(mats) {
  const root = new THREE.Group();
  const brassMat = mats.gildedBronze.clone();
  const darkMat = mats.obsidianArmor.clone();
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffb340,
    emissiveIntensity: 2.3
  });

  // Tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.72, 8), darkMat);
    leg.position.set(Math.cos(a) * 0.28, 0.30, Math.sin(a) * 0.28);
    leg.rotation.z = Math.cos(a) * 0.52;
    leg.rotation.x = -Math.sin(a) * 0.52;
    root.add(leg);
  }
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.22, 10), brassMat);
  pedestal.position.y = 0.60;
  root.add(pedestal);

  // Rotating turret head + twin barrels
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.82;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.48), brassMat);
  const lens = ignoreAO(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), coreMat));
  lens.position.set(0, 0.16, 0.10);
  const barrelGroup = new THREE.Group();
  [-0.11, 0.11].forEach((bx) => {
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.68, 8), darkMat);
    brl.rotation.x = Math.PI / 2;
    brl.position.set(bx, 0, 0.42);
    const tip = ignoreAO(new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.012, 6, 10), coreMat));
    tip.position.set(bx, 0, 0.75);
    barrelGroup.add(brl, tip);
  });
  headPivot.add(housing, lens, barrelGroup);
  root.add(headPivot);
  return { root, headPivot, barrelGroup };
}

export function createSlimelingRig() {
  const root = new THREE.Group();
  const jellyMat = new THREE.MeshPhysicalMaterial({
    color: 0x3ef7b1,
    emissive: 0x148c5e,
    emissiveIntensity: 0.7,
    roughness: 0.12,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.78
  });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), jellyMat);
  blob.position.y = 0.28;
  const core = ignoreAO(new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshBasicMaterial({ color: 0xbaffde })
  ));
  core.position.y = 0.28;
  root.add(blob, core);
  return { root, blob };
}

export function createFateDieMesh() {
  const root = ignoreAO(new THREE.Group());
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.72, 0.72),
    new THREE.MeshStandardMaterial({ color: 0xfbf4e4, emissive: 0xffb838, emissiveIntensity: 0.45, roughness: 0.25 })
  );
  const edges = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.75, 0.75),
    new THREE.MeshBasicMaterial({ color: 0xffd257, wireframe: true })
  );
  const pipMat = new THREE.MeshBasicMaterial({ color: 0xd91e46 });
  [[0, 0, 0.37], [0, 0, -0.37], [0.37, 0, 0], [-0.37, 0, 0], [0, 0.37, 0], [0, -0.37, 0]].forEach(([x, y, z]) => {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), pipMat);
    pip.position.set(x, y, z);
    root.add(pip);
  });
  root.add(cube, edges);
  return root;
}

export function createChronosphereMesh(radius = 6.6) {
  const root = ignoreAO(new THREE.Group());
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd978, transparent: true, opacity: 0.65 });
  const domeMat = new THREE.MeshBasicMaterial({
    color: 0x6ea8ff,
    transparent: true,
    opacity: 0.11,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 56), goldMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.08;
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.62, 0.035, 8, 42), goldMat);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.08;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), domeMat);
  const handHour = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, radius * 0.52), goldMat);
  handHour.geometry.translate(0, 0, radius * 0.26);
  handHour.position.y = 0.10;
  const handMin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, radius * 0.86), goldMat);
  handMin.geometry.translate(0, 0, radius * 0.43);
  handMin.position.y = 0.11;
  root.add(outerRing, innerRing, dome, handHour, handMin);
  return { root, handHour, handMin, innerRing };
}

export function createSanctumDomeMesh(radius = 2.65) {
  const root = ignoreAO(new THREE.Group());
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffbe55,
      wireframe: true,
      transparent: true,
      opacity: 0.48
    })
  );
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.96, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffa838,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    })
  );
  root.add(shell, inner);
  return { root, shell };
}
