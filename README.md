# Telepath

A 2D telekinesis puzzle platformer that runs in the browser. No build step, no
dependencies, no binary assets you did not generate yourself.

You are **Eli**, a kid who woke up a crystal that woke up something in them.
The Vantage Group wants both back. You have no weapons — only the ability to
pick the world up and put it somewhere more useful.

```
python3 tools/gen_all.py      # regenerate every sprite (optional, art is committed)
npx http-server -p 8123 -c-1  # or any static server
open http://127.0.0.1:8123
```

## Controls

| Action | Keyboard | Mouse | Gamepad |
| --- | --- | --- | --- |
| Move | `A` / `D` or arrows | — | left stick / d-pad |
| Jump | `Space` / `W` | — | A |
| Grab / Pull / Interact | `J` | left button | RT / X |
| Throw / Push | `K` | right button | RB / B |
| Stasis | `Q` | middle button | Y |
| Mind Dash | `Shift` | — | LT / LB |
| Shockwave | `E` | — | stick click |
| Build platform | `F` | — | Y |
| Pause | `Esc` / `P` | — | Start |

Aim with the mouse (or the right stick). Keyboard-only play aims in the
direction you are facing, nudged by up/down.

## The powers

Each is found in the world that teaches it, and every later level assumes it.

1. **Lift** — hold Grab to seize an object; it follows your aim.
2. **Push** — Throw with empty hands: a cone blast that shoves objects and enemies.
3. **Pull** — Grab something out of lifting range to yank it toward you, enemies included.
4. **Stasis** — freeze what you hold, or a shot in midair. A frozen shot is a solid ledge.
5. **Mind Dash** — teleport to the object you are holding.
6. **Chain Control** — hold three things at once.
7. **Shockwave** — a radial psychic blast that shatters cracked walls.
8. **Ultimate Telepathy** — lift boulders, and conjure temporary platforms from nothing.

Everything the design promises is a real mechanic: you throw crates, ride
platforms you are standing on, pull distant levers, shove enemies into spikes,
catch projectiles and send them back, break weak walls, bridge gaps with
frozen objects, and stack crates to climb.

## Worlds

Research Facility → Neon City Rooftops → Underground Crystal Caves →
Ancient Temple → Frozen Mountains → The Void Laboratory.

Nineteen levels, five bosses: **E-Mech**, the **Crystal Spider**, the
**Black Reaper**, the **Mind Warden**, and **The Entity**. Every boss is beaten
with telekinesis — catch what it throws, or throw the arena back at it.

## Layout

```
index.html          entry point
src/engine/         renderer, input, audio, particles, asset loading
src/game/           physics, level, player, telekinesis, entities, enemies, bosses, UI
src/data/           level definitions and story text
assets/             generated PNGs (sprites, tilesets, parallax, font)
tools/              the art pipeline and level tooling
tests/              Playwright playtests
```

## Art pipeline

There are no third-party art assets and no image libraries. `tools/pixelart.py`
is a from-scratch RGBA canvas with a zlib PNG encoder; the generators on top of
it draw everything:

- `gen_character.py` — Eli, posed by a two-bone IK rig so every animation
  shares one set of proportions.
- `gen_tiles.py` — a 16-tile neighbour-mask autotile sheet per world, plus
  three parallax layers each.
- `gen_objects.py` — props, hazards, enemies, bosses, FX, HUD icons.
- `gen_font.py` — the 6x8 bitmap font.

Regenerate everything with `python3 tools/gen_all.py`. Preview any sheet with
`SCALE=6 python3 tools/preview.py out.png ../assets/eli_run.png`.

## Level tooling

Levels are ASCII maps in `src/data/levels.js` (see the legend at the top of
that file) plus an `entities` array for anything that needs wiring — switches,
doors, barriers, moving platforms, power pickups, bosses.

```
node tools/check_levels.mjs              # ragged rows, bad glyphs, dead channels,
                                         # props in walls, unreachable exits
node tools/preview_levels.mjs out.png    # contact sheet of every level
node tools/fix_levels.mjs                # drop floating props onto the floor
```

## Playtests

```
npx http-server -p 8123 -c-1 &
node tests/playtest.mjs      # boots the real game, drives menus and every level,
                             # asserts no console errors and that each level completes
node tests/bot.mjs           # a heuristic bot actually plays each level with only
                             # the powers the player would own at that point
```

Both write screenshots and a JSON report to `tests/shots/`.
