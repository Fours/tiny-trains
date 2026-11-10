import * as THREE from 'three'
import { groundY, POND } from './nature.ts'
import { at, blob, cone, cyl, frozen, grp, mat, rand, rr, sph, tick } from './util.ts'

const eyeMat = mat(0x1d1d24, { rough: 0.08, env: 1.5 })
const glint = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 })
const pink = mat(0xf7a9b4, { rough: 0.6 })
const orange = mat(0xf59a2c, { rough: 0.5 })
const fur = (c: number) => mat(c, { rough: 0.9 })

/** Big glossy cartoon eyes. */
function eyes(g: THREE.Object3D, dx: number, y: number, z: number, r: number) {
  for (const s of [-1, 1]) {
    g.add(at(sph(r, eyeMat, 12, 10), s * dx, y, z))
    g.add(at(sph(r * 0.36, glint, 6, 5), s * dx + r * 0.3, y + r * 0.4, z + r * 0.72))
  }
}

function legs(g: THREE.Object3D, dx: number, dz: number, h: number, r: number, m: THREE.Material, hoof?: THREE.Material) {
  for (const x of [-dx, dx])
    for (const z of [-dz, dz]) {
      g.add(at(cyl(r, r * 0.9, h, m, 10), x, h / 2, z))
      if (hoof) g.add(at(cyl(r * 1.05, r * 1.1, h * 0.22, hoof, 10), x, h * 0.11, z))
    }
}

function cow(spot = 0x3a2f2c) {
  const w = fur(0xfffaf0)
  const dk = fur(spot)
  const g = grp(at(blob(0.52, 0.5, 0.82, w), 0, 0.98, 0), at(blob(0.2, 0.14, 0.2, pink), 0, 0.56, -0.32))
  legs(g, 0.3, 0.48, 0.62, 0.115, w, dk)
  for (const [x, y, z, r] of [
    [0.36, 1.18, 0.2, 0.3],
    [-0.38, 1.1, -0.3, 0.28],
    [0.1, 1.4, -0.42, 0.26],
    [-0.2, 1.36, 0.42, 0.2],
  ])
    g.add(at(blob(r, r * 0.8, r * 1.1, dk), x * 0.86, y - 0.06, z))
  const head = grp(at(blob(0.33, 0.32, 0.36, w), 0, 0, 0), at(blob(0.27, 0.2, 0.2, pink), 0, -0.12, 0.28), at(blob(0.2, 0.2, 0.2, dk), 0.2, 0.1, 0.12))
  for (const s of [-1, 1]) {
    head.add(at(blob(0.16, 0.09, 0.07, s > 0 ? dk : w), s * 0.4, 0.14, -0.02, 0, 0, s * 0.4))
    head.add(at(cone(0.06, 0.22, mat(0xf3e6c8, { rough: 0.5 }), 8), s * 0.2, 0.36, -0.04, 0, 0, -s * 0.5))
    head.add(at(sph(0.03, eyeMat, 6, 5), s * 0.1, -0.12, 0.47))
  }
  eyes(head, 0.19, 0.08, 0.3, 0.075)
  head.add(at(sph(0.1, mat(0xf1b941, { metal: 0.8, rough: 0.3 }), 10, 8), 0, -0.36, 0.1))
  frozen(head).position.set(0, 1.3, 0.86)
  const tail = frozen(grp(at(cyl(0.03, 0.03, 0.6, w, 6), 0, -0.3, 0), at(blob(0.08, 0.12, 0.08, dk), 0, -0.64, 0)))
  tail.position.set(0, 1.25, -0.8)
  g.add(head, tail)
  const ph = rand() * 10
  tick.push((_, t) => {
    const graze = Math.sin(t * 0.35 + ph)
    head.rotation.x = graze > 0.2 ? 0.75 + Math.sin(t * 5 + ph) * 0.06 : 0.1 + Math.sin(t * 0.9 + ph) * 0.08
    head.position.y = graze > 0.2 ? 1.02 : 1.3
    head.rotation.y = Math.sin(t * 0.5 + ph) * 0.3
    tail.rotation.z = Math.sin(t * 2.4 + ph) * 0.5
    tail.rotation.x = 0.25
  })
  return frozen(g)
}

function sheep(face = 0x3d3838, wool = 0xfffdf5) {
  const w = fur(wool)
  const dk = fur(face)
  const g = grp()
  const pts: [number, number, number, number][] = [
    [0, 0.72, 0, 0.46],
    [0.22, 0.8, 0.28, 0.3],
    [-0.22, 0.8, 0.28, 0.3],
    [0.24, 0.82, -0.26, 0.31],
    [-0.24, 0.82, -0.26, 0.31],
    [0, 0.98, 0.05, 0.32],
    [0, 0.72, -0.45, 0.28],
    [0, 0.94, 0.38, 0.24],
    [0.3, 0.62, 0, 0.27],
    [-0.3, 0.62, 0, 0.27],
  ]
  for (const [x, y, z, r] of pts) g.add(at(sph(r, w, 12, 10), x, y, z))
  legs(g, 0.2, 0.26, 0.42, 0.07, dk)
  const head = grp(at(blob(0.2, 0.22, 0.24, dk), 0, 0, 0), at(sph(0.17, w, 10, 8), 0, 0.16, -0.08))
  for (const s of [-1, 1]) head.add(at(blob(0.12, 0.05, 0.07, dk), s * 0.24, 0.04, -0.04, 0, 0, -s * 0.5))
  eyes(head, 0.11, 0.04, 0.18, 0.055)
  frozen(head).position.set(0, 0.86, 0.56)
  g.add(head)
  const ph = rand() * 10
  tick.push((_, t) => {
    const hop = Math.max(0, Math.sin(t * 1.1 + ph) - 0.8) * 5
    g.position.y = g.userData.y0 + Math.abs(Math.sin(t * 7)) * hop * 0.22
    head.rotation.x = 0.15 + Math.sin(t * 0.8 + ph) * 0.2
    head.rotation.z = Math.sin(t * 0.6 + ph * 2) * 0.2
  })
  return frozen(g)
}

function pig() {
  const p = mat(0xf7b0b8, { rough: 0.7 })
  const dkp = mat(0xe58a98, { rough: 0.6 })
  const g = grp(at(blob(0.4, 0.38, 0.58, p), 0, 0.52, 0))
  legs(g, 0.22, 0.32, 0.26, 0.085, p, dkp)
  const head = grp(at(blob(0.3, 0.29, 0.3, p), 0, 0, 0), at(cyl(0.13, 0.14, 0.14, dkp, 12), 0, -0.04, 0.3, Math.PI / 2))
  for (const s of [-1, 1]) {
    head.add(at(cone(0.1, 0.18, dkp, 4), s * 0.19, 0.27, 0.02, 0.3, 0, -s * 0.3))
    head.add(at(sph(0.025, eyeMat, 6, 5), s * 0.05, -0.04, 0.38))
  }
  eyes(head, 0.14, 0.08, 0.24, 0.05)
  frozen(head).position.set(0, 0.62, 0.52)
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12, 5), dkp)
  tail.castShadow = true
  g.add(head, at(tail, 0, 0.66, -0.58, 0, Math.PI / 2, 0))
  const ph = rand() * 10
  tick.push((_, t) => {
    g.rotation.z = Math.sin(t * 2.2 + ph) * 0.05
    head.rotation.x = 0.3 + Math.sin(t * 3.1 + ph) * 0.14
    head.rotation.y = Math.sin(t * 0.7 + ph) * 0.4
  })
  return frozen(g)
}

function bird(body: number, belly: number, s = 1) {
  const b = mat(body, { rough: 0.75 })
  const g = grp(at(blob(0.2 * s, 0.2 * s, 0.26 * s, b), 0, 0.28 * s, 0), at(blob(0.14 * s, 0.13 * s, 0.18 * s, mat(belly, { rough: 0.8 })), 0, 0.24 * s, 0.08 * s), at(blob(0.08 * s, 0.14 * s, 0.1 * s, b), 0, 0.42 * s, -0.22 * s, -0.6, 0, 0))
  for (const x of [-0.07, 0.07]) g.add(at(cyl(0.015 * s, 0.015 * s, 0.14 * s, orange, 5), x * s, 0.07 * s, 0))
  return g
}

function chicken(cx: number, cz: number, col = 0xfffaf0) {
  const g = bird(col, 0xffffff)
  const head = grp(at(sph(0.12, mat(col, { rough: 0.75 }), 12, 10), 0, 0, 0), at(cone(0.045, 0.12, orange, 6), 0, -0.01, 0.15, Math.PI / 2), at(blob(0.03, 0.07, 0.09, mat(0xe2392f, { rough: 0.5 })), 0, 0.13, 0.01), at(blob(0.03, 0.05, 0.03, mat(0xe2392f, { rough: 0.5 })), 0, -0.1, 0.1))
  eyes(head, 0.085, 0.03, 0.08, 0.03)
  frozen(head).position.set(0, 0.5, 0.17)
  g.add(head)
  const ph = rand() * 10
  const rad = rr(0.5, 1.1)
  const sp = rr(0.25, 0.45) * (rand() < 0.5 ? -1 : 1)
  tick.push((_, t) => {
    const a = t * sp + ph
    g.position.set(cx + Math.cos(a) * rad, Math.abs(Math.sin(t * 9 + ph)) * 0.03, cz + Math.sin(a * 1.3) * rad * 0.7)
    g.rotation.y = Math.atan2(-Math.sin(a) * sp, Math.cos(a * 1.3) * 1.3 * 0.7 * sp)
    const peck = Math.sin(t * 1.7 + ph) > 0.5 ? Math.abs(Math.sin(t * 11)) : 0
    head.rotation.x = peck * 0.9
    head.position.y = 0.5 - peck * 0.16
  })
  return frozen(g)
}

function duck(col: number, s: number, lag: number) {
  const m = mat(col, { rough: 0.7 })
  const g = grp(at(blob(0.24 * s, 0.18 * s, 0.34 * s, m), 0, 0.12 * s, 0), at(blob(0.1 * s, 0.12 * s, 0.12 * s, m), 0, 0.26 * s, -0.3 * s, -0.7, 0, 0), at(sph(0.15 * s, m, 12, 10), 0, 0.42 * s, 0.2 * s), at(blob(0.09 * s, 0.035 * s, 0.11 * s, orange), 0, 0.39 * s, 0.36 * s))
  for (const x of [-1, 1]) g.add(at(blob(0.05 * s, 0.11 * s, 0.2 * s, m), x * 0.22 * s, 0.16 * s, -0.04 * s))
  eyes(g, 0.1 * s, 0.46 * s, 0.3 * s, 0.035 * s)
  tick.push((_, t) => {
    const a = t * 0.32 - lag
    const x = POND.x + Math.cos(a) * (POND.rx - 0.85) + Math.sin(a * 2.3) * 0.15
    const z = POND.z + Math.sin(a) * (POND.rz - 0.75)
    g.position.set(x, 0.075 + Math.sin(t * 2.4 + lag * 9) * 0.015, z)
    g.rotation.y = Math.atan2(-Math.sin(a) * (POND.rx - 0.85), Math.cos(a) * (POND.rz - 0.75))
    g.rotation.z = Math.sin(t * 3 + lag * 5) * 0.06
  })
  return frozen(g)
}

function bunny(cx: number, cz: number, col = 0xf4ead9) {
  const m = fur(col)
  const g = grp(at(blob(0.2, 0.2, 0.27, m), 0, 0.22, 0), at(sph(0.16, m, 12, 10), 0, 0.44, 0.2), at(sph(0.09, fur(0xffffff), 8, 6), 0, 0.24, -0.27), at(sph(0.03, pink, 6, 5), 0, 0.42, 0.36))
  for (const s of [-1, 1]) {
    g.add(at(blob(0.05, 0.2, 0.035, m), s * 0.07, 0.72, 0.16, -0.15, 0, s * 0.18))
    g.add(at(blob(0.025, 0.14, 0.02, pink), s * 0.07, 0.72, 0.185, -0.15, 0, s * 0.18))
    g.add(at(blob(0.07, 0.05, 0.12, m), s * 0.14, 0.06, 0.05))
  }
  eyes(g, 0.11, 0.48, 0.3, 0.035)
  const ph = rand() * 10
  const rad = rr(0.8, 1.5)
  tick.push((_, t) => {
    // travels only while airborne, pauses between hops
    const beat = t * 1.6 + ph
    const k = Math.floor(beat)
    const f = beat - k
    const hop = f < 0.5 ? Math.sin((f / 0.5) * Math.PI) : 0
    const prog = (k + Math.min(1, f / 0.5)) * 0.35
    const x = cx + Math.cos(prog) * rad
    const z = cz + Math.sin(prog) * rad
    g.position.set(x, groundY(x, z) + hop * 0.35, z)
    g.rotation.y = Math.atan2(-Math.sin(prog), Math.cos(prog))
    g.rotation.x = -hop * 0.3
  })
  return frozen(g)
}

function dog(body: number, accent: number, fox = false) {
  const m = fur(body)
  const a = fur(accent)
  const g = grp(at(blob(0.22, 0.24, 0.4, m), 0, 0.42, 0), at(blob(0.16, 0.16, 0.2, a), 0, 0.36, 0.22))
  legs(g, 0.13, 0.24, 0.26, 0.055, m, a)
  const head = grp(at(sph(0.2, m, 12, 10), 0, 0, 0), at(blob(0.11, 0.09, 0.15, a), 0, -0.05, 0.19), at(sph(0.04, eyeMat, 8, 6), 0, -0.02, 0.33))
  for (const s of [-1, 1]) head.add(fox ? at(cone(0.08, 0.2, m, 4), s * 0.12, 0.22, -0.02, 0, 0, -s * 0.2) : at(blob(0.07, 0.14, 0.05, a), s * 0.2, -0.02, -0.02, 0, 0, s * 0.3))
  eyes(head, 0.09, 0.05, 0.16, 0.04)
  frozen(head).position.set(0, 0.68, 0.36)
  const tail = frozen(fox ? grp(at(blob(0.09, 0.09, 0.26, m), 0, 0, -0.22), at(blob(0.07, 0.07, 0.1, fur(0xffffff)), 0, 0, -0.44)) : grp(at(blob(0.045, 0.045, 0.2, a), 0, 0, -0.18)))
  tail.position.set(0, 0.52, -0.36)
  tail.rotation.x = fox ? -0.2 : -0.9
  g.add(head, tail)
  const ph = rand() * 10
  tick.push((_, t) => {
    tail.rotation.y = Math.sin(t * (fox ? 2 : 11) + ph) * (fox ? 0.3 : 0.6)
    head.rotation.z = Math.sin(t * 0.7 + ph) * 0.25
    head.rotation.y = Math.sin(t * 0.45 + ph) * 0.5
  })
  return frozen(g)
}

function deer() {
  const m = fur(0xc98c55)
  const lt = fur(0xf3e3c8)
  const g = grp(at(blob(0.3, 0.32, 0.58, m), 0, 1.0, 0), at(blob(0.2, 0.2, 0.3, lt), 0, 0.88, 0.05), at(sph(0.1, lt, 8, 6), 0, 1.1, -0.56))
  legs(g, 0.17, 0.36, 0.78, 0.055, m, fur(0x4a3528))
  const head = grp(at(cyl(0.11, 0.14, 0.5, m, 10), 0, -0.2, -0.08, 0.35), at(blob(0.16, 0.16, 0.2, m), 0, 0.1, 0.04), at(blob(0.09, 0.08, 0.12, lt), 0, 0.05, 0.2), at(sph(0.035, eyeMat, 6, 5), 0, 0.07, 0.31))
  const horn = mat(0xf3e6c8, { rough: 0.6 })
  for (const s of [-1, 1]) {
    head.add(at(blob(0.09, 0.04, 0.05, m), s * 0.2, 0.18, -0.04, 0, 0, s * 0.5))
    head.add(at(cyl(0.02, 0.025, 0.34, horn, 5), s * 0.1, 0.4, -0.04, 0, 0, -s * 0.3), at(cyl(0.015, 0.02, 0.18, horn, 5), s * 0.19, 0.5, -0.04, 0, 0, -s * 1.0), at(cyl(0.015, 0.02, 0.16, horn, 5), s * 0.1, 0.52, 0.02, 0.7, 0, 0))
  }
  eyes(head, 0.12, 0.13, 0.12, 0.04)
  frozen(head).position.set(0, 1.55, 0.5)
  g.add(head)
  tick.push((_, t) => {
    head.rotation.y = Math.sin(t * 0.4) * 0.8
    head.rotation.x = Math.max(0, Math.sin(t * 0.23)) * 0.3
  })
  return frozen(g)
}

function flyer(root: THREE.Group, col: number, r: number, y: number, sp: number, ph: number, butterfly: boolean, cx = 0, cz = 0) {
  const m = mat(col, { rough: 0.6, side: THREE.DoubleSide })
  const s = butterfly ? 0.16 : 0.3
  const g = grp(butterfly ? at(blob(0.02, 0.02, 0.09, mat(0x2b2b33)), 0, 0, 0) : at(blob(0.11, 0.1, 0.24, m), 0, 0, 0))
  if (!butterfly) g.add(at(cone(0.035, 0.1, orange, 5), 0, 0, 0.27, Math.PI / 2), at(blob(0.07, 0.02, 0.12, m), 0, 0.02, -0.28))
  const wings = [-1, 1].map((sd) => {
    const w = frozen(grp(at(blob(s, 0.012, butterfly ? s * 0.8 : s * 0.5, m), sd * s, 0, 0)))
    g.add(w)
    return { w, sd }
  })
  frozen(g)
  root.add(g)
  tick.push((_, t) => {
    const a = t * sp + ph
    if (butterfly) {
      g.position.set(cx + Math.sin(a) * r + Math.sin(a * 3.1) * 0.4, y + Math.sin(a * 2.3) * 0.35, cz + Math.cos(a * 0.8) * r)
      g.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a * 0.8) * 0.8)
    } else {
      g.position.set(cx + Math.cos(a) * r, y + Math.sin(a * 2) * 0.6, cz + Math.sin(a) * r * 0.72)
      g.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(sp), Math.cos(a) * 0.72 * Math.sign(sp))
      g.rotation.z = -0.3 * Math.sign(sp)
    }
    const flap = Math.sin(t * (butterfly ? 16 : 9) + ph) * (butterfly ? 1.1 : 0.7)
    for (const { w, sd } of wings) w.rotation.z = sd * flap
  })
}

export function buildAnimals(root: THREE.Group) {
  const put = (g: THREE.Object3D, x: number, z: number, ry: number, s = 1) => {
    const y = groundY(x, z)
    g.position.set(x, y, z)
    g.rotation.y = ry
    g.scale.setScalar(s)
    g.userData.y0 = y
    root.add(g)
  }
  // pasture
  put(cow(), -13.4, 3.3, 0.9, 1.1)
  put(cow(0x8a5a3c), -10.3, 5.0, -2.3, 1.05)
  put(cow(), -11.7, 2.4, 2.6, 0.62)
  put(sheep(), -9.3, 3.1, -0.8, 1)
  put(sheep(), -13.9, 5.3, 2.0, 0.95)
  put(sheep(0x3d3838, 0x4a4444), -18.4, 11.2, 1.2, 1)
  put(sheep(), -17.2, 12.6, 0.2, 0.8)
  // pen
  put(pig(), -7.4, -2.7, 0.6, 1)
  put(pig(), -6.3, -2.1, -2.2, 0.8)
  // yard
  for (let i = 0; i < 4; i++) root.add(chicken(-10.6 + rr(-0.5, 0.5), -1.2 + rr(-0.4, 0.4), i === 3 ? 0xc9824a : 0xfffaf0))
  // pond family
  root.add(duck(0xffffff, 1.1, 0))
  for (let i = 1; i <= 3; i++) root.add(duck(0xffe066, 0.55, 0.28 + i * 0.2))
  // bunnies
  root.add(bunny(21.0, 4.4), bunny(-3.6, 14.9, 0xcdb59a), bunny(9.6, 14.6), bunny(-21.3, 8.6, 0xffffff))
  // dog in the square, fox by the camp, deer on the hill
  put(dog(0xc98c55, 0xfff3e0), 11.4, -1.6, -0.6, 1.05)
  put(dog(0xe8762c, 0xfff3e0, true), -14.6, -12.6, 1.9, 1)
  put(deer(), -18.4, -11.2, 1.1, 1.05)
  put(deer(), 16.2, -10.8, -0.7, 0.8)

  // birds wheeling overhead, butterflies over the flowers
  const birdCols = [0x4f8fd6, 0xe8574a, 0xf2c14e, 0x4f8fd6, 0xffffff]
  birdCols.forEach((c, i) => flyer(root, c, 11 + i * 1.6, 8.2 + i * 0.5, (0.32 + i * 0.03) * (i % 2 ? -1 : 1), i * 1.9, false, 0, -1))
  const flut = [0xffb3d1, 0xfff07a, 0x9ad0ff, 0xffa64d, 0xffffff, 0xd9a6ff]
  const spots: [number, number][] = [
    [-11.6, 3.9],
    [10.7, 0.3],
    [19.0, 9.8],
    [-7.2, 14.6],
    [2.5, 13.6],
    [-18.6, 12.2],
    [8.7, 3.7],
    [-3.0, -8.2],
  ]
  spots.forEach(([x, z], i) => flyer(root, flut[i % flut.length], rr(1.2, 2.4), rr(0.9, 1.9), rr(0.5, 0.9), rand() * 10, true, x, z))
}
