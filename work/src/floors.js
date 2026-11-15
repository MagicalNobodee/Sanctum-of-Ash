import * as THREE from 'three';

// 4 Selectable Difficulty Tiers (tuned around satisfying horde combat & endurance, not one-shots)
export const DIFFICULTY_TIERS = [
  {
    id: 'pilgrim',
    zhName: '微光巡礼',
    enName: 'Pilgrim',
    zhBadge: '轻松',
    enBadge: 'RELAXED',
    zhDesc: '怪群适中 · 单波为主 · 适合熟悉职业与神兵手感',
    enDesc: 'Lighter packs · 1-2 waves · Relaxed combat pacing',
    accent: '#7ce8ff',
    spawnMult: 0.85,
    maxCombatWaves: 1,
    maxEliteWaves: 2,
    mobHpMult: 0.78,
    bossHpMult: 0.72,
    enemyDmgMult: 0.85,
    enemySpeedMult: 0.94,
    enemyAtkRateMult: 0.92,
    eliteAdd: -0.02,
    shieldedAdd: -0.02,
    cinderMult: 1.00
  },
  {
    id: 'standard',
    zhName: '圣所誓约',
    enName: 'Covenant',
    zhBadge: '标准',
    enBadge: 'STANDARD',
    zhDesc: '双波增援 · 厚血耐打 · 正反馈拉满的标准爽感体验',
    enDesc: '2-wave reinforcements · Beefy foes & epic bosses',
    accent: '#f5d287',
    spawnMult: 1.08,
    maxCombatWaves: 2,
    maxEliteWaves: 2,
    mobHpMult: 1.15,
    bossHpMult: 1.15,
    enemyDmgMult: 1.15,
    enemySpeedMult: 1.04,
    enemyAtkRateMult: 1.06,
    eliteAdd: 0.05,
    shieldedAdd: 0.04,
    cinderMult: 1.00
  },
  {
    id: 'bloodfire',
    zhName: '血火狂潮',
    enName: 'Bloodfire',
    zhBadge: '爽刷',
    enBadge: 'SURGE',
    zhDesc: '高频三波怪海 · 精英涌现 · 移速攻速强化 · 灵魂 +15%',
    enDesc: '3-wave surges · Faster aggressive elites · +15% Soul Cinders',
    accent: '#ff7b42',
    spawnMult: 1.40,
    maxCombatWaves: 3,
    maxEliteWaves: 3,
    mobHpMult: 1.60,
    bossHpMult: 1.65,
    enemyDmgMult: 1.42,
    enemySpeedMult: 1.13,
    enemyAtkRateMult: 1.18,
    eliteAdd: 0.16,
    shieldedAdd: 0.12,
    cinderMult: 1.15
  },
  {
    id: 'abyssal',
    zhName: '永夜深渊',
    enName: 'Abyssal',
    zhBadge: '狂战',
    enBadge: 'ABYSSAL',
    zhDesc: '满编凶暴怪海 · 狂化双词缀精英与高压首领 · 灵魂 +25%',
    enDesc: 'Relentless fast hordes · Dual-affix elites & lethal bosses · +25% Cinders',
    accent: '#d875ff',
    spawnMult: 1.72,
    maxCombatWaves: 3,
    maxEliteWaves: 3,
    mobHpMult: 2.25,
    bossHpMult: 2.35,
    enemyDmgMult: 1.75,
    enemySpeedMult: 1.22,
    enemyAtkRateMult: 1.32,
    eliteAdd: 0.28,
    shieldedAdd: 0.22,
    cinderMult: 1.25
  }
];

export const DEFAULT_DIFFICULTY_ID = 'standard';
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTY_TIERS.map((d) => [d.id, d]));

export function getDifficultyConfig(diffId) {
  return DIFFICULTY_BY_ID[diffId] || DIFFICULTY_BY_ID[DEFAULT_DIFFICULTY_ID];
}

// 4-Floor Dungeon Progression Config (Scene-agnostic gameplay layer!)
export const FLOOR_CONFIGS = [
  {
    depth: 1,
    roman: 'I',
    name: 'SUNKEN NARTHEX',
    cnName: '第一层 · 淹没前庭',
    subtitle: 'Rain-drowned threshold where hollowed sentinels keep eternal watch',
    hpMult: 1.00,
    bossBaseHp: 15000,
    bossShieldHp: 0,
    dmgMult: 1.00,
    speedMult: 1.00,
    cinderMult: 1.00,
    boonScale: 1.00,
    boonRarityLabel: 'SANCTUM',
    anvilBaseCost: 75,
    anvilStepCost: 55,
    anvilDmgPct: 0.05,
    anvilHpBonus: 8,
    anvilCritBonus: 0.00,
    eliteChance: 0.16,
    shieldedChance: 0.05,
    extraSpawns: 1,
    fogColor: 0x080d18,
    moonTint: 0xa4c6ff,
    bossName: 'MALAKOR VANGUARD, GATEKEEPER OF ASH',
    bossStyle: 'vanguard'
  },
  {
    depth: 2,
    roman: 'II',
    name: 'PUTRID OSSUARY',
    cnName: '第二层 · 腐化骨窖',
    subtitle: 'Acolytes weave twin-orb volleys & volatile husks detonate on death',
    hpMult: 1.80,
    bossBaseHp: 27000,
    bossShieldHp: 4500,
    dmgMult: 1.28,
    speedMult: 1.06,
    cinderMult: 1.35,
    boonScale: 1.00,
    boonRarityLabel: 'EXALTED',
    anvilBaseCost: 105,
    anvilStepCost: 70,
    anvilDmgPct: 0.05,
    anvilHpBonus: 8,
    anvilCritBonus: 0.01,
    eliteChance: 0.34,
    shieldedChance: 0.22,
    extraSpawns: 3,
    fogColor: 0x091314,
    moonTint: 0x86e0c8,
    bossName: 'VESPERA, ARCH-PRELATE OF BLIGHT',
    bossStyle: 'prelate'
  },
  {
    depth: 3,
    roman: 'III',
    name: 'ASHEN FOUNDRY',
    cnName: '第三层 · 熔炉圣殿',
    subtitle: 'Runic-shielded juggernauts & molten shockwaves guard the deep forge',
    hpMult: 3.00,
    bossBaseHp: 42000,
    bossShieldHp: 10500,
    dmgMult: 1.60,
    speedMult: 1.13,
    cinderMult: 1.75,
    boonScale: 1.00,
    boonRarityLabel: 'MYTHIC',
    anvilBaseCost: 140,
    anvilStepCost: 90,
    anvilDmgPct: 0.05,
    anvilHpBonus: 10,
    anvilCritBonus: 0.01,
    eliteChance: 0.52,
    shieldedChance: 0.42,
    extraSpawns: 5,
    fogColor: 0x160b0a,
    moonTint: 0xffb38a,
    bossName: 'IGNIS, THE FURNACE COLOSSUS',
    bossStyle: 'colossus'
  },
  {
    depth: 4,
    roman: 'IV',
    name: 'ABYSSAL THRONE',
    cnName: '第四层 · 无光王座',
    subtitle: 'Twin-affix dread champions & the true Sovereign of Eternal Ash',
    hpMult: 4.65,
    bossBaseHp: 62000,
    bossShieldHp: 17000,
    dmgMult: 1.98,
    speedMult: 1.20,
    cinderMult: 2.25,
    boonScale: 1.00,
    boonRarityLabel: 'SOVEREIGN',
    anvilBaseCost: 180,
    anvilStepCost: 115,
    anvilDmgPct: 0.05,
    anvilHpBonus: 12,
    anvilCritBonus: 0.02,
    eliteChance: 0.72,
    shieldedChance: 0.58,
    extraSpawns: 7,
    fogColor: 0x11071a,
    moonTint: 0xc99eff,
    bossName: 'SOVEREIGN MALAKOR, LORD OF ETERNAL ASH',
    bossStyle: 'sovereign'
  }
];

export const MAX_FLOORS = FLOOR_CONFIGS.length;

export const BIOME_BOSS_NAMES = {
  sunken_cathedral:    'MALAKOR VANGUARD, DROWNED GATEKEEPER',
  withered_roothollow: 'THORN-WEAVER ELDER, KEEPER OF BLIGHTWOOD',
  ossuary_catacomb:    'GRAVELORD MORDREN, ARCHON OF BONES',
  plague_alchemica:    'VESPERA, GRAND ALCHEMIST OF BLIGHT',
  ashen_foundry:       'IGNIS, THE FURNACE COLOSSUS',
  crimson_inquisition: 'HIGH INQUISITOR VALERIUS, SCOURGE OF BLOOD',
  obsidian_throne:     'SOVEREIGN MALAKOR, LORD OF ETERNAL ASH',
  astral_rift:         'SOVEREIGN MALAKOR, ARCHITECT OF THE ECLIPSE'
};

// Elite Enemy Affixes unlocked progressively across Floor 1 -> 4
export const ELITE_AFFIXES = [
  {
    id: 'volatile',
    minFloor: 2,
    label: 'VOLATILE',
    color: 0xff5a22,
    desc: 'Detonates a molten rift shortly after death'
  },
  {
    id: 'frenzied',
    minFloor: 1,
    label: 'FRENZIED',
    color: 0xff2a55,
    desc: 'Enrages below 55% HP (+38% speed & attack rate)'
  },
  {
    id: 'warded',
    minFloor: 2,
    label: 'RUNIC WARD',
    color: 0x55ccff,
    desc: 'Protected by an Astral Barrier; shattering it stuns the host'
  },
  {
    id: 'stormcaller',
    minFloor: 3,
    label: 'STORMCALLER',
    color: 0xb975ff,
    desc: 'Periodically calls arcane lightning bolts at your position'
  }
];

export function rollEnemyAffixes(floorCfg, type, isBoss = false, mpScale = null, rng = Math.random) {
  const pCount = mpScale ? (mpScale.playerCount || 1) : 1;
  const diffId = mpScale ? (mpScale.difficultyId || 'standard') : 'standard';
  if (isBoss) {
    const bossAffixes = [];
    if (floorCfg.depth >= 2 || diffId === 'bloodfire' || diffId === 'abyssal' || (mpScale && mpScale.forceCoopBossWard)) {
      bossAffixes.push('warded');
    }
    if (floorCfg.depth >= 3 || (diffId === 'abyssal' && floorCfg.depth >= 2) || (pCount >= 3 && floorCfg.depth >= 2)) {
      bossAffixes.push('stormcaller');
    }
    if ((diffId === 'abyssal' || diffId === 'bloodfire' || pCount >= 3) && !bossAffixes.includes('frenzied')) {
      bossAffixes.push('frenzied');
    }
    return bossAffixes;
  }
  const chosen = [];
  const minFlrOffset = (pCount >= 3 || diffId === 'abyssal') ? 1 : 0;
  const pool = ELITE_AFFIXES.filter((a) => floorCfg.depth + minFlrOffset >= a.minFloor);
  const shChance = Math.max(0, floorCfg.shieldedChance + (mpScale ? (mpScale.shieldedChanceAdd || 0) : 0));
  const elChance = Math.max(0.02, floorCfg.eliteChance + (mpScale ? (mpScale.eliteChanceAdd || 0) : 0));
  if (rng() < shChance || (type === 'juggernaut' && floorCfg.depth >= 3)) {
    chosen.push('warded');
  }
  if (rng() < elChance && pool.length > 0) {
    const pick = pool[Math.floor(rng() * pool.length)].id;
    if (!chosen.includes(pick)) chosen.push(pick);
    // Floor 4 can roll dual-affix dread elites!
    const allowDual = floorCfg.depth >= 4 || pCount >= 3 || (mpScale && mpScale.allowDualAffix);
    const dualChance = diffId === 'abyssal' ? 0.58 : 0.42;
    if (allowDual && rng() < dualChance) {
      const pick2 = pool[Math.floor(rng() * pool.length)].id;
      if (!chosen.includes(pick2)) chosen.push(pick2);
    }
  }
  return chosen;
}

// Build 3D Abyssal Descent Portal spawned when Floor 1/2/3 Boss is defeated!
export function createDescentPortal(tex, mats, x, z, nextFloorCfg, nextBiome = null) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const ringHex = nextBiome
    ? nextBiome.lighting.keyColor
    : (nextFloorCfg ? nextFloorCfg.moonTint : 0x77d4ff);
  const vortexHex = nextBiome
    ? nextBiome.palette.sigilHex
    : 0x62b6ff;

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.95, 0.28, 16),
    mats.darkPlate
  );
  dais.position.y = 0.14;
  dais.receiveShadow = true;
  g.add(dais);

  const archMat = mats.gildedBronze;
  const outerArch = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 10, 32, Math.PI * 1.35), archMat);
  outerArch.position.y = 1.55;
  outerArch.rotation.z = -Math.PI * 0.175;
  outerArch.castShadow = true;
  g.add(outerArch);

  const innerRingMat = new THREE.MeshBasicMaterial({
    color: ringHex,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.32, 36), innerRingMat);
  innerRing.userData.ignoreAO = true;
  innerRing.position.y = 1.55;
  g.add(innerRing);

  const vortexMat = new THREE.MeshBasicMaterial({
    map: tex.sealTex,
    color: vortexHex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const vortex = new THREE.Mesh(new THREE.CircleGeometry(1.22, 32), vortexMat);
  vortex.userData.ignoreAO = true;
  vortex.position.y = 1.55;
  g.add(vortex);

  const floorSigil = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({
      map: tex.sealTex,
      color: vortexHex,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  floorSigil.userData.ignoreAO = true;
  floorSigil.rotation.x = -Math.PI / 2;
  floorSigil.position.y = 0.29;
  g.add(floorSigil);

  const light = new THREE.PointLight(vortexHex, 6.5, 11.0, 1.6);
  light.position.set(0, 1.8, 0.3);
  g.add(light);

  return {
    root: g,
    vortex,
    innerRing,
    floorSigil,
    light,
    vortexHex,
    update(time) {
      vortex.rotation.z = time * 1.4;
      innerRing.rotation.z = -time * 0.8;
      floorSigil.rotation.z = time * 0.45;
      light.intensity = 5.8 + Math.sin(time * 3.8) * 1.2;
    }
  };
}

// Build Exploration Curio: Trial Obelisk (spawns elite pack -> drops high-tier weapon + cinders) or Soul Cache
export function createExplorationCurio(kind, mats, tex, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  if (kind === 'trial_obelisk') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 1.1), mats.darkPlate);
    base.position.y = 0.21;
    base.castShadow = true;
    g.add(base);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 2.15, 6), mats.obsidianArmor);
    spire.position.y = 1.48;
    spire.castShadow = true;
    g.add(spire);

    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xff3b5c,
      emissive: 0xff1e42,
      emissiveIntensity: 2.2,
      roughness: 0.2
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), gemMat);
    gem.position.y = 2.85;
    g.add(gem);
    return { root: g, crystal: gem };
  }

  // Lost Reliquary Soul Cache (hidden exploration reward in side chambers)
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 0.78, 8), mats.gildedBronze);
  pedestal.position.y = 0.39;
  pedestal.castShadow = true;
  g.add(pedestal);

  const orbMat = new THREE.MeshStandardMaterial({
    color: 0x70ffe0,
    emissive: 0x2de2b8,
    emissiveIntensity: 2.0,
    roughness: 0.2
  });
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), orbMat);
  orb.position.y = 1.18;
  g.add(orb);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.softParticleTex,
    color: 0x62ffd6,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  }));
  halo.userData.ignoreAO = true;
  halo.scale.set(1.35, 1.35, 1);
  halo.position.y = 1.18;
  g.add(halo);

  return { root: g, crystal: orb, halo };
}
