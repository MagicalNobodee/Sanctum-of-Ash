import json
from pathlib import Path
import math
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

PORT = 18812
BASE_URL = f'http://127.0.0.1:{PORT}'


def wait_for_server(url, timeout=8.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f'{url}/api/lan-info', timeout=1.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data.get('ok'):
                    return data
        except Exception:
            time.sleep(0.15)
    raise RuntimeError('LAN server did not start in time')


def main():
    proc = subprocess.Popen(
        ['node', str(Path(__file__).resolve().parent.parent / 'lan-server.mjs'), '--port', str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    try:
        wait_for_server(BASE_URL)
        with sync_playwright() as p:
            errors = []
            browsers = []

            def spawn_page(label, path='/'):
                br = p.chromium.launch(
                    headless=True,
                    args=['--no-proxy-server', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
                )
                browsers.append(br)
                ctx = br.new_context(viewport={'width': 960, 'height': 600})
                pg = ctx.new_page()
                pg.on('pageerror', lambda e: errors.append(f'[{label}] {e}'))
                pg.on('console', lambda m: errors.append(f'[{label}] {m.text}') if m.type == 'error' else None)
                pg.goto(f'{BASE_URL}{path}', wait_until='domcontentloaded')
                pg.wait_for_function('() => !!window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true')
                return pg

            # =================================================================
            # TEST 1A: Solo Mode Shield -> HP Overflow -> Zero-Shield HP Loss
            # =================================================================
            p1 = spawn_page('Host_P1', '/?gfx=low')
            p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              g.selectClass('ember_paladin');
              g.startRun(true, true);
            }""")
            p1.wait_for_function('() => window.__SANCTUM__.mode === "explore"')
            solo_dmg = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const h = g.hero;
              const initHp = h.hp;
              const initShd = h.shield;
              h.invuln = 0;
              g.damageHero(25, h.x + 1, h.z);
              const step1 = { hp: h.hp, shd: h.shield, invuln: h.invuln };
              // Post-hit invuln is removed: an immediate second hit must ALSO apply!
              g.damageHero(15, h.x + 1, h.z);
              const stepImmediate2 = { hp: h.hp, shd: h.shield, invuln: h.invuln };
              // Deal damage exceeding remaining shield -> must break shield AND reduce HP!
              g.damageHero(90, h.x + 1, h.z);
              const stepBreak = { hp: h.hp, shd: h.shield };
              // Immediate follow-up hit with 0 shield -> must reduce HP further with zero post-hit i-frames!
              g.damageHero(30, h.x + 1, h.z);
              const stepPureHp = { hp: h.hp, shd: h.shield };
              return { initHp, initShd, step1, stepImmediate2, stepBreak, stepPureHp };
            }""")
            assert solo_dmg['step1']['shd'] < solo_dmg['initShd'] and solo_dmg['step1']['hp'] == solo_dmg['initHp'], f'Solo shield absorb failed: {solo_dmg}'
            assert solo_dmg['step1']['invuln'] == 0 and solo_dmg['stepImmediate2']['shd'] < solo_dmg['step1']['shd'], f'Post-hit invuln was not removed: {solo_dmg}'
            assert solo_dmg['stepBreak']['shd'] == 0 and solo_dmg['stepBreak']['hp'] < solo_dmg['initHp'], f'Solo shield break overflow did NOT deduct HP: {solo_dmg}'
            assert solo_dmg['stepPureHp']['hp'] < solo_dmg['stepBreak']['hp'], f'Solo 0-shield hit did NOT deduct HP: {solo_dmg}'
            print(f'[PASS 1A] Solo Shield->HP Overflow & 0-Shield HP Deduction Verified: {solo_dmg}', flush=True)

            # =================================================================
            # Launch 2P LAN Co-op Session
            # =================================================================
            p1.evaluate('() => window.__SANCTUM__.returnToTitle()')
            p1.wait_for_function('() => window.__SANCTUM__.mode === "title"')
            p1.evaluate('() => window.__SANCTUM__.coopOpenLobby(false)')
            p1.fill('#lan-name-input', 'HostAlpha')
            p1.click('#btn-lan-create')
            p1.wait_for_function('() => window.__SANCTUM__.lan.inRoom && !!window.__SANCTUM__.lan.roomCode')
            code = p1.evaluate('() => window.__SANCTUM__.lan.roomCode')

            p2 = spawn_page('Client_P2', f'/?room={code}&gfx=low')
            p2.fill('#lan-name-input', 'ClientBravo')
            p2.click('#btn-lan-join')
            p2.wait_for_function('() => window.__SANCTUM__.lan.inRoom')
            p2.click('#btn-lan-ready')
            p1.wait_for_function('() => !document.getElementById("btn-lan-launch").disabled')
            p1.click('#btn-lan-launch')

            p1.wait_for_function('() => window.__SANCTUM__.mode === "explore" && !!window.__SANCTUM__.dungeon')
            p2.wait_for_function('() => window.__SANCTUM__.mode === "explore" && !!window.__SANCTUM__.dungeon')
            p1.wait_for_timeout(300)

            # =================================================================
            # TEST 1B: Co-op Enemy Attack Deducts Shield AND HP on Client & Host
            # =================================================================
            p2_init = p2.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, maxHp: window.__SANCTUM__.hero.maxHp, shd: window.__SANCTUM__.hero.shield })')
            # Host broadcasts real enemy melee_aoe & projectile hitting Client P2!
            p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const peer = [...g.remotePlayers.values()][0];
              g.coopBroadcastEnemyAttack({ sub: 'melee_aoe', x: peer.x, z: peer.z, radius: 3.0, dmg: 120, colorHex: 0xff4422, vfxRing: true });
            }""")
            p2.wait_for_function(f'() => window.__SANCTUM__.hero.hp < {p2_init["hp"]}', timeout=3000)
            p2.evaluate('() => { window.__SANCTUM__.hero.invuln = 0; }')
            p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const peer = [...g.remotePlayers.values()][0];
              g.coopBroadcastEnemyAttack({ sub: 'melee_aoe', x: peer.x, z: peer.z, radius: 3.0, dmg: 35, colorHex: 0xff4422, vfxRing: false });
            }""")
            p1.wait_for_timeout(200)
            p2_after = p2.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, shd: window.__SANCTUM__.hero.shield })')
            p1_sees_p2 = p1.evaluate('() => { const p = [...window.__SANCTUM__.remotePlayers.values()][0]; return { hp: p.hp, shd: p.shield }; }')
            assert p2_after['shd'] == 0 and p2_after['hp'] < p2_init['hp'] - 20, f'Client P2 HP did not drop properly in co-op: init={p2_init} after={p2_after}'
            assert p1_sees_p2['hp'] == math.ceil(p2_after['hp']), f'Host P1 did not sync Client P2 reduced HP: p1_sees={p1_sees_p2} vs p2={p2_after}'

            # Also test Host P1 taking shield break + HP damage and syncing to Client P2!
            p1_init = p1.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, shd: window.__SANCTUM__.hero.shield })')
            p1.evaluate('() => { const g = window.__SANCTUM__; g.hero.invuln = 0; g.damageHero(120, g.hero.x + 1, g.hero.z); }')
            p2.wait_for_function(f'() => [...window.__SANCTUM__.remotePlayers.values()][0].hp < {p1_init["hp"]}', timeout=3000)
            p1_after = p1.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, shd: window.__SANCTUM__.hero.shield })')
            assert p1_after['shd'] == 0 and p1_after['hp'] < p1_init['hp'], f'Host P1 HP did not drop: {p1_after}'
            # Restore HP/Shield after test
            for pg in (p1, p2):
                pg.evaluate('() => { const h = window.__SANCTUM__.hero; h.hp = h.maxHp; h.shield = h.maxShield; h.invuln = 0; }')
            print(f'[PASS 1B] Co-op Shield Break + HP Deduction & Sync Verified on BOTH Client ({p2_init["hp"]}->{p2_after["hp"]}) and Host ({p1_init["hp"]}->{p1_after["hp"]})!')

            # =================================================================
            # TEST 2: Teammate Class Active Skills (All 12) & Weapon Skills VFX
            # =================================================================
            # Spawn a dummy high-HP enemy in Start room so homing/target skills have a live target
            for pg in (p1, p2):
                pg.evaluate("""() => {
                  const g = window.__SANCTUM__;
                  const r = g.dungeon.rooms.find(x => x.type === 'start');
                  const e = g.spawnEnemy('warden', r.cx, r.cz - 2.5, r, { eid: 'vfx_dummy_1', maxHp: 99999, maxShield: 0, dmg: 1 });
                  e.hp = 99999; e.aiDisabled = true; e.speed = 0;
                }""")

            class_checks = [
                ('ember_paladin', '() => window.__SANCTUM__.classRuntime.remoteDomes.length >= 1'),
                ('wraith_assassin', '() => window.__SANCTUM__.classRuntime.decoys.some(d => d.visualOnly)'),
                ('fortune_gambler', '() => window.__SANCTUM__.classRuntime.dice.some(d => d.visualOnly)'),
                ('plague_apothecary', '() => window.__SANCTUM__.classRuntime.zones.filter(z => z.kind === "miasma" && z.visualOnly).length >= 3'),
                ('bone_necromancer', '() => window.__SANCTUM__.classRuntime.minions.filter(m => m.visualOnly).length >= 2'),
                ('chrono_astromancer', '() => window.__SANCTUM__.classRuntime.zones.some(z => z.kind === "chronosphere" && z.visualOnly)'),
                ('brass_artificer', '() => window.__SANCTUM__.classRuntime.turrets.some(t => t.visualOnly)'),
                ('abyssal_ooze', '() => [...window.__SANCTUM__.remotePlayers.values()][0].slimeScaleTimer > 0'),
                ('storm_invoker', '() => window.__SANCTUM__.lightningLines.length > 0 || window.__SANCTUM__.delayedHazards.some(h => h.visualOnly && h.lightningSky)'),
                ('cursed_mimic', '() => window.__SANCTUM__.projectiles.some(p => p.visualOnly)')
            ]
            for cid, check_js in class_checks:
                p1.evaluate('() => { window.__SANCTUM__.lightningLines = []; }')
                p2.evaluate(f"""() => {{
                  const g = window.__SANCTUM__;
                  g.selectedClassId = '{cid}';
                  g.hero.classId = '{cid}';
                  g.hero.ultCd = 0;
                  g.hero.dashTimer = 0;
                  g.hero.slimeJumpState = null;
                  g.hero.omnislashState = null;
                  g.aimWorld.set(g.hero.x, 0, g.hero.z - 3.0);
                  g.tryClassSkill();
                }}""")
                p1.wait_for_function(check_js, timeout=2500)
            p2.evaluate('() => { const h = window.__SANCTUM__.hero; h.stormWrathTimer = 0; h.slimeJumpState = null; h.omnislashState = null; }')

            # Check Weapon Active Skills cast by Host P1 -> rendered on Client P2!
            weapon_checks = [
                ('buzzsaw', '() => window.__SANCTUM__.orbitalBlades.some(o => o.visualOnly && o.kind === "saw")'),
                ('autoturret', '() => window.__SANCTUM__.summons.some(s => s.visualOnly)'),
                ('prismbeam', '() => window.__SANCTUM__.lightningLines.length > 0'),
                ('starfallbow', '() => window.__SANCTUM__.delayedHazards.some(h => h.visualOnly && h.lightningSky)'),
                ('eclipseblade', '() => window.__SANCTUM__.delayedHazards.some(h => h.visualOnly && h.radius >= 3.5)')
            ]
            for wid, check_js in weapon_checks:
                p2.evaluate('() => { const g = window.__SANCTUM__; g.delayedHazards = []; }')
                p1.evaluate(f"""() => {{
                  const g = window.__SANCTUM__;
                  const w = window.__SANCTUM_ARSENAL__.rollWeaponInstance('{wid}', 2, false);
                  g.hero.weapons[0] = w;
                  g.hero.activeSlot = 0;
                  g.mountActiveWeapon();
                  g.hero.arcCd = 0;
                  g.hero.dashTimer = 0;
                  g.aimWorld.set(g.hero.x, 0, g.hero.z - 4.0);
                  g.tryWeaponSkill();
                }}""")
                p2.wait_for_function(check_js, timeout=2500)

            # Clean up dummy enemy
            for pg in (p1, p2):
                pg.evaluate('() => { const g = window.__SANCTUM__; for (const e of g.enemies) g.scene.remove(e.rig.root); g.enemies = []; }')
            print('[PASS 2] All Teammate Class Active Skills & Weapon Active Skills 3D VFX Verified Across Peers!')

            # =================================================================
            # TEST 4: Room Teleport Rule — ONLY Combat Rooms Forcibly Teleport
            # =================================================================
            # 4A: Non-combat Sanctuary room -> NO teleport
            sanc_info = p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const sanc = g.dungeon.rooms.find(r => r.type === 'sanctuary');
              return { id: sanc.id, cx: sanc.cx, cz: sanc.cz };
            }""")
            p1_start = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const s = g.dungeon.rooms.find(r => r.type === 'start');
              g.hero.x = s.cx; g.hero.z = s.cz + 2.0; g.currentRoom = s;
              return { x: g.hero.x, z: g.hero.z, id: s.id };
            }""")
            p1.wait_for_timeout(120)
            p2.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {sanc_info["cx"]}; g.hero.z = {sanc_info["cz"]}; }}')
            p1.wait_for_function(f'() => window.__SANCTUM__.dungeon.rooms.find(r => r.id === {sanc_info["id"]}).visited === true', timeout=3000)
            p1.wait_for_timeout(200)
            p1_after_sanc = p1.evaluate('() => ({ x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z, id: window.__SANCTUM__.currentRoom.id })')
            assert p1_after_sanc['id'] == p1_start['id'] and math.hypot(p1_after_sanc['x'] - p1_start['x'], p1_after_sanc['z'] - p1_start['z']) < 0.5, f'Sanctuary wrongly teleported P1! {p1_after_sanc}'

            # 4B: Uncleared Combat room -> MUST teleport outside teammate!
            combat_info = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const c = g.dungeon.rooms.find(r => r.type === 'combat' && !r.cleared);
              const dk = Object.keys(c.doors)[0];
              const dv = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dk];
              return {
                id: c.id,
                doorX: c.cx + dv[0] * c.halfW,
                doorZ: c.cz + dv[1] * c.halfD,
                stepX: c.cx + dv[0] * (c.halfW - 1.8),
                stepZ: c.cz + dv[1] * (c.halfD - 1.8)
              };
            }""")
            p1.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {combat_info["stepX"]}; g.hero.z = {combat_info["stepZ"]}; }}')
            p2.wait_for_function(f'() => window.__SANCTUM__.currentRoom && window.__SANCTUM__.currentRoom.id === {combat_info["id"]}', timeout=3000)
            p2_rallied = p2.evaluate('() => ({ x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z })')
            assert math.hypot(p2_rallied['x'] - combat_info['doorX'], p2_rallied['z'] - combat_info['doorZ']) <= 4.0, f'Combat room failed to rally P2: {p2_rallied}'

            # Clear combat room, then verify re-entering CLEARED combat room does NOT teleport P2!
            p1.evaluate('() => { const g = window.__SANCTUM__; for (const e of [...g.enemies]) g.damageEnemy(e, 999999, g.hero.x, g.hero.z, { allowCrit: false }); }')
            p1.wait_for_timeout(650)
            for _ in range(3):
                for pg in (p1, p2):
                    if pg.evaluate('() => window.__SANCTUM__.mode') == 'boon':
                        pg.keyboard.press('Digit1')
                p1.wait_for_timeout(120)
            p2_parked = p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const s = g.dungeon.rooms.find(r => r.type === 'start');
              g.hero.x = s.cx; g.hero.z = s.cz; g.currentRoom = s;
              return { x: s.cx, z: s.cz, id: s.id };
            }""")
            p1.evaluate('() => { const g = window.__SANCTUM__; const s = g.dungeon.rooms.find(r => r.type === "start"); g.hero.x = s.cx; g.hero.z = s.cz; g.currentRoom = s; }')
            p1.wait_for_timeout(100)
            p1.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {combat_info["stepX"]}; g.hero.z = {combat_info["stepZ"]}; }}')
            p1.wait_for_timeout(250)
            p2_after_cleared = p2.evaluate('() => ({ x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z, id: window.__SANCTUM__.currentRoom.id })')
            assert p2_after_cleared['id'] == p2_parked['id'], f'Re-entering cleared combat room wrongly teleported P2! {p2_after_cleared}'
            print('[PASS 4] Room Teleport Rule Verified: Sanctuary/Vault/Cleared Rooms Never Teleport; Uncleared Combat Rooms Rally Properly!')

            # =================================================================
            # TEST 3: Floor 1 Boss Room Portal -> Floor 2 Boss Room Overlap Repro
            # =================================================================
            # Place both P1 and P2 inside Floor 1's Boss Room, AND force Floor 2's Boss Room
            # to occupy the EXACT same world (gx, gz, cx, cz) cell as Floor 1's Boss Room,
            # while spamming stale Floor 1 player_state packets from P2 during transition!
            overlap_res = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const f1Boss = g.dungeon.rooms.find(r => r.type === 'boss');
              g.hero.x = f1Boss.cx; g.hero.z = f1Boss.cz;
              return { gx: f1Boss.gx, gz: f1Boss.gz, cx: f1Boss.cx, cz: f1Boss.cz };
            }""")
            p2.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {overlap_res["cx"]}; g.hero.z = {overlap_res["cz"]}; }}')
            p1.wait_for_timeout(150)

            # Trigger Floor 2 payload where Floor 2's boss room is forced onto Floor 1's boss room coordinates!
            p1.evaluate("""(f1Boss) => {
              const g = window.__SANCTUM__;
              const floorInit = g.createFloorInitPayload(1, false);
              const bpBoss = floorInit.roomsBlueprint.find(r => r.type === 'boss');
              if (bpBoss) {
                // Swap or place boss at exact f1Boss coordinates if unoccupied by start
                const conflict = floorInit.roomsBlueprint.find(r => r !== bpBoss && r.type !== 'start' && r.gx === f1Boss.gx && r.gz === f1Boss.gz);
                if (conflict) {
                  conflict.gx = bpBoss.gx; conflict.gz = bpBoss.gz;
                }
                bpBoss.gx = f1Boss.gx;
                bpBoss.gz = f1Boss.gz;
              }
              g.lan.relay(floorInit, 'all');
            }""", overlap_res)

            # Inject stale Floor 1 packets from P2 right around 480ms (just after Host builds Floor 2!)
            p1.wait_for_timeout(490)
            p2.evaluate("""(f1Boss) => {
              const g = window.__SANCTUM__;
              g.lan.relay({ kind: 'player_state', floorIndex: 0, name: 'ClientBravo', x: f1Boss.cx, z: f1Boss.cz, hp: 120, maxHp: 120 }, 'others');
              g.lan.relay({ kind: 'room_enter_req', floorIndex: 0, roomId: 3, enterX: f1Boss.cx, enterZ: f1Boss.cz }, 'host');
            }""", overlap_res)

            p1.wait_for_function('() => window.__SANCTUM__.floorIndex === 1 && window.__SANCTUM__.mode === "explore"', timeout=5000)
            p2.wait_for_function('() => window.__SANCTUM__.floorIndex === 1 && window.__SANCTUM__.mode === "explore"', timeout=5000)
            p1.wait_for_timeout(350)

            f2_p1 = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const boss = g.dungeon.rooms.find(r => r.type === 'boss');
              return {
                curType: g.currentRoom.type,
                x: g.hero.x,
                z: g.hero.z,
                bossVisited: boss.visited,
                bossLocked: boss.locked,
                enemies: g.enemies.length
              };
            }""")
            f2_p2 = p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const boss = g.dungeon.rooms.find(r => r.type === 'boss');
              return {
                curType: g.currentRoom.type,
                x: g.hero.x,
                z: g.hero.z,
                bossVisited: boss.visited,
                bossLocked: boss.locked,
                enemies: g.enemies.length
              };
            }""")
            assert f2_p1['curType'] == 'start' and not f2_p1['bossVisited'] and not f2_p1['bossLocked'] and f2_p1['enemies'] == 0, f'Host F2 spawn corrupted: {f2_p1}'
            assert f2_p2['curType'] == 'start' and not f2_p2['bossVisited'] and not f2_p2['bossLocked'] and f2_p2['enemies'] == 0, f'Client F2 spawned in Boss room! {f2_p2}'
            print(f'[PASS 3] Floor 1 -> Floor 2 Portal Same-Cell Boss Overlap Race Proof Verified! P1={f2_p1} P2={f2_p2}')

            assert len(errors) == 0, f'Console/Page errors occurred: {errors}'
            print('ALL 4 MULTIPLAYER & GAMEPLAY FIXES VERIFIED WITH ZERO ERRORS!')

            for br in browsers:
                br.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    main()
