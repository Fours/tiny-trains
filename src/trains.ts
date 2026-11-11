import * as THREE from 'three'
import { CROSSING, RAIL_Y, Track, trackA, trackB } from './tracks.ts'
import { at, bake, blob, lumpy, box, cone, cyl, dyn, grp, mat, mod, paint, rand, rr, sph, tex } from './util.ts'

// ---------- smoke ----------

interface Puff {
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
}

export class Smoke {
  readonly mesh: THREE.InstancedMesh
  private puffs: Puff[] = []
  private dummy = new THREE.Object3D()
  private max: number

  constructor(max = 260) {
    this.max = max
    const g = lumpy(3, 0.16, 77)
    const m = new THREE.MeshStandardMaterial({ color: 0xece7e0, roughness: 1, envMapIntensity: 0.3 })
    this.mesh = new THREE.InstancedMesh(g, m, max)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.userData.dynamic = true
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life = 2.4) {
    if (this.puffs.length >= this.max) this.puffs.shift()
    this.puffs.push({ pos: pos.clone(), vel: vel.clone(), age: 0, life: life * rr(0.8, 1.2), size: size * rr(0.75, 1.25) })
  }

  update(dt: number) {
    this.puffs = this.puffs.filter((p) => (p.age += dt) < p.life)
    this.puffs.forEach((p, i) => {
      p.vel.multiplyScalar(1 - 0.9 * dt)
      p.vel.y += 0.9 * dt
      p.vel.x += 0.35 * dt
      p.pos.addScaledVector(p.vel, dt)
      const u = p.age / p.life
      const grow = 1 - Math.pow(1 - Math.min(1, u / 0.35), 3)
      const fade = u > 0.55 ? 1 - ((u - 0.55) / 0.45) ** 2 : 1
      const s = p.size * (0.35 + 0.65 * grow) * fade * (1 + u * 0.9)
      this.dummy.position.copy(p.pos)
      this.dummy.scale.setScalar(Math.max(0.0001, s))
      this.dummy.rotation.set(u * 2 + i, u * 1.3, i * 1.7)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    })
    this.mesh.count = this.puffs.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ---------- rolling stock ----------

interface Wheel {
  o: THREE.Object3D
  r: number
}
interface Car {
  g: THREE.Group
  len: number
  wheels: Wheel[]
  rods: { o: THREE.Object3D; r: number; z: number }[]
}

const steel = mat(0x30343c, { rough: 0.4, metal: 0.7, env: 1 })
const black = mat(0x24262c, { rough: 0.5, clearcoat: 0.4 })
const gold = mat(0xf1b941, { rough: 0.25, metal: 0.85, env: 1.3 })
const glassLit = mat(0xfff1cc, { emissive: 0xffbe5c, emissiveIntensity: 1.5, rough: 0.3 })
const cream = paint(0xfff1d6)

function wheel(r: number, hub: THREE.Material, x: number, z: number): Wheel {
  const side = Math.sign(x)
  const o = dyn(
    grp(
      at(cyl(r, r, 0.14, steel, 28), 0, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 1.12, r * 1.12, 0.04, steel, 28), -side * 0.07, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 0.8, r * 0.8, 0.17, hub, 24), side * 0.01, 0, 0, 0, 0, Math.PI / 2),
      at(cyl(r * 0.28, r * 0.28, 0.24, gold, 14), side * 0.02, 0, 0, 0, 0, Math.PI / 2),
    ),
  )
  for (let i = 0; i < 3; i++) o.add(at(box(0.2, r * 1.5, 0.08, steel, 0.02), side * 0.01, 0, 0, (i * Math.PI) / 3, 0, 0))
  bake(o)
  o.position.set(x, r, z)
  return { o, r }
}

function underframe(len: number, wheelR: number, hub: THREE.Material, zs: number[]) {
  const g = grp(at(box(1.25, 0.2, len, black, 0.05), 0, wheelR + 0.28, 0))
  // buffers and coupling
  for (const e of [-1, 1]) {
    g.add(at(box(1.45, 0.24, 0.12, paint(0xc83a2e), 0.04), 0, wheelR + 0.3, (e * len) / 2))
    for (const x of [-0.45, 0.45]) g.add(at(cyl(0.11, 0.11, 0.16, steel, 12), x, wheelR + 0.3, e * (len / 2 + 0.1), Math.PI / 2))
    g.add(at(box(0.14, 0.1, 0.3, steel, 0.03), 0, wheelR + 0.2, e * (len / 2 + 0.12)))
  }
  const wheels: Wheel[] = []
  for (const z of zs) for (const x of [-0.62, 0.62]) wheels.push(wheel(wheelR, hub, x, z))
  wheels.forEach((w) => g.add(w.o))
  return { g, wheels }
}

function locomotive(body: THREE.Material, accent: THREE.Material): Car {
  const g = grp()
  const wheels: Wheel[] = []
  const R = 0.42
  // frame
  g.add(at(box(1.3, 0.24, 3.3, black, 0.06), 0, 0.72, 0.05))
  // boiler
  g.add(at(cyl(0.6, 0.6, 1.75, body, 28), 0, 1.38, 0.5, Math.PI / 2))
  for (const z of [-0.2, 0.45, 1.1]) g.add(at(cyl(0.625, 0.625, 0.09, gold, 28), 0, 1.38, z, Math.PI / 2))
  // smokebox + door
  g.add(at(cyl(0.63, 0.63, 0.42, black, 28), 0, 1.38, 1.52, Math.PI / 2))
  g.add(at(blob(0.5, 0.5, 0.14, black), 0, 1.38, 1.73))
  g.add(at(cyl(0.09, 0.09, 0.1, gold, 12), 0, 1.38, 1.87, Math.PI / 2))
  // headlamp
  g.add(at(box(0.3, 0.3, 0.26, gold, 0.06), 0, 2.12, 1.55))
  g.add(at(blob(0.13, 0.13, 0.06, mat(0xfff6d8, { emissive: 0xffd27a, emissiveIntensity: 5 })), 0, 2.12, 1.69))
  // chimney
  g.add(at(cyl(0.2, 0.26, 0.42, black, 20), 0, 2.1, 1.12))
  g.add(at(cyl(0.34, 0.22, 0.22, body, 20), 0, 2.38, 1.12))
  g.add(at(cyl(0.36, 0.36, 0.07, gold, 20), 0, 2.5, 1.12))
  // domes
  g.add(at(blob(0.27, 0.3, 0.27, gold), 0, 2.0, 0.42))
  g.add(at(cyl(0.2, 0.24, 0.3, body, 16), 0, 2.02, -0.12))
  g.add(at(blob(0.2, 0.12, 0.2, gold), 0, 2.18, -0.12))
  // cab
  g.add(at(box(1.56, 1.5, 1.15, body, 0.12), 0, 1.55, -0.98))
  g.add(at(box(1.86, 0.2, 1.5, cream, 0.1), 0, 2.38, -0.98))
  g.add(at(box(1.6, 0.1, 1.24, accent, 0.04), 0, 2.26, -0.98))
  for (const x of [-0.79, 0.79]) {
    g.add(at(box(0.06, 0.52, 0.62, cream, 0.03), x, 1.88, -0.98))
    g.add(at(box(0.08, 0.4, 0.5, glassLit, 0.03), x, 1.88, -0.98))
    g.add(at(box(0.07, 0.1, 0.9, gold, 0.02), x, 1.3, -0.98))
  }
  for (const x of [-0.42, 0.42]) g.add(at(cyl(0.2, 0.2, 0.08, glassLit, 16), x, 1.95, -0.39, Math.PI / 2))
  // running boards, steps
  for (const x of [-0.72, 0.72]) g.add(at(box(0.3, 0.07, 2.3, accent, 0.02), x, 0.9, 0.55))
  // cylinders
  for (const x of [-0.74, 0.74]) g.add(at(cyl(0.2, 0.2, 0.62, body, 16), x, 0.52, 1.28, Math.PI / 2))
  // cowcatcher
  const cow = cone(0.8, 0.75, accent, 4)
  cow.scale.set(1, 1, 0.55)
  g.add(at(cow, 0, 0.36, 1.95, Math.PI / 2, 0, 0))
  g.add(at(box(1.5, 0.26, 0.14, paint(0xc83a2e), 0.04), 0, 0.66, 1.72))
  g.add(at(box(1.5, 0.26, 0.14, paint(0xc83a2e), 0.04), 0, 0.66, -1.62))
  g.add(at(box(0.14, 0.1, 0.3, steel, 0.03), 0, 0.56, -1.74))
  // wheels: two driving axles + trailing + leading bogie
  const rods: Car['rods'] = []
  for (const x of [-0.62, 0.62]) {
    wheels.push(wheel(R, accent, x, 0.62), wheel(R, accent, x, -0.36), wheel(0.3, accent, x, -1.2), wheel(0.26, accent, x, 1.42))
    const rod = dyn(grp(at(box(0.07, 0.1, 1.25, gold, 0.03), 0, 0, 0), at(cyl(0.07, 0.07, 0.1, steel, 10), 0, 0, 0.49, 0, 0, Math.PI / 2), at(cyl(0.07, 0.07, 0.1, steel, 10), 0, 0, -0.49, 0, 0, Math.PI / 2)))
    rod.position.set(x + Math.sign(x) * 0.15, R, 0.13)
    rods.push({ o: rod, r: R, z: 0.13 })
    g.add(rod)
  }
  wheels.forEach((w) => g.add(w.o))
  return { g, len: 3.5, wheels, rods }
}

function tender(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.0, 0.3, accent, [-0.55, 0.55])
  g.add(at(box(1.5, 0.95, 1.9, body, 0.1), 0, 1.15, 0))
  g.add(at(box(1.56, 0.1, 1.96, gold, 0.03), 0, 1.6, 0))
  const coal = mat(0x23232a, { rough: 0.5, flat: true })
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.16, 0.3), 0), coal)
    c.castShadow = true
    g.add(at(c, rr(-0.5, 0.5), 1.62 + rr(0, 0.22) - Math.abs(rr(-0.2, 0.2)), rr(-0.7, 0.7), rand() * 3, rand() * 3, 0))
  }
  return { g, len: 2.1, wheels, rods: [] }
}

function coach(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.5, 0.3, accent, [-0.75, 0.75])
  g.add(at(box(1.52, 0.6, 2.45, body, 0.1), 0, 1.0, 0))
  g.add(at(box(1.48, 0.62, 2.4, cream, 0.08), 0, 1.58, 0))
  g.add(at(box(1.56, 0.1, 2.5, gold, 0.03), 0, 1.3, 0))
  for (const x of [-0.75, 0.75]) for (const z of [-0.78, -0.02, 0.74]) g.add(at(box(0.06, 0.4, 0.5, glassLit, 0.05), x, 1.6, z))
  // barrel roof
  const roof = cyl(0.86, 0.86, 2.7, body, 24)
  roof.scale.set(1, 0.42, 1)
  g.add(at(roof, 0, 1.86, 0, Math.PI / 2))
  for (const z of [-0.7, 0, 0.7]) g.add(at(cyl(0.1, 0.1, 0.16, gold, 10), 0, 2.26, z))
  return { g, len: 2.7, wheels, rods: [] }
}

function logCar(accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.3, 0.3, accent, [-0.7, 0.7])
  g.add(at(box(1.5, 0.14, 2.3, mat(0x9b6b43, { map: tex.planks(1, 3) }), 0.04), 0, 0.78, 0))
  const bark = mat(0x7a4a2b, { rough: 0.95, map: tex.wood(1, 1) })
  const cut = mat(0xe9c48d, { rough: 0.8 })
  const spots: [number, number][] = [
    [-0.42, 1.08],
    [0, 1.08],
    [0.42, 1.08],
    [-0.21, 1.44],
    [0.21, 1.44],
  ]
  for (const [x, y] of spots) {
    const l = rr(1.9, 2.15)
    g.add(at(cyl(0.21, 0.21, l, bark, 14), x, y, 0, Math.PI / 2))
    for (const e of [-1, 1]) g.add(at(cyl(0.18, 0.18, 0.02, cut, 14), x, y, (e * l) / 2, Math.PI / 2))
  }
  for (const z of [-0.85, 0.85]) for (const x of [-0.7, 0.7]) g.add(at(box(0.09, 0.9, 0.09, accent, 0.02), x, 1.25, z))
  return { g, len: 2.4, wheels, rods: [] }
}

function boxCar(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.3, 0.3, accent, [-0.7, 0.7])
  const sided = (body as THREE.MeshStandardMaterial).clone()
  sided.map = tex.planks(3, 1)
  sided.map.rotation = Math.PI / 2
  g.add(at(box(1.52, 1.25, 2.25, sided, 0.08), 0, 1.36, 0))
  for (const x of [-0.77, 0.77]) {
    g.add(at(box(0.06, 1.05, 0.9, accent, 0.04), x, 1.34, 0))
    g.add(at(box(0.09, 0.08, 0.2, gold, 0.02), x, 1.3, 0.3))
  }
  const roof = cyl(0.88, 0.88, 2.45, cream, 24)
  roof.scale.set(1, 0.34, 1)
  g.add(at(roof, 0, 1.98, 0, Math.PI / 2))
  return { g, len: 2.4, wheels, rods: [] }
}

function caboose(body: THREE.Material, accent: THREE.Material): Car {
  const { g, wheels } = underframe(2.1, 0.3, accent, [-0.6, 0.6])
  g.add(at(box(1.5, 1.05, 1.7, body, 0.1), 0, 1.28, 0))
  g.add(at(box(1.7, 0.14, 2.2, cream, 0.06), 0, 1.86, 0))
  g.add(at(box(1.0, 0.5, 0.9, body, 0.08), 0, 2.15, 0))
  g.add(at(box(1.2, 0.12, 1.1, cream, 0.05), 0, 2.44, 0))
  for (const x of [-0.5, 0.5]) g.add(at(box(0.06, 0.26, 0.5, glassLit, 0.03), x, 2.16, 0))
  for (const x of [-0.76, 0.76]) for (const z of [-0.4, 0.4]) g.add(at(box(0.06, 0.4, 0.4, glassLit, 0.05), x, 1.42, z))
  // tail lamp + railing
  g.add(at(sph(0.1, mat(0xff5a4a, { emissive: 0xff2a1a, emissiveIntensity: 4 }), 12, 8), 0, 1.25, -0.9))
  for (const x of [-0.65, 0.65]) g.add(at(box(0.06, 0.6, 0.06, gold, 0.02), x, 1.15, -1.02))
  g.add(at(box(1.36, 0.06, 0.06, gold, 0.02), 0, 1.45, -1.02))
  return { g, len: 2.2, wheels, rods: [] }
}

// ---------- train ----------

const COUPLING = 0.32
const ACCEL = 2.4
const pf = new THREE.Vector3()
const pb = new THREE.Vector3()

export class Train {
  readonly cars: Car[]
  readonly offsets: number[] = []
  readonly len: number
  readonly track: Track
  s: number
  v = 0
  vmax: number
  private puffTimer = 0
  private lamp: THREE.PointLight
  private chimney = new THREE.Vector3()
  private bob = rand() * 10

  constructor(track: Track, cars: Car[], s: number, vmax: number, root: THREE.Group) {
    this.track = track
    this.cars = cars
    this.s = s
    this.vmax = vmax
    let c = 0
    cars.forEach((car, i) => {
      c += i === 0 ? car.len / 2 : cars[i - 1].len / 2 + COUPLING + car.len / 2
      this.offsets.push(c)
      bake(car.g)
      dyn(car.g)
      root.add(car.g)
    })
    this.len = c + cars[cars.length - 1].len / 2
    this.lamp = new THREE.PointLight(0xffd08a, 6, 8, 1.8)
    this.lamp.position.set(0, 1.9, 2.6)
    cars[0].g.add(this.lamp)
    this.place(0)
  }

  /** distance from the head of the train to the crossing centre, ahead of it */
  get ahead() {
    return mod(this.track.crossS - this.s, this.track.length)
  }

  update(dt: number, target: number, smoke: Smoke, time: number) {
    const dv = target - this.v
    this.v += Math.sign(dv) * Math.min(Math.abs(dv), (dv > 0 ? ACCEL : 7) * dt)
    this.s = mod(this.s + this.v * dt, this.track.length)
    this.place(time)

    // chuff: puffs come faster when moving
    this.puffTimer -= dt
    if (this.puffTimer <= 0) {
      const moving = this.v > 0.3
      this.puffTimer = moving ? 0.16 + 0.3 / (1 + this.v) : 0.7
      const loco = this.cars[0].g
      this.chimney.set(0, 2.62, 1.12)
      loco.localToWorld(this.chimney)
      for (let k = 0; k < (moving ? 2 : 1); k++) {
        this.chimney.x += rr(-0.12, 0.12)
        this.chimney.z += rr(-0.12, 0.12)
        smoke.emit(this.chimney, new THREE.Vector3(rr(-0.5, 0.5), rr(1.8, 3.2), rr(-0.5, 0.5)), (moving ? 0.5 : 0.34) * rr(0.6, 1.25), moving ? 2.6 : 3.0)
      }
    }
  }

  private place(time: number) {
    this.cars.forEach((car, i) => {
      const sc = this.s - this.offsets[i]
      const half = car.len * 0.3
      this.track.pos(sc + half, pf)
      this.track.pos(sc - half, pb)
      const wobble = Math.sin(time * 9 + i * 1.7 + this.bob) * 0.012 * Math.min(1, this.v / 3)
      car.g.position.set((pf.x + pb.x) / 2, (pf.y + pb.y) / 2 + RAIL_Y + wobble, (pf.z + pb.z) / 2)
      car.g.lookAt(pf.x, pf.y + RAIL_Y + wobble, pf.z)
      car.g.rotateZ(Math.sin(time * 5 + i * 2.1 + this.bob) * 0.012 * Math.min(1, this.v / 3))
      for (const w of car.wheels) w.o.rotation.x = sc / w.r
      for (const rod of car.rods) {
        const phi = sc / rod.r
        rod.o.position.y = rod.r + 0.2 * Math.cos(phi)
        rod.o.position.z = rod.z + 0.2 * Math.sin(phi)
      }
    })
  }
}

// ---------- signals ----------

interface Signal {
  set(red: boolean): void
}

function lampMat(color: number) {
  return new THREE.MeshStandardMaterial({ color: 0x331a1a, emissive: color, emissiveIntensity: 0, roughness: 0.3 })
}

function signalMast(root: THREE.Group, x: number, z: number, faceX: number, faceZ: number): Signal {
  const red = lampMat(0xff2a1a)
  const green = lampMat(0x3dff7a)
  const pole = mat(0xf4f1ea, { rough: 0.5 })
  const dark = mat(0x2b2d33, { rough: 0.5 })
  const g = grp(
    at(cyl(0.26, 0.32, 0.22, dark, 16), 0, 0.11, 0),
    at(cyl(0.085, 0.1, 3.0, pole, 12), 0, 1.6, 0),
    at(box(0.62, 1.15, 0.3, dark, 0.14), 0, 3.3, 0),
    at(box(0.74, 0.1, 0.5, dark, 0.04), 0, 3.9, 0.08),
    at(cyl(0.1, 0.1, 0.5, paint(0xd8382f), 10), 0, 1.3, 0),
  )
  const rl = at(sph(0.21, red, 16, 12), 0, 3.57, 0.14)
  const gl = at(sph(0.21, green, 16, 12), 0, 3.05, 0.14)
  rl.userData.keep = gl.userData.keep = true
  g.add(rl, gl)
  // little hoods over each lamp
  for (const y of [3.57, 3.05]) g.add(at(box(0.52, 0.05, 0.34, dark, 0.02), 0, y + 0.25, 0.24))
  g.position.set(x, 0, z)
  g.rotation.y = Math.atan2(faceX - x, faceZ - z)
  root.add(g)
  const glow = new THREE.PointLight(0xff2a1a, 0, 6, 1.8)
  glow.position.set(0, 3.3, 0.7)
  g.add(glow)
  return {
    set(isRed) {
      red.emissiveIntensity = isRed ? 7 : 0.02
      green.emissiveIntensity = isRed ? 0.02 : 4.5
      glow.color.set(isRed ? 0xff2a1a : 0x3dff7a)
      glow.intensity = isRed ? 9 : 5
    },
  }
}

function crossbuck(root: THREE.Group, x: number, z: number, ry: number) {
  const a = lampMat(0xff2a1a)
  const b = lampMat(0xff2a1a)
  const white = mat(0xfaf7f0, { rough: 0.5 })
  const dark = mat(0x2b2d33, { rough: 0.5 })
  const g = grp(
    at(cyl(0.24, 0.3, 0.2, dark, 16), 0, 0.1, 0),
    at(cyl(0.08, 0.09, 2.7, white, 12), 0, 1.45, 0),
    at(box(1.7, 0.26, 0.07, white, 0.03), 0, 2.65, 0.06, 0, 0, Math.PI / 4),
    at(box(1.7, 0.26, 0.07, white, 0.03), 0, 2.65, 0.07, 0, 0, -Math.PI / 4),
    at(box(1.15, 0.14, 0.1, dark, 0.03), 0, 1.85, 0.04),
    at(blob(0.2, 0.14, 0.2, mat(0xf1b941, { metal: 0.8, rough: 0.3 })), 0, 2.95, -0.02),
  )
  for (const [m, lx] of [
    [a, -0.48],
    [b, 0.48],
  ] as const) {
    g.add(at(cyl(0.27, 0.27, 0.12, dark, 18), lx, 1.85, 0.06, Math.PI / 2))
    const l = at(sph(0.19, m, 14, 10), lx, 1.85, 0.1)
    l.userData.keep = true
    g.add(l)
  }
  g.position.set(x, 0, z)
  g.rotation.y = ry
  root.add(g)
  return (on: boolean, time: number) => {
    const ph = Math.sin(time * 7) > 0
    a.emissiveIntensity = on && ph ? 7 : 0.02
    b.emissiveIntensity = on && !ph ? 7 : 0.02
  }
}

// ---------- world ----------

export function buildTrains(root: THREE.Group) {
  const smoke = new Smoke()
  root.add(smoke.mesh)

  const red = paint(0xd9372c)
  const navy = paint(0x2c4a7c)
  const green = paint(0x3f9b58)
  const teal = paint(0x19a39a)
  const yellow = paint(0xf4b63a)
  const orange = paint(0xee7b3a)
  const plum = paint(0x8a4f9e)

  const a = new Train(trackA, [locomotive(red, navy), tender(red, navy), coach(green, navy), coach(navy, red), caboose(red, navy)], 30, 6.6, root)
  const b = new Train(trackB, [locomotive(teal, orange), tender(teal, orange), logCar(orange), boxCar(yellow, plum), caboose(plum, orange)], 45, 4.8, root)

  // signals at each stop line
  const STOP = 3.3
  const place = (t: Track, lateral: number) => {
    const f = t.frame(t.crossS - STOP - 0.4)
    const back = t.frame(t.crossS - STOP - 4.4)
    return signalMast(root, f.x + f.nx * lateral, f.z + f.nz * lateral, back.x + back.nx * lateral, back.z + back.nz * lateral)
  }
  const sigA = place(trackA, -2.0)
  const sigB = place(trackB, 2.0)
  const bucks = [crossbuck(root, CROSSING.x - 2.5, CROSSING.z + 2.5, Math.PI / 4), crossbuck(root, CROSSING.x + 2.5, CROSSING.z - 2.5, -Math.PI * 0.75)]

  // interlocking: A has the right of way. B is only cleared when A is far away.
  let owner: Train | null = null
  const REQUEST = 9
  const occupying = (t: Train) => t.ahead < STOP + 0.2 || t.track.length - t.ahead < t.len + 1.8
  /** seconds until a train's tail is clear of the diamond, allowing for it pulling away from a stand */
  const clearTime = (t: Train) => {
    const dist = t.ahead + t.len + 1.8
    const ta = Math.max(0, t.vmax - t.v) / ACCEL
    const da = (t.vmax ** 2 - t.v ** 2) / (2 * ACCEL)
    return ta + Math.max(0, dist - da) / t.vmax
  }
  /** B may only proceed if it will be long gone before A reaches its own approach zone */
  const bMayGo = () => a.ahead - (REQUEST + STOP) > a.vmax * clearTime(b) + 1.5
  const approach = (t: Train) => {
    if (owner === t) return t.vmax
    const d = t.ahead - STOP
    if (d > REQUEST || d < -0.5) return t.vmax
    return Math.min(t.vmax, Math.sqrt(Math.max(0, 2 * 2.6 * d)))
  }

  // A calls at Maple Hollow every other lap, stopping with its tail clear of the diamond
  const STATION_S = trackA.nearest(-17.5, 13).s
  let lap = 0
  let prevD = 0
  let dwell = 0
  let calling = true
  const station = (dt: number) => {
    const d = mod(STATION_S - a.s, trackA.length)
    if (d > prevD + 10) {
      lap++
      calling = lap % 2 === 0
    }
    prevD = d
    if (dwell > 0) {
      dwell -= dt
      return 0
    }
    if (!calling || d > 12) return a.vmax
    if (d < 0.2) {
      dwell = 3.6
      calling = false
      return 0
    }
    return Math.max(0.5, Math.sqrt(2 * 1.9 * d))
  }

  return {
    update(dt: number, time: number) {
      if (owner && !occupying(owner) && owner.ahead > REQUEST + STOP) owner = null
      if (!owner) {
        if (a.ahead < REQUEST + STOP) owner = a
        else if (b.ahead < REQUEST + STOP && bMayGo()) owner = b
      }
      a.update(dt, Math.min(approach(a), station(dt)), smoke, time)
      b.update(dt, approach(b), smoke, time)
      smoke.update(dt)

      const bHeld = owner === a || (owner !== b && !bMayGo())
      sigA.set(owner === b)
      sigB.set(bHeld)
      const waiting = (owner === a && b.ahead < REQUEST + STOP + 2) || (owner === b && a.ahead < REQUEST + STOP + 2)
      bucks.forEach((f) => f(owner !== null || waiting, time))
    },
    smoke,
    debug: () => ({ owner: owner === a ? 'A' : owner === b ? 'B' : null, a: { ahead: a.ahead, v: a.v, len: a.len, L: trackA.length }, b: { ahead: b.ahead, v: b.v, len: b.len, L: trackB.length } }),
  }
}
