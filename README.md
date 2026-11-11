# Little Railway

A living toy train set on a tabletop, built with Three.js. Two steam trains run on intersecting loops through a small procedural countryside: past a farm, a village, a station and a chapel, over a girder bridge and through a signalled level crossing, while animals graze, chimneys smoke and trees sway in the breeze.

Everything is generated in code: there are no 3D models or texture files.

## Highlights

- **Track layout from corner lists.** Each loop is a list of corners rounded with tangent arcs, giving straights, varied curves and an S-bend. Trains are positioned by arc length along the sampled curve.
- **Interlocked crossing.** The loops meet at a level diamond with signals; trains take right of way, wait their turn and whistle before crossing or leaving the station. At the back, one line climbs an embankment and bridges over the other.
- **Working locomotives.** Spoked drivers with counterweights, main rods and crossheads driven from the crank pins, a swinging bell, firebox glow and cylinder steam when pulling away. Rolling stock includes coaches with lit windows and passengers, mail, box, log and tank cars, and a caboose.
- **Sunlit smoke.** CPU-simulated camera-facing puffs with a procedural edge and a faked volume normal, lit warm on the sunward side and back-lit at the edges. Exhaust beats four times per driver revolution and gets sootier under load; a gusting breeze bends the plumes.
- **Trees with real leaves.** Canopies are clumps of leaf polygons with a custom shader for flutter, translucency and warm/cool shading, so shadows, AO and depth of field all see actual leaves.
- **Miniature look.** MSAA scene pass, half-resolution GTAO, a custom tilt-shift depth-of-field pass that reuses the AO depth buffer, bloom and a final colour grade.
- **Kept fast.** Static geometry is merged into one mesh per material at load, foliage is instanced, and the renderer steps resolution down if a machine can't hold ~30 fps.

## Controls

| Key | Action |
| --- | --- |
| ← → | Walk around the table |
| ↑ ↓ | Tilt the view |

## Running locally

Requires Node 20.19+ or 22.12+ (Vite 8).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. To produce and preview a production build:

```bash
npm run build && npm run preview
```

## Project structure

```
src/
  main.ts          renderer, lights, camera rig, animation loop
  post.ts          post-processing chain (AO, tilt-shift, bloom, grade)
  tracks.ts        board, track loops, crossing and bridge
  trains.ts        train motion, signalling, exhaust
  rollingstock.ts  locomotives and cars
  smoke.ts         smoke, steam and spark particles
  scenery.ts       buildings and fences
  nature.ts        terrain, pond, foliage
  trees.ts         leaf geometry, leaf shader, instancing
  animals.ts       animated animals
  extras.ts        ambient extras and table props
  world.ts         ground, paths and patches
  util.ts          seeded RNG, materials, geometry helpers, baking
```

## Built with

[Three.js](https://threejs.org), TypeScript and [Vite](https://vite.dev).
