from platform_test_support import chromium_args
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

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
    logs = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
    page.on('console', lambda m: (errors.append(f'CONSOLE_{m.type}: {m.text}') if m.type in ('error', 'warning') else logs.append(m.text)))

    page.goto(HTML_PATH, wait_until='load')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{SHOT_DIR}/shot_01_title.png')

    # Start run
    page.click('#btn-start')
    page.wait_for_timeout(900)

    # Move & unleash attacks + Searing Arc toward an enemy
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        if (g.enemies.length > 0) {
            const e = g.enemies[0];
            // Teleport hero close to enemies for dramatic action test
            g.hero.x = e.x * 0.55;
            g.hero.z = e.z * 0.55;
            g.aimWorld.set(e.x, 0.9, e.z);
        }
    }""")
    page.mouse.move(760, 360)
    page.keyboard.press('KeyE')
    page.wait_for_timeout(120)
    page.keyboard.press('KeyJ')
    page.wait_for_timeout(140)
    page.screenshot(path=f'{SHOT_DIR}/shot_02_combat.png')

    # Clear wave 1 to test Boon Shrine flow
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) {
            g.damageEnemy(e, 9999, g.hero.x, g.hero.z, true);
        }
    }""")
    page.wait_for_timeout(900)
    mode_after_wave1 = page.evaluate('() => window.__SANCTUM__.mode')
    print('Mode after wave 1 clear:', mode_after_wave1)
    page.screenshot(path=f'{SHOT_DIR}/shot_03_boon.png')

    # Pick Boon #1 via keyboard and jump to Boss wave to verify Boss UI & visuals
    page.keyboard.press('Digit1')
    page.wait_for_timeout(400)
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        g.clearEntities();
        g.startWave(3);
        g.hero.x = 0;
        g.hero.z = 3.2;
    }""")
    page.wait_for_timeout(700)
    page.keyboard.press('KeyE')
    page.wait_for_timeout(160)
    page.screenshot(path=f'{SHOT_DIR}/shot_04_boss.png')

    fps = page.evaluate('() => window.__SANCTUM__.fps')
    print('Measured FPS:', fps)
    print('Errors/Warnings count:', len(errors))
    for err in errors[:20]:
        print('  ', err)
    browser.close()
