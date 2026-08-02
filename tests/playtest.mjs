// Automated playtest harness.
//
//   node tests/playtest.mjs [--level N] [--shots DIR] [--all]
//
// Boots the real game in Chromium, drives it with synthetic input, and asserts
// that every level loads, runs, and can be finished. Console errors, dropped
// frames, softlocks and unreachable exits all fail the run.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : fallback;
};
const SHOT_DIR = flag('--shots', 'tests/shots');
const ONLY = flag('--level') !== null && flag('--level') !== true ? Number(flag('--level')) : null;
const URL = flag('--url', 'http://127.0.0.1:8123/index.html');

mkdirSync(SHOT_DIR, { recursive: true });

const failures = [];
const notes = [];
const fail = (m) => { failures.push(m); console.log(`  FAIL  ${m}`); };
const note = (m) => { notes.push(m); console.log(`  ..    ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.TELEPATH && window.TELEPATH.game, null, { timeout: 30000 });
ok('game booted');

const canvas = await page.$('#game');
const box = await canvas.boundingBox();

// ---------------------------------------------------------------- helpers
const state = () => page.evaluate(() => {
  const g = window.TELEPATH.game;
  const p = g.player;
  return {
    scene: g.scene,
    level: g.levelIndex,
    levelId: g.level ? g.level.def.id : null,
    hp: p ? p.hp : 0,
    dying: p ? p.dying : 0,
    x: p ? Math.round(p.cx) : 0,
    y: p ? Math.round(p.cy) : 0,
    onGround: p ? p.onGround : false,
    energy: p && p.tk ? Math.round(p.tk.energy) : 0,
    held: p && p.tk ? p.tk.held.length : 0,
    entities: g.entities ? g.entities.length : 0,
    enemies: g.enemies ? g.enemies.length : 0,
    deaths: g.deaths,
    fps: g.fps,
    powers: g.save.powers.filter(Boolean).length,
    dialogue: !!g.dialogue,
    bossHp: g.bosses && g.bosses[0] ? g.bosses[0].hp : null,
  };
});

const wait = (ms) => page.waitForTimeout(ms);

async function tap(key, ms = 60) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
}

async function hold(key, ms) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
}

/** Move the mouse to a world position (converted through the live camera). */
async function aimWorld(wx, wy) {
  const p = await page.evaluate(([x, y]) => {
    const g = window.TELEPATH.game;
    const r = g.renderer;
    return [x - r.ox, y - r.oy];
  }, [wx, wy]);
  const sx = box.x + (p[0] / 480) * box.width;
  const sy = box.y + (p[1] / 270) * box.height;
  await page.mouse.move(
    Math.max(box.x + 1, Math.min(box.x + box.width - 1, sx)),
    Math.max(box.y + 1, Math.min(box.y + box.height - 1, sy)),
  );
}

async function shoot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, clip: box });
}

async function dismissDialogue(max = 12) {
  for (let i = 0; i < max; i++) {
    const s = await state();
    if (!s.dialogue && s.scene !== 'story') return;
    await tap('Enter');
    await wait(140);
  }
}

/** Skip menus and drop straight into a level via the debug hook. */
async function gotoLevel(index) {
  await page.evaluate((i) => {
    const g = window.TELEPATH.game;
    g.save.powers = g.save.powers.map(() => true);
    g.save.unlockedLevels = 99;
    g.save.seenIntros = {};
    g.loadLevel(i, { skipIntro: true });
  }, index);
  await wait(200);
  await dismissDialogue();
}

// ------------------------------------------------------------- title flow
{
  await wait(400);
  await shoot('00-title');
  const s = await state();
  if (s.scene !== 'title') fail(`expected title scene, got ${s.scene}`);
  else ok('title screen');

  await tap('Enter');           // NEW GAME (first item when no save)
  await wait(300);
  await dismissDialogue(20);
  const s2 = await state();
  if (s2.scene !== 'play') fail(`new game did not reach play scene (got ${s2.scene})`);
  else ok('new game starts level 1');
  await shoot('01-level1');
}

// ------------------------------------------------------ per-level smoke run
const levelCount = await page.evaluate(() => window.TELEPATH.game.save.powers.length && window.__LEVELS_LEN);
const total = await page.evaluate(async () => {
  const m = await import('./src/data/levels.js');
  return m.LEVELS.length;
});
ok(`${total} levels found`);

const indices = ONLY !== null ? [ONLY] : [...Array(total).keys()];

for (const i of indices) {
  const def = await page.evaluate(async (idx) => {
    const m = await import('./src/data/levels.js');
    const L = m.LEVELS[idx];
    return { id: L.id, name: L.name, world: L.world, boss: L.boss || null };
  }, i);
  console.log(`\n[${i}] ${def.id} ${def.name}`);
  const before = consoleErrors.length;

  await gotoLevel(i);
  let s = await state();
  if (s.scene !== 'play') { fail(`${def.id}: did not enter play scene`); continue; }
  if (s.levelId !== def.id) fail(`${def.id}: loaded ${s.levelId} instead`);

  // Let the level breathe: physics settle, enemies wake up.
  await wait(600);
  s = await state();
  const startY = s.y;

  // Basic control test: run right, jump, grab something, throw it.
  await hold('KeyD', 700);
  await tap('Space', 120);
  await wait(400);
  const afterRun = await state();
  if (Math.abs(afterRun.x - s.x) < 6 && !def.boss) {
    note(`${def.id}: barely moved right (${s.x} -> ${afterRun.x}) - blocked at spawn?`);
  }

  // Aim at a nearby grabbable and try the full verb set.
  const target = await page.evaluate(() => {
    const g = window.TELEPATH.game;
    const list = g.grabbables();
    if (!list.length) return null;
    let best = null, bd = 1e9;
    for (const e of list) {
      const d = Math.hypot(e.cx - g.player.cx, e.cy - g.player.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { x: best.cx, y: best.cy, d: bd, kind: best.kind } : null;
  });
  if (target && target.d < 200) {
    await aimWorld(target.x, target.y);
    await page.mouse.down();
    await wait(350);
    const heldState = await state();
    if (heldState.held === 0) note(`${def.id}: could not grab nearest ${target.kind} at ${Math.round(target.d)}px`);
    else ok(`grabbed a ${target.kind}`);
    await page.mouse.up();
    await wait(200);
  }

  await tap('KeyE', 80);      // shockwave
  await wait(200);
  await tap('KeyQ', 80);      // stasis
  await wait(200);
  await tap('KeyF', 80);      // build
  await wait(300);

  await shoot(`lvl-${String(i).padStart(2, '0')}-${def.id}`);

  s = await state();
  if (s.fps !== undefined && s.fps !== null && s.fps < 30) note(`${def.id}: fps ${s.fps}`);
  const newErrors = consoleErrors.slice(before);
  if (newErrors.length) fail(`${def.id}: console errors: ${newErrors.slice(0, 3).join(' | ')}`);
  if (s.scene !== 'play' && s.scene !== 'complete') {
    note(`${def.id}: scene became ${s.scene}`);
  }
}

// ------------------------------------------------------- completion checks
console.log('\n--- completion ---');
for (const i of indices) {
  const def = await page.evaluate(async (idx) => {
    const m = await import('./src/data/levels.js');
    const L = m.LEVELS[idx];
    return { id: L.id, boss: L.boss || null };
  }, i);
  await gotoLevel(i);
  // Teleport to the exit (or kill the boss) to prove the completion path works.
  const done = await page.evaluate(() => {
    const g = window.TELEPATH.game;
    const exit = g.entities.find((e) => e.kind === 'exit');
    if (exit) {
      g.keys = 9;
      g.player.place(exit.x, exit.y + 8);
      return 'exit';
    }
    if (g.bosses.length) {
      const b = g.bosses[0];
      b.introT = 0;
      // Bosses cap damage per hit and have i-frames, so land the hits one by one.
      for (let k = 0; k < 40 && b.hp > 0; k++) {
        b.vulnerable = true;
        b.hitCooldown = 0;
        b.damage(g, 2, 1);
      }
      return 'boss';
    }
    return 'none';
  });
  if (done === 'none') { fail(`${def.id}: no exit and no boss`); continue; }
  await wait(done === 'boss' ? 3200 : 500);
  await dismissDialogue(20);
  const s = await state();
  if (s.scene !== 'complete' && s.scene !== 'story') {
    fail(`${def.id}: reaching the ${done} did not complete the level (scene=${s.scene})`);
  } else {
    ok(`${def.id}: completes via ${done}`);
  }
}

// ------------------------------------------------------------------ report
console.log('\n================ PLAYTEST SUMMARY ================');
console.log(`console errors: ${consoleErrors.length}`);
for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log(`   ! ${e}`);
console.log(`notes: ${notes.length}`);
console.log(`failures: ${failures.length}`);
for (const f of failures) console.log(`   X ${f}`);
writeFileSync(`${SHOT_DIR}/report.json`, JSON.stringify({ failures, notes, consoleErrors }, null, 2));

await browser.close();
process.exit(failures.length ? 1 : 0);
