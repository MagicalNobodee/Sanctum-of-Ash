"""Energy supply checks run inside the existing serial balance browser suite."""


def run_energy_drop_checks(page):
    result = page.evaluate('''() => {
      const g = window.__SANCTUM__;
      g.mode = 'paused';
      const saved = { index: g.floorIndex, cfg: g.floorCfg, difficulty: g.selectedDifficultyId };
      const room = g.dungeon.rooms.find(r => r.type === 'boss');
      const energy = () => g.cinderOrbs.filter(o => o.orbKind === 'energy').reduce((n, o) => n + o.value, 0);
      const hit = (e, damage) => g.damageEnemy(e, damage, e.x, e.z, { allowCrit: false, weaponInst: { def: { category: 'melee' } } });
      const rows = [];
      const rolls = [0, 0.23, 0.24, 0.37, 0.38, 0.49, 0.50, 0.99];
      for (let floor = 0; floor < 4; floor++) {
        g.floorIndex = floor;
        g.floorCfg = g.floorConfigs[floor];
        for (const difficulty of ['pilgrim', 'standard', 'bloodfire', 'abyssal']) {
          g.setDifficulty(difficulty, false);
          const sc = g.getActiveScaling();
          for (const [type, affixes, summon, chance, base] of [
            ['thrall', [], false, 0.24, 7], ['juggernaut', [], false, 0.38, 10],
            ['thrall', ['frenzied'], false, 0.38, 10], ['thrall', [], true, 0.50, 10]
          ]) {
            const probability = summon ? chance : chance / Math.pow(Math.max(1, sc.spawnMult), 0.35);
            const value = Math.round(base * Math.pow(Math.max(1, sc.mobHpMult), 0.32));
            for (const roll of rolls) {
              g.clearEntities();
              g.spawnEnemy('thrall', room.cx + 4, room.cz, room, { affixes: [] });
              const e = g.spawnEnemy(type, room.cx, room.cz, room, { affixes, bossSummon: summon });
              const random = Math.random;
              try { Math.random = () => roll; g.killEnemy(e); }
              finally { Math.random = random; }
              if (energy() !== (roll < probability ? value : 0)) throw Error(`Mob drop ${floor}/${difficulty}/${type}/${roll}: ${energy()}`);
            }
          }
          g.clearEntities();
          const e = g.spawnEnemy('warden', room.cx, room.cz, room, { affixes: [], maxHp: 1000, maxShield: 0 });
          e.shield = 0;
          for (const [hp, stages] of [[751, 0], [750, 1], [749, 1], [500, 2], [499, 2], [250, 3], [249, 3]]) {
            e.hp = hp + 1;
            hit(e, 1);
            if (energy() !== stages * e.bossEnergyDrop) throw Error(`Boss threshold ${floor}/${difficulty}/${hp}: ${energy()}`);
          }
          const count = g.cinderOrbs.filter(o => o.orbKind === 'energy').length;
          if (count < 15 || count > 30) throw Error(`Boss burst count ${count}`);
          rows.push({ floor, difficulty, drop: e.bossEnergyDrop, total: energy(), guards: g.getBossGuardCount() });
          g.clearEntities();
          const burst = g.spawnEnemy('warden', room.cx, room.cz, room, { affixes: [], maxHp: 1000, maxShield: 0 });
          burst.shield = 0;
          hit(burst, 800);
          if (burst.bossEnergyStage !== 3 || energy() !== 3 * burst.bossEnergyDrop) throw Error('Skipped bloodlines');
          g.clearEntities();
          const lethal = g.spawnEnemy('warden', room.cx, room.cz, room, { affixes: [], maxHp: 1000, maxShield: 0 });
          lethal.shield = 0;
          hit(lethal, 1001);
          if (energy() !== 3 * lethal.bossEnergyDrop + 48) throw Error('Lethal reward missing or duplicated');
          const before = energy();
          hit(lethal, 100);
          if (energy() !== before) throw Error('Dead boss repeated rewards');
        }
      }
      // Isolate add count: eight extra initial guards remove 40 energy from the budget.
      g.setDifficulty('standard', false);
      const sparse = { x: room.cx, z: room.cz, type: 'warden', hp: 750, maxHp: 1000, room: { spawns: [] } };
      const crowded = { ...sparse, room: { spawns: [{ type: 'thrall', count: 8 }] } };
      g.dropBossEnergyMilestones(sparse);
      g.dropBossEnergyMilestones(crowded);
      if (!(sparse.bossEnergyDrop > crowded.bossEnergyDrop)) throw Error('Sparse boss not compensated');
      const prop = g.dungeon.destructibles.find(p => !p.broken);
      if (!prop) throw Error('No breakable for energy regression');
      for (const roll of [0.119, 0.12, 0.9]) {
        g.clearEntities();
        prop.broken = false;
        const random = Math.random;
        try { Math.random = () => roll; g.breakProp(prop); }
        finally { Math.random = random; }
        if (energy() !== (roll < 0.12 ? 6 : 0)) throw Error('Prop energy drop');
      }
      g.clearEntities();
      g.floorIndex = saved.index;
      g.floorCfg = saved.cfg;
      g.setDifficulty(saved.difficulty, false);
      return rows;
    }''')
    assert len(result) == 16
    print('[PASS] Energy drops: 512 deterministic mob checks, props, 16 boss configurations, bloodline skips/death:', result)


def run_coop_energy_checks(host, client):
    for page in (host, client):
        page.evaluate('''() => { const g = window.__SANCTUM__; g.mode = 'title'; g.clearEntities(); }''')
    client.evaluate('''() => {
      const g = window.__SANCTUM__;
      g.dropBossEnergyMilestones({ hp: 0, maxHp: 1000 });
      if (g.cinderOrbs.length) throw Error('Client generated authoritative boss rewards');
    }''')
    expected = host.evaluate('''() => {
      const g = window.__SANCTUM__;
      const room = g.dungeon.rooms.find(r => r.type === 'boss');
      const e = g.spawnEnemy('warden', room.cx, room.cz, room, { affixes: [], maxHp: 1000, maxShield: 0 });
      e.shield = 0;
      g.damageEnemy(e, 800, e.x, e.z, { allowCrit: false, weaponInst: { def: { category: 'melee' } } });
      return g.cinderOrbs.filter(o => o.orbKind === 'energy').map(o => ({ value: o.value, vx: o.vx, vz: o.vz }));
    }''')
    client.wait_for_function('(n) => window.__SANCTUM__.cinderOrbs.filter(o => o.orbKind === "energy").length >= n', arg=len(expected), timeout=8000)
    actual = client.evaluate('''() => window.__SANCTUM__.cinderOrbs.filter(o => o.orbKind === 'energy').map(o => ({ value: o.value, vx: o.vx, vz: o.vz }))''')
    assert actual == expected, (expected, actual)
    for page in (host, client):
        page.evaluate('''() => {
          const g = window.__SANCTUM__;
          g.hero.energy = 0;
          for (const o of g.cinderOrbs.filter(o => o.orbKind === 'energy')) {
            o.x = g.hero.x; o.z = g.hero.z; o.y = 0; o.age = 3;
          }
          g.updateSimulation(0.001);
        }''')
    totals = [p.evaluate('() => window.__SANCTUM__.hero.energy') for p in (host, client)]
    assert totals[0] > 0 and totals[0] == totals[1], totals
    print('[PASS] Boss energy bursts synchronized once; both players collected independently:', totals)
