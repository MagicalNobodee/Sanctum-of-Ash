import os
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / 'outputs' / 'sanctum-of-ash.html'


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
        'thrallSpeed': 3.692,
        'stalker': 379,
        'stalkerSpeed': 4.784,
        'acolyte': 391,
        'acolyteSpeed': 3.432,
        'acolyteBaseCd': 1.179,
        'juggernaut': 1288,
        'juggernautSpeed': 2.496,
        'boss1': 17250,
        'boss1Speed': 3.432,
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

    assert not errors, f'Browser errors encountered: {errors}'
    browser.close()
    print('[PASS] Solo balance & mechanics verification passed!')


def run_coop_checks(p):
    port = 29883
    srv = subprocess.Popen(
        ['node', str(ROOT / 'lan-server.mjs'), '--port', str(port)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        time.sleep(0.8)
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
        time.sleep(0.35)
        c1_eids = p1.evaluate('() => window.__SANCTUM__.enemies.map((e) => e.eid).sort()')
        c2_eids = p2.evaluate('() => window.__SANCTUM__.enemies.map((e) => e.eid).sort()')
        assert c1_eids == c2_eids and len(c1_eids) >= 14, f'Wave 2 coop sync mismatch: host={len(c1_eids)} client={len(c2_eids)}'

        assert not errors, f'Co-op errors: {errors}'
        browser.close()
        print('[PASS] Co-op difficulty & multi-wave sync verification passed!')
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
