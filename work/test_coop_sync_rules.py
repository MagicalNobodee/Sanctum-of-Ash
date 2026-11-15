import json
from pathlib import Path
import math
import re
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

PORT = 18805
BASE_URL = f'http://127.0.0.1:{PORT}'
MAX_BROWSERS = 2


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


def extract_world_signature(page):
    return page.evaluate("""() => {
      const g = window.__SANCTUM__;
      return {
        biomeId: g.activeBiome && g.activeBiome.id,
        seed: g.dungeon && g.dungeon.seed,
        rooms: (g.dungeon.rooms || []).map(r => ({
          id: r.id, gx: r.gx, gz: r.gz, cx: r.cx, cz: r.cz,
          halfW: r.halfW, halfD: r.halfD, type: r.type,
          templateId: r.templateId, layout: r.layout,
          doors: Object.fromEntries(Object.entries(r.doors || {}).map(([k, nb]) => [k, nb.id]).sort()),
          spawns: r.spawns || []
        })),
        interactables: (g.dungeon.interactables || []).map(i => ({
          netId: i.netId, kind: i.kind, roomId: i.room ? i.room.id : -1,
          x: +i.x.toFixed(2), z: +i.z.toFixed(2),
          wpnId: i.weaponInst ? i.weaponInst.id : null,
          wpnTier: i.weaponInst ? i.weaponInst.tier : null
        }))
      };
    }""")


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
            pages = []

            def spawn_page(label, path='/'):
                assert len(browsers) < MAX_BROWSERS
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
                pages.append(pg)
                return pg

            p1 = spawn_page('Host_P1', '/?gfx=low')
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
            p1.wait_for_timeout(350)

            # 1. Verify 100% identical authoritative map graph & interactable layout
            sig1 = extract_world_signature(p1)
            sig2 = extract_world_signature(p2)
            assert sig1 == sig2, f'Floor 1 map mismatch!\nP1={sig1}\nP2={sig2}'
            print(f'[PASS 1A] Floor 1 Authoritative Map 100% Identical -> Biome={sig1["biomeId"]} Rooms={len(sig1["rooms"])} Interactables={len(sig1["interactables"])}')

            # 2A. Verify Mandatory Doorway Rally: Host (P1) enters a new Combat room -> Client (P2) standing in Start room is teleported to doorway!
            combat_enter = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const start = g.dungeon.rooms.find(r => r.type === 'start');
              g.hero.x = start.cx; g.hero.z = start.cz + 3.0;
              const entry = Object.entries(start.doors)[0];
              const [dirFromStart, targetRoom] = entry;
              const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }[dirFromStart];
              const dVec = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[opp];
              const doorX = targetRoom.cx + dVec[0] * targetRoom.halfW;
              const doorZ = targetRoom.cz + dVec[1] * targetRoom.halfD;
              const stepX = doorX - dVec[0] * 1.6;
              const stepZ = doorZ - dVec[1] * 1.6;
              return { targetRoomId: targetRoom.id, oppDoor: opp, doorX, doorZ, stepX, stepZ, startCx: start.cx, startCz: start.cz };
            }""")
            # Park P2 far back in Start room
            p2.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {combat_enter["startCx"]}; g.hero.z = {combat_enter["startCz"] + 3.5}; }}')
            p1.wait_for_timeout(120)
            # Move P1 across threshold into targetRoom
            p1.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {combat_enter["stepX"]}; g.hero.z = {combat_enter["stepZ"]}; }}')
            p2.wait_for_function(f'() => window.__SANCTUM__.currentRoom && window.__SANCTUM__.currentRoom.id === {combat_enter["targetRoomId"]}', timeout=3000)
            p2_pos = p2.evaluate('() => ({ x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z, roomId: window.__SANCTUM__.currentRoom.id })')
            dist_to_door_p2 = math.hypot(p2_pos['x'] - combat_enter['doorX'], p2_pos['z'] - combat_enter['doorZ'])
            assert dist_to_door_p2 <= 3.8, f'P2 was not rallied near doorway! dist={dist_to_door_p2:.2f}, p2={p2_pos}, door={combat_enter}'
            print(f'[PASS 2A] Host->NewRoom Doorway Rally Verified: P2 teleported to room {p2_pos["roomId"]} doorway (dist={dist_to_door_p2:.2f}u)')

            # Clear combat room so gates unlock
            p1.evaluate('() => { const g = window.__SANCTUM__; for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, { allowCrit: false }); }')
            p1.wait_for_timeout(700)
            for _ in range(3):
                for pg in (p1, p2):
                    if pg.evaluate('() => window.__SANCTUM__.mode') == 'boon':
                        pg.keyboard.press('Digit1')
                p1.wait_for_timeout(150)
            assert p1.evaluate('() => window.__SANCTUM__.mode') == 'explore'
            assert p2.evaluate('() => window.__SANCTUM__.mode') == 'explore'

            # 2B. Verify Non-Combat Room Rule: Client (P2) enters an unvisited Vault room -> Vault is marked visited, but Host (P1) is NOT teleported!
            vault_enter = p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const vault = g.dungeon.rooms.find(r => r.type === 'vault');
              const doorKey = Object.keys(vault.doors)[0];
              const dVec = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[doorKey];
              const doorX = vault.cx + dVec[0] * vault.halfW;
              const doorZ = vault.cz + dVec[1] * vault.halfD;
              const stepX = doorX - dVec[0] * 1.8;
              const stepZ = doorZ - dVec[1] * 1.8;
              return { vaultId: vault.id, doorKey, doorX, doorZ, stepX, stepZ };
            }""")
            # Park P1 back at Start room (0, 0) far from Vault
            p1_before_vault = p1.evaluate('() => { const g = window.__SANCTUM__; const s = g.dungeon.rooms.find(r => r.type === "start"); g.hero.x = s.cx; g.hero.z = s.cz; g.currentRoom = s; return { x: s.cx, z: s.cz, startId: s.id }; }')
            p1.wait_for_timeout(120)
            # Move P2 into unvisited Vault room
            p2.evaluate(f'() => {{ const g = window.__SANCTUM__; g.hero.x = {vault_enter["stepX"]}; g.hero.z = {vault_enter["stepZ"]}; }}')
            p1.wait_for_function(f'() => window.__SANCTUM__.dungeon.rooms.find(r => r.id === {vault_enter["vaultId"]}).visited === true', timeout=3000)
            p1.wait_for_timeout(200)
            p1_pos = p1.evaluate('() => ({ x: window.__SANCTUM__.hero.x, z: window.__SANCTUM__.hero.z, roomId: window.__SANCTUM__.currentRoom.id })')
            assert p1_pos['roomId'] == p1_before_vault['startId'] and math.hypot(p1_pos['x'] - p1_before_vault['x'], p1_pos['z'] - p1_before_vault['z']) < 0.5, f'Host P1 should NOT be teleported into non-combat Vault room! p1={p1_pos}'
            print(f'[PASS 2B] Non-Combat Vault Room Verified: Vault visited synced, Host P1 stayed in Start room without forced teleport!')

            # 3A. Verify One-Time Vault Chest: P2 claims Vault Chest -> ONLY P2 gets Boon Shrine; chest vanishes on BOTH P1 & P2!
            p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const chest = g.dungeon.interactables.find(i => i.kind === 'vault_chest');
              g.hero.x = chest.x; g.hero.z = chest.z + 1.1;
            }""")
            p2.wait_for_function('() => window.__SANCTUM__.activeInteractable && window.__SANCTUM__.activeInteractable.kind === "vault_chest"')
            p2.keyboard.press('KeyF')
            p2.wait_for_function('() => window.__SANCTUM__.mode === "boon"', timeout=3000)
            p1.wait_for_timeout(200)

            chest_p1 = p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const c = g.dungeon.interactables.find(i => i.kind === 'vault_chest');
              return {
                mode: g.mode,
                used: c.used,
                meshVisible: c.meshRoot ? c.meshRoot.visible : true,
                colliderStillPresent: c.room.colliders.includes(c.collider)
              };
            }""")
            chest_p2 = p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const c = g.dungeon.interactables.find(i => i.kind === 'vault_chest');
              return {
                mode: g.mode,
                used: c.used,
                meshVisible: c.meshRoot ? c.meshRoot.visible : true,
                colliderStillPresent: c.room.colliders.includes(c.collider)
              };
            }""")
            assert chest_p2['mode'] == 'boon', f'Winner P2 should open boon shrine: {chest_p2}'
            assert chest_p1['mode'] == 'explore', f'Non-winner P1 MUST NOT get boon shrine: {chest_p1}'
            assert chest_p1['used'] and not chest_p1['meshVisible'] and not chest_p1['colliderStillPresent'], f'Chest did not vanish on P1: {chest_p1}'
            assert chest_p2['used'] and not chest_p2['meshVisible'] and not chest_p2['colliderStillPresent'], f'Chest did not vanish on P2: {chest_p2}'
            p2.keyboard.press('Digit1')
            print('[PASS 3A] One-Time Vault Chest First-Come-First-Served & 3D Vanish Verified across Host & Client!')

            # 3B. Verify One-Time Weapon Pedestal: P2 equips Start Room weapon -> vanishes completely on P1!
            p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal' && !i.used);
              g.hero.x = ped.x; g.hero.z = ped.z + 1.0;
            }""")
            p2.wait_for_function('() => window.__SANCTUM__.activeInteractable && window.__SANCTUM__.activeInteractable.kind === "weapon_pedestal"')
            p2.keyboard.press('KeyF')
            p2.wait_for_function('() => window.__SANCTUM__.mode === "weapon"')
            p2.keyboard.press('Digit1')
            p1.wait_for_function('() => { const p = window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "weapon_pedestal"); return p && p.used && !p.pedestal.root.visible; }', timeout=3000)
            print('[PASS 3B] One-Time Weapon Pedestal Claim & 3D Vanish Verified!')

            # 3C. Verify Personal Sanctuary Facilities: P1 drinks Sacred Spring -> P2's Sacred Spring is STILL unused so P2 also drinks!
            p1.evaluate("""() => {
              const g = window.__SANCTUM__;
              const sanc = g.dungeon.rooms.find(r => r.type === 'sanctuary');
              sanc.visited = true;
              const font = g.dungeon.interactables.find(i => i.kind === 'healing_font');
              g.currentRoom = sanc;
              g.hero.hp = 40;
              g.hero.x = font.x; g.hero.z = font.z + 1.1;
            }""")
            p2.evaluate("""() => {
              const g = window.__SANCTUM__;
              const sanc = g.dungeon.rooms.find(r => r.type === 'sanctuary');
              sanc.visited = true;
              const font = g.dungeon.interactables.find(i => i.kind === 'healing_font');
              g.currentRoom = sanc;
              g.hero.hp = 35;
              g.hero.x = font.x; g.hero.z = font.z + 1.1;
            }""")
            p1.wait_for_function('() => window.__SANCTUM__.activeInteractable && window.__SANCTUM__.activeInteractable.kind === "healing_font"')
            p1.keyboard.press('KeyF')
            p1.wait_for_timeout(250)
            p1_font = p1.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, maxHp: window.__SANCTUM__.hero.maxHp, used: window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "healing_font").used })')
            p2_font_before = p2.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, used: window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "healing_font").used })')
            assert p1_font['used'] and p1_font['hp'] == p1_font['maxHp'], f'P1 should have used healing_font: {p1_font}'
            assert not p2_font_before['used'] and p2_font_before['hp'] == 35, f'P2 facility should still be unused & independent: {p2_font_before}'
            p2.wait_for_function('() => window.__SANCTUM__.activeInteractable && window.__SANCTUM__.activeInteractable.kind === "healing_font"')
            p2.keyboard.press('KeyF')
            p2.wait_for_timeout(200)
            p2_font_after = p2.evaluate('() => ({ hp: window.__SANCTUM__.hero.hp, maxHp: window.__SANCTUM__.hero.maxHp, used: window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "healing_font").used })')
            assert p2_font_after['used'] and p2_font_after['hp'] == p2_font_after['maxHp'], f'P2 should also heal independently: {p2_font_after}'
            print('[PASS 3C] Personal Sanctuary Facility Independent Per-Player Usage Verified!')

            # 3D. Ground Soul Cinder / Vitality Orbs: EVERY player sees orbs in place & absorbs independently!
            for pg in (p1, p2):
                pg.evaluate('() => { const g = window.__SANCTUM__; for (const c of g.cinderOrbs) g.scene.remove(c.mesh); g.cinderOrbs = []; }')
            # Place P2 at sanctuary center (drop spot) and P1 far away in spawn room (>20u away)
            p1.evaluate('''() => {
              const g = window.__SANCTUM__;
              const r0 = g.dungeon.rooms[0];
              g.hero.x = r0.cx;
              g.hero.z = r0.cz;
              g.currentRoom = r0;
            }''')
            p2.evaluate('''() => {
              const g = window.__SANCTUM__;
              const r = g.dungeon.rooms.find(x => x.type === "sanctuary") || g.dungeon.rooms[g.dungeon.rooms.length - 1];
              g.hero.x = r.cx;
              g.hero.z = r.cz;
              g.currentRoom = r;
            }''')
            p1_cinders_before = p1.evaluate('() => window.__SANCTUM__.hero.cinders')
            p2_cinders_before = p2.evaluate('() => window.__SANCTUM__.hero.cinders')
            # Trigger ground orb drop at Sanctuary center on P2 (simulating skill/loot orb burst + prop break)
            drop_pos = p2.evaluate('''() => {
              const g = window.__SANCTUM__;
              const r = g.dungeon.rooms.find(x => x.type === "sanctuary") || g.dungeon.rooms[g.dungeon.rooms.length - 1];
              const prop = g.dungeon.destructibles.find(d => !d.broken && Math.hypot(d.x - g.dungeon.rooms[0].cx, d.z - g.dungeon.rooms[0].cz) > 14);
              if (prop) {
                g.breakProp(prop);
              }
              g.spawnCinderOrbs(r.cx, r.cz, 24);
              return { x: r.cx, z: r.cz, propNetId: prop ? prop.netId : null };
            }''')
            # Also sync prop position on P1 if prop existed so we check exact position
            p1.wait_for_timeout(550)
            # Have P2 also walk onto the broken prop spot if any so P2 absorbs 100% of orbs
            p2.evaluate('''() => {
              const g = window.__SANCTUM__;
              if (g.cinderOrbs.length > 0) {
                g.hero.x = g.cinderOrbs[0].x;
                g.hero.z = g.cinderOrbs[0].z;
              }
            }''')
            p1.wait_for_timeout(350)
            p2_after_absorb = p2.evaluate('() => ({ cinders: window.__SANCTUM__.hero.cinders, orbsLeft: window.__SANCTUM__.cinderOrbs.length })')
            p1_still_waiting = p1.evaluate('''() => ({
              cinders: window.__SANCTUM__.hero.cinders,
              orbsLeft: window.__SANCTUM__.cinderOrbs.length,
              allVisibleInScene: window.__SANCTUM__.cinderOrbs.every(c => c.mesh && c.mesh.parent === window.__SANCTUM__.scene)
            })''')
            p2_gain = p2_after_absorb['cinders'] - p2_cinders_before
            assert p2_after_absorb['orbsLeft'] == 0 and p2_gain >= 24, f'P2 should have absorbed all ground orbs: {p2_after_absorb} gain={p2_gain}'
            assert p1_still_waiting['orbsLeft'] >= 4 and p1_still_waiting['allVisibleInScene'], f'P1 orbs MUST still remain untouched on ground: {p1_still_waiting}'
            assert p1_still_waiting['cinders'] == p1_cinders_before, f'P1 cinders should not change while far away: {p1_still_waiting}'

            # Now P1 walks over to each orb cluster and absorbs them independently!
            for _ in range(4):
                rem = p1.evaluate('''() => {
                  const g = window.__SANCTUM__;
                  if (g.cinderOrbs.length > 0) {
                    g.hero.x = g.cinderOrbs[0].x;
                    g.hero.z = g.cinderOrbs[0].z;
                  }
                  return g.cinderOrbs.length;
                }''')
                if rem == 0:
                    break
                p1.wait_for_timeout(300)
            p1_after_absorb = p1.evaluate('() => ({ cinders: window.__SANCTUM__.hero.cinders, orbsLeft: window.__SANCTUM__.cinderOrbs.length })')
            p1_gain = p1_after_absorb['cinders'] - p1_cinders_before
            assert p1_after_absorb['orbsLeft'] == 0 and p1_gain == p2_gain, f'P1 should independently absorb exact same cinder total: P1={p1_gain} vs P2={p2_gain} ({p1_after_absorb})'
            print(f'[PASS 3D] Independent Ground Soul Orb Spawn & Pickup Verified! (P2 absorbed +{p2_gain}, orbs stayed for P1, then P1 walked over & absorbed +{p1_gain})')

            # 1B. Verify Floor 2 Descent ALSO produces 100% identical authoritative map across P1 & P2!
            p1.evaluate('() => window.__SANCTUM__.descendToNextFloor()')
            p1.wait_for_function('() => window.__SANCTUM__.floorIndex === 1 && window.__SANCTUM__.mode === "explore"', timeout=5000)
            p2.wait_for_function('() => window.__SANCTUM__.floorIndex === 1 && window.__SANCTUM__.mode === "explore"', timeout=5000)
            p1.wait_for_timeout(250)
            sig1_f2 = extract_world_signature(p1)
            sig2_f2 = extract_world_signature(p2)
            assert sig1_f2 == sig2_f2, f'Floor 2 map mismatch!\nP1={sig1_f2}\nP2={sig2_f2}'
            print(f'[PASS 1B] Floor 2 Synced Descent Authoritative Map 100% Identical -> Biome={sig1_f2["biomeId"]} Rooms={len(sig1_f2["rooms"])}')

            assert len(errors) == 0, f'Console/Page errors occurred: {errors}'
            print('ALL CO-OP SYNC RULES VERIFIED WITH ZERO ERRORS!')

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
