import * as THREE from 'three';

export const GRID_STEP = 32;
const CORRIDOR_HALF_W = 2.7;
const GATE_HALF_W = 2.55;

const DIRS = [
  { key: 'N', dx: 0, dz: -1, opp: 'S' },
  { key: 'S', dx: 0, dz: 1,  opp: 'N' },
  { key: 'E', dx: 1, dz: 0,  opp: 'W' },
  { key: 'W', dx: -1, dz: 0, opp: 'E' }
];

function markIgnoreAO(obj) {
  obj.userData.ignoreAO = true;
  return obj;
}

export function generateDungeonBlueprint() {
  const nodes = new Map();
  const keyOf = (gx, gz) => `${gx},${gz}`;

  const addRoom = (gx, gz, type, halfW, halfD, title, subtitle) => {
    const r = {
      id: nodes.size,
      gx,
      gz,
      cx: gx * GRID_STEP,
      cz: gz * GRID_STEP,
      halfW,
      halfD,
      type,
      title,
      subtitle,
      doors: {},
      visited: type === 'start',
      cleared: type === 'start' || type === 'vault' || type === 'sanctuary',
      locked: false,
      spawns: [],
      braziers: [],
      colliders: [],
      traps: [],
      props: [],
      interactables: []
    };
    nodes.set(keyOf(gx, gz), r);
    return r;
  };

  const link = (a, b, dirKey, oppKey) => {
    a.doors[dirKey] = b;
    b.doors[oppKey] = a;
  };

  const rStart = addRoom(0, 0, 'start', 8.5, 8.5, 'FLOODED NARTHEX', 'Rain-slicked threshold of the sunken cathedral');
  const rHall1 = addRoom(0, -1, 'combat', 10.5, 10.5, 'OSSUARY CLOISTER', 'Hollowed sentinels patrol the flooded flagstones');
  const rNave  = addRoom(0, -2, 'elite', 11.5, 11.5, 'NAVE OF ASHES', 'Iron juggernauts & spike grates guard the inner seal');
  const rBoss  = addRoom(0, -3, 'boss', 12.8, 12.8, 'SANCTUM OF MALAKOR', 'Throne of the Ashen Warden');

  link(rStart, rHall1, 'N', 'S');
  link(rHall1, rNave, 'N', 'S');
  link(rNave, rBoss, 'N', 'S');

  const sideSign1 = Math.random() < 0.5 ? -1 : 1;
  const rVault = addRoom(
    sideSign1,
    -1,
    'vault',
    8.5,
    8.5,
    'GILDED RELIQUARY',
    'An untouched relic coffer gleams behind iron bars'
  );
  link(rHall1, rVault, sideSign1 === 1 ? 'E' : 'W', sideSign1 === 1 ? 'W' : 'E');

  const rCrypt = addRoom(
    -sideSign1,
    -1,
    'combat',
    9.8,
    9.8,
    'DROWNED CATACOMB',
    'Void acolytes chant beneath weeping arches'
  );
  link(rHall1, rCrypt, sideSign1 === 1 ? 'W' : 'E', sideSign1 === 1 ? 'E' : 'W');

  const sideSign2 = Math.random() < 0.5 ? 1 : -1;
  const rFountain = addRoom(
    sideSign2,
    -2,
    'sanctuary',
    8.5,
    8.5,
    'CHALICE SPRING',
    'Sacred waters & a Cursed Blood Pact await the bold'
  );
  link(rNave, rFountain, sideSign2 === 1 ? 'E' : 'W', sideSign2 === 1 ? 'W' : 'E');

  const northOfWing = nodes.get(keyOf(sideSign2, -1));
  if (northOfWing) {
    link(northOfWing, rFountain, 'N', 'S');
  }

  rHall1.spawns = [
    { type: 'thrall', count: 4 },
    { type: 'acolyte', count: 1 }
  ];
  rCrypt.spawns = [
    { type: 'thrall', count: 3 },
    { type: 'stalker', count: 2 },
    { type: 'acolyte', count: 2 }
  ];
  rNave.spawns = [
    { type: 'thrall', count: 4 },
    { type: 'stalker', count: 2 },
    { type: 'acolyte', count: 2 },
    { type: 'juggernaut', count: 2 }
  ];
  rBoss.spawns = [
    { type: 'warden', count: 1 },
    { type: 'acolyte', count: 2 }
  ];

  return Array.from(nodes.values());
}

export function buildDungeonWorld(scene, tex, isMobile = false) {
  const root = new THREE.Group();
  scene.add(root);

  const rooms = generateDungeonBlueprint();
  const corridors = [];
  const gates = [];
  const allBraziers = [];
  const allTraps = [];
  const destructibles = [];
  const interactables = [];
  const dynamicPointLights = [];

  // 1. REAL-TIME PLANAR REFLECTION BUFFER + CONTINUOUS WORLD-SPACE WET FLOOR
  const rtSize = isMobile ? 384 : 640;
  const reflRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true
  });
  const reflCamera = new THREE.PerspectiveCamera();
  const reflMatrix = new THREE.Matrix4();
  const clipPlane = new THREE.Vector4();
  const qVec = new THREE.Vector4();
  const reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const floorUniforms = {
    uReflectTex: { value: reflRT.texture },
    uReflectMatrix: { value: reflMatrix },
    uPuddleMask: { value: tex.puddleMask },
    uRippleNormal: { value: tex.rippleNormal },
    uTime: { value: 0 },
    uHeroPos: { value: new THREE.Vector3() },
    uWakeStrength: { value: 0.0 }
  };

  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.floorAlbedo,
    aoMap: tex.floorORM,
    aoMapIntensity: 1.18,
    roughnessMap: tex.floorORM,
    roughness: 1.0,
    metalnessMap: tex.floorORM,
    metalness: 1.0,
    normalMap: tex.floorNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    envMapIntensity: 1.15
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
         uniform sampler2D uRippleNormal;
         uniform float uTime;
         uniform vec3 uHeroPos;
         uniform float uWakeStrength;
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
         vec2 pudUv = vWorldFloor.xz * 0.055;
         float puddleAmt = texture2D(uPuddleMask, pudUv).r;
         vec2 rUv1 = vWorldFloor.xz * 0.28 + vec2(uTime * 0.012, uTime * 0.009);
         vec2 rUv2 = vWorldFloor.xz * 0.39 - vec2(uTime * 0.010, uTime * 0.014);
         vec3 ripN = normalize(
           (texture2D(uRippleNormal, rUv1).xyz * 2.0 - 1.0) +
           (texture2D(uRippleNormal, rUv2).xyz * 2.0 - 1.0)
         );
         vec2 drops = rainRipple(vWorldFloor.xz * 1.15, uTime);
         // Subtle world-frequency ripple around feet (low spatial frequency so moving never causes high-frequency strobing!)
         vec2 toHero = vWorldFloor.xz - uHeroPos.xz;
         float hd = length(toHero);
         vec2 wake = (hd > 0.08 && hd < 1.65)
           ? (toHero / hd) * sin(hd * 5.2 - uTime * 4.2) * exp(-hd * 2.2) * (0.065 * uWakeStrength)
           : vec2(0.0);
         vec3 waterN = normalize(vec3(ripN.xy * 0.075 + drops * 0.12 + wake, 1.0));
         vec3 worldWaterN = normalize(mat3(viewMatrix) * vec3(waterN.x, 1.0, waterN.y));
         normal = normalize(mix(normal, worldWaterN, smoothstep(0.34, 0.82, puddleAmt)));`
      )
      .replace(
        '#include <dithering_fragment>',
        `float puddle = texture2D(uPuddleMask, vWorldFloor.xz * 0.055).r;
         if (puddle > 0.06 && vReflectUv.w > 0.0) {
           vec2 dropsR = rainRipple(vWorldFloor.xz * 1.15, uTime) * 0.012;
           vec2 rOff = ((texture2D(uRippleNormal, vWorldFloor.xz * 0.30 + uTime * 0.014).xy * 2.0 - 1.0) * 0.016 + dropsR) * puddle;
           vec4 projUv = vReflectUv;
           projUv.xy += rOff * projUv.w;
           vec2 uvClamped = clamp(projUv.xy / projUv.w, vec2(0.002), vec2(0.998));
           vec3 reflCol = texture2D(uReflectTex, uvClamped).rgb;
           vec3 viewDirW = normalize(cameraPosition - vWorldFloor);
           float fresnel = 0.14 + 0.86 * pow(clamp(1.0 - max(dot(viewDirW, vec3(0.0, 1.0, 0.0)), 0.0), 0.0, 1.0), 3.0);
           float reflMix = clamp(puddle * fresnel * 0.88, 0.0, 0.78);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, reflCol * 0.94, reflMix);
         }
         #include <dithering_fragment>`
      );
  };

  const floorMeshes = [];

  const makeStoneMat = (repU, repV, tint = 0x868e9c, roughBias = 0.88) => {
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
      color: tint,
      map,
      aoMap: orm,
      aoMapIntensity: 1.15,
      roughnessMap: orm,
      roughness: roughBias,
      metalnessMap: orm,
      metalness: 0.06,
      normalMap: nrm,
      normalScale: new THREE.Vector2(1.05, 1.05)
    });
  };

  const wallMat = makeStoneMat(3, 2, 0x7a8290, 0.88);
  const pillarMat = makeStoneMat(2, 5, 0x8a92a2, 0.85);
  const capMat = makeStoneMat(2, 1, 0x9aa3b4, 0.82);
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x4d3321,
    roughness: 0.84,
    metalness: 0.05,
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.55, 0.55)
  });
  const boneUrnMat = new THREE.MeshStandardMaterial({
    color: 0x8d8374,
    roughness: 0.64,
    metalness: 0.10,
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.45, 0.45)
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xc99850,
    roughnessMap: tex.metalORM,
    roughness: 0.36,
    metalness: 0.90,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.52, 0.52)
  });
  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x2f3540,
    roughnessMap: tex.metalORM,
    roughness: 0.42,
    metalness: 0.86,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.65, 0.65)
  });
  const emberCoreMat = new THREE.MeshStandardMaterial({
    color: 0x220800,
    emissive: 0xff5a00,
    emissiveIntensity: 2.2,
    roughness: 0.9
  });

  const spawnColumn = (parent, x, z, h = 6.6) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.35), capMat);
    plinth.position.y = 0.425;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.50, h, 12), pillarMat);
    shaft.position.y = 0.85 + h * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    g.add(shaft);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.16, 12), bronzeMat);
    ring.position.y = 2.8;
    g.add(ring);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.46, 0.55, 10), capMat);
    cap.position.y = 0.85 + h + 0.25;
    cap.castShadow = true;
    g.add(cap);
    parent.add(g);
  };

  const spawnBrazier = (room, x, z, colorHex = 0xff7b29) => {
    const bg = new THREE.Group();
    bg.position.set(x, 0, z);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.62, 0.72, 8), capMat);
    ped.position.y = 0.36;
    ped.castShadow = true;
    ped.receiveShadow = true;
    bg.add(ped);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.26, 0.44, 10), darkIronMat);
    bowl.position.y = 1.05;
    bowl.castShadow = true;
    bg.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 18), bronzeMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.26;
    bg.add(rim);

    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), emberCoreMat);
    coals.scale.set(1, 0.4, 1);
    coals.position.y = 1.20;
    bg.add(coals);

    const flameSprites = [];
    for (let f = 0; f < 2; f++) {
      const smat = new THREE.SpriteMaterial({
        map: tex.softParticleTex,
        color: f === 0 ? colorHex : 0xffdf99,
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
      flameSprites.push({ sp, baseY: sp.position.y, sz, phase: allBraziers.length * 1.7 + f * 2.1 });
    }

    root.add(bg);
    const bObj = {
      id: allBraziers.length,
      x,
      y: 1.55,
      z,
      colorHex,
      flameSprites,
      phase: allBraziers.length * 1.31,
      slotIndex: -1,
      fadeWeight: 0
    };
    allBraziers.push(bObj);
    if (room) {
      room.braziers.push(bObj);
      room.colliders.push({ x, z, r: 0.68 });
    }
  };

  // Persistent Hysteresis Light Pool: lights NEVER abruptly pop/swap when hero crosses midpoint!
  // Each slot stays bound to its brazier until fadeWeight smoothly reaches 0, and distant braziers smoothly fade down by distance.
  const lightSlots = [];
  for (let i = 0; i < 8; i++) {
    const pl = new THREE.PointLight(0xff7b29, 0, 16.5, 1.7);
    scene.add(pl);
    dynamicPointLights.push(pl);
    lightSlots.push({ light: pl, brazier: null });
  }

  const buildWallRun = (x1, z1, x2, z2, height = 4.6) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.25) return;
    const mx = (x1 + x2) * 0.5;
    const mz = (z1 + z2) * 0.5;
    const g = new THREE.Group();
    g.position.set(mx, 0, mz);
    g.rotation.y = Math.atan2(x2 - x1, z2 - z1);

    const thickness = 0.95;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), wallMat);
    wall.position.y = height * 0.5;
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.26, 0.55, len + 0.1), capMat);
    plinth.position.y = 0.275;
    plinth.receiveShadow = true;
    g.add(plinth);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.32, 0.34, len + 0.14), capMat);
    cornice.position.y = height + 0.15;
    cornice.castShadow = true;
    g.add(cornice);

    root.add(g);
  };

  const spawnDestructible = (room, x, z, kind = 'urn') => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    if (kind === 'barrel') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.86, 10), woodMat);
      body.position.y = 0.43;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      [0.22, 0.64].forEach((hy) => {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 14), darkIronMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = hy;
        g.add(hoop);
      });
    } else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.62, 10), boneUrnMat);
      base.position.y = 0.31;
      base.castShadow = true;
      g.add(base);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.30, 0.30, 10), boneUrnMat);
      neck.position.y = 0.74;
      neck.castShadow = true;
      g.add(neck);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 8), bronzeMat);
      lid.position.y = 0.98;
      g.add(lid);
    }
    root.add(g);
    const prop = { mesh: g, x, z, r: 0.45, hp: 1, kind, broken: false, room };
    destructibles.push(prop);
    room.props.push(prop);
  };

  // REBUILT DIEGETIC FLOOR SPIKE GRATE:
  // - Feathered stone-and-iron recessed socket plate blends organically into floor masonry (no shiny void square!)
  // - Spikes use vertex-shader floor plane clipping (`vWorldSpikeY < 0.02 => discard`) so retracted spikes NEVER poke below the floor into planar reflections!
  // - Warning glow uses `trapGlowTex` so ember light only shines up from the 9 circular sockets & rune ring (NEVER a red square!)
  const spikeSteelMat = new THREE.MeshStandardMaterial({
    color: 0xb9c2d0,
    roughnessMap: tex.metalORM,
    roughness: 0.32,
    metalness: 0.90,
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
    normalMap: tex.stoneNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.78,
    metalness: 0.32,
    transparent: true,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });

  const spawnSpikeTrap = (room, x, z, phaseOffset = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    // Flush feathered stone-curb + iron grate socket plate
    const plate = markIgnoreAO(new THREE.Mesh(new THREE.PlaneGeometry(2.16, 2.16), trapPlateMat));
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.008;
    plate.receiveShadow = true;
    g.add(plate);

    // Low beveled stone corner rivets for physical 3D relief
    [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]].forEach(([rx, rz]) => {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.045, 8), darkIronMat);
      bolt.position.set(rx, 0.022, rz);
      bolt.receiveShadow = true;
      g.add(bolt);
    });

    // Socket-only ember warning glow (hidden when dormant, zero square fill!)
    const runeWarnMat = new THREE.MeshBasicMaterial({
      map: tex.trapGlowTex,
      color: 0xff6a1a,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const warnPlane = markIgnoreAO(new THREE.Mesh(new THREE.PlaneGeometry(2.16, 2.16), runeWarnMat));
    warnPlane.rotation.x = -Math.PI / 2;
    warnPlane.position.y = 0.014;
    warnPlane.visible = false;
    g.add(warnPlane);

    // 9 forged steel spikes emerging cleanly through the 9 sockets
    const spikesGroup = new THREE.Group();
    spikesGroup.position.y = -0.78;
    spikesGroup.visible = false;
    for (let sx = -1; sx <= 1; sx++) {
      for (let sz = -1; sz <= 1; sz++) {
        // Collar ring fixed at socket mouth
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.024, 6, 12), darkIronMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(sx * 0.576, 0.016, sz * 0.576);
        g.add(collar);

        const sp = markIgnoreAO(new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.74, 8), spikeSteelMat));
        sp.position.set(sx * 0.576, 0.37, sz * 0.576);
        sp.castShadow = true;
        spikesGroup.add(sp);
      }
    }
    g.add(spikesGroup);
    root.add(g);

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

  // 2. CONSTRUCT EVERY ROOM IN THE DUNGEON (EXACT NON-OVERLAPPING FLOORS!)
  const builtCorridorKeys = new Set();

  for (const room of rooms) {
    const { cx, cz, halfW, halfD } = room;

    // Exact room interior footprint [cx - halfW .. cx + halfW] x [cz - halfD .. cz + halfD] -> ZERO overlap with corridors!
    const fGeo = new THREE.PlaneGeometry(halfW * 2, halfD * 2);
    fGeo.setAttribute('uv2', fGeo.attributes.uv);
    const fMesh = new THREE.Mesh(fGeo, floorMat);
    fMesh.rotation.x = -Math.PI / 2;
    fMesh.position.set(cx, 0, cz);
    fMesh.receiveShadow = true;
    root.add(fMesh);
    floorMeshes.push(fMesh);

    if (room.type !== 'combat' || room.id === 1) {
      const sigColor = room.type === 'boss' ? 0xff3b1f : (room.type === 'sanctuary' ? 0x4de8b2 : 0xff9436);
      const sigSize = room.type === 'boss' ? 14.5 : 8.2;
      const sig = markIgnoreAO(new THREE.Mesh(
        new THREE.PlaneGeometry(sigSize, sigSize),
        new THREE.MeshBasicMaterial({
          map: tex.sealTex,
          color: sigColor,
          transparent: true,
          opacity: room.type === 'boss' ? 0.48 : 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      ));
      sig.rotation.x = -Math.PI / 2;
      sig.position.set(cx, 0.012, cz);
      root.add(sig);
    }

    if (room.doors.N) {
      buildWallRun(cx - halfW, cz - halfD, cx - GATE_HALF_W, cz - halfD);
      buildWallRun(cx + GATE_HALF_W, cz - halfD, cx + halfW, cz - halfD);
      spawnColumn(root, cx - GATE_HALF_W - 0.3, cz - halfD, 5.8);
      spawnColumn(root, cx + GATE_HALF_W + 0.3, cz - halfD, 5.8);
    } else {
      buildWallRun(cx - halfW, cz - halfD, cx + halfW, cz - halfD, room.type === 'boss' ? 6.8 : 4.6);
    }
    if (room.doors.S) {
      buildWallRun(cx - halfW, cz + halfD, cx - GATE_HALF_W, cz + halfD);
      buildWallRun(cx + GATE_HALF_W, cz + halfD, cx + halfW, cz + halfD);
      spawnColumn(root, cx - GATE_HALF_W - 0.3, cz + halfD, 5.8);
      spawnColumn(root, cx + GATE_HALF_W + 0.3, cz + halfD, 5.8);
    } else {
      buildWallRun(cx - halfW, cz + halfD, cx + halfW, cz + halfD, 3.2);
    }
    if (room.doors.W) {
      buildWallRun(cx - halfW, cz - halfD, cx - halfW, cz - GATE_HALF_W);
      buildWallRun(cx - halfW, cz + GATE_HALF_W, cx - halfW, cz + halfD);
      spawnColumn(root, cx - halfW, cz - GATE_HALF_W - 0.3, 5.8);
      spawnColumn(root, cx - halfW, cz + GATE_HALF_W + 0.3, 5.8);
    } else {
      buildWallRun(cx - halfW, cz - halfD, cx - halfW, cz + halfD);
    }
    if (room.doors.E) {
      buildWallRun(cx + halfW, cz - halfD, cx + halfW, cz - GATE_HALF_W);
      buildWallRun(cx + halfW, cz + GATE_HALF_W, cx + halfW, cz + halfD);
      spawnColumn(root, cx + halfW, cz - GATE_HALF_W - 0.3, 5.8);
      spawnColumn(root, cx + halfW, cz + GATE_HALF_W + 0.3, 5.8);
    } else {
      buildWallRun(cx + halfW, cz - halfD, cx + halfW, cz + halfD);
    }

    const inset = 1.85;
    const brazierTint = room.type === 'sanctuary' ? 0x55f2c8 : (room.type === 'boss' ? 0xff5522 : 0xff8433);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      spawnColumn(root, cx + sx * (halfW - 0.3), cz + sz * (halfD - 0.3), 6.4);
      spawnBrazier(room, cx + sx * (halfW - inset), cz + sz * (halfD - inset), brazierTint);
    });

    const cone = markIgnoreAO(new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 4.2, 20, 16, 1, true),
      new THREE.MeshBasicMaterial({
        map: tex.godrayTex,
        color: room.type === 'sanctuary' ? 0x77ffe0 : 0x7eaaff,
        transparent: true,
        opacity: 0.068,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    ));
    cone.position.set(cx - 1.2, 9.5, cz - 0.8);
    cone.rotation.z = -0.32;
    cone.rotation.x = 0.22;
    root.add(cone);

    if (room.type === 'start') {
      const anvilG = new THREE.Group();
      anvilG.position.set(cx - 4.2, 0, cz + 1.5);
      const aPed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.1), capMat);
      aPed.position.y = 0.275;
      aPed.castShadow = true;
      anvilG.add(aPed);
      const aBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 0.62), darkIronMat);
      aBody.position.y = 0.80;
      aBody.castShadow = true;
      anvilG.add(aBody);
      const aHorn = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 6), bronzeMat);
      aHorn.rotation.z = Math.PI / 2;
      aHorn.position.set(0.75, 0.86, 0);
      anvilG.add(aHorn);
      const emberRune = markIgnoreAO(new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.28),
        new THREE.MeshBasicMaterial({
          map: tex.trapGlowTex,
          color: 0xff8822,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      ));
      emberRune.rotation.x = -Math.PI / 2;
      emberRune.position.y = 1.07;
      anvilG.add(emberRune);
      root.add(anvilG);
      room.colliders.push({ x: cx - 4.2, z: cz + 1.5, r: 0.88 });
      interactables.push({
        kind: 'forge_anvil',
        room,
        x: cx - 4.2,
        z: cz + 1.5,
        used: false,
        cost: 30,
        uses: 0,
        label: '[F] TEMPER GREATSWORD (30 CINDERS: +20% DMG & +15 MAX HP)'
      });

      spawnDestructible(room, cx - 5.2, cz - 4.5, 'urn');
      spawnDestructible(room, cx - 4.3, cz - 5.2, 'urn');
      spawnDestructible(room, cx + 5.2, cz - 4.5, 'barrel');
      spawnDestructible(room, cx + 5.8, cz - 3.5, 'urn');
      spawnDestructible(room, cx + 4.8, cz + 4.2, 'barrel');
    } else if (room.type === 'combat') {
      [-3.8, 3.8].forEach((ox) => {
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 2.7, 8), pillarMat);
        ob.position.set(cx + ox, 1.35, cz);
        ob.castShadow = true;
        ob.receiveShadow = true;
        root.add(ob);
        room.colliders.push({ x: cx + ox, z: cz, r: 0.92 });
      });
      spawnSpikeTrap(room, cx, cz - 2.4, 0.0);
      spawnSpikeTrap(room, cx, cz + 2.4, 1.8);
      spawnDestructible(room, cx - 6.8, cz + 5.2, 'barrel');
      spawnDestructible(room, cx + 6.8, cz - 5.2, 'urn');
      spawnDestructible(room, cx + 6.1, cz - 6.0, 'urn');
    } else if (room.type === 'elite') {
      [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]].forEach(([ox, oz]) => {
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.88, 3.1, 8), pillarMat);
        ob.position.set(cx + ox, 1.55, cz + oz);
        ob.castShadow = true;
        ob.receiveShadow = true;
        root.add(ob);
        room.colliders.push({ x: cx + ox, z: cz + oz, r: 0.98 });
      });
      spawnSpikeTrap(room, cx - 2.4, cz, 0.0);
      spawnSpikeTrap(room, cx + 2.4, cz, 1.8);
      spawnSpikeTrap(room, cx, cz - 2.8, 0.9);
      spawnDestructible(room, cx - 8.2, cz + 2.5, 'barrel');
      spawnDestructible(room, cx + 8.2, cz - 2.5, 'barrel');
    } else if (room.type === 'vault') {
      const dais = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 3.4), capMat);
      dais.position.set(cx, 0.18, cz);
      dais.receiveShadow = true;
      root.add(dais);

      const chestGroup = new THREE.Group();
      chestGroup.position.set(cx, 0.36, cz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.72, 0.92), darkIronMat);
      box.position.y = 0.36;
      box.castShadow = true;
      chestGroup.add(box);

      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.72, -0.44);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.45, 12, 1, false, 0, Math.PI), bronzeMat);
      lid.rotation.z = Math.PI / 2;
      lid.position.set(0, 0, 0.44);
      lid.castShadow = true;
      lidPivot.add(lid);
      chestGroup.add(lidPivot);

      const chestGlow = markIgnoreAO(new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.softParticleTex,
        color: 0xffcc55,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      })));
      chestGlow.position.set(0, 1.15, 0);
      chestGlow.scale.set(2.1, 2.1, 1);
      chestGroup.add(chestGlow);
      root.add(chestGroup);
      room.colliders.push({ x: cx, z: cz, r: 0.95 });

      const inter = {
        kind: 'vault_chest',
        room,
        x: cx,
        z: cz,
        used: false,
        label: '[F] OPEN GILDED RELIQUARY',
        lidPivot,
        glow: chestGlow
      };
      interactables.push(inter);
      room.interactables.push(inter);

      spawnDestructible(room, cx - 5.2, cz - 4.2, 'urn');
      spawnDestructible(room, cx + 5.2, cz - 4.2, 'urn');
      spawnDestructible(room, cx - 5.2, cz + 4.2, 'barrel');
    } else if (room.type === 'sanctuary') {
      const fontGroup = new THREE.Group();
      fontGroup.position.set(cx - 2.6, 0, cz);
      const fPed = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 1.1, 10), capMat);
      fPed.position.y = 0.55;
      fPed.castShadow = true;
      fontGroup.add(fPed);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.45, 0.45, 14), bronzeMat);
      basin.position.y = 1.25;
      basin.castShadow = true;
      fontGroup.add(basin);
      const waterPool = new THREE.Mesh(
        new THREE.CircleGeometry(0.92, 16),
        new THREE.MeshStandardMaterial({
          color: 0x2bd9b2,
          emissive: 0x1ca888,
          emissiveIntensity: 1.35,
          roughness: 0.18,
          metalness: 0.1
        })
      );
      waterPool.rotation.x = -Math.PI / 2;
      waterPool.position.y = 1.48;
      fontGroup.add(waterPool);
      root.add(fontGroup);
      room.colliders.push({ x: cx - 2.6, z: cz, r: 0.95 });

      interactables.push({
        kind: 'healing_font',
        room,
        x: cx - 2.6,
        z: cz,
        used: false,
        label: '[F] DRINK SACRED SPRING (FULL HEAL + ELIXIR)',
        waterPool
      });

      const pactGroup = new THREE.Group();
      pactGroup.position.set(cx + 2.6, 0, cz);
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.15, 1.0), darkIronMat);
      pBase.position.y = 0.575;
      pBase.castShadow = true;
      pactGroup.add(pBase);
      const pCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xff1133, emissiveIntensity: 2.2, roughness: 0.25 })
      );
      pCrystal.position.y = 1.65;
      pactGroup.add(pCrystal);
      root.add(pactGroup);
      room.colliders.push({ x: cx + 2.6, z: cz, r: 0.92 });

      interactables.push({
        kind: 'blood_pact',
        room,
        x: cx + 2.6,
        z: cz,
        used: false,
        label: '[F] BLOOD PACT (-25% HP FOR ANCIENT RELIC + +20% DMG)',
        crystal: pCrystal
      });

      const sAnvil = new THREE.Group();
      sAnvil.position.set(cx, 0, cz + 4.2);
      const saPed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.1), capMat);
      saPed.position.y = 0.275;
      saPed.castShadow = true;
      sAnvil.add(saPed);
      const saBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 0.62), darkIronMat);
      saBody.position.y = 0.80;
      saBody.castShadow = true;
      sAnvil.add(saBody);
      const saRune = markIgnoreAO(new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.28),
        new THREE.MeshBasicMaterial({
          map: tex.trapGlowTex,
          color: 0xff8822,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      ));
      saRune.rotation.x = -Math.PI / 2;
      saRune.position.y = 1.07;
      sAnvil.add(saRune);
      root.add(sAnvil);
      room.colliders.push({ x: cx, z: cz + 4.2, r: 0.88 });
      interactables.push({
        kind: 'forge_anvil',
        room,
        x: cx,
        z: cz + 4.2,
        used: false,
        cost: 30,
        uses: 0,
        label: '[F] TEMPER GREATSWORD (30 CINDERS: +20% DMG & +15 MAX HP)'
      });
    } else if (room.type === 'boss') {
      [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]].forEach(([ox, oz]) => {
        spawnColumn(root, cx + ox, cz + oz, 7.8);
        room.colliders.push({ x: cx + ox, z: cz + oz, r: 0.95 });
      });

      const rose = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.20, 10, 28), bronzeMat);
      rose.position.set(cx, 7.6, cz - halfD + 0.6);
      root.add(rose);
      for (let s = 0; s < 6; s++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 4.7, 0.10), bronzeMat);
        bar.position.set(cx, 7.6, cz - halfD + 0.6);
        bar.rotation.z = (s * Math.PI) / 6;
        root.add(bar);
      }
    }

    // 3. BUILD EXACT FLUSH CORRIDORS (span strictly between zTop..zBot / xLeft..xRight -> ZERO coplanar Z-fighting!)
    for (const d of DIRS) {
      const nb = room.doors[d.key];
      if (!nb) continue;
      const pairKey = room.id < nb.id ? `${room.id}-${nb.id}` : `${nb.id}-${room.id}`;
      if (builtCorridorKeys.has(pairKey)) continue;
      builtCorridorKeys.add(pairKey);

      if (d.dx === 0) {
        const northR = room.cz < nb.cz ? room : nb;
        const southR = room.cz < nb.cz ? nb : room;
        const zTop = northR.cz + northR.halfD;
        const zBot = southR.cz - southR.halfD;
        const span = Math.max(0.1, zBot - zTop);
        const midZ = (zTop + zBot) * 0.5;
        const corrX = room.cx;

        const cGeo = new THREE.PlaneGeometry(CORRIDOR_HALF_W * 2, span);
        cGeo.setAttribute('uv2', cGeo.attributes.uv);
        const cf = new THREE.Mesh(cGeo, floorMat);
        cf.rotation.x = -Math.PI / 2;
        cf.position.set(corrX, 0, midZ);
        cf.receiveShadow = true;
        root.add(cf);
        floorMeshes.push(cf);

        buildWallRun(corrX - CORRIDOR_HALF_W, zTop, corrX - CORRIDOR_HALF_W, zBot, 3.8);
        buildWallRun(corrX + CORRIDOR_HALF_W, zTop, corrX + CORRIDOR_HALF_W, zBot, 3.8);

        corridors.push({
          minX: corrX - GATE_HALF_W,
          maxX: corrX + GATE_HALF_W,
          minZ: zTop - 0.8,
          maxZ: zBot + 0.8
        });
      } else {
        const westR = room.cx < nb.cx ? room : nb;
        const eastR = room.cx < nb.cx ? nb : room;
        const xLeft = westR.cx + westR.halfW;
        const xRight = eastR.cx - eastR.halfW;
        const span = Math.max(0.1, xRight - xLeft);
        const midX = (xLeft + xRight) * 0.5;
        const corrZ = room.cz;

        const cGeo = new THREE.PlaneGeometry(span, CORRIDOR_HALF_W * 2);
        cGeo.setAttribute('uv2', cGeo.attributes.uv);
        const cf = new THREE.Mesh(cGeo, floorMat);
        cf.rotation.x = -Math.PI / 2;
        cf.position.set(midX, 0, corrZ);
        cf.receiveShadow = true;
        root.add(cf);
        floorMeshes.push(cf);

        buildWallRun(xLeft, corrZ - CORRIDOR_HALF_W, xRight, corrZ - CORRIDOR_HALF_W, 3.8);
        buildWallRun(xLeft, corrZ + CORRIDOR_HALF_W, xRight, corrZ + CORRIDOR_HALF_W, 2.8);

        corridors.push({
          minX: xLeft - 0.8,
          maxX: xRight + 0.8,
          minZ: corrZ - GATE_HALF_W,
          maxZ: corrZ + GATE_HALF_W
        });
      }
    }

    // Iron Portcullis Gates (hidden completely when open so sunken bars never poke into planar reflection!)
    if (room.type === 'combat' || room.type === 'elite' || room.type === 'boss') {
      for (const d of DIRS) {
        if (!room.doors[d.key]) continue;
        const gx = cx + d.dx * halfW;
        const gz = cz + d.dz * halfD;
        const gateGroup = new THREE.Group();
        gateGroup.position.set(gx, -4.2, gz);
        gateGroup.visible = false;
        if (d.dx !== 0) gateGroup.rotation.y = Math.PI / 2;

        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W * 2, 0.28, 0.24), bronzeMat);
        topBeam.position.y = 3.4;
        gateGroup.add(topBeam);
        for (let b = -4; b <= 4; b++) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.5, 8), darkIronMat);
          bar.position.set(b * 0.54, 1.7, 0);
          bar.castShadow = true;
          gateGroup.add(bar);
        }
        root.add(gateGroup);
        gates.push({ room, dir: d, x: gx, z: gz, mesh: gateGroup });
      }
    }
  }

  // 4. PERSISTENT SCORCH & BLOOD-ASH DECAL SYSTEM (ignored by GTAO + circular border fade + visible=false until spawned!)
  const maxDecals = 90;
  const decalMeshes = [];
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < maxDecals; i++) {
    const m = markIgnoreAO(new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: tex.decalTex,
      color: 0x1c080b,
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
    root.add(m);
    decalMeshes.push(m);
  }
  let decalCursor = 0;

  function addFloorDecal(x, z, colorHex = 0x22070b, size = 1.6, opacity = 0.52) {
    const m = decalMeshes[decalCursor];
    decalCursor = (decalCursor + 1) % maxDecals;
    m.position.set(x, 0.018 + (decalCursor % 6) * 0.0008, z);
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.set(size, size, 1);
    m.material.color.setHex(colorHex);
    m.material.opacity = opacity;
    m.visible = true;
  }

  // 5. EXACT DUNGEON WALKABILITY & COLLISION SOLVER
  function isPointWalkable(x, z, pad = 0.42) {
    for (const r of rooms) {
      const inX = x >= r.cx - r.halfW + pad && x <= r.cx + r.halfW - pad;
      const inZ = z >= r.cz - r.halfD + pad && z <= r.cz + r.halfD - pad;
      if (inX && inZ) return true;
      if (!r.locked) {
        if (r.doors.N && Math.abs(x - r.cx) <= GATE_HALF_W - pad && z >= r.cz - r.halfD - 1.0 && z <= r.cz - r.halfD + 1.0) return true;
        if (r.doors.S && Math.abs(x - r.cx) <= GATE_HALF_W - pad && z >= r.cz + r.halfD - 1.0 && z <= r.cz + r.halfD + 1.0) return true;
        if (r.doors.W && Math.abs(z - r.cz) <= GATE_HALF_W - pad && x >= r.cx - r.halfW - 1.0 && x <= r.cx - r.halfW + 1.0) return true;
        if (r.doors.E && Math.abs(z - r.cz) <= GATE_HALF_W - pad && x >= r.cx + r.halfW - 1.0 && x <= r.cx + r.halfW + 1.0) return true;
      }
    }
    for (const c of corridors) {
      if (x >= c.minX + pad && x <= c.maxX - pad && z >= c.minZ + pad && z <= c.maxZ - pad) {
        let blockedByGate = false;
        for (const g of gates) {
          if (!g.room.locked) continue;
          if (Math.hypot(x - g.x, z - g.z) < 2.2) {
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

  function findRoomAt(x, z) {
    for (const r of rooms) {
      if (Math.abs(x - r.cx) <= r.halfW - 0.6 && Math.abs(z - r.cz) <= r.halfD - 0.6) {
        return r;
      }
    }
    return null;
  }

  // FIXED TRUE MIRROR PLANAR REFLECTION:
  // Previously `lookAt` with inverted `up` flipped the camera X-axis, causing every reflection to move OPPOSITE to the camera horizontally!
  // Now we apply horizontal projection flip (`elements[0] *= -1`, `elements[8] *= -1`, `elements[12] *= -1`) + frontFace CW reversal
  // exactly like Three.js Reflector so puddle reflections align 1:1 with objects right above them!
  function renderPlanarReflection(renderer, camera) {
    camera.updateMatrixWorld();
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
    // Flip X in projection so mirrored camera UVs match world X directly instead of sliding backward when walking!
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

    // Oblique near-plane clip at y = 0.02
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
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const prevTarget = renderer.getRenderTarget();
    const gl = renderer.getContext();
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    // Reversing projection X reverses triangle winding in clip space; flip frontFace during reflection pass so backfaces stay culled properly!
    gl.frontFace(gl.CW);
    renderer.render(scene, reflCamera);
    gl.frontFace(gl.CCW);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    for (const fm of floorMeshes) fm.visible = true;
  }

  return {
    root,
    rooms,
    corridors,
    gates,
    allBraziers,
    allTraps,
    destructibles,
    interactables,
    floorUniforms,
    addFloorDecal,
    isPointWalkable,
    resolveMovement,
    findRoomAt,
    renderPlanarReflection,
    dispose() {
      for (const pl of dynamicPointLights) scene.remove(pl);
      scene.remove(root);
      reflRT.dispose();
    },
    update(time, dt, heroX, heroZ, heroSpeed = 0) {
      floorUniforms.uTime.value = time;
      floorUniforms.uHeroPos.value.set(heroX, 0, heroZ);
      const targetWake = Math.min(1.0, heroSpeed * 0.18);
      floorUniforms.uWakeStrength.value += (targetWake - floorUniforms.uWakeStrength.value) * Math.min(1, dt * 6.0);

      // Smooth, non-popping brazier light allocation:
      // Rank braziers by distance; keep existing bound braziers fading smoothly before recycling a slot!
      const ranked = [...allBraziers].sort(
        (a, b) => ((a.x - heroX) ** 2 + (a.z - heroZ) ** 2) - ((b.x - heroX) ** 2 + (b.z - heroZ) ** 2)
      );
      const desiredSet = new Set(ranked.slice(0, 8).filter((b) => Math.hypot(b.x - heroX, b.z - heroZ) < 28));

      // Fade weights smoothly
      for (const slot of lightSlots) {
        if (!slot.brazier) continue;
        const b = slot.brazier;
        const d = Math.hypot(b.x - heroX, b.z - heroZ);
        const distAtten = Math.max(0, Math.min(1, (26.0 - d) / 8.0));
        const targetW = desiredSet.has(b) ? distAtten : 0.0;
        b.fadeWeight += (targetW - b.fadeWeight) * Math.min(1, dt * 4.5);
        if (!desiredSet.has(b) && b.fadeWeight < 0.015) {
          b.fadeWeight = 0;
          b.slotIndex = -1;
          slot.brazier = null;
          slot.light.intensity = 0;
        }
      }

      // Assign any unassigned desired braziers to free slots
      for (const b of desiredSet) {
        if (b.slotIndex !== -1) continue;
        const freeIdx = lightSlots.findIndex((s) => s.brazier === null);
        if (freeIdx !== -1) {
          b.slotIndex = freeIdx;
          b.fadeWeight = 0.02;
          lightSlots[freeIdx].brazier = b;
        }
      }

      // Gentle calm firelight breathe (slowed ~3x from 23 rad/s -> 4.2 & 7.5 rad/s so lights never look twitchy!)
      for (const slot of lightSlots) {
        const pl = slot.light;
        const b = slot.brazier;
        if (b) {
          const flick = Math.sin(time * 4.2 + b.phase) * 0.55 + Math.sin(time * 7.6 + b.phase * 1.7) * 0.25;
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

      // Animate Portcullis Gates (hide mesh completely once retracted below floor)
      for (const g of gates) {
        if (g.room.locked) g.mesh.visible = true;
        const targetY = g.room.locked ? 0.0 : -4.2;
        g.mesh.position.y += (targetY - g.mesh.position.y) * Math.min(1, dt * 9.5);
        if (!g.room.locked && g.mesh.position.y < -3.9) {
          g.mesh.visible = false;
        }
      }

      // Animate Spike Traps cleanly
      for (const tr of allTraps) {
        const t = (time + tr.phase) % tr.cycle;
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
          tr.spikesGroup.position.y = -0.62; // tips peek right inside socket mouths
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
}
