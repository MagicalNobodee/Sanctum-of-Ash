import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_HTML = ROOT / 'outputs' / 'sanctum-of-ash.html'
SHOT_DIR = ROOT / 'work' / 'ui_redesign_shots'
SHOT_DIR.mkdir(parents=True, exist_ok=True)

def canvas_non_empty_pixels(page, canvas_id):
    return page.evaluate(f'''() => {{
        const c = document.getElementById({canvas_id!r});
        if (!c || !c.width || !c.height) return 0;
        const ctx = c.getContext('2d');
        if (!ctx) return -1;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonZero = 0;
        for (let i = 3; i < data.length; i += 16) {{
            if (data[i] > 12) nonZero++;
        }}
        return nonZero;
    }}''')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-gl=angle', '--enable-webgl'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
    page.on('console', lambda m: errors.append(f'CONSOLE_ERR: {m.text}') if m.type == 'error' else None)

    target_url = f'file://{OUT_HTML}'
    page.goto(target_url, wait_until='domcontentloaded')

    # 1. Inspect Boot Progress Screen right after load
    boot_initial = page.evaluate('''() => ({
        bootVisible: !document.getElementById('boot-screen').classList.contains('boot-done'),
        titleHidden: document.getElementById('title-overlay').classList.contains('hidden'),
        pct: document.getElementById('boot-pct').textContent,
        stage: document.getElementById('boot-stage').textContent,
        uiStage: document.body.dataset.uiStage
    })''')
    print('Boot initial state:', boot_initial)
    page.screenshot(path=str(SHOT_DIR / '01_boot_progress.png'))
    assert boot_initial['bootVisible'], 'Boot screen should be visible initially'

    # Wait for staged boot to finish
    page.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.bootComplete === true', timeout=15000)
    page.wait_for_timeout(700)

    # 2. Verify Home Cover Page (Landing) & Real 3D Showcase Camera
    landing_state = page.evaluate('''() => {
        const titleRect = document.querySelector('.landing-editorial').getBoundingClientRect();
        const topCtrlOpacity = getComputedStyle(document.querySelector('.top-controls')).opacity;
        return {
            mode: window.__SANCTUM__.mode,
            titleStage: window.__SANCTUM__.titleStage,
            bootDone: document.getElementById('boot-screen').classList.contains('boot-done'),
            leftAligned: titleRect.left < 180 && titleRect.right < window.innerWidth * 0.5,
            topCtrlHidden: Number(topCtrlOpacity) === 0,
            camLabel: document.getElementById('landing-cam-label').textContent,
            shotCount: window.__SANCTUM__.showcaseShots.length,
            camPos0: window.__SANCTUM__.camera.position.toArray()
        };
    }''')
    print('Landing state:', landing_state)
    assert landing_state['bootDone']
    assert landing_state['titleStage'] == 'landing'
    assert landing_state['leftAligned'], f'Editorial block should sit cleanly on the left: {landing_state}'
    assert landing_state['topCtrlHidden'], 'Top utility buttons should stay hidden on cover'
    assert landing_state['shotCount'] == 4
    page.screenshot(path=str(SHOT_DIR / '02_home_cover_shot1.png'))

    # Switch to Shot 4 (Boss Sanctum live 3D camera) & capture
    page.click('#landing-cam-dots .cam-shot-dot[data-shot="3"]')
    page.wait_for_timeout(350)
    cam_label_shot4 = page.locator('#landing-cam-label').inner_text()
    print('Landing Shot 4 label:', cam_label_shot4)
    page.screenshot(path=str(SHOT_DIR / '03_home_cover_shot4_boss.png'))

    # 3. Click Enter Sanctum -> Verify Second-Level Hub
    page.click('#btn-enter-sanctum')
    page.wait_for_timeout(380)
    hub_state = page.evaluate('''() => ({
        titleStage: window.__SANCTUM__.titleStage,
        hubVisible: getComputedStyle(document.getElementById('hub-view')).display !== 'none',
        landingHidden: getComputedStyle(document.getElementById('landing-view')).display === 'none',
        soloTxt: document.getElementById('hub-solo-title').textContent,
        coopTxt: document.getElementById('hub-coop-title').textContent,
        codexTxt: document.getElementById('hub-codex-title').textContent
    })''')
    print('Hub state:', hub_state)
    assert hub_state['titleStage'] == 'hub' and hub_state['hubVisible'] and hub_state['landingHidden']
    page.screenshot(path=str(SHOT_DIR / '04_sanctuary_hub.png'))

    # 4. Open Arsenal Compendium -> Verify 20 3D Weapon Thumbnails
    page.click('#btn-compendium')
    page.wait_for_timeout(300)
    codex_info = page.evaluate('''() => {
        const imgs = [...document.querySelectorAll('#codex-grid .codex-wpn-thumb')];
        return {
            cards: document.querySelectorAll('#codex-grid .codex-card').length,
            validThumbs: imgs.filter(im => im.src.startsWith('data:image/png;base64,') && im.src.length > 1200).length
        };
    }''')
    print('Compendium state:', codex_info)
    assert codex_info['cards'] == 20 and codex_info['validThumbs'] == 20
    page.screenshot(path=str(SHOT_DIR / '05_compendium_3d.png'))
    page.click('#btn-codex-close')
    page.wait_for_timeout(200)

    # 5. Open LAN Multiplayer Lobby & return to Hub
    page.click('#btn-lan-lobby')
    page.wait_for_timeout(350)
    page.screenshot(path=str(SHOT_DIR / '06_lan_lobby.png'))
    page.click('#btn-lan-back')
    page.wait_for_timeout(220)
    assert page.evaluate('() => window.__SANCTUM__.titleStage') == 'hub'

    # 6. Start Solo Expedition -> Verify 3D Weapon HUD & Icon Metrics
    page.click('#btn-start')
    page.wait_for_timeout(450)
    hud_px_0 = canvas_non_empty_pixels(page, 'wpn-canvas-0')
    hud_px_1 = canvas_non_empty_pixels(page, 'wpn-canvas-1')
    hud_meta = page.evaluate('''() => ({
        slot0SvgCount: document.querySelectorAll('#wpn-slot-0 svg').length,
        slot1SvgCount: document.querySelectorAll('#wpn-slot-1 svg').length,
        meta0Text: document.getElementById('wpn-meta-0').textContent.trim(),
        abilityIcons: document.querySelectorAll('.ability-bar .slot-svg-ico svg').length
    })''')
    print('HUD 3D pixels & icons:', hud_px_0, hud_px_1, hud_meta)
    assert hud_px_0 > 25 and hud_px_1 > 25, 'Both HUD weapon canvases must render real 3D weapon pixels'
    assert hud_meta['slot0SvgCount'] >= 5 and hud_meta['abilityIcons'] == 5
    page.screenshot(path=str(SHOT_DIR / '07_ingame_hud_3d_weapons.png'))

    # 7. Move to Starting Weapon Pedestal & Open Two-Tier 3D Weapon Swap Modal
    page.evaluate('''() => {
        const g = window.__SANCTUM__;
        const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal' && !i.used);
        g.hero.x = ped.x;
        g.hero.z = ped.z + 1.05;
        g.heroRig.root.position.set(g.hero.x, 0, g.hero.z);
    }''')
    page.wait_for_timeout(200)
    page.keyboard.press('KeyF')
    page.wait_for_timeout(350)

    new_wpn_px = canvas_non_empty_pixels(page, 'wpn-modal-new-canvas')
    choice0_px = canvas_non_empty_pixels(page, 'wpn-choice-canvas-0')
    choice1_px = canvas_non_empty_pixels(page, 'wpn-choice-canvas-1')
    modal_info = page.evaluate('''() => {
        const topRect = document.getElementById('wpn-new-showcase').getBoundingClientRect();
        const cardsRect = document.getElementById('wpn-modal-cards').getBoundingClientRect();
        return {
            mode: window.__SANCTUM__.mode,
            statChips: document.querySelectorAll('#wpn-stat-strip .wpn-stat-chip').length,
            choiceCards: document.querySelectorAll('#wpn-modal-cards .wpn-choice-card').length,
            topAboveBottom: topRect.bottom <= cardsRect.top + 2,
            fitsViewport: cardsRect.bottom < window.innerHeight
        };
    }''')
    print('Weapon Swap Modal 3D pixels & layout:', new_wpn_px, choice0_px, choice1_px, modal_info)
    assert new_wpn_px > 60 and choice0_px > 35 and choice1_px > 35, 'Top new weapon + bottom 2 equipped weapons must all render 3D models'
    assert modal_info['choiceCards'] == 3 and modal_info['topAboveBottom']
    page.screenshot(path=str(SHOT_DIR / '08_weapon_swap_modal_3d.png'))

    # Equip into Slot 1 with Digit1
    old_w0 = page.evaluate('() => window.__SANCTUM__.hero.weapons[0].uid')
    page.keyboard.press('Digit1')
    page.wait_for_timeout(250)
    new_w0 = page.evaluate('() => window.__SANCTUM__.hero.weapons[0].uid')
    assert old_w0 != new_w0 and page.evaluate('() => window.__SANCTUM__.mode') == 'explore'

    # 8. Open Pause Menu & Verify 3D Weapon Thumbnails
    page.keyboard.press('Escape')
    page.wait_for_timeout(280)
    pause_thumbs = page.evaluate('() => document.querySelectorAll("#pause-wpn-list .pause-wpn-thumb").length')
    assert pause_thumbs == 2
    page.screenshot(path=str(SHOT_DIR / '09_pause_menu_3d.png'))

    assert len(errors) == 0, f'Unexpected errors: {errors}'
    print('ALL UI REDESIGN CHECKS PASSED WITH ZERO ERRORS!')
    browser.close()
