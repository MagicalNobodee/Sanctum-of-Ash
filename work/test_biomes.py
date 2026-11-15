from playwright.sync_api import sync_playwright
from pathlib import Path

HTML_PATH = (Path(__file__).resolve().parent.parent / 'outputs' / 'biome-showcase.html').as_uri()
SHOT_DIR = str(Path(__file__).resolve().parent / 'biome_shots')
Path(SHOT_DIR).mkdir(parents=True, exist_ok=True)

EXPECTED_BIOMES = [
    ('sunken_cathedral', 1, 'A'),
    ('withered_roothollow', 1, 'B'),
    ('ossuary_catacomb', 2, 'A'),
    ('plague_alchemica', 2, 'B'),
    ('ashen_foundry', 3, 'A'),
    ('crimson_inquisition', 3, 'B'),
    ('obsidian_throne', 4, 'A'),
    ('astral_rift', 4, 'B'),
]

SEEDS = [101101, 204809, 339157, 518233, 892417]

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
    page.wait_for_timeout(1000)

    total_audited = 0
    observed_layouts = set()

    for idx, (biome_id, depth, variant) in enumerate(EXPECTED_BIOMES):
        coord_signatures = set()
        for seed_val in SEEDS:
            res = page.evaluate(f'''() => {{
                const app = window.__BIOME_SHOWCASE__;
                app.loadBiome("{biome_id}", {seed_val});
                const d = app.dungeon;
                const audit = d.auditSeams();

                let walkFailures = [];
                for (const c of d.corridors) {{
                    const steps = 28;
                    const dirX = c.axis === 'EW' ? 1 : 0;
                    const dirZ = c.axis === 'NS' ? 1 : 0;
                    const startX = c.seamAX - dirX * 1.5;
                    const startZ = c.seamAZ - dirZ * 1.5;
                    const endX = c.seamBX + dirX * 1.5;
                    const endZ = c.seamBZ + dirZ * 1.5;
                    const entity = {{ x: startX, z: startZ }};
                    for (let k = 1; k <= steps; k++) {{
                        const prevX = entity.x;
                        const prevZ = entity.z;
                        const t = k / steps;
                        const targetX = startX + (endX - startX) * t;
                        const targetZ = startZ + (endZ - startZ) * t;
                        entity.x = targetX;
                        entity.z = targetZ;
                        d.resolveMovement(entity, prevX, prevZ, 0.44);
                        if (Math.hypot(entity.x - targetX, entity.z - targetZ) > 0.05) {{
                            walkFailures.push(`${{c.id}}@t=${{t.toFixed(2)}}`);
                            break;
                        }}
                    }}
                }}

                return {{
                    audit,
                    walkFailures,
                    roomCount: d.rooms.length,
                    corridorCount: d.corridors.length,
                    layouts: d.rooms.map(r => r.layout),
                    coordSig: d.rooms.map(r => `${{r.type}}:${{r.gx}},${{r.gz}}`).sort().join('|'),
                    kinds: d.interactables.map(i => i.kind)
                }};
            }}''')

            assert res['audit']['ok'] is True, f"{biome_id} seed {seed_val} seam issues: {res['audit']['issues']}"
            assert len(res['walkFailures']) == 0, f"{biome_id} seed {seed_val} threshold walk snagged: {res['walkFailures']}"
            assert res['roomCount'] == 8
            assert res['corridorCount'] >= 7
            for req_kind in ('forge_anvil', 'vault_chest', 'healing_font', 'blood_pact'):
                assert req_kind in res['kinds'], f"{biome_id} missing {req_kind}"

            coord_signatures.add(res['coordSig'])
            for lay in res['layouts']:
                observed_layouts.add(lay)
            total_audited += 1

        assert len(coord_signatures) >= 3, f'Expected varied random topologies for {biome_id}, got {len(coord_signatures)}'

        page.evaluate('() => window.__BIOME_SHOWCASE__.jumpToSeam("NS")')
        page.wait_for_timeout(300)
        page.screenshot(path=f'{SHOT_DIR}/seam_ns_{idx + 1:02d}_{biome_id}.png')

        page.evaluate('() => window.__BIOME_SHOWCASE__.jumpToSeam("EW")')
        page.wait_for_timeout(300)
        page.screenshot(path=f'{SHOT_DIR}/seam_ew_{idx + 1:02d}_{biome_id}.png')

        fps = page.evaluate('() => window.__BIOME_SHOWCASE__.fps')
        print(f'[{idx + 1}/8] {biome_id} (F{depth}{variant}) · 5 random seeds OK · uniqueGraphs={len(coord_signatures)} · FPS={fps}')

    assert len(errors) == 0, f'Console/page errors: {errors}'
    print(f'MODULAR SEAM & PROCEDURAL GRAPH AUDIT PASSED! {total_audited}/40 random dungeons clean · layouts={sorted(observed_layouts)}')
    browser.close()
