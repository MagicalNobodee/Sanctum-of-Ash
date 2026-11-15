import json
from pathlib import Path
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright

PORT = 18796
LOCAL_BASE = f'http://127.0.0.1:{PORT}'
NODE_BIN = 'node'
SERVER_PATH = str(Path(__file__).resolve().parent.parent / 'lan-server.mjs')
SHOT_DIR = str(Path(__file__).resolve().parent)


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
    raise RuntimeError('Server did not start in time')


def main():
    proc = subprocess.Popen(
        [NODE_BIN, SERVER_PATH, '--port', str(PORT), '--wan'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    try:
        info = wait_for_server(LOCAL_BASE)
        print('1. Local Host Server Ready:', info['urls'])

        # Verify Brotli HTML compression works
        req = urllib.request.Request(
            f'{LOCAL_BASE}/',
            headers={'Accept-Encoding': 'br, gzip'}
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            enc = resp.headers.get('Content-Encoding')
            compressed_len = len(resp.read())
            assert enc == 'br', f'Expected br encoding, got {enc}'
            assert compressed_len < 500_000, f'Expected compressed HTML < 500KB, got {compressed_len}'
            print(f'2. Brotli Compression Verified: {compressed_len / 1024:.1f} KB (Content-Encoding: {enc})')

        with sync_playwright() as p:
            errors = []
            b_host = p.chromium.launch(
                headless=True,
                args=['--no-proxy-server', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
            )
            # Remote browser uses normal system network stack (no --no-proxy-server) to hit the real public HTTPS URL
            b_remote = p.chromium.launch(
                headless=True,
                args=['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
            )
            try:
                ctx_h = b_host.new_context(viewport={'width': 1280, 'height': 820}, device_scale_factor=1.5)
                p1 = ctx_h.new_page()
                p1.on('pageerror', lambda e: errors.append(f'[Host] PAGEERROR: {e}'))
                p1.on('console', lambda m: errors.append(f'[Host] CONSOLE: {m.text}') if m.type == 'error' else None)

                p1.goto(f'{LOCAL_BASE}/?gfx=low', wait_until='domcontentloaded', timeout=30000)
                p1.wait_for_function('() => !!window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=30000)

                # Navigate Landing -> Hub -> Co-op Lobby -> Create Room
                p1.evaluate('() => window.__SANCTUM__.setTitleStage("hub")')
                p1.wait_for_timeout(150)
                p1.click('#btn-lan-lobby')
                p1.wait_for_function('() => window.__SANCTUM__.lan.connected === true', timeout=5000)

                p1.fill('#lan-name-input', '港大房主')
                p1.locator('#lan-name-input').dispatch_event('change')
                p1.click('#btn-lan-create')
                p1.wait_for_function('() => window.__SANCTUM__.lan.inRoom && !!window.__SANCTUM__.lan.roomCode', timeout=5000)

                room_code = p1.text_content('#lan-room-code-val').strip()
                lan_share = p1.text_content('#lan-share-url-val').strip()
                assert len(room_code) == 4, f'Unexpected room code: {room_code}'
                assert f':{PORT}/?room={room_code}' in lan_share, f'Unexpected LAN share URL: {lan_share}'

                # Wait for automatic public HTTPS WAN URL generation
                p1.wait_for_function(
                    '() => { const el = document.getElementById("wan-share-url-val"); return el && el.textContent.startsWith("https://"); }',
                    timeout=20000
                )
                wan_invite_url = p1.text_content('#wan-share-url-val').strip()
                assert wan_invite_url.startswith('https://') and room_code in wan_invite_url, (
                    f'Invalid WAN invite URL: {wan_invite_url}'
                )
                print('3. Public WAN Invite URL Auto-Generated:', wan_invite_url)
                p1.screenshot(path=f'{SHOT_DIR}/wan_01_lobby_invite_zh.png')

                # Remote friend clicks the public HTTPS invite URL directly
                ctx_r = b_remote.new_context(viewport={'width': 1100, 'height': 740})
                p2 = ctx_r.new_page()
                p2.on('pageerror', lambda e: errors.append(f'[Remote] PAGEERROR: {e}'))
                p2.on('console', lambda m: errors.append(f'[Remote] CONSOLE: {m.text}') if m.type == 'error' else None)

                t_load = time.time()
                p2.goto(wan_invite_url, wait_until='domcontentloaded', timeout=45000)
                p2.wait_for_function('() => !!window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=45000)
                print(f'4. Remote Friend Loaded Game Over Public HTTPS in {time.time() - t_load:.2f}s')

                # Verify Remote Friend auto-opened lobby, connected via WSS, and pre-filled room code
                assert p2.evaluate('() => window.__SANCTUM__.mode') == 'lobby'
                assert p2.input_value('#lan-code-input') == room_code
                p2.wait_for_function('() => window.__SANCTUM__.lan.connected === true', timeout=15000)
                assert p2.evaluate('() => window.__SANCTUM__.lan.isWanClient') is True

                p2.fill('#lan-name-input', '异地死党')
                p2.locator('#lan-name-input').dispatch_event('change')
                p2.click('#lan-color-picker .lan-swatch[data-theme="1"]')
                p2.click('#btn-lan-join')

                p1.wait_for_function('() => window.__SANCTUM__.lan.playerCount === 2', timeout=10000)
                p2.wait_for_function('() => window.__SANCTUM__.lan.inRoom && window.__SANCTUM__.lan.playerCount === 2', timeout=10000)

                # Wait for automatic WebRTC P2P DataChannel direct upgrade
                p1.wait_for_function('() => window.__SANCTUM__.lan.p2pPeerCount >= 1', timeout=12000)
                p2.wait_for_function('() => window.__SANCTUM__.lan.p2pPeerCount >= 1', timeout=12000)
                p1.wait_for_timeout(300)
                p1_pill = p1.text_content('#lan-conn-pill').strip()
                p2_pill = p2.text_content('#lan-conn-pill').strip()
                p2_ping = p2.evaluate('() => window.__SANCTUM__.lan.pingMs')
                print(f'5. WebRTC P2P Direct Channel Active! Host Badge: {p1_pill} | Remote Badge: {p2_pill} | P2P Ping: {p2_ping}ms')
                assert 'P2P' in p1_pill and 'P2P' in p2_pill
                p1.screenshot(path=f'{SHOT_DIR}/wan_02_lobby_2p_p2p_zh.png')

                # Ready up -> Co-op Hero Select -> Enter Floor 1 Dungeon together
                p2.click('#btn-lan-ready')
                p1.wait_for_function('() => !document.getElementById("btn-lan-launch").disabled', timeout=6000)
                p1.click('#btn-lan-launch')

                # Confirm heroes in synchronized Co-op Character Selection
                p1.wait_for_function('() => window.__SANCTUM__.isCoopCharSelectActive && window.__SANCTUM__.isCoopCharSelectActive()', timeout=8000)
                p2.wait_for_function('() => window.__SANCTUM__.isCoopCharSelectActive && window.__SANCTUM__.isCoopCharSelectActive()', timeout=8000)
                p1.click('#btn-char-confirm')
                p2.click('#btn-char-confirm')

                p1.wait_for_function('() => window.__SANCTUM__.mode === "explore" && !!window.__SANCTUM__.dungeon', timeout=15000)
                p2.wait_for_function('() => window.__SANCTUM__.mode === "explore" && !!window.__SANCTUM__.dungeon', timeout=15000)

                seed1 = p1.evaluate('() => window.__SANCTUM__.dungeon.seed')
                seed2 = p2.evaluate('() => window.__SANCTUM__.dungeon.seed')
                assert seed1 == seed2, f'Dungeon seed mismatch: {seed1} vs {seed2}'

                # Move Remote Friend and verify real-time position sync over WebRTC P2P
                pos_before = p1.evaluate('() => { const r = [...window.__SANCTUM__.remotePlayers.values()][0]; return r ? [r.x, r.z] : null; }')
                p2.keyboard.down('KeyD')
                p2.wait_for_timeout(450)
                p2.keyboard.up('KeyD')
                p1.wait_for_timeout(250)
                pos_after = p1.evaluate('() => { const r = [...window.__SANCTUM__.remotePlayers.values()][0]; return r ? [r.x, r.z] : null; }')
                assert pos_before is not None and pos_after is not None, 'Remote player avatar missing on Host'
                moved_dist = ((pos_after[0] - pos_before[0]) ** 2 + (pos_after[1] - pos_before[1]) ** 2) ** 0.5
                assert moved_dist > 0.4, f'Expected P2P movement sync > 0.4m, got {moved_dist:.3f}m'
                print(f'6. Co-op Dungeon Seed ({seed1}) & Real-Time P2P Movement Sync ({moved_dist:.2f}m) Verified!')

                assert len(errors) == 0, f'Unexpected errors: {errors}'
                print('ALL WAN + P2P E2E CHECKS PASSED WITH ZERO ERRORS!')
            finally:
                b_remote.close()
                b_host.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    main()
