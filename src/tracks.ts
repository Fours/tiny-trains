import * as THREE from 'three'
import { at, box, cyl, grp, mat, mesh, mod, tex, rr, turfMat } from './util.ts'

// ---------- layout ----------
// Two loops built from straights joined by curves of different radii. They
// cross twice along track B's long western straight: the front crossing is a
// level "diamond" with signals, the back one is grade separated (B climbs an
// embankment and bridges over A).

export const BOARD = { w: 58, d: 45 }
export const RAIL_Y = 0.36 // rail-top height above the track base
const GAUGE = 1.1
const BRIDGE_H = 3.6
const RAMP = 17.5 // length of each approach ramp
const PLATEAU = 0.1
export const BRIDGE_HALF = 4.4 // half-length of the bridge deck

export const CROSSING = new THREE.Vector3(0, 0, 13)
export const UNDERPASS = new THREE.Vector3(0, 0, -12)

export interface Frame {
  x: number
  y: number
  z: number
  /** unit heading */
  tx: number
  tz: number
  /** unit normal pointing out of the loop */
  nx: number
  nz: number
  /** rotation.y that points an object's +z along the heading (and its +x outward) */
  yaw: number
}

const DS = 0.1

export class Track {
  readonly length: number
  /** arc position of the level crossing */
  crossS = 0
  /** arc position of the bridge summit, if this track has one */
  bridgeS: number | null = null
  private xs: Float32Array
  private zs: Float32Array
  private n: number

  /** `corners` are [x, z, radius] in travel order; each corner is rounded with a tangent arc. */
  constructor(corners: [number, number, number][]) {
    // 1. straights + fillet arcs as a dense polyline
    let pts: [number, number][] = []
    const m = corners.length
    for (let i = 0; i < m; i++) {
      const [px, pz] = corners[(i + m - 1) % m]
      const [cx, cz, r] = corners[i]
      const [qx, qz] = corners[(i + 1) % m]
      const l1 = Math.hypot(cx - px, cz - pz)
      const l2 = Math.hypot(qx - cx, qz - cz)
      const d1x = (cx - px) / l1
      const d1z = (cz - pz) / l1
      const d2x = (qx - cx) / l2
      const d2z = (qz - cz) / l2
      const turn = Math.sign(d1x * d2z - d1z * d2x)
      const theta = Math.acos(Math.min(1, Math.max(-1, d1x * d2x + d1z * d2z)))
      const t = r * Math.tan(theta / 2)
      const sx = cx - d1x * t
      const sz = cz - d1z * t
      const ox = sx - d1z * r * turn
      const oz = sz + d1x * r * turn
      const a0 = Math.atan2(sz - oz, sx - ox)
      const steps = Math.max(2, Math.ceil((r * theta) / 0.05))
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (turn * theta * k) / steps
        pts.push([ox + Math.cos(a) * r, oz + Math.sin(a) * r])
      }
    }
    // 2. uniform resample, soften the straight-to-curve joints, resample again
    pts = Track.resample(pts)
    for (let it = 0; it < 50; it++) {
      const next: [number, number][] = pts.map((_, i) => {
        const a = pts[(i + pts.length - 1) % pts.length]
        const b = pts[i]
        const c = pts[(i + 1) % pts.length]
        return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]
      })
      pts = next
    }
    pts = Track.resample(pts)
    this.n = pts.length
    this.xs = new Float32Array(pts.map((p) => p[0]))
    this.zs = new Float32Array(pts.map((p) => p[1]))
    let len = 0
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n
      len += Math.hypot(this.xs[j] - this.xs[i], this.zs[j] - this.zs[i])
    }
    this.length = len
  }

  private static resample(pts: [number, number][]): [number, number][] {
    const cum = [0]
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length]
      cum.push(cum[i] + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]))
    }
    const total = cum[pts.length]
    const n = Math.round(total / DS)
    const out: [number, number][] = []
    let k = 0
    for (let i = 0; i < n; i++) {
      const s = (i / n) * total
      while (cum[k + 1] < s) k++
      const seg = cum[k + 1] - cum[k]
      const u = seg > 1e-9 ? (s - cum[k]) / seg : 0
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
    }
    return out
  }

  private xz(s: number): [number, number] {
    const f = (mod(s, this.length) / this.length) * this.n
    const i = Math.floor(f) % this.n
    const j = (i + 1) % this.n
    const u = f - Math.floor(f)
    return [this.xs[i] + (this.xs[j] - this.xs[i]) * u, this.zs[i] + (this.zs[j] - this.zs[i]) * u]
  }

  height(s: number) {
    if (this.bridgeS === null) return 0
    const L = this.length
    const u = Math.abs(mod(s - this.bridgeS + L / 2, L) - L / 2) / RAMP
    if (u >= 1) return 0
    if (u <= PLATEAU) return BRIDGE_H
    return BRIDGE_H * 0.5 * (1 + Math.cos((Math.PI * (u - PLATEAU)) / (1 - PLATEAU)))
  }

  pos(s: number, out = new THREE.Vector3()) {
    const [x, z] = this.xz(s)
    return out.set(x, this.height(s), z)
  }

  frame(s: number): Frame {
    const [x, z] = this.xz(s)
    const [ax, az] = this.xz(s - 0.2)
    const [bx, bz] = this.xz(s + 0.2)
    const l = Math.hypot(bx - ax, bz - az)
    const tx = (bx - ax) / l
    const tz = (bz - az) / l
    return { x, y: this.height(s), z, tx, tz, nx: tz, nz: -tx, yaw: Math.atan2(tx, tz) }
  }

  /** closest point on the centre line */
  nearest(x: number, z: number) {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < this.n; i += 4) {
      const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    for (let k = -4; k <= 4; k++) {
      const i = (best + k + this.n) % this.n
      const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return { d: Math.sqrt(bd), s: (best / this.n) * this.length }
  }

  /** centre line as [x, z] points, for painting */
  outline(step = 5) {
    const out: [number, number][] = []
    for (let i = 0; i < this.n; i += step) out.push([this.xs[i], this.zs[i]])
    return out
  }
}

// travel order; the third number is the corner radius
export const trackA = new Track([
  [7, 13, 5],
  [-25.5, 13, 6],
  [-25.5, -5, 5],
  [-13.5, -5, 6],
  [-8, -12, 5],
  [7, -12, 5],
])
export const trackB = new Track([
  [0, 19.5, 5],
  [0, -18.5, 5],
  [14, -18.5, 5],
  [25.5, -9.5, 6],
  [25.5, 3, 5],
  [20, 10, 5],
  [20, 19.5, 4.5],
])
trackA.crossS = trackA.nearest(CROSSING.x, CROSSING.z).s
trackB.crossS = trackB.nearest(CROSSING.x, CROSSING.z).s
trackB.bridgeS = trackB.nearest(UNDERPASS.x, UNDERPASS.z).s

const EMB_SLOPE = 0.75
const EMB_TOP = 1.35

/** Is (x,z) clear of rails, ballast and the embankment by `margin`? */
export function clearOfTracks(x: number, z: number, margin = 0) {
  if (trackA.nearest(x, z).d < 1.35 + margin) return false
  const nb = trackB.nearest(x, z)
  const h = trackB.height(nb.s)
  if (nb.d < 1.35 + h * EMB_SLOPE + (h > 0.05 ? 0.25 : 0) + margin) return false
  return true
}

// ---------- swept geometry ----------

export type Profile = [number, number][]

/** Sweep a cross-section polyline (outward x, up y) along a track. Flat-shaded strips. */
export function sweep(track: Track, s0: number, s1: number, step: number, profile: (s: number) => Profile, closed = false) {
  const n = Math.max(2, Math.ceil((s1 - s0) / step))
  const pos: number[] = []
  const uv: number[] = []
  const rings: THREE.Vector3[][] = []
  const lens: number[][] = []
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n
    const f = track.frame(s)
    const prof = profile(s)
    const ring: THREE.Vector3[] = []
    const ll: number[] = []
    let acc = 0
    prof.forEach(([x, y], k) => {
      if (k > 0) acc += Math.hypot(x - prof[k - 1][0], y - prof[k - 1][1])
      ll.push(acc)
      ring.push(new THREE.Vector3(f.x + f.nx * x, f.y + y, f.z + f.nz * x))
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
      // winding chosen so that an inside-to-outside profile faces up
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
    const onBridge = (s: number) => t.bridgeS !== null && Math.abs(mod(s - t.bridgeS + L / 2, L) - L / 2) < BRIDGE_HALF

    // ballast (skipped on the bridge deck)
    const ballastProfile = (): Profile => [
      [-1.22, 0],
      [-0.95, 0.16],
      [0.95, 0.16],
      [1.22, 0],
    ]
    if (t.bridgeS === null) {
      root.add(mesh(sweep(t, 0, L, 0.3, ballastProfile), ballastMat))
    } else {
      const sb = t.bridgeS
      const half = BRIDGE_HALF
      const ramp = RAMP
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
          const f = t.frame(s)
          const x1 = f.x + f.nx * side * 1.48
          const z1 = f.z + f.nz * side * 1.48
          const post = box(0.14, 0.95, 0.14, girderMat, 0.03)
          post.position.set(x1, f.y + 0.2, z1)
          post.rotation.y = f.yaw
          root.add(post)
          if (i < posts) {
            // cross bracing
            const f2 = t.frame(s + (2 * half + 0.4) / posts)
            p.set(0, f.y, 0)
            p2.set(0, f2.y, 0)
            const x2 = f2.x + f2.nx * side * 1.48
            const z2 = f2.z + f2.nz * side * 1.48
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
        pier.rotation.y = t.frame(s).yaw
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
  for (const rot of [trackA.frame(trackA.crossS).yaw, trackB.frame(trackB.crossS).yaw]) {
    const g = grp(at(box(0.78, 0.1, 2.9, plankMat, 0.03), 0, 0.27, 0))
    g.rotation.y = rot
    deck.add(g)
  }
  deck.position.copy(CROSSING)
  root.add(deck)

  // buffer of gravel under the diamond
  const pad = cyl(2.5, 2.8, 0.17, ballastMat, 28)
  pad.position.set(CROSSING.x, 0.085, CROSSING.z)
  root.add(pad)
}

export { GAUGE }

// ---------- placement bookkeeping ----------

const blockers: { x: number; z: number; r: number }[] = []
export function block(x: number, z: number, r: number) {
  blockers.push({ x, z, r })
}

/** Rounded-rectangle test for the board, inset by `m`. */
export function onBoard(x: number, z: number, m = 0.6) {
  const hw = BOARD.w / 2 - m
  const hd = BOARD.d / 2 - m
  const R = 3.6
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
