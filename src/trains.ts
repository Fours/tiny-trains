import * as THREE from 'three'
import { CROSSING, RAIL_Y, Track, trackA, trackB } from './tracks.ts'
import { at, bake, blob, lumpy, box, cyl, dyn, grp, mat, mod, paint, rand, rr, sph } from './util.ts'
import { CRANK, MAIN_ROD, boxCar, caboose, coach, flickerFire, locomotive, logCar, tankCar, tender } from './rollingstock.ts'
import type { Car } from './rollingstock.ts'

// ---------- smoke ----------

interface Puff {
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
  /** 1 is clean white steam; lower is sootier */
  shade: number
}

export class Smoke {
  readonly mesh: THREE.InstancedMesh
  private puffs: Puff[] = []
  private dummy = new THREE.Object3D()
  private tint = new THREE.Color()
  private max: number

  constructor(max = 420) {
    this.max = max
    const g = lumpy(3, 0.16, 77)
    const m = new THREE.MeshStandardMaterial({ color: 0xece7e0, roughness: 1, envMapIntensity: 0.3 })
    this.mesh = new THREE.InstancedMesh(g, m, max)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.userData.dynamic = true
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life = 2.4, shade = 1) {
    if (this.puffs.length >= this.max) this.puffs.shift()
    this.puffs.push({ pos: pos.clone(), vel: vel.clone(), age: 0, life: life * rr(0.8, 1.2), size: size * rr(0.75, 1.25), shade })
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
      // soot thins out as the puff rises
      this.mesh.setColorAt(i, this.tint.setScalar(Math.min(1, p.shade + (1 - p.shade) * u * 1.4)))
    })
    this.mesh.count = this.puffs.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
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
  private cockTimer = 0
  private stoveTimer = 0
  private whistleT = 0
  private jet = 0
  private tmp = new THREE.Vector3()
  private dir = new THREE.Vector3()
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

  /** Blow the whistle: a plume of white steam for `secs`. */
  whistle(secs = 0.9) {
    this.whistleT = secs
  }

  update(dt: number, target: number, smoke: Smoke, time: number) {
    const dv = target - this.v
    const pulling = dv > 0.05
    this.v += Math.sign(dv) * Math.min(Math.abs(dv), (dv > 0 ? ACCEL : 7) * dt)
    this.s = mod(this.s + this.v * dt, this.track.length)
    this.place(time)

    // chuff: puffs come faster when moving
    this.puffTimer -= dt
    if (this.puffTimer <= 0) {
      const moving = this.v > 0.3
      this.puffTimer = moving ? 0.16 + 0.3 / (1 + this.v) : 0.7
      const loco = this.cars[0].g
      this.chimney.copy(this.cars[0].stack!)
      loco.localToWorld(this.chimney)
      // working hard from a stand throws darker smoke
      const shade = pulling && this.v < this.vmax * 0.7 ? 0.62 : 0.94
      for (let k = 0; k < (moving ? 2 : 1); k++) {
        this.chimney.x += rr(-0.12, 0.12)
        this.chimney.z += rr(-0.12, 0.12)
        smoke.emit(this.chimney, new THREE.Vector3(rr(-0.5, 0.5), rr(1.8, 3.2), rr(-0.5, 0.5)), (moving ? 0.5 : 0.34) * rr(0.6, 1.25), moving ? 2.6 : 3.0, shade)
      }
    }

    const loco = this.cars[0]
    // cylinder drain cocks hiss steam sideways while pulling away
    if (pulling && this.v < 2.4 && loco.cocks && (this.cockTimer -= dt) <= 0) {
      this.cockTimer = 0.07
      for (const c of loco.cocks) {
        loco.g.localToWorld(this.tmp.copy(c))
        this.dir.set(Math.sign(c.x), -0.12, 0.25).transformDirection(loco.g.matrixWorld)
        smoke.emit(this.tmp, this.dir.multiplyScalar(rr(1.6, 2.6)), 0.17, 0.75)
      }
    }
    // whistle
    if (this.whistleT > 0 && loco.whistle) {
      this.whistleT -= dt
      if ((this.jet -= dt) <= 0) {
        this.jet = 0.04
        loco.g.localToWorld(this.tmp.copy(loco.whistle))
        smoke.emit(this.tmp, this.dir.set(rr(-0.4, 0.4), rr(3.6, 5), rr(-0.4, 0.4)), 0.15, 0.55)
      }
    }
    // a wisp from the caboose stove
    if ((this.stoveTimer -= dt) <= 0) {
      this.stoveTimer = rr(0.5, 0.9)
      for (const car of this.cars) {
        if (!car.stove) continue
        car.g.localToWorld(this.tmp.copy(car.stove))
        smoke.emit(this.tmp, this.dir.set(rr(-0.1, 0.1), rr(0.7, 1.1), rr(-0.1, 0.1)), 0.13, 1.8, 0.8)
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
        rod.o.position.y = rod.r + CRANK * Math.cos(phi)
        rod.o.position.z = rod.z + CRANK * Math.sin(phi)
      }
      for (const gr of car.gear) {
        // crank pin position, then the crosshead that keeps the main rod a fixed length
        const phi = sc / gr.r
        const dy = CRANK * Math.cos(phi)
        const pinZ = gr.z + CRANK * Math.sin(phi)
        const crossZ = pinZ + Math.sqrt(MAIN_ROD * MAIN_ROD - dy * dy)
        gr.cross.position.z = crossZ
        gr.rod.position.z = crossZ
        gr.rod.rotation.x = Math.atan2(dy, crossZ - pinZ)
      }
      car.anim?.(time, this.v)
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

  const a = new Train(trackA, [locomotive(red, navy, '7'), tender(red, navy, 'MAPLE HOLLOW'), coach(green, navy), coach(navy, red, true), caboose(red, navy)], 30, 6.6, root)
  const b = new Train(trackB, [locomotive(teal, orange, '12'), tender(teal, orange, 'PINE VALLEY'), logCar(orange), tankCar(paint(0xf2ede2), orange), boxCar(yellow, plum), caboose(plum, orange)], 45, 4.8, root)

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
      // two toots before pulling out
      if (dwell <= 0.9 && dwell + dt > 0.9) a.whistle(0.35)
      if (dwell <= 0.25 && dwell + dt > 0.25) a.whistle(0.5)
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
        // whistle for the crossing once the road is set
        owner?.whistle(0.8)
      }
      a.update(dt, Math.min(approach(a), station(dt)), smoke, time)
      b.update(dt, approach(b), smoke, time)
      smoke.update(dt)
      flickerFire(time)

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
