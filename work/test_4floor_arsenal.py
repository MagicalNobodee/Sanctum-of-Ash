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
    page.wait_for_timeout(1100)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'title'
    seam_f1 = page.evaluate('() => window.__SANCTUM__.dungeon.auditSeams()')
    assert seam_f1['ok'], f'Floor 1 seam audit failed: {seam_f1}'
    # Verify default Chinese localization + live toggle to English and back
    assert '余烬圣所' in page.text_content('#title-main'), 'Expected default Chinese title'
    page.screenshot(path=f'{SHOT_DIR}/v4_01_title.png')
    page.screenshot(path=f'{SHOT_DIR}/ui_01_title_zh.png')
    page.click('#btn-title-lang')
    page.wait_for_timeout(120)
    assert 'SANCTUM OF ASH' in page.text_content('#title-main'), 'Expected English title after toggle'
    page.screenshot(path=f'{SHOT_DIR}/ui_02_title_en.png')
    page.keyboard.press('KeyL')
    page.wait_for_timeout(120)
    assert '余烬圣所' in page.text_content('#title-main'), 'Expected Chinese title restored'

    # 0b. Verify 20-Weapon Arsenal Compendium Overlay & 5 Rarity Filters
    page.click('#btn-compendium')
    page.wait_for_timeout(180)
    assert not page.evaluate('() => document.getElementById("compendium-overlay").classList.contains("hidden")')
    codex_counts = page.evaluate("""() => ({
        totalCards: document.querySelectorAll('#codex-grid .codex-card').length,
        bossCards: document.querySelectorAll('#codex-grid .codex-card.is-boss').length,
        filterBtns: document.querySelectorAll('#codex-filters .codex-filter-btn').length
    })""")
    assert codex_counts['totalCards'] == 20, f'Expected 20 weapon cards in Compendium, got {codex_counts}'
    assert codex_counts['bossCards'] == 5, f'Expected 5 Boss Mythic cards in Compendium, got {codex_counts}'
    assert codex_counts['filterBtns'] == 6, f'Expected All + 5 Rarity filter buttons, got {codex_counts}'
    page.screenshot(path=f'{SHOT_DIR}/v5_01_compendium_zh.png')
    # Click Mythic filter tab (last button) and verify 5 cards
    page.click('#codex-filters .codex-filter-btn:last-child')
    page.wait_for_timeout(100)
    assert page.evaluate('() => document.querySelectorAll("#codex-grid .codex-card").length') == 5
    page.screenshot(path=f'{SHOT_DIR}/v5_02_compendium_mythic.png')
    page.click('#btn-codex-close')
    page.wait_for_timeout(100)
    assert page.evaluate('() => document.getElementById("compendium-overlay").classList.contains("hidden")')

    # 0c. Verify Drop Pool Strict Separation (Standard 15 vs Boss Mythic 5)
    pool_audit = page.evaluate("""() => {
        const A = window.__SANCTUM_ARSENAL__;
        let leakedBoss = 0;
        const rarSeen = new Set();
        for (let f = 1; f <= 4; f++) {
            for (let i = 0; i < 80; i++) {
                const w = A.pickRandomWeaponDrop(f, []);
                rarSeen.add(w.rarity);
                if (w.bossOnly || w.rarity === 'mythic') leakedBoss++;
            }
        }
        let nonMythicBoss = 0;
        const bossIdsSeen = new Set();
        for (let f = 1; f <= 4; f++) {
            for (let i = 0; i < 30; i++) {
                const bw = A.pickBossWeaponDrop(f, []);
                bossIdsSeen.add(bw.id);
                if (!bw.bossOnly || bw.rarity !== 'mythic') nonMythicBoss++;
            }
        }
        return { leakedBoss, stdRarities: [...rarSeen], nonMythicBoss, bossCount: bossIdsSeen.size };
    }""")
    assert pool_audit['leakedBoss'] == 0, f'Standard drop pool leaked boss weapon: {pool_audit}'
    assert pool_audit['nonMythicBoss'] == 0 and pool_audit['bossCount'] == 5, f'Boss drop pool audit failed: {pool_audit}'

    # 1. Start Floor I
    page.click('#btn-start')
    page.wait_for_timeout(500)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.floorIndex') == 0

    # 2. Verify starting Weapon Pedestal & Modal
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const ped = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal');
        g.hero.x = ped.x;
        g.hero.z = ped.z + 1.1;
    }""")
    page.wait_for_timeout(150)
    assert not page.evaluate('() => document.getElementById("interact-prompt").classList.contains("hidden")')
    assert not page.evaluate('() => document.getElementById("world-interact-pin").classList.contains("hidden")')
    ip_check = page.evaluate("""() => ({
        badge: document.getElementById('ip-badge').textContent,
        title: document.getElementById('ip-title').textContent,
        pills: document.querySelectorAll('#ip-pills .ip-pill').length,
        pinLabel: document.getElementById('world-pin-label').textContent
    })""")
    assert ip_check['badge'] == '神殿兵装' and ip_check['pills'] >= 2, f'Unexpected structured prompt: {ip_check}'
    page.screenshot(path=f'{SHOT_DIR}/ui_03_interact_zh.png')
    page.keyboard.press('KeyF')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'weapon'
    assert page.evaluate('() => document.querySelectorAll("#wpn-stat-strip .wpn-stat-chip").length') == 7
    page.screenshot(path=f'{SHOT_DIR}/v4_02_weapon_modal.png')
    page.screenshot(path=f'{SHOT_DIR}/ui_04_weapon_modal_zh.png')
    # Live toggle language inside Weapon Modal and restore
    page.keyboard.press('KeyL')
    page.wait_for_timeout(100)
    assert 'BASE DMG' in page.text_content('#wpn-stat-strip')
    page.keyboard.press('KeyL')
    page.wait_for_timeout(100)
    assert '基础伤害' in page.text_content('#wpn-stat-strip')
    # Salvage weapon (Digit3) to verify salvage cinders
    cinders_before = page.evaluate('() => window.__SANCTUM__.hero.cinders')
    page.keyboard.press('Digit3')
    page.wait_for_timeout(200)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.hero.cinders') > cinders_before

    # 3. Verify Ranged Cursor-Nearest Smart Lock-On + All 6 Weapons
    lock_check = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const combatRoom = g.dungeon.rooms.find(r => r.type === 'combat');
        g.hero.x = combatRoom.cx;
        g.hero.z = combatRoom.cz + 3.0;
        g.enterRoom(combatRoom);
        // Clear auto-spawned enemies and place 2 controlled test enemies:
        // Enemy A is closer to hero, Enemy B is closer to mouse cursor!
        for (const e of [...g.enemies]) g.scene.remove(e.rig.root);
        g.enemies = [];
        const eNearHero = g.spawnEnemy('thrall', g.hero.x - 2.0, g.hero.z - 1.5, combatRoom, { affixes: [] });
        const eNearCursor = g.spawnEnemy('acolyte', g.hero.x + 4.2, g.hero.z - 4.5, combatRoom, { affixes: ['warded'] });
        g.swapWeaponSlot(1); // Ranged slot (crossbow)
        g.aimWorld.set(eNearCursor.x + 0.3, 0.9, eNearCursor.z + 0.2);
        const locked = g.updateRangedLockTarget();
        return {
            lockedType: locked ? locked.type : null,
            reticleVis: g.lockReticle.root.visible,
            eNearCursorShield: eNearCursor.shield
        };
    }""")
    assert lock_check['lockedType'] == 'acolyte', f'Expected cursor-nearest acolyte lock, got {lock_check}'
    assert lock_check['reticleVis'] is True
    assert lock_check['eNearCursorShield'] > 0

    # Fire ranged shots & skill at cursor-locked target without moving mouse to hero!
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const target = g.enemies.find(e => e.type === 'acolyte');
        g.aimWorld.set(target.x, 0.9, target.z);
        g.tryAttack();
        g.tryWeaponSkill();
    }""")
    page.wait_for_timeout(380)
    page.screenshot(path=f'{SHOT_DIR}/v4_03_ranged_lock_combat.png')

    # Test equipping, 3D mesh mounting, LMB primary attack, RMB skill, and tempering across ALL 20 weapons!
    all_20_ids = page.evaluate('() => Object.keys(window.__SANCTUM_ARSENAL__.WEAPON_DEFS)')
    assert len(all_20_ids) == 20, f'Expected 20 weapon definitions, got {len(all_20_ids)}'
    for wpn_id in all_20_ids:
        page.evaluate(f"""() => {{
            const g = window.__SANCTUM__;
            const A = window.__SANCTUM_ARSENAL__;
            const combatRoom = g.currentRoom;
            if (g.enemies.length < 2) {{
                g.spawnEnemy('juggernaut', combatRoom.cx, combatRoom.cz - 2.2, combatRoom, {{ affixes: ['warded', 'frenzied'] }});
                g.spawnEnemy('thrall', combatRoom.cx + 1.8, combatRoom.cz - 1.6, combatRoom, {{ affixes: [] }});
            }}
            g.hero.atkState = null;
            g.hero.arcCd = 0;
            g.hero.rangedCooldown = 0;
            const inst = A.rollWeaponInstance('{wpn_id}', 2, true);
            g.openWeaponModal({{
                used: false,
                x: g.hero.x,
                z: g.hero.z,
                weaponInst: inst
            }});
            g.resolveWeaponChoice(0);
            if (g.enemies[0]) g.aimWorld.set(g.enemies[0].x, 0.9, g.enemies[0].z);
            g.tryAttack();
            g.tryWeaponSkill();
        }}""")
        page.wait_for_timeout(110)
    page.screenshot(path=f'{SHOT_DIR}/v5_03_mythic_combat.png')

    # Verify Soul Anvil Weapon Tempering upgrades active weapon tier (MK.II -> MK.III)
    temper_ok = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const A = window.__SANCTUM_ARSENAL__;
        const w = g.activeWeapon();
        const beforeTier = w.tier;
        const beforeDmg = w.dmg;
        A.temperWeaponInstance(w);
        g.updateHUD();
        return { beforeTier, afterTier: w.tier, beforeDmg, afterDmg: w.dmg };
    }""")
    assert temper_ok['afterTier'] == temper_ok['beforeTier'] + 1 and temper_ok['afterDmg'] > temper_ok['beforeDmg'], f'Temper failed: {temper_ok}'

    # 4. Test Trial Obelisk ambush & reward
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const p of [...g.projectiles]) g.scene.remove(p.mesh);
        g.projectiles = [];
        g.delayedHazards = [];
        for (const sm of [...g.summons]) g.scene.remove(sm.mesh);
        g.summons = [];
        for (const ap of [...g.acidPools]) g.scene.remove(ap.mesh);
        g.acidPools = [];
        for (const ob of [...g.orbitalBlades]) g.scene.remove(ob.mesh);
        g.orbitalBlades = [];
        for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, { allowCrit: false });
    }""")
    page.wait_for_timeout(650)
    while page.evaluate('() => window.__SANCTUM__.mode') == 'boon':
        page.keyboard.press('Digit1')
        page.wait_for_timeout(260)

    has_obelisk = page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const ob = g.dungeon.interactables.find(i => i.kind === 'trial_obelisk');
        if (!ob) return false;
        g.hero.x = ob.room.cx;
        g.hero.z = ob.room.cz;
        g.enterRoom(ob.room);
        for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, { allowCrit: false });
        return true;
    }""")
    assert has_obelisk, 'Expected trial_obelisk on Floor 1'
    page.wait_for_timeout(650)
    while page.evaluate('() => window.__SANCTUM__.mode') == 'boon':
        page.keyboard.press('Digit2')
        page.wait_for_timeout(260)

    ped_before_trial = page.evaluate('() => window.__SANCTUM__.dungeon.interactables.filter(i => i.kind === "weapon_pedestal").length')
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        const ob = g.dungeon.interactables.find(i => i.kind === 'trial_obelisk');
        g.hero.x = ob.x;
        g.hero.z = ob.z;
        g.activeInteractable = ob;
        g.tryInteract();
    }""")
    page.wait_for_timeout(150)
    trial_dbg = page.evaluate('() => ({ mode: window.__SANCTUM__.mode, isTrial: window.__SANCTUM__.currentRoom && window.__SANCTUM__.currentRoom.isTrialActive, enemies: window.__SANCTUM__.enemies.length })')
    assert trial_dbg['isTrial'] is True, f'Expected active trial, got {trial_dbg}'
    page.evaluate("""() => {
        const g = window.__SANCTUM__;
        for (const e of [...g.enemies]) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, { allowCrit: false });
    }""")
    page.wait_for_timeout(520)
    while page.evaluate('() => window.__SANCTUM__.mode') == 'boon':
        page.keyboard.press('Digit1')
        page.wait_for_timeout(260)
    ped_after_trial = page.evaluate('() => window.__SANCTUM__.dungeon.interactables.filter(i => i.kind === "weapon_pedestal").length')
    assert ped_after_trial == ped_before_trial + 1, 'Expected Trial Obelisk victory to spawn a bonus weapon pedestal'

    # 5. Progress through Floor 1 -> Floor 2 -> Floor 3 -> Floor 4 Boss Victory!
    visited_biomes = []
    for floor_idx in range(4):
        cur_floor = page.evaluate('() => window.__SANCTUM__.floorIndex')
        assert cur_floor == floor_idx, f'Expected floorIndex {floor_idx}, got {cur_floor}'
        seam = page.evaluate('() => window.__SANCTUM__.dungeon.auditSeams()')
        assert seam['ok'], f'Seam audit failed on floor {floor_idx + 1}: {seam}'
        biome_id = page.evaluate('() => window.__SANCTUM__.dungeon.biome.id')
        visited_biomes.append((floor_idx + 1, biome_id))

        # Enter Boss room on this floor
        page.evaluate("""() => {
            const g = window.__SANCTUM__;
            // Mark all non-boss rooms visited & cleared to also verify Floor Exploration Mastery on Floor 2!
            for (const r of g.dungeon.rooms) {
                if (r.type !== 'boss') { r.visited = true; r.cleared = true; }
            }
            const bossRoom = g.dungeon.rooms.find(r => r.type === 'boss');
            const spot = g.findSafeSpotInRoom(bossRoom, [[0, 3.8], [0, 2.5]], 0.9);
            g.hero.x = spot.x;
            g.hero.z = spot.z;
            g.enterRoom(bossRoom);
        }""")
        page.wait_for_timeout(350)
        has_boss = page.evaluate('() => window.__SANCTUM__.enemies.some(e => e.boss)')
        assert has_boss, f'Boss missing on floor {floor_idx + 1}'

        if floor_idx == 2:
            page.screenshot(path=f'{SHOT_DIR}/v4_04_floor3_boss.png')
        elif floor_idx == 3:
            # Verify Floor 4 Boss has Runic Ward shield & Stormcaller
            boss_shield = page.evaluate('() => window.__SANCTUM__.enemies.find(e => e.boss).maxShield')
            assert boss_shield > 0, 'Expected Floor 4 Sovereign Boss to have Runic Ward shield'
            hud_overlap = page.evaluate("""() => {
                const a = document.querySelector('.status-plaque').getBoundingClientRect();
                const b = document.getElementById('boss-bar-wrap').getBoundingClientRect();
                const m = document.getElementById('minimap-wrap').getBoundingClientRect();
                const overlapTopLeft = !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom);
                const overlapMap = !(b.right < m.left || b.left > m.right || b.bottom < m.top || b.top > m.bottom);
                return { overlapTopLeft, overlapMap, bossHpTxt: document.getElementById('boss-hp-num').textContent };
            }""")
            assert not hud_overlap['overlapTopLeft'], f'Boss bar overlapped top-left status plaque: {hud_overlap}'
            assert not hud_overlap['overlapMap'], f'Boss bar overlapped minimap: {hud_overlap}'
            assert '⛨' in hud_overlap['bossHpTxt'], f'Expected shield value in boss HP text: {hud_overlap}'
            page.screenshot(path=f'{SHOT_DIR}/v4_05_floor4_sovereign.png')
            page.screenshot(path=f'{SHOT_DIR}/ui_05_combat_boss_zh.png')

        # Vanquish Boss + minions
        page.evaluate("""() => {
            const g = window.__SANCTUM__;
            for (const e of [...g.enemies]) {
                if (e.shield > 0) g.damageEnemy(e, 99999, g.hero.x, g.hero.z, { allowCrit: true });
                if (e.hp > 0) g.damageEnemy(e, 999999, g.hero.x, g.hero.z, { allowCrit: true });
            }
        }""")
        assert page.evaluate('() => window.__SANCTUM__.floorMasteryGranted') is True

        if floor_idx < 3:
            page.wait_for_timeout(720)
            assert page.evaluate('() => window.__SANCTUM__.mode') == 'boon'
            if floor_idx == 0:
                page.screenshot(path=f'{SHOT_DIR}/ui_06_boon_modal_zh.png')
            while page.evaluate('() => window.__SANCTUM__.mode') == 'boon':
                page.keyboard.press('Digit1')
                page.wait_for_timeout(260)
            # Verify compact 32x32 icon-only relic medallion with tooltip
            relic_w = page.evaluate('() => document.querySelector(".relic-pill").getBoundingClientRect().width')
            assert 28 <= relic_w <= 36, f'Expected compact 32px relic medallion, got {relic_w}'
            # Verify Boss Victory Twin Mythic Trophy Pedestals (2-choose-1)
            boss_peds = page.evaluate("""() => {
                const g = window.__SANCTUM__;
                return g.dungeon.interactables
                    .filter(i => i.kind === 'weapon_pedestal' && i.bossChoiceGroup && !i.used)
                    .map(i => ({ id: i.weaponInst.id, rarity: i.weaponInst.rarity, bossOnly: i.weaponInst.bossOnly }));
            }""")
            assert len(boss_peds) == 2 and all(bp['rarity'] == 'mythic' and bp['bossOnly'] for bp in boss_peds), f'Expected 2 Boss Mythic trophy pedestals, got {boss_peds}'
            if floor_idx == 0:
                # Claim one Boss Mythic pedestal and verify the sibling dissolves (2-choose-1)!
                page.evaluate("""() => {
                    const g = window.__SANCTUM__;
                    const bp = g.dungeon.interactables.find(i => i.kind === 'weapon_pedestal' && i.bossChoiceGroup && !i.used);
                    g.openWeaponModal(bp);
                    g.resolveWeaponChoice(0);
                }""")
                remaining_boss_peds = page.evaluate('() => window.__SANCTUM__.dungeon.interactables.filter(i => i.kind === "weapon_pedestal" && i.bossChoiceGroup && !i.used).length')
                assert remaining_boss_peds == 0, f'Expected sibling Boss Mythic pedestal to dissolve after 2-choose-1 claim, remaining={remaining_boss_peds}'
            assert page.evaluate('() => !!window.__SANCTUM__.descentPortal') is True
            promised_biome_id = page.evaluate('() => window.__SANCTUM__.nextFloorBiome && window.__SANCTUM__.nextFloorBiome.id')
            promised_biome_name = page.evaluate('() => window.__SANCTUM__.nextFloorBiome && window.__SANCTUM__.nextFloorBiome.name')
            portal_label = page.evaluate('() => window.__SANCTUM__.dungeon.interactables.find(i => i.kind === "descent_portal").label')
            assert promised_biome_name in portal_label, f'Portal label {portal_label} missing {promised_biome_name}'
            if floor_idx == 0:
                page.evaluate("""() => {
                    const g = window.__SANCTUM__;
                    const pInter = g.dungeon.interactables.find(i => i.kind === 'descent_portal');
                    g.hero.x = pInter.x;
                    g.hero.z = pInter.z + 1.4;
                }""")
                page.wait_for_timeout(160)
                page.screenshot(path=f'{SHOT_DIR}/v4_06_abyssal_portal.png')
                page.keyboard.press('KeyL')
                page.wait_for_timeout(120)
                assert 'ABYSSAL PORTAL' in page.text_content('#ip-badge')
                page.screenshot(path=f'{SHOT_DIR}/ui_07_portal_en.png')
                page.keyboard.press('KeyL')
                page.wait_for_timeout(100)
            # Step into Abyssal Portal [F] to descend to next floor!
            page.evaluate("""() => {
                const g = window.__SANCTUM__;
                const pInter = g.dungeon.interactables.find(i => i.kind === 'descent_portal');
                g.hero.x = pInter.x;
                g.hero.z = pInter.z + 1.1;
                g.activeInteractable = pInter;
                g.tryInteract();
            }""")
            page.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=8000)
            cur_mode = page.evaluate('() => window.__SANCTUM__.mode')
            assert cur_mode == 'explore', f'Floor {floor_idx} after portal expected explore, got mode={cur_mode}, errs={errors}'
            actual_landed = page.evaluate('() => window.__SANCTUM__.dungeon.biome.id')
            assert actual_landed == promised_biome_id, f'Expected portal to land in {promised_biome_id}, got {actual_landed}'
        else:
            page.wait_for_function('() => window.__SANCTUM__.mode === "victory"', timeout=8000)
            assert page.evaluate('() => window.__SANCTUM__.mode') == 'victory'
            page.screenshot(path=f'{SHOT_DIR}/v4_07_victory.png')
            page.screenshot(path=f'{SHOT_DIR}/ui_08_victory_zh.png')

    # 6. Test New Expedition reset & Variant Alternation
    page.click('#btn-retry')
    page.wait_for_function('() => window.__SANCTUM__.mode === "explore"', timeout=8000)
    assert page.evaluate('() => window.__SANCTUM__.mode') == 'explore'
    assert page.evaluate('() => window.__SANCTUM__.floorIndex') == 0
    run2_f1_biome = page.evaluate('() => window.__SANCTUM__.dungeon.biome.id')
    assert run2_f1_biome != visited_biomes[0][1], f'Expected Run 2 Floor 1 to alternate biome, got {run2_f1_biome} twice'

    # 7. Full 8-Biome Live Game Audit (seams + prop non-overlap + gate edge block + boss names)
    ALL_8_BIOMES = [
        (0, 'sunken_cathedral'),
        (0, 'withered_roothollow'),
        (1, 'ossuary_catacomb'),
        (1, 'plague_alchemica'),
        (2, 'ashen_foundry'),
        (2, 'crimson_inquisition'),
        (3, 'obsidian_throne'),
        (3, 'astral_rift'),
    ]
    seen_boss_names = set()
    for f_idx, b_id in ALL_8_BIOMES:
        check = page.evaluate(f"""() => {{
            const g = window.__SANCTUM__;
            g.buildFloorWorld({f_idx}, {{ biomeId: '{b_id}' }});
            const d = g.dungeon;
            const seam = d.auditSeams();
            let propOverlaps = [];
            for (const r of d.rooms) {{
                for (const it of r.interactables) {{
                    for (const p of r.props) {{
                        if (!p.broken && Math.hypot(it.x - p.x, it.z - p.z) < 1.15) {{
                            propOverlaps.push(`${{it.kind}} vs ${{p.kind}} in ${{r.type}}`);
                        }}
                    }}
                }}
            }}
            const bossRoom = d.rooms.find(r => r.type === 'boss');
            const spot = g.findSafeSpotInRoom(bossRoom, [[0, 3.6], [0, 2.4]], 0.9);
            g.hero.x = spot.x;
            g.hero.z = spot.z;
            g.enterRoom(bossRoom);
            // Check full-width gate lock at 2.22m lateral offset
            const gate = d.gates.find(gt => gt.room === bossRoom);
            const isEW = gate.dir && gate.dir.dx !== 0;
            const edgeX = isEW ? gate.x : gate.x + 2.22;
            const edgeZ = isEW ? gate.z + 2.22 : gate.z;
            const gateEdgeBlocked = !d.isPointWalkable(edgeX, edgeZ, 0.14);
            const bossName = document.getElementById('boss-name').textContent;
            const bossGlow = g.enemies.find(e => e.boss).rig.cfg.glow;
            return {{ seam, propOverlaps, gateEdgeBlocked, bossName, bossGlow, expectedGlow: d.biome.palette.bossFlameHex }};
        }}""")
        assert check['seam']['ok'] is True, f"{b_id} live seam failed: {check['seam']}"
        assert len(check['propOverlaps']) == 0, f"{b_id} prop overlaps: {check['propOverlaps']}"
        assert check['gateEdgeBlocked'] is True, f"{b_id} locked gate edge leaked projectile"
        assert check['bossGlow'] == check['expectedGlow'], f"{b_id} boss glow mismatch"
        seen_boss_names.add(check['bossName'])
        if b_id in ('withered_roothollow', 'astral_rift'):
            page.wait_for_timeout(240)
            page.screenshot(path=f'{SHOT_DIR}/v4_live_{b_id}.png')
    assert len(seen_boss_names) == 8, f'Expected 8 distinct boss names across 8 biomes, got {seen_boss_names}'

    fps = page.evaluate('() => window.__SANCTUM__.fps')
    print('Visited Floor Biomes:', visited_biomes)
    print('All 8 Live Game Biomes & 8 Bosses Verified:', len(seen_boss_names))
    print('Measured FPS:', fps)
    print('Console/Page Errors:', len(errors))
    for err in errors:
        print('  ERR:', err)
    assert len(errors) == 0, f'Unexpected errors: {errors}'
    browser.close()
