export const BOON_POOL = [
  {
    id: 'might_sigil',
    name: 'Oath of Might',
    tier: 'MIGHT SIGIL',
    color: '#ff8e47',
    glyph: 'sword',
    desc() {
      return '+7% Base All-Weapon & Skill Damage (stacks additively without limit).';
    },
    apply(s) {
      s.dmgMult = +((s.dmgMult || 1) + 0.07).toFixed(4);
    }
  },
  {
    id: 'zephyr_grip',
    name: 'Gale Gauntlet',
    tier: 'HASTE SIGIL',
    color: '#6ff0d0',
    glyph: 'wind',
    desc() {
      return '+5% Melee Swing & Ranged Fire Speed (stacks additively).';
    },
    apply(s) {
      s.atkSpeed = +((s.atkSpeed || 1) + 0.05).toFixed(4);
    }
  },
  {
    id: 'eagle_eye',
    name: 'Hawkeye Seal',
    tier: 'PRECISION SIGIL',
    color: '#7ce8ff',
    glyph: 'target',
    desc() {
      return '+4% Critical Hit Chance (excess above 100% converts into Critical Damage).';
    },
    apply(s) {
      s.critChance = +((s.critChance || 0) + 0.04).toFixed(4);
    }
  },
  {
    id: 'execution_edge',
    name: 'Verdict Edge',
    tier: 'LETHALITY SIGIL',
    color: '#f3c669',
    glyph: 'crescent',
    desc() {
      return '+14% Critical Hit Damage Multiplier.';
    },
    apply(s) {
      s.critMult = +((s.critMult || 1.75) + 0.14).toFixed(4);
    }
  },
  {
    id: 'vital_vessel',
    name: 'Undying Vitality',
    tier: 'LIFE SIGIL',
    color: '#ff6b85',
    glyph: 'heart',
    desc() {
      return '+22 Max Vitality and immediately restore 22 HP.';
    },
    apply(s) {
      s.maxHp += 22;
      s.hp = Math.min(s.maxHp, s.hp + 22);
    }
  },
  {
    id: 'astral_ward',
    name: 'Starlight Ward',
    tier: 'WARD SIGIL',
    color: '#63dcff',
    glyph: 'shield',
    shieldOnly: true,
    desc() {
      return '+18 Max Shield Capacity.';
    },
    apply(s) {
      if (s.classId === 'crimson_flagellant') {
        s.maxHp += 28;
        s.hp = Math.min(s.maxHp, s.hp + 28);
      } else {
        s.maxShield = (s.maxShield || 0) + 18;
      }
    }
  },
  {
    id: 'aether_capacitor',
    name: 'Aether Reflux',
    tier: 'RECHARGE SIGIL',
    color: '#88b8ff',
    glyph: 'bolt',
    shieldOnly: true,
    desc() {
      return '+12% Out-of-Combat Shield Recharge Rate and -0.12s Delay.';
    },
    apply(s) {
      if (s.classId === 'crimson_flagellant') {
        s.vampKill = (s.vampKill || 0) + 2;
      } else {
        s.shieldRegenRate = +((s.shieldRegenRate || 5) * 1.12).toFixed(2);
        s.shieldRegenDelay = Math.max(3.6, +((s.shieldRegenDelay || 5.2) - 0.12).toFixed(2));
      }
    }
  },
  {
    id: 'iron_hide',
    name: 'Iron Bastion',
    tier: 'ARMOR SIGIL',
    color: '#b8c9e6',
    glyph: 'anvil',
    desc() {
      return '+3.5% Damage Reduction (stacks smoothly up to 60% cap).';
    },
    apply(s) {
      const cur = s.dmgReduction || 0;
      const next = cur + 0.035 * Math.max(0.35, 1 - cur * 0.85);
      s.dmgReduction = Math.min(0.60, +next.toFixed(4));
    }
  },
  {
    id: 'wind_stride',
    name: 'Phantom Stride',
    tier: 'AGILITY SIGIL',
    color: '#7ef7d4',
    glyph: 'wing',
    desc() {
      return '+4.5% Movement Speed (stacks up to +45%).';
    },
    apply(s) {
      if (!s.baseMoveSpeed) s.baseMoveSpeed = s.moveSpeed || 6.9;
      s.moveSpeedBonusPct = Math.min(0.45, +((s.moveSpeedBonusPct || 0) + 0.045).toFixed(4));
      s.moveSpeed = +(s.baseMoveSpeed * (1 + s.moveSpeedBonusPct)).toFixed(3);
    }
  },
  {
    id: 'hourglass_rune',
    name: 'Chrono Hourglass',
    tier: 'FOCUS SIGIL',
    color: '#d299ff',
    glyph: 'hourglass',
    desc() {
      return '+7% Cooldown Recovery Speed for Weapon Skills & Class Ultimate.';
    },
    apply(s) {
      if (!s.baseArcCdMult) s.baseArcCdMult = s.arcCdMult || 1.0;
      s.skillHaste = +((s.skillHaste || 0) + 0.07).toFixed(4);
      s.arcCdMult = Math.max(0.45, +(s.baseArcCdMult / (1 + s.skillHaste)).toFixed(4));
    }
  },
  {
    id: 'shadow_spur',
    name: 'Rift Spur',
    tier: 'DASH SIGIL',
    color: '#b47cff',
    glyph: 'wing',
    desc() {
      return '+7% Shadow Dash Cooldown Recovery & brief post-dash speed boost.';
    },
    apply(s) {
      if (!s.baseDashCdMult) s.baseDashCdMult = s.dashCdMult || 1.0;
      s.dashHaste = +((s.dashHaste || 0) + 0.07).toFixed(4);
      s.dashCdMult = Math.max(0.46, +(s.baseDashCdMult / (1 + s.dashHaste)).toFixed(4));
      s.dashStrideBoost = Math.min(0.30, +((s.dashStrideBoost || 0) + 0.06).toFixed(3));
    }
  },
  {
    id: 'sunder_crest',
    name: 'Sundering Crest',
    tier: 'BREAKER SIGIL',
    color: '#ffd257',
    glyph: 'anvil',
    desc() {
      return '+18% Bonus Damage against Enemy Shields.';
    },
    apply(s) {
      s.shieldBreakMult = +((s.shieldBreakMult || 1.0) + 0.18).toFixed(3);
    }
  },
  {
    id: 'blood_thirst',
    name: 'Sanguine Thirst',
    tier: 'BLOOD SIGIL',
    color: '#ef4455',
    glyph: 'chalice',
    desc() {
      return 'Restore +2 HP whenever you slay an enemy.';
    },
    apply(s) {
      s.vampKill = (s.vampKill || 0) + 2;
    }
  },
  {
    id: 'elixir_craft',
    name: 'Crimson Distillation',
    tier: 'ALCHEMY SIGIL',
    color: '#ff8da1',
    glyph: 'flask',
    desc() {
      return '+5% Max HP restored by Elixirs (every 3 stacks grants +1 Max Elixir).';
    },
    apply(s) {
      s.flaskHealBonus = +((s.flaskHealBonus || 0) + 0.05).toFixed(3);
      s.elixirStacks = (s.elixirStacks || 0) + 1;
      if (s.elixirStacks % 3 === 0) {
        s.maxFlasks = (s.maxFlasks || 4) + 1;
        s.flasks = Math.min(s.maxFlasks, (s.flasks || 0) + 1);
      }
    }
  },
  {
    id: 'cinder_brand',
    name: 'Ember Fuse',
    tier: 'PYRE SIGIL',
    color: '#ff7b29',
    glyph: 'flame',
    desc() {
      return 'Attacks ignite foes for +9 base Burn DPS over 2.5s (scales with Damage).';
    },
    apply(s) {
      s.burnDps = (s.burnDps || 0) + 9;
    }
  },
  {
    id: 'storm_resonator',
    name: 'Arcane Lightning',
    tier: 'STORM SIGIL',
    color: '#5ec2ff',
    glyph: 'bolt',
    desc() {
      return 'Every 3rd hit arcs Chain Lightning for +16 base damage (scales with Damage).';
    },
    apply(s) {
      s.chainLightning = (s.chainLightning || 0) + 16;
    }
  },
  {
    id: 'frost_edge',
    name: 'Rimefrost Edge',
    tier: 'FROST SIGIL',
    color: '#80e5ff',
    glyph: 'snowflake',
    desc() {
      return 'Attacks inflict 0.85s Chill and deal +5% bonus damage to slowed/chilled foes.';
    },
    apply(s) {
      s.boonChillDur = Math.max(s.boonChillDur || 0, 0.85);
      s.chilledDmgBonus = +((s.chilledDmgBonus || 0) + 0.05).toFixed(3);
    }
  },
  {
    id: 'avarice_seal',
    name: 'Covenant of Greed',
    tier: 'WEALTH SIGIL',
    color: '#ffd978',
    glyph: 'crown',
    desc() {
      return '+12% Soul Cinder drops from all sources and gain +20 Soul Cinders now.';
    },
    apply(s) {
      s.cinderGainMult = +((s.cinderGainMult || 1.0) + 0.12).toFixed(3);
      s.cinders = (s.cinders || 0) + 20;
    }
  },
  {
    id: 'astral_reservoir',
    name: 'Astral Reservoir',
    tier: 'AETHER SIGIL',
    color: '#d89eff',
    glyph: 'crystal',
    desc() {
      return '+25 Max Aether Capacity and immediately restore 25 Aether.';
    },
    apply(s) {
      s.maxEnergy = (s.maxEnergy || 200) + 25;
      s.energy = Math.min(s.maxEnergy, (s.energy ?? s.maxEnergy) + 25);
    }
  },
  {
    id: 'aether_siphon',
    name: 'Aether Siphon',
    tier: 'SIPHON SIGIL',
    color: '#c084fc',
    glyph: 'chalice',
    desc() {
      return '+15% Aether gained from all sources and restore +1.5 Aether on enemy kill.';
    },
    apply(s) {
      s.energyGainMult = +((s.energyGainMult || 1.0) + 0.15).toFixed(3);
      s.energyOnKill = +((s.energyOnKill || 0) + 1.5).toFixed(2);
    }
  },
  {
    id: 'arcane_thrift',
    name: 'Arcane Conduit',
    tier: 'CONDUIT SIGIL',
    color: '#e879f9',
    glyph: 'target',
    desc() {
      return '+12% chance for Ranged shots & skills to cost 0 Aether (max 60%) and +5% Ranged DMG.';
    },
    apply(s) {
      s.freeShotChance = Math.min(0.60, +((s.freeShotChance || 0) + 0.12).toFixed(3));
      s.rangedDmgMult = +((s.rangedDmgMult || 1.0) + 0.05).toFixed(4);
    }
  }
];

export const BOON_BY_ID = Object.fromEntries(BOON_POOL.map((b) => [b.id, b]));

export function pickThreeBoons(takenIds, boonScale = 1.0, rarityLabel = 'SANCTUM', opts = {}) {
  const excludeCurrent = opts.excludeIds ? new Set(opts.excludeIds) : null;
  const isNoShieldClass = opts.classId === 'crimson_flagellant';
  let candidates = BOON_POOL.filter((b) => !(isNoShieldClass && b.shieldOnly));
  if (excludeCurrent && excludeCurrent.size > 0) {
    const filtered = candidates.filter((b) => !excludeCurrent.has(b.id));
    if (filtered.length >= 3) candidates = filtered;
  }
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((b) => ({
    ...b,
    displayTier: `${rarityLabel} · ${b.tier}`,
    displayDesc: typeof b.desc === 'function' ? b.desc(1.0) : b.desc,
    triggerApply(hero) {
      if (!hero.boonStacks) hero.boonStacks = {};
      hero.boonStacks[b.id] = (hero.boonStacks[b.id] || 0) + 1;
      b.apply(hero, 1.0);
    }
  }));
}

export function glyphSvg(glyph, color) {
  const paths = {
    flame: '<path d="M12 2c1.5 3.5 4.5 5.2 4.5 9.2a4.5 4.5 0 1 1-9 0c0-2.2 1.1-4 2.4-5.4-.2 1.8.8 2.8 2.1 3.2-.4-2.4.2-4.8 0-7z"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
    chalice: '<path d="M6 3h12v4a6 6 0 0 1-5 5.9V18h4v2H7v-2h4v-5.1A6 6 0 0 1 6 7V3z"/>',
    wing: '<path d="M21 4c-6 0-11 3-14 8-1.5 2.6-2 5.5-2 8 3-1.5 6-2 9-2 4 0 7-3 7-7 0-2.2-.8-4.6 0-7z"/>',
    sword: '<path d="M19 3l2 2-9.5 9.5-2-2L19 3zM7.5 13.5l3 3-3.5 3.5-2-2 3.5-3.5zM4 20l2-2 2 2-2 2-2-2z"/>',
    crescent: '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 1 1 15.5 3.5z"/>',
    wind: '<path d="M4 9h11a2.5 2.5 0 1 0-2.4-3.2M3 13h14a2.5 2.5 0 1 1-2.4 3.2M5 17h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    shield: '<path d="M12 2l8 3.5v6c0 5.2-3.4 9.4-8 10.8-4.6-1.4-8-5.6-8-10.8v-6L12 2z"/>',
    crown: '<path d="M3 18h18v2H3v-2zm0-2L5 7l4.5 4L12 5l2.5 6L19 7l2 9H3z"/>',
    target: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2"/>',
    heart: '<path d="M12 21s-7-4.6-9.2-9C1.1 8.5 3.3 4.5 7.3 4.5c2.1 0 3.7 1.1 4.7 2.6 1-1.5 2.6-2.6 4.7-2.6 4 0 6.2 4 4.5 7.5-2.2 4.4-9.2 9-9.2 9z"/>',
    hourglass: '<path d="M6 2h12v3l-4.5 5L18 15v7H6v-7l4.5-5L6 5V2zm2 2v.4l4 4.4 4-4.4V4H8zm4 8.2l-4 4.4V20h8v-3.4l-4-4.4z"/>',
    anvil: '<path d="M4 7h13l3 3-3 2h-3v4h4v3H5v-3h4v-4H6L3 9l1-2z"/>',
    flask: '<path d="M9 3h6v2h-1v3.3l4.6 7.7A2.5 2.5 0 0 1 16.5 20h-9a2.5 2.5 0 0 1-2.1-4L10 8.3V5H9V3z"/>',
    crystal: '<path d="M12 2L5.5 9.5 12 22l6.5-12.5L12 2zm0 3.4 3.6 4.1L12 16.8 8.4 9.5 12 5.4z"/>',
    snowflake: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  return `<svg viewBox="0 0 24 24" width="28" height="28" style="color:${color};fill:currentColor">${paths[glyph] || paths.sword}</svg>`;
}
