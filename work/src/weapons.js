import * as THREE from 'three';

// Fixed Intrinsic Weapon Rarities (determines signature color, drop pool & prestige)
export const WEAPON_RARITIES = {
  common: {
    id: 'common',
    rank: 1,
    label: 'COMMON',
    color: '#d8d2c5',
    hex: 0xd8d2c5,
    salvageBase: 35,
    beamRadius: 0.28,
    beamHeight: 2.6,
    beamOpacity: 0.28,
    bossOnly: false
  },
  uncommon: {
    id: 'uncommon',
    rank: 2,
    label: 'UNCOMMON',
    color: '#4be38a',
    hex: 0x4be38a,
    salvageBase: 50,
    beamRadius: 0.34,
    beamHeight: 2.85,
    beamOpacity: 0.34,
    bossOnly: false
  },
  rare: {
    id: 'rare',
    rank: 3,
    label: 'RARE',
    color: '#4db8ff',
    hex: 0x4db8ff,
    salvageBase: 70,
    beamRadius: 0.40,
    beamHeight: 3.1,
    beamOpacity: 0.40,
    bossOnly: false
  },
  epic: {
    id: 'epic',
    rank: 4,
    label: 'EPIC',
    color: '#c770ff',
    hex: 0xc770ff,
    salvageBase: 95,
    beamRadius: 0.48,
    beamHeight: 3.4,
    beamOpacity: 0.46,
    bossOnly: false
  },
  mythic: {
    id: 'mythic',
    rank: 5,
    label: 'MYTHIC · BOSS',
    color: '#ffae2b',
    hex: 0xffae2b,
    crownHex: 0xff4757,
    salvageBase: 145,
    beamRadius: 0.62,
    beamHeight: 4.1,
    beamOpacity: 0.58,
    bossOnly: true
  }
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'mythic'];

// Progressive Forge Marks (scales weapon stats across Floor I -> IV and Soul Anvil tempering)
export const WEAPON_TIERS = [
  { tier: 1, shortLabel: 'MK.I',   label: 'MK.I · FORGED',     color: '#d8d2c5', dmgMult: 1.00, critBonus: 0.00, spdBonus: 1.00 },
  { tier: 2, shortLabel: 'MK.II',  label: 'MK.II · TEMPERED',  color: '#4be38a', dmgMult: 1.18, critBonus: 0.02, spdBonus: 1.03 },
  { tier: 3, shortLabel: 'MK.III', label: 'MK.III · MASTERWORK', color: '#4db8ff', dmgMult: 1.38, critBonus: 0.05, spdBonus: 1.06 },
  { tier: 4, shortLabel: 'MK.IV',  label: 'MK.IV · SOVEREIGN', color: '#ffae2b', dmgMult: 1.62, critBonus: 0.08, spdBonus: 1.09 }
];

export const WEAPON_DEFS = {
  // ==================== COMMON (凡铁制式 · 3) ====================
  greatsword: {
    id: 'greatsword',
    name: 'Sunforged Greatsword',
    cnName: '余烬巨剑',
    rarity: 'common',
    bossOnly: false,
    category: 'melee',
    subClass: 'cleave',
    element: 'PYRE',
    accent: '#ff8533',
    accentHex: 0xff8533,
    baseDmg: 52,
    pellets: 1,
    atkRate: 1.12,
    energyCost: 0,
    range: 3.72,
    critChance: 0.06,
    critMult: 0.10,
    shieldMult: 1.20,
    knockback: 5.2,
    impactClass: 'heavy',
    moveBonus: 1.00,
    moveSlow: 0.78,
    skillCd: 3.6,
    skillName: 'SEARING ARC',
    summary: '3.7m broad 3-hit pyre cleave (360° spin + ember wave finisher) · RMB: Piercing Flame Crescent',
    comboHits: 3
  },
  crossbow: {
    id: 'crossbow',
    name: 'Sanctum Crossbow',
    cnName: '猎魔连弩',
    rarity: 'common',
    bossOnly: false,
    category: 'ranged',
    subClass: 'bolt',
    element: 'PIERCE',
    accent: '#9be8ff',
    accentHex: 0x9be8ff,
    baseDmg: 42,
    pellets: 1,
    atkRate: 2.20,
    energyCost: 3,
    range: 14.5,
    projSpeed: 23.5,
    critChance: 0.14,
    critMult: 0.30,
    shieldMult: 1.15,
    knockback: 3.6,
    impactClass: 'light',
    moveBonus: 1.04,
    skillCd: 3.8,
    skillName: 'ARROW VOLLEY',
    summary: 'Cursor lock-on · Every 4th bolt is a Golden Piercer (+40% DMG) · RMB: 5-Bolt Fan Barrage'
  },
  twinblades: {
    id: 'twinblades',
    name: 'Frostbite Twinblades',
    cnName: '霜噬双刃',
    rarity: 'common',
    bossOnly: false,
    category: 'melee',
    subClass: 'dual',
    element: 'FROST',
    accent: '#63dcff',
    accentHex: 0x63dcff,
    baseDmg: 25,
    pellets: 1,
    atkRate: 2.35,
    energyCost: 0,
    range: 2.92,
    critChance: 0.20,
    critMult: 0.30,
    shieldMult: 1.00,
    knockback: 2.6,
    impactClass: 'light',
    moveBonus: 1.10,
    moveSlow: 0.94,
    chillDuration: 2.5,
    skillCd: 3.8,
    skillName: 'GLACIAL FLURRY',
    summary: 'Blistering 5-step dual dance (X-cross double-slash + 3.6m frost thrust + twin lotus spin) · RMB: Invulnerable Frost Lunge',
    comboHits: 5
  },

  // ==================== UNCOMMON (奇巧精良 · 4) ====================
  chakram: {
    id: 'chakram',
    name: 'Solar Return Chakram',
    cnName: '回旋日轮刃',
    rarity: 'uncommon',
    bossOnly: false,
    category: 'ranged',
    subClass: 'boomerang',
    element: 'PYRE',
    accent: '#ffae42',
    accentHex: 0xffae42,
    baseDmg: 48,
    pellets: 1,
    atkRate: 1.50,
    energyCost: 4,
    range: 11.8,
    projSpeed: 18.5,
    critChance: 0.15,
    critMult: 0.25,
    shieldMult: 1.30,
    knockback: 4.0,
    impactClass: 'medium',
    moveBonus: 1.06,
    skillCd: 4.2,
    skillName: 'TRIPLE ECLIPSE RING',
    summary: 'Spinning glaive pierces out, hovers & curves back (catching refunds 0.5s CD) · RMB: 3x Giant Returning Rings'
  },
  plagueflask: {
    id: 'plagueflask',
    name: 'Alchemist Blight Censer',
    cnName: '炼金疫病毒瓶',
    rarity: 'uncommon',
    bossOnly: false,
    category: 'ranged',
    subClass: 'lobber',
    element: 'BLIGHT',
    accent: '#65ff8f',
    accentHex: 0x65ff8f,
    baseDmg: 44,
    pellets: 1,
    atkRate: 1.20,
    energyCost: 5,
    range: 11.5,
    projSpeed: 15.0,
    splashRadius: 2.55,
    critChance: 0.10,
    critMult: 0.20,
    shieldMult: 1.35,
    knockback: 3.4,
    impactClass: 'medium',
    moveBonus: 1.02,
    skillCd: 4.5,
    skillName: 'CATALYST OUTBREAK',
    summary: 'Lobs toxic flasks that leave bubbling 3.6s Acid Pools & contagious Blight · RMB: 3x Flasks + Venom Detonation'
  },
  warhammer: {
    id: 'warhammer',
    name: 'Astral Warhammer',
    cnName: '星陨重锤',
    rarity: 'uncommon',
    bossOnly: false,
    category: 'melee',
    subClass: 'heavy',
    element: 'STORM',
    accent: '#ffd257',
    accentHex: 0xffd257,
    baseDmg: 98,
    pellets: 1,
    atkRate: 0.68,
    energyCost: 0,
    range: 3.48,
    critChance: 0.10,
    critMult: 0.35,
    shieldMult: 2.60,
    knockback: 8.2,
    impactClass: 'colossal',
    moveBonus: 0.96,
    moveSlow: 0.62,
    staggerBonus: true,
    skillCd: 4.6,
    skillName: 'THUNDER SLAM',
    summary: 'Heavy 2-step maul: wide battering sweep into a 4.2m overhead thunder-crater slam · RMB: 3x Cascading Lightning Eruptions',
    comboHits: 2
  },
  scattergun: {
    id: 'scattergun',
    name: 'Cryptbone Scattergun',
    cnName: '碎骨双管霰弹',
    rarity: 'uncommon',
    bossOnly: false,
    category: 'ranged',
    subClass: 'shotgun',
    element: 'PIERCE',
    accent: '#ffb076',
    accentHex: 0xffb076,
    baseDmg: 21,
    pellets: 6,
    atkRate: 1.05,
    energyCost: 6,
    range: 8.8,
    projSpeed: 24.0,
    critChance: 0.12,
    critMult: 0.30,
    shieldMult: 1.65,
    knockback: 6.4,
    impactClass: 'heavy',
    moveBonus: 1.00,
    skillCd: 4.2,
    skillName: 'RICOCHET BUCKSHOT',
    summary: 'Blasts 6 bone-shrapnel pellets (+35% point-blank DMG & heavy knockback) · RMB: 9 Wall-Bouncing Alloy Pellets'
  },

  // ==================== RARE (秘传稀有 · 5) ====================
  voidstaff: {
    id: 'voidstaff',
    name: 'Voidweaver Staff',
    cnName: '虚空星杖',
    rarity: 'rare',
    bossOnly: false,
    category: 'ranged',
    subClass: 'orb',
    element: 'VOID',
    accent: '#c77dff',
    accentHex: 0xc77dff,
    baseDmg: 52,
    pellets: 1,
    atkRate: 1.45,
    energyCost: 5,
    range: 14.2,
    projSpeed: 16.0,
    bounceCount: 2,
    critChance: 0.10,
    critMult: 0.20,
    shieldMult: 1.50,
    knockback: 4.2,
    impactClass: 'medium',
    moveBonus: 1.02,
    skillCd: 4.8,
    skillName: 'SINGULARITY',
    summary: 'Homing Void Orbs chain-bounce across 3 foes · RMB: Gravity Singularity pulls & shreds packs'
  },
  chainwhip: {
    id: 'chainwhip',
    name: 'Abyssal Chain-Whip',
    cnName: '冥狱锁链鞭',
    rarity: 'rare',
    bossOnly: false,
    category: 'melee',
    subClass: 'whip',
    element: 'BLOOD',
    accent: '#ff4769',
    accentHex: 0xff4769,
    baseDmg: 56,
    pellets: 1,
    atkRate: 1.42,
    energyCost: 0,
    range: 5.48,
    critChance: 0.16,
    critMult: 0.45,
    shieldMult: 1.35,
    knockback: 4.6,
    impactClass: 'medium',
    moveBonus: 1.04,
    moveSlow: 0.86,
    skillCd: 4.2,
    skillName: 'SOULSHACKLE HOOK',
    summary: '5.5m long-reach whip: twin linear cracks + 210° chain sweep · Outer-tip hits ALWAYS CRIT & sonic-burst · RMB: Harpoon Pull',
    comboHits: 3
  },
  prismbeam: {
    id: 'prismbeam',
    name: 'Refulgent Prism Focus',
    cnName: '极光棱镜射线',
    rarity: 'rare',
    bossOnly: false,
    category: 'ranged',
    subClass: 'beam',
    element: 'ASTRAL',
    accent: '#6df7ff',
    accentHex: 0x6df7ff,
    baseDmg: 24,
    pellets: 1,
    atkRate: 3.60,
    energyCost: 2,
    range: 14.8,
    projSpeed: 60.0,
    critChance: 0.14,
    critMult: 0.25,
    shieldMult: 1.75,
    knockback: 2.2,
    impactClass: 'light',
    moveBonus: 1.03,
    skillCd: 4.6,
    skillName: 'PRISMATIC OVERDRIVE',
    summary: 'Instant piercing laser ramps up to 185% DMG under sustained fire & refracts a split beam · RMB: 7-Beam Prism Nova'
  },
  buzzsaw: {
    id: 'buzzsaw',
    name: 'Clockwork Ripper Launcher',
    cnName: '发条撕裂锯盘',
    rarity: 'rare',
    bossOnly: false,
    category: 'ranged',
    subClass: 'ricochet',
    element: 'PIERCE',
    accent: '#ff9642',
    accentHex: 0xff9642,
    baseDmg: 56,
    pellets: 1,
    atkRate: 1.35,
    energyCost: 5,
    range: 13.5,
    projSpeed: 19.5,
    wallBounces: 3,
    critChance: 0.16,
    critMult: 0.35,
    shieldMult: 1.40,
    knockback: 4.4,
    impactClass: 'medium',
    moveBonus: 1.01,
    skillCd: 5.0,
    skillName: 'ORBITAL SAWGUARD',
    summary: 'Spinning serrated discs ricochet off walls 3x & inflict Bleed · RMB: Summons 3 Orbiting Sawblades for 6.5s'
  },
  handcannon: {
    id: 'handcannon',
    name: 'Brimstone Siege Cannon',
    cnName: '炼狱攻城火铳',
    rarity: 'rare',
    bossOnly: false,
    category: 'ranged',
    subClass: 'cannon',
    element: 'PYRE',
    accent: '#ff6238',
    accentHex: 0xff6238,
    baseDmg: 96,
    pellets: 1,
    atkRate: 0.90,
    energyCost: 7,
    range: 12.8,
    projSpeed: 20.0,
    splashRadius: 2.45,
    critChance: 0.12,
    critMult: 0.30,
    shieldMult: 2.15,
    knockback: 6.8,
    impactClass: 'heavy',
    moveBonus: 0.98,
    skillCd: 4.5,
    skillName: 'DRAGONBREATH',
    summary: 'Heavy explosive siege shells ignite packs · RMB: Recoil backstep + Molten Shrapnel Cone'
  },

  // ==================== EPIC (古神史诗 · 3) ====================
  bloodscythe: {
    id: 'bloodscythe',
    name: 'Crimson Harvester Scythe',
    cnName: '猩红收割巨镰',
    rarity: 'epic',
    bossOnly: false,
    category: 'melee',
    subClass: 'scythe',
    element: 'BLOOD',
    accent: '#ff2e55',
    accentHex: 0xff2e55,
    baseDmg: 74,
    pellets: 1,
    atkRate: 0.96,
    energyCost: 0,
    range: 4.40,
    critChance: 0.18,
    critMult: 0.40,
    shieldMult: 1.45,
    knockback: 5.8,
    impactClass: 'heavy',
    moveBonus: 1.03,
    moveSlow: 0.75,
    vampOnHit: 2,
    skillCd: 4.8,
    skillName: 'REAPER CYCLONE',
    summary: '4.4m 240° inward-pulling reaper crescents + 4.8m full-moon harvest · Lifesteals & EXECUTES low-HP foes · RMB: Draining Whirlwind',
    comboHits: 3
  },
  autoturret: {
    id: 'autoturret',
    name: 'Clockwork Bastion Codex',
    cnName: '发条奥术机关匣',
    rarity: 'epic',
    bossOnly: false,
    category: 'ranged',
    subClass: 'turret',
    element: 'STORM',
    accent: '#5ce1ff',
    accentHex: 0x5ce1ff,
    baseDmg: 45,
    pellets: 1,
    atkRate: 1.80,
    energyCost: 4,
    range: 14.0,
    projSpeed: 22.0,
    critChance: 0.14,
    critMult: 0.28,
    shieldMult: 1.70,
    knockback: 3.8,
    impactClass: 'medium',
    moveBonus: 1.04,
    skillCd: 5.2,
    skillName: 'DEPLOY TESLA SENTRY',
    summary: 'Voltaic marker bolts · Every 5th shot drops a Spark Pylon · RMB: Deploys autonomous 3D Lightning Turret (max 2)'
  },
  flyingdaggers: {
    id: 'flyingdaggers',
    name: 'Astral Myriad Sword-Box',
    cnName: '太虚御剑匣',
    rarity: 'epic',
    bossOnly: false,
    category: 'ranged',
    subClass: 'swords',
    element: 'ASTRAL',
    accent: '#7ef9ff',
    accentHex: 0x7ef9ff,
    baseDmg: 32,
    pellets: 2,
    atkRate: 1.75,
    energyCost: 4,
    range: 15.0,
    projSpeed: 21.5,
    critChance: 0.20,
    critMult: 0.38,
    shieldMult: 1.40,
    knockback: 3.5,
    impactClass: 'light',
    moveBonus: 1.08,
    skillCd: 4.8,
    skillName: 'MYRIAD SWORD STORM',
    summary: 'Commands twin curved-arc homing spirit swords · 4 Sword Marks call a Sky-Sword strike · RMB: 10 Homing Spirit Blades'
  },

  // ==================== MYTHIC · BOSS EXCLUSIVE (传说·首领限定 · 5) ====================
  eclipseblade: {
    id: 'eclipseblade',
    name: 'Eclipse Rift-Odachi',
    cnName: '日蚀次元太刀',
    rarity: 'mythic',
    bossOnly: true,
    category: 'melee',
    subClass: 'katana',
    element: 'VOID',
    accent: '#e08aff',
    accentHex: 0xe08aff,
    baseDmg: 74,
    pellets: 1,
    atkRate: 1.68,
    energyCost: 0,
    range: 4.28,
    critChance: 0.24,
    critMult: 0.55,
    shieldMult: 1.75,
    knockback: 4.8,
    impactClass: 'heavy',
    moveBonus: 1.10,
    moveSlow: 0.90,
    skillCd: 4.5,
    skillName: 'JUDGMENT OMNISLASH',
    summary: '[BOSS MYTHIC] 4.3m swift iaido cuts + 5.5m rift thrust + wide draw-slash · Tears delayed Cross-Rifts · RMB: Blink Omnislash',
    comboHits: 4
  },
  starfallbow: {
    id: 'starfallbow',
    name: 'Celestial Starfall Greatbow',
    cnName: '坠星天穹神弓',
    rarity: 'mythic',
    bossOnly: true,
    category: 'ranged',
    subClass: 'greatbow',
    element: 'ASTRAL',
    accent: '#ffd86b',
    accentHex: 0xffd86b,
    baseDmg: 112,
    pellets: 1,
    atkRate: 1.15,
    energyCost: 7,
    range: 16.0,
    projSpeed: 27.0,
    critChance: 0.22,
    critMult: 0.50,
    shieldMult: 1.85,
    knockback: 5.6,
    impactClass: 'heavy',
    moveBonus: 1.06,
    skillCd: 5.0,
    skillName: 'HEAVENFALL CATACLYSM',
    summary: '[BOSS MYTHIC] Piercing star-arrows call down a Celestial Meteor & split 2 star-seekers · RMB: 7-Wave Meteor Rain'
  },
  soulgrimoire: {
    id: 'soulgrimoire',
    name: 'Necrotic Soul-Eater Tome',
    cnName: '噬魂死灵圣典',
    rarity: 'mythic',
    bossOnly: true,
    category: 'ranged',
    subClass: 'grimoire',
    element: 'BLOOD',
    accent: '#48ffbe',
    accentHex: 0x48ffbe,
    baseDmg: 42,
    pellets: 2,
    atkRate: 1.60,
    energyCost: 5,
    range: 14.5,
    projSpeed: 19.0,
    critChance: 0.18,
    critMult: 0.35,
    shieldMult: 1.65,
    knockback: 4.0,
    impactClass: 'medium',
    moveBonus: 1.05,
    vampOnHit: 2,
    skillCd: 5.0,
    skillName: 'NIGHT PARADE OF WRAITHS',
    summary: '[BOSS MYTHIC] Twin draining soul-bolts awaken Orbiting Wraith Skulls that dive-bomb foes · RMB: 8 Wraiths + Full Orbitals'
  },
  mjolnir: {
    id: 'mjolnir',
    name: 'Ragnarok Storm-Halberd',
    cnName: '诸神黄昏雷神戟',
    rarity: 'mythic',
    bossOnly: true,
    category: 'melee',
    subClass: 'halberd',
    element: 'STORM',
    accent: '#68d8ff',
    accentHex: 0x68d8ff,
    baseDmg: 98,
    pellets: 1,
    atkRate: 1.02,
    energyCost: 0,
    range: 4.64,
    critChance: 0.18,
    critMult: 0.45,
    shieldMult: 2.80,
    knockback: 8.4,
    impactClass: 'colossal',
    moveBonus: 1.02,
    moveSlow: 0.74,
    staggerBonus: true,
    skillCd: 4.6,
    skillName: 'THUNDERGOD RECALL',
    summary: '[BOSS MYTHIC] 3-form polearm arts: 5.3m lightning thrust, 4.6m wide halberd sweep & 4.7m sky-bolt crater slam · RMB: Thrown Recall',
    comboHits: 3
  },
  sunforgecannon: {
    id: 'sunforgecannon',
    name: 'Helios Singularity Cannon',
    cnName: '赫利俄斯歼星炮',
    rarity: 'mythic',
    bossOnly: true,
    category: 'ranged',
    subClass: 'bfg',
    element: 'PYRE',
    accent: '#ff9924',
    accentHex: 0xff9924,
    baseDmg: 138,
    pellets: 1,
    atkRate: 0.68,
    energyCost: 12,
    range: 15.0,
    projSpeed: 8.8,
    splashRadius: 3.65,
    critChance: 0.16,
    critMult: 0.45,
    shieldMult: 2.50,
    knockback: 8.2,
    impactClass: 'colossal',
    moveBonus: 0.96,
    skillCd: 5.6,
    skillName: 'SOLAR ANNIHILATION BEAM',
    summary: '[BOSS MYTHIC] Fires a Miniature Sun that zaps nearby foes with solar arcs before Supernova · RMB: Giant Solar Beam'
  }
};

export const ALL_WEAPON_IDS = Object.keys(WEAPON_DEFS);
export const WEAPON_LIST = ALL_WEAPON_IDS.map((id) => WEAPON_DEFS[id]);
export const STANDARD_WEAPON_IDS = ALL_WEAPON_IDS.filter((id) => !WEAPON_DEFS[id].bossOnly);
export const BOSS_WEAPON_IDS = ALL_WEAPON_IDS.filter((id) => !!WEAPON_DEFS[id].bossOnly);

// Distinct per-weapon primary melee attack choreography (cadence, reach, hitbox shape, movement & rig pose)
export const MELEE_COMBO_PROFILES = {
  twinblades: {
    comboWindow: 1.05,
    moveSlow: 0.94,
    steps: [
      { shape: 'sector', arcHalf: 0.86, reachMult: 1.00, dur: 0.22, dmgMult: 0.92, lunge: 3.4, anim: 'slashR' },
      { shape: 'sector', arcHalf: 0.86, reachMult: 1.00, dur: 0.22, dmgMult: 0.96, lunge: 3.4, anim: 'slashL' },
      { shape: 'sector', arcHalf: 1.12, reachMult: 1.08, dur: 0.28, dmgMult: 0.76, lunge: 3.8, anim: 'crossX', multiStrikeAt: 0.50 },
      { shape: 'line', halfWidth: 0.78, reachMult: 1.24, dur: 0.25, dmgMult: 1.24, lunge: 5.8, anim: 'thrust' },
      { shape: 'sector', arcHalf: Math.PI, reachMult: 1.14, dur: 0.36, dmgMult: 0.86, lunge: 4.8, anim: 'spin', multiStrikeAt: 0.52, isFinisher: true }
    ]
  },
  greatsword: {
    comboWindow: 1.05,
    moveSlow: 0.78,
    steps: [
      { shape: 'sector', arcHalf: 1.48, reachMult: 1.00, dur: 0.31, dmgMult: 1.00, lunge: 3.6, anim: 'cleaveR' },
      { shape: 'sector', arcHalf: 1.62, reachMult: 1.06, dur: 0.32, dmgMult: 1.18, lunge: 4.4, anim: 'cleaveL' },
      { shape: 'sector', arcHalf: Math.PI, reachMult: 1.10, dur: 0.44, dmgMult: 1.46, lunge: 5.0, anim: 'spin', finisherCrescent: true, isFinisher: true }
    ]
  },
  warhammer: {
    comboWindow: 1.35,
    moveSlow: 0.62,
    steps: [
      { shape: 'sector', arcHalf: 1.20, reachMult: 1.00, dur: 0.36, dmgMult: 1.05, lunge: 2.6, kbScale: 1.35, anim: 'heavySweep' },
      { shape: 'crater', impactOffset: 2.00, craterRadius: 2.20, reachMult: 1.20, dur: 0.46, dmgMult: 1.62, lunge: 3.6, kbScale: 1.45, anim: 'overheadSlam', isFinisher: true }
    ]
  },
  chainwhip: {
    comboWindow: 1.08,
    moveSlow: 0.86,
    steps: [
      { shape: 'line', halfWidth: 0.74, reachMult: 1.00, dur: 0.27, dmgMult: 1.00, lunge: 1.2, sweetSpotStart: 0.58, anim: 'whipCrackR' },
      { shape: 'line', halfWidth: 0.78, reachMult: 1.02, dur: 0.27, dmgMult: 1.12, lunge: 1.4, sweetSpotStart: 0.58, anim: 'whipCrackL' },
      { shape: 'sector', arcHalf: 1.84, reachMult: 0.94, dur: 0.38, dmgMult: 1.42, lunge: 2.2, sweetSpotStart: 0.60, anim: 'whipSweep', isFinisher: true }
    ]
  },
  bloodscythe: {
    comboWindow: 1.15,
    moveSlow: 0.75,
    steps: [
      { shape: 'sector', arcHalf: 2.10, reachMult: 1.00, dur: 0.34, dmgMult: 1.00, lunge: 2.8, pullInward: true, anim: 'scytheR' },
      { shape: 'sector', arcHalf: 2.18, reachMult: 1.04, dur: 0.34, dmgMult: 1.16, lunge: 3.0, pullInward: true, anim: 'scytheL' },
      { shape: 'sector', arcHalf: Math.PI, reachMult: 1.10, dur: 0.45, dmgMult: 1.52, lunge: 3.8, pullInward: true, anim: 'spin', isFinisher: true }
    ]
  },
  eclipseblade: {
    comboWindow: 1.05,
    moveSlow: 0.90,
    steps: [
      { shape: 'sector', arcHalf: 1.14, reachMult: 1.00, dur: 0.25, dmgMult: 0.98, lunge: 3.8, anim: 'katanaR' },
      { shape: 'sector', arcHalf: 1.18, reachMult: 1.02, dur: 0.25, dmgMult: 1.08, lunge: 4.0, anim: 'katanaL' },
      { shape: 'line', halfWidth: 0.84, reachMult: 1.28, dur: 0.27, dmgMult: 1.26, lunge: 6.4, anim: 'thrust' },
      { shape: 'sector', arcHalf: 2.02, reachMult: 1.15, dur: 0.36, dmgMult: 1.56, lunge: 4.8, anim: 'iaidoDraw', isFinisher: true }
    ]
  },
  mjolnir: {
    comboWindow: 1.20,
    moveSlow: 0.74,
    steps: [
      { shape: 'line', halfWidth: 0.85, reachMult: 1.14, dur: 0.30, dmgMult: 1.05, lunge: 4.4, anim: 'thrust' },
      { shape: 'sector', arcHalf: 1.76, reachMult: 1.00, dur: 0.34, dmgMult: 1.20, lunge: 3.4, kbScale: 1.25, anim: 'cleaveL' },
      { shape: 'crater', impactOffset: 2.36, craterRadius: 2.36, reachMult: 1.02, dur: 0.45, dmgMult: 1.62, lunge: 4.2, kbScale: 1.40, anim: 'overheadSlam', isFinisher: true }
    ]
  }
};

export function getMeleeStepSpec(weaponId, stepIndex = 0) {
  const prof = MELEE_COMBO_PROFILES[weaponId] || MELEE_COMBO_PROFILES.greatsword;
  const idx = ((stepIndex % prof.steps.length) + prof.steps.length) % prof.steps.length;
  return { profile: prof, step: prof.steps[idx], stepIndex: idx, maxSteps: prof.steps.length };
}

export const BONUS_AFFIXES = [
  { id: 'keen',     label: 'Keen (+5% Crit)',                 critAdd: 0.05 },
  { id: 'swift',    label: 'Swift (+7% Atk Rate)',            spdMult: 1.07 },
  { id: 'brutal',   label: 'Brutal (+10% Damage)',            dmgMult: 1.10 },
  { id: 'leeching', label: 'Vampiric (+2 HP on Crit)',        vampCrit: 2 },
  { id: 'deadly',   label: 'Ruthless (+18% Crit DMG)',        critMultAdd: 0.18 },
  { id: 'glacial',  label: 'Frostbound (Chills 1.2s)',        chillAdd: 1.2 },
  { id: 'searing',  label: 'Pyreforged (Ignites Targets)',    burnAdd: true },
  { id: 'voltaic',  label: 'Voltaic (Crits Arc Lightning)',   shockCrit: true },
  { id: 'agile',    label: 'Featherweight (+5% Spd · -8% CD)', moveMult: 1.05, cdMult: 0.92 },
  { id: 'siphoning', label: 'Aether-Tapped (+3 Aether on Crit)', energyCrit: 3 }
];

export function rollWeaponInstance(weaponId, tierNum = 1, guaranteedAffix = false, rng = Math.random) {
  const def = WEAPON_DEFS[weaponId] || WEAPON_DEFS.greatsword;
  const rDef = WEAPON_RARITIES[def.rarity] || WEAPON_RARITIES.common;
  const t = WEAPON_TIERS[Math.max(0, Math.min(WEAPON_TIERS.length - 1, tierNum - 1))];
  let affix = null;
  if (tierNum >= 2 || rDef.rank >= 3 || guaranteedAffix) {
    affix = BONUS_AFFIXES[Math.floor(rng() * BONUS_AFFIXES.length)];
  }
  return {
    uid: `${def.id}_t${t.tier}_${Math.floor(rng() * 99999)}`,
    id: def.id,
    def,
    rarity: rDef.id,
    rarityRank: rDef.rank,
    rarityLabel: rDef.label,
    rarityColor: rDef.color,
    rarityHex: rDef.hex,
    rarityInfo: rDef,
    bossOnly: !!def.bossOnly,
    tier: t.tier,
    tierLabel: `${rDef.label} · ${t.shortLabel}`,
    tierColor: rDef.color,
    affix,
    pellets: def.pellets || 1,
    dmg: Math.max(1, Math.round(def.baseDmg * t.dmgMult * (affix?.dmgMult || 1))),
    atkRate: +(def.atkRate * t.spdBonus * (affix?.spdMult || 1)).toFixed(2),
    energyCost: def.category === 'ranged' ? Math.max(1, def.energyCost ?? 4) : 0,
    range: def.range,
    critBonus: +(def.critChance + t.critBonus + (affix?.critAdd || 0)).toFixed(2),
    critMultBonus: +(def.critMult + (affix?.critMultAdd || 0)).toFixed(2),
    shieldMult: 1.0,
    knockback: def.knockback || 4.8,
    impactClass: def.impactClass || 'medium',
    moveBonus: +((def.moveBonus || 1.0) * (affix?.moveMult || 1.0)).toFixed(2),
    skillCdMult: affix?.cdMult || 1.0,
    vampCrit: affix?.vampCrit || 0,
    energyCrit: affix?.energyCrit || 0,
    affixChill: affix?.chillAdd || 0,
    affixBurn: !!affix?.burnAdd,
    affixShock: affix?.shockCrit ? 22 : 0,
    temperCount: 0
  };
}

export function temperWeaponInstance(w, rng = Math.random) {
  if (!w || !w.def) return w;
  w.temperCount = (w.temperCount || 0) + 1;
  if (w.tier < WEAPON_TIERS.length) {
    w.tier += 1;
    const t = WEAPON_TIERS[w.tier - 1];
    const rDef = WEAPON_RARITIES[w.rarity] || WEAPON_RARITIES.common;
    w.tierLabel = `${rDef.label} · ${t.shortLabel}`;
    w.dmg = Math.max(w.dmg + 2, Math.round(w.def.baseDmg * t.dmgMult * (w.affix?.dmgMult || 1)));
    w.atkRate = +(w.def.atkRate * t.spdBonus * (w.affix?.spdMult || 1)).toFixed(2);
    w.critBonus = +(w.def.critChance + t.critBonus + (w.affix?.critAdd || 0)).toFixed(2);
  } else {
    w.overTemperCount = (w.overTemperCount || 0) + 1;
    w.dmg = Math.round(w.dmg * 1.06) + 2;
    if (w.overTemperCount <= 3) {
      w.atkRate = +(w.atkRate * 1.02).toFixed(2);
    }
  }
  if (!w.affix) {
    const af = BONUS_AFFIXES[Math.floor(rng() * BONUS_AFFIXES.length)];
    w.affix = af;
    if (af.dmgMult) w.dmg = Math.round(w.dmg * af.dmgMult);
    if (af.spdMult) w.atkRate = +(w.atkRate * af.spdMult).toFixed(2);
    if (af.critAdd) w.critBonus = +(w.critBonus + af.critAdd).toFixed(2);
    if (af.critMultAdd) w.critMultBonus = +(w.critMultBonus + af.critMultAdd).toFixed(2);
    if (af.vampCrit) w.vampCrit = (w.vampCrit || 0) + af.vampCrit;
    if (af.energyCrit) w.energyCrit = (w.energyCrit || 0) + af.energyCrit;
    if (af.moveMult) w.moveBonus = +(w.moveBonus * af.moveMult).toFixed(2);
    if (af.cdMult) w.skillCdMult = af.cdMult;
    if (af.chillAdd) w.affixChill = af.chillAdd;
    if (af.burnAdd) w.affixBurn = true;
    if (af.shockCrit) w.affixShock = 22;
  }
  return w;
}

const DEPTH_RARITY_WEIGHTS = {
  1: { common: 38, uncommon: 40, rare: 18, epic: 4 },
  2: { common: 14, uncommon: 36, rare: 35, epic: 15 },
  3: { common: 5,  uncommon: 23, rare: 42, epic: 30 },
  4: { common: 0,  uncommon: 14, rare: 42, epic: 44 }
};

export function pickRandomWeaponDrop(floorDepth = 1, excludeIds = [], rng = Math.random, opts = {}) {
  const poolKind = opts.pool || 'standard';
  if (poolKind === 'boss') {
    return pickBossWeaponDrop(floorDepth, excludeIds, rng);
  }

  let weights;
  if (poolKind === 'trial') {
    weights = floorDepth >= 3
      ? { common: 0, uncommon: 0, rare: 42, epic: 58 }
      : { common: 0, uncommon: 0, rare: 60, epic: 40 };
  } else if (poolKind === 'vault') {
    weights = floorDepth >= 3
      ? { common: 0, uncommon: 18, rare: 44, epic: 38 }
      : { common: 0, uncommon: 36, rare: 44, epic: 20 };
  } else {
    weights = DEPTH_RARITY_WEIGHTS[Math.max(1, Math.min(4, floorDepth))] || DEPTH_RARITY_WEIGHTS[1];
  }
  if (opts.minRarityRank && opts.minRarityRank >= 2) {
    weights = { ...weights };
    if (opts.minRarityRank >= 2) weights.common = 0;
    if (opts.minRarityRank >= 3) weights.uncommon = 0;
  }

  const baseCandidates = STANDARD_WEAPON_IDS.filter((id) => !excludeIds.includes(id));
  const eligible = baseCandidates.length > 0 ? baseCandidates : STANDARD_WEAPON_IDS;

  const weighted = [];
  let totalW = 0;
  for (const id of eligible) {
    const r = WEAPON_DEFS[id].rarity;
    const w = weights[r] ?? 0;
    if (w > 0) {
      weighted.push({ id, w });
      totalW += w;
    }
  }

  let pickedId;
  if (totalW > 0) {
    let roll = rng() * totalW;
    pickedId = weighted[weighted.length - 1].id;
    for (const item of weighted) {
      roll -= item.w;
      if (roll <= 0) {
        pickedId = item.id;
        break;
      }
    }
  } else {
    pickedId = eligible[Math.floor(rng() * eligible.length)];
  }

  const tierBoost = (poolKind === 'trial' || rng() < 0.42) ? 1 : 0;
  const baseTier = Math.min(4, Math.max(1, floorDepth + tierBoost));
  const forceAffix = !!opts.guaranteedAffix || poolKind === 'trial' || poolKind === 'vault' || floorDepth >= 2;
  return rollWeaponInstance(pickedId, baseTier, forceAffix, rng);
}

export function pickBossWeaponDrop(floorDepth = 1, excludeIds = [], rng = Math.random) {
  const unowned = BOSS_WEAPON_IDS.filter((id) => !excludeIds.includes(id));
  const pool = unowned.length > 0 ? unowned : BOSS_WEAPON_IDS;
  const pickedId = pool[Math.floor(rng() * pool.length)];
  const bossForgeTier = Math.min(4, Math.max(2, floorDepth + 1));
  return rollWeaponInstance(pickedId, bossForgeTier, true, rng);
}
export { pickBossWeaponDrop as pickBossMythicDrop };

// Find enemy closest to mouse cursor world point (`aimWorld`) for Ranged Smart Lock-On!
export function findNearestEnemyToCursor(enemies, hero, aimWorld, maxRange = 16.5) {
  let best = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const distHero = Math.hypot(e.x - hero.x, e.z - hero.z);
    if (distHero > maxRange + 2.5) continue;
    const distCursor = Math.hypot(e.x - aimWorld.x, e.z - aimWorld.z);
    if (distCursor < bestScore) {
      bestScore = distCursor;
      best = e;
    }
  }
  return best;
}
// Build 3D weapon model mounted into `heroRig.swordPivot` (plus optional offhand mesh)
export function buildWeaponVisuals(weaponInst, mats) {
  const id = weaponInst.id;
  const accentHex = weaponInst.def.accentHex;
  const rarityRank = weaponInst.rarityRank || 1;
  const group = new THREE.Group();
  let offhand = null;

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: accentHex,
    emissiveIntensity: 1.35 + (weaponInst.tier || 1) * 0.25 + rarityRank * 0.16,
    roughness: 0.22,
    metalness: 0.65
  });
  const steelMat = mats.silverSteel.clone();
  const darkMat = mats.darkPlate;
  const goldMat = mats.gildedBronze;
  const obsidianMat = mats.obsidianArmor || mats.darkPlate;
  const boneMat = mats.boneIvory || mats.silverSteel;

  const baseNode = new THREE.Object3D();
  const tipNode = new THREE.Object3D();
  baseNode.position.set(0, 0, 0.22);
  tipNode.position.set(0, 0, 1.55);

  if (id === 'greatsword') {
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8), darkMat);
    hilt.rotation.x = Math.PI / 2;
    group.add(hilt);
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), goldMat);
    pommel.position.z = -0.19;
    group.add(pommel);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.058, 0.08), goldMat);
    guard.position.z = 0.16;
    guard.castShadow = true;
    group.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.028, 1.92), steelMat);
    blade.position.z = 1.13;
    blade.castShadow = true;
    group.add(blade);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.038, 1.56), glowMat);
    rune.userData.ignoreAO = true;
    rune.position.z = 1.02;
    group.add(rune);
    tipNode.position.set(0, 0, 2.15);
  } else if (id === 'twinblades') {
    const buildDagger = () => {
      const dg = new THREE.Group();
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.24, 8), darkMat);
      grip.rotation.x = Math.PI / 2;
      dg.add(grip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), goldMat);
      guard.position.z = 0.12;
      dg.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.02, 1.26), steelMat);
      blade.position.z = 0.76;
      blade.castShadow = true;
      dg.add(blade);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.012, 1.20), glowMat);
      edge.userData.ignoreAO = true;
      edge.position.z = 0.76;
      dg.add(edge);
      return dg;
    };
    group.add(buildDagger());
    offhand = buildDagger();
    tipNode.position.set(0, 0, 1.44);
  } else if (id === 'warhammer') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 1.78, 8), darkMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.73;
    shaft.castShadow = true;
    group.add(shaft);
    const headBlock = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.30, 0.38), steelMat);
    headBlock.position.z = 1.52;
    headBlock.castShadow = true;
    group.add(headBlock);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.085, 0.41), goldMat);
    trim.position.z = 1.52;
    group.add(trim);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), glowMat);
    core.userData.ignoreAO = true;
    core.position.z = 1.52;
    group.add(core);
    tipNode.position.set(0, 0, 1.78);
  } else if (id === 'crossbow') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.82), darkMat);
    stock.position.z = 0.36;
    stock.castShadow = true;
    group.add(stock);
    const bowProd = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.045, 0.08), goldMat);
    bowProd.position.z = 0.72;
    bowProd.castShadow = true;
    group.add(bowProd);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 6), glowMat);
    bolt.userData.ignoreAO = true;
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(0, 0.065, 0.62);
    group.add(bolt);
    tipNode.position.set(0, 0.05, 0.92);
  } else if (id === 'chakram') {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 8), goldMat);
    grip.position.z = 0.38;
    group.add(grip);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.042, 8, 24), steelMat);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.z = 0.52;
    outerRing.castShadow = true;
    group.add(outerRing);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.018, 6, 24), glowMat);
    glowRing.userData.ignoreAO = true;
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.z = 0.52;
    group.add(glowRing);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 4), goldMat);
      fin.position.set(Math.cos(a) * 0.44, 0, 0.52 + Math.sin(a) * 0.44);
      fin.rotation.x = Math.PI / 2;
      fin.rotation.z = -a;
      group.add(fin);
    }
    tipNode.position.set(0, 0, 0.95);
  } else if (id === 'plagueflask') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.82, 8), darkMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.z = 0.35;
    group.add(rod);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.34, 6, 1, true), goldMat);
    cage.position.set(0, -0.06, 0.82);
    group.add(cage);
    const vial = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), glowMat);
    vial.userData.ignoreAO = true;
    vial.position.set(0, -0.06, 0.82);
    group.add(vial);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 6), darkMat);
    cap.position.set(0, 0.14, 0.82);
    group.add(cap);
    tipNode.position.set(0, 0, 0.96);
  } else if (id === 'scattergun') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.15, 0.42), darkMat);
    stock.position.set(0, -0.03, 0.14);
    group.add(stock);
    for (const sx of [-0.058, 0.058]) {
      const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.86, 8), steelMat);
      brl.rotation.x = Math.PI / 2;
      brl.position.set(sx, 0.02, 0.62);
      brl.castShadow = true;
      group.add(brl);
      const muz = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.08, 8), glowMat);
      muz.userData.ignoreAO = true;
      muz.rotation.x = Math.PI / 2;
      muz.position.set(sx, 0.02, 1.05);
      group.add(muz);
    }
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.22), boneMat);
    rib.position.set(0, 0.02, 0.56);
    group.add(rib);
    tipNode.position.set(0, 0.02, 1.08);
  } else if (id === 'voidstaff') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 1.68, 8), darkMat);
    staff.rotation.x = Math.PI / 2;
    staff.position.z = 0.62;
    staff.castShadow = true;
    group.add(staff);
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.026, 8, 18, Math.PI * 1.45), goldMat);
    crescent.position.z = 1.48;
    crescent.rotation.x = Math.PI / 2;
    group.add(crescent);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 1), glowMat);
    orb.userData.ignoreAO = true;
    orb.position.z = 1.48;
    group.add(orb);
    tipNode.position.set(0, 0, 1.52);
  } else if (id === 'chainwhip') {
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.34, 8), obsidianMat);
    hilt.rotation.x = Math.PI / 2;
    group.add(hilt);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12), goldMat);
    guard.position.z = 0.16;
    group.add(guard);
    for (let s = 0; s < 9; s++) {
      const z = 0.32 + s * 0.26;
      const curveY = Math.sin(s * 0.65) * 0.06;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.04, 0.088 - s * 0.005), 0.032, 0.17), obsidianMat);
      seg.position.set(0, curveY, z);
      seg.castShadow = true;
      group.add(seg);
      const link = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.042, 0.12), glowMat);
      link.userData.ignoreAO = true;
      link.position.set(0, curveY, z + 0.10);
      group.add(link);
    }
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.36, 4), glowMat);
    barb.userData.ignoreAO = true;
    barb.rotation.x = Math.PI / 2;
    barb.position.z = 2.68;
    group.add(barb);
    tipNode.position.set(0, 0, 2.86);
  } else if (id === 'prismbeam') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.56), steelMat);
    frame.position.z = 0.28;
    group.add(frame);
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17 - r * 0.03, 0.018, 6, 18), goldMat);
      ring.position.z = 0.72 + r * 0.24;
      group.add(ring);
    }
    const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), glowMat);
    prism.userData.ignoreAO = true;
    prism.scale.set(0.85, 0.85, 1.85);
    prism.position.z = 0.86;
    group.add(prism);
    tipNode.position.set(0, 0, 1.15);
  } else if (id === 'buzzsaw') {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.86), darkMat);
    rail.position.z = 0.42;
    rail.castShadow = true;
    group.add(rail);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.22), goldMat);
    guard.position.z = 0.28;
    group.add(guard);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.026, 16), steelMat);
    disc.position.set(0, 0.04, 0.90);
    disc.castShadow = true;
    group.add(disc);
    const teeth = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 6, 12), glowMat);
    teeth.userData.ignoreAO = true;
    teeth.rotation.x = Math.PI / 2;
    teeth.position.set(0, 0.04, 0.90);
    group.add(teeth);
    tipNode.position.set(0, 0.04, 1.18);
  } else if (id === 'handcannon') {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.26), darkMat);
    grip.position.set(0, -0.04, 0.12);
    group.add(grip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.78, 10), steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.52;
    barrel.castShadow = true;
    group.add(barrel);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 14), goldMat);
    band.position.z = 0.78;
    group.add(band);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 8), glowMat);
    muzzle.userData.ignoreAO = true;
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = 0.88;
    group.add(muzzle);
    tipNode.position.set(0, 0, 0.94);
  } else if (id === 'bloodscythe') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.036, 2.28, 8), obsidianMat);
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 0.94;
    pole.castShadow = true;
    group.add(pole);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.22, 8), goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = 1.96;
    group.add(collar);
    const scytheArc = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.050, 6, 18, Math.PI * 0.86), steelMat);
    scytheArc.rotation.x = Math.PI / 2;
    scytheArc.rotation.z = -0.35;
    scytheArc.position.set(-0.38, 0, 1.88);
    scytheArc.castShadow = true;
    group.add(scytheArc);
    const bloodEdge = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.024, 6, 18, Math.PI * 0.86), glowMat);
    bloodEdge.userData.ignoreAO = true;
    bloodEdge.rotation.x = Math.PI / 2;
    bloodEdge.rotation.z = -0.35;
    bloodEdge.position.set(-0.38, 0, 1.88);
    group.add(bloodEdge);
    tipNode.position.set(-0.82, 0, 2.28);
  } else if (id === 'autoturret') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.36), goldMat);
    box.position.set(0, 0.02, 0.48);
    box.castShadow = true;
    group.add(box);
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 6, 12), steelMat);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(0, 0.16, 0.48);
    group.add(gear);
    const coil = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 1), glowMat);
    coil.userData.ignoreAO = true;
    coil.position.set(0, 0.22, 0.56);
    group.add(coil);
    const offRelay = new THREE.Group();
    const offOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), glowMat);
    offOrb.userData.ignoreAO = true;
    offOrb.position.set(0, 0.08, 0.24);
    offRelay.add(offOrb);
    offhand = offRelay;
    tipNode.position.set(0, 0.16, 0.78);
  } else if (id === 'flyingdaggers') {
    const scabbardBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.78), obsidianMat);
    scabbardBox.position.set(0, 0, 0.42);
    scabbardBox.castShadow = true;
    group.add(scabbardBox);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.80), goldMat);
    trim.position.set(0, 0.05, 0.42);
    group.add(trim);
    for (let i = -1; i <= 1; i++) {
      const miniBlade = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.62), glowMat);
      miniBlade.userData.ignoreAO = true;
      miniBlade.position.set(i * 0.11, 0.14 + Math.abs(i) * 0.04, 0.68 - Math.abs(i) * 0.08);
      group.add(miniBlade);
    }
    tipNode.position.set(0, 0.14, 1.02);
  } else if (id === 'eclipseblade') {
    const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.44, 8), obsidianMat);
    tsuka.rotation.x = Math.PI / 2;
    tsuka.position.z = -0.04;
    group.add(tsuka);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16), goldMat);
    tsuba.rotation.x = Math.PI / 2;
    tsuba.position.z = 0.18;
    group.add(tsuba);
    const odachi = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.022, 2.34), obsidianMat);
    odachi.position.set(0, 0.02, 1.35);
    odachi.castShadow = true;
    group.add(odachi);
    const riftEdge = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.028, 2.32), glowMat);
    riftEdge.userData.ignoreAO = true;
    riftEdge.position.set(0.028, 0.02, 1.35);
    group.add(riftEdge);
    const eclipseHalo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 22, Math.PI * 1.3), glowMat);
    eclipseHalo.userData.ignoreAO = true;
    eclipseHalo.position.set(0, 0.04, 0.34);
    group.add(eclipseHalo);
    tipNode.position.set(0, 0.02, 2.54);
  } else if (id === 'starfallbow') {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.38, 8), goldMat);
    riser.position.z = 0.44;
    group.add(riser);
    const limbArc = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.036, 8, 24, Math.PI * 0.92), goldMat);
    limbArc.rotation.x = Math.PI / 2;
    limbArc.rotation.z = Math.PI * 0.04;
    limbArc.position.set(0, 0, 0.22);
    limbArc.castShadow = true;
    group.add(limbArc);
    const wingGlow = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.018, 6, 24, Math.PI * 0.88), glowMat);
    wingGlow.userData.ignoreAO = true;
    wingGlow.rotation.x = Math.PI / 2;
    wingGlow.position.set(0, 0, 0.24);
    group.add(wingGlow);
    const starArrow = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 6), glowMat);
    starArrow.userData.ignoreAO = true;
    starArrow.rotation.x = Math.PI / 2;
    starArrow.position.set(0, 0.03, 0.68);
    group.add(starArrow);
    tipNode.position.set(0, 0.03, 1.22);
  } else if (id === 'soulgrimoire') {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.48), obsidianMat);
    cover.position.set(0, 0.08, 0.52);
    cover.rotation.x = -0.28;
    cover.castShadow = true;
    group.add(cover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.44), boneMat);
    pages.position.set(0, 0.11, 0.52);
    pages.rotation.x = -0.28;
    group.add(pages);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), glowMat);
      wisp.userData.ignoreAO = true;
      wisp.position.set(Math.cos(a) * 0.22, 0.28, 0.52 + Math.sin(a) * 0.22);
      group.add(wisp);
    }
    const lantern = new THREE.Group();
    const lCage = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
    lCage.position.set(0, -0.06, 0.28);
    lantern.add(lCage);
    const lSoul = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), glowMat);
    lSoul.userData.ignoreAO = true;
    lSoul.position.set(0, -0.06, 0.28);
    lantern.add(lSoul);
    offhand = lantern;
    tipNode.position.set(0, 0.22, 0.82);
  } else if (id === 'mjolnir') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 2.18, 8), goldMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.91;
    shaft.castShadow = true;
    group.add(shaft);
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.28, 0.34), steelMat);
    hammerHead.position.z = 1.70;
    hammerHead.castShadow = true;
    group.add(hammerHead);
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.54, 4), glowMat);
    spearTip.userData.ignoreAO = true;
    spearTip.rotation.x = Math.PI / 2;
    spearTip.position.z = 2.16;
    group.add(spearTip);
    const stormRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 6, 18), glowMat);
    stormRing.userData.ignoreAO = true;
    stormRing.rotation.x = Math.PI / 2;
    stormRing.position.z = 1.70;
    group.add(stormRing);
    tipNode.position.set(0, 0, 2.44);
  } else if (id === 'sunforgecannon') {
    const chassis = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.02, 12), obsidianMat);
    chassis.rotation.x = Math.PI / 2;
    chassis.position.z = 0.56;
    chassis.castShadow = true;
    group.add(chassis);
    for (const zPos of [0.36, 0.68, 0.98]) {
      const solarCoil = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.026, 8, 18), goldMat);
      solarCoil.position.z = zPos;
      group.add(solarCoil);
    }
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), glowMat);
    sunCore.userData.ignoreAO = true;
    sunCore.position.z = 1.14;
    group.add(sunCore);
    const corona = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 20), glowMat);
    corona.userData.ignoreAO = true;
    corona.position.z = 1.14;
    group.add(corona);
    tipNode.position.set(0, 0, 1.24);
  }

  group.add(baseNode, tipNode);
  return { group, offhand, glowMat, baseNode, tipNode };
}

// Crisp 3D Target Lock-on Reticle rendered beneath & around the enemy nearest to mouse cursor
export function createLockReticle(tex) {
  const root = new THREE.Group();
  root.visible = false;
  root.userData.ignoreAO = true;

  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xffd266,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.88, 32), outerMat);
  outerRing.userData.ignoreAO = true;
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.04;
  root.add(outerRing);

  const ticks = new THREE.Group();
  ticks.position.y = 0.045;
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.34), outerMat);
    tick.userData.ignoreAO = true;
    tick.rotation.x = -Math.PI / 2;
    const a = (i * Math.PI) / 2;
    tick.position.set(Math.cos(a) * 0.96, 0, Math.sin(a) * 0.96);
    tick.rotation.z = -a;
    ticks.add(tick);
  }
  root.add(ticks);

  const diamond = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.softParticleTex,
    color: 0xffd266,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  }));
  diamond.userData.ignoreAO = true;
  diamond.scale.set(0.55, 0.55, 1);
  diamond.position.y = 2.15;
  root.add(diamond);

  return {
    root,
    outerMat,
    outerRing,
    ticks,
    diamond,
    update(time, targetEnemy, accentHex = 0xffd266) {
      if (!targetEnemy || targetEnemy.hp <= 0) {
        root.visible = false;
        return;
      }
      root.visible = true;
      outerMat.color.setHex(accentHex);
      diamond.material.color.setHex(accentHex);
      const rScale = Math.max(0.85, targetEnemy.radius * 1.45);
      const pulse = 1.0 + Math.sin(time * 7.5) * 0.06;
      root.position.set(targetEnemy.x, 0, targetEnemy.z);
      outerRing.scale.setScalar(rScale * pulse);
      ticks.scale.setScalar(rScale * pulse);
      ticks.rotation.y = time * 1.6;
      diamond.position.y = (targetEnemy.boss ? 3.1 : 2.15) + Math.sin(time * 5.5) * 0.08;
    }
  };
}

// 3D Weapon Pedestal tinted by the Weapon's FIXED RARITY COLOR (with special Boss Mythic Crown!)
export function createWeaponPedestal(weaponInst, mats, tex, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const rDef = WEAPON_RARITIES[weaponInst.rarity] || WEAPON_RARITIES.common;
  const rarityHex = rDef.hex;
  const isMythic = rDef.id === 'mythic' || !!weaponInst.bossOnly;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(isMythic ? 0.64 : 0.55, isMythic ? 0.84 : 0.72, 0.62, isMythic ? 12 : 8),
    isMythic ? (mats.obsidianArmor || mats.darkPlate) : mats.darkPlate
  );
  base.position.y = 0.31;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const rimMat = new THREE.MeshStandardMaterial({
    color: rarityHex,
    emissive: rarityHex,
    emissiveIntensity: isMythic ? 1.8 : 0.85,
    roughness: 0.25,
    metalness: 0.75
  });
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(isMythic ? 0.65 : 0.56, isMythic ? 0.05 : 0.04, 8, 20),
    rimMat
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.62;
  g.add(rim);

  const floatPivot = new THREE.Group();
  floatPivot.position.y = isMythic ? 1.44 : 1.32;
  const vis = buildWeaponVisuals(weaponInst, mats);
  vis.group.position.set(0, 0, -0.55);
  vis.group.rotation.set(-0.45, 0.3, 0.25);
  floatPivot.add(vis.group);

  if (isMythic) {
    const crownMat = new THREE.MeshBasicMaterial({
      color: 0xff5252,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.024, 6, 28), crownMat);
    crownRing.userData.ignoreAO = true;
    crownRing.rotation.x = Math.PI * 0.32;
    floatPivot.add(crownRing);
  }
  g.add(floatPivot);

  const beamMat = new THREE.MeshBasicMaterial({
    map: tex.godrayTex,
    color: rarityHex,
    transparent: true,
    opacity: rDef.beamOpacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(rDef.beamRadius, rDef.beamRadius * 1.85, rDef.beamHeight, 14, 1, true),
    beamMat
  );
  beam.userData.ignoreAO = true;
  beam.position.y = rDef.beamHeight * 0.52;
  g.add(beam);

  let floorRune = null;
  if (rDef.rank >= 3) {
    floorRune = new THREE.Mesh(
      new THREE.RingGeometry(0.76, isMythic ? 1.24 : 0.98, 28),
      new THREE.MeshBasicMaterial({
        color: rarityHex,
        transparent: true,
        opacity: isMythic ? 0.58 : 0.34,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    floorRune.userData.ignoreAO = true;
    floorRune.rotation.x = -Math.PI / 2;
    floorRune.position.y = 0.03;
    g.add(floorRune);
  }

  return { root: g, floatPivot, beam, floorRune };
}
