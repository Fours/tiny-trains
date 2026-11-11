import * as THREE from 'three'
import { at, bake, blob, box, canvasTexture, cyl, dyn, grp, mat, mesh, paint, rand, rr, sph, tex, TAU } from './util.ts'

// ---------- shared types and materials ----------

export interface Wheel {
  o: THREE.Object3D
  r: number
}
export interface Car {
  g: THREE.Group
  len: number
  wheels: Wheel[]
  /** coupling rods: ride on the crank pins of the driving wheels */
  rods: { o: THREE.Object3D; r: number; z: number }[]
  /** main rods: crank pin back to a crosshead sliding in front of the cylinder */
  gear: { rod: THREE.Object3D; cross: THREE.Object3D; r: number; z: number }[]
  /** per-frame extras (bell, firebox flicker) */
  anim?: (time: number, v: number) => void
  /** points of interest in the car's local space */
  whistle?: THREE.Vector3
  cocks?: THREE.Vector3[]
  stack?: THREE.Vector3
  /** a stove pipe that wisps smoke */
  stove?: THREE.Vector3
}

export const CRANK = 0.2
export const MAIN_ROD = 0.52

const steel = mat(0x30343c, { rough: 0.4, metal: 0.7, env: 1 })
const bright = mat(0xc9d0d8, { rough: 0.3, metal: 0.85, env: 1.1 })
const black = mat(0x24262c, { rough: 0.5, clearcoat: 0.4 })
const gold = mat(0xf1b941, { rough: 0.25, metal: 0.85, env: 1.3 })
const copper = mat(0xd9824a, { rough: 0.3, metal: 0.8, env: 1.2 })
const glassLit = mat(0xfff1cc, { emissive: 0xffbe5c, emissiveIntensity: 1.5, rough: 0.3 })
const lampLit = mat(0xfff6d8, { emissive: 0xffd27a, emissiveIntensity: 5 })
const tailLit = mat(0xff5a4a, { emissive: 0xff2a1a, emissiveIntensity: 4 })
const cream = paint(0xfff1d6)
const bufferRed = paint(0xc83a2e)
const skin = mat(0xf3c9a5, { rough: 0.6 })
const fire = new THREE.MeshStandardMaterial({ color: 0x40140a, emissive: 0xff6a1a, emissiveIntensity: 3, roughness: 0.6 })

/** Firebox glow shared by every engine; call once per frame. */
export function flickerFire(time: number) {
  fire.emissiveIntensity = 2.6 + Math.sin(time * 13) * 0.6 + Math.sin(time * 7.7) * 0.5
}

const A = new THREE.Vector3()
const B = new THREE.Vector3()
/** A square bar running from one point to another. */
function bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, m: THREE.Material) {
  A.set(ax, ay, az)
  B.set(bx, by, bz)
  const b = box(t, t, A.distanceTo(B), m, t * 0.3)
  b.position.copy(A).lerp(B, 0.5)
  b.lookAt(B)
  return b
}

function torus(r: number, tube: number, m: THREE.Material, seg = 24) {
  const t = mesh(new THREE.TorusGeometry(r, tube, 8, seg), m)
  t.rotation.y = Math.PI / 2
  return t
}

/** Painted lettering: a text plane that sits just proud of a flat side, facing out along x. */
function label(g: THREE.Group, text: string, x: number, y: number, z: number, w: number, h: number, color: string) {
  const map = canvasTexture(
    512,
    Math.round((512 * h) / w),
    (c, cw, ch) => {
      c.clearRect(0, 0, cw, ch)
      c.fillStyle = color
      c.font = `800 ${Math.round(ch * 0.78)}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(text, cw / 2, ch * 0.54, cw * 0.96)
    },
    {},
  )
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.45, metalness: 0.3 })
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
    g.add(at(p, s * x, y, z, 0, (s * Math.PI) / 2, 0))
  }
}

// ---------- running gear ----------

function wheel(r: number, hub: THREE.Material, x: number, z: number, driver = false): Wheel {
  const side = Math.sign(x)
  const o = dyn(
    grp(
      at(cyl(r, r, 0.14, bright, 28), 0, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 1.12, r * 1.12, 0.04, bright, 28), -side * 0.07, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 0.86, r * 0.86, 0.15, black, 24), side * 0.005, 0, 0, 0, 0, Math.PI / 2),
      at(torus(r * 0.8, r * 0.085, hub), side * 0.07, 0, 0),
      at(cyl(r * 0.26, r * 0.26, 0.26, hub, 14), side * 0.02, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 0.12, r * 0.12, 0.3, gold, 10), side * 0.03, 0, 0, 0, 0, Math.PI / 2),
    ),
  )
  const spokes = driver ? 4 : 3
  for (let i = 0; i < spokes; i++) o.add(at(box(0.05, r * 1.56, r * 0.13, hub, 0.015), side * 0.07, 0, 0, (i * Math.PI) / spokes, 0, 0))
  if (driver) {
    // counterweight opposite the crank pin, and the pin itself
    const cw = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.05, 14, 1, false, -0.75, 1.5), hub)
    cw.rotation.set(Math.PI / 2, 0, Math.PI / 2)
    o.add(at(cw, side * 0.085, 0, 0, -Math.PI / 2, 0, Math.PI / 2))
    o.add(at(cyl(0.05, 0.05, 0.16, bright, 10), side * 0.13, CRANK, 0, 0, 0, Math.PI / 2))
  }
  bake(o)
  o.position.set(x, r, z)
  return { o, r }
}

/** Side frames, axle boxes and springs for a pair of axles. */
function sideFrames(g: THREE.Group, r: number, zs: number[], x = 0.74) {
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  for (const s of [-1, 1]) {
    g.add(at(box(0.07, 0.12, z1 - z0 + 0.5, black, 0.03), s * x, r + 0.12, (z0 + z1) / 2))
    for (const z of zs) {
      g.add(at(box(0.1, 0.2, 0.2, steel, 0.04), s * (x + 0.01), r, z))
      g.add(at(box(0.08, 0.05, 0.42, steel, 0.02), s * x, r + 0.24, z, 0, 0, 0))
      g.add(at(sph(0.035, gold, 6, 5), s * (x + 0.06), r, z))
    }
  }
}

function buffers(g: THREE.Group, y: number, z: number, dir: number) {
  g.add(at(box(1.5, 0.26, 0.14, bufferRed, 0.04), 0, y, z))
  for (const x of [-0.48, 0.48]) {
    g.add(at(cyl(0.06, 0.06, 0.2, bright, 10), x, y, z + dir * 0.14, Math.PI / 2))
    g.add(at(cyl(0.13, 0.13, 0.05, bright, 14), x, y, z + dir * 0.25, Math.PI / 2))
  }
  // coupling hook and a loop of chain
  g.add(at(box(0.1, 0.12, 0.3, steel, 0.03), 0, y - 0.04, z + dir * 0.16))
  g.add(at(torus(0.07, 0.022, steel, 12), 0, y - 0.1, z + dir * 0.3, 0, 0, 0))
}

function underframe(len: number, wheelR: number, hub: THREE.Material, zs: number[]) {
  const g = grp(at(box(1.25, 0.2, len, black, 0.05), 0, wheelR + 0.28, 0))
  for (const e of [-1, 1]) buffers(g, wheelR + 0.3, (e * len) / 2, e)
  const wheels: Wheel[] = []
  for (const z of zs) for (const x of [-0.62, 0.62]) wheels.push(wheel(wheelR, hub, x, z))
  wheels.forEach((w) => g.add(w.o))
  sideFrames(g, wheelR, zs)
  // truss rods under the floor
  for (const x of [-0.4, 0.4]) {
    g.add(bar(x, wheelR + 0.2, -len * 0.3, x, wheelR - 0.05, 0, 0.04, steel), bar(x, wheelR - 0.05, 0, x, wheelR + 0.2, len * 0.3, 0.04, steel))
  }
  return { g, wheels }
}

// ---------- locomotive ----------

export function locomotive(body: THREE.Material, accent: THREE.Material, num: string): Car {
  const g = grp()
  const wheels: Wheel[] = []
  const R = 0.42
  const Z1 = 0.62 // main driver
  const Z2 = -0.36

  // frame, springs and ashpan glow
  g.add(at(box(1.3, 0.24, 3.3, black, 0.06), 0, 0.72, 0.05))
  for (const s of [-1, 1]) for (const z of [Z1, Z2]) g.add(at(box(0.07, 0.06, 0.56, steel, 0.02), s * 0.5, 0.9, z))
  g.add(at(box(0.9, 0.16, 0.6, fire, 0.04), 0, 0.6, -0.86))

  // boiler with bands and handrails
  g.add(at(cyl(0.6, 0.6, 1.75, body, 32), 0, 1.38, 0.5, Math.PI / 2))
  for (const z of [-0.26, 0.2, 0.66, 1.12]) g.add(at(cyl(0.622, 0.622, 0.07, gold, 32), 0, 1.38, z, Math.PI / 2))
  for (const s of [-1, 1]) {
    g.add(at(cyl(0.022, 0.022, 1.95, bright, 6), s * 0.66, 1.66, 0.45, Math.PI / 2))
    for (const z of [-0.3, 0.3, 0.9, 1.4]) g.add(at(sph(0.045, gold, 8, 6), s * 0.64, 1.66, z))
    // copper feed pipe tucked under the running board
    g.add(at(cyl(0.035, 0.035, 2.1, copper, 8), s * 0.6, 0.98, 0.45, Math.PI / 2))
  }
  // air pump on the fireman's side
  g.add(at(cyl(0.11, 0.11, 0.46, black, 12), -0.68, 1.3, 0.05), at(cyl(0.13, 0.13, 0.06, gold, 12), -0.68, 1.55, 0.05), at(cyl(0.13, 0.13, 0.06, gold, 12), -0.68, 1.06, 0.05))

  // smokebox, door, hinges and dart
  g.add(at(cyl(0.63, 0.63, 0.42, black, 32), 0, 1.38, 1.52, Math.PI / 2))
  g.add(at(blob(0.52, 0.52, 0.13, black), 0, 1.38, 1.73))
  g.add(at(torus(0.5, 0.03, gold, 28), 0, 1.38, 1.76, 0, Math.PI / 2, 0))
  for (const y of [1.2, 1.56]) g.add(at(box(0.5, 0.05, 0.04, steel, 0.015), -0.3, y, 1.84))
  g.add(at(cyl(0.05, 0.05, 0.1, gold, 10), 0, 1.38, 1.88, Math.PI / 2), at(box(0.26, 0.04, 0.04, gold, 0.015), 0, 1.38, 1.93, 0, 0, 0.6))

  // headlamp on a bracket, plus marker lamps on the beam
  g.add(at(box(0.16, 0.14, 0.2, black, 0.03), 0, 1.99, 1.58))
  g.add(at(cyl(0.17, 0.2, 0.3, gold, 16), 0, 2.16, 1.6, Math.PI / 2))
  g.add(at(blob(0.15, 0.15, 0.05, lampLit), 0, 2.16, 1.76))
  for (const x of [-0.56, 0.56]) g.add(at(box(0.14, 0.16, 0.12, black, 0.03), x, 0.9, 1.72), at(blob(0.055, 0.055, 0.03, lampLit), x, 0.9, 1.79))

  // chimney
  g.add(at(cyl(0.2, 0.26, 0.42, black, 20), 0, 2.1, 1.12))
  g.add(at(cyl(0.34, 0.22, 0.22, body, 20), 0, 2.38, 1.12))
  g.add(at(cyl(0.36, 0.36, 0.07, gold, 20), 0, 2.5, 1.12))

  // steam dome, sand dome, safety valves and whistle
  g.add(at(blob(0.27, 0.3, 0.27, gold), 0, 2.0, 0.3), at(sph(0.06, gold, 8, 6), 0, 2.3, 0.3))
  g.add(at(cyl(0.2, 0.24, 0.3, body, 16), 0, 2.02, -0.14), at(blob(0.2, 0.12, 0.2, gold), 0, 2.18, -0.14))
  for (const x of [-0.12, 0.12]) g.add(at(cyl(0.035, 0.045, 0.2, gold, 8), x - 0.14, 2.05, -0.36))
  g.add(at(cyl(0.025, 0.025, 0.26, gold, 6), 0.26, 2.06, -0.34), at(cyl(0.055, 0.055, 0.12, gold, 10), 0.26, 2.24, -0.34), at(sph(0.055, gold, 8, 6), 0.26, 2.3, -0.34))

  // bell in its cradle
  for (const x of [-0.14, 0.14]) g.add(at(box(0.04, 0.3, 0.04, gold, 0.012), x, 2.1, 0.74))
  g.add(at(box(0.34, 0.04, 0.04, gold, 0.012), 0, 2.26, 0.74))
  const bell = dyn(grp(at(cyl(0.05, 0.12, 0.17, gold, 14), 0, -0.1, 0), at(sph(0.035, bright, 6, 5), 0, -0.2, 0)))
  bake(bell)
  bell.position.set(0, 2.25, 0.74)
  g.add(bell)

  // cab: side sheets, roof with gutters, windows and a driver leaning out
  g.add(at(box(1.56, 1.5, 1.15, body, 0.12), 0, 1.55, -0.98))
  g.add(at(box(1.86, 0.2, 1.5, cream, 0.1), 0, 2.38, -0.98))
  g.add(at(box(1.6, 0.1, 1.24, accent, 0.04), 0, 2.26, -0.98))
  g.add(at(box(0.5, 0.07, 0.6, accent, 0.03), 0, 2.5, -0.98))
  for (const x of [-0.79, 0.79]) {
    g.add(at(box(0.06, 0.56, 0.68, cream, 0.03), x, 1.88, -0.98))
    g.add(at(box(0.08, 0.42, 0.52, glassLit, 0.03), x, 1.88, -0.98))
    g.add(at(box(0.07, 0.07, 0.96, gold, 0.02), x, 1.26, -0.98))
    g.add(at(box(0.07, 0.07, 0.96, gold, 0.02), x, 0.92, -0.98))
    g.add(at(box(0.07, 0.34, 0.07, gold, 0.02), x, 1.09, -0.52), at(box(0.07, 0.34, 0.07, gold, 0.02), x, 1.09, -1.44))
    // cab steps
    g.add(at(box(0.22, 0.05, 0.34, steel, 0.02), x * 1.06, 0.5, -1.25), at(box(0.22, 0.05, 0.34, steel, 0.02), x * 1.06, 0.26, -1.25), at(box(0.04, 0.5, 0.04, steel, 0.01), x * 1.06, 0.5, -1.08))
  }
  for (const x of [-0.42, 0.42]) g.add(at(cyl(0.21, 0.21, 0.08, cream, 16), x, 1.95, -0.4, Math.PI / 2), at(cyl(0.17, 0.17, 0.1, glassLit, 16), x, 1.95, -0.39, Math.PI / 2))
  g.add(at(sph(0.2, skin, 12, 10), 0.86, 1.92, -0.92), at(cyl(0.16, 0.2, 0.1, accent, 12), 0.86, 2.09, -0.92), at(box(0.3, 0.03, 0.2, accent, 0.01), 0.9, 2.05, -0.78), at(blob(0.07, 0.07, 0.16, body), 0.92, 1.72, -0.86))

  // number plates on the cab sides
  for (const x of [-0.79, 0.79]) g.add(at(cyl(0.16, 0.16, 0.04, gold, 20), x, 1.09, -0.98, 0, 0, Math.PI / 2), at(cyl(0.13, 0.13, 0.05, black, 20), x, 1.09, -0.98, 0, 0, Math.PI / 2))
  label(g, num, 0.818, 1.09, -0.98, 0.26, 0.2, '#f6c34c')

  // running boards and front steps
  for (const x of [-0.72, 0.72]) {
    g.add(at(box(0.32, 0.06, 2.3, accent, 0.02), x, 0.92, 0.55))
    g.add(at(box(0.2, 0.05, 0.26, steel, 0.02), x * 1.1, 0.46, 1.62))
  }

  // cylinders, steam chests, slide bars
  const cocks: THREE.Vector3[] = []
  for (const x of [-0.82, 0.82]) {
    g.add(at(cyl(0.21, 0.21, 0.5, body, 18), x, R + 0.02, 1.45, Math.PI / 2))
    for (const z of [1.19, 1.71]) g.add(at(cyl(0.225, 0.225, 0.05, gold, 18), x, R + 0.02, z, Math.PI / 2))
    g.add(at(box(0.3, 0.2, 0.42, black, 0.05), x * 0.95, R + 0.3, 1.45))
    g.add(at(box(0.05, 0.05, 0.62, bright, 0.015), x, R + 0.13, 0.98), at(box(0.05, 0.05, 0.62, bright, 0.015), x, R - 0.13, 0.98))
    g.add(at(box(0.06, 0.3, 0.06, steel, 0.02), x, R, 0.68))
    cocks.push(new THREE.Vector3(x * 1.15, R - 0.15, 1.45))
  }

  // cowcatcher: a fan of slats down to a pointed rail
  g.add(at(box(1.5, 0.12, 0.12, accent, 0.03), 0, 0.56, 1.8))
  for (let i = -4; i <= 4; i++) {
    const u = i / 4
    g.add(bar(u * 0.68, 0.56, 1.82, u * 0.74, 0.1, 2.3 - Math.abs(u) * 0.36, 0.055, accent))
  }
  g.add(bar(-0.76, 0.1, 1.94, 0, 0.1, 2.32, 0.08, accent), bar(0.76, 0.1, 1.94, 0, 0.1, 2.32, 0.08, accent))
  buffers(g, 0.7, 1.72, 1)
  g.add(at(box(1.5, 0.26, 0.14, bufferRed, 0.04), 0, 0.66, -1.62), at(box(0.14, 0.1, 0.3, steel, 0.03), 0, 0.56, -1.74))

  // wheels, coupling rods and main rods
  const rods: Car['rods'] = []
  const gear: Car['gear'] = []
  for (const x of [-0.62, 0.62]) {
    const s = Math.sign(x)
    wheels.push(wheel(R, accent, x, Z1, true), wheel(R, accent, x, Z2, true), wheel(0.3, accent, x, -1.2), wheel(0.26, accent, x, 1.42))
    const rod = dyn(grp(at(box(0.06, 0.11, Z1 - Z2 + 0.22, bright, 0.03), 0, 0, 0), at(cyl(0.085, 0.085, 0.08, gold, 12), 0, 0, (Z1 - Z2) / 2, 0, 0, Math.PI / 2), at(cyl(0.085, 0.085, 0.08, gold, 12), 0, 0, -(Z1 - Z2) / 2, 0, 0, Math.PI / 2)))
    bake(rod)
    rod.position.set(x + s * 0.13, R, (Z1 + Z2) / 2)
    rods.push({ o: rod, r: R, z: (Z1 + Z2) / 2 })
    // main rod hangs back from the crosshead to the crank pin
    const main = dyn(grp(at(box(0.05, 0.1, MAIN_ROD, bright, 0.025), 0, 0, -MAIN_ROD / 2), at(cyl(0.075, 0.075, 0.07, gold, 12), 0, 0, -MAIN_ROD, 0, 0, Math.PI / 2)))
    bake(main)
    main.position.set(x + s * 0.2, R, 1)
    const cross = dyn(grp(at(box(0.1, 0.2, 0.16, steel, 0.03), 0, 0, 0), at(cyl(0.03, 0.03, 0.5, bright, 8), 0, 0, 0.3, Math.PI / 2)))
    bake(cross)
    cross.position.set(x + s * 0.2, R, 1)
    gear.push({ rod: main, cross, r: R, z: Z1 })
    g.add(rod, main, cross)
  }
  wheels.forEach((w) => g.add(w.o))

  return {
    g,
    len: 3.5,
    wheels,
    rods,
    gear,
    cocks,
    whistle: new THREE.Vector3(0.26, 2.36, -0.34),
    stack: new THREE.Vector3(0, 2.62, 1.12),
    anim: (time, v) => {
      bell.rotation.x = Math.sin(time * 6.5) * 0.5 * Math.min(1, 0.25 + v / 4)
    },
  }
}

// ---------- tender ----------

export function tender(body: THREE.Material, accent: THREE.Material, name: string): Car {
  const { g, wheels } = underframe(2.0, 0.3, accent, [-0.55, 0.55])
  g.add(at(box(1.5, 0.95, 1.9, body, 0.1), 0, 1.15, 0))
  g.add(at(box(1.58, 0.09, 1.98, gold, 0.03), 0, 1.6, 0))
  g.add(at(box(1.58, 0.06, 1.98, gold, 0.02), 0, 0.74, 0))
  // flared coal rails
  for (const x of [-0.74, 0.74]) g.add(at(box(0.05, 0.22, 1.5, body, 0.02), x * 1.02, 1.74, 0.16, 0, 0, -Math.sign(x) * 0.25))
  g.add(at(box(1.5, 0.22, 0.05, body, 0.02), 0, 1.74, 0.9))
  const coal = mat(0x23232a, { rough: 0.5, flat: true })
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.15, 0.28), 0), coal)
    c.castShadow = true
    const z = rr(-0.45, 0.8)
    g.add(at(c, rr(-0.5, 0.5), 1.62 + rr(0, 0.24) + (z > 0 ? 0.1 : 0), z, rand() * 3, rand() * 3, 0))
  }
  // shovel left in the coal
  g.add(bar(0.2, 1.75, 0.2, 0.42, 2.25, -0.2, 0.045, mat(0x9b6b43, { rough: 0.8 })), at(box(0.2, 0.26, 0.03, bright, 0.01), 0.17, 1.66, 0.26, 0.7, 0, 0))
  // water filler, toolboxes, ladder and tail lamp
  g.add(at(cyl(0.24, 0.26, 0.1, gold, 16), 0, 1.68, -0.68), at(cyl(0.06, 0.06, 0.1, bright, 8), 0, 1.76, -0.68))
  for (const x of [-0.5, 0.5]) g.add(at(box(0.36, 0.2, 0.3, accent, 0.04), x, 1.72, -0.66))
  for (const x of [-0.16, 0.16]) g.add(at(box(0.04, 1.0, 0.04, steel, 0.01), x, 1.2, -1.0))
  for (let i = 0; i < 5; i++) g.add(at(box(0.36, 0.035, 0.035, steel, 0.01), 0, 0.82 + i * 0.2, -1.0))
  g.add(at(box(0.12, 0.14, 0.1, black, 0.03), 0.55, 1.0, -0.98), at(blob(0.05, 0.05, 0.03, tailLit), 0.55, 1.0, -1.04))
  label(g, name, 0.757, 1.2, 0, 1.6, 0.26, '#f6c34c')
  // rivets along the tank
  for (const x of [-0.755, 0.755]) for (let i = 0; i < 9; i++) g.add(at(sph(0.022, gold, 5, 4), x, 0.86, -0.8 + i * 0.2))
  return { g, len: 2.1, wheels, rods: [], gear: [] }
}

// ---------- wagons ----------

/** Lamplit carriage window with a passenger silhouette and a curtain. */
function windowTexture(variant: number) {
  return canvasTexture(
    96,
    96,
    (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 96)
      grad.addColorStop(0, '#fff0c2')
      grad.addColorStop(1, '#ffc56e')
      c.fillStyle = grad
      c.fillRect(0, 0, 96, 96)
      if (variant > 0) {
        // head and shoulders
        c.fillStyle = ['', '#6b4636', '#3f4f6b', '#7a3f55'][variant]
        const x = variant === 2 ? 58 : 40
        c.beginPath()
        c.arc(x, 50, 15, 0, TAU)
        c.fill()
        c.beginPath()
        c.ellipse(x, 96, 27, 30, 0, 0, TAU)
        c.fill()
        if (variant === 3) {
          c.fillRect(x - 20, 34, 40, 6)
          c.fillRect(x - 12, 22, 24, 14)
        }
      }
      // tied-back curtain
      c.fillStyle = 'rgba(190,60,50,0.85)'
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(30, 0)
      c.quadraticCurveTo(22, 40, 0, 62)
      c.fill()
      c.beginPath()
      c.moveTo(96, 0)
      c.lineTo(66, 0)
      c.quadraticCurveTo(74, 40, 96, 62)
      c.fill()
    },
    {},
  )
}
const windowMats = [0, 1, 2, 3].map((v) => {
  const map = windowTexture(v)
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.25, roughness: 0.3 })
})

function sideWindow(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, frame: THREE.Material) {
  const s = Math.sign(x)
  g.add(at(box(0.05, h + 0.12, w + 0.12, frame, 0.02), x, y, z))
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), windowMats[Math.floor(rand() * windowMats.length)])
  g.add(at(pane, x + s * 0.03, y, z, 0, (s * Math.PI) / 2, 0))
  g.add(at(box(0.07, 0.05, w + 0.2, frame, 0.02), x + s * 0.02, y - h / 2 - 0.06, z))
}

function barrelRoof(g: THREE.Group, w: number, len: number, y: number, m: THREE.Material, squash = 0.42) {
  const roof = cyl(w / 2, w / 2, len, m, 28)
  // the cylinder lies along z after the turn, so its local z is the vertical to flatten
  roof.scale.set(1, 1, squash)
  g.add(at(roof, 0, y, 0, Math.PI / 2))
}

function ladder(g: THREE.Group, x: number, z: number, y0: number, y1: number, ry: number) {
  const l = grp()
  for (const d of [-0.13, 0.13]) l.add(at(box(0.035, y1 - y0, 0.035, steel, 0.01), d, (y0 + y1) / 2, 0))
  for (let y = y0 + 0.12; y < y1; y += 0.2) l.add(at(box(0.3, 0.03, 0.03, steel, 0.01), 0, y, 0))
  g.add(at(l, x, 0, z, 0, ry, 0))
}

export function coach(body: THREE.Material, accent: THREE.Material, mail = false): Car {
  const { g, wheels } = underframe(2.5, 0.3, accent, [-0.75, 0.75])
  g.add(at(box(1.52, 0.6, 2.45, body, 0.1), 0, 1.0, 0))
  g.add(at(box(1.48, 0.62, 2.4, cream, 0.08), 0, 1.58, 0))
  g.add(at(box(1.56, 0.08, 2.5, gold, 0.03), 0, 1.3, 0))
  g.add(at(box(1.56, 0.05, 2.5, gold, 0.02), 0, 0.74, 0))
  for (const x of [-0.75, 0.75]) {
    const s = Math.sign(x)
    if (mail) {
      // sliding door on a rail, one window and a brass post horn
      g.add(at(box(0.05, 0.98, 0.9, accent, 0.03), x * 1.03, 1.3, 0.3), at(box(0.06, 0.05, 1.7, steel, 0.02), x * 1.04, 1.84, 0.0))
      for (const z of [0.0, 0.6]) g.add(at(box(0.07, 0.9, 0.05, gold, 0.02), x * 1.05, 1.3, z))
      sideWindow(g, x, 1.6, -0.78, 0.46, 0.38, gold)
      g.add(at(torus(0.11, 0.03, gold, 14), x * 1.06, 1.0, -0.78, 0, 0, 0))
    } else {
      for (const z of [-0.74, 0.0, 0.74]) sideWindow(g, x, 1.6, z, 0.5, 0.4, gold)
    }
    // end doors with handles and steps
    for (const z of [-1.12, 1.12]) {
      g.add(at(box(0.05, 1.05, 0.2, accent, 0.03), x * 1.02, 1.28, z), at(sph(0.035, gold, 6, 5), x * 1.06, 1.25, z - Math.sign(z) * 0.06))
      g.add(at(box(0.2, 0.04, 0.22, steel, 0.015), s * 0.84, 0.5, z))
    }
  }
  // clerestory roof with a strip of lit vents
  barrelRoof(g, 1.72, 2.7, 1.86, body)
  g.add(at(box(0.84, 0.2, 2.2, cream, 0.05), 0, 2.2, 0))
  for (const x of [-0.425, 0.425]) g.add(at(box(0.02, 0.09, 2.0, glassLit, 0.005), x, 2.2, 0))
  g.add(at(box(0.96, 0.07, 2.36, body, 0.03), 0, 2.33, 0))
  for (const z of [-0.8, 0, 0.8]) g.add(at(cyl(0.05, 0.05, 0.1, gold, 8), 0, 2.4, z), at(cyl(0.09, 0.09, 0.03, gold, 10), 0, 2.46, z))
  // gangway bellows and a battery box
  for (const z of [-1.26, 1.26]) g.add(at(box(0.66, 1.15, 0.1, black, 0.04), 0, 1.35, z))
  g.add(at(box(0.5, 0.2, 0.5, black, 0.04), 0.3, 0.42, 0))
  return { g, len: 2.7, wheels, rods: [], gear: [] }
}

const rings = canvasTexture(
  64,
  64,
  (c) => {
    c.fillStyle = '#e9c48d'
    c.fillRect(0, 0, 64, 64)
    c.strokeStyle = 'rgba(140,90,40,0.6)'
    for (let r = 5; r < 32; r += 6) {
      c.lineWidth = 2
      c.beginPath()
      c.arc(32 + r * 0.08, 32, r, 0, TAU)
      c.stroke()
    }
  },
  {},
)

export function logCar(accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.3, 0.3, accent, [-0.7, 0.7])
  g.add(at(box(1.5, 0.14, 2.3, mat(0x9b6b43, { map: tex.planks(1, 3) }), 0.04), 0, 0.78, 0))
  const bark = mat(0x7a4a2b, { rough: 0.95, map: tex.wood(1, 1) })
  const bark2 = mat(0x8f6038, { rough: 0.95, map: tex.wood(1, 1) })
  const cut = new THREE.MeshStandardMaterial({ map: rings, roughness: 0.8 })
  const spots: [number, number, number][] = [
    [-0.44, 1.07, 0.21],
    [0, 1.06, 0.2],
    [0.43, 1.08, 0.22],
    [-0.22, 1.43, 0.2],
    [0.22, 1.44, 0.21],
    [0, 1.78, 0.18],
  ]
  spots.forEach(([x, y, r], i) => {
    const l = rr(1.9, 2.15)
    const off = rr(-0.06, 0.06)
    g.add(at(cyl(r, r, l, i % 2 ? bark : bark2, 14), x, y, off, Math.PI / 2, rand(), 0))
    for (const e of [-1, 1]) g.add(at(cyl(r - 0.025, r - 0.025, 0.02, cut, 14), x, y, off + (e * l) / 2, Math.PI / 2))
    // a stub where a branch was sawn off
    if (i < 3) g.add(at(cyl(0.045, 0.055, 0.1, bark, 6), x + r * 0.7, y + r * 0.7, rr(-0.6, 0.6), 0, 0, -0.8))
  })
  for (const z of [-0.85, 0, 0.85]) {
    for (const x of [-0.7, 0.7]) g.add(at(box(0.09, 1.15, 0.09, accent, 0.02), x, 1.38, z), at(sph(0.06, gold, 6, 5), x, 1.98, z))
  }
  // binding chains over the load
  for (const z of [-0.5, 0.5]) {
    g.add(bar(-0.68, 1.5, z, -0.2, 1.98, z, 0.035, steel), bar(-0.2, 1.98, z, 0.2, 1.98, z, 0.035, steel), bar(0.2, 1.98, z, 0.68, 1.5, z, 0.035, steel))
  }
  return { g, len: 2.4, wheels, rods: [], gear: [] }
}

function brakeWheel(g: THREE.Group, x: number, y: number, z: number) {
  const w = grp(at(torus(0.16, 0.025, steel, 14), 0, 0, 0, 0, Math.PI / 2, 0))
  for (let i = 0; i < 3; i++) w.add(at(box(0.3, 0.025, 0.025, steel, 0.008), 0, 0, 0, 0, 0, (i * Math.PI) / 3))
  g.add(at(w, x, y, z), at(cyl(0.02, 0.02, 0.5, steel, 5), x, y - 0.25, z + 0.03))
}

export function boxCar(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.3, 0.3, accent, [-0.7, 0.7])
  const sided = (body as THREE.MeshStandardMaterial).clone()
  sided.map = tex.planks(3, 1)
  sided.map.rotation = Math.PI / 2
  g.add(at(box(1.52, 1.25, 2.25, sided, 0.08), 0, 1.36, 0))
  for (const x of [-0.77, 0.77]) {
    // ribs, door rail, sliding door with a cross brace
    for (const z of [-1.06, -0.55, 0.55, 1.06]) g.add(at(box(0.05, 1.22, 0.07, accent, 0.02), x, 1.36, z))
    g.add(at(box(0.05, 0.06, 2.0, steel, 0.02), x * 1.02, 1.95, 0), at(box(0.05, 0.06, 2.0, steel, 0.02), x * 1.02, 0.78, 0))
    g.add(at(box(0.06, 1.1, 0.92, accent, 0.03), x * 1.03, 1.36, 0.1))
    g.add(bar(x * 1.07, 0.86, -0.3, x * 1.07, 1.86, 0.5, 0.045, gold), bar(x * 1.07, 0.86, 0.5, x * 1.07, 1.86, -0.3, 0.045, gold))
    g.add(at(box(0.07, 0.1, 0.2, gold, 0.02), x * 1.08, 1.3, -0.42))
  }
  label(g, 'M.H.R', 0.775, 1.62, -0.8, 0.42, 0.16, '#fff3d6')
  label(g, '204', 0.775, 1.42, -0.8, 0.3, 0.15, '#fff3d6')
  barrelRoof(g, 1.76, 2.45, 1.98, cream, 0.34)
  // roof walk and end details
  g.add(at(box(0.36, 0.05, 2.3, mat(0x9b6b43, { rough: 0.85, map: tex.planks(1, 6) }), 0.02), 0, 2.31, 0))
  ladder(g, 0.5, -1.15, 0.8, 2.25, 0)
  ladder(g, -0.5, 1.15, 0.8, 2.25, 0)
  brakeWheel(g, -0.4, 2.1, -1.18)
  return { g, len: 2.4, wheels, rods: [], gear: [] }
}

export function tankCar(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.3, 0.3, accent, [-0.7, 0.7])
  const R = 0.6
  const Y = 1.5
  // cradles, tank, domed ends
  for (const z of [-0.7, 0.7]) g.add(at(box(1.3, 0.4, 0.2, black, 0.05), 0, 0.95, z))
  g.add(at(cyl(R, R, 1.9, body, 32), 0, Y, 0, Math.PI / 2))
  for (const e of [-1, 1]) g.add(at(blob(R, R, 0.22, body), 0, Y, e * 0.95))
  for (const z of [-0.7, 0, 0.7]) g.add(at(cyl(R + 0.02, R + 0.02, 0.07, gold, 32), 0, Y, z, Math.PI / 2))
  // filler dome, hatch wheel and safety valve
  g.add(at(cyl(0.26, 0.3, 0.26, body, 18), 0, Y + R + 0.08, 0), at(blob(0.27, 0.1, 0.27, gold), 0, Y + R + 0.22, 0))
  g.add(at(torus(0.13, 0.02, steel, 12), 0, Y + R + 0.34, 0, Math.PI / 2, 0, 0))
  g.add(at(cyl(0.04, 0.05, 0.16, gold, 8), 0, Y + R + 0.06, 0.5))
  // walkways, handrail, ladders, drain valve
  for (const x of [-0.72, 0.72]) {
    g.add(at(box(0.22, 0.04, 2.1, mat(0x9b6b43, { rough: 0.85, map: tex.planks(1, 5) }), 0.015), x, 0.84, 0))
    g.add(at(cyl(0.02, 0.02, 1.9, bright, 6), x * 0.92, Y + 0.12, 0, Math.PI / 2))
    for (const z of [-0.9, 0, 0.9]) g.add(at(sph(0.04, gold, 6, 5), x * 0.9, Y + 0.12, z))
    ladder(g, x * 0.9, 0.74, 0.86, Y + R * 0.75, Math.PI / 2)
  }
  g.add(at(cyl(0.07, 0.07, 0.3, bright, 8), 0, 0.82, 0), at(box(0.2, 0.04, 0.04, bufferRed, 0.01), 0, 0.7, 0))
  // name board on each flank
  for (const x of [-1, 1]) g.add(at(box(0.05, 0.36, 1.0, accent, 0.02), x * (R - 0.005), Y - 0.02, 0))
  label(g, 'MILK', R + 0.024, Y - 0.02, 0, 0.9, 0.28, '#fff3d6')
  return { g, len: 2.4, wheels, rods: [], gear: [] }
}

export function caboose(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.1, 0.3, accent, [-0.6, 0.6])
  const sided = (body as THREE.MeshStandardMaterial).clone()
  sided.map = tex.planks(3, 1)
  sided.map.rotation = Math.PI / 2
  // cabin sits between two open end platforms
  g.add(at(box(1.5, 1.05, 1.5, sided, 0.1), 0, 1.28, 0))
  barrelRoof(g, 1.8, 2.25, 1.8, cream, 0.3)
  // cupola with windows on every side
  g.add(at(box(1.0, 0.5, 0.9, body, 0.08), 0, 2.2, 0))
  g.add(at(box(1.2, 0.1, 1.1, cream, 0.05), 0, 2.48, 0))
  for (const x of [-0.5, 0.5]) g.add(at(box(0.05, 0.26, 0.56, glassLit, 0.02), x * 1.01, 2.2, 0))
  for (const z of [-0.45, 0.45]) g.add(at(box(0.6, 0.26, 0.05, glassLit, 0.02), 0, 2.2, z * 1.01))
  for (const x of [-0.76, 0.76]) {
    for (const z of [-0.36, 0.36]) sideWindow(g, x, 1.42, z, 0.36, 0.36, cream)
    g.add(at(box(0.05, 0.06, 1.5, gold, 0.02), x * 1.01, 0.82, 0))
  }
  for (const e of [-1, 1]) {
    // platform railings, door and ladder to the roof
    const z = e * 0.98
    g.add(at(box(1.36, 0.05, 0.05, gold, 0.02), 0, 1.4, z), at(box(1.36, 0.04, 0.04, gold, 0.015), 0, 1.12, z))
    for (const x of [-0.65, -0.22, 0.22, 0.65]) g.add(at(box(0.05, 0.62, 0.05, gold, 0.02), x, 1.12, z))
    g.add(at(box(0.5, 0.86, 0.05, accent, 0.03), 0, 1.25, e * 0.76), at(box(0.26, 0.24, 0.06, glassLit, 0.02), 0, 1.45, e * 0.77))
    ladder(g, e * 0.5, e * 0.8, 0.86, 1.95, 0)
    for (const x of [-0.62, 0.62]) g.add(at(box(0.1, 0.12, 0.08, black, 0.02), x, 1.0, e * 1.0), at(blob(0.045, 0.045, 0.03, e < 0 ? tailLit : lampLit), x, 1.0, e * 1.045))
  }
  // stove pipe and a lantern on a hook
  g.add(at(cyl(0.06, 0.06, 0.5, black, 8), 0.5, 2.2, -0.52), at(cyl(0.1, 0.07, 0.08, black, 8), 0.5, 2.48, -0.52))
  g.add(at(box(0.1, 0.14, 0.1, gold, 0.02), -0.8, 1.76, 0.62), at(box(0.07, 0.09, 0.07, lampLit, 0.02), -0.8, 1.76, 0.62))
  brakeWheel(g, 0.36, 1.62, 1.02)
  return { g, len: 2.2, wheels, rods: [], gear: [], stove: new THREE.Vector3(0.5, 2.58, -0.52) }
}
