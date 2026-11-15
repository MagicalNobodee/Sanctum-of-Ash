import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_energy_drops import run_energy_drop_checks, run_coop_energy_checks

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / 'outputs' / 'sanctum-of-ash.html'


def run_melee_reach_checks(page):
    checks = page.evaluate('''() => {
      const g = window.__SANCTUM__, A = window.__SANCTUM_ARSENAL__;
      const baseline = {
        greatsword: [4.65, 3], twinblades: [3.65, 5], warhammer: [4.35, 2],
        chainwhip: [6.85, 3], bloodscythe: [5.50, 3], eclipseblade: [5.35, 4], mjolnir: [5.80, 3]
      };
      const saved = { hero: g.hero,
        damageEnemy: g.damageEnemy, updateEnemies: g.updateEnemies, updateProjectiles: g.updateProjectiles,
        cover: g.dungeon.isSegmentBlockedByCover };
      const rows = [], instances = [], visuals = [];
      const vfxMethods = ['spawnSlashArc', 'spawnThrustLance', 'spawnRing'];
      const savedVfx = Object.fromEntries(vfxMethods.map(key => [key, g.vfx[key]]));
      g.mode = 'paused';
      g.clearEntities();
      const room = g.dungeon.rooms.find(r => r.type === 'boss');
      g.currentRoom = room;
      g.resetHeroStats();
      const h = g.hero;
      h.finisherWave = false;
      g.updateEnemies = () => {};
      g.updateProjectiles = () => {};
      g.dungeon.isSegmentBlockedByCover = () => false;
      for (const key of vfxMethods) g.vfx[key] = function(...args) {
        visuals.push({ key, args });
        return savedVfx[key].apply(this, args);
      };
      try {
        for (const [id, [oldRange, steps]] of Object.entries(baseline)) {
          for (let tier = 1; tier <= 4; tier++) {
            const w = A.rollWeaponInstance(id, tier);
            instances.push({ id, tier, range: w.range, expected: oldRange * 0.8 });
          }
          const w = A.rollWeaponInstance(id, 1);
          h.weapons = [w]; h.activeSlot = 0;
          g.mountActiveWeapon();
          for (const boost of [1, 1.25]) {
            h.reachMult = boost;
            for (let step = 0; step < steps; step++) {
              g.clearEntities();
              h.x = room.cx; h.z = room.cz; h.yaw = 0;
              h.vx = h.vz = h.dashTimer = 0; h.atkState = null;
              h.comboStep = step; h.comboWindow = 1;
              g.aimWorld.set(h.x, 0, h.z + 10);
              visuals.length = 0;
              g.mode = 'explore'; g.tryAttack(); g.mode = 'paused';
              const attackVisual = visuals[0];
              const st = h.atkState, spec = st.stepSpec;
              const oldExtent = (spec.shape === 'crater'
                ? (id === 'warhammer' ? 5.25 : 5.90)
                : oldRange * (spec.reachMult || 1)) * boost;
              const newExtent = oldExtent * 0.8;
              const radius = 0.5;
              const distances = { close: 1.25, inside: newExtent - 0.10,
                edge: newExtent + radius - 0.10, outside: newExtent + radius + 0.15,
                far: oldExtent + radius + 0.10 };
              const names = new Map();
              for (const [name, dist] of Object.entries(distances)) {
                const e = g.spawnEnemy('thrall', h.x, h.z + dist, room, { affixes: [] });
                e.radius = radius;
                names.set(e, name);
              }
              const hits = [];
              g.damageEnemy = (e, dmg, x, z, opts) => {
                if (names.has(e) && opts?.weaponInst === w) hits.push(names.get(e));
              };
              h.vx = h.vz = 0; // Measure weapon reach independently of the unchanged attack lunge.
              visuals.length = 0; // Exclude spawn rings from the crater impact check.
              st.timer = st.duration * 0.5 - 0.001;
              g.updateSimulation(0.001);
              const visual = spec.shape === 'crater'
                ? visuals.find(v => v.key === 'spawnRing') : attackVisual;
              rows.push({ id, step, boost, shape: spec.shape, hits,
                visualReach: visual?.args[spec.shape === 'crater' ? 2 : 3],
                expectedVisual: spec.shape === 'crater'
                  ? (id === 'warhammer' ? 2.20 : 2.36) * boost : newExtent });
            }
          }
        }
        return { rows, instances,
          meleeIds: A.WEAPON_LIST.filter(w => w.category === 'melee').map(w => w.id) };
      } finally {
        g.damageEnemy = saved.damageEnemy;
        g.updateEnemies = saved.updateEnemies;
        g.updateProjectiles = saved.updateProjectiles;
        g.dungeon.isSegmentBlockedByCover = saved.cover;
        for (const key of vfxMethods) g.vfx[key] = savedVfx[key];
        g.clearEntities();
        g.hero = saved.hero;
        g.mountActiveWeapon(); g.mode = 'paused';
      }
    }''')
    assert len(checks['meleeIds']) == 7
    assert set(checks['meleeIds']) == {row['id'] for row in checks['rows']}
    assert len(checks['rows']) == 46 and len(checks['instances']) == 28
    for instance in checks['instances']:
        assert abs(instance['range'] - instance['expected']) < 1e-9, instance
    for row in checks['rows']:
        assert set(row['hits']) == {'close', 'inside', 'edge'}, row
        assert abs(row['visualReach'] - row['expectedVisual']) < 1e-9, row
    print('[PASS] All 7 melee weapons: 46 combo/reach-buff cases, 230 hit boundaries, 28 tier instances and matching VFX!')


def run_enemy_barrage_checks(page):
    checks = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      const saved = { index: g.floorIndex, cfg: g.floorCfg, difficulty: g.selectedDifficultyId };
      g.mode = 'paused';
      g.clearEntities();
      const room = g.dungeon.rooms.find(r => r.type === 'boss');
      g.currentRoom = room;
      g.hero.x = room.cx;
      g.hero.z = room.cz;
      g.spawnEnemyProjectile(room.cx, room.cz + 3, 0, 20);
      const defaultSpeed = g.projectiles.at(-1).speed;
      const rows = [];
      for (let floor = 0; floor < 4; floor++) {
        g.floorIndex = floor;
        g.floorCfg = g.floorConfigs[floor];
        for (const difficulty of ['pilgrim', 'standard', 'bloodfire', 'abyssal']) {
          g.setDifficulty(difficulty, false);
          const scaling = g.getActiveScaling();
          g.clearEntities();
          const speeds = {};
          for (const type of ['thrall', 'stalker', 'acolyte', 'juggernaut', 'warden']) {
            const e = g.spawnEnemy(type, room.cx + 6, room.cz, room, { affixes: [] });
            speeds[type] = e.speed / (g.floorCfg.speedMult * scaling.enemySpeedMult);
          }
          for (const attack of ['acolyte', 'fan', 'nova']) {
            for (const enraged of (attack === 'acolyte' ? [false] : [false, true])) {
              g.clearEntities();
              const e = g.spawnEnemy(attack === 'acolyte' ? 'acolyte' : 'warden',
                room.cx + 6, room.cz, room, { affixes: [] });
              e.hp = e.maxHp * 0.7; // Enables the existing Floor I boss fan.
              e.bossEnraged = enraged;
              e.state = attack === 'nova' ? 'leap' : 'strike';
              e.stateTimer = 0;
              e.leapDur = 0.01;
              e.leapStartX = e.leapTargetX = e.x;
              e.leapStartZ = e.leapTargetZ = e.z;
              g.updateEnemies(0.06);
              rows.push({ floor, difficulty, attack, enraged, speeds,
                tempo: scaling.enemyAtkRateMult, dmg: e.dmg,
                shots: g.projectiles.map(p => ({ speed: p.speed, velocity: Math.hypot(p.vx, p.vz),
                  dmg: p.dmg, friendly: p.friendly, color: p.colorHex, yaw: Math.atan2(p.vx, p.vz) })) });
            }
          }
        }
      }
      g.clearEntities();
      g.floorIndex = saved.index;
      g.floorCfg = saved.cfg;
      g.setDifficulty(saved.difficulty, false);
      return { defaultSpeed, rows };
    }''')
    assert checks['defaultSpeed'] == 6.3
    for row in checks['rows']:
        floor, attack = row['floor'], row['attack']
        for enemy, speed in {'thrall': 3.30, 'stalker': 4.28, 'acolyte': 3.80,
                             'juggernaut': 2.23, 'warden': 3.07}.items():
            assert abs(row['speeds'][enemy] - speed) < 1e-9, row
        if attack == 'acolyte':
            old_count = 3 if floor == 3 else (2 if floor >= 1 or row['difficulty'] == 'abyssal' else 1)
            count = old_count + 1
            old_speed = 10.6 + floor * 1.15 + max(0, row['tempo'] - 1) * 4.5
            damage = row['dmg']
        else:
            count = (4 + floor if attack == 'fan' else 9 + floor * 2) + (2 if row['enraged'] else 0)
            old_speed = 11.8 + floor * 1.1 if attack == 'fan' else 11.0 + floor
            damage = int(row['dmg'] * 0.8 + 0.5)
        assert len(row['shots']) == count, row
        assert len({round(shot['yaw'], 6) for shot in row['shots']}) == count, row
        for shot in row['shots']:
            assert abs(shot['speed'] - old_speed * 0.7) < 1e-9, row
            assert abs(shot['velocity'] - shot['speed']) < 1e-9, row
            assert shot['dmg'] == damage and shot['friendly'] is False, row
            assert shot['color'] == (0xff3322 if attack == 'acolyte' else 0xff5522), row
    print('[PASS] Enemy movement and 80 attack cases across all floors/difficulties passed!')


def run_solo_checks(p):
    errors = []
    browser = p.chromium.launch(
        headless=True,
        args=['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
    )
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda err: errors.append(f'PAGEERROR: {err}'))
    page.on(
        'console',
        lambda msg: errors.append(f'CONSOLE_ERR: {msg.text}')
        if msg.type == 'error' and 'ws://127.0.0.1' not in msg.text
        else None,
    )

    page.goto(HTML_PATH.as_uri(), wait_until='load')
    page.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=25000)

    # 1. Solo char-select 4-tier difficulty selector & bilingual UI
    page.click('#btn-enter-sanctum')
    page.click('#btn-start')
    diff_btns = page.locator('#hub-diff-picker [data-diff-id]')
    assert diff_btns.count() == 4, f'Expected 4 difficulty buttons, got {diff_btns.count()}'

    for diff_id, expected_zh in [
        ('pilgrim', '微光巡礼'),
        ('bloodfire', '血火狂潮'),
        ('abyssal', '永夜深渊'),
        ('standard', '圣所誓约'),
    ]:
        page.click(f'#hub-diff-picker [data-diff-id="{diff_id}"]')
        sel = page.evaluate('() => window.__SANCTUM__.selectedDifficultyId')
        hud_txt = page.locator('#hud-diff-pill').text_content() or ''
        assert sel == diff_id, f'Expected {diff_id}, got {sel}'
        assert expected_zh in hud_txt, f'Expected {expected_zh} in HUD pill, got {hud_txt}'

    # Start solo run as ember_paladin on standard
    page.click('#btn-char-confirm')
    page.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=10000)

    # 2. Verify buffed class stats & caps
    cls_check = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      const palHp = g.hero.maxHp;
      const palShd = g.hero.maxShield;
      g.selectClass('crimson_flagellant');
      g.resetHeroStats();
      const flagHp = g.hero.maxHp;
      const flagShd = g.hero.maxShield;
      g.selectClass('cursed_mimic');
      g.resetHeroStats();
      const mimicStartCinders = g.hero.cinders;
      g.hero.cinders = 9999;
      const mimicCapMult = g.effectiveDmgMult();
      g.selectClass('fortune_gambler');
      g.resetHeroStats();
      g.hero.cinders = 9999;
      const gamblerCapMult = g.effectiveDmgMult();
      g.selectClass('ember_paladin');
      g.resetHeroStats();
      return { palHp, palShd, flagHp, flagShd, mimicStartCinders, mimicCapMult, gamblerCapMult };
    }''')
    assert cls_check['palHp'] == 170 and cls_check['palShd'] == 125, f'Paladin stats mismatch: {cls_check}'
    assert cls_check['flagHp'] == 295 and cls_check['flagShd'] == 0, f'Flagellant stats mismatch: {cls_check}'
    assert cls_check['mimicStartCinders'] == 45, f'Mimic cinders mismatch: {cls_check}'
    assert abs(cls_check['mimicCapMult'] - 1.45) < 0.001, f'Mimic cap mismatch: {cls_check}'
    assert abs(cls_check['gamblerCapMult'] - 1.30) < 0.001, f'Gambler cap mismatch: {cls_check}'

    # 3. Verify ranged fire rate (no 2.1x multiplier, min 0.20s floor) & melee atkSlow 0.74
    ranged_check = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      g.hero.activeSlot = 1; // crossbow (atkRate 2.20)
      g.mountActiveWeapon();
      g.hero.rangedCooldown = 0;
      g.tryAttack();
      const crossbowCd = g.hero.rangedCooldown;
      g.hero.atkSpeed = 6.0; // extreme haste
      g.hero.rangedCooldown = 0;
      g.tryAttack();
      const clampedCd = g.hero.rangedCooldown;
      g.hero.atkSpeed = 1.0;
      return { crossbowCd, clampedCd, wpnDmg: g.hero.weapons[1].dmg, wpnRate: g.hero.weapons[1].atkRate };
    }''')
    assert abs(ranged_check['wpnRate'] - 2.20) < 0.01, f'Crossbow rate mismatch: {ranged_check}'
    assert ranged_check['wpnDmg'] == 42, f'Crossbow base dmg mismatch: {ranged_check}'
    assert 0.44 <= ranged_check['crossbowCd'] <= 0.47, f'Crossbow fire interval still has 2.1x?: {ranged_check}'
    assert abs(ranged_check['clampedCd'] - 0.20) < 0.001, f'Min rangedCooldown floor mismatch: {ranged_check}'

    # 4. Verify enemy base stats, Floor I-IV Boss HP/Shield, 70%/35% Boss Summons & Multi-Wave Combat
    combat_check = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      g.setDifficulty('standard', false);
      const r = g.currentRoom;
      const eThrall = g.spawnEnemy('thrall', r.cx, r.cz, r, { affixes: [] });
      const eStalker = g.spawnEnemy('stalker', r.cx, r.cz, r, { affixes: [] });
      const eAcolyte = g.spawnEnemy('acolyte', r.cx, r.cz, r, { affixes: [] });
      const eJug = g.spawnEnemy('juggernaut', r.cx, r.cz, r, { affixes: [] });
      const eBoss1 = g.spawnEnemy('warden', r.cx, r.cz, r, { affixes: [] });
      const f1Stats = {
        thrall: eThrall.maxHp,
        thrallSpeed: +eThrall.speed.toFixed(3),
        stalker: eStalker.maxHp,
        stalkerSpeed: +eStalker.speed.toFixed(3),
        acolyte: eAcolyte.maxHp,
        acolyteSpeed: +eAcolyte.speed.toFixed(3),
        acolyteBaseCd: eAcolyte.baseCd,
        juggernaut: eJug.maxHp,
        juggernautSpeed: +eJug.speed.toFixed(3),
        boss1: eBoss1.maxHp,
        boss1Speed: +eBoss1.speed.toFixed(3),
        boss1Cinders: eBoss1.cinders
      };
      // Verify acolyte 2x attack speed across all 4 difficulties (baseCd=1.25, windupDur=0.26)
      const acolyteByDiff = {};
      for (const dId of ['pilgrim', 'standard', 'bloodfire', 'abyssal']) {
        g.setDifficulty(dId, false);
        const ac = g.spawnEnemy('acolyte', g.hero.x + 6.0, g.hero.z, r, { affixes: [] });
        ac.cooldown = 0;
        g.updateEnemies(0.016);
        acolyteByDiff[dId] = { baseCd: ac.baseCd, windupDur: ac.windupDur, speed: ac.speed, state: ac.state };
        g.clearEntities();
      }
      g.setDifficulty('standard', false);
      g.clearEntities();

      // Check Floor 3 & Floor 4 Boss HP + Shield
      const prevCfg = g.floorCfg;
      const prevIdx = g.floorIndex;
      g.floorIndex = 2;
      g.floorCfg = g.floorConfigs[2];
      const b3 = g.spawnEnemy('warden', r.cx, r.cz, r, { affixes: [] });
      const f3Boss = { hp: b3.maxHp, shield: b3.maxShield };
      g.floorIndex = 3;
      g.floorCfg = g.floorConfigs[3];
      const b4 = g.spawnEnemy('warden', r.cx, r.cz, r, { affixes: [] });
      const f4Boss = { hp: b4.maxHp, shield: b4.maxShield };
      g.setDifficulty('abyssal', false);
      const b4Abyss = g.spawnEnemy('warden', r.cx, r.cz, r, { affixes: [] });
      const f4AbyssBoss = { hp: b4Abyss.maxHp, shield: b4Abyss.maxShield };
      g.setDifficulty('standard', false);
      g.floorIndex = prevIdx;
      g.floorCfg = prevCfg;
      g.clearEntities();

      // Boss 70% & 35% guard waves
      const bossRoom = g.dungeon.rooms.find((rm) => rm.type === 'boss');
      const liveBoss = g.spawnEnemy('warden', bossRoom.cx, bossRoom.cz, bossRoom, { affixes: [] });
      g.damageEnemy(liveBoss, 6000, g.hero.x, g.hero.z, { allowCrit: false }); // drops below 70% (11250/17250 = 65.2%)
      const guardsAfter70 = g.enemies.filter((x) => x.bossSummon).length;
      g.damageEnemy(liveBoss, 6500, g.hero.x, g.hero.z, { allowCrit: false }); // drops below 35% (4750/17250 = 27.5%)
      const guardsAfter35 = g.enemies.filter((x) => x.bossSummon).length;
      const bossEnragedAtLowHp = !!liveBoss.bossEnraged;
      g.clearEntities();

      // Multi-wave combat room & NO flask refill on room clear
      const cRooms = g.dungeon.rooms.filter((rm) => rm.type === 'combat');
      g.hero.flasks = 1;
      const cr1 = cRooms[0];
      g.enterRoom(cr1);
      const wave1List = g.enemies.filter((x) => x.room === cr1);
      const wave1Spawned = wave1List.length;
      let minSpawnPairDist = Infinity;
      let sumSpawnPairDist = 0;
      let pairCnt = 0;
      for (let i = 0; i < wave1List.length; i++) {
        for (let j = i + 1; j < wave1List.length; j++) {
          const d = Math.hypot(wave1List[i].x - wave1List[j].x, wave1List[i].z - wave1List[j].z);
          if (d < minSpawnPairDist) minSpawnPairDist = d;
          sumSpawnPairDist += d;
          pairCnt++;
        }
      }
      const avgSpawnPairDist = pairCnt > 0 ? +(sumSpawnPairDist / pairCnt).toFixed(2) : 0;
      const pendingBefore = cr1.pendingWaves ? cr1.pendingWaves.length : 0;
      // Kill wave 1 down to 3 enemies -> should trigger wave 2!
      while (g.enemies.filter((x) => x.room === cr1 && x.hp > 0).length > 4) {
        const victim = g.enemies.find((x) => x.room === cr1 && x.hp > 0);
        g.killEnemy(victim);
      }
      // Next kill drops remaining to 3 -> triggers Wave 2!
      g.killEnemy(g.enemies.find((x) => x.room === cr1 && x.hp > 0));
      const countAfterWave2Trigger = g.enemies.filter((x) => x.room === cr1 && x.hp > 0).length;
      const lockedMidWave = cr1.locked;
      // Clear rest of cr1
      while (g.enemies.some((x) => x.room === cr1 && x.hp > 0)) {
        g.killEnemy(g.enemies.find((x) => x.room === cr1 && x.hp > 0));
      }
      const flasksAfterRoom1 = g.hero.flasks;

      // Clear cr2 -> combat room clear must NOT grant flasks!
      const cr2 = cRooms[1];
      g.enterRoom(cr2);
      while (g.enemies.some((x) => x.room === cr2 && x.hp > 0)) {
        g.killEnemy(g.enemies.find((x) => x.room === cr2 && x.hp > 0));
      }
      const flasksAfterRoom2 = g.hero.flasks;

      // Verify AI Steering: Ranged acolytes retreat away from hero AND spread apart from each other!
      g.clearEntities();
      const openRoom = g.dungeon.rooms.find((rm) => rm.type === 'boss') || r;
      g.currentRoom = openRoom;
      g.hero.x = openRoom.cx;
      g.hero.z = openRoom.cz;
      const ac1 = g.spawnEnemy('acolyte', openRoom.cx + 3.1, openRoom.cz - 0.5, openRoom, { affixes: [] });
      const ac2 = g.spawnEnemy('acolyte', openRoom.cx + 3.2, openRoom.cz + 0.0, openRoom, { affixes: [] });
      const ac3 = g.spawnEnemy('acolyte', openRoom.cx + 3.1, openRoom.cz + 0.5, openRoom, { affixes: [] });
      for (const ac of [ac1, ac2, ac3]) ac.cooldown = 99;
      const initAcDistHero = ([ac1, ac2, ac3].reduce((s, a) => s + Math.hypot(a.x - g.hero.x, a.z - g.hero.z), 0)) / 3;
      for (let step = 0; step < 48; step++) g.updateEnemies(0.05);
      const endAcDistHero = ([ac1, ac2, ac3].reduce((s, a) => s + Math.hypot(a.x - g.hero.x, a.z - g.hero.z), 0)) / 3;
      const acPairDists = [
        Math.hypot(ac1.x - ac2.x, ac1.z - ac2.z),
        Math.hypot(ac1.x - ac3.x, ac1.z - ac3.z),
        Math.hypot(ac2.x - ac3.x, ac2.z - ac3.z)
      ];
      const minAcPeerDist = Math.min(...acPairDists);
      g.clearEntities();

      // Verify Melee Anti-Clumping: 4 thralls spawned stacked together separate cleanly while approaching
      const mList = [
        g.spawnEnemy('thrall', openRoom.cx - 5.5, openRoom.cz - 0.1, openRoom, { affixes: [] }),
        g.spawnEnemy('thrall', openRoom.cx - 5.5, openRoom.cz + 0.0, openRoom, { affixes: [] }),
        g.spawnEnemy('thrall', openRoom.cx - 5.5, openRoom.cz + 0.1, openRoom, { affixes: [] }),
        g.spawnEnemy('thrall', openRoom.cx - 5.4, openRoom.cz + 0.0, openRoom, { affixes: [] })
      ];
      for (const m of mList) m.cooldown = 99;
      for (let step = 0; step < 36; step++) g.updateEnemies(0.05);
      let minMeleePeerDist = Infinity;
      for (let i = 0; i < mList.length; i++) {
        for (let j = i + 1; j < mList.length; j++) {
          const d = Math.hypot(mList[i].x - mList[j].x, mList[i].z - mList[j].z);
          if (d < minMeleePeerDist) minMeleePeerDist = d;
        }
      }
      g.clearEntities();

      // Verify shield & flask rules:
      // 1) Flasks only heal HP (never shield)
      // 2) Weapon attacks / weapon skills / class ultimates NEVER restore shield
      // 3) Out-of-combat shield regen has ~5.2s delay & slow rate (~6.5/s for paladin)
      g.selectClass('chrono_astromancer', false);
      g.resetHeroStats();
      const startFlasksFloor1 = g.hero.flasks;
      const astroDelay = g.hero.shieldRegenDelay;
      const astroRate = g.hero.shieldRegenRate;
      g.hero.shield = 10;
      g.hero.hp = 50;
      g.hero.shieldRegenTimer = 5.0;
      g.mode = 'explore';
      g.tryHealFlask(); // heals HP, must NOT touch shield!
      const shieldAfterFlask = g.hero.shield;
      const hpAfterFlask = g.hero.hp;
      // Trigger weapon skill on chrono_astromancer -> must NOT restore shield!
      g.hero.arcCd = 0;
      g.tryWeaponSkill();
      const shieldAfterWpnSkill = g.hero.shield;
      // Switch to ember_paladin & cast ultimate -> must NOT restore shield!
      g.selectClass('ember_paladin', false);
      g.resetHeroStats();
      g.hero.shield = 20;
      g.hero.shieldRegenTimer = 5.2;
      g.hero.ultCd = 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
      const shieldAfterPaladinUlt = g.hero.shield;
      // Simulate 3.0s (still < 5.2s delay) -> shield must still be 20!
      for (let i = 0; i < 30; i++) g.updateSimulation(0.1);
      const shieldBeforeDelayEnds = g.hero.shield;
      // Simulate another 3.2s (1.0s past 5.2s delay at 6.5/s) -> shield slowly ticks up (~26.5)
      for (let i = 0; i < 32; i++) g.updateSimulation(0.1);
      const shieldAfterSlowRegen = g.hero.shield;

      // Verify post-hit invulnerability frames are completely removed on both shield & HP hits!
      g.mode = 'explore';
      g.hero.sanctumDomeTimer = 0;
      g.hero.invuln = 0;
      g.hero.shield = 40;
      g.hero.hp = 150;
      g.damageHero(12, g.hero.x + 1, g.hero.z);
      const invulnAfterShieldHit = g.hero.invuln;
      const shdHit1 = g.hero.shield;
      g.damageHero(12, g.hero.x + 1, g.hero.z);
      const shdHit2 = g.hero.shield;
      g.hero.shield = 0;
      g.damageHero(15, g.hero.x + 1, g.hero.z);
      const invulnAfterHpHit = g.hero.invuln;
      const hpHit1 = g.hero.hp;
      g.damageHero(15, g.hero.x + 1, g.hero.z);
      const hpHit2 = g.hero.hp;

      // Verify weapon modal & pause weapon cards contain NO shield stat chip
      const armoryPed = g.dungeon.interactables.find((it) => it.kind === 'weapon_pedestal');
      let wpnModalHasShieldChip = false;
      if (armoryPed) {
        g.openWeaponModal(armoryPed);
        const wpnHtml = document.getElementById('weapon-overlay')?.innerHTML || '';
        wpnModalHasShieldChip = wpnHtml.includes('#7fe8ff') || wpnHtml.includes('#90ecff');
        g.closeWeaponModalWithoutTaking();
      }

      return {
        f1Stats,
        acolyteByDiff,
        f3Boss,
        f4Boss,
        f4AbyssBoss,
        guardsAfter70,
        guardsAfter35,
        bossEnragedAtLowHp,
        wave1Spawned,
        minSpawnPairDist: +minSpawnPairDist.toFixed(2),
        avgSpawnPairDist,
        pendingBefore,
        countAfterWave2Trigger,
        lockedMidWave,
        cr1Cleared: cr1.cleared,
        flasksAfterRoom1,
        flasksAfterRoom2,
        initAcDistHero: +initAcDistHero.toFixed(2),
        endAcDistHero: +endAcDistHero.toFixed(2),
        minAcPeerDist: +minAcPeerDist.toFixed(2),
        minMeleePeerDist: +minMeleePeerDist.toFixed(2),
        startFlasksFloor1,
        astroDelay,
        astroRate,
        shieldAfterFlask,
        hpAfterFlask,
        shieldAfterWpnSkill,
        shieldAfterPaladinUlt,
        shieldBeforeDelayEnds,
        shieldAfterSlowRegen,
        invulnAfterShieldHit,
        shdHit1,
        shdHit2,
        invulnAfterHpHit,
        hpHit1,
        hpHit2,
        wpnModalHasShieldChip
      };
    }''')
    assert combat_check['f1Stats'] == {
        'thrall': 437,
        'thrallSpeed': 3.432,
        'stalker': 379,
        'stalkerSpeed': 4.451,
        'acolyte': 391,
        'acolyteSpeed': 3.952,
        'acolyteBaseCd': 1.179,
        'juggernaut': 1288,
        'juggernautSpeed': 2.319,
        'boss1': 17250,
        'boss1Speed': 3.193,
        'boss1Cinders': 135,
    }, f'F1 stats mismatch: {combat_check["f1Stats"]}'
    assert combat_check['acolyteByDiff']['abyssal']['baseCd'] < combat_check['acolyteByDiff']['pilgrim']['baseCd'], f'Difficulty atkRate scaling failed: {combat_check["acolyteByDiff"]}'
    assert combat_check['acolyteByDiff']['abyssal']['speed'] > combat_check['acolyteByDiff']['pilgrim']['speed'], f'Difficulty speed scaling failed: {combat_check["acolyteByDiff"]}'
    assert combat_check['f3Boss'] == {'hp': 48300, 'shield': 12075}, f'F3 boss mismatch: {combat_check["f3Boss"]}'
    assert combat_check['f4Boss'] == {'hp': 71300, 'shield': 19550}, f'F4 boss mismatch: {combat_check["f4Boss"]}'
    assert combat_check['f4AbyssBoss'] == {'hp': 145700, 'shield': 39950}, f'F4 abyss boss mismatch: {combat_check["f4AbyssBoss"]}'
    assert combat_check['guardsAfter70'] >= 4 and combat_check['guardsAfter35'] >= 8 and combat_check['bossEnragedAtLowHp'] is True, f'Boss guard/enrage failed: {combat_check}'
    assert combat_check['minSpawnPairDist'] >= 1.35 and combat_check['avgSpawnPairDist'] >= 3.8, f'Room spawns still too clumped!: {combat_check}'
    assert combat_check['endAcDistHero'] > combat_check['initAcDistHero'] + 1.8 and combat_check['minAcPeerDist'] >= 2.2, f'Ranged kiting/dispersion failed: {combat_check}'
    assert combat_check['minMeleePeerDist'] >= 1.20, f'Melee anti-clumping failed: {combat_check}'
    assert combat_check['pendingBefore'] >= 1 and combat_check['countAfterWave2Trigger'] >= 6 and combat_check['lockedMidWave'] is True, f'Wave 2 trigger failed: {combat_check}'
    assert combat_check['cr1Cleared'] is True
    assert combat_check['flasksAfterRoom1'] == 1 and combat_check['flasksAfterRoom2'] == 1, f'Room clear should give 0 flasks: {combat_check}'
    assert combat_check['startFlasksFloor1'] == 2, f'Floor 1 entry flasks mismatch: {combat_check}'
    assert combat_check['shieldAfterFlask'] == 10 and combat_check['hpAfterFlask'] > 50, f'Flask should only heal HP: {combat_check}'
    assert combat_check['shieldAfterWpnSkill'] == 10, f'Weapon skill must not restore shield: {combat_check}'
    assert combat_check['shieldAfterPaladinUlt'] == 20, f'Ultimate must not restore shield: {combat_check}'
    assert combat_check['shieldBeforeDelayEnds'] == 20, f'Shield regenerated before out-of-combat delay!: {combat_check}'
    assert 24.0 <= combat_check['shieldAfterSlowRegen'] <= 30.0, f'Shield regen speed not reduced properly: {combat_check}'
    assert combat_check['invulnAfterShieldHit'] == 0 and combat_check['shdHit2'] < combat_check['shdHit1'], f'Shield hit still granted invuln!: {combat_check}'
    assert combat_check['invulnAfterHpHit'] == 0 and combat_check['hpHit2'] < combat_check['hpHit1'], f'HP hit still granted invuln!: {combat_check}'
    assert combat_check['wpnModalHasShieldChip'] is False, f'Weapon modal still shows shield stat!: {combat_check}'

    # 5. Verify Boon Infinite Stacking, Reroll Costs (25 -> 45 -> 70), Cinder Shrine & Forge Anvil
    econ_check = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      g.pendingBoonQueue = [];
      g.mode = 'explore';
      g.hero.cinders = 500;
      g.openBoonShrine('TEST');
      const cost0 = g.getBoonRerollCost();
      g.rerollBoons();
      const cost1 = g.getBoonRerollCost();
      g.rerollBoons();
      const cost2 = g.getBoonRerollCost();
      g.rerollBoons();
      const cost3 = g.getBoonRerollCost();
      const cindersAfter3Rerolls = g.hero.cinders; // 500 - (25+45+70) = 360

      // Force might_sigil 4 times to verify infinite stacking & UI consolidation
      for (let i = 0; i < 4; i++) {
        if (g.mode !== 'boon') g.openBoonShrine('STACK');
        g.currentBoons[0] = {
          ...g.currentBoons[0],
          id: 'might_sigil',
          name: 'Oath of Might',
          tier: 'MIGHT SIGIL',
          color: '#ff8e47',
          glyph: 'sword',
          triggerApply(h) {
            h.boonStacks.might_sigil = (h.boonStacks.might_sigil || 0) + 1;
            h.dmgMult = +((h.dmgMult || 1) + 0.07).toFixed(4);
          }
        };
        g.selectBoon(0);
      }
      const mightStacks = g.hero.boonStacks.might_sigil;
      const pillCount = document.querySelectorAll('#relic-strip .relic-pill').length;
      const pillHtml = document.getElementById('relic-strip').innerHTML;

      // Cinder Shrine & Anvil
      const shrine = g.dungeon.interactables.find((it) => it.kind === 'cinder_shrine');
      const anvil = g.dungeon.interactables.find((it) => it.kind === 'forge_anvil');
      const shrineCost1 = shrine ? shrine.cost : null;
      g.hero.cinders = 400;
      g.activeInteractable = shrine;
      g.tryInteract(); // -85 -> 315, cost becomes 115
      const shrineCost2 = shrine.cost;
      g.mode = 'explore';
      document.getElementById('boon-overlay').classList.add('hidden');
      g.activeInteractable = shrine;
      g.tryInteract(); // -115 -> 200, shrine.used = true
      const shrineDepleted = shrine.used;

      g.mode = 'explore';
      document.getElementById('boon-overlay').classList.add('hidden');
      const dmgBeforeAnvil = g.hero.dmgMult;
      const anvilCost1 = anvil.cost;
      g.activeInteractable = anvil;
      g.tryInteract();
      const anvilCost2 = anvil.cost;
      const dmgAfterAnvil = g.hero.dmgMult;

      return {
        costs: [cost0, cost1, cost2, cost3],
        cindersAfter3Rerolls,
        mightStacks,
        pillCount,
        hasX4: pillHtml.includes('×4'),
        shrineCost1,
        shrineCost2,
        shrineDepleted,
        anvilCost1,
        anvilCost2,
        anvilDmgDelta: +(dmgAfterAnvil - dmgBeforeAnvil).toFixed(4)
      };
    }''')
    assert econ_check['costs'] == [25, 45, 70, 100], f'Reroll costs mismatch: {econ_check}'
    assert econ_check['cindersAfter3Rerolls'] == 360, f'Reroll cinder deduction mismatch: {econ_check}'
    assert econ_check['mightStacks'] >= 4 and econ_check['hasX4'], f'Sigil stacking mismatch: {econ_check}'
    assert econ_check['shrineCost1'] == 95 and econ_check['shrineCost2'] == 128 and econ_check['shrineDepleted'] is True, f'Shrine mismatch: {econ_check}'
    assert econ_check['anvilCost1'] == 75 and econ_check['anvilCost2'] == 130 and econ_check['anvilDmgDelta'] == 0.05, f'Anvil mismatch: {econ_check}'

    # 6. Verify descending to next floor grants +2 flasks
    descent_flask_check = page.evaluate('''async () => {
      const g = window.__SANCTUM__;
      g.mode = 'explore';
      g.hero.flasks = 1;
      g.hero.maxFlasks = 4;
      const bossRoom = g.dungeon.rooms.find((rm) => rm.type === 'boss');
      g.spawnBossVictoryPortal(bossRoom);
      g.descendToNextFloor();
      await new Promise((r) => setTimeout(r, 750));
      return { floorIndex: g.floorIndex, flasks: g.hero.flasks };
    }''')
    assert descent_flask_check['floorIndex'] == 1 and descent_flask_check['flasks'] == 3, f'Floor descent should grant +2 flasks: {descent_flask_check}'

    run_energy_drop_checks(page)
    run_melee_reach_checks(page)
    run_enemy_barrage_checks(page)
    assert not errors, f'Browser errors encountered: {errors}'
    browser.close()
    print('[PASS] Solo balance & mechanics verification passed!')


def run_coop_checks(p):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    srv = subprocess.Popen(
        ['node', str(ROOT / 'lan-server.mjs'), '--port', str(port)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        time.sleep(0.8)
        assert srv.poll() is None, 'Isolated LAN test server failed to start'
        errors = []
        browser = p.chromium.launch(
            headless=True,
            args=['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
        )
        c1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        c2 = browser.new_context(viewport={'width': 1280, 'height': 800})
        p1 = c1.new_page()
        p2 = c2.new_page()
        for pg in (p1, p2):
            pg.on('pageerror', lambda err: errors.append(f'COOP_PAGEERROR: {err}'))

        url = f'http://127.0.0.1:{port}/'
        p1.goto(url, wait_until='load')
        p2.goto(url, wait_until='load')
        p1.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=25000)
        p2.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=25000)

        p1.click('#btn-enter-sanctum')
        p1.click('#btn-lan-lobby')
        p1.click('#btn-lan-create')
        p1.wait_for_function('() => window.__SANCTUM__.lan && window.__SANCTUM__.lan.inRoom', timeout=8000)
        code = p1.evaluate('() => window.__SANCTUM__.lan.roomCode')

        p2.click('#btn-enter-sanctum')
        p2.click('#btn-lan-lobby')
        p2.fill('#lan-code-input', code)
        p2.click('#btn-lan-join')
        p2.wait_for_function('() => window.__SANCTUM__.lan && window.__SANCTUM__.lan.inRoom', timeout=8000)

        # Host switches difficulty to bloodfire -> client syncs
        p1.click('#lan-diff-picker [data-diff-id="bloodfire"]')
        p2.wait_for_function('() => window.__SANCTUM__.selectedDifficultyId === "bloodfire"', timeout=5000)

        # Launch co-op run
        p1.evaluate('''() => {
          const g = window.__SANCTUM__;
          const init = g.createFloorInitPayload(0, true);
          g.lan.launchRun(init);
        }''')
        p1.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=10000)
        p2.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=10000)

        # Verify 2P + bloodfire scaling matches on both peers (bossHpMult = 1.65 * 1.65 = 2.723)
        s1 = p1.evaluate('() => window.__SANCTUM__.getActiveScaling()')
        s2 = p2.evaluate('() => window.__SANCTUM__.getActiveScaling()')
        assert s1['difficultyId'] == 'bloodfire' and s2['difficultyId'] == 'bloodfire'
        assert abs(s1['bossHpMult'] - 2.723) < 0.01 and abs(s2['bossHpMult'] - 2.723) < 0.01, f'Coop scaling mismatch: {s1}'

        # Trigger combat room & Wave 2 sync from Host -> Client
        p1.evaluate('''() => {
          const g = window.__SANCTUM__;
          const cr = g.dungeon.rooms.find((r) => r.type === 'combat');
          g.enterRoom(cr);
        }''')
        p2.wait_for_function('() => window.__SANCTUM__.enemies.length >= 8', timeout=5000)
        p1.evaluate('''() => {
          const g = window.__SANCTUM__;
          const cr = g.dungeon.rooms.find((r) => r.type === 'combat');
          g.spawnNextRoomWave(cr);
        }''')
        c1_eids = p1.evaluate('() => window.__SANCTUM__.enemies.map((e) => e.eid).sort()')
        p2.wait_for_function('(ids) => JSON.stringify(window.__SANCTUM__.enemies.map(e => e.eid).sort()) === JSON.stringify(ids)', arg=c1_eids, timeout=8000)
        c2_eids = p2.evaluate('() => window.__SANCTUM__.enemies.map((e) => e.eid).sort()')
        assert c1_eids == c2_eids and len(c1_eids) >= 14, f'Wave 2 coop sync mismatch: host={len(c1_eids)} client={len(c2_eids)}'

        # Record real received projectiles, including their instantiated velocity.
        p2.evaluate('''() => {
          const g = window.__SANCTUM__;
          g.mode = 'title';
          window.__balanceShots = [];
          const receive = g.lan.cb.onRelay;
          g.lan.cb.onRelay = (from, payload) => {
            receive(from, payload);
            if (payload.balanceTest && payload.sub === 'proj') {
              const p = g.projectiles.at(-1);
              window.__balanceShots.push({ speed: p.speed, dmg: p.dmg,
                velocity: Math.hypot(p.vx, p.vz), color: p.colorHex });
            }
          };
        }''')
        host_shots = p1.evaluate('''() => {
          const g = window.__SANCTUM__;
          g.mode = 'title';
          const broadcast = g.coopBroadcastEnemyAttack;
          g.coopBroadcastEnemyAttack = spec => broadcast({ ...spec, balanceTest: true });
          const room = g.dungeon.rooms.find(r => r.type === 'boss');
          const shots = [];
          for (const attack of ['acolyte', 'fan', 'nova']) {
            g.clearEntities();
            const e = g.spawnEnemy(attack === 'acolyte' ? 'acolyte' : 'warden',
              room.cx + 6, room.cz, room, { affixes: [] });
            e.bossEnraged = true;
            e.state = attack === 'nova' ? 'leap' : 'strike';
            e.stateTimer = 0;
            e.leapDur = 0.01;
            e.leapStartX = e.leapTargetX = e.x;
            e.leapStartZ = e.leapTargetZ = e.z;
            g.updateEnemies(0.06);
            shots.push(...g.projectiles.map(p => ({ speed: p.speed, dmg: p.dmg,
              velocity: Math.hypot(p.vx, p.vz), color: p.colorHex })));
          }
          g.clearEntities();
          g.coopBroadcastEnemyAttack = broadcast;
          return shots;
        }''')
        assert len(host_shots) == 2 + 6 + 11, host_shots
        p2.wait_for_function('(n) => window.__balanceShots.length >= n', arg=len(host_shots), timeout=5000)
        client_shots = p2.evaluate('() => window.__balanceShots')
        assert len(client_shots) == len(host_shots), client_shots
        for host, client in zip(host_shots, client_shots):
            assert client['speed'] == host['speed'] and client['dmg'] == host['dmg'], (host, client)
            assert client['color'] == host['color'], (host, client)
            assert abs(client['velocity'] - host['velocity']) < 1e-9, (host, client)

        run_coop_energy_checks(p1, p2)
        assert not errors, f'Co-op errors: {errors}'
        browser.close()
        print('[PASS] Co-op difficulty, multi-wave and all 19 enemy projectiles synced!')
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=3)
        except Exception:
            srv.kill()


def main():
    assert HTML_PATH.exists(), f'Missing bundle: {HTML_PATH}'
    with sync_playwright() as p:
        run_solo_checks(p)
        run_coop_checks(p)
    print('ALL BALANCE OVERHAUL CHECKS PASSED!')


if __name__ == '__main__':
    main()
