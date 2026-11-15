import * as THREE from 'three';

export const ARENA_RADIUS = 13.6;

export function buildArena(scene, tex, isMobile = false) {
  const root = new THREE.Group();
  scene.add(root);

  const colliders = []; // { x, z, r }
  const braziers = [];  // animated fire sources
  const swingingChains = [];

  const makeStoneMat = (repU, repV, tint = 0xffffff, roughBias = 1.0) => {
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
      aoMapIntensity: 1.2,
      roughnessMap: orm,
      roughness: roughBias,
      metalnessMap: orm,
      metalness: 0.08,
      normalMap: nrm,
      normalScale: new THREE.Vector2(1.55, 1.55)
    });
  };

  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xc4944e,
    roughnessMap: tex.metalORM,
    roughness: 0.30,
    metalness: 0.93,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.85, 0.85)
  });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x323842,
    roughnessMap: tex.metalORM,
    roughness: 0.38,
    metalness: 0.89,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(1.1, 1.1)
  });

  // 1. EXPLICIT FEEDBACK-FREE PLANAR REFLECTION TARGET + WET BASALT PUDDLE FLOOR
  const rtSize = isMobile ? 384 : 640;
  const reflRT = new THREE.WebGLRenderTarget(rtSize, rtSize, {
    type: THREE.HalfFloatType,
    depthBuffer: true
  });
  const reflCamera = new THREE.PerspectiveCamera();
  const reflMatrix = new THREE.Matrix4();
  const clipPlane = new THREE.Vector4();
  const qVec = new THREE.Vector4();
  const reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const floorDiameter = 32.0;
  const floorGeo = new THREE.CircleGeometry(floorDiameter * 0.5, 96);
  floorGeo.setAttribute('uv2', floorGeo.attributes.uv);
  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.floorAlbedo,
    aoMap: tex.floorORM,
    aoMapIntensity: 1.28,
    roughnessMap: tex.floorORM,
    roughness: 1.0,
    metalnessMap: tex.floorORM,
    metalness: 1.0,
    normalMap: tex.floorNormal,
    normalScale: new THREE.Vector2(1.75, 1.75),
    envMapIntensity: 1.35
  });

  const floorUniforms = {
    uReflectTex: { value: reflRT.texture },
    uReflectMatrix: { value: reflMatrix },
    uPuddleMask: { value: tex.puddleMask },
    uRippleNormal: { value: tex.rippleNormal },
    uSealTex: { value: tex.sealTex },
    uSealGlow: { value: 0.55 },
    uSealColor: { value: new THREE.Color(0xff7a22) },
    uTime: { value: 0 }
  };

  floorMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform mat4 uReflectMatrix;
         varying vec4 vReflectUv;
         varying vec2 vFloorUv;
         varying vec3 vWorldPosFloor;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vFloorUv = uv;
         vec4 wp = modelMatrix * vec4(position, 1.0);
         vWorldPosFloor = wp.xyz;
         vReflectUv = uReflectMatrix * wp;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uReflectTex;
         uniform sampler2D uPuddleMask;
         uniform sampler2D uRippleNormal;
         uniform sampler2D uSealTex;
         uniform float uSealGlow;
         uniform vec3 uSealColor;
         uniform float uTime;
         varying vec4 vReflectUv;
         varying vec2 vFloorUv;
         varying vec3 vWorldPosFloor;

         // Procedural raindrop impact rings on puddles
         vec2 rainRipple(vec2 p, float t) {
           vec2 cell = floor(p);
           vec2 f = fract(p) - 0.5;
           float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
           float life = fract(t * 0.85 + rnd);
           vec2 center = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.45;
           vec2 d = f - center;
           float r = length(d);
           float ring = sin((r - life * 0.42) * 52.0) * exp(-r * 9.0) * (1.0 - life) * smoothstep(0.0, 0.06, r);
           return (r > 0.001 ? d / r : vec2(0.0)) * ring;
         }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         float puddleAmt = texture2D(uPuddleMask, vFloorUv).r;
         vec2 rUv1 = vWorldPosFloor.xz * 0.32 + vec2(uTime * 0.018, uTime * 0.013);
         vec2 rUv2 = vWorldPosFloor.xz * 0.47 - vec2(uTime * 0.014, uTime * 0.021);
         vec3 ripN = normalize(
           (texture2D(uRippleNormal, rUv1).xyz * 2.0 - 1.0) +
           (texture2D(uRippleNormal, rUv2).xyz * 2.0 - 1.0)
         );
         vec2 drops = rainRipple(vWorldPosFloor.xz * 1.35, uTime) + rainRipple(vWorldPosFloor.xz * 1.9 + 4.2, uTime * 1.15);
         vec3 waterN = normalize(vec3(ripN.xy * 0.14 + drops * 0.32, 1.0));
         vec3 worldWaterN = normalize(mat3(viewMatrix) * vec3(waterN.x, 1.0, waterN.y));
         normal = normalize(mix(normal, worldWaterN, smoothstep(0.32, 0.82, puddleAmt)));`
      )
      .replace(
        '#include <dithering_fragment>',
        `float puddle = texture2D(uPuddleMask, vFloorUv).r;
         if (puddle > 0.06 && vReflectUv.w > 0.0) {
           vec2 dropsR = rainRipple(vWorldPosFloor.xz * 1.35, uTime) * 0.025;
           vec2 rOff = ((texture2D(uRippleNormal, vWorldPosFloor.xz * 0.38 + uTime * 0.02).xy * 2.0 - 1.0) * 0.028 + dropsR) * puddle;
           vec4 projUv = vReflectUv;
           projUv.xy += rOff * projUv.w;
           vec3 reflCol = texture2DProj(uReflectTex, projUv).rgb;
           vec3 viewDirW = normalize(cameraPosition - vWorldPosFloor);
           float fresnel = 0.12 + 0.88 * pow(clamp(1.0 - max(dot(viewDirW, vec3(0.0, 1.0, 0.0)), 0.0), 0.0, 1.0), 3.1);
           float reflMix = clamp(puddle * fresnel * 0.96, 0.0, 0.86);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, reflCol * 0.96, reflMix);
         }
         vec4 sealSample = texture2D(uSealTex, vFloorUv);
         float pulse = 0.82 + 0.18 * sin(uTime * 2.4);
         gl_FragColor.rgb += sealSample.rgb * sealSample.a * uSealColor * uSealGlow * pulse;
         #include <dithering_fragment>`
      );
  };

  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  function renderPlanarReflection(renderer, camera) {
    // Mirror main camera across y = 0 plane
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

    // Texture projection matrix from world space -> [0..1] reflection UV
    reflMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    reflMatrix.multiply(reflCamera.projectionMatrix);
    reflMatrix.multiply(reflCamera.matrixWorldInverse);

    // Oblique near-plane clipping at y = 0 so nothing below floor leaks into reflection
    reflPlane.set(new THREE.Vector3(0, 1, 0), 0.02);
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

    // Hide floorMesh so reflRT is NEVER sampled while bound as framebuffer!
    floorMesh.visible = false;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, reflCamera);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    floorMesh.visible = true;
  }

  // 2. STEPPED CURB RING & LOW CRENELLATED PARAPET
  const curbMat = makeStoneMat(20, 2, 0x7c838f, 0.86);
  const curbGeo = new THREE.RingGeometry(ARENA_RADIUS + 0.1, ARENA_RADIUS + 2.3, 64, 1);
  curbGeo.setAttribute('uv2', curbGeo.attributes.uv);
  const curb = new THREE.Mesh(curbGeo, curbMat);
  curb.rotation.x = -Math.PI / 2;
  curb.position.y = 0.22;
  curb.receiveShadow = true;
  curb.castShadow = true;
  root.add(curb);

  const rimWall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS + 0.12, ARENA_RADIUS + 0.2, 0.45, 64, 1, true),
    makeStoneMat(24, 1, 0x626975, 0.9)
  );
  rimWall.position.y = 0.08;
  rimWall.receiveShadow = true;
  root.add(rimWall);

  const blockMat = makeStoneMat(2, 1, 0x6e7582, 0.88);
  const blockGeo = new THREE.BoxGeometry(1.65, 0.82, 0.95);
  for (let i = 0; i < 32; i++) {
    const ang = (i / 32) * Math.PI * 2;
    if (Math.sin(ang) < -0.94) continue; // North Cathedral Sanctum Gate opening
    const b = new THREE.Mesh(blockGeo, blockMat);
    const r = ARENA_RADIUS + 0.85;
    b.position.set(Math.cos(ang) * r, 0.56 + ((i % 3) - 1) * 0.04, Math.sin(ang) * r);
    b.rotation.y = -ang + Math.PI / 2 + ((i % 2) - 0.5) * 0.03;
    b.castShadow = true;
    b.receiveShadow = true;
    root.add(b);
  }

  // 3. TWELVE COLOSSAL GOTHIC COLONNADE PILLARS, ARCHES & HANGING CENSER CHAINS
  const pillarMat = makeStoneMat(2, 6, 0x808794, 0.84);
  const capMat = makeStoneMat(2, 1, 0x9098a6, 0.8);
  const colCount = 12;
  const colRadius = ARENA_RADIUS + 1.55;

  for (let i = 0; i < colCount; i++) {
    const ang = (i / colCount) * Math.PI * 2;
    const px = Math.cos(ang) * colRadius;
    const pz = Math.sin(ang) * colRadius;

    const colGroup = new THREE.Group();
    colGroup.position.set(px, 0, pz);
    colGroup.rotation.y = -ang;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.15, 1.75), capMat);
    plinth.position.y = 0.57;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    colGroup.add(plinth);

    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.88, 0.36, 16), capMat);
    baseRing.position.y = 1.32;
    baseRing.castShadow = true;
    colGroup.add(baseRing);

    const isBroken = (i === 2 || i === 5);
    const shaftH = isBroken ? (4.4 + (i % 2) * 1.0) : 7.6;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, shaftH, 16), pillarMat);
    shaft.position.y = 1.5 + shaftH * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    colGroup.add(shaft);

    for (let k = 0; k < 4; k++) {
      const ka = (k * Math.PI) / 2 + Math.PI / 4;
      const sub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, shaftH * 0.98, 10), pillarMat);
      sub.position.set(Math.cos(ka) * 0.50, 1.5 + shaftH * 0.49, Math.sin(ka) * 0.50);
      sub.castShadow = true;
      colGroup.add(sub);
    }

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.18, 16), bronzeMat);
    band.position.y = 3.6;
    colGroup.add(band);

    if (!isBroken) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.62, 0.68, 12), capMat);
      cap.position.y = 1.5 + shaftH + 0.32;
      cap.castShadow = true;
      colGroup.add(cap);

      const abacus = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.34, 1.85), capMat);
      abacus.position.y = 1.5 + shaftH + 0.80;
      abacus.castShadow = true;
      colGroup.add(abacus);

      // Exterior flying buttress fin
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(1.8, 5.2, 0.55), pillarMat);
      buttress.position.set(1.2, 4.2, 0);
      buttress.rotation.z = 0.26;
      buttress.castShadow = true;
      colGroup.add(buttress);
    }
    root.add(colGroup);

    const nextIdx = (i + 1) % colCount;
    const nextBroken = (nextIdx === 2 || nextIdx === 5);
    if (!isBroken && !nextBroken) {
      const nextAng = (nextIdx / colCount) * Math.PI * 2;
      const nx = Math.cos(nextAng) * colRadius;
      const nz = Math.sin(nextAng) * colRadius;
      const mx = (px + nx) * 0.5;
      const mz = (pz + nz) * 0.5;
      const span = Math.hypot(nx - px, nz - pz);

      const archGroup = new THREE.Group();
      archGroup.position.set(mx, 9.95, mz);
      archGroup.lookAt(nx, 9.95, nz);

      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, span), pillarMat);
      beam.castShadow = true;
      archGroup.add(beam);

      const ribL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, span * 0.56), capMat);
      ribL.position.set(0, -0.75, -span * 0.22);
      ribL.rotation.x = -0.38;
      archGroup.add(ribL);

      const ribR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, span * 0.56), capMat);
      ribR.position.set(0, -0.75, span * 0.22);
      ribR.rotation.x = 0.38;
      archGroup.add(ribR);

      // Swinging iron censer chain from arch crown
      const chainPivot = new THREE.Group();
      chainPivot.position.set(0, -0.85, 0);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.8, 6), darkIronMat);
      rod.position.y = -1.4;
      chainPivot.add(rod);
      const censer = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), bronzeMat);
      censer.position.y = -2.85;
      chainPivot.add(censer);
      archGroup.add(chainPivot);
      swingingChains.push({ pivot: chainPivot, phase: i * 1.3 });

      root.add(archGroup);
    }
  }

  // 4. GRAND NORTH SANCTUM GATE & GUARDIAN KNIGHT MONOLITHS (focal backdrop at z = -15.5)
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, 0, -15.2);
  root.add(gateGroup);

  [-2.6, 2.6].forEach((gx) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 11.5, 1.8), pillarMat);
    jamb.position.set(gx, 5.75, 0);
    jamb.castShadow = true;
    jamb.receiveShadow = true;
    gateGroup.add(jamb);

    // Guardian Sentinel Statue on pedestal
    const sPed = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 1.3), capMat);
    sPed.position.set(gx * 0.72, 0.9, 1.15);
    sPed.castShadow = true;
    gateGroup.add(sPed);

    const sBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.1, 8), capMat);
    sBody.position.set(gx * 0.72, 2.85, 1.15);
    sBody.castShadow = true;
    gateGroup.add(sBody);

    const sHead = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 7), capMat);
    sHead.position.set(gx * 0.72, 4.15, 1.15);
    gateGroup.add(sHead);

    const sSword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.04), bronzeMat);
    sSword.position.set(gx * 0.72, 2.4, 1.62);
    gateGroup.add(sSword);
  });

  const gable = new THREE.Mesh(new THREE.ConeGeometry(4.4, 4.5, 4), pillarMat);
  gable.position.set(0, 13.4, 0);
  gable.rotation.y = Math.PI / 4;
  gateGroup.add(gable);

  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.16, 10, 28), bronzeMat);
  roseRing.position.set(0, 9.6, 0.4);
  gateGroup.add(roseRing);
  for (let r = 0; r < 6; r++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 0.08), bronzeMat);
    spoke.position.set(0, 9.6, 0.4);
    spoke.rotation.z = (r * Math.PI) / 6;
    gateGroup.add(spoke);
  }

  // 5. FOUR INNER TACTICAL RELIQUARY OBELISKS
  const innerAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  const innerDist = 7.4;
  innerAngles.forEach((ang, idx) => {
    const ix = Math.cos(ang) * innerDist;
    const iz = Math.sin(ang) * innerDist;
    const g = new THREE.Group();
    g.position.set(ix, 0, iz);
    g.rotation.y = -ang + 0.3;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.08, 0.55, 8), capMat);
    base.position.y = 0.275;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const h = idx % 2 === 0 ? 2.85 : 2.15;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.76, h, 8), pillarMat);
    body.position.y = 0.55 + h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.06, 8, 16), bronzeMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 1.25;
    g.add(trim);

    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.65, 7), capMat);
    shard.position.y = 0.55 + h + 0.24;
    shard.rotation.z = 0.18;
    shard.castShadow = true;
    g.add(shard);

    root.add(g);
    colliders.push({ x: ix, z: iz, r: 1.02 });
  });

  // 6. SIX ORNATE IRON FIRE BRAZIERS
  const brazierCount = 6;
  const brazierDist = 11.55;
  const emberCoreMat = new THREE.MeshStandardMaterial({
    color: 0x220800,
    emissive: 0xff5500,
    emissiveIntensity: 3.6,
    roughness: 0.9
  });

  for (let i = 0; i < brazierCount; i++) {
    const ang = (i / brazierCount) * Math.PI * 2 + Math.PI / 6;
    const bx = Math.cos(ang) * brazierDist;
    const bz = Math.sin(ang) * brazierDist;

    const bg = new THREE.Group();
    bg.position.set(bx, 0, bz);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.85, 8), capMat);
    ped.position.y = 0.425;
    ped.castShadow = true;
    ped.receiveShadow = true;
    bg.add(ped);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.75, 8), darkIronMat);
    stem.position.y = 1.15;
    stem.castShadow = true;
    bg.add(stem);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.32, 0.46, 12), darkIronMat);
    bowl.position.y = 1.62;
    bowl.castShadow = true;
    bg.add(bowl);

    const goldRim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 8, 20), bronzeMat);
    goldRim.rotation.x = Math.PI / 2;
    goldRim.position.y = 1.84;
    bg.add(goldRim);

    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.50, 12, 8), emberCoreMat);
    coals.scale.set(1, 0.42, 1);
    coals.position.y = 1.78;
    bg.add(coals);

    const flameSprites = [];
    for (let f = 0; f < 3; f++) {
      const smat = new THREE.SpriteMaterial({
        map: tex.softParticleTex,
        color: f === 0 ? 0xffaa33 : (f === 1 ? 0xff5511 : 0xffdd88),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: f === 2 ? 0.88 : 0.68
      });
      const sp = new THREE.Sprite(smat);
      const sz = f === 0 ? 1.65 : (f === 1 ? 1.22 : 0.72);
      sp.scale.set(sz * 0.75, sz * 1.38, 1);
      sp.position.set(0, 2.18 + f * 0.14, 0);
      bg.add(sp);
      flameSprites.push({ sp, baseY: sp.position.y, sz, phase: i * 1.7 + f * 2.1 });
    }

    const light = new THREE.PointLight(0xff7b29, 8.2, 14.5, 1.75);
    light.position.set(0, 2.5, 0);
    bg.add(light);

    root.add(bg);
    colliders.push({ x: bx, z: bz, r: 0.78 });
    braziers.push({ x: bx, y: 2.05, z: bz, light, flameSprites, phase: i * 1.37 });
  }

  // 7. SCATTERED STONE RUBBLE
  const rubbleGeo = new THREE.DodecahedronGeometry(0.28, 1);
  const rubbleInst = new THREE.InstancedMesh(rubbleGeo, capMat, 68);
  rubbleInst.castShadow = true;
  rubbleInst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 68; i++) {
    const a = (i / 68) * Math.PI * 2 + Math.sin(i * 12.7) * 0.18;
    const rr = i < 48 ? (ARENA_RADIUS - 0.85 + (i % 5) * 0.25) : (7.4 + ((i % 4) - 1.5) * 0.65);
    const ang = i < 48 ? a : innerAngles[i % 4] + (i % 7) * 0.12;
    const dist = i < 48 ? rr : (innerDist + 0.95 + (i % 3) * 0.22);
    dummy.position.set(Math.cos(ang) * dist, 0.08 + (i % 3) * 0.04, Math.sin(ang) * dist);
    dummy.rotation.set(i * 1.1, i * 2.3, i * 0.7);
    dummy.scale.set(0.55 + (i % 5) * 0.24, 0.35 + (i % 3) * 0.18, 0.5 + ((i + 2) % 4) * 0.22);
    dummy.updateMatrix();
    rubbleInst.setMatrixAt(i, dummy.matrix);
  }
  root.add(rubbleInst);

  // 8. DISTANT GOTHIC SPIRES & FULL MOON ORB IN NIGHT SKY
  const spireMat = new THREE.MeshBasicMaterial({ color: 0x0b101a });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.15;
    const dist = 34 + (i % 3) * 8;
    const h = 14 + (i % 4) * 5;
    const sg = new THREE.Group();
    sg.position.set(Math.cos(a) * dist, -4, Math.sin(a) * dist);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.8, h, 3.8), spireMat);
    tower.position.y = h * 0.5;
    sg.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7.5, 4), spireMat);
    roof.position.y = h + 3.75;
    roof.rotation.y = Math.PI / 4;
    sg.add(roof);
    root.add(sg);
  }

  // Glowing cold moon visible inside puddle reflections!
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.softParticleTex,
    color: 0xb8d4ff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.85,
    fog: false
  }));
  moonGlow.position.set(-18, 28, -24);
  moonGlow.scale.set(14, 14, 1);
  root.add(moonGlow);

  // 9. VOLUMETRIC MOONLIGHT GOD-RAYS
  const rayMat = new THREE.MeshBasicMaterial({
    map: tex.godrayTex,
    color: 0x7ba7ff,
    transparent: true,
    opacity: 0.085,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rays = [];
  [[-3.5, 11.5, -2.5], [2.8, 12.0, 1.8], [0.0, 12.5, -0.5]].forEach(([rx, ry, rz], idx) => {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 4.4, 22, 20, 1, true), rayMat.clone());
    cone.position.set(rx, ry - 2.0, rz);
    cone.rotation.z = -0.34;
    cone.rotation.x = 0.24;
    root.add(cone);
    rays.push({ mesh: cone, baseOp: 0.068 + idx * 0.012, phase: idx * 1.9 });
  });

  // 10. CENTRAL RELIQUARY SHRINE PEDESTAL
  const shrine = new THREE.Group();
  shrine.position.set(0, -2.4, 0);
  const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 1.35, 8), capMat);
  sBase.position.y = 0.675;
  sBase.castShadow = true;
  shrine.add(sBase);

  const sRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.065, 10, 24), bronzeMat);
  sRing.rotation.x = Math.PI / 2;
  sRing.position.y = 1.36;
  shrine.add(sRing);

  const relicCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xff8811, emissiveIntensity: 3.0, roughness: 0.15, metalness: 0.3 })
  );
  relicCrystal.position.y = 2.05;
  shrine.add(relicCrystal);

  const relicHalo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 32), bronzeMat);
  relicHalo.position.y = 2.05;
  shrine.add(relicHalo);

  const shrineLight = new THREE.PointLight(0xffaa33, 0, 10, 1.6);
  shrineLight.position.y = 2.2;
  shrine.add(shrineLight);
  root.add(shrine);

  return {
    root,
    colliders,
    braziers,
    shrine,
    floorUniforms,
    renderPlanarReflection,
    update(time, dt, shrineActive) {
      floorUniforms.uTime.value = time;
      for (const b of braziers) {
        const flick = Math.sin(time * 11.3 + b.phase) * 0.45 +
                      Math.sin(time * 23.7 + b.phase * 2.1) * 0.30 +
                      Math.cos(time * 6.1 + b.phase) * 0.25;
        b.light.intensity = 8.2 + flick * 2.0;
        b.light.position.x = Math.sin(time * 9.0 + b.phase) * 0.05;
        b.light.position.z = Math.cos(time * 8.2 + b.phase) * 0.05;
        for (const fs of b.flameSprites) {
          const w = Math.sin(time * 13.0 + fs.phase);
          fs.sp.position.y = fs.baseY + w * 0.06;
          fs.sp.position.x = Math.cos(time * 10.5 + fs.phase) * 0.045;
          fs.sp.scale.x = fs.sz * (0.72 + 0.08 * w);
          fs.sp.scale.y = fs.sz * (1.35 - 0.10 * w);
        }
      }
      for (const ch of swingingChains) {
        ch.pivot.rotation.z = Math.sin(time * 1.15 + ch.phase) * 0.065;
      }
      for (const r of rays) {
        r.mesh.material.opacity = r.baseOp * (0.85 + 0.15 * Math.sin(time * 0.7 + r.phase));
      }
      const targetY = shrineActive ? 0.0 : -2.45;
      shrine.position.y += (targetY - shrine.position.y) * Math.min(1, dt * 4.5);
      const targetInt = shrineActive ? 12.0 : 0.0;
      shrineLight.intensity += (targetInt - shrineLight.intensity) * Math.min(1, dt * 5.0);
      relicCrystal.rotation.y = time * 1.4;
      relicCrystal.position.y = 2.05 + Math.sin(time * 2.6) * 0.10;
      relicHalo.rotation.y = -time * 0.9;
      relicHalo.rotation.x = Math.sin(time * 1.2) * 0.45;
    }
  };
}
