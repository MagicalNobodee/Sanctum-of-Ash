import fs from 'fs';
const p = new URL('./src/actors.js', import.meta.url);
let s = fs.readFileSync(p, 'utf8');

s = s.replaceAll('new THREE.MeshStandardMaterial({', 'new THREE.MeshPhysicalMaterial({ clearcoat: 0.44, clearcoatRoughness: 0.20,');

const stalkerBranch = `
  if (type === 'stalker') {
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.25, 9), mainArmor);
    cloak.position.y = 0.72;
    cloak.rotation.x = 0.18;
    cloak.castShadow = true;
    body.add(cloak);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.42, 8), mainArmor);
    hood.position.set(0, 1.42, 0.08);
    hood.rotation.x = 0.22;
    hood.castShadow = true;
    body.add(hood);

    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.12), glowMat);
    mask.position.set(0, 1.34, 0.19);
    body.add(mask);

    const arm = new THREE.Group();
    arm.position.set(0, 1.05, 0.12);
    body.add(arm);
    [-0.32, 0.32].forEach((sx) => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.90), glowMat);
      blade.position.set(sx, -0.12, 0.44);
      blade.rotation.y = sx * 0.28;
      blade.castShadow = true;
      arm.add(blade);
    });
    return { root, body, arm, leftLeg: null, rightLeg: null, glowMat, flashMats, cfg, stalker: true };
  }
`;

if (!s.includes("if (type === 'stalker')")) {
  s = s.replace("  if (type === 'acolyte') {", stalkerBranch + "\n  if (type === 'acolyte') {");
}

// Add drifting low ground mist sprites around the player in VFXSystem
if (!s.includes('this.mistSprites')) {
  s = s.replace(
    'this.rain = new THREE.Points(rainGeo, rainMat);\n    scene.add(this.rain);',
    `this.rain = new THREE.Points(rainGeo, rainMat);
    scene.add(this.rain);

    this.mistSprites = [];
    for (let i = 0; i < 18; i++) {
      const mm = new THREE.SpriteMaterial({
        map: tex.softParticleTex,
        color: 0x6c88b5,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sp = new THREE.Sprite(mm);
      sp.scale.set(5.5 + (i % 4) * 1.4, 2.2, 1);
      scene.add(sp);
      this.mistSprites.push({
        sp,
        ox: ((i % 6) - 2.5) * 4.8,
        oz: (Math.floor(i / 6) - 1) * 6.5,
        phase: i * 1.4
      });
    }`
  );
  s = s.replace(
    'this.rain.position.set(centerX, 0, centerZ);',
    `this.rain.position.set(centerX, 0, centerZ);
    const nowT = performance.now() * 0.001;
    if (this.mistSprites) {
      for (const m of this.mistSprites) {
        m.sp.position.set(
          centerX + m.ox + Math.sin(nowT * 0.35 + m.phase) * 2.2,
          0.42 + Math.cos(nowT * 0.5 + m.phase) * 0.12,
          centerZ + m.oz + Math.cos(nowT * 0.28 + m.phase) * 2.2
        );
      }
    }`
  );
}

fs.writeFileSync(p, s, 'utf8');
console.log('Successfully patched actors.js');
