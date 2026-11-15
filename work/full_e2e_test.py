from platform_test_support import chromium_args
from playwright.sync_api import sync_playwright
from pathlib import Path

HTML_PATH = (Path(__file__).resolve().parent.parent / 'outputs' / 'sanctum-of-ash.html').as_uri()
SHOT_DIR = str(Path(__file__).resolve().parent)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=chromium_args()
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = context.new_page()

    errors = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
    page.on('console', lambda m: errors.append(f'CONSOLE_{m.type}: {m.text}') if m.type in ('error', 'warning') else None)

    page.goto(HTML_PATH, wait_until='load')
    page.wait_for_timeout(1200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'

    # Start run
    page.click('#btn-start')
    page.wait_for_timeout(1200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'combat'
    assert page.evaluate('() => window.__SANCTUM__.enemies.length') == 6

    # Test WASD movement, Dash, Searing Arc, 3-hit Combo, and Flask
    old_pos = page.evaluate('() => [window.__SANCTUM__.hero.x, window.__SANCTUM__.hero.z]')
    page.keyboard.down('KeyW')
    page.wait_for_timeout(250)
    page.keyboard.up('KeyW')
    new_pos = page.evaluate('() => [window.__SANCTUM__.hero.x, window.__SANCTUM__.hero.z]')
    assert new_pos[1] < old_pos[1], f'Expected W to move north: {old_pos} -> {new_pos}'

    page.keyboard.press('Space')  # Dash
    page.wait_for_timeout(260)
    page.keyboard.press('KeyE')   # Searing Arc
    page.wait_for_timeout(150)
    page.keyboard.press('KeyJ')   # Slash 1
    page.wait_for_timeout(340)
    page.keyboard.press('KeyJ')   # Slash 2
    page.wait_for_timeout(340)
    page.keyboard.press('KeyJ')   # Slash 3 (360 Finisher)
    page.wait_for_timeout(250)
    page.screenshot(path=f'{SHOT_DIR}/final_combat.png')

    fps_combat = page.evaluate('() => window.__SANCTUM__.fps')

    # Progress through all 4 waves + 3 Relic Shrines -> Boss Victory!
    for expected_wave in range(3):
        page.evaluate("""() => {
            const g = window.__SANCTUM__;
            for (const e of [...g.enemies]) g.damageEnemy(e, 9999, g.hero.x, g.hero.z, true);
        }""")
        page.wait_for_timeout(750)
        mode = page.evaluate('() => window.__SANCTUM__.mode')
        assert mode == 'boon', f'Expected boon after wave {expected_wave}, got {mode}'
        page.keyboard.press(f'Digit{(expected_wave % 3) + 1}')
        page.wait_for_timeout(350)
        assert page.evaluate('() => window.__SANCTUM__.mode') == 'combat'
        assert page.evaluate('() => window.__SANCTUM__.takenBoons.size') == expected_wave + 1

    # Now in Wave 4 (Boss: Malakor)
    assert page.evaluate('() => window.__SANCTUM__.waveIndex') == 3
    has_boss = page.evaluate('() => window.__SANCTUM__.enemies.some(e => e.boss)')
    assert has_boss, 'Boss should be active in Wave 4'
    page.wait_for_timeout(500)
    page.screenshot(path=f'{SHOT_DIR}/final_boss.png')

    # Defeat Boss -> Verify Victory screen
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, true);
    }""")
    page.wait_for_timeout(850)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'victory'
    assert not page.evaluate('() => document.getElementById("end-overlay").classList.contains("hidden")')

    # Click Rise Again -> Verify clean reset
    page.click('#btn-retry')
    page.wait_for_timeout(400)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'combat'
    assert page.evaluate('() => window.__SANCTUM__.waveIndex') == 0
    assert page.evaluate('() => window.__SANCTUM__.takenBoons.size') == 0

    # Verify Defeat flow
    page.evaluate('() => window.__SANCTUM__.damageHero(9999, 0, 0)')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'defeat'

    print(f'ALL E2E ASSERTIONS PASSED! Retina Combat FPS: {fps_combat}, Errors/Warnings: {len(errors)}')
    for e in errors:
        print(' ', e)
    browser.close()
