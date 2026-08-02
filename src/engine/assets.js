// Image loading + spritesheet slicing.

/** name -> [frameWidth, frameHeight]. Files not listed are single images. */
export const SHEETS = {
  eli_idle: [32, 32],
  eli_run: [32, 32],
  eli_jump: [32, 32],
  eli_fall: [32, 32],
  eli_land: [32, 32],
  eli_cast: [32, 32],
  eli_dash: [32, 32],
  eli_hurt: [32, 32],
  eli_crouch: [32, 32],
  orb: [16, 16],
  door: [16, 32],
  weak_wall: [16, 16],
  checkpoint_off: [16, 32],
  checkpoint_on: [16, 32],
  shard: [16, 16],
  barrier: [16, 16],
  drone: [24, 24],
  guard: [24, 32],
  spider: [32, 24],
  turret: [16, 16],
  wraith: [24, 32],
  proj_energy: [8, 8],
  proj_psy: [8, 8],
  proj_void: [8, 8],
  boss_emech: [64, 64],
  boss_spider: [80, 56],
  boss_reaper: [48, 64],
  boss_warden: [64, 64],
  boss_entity: [96, 96],
  fx_shockwave: [64, 64],
  fx_psi_ring: [32, 32],
  power_icons: [16, 16],
};

export const WORLD_IDS = ['facility', 'city', 'caves', 'temple', 'frost', 'void'];

const SINGLES = [
  'crate_wood', 'crate_metal', 'crate_psy', 'boulder', 'switch_off', 'switch_on',
  'lever_off', 'lever_on', 'spikes', 'platform', 'crystal_key', 'heart_full',
  'logo', 'font',
];

export class Assets {
  constructor() {
    /** @type {Record<string, HTMLImageElement>} */
    this.img = {};
    /** @type {Record<string, {img: HTMLImageElement, fw: number, fh: number, count: number, cols: number}>} */
    this.sheet = {};
  }

  get(name) {
    return this.img[name];
  }

  /** Frame count of a loaded sheet (1 for singles). */
  frames(name) {
    return this.sheet[name] ? this.sheet[name].count : 1;
  }

  async loadAll(onProgress) {
    const names = [...SINGLES, ...Object.keys(SHEETS)];
    for (const w of WORLD_IDS) {
      names.push(`tiles_${w}`);
      for (let i = 0; i < 3; i++) names.push(`bg_${w}_${i}`);
    }
    let done = 0;
    await Promise.all(names.map(async (name) => {
      const image = await loadImage(`assets/${name}.png`);
      this.img[name] = image;
      const dims = SHEETS[name];
      if (dims) {
        const cols = Math.max(1, Math.floor(image.width / dims[0]));
        const rows = Math.max(1, Math.floor(image.height / dims[1]));
        this.sheet[name] = { img: image, fw: dims[0], fh: dims[1], cols, count: cols * rows };
      }
      done++;
      if (onProgress) onProgress(done / names.length);
    }));
    // Tilesets are 16px grids: 16 masks per row, rows = variants + background row.
    for (const w of WORLD_IDS) {
      const image = this.img[`tiles_${w}`];
      this.sheet[`tiles_${w}`] = {
        img: image, fw: 16, fh: 16, cols: 16,
        count: 16 * Math.floor(image.height / 16),
      };
    }
    return this;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`failed to load ${src}`));
    im.src = src;
  });
}
