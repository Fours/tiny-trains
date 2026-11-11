# AGENTS.md

Guidance for coding agents working on **Little Railway** (repo: `tiny-trains`), a living toy train set rendered with Three.js. It is a personal portfolio piece: looks matter as much as code, so treat visual quality as a requirement.

## Stack and commands

- Vite + TypeScript (strict-ish, see `tsconfig.json`) + Three.js. No framework, no UI library, plain CSS.
- `npm run dev` starts Vite on port 5173 (also defined as `dev` in `.claude/launch.json`).
- `npm run build` runs `tsc` then `vite build`. This is the only check: there are no tests or linter. Run it before calling a change done; `noUnusedLocals` and `noUnusedParameters` are on, so dead code fails the build.
- `npm run preview` serves the built `dist/`.

## Layout

All code is in `src/`. Each `build*` function takes the root `THREE.Group` and adds its part of the world.

| File | What it owns |
| --- | --- |
| `main.ts` | Renderer, lights, environment, world assembly, camera rig (arrow keys), adaptive resolution, animation loop, dev console hooks |
| `post.ts` | Post-processing chain: MSAA scene pass → half-res GTAO → tilt-shift depth of field → bloom → output → colour grade |
| `tracks.ts` | Board size, the two track loops (`Track` class: corners rounded with tangent arcs, sampled by arc length), crossing, bridge, placement helpers (`clearOfTracks`, `free`, `onBoard`) |
| `trains.ts` | `Train` motion along a track, crossing interlocking, whistles, exhaust, lamps; `buildTrains` |
| `rollingstock.ts` | Locomotive, tender, coach, log/box/tank cars, caboose, valve gear constants |
| `smoke.ts` | CPU-simulated, camera-facing smoke/steam/wisp particles and sparks |
| `scenery.ts` | Buildings (farm, village, station, chapel), fences |
| `nature.ts` | Terrain height (`groundY`), pond, scattered foliage |
| `trees.ts` | Leaf/fir/trunk geometry, leaf shader, instancing `Batch`, `SUN_DIR` |
| `animals.ts`, `extras.ts` | Animated animals; ambient extras and table props |
| `world.ts` | Ground, paths and patches |
| `util.ts` | Seeded RNG, materials and canvas textures, geometry shorthands, `bake`, shared `tick`/`chimneys`/`fires` registries |

## Conventions that are easy to break

- **Static geometry is baked.** `bake(world)` in `main.ts` merges every static mesh into one mesh per material. Anything that moves must be wrapped in `dyn()` (or `frozen()` for an animated part that should still be merged internally), or it will be frozen in place. Set `userData.keep` to exempt a single mesh. Reuse materials rather than creating near-duplicates, since each material is a draw call after baking.
- **Animation goes through `tick`.** Push a `(dt, time) => void` onto `tick` from `util.ts` instead of adding code to the main loop. Register chimney tops in `chimneys` and campfires in `fires` to get smoke.
- **Randomness is seeded.** Use `rand`, `rr` and `pick` from `util.ts` (or `mulberry(seed)`) for layout so the scene is the same on every load. `Math.random()` is fine only for per-frame effects like puff timing.
- **Placement respects the layout.** Use `clearOfTracks`, `free`/`block` and `onBoard` from `tracks.ts`, and `groundY` from `nature.ts` for height. Units are roughly metres-ish world units; the board is `BOARD` (58 × 45), y is up.
- **Translucent effects stay out of AO.** Push smoke-like meshes onto `post.excludeFromAO`.
- **Performance budget.** The loop lowers pixel ratio if frames drop below ~26 fps, but don't lean on that: prefer instancing (`Batch`), baking, and cheap shaders. Three.js is ~550 kB of the bundle; the chunk warning limit is 800 kB.
- Imports use explicit `.ts` extensions and `import type` for type-only imports (`verbatimModuleSyntax`).

## Verifying changes

Most changes are visual, so check them in the browser, not just the build. In dev builds `main.ts` exposes `scene`, `camera`, `rig`, `post`, `renderer`, `target`, `trains` and `step(frames)` on `window`. `step(n)` fast-forwards the simulation n frames at 30 fps, which is handy for checking trains, smoke and animals without waiting. Arrow keys orbit the table (←/→) and change tilt (↑/↓); set `rig.side`/`rig.tilt` from the console to frame a shot.

## Git

- Commit straight to `main`; only commit when asked.
- Commit messages: imperative subject line, then a wrapped prose body describing what changed and why (see `git log`). No AI attribution trailers.
