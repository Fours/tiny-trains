import * as THREE from 'three'
import { at, box, cyl, grp, mat, mesh, mod, tex, TAU, rr, turfMat } from './util.ts'

// ---------- layout ----------
// Two circular loops that meet at right angles. They intersect twice: the
// front intersection is a level "diamond" crossing with signals, the back one
// is grade separated (track B climbs an embankment and bridges over track A).

export const BOARD = { w: 48, d: 35 }
export const RAIL_Y = 0.36 // rail-top height above the track base
const GAUGE = 1.1
const BRIDGE_H = 3.6
const RAMP = (97 * Math.PI) / 180
const PLATEAU = 0.1
export const BRIDGE_HALF = (25 * Math.PI) / 180

const angDiff = (a: number, b: number) => {
  const d = mod(a - b + Math.PI, TAU) - Math.PI
  return d
}

export class Track {
  readonly length: number
  /** arc position of the level crossing */
  crossS = 0
  bridgeAngle: number | null = null
  readonly cx: number
  readonly cz: number
  readonly r: number

  constructor(cx: number, cz: number, r: number) {
    this.cx = cx
    this.cz = cz
    this.r = r
    this.length = TAU * r
  }

  angle(s: number) {
    return s / this.r
  }

  heightAtAngle(a: number) {
    if (this.bridgeAngle === null) return 0
    const u = Math.abs(angDiff(a, this.bridgeAngle)) / RAMP
    if (u >= 1) return 0
    if (u <= PLATEAU) return BRIDGE_H
    return BRIDGE_H * 0.5 * (1 + Math.cos((Math.PI * (u - PLATEAU)) / (1 - PLATEAU)))
  }

  pos(s: number, out = new THREE.Vector3()) {
    const a = this.angle(s)
    return out.set(this.cx + this.r * Math.cos(a), this.heightAtAngle(a), this.cz + this.r * Math.sin(a))
  }

  /** horizontal distance from the track centre line */
  dist(x: number, z: number) {
    return Math.abs(Math.hypot(x - this.cx, z - this.cz) - this.r)
  }

  heightAtPoint(x: number, z: number) {
    return this.heightAtAngle(Math.atan2(z - this.cz, x - this.cx))
  }
}

export const trackA = new Track(-7.2, 0, 12)
export const trackB = new Track(8.42, 0, 10)

// intersection points of the two circles
const ix = 2.02
const iz = Math.sqrt(trackA.r ** 2 - (ix - trackA.cx) ** 2)
export const CROSSING = new THREE.Vector3(ix, 0, iz)
export const UNDERPASS = new THREE.Vector3(ix, 0, -iz)
trackA.crossS = mod(Math.atan2(iz, ix - trackA.cx), TAU) * trackA.r
trackB.crossS = mod(Math.atan2(iz, ix - trackB.cx), TAU) * trackB.r
trackB.bridgeAngle = Math.atan2(-iz, ix - trackB.cx)

const EMB_SLOPE = 0.75
const EMB_TOP = 1.35

/** Is (x,z) clear of rails, ballast and the embankment by `margin`? */
export function clearOfTracks(x: number, z: number, margin = 0) {
  if (trackA.dist(x, z) < 1.35 + margin) return false
  const h = trackB.heightAtPoint(x, z)
  if (trackB.dist(x, z) < 1.35 + h * EMB_SLOPE + (h > 0.05 ? 0.25 : 0) + margin) return false
  return true
}

// ---------- swept geometry ----------

export type Profile = [number, number][]

/** Sweep a cross-section polyline (lateral x, up y) along a track. Flat-shaded strips. */
export function sweep(track: Track, s0: number, s1: number, step: number, profile: (s: number) => Profile, closed = false) {
  const n = Math.max(2, Math.ceil((s1 - s0) / step))
  const pos: number[] = []
  const uv: number[] = []
  const p = new THREE.Vector3()
  const rings: THREE.Vector3[][] = []
  const lens: number[][] = []
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n
    track.pos(s, p)
    const a = track.angle(s)
    const lx = Math.cos(a)
    const lz = Math.sin(a) // lateral = radial outward
    const prof = profile(s)
    const ring: THREE.Vector3[] = []
    const ll: number[] = []
    let acc = 0
    prof.forEach(([x, y], k) => {
      if (k > 0) acc += Math.hypot(x - prof[k - 1][0], y - prof[k - 1][1])
      ll.push(acc)
      ring.push(new THREE.Vector3(p.x + lx * x, p.y + y, p.z + lz * x))
    })
    rings.push(ring)
    lens.push(ll)
  }
  const m = rings[0].length
  for (let i = 0; i < n; i++) {
    const v0 = s0 + ((s1 - s0) * i) / n
    const v1 = s0 + ((s1 - s0) * (i + 1)) / n
    for (let k = 0; k < (closed ? m : m - 1); k++) {
      const k2 = (k + 1) % m
      const a = rings[i][k]
      const b = rings[i][k2]
      const c = rings[i + 1][k2]
      const d = rings[i + 1][k]
      const ua = lens[i][k]
      const ub = k2 === 0 ? lens[i][k] + 0.2 : lens[i][k2]
      // winding chosen so that a left-to-right profile faces up
      pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z)
      uv.push(ua, v0, ua, v1, ub, v0, ub, v0, ua, v1, ub, v1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

export const rect = (x: number, y: number, w: number, h: number): Profile => [
  [x - w / 2, y],
  [x - w / 2, y + h],
  [x + w / 2, y + h],
  [x + w / 2, y],
]

// ---------- build ----------

export function buildTracks(root: THREE.Group) {
  const ballastMat = mat(0x9c8f84, { rough: 1, map: tex.gravel(0.6, 0.6) })
  const railMat = mat(0xc4cbd3, { rough: 0.42, metal: 0.75, env: 0.7 })
  const sleeperMat = mat(0x7a4d2e, { rough: 0.85, map: tex.wood(1, 0.3) })
  const grassMat = turfMat()
  const stoneMat = mat(0xb9ad9f, { rough: 0.95, map: tex.bricks(2, 2) })
  const girderMat = mat(0xb5442e, { rough: 0.45, clearcoat: 0.5 })
  const plankMat = mat(0x9b6b43, { rough: 0.85, map: tex.planks(1, 4) })

  const sleeperGeo = box(1.72, 0.14, 0.3, sleeperMat, 0.04).geometry
  const dummy = new THREE.Object3D()
  const p = new THREE.Vector3()
  const p2 = new THREE.Vector3()

  for (const t of [trackA, trackB]) {
    const L = t.length
    const onBridge = (s: number) => t.bridgeAngle !== null && Math.abs(angDiff(t.angle(s), t.bridgeAngle)) < BRIDGE_HALF

    // ballast (skipped on the bridge deck)
    const ballastProfile = (): Profile => [
      [-1.22, 0],
      [-0.95, 0.16],
      [0.95, 0.16],
      [1.22, 0],
    ]
    if (t.bridgeAngle === null) {
      root.add(mesh(sweep(t, 0, L, 0.3, ballastProfile), ballastMat))
    } else {
      const sb = mod(t.bridgeAngle, TAU) * t.r
      const half = BRIDGE_HALF * t.r
      const ramp = RAMP * t.r
      root.add(mesh(sweep(t, sb + half, sb - half + L, 0.3, ballastProfile), ballastMat))

      // grassy embankment either side of the bridge
      const emb = (s: number): Profile => {
        const h = t.pos(s, p).y
        const w = EMB_TOP
        return [
          [-w - h * EMB_SLOPE, -h - 0.02],
          [-w, 0.02],
          [w, 0.02],
          [w + h * EMB_SLOPE, -h - 0.02],
        ]
      }
      root.add(mesh(sweep(t, sb + half, sb + ramp, 0.3, emb), grassMat))
      root.add(mesh(sweep(t, sb - ramp, sb - half, 0.3, emb), grassMat))

      // bridge deck, girders and handrail posts
      root.add(mesh(sweep(t, sb - half - 0.3, sb + half + 0.3, 0.3, () => rect(0, -0.34, 2.9, 0.36), true), plankMat))
      for (const side of [-1, 1]) {
        root.add(mesh(sweep(t, sb - half - 0.3, sb + half + 0.3, 0.3, () => rect(side * 1.48, -0.5, 0.16, 0.3), true), girderMat))
        root.add(mesh(sweep(t, sb - half - 0.3, sb + half + 0.3, 0.3, () => rect(side * 1.48, 0.62, 0.2, 0.16), true), girderMat))
        const posts = 13
        for (let i = 0; i <= posts; i++) {
          const s = sb - half - 0.2 + ((2 * half + 0.4) * i) / posts
          t.pos(s, p)
          const a = t.angle(s)
          const post = box(0.14, 0.95, 0.14, girderMat, 0.03)
          post.position.set(p.x + Math.cos(a) * side * 1.48, p.y + 0.2, p.z + Math.sin(a) * side * 1.48)
          post.rotation.y = -a
          root.add(post)
          if (i < posts) {
            // cross bracing
            const s2 = s + (2 * half + 0.4) / posts
            t.pos(s2, p2)
            const a2 = t.angle(s2)
            const x1 = p.x + Math.cos(a) * side * 1.48
            const z1 = p.z + Math.sin(a) * side * 1.48
            const x2 = p2.x + Math.cos(a2) * side * 1.48
            const z2 = p2.z + Math.sin(a2) * side * 1.48
            const len = Math.hypot(x2 - x1, z2 - z1)
            for (const d of [-1, 1]) {
              const brace = box(0.07, 0.07, Math.hypot(len, 0.8), girderMat, 0.02)
              brace.position.set((x1 + x2) / 2, (p.y + p2.y) / 2 + 0.2, (z1 + z2) / 2)
              brace.rotation.order = 'YXZ'
              brace.rotation.y = Math.atan2(x2 - x1, z2 - z1)
              brace.rotation.x = d * Math.atan2(0.8, len)
              root.add(brace)
            }
          }
        }
      }
      // stone piers and abutments
      for (const [off, w] of [
        [-half - 0.1, 3.9],
        [-2.1, 3.1],
        [2.1, 3.1],
        [half + 0.1, 3.9],
      ]) {
        const s = sb + off
        t.pos(s, p)
        const pier = grp(
          at(box(w, p.y - 0.3, 0.9, stoneMat, 0.12), 0, (p.y - 0.3) / 2, 0),
          at(box(w + 0.3, 0.26, 1.15, stoneMat, 0.1), 0, p.y - 0.42, 0),
          at(box(w + 0.3, 0.3, 1.15, stoneMat, 0.1), 0, 0.15, 0),
        )
        pier.position.set(p.x, 0, p.z)
        pier.rotation.y = -t.angle(s)
        root.add(pier)
      }
    }

    // rails
    for (const side of [-1, 1]) {
      root.add(mesh(sweep(t, 0, L, 0.22, () => rect((side * GAUGE) / 2, 0.22, 0.1, RAIL_Y - 0.22), true), railMat))
    }

    // sleepers
    const count = Math.floor(L / 0.62)
    const inst = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count)
    inst.castShadow = true
    inst.receiveShadow = true
    for (let i = 0; i < count; i++) {
      const s = (i / count) * L
      t.pos(s, p)
      t.pos(s + 0.2, p2)
      dummy.position.set(p.x, p.y + (onBridge(s) ? 0.1 : 0.19), p.z)
      dummy.lookAt(p2.x, p2.y + (onBridge(s) ? 0.1 : 0.19), p2.z)
      dummy.rotateY(rr(-0.05, 0.05))
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    root.add(inst)
  }

  // level crossing: timber deck between the rails so the diamond reads clearly
  const deck = grp()
  for (const rot of [trackA.angle(trackA.crossS), trackB.angle(trackB.crossS)]) {
    const g = grp(at(box(0.78, 0.1, 2.9, plankMat, 0.03), 0, 0.27, 0))
    g.rotation.y = -rot
    deck.add(g)
  }
  deck.position.copy(CROSSING)
  root.add(deck)

  // buffer of gravel under the diamond
  const pad = cyl(2.5, 2.8, 0.17, ballastMat, 28)
  pad.position.set(CROSSING.x, 0.085, CROSSING.z)
  root.add(pad)
}

export { GAUGE, angDiff }

// ---------- placement bookkeeping ----------

const blockers: { x: number; z: number; r: number }[] = []
export function block(x: number, z: number, r: number) {
  blockers.push({ x, z, r })
}

/** Rounded-rectangle test for the board, inset by `m`. */
export function onBoard(x: number, z: number, m = 0.6) {
  const hw = BOARD.w / 2 - m
  const hd = BOARD.d / 2 - m
  const R = 3.2
  const dx = Math.max(0, Math.abs(x) - (hw - R))
  const dz = Math.max(0, Math.abs(z) - (hd - R))
  return Math.abs(x) < hw && Math.abs(z) < hd && dx * dx + dz * dz < R * R
}

export function free(x: number, z: number, r: number) {
  if (!onBoard(x, z, r * 0.5 + 0.5)) return false
  if (!clearOfTracks(x, z, r * 0.45)) return false
  for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r + r) return false
  return true
}
