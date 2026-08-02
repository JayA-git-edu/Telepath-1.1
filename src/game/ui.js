// All screen-space UI: HUD, menus, dialogue, story cards, credits.

import { VIEW_W, VIEW_H, CW, CH, Renderer } from '../engine/render.js';
import { POWERS } from './telekinesis.js';
import { LEVELS, WORLDS } from '../data/levels.js';

const ACCENT = '#8ef7ff';
const DIM = '#5d7f95';
const GOLD = '#ffd166';

function panel(r, x, y, w, h, alpha = 0.86) {
  r.rect(x, y, w, h, `rgba(9,10,26,${alpha})`, true);
  r.rectOutline(x, y, w, h, 'rgba(142,247,255,0.35)', true);
  r.rect(x + 2, y + 2, w - 4, 1, 'rgba(142,247,255,0.12)', true);
}

/**
 * A framed meter with a two-tone fill, a lagging "damage ghost" and optional
 * segment ticks. Used for both health and energy so they read as one system.
 */
function meter(r, x, y, w, h, frac, opts = {}) {
  const ghost = opts.ghost === undefined ? frac : opts.ghost;
  r.rect(x, y, w, h, 'rgba(5,7,18,0.88)', true);
  r.rectOutline(x, y, w, h, opts.frame || 'rgba(142,247,255,0.45)', true);
  const iw = w - 2;
  const ih = h - 2;
  if (ghost > frac) {
    r.rect(x + 1, y + 1, Math.max(0, iw * ghost), ih, opts.ghostColor || 'rgba(255,255,255,0.35)', true);
  }
  const fw = Math.max(0, Math.round(iw * frac));
  if (fw > 0) {
    r.rect(x + 1, y + 1, fw, ih, opts.color, true);
    r.rect(x + 1, y + 1, fw, 1, opts.highlight || 'rgba(255,255,255,0.45)', true);
    r.rect(x + 1, y + h - 2, fw, 1, opts.shade || 'rgba(0,0,0,0.25)', true);
  }
  for (let i = 1; i < (opts.segments || 0); i++) {
    r.rect(x + 1 + Math.round((iw * i) / opts.segments), y + 1, 1, ih, 'rgba(6,8,20,0.75)', true);
  }
}

// ------------------------------------------------------------------- HUD
export function drawHud(game, r) {
  const p = game.player;
  const BAR_X = 20;
  const BAR_W = 62;

  // Health: one segment per heart, with a white ghost that drains after a hit.
  const hp = Math.max(0, p.hp) / p.maxHp;
  const low = p.hp <= 1;
  const pulse = low ? 0.6 + Math.abs(Math.sin(game.time * 6)) * 0.4 : 1;
  r.image('heart_full', 6, 7, { screen: true, alpha: low ? pulse : 1 });
  meter(r, BAR_X, 8, BAR_W, 8, hp, {
    ghost: (game.hpGhost || 0) / p.maxHp,
    color: low ? `rgba(255,${Math.round(60 * pulse)},110,1)` : '#ff5c7a',
    highlight: 'rgba(255,190,205,0.65)',
    shade: 'rgba(120,20,50,0.55)',
    frame: 'rgba(255,140,165,0.5)',
    segments: p.maxHp,
  });

  // Energy
  const tk = p.tk;
  const frac = tk.energy / tk.maxEnergy;
  const col = tk.overloaded > 0 ? '#ff6b6b' : (frac > 0.3 ? ACCENT : '#ffb04f');
  // little psi mote, drawn rather than scaled (fractional sprite scaling smears)
  r.rect(9, 20, 2, 4, ACCENT, true);
  r.rect(8, 21, 4, 2, ACCENT, true);
  r.rect(9, 19, 2, 1, 'rgba(230,255,255,0.7)', true);
  meter(r, BAR_X, 19, BAR_W, 6, frac, {
    color: col,
    highlight: 'rgba(230,255,255,0.6)',
    shade: 'rgba(10,60,80,0.5)',
  });

  // Power icons (redundant on touch: the on-screen buttons show them)
  const powers = game.save.powers;
  if (game.touch && game.touch.enabled) return drawHudTail(game, r);
  let x = 6;
  const y = 29;
  for (let i = 0; i < POWERS.length; i++) {
    if (!powers[i]) continue;
    const flash = game.hudPowerFlash > 0 && i === powers.lastIndexOf(true);
    if (flash) {
      r.rect(x - 1, y - 1, 18, 18, `rgba(255,255,255,${0.25 + Math.sin(game.time * 12) * 0.2})`, true);
    }
    r.sprite('power_icons', i, x, y, { screen: true, alpha: 0.95 });
    x += 18;
  }

  drawHudTail(game, r);
}

function drawHudTail(game, r) {
  // Keys
  if (game.keys > 0) {
    r.image('crystal_key', VIEW_W - 26, 6, { screen: true });
    r.text(`x${game.keys}`, VIEW_W - 34, 10, { color: GOLD, align: 'right' });
  }

  // Level name
  const def = LEVELS[game.levelIndex];
  r.text(def.name, VIEW_W - 8, VIEW_H - 12, { color: 'rgba(160,200,220,0.55)', align: 'right' });

  // Boss health bar
  const boss = game.bosses.find((b) => !b.dead);
  if (boss && boss.introT <= 0) {
    const w = 180;
    const bx = (VIEW_W - w) / 2;
    r.text(boss.name, VIEW_W / 2, VIEW_H - 34, { color: '#ff9b9b', align: 'center' });
    meter(r, bx, VIEW_H - 24, w, 8, Math.max(0, boss.hp / boss.maxHp), {
      ghost: (game.bossGhost || 0),
      color: boss.vulnerable ? GOLD : '#ff5c5c',
      highlight: boss.vulnerable ? 'rgba(255,244,200,0.7)' : 'rgba(255,180,180,0.6)',
      shade: 'rgba(90,15,25,0.6)',
      frame: 'rgba(255,120,120,0.7)',
      segments: Math.max(1, Math.round(boss.maxHp / 2)),
    });
  }
}

export function drawToasts(game, r) {
  let y = 54;
  for (const t of game.toasts) {
    const a = Math.min(1, t.life / 0.4);
    r.text(t.text, VIEW_W / 2, y, { color: ACCENT, align: 'center', alpha: a });
    y += 11;
  }
}

// -------------------------------------------------------------- dialogue
export function drawDialogue(game, r) {
  const d = game.dialogue;
  const line = d.lines[d.index];
  const h = 62;
  const y = VIEW_H - h - 8;
  panel(r, 16, y, VIEW_W - 32, h);
  r.text(line.speaker || 'ELI', 24, y + 8, { color: GOLD });
  const shown = line.text.slice(0, Math.floor(d.char));
  const lines = Renderer.wrap(shown, 68);
  lines.slice(-4).forEach((ln, i) => {
    r.text(ln, 24, y + 22 + i * 10, { color: '#dff2ff' });
  });
  if (d.char >= line.text.length && Math.floor(game.time * 3) % 2 === 0) {
    r.text('>', VIEW_W - 32, y + h - 14, { color: ACCENT });
  }
}

export function drawStory(game, r) {
  const s = game.story;
  r.rect(0, 0, VIEW_W, VIEW_H, '#06060f', true);
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % VIEW_W;
    const y = (i * 53 + Math.sin(game.time * 0.4 + i) * 6) % VIEW_H;
    r.rect(x, y, 1, 1, `rgba(142,247,255,${0.1 + (i % 5) * 0.05})`, true);
  }
  const line = s.lines[s.index];
  const shown = line.text.slice(0, Math.floor(s.char));
  if (line.speaker) {
    r.text(line.speaker, VIEW_W / 2, 74, { color: GOLD, align: 'center' });
  }
  const wrapped = Renderer.wrap(shown, 56);
  wrapped.forEach((ln, i) => {
    r.text(ln, VIEW_W / 2, 96 + i * 12, { color: '#dff2ff', align: 'center' });
  });
  if (s.char >= line.text.length) {
    r.text('PRESS JUMP', VIEW_W / 2, VIEW_H - 30, {
      color: DIM, align: 'center',
      alpha: 0.5 + Math.sin(game.time * 4) * 0.4,
    });
  }
}

// ----------------------------------------------------------------- title
export function drawTitle(game, r) {
  r.rect(0, 0, VIEW_W, VIEW_H, '#080a18', true);
  // Drifting psychic motes.
  for (let i = 0; i < 60; i++) {
    const t = game.time * 0.25 + i;
    const x = (i * 73 + Math.sin(t) * 22) % VIEW_W;
    const y = (i * 41 + Math.cos(t * 0.7) * 16) % VIEW_H;
    const a = 0.16 + 0.24 * Math.abs(Math.sin(t * 1.3));
    r.rect(x, y, 1 + (i % 2), 1 + (i % 2), `rgba(142,247,255,${a})`, true);
    if (i % 12 === 0) r.addGlow(x, y, 22, '#8ef7ff', 0.1);
  }

  const logo = game.assets.get('logo');
  if (logo) {
    const s = 3;
    const bob = Math.sin(game.time * 1.6) * 2;
    r.drawSub(logo, 0, 0, logo.width, logo.height,
      (VIEW_W - logo.width * s) / 2, 46 + bob, { screen: true, scale: s });
    r.addGlow(VIEW_W / 2, 46 + bob + logo.height * s / 2, 90, '#8ef7ff', 0.28);
  }
  r.text('A TELEKINETIC ESCAPE', VIEW_W / 2, 100, { color: DIM, align: 'center' });

  const items = game.titleItems();
  items.forEach((item, i) => {
    const sel = i === game.menuIndex;
    const y = 140 + i * 16;
    if (sel) {
      r.rect(VIEW_W / 2 - 70, y - 3, 140, 13, 'rgba(142,247,255,0.12)', true);
      r.text('>', VIEW_W / 2 - 62, y, { color: ACCENT });
    }
    r.text(item, VIEW_W / 2, y, { color: sel ? '#ffffff' : DIM, align: 'center' });
  });

  if (game.touch && game.touch.enabled) {
    r.text('DRAG TO AIM   TAP THE PAD TO MOVE', VIEW_W / 2, VIEW_H - 26,
      { color: 'rgba(120,160,180,0.7)', align: 'center' });
    r.text('HOLD GRAB TO LIFT   TAP THROW TO HURL', VIEW_W / 2, VIEW_H - 16,
      { color: 'rgba(120,160,180,0.5)', align: 'center' });
  } else {
    r.text('MOVE  A D   JUMP  SPACE   GRAB  LMB/J   THROW  RMB/K', VIEW_W / 2, VIEW_H - 26,
      { color: 'rgba(120,160,180,0.7)', align: 'center' });
    r.text('STASIS  Q    DASH  SHIFT    SHOCK  E    BUILD  F', VIEW_W / 2, VIEW_H - 16,
      { color: 'rgba(120,160,180,0.5)', align: 'center' });
  }
}

export function drawSettings(game, r) {
  r.rect(0, 0, VIEW_W, VIEW_H, '#080a18', true);
  r.text('SETTINGS', VIEW_W / 2, 50, { color: ACCENT, align: 'center', scale: 2 });
  const items = [
    ['MUSIC', game.settings.music ? 'ON' : 'OFF'],
    ['SOUND', game.settings.sfx ? 'ON' : 'OFF'],
    ['EFFECTS', game.settings.effects === false ? 'OFF' : 'ON'],
    ['ERASE SAVE', ''],
    ['BACK', ''],
  ];
  items.forEach(([label, val], i) => {
    const sel = i === game.menuIndex;
    const y = 100 + i * 18;
    if (sel) r.rect(VIEW_W / 2 - 90, y - 3, 180, 13, 'rgba(142,247,255,0.12)', true);
    r.text(label, VIEW_W / 2 - 80, y, { color: sel ? '#ffffff' : DIM });
    if (val) r.text(val, VIEW_W / 2 + 80, y, { color: sel ? ACCENT : DIM, align: 'right' });
  });
}

// ---------------------------------------------------------------- select
export function drawSelect(game, r) {
  r.rect(0, 0, VIEW_W, VIEW_H, '#080a18', true);
  r.text('MISSION SELECT', VIEW_W / 2, 12, { color: ACCENT, align: 'center' });

  const max = Math.min(LEVELS.length, game.save.unlockedLevels);
  const perCol = 9;
  const startCol = Math.floor(game.menuIndex / perCol);
  for (let i = 0; i < LEVELS.length; i++) {
    const col = Math.floor(i / perCol);
    if (col < startCol || col > startCol + 1) continue;
    const row = i % perCol;
    const x = 24 + (col - startCol) * 220;
    const y = 32 + row * 20;
    const locked = i >= max;
    const sel = i === game.menuIndex;
    const def = LEVELS[i];
    const done = game.save.completed[def.id];
    if (sel) {
      r.rect(x - 6, y - 3, 210, 16, 'rgba(142,247,255,0.14)', true);
      r.rectOutline(x - 6, y - 3, 210, 16, 'rgba(142,247,255,0.4)', true);
    }
    const wc = WORLDS[def.world];
    r.rect(x - 2, y, 3, 9, locked ? '#333' : wc.color, true);
    r.text(`${i + 1}`.padStart(2, '0'), x + 4, y + 1, { color: locked ? '#3c4a55' : DIM });
    r.text(locked ? '???????????' : def.name, x + 22, y + 1,
      { color: locked ? '#3c4a55' : (sel ? '#ffffff' : '#a8c8d8') });
    if (done) r.text('*', x + 196, y + 1, { color: GOLD });
  }

  const def = LEVELS[game.menuIndex];
  r.text(WORLDS[def.world].name, VIEW_W / 2, VIEW_H - 26, { color: WORLDS[def.world].color, align: 'center' });
  r.text('ENTER TO DEPLOY    ESC TO GO BACK', VIEW_W / 2, VIEW_H - 14,
    { color: 'rgba(120,160,180,0.6)', align: 'center' });
}

// ----------------------------------------------------------------- pause
export function drawPause(game, r) {
  r.rect(0, 0, VIEW_W, VIEW_H, 'rgba(5,6,16,0.72)', true);
  const items = ['RESUME', 'RESTART LEVEL', 'MUSIC', 'SOUND', 'EFFECTS', 'QUIT TO MENU'];
  const w = 186, h = 124;
  const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  panel(r, x, y, w, h, 0.94);
  r.text('PAUSED', VIEW_W / 2, y + 10, { color: ACCENT, align: 'center' });
  items.forEach((item, i) => {
    const sel = i === game.menuIndex;
    const iy = y + 30 + i * 14;
    if (sel) r.text('>', x + 14, iy, { color: ACCENT });
    let label = item;
    if (item === 'MUSIC') label = `MUSIC  ${game.settings.music ? 'ON' : 'OFF'}`;
    if (item === 'SOUND') label = `SOUND  ${game.settings.sfx ? 'ON' : 'OFF'}`;
    if (item === 'EFFECTS') label = `EFFECTS  ${game.settings.effects === false ? 'OFF' : 'ON'}`;
    r.text(label, x + 26, iy, { color: sel ? '#ffffff' : DIM });
  });
}

export function drawComplete(game, r) {
  const t = game.levelComplete.t;
  const a = Math.min(1, t * 2);
  r.rect(0, 0, VIEW_W, VIEW_H, `rgba(5,6,16,${0.75 * a})`, true);
  const def = LEVELS[game.levelIndex];
  r.text('AREA CLEAR', VIEW_W / 2, 84, { color: ACCENT, align: 'center', scale: 2, alpha: a });
  r.text(def.name, VIEW_W / 2, 112, { color: '#dff2ff', align: 'center', alpha: a });
  const shards = game.shardsThisRun ? game.shardsThisRun.size : 0;
  const total = game.totalShards || shards;
  r.text(`SHARDS  ${shards}/${total}`, VIEW_W / 2, 132, { color: GOLD, align: 'center', alpha: a });
  r.text(`TIME  ${game.levelTime.toFixed(1)}S`, VIEW_W / 2, 144, { color: DIM, align: 'center', alpha: a });
  if (t > 0.6) {
    r.text('PRESS JUMP TO CONTINUE', VIEW_W / 2, 176, {
      color: '#ffffff', align: 'center',
      alpha: (0.5 + Math.sin(game.time * 4) * 0.4) * a,
    });
  }
}

export function drawCredits(game, r) {
  r.rect(0, 0, VIEW_W, VIEW_H, '#06060f', true);
  const lines = [
    'TELEPATH',
    '',
    'YOU ESCAPED WITH THE TRUTH',
    '',
    `DEATHS  ${game.deaths}`,
    `POWERS  ${game.save.powers.filter(Boolean).length}/8`,
    '',
    'THANKS FOR PLAYING',
  ];
  lines.forEach((ln, i) => {
    r.text(ln, VIEW_W / 2, 60 + i * 14, {
      color: i === 0 ? ACCENT : '#cfe6f2', align: 'center', scale: i === 0 ? 2 : 1,
    });
  });
  r.text('PRESS JUMP', VIEW_W / 2, VIEW_H - 24, {
    color: DIM, align: 'center', alpha: 0.5 + Math.sin(game.time * 4) * 0.4,
  });
}
