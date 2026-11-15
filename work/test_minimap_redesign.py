from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_HTML = ROOT / 'outputs' / 'sanctum-of-ash.html'
SHOT_DIR = ROOT / 'work' / 'ui_redesign_shots'
SHOT_DIR.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
    )
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = ctx.new_page()

    errors = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
    page.on(
        'console',
        lambda m: errors.append(f'CONSOLE_ERR: {m.text}')
        if m.type == 'error' and 'ws://127.0.0.1' not in m.text
        else None
    )

    page.goto(f'file://{OUT_HTML}', wait_until='domcontentloaded')
    page.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=15000)
    page.wait_for_timeout(350)

    page.click('#btn-enter-sanctum')
    page.wait_for_timeout(250)
    page.click('#btn-start')
    page.wait_for_timeout(250)
    if page.locator('#btn-char-confirm').is_visible():
        page.click('#btn-char-confirm')
        page.wait_for_timeout(350)

    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'

    # 1. Verify legend SVGs & state swatches exist and render cleanly
    dom_audit = page.evaluate('''() => {
        const wrap = document.getElementById('minimap-wrap');
        const c = document.getElementById('minimap-canvas');
        const svgs = [...wrap.querySelectorAll('.minimap-legend .mm-leg-item svg')];
        const items = [...wrap.querySelectorAll('.minimap-legend .mm-leg-item')];
        const clipped = items.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent.trim());
        return {
            canvasW: c.width,
            canvasH: c.height,
            cssW: Math.round(c.getBoundingClientRect().width),
            cssH: Math.round(c.getBoundingClientRect().height),
            svgCount: svgs.length,
            swatchCount: wrap.querySelectorAll('.minimap-state-bar .mm-swatch').length,
            clipped
        };
    }''')
    print('DOM Audit (Compact ZH):', dom_audit)
    assert dom_audit['canvasW'] == 164 and dom_audit['cssW'] == 164
    assert dom_audit['svgCount'] == 8 and dom_audit['swatchCount'] == 3
    assert len(dom_audit['clipped']) == 0, f'Legend items clipped in ZH: {dom_audit}'

    page.locator('#minimap-wrap').screenshot(path=str(SHOT_DIR / 'mm_01_start_compact_zh.png'))

    # 2. Construct mixed exploration state: visited-cleared, currentroom, unvisited neighbors, all room types
    contrast_audit = page.evaluate('''() => {
        const g = window.__SANCTUM__;
        const rooms = g.dungeon.rooms;
        const startR = rooms.find(r => r.type === 'start');
        const sanctuaryR = rooms.find(r => r.type === 'sanctuary');
        const vaultR = rooms.find(r => r.type === 'vault');
        const eliteR = rooms.find(r => r.type === 'elite');
        const bossR = rooms.find(r => r.type === 'boss');
        const combatRooms = rooms.filter(r => r.type === 'combat');

        // Reset all first
        for (const r of rooms) {
            r.visited = false;
        }
        // Mark start, first combat, sanctuary, and elite as visited; keep vault, boss, and remaining combat unvisited!
        startR.visited = true;
        startR.cleared = true;
        // Claim start weapon so start compass shows, and leave trial/cache visible in visited combat
        for (const it of startR.interactables) {
            if (it.kind === 'weapon_pedestal') it.used = true;
        }
        if (combatRooms[0]) {
            combatRooms[0].visited = true;
            combatRooms[0].cleared = true;
        }
        if (combatRooms.length > 1) {
            const obRoom = combatRooms.find(r => r.interactables.some(i => i.kind === 'trial_obelisk')) || combatRooms[combatRooms.length - 1];
            obRoom.visited = true;
            obRoom.cleared = true;
            // Keep another combat room unvisited if available
            for (const cr of combatRooms) {
                if (cr !== combatRooms[0] && cr !== obRoom) {
                    cr.visited = false;
                    cr.cleared = false;
                }
            }
        }
        if (sanctuaryR) {
            sanctuaryR.visited = true;
            sanctuaryR.cleared = true;
        }
        if (eliteR) {
            eliteR.visited = true;
            eliteR.cleared = true;
        }
        if (vaultR) {
            vaultR.visited = false;
            // Ensure vault is adjacent to at least one visited room so it appears as dark unvisited
            const hasVisNb = Object.values(vaultR.doors).some(nb => nb && nb.visited);
            if (!hasVisNb) {
                const firstNb = Object.values(vaultR.doors)[0];
                if (firstNb) { firstNb.visited = true; firstNb.cleared = true; }
            }
        }
        if (bossR) {
            bossR.visited = false;
            bossR.cleared = false;
        }

        const focusRoom = sanctuaryR || combatRooms[0] || startR;
        g.currentRoom = focusRoom;
        g.hero.x = focusRoom.cx - 3.0;
        g.hero.z = focusRoom.cz + 2.6;
        g.hero.yaw = 0.65;
        g.drawMinimap();

        // Measure pixel luminance inside a visited-cleared room corner vs an unvisited room corner
        const c = g.minimapCanvas;
        const ctx2 = g.minimapCtx;
        const w = c.width, h = c.height;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const r of rooms) {
            const known = r.visited || Object.values(r.doors).some(nb => nb && nb.visited);
            if (!known) continue;
            minX = Math.min(minX, r.cx - r.halfW);
            maxX = Math.max(maxX, r.cx + r.halfW);
            minZ = Math.min(minZ, r.cz - r.halfD);
            maxZ = Math.max(maxZ, r.cz + r.halfD);
        }
        const pad = w >= 220 ? 20 : 13;
        const scale = Math.min((w - pad * 2) / Math.max(42, maxX - minX), (h - pad * 2) / Math.max(42, maxZ - minZ));
        const midX = (minX + maxX) * 0.5, midZ = (minZ + maxZ) * 0.5;
        const sampleCornerLuma = (r) => {
            const mx = w * 0.5 + (r.cx - midX) * scale;
            const my = h * 0.5 + (r.cz - midZ) * scale;
            const rw = Math.max(15, r.halfW * 2 * scale * 0.86);
            const rh = Math.max(13, r.halfD * 2 * scale * 0.86);
            // Sample inside top-left floor area away from center icon medallion
            const sx = Math.round(mx - rw * 0.34);
            const sy = Math.round(my - rh * 0.30);
            const px = ctx2.getImageData(sx, sy, 1, 1).data;
            return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
        };
        const visLuma = sampleCornerLuma(startR);
        const unvisTarget = bossR || vaultR;
        const unvisLuma = sampleCornerLuma(unvisTarget);
        return { visLuma: round2(visLuma), unvisLuma: round2(unvisLuma), ratio: round2(visLuma / Math.max(1, unvisLuma)) };
        function round2(v) { return Math.round(v * 100) / 100; }
    }''')
    print('Luminance Contrast Audit:', contrast_audit)
    assert contrast_audit['visLuma'] > 65 and contrast_audit['unvisLuma'] < 25 and contrast_audit['ratio'] >= 3.5, (
        f'Expected strong visited vs unvisited luminance contrast, got {contrast_audit}'
    )

    page.locator('#minimap-wrap').screenshot(path=str(SHOT_DIR / 'mm_02_mixed_compact_zh.png'))
    page.screenshot(path=str(SHOT_DIR / 'mm_03_full_hud_compact_zh.png'))

    # 3. Expand Minimap with Tab & capture high-detail expanded view
    page.keyboard.press('Tab')
    page.wait_for_timeout(200)
    exp_state = page.evaluate('() => ({ cls: document.getElementById("minimap-wrap").classList.contains("expanded"), w: document.getElementById("minimap-canvas").width })')
    assert exp_state['cls'] is True and exp_state['w'] == 278
    page.locator('#minimap-wrap').screenshot(path=str(SHOT_DIR / 'mm_04_mixed_expanded_zh.png'))

    # 4. Simulate Boss Portal + Weapon Badge + Looted Vault + English UI
    en_audit = page.evaluate('''() => {
        const g = window.__SANCTUM__;
        const bossR = g.dungeon.rooms.find(r => r.type === 'boss');
        const vaultR = g.dungeon.rooms.find(r => r.type === 'vault');
        if (vaultR) {
            vaultR.visited = true;
            for (const it of vaultR.interactables) {
                if (it.kind === 'vault_chest') it.used = true;
            }
        }
        if (bossR) {
            bossR.visited = true;
            bossR.cleared = true;
            bossR.hasPortal = true;
            bossR.interactables.push({ kind: 'weapon_pedestal', used: false, x: bossR.cx + 2, z: bossR.cz });
            g.currentRoom = bossR;
            g.hero.x = bossR.cx - 3.5;
            g.hero.z = bossR.cz + 3.0;
        }
        g.handleToggleLanguage();
        g.drawMinimap();
        const wrap = document.getElementById('minimap-wrap');
        const items = [...wrap.querySelectorAll('.minimap-legend .mm-leg-item')];
        const clipped = items.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent.trim());
        return { clipped, labels: items.map(el => el.textContent.trim()) };
    }''')
    print('Expanded EN Audit:', en_audit)
    assert len(en_audit['clipped']) == 0, f'English expanded legend clipped: {en_audit}'
    page.locator('#minimap-wrap').screenshot(path=str(SHOT_DIR / 'mm_05_portal_expanded_en.png'))

    # Also verify compact EN layout + 960x600 Boss bar non-overlap
    page.keyboard.press('Tab')
    page.wait_for_timeout(160)
    page.locator('#minimap-wrap').screenshot(path=str(SHOT_DIR / 'mm_06_compact_en.png'))

    page.set_viewport_size({'width': 960, 'height': 600})
    page.wait_for_timeout(150)
    overlap_960 = page.evaluate('''() => {
        const bossWrap = document.getElementById('boss-bar-wrap');
        bossWrap.classList.remove('hidden');
        const b = bossWrap.getBoundingClientRect();
        const m = document.getElementById('minimap-wrap').getBoundingClientRect();
        const bot = document.querySelector('.hud-bottom').getBoundingClientRect();
        const ov = (r1, r2) => !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
        return { bossOverMap: ov(b, m), mapOverBottom: ov(m, bot), mapRect: { l: m.left, t: m.top, r: m.right, b: m.bottom } };
    }''')
    print('960x600 Overlap Audit:', overlap_960)
    assert not overlap_960['bossOverMap'] and not overlap_960['mapOverBottom'], f'Overlap at 960x600: {overlap_960}'

    assert len(errors) == 0, f'Console/Page errors: {errors}'
    print('ALL MINIMAP REDESIGN CHECKS PASSED!')
    browser.close()
