import { GRID_STEP, DIRS, createSeededRng } from './seam_spec.js';

export const ROOM_TEMPLATES = {
  start_narthex: {
    id: 'start_narthex',
    role: 'start',
    halfW: 8.6,
    halfD: 8.6,
    layout: 'start_forge'
  },
  combat_twin_pillars: {
    id: 'combat_twin_pillars',
    role: 'combat',
    halfW: 10.6,
    halfD: 9.8,
    layout: 'twin_pillars'
  },
  combat_long_gauntlet: {
    id: 'combat_long_gauntlet',
    role: 'combat',
    halfW: 9.2,
    halfD: 11.2,
    layout: 'spike_gauntlet'
  },
  combat_wide_colonnade: {
    id: 'combat_wide_colonnade',
    role: 'combat',
    halfW: 11.4,
    halfD: 9.4,
    layout: 'quad_colonnade'
  },
  combat_ritual_ring: {
    id: 'combat_ritual_ring',
    role: 'combat',
    halfW: 10.2,
    halfD: 10.2,
    layout: 'ritual_ring'
  },
  elite_bastion: {
    id: 'elite_bastion',
    role: 'elite',
    halfW: 11.4,
    halfD: 11.4,
    layout: 'elite_bastion'
  },
  elite_crucible: {
    id: 'elite_crucible',
    role: 'elite',
    halfW: 11.8,
    halfD: 10.6,
    layout: 'elite_crucible'
  },
  vault_reliquary: {
    id: 'vault_reliquary',
    role: 'vault',
    halfW: 8.4,
    halfD: 8.4,
    layout: 'vault_dais'
  },
  sanctuary_spring: {
    id: 'sanctuary_spring',
    role: 'sanctuary',
    halfW: 8.8,
    halfD: 8.8,
    layout: 'sanctuary_triad'
  },
  boss_sanctum: {
    id: 'boss_sanctum',
    role: 'boss',
    halfW: 12.4,
    halfD: 12.4,
    layout: 'boss_cathedra'
  }
};

const COMBAT_POOL = [
  ROOM_TEMPLATES.combat_twin_pillars,
  ROOM_TEMPLATES.combat_long_gauntlet,
  ROOM_TEMPLATES.combat_wide_colonnade,
  ROOM_TEMPLATES.combat_ritual_ring
];

const ELITE_POOL = [
  ROOM_TEMPLATES.elite_bastion,
  ROOM_TEMPLATES.elite_crucible
];

function pickOne(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function shuffledDirs(rng, avoidSouth = false) {
  const pool = [...DIRS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (avoidSouth) {
    pool.sort((a, b) => (a.key === 'S' ? 1 : 0) - (b.key === 'S' ? 1 : 0));
  }
  return pool;
}

export function generateRandomDungeonGraph({
  biome,
  seed = null,
  rng: externalRng = null,
  targetRoomCount = 8,
  loopChance = 0.55
} = {}) {
  const actualSeed = seed !== null ? seed : Math.floor(Math.random() * 900000 + 100000);
  const rng = externalRng || createSeededRng(actualSeed);

  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = new Map();
    const keyOf = (gx, gz) => `${gx},${gz}`;
    const rooms = [];

    const placeNode = (gx, gz, type, template, namePair) => {
      const jitterW = type === 'combat' ? (rng() < 0.5 ? -0.2 : 0.2) : 0;
      const jitterD = type === 'combat' ? (rng() < 0.5 ? 0.2 : -0.2) : 0;
      const node = {
        id: rooms.length,
        gx,
        gz,
        cx: gx * GRID_STEP,
        cz: gz * GRID_STEP,
        halfW: Number((template.halfW + jitterW).toFixed(2)),
        halfD: Number((template.halfD + jitterD).toFixed(2)),
        type,
        templateId: template.id,
        layout: template.layout,
        title: namePair[0],
        subtitle: namePair[1],
        biomeId: biome.id,
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
      grid.set(keyOf(gx, gz), node);
      rooms.push(node);
      return node;
    };

    const connect = (a, b, dir) => {
      a.doors[dir.key] = b;
      b.doors[dir.opp] = a;
    };

    const names = biome.roomNames;
    const rStart = placeNode(0, 0, 'start', ROOM_TEMPLATES.start_narthex, names.start);

    let cur = rStart;
    const spineRoles = ['combat1', 'elite'];
    if (targetRoomCount >= 8) spineRoles.splice(1, 0, 'combat2');

    let spineOk = true;
    for (let s = 0; s < spineRoles.length; s++) {
      const roleKey = spineRoles[s];
      let nextCell = null;
      let chosenDir = null;
      for (const d of shuffledDirs(rng, true)) {
        if (cur === rStart && d.key === 'S') continue;
        const nx = cur.gx + d.dx;
        const nz = cur.gz + d.dz;
        if (nz > 1) continue;
        if (!grid.has(keyOf(nx, nz))) {
          nextCell = { gx: nx, gz: nz };
          chosenDir = d;
          break;
        }
      }
      if (!nextCell) {
        spineOk = false;
        break;
      }
      const isElite = roleKey === 'elite';
      const tpl = isElite ? pickOne(ELITE_POOL, rng) : pickOne(COMBAT_POOL, rng);
      const nPair = isElite ? names.elite : (roleKey === 'combat1' ? names.combat1 : names.combat2);
      const created = placeNode(nextCell.gx, nextCell.gz, isElite ? 'elite' : 'combat', tpl, nPair);
      connect(cur, created, chosenDir);
      cur = created;
    }
    if (!spineOk) continue;

    const rElite = cur;
    let bossPlaced = null;
    for (const d of shuffledDirs(rng, true)) {
      // Never place boss to the South of Elite so Boss sanctum's north/east/west wall stays grand
      if (d.key === 'S') continue;
      const bx = rElite.gx + d.dx;
      const bz = rElite.gz + d.dz;
      if (grid.has(keyOf(bx, bz))) continue;
      if (Math.abs(bx - rStart.gx) + Math.abs(bz - rStart.gz) === 1) continue;
      bossPlaced = placeNode(bx, bz, 'boss', ROOM_TEMPLATES.boss_sanctum, names.boss);
      connect(rElite, bossPlaced, d);
      break;
    }
    if (!bossPlaced) continue;

    const branchQueue = [
      { type: 'vault', tpl: ROOM_TEMPLATES.vault_reliquary, namePair: names.vault },
      { type: 'sanctuary', tpl: ROOM_TEMPLATES.sanctuary_spring, namePair: names.sanctuary }
    ];
    while (rooms.length + branchQueue.length < targetRoomCount) {
      branchQueue.push({
        type: 'combat',
        tpl: pickOne(COMBAT_POOL, rng),
        namePair: names.combat2
      });
    }

    let branchesOk = true;
    for (const spec of branchQueue) {
      const nonStart = rooms.filter((r) => r.type !== 'boss' && r.type !== 'start');
      for (let i = nonStart.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [nonStart[i], nonStart[j]] = [nonStart[j], nonStart[i]];
      }
      const candidates = [...nonStart, rStart];

      let attached = false;
      for (const parent of candidates) {
        for (const d of shuffledDirs(rng, false)) {
          if (parent === rStart && d.key === 'S') continue;
          const nx = parent.gx + d.dx;
          const nz = parent.gz + d.dz;
          if (nz > 1) continue;
          if (grid.has(keyOf(nx, nz))) continue;
          const child = placeNode(nx, nz, spec.type, spec.tpl, spec.namePair);
          connect(parent, child, d);
          attached = true;
          break;
        }
        if (attached) break;
      }
      if (!attached) {
        branchesOk = false;
        break;
      }
    }
    if (!branchesOk) continue;

    for (const r of rooms) {
      if (r.type === 'boss' || r.type === 'start') continue;
      for (const d of DIRS) {
        if (r.doors[d.key]) continue;
        const nb = grid.get(keyOf(r.gx + d.dx, r.gz + d.dz));
        if (!nb || nb.type === 'boss' || nb.type === 'start') continue;
        if (rng() < loopChance) {
          connect(r, nb, d);
        }
      }
    }

    let combatIdx = 0;
    for (const r of rooms) {
      if (r.type === 'combat') {
        combatIdx++;
        r.spawns = combatIdx === 1
          ? [{ type: 'thrall', count: 5 }, { type: 'stalker', count: 2 }, { type: 'acolyte', count: 2 }]
          : [{ type: 'thrall', count: 5 }, { type: 'stalker', count: 3 }, { type: 'acolyte', count: 2 }, { type: 'juggernaut', count: 1 }];
      } else if (r.type === 'elite') {
        r.spawns = [
          { type: 'thrall', count: 5 },
          { type: 'stalker', count: 3 },
          { type: 'acolyte', count: 2 },
          { type: 'juggernaut', count: 2 }
        ];
      } else if (r.type === 'boss') {
        r.spawns = [
          { type: 'warden', count: 1 },
          { type: 'acolyte', count: 2 },
          { type: 'thrall', count: 2 }
        ];
      }
    }

    return { seed: actualSeed, rooms };
  }

  throw new Error('Failed to generate valid procedural dungeon graph');
}

export function serializeDungeonBlueprint(rooms) {
  if (!Array.isArray(rooms)) return null;
  return rooms.map((r) => ({
    id: r.id,
    gx: r.gx,
    gz: r.gz,
    cx: r.cx,
    cz: r.cz,
    halfW: r.halfW,
    halfD: r.halfD,
    type: r.type,
    templateId: r.templateId,
    layout: r.layout,
    title: r.title,
    subtitle: r.subtitle,
    biomeId: r.biomeId,
    doors: Object.fromEntries(
      Object.entries(r.doors || {}).map(([dirKey, nb]) => [dirKey, typeof nb === 'number' ? nb : nb.id])
    ),
    spawns: (r.spawns || []).map((s) => ({ type: s.type, count: s.count }))
  }));
}

export function deserializeDungeonBlueprint(blueprint) {
  if (!Array.isArray(blueprint) || blueprint.length === 0) return null;
  const byId = new Map();
  const rooms = blueprint.map((raw) => {
    const node = {
      id: raw.id,
      gx: raw.gx,
      gz: raw.gz,
      cx: raw.cx,
      cz: raw.cz,
      halfW: raw.halfW,
      halfD: raw.halfD,
      type: raw.type,
      templateId: raw.templateId,
      layout: raw.layout,
      title: raw.title,
      subtitle: raw.subtitle,
      biomeId: raw.biomeId,
      doors: {},
      visited: raw.type === 'start',
      cleared: raw.type === 'start' || raw.type === 'vault' || raw.type === 'sanctuary',
      locked: false,
      spawns: (raw.spawns || []).map((s) => ({ type: s.type, count: s.count })),
      braziers: [],
      colliders: [],
      traps: [],
      props: [],
      interactables: []
    };
    byId.set(node.id, node);
    return node;
  });
  blueprint.forEach((raw, idx) => {
    const room = rooms[idx];
    for (const [dirKey, nbId] of Object.entries(raw.doors || {})) {
      const nb = byId.get(nbId);
      if (nb) room.doors[dirKey] = nb;
    }
  });
  return rooms;
}
