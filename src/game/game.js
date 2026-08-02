// Scene management, level lifecycle, entity bookkeeping and progression.

import { Renderer, VIEW_W, VIEW_H } from '../engine/render.js';
import { Particles } from '../engine/particles.js';
import { Level, TILE } from './level.js';
import { Player } from './player.js';
import { POWERS } from './telekinesis.js';
import {
  Crate, Boulder, Orb, Switch, Lever, Door, Barrier, WeakWall, MovingPlatform,
  PsyPlatform, Shard, CrystalKey, Checkpoint, Exit, PowerCrystal,
} from './entities.js';
import { ENEMY_CHARS, Projectile } from './enemies.js';
import { BOSSES } from './bosses.js';
import { LEVELS, WORLDS } from '../data/levels.js';
import { STORY } from '../data/story.js';
import * as UI from './ui.js';

const SAVE_KEY = 'telepath.save.v1';

export class Game {
  constructor(canvas, assets, input, audio) {
    this.canvas = canvas;
    this.assets = assets;
    this.input = input;
    this.audio = audio;
    this.renderer = new Renderer(canvas, assets);
    this.particles = new Particles();
    this.time = 0;
    this.scene = 'title';
    this.menuIndex = 0;
    this.levelIndex = 0;
    this.toasts = [];
    this.cutscene = null;
    this.transition = { t: 0, dir: 0, next: null };
    this.channels = {};
    this.entities = [];
    this.enemies = [];
    this.projectiles = [];
    this.bosses = [];
    this.keys = 0;
    this.deaths = 0;
    this.levelTime = 0;
    this.player = new Player(0, 0);
    this.player.game = this;
    this.save = loadSave();
    this.settings = this.save.settings;
    this.audio.setMusicOn(this.settings.music);
    this.audio.setSfxOn(this.settings.sfx);
    this.dialogue = null;
    this.hudPowerFlash = 0;
    this.bossBar = null;
    this.levelComplete = null;
  }

  // ------------------------------------------------------------------ save
  persist() {
    this.save.settings = this.settings;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (e) { /* private mode: run without persistence */ }
  }

  hasPower(id) {
    const idx = POWERS.findIndex((p) => p.id === id);
    return idx >= 0 && this.save.powers[idx];
  }

  unlockPower(idx) {
    if (this.save.powers[idx]) return;
    this.save.powers[idx] = true;
    this.persist();
    const p = POWERS[idx];
    this.audio.play('power');
    this.renderer.doFlash(0.55, '#ffffff');
    this.renderer.shake(0.4);
    this.particles.burst(this.player.cx, this.player.cy, 40, {
      color: '#ffffff', speed: 170, life: 0.9, size: 3, additive: true, glow: 9, round: true,
    });
    this.showDialogue([
      { speaker: 'POWER UNLOCKED', text: `${p.name}. ${p.desc}` },
    ]);
    this.hudPowerFlash = 2.5;
  }

  // ------------------------------------------------------------- lifecycle
  startNewGame() {
    this.save.powers = POWERS.map((_, i) => i === 0);
    this.save.completed = {};
    this.save.shards = {};
    this.save.unlockedLevels = 1;
    this.persist();
    this.showStory(STORY.intro, () => this.loadLevel(0));
  }

  continueGame() {
    const first = Math.min(this.save.unlockedLevels - 1, LEVELS.length - 1);
    this.openLevelSelect(Math.max(0, first));
  }

  openLevelSelect(index = 0) {
    this.scene = 'select';
    this.menuIndex = index;
    this.audio.setTheme('menu');
  }

  loadLevel(index, opts = {}) {
    const def = LEVELS[index];
    if (!def) return;
    this.levelIndex = index;
    this.level = new Level(def, this.assets);
    this.level.setEntities([]);
    this.entities = [];
    this.enemies = [];
    this.projectiles = [];
    this.bosses = [];
    this.channels = {};
    this.keys = 0;
    this.levelTime = 0;
    this.levelComplete = null;
    this.bossBar = null;
    this.particles.clear();
    this.shardsThisRun = new Set();

    // Tiles that spawn entities.
    for (const s of this.level.spawns) {
      this.spawnFromChar(s.ch, s.x, s.y);
    }
    // Configured entities.
    for (const e of def.entities || []) {
      this.spawnFromDef(e);
    }
    this.level.setEntities(this.entities);

    this.player = new Player(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.player.game = this;
    this.checkpoint = { x: this.level.playerSpawn.x, y: this.level.playerSpawn.y };
    this.scene = 'play';
    this.cutscene = null;
    this.dialogue = null;
    this.renderer.setCamera(
      this.player.cx - VIEW_W / 2, this.player.cy - VIEW_H / 2,
      { w: this.level.w, h: this.level.h }, true,
    );
    this.audio.setTheme(def.boss ? 'boss' : def.world);
    if (def.intro && !opts.skipIntro && !this.save.seenIntros[def.id]) {
      this.save.seenIntros[def.id] = true;
      this.persist();
      this.showDialogue(def.intro);
    } else if (def.hint) {
      this.toast(def.hint, 3.5);
    }
  }

  spawnFromChar(ch, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    switch (ch) {
      case 'c': this.spawn(new Crate(x, y, 'wood')); break;
      case 'C': this.spawn(new Crate(x, y, 'metal')); break;
      case 'Q': this.spawn(new Crate(x, y, 'psy')); break;
      case 'o': this.spawn(new Boulder(x, y)); break;
      case '*': this.spawn(new Shard(x + 2, y + 2)); break;
      case 'k': this.spawn(new CrystalKey(x + 1, y + 1)); break;
      case 'H': this.spawn(new Checkpoint(x, y)); break;
      case 'E': this.spawn(new Exit(x, y)); break;
      case 'x': this.spawn(new WeakWall(x, y)); break;
      case 'd': case 'g': case 's': case 'w': case 'T':
        this.spawnEnemy(ch, tx, ty); break;
      default: break;
    }
  }

  spawnFromDef(d) {
    const x = d.x * TILE, y = d.y * TILE;
    switch (d.t) {
      case 'switch': this.spawn(new Switch(x, y, d)); break;
      case 'lever': this.spawn(new Lever(x, y, d)); break;
      case 'plate': this.spawn(new Switch(x, y, { ...d, mode: 'plate' })); break;
      case 'door': this.spawn(new Door(x, y, d)); break;
      case 'barrier': this.spawn(new Barrier(x, y, d)); break;
      case 'platform': this.spawn(new MovingPlatform(x, y, d)); break;
      case 'orb': this.spawn(new Orb(x, y)); break;
      case 'power': this.spawn(new PowerCrystal(x, y, d)); break;
      case 'exit': this.spawn(new Exit(x, y, d)); break;
      case 'boss': {
        const Ctor = BOSSES[d.boss];
        if (Ctor) {
          const b = new Ctor(x, y);
          this.bosses.push(b);
          this.bossBar = b;
        }
        break;
      }
      default: break;
    }
  }

  spawn(e) {
    this.entities.push(e);
    if (this.level) this.level.setEntities(this.entities);
    return e;
  }

  spawnEnemy(ch, tx, ty) {
    const Ctor = ENEMY_CHARS[ch];
    if (!Ctor) return null;
    const e = new Ctor(tx * TILE, ty * TILE, {});
    this.enemies.push(e);
    return e;
  }

  spawnProjectile(x, y, vx, vy, opts) {
    const p = new Projectile(x, y, vx, vy, opts);
    this.projectiles.push(p);
    return p;
  }

  allActors() {
    return [this.player, ...this.entities, ...this.enemies, ...this.projectiles];
  }

  grabbables() {
    const out = [];
    for (const e of this.entities) if (e.grabbable && !e.dead) out.push(e);
    for (const p of this.projectiles) if (p.grabbable && !p.dead) out.push(p);
    return out;
  }

  setChannel(ch, on) {
    this.channels[ch] = on;
  }

  setCheckpoint(cp) {
    this.checkpoint = { x: cp.x, y: cp.y + TILE };
    this.toast('CHECKPOINT');
  }

  collectShard(shard) {
    this.audio.play('pickup');
    this.particles.burst(shard.cx, shard.cy, 16, {
      color: '#b06bff', speed: 90, life: 0.5, size: 2, additive: true, glow: 7,
    });
    const id = LEVELS[this.levelIndex].id;
    this.shardsThisRun.add(`${shard.spawnX},${shard.spawnY}`);
    this.save.shards[id] = Math.max(this.save.shards[id] || 0, this.shardsThisRun.size);
    this.persist();
    this.toast(`CRYSTAL SHARD ${this.shardsThisRun.size}/${this.countShards()}`);
  }

  countShards() {
    return this.entities.filter((e) => e.kind === 'shard').length;
  }

  onEnemyKilled(e) {}

  onBossDefeated(b) {
    this.bossBar = null;
    this.showStory(STORY.bossWin[LEVELS[this.levelIndex].boss] || [], () => this.completeLevel());
  }

  respawn() {
    this.deaths++;
    for (const e of this.entities) if (e.reset) e.reset();
    for (const e of this.enemies) if (e.reset) e.reset();
    for (const b of this.bosses) if (b.reset) b.reset();
    this.entities = this.entities.filter((e) => e.kind !== 'psyplatform' && !e.transient);
    this.projectiles = [];
    this.channels = {};
    this.level.setEntities(this.entities);
    this.player.respawnAt(this.checkpoint.x, this.checkpoint.y);
    this.renderer.setCamera(
      this.player.cx - VIEW_W / 2, this.player.cy - VIEW_H / 2,
      { w: this.level.w, h: this.level.h }, true,
    );
    this.particles.clear();
  }

  completeLevel() {
    if (this.levelComplete) return;
    const def = LEVELS[this.levelIndex];
    this.levelComplete = { t: 0 };
    this.scene = 'complete';
    this.save.completed[def.id] = true;
    this.save.unlockedLevels = Math.max(this.save.unlockedLevels, this.levelIndex + 2);
    this.persist();
    this.audio.play('win');
    this.audio.stopMusic();
    this.renderer.doFlash(0.4, '#8ef7ff');
  }

  nextLevel() {
    const next = this.levelIndex + 1;
    if (next >= LEVELS.length) {
      this.showStory(STORY.ending, () => { this.scene = 'credits'; this.creditT = 0; this.audio.setTheme('menu'); });
      return;
    }
    const def = LEVELS[next];
    const prevWorld = LEVELS[this.levelIndex].world;
    if (def.world !== prevWorld && STORY.worlds[def.world]) {
      this.showStory(STORY.worlds[def.world], () => this.loadLevel(next));
    } else {
      this.loadLevel(next);
    }
  }

  // -------------------------------------------------------------- dialogue
  showDialogue(lines) {
    if (!lines || !lines.length) return;
    this.dialogue = { lines, index: 0, char: 0, t: 0 };
    this.cutscene = true;
  }

  showStory(lines, onDone) {
    if (!lines || !lines.length) { if (onDone) onDone(); return; }
    this.scene = 'story';
    this.story = { lines, index: 0, char: 0, onDone };
  }

  toast(text, life = 2.0) {
    this.toasts.push({ text, life, max: life });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  // ----------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    this.input.pollGamepad();
    this.hudPowerFlash = Math.max(0, this.hudPowerFlash - dt);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    switch (this.scene) {
      case 'title': this.updateTitle(dt); break;
      case 'settings': this.updateSettings(dt); break;
      case 'select': this.updateSelect(dt); break;
      case 'play': this.updatePlay(dt); break;
      case 'pause': this.updatePause(dt); break;
      case 'story': this.updateStory(dt); break;
      case 'complete': this.updateComplete(dt); break;
      case 'credits': this.updateCredits(dt); break;
      default: break;
    }
    this.particles.update(dt);
    this.renderer.updateCamera(dt);
  }

  updateTitle(dt) {
    this.titleT = (this.titleT || 0) + dt;
    const input = this.input;
    const options = this.save.unlockedLevels > 1 ? 3 : 2;
    if (input.hit('down')) { this.menuIndex = (this.menuIndex + 1) % options; this.audio.play('menu'); }
    if (input.hit('up')) { this.menuIndex = (this.menuIndex + options - 1) % options; this.audio.play('menu'); }
    if (input.hit('confirm')) {
      this.audio.play('select');
      const items = this.titleItems();
      const item = items[this.menuIndex];
      if (item === 'CONTINUE') this.continueGame();
      else if (item === 'NEW GAME') this.startNewGame();
      else if (item === 'SETTINGS') { this.scene = 'settings'; this.menuIndex = 0; }
    }
    this.audio.setTheme('menu');
  }

  titleItems() {
    const items = [];
    if (this.save.unlockedLevels > 1) items.push('CONTINUE');
    items.push('NEW GAME', 'SETTINGS');
    return items;
  }

  updateSettings(dt) {
    const input = this.input;
    const items = ['MUSIC', 'SOUND', 'ERASE SAVE', 'BACK'];
    if (input.hit('down')) { this.menuIndex = (this.menuIndex + 1) % items.length; this.audio.play('menu'); }
    if (input.hit('up')) { this.menuIndex = (this.menuIndex + items.length - 1) % items.length; this.audio.play('menu'); }
    if (input.hit('back')) { this.scene = 'title'; this.menuIndex = 0; return; }
    if (input.hit('confirm')) {
      this.audio.play('select');
      switch (items[this.menuIndex]) {
        case 'MUSIC':
          this.settings.music = !this.settings.music;
          this.audio.setMusicOn(this.settings.music);
          this.persist();
          break;
        case 'SOUND':
          this.settings.sfx = !this.settings.sfx;
          this.audio.setSfxOn(this.settings.sfx);
          this.persist();
          break;
        case 'ERASE SAVE':
          this.save = {
            powers: POWERS.map((_, i) => i === 0),
            completed: {}, shards: {}, seenIntros: {},
            unlockedLevels: 1, settings: this.settings,
          };
          this.persist();
          this.toast('SAVE ERASED');
          break;
        case 'BACK': this.scene = 'title'; this.menuIndex = 0; break;
        default: break;
      }
    }
  }

  updateSelect(dt) {
    const input = this.input;
    const max = Math.min(LEVELS.length, this.save.unlockedLevels);
    if (input.hit('down')) { this.menuIndex = Math.min(max - 1, this.menuIndex + 1); this.audio.play('menu'); }
    if (input.hit('up')) { this.menuIndex = Math.max(0, this.menuIndex - 1); this.audio.play('menu'); }
    if (input.hit('right')) { this.menuIndex = Math.min(max - 1, this.menuIndex + 5); this.audio.play('menu'); }
    if (input.hit('left')) { this.menuIndex = Math.max(0, this.menuIndex - 5); this.audio.play('menu'); }
    if (input.hit('confirm')) {
      this.audio.play('select');
      this.loadLevel(this.menuIndex);
    }
    if (input.hit('back')) { this.scene = 'title'; this.menuIndex = 0; }
  }

  updatePlay(dt) {
    if (this.input.hit('pause')) {
      this.scene = 'pause';
      this.menuIndex = 0;
      this.audio.play('menu');
      return;
    }
    if (this.dialogue) {
      this.updateDialogue(dt);
      return;
    }
    if (this.input.hit('restart')) {
      this.player.die(this);
    }
    this.levelTime += dt;
    this.level.setEntities([...this.entities, ...this.projectiles]);

    this.player.update(dt, this);
    for (const e of this.entities) if (!e.dead && e.update) e.update(dt, this);
    for (const e of this.enemies) if (!e.dead) e.update(dt, this);
    for (const b of this.bosses) if (!b.dead) b.update(dt, this);
    for (const p of this.projectiles) if (!p.dead) p.update(dt, this);

    this.entities = this.entities.filter((e) => !e.dead || e.kind === 'weakwall' || e.kind === 'door');
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.level.setEntities([...this.entities, ...this.projectiles]);

    // Camera: lead slightly in the direction of travel and toward the reticle.
    const p = this.player;
    const lead = p.tk ? (p.tk.aimPoint.x - p.cx) * 0.18 : 0;
    const leadY = p.tk ? (p.tk.aimPoint.y - p.cy) * 0.12 : 0;
    this.renderer.setCamera(
      p.cx + lead - VIEW_W / 2,
      p.cy + leadY - VIEW_H / 2 - 8,
      { w: this.level.w, h: this.level.h },
    );
  }

  updateDialogue(dt) {
    const d = this.dialogue;
    d.t += dt;
    const line = d.lines[d.index];
    const full = line.text.length;
    if (d.char < full) d.char = Math.min(full, d.char + dt * 52);
    if (this.input.hit('confirm') || this.input.hit('jump')) {
      if (d.char < full) d.char = full;
      else {
        d.index++;
        d.char = 0;
        if (d.index >= d.lines.length) {
          this.dialogue = null;
          this.cutscene = null;
        }
      }
      this.audio.play('menu');
    }
  }

  updateStory(dt) {
    const s = this.story;
    s.char += dt * 46;
    const line = s.lines[s.index];
    if (this.input.hit('confirm')) {
      if (s.char < line.text.length) s.char = line.text.length;
      else {
        s.index++;
        s.char = 0;
        if (s.index >= s.lines.length) {
          const cb = s.onDone;
          this.story = null;
          if (cb) cb();
        }
      }
      this.audio.play('menu');
    }
  }

  updatePause(dt) {
    const input = this.input;
    const items = ['RESUME', 'RESTART LEVEL', 'MUSIC', 'SOUND', 'QUIT TO MENU'];
    if (input.hit('down')) { this.menuIndex = (this.menuIndex + 1) % items.length; this.audio.play('menu'); }
    if (input.hit('up')) { this.menuIndex = (this.menuIndex + items.length - 1) % items.length; this.audio.play('menu'); }
    if (input.hit('pause')) { this.scene = 'play'; return; }
    if (input.hit('confirm')) {
      this.audio.play('select');
      switch (items[this.menuIndex]) {
        case 'RESUME': this.scene = 'play'; break;
        case 'RESTART LEVEL': this.loadLevel(this.levelIndex, { skipIntro: true }); break;
        case 'MUSIC':
          this.settings.music = !this.settings.music;
          this.audio.setMusicOn(this.settings.music);
          this.persist();
          break;
        case 'SOUND':
          this.settings.sfx = !this.settings.sfx;
          this.audio.setSfxOn(this.settings.sfx);
          this.persist();
          break;
        case 'QUIT TO MENU': this.scene = 'title'; this.menuIndex = 0; this.audio.setTheme('menu'); break;
        default: break;
      }
    }
  }

  updateComplete(dt) {
    this.levelComplete.t += dt;
    if (this.levelComplete.t > 0.6 && (this.input.hit('confirm') || this.input.hit('jump'))) {
      this.audio.play('select');
      this.nextLevel();
    }
  }

  updateCredits(dt) {
    this.creditT += dt;
    if (this.creditT > 1 && this.input.hit('confirm')) {
      this.scene = 'title';
      this.menuIndex = 0;
    }
  }

  // ------------------------------------------------------------------ draw
  draw(dt) {
    const r = this.renderer;
    r.begin(dt);
    switch (this.scene) {
      case 'title': UI.drawTitle(this, r); break;
      case 'settings': UI.drawSettings(this, r); break;
      case 'select': UI.drawSelect(this, r); break;
      case 'story': UI.drawStory(this, r); break;
      case 'credits': UI.drawCredits(this, r); break;
      case 'play':
      case 'pause':
      case 'complete':
        this.drawWorld(r);
        UI.drawHud(this, r);
        if (this.dialogue) UI.drawDialogue(this, r);
        if (this.scene === 'pause') UI.drawPause(this, r);
        if (this.scene === 'complete') UI.drawComplete(this, r);
        break;
      default: break;
    }
    UI.drawToasts(this, r);
    r.end();
  }

  drawWorld(r) {
    const level = this.level;
    const def = LEVELS[this.levelIndex];
    level.drawBackground(r, this.time);
    r.ambient(def.ambient || WORLDS[def.world].ambient || 'rgba(10,8,24,0.5)');
    level.drawTerrain(r);
    level.drawDecor(r, this.time);
    level.drawLights(r, this.time);

    for (const e of this.entities) {
      if (e.dead && e.kind !== 'weakwall') continue;
      if (e.draw) e.draw(r, this.time);
    }
    for (const e of this.enemies) if (!e.dead) e.draw(r, this.time);
    for (const b of this.bosses) if (!b.dead) b.draw(r, this.time);
    for (const p of this.projectiles) if (!p.dead) p.draw(r, this.time);

    if (!this.player.dying) this.player.draw(r, this, this.time);
    if (!this.cutscene && this.scene === 'play') this.player.tk.draw(r, this, this.time);

    this.particles.draw(r);
    level.drawHazards(r, this.time);
  }
}

function loadSave() {
  const base = {
    powers: POWERS.map((_, i) => i === 0),
    completed: {},
    shards: {},
    seenIntros: {},
    unlockedLevels: 1,
    settings: { music: true, sfx: true },
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      ...base,
      ...parsed,
      powers: Array.isArray(parsed.powers) && parsed.powers.length === POWERS.length
        ? parsed.powers : base.powers,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      seenIntros: parsed.seenIntros || {},
    };
  } catch (e) {
    return base;
  }
}
