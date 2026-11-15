from playwright.sync_api import sync_playwright
from pathlib import Path

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
    page.on('console', lambda m: errors.append(f'CONSOLE_{m.type}: {m.text}') if m.type in ('error', 'warning') else None)

    page.goto(HTML_PATH, wait_until='load')
    page.wait_for_timeout(1200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'
    assert page.evaluate('() => window.__SANCTUM__.dungeon.rooms.length') == 7
    page.screenshot(path=f'{SHOT_DIR}/d_01_title.png')

    # Start run in Flooded Narthex
    page.click('#btn-start')
    page.wait_for_timeout(700)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.currentRoom.type') == 'start'

    # Break destructibles in starting room & collect cinders
    broken_before = page.evaluate('() => window.__SANCTUM__.dungeon.destructibles.filter(d => d.broken).length')
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const prop = g.dungeon.destructibles[0];
        g.hero.x = prop.x;
        g.hero.z = prop.z + 1.1;
        g.aimWorld.set(prop.x, 0.9, prop.z);
    }""")
    page.keyboard.press('KeyJ')
    page.wait_for_timeout(600)
    broken_after = page.evaluate('() => window.__SANCTUM__.dungeon.destructibles.filter(d => d.broken).length')
    assert broken_after > broken_before, 'Expected sword cleave to shatter destructible urn/barrel'

    # Test Forgemaster Anvil interaction
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        g.hero.cinders = 50;
        const anvil = g.dungeon.interactables.find(i => i.kind === 'forge_anvil');
        g.hero.x = anvil.x;
        g.hero.z = anvil.z + 1.2;
    }""")
    page.wait_for_timeout(200)
    page.keyboard.press('KeyF')
    page.wait_for_timeout(250)
    assert page.evaluate('() => window.__SANCTUM__.hero.cinders') == 20
    assert page.evaluate('() => window.__SANCTUM__.hero.maxHp') == 145

    # Walk north through stone corridor into Ossuary Cloister (room 1) -> verify portcullis lock & enemy ambush!
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const hall = g.dungeon.rooms.find(r => r.gx === 0 && r.gz === -1);
        g.hero.x = hall.cx;
        g.hero.z = hall.cz + 6.0;
    }""")
    page.wait_for_timeout(450)
    locked = page.evaluate('() => window.__SANCTUM__.currentRoom.locked')
    enemy_cnt = page.evaluate('() => window.__SANCTUM__.enemies.length')
    assert locked is True and enemy_cnt == 5, f'Expected locked ambush room with 5 foes, got locked={locked}, enemies={enemy_cnt}'
    page.keyboard.press('KeyE')
    page.wait_for_timeout(180)
    page.screenshot(path=f'{SHOT_DIR}/d_02_cloister_combat.png')

    # Clear room -> verify gates unlock and Boon Reliquary triggers
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.damageEnemy(e, 9999, g.hero.x, g.hero.z, true);
    }""")
    page.wait_for_timeout(750)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'boon'
    assert page.evaluate('() => window.__SANCTUM__.currentRoom.locked') is False
    page.keyboard.press('Digit1')
    page.wait_for_timeout(300)

    # Visit Gilded Vault wing -> open chest -> pick second Relic!
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const vault = g.dungeon.rooms.find(r => r.type === 'vault');
        g.hero.x = vault.cx;
        g.hero.z = vault.cz + 1.5;
    }""")
    page.wait_for_timeout(350)
    page.screenshot(path=f'{SHOT_DIR}/d_03_vault.png')
    page.keyboard.press('KeyF')
    page.wait_for_timeout(350)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'boon'
    page.keyboard.press('Digit2')
    page.wait_for_timeout(300)
    assert page.evaluate('() => window.__SANCTUM__.takenBoons.size') == 2

    # Visit Chalice Spring Sanctuary -> test Blood Pact Altar
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const pact = g.dungeon.interactables.find(i => i.kind === 'blood_pact');
        g.hero.x = pact.x;
        g.hero.z = pact.z + 1.4;
    }""")
    page.wait_for_timeout(300)
    page.screenshot(path=f'{SHOT_DIR}/d_04_sanctuary.png')
    page.keyboard.press('KeyF')
    page.wait_for_timeout(450)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'boon'
    page.keyboard.press('Digit3')
    page.wait_for_timeout(300)

    # Enter Boss Sanctum (Malakor) -> verify Boss fight + Victory + procedural labyrinth regenerate
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const bossRoom = g.dungeon.rooms.find(r => r.type === 'boss');
        g.hero.x = bossRoom.cx;
        g.hero.z = bossRoom.cz + 6.5;
    }""")
    page.wait_for_timeout(500)
    assert page.evaluate('() => window.__SANCTUM__.enemies.some(e => e.boss)') is True
    page.screenshot(path=f'{SHOT_DIR}/d_05_boss_sanctum.png')
    fps = page.evaluate('() => window.__SANCTUM__.fps')

    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, true);
    }""")
    page.wait_for_timeout(900)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'victory'

    # Click Descend New Labyrinth -> verify fresh dungeon generation
    page.click('#btn-retry')
    page.wait_for_timeout(450)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.dungeon.rooms.filter(r => r.visited).length') == 1

    print(f'DUNGEON E2E PASSED! Retina FPS: {fps}, Console Errors/Warnings: {len(errors)}')
    for err in errors:
        print(' ', err)
    browser.close()
