// Mobile control tests: the on-screen pad appears only on touch devices, and
// every button actually drives the game.
//
//   node tests/touch.mjs

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:8123/index.html';
const SHOTS = 'tests/shots';
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const fail = (m) => { failures.push(m); console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const browser = await chromium.launch();

// ---------------------------------------------------------------- desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 620 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.TELEPATH && window.TELEPATH.game, null, { timeout: 30000 });
  const state = await p.evaluate(() => ({
    enabled: window.TELEPATH.touch.enabled,
    dataset: document.documentElement.dataset.touch || null,
    integerScale: window.TELEPATH.game.renderer.integerScale,
  }));
  if (state.enabled) fail('desktop: touch controls enabled on a mouse device');
  else ok('desktop: touch controls hidden');
  if (state.dataset) fail(`desktop: html[data-touch] set to ${state.dataset}`);
  if (!state.integerScale) fail('desktop: lost integer pixel scaling');
  else ok('desktop: integer pixel scaling kept');
  if (errors.length) fail(`desktop console: ${errors[0]}`);
  await ctx.close();
}

// ----------------------------------------------------------------- mobile
{
  const ctx = await browser.newContext({
    ...devices['Pixel 7 landscape'],
    hasTouch: true,
    isMobile: true,
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.TELEPATH && window.TELEPATH.game, null, { timeout: 30000 });

  const on = await p.evaluate(() => window.TELEPATH.touch.enabled);
  if (!on) fail('mobile: touch controls not enabled');
  else ok('mobile: touch controls enabled');

  const fill = await p.evaluate(() => {
    const c = document.getElementById('game');
    return { w: parseFloat(c.style.width), h: parseFloat(c.style.height), ih: innerHeight };
  });
  if (fill.h < fill.ih * 0.95) fail(`mobile: canvas only fills ${Math.round(fill.h / fill.ih * 100)}% of the height`);
  else ok('mobile: canvas fills the screen');

  await p.evaluate(() => {
    const g = window.TELEPATH.game;
    g.save.powers = g.save.powers.map(() => true);
    g.loadLevel(0, { skipIntro: true });
    g.dialogue = null; g.cutscene = null; g.toasts.length = 0;
  });
  await p.waitForTimeout(400);

  // Where is each button on screen?
  const rects = await p.evaluate(() => {
    const t = window.TELEPATH.touch;
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    const out = {};
    for (const b of t.buttons(window.TELEPATH.game)) {
      out[b.a] = {
        x: r.left + (b.x + b.w / 2) * (r.width / 480),
        y: r.top + (b.y + b.h / 2) * (r.height / 270),
      };
    }
    return out;
  });
  const expected = ['left', 'right', 'jump', 'grab', 'throw', 'stasis', 'dash', 'shock', 'build', 'pause'];
  const missing = expected.filter((a) => !rects[a]);
  if (missing.length) fail(`mobile: missing buttons ${missing.join(', ')}`);
  else ok(`mobile: ${expected.length} buttons laid out`);

  const st = () => p.evaluate(() => {
    const g = window.TELEPATH.game;
    return {
      x: Math.round(g.player.cx), y: Math.round(g.player.cy),
      vy: Math.round(g.player.vy), held: g.player.tk.held.length,
      onGround: g.player.onGround, scene: g.scene,
      energy: Math.round(g.player.tk.energy),
    };
  });

  // --- walk right -------------------------------------------------------
  const before = await st();
  await p.touchscreen.tap(rects.right.x, rects.right.y);   // warm up the listener
  await p.evaluate(async ([x, y]) => {
    const c = document.getElementById('game');
    const t = (id, cx, cy) => new Touch({ identifier: id, target: c, clientX: cx, clientY: cy });
    c.dispatchEvent(new TouchEvent('touchstart', {
      changedTouches: [t(1, x, y)], touches: [t(1, x, y)], bubbles: true, cancelable: true,
    }));
    await new Promise((r) => setTimeout(r, 900));
    c.dispatchEvent(new TouchEvent('touchend', {
      changedTouches: [t(1, x, y)], touches: [], bubbles: true, cancelable: true,
    }));
  }, [rects.right.x, rects.right.y]);
  await p.waitForTimeout(200);
  const walked = await st();
  if (walked.x - before.x < 20) fail(`mobile: RIGHT moved only ${walked.x - before.x}px`);
  else ok(`mobile: RIGHT walks (${before.x} -> ${walked.x})`);

  // --- jump -------------------------------------------------------------
  const jumped = await p.evaluate(async ([x, y]) => {
    const c = document.getElementById('game');
    const g = window.TELEPATH.game;
    const t = (id, cx, cy) => new Touch({ identifier: id, target: c, clientX: cx, clientY: cy });
    let minY = g.player.cy;
    c.dispatchEvent(new TouchEvent('touchstart', {
      changedTouches: [t(2, x, y)], touches: [t(2, x, y)], bubbles: true, cancelable: true,
    }));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 16));
      minY = Math.min(minY, g.player.cy);
    }
    c.dispatchEvent(new TouchEvent('touchend', {
      changedTouches: [t(2, x, y)], touches: [], bubbles: true, cancelable: true,
    }));
    return { start: g.player.cy, minY };
  }, [rects.jump.x, rects.jump.y]);
  if (jumped.start - jumped.minY < 12) fail(`mobile: JUMP only rose ${Math.round(jumped.start - jumped.minY)}px`);
  else ok(`mobile: JUMP rises ${Math.round(jumped.start - jumped.minY)}px`);

  // --- aim with one finger, grab with another ---------------------------
  const grabbed = await p.evaluate(async ([gx, gy]) => {
    const c = document.getElementById('game');
    const g = window.TELEPATH.game;
    const r = c.getBoundingClientRect();
    const crate = g.entities.find((e) => e.kind === 'crate');
    g.player.place(crate.x - 40, crate.y - 4);
    await new Promise((res) => setTimeout(res, 120));
    // finger 1: drag in open space to aim at the crate
    const view = { x: crate.cx - g.renderer.ox, y: crate.cy - g.renderer.oy };
    const ax = r.left + view.x * (r.width / 480);
    const ay = r.top + view.y * (r.height / 270);
    const t = (id, cx, cy) => new Touch({ identifier: id, target: c, clientX: cx, clientY: cy });
    c.dispatchEvent(new TouchEvent('touchstart', {
      changedTouches: [t(3, ax, ay)], touches: [t(3, ax, ay)], bubbles: true, cancelable: true,
    }));
    // finger 2: hold GRAB
    c.dispatchEvent(new TouchEvent('touchstart', {
      changedTouches: [t(4, gx, gy)], touches: [t(3, ax, ay), t(4, gx, gy)], bubbles: true, cancelable: true,
    }));
    await new Promise((res) => setTimeout(res, 500));
    const held = g.player.tk.held.length;
    c.dispatchEvent(new TouchEvent('touchend', {
      changedTouches: [t(4, gx, gy)], touches: [t(3, ax, ay)], bubbles: true, cancelable: true,
    }));
    c.dispatchEvent(new TouchEvent('touchend', {
      changedTouches: [t(3, ax, ay)], touches: [], bubbles: true, cancelable: true,
    }));
    await new Promise((res) => setTimeout(res, 200));
    return { held, afterRelease: g.player.tk.held.length };
  }, [rects.grab.x, rects.grab.y]);
  if (!grabbed.held) fail('mobile: two-finger aim + GRAB did not pick anything up');
  else ok('mobile: aim with one finger, GRAB with another');
  if (grabbed.afterRelease) fail('mobile: releasing GRAB did not drop the object');

  // --- pause button -----------------------------------------------------
  await p.evaluate(async ([x, y]) => {
    const c = document.getElementById('game');
    const t = (id, cx, cy) => new Touch({ identifier: id, target: c, clientX: cx, clientY: cy });
    c.dispatchEvent(new TouchEvent('touchstart', {
      changedTouches: [t(5, x, y)], touches: [t(5, x, y)], bubbles: true, cancelable: true,
    }));
    await new Promise((r) => setTimeout(r, 120));
    c.dispatchEvent(new TouchEvent('touchend', {
      changedTouches: [t(5, x, y)], touches: [], bubbles: true, cancelable: true,
    }));
  }, [rects.pause.x, rects.pause.y]);
  await p.waitForTimeout(300);
  const paused = await st();
  if (paused.scene !== 'pause') fail(`mobile: PAUSE button left scene at ${paused.scene}`);
  else ok('mobile: PAUSE opens the menu');

  // menu layout swaps in
  const menuButtons = await p.evaluate(() => window.TELEPATH.touch.buttons(window.TELEPATH.game).map((b) => b.a));
  if (!menuButtons.includes('confirm')) fail(`mobile: menu layout missing OK (${menuButtons.join(',')})`);
  else ok('mobile: menu layout swaps in');

  await p.screenshot({ path: `${SHOTS}/mobile-pause.png` });
  await p.evaluate(() => { window.TELEPATH.game.scene = 'play'; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/mobile-play.png` });

  if (errors.length) fail(`mobile console: ${errors[0]}`);
  await ctx.close();
}

console.log(`\n${failures.length ? `FAILURES: ${failures.length}` : 'all touch checks passed'}`);
await browser.close();
process.exit(failures.length ? 1 : 0);
