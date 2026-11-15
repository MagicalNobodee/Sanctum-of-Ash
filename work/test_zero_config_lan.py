from playwright.sync_api import sync_playwright
from pathlib import Path

FILE_URL = (Path(__file__).resolve().parent.parent / 'outputs' / 'sanctum-of-ash.html').as_uri()
SHOT_DIR = str(Path(__file__).resolve().parent)

with sync_playwright() as p:
    errors = []

    b1 = p.chromium.launch(
        headless=True,
        args=['--no-proxy-server', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
    )
    b2 = p.chromium.launch(
        headless=True,
        args=['--no-proxy-server', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
    )

    try:
        # Scenario A: Player opens file:///.../sanctum-of-ash.html directly (zero CLI commands!)
        p1 = b1.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1.5).new_page()
        p1.on('pageerror', lambda e: errors.append(f'[P1] PAGEERROR: {e}'))
        p1.on('console', lambda m: errors.append(f'[P1] CONSOLE_{m.type}: {m.text}') if m.type in ('error', 'warning') else None)

        p1.goto(FILE_URL, wait_until='load')
        p1.wait_for_timeout(500)
        p1.click('#btn-lan-lobby')
        p1.wait_for_function('() => window.__SANCTUM__.lan.connected === true', timeout=4000)

        mode_1 = p1.evaluate('() => window.__SANCTUM__.lan.transportMode')
        assert mode_1 == 'lan', f'Expected file:// page to auto-connect to background LAN service, got {mode_1}'
        conn_txt = p1.text_content('#lan-conn-pill')
        assert '局域网已就绪' in conn_txt, f'Expected player-friendly ready status, got {conn_txt}'
        assert p1.evaluate('() => document.getElementById("lan-ws-input").type') == 'hidden'
        assert 'node lan-server' not in p1.text_content('#lan-overlay')

        p1.click('#btn-lan-create')
        p1.wait_for_function('() => !!window.__SANCTUM__.lan.roomCode', timeout=4000)
        room_code = p1.text_content('#lan-room-code-val').strip()
        share_url = p1.text_content('#lan-share-url-val').strip()
        assert len(room_code) == 4, f'Unexpected room code: {room_code}'
        assert ':18765/?room=' in share_url, f'Expected port 18765 invite URL, got {share_url}'
        assert p1.text_content('#lan-error-box').strip() == ''
        p1.screenshot(path=f'{SHOT_DIR}/zero_cfg_01_file_host_room.png')
        print('Scenario A1 Passed -> Direct file:// Host Created Room:', room_code, '| Invite:', share_url)

        # Player 2 joins via HTTP LAN URL into the room hosted from file://!
        p2 = b2.new_context(viewport={'width': 1100, 'height': 720}).new_page()
        p2.on('pageerror', lambda e: errors.append(f'[P2] PAGEERROR: {e}'))
        p2.on('console', lambda m: errors.append(f'[P2] CONSOLE_{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        p2.goto(f'http://127.0.0.1:18765/?room={room_code}&gfx=high', wait_until='domcontentloaded')
        p2.wait_for_function('() => !!window.__SANCTUM__ && window.__SANCTUM__.lan.connected', timeout=8000)
        p2.click('#btn-lan-join')
        p1.wait_for_function('() => window.__SANCTUM__.lan.playerCount === 2', timeout=4000)
        p2.click('#btn-lan-ready')
        p1.wait_for_function('() => !document.getElementById("btn-lan-launch").disabled', timeout=4000)
        p1.click('#btn-lan-launch')
        p1.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=5000)
        p2.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=5000)

        seed1 = p1.evaluate('() => window.__SANCTUM__.currentFloorSeed')
        seed2 = p2.evaluate('() => window.__SANCTUM__.currentFloorSeed')
        assert seed1 == seed2, f'Seed mismatch: {seed1} vs {seed2}'
        print('Scenario A2 Passed -> Cross-origin (file:// + http://) 2P Co-op Synced Seed:', seed1)

        # Scenario B: Pure Embedded Fallback when no external server is reachable
        ctx_emb = b2.new_context(viewport={'width': 1024, 'height': 680})
        e1 = ctx_emb.new_page()
        e2 = ctx_emb.new_page()
        for pg in (e1, e2):
            pg.route('**/api/lan-info', lambda route: route.abort())
            pg.goto(f'{FILE_URL}?gfx=high', wait_until='load')
            pg.wait_for_timeout(300)

        e1.click('#btn-lan-lobby')
        e1.wait_for_function('() => window.__SANCTUM__.lan.transportMode === "embedded"', timeout=4000)
        assert '本地房间已就绪' in e1.text_content('#lan-conn-pill')
        e1.click('#btn-lan-create')
        e1.wait_for_function('() => !!window.__SANCTUM__.lan.roomCode', timeout=3000)
        emb_code = e1.text_content('#lan-room-code-val').strip()

        e2.click('#btn-lan-lobby')
        e2.wait_for_function('() => window.__SANCTUM__.lan.transportMode === "embedded"', timeout=4000)
        e2.fill('#lan-code-input', emb_code)
        e2.click('#btn-lan-join')
        e1.wait_for_function('() => window.__SANCTUM__.lan.playerCount === 2', timeout=4000)
        print('Scenario B Passed -> Pure Serverless Embedded Fallback Created & Joined Room:', emb_code)

        assert len(errors) == 0, f'Unexpected errors: {errors}'
        print('Zero Console/Page Errors Verified!')
    finally:
        b1.close()
        b2.close()
