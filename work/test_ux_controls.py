from playwright.sync_api import sync_playwright
from pathlib import Path
import json

HTML_PATH = (Path(__file__).resolve().parent.parent / 'outputs' / 'sanctum-of-ash.html').as_uri()
SHOT_DIR = str(Path(__file__).resolve().parent)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist']
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = context.new_page()

    errors = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
    page.on(
        'console',
        lambda m: errors.append(f'CONSOLE_{m.type}: {m.text}')
        if m.type in ('error', 'warning') and 'ws://127.0.0.1:8765/ws' not in m.text
        else None
    )

    page.goto(HTML_PATH, wait_until='load')
    page.wait_for_timeout(900)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'
    assert page.locator('#btn-pause').count() == 0

    # 1. LAN Lobby Escape returns to Title
    page.click('#btn-lan-lobby')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'lobby'
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'

    # 2. Start Run & verify Weapon Pedestal [ESC] / Leave button keeps weapon intact!
    page.click('#btn-start')
    page.wait_for_timeout(350)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.locator('#btn-pause').count() == 0

    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal');
        g.hero.x = ped.x;
        g.hero.z = ped.z + 1.0;
    }""")
    page.wait_for_timeout(140)
    page.keyboard.press('KeyF')
    page.wait_for_timeout(150)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'weapon'
    assert not page.evaluate('() => document.getElementById("btn-wpn-leave").classList.contains("hidden")')
    page.screenshot(path=f'{SHOT_DIR}/ux_01_weapon_leave_modal.png')

    # Press Escape -> should NOT destroy or salvage pedestal!
    cinders_0 = page.evaluate('() => window.__SANCTUM__.hero.cinders')
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    ped_state = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal');
        return {
            mode: g.mode,
            used: ped.used,
            vis: ped.pedestal.floatPivot.visible,
            cinders: g.hero.cinders
        };
    }""")
    assert ped_state['mode'] == 'explore' and ped_state['used'] is False and ped_state['vis'] is True, f'Pedestal destroyed on Escape! {ped_state}'
    assert ped_state['cinders'] == cinders_0

    # Re-open and click #btn-wpn-leave -> still preserved!
    page.keyboard.press('KeyF')
    page.wait_for_timeout(120)
    page.click('#btn-wpn-leave')
    page.wait_for_timeout(120)
    assert page.evaluate('() => window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "weapon_pedestal").used') is False

    # Grant a relic boon so Pause Menu shows full build + relics
    page.evaluate('() => window.__SANCTUM__.openBoonShrine()')
    page.wait_for_timeout(140)
    page.keyboard.press('Digit1')
    page.wait_for_timeout(150)
    assert page.evaluate('() => window.__SANCTUM__.acquiredBoons.length') == 1

    # 3. Enter Combat Room & verify Solo [ESC] Pause Menu truly freezes world!
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const rm = g.dungeon.rooms.find(r => r.type === 'combat');
        g.hero.x = rm.cx;
        g.hero.z = rm.cz + 2.5;
        g.enterRoom(rm);
    }""")
    page.wait_for_timeout(200)
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'paused'
    assert not page.evaluate('() => document.getElementById("pause-overlay").classList.contains("hidden")')

    snap_a = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        return {
            time: g.time,
            runTime: g.runTime,
            hp: g.hero.hp,
            enemyPos: g.enemies.map(e => [e.x, e.z]),
            pausedDamp: g.sfx.pausedDamp,
            w0: g.hero.weapons[0].id,
            w1: g.hero.weapons[1].id
        };
    }""")
    page.screenshot(path=f'{SHOT_DIR}/ux_02_pause_menu_zh.png')

    # Wait 600ms while paused and verify 100% frozen state
    page.wait_for_timeout(600)
    snap_b = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        return {
            time: g.time,
            runTime: g.runTime,
            hp: g.hero.hp,
            enemyPos: g.enemies.map(e => [e.x, e.z])
        };
    }""")
    assert snap_a['time'] == snap_b['time'] and snap_a['runTime'] == snap_b['runTime'], f'Simulation time leaked during pause: {snap_a} vs {snap_b}'
    assert snap_a['hp'] == snap_b['hp'] and snap_a['enemyPos'] == snap_b['enemyPos'], f'Entities moved during pause: {snap_a} vs {snap_b}'
    assert snap_a['pausedDamp'] is True

    # Test bilingual switch inside Pause Menu + Swap Weapon Slot Order + Settings Persistence
    page.keyboard.press('KeyL')
    page.wait_for_timeout(120)
    assert 'EXPEDITION PAUSED' in page.text_content('#pause-title')
    page.screenshot(path=f'{SHOT_DIR}/ux_03_pause_menu_en.png')
    page.keyboard.press('KeyL')
    page.wait_for_timeout(120)
    assert '远征暂停菜单' in page.text_content('#pause-title')

    page.click('#btn-pause-swap-order')
    page.wait_for_timeout(100)
    swapped = page.evaluate('() => [window.__SANCTUM__.hero.weapons[0].id, window.__SANCTUM__.hero.weapons[1].id]')
    assert swapped == [snap_a['w1'], snap_a['w0']], f'Expected weapon slot order swap, got {swapped}'
    # Swap back so slot 0 is melee, slot 1 is ranged
    page.click('#btn-pause-swap-order')

    # Adjust volume slider & screen shake & save check
    page.evaluate("""() => {
        const sl = document.getElementById('set-vol-slider');
        sl.value = '55';
        sl.dispatchEvent(new Event('input'));
    }""")
    page.click('#set-shake-soft')
    page.wait_for_timeout(100)
    saved = page.evaluate("""() => ({
        audio: JSON.parse(localStorage.getItem('sanctum_of_ash_audio') || '{}'),
        settings: JSON.parse(localStorage.getItem('sanctum_of_ash_settings') || '{}'),
        volumeText: document.getElementById('set-vol-val').textContent
    })""")
    assert saved['audio'].get('volume') == 0.55 and '55%' in saved['volumeText'], f'Audio persistence failed: {saved}'
    assert saved['settings'].get('screenShake') == 'soft', f'Settings persistence failed: {saved}'

    # Resume via Escape
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.time') > snap_b['time']

    # 4. Auto-Pause on Tab Hide (visibilitychange)
    auto_paused = page.evaluate("""() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        const res = {
            mode: window.__SANCTUM__.mode,
            kicker: document.getElementById('pause-kicker').textContent
        };
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        return res;
    }""")
    assert auto_paused['mode'] == 'paused' and '自动暂停' in auto_paused['kicker'], f'Auto-pause failed: {auto_paused}'
    page.click('#btn-pause-resume')
    page.wait_for_timeout(120)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'

    # 5. Combat Input Buffering + Shift Dash + Flask Reject Feedback + Manual Hard-Lock [C] + Tab Expanded Map
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.scene.remove(e.rig.root);
        g.enemies = [];
        const rm = g.currentRoom;
        g.spawnEnemy('thrall', g.hero.x - 2.5, g.hero.z - 2.5, rm, { affixes: [] });
        g.spawnEnemy('acolyte', g.hero.x + 4.0, g.hero.z - 4.0, rm, { affixes: ['warded'] });
        g.swapWeaponSlot(1); // Ranged crossbow
        g.hero.hp = g.hero.maxHp;
    }""")
    page.wait_for_timeout(100)

    # Full-HP Flask press should trigger tactile reject shake
    page.keyboard.press('KeyQ')
    page.wait_for_timeout(60)
    flask_rejected = page.evaluate('() => document.getElementById("slot-flask").classList.contains("slot-reject")')
    assert flask_rejected is True, 'Expected slot-reject feedback when HP is already full'

    # ShiftLeft Dash + Buffered Weapon Skill [KeyE] during Dash!
    page.keyboard.press('ShiftLeft')
    page.wait_for_timeout(30)
    assert page.evaluate('() => window.__SANCTUM__.hero.dashTimer > 0'), 'Expected ShiftLeft to trigger Dash'
    page.keyboard.press('KeyE')
    assert page.evaluate('() => window.__SANCTUM__.inputBuffer && window.__SANCTUM__.inputBuffer.act === "skill"'), 'Expected Skill to buffer during Dash'
    page.wait_for_timeout(280)
    assert page.evaluate('() => window.__SANCTUM__.hero.arcCd > 1.0'), 'Expected buffered Skill to auto-fire right after Dash finished'

    # Manual Target Pinning [KeyC] + Expanded Map [Tab]
    pin_res = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.scene.remove(e.rig.root);
        g.enemies = [];
        g.pendingBoonQueue = [];
        if (g.mode === 'boon') {
            document.getElementById('boon-overlay').classList.add('hidden');
            g.mode = 'explore';
        }
        const rm = g.currentRoom;
        const thrall = g.spawnEnemy('thrall', g.hero.x - 2.6, g.hero.z - 2.4, rm, { affixes: [] });
        const acolyte = g.spawnEnemy('acolyte', g.hero.x + 4.2, g.hero.z - 4.0, rm, { affixes: ['warded'] });
        thrall.hp = thrall.maxHp = 999;
        acolyte.hp = acolyte.maxHp = 999;
        g.aimWorld.set(acolyte.x, 0.9, acolyte.z);
        g.togglePinTarget();
        // Now move cursor directly onto thrall; lock should remain pinned on acolyte!
        g.aimWorld.set(thrall.x, 0.9, thrall.z);
        const lockedWhilePinned = g.updateRangedLockTarget();
        g.updateHUD();
        return {
            pinnedType: lockedWhilePinned ? lockedWhilePinned.type : null,
            pillText: document.getElementById('lock-pill').textContent,
            pillPinnedClass: document.getElementById('lock-pill').classList.contains('pinned')
        };
    }""")
    assert pin_res['pinnedType'] == 'acolyte' and pin_res['pillPinnedClass'] is True, f'Manual target pin failed: {pin_res}'

    page.keyboard.press('Tab')
    page.wait_for_timeout(160)
    map_exp = page.evaluate('() => ({ cls: document.getElementById("minimap-wrap").classList.contains("expanded"), w: document.getElementById("minimap-canvas").width })')
    assert map_exp['cls'] is True and map_exp['w'] == 278, f'Expected expanded minimap on Tab, got {map_exp}'
    page.screenshot(path=f'{SHOT_DIR}/ux_04_hud_expanded_map_pin.png')

    # Unpin with KeyC and restore compact map with Tab
    page.keyboard.press('KeyC')
    page.keyboard.press('Tab')
    page.wait_for_timeout(100)
    assert page.evaluate('() => window.__SANCTUM__.pinnedEnemy === null')
    assert page.evaluate('() => !document.getElementById("minimap-wrap").classList.contains("expanded")')

    # 6. End Screen Navigation -> Return to Title via Escape or Button
    page.evaluate('() => window.__SANCTUM__.finishRun(false)')
    page.wait_for_timeout(150)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'defeat'
    assert not page.evaluate('() => document.getElementById("btn-end-title").classList.contains("hidden")')
    page.screenshot(path=f'{SHOT_DIR}/ux_05_end_overlay_nav.png')
    page.click('#btn-end-title')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'
    assert not page.evaluate('() => document.getElementById("title-overlay").classList.contains("hidden")')
    assert page.evaluate('() => document.getElementById("hud").classList.contains("hidden")')

    assert len(errors) == 0, f'Console/Page errors occurred: {errors}'
    print('ALL UX & CONTROLS E2E CHECKS PASSED CLEANLY!')
    browser.close()
