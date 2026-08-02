// Heuristic bot playtest: actually plays each level with the powers the player
// would own at that point, and reports how far it gets.
//
//   node tests/bot.mjs [--level N] [--seconds 60]

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const ONLY = flag('--level') !== null ? Number(flag('--level')) : null;
const BUDGET = Number(flag('--seconds', '55'));
const URL = flag('--url', 'http://127.0.0.1:8123/index.html');
const SHOT_DIR = 'tests/shots';
mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.TELEPATH && window.TELEPATH.game, null, { timeout: 30000 });
const box = await (await page.$('#game')).boundingBox();

const total = await page.evaluate(async () => (await import('./src/data/levels.js')).LEVELS.length);
const indices = ONLY !== null ? [ONLY] : [...Array(total).keys()];

// The brain lives in the page so it can run every frame instead of over RPC.
await page.evaluate(() => {
  window.BOT = {
    on: false, stuckT: 0, lastX: 0, actT: 0, jumpT: 0, tick: 0,
    log: [], maxX: 0, deaths: 0, reached: false,
  };

  const B = window.BOT;
  const orig = window.TELEPATH.game.update.bind(window.TELEPATH.game);
  window.TELEPATH.game.update = function botUpdate(dt) {
    orig(dt);
    if (!B.on) return;
    const g = window.TELEPATH.game;
    if (g.scene === 'complete') { B.reached = true; B.on = false; return; }
    if (g.scene !== 'play' || !g.player) return;
    if (g.dialogue) { g.dialogue = null; g.cutscene = null; return; }
    const p = g.player;
    if (p.dying > 0) return;

    const input = g.input;
    const press = (a, on) => {
      const code = { left: 'KeyA', right: 'KeyD', jump: 'Space', grab: 'KeyJ',
        throw: 'KeyK', stasis: 'KeyQ', dash: 'ShiftLeft', shock: 'KeyE', build: 'KeyF' }[a];
      if (on) { if (!input.down.has(code)) { input.down.add(code); input.pressed.add(code); } }
      else if (input.down.has(code)) { input.down.delete(code); input.released.add(code); }
    };
    B.tick += dt;
    B.maxX = Math.max(B.maxX, p.cx);

    const exit = g.entities.find((e) => e.kind === 'exit' && !e.dead);
    const boss = g.bosses.find((b) => !b.dead);
    const goalX = exit ? exit.cx : (boss ? boss.cx : g.level.w - 32);
    const goalY = exit ? exit.cy : (boss ? boss.cy : p.cy);
    const dir = goalX > p.cx + 6 ? 1 : (goalX < p.cx - 6 ? -1 : 0);

    // Aim the telekinesis by writing the pad-aim vector directly.
    const aimAt = (x, y) => {
      const dx = x - p.cx, dy = y - (p.cy - 2);
      const d = Math.hypot(dx, dy) || 1;
      input.padAim = { x: dx / d, y: dy / d };
      input.usedMouseAim = false;
      p.tk.holdDist = Math.min(p.tk.range, Math.max(24, d));
    };

    // 1. Flip any switch/lever that is still off.
    let acted = false;
    for (const e of g.entities) {
      if (e.dead) continue;
      if ((e.kind === 'switch' || e.kind === 'lever') && e.mode !== 'plate' && !e.on) {
        const d = Math.hypot(e.cx - p.cx, e.cy - p.cy);
        if (d < p.tk.range && !g.level.raycast(p.cx, p.cy - 2, e.cx, e.cy)) {
          aimAt(e.cx, e.cy);
          if (B.actT <= 0) { press('grab', true); B.actT = 0.4; acted = true; }
        }
      }
    }

    // 2. Weigh down any unpressed plate with a held or nearby object.
    const plate = g.entities.find((e) => e.kind === 'switch' && e.mode === 'plate' && !e.on);
    if (!acted && plate) {
      if (p.tk.held.length) {
        aimAt(plate.cx, plate.cy - 10);
        const h = p.tk.held[0];
        if (Math.hypot(h.cx - plate.cx, h.cy - (plate.cy - 10)) < 12) press('grab', false);
        acted = true;
      } else {
        const box2 = g.grabbables().find((e) =>
          Math.hypot(e.cx - p.cx, e.cy - p.cy) < p.tk.range && e.kind !== 'projectile');
        if (box2) {
          aimAt(box2.cx, box2.cy);
          if (B.actT <= 0) { press('grab', true); B.actT = 0.35; }
          acted = true;
        }
      }
    }

    // 3. Bosses: hurl whatever is loose at them while they are open.
    if (!acted && boss) {
      if (p.tk.held.length) {
        aimAt(boss.cx, boss.cy);
        if (boss.vulnerable && B.actT <= 0) { press('throw', true); B.actT = 0.5; }
      } else {
        const ammo = g.grabbables().filter((e) => !e.heldBy)
          .sort((a, b) => Math.hypot(a.cx - p.cx, a.cy - p.cy) - Math.hypot(b.cx - p.cx, b.cy - p.cy))[0];
        if (ammo && Math.hypot(ammo.cx - p.cx, ammo.cy - p.cy) < p.tk.range) {
          aimAt(ammo.cx, ammo.cy);
          if (B.actT <= 0) { press('grab', true); B.actT = 0.4; }
        }
      }
      acted = true;
    }

    // 4. Otherwise: walk toward the goal, jump at walls and gaps.
    if (!acted) {
      aimAt(p.cx + dir * 40, p.cy - 10);
      if (p.tk.held.length && B.actT <= 0) { press('throw', true); B.actT = 0.4; }
    }
    press('right', dir > 0);
    press('left', dir < 0);

    const blockedAhead = p.collides(g.level, dir * 4, 0);
    const gapAhead = !p.collides(g.level, dir * 10, 2) && !p.collides(g.level, dir * 10, 12);
    if (Math.abs(p.cx - B.lastX) < 0.4) B.stuckT += dt; else B.stuckT = 0;
    B.lastX = p.cx;

    B.jumpT -= dt;
    const wantJump = p.onGround && (blockedAhead || (gapAhead && dir !== 0) || B.stuckT > 0.5);
    if (wantJump && B.jumpT <= 0) { press('jump', true); B.jumpT = 0.45; }
    else if (B.jumpT < 0.28) press('jump', false);

    // Stuck for a long time: try the heavy tools.
    if (B.stuckT > 1.6) {
      if (g.hasPower('ultimate') && B.actT <= 0) {
        p.tk.aimPoint.x = p.cx + dir * 40;
        p.tk.aimPoint.y = p.cy + 6;
        press('build', true);
        B.actT = 0.9;
      } else if (g.hasPower('shock') && B.actT <= 0) {
        press('shock', true);
        B.actT = 0.9;
      }
      B.stuckT = 0;
    }
    B.actT -= dt;
    if (B.actT < 0) {
      press('grab', false); press('throw', false); press('shock', false); press('build', false);
    }
  };
});

const results = [];
for (const i of indices) {
  const def = await page.evaluate(async (idx) => {
    const m = await import('./src/data/levels.js');
    const L = m.LEVELS[idx];
    // Powers the player would actually own by this point.
    const powers = m.LEVELS[0].map ? new Array(8).fill(false) : [];
    powers[0] = true;
    for (let k = 0; k <= idx; k++) {
      for (const e of m.LEVELS[k].entities || []) {
        if (e.t === 'power') powers[e.power] = true;
      }
    }
    return { id: L.id, name: L.name, boss: L.boss || null, powers, w: L.map[0].length * 16 };
  }, i);

  await page.evaluate(({ idx, powers }) => {
    const g = window.TELEPATH.game;
    g.save.powers = powers;
    g.save.unlockedLevels = 99;
    g.deaths = 0;
    g.loadLevel(idx, { skipIntro: true });
    g.dialogue = null;
    g.cutscene = null;
    const B = window.BOT;
    B.on = true; B.stuckT = 0; B.lastX = 0; B.actT = 0; B.jumpT = 0;
    B.maxX = 0; B.reached = false;
  }, { idx: i, powers: def.powers });

  const deadline = Date.now() + BUDGET * 1000;
  let res = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    res = await page.evaluate(() => {
      const g = window.TELEPATH.game;
      return {
        reached: window.BOT.reached, maxX: Math.round(window.BOT.maxX),
        scene: g.scene, deaths: g.deaths, x: Math.round(g.player.cx),
        hp: g.player.hp,
      };
    });
    if (res.reached) break;
  }
  await page.evaluate(() => { window.BOT.on = false; });
  const pct = Math.round((res.maxX / def.w) * 100);
  const line = `[${String(i).padStart(2)}] ${def.id.padEnd(3)} ${def.name.padEnd(22)} ` +
    `${res.reached ? 'CLEARED' : 'stalled '} maxX=${res.maxX}/${def.w} (${pct}%) deaths=${res.deaths}`;
  console.log(line);
  results.push({ i, id: def.id, name: def.name, ...res, pct, boss: def.boss });
  if (!res.reached) {
    await page.screenshot({ path: `${SHOT_DIR}/stuck-${def.id}.png`, clip: box });
  }
}

const stalled = results.filter((r) => !r.reached);
console.log(`\ncleared ${results.length - stalled.length}/${results.length}`);
if (stalled.length) console.log('stalled: ' + stalled.map((r) => `${r.id}(${r.pct}%)`).join(', '));
if (errors.length) console.log(`console errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
writeFileSync(`${SHOT_DIR}/bot-report.json`, JSON.stringify({ results, errors }, null, 2));
await browser.close();
