// Boot: load assets, wire input/audio, run a fixed-timestep loop.

import { Assets } from './engine/assets.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { TouchControls, detectTouch } from './engine/touch.js';
import { Game } from './game/game.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

async function boot() {
  const canvas = document.getElementById('game');
  const bootEl = document.getElementById('boot');
  canvas.tabIndex = 0;

  const assets = new Assets();
  await assets.loadAll((p) => {
    if (bootEl) bootEl.textContent = `LOADING ${Math.round(p * 100)}%`;
  });

  const input = new Input(canvas);
  const audio = new Audio();
  const game = new Game(canvas, assets, input, audio);

  const touch = new TouchControls(canvas, input);
  game.touch = touch;
  if (touch.enabled) {
    document.documentElement.dataset.touch = '1';
    game.renderer.integerScale = false;
    game.renderer.fitToWindow();
  }

  // Browsers require a gesture before audio can start.
  const kick = () => audio.resume();
  addEventListener('keydown', kick, { once: true });
  canvas.addEventListener('mousedown', kick, { once: true });
  canvas.addEventListener('touchstart', kick, { once: true });

  if (bootEl) bootEl.classList.add('hidden');
  canvas.focus();

  let last = performance.now() / 1000;
  let acc = 0;
  let frames = 0;
  let fpsT = 0;

  function frame(nowMs) {
    const now = nowMs / 1000;
    let dt = now - last;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt;

    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update(STEP);
      input.endFrame();
      acc -= STEP;
      steps++;
    }
    if (steps === 0) input.endFrame();

    game.draw(dt);

    frames++;
    fpsT += dt;
    if (fpsT >= 1) { game.fps = frames; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Expose for the automated playtest harness.
  window.TELEPATH = { game, assets, input, audio, touch };
}

boot().catch((err) => {
  console.error(err);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.textContent = `FAILED: ${err.message}`;
});
