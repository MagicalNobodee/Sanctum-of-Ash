import fs from 'fs';
const p = new URL('./src/dungeon.js', import.meta.url);
let s = fs.readFileSync(p, 'utf8');

const anvilCode = `
    if (room.type === 'start') {
      // Glowing Ashen Forgemaster Anvil in West alcove of Starting Narthex
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
      const emberRune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.36),
        new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0.9 })
      );
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
    }`;

s = s.replace(
  `    if (room.type === 'start') {
      spawnDestructible(room, cx - 5.2, cz - 4.5, 'urn');
      spawnDestructible(room, cx + 5.2, cz - 4.5, 'barrel');
      spawnDestructible(room, cx + 5.8, cz - 3.6, 'urn');
    }`,
  anvilCode
);

fs.writeFileSync(p, s, 'utf8');
console.log('Added Ashen Forgemaster Anvil & extra destructibles to dungeon.js');
