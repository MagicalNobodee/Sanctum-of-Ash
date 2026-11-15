// 4 Floors x 2 Independent Themes = 8 Complete Dungeon Biomes
// Standalone scene-asset registry designed for zero-conflict integration with gameplay progression.

export const BIOME_DEFS = [
  // ============================================================================
  // FLOOR I — 2 STYLES
  // ============================================================================
  {
    id: 'sunken_cathedral',
    depth: 1,
    variant: 'A',
    floorRoman: 'I',
    name: 'SUNKEN CATHEDRAL',
    cnName: '第一层 · 淹没圣堂',
    themeTag: '暴雨哥特圣堂',
    subtitle: 'Rain-drowned Gothic narthex of wet slate flagstones, bronze inlays & stormlit arches',
    archStyle: 'cathedral',
    sigilStyle: 'cathedral',
    liquidMode: 'water',
    lighting: {
      bgHex: 0x060a12,
      fogHex: 0x080d18,
      fogDensity: 0.0185,
      keyColor: 0xa4c6ff,
      keyIntensity: 3.6,
      keyOffset: [-13, 24, -11],
      fillColor: 0xff8c42,
      fillIntensity: 0.88,
      hemiSky: 0x5274ab,
      hemiGround: 0x26170c,
      hemiIntensity: 1.02,
      exposure: 1.18
    },
    envSky: {
      zenith: [0.06, 0.11, 0.23],
      horizon: [0.18, 0.25, 0.38],
      ground: [0.15, 0.09, 0.05],
      moon: [1.25, 1.50, 2.10],
      fire: [0.75, 0.36, 0.10]
    },
    palette: {
      floorBase: [31, 33, 38],
      floorVar: [16, 17, 19],
      floorMoss: [8, 22, 12],
      trimColor: [148, 112, 60],
      trimHex: 0xc99850,
      wallBase: [54, 59, 68],
      wallTintHex: 0x7e8796,
      pillarTintHex: 0x8d96a8,
      capTintHex: 0x9ea8ba,
      darkMetalHex: 0x2f3540,
      propPrimaryHex: 0x8d8374,
      propSecondaryHex: 0x4d3321,
      brazierCoreHex: 0xff7b29,
      brazierHaloHex: 0xffdf99,
      sanctuaryFlameHex: 0x55f2c8,
      bossFlameHex: 0xff4d1f,
      godrayHex: 0x7eaaff,
      godrayOpacity: 0.068,
      sigilHex: 0xff9436,
      bossSigilHex: 0xff3b1f,
      trapGlowHex: 0xff6a1a,
      decalHex: 0x1c080b,
      liquidTint: [0.82, 0.90, 1.00],
      veinEmissive: [0.0, 0.0, 0.0],
      puddleBias: 0.50,
      reflStrength: 0.86
    },
    roomDims: {
      start: [8.5, 8.5],
      combat1: [10.5, 10.5],
      combat2: [9.8, 9.8],
      elite: [11.5, 11.5],
      vault: [8.5, 8.5],
      sanctuary: [8.5, 8.5],
      boss: [12.8, 12.8]
    },
    roomNames: {
      start: ['FLOODED NARTHEX', 'Rain-slicked threshold of the sunken cathedral'],
      combat1: ['STORM-WEPT CLOISTER', 'Hollowed sentinels patrol the flooded flagstones'],
      combat2: ['DROWNED TRANSEPT', 'Cold rainwater pools beneath weeping arches'],
      elite: ['NAVE OF ASHES', 'Iron juggernauts & spike grates guard the inner seal'],
      vault: ['GILDED RELIQUARY', 'An untouched cathedral coffer gleams behind iron bars'],
      sanctuary: ['CHALICE SPRING', 'Sacred waters & a Crimson Pact await the bold'],
      boss: ['SANCTUM OF THE GATEKEEPER', 'High altar beneath the shattered rose window']
    }
  },

  {
    id: 'withered_roothollow',
    depth: 1,
    variant: 'B',
    floorRoman: 'I',
    name: 'WITHERED ROOTHOLLOW',
    cnName: '第一层 · 枯根地窟',
    themeTag: '古树盘根遗迹',
    subtitle: 'Subterranean ruin strangled by colossal petrified roots, glowing spores & emerald pools',
    archStyle: 'roothollow',
    sigilStyle: 'druidic',
    liquidMode: 'spore',
    lighting: {
      bgHex: 0x050e0a,
      fogHex: 0x071510,
      fogDensity: 0.019,
      keyColor: 0x8ef5c8,
      keyIntensity: 3.35,
      keyOffset: [-11, 24, -12],
      fillColor: 0xd4a24c,
      fillIntensity: 0.78,
      hemiSky: 0x3f8c6e,
      hemiGround: 0x1d180d,
      hemiIntensity: 1.08,
      exposure: 1.18
    },
    envSky: {
      zenith: [0.04, 0.16, 0.11],
      horizon: [0.12, 0.30, 0.22],
      ground: [0.12, 0.10, 0.05],
      moon: [0.95, 1.85, 1.38],
      fire: [0.45, 0.85, 0.36]
    },
    palette: {
      floorBase: [28, 34, 27],
      floorVar: [15, 18, 12],
      floorMoss: [24, 56, 26],
      trimColor: [118, 96, 54],
      trimHex: 0x8c7240,
      wallBase: [46, 52, 41],
      wallTintHex: 0x6f7a63,
      pillarTintHex: 0x675844,
      capTintHex: 0x7d8a6f,
      darkMetalHex: 0x3b3124,
      propPrimaryHex: 0x5c4329,
      propSecondaryHex: 0x3d5c3a,
      brazierCoreHex: 0x4ef2a1,
      brazierHaloHex: 0xc8ff9e,
      sanctuaryFlameHex: 0x7affdf,
      bossFlameHex: 0xa8ff3e,
      godrayHex: 0x8affba,
      godrayOpacity: 0.075,
      sigilHex: 0x56eb97,
      bossSigilHex: 0x9dff44,
      trapGlowHex: 0x66ff88,
      decalHex: 0x102112,
      liquidTint: [0.62, 1.05, 0.84],
      veinEmissive: [0.04, 0.22, 0.12],
      puddleBias: 0.52,
      reflStrength: 0.80
    },
    roomDims: {
      start: [8.8, 8.4],
      combat1: [10.8, 10.2],
      combat2: [9.6, 10.2],
      elite: [11.6, 11.2],
      vault: [8.6, 8.6],
      sanctuary: [8.8, 8.6],
      boss: [12.8, 12.6]
    },
    roomNames: {
      start: ['SUNKEN ROOT-THRESHOLD', 'Ancient taproots pierce the moss-slicked flagstones'],
      combat1: ['BRIAR-BOUND GALLERY', 'Spore-lit hollows stir with restless wardens'],
      combat2: ['MYCELIAL GROTTO', 'Bioluminescent pools shimmer beneath twisted bark'],
      elite: ['HEARTWOOD CROSSING', 'Thorn snares & petrified elders bar the inner hollow'],
      vault: ['AMBER HOARD', 'Relics slumber within a cradle of fossilized roots'],
      sanctuary: ['DEWSPRING GLADE', 'Living sap-waters & an Elder Root Pact await'],
      boss: ['CRADLE OF THE WITHERED TREE', 'Beneath the colossal severed heartwood crown']
    }
  },

  // ============================================================================
  // FLOOR II — 2 STYLES
  // ============================================================================
  {
    id: 'ossuary_catacomb',
    depth: 2,
    variant: 'A',
    floorRoman: 'II',
    name: 'BONE OSSUARY',
    cnName: '第二层 · 白骨墓窖',
    themeTag: '骸骨修道墓穴',
    subtitle: 'Pale bone-inlaid catacombs lined with skull alcoves, coffins & cold soulfire pyres',
    archStyle: 'ossuary',
    sigilStyle: 'necrotic',
    liquidMode: 'ectoplasm',
    lighting: {
      bgHex: 0x070b10,
      fogHex: 0x091017,
      fogDensity: 0.019,
      keyColor: 0x9ce8ff,
      keyIntensity: 3.45,
      keyOffset: [-12, 24, -10],
      fillColor: 0x64b5a6,
      fillIntensity: 0.82,
      hemiSky: 0x567d8c,
      hemiGround: 0x241f19,
      hemiIntensity: 1.05,
      exposure: 1.16
    },
    envSky: {
      zenith: [0.05, 0.11, 0.16],
      horizon: [0.16, 0.26, 0.30],
      ground: [0.14, 0.12, 0.09],
      moon: [1.10, 1.75, 1.95],
      fire: [0.30, 0.78, 0.82]
    },
    palette: {
      floorBase: [44, 42, 37],
      floorVar: [22, 20, 16],
      floorMoss: [12, 24, 24],
      trimColor: [178, 168, 146],
      trimHex: 0xc8bea6,
      wallBase: [66, 62, 54],
      wallTintHex: 0x9c9382,
      pillarTintHex: 0xb8ae99,
      capTintHex: 0xd0c6b0,
      darkMetalHex: 0x2c3238,
      propPrimaryHex: 0xcfc5b0,
      propSecondaryHex: 0x45382e,
      brazierCoreHex: 0x4ce4ff,
      brazierHaloHex: 0xd2fbff,
      sanctuaryFlameHex: 0x7effd4,
      bossFlameHex: 0x22f2c4,
      godrayHex: 0x99ecff,
      godrayOpacity: 0.065,
      sigilHex: 0x5be3ff,
      bossSigilHex: 0x35ffc8,
      trapGlowHex: 0x4ce8ff,
      decalHex: 0x141b1e,
      liquidTint: [0.72, 0.98, 1.05],
      veinEmissive: [0.03, 0.15, 0.19],
      puddleBias: 0.45,
      reflStrength: 0.74
    },
    roomDims: {
      start: [8.5, 8.6],
      combat1: [10.6, 10.4],
      combat2: [10.0, 9.8],
      elite: [11.6, 11.6],
      vault: [8.5, 8.5],
      sanctuary: [8.5, 8.5],
      boss: [12.8, 12.8]
    },
    roomNames: {
      start: ['SEPULCHER VESTIBULE', 'Ten thousand silent skulls watch from the mortar'],
      combat1: ['GALLERY OF MARROW', 'Soulfire flickers across bone-paved flagstones'],
      combat2: ['CRYPT OF THE UNNAMED', 'Sarcophagi crack open beneath cold mist'],
      elite: ['CHOIR OF SKULLS', 'Bone-pike grates & deathwardens guard the ossuary nave'],
      vault: ['IVORY RELIQUARY', 'Ancestral crowns gleam inside a ribcage coffer'],
      sanctuary: ['WELL OF QUIETUS', 'Pale spirit-waters & a Marrow Pact await'],
      boss: ['CATHEDRA OF BONES', 'Monumental skull-throne of the Blight Prelate']
    }
  },

  {
    id: 'plague_alchemica',
    depth: 2,
    variant: 'B',
    floorRoman: 'II',
    name: 'PLAGUE ALCHEMICA',
    cnName: '第二层 · 瘟疫工坊',
    themeTag: '黑铜皇家秘院',
    subtitle: 'Dark slate & burnished copper conservatory of swan-neck alembics, astrolabes & viridian elixirs',
    archStyle: 'alchemica',
    sigilStyle: 'alchemical',
    liquidMode: 'acid',
    lighting: {
      bgHex: 0x060a0f,
      fogHex: 0x091117,
      fogDensity: 0.0182,
      keyColor: 0x8ccad6,
      keyIntensity: 3.32,
      keyOffset: [-13, 24, -11],
      fillColor: 0xf29b45,
      fillIntensity: 1.08,
      hemiSky: 0x3d6470,
      hemiGround: 0x281a10,
      hemiIntensity: 1.05,
      exposure: 1.15
    },
    envSky: {
      zenith: [0.03, 0.08, 0.12],
      horizon: [0.11, 0.21, 0.25],
      ground: [0.19, 0.12, 0.05],
      moon: [0.86, 1.35, 1.48],
      fire: [0.96, 0.56, 0.16]
    },
    palette: {
      floorBase: [24, 28, 32],
      floorVar: [11, 13, 15],
      floorMoss: [8, 28, 26],
      trimColor: [196, 138, 74],
      trimHex: 0xc98a4b,
      wallBase: [38, 43, 48],
      wallTintHex: 0x6c7680,
      pillarTintHex: 0x55606a,
      capTintHex: 0xb6824c,
      darkMetalHex: 0x21272d,
      propPrimaryHex: 0x1ca88a,
      propSecondaryHex: 0x5e3c26,
      brazierCoreHex: 0x2ad4a2,
      brazierHaloHex: 0xffc870,
      sanctuaryFlameHex: 0x5effd8,
      bossFlameHex: 0x36e8b2,
      godrayHex: 0xdbe9e4,
      godrayOpacity: 0.056,
      sigilHex: 0xdba04b,
      bossSigilHex: 0x38e2b2,
      trapGlowHex: 0x32dca8,
      decalHex: 0x0c1b1a,
      liquidTint: [0.74, 0.96, 0.92],
      veinEmissive: [0.015, 0.085, 0.072],
      puddleBias: 0.46,
      reflStrength: 0.64
    },
    roomDims: {
      start: [8.8, 8.8],
      combat1: [10.6, 10.6],
      combat2: [10.0, 10.0],
      elite: [11.6, 11.6],
      vault: [8.6, 8.6],
      sanctuary: [8.8, 8.8],
      boss: [12.8, 12.8]
    },
    roomNames: {
      start: ['ROYAL APOTHECARY ATRIUM', 'Burnished copper alembics hum above octagonal slate'],
      combat1: ['RETORT CONSERVATORY', 'Swan-neck condensers gleam in warm gaslight & jade mist'],
      combat2: ['ELIXIR ARCHIVE', 'Caged specimen carboys line the dark wrought-iron gallery'],
      elite: ['ASTROLABE DISTILLERY', 'Pressurized copper towers & wardens guard the inner still'],
      vault: ['CHRYSOPOEIA TREASURY', 'Philosopher-forged relics rest within a brass armillary coffer'],
      sanctuary: ['PANACEA WELLSPRING', 'Clarified sovereign draught & a Transmutation Pact await'],
      boss: ['THE PHILOSOPHER\'S CRUCIBLE', 'Grand copper astrolabe & heart of the Royal Alchemica']
    }
  },

  // ============================================================================
  // FLOOR III — 2 STYLES
  // ============================================================================
  {
    id: 'ashen_foundry',
    depth: 3,
    variant: 'A',
    floorRoman: 'III',
    name: 'ASHEN FOUNDRY',
    cnName: '第三层 · 灰烬熔炉',
    themeTag: '地心铁水锻炉',
    subtitle: 'Cracked basalt forge-halls veined with glowing magma channels, iron buttresses & slag crucibles',
    archStyle: 'foundry',
    sigilStyle: 'forge',
    liquidMode: 'lava',
    lighting: {
      bgHex: 0x120705,
      fogHex: 0x190b08,
      fogDensity: 0.0185,
      keyColor: 0xffb987,
      keyIntensity: 3.45,
      keyOffset: [-12, 24, -11],
      fillColor: 0xff591c,
      fillIntensity: 1.12,
      hemiSky: 0x9e5b42,
      hemiGround: 0x2e1107,
      hemiIntensity: 1.06,
      exposure: 1.15
    },
    envSky: {
      zenith: [0.16, 0.06, 0.04],
      horizon: [0.38, 0.16, 0.08],
      ground: [0.28, 0.09, 0.03],
      moon: [2.05, 1.25, 0.72],
      fire: [1.15, 0.42, 0.08]
    },
    palette: {
      floorBase: [27, 24, 24],
      floorVar: [14, 12, 12],
      floorMoss: [42, 16, 8],
      trimColor: [168, 102, 52],
      trimHex: 0xd47c38,
      wallBase: [44, 40, 40],
      wallTintHex: 0x6e6564,
      pillarTintHex: 0x575254,
      capTintHex: 0x8a7568,
      darkMetalHex: 0x262326,
      propPrimaryHex: 0x4f433f,
      propSecondaryHex: 0x8c441e,
      brazierCoreHex: 0xff5e14,
      brazierHaloHex: 0xffd27a,
      sanctuaryFlameHex: 0xffb84d,
      bossFlameHex: 0xff3300,
      godrayHex: 0xff9a52,
      godrayOpacity: 0.072,
      sigilHex: 0xff7722,
      bossSigilHex: 0xff2e00,
      trapGlowHex: 0xff5500,
      decalHex: 0x170905,
      liquidTint: [1.20, 0.65, 0.30],
      veinEmissive: [1.35, 0.38, 0.04],
      puddleBias: 0.44,
      reflStrength: 0.62
    },
    roomDims: {
      start: [8.6, 8.6],
      combat1: [10.6, 10.6],
      combat2: [9.8, 9.8],
      elite: [11.6, 11.6],
      vault: [8.6, 8.6],
      sanctuary: [8.6, 8.6],
      boss: [13.0, 13.0]
    },
    roomNames: {
      start: ['SLAG-GATE VESTIBULE', 'Molten seams pulse beneath blackened basalt plates'],
      combat1: ['SMELTER CONCOURSE', 'Crucible sparks rain beside roaring iron columns'],
      combat2: ['QUENCHING CHAMBER', 'Searing steam rises from cracked forge channels'],
      elite: ['ANVIL OF TITANS', 'White-hot spike grates & armored juggernauts'],
      vault: ['INGOT BULLION VAULT', 'Masterwork relics locked within forged steel'],
      sanctuary: ['TEMPERED HEARTH', 'Hallowed ember-draught & an Iron Oath await'],
      boss: ['HEART OF THE GREAT FURNACE', 'Molten throne of the Furnace Colossus']
    }
  },

  {
    id: 'crimson_inquisition',
    depth: 3,
    variant: 'B',
    floorRoman: 'III',
    name: 'CRIMSON INQUISITION',
    cnName: '第三层 · 猩红刑庭',
    themeTag: '暗红铁笼刑殿',
    subtitle: 'Blood-mirrored red marble tribunal hung with wrought-iron cages, spikes & scarlet pyres',
    archStyle: 'inquisition',
    sigilStyle: 'inquisition',
    liquidMode: 'blood',
    lighting: {
      bgHex: 0x110508,
      fogHex: 0x17070c,
      fogDensity: 0.019,
      keyColor: 0xff9eb5,
      keyIntensity: 3.35,
      keyOffset: [-13, 24, -11],
      fillColor: 0xff2e4c,
      fillIntensity: 0.96,
      hemiSky: 0x8f485b,
      hemiGround: 0x240910,
      hemiIntensity: 1.04,
      exposure: 1.17
    },
    envSky: {
      zenith: [0.15, 0.04, 0.07],
      horizon: [0.34, 0.10, 0.15],
      ground: [0.20, 0.04, 0.06],
      moon: [1.85, 0.95, 1.15],
      fire: [1.05, 0.18, 0.26]
    },
    palette: {
      floorBase: [38, 22, 26],
      floorVar: [18, 10, 12],
      floorMoss: [46, 8, 14],
      trimColor: [164, 122, 74],
      trimHex: 0xb8844c,
      wallBase: [56, 36, 42],
      wallTintHex: 0x855c66,
      pillarTintHex: 0x6e4a54,
      capTintHex: 0x9c747e,
      darkMetalHex: 0x241d22,
      propPrimaryHex: 0x7a2432,
      propSecondaryHex: 0x3b2226,
      brazierCoreHex: 0xff2448,
      brazierHaloHex: 0xff9eb0,
      sanctuaryFlameHex: 0xff7096,
      bossFlameHex: 0xff0f35,
      godrayHex: 0xff6b88,
      godrayOpacity: 0.066,
      sigilHex: 0xff2e52,
      bossSigilHex: 0xff0a30,
      trapGlowHex: 0xff1e42,
      decalHex: 0x2b040a,
      liquidTint: [1.08, 0.28, 0.36],
      veinEmissive: [0.22, 0.02, 0.04],
      puddleBias: 0.51,
      reflStrength: 0.88
    },
    roomDims: {
      start: [8.5, 8.5],
      combat1: [10.6, 10.4],
      combat2: [9.8, 10.0],
      elite: [11.6, 11.6],
      vault: [8.5, 8.5],
      sanctuary: [8.5, 8.5],
      boss: [12.8, 12.8]
    },
    roomNames: {
      start: ['PENITENT VESTIBULE', 'Scarlet mirrors pool across dark marble tiles'],
      combat1: ['HALL OF IRON CAGES', 'Suspended shackles sway above crimson flagstones'],
      combat2: ['CONFESSIONAL GAUNTLET', 'Inquisitor blades gleam in the scarlet gloom'],
      elite: ['TRIBUNAL OF THORNS', 'Guillotine grates & ironclad executioners'],
      vault: ['CONFISCATED RELIQUARY', 'Forbidden artifacts sealed behind spiked iron'],
      sanctuary: ['CHALICE OF ABSOLUTION', 'Sanguine draught & a Martyrdom Pact await'],
      boss: ['HIGH COURT OF CRIMSON ASH', 'Judgment dais beneath the iron maiden arch']
    }
  },

  // ============================================================================
  // FLOOR IV — 2 STYLES
  // ============================================================================
  {
    id: 'obsidian_throne',
    depth: 4,
    variant: 'A',
    floorRoman: 'IV',
    name: 'OBSIDIAN THRONE',
    cnName: '第四层 · 黑曜王座',
    themeTag: '黑曜鎏金王廷',
    subtitle: 'Mirror-polished black obsidian palace inlaid with sovereign gold & imperial violet flame',
    archStyle: 'obsidian',
    sigilStyle: 'royal',
    liquidMode: 'obsidian',
    lighting: {
      bgHex: 0x0b0614,
      fogHex: 0x10081c,
      fogDensity: 0.0178,
      keyColor: 0xd5b3ff,
      keyIntensity: 3.55,
      keyOffset: [-13, 25, -11],
      fillColor: 0xffbe55,
      fillIntensity: 0.95,
      hemiSky: 0x6f52a8,
      hemiGround: 0x21150d,
      hemiIntensity: 1.06,
      exposure: 1.18
    },
    envSky: {
      zenith: [0.08, 0.04, 0.18],
      horizon: [0.22, 0.14, 0.36],
      ground: [0.16, 0.11, 0.05],
      moon: [0.98, 0.78, 1.42],
      fire: [0.62, 0.45, 0.16]
    },
    palette: {
      floorBase: [18, 17, 24],
      floorVar: [10, 9, 14],
      floorMoss: [28, 16, 42],
      trimColor: [224, 178, 84],
      trimHex: 0xe8b954,
      wallBase: [28, 26, 38],
      wallTintHex: 0x585273,
      pillarTintHex: 0x423d59,
      capTintHex: 0xd9ac52,
      darkMetalHex: 0x1a1826,
      propPrimaryHex: 0x302945,
      propSecondaryHex: 0xd4a448,
      brazierCoreHex: 0xb95cff,
      brazierHaloHex: 0xffdf94,
      sanctuaryFlameHex: 0x70ffe8,
      bossFlameHex: 0xd442ff,
      godrayHex: 0xc99eff,
      godrayOpacity: 0.070,
      sigilHex: 0xf0b94a,
      bossSigilHex: 0xc84dff,
      trapGlowHex: 0xc454ff,
      decalHex: 0x160824,
      liquidTint: [0.90, 0.80, 1.10],
      veinEmissive: [0.05, 0.02, 0.10],
      puddleBias: 0.48,
      reflStrength: 0.48
    },
    roomDims: {
      start: [8.8, 8.8],
      combat1: [10.8, 10.8],
      combat2: [10.0, 10.0],
      elite: [11.8, 11.8],
      vault: [8.8, 8.8],
      sanctuary: [8.8, 8.8],
      boss: [13.0, 13.0]
    },
    roomNames: {
      start: ['IMPERIAL PORTICO', 'Polished obsidian mirrors gleam with gilded crests'],
      combat1: ['HALL OF SOVEREIGNS', 'Royal lances & violet chalices flank the black glass'],
      combat2: ['CROWN ARCHIVE', 'Oathbound champions guard the gilded vaults'],
      elite: ['PRAETORIAN GRAND NAVE', 'Obsidian spear-plates & dread lords bar the throne'],
      vault: ['TREASURY OF KINGS', 'Sovereign regalia shines atop stepped black glass'],
      sanctuary: ['ROYAL LIBATION COURT', 'Ambrosial font & a Sovereign Blood Oath await'],
      boss: ['THRONE OF ETERNAL ASH', 'Seat of Sovereign Malakor beneath the golden sun-crest']
    }
  },

  {
    id: 'astral_rift',
    depth: 4,
    variant: 'B',
    floorRoman: 'IV',
    name: 'ASTRAL RIFT',
    cnName: '第四层 · 星界裂隙',
    themeTag: '虚空星轨神殿',
    subtitle: 'Shattered celestial temple etched with luminous star-conduits, floating monoliths & void crystals',
    archStyle: 'astral',
    sigilStyle: 'celestial',
    liquidMode: 'astral',
    lighting: {
      bgHex: 0x040816,
      fogHex: 0x060d22,
      fogDensity: 0.0175,
      keyColor: 0x7ce8ff,
      keyIntensity: 3.60,
      keyOffset: [-12, 25, -12],
      fillColor: 0xa86bff,
      fillIntensity: 0.98,
      hemiSky: 0x4588d6,
      hemiGround: 0x160e2e,
      hemiIntensity: 1.08,
      exposure: 1.18
    },
    envSky: {
      zenith: [0.02, 0.06, 0.22],
      horizon: [0.08, 0.22, 0.44],
      ground: [0.10, 0.05, 0.24],
      moon: [1.05, 1.95, 2.45],
      fire: [0.58, 0.34, 1.15]
    },
    palette: {
      floorBase: [18, 24, 38],
      floorVar: [10, 14, 22],
      floorMoss: [16, 42, 68],
      trimColor: [186, 208, 245],
      trimHex: 0x9ad4ff,
      wallBase: [28, 36, 56],
      wallTintHex: 0x5c739e,
      pillarTintHex: 0x4e648f,
      capTintHex: 0xb8d8ff,
      darkMetalHex: 0x182236,
      propPrimaryHex: 0x52d8ff,
      propSecondaryHex: 0x8f5cff,
      brazierCoreHex: 0x4de8ff,
      brazierHaloHex: 0xd69eff,
      sanctuaryFlameHex: 0x78ffd6,
      bossFlameHex: 0x8c52ff,
      godrayHex: 0x6ee2ff,
      godrayOpacity: 0.078,
      sigilHex: 0x58e4ff,
      bossSigilHex: 0xa855ff,
      trapGlowHex: 0x4ce4ff,
      decalHex: 0x0a142e,
      liquidTint: [0.68, 1.02, 1.25],
      veinEmissive: [0.12, 0.52, 0.95],
      puddleBias: 0.47,
      reflStrength: 0.88
    },
    roomDims: {
      start: [8.8, 8.8],
      combat1: [10.8, 10.6],
      combat2: [10.0, 10.0],
      elite: [11.8, 11.8],
      vault: [8.8, 8.8],
      sanctuary: [8.8, 8.8],
      boss: [13.0, 13.0]
    },
    roomNames: {
      start: ['STARFALL NEXUS', 'Constellation conduits pulse across void-cut stone'],
      combat1: ['ORBITAL GALLERY', 'Split monoliths hover beside shimmering star-rifts'],
      combat2: ['ECLIPSE OBSERVATORY', 'Arcane prisms refract the cold abyssal light'],
      elite: ['CONFLUENCE OF HORIZONS', 'Void-crystal spikes & astral wardens guard the rift'],
      vault: ['CELESTIAL RELIQUARY', 'Star-forged artifacts levitate within golden rings'],
      sanctuary: ['NEBULA WELLSPRING', 'Luminous starlight & an Astral Covenant await'],
      boss: ['SINGULARITY SANCTUM', 'Beneath the spinning astrolabe at the edge of time']
    }
  }
];

export const BIOME_BY_ID = Object.fromEntries(BIOME_DEFS.map((b) => [b.id, b]));

export const BIOMES_BY_FLOOR = {
  1: BIOME_DEFS.filter((b) => b.depth === 1),
  2: BIOME_DEFS.filter((b) => b.depth === 2),
  3: BIOME_DEFS.filter((b) => b.depth === 3),
  4: BIOME_DEFS.filter((b) => b.depth === 4)
};

export function pickBiomeForFloor(depth = 1, options = {}) {
  if (options.biomeId && BIOME_BY_ID[options.biomeId]) {
    return BIOME_BY_ID[options.biomeId];
  }
  const list = BIOMES_BY_FLOOR[depth] || BIOMES_BY_FLOOR[1];
  if (options.variant) {
    const match = list.find((b) => b.variant === options.variant);
    if (match) return match;
  }
  const idx = typeof options.rng === 'function'
    ? Math.floor(options.rng() * list.length)
    : Math.floor(Math.random() * list.length);
  return list[Math.max(0, Math.min(list.length - 1, idx))];
}
