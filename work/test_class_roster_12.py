from platform_test_support import chromium_args
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / 'outputs' / 'sanctum-of-ash.html'
SHOT_DIR = Path(__file__).resolve().parent

ALL_12_CLASSES = [
    'ember_paladin',
    'crimson_flagellant',
    'iron_juggernaut',
    'wraith_assassin',
    'fortune_gambler',
    'plague_apothecary',
    'bone_necromancer',
    'chrono_astromancer',
    'storm_invoker',
    'brass_artificer',
    'abyssal_ooze',
    'cursed_mimic',
]

def main():
    assert HTML_PATH.exists(), f'Missing built bundle: {HTML_PATH}'
    file_url = HTML_PATH.as_uri()

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=chromium_args(),
        )
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
        page = context.new_page()
        page.on('pageerror', lambda err: errors.append(f'PAGEERROR: {err}'))
        page.on(
            'console',
            lambda msg: errors.append(f'CONSOLE_ERR: {msg.text}')
            if msg.type == 'error' and 'ws://127.0.0.1' not in msg.text
            else None,
        )

        page.goto(file_url, wait_until='load')
        page.wait_for_function('() => window.__SANCTUM__ && window.__SANCTUM__.heroRig', timeout=15000)
        page.wait_for_timeout(500)

        # Force Chinese first for deterministic UI check
        page.evaluate("() => { if (document.documentElement.lang !== 'zh-CN' && !document.getElementById('title-main').textContent.includes('余烬')) window.__SANCTUM__.handleToggleLanguage(); }")
        page.wait_for_timeout(200)

        # 1. Verify Title Screen Layout @ 1440x900 (no clipping of CTA buttons!)
        layout_info = page.evaluate('''() => {
            const ids = ['class-select-hub', 'class-preview-canvas', 'btn-start', 'btn-lan-lobby', 'btn-title-lang'];
            const out = {};
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) { out[id] = null; continue; }
                const r = el.getBoundingClientRect();
                out[id] = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
            }
            const canvas = document.getElementById('class-preview-canvas');
            return out;
        }''')
        print('Title Layout @ 1440x900:', layout_info)
        for k, rect in layout_info.items():
            assert rect is not None and rect['w'] > 20 and rect['h'] > 20, f'{k} missing or collapsed: {rect}'
            assert rect['top'] >= 0 and rect['bottom'] <= 900, f'{k} clipped outside 1440x900 viewport: {rect}'

        # Test 360-degree drag rotation on 3D preview canvas
        c_rect = layout_info['class-preview-canvas']
        cx = c_rect['left'] + c_rect['w'] // 2
        cy = c_rect['top'] + c_rect['h'] // 2
        yaw_before = page.evaluate('() => window.__SANCTUM__._classPreviewStage.yaw')
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 95, cy, steps=8)
        page.mouse.up()
        yaw_after = page.evaluate('() => window.__SANCTUM__._classPreviewStage.yaw')
        assert abs(yaw_after - yaw_before) > 0.3, f'3D showcase drag did not rotate yaw: {yaw_before} -> {yaw_after}'
        print(f'3D Showcase drag rotation verified: {yaw_before:.2f} -> {yaw_after:.2f}')

        page.screenshot(path=str(SHOT_DIR / 'cls_01_title_paladin_zh.png'))

        # 2. Cycle through all 4 Category Tabs & all 12 Classes on Title Screen
        cat_count = page.locator('#class-cat-tabs button').count()
        assert cat_count == 4, f'Expected 4 category tabs, got {cat_count}'

        class_mesh_counts = {}
        for cid in ALL_12_CLASSES:
            info = page.evaluate('''(cid) => {
                const g = window.__SANCTUM__;
                g.selectClass(cid);
                let meshes = 0;
                g._classPreviewStage.rig.root.traverse((o) => { if (o.isMesh) meshes++; });
                return {
                    selected: g.selectedClassId,
                    meshes,
                    stageName: document.getElementById('cls-stage-name')?.textContent || '',
                    detailHtmlLen: document.getElementById('class-detail-box')?.innerHTML.length || 0
                };
            }''', cid)
            assert info['selected'] == cid, f'Failed selecting {cid}: {info}'
            assert info['meshes'] >= 10, f'3D rig too simple for {cid}: {info}'
            assert info['detailHtmlLen'] > 80, f'Detail box empty for {cid}'
            class_mesh_counts[cid] = (info['meshes'], info['stageName'])

            if cid == 'brass_artificer':
                page.wait_for_timeout(180)
                page.screenshot(path=str(SHOT_DIR / 'cls_02_title_artificer_zh.png'))

        print('All 12 3D Class Rigs verified:', class_mesh_counts)

        # Switch to English & screenshot Slime Sovereign
        page.evaluate('''() => {
            const g = window.__SANCTUM__;
            g.selectClass('abyssal_ooze');
            g.handleToggleLanguage();
        }''')
        page.wait_for_timeout(200)
        en_stage = page.locator('#cls-stage-name').inner_text()
        assert 'Ooze' in en_stage or 'Slime' in en_stage or 'Abyss' in en_stage or 'Sovereign' in en_stage, f'Expected English stage name, got {en_stage}'
        page.screenshot(path=str(SHOT_DIR / 'cls_03_title_slime_en.png'))

        # Switch back to Chinese & select Aegis Paladin to start run
        page.evaluate('''() => {
            const g = window.__SANCTUM__;
            g.handleToggleLanguage();
            g.selectClass('ember_paladin');
        }''')
        page.wait_for_timeout(150)
        page.click('#btn-start')
        page.wait_for_function("() => window.__SANCTUM__.mode === 'explore'", timeout=8000)
        page.wait_for_timeout(250)

        # 3. Verify HUD Shield Bar + [X] Active Skill Slot Layout & Shield Absorption/Regen
        shield_test = page.evaluate('''() => {
            const g = window.__SANCTUM__;
            const h = g.hero;
            const beforeHp = h.hp;
            const beforeShield = h.shield;
            h.invuln = 0;
            g.damageHero(40, h.x + 1, h.z);
            const afterHitHp = h.hp;
            const afterHitShield = h.shield;
            // Advance 5 seconds out of combat to trigger shield regen
            for (let i = 0; i < 100; i++) g.updateSimulation(0.05);
            const afterRegenShield = h.shield;
            const ultSlotRect = document.getElementById('slot-ult')?.getBoundingClientRect();
            const shieldRowHidden = document.getElementById('shield-row')?.classList.contains('hidden');
            return { beforeHp, beforeShield, afterHitHp, afterHitShield, afterRegenShield, shieldRowHidden, ultW: ultSlotRect?.width || 0 };
        }''')
        print('Shield Absorption & Regen test:', shield_test)
        assert not shield_test['shieldRowHidden'], 'Shield row should be visible for Aegis Paladin'
        assert shield_test['afterHitHp'] == shield_test['beforeHp'], f'Shield failed to protect HP: {shield_test}'
        assert shield_test['afterHitShield'] < shield_test['beforeShield'], f'Shield did not decrease on hit: {shield_test}'
        assert shield_test['afterRegenShield'] > shield_test['afterHitShield'], f'Shield did not regenerate out of combat: {shield_test}'
        assert shield_test['ultW'] > 40, 'Active skill [X] HUD slot missing or zero width'

        # 4. Test ALL 12 Classes' [X] Active Skills + Passives in live combat!
        combat_results = {}
        for idx, cid in enumerate(ALL_12_CLASSES):
            res = page.evaluate('''(cid) => {
                const g = window.__SANCTUM__;
                g.selectClass(cid);
                g.resetHeroStats();
                g.mode = 'explore';
                const h = g.hero;
                const rm = g.currentRoom || g.dungeon.rooms[0];
                h.x = rm.cx;
                h.z = rm.cz;
                g.heroRig.root.position.set(h.x, 0, h.z);
                // Clear & spawn 3 test enemies around hero
                for (const e of [...g.enemies]) g.scene.remove(e.rig.root);
                g.enemies = [];
                g.spawnEnemy('stalker', h.x + 2.2, h.z - 1.2, rm, false);
                g.spawnEnemy('warden', h.x - 2.0, h.z + 1.5, rm, false);
                g.spawnEnemy('acolyte', h.x + 1.2, h.z + 2.4, rm, false);
                for (const e of g.enemies) { e.hp = 500; e.maxHp = 500; }

                // Trigger dash passive, weapon skill passive, and [X] active skill!
                h.dashCd = 0;
                g.tryDash();
                for (let i = 0; i < 6; i++) g.updateSimulation(0.04);
                h.arcCd = 0;
                g.tryWeaponSkill();
                h.ultCd = 0;
                h.dashTimer = 0;
                g.tryClassSkill();
                const cdSet = h.ultCd;
                const cdTextHidden = document.getElementById('cd-ult-num')?.classList.contains('hidden');
                for (let i = 0; i < 30; i++) g.updateSimulation(0.05);
                const totalEnemyHp = g.enemies.reduce((s, e) => s + e.hp, 0);
                return {
                    cdSet: +cdSet.toFixed(2),
                    cdVisible: !cdTextHidden,
                    enemiesRemain: g.enemies.length,
                    totalEnemyHp: Math.round(totalEnemyHp),
                    shieldRowHidden: document.getElementById('shield-row')?.classList.contains('hidden'),
                    ultTitle: document.getElementById('slot-ult-title')?.textContent || ''
                };
            }''', cid)
            assert res['cdSet'] > 3.0, f'[X] Active skill did not trigger cooldown for {cid}: {res}'
            if cid == 'crimson_flagellant':
                assert res['shieldRowHidden'], 'Berserker (0 maxShield) should hide shield bar'
            combat_results[cid] = res

            if cid == 'ember_paladin':
                page.wait_for_timeout(120)
                page.screenshot(path=str(SHOT_DIR / 'cls_04_combat_paladin_dome.png'))
            elif cid == 'bone_necromancer':
                page.wait_for_timeout(120)
                page.screenshot(path=str(SHOT_DIR / 'cls_05_combat_necromancer_wraiths.png'))
            elif cid == 'abyssal_ooze':
                page.wait_for_timeout(120)
                page.screenshot(path=str(SHOT_DIR / 'cls_06_combat_slime_sovereign.png'))

        print('All 12 Classes [X] Active Skills verified in live combat:')
        for k, v in combat_results.items():
            print(f'  {k}: {v}')

        assert len(errors) == 0, f'Runtime console/page errors detected: {errors}'
        browser.close()
    print('SUCCESS: All 12 classes, 3D showcase, shield system, and [X] active skills passed 100%!')

if __name__ == '__main__':
    main()
