// Exact Modular Socket & Seam-Free Clearance Specification
// Ensures zero coplanar Z-fighting, zero wall/pillar clipping, zero floor-edge gaps,
// and unobstructed portals across arbitrary procedural room sizes and N/S/E/W door combinations.

export const GRID_STEP = 34;
export const WALL_THICK = 0.90;
export const WALL_HALF_T = WALL_THICK * 0.5;       // 0.45m
export const PORTAL_CLEAR_HALF = 2.40;             // 4.80m clear walkable doorway & corridor width
export const JAMB_INNER = 2.40;
export const JAMB_OUTER = 3.20;                    // 0.80m wide portal jamb pier
export const CORR_WALL_THICK = 0.56;               // [2.40 .. 2.96] -> inner face flush at 2.40m, outer tucked inside 3.20m jamb!
export const CORR_WALL_OFFSET = PORTAL_CLEAR_HALF + CORR_WALL_THICK * 0.5; // 2.68m
export const CORR_FLOOR_HALF_W = 2.56;             // Tucks 16cm underneath solid corridor walls & jamb piers -> zero floor void slit!
export const DOOR_KEEP_OUT_HALF_W = 3.30;          // Keep props/obstacles clear of portal width
export const DOOR_KEEP_OUT_DEPTH = 3.70;           // Keep props/obstacles clear 3.7m inside room from door

export const DIRS = [
  { key: 'N', dx: 0, dz: -1, opp: 'S', rotY: 0 },
  { key: 'S', dx: 0, dz: 1, opp: 'N', rotY: Math.PI },
  { key: 'E', dx: 1, dz: 0, opp: 'W', rotY: -Math.PI / 2 },
  { key: 'W', dx: -1, dz: 0, opp: 'E', rotY: Math.PI / 2 }
];

export const DIR_BY_KEY = Object.fromEntries(DIRS.map((d) => [d.key, d]));

export function createSeededRng(seed = Date.now()) {
  let s = (Number(seed) || 1) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function nextRng() {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isInsideDoorKeepOut(room, x, z, radius = 0.6) {
  const hw = DOOR_KEEP_OUT_HALF_W + radius;
  const dp = DOOR_KEEP_OUT_DEPTH + radius;
  if (room.doors.N && Math.abs(x - room.cx) < hw && z < room.cz - room.halfD + dp) return true;
  if (room.doors.S && Math.abs(x - room.cx) < hw && z > room.cz + room.halfD - dp) return true;
  if (room.doors.W && Math.abs(z - room.cz) < hw && x < room.cx - room.halfW + dp) return true;
  if (room.doors.E && Math.abs(z - room.cz) < hw && x > room.cx + room.halfW - dp) return true;
  return false;
}

export function pickLandmarkWall(room) {
  const openKeys = Object.keys(room.doors);
  if (openKeys.length === 1) {
    const opp = DIR_BY_KEY[openKeys[0]].opp;
    if (!room.doors[opp]) return opp;
  }
  for (const candidate of ['N', 'E', 'W', 'S']) {
    if (!room.doors[candidate]) return candidate;
  }
  return null;
}

export function auditDungeonSeamIntegrity(dungeon) {
  const issues = [];
  const { rooms, corridors, floorFootprints = [], wallSolids = [] } = dungeon;

  if (rooms.length > 0) {
    const visited = new Set([rooms[0].id]);
    const queue = [rooms[0]];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of Object.values(cur.doors)) {
        if (nb && !visited.has(nb.id)) {
          visited.add(nb.id);
          queue.push(nb);
        }
      }
    }
    if (visited.size !== rooms.length) {
      issues.push(`Disconnected rooms: reached ${visited.size}/${rooms.length}`);
    }
  }

  const eps = 0.005;
  for (let i = 0; i < floorFootprints.length; i++) {
    const a = floorFootprints[i];
    for (let j = i + 1; j < floorFootprints.length; j++) {
      const b = floorFootprints[j];
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox > eps && oz > eps) {
        issues.push(`Floor overlap (${ox.toFixed(3)}x${oz.toFixed(3)}) between ${a.tag} and ${b.tag}`);
      }
    }
  }

  for (const c of corridors) {
    if (c.span < 1.5) {
      issues.push(`Corridor span too short (${c.span.toFixed(2)}m) at ${c.id}`);
    }
    const samples = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const t of samples) {
      const sx = c.seamAX + (c.seamBX - c.seamAX) * t;
      const sz = c.seamAZ + (c.seamBZ - c.seamAZ) * t;
      if (!dungeon.isPointWalkable(sx, sz, 0.44)) {
        issues.push(`Walkway sample t=${t} blocked at ${c.id} (${sx.toFixed(2)},${sz.toFixed(2)})`);
      }
      for (const w of wallSolids) {
        if (sx > w.minX - 0.15 && sx < w.maxX + 0.15 && sz > w.minZ - 0.15 && sz < w.maxZ + 0.15) {
          issues.push(`Wall solid ${w.tag} intrudes into corridor path ${c.id}`);
        }
      }
    }
  }

  for (const r of rooms) {
    for (const col of r.colliders) {
      if (col.isCornerOrJamb) continue;
      if (isInsideDoorKeepOut(r, col.x, col.z, col.r * 0.45)) {
        issues.push(`Collider inside door keep-out in room ${r.id} (${r.type}) at (${col.x.toFixed(1)},${col.z.toFixed(1)})`);
      }
    }
    for (const prop of r.props) {
      if (isInsideDoorKeepOut(r, prop.x, prop.z, prop.r * 0.45)) {
        issues.push(`Prop inside door keep-out in room ${r.id} (${r.type})`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    roomCount: rooms.length,
    corridorCount: corridors.length,
    floorPatchCount: floorFootprints.length,
    issues
  };
}
