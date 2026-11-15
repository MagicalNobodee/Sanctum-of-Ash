from platform_test_support import chromium_args, available_memory_mb
import base64
from pathlib import Path
import json
import os
import re
import socket
import struct
import subprocess
import threading
import time
import urllib.request
from playwright.sync_api import sync_playwright

PORT = 18799
BASE_URL = f'http://127.0.0.1:{PORT}'
SHOT_DIR = str(Path(__file__).resolve().parent)
MAX_BROWSERS = 2
EST_BROWSER_MB = 420
EST_NODE_MB = 45
SAFETY_RESERVE_MB = 900


def check_system_headroom(browser_count=MAX_BROWSERS):
    assert browser_count <= MAX_BROWSERS, f'Refusing to spawn {browser_count} browsers (cap={MAX_BROWSERS})'
    avail_mb = available_memory_mb()
    estimated_need_mb = browser_count * EST_BROWSER_MB + EST_NODE_MB
    print(
        f'[Resource Guard] Reclaimable RAM: {avail_mb:.0f} MB | '
        f'Est. test footprint ({browser_count} browsers + 1 Node): ~{estimated_need_mb} MB'
    )
    if avail_mb < estimated_need_mb + SAFETY_RESERVE_MB:
        raise RuntimeError(
            f'Insufficient free/inactive memory ({avail_mb:.0f} MB available; '
            f'need >= {estimated_need_mb + SAFETY_RESERVE_MB} MB for safe {browser_count}-browser run)'
        )


class LightweightWsPeer:
    """Zero-GPU raw WebSocket peer (~1 MB RAM) for testing 3P/4P room scaling without extra browsers."""

    def __init__(self, host='127.0.0.1', port=PORT):
        self.sock = socket.create_connection((host, port), timeout=5.0)
        key = base64.b64encode(os.urandom(16)).decode('ascii')
        req = (
            f'GET /ws HTTP/1.1\r\n'
            f'Host: {host}:{port}\r\n'
            f'Upgrade: websocket\r\n'
            f'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\n'
            f'Sec-WebSocket-Version: 13\r\n\r\n'
        )
        self.sock.sendall(req.encode('ascii'))
        buf = b''
        while b'\r\n\r\n' not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError('WebSocket handshake closed prematurely')
            buf += chunk
        header_end = buf.index(b'\r\n\r\n') + 4
        header_text = buf[:header_end].decode('latin1')
        if '101' not in header_text.splitlines()[0]:
            raise RuntimeError(f'WebSocket upgrade failed: {header_text.splitlines()[0]}')
        self._rx_buf = buf[header_end:]
        self.messages = []
        self._lock = threading.Lock()
        self.closed = False
        self.sock.settimeout(0.5)
        self._thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._thread.start()

    def _send_frame(self, payload_bytes, opcode=0x01):
        if self.closed:
            return
        mask_key = os.urandom(4)
        length = len(payload_bytes)
        header = bytearray([0x80 | opcode])
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack('!H', length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack('!Q', length))
        masked = bytes(b ^ mask_key[i & 3] for i, b in enumerate(payload_bytes))
        self.sock.sendall(bytes(header) + mask_key + masked)

    def send_json(self, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self._send_frame(raw, opcode=0x01)

    def _reader_loop(self):
        while not self.closed:
            try:
                while True:
                    frame = self._try_parse_frame()
                    if frame is None:
                        break
                    opcode, payload = frame
                    if opcode == 0x08:
                        self.closed = True
                        return
                    if opcode == 0x09:
                        self._send_frame(payload, opcode=0x0A)
                    elif opcode == 0x01:
                        msg = json.loads(payload.decode('utf-8'))
                        with self._lock:
                            self.messages.append(msg)
                chunk = self.sock.recv(4096)
                if not chunk:
                    self.closed = True
                    return
                self._rx_buf += chunk
            except socket.timeout:
                continue
            except Exception:
                self.closed = True
                return

    def _try_parse_frame(self):
        b = self._rx_buf
        if len(b) < 2:
            return None
        opcode = b[0] & 0x0F
        masked = (b[1] & 0x80) != 0
        length = b[1] & 0x7F
        idx = 2
        if length == 126:
            if len(b) < 4:
                return None
            length = struct.unpack('!H', b[2:4])[0]
            idx = 4
        elif length == 127:
            if len(b) < 10:
                return None
            length = struct.unpack('!Q', b[2:10])[0]
            idx = 10
        mask_len = 4 if masked else 0
        if len(b) < idx + mask_len + length:
            return None
        payload = b[idx + mask_len: idx + mask_len + length]
        if masked:
            mk = b[idx: idx + 4]
            payload = bytes(ch ^ mk[i & 3] for i, ch in enumerate(payload))
        self._rx_buf = b[idx + mask_len + length:]
        return opcode, payload

    def wait_for_msg(self, msg_type, timeout=3.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                for m in self.messages:
                    if m.get('type') == msg_type:
                        return m
            time.sleep(0.05)
        raise RuntimeError(f'Timed out waiting for WS message type={msg_type}')

    def close(self):
        if self.closed:
            return
        try:
            self._send_frame(b'', opcode=0x08)
        except Exception:
            pass
        self.closed = True
        try:
            self.sock.close()
        except Exception:
            pass

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

def dismiss_boons(pages):
    for _ in range(3):
        any_boon = False
        for pg in pages:
            if pg.evaluate('() => window.__SANCTUM__ && window.__SANCTUM__.mode') == 'boon':
                any_boon = True
                pg.keyboard.press('Digit1')
        if not any_boon:
            break
        pages[0].wait_for_timeout(240)

def main():
    check_system_headroom(MAX_BROWSERS)
    ws_peers = []
    proc = subprocess.Popen(
        ['node', str(Path(__file__).resolve().parent.parent / 'lan-server.mjs'), '--port', str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    try:
        lan_info = wait_for_server(BASE_URL)
        print('LAN Server Ready:', lan_info['urls'])

        with sync_playwright() as p:
            all_errors = []
            browsers = []
            pages = []

            def spawn_player_page(label, path='/', is_primary=False):
                if len(browsers) >= MAX_BROWSERS:
                    raise RuntimeError(f'Browser cap ({MAX_BROWSERS}) exceeded when spawning {label}')
                br = p.chromium.launch(
                    headless=True,
                    args=chromium_args()
                )
                browsers.append(br)
                vp = {'width': 1240, 'height': 800} if is_primary else {'width': 900, 'height': 580}
                dpr = 0.5
                ctx = br.new_context(viewport=vp, device_scale_factor=dpr)
                pg = ctx.new_page()
                pg._own_browser = br
                pg.on('pageerror', lambda e, lb=label: all_errors.append(f'[{lb}] PAGEERROR: {e}'))
                pg.on('console', lambda m, lb=label: all_errors.append(f'[{lb}] CONSOLE_{m.type}: {m.text}') if m.type == 'error' else None)
                sep = '&' if '?' in path else '?'
                full_path = f'{path}{sep}gfx=high&charTimer=3'
                pg.goto(f'{BASE_URL}{full_path}', wait_until='domcontentloaded', timeout=30000)
                pg.wait_for_function('() => window.__SANCTUM__?.bootComplete === true', timeout=30000)
                if pg.locator('#btn-enter-sanctum').is_visible():
                    pg.click('#btn-enter-sanctum')
                return pg

            def spawn_ws_peer():
                peer = LightweightWsPeer('127.0.0.1', PORT)
                ws_peers.append(peer)
                return peer

            # 1. Host (P1) opens title, enters LAN Lobby, creates room
            p1 = spawn_player_page('P1_Host', '/', is_primary=True)
            pages.append(p1)
            assert p1.evaluate('() => window.__SANCTUM__.mode') == 'title'
            p1.click('#btn-lan-lobby')
            p1.wait_for_timeout(350)
            assert p1.evaluate('() => window.__SANCTUM__.mode') == 'lobby'
            p1.fill('#lan-name-input', '烬火队长')
            p1.locator('#lan-name-input').dispatch_event('change')
            p1.click('#btn-lan-create')
            p1.wait_for_timeout(350)

            room_code = p1.text_content('#lan-room-code-val').strip()
            share_url = p1.text_content('#lan-share-url-val').strip()
            assert len(room_code) == 4, f'Expected 4-char room code, got {room_code}'
            assert f'room={room_code}' in share_url, f'Expected invite URL with room code, got {share_url}'
            assert p1.evaluate('window.__SANCTUM__.lan.playerCount') == 1
            print('Created Room:', room_code, '| Share URL:', share_url)

            # 2. P2 joins via invite URL (?room=CODE), P3 joins via room list, P4 joins via code
            p2 = spawn_player_page('P2_Frost', f'/?room={room_code}')
            pages.append(p2)
            assert p2.evaluate('() => window.__SANCTUM__.mode') == 'lobby'
            assert p2.input_value('#lan-code-input') == room_code

            # Verify Room-Full UI on real browser P2 BEFORE P2 joins, using 3 zero-GPU WS peers
            p3_ws = spawn_ws_peer()
            p3_ws.send_json({'type': 'join_room', 'code': room_code, 'name': '翠影游侠', 'themeIdx': 2})
            p3_ws.wait_for_msg('room_joined')
            p4_ws = spawn_ws_peer()
            p4_ws.send_json({'type': 'join_room', 'code': room_code, 'name': '星穹秘使', 'themeIdx': 3})
            p4_ws.wait_for_msg('room_joined')
            p5_temp = spawn_ws_peer()
            p5_temp.send_json({'type': 'join_room', 'code': room_code, 'name': '临时占座', 'themeIdx': 1})
            p5_temp.wait_for_msg('room_joined')
            p2.wait_for_timeout(200)

            p2.fill('#lan-name-input', '霜誓骑士')
            p2.locator('#lan-name-input').dispatch_event('change')
            p2.click('#lan-color-picker .lan-swatch[data-theme="1"]')
            p2.click('#btn-lan-join')
            p2.wait_for_timeout(250)
            err_txt = p2.text_content('#lan-error-box')
            assert '满员' in err_txt or 'full' in err_txt.lower(), f'Expected full error on P2 UI, got: {err_txt}'

            # Release temporary slot and verify 2P / 3P / 4P scaling progression with only 2 browsers!
            p5_temp.send_json({'type': 'leave_room'})
            p5_temp.wait_for_msg('room_left')
            p5_temp.close()
            ws_peers.remove(p5_temp)
            p3_ws.send_json({'type': 'leave_room'})
            p4_ws.send_json({'type': 'leave_room'})
            p1.wait_for_timeout(220)

            p2.click('#btn-lan-join')
            p2.wait_for_timeout(300)
            assert '小怪生命 1.78x' in p1.text_content('#lan-scale-banner'), 'Expected 2P standard mob scaling in lobby'

            p3_ws.send_json({'type': 'join_room', 'code': room_code, 'name': '翠影游侠', 'themeIdx': 2})
            p3_ws.wait_for_msg('room_joined')
            p1.wait_for_timeout(220)
            assert '小怪生命 2.36x' in p1.text_content('#lan-scale-banner'), 'Expected 3P standard mob scaling in lobby'

            p4_ws.send_json({'type': 'join_room', 'code': room_code, 'name': '星穹秘使', 'themeIdx': 3})
            p4_ws.wait_for_msg('room_joined')
            p1.wait_for_timeout(220)
            assert '小怪生命 2.93x' in p1.text_content('#lan-scale-banner'), 'Expected 4P standard mob scaling in lobby'

            # Verify Launch button requires all 4 players ready
            assert p1.is_disabled('#btn-lan-launch') is True
            p2.click('#btn-lan-ready')
            p3_ws.send_json({'type': 'update_profile', 'ready': True})
            p4_ws.send_json({'type': 'update_profile', 'ready': True})
            p1.wait_for_timeout(300)
            assert p1.is_disabled('#btn-lan-launch') is False

            p1.screenshot(path=f'{SHOT_DIR}/mp_01_lobby_4p_zh.png')
            # Test bilingual toggle inside 4P Lobby
            p1.keyboard.press('KeyL')
            p1.wait_for_timeout(140)
            assert 'CO-OP LOBBY' in p1.text_content('#lan-header')
            assert '4P Co-op · Mob HP 2.93x' in p1.text_content('#lan-scale-banner')
            p1.screenshot(path=f'{SHOT_DIR}/mp_02_lobby_4p_en.png')
            p1.keyboard.press('KeyL')
            p1.wait_for_timeout(140)

            # 3. Launch 4-Player Expedition & verify deterministic seed/biome/props sync
            p1.click('#btn-lan-launch')
            for pg in pages:
                pg.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=45000)

            states = [
                pg.evaluate("""() => ({
                    mode: window.__SANCTUM__.mode,
                    floorIndex: window.__SANCTUM__.floorIndex,
                    seed: window.__SANCTUM__.currentFloorSeed,
                    propSeed: window.__SANCTUM__.currentPropSeed,
                    biomeId: window.__SANCTUM__.dungeon.biome.id,
                    roomCount: window.__SANCTUM__.dungeon.rooms.length,
                    startWpn: window.__SANCTUM__.dungeon.interactables.find(i => i.kind === 'weapon_pedestal')?.weaponInst?.id,
                    remotes: window.__SANCTUM__.remotePlayers.size,
                    coopTxt: document.getElementById('coop-scale-text').textContent,
                    partyCards: document.querySelectorAll('#party-strip .party-card').length,
                    themeIdx: window.__SANCTUM__.localThemeIdx
                })""")
                for pg in pages
            ]
            for idx, st in enumerate(states):
                assert st['mode'] == 'explore', f'Player {idx+1} not in explore: {st}'
                assert st['seed'] == states[0]['seed'], f'Seed mismatch: {states}'
                assert st['biomeId'] == states[0]['biomeId'], f'Biome mismatch: {states}'
                assert st['roomCount'] == states[0]['roomCount'], f'Room count mismatch: {states}'
                assert st['startWpn'] == states[0]['startWpn'], f'Start weapon mismatch: {states}'
                assert st['remotes'] == 3, f'Expected 3 remote allies on P{idx+1}, got {st}'
                assert '4人 · 3.10x' in st['coopTxt'], f'Unexpected coop pill: {st}'
                assert st['partyCards'] == 4, f'Expected 4 party cards, got {st}'
            assert {st['themeIdx'] for st in states} == {0, 1}, f'Expected distinct crest colors on P1/P2: {states}'
            print('4P World Sync Verified (2 Browsers + 2 Zero-GPU WS Peers) -> Seed:', states[0]['seed'], 'Biome:', states[0]['biomeId'], 'StartWpn:', states[0]['startWpn'])

            # Verify weapon equip sync from Client P2 to all peers
            p2.evaluate("""() => {
                const g = window.__SANCTUM__;
                const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal');
                g.hero.x = ped.x;
                g.hero.z = ped.z + 1.0;
            }""")
            p2.wait_for_timeout(160)
            p2.keyboard.press('KeyF')
            p2.wait_for_timeout(160)
            assert p2.evaluate('() => window.__SANCTUM__.mode') == 'weapon'
            # Ensure P1 is NOT frozen while P2 is inspecting a weapon modal!
            p1_before_x = p1.evaluate('() => window.__SANCTUM__.hero.x')
            p1.keyboard.down('KeyD')
            p1.wait_for_timeout(200)
            p1.keyboard.up('KeyD')
            assert p1.evaluate('() => window.__SANCTUM__.hero.x') != p1_before_x, 'Host should move freely while ally has modal open'
            p2.keyboard.press('Digit1')
            p2.wait_for_timeout(250)
            p2_wpn_id = p2.evaluate('() => window.__SANCTUM__.hero.weapons[0].id')
            p1_sees_p2_wpn = p1.evaluate('() => [...window.__SANCTUM__.remotePlayers.values()].find(p => p.slot === 1).weapons[0].id')
            assert p1_sees_p2_wpn == p2_wpn_id, f'Expected P1 to see P2 weapon {p2_wpn_id}, got {p1_sees_p2_wpn}'

            # 4. Verify the standard first wave and scaled mob HP, client attacks and aggro.
            combat_info = p1.evaluate("""() => {
                const g = window.__SANCTUM__;
                const cr = g.dungeon.rooms.find(r => r.type === 'combat');
                const spot = g.findSafeSpotInRoom(cr, [[0, 2.6], [0, 0]], 0.9);
                return { roomId: cr.id, x: spot.x, z: spot.z, baseCount: cr.spawns.reduce((a, s) => a + s.count, 0) };
            }""")
            for idx, pg in enumerate(pages):
                off_x = (idx - 1.5) * 1.1
                pg.evaluate(f"""() => {{
                    const g = window.__SANCTUM__;
                    const cr = g.dungeon.rooms.find(r => r.id === {combat_info['roomId']});
                    g.hero.x = {combat_info['x']} + ({off_x});
                    g.hero.z = {combat_info['z']};
                    if ({idx} === 0) g.enterRoom(cr);
                    else g.currentRoom = cr;
                }}""")
            p1.wait_for_timeout(420)

            # Standard mode applies floor extras, 4P extras and the 1.08 pack multiplier.
            for idx, pg in enumerate(pages):
                c_chk = pg.evaluate(f"""() => {{
                    const g = window.__SANCTUM__;
                    const cr = g.dungeon.rooms.find(r => r.id === {combat_info['roomId']});
                    const thrall = g.enemies.find(e => e.type === 'thrall' && (!e.affixes || e.affixes.length === 0));
                    return {{
                        locked: cr.locked,
                        enemyCount: g.enemies.length,
                        sampleThrallMaxHp: thrall ? thrall.maxHp : null,
                        anyEnemyMaxHp: g.enemies[0] ? g.enemies[0].maxHp : 0
                    }};
                }}""")
                assert c_chk['locked'] is True, f'Room not locked on P{idx+1}: {c_chk}'
                expected_count = pg.evaluate('(base) => Math.round((base + window.__SANCTUM__.floorCfg.extraSpawns + 9) * 1.08)', combat_info['baseCount'])
                assert c_chk['enemyCount'] == expected_count, f'Expected {expected_count} spawns in 4P, got {c_chk}'
                if c_chk['sampleThrallMaxHp'] is not None:
                    assert c_chk['sampleThrallMaxHp'] == 1114, f'Expected standard 4P thrall HP, got {c_chk}'

            # Clients P2 (ranged lock-on), P3 (melee), P4 (weapon skill) attack enemies -> verify damage & aggro on Host
            hp_total_before = p1.evaluate('() => window.__SANCTUM__.enemies.reduce((s, e) => s + e.hp + e.shield, 0)')
            p2.evaluate("""() => {
                const g = window.__SANCTUM__;
                g.swapWeaponSlot(1);
                const e = g.enemies[0];
                g.aimWorld.set(e.x, 0.9, e.z);
                g.tryAttack();
                g.tryWeaponSkill();
            }""")
            p1.evaluate("""() => {
                const g = window.__SANCTUM__;
                const e = g.enemies[0];
                g.hero.x = e.x;
                g.hero.z = e.z + 1.4;
                g.aimWorld.set(e.x, 0.9, e.z);
                g.tryAttack();
                g.tryDash();
            }""")
            first_eid = p1.evaluate('() => window.__SANCTUM__.enemies[0]?.eid')
            if first_eid:
                p3_ws.send_json({
                    'type': 'relay',
                    'target': 'host',
                    'payload': {
                        'kind': 'damage_req',
                        'eid': first_eid,
                        'rawDmg': 28,
                        'srcX': 0,
                        'srcZ': 0,
                        'allowCrit': True
                    }
                })
            p1.wait_for_timeout(550)
            p1.screenshot(path=f'{SHOT_DIR}/mp_03_coop_combat_4p.png')

            combat_sync = p1.evaluate("""() => {
                const g = window.__SANCTUM__;
                const hpAfter = g.enemies.reduce((s, e) => s + e.hp + e.shield, 0);
                const threatSenders = new Set();
                for (const e of g.enemies) {
                    for (const k of Object.keys(e.threatMap || {})) threatSenders.add(k);
                }
                return { hpAfter, threatCount: threatSenders.size };
            }""")
            assert combat_sync['hpAfter'] < hp_total_before, f'Expected client attacks to damage enemies: {combat_sync} vs {hp_total_before}'
            assert combat_sync['threatCount'] >= 2, f'Expected multi-player threat tracking on Host, got {combat_sync}'
            print('4P Client->Host Combat & Aggro Verified -> Total HP:', hp_total_before, '->', combat_sync['hpAfter'], '| Threat Actors:', combat_sync['threatCount'])

            # 5. Test Downed State & Teammate Interactive Revive [F] WHILE IN COMBAT!
            p2.evaluate("""() => {
                const g = window.__SANCTUM__;
                g.hero.invuln = 0;
                g.damageHero(9999, g.hero.x + 1, g.hero.z);
            }""")
            p2.wait_for_function('''() => window.__SANCTUM__.hero.downed &&
                !document.getElementById('downed-hud-banner').classList.contains('hidden')''', timeout=10000)
            p2_down_state = p2.evaluate("""() => ({
                mode: window.__SANCTUM__.mode,
                downed: window.__SANCTUM__.hero.downed,
                bannerVis: !document.getElementById('downed-hud-banner').classList.contains('hidden')
            })""")
            assert p2_down_state['mode'] == 'explore' and p2_down_state['downed'] is True and p2_down_state['bannerVis'] is True, f'Expected P2 downed state: {p2_down_state}'

            # Move P1 right next to downed P2 and check [F] Ally Rescue prompt
            p1.evaluate("""() => {
                const g = window.__SANCTUM__;
                const p2Peer = [...g.remotePlayers.values()].find(p => p.downed);
                g.hero.x = p2Peer.x + 0.8;
                g.hero.z = p2Peer.z + 0.6;
                g.hero.invuln = 5.0;
            }""")
            p1.wait_for_timeout(220)
            rev_prompt = p1.evaluate("""() => ({
                kind: window.__SANCTUM__.activeInteractable?.kind,
                badge: document.getElementById('ip-badge').textContent,
                title: document.getElementById('ip-title').textContent
            })""")
            assert rev_prompt['kind'] == 'revive_ally' and rev_prompt['badge'] == '队友救援', f'Expected revive_ally prompt, got {rev_prompt}'
            p1.screenshot(path=f'{SHOT_DIR}/mp_04_ally_revive_zh.png')

            # P1 presses [F] to revive P2
            p1.keyboard.press('KeyF')
            p2.wait_for_function('() => !window.__SANCTUM__.hero.downed', timeout=3500)
            p2_revived = p2.evaluate('() => ({ downed: window.__SANCTUM__.hero.downed, hp: window.__SANCTUM__.hero.hp, maxHp: window.__SANCTUM__.hero.maxHp })')
            assert p2_revived['downed'] is False and p2_revived['hp'] >= p2_revived['maxHp'] * 0.45, f'Expected P2 revived at ~50% HP, got {p2_revived}'
            print('Teammate Interactive Revive Verified -> P2 Restored:', p2_revived)

            # Clear combat room & verify gate unlock + Boon Shrine across all 4 players
            p1.evaluate("""() => {
                const g = window.__SANCTUM__;
                for (let wave = 0; wave < 4 && g.enemies.length; wave++) {
                    for (const e of [...g.enemies]) {
                        if (e.shield > 0) g.damageEnemy(e, 99999, g.hero.x, g.hero.z);
                        if (e.hp > 0) g.damageEnemy(e, 999999, g.hero.x, g.hero.z);
                    }
                }
            }""")
            p1.wait_for_timeout(720)
            dismiss_boons(pages)
            for idx, pg in enumerate(pages):
                locked_now = pg.evaluate(f'() => window.__SANCTUM__.dungeon.rooms.find(r => r.id === {combat_info["roomId"]}).locked')
                assert locked_now is False, f'Expected room unlocked on P{idx+1}'

            # 6. Standard overall difficulty rescales as peers leave.
            p4_ws.send_json({'type': 'leave_room'})
            for pg in pages:
                pg.wait_for_function('() => window.__SANCTUM__.lan.playerCount === 3', timeout=5000)
            p4_ws.close()
            ws_peers.remove(p4_ws)
            p1.wait_for_timeout(350)
            for pg in pages:
                pill_txt = pg.text_content('#coop-scale-text')
                assert '3人 · 2.47x' in pill_txt, f'Expected dynamic rescale to 3P 2.47x, got {pill_txt}'
            p3_ws.send_json({'type': 'leave_room'})
            for pg in pages:
                pg.wait_for_function('() => window.__SANCTUM__.lan.playerCount === 2', timeout=5000)
            p3_ws.close()
            ws_peers.remove(p3_ws)
            p1.wait_for_timeout(350)
            for pg in pages:
                pill_txt = pg.text_content('#coop-scale-text')
                assert '2人 · 1.84x' in pill_txt, f'Expected dynamic rescale to 2P 1.84x, got {pill_txt}'
            print('Dynamic Mid-Run Player Leave Rescale Verified -> 4P 3.10x -> 3P 2.47x -> 2P 1.84x')

            # 7. Full 4-Floor Co-op Progression (Floor 1 -> 2 -> 3 -> 4 Victory via Abyssal Portals)
            for floor_idx in range(4):
                for pg in pages:
                    assert pg.evaluate('() => window.__SANCTUM__.floorIndex') == floor_idx
                seeds = {pg.evaluate('() => window.__SANCTUM__.currentFloorSeed') for pg in pages}
                biomes = {pg.evaluate('() => window.__SANCTUM__.dungeon.biome.id') for pg in pages}
                assert len(seeds) == 1 and len(biomes) == 1, f'Floor {floor_idx+1} desync: seeds={seeds}, biomes={biomes}'

                # Enter Boss Sanctum
                p1.evaluate("""() => {
                    const g = window.__SANCTUM__;
                    const br = g.dungeon.rooms.find(r => r.type === 'boss');
                    const sp = g.findSafeSpotInRoom(br, [[0, 3.6], [0, 2.4]], 0.9);
                    g.hero.x = sp.x;
                    g.hero.z = sp.z;
                    g.enterRoom(br);
                }""")
                p1.wait_for_timeout(420)
                boss_stats = p1.evaluate("""() => {
                    const b = window.__SANCTUM__.enemies.find(e => e.boss);
                    return b ? { hp: b.maxHp, shield: b.maxShield, totalEnemies: window.__SANCTUM__.enemies.length } : null;
                }""")
                assert boss_stats is not None, f'Boss missing on floor {floor_idx+1}'
                assert boss_stats['shield'] > 0, f'Expected Co-op Boss Runic Ward shield on floor {floor_idx+1}: {boss_stats}'
                assert boss_stats['totalEnemies'] >= 4, f'Expected extra Boss guards in 2P Co-op: {boss_stats}'

                if floor_idx == 0:
                    for idx, pg in enumerate(pages[1:], start=1):
                        pg.evaluate(f"""() => {{
                            const g = window.__SANCTUM__;
                            const br = g.dungeon.rooms.find(r => r.type === 'boss');
                            const sp = g.findSafeSpotInRoom(br, [[{idx * 1.8 - 2.7}, 3.4], [0, 2.4]], 0.8);
                            g.hero.x = sp.x;
                            g.hero.z = sp.z;
                            g.currentRoom = br;
                        }}""")
                    p1.wait_for_timeout(280)
                    hud_geom = p1.evaluate("""() => {
                        const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
                        const ov = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
                        const plaque = rect('.status-plaque');
                        const party = rect('#party-strip');
                        const boss = rect('#boss-bar-wrap');
                        const mmap = rect('#minimap-wrap');
                        const bottom = rect('.hud-bottom');
                        return {
                            bossOverPlaque: ov(boss, plaque),
                            bossOverParty: ov(boss, party),
                            bossOverMap: ov(boss, mmap),
                            partyOverBottom: ov(party, bottom)
                        };
                    }""")
                    assert not any(hud_geom.values()), f'Co-op HUD overlap detected: {hud_geom}'
                    p1.screenshot(path=f'{SHOT_DIR}/mp_05_boss_coop_2p.png')

                # Defeat Boss & guards
                p1.evaluate("""() => {
                    const g = window.__SANCTUM__;
                    for (const e of [...g.enemies]) {
                        if (e.shield > 0) g.damageEnemy(e, 999999, g.hero.x, g.hero.z);
                        if (e.hp > 0) g.damageEnemy(e, 9999999, g.hero.x, g.hero.z);
                    }
                }""")

                if floor_idx < 3:
                    p1.wait_for_timeout(720)
                    dismiss_boons(pages)
                    portal_biomes = {
                        pg.evaluate('() => window.__SANCTUM__.nextFloorBiome && window.__SANCTUM__.nextFloorBiome.id')
                        for pg in pages
                    }
                    assert len(portal_biomes) == 1 and None not in portal_biomes, f'Portal biome mismatch: {portal_biomes}'
                    promised_biome = next(iter(portal_biomes))

                    # Trigger Abyssal Portal from Client P2 (verifying non-host portal interaction!)
                    p2.evaluate("""() => {
                        const g = window.__SANCTUM__;
                        const pInter = g.dungeon.interactables.find(i => i.kind === 'descent_portal');
                        g.hero.x = pInter.x;
                        g.hero.z = pInter.z + 1.0;
                        g.activeInteractable = pInter;
                        g.tryInteract();
                    }""")
                    expected_next = floor_idx + 1
                    for pg in pages:
                        pg.wait_for_function(
                            f'() => window.__SANCTUM__.floorIndex === {expected_next} && window.__SANCTUM__.mode === "explore"',
                            timeout=6000
                        )
                        assert pg.evaluate('() => window.__SANCTUM__.mode') == 'explore'
                        assert pg.evaluate('() => window.__SANCTUM__.dungeon.biome.id') == promised_biome
                    print(f'Synced Portal Descent Floor {floor_idx+1} -> {floor_idx+2} ({promised_biome}) OK')
                else:
                    for idx, pg in enumerate(pages):
                        pg.wait_for_function('() => window.__SANCTUM__.mode === "victory"', timeout=5000)
                        assert pg.evaluate('() => window.__SANCTUM__.mode') == 'victory', f'Expected victory on P{idx+1}'
                    print('All Connected Players Reached Floor IV Sovereign Victory!')

            print('Total Console/Page Errors across all browsers:', len(all_errors))
            for err in all_errors:
                print('  ERR:', err)
            assert len(all_errors) == 0, f'Unexpected errors: {all_errors}'
            for br in list(browsers):
                try:
                    br.close()
                except Exception:
                    pass
    finally:
        for peer in list(ws_peers):
            try:
                peer.close()
            except Exception:
                pass
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    main()
