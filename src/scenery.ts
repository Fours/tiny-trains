import * as THREE from 'three'
import { CROSSING, block, rect, sweep, trackA } from './tracks.ts'
import { groundY } from './nature.ts'
import { at, bake, blob, box, canvasTexture, chimneys, cone, cyl, dyn, grp, mat, mesh, paint, prism, rand, rr, sph, tex, tick, TAU } from './util.ts'
import { groundPatch, groundPath } from './world.ts'

// ---------- shared materials ----------

const white = mat(0xfbf5e8, { rough: 0.6 })
const stone = mat(0xb9ad9f, { rough: 0.95, map: tex.bricks(2, 1) })
const stoneDark = mat(0x8f8679, { rough: 0.95, map: tex.bricks(2, 2) })
const brick = mat(0xc4674a, { rough: 0.9, map: tex.bricks(1, 3) })
const timber = mat(0x8a5a36, { rough: 0.85, map: tex.wood(1, 1) })
const timberLight = mat(0xc49a63, { rough: 0.85, map: tex.planks(1, 2) })
const dark = mat(0x2d2f36, { rough: 0.5 })
const gold = mat(0xf1b941, { rough: 0.25, metal: 0.85, env: 1.3 })
const litWin = mat(0xfff0c4, { emissive: 0xffb44a, emissiveIntensity: 1.9, rough: 0.25 })
const lantern = mat(0xfff3cf, { emissive: 0xffc56a, emissiveIntensity: 4.5 })
const hay = mat(0xe7bd4f, { rough: 1, map: tex.wood(1, 3) })
const planks = tex.planks(1, 3)
const shingles = tex.shingles(4, 3)
const flowerCols = [0xff6f91, 0xffc94d, 0xffffff, 0xff8f5a, 0xc38cff, 0xff5a5a]

const wallMat = (c: number) => mat(c, { rough: 0.82, map: planks })
const roofMat = (c: number) => mat(c, { rough: 0.78, map: shingles })

// ---------- parts ----------

/** A chunky window, facing +z, centred on the wall surface. */
function windowUnit(w: number, h: number, shutter?: THREE.Material, planter = false, glass: THREE.Material = litWin) {
  const g = grp(
    at(box(w + 0.2, h + 0.2, 0.1, white, 0.05), 0, 0, 0.02),
    at(box(w, h, 0.1, glass, 0.03), 0, 0, 0.05),
    at(box(0.07, h, 0.06, white, 0.02), 0, 0, 0.1),
    at(box(w, 0.07, 0.06, white, 0.02), 0, 0, 0.1),
    at(box(w + 0.36, 0.1, 0.22, white, 0.04), 0, -h / 2 - 0.12, 0.08),
  )
  if (shutter) for (const s of [-1, 1]) g.add(at(box(w * 0.42, h + 0.1, 0.07, shutter, 0.03), s * (w * 0.72 + 0.12), 0, 0.03))
  if (planter) {
    g.add(at(box(w + 0.3, 0.22, 0.28, timber, 0.05), 0, -h / 2 - 0.26, 0.2))
    for (let i = 0; i < 5; i++) {
      g.add(at(sph(0.11, mat(flowerCols[Math.floor(rand() * flowerCols.length)], { rough: 0.6 }), 8, 6), -w / 2 + (i * w) / 4, -h / 2 - 0.1 + rr(0, 0.06), 0.22 + rr(-0.04, 0.04)))
      g.add(at(sph(0.1, mat(0x4f9a3d, { rough: 0.9 }), 8, 6), -w / 2 + (i * w) / 4 + 0.1, -h / 2 - 0.16, 0.2))
    }
  }
  return g
}

function door(w: number, h: number, m: THREE.Material, arch = true) {
  const g = grp(at(box(w + 0.22, h + 0.14, 0.1, white, 0.05), 0, h / 2 + 0.04, 0.01), at(box(w, h, 0.12, m, 0.06), 0, h / 2, 0.04), at(sph(0.06, gold, 10, 8), w * 0.3, h * 0.48, 0.12), at(box(w + 0.5, 0.14, 0.5, stone, 0.04), 0, -0.02, 0.2))
  if (arch) g.add(at(box(w * 0.5, w * 0.36, 0.14, litWin, 0.1), 0, h * 0.76, 0.05))
  return g
}

/** Gable roof with its ridge along local x. Origin at the wall top. */
function gableRoof(L: number, W: number, rise: number, roof: THREE.Material, gable: THREE.Material, ov = 0.4) {
  const ang = Math.atan2(rise, W / 2)
  const run = W / 2 + ov
  const sl = run / Math.cos(ang)
  const g = grp()
  for (const s of [-1, 1]) {
    const slab = box(L + 0.85, 0.26, sl + 0.14, roof, 0.1)
    g.add(at(slab, 0, rise - (Math.tan(ang) * run) / 2 + 0.1, (s * run) / 2, s * ang, 0, 0))
    // bargeboards
    for (const e of [-1, 1]) g.add(at(box(0.1, 0.16, sl + 0.2, white, 0.03), e * (L / 2 + 0.44), rise - (Math.tan(ang) * run) / 2 + 0.02, (s * run) / 2, s * ang, 0, 0))
  }
  g.add(at(cyl(0.16, 0.16, L + 0.95, white, 10), 0, rise + 0.2, 0, 0, 0, Math.PI / 2))
  g.add(
    at(
      prism(
        [
          [-W / 2, 0],
          [W / 2, 0],
          [0, rise],
        ],
        L - 0.03,
        gable,
      ),
      0,
      0,
      0,
      0,
      Math.PI / 2,
      0,
    ),
  )
  return g
}

function chimney(g: THREE.Group, x: number, y: number, z: number, h: number) {
  g.add(at(box(0.56, h, 0.56, brick, 0.05), x, y + h / 2, z), at(box(0.72, 0.16, 0.72, stone, 0.05), x, y + h, z), at(cyl(0.16, 0.18, 0.26, dark, 10), x, y + h + 0.18, z))
  ;(g.userData.chimneys ??= []).push(new THREE.Vector3(x, y + h + 0.4, z))
}

interface HouseOpts {
  w: number
  d: number
  h: number
  wall: number
  roof: number
  door: number
  shutter: number
  gableFront?: boolean
  chimney?: boolean
  porch?: boolean
}

function house(o: HouseOpts) {
  const g = grp()
  const base = 0.3
  const top = base + o.h
  const wm = wallMat(o.wall)
  const plain = mat(o.wall, { rough: 0.85 })
  const sh = paint(o.shutter)
  g.add(at(box(o.w + 0.25, base + 0.1, o.d + 0.25, stone, 0.08), 0, base / 2, 0))
  g.add(at(box(o.w, o.h, o.d, wm, 0.1), 0, base + o.h / 2, 0))
  // corner trim
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(at(box(0.16, o.h, 0.16, white, 0.04), (x * o.w) / 2, base + o.h / 2, (z * o.d) / 2))
  const rise = (o.gableFront ? o.w : o.d) * 0.52
  const roof = o.gableFront ? gableRoof(o.d, o.w, rise, roofMat(o.roof), plain) : gableRoof(o.w, o.d, rise, roofMat(o.roof), plain)
  roof.position.y = top
  if (o.gableFront) roof.rotation.y = Math.PI / 2
  g.add(roof)

  const f = o.d / 2
  g.add(at(door(0.78, 1.32, paint(o.door)), o.gableFront ? 0 : -o.w * 0.2, base, f))
  g.add(at(sph(0.1, lantern, 10, 8), (o.gableFront ? 0 : -o.w * 0.2) + 0.62, base + 1.25, f + 0.12))
  if (o.gableFront) {
    for (const s of [-1, 1]) g.add(at(windowUnit(0.5, 0.7, sh, true), s * o.w * 0.33, base + o.h * 0.58, f))
    g.add(at(windowUnit(0.55, 0.55), 0, top + rise * 0.32, f))
  } else {
    g.add(at(windowUnit(0.78, 0.82, sh, true), o.w * 0.22, base + o.h * 0.56, f))
  }
  // sides and back
  g.add(at(windowUnit(0.62, 0.78, sh), o.w / 2, base + o.h * 0.58, 0, 0, Math.PI / 2))
  g.add(at(windowUnit(0.62, 0.78, sh), -o.w / 2, base + o.h * 0.58, 0, 0, -Math.PI / 2))
  for (const s of [-1, 1]) g.add(at(windowUnit(0.6, 0.72, sh), s * o.w * 0.24, base + o.h * 0.58, -f, 0, Math.PI))
  if (!o.gableFront) {
    g.add(at(windowUnit(0.45, 0.45), o.w / 2, top + rise * 0.3, 0, 0, Math.PI / 2))
    g.add(at(windowUnit(0.45, 0.45), -o.w / 2, top + rise * 0.3, 0, 0, -Math.PI / 2))
  }
  if (o.chimney !== false) {
    if (o.gableFront) chimney(g, o.w * 0.24, top + rise * 0.3, -o.d * 0.22, rise * 0.7 + 0.75)
    else chimney(g, o.w * 0.26, top + rise * 0.35, -o.d * 0.18, rise * 0.65 + 0.75)
  }
  if (o.porch) {
    const px = o.gableFront ? 0 : -o.w * 0.2
    g.add(at(box(1.5, 0.12, 0.8, roofMat(o.roof), 0.04), px, base + 1.72, f + 0.38, 0.3, 0, 0))
    for (const s of [-1, 1]) g.add(at(box(0.1, 1.6, 0.1, white, 0.03), px + s * 0.62, base + 0.8, f + 0.66))
  }
  return g
}

function barn() {
  const g = grp()
  const w = 4.4
  const d = 5.0
  const h = 2.5
  const red = wallMat(0xc23b2e)
  const redPlain = mat(0xc23b2e, { rough: 0.85 })
  g.add(at(box(w + 0.25, 0.4, d + 0.25, stone, 0.08), 0, 0.15, 0))
  g.add(at(box(w, h, d, red, 0.1), 0, 0.3 + h / 2, 0))
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(at(box(0.2, h, 0.2, white, 0.04), (x * w) / 2, 0.3 + h / 2, (z * d) / 2))
  const rise = 1.9
  const roof = gableRoof(d, w, rise, roofMat(0x5b6474), redPlain, 0.45)
  roof.position.y = 0.3 + h
  roof.rotation.y = Math.PI / 2
  g.add(roof)
  // big doors with white X bracing
  const f = d / 2
  for (const s of [-1, 1]) {
    const leaf = grp(at(box(1.0, 1.9, 0.1, mat(0xa82f25, { rough: 0.8, map: planks }), 0.04), 0, 0, 0), at(box(1.0, 0.12, 0.14, white, 0.03), 0, 0.9, 0), at(box(1.0, 0.12, 0.14, white, 0.03), 0, -0.9, 0), at(box(0.12, 1.9, 0.14, white, 0.03), -0.45, 0, 0), at(box(0.12, 1.9, 0.14, white, 0.03), 0.45, 0, 0), at(box(0.1, 2.05, 0.13, white, 0.03), 0, 0, 0, 0, 0, 0.47), at(box(0.1, 2.05, 0.13, white, 0.03), 0, 0, 0, 0, 0, -0.47))
    g.add(at(leaf, s * 0.53, 0.3 + 0.98, f + 0.04))
  }
  // hay loft
  g.add(at(box(0.9, 0.8, 0.1, white, 0.04), 0, 0.3 + h + 0.55, f + 0.02), at(box(0.72, 0.62, 0.12, mat(0x3a2a22, { rough: 1 }), 0.03), 0, 0.3 + h + 0.55, f + 0.04), at(blob(0.42, 0.28, 0.3, hay), 0, 0.3 + h + 0.36, f + 0.1), at(box(0.1, 0.1, 0.7, timber, 0.02), 0, 0.3 + h + 1.25, f + 0.3))
  for (const s of [-1, 1]) {
    g.add(at(windowUnit(0.6, 0.6), (s * w) / 2, 0.3 + h * 0.6, 1.2, 0, (s * Math.PI) / 2))
    g.add(at(windowUnit(0.6, 0.6), (s * w) / 2, 0.3 + h * 0.6, -1.2, 0, (s * Math.PI) / 2))
  }
  // cupola + weathervane
  const top = 0.3 + h + rise
  g.add(at(box(0.8, 0.6, 0.8, white, 0.06), 0, top + 0.25, 0), at(cone(0.72, 0.6, roofMat(0x5b6474), 4), 0, top + 0.82, 0, 0, Math.PI / 4, 0), at(cyl(0.03, 0.03, 0.7, dark, 6), 0, top + 1.4, 0))
  const vane = dyn(grp(at(box(0.7, 0.05, 0.05, gold, 0.02), 0, 0, 0), at(cone(0.12, 0.26, gold, 4), 0.4, 0, 0, 0, 0, -Math.PI / 2), at(box(0.22, 0.2, 0.04, gold, 0.02), -0.34, 0, 0)))
  vane.position.set(0, top + 1.62, 0)
  tick.push((_, t) => (vane.rotation.y = Math.sin(t * 0.6) * 0.8 + Math.sin(t * 1.7) * 0.2))
  g.add(vane)
  return g
}

function silo() {
  const m = mat(0xdfe6ea, { rough: 0.35, metal: 0.6, env: 1.1 })
  const g = grp(at(cyl(1.05, 1.05, 4.2, m, 28), 0, 2.1, 0), at(cyl(1.15, 1.2, 0.3, stone, 28), 0, 0.15, 0))
  for (let i = 0; i < 5; i++) g.add(at(cyl(1.08, 1.08, 0.08, mat(0x9aa5ad, { metal: 0.7, rough: 0.4 }), 28), 0, 0.7 + i * 0.85, 0))
  const cap = sph(1.08, paint(0xc23b2e), 28, 14)
  cap.scale.y = 0.62
  g.add(at(cap, 0, 4.2, 0), at(sph(0.14, gold, 10, 8), 0, 4.92, 0))
  // ladder
  for (let i = 0; i < 9; i++) g.add(at(box(0.36, 0.05, 0.05, dark, 0.02), 0, 0.5 + i * 0.42, 1.09))
  for (const x of [-0.18, 0.18]) g.add(at(box(0.05, 3.9, 0.05, dark, 0.02), x, 2.1, 1.09))
  return g
}

function windmill() {
  const body = mat(0xf6ead2, { rough: 0.8, map: tex.planks(1, 6) })
  const g = grp(at(cyl(1.5, 1.62, 0.5, stone, 8), 0, 0.25, 0), at(cyl(0.92, 1.42, 4.3, body, 8), 0, 2.6, 0), at(cyl(1.3, 1.3, 0.12, timber, 8), 0, 2.5, 0))
  // gallery railing
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16
    g.add(at(box(0.07, 0.42, 0.07, white, 0.02), Math.cos(a) * 1.24, 2.76, Math.sin(a) * 1.24))
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 6, 8), white)
  rail.castShadow = true
  g.add(at(rail, 0, 2.98, 0, Math.PI / 2, 0, TAU / 16))
  g.add(at(cone(1.2, 1.25, roofMat(0x7c4a3a), 8), 0, 5.35, 0), at(sph(0.13, gold, 10, 8), 0, 6.02, 0))
  g.add(at(door(0.7, 1.2, paint(0x3f7fb5)), 0, 0.5, 1.38, -0.11, 0, 0))
  g.add(at(windowUnit(0.42, 0.5), 0, 3.5, 1.05, -0.11, 0, 0), at(windowUnit(0.42, 0.5), 1.08, 3.3, 0, -0.11, Math.PI / 2, 0, ))
  // sails
  g.add(at(cyl(0.16, 0.16, 0.9, timber, 10), 0, 4.55, 1.05, Math.PI / 2))
  const sails = dyn(grp(at(sph(0.24, gold, 12, 10), 0, 0, 0.06)))
  const cloth = mat(0xfff6e2, { rough: 0.9, side: THREE.DoubleSide })
  for (let i = 0; i < 4; i++) {
    const arm = grp(at(box(0.12, 3.1, 0.1, timber, 0.03), 0, 1.55, 0), at(box(0.62, 2.3, 0.04, cloth, 0.02), 0.36, 1.85, 0.02))
    for (let k = 0; k < 6; k++) arm.add(at(box(0.66, 0.05, 0.07, timber, 0.02), 0.36, 0.78 + k * 0.43, 0.02))
    arm.add(at(box(0.05, 2.3, 0.07, timber, 0.02), 0.68, 1.85, 0.02))
    arm.rotation.z = (i * Math.PI) / 2
    sails.add(arm)
  }
  bake(sails)
  sails.position.set(0, 4.55, 1.55)
  tick.push((dt) => (sails.rotation.z -= dt * 0.55))
  g.add(sails)
  return g
}

function signTexture(text: string, bg: string, fg: string) {
  return canvasTexture(
    512,
    128,
    (c, w, h) => {
      c.fillStyle = bg
      c.fillRect(0, 0, w, h)
      c.strokeStyle = fg
      c.lineWidth = 8
      c.strokeRect(10, 10, w - 20, h - 20)
      c.fillStyle = fg
      c.font = '800 64px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(text, w / 2, h / 2 + 4)
    },
    {},
  )
}

function clock(r: number) {
  const face = canvasTexture(
    128,
    128,
    (c) => {
      c.fillStyle = '#fffaf0'
      c.beginPath()
      c.arc(64, 64, 62, 0, TAU)
      c.fill()
      c.fillStyle = '#3a2c28'
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU
        c.beginPath()
        c.arc(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, i % 3 ? 3 : 6, 0, TAU)
        c.fill()
      }
      c.lineCap = 'round'
      c.strokeStyle = '#3a2c28'
      c.lineWidth = 8
      c.beginPath()
      c.moveTo(64, 64)
      c.lineTo(64 + 24, 64 - 14)
      c.stroke()
      c.lineWidth = 5
      c.beginPath()
      c.moveTo(64, 64)
      c.lineTo(64 - 8, 64 - 42)
      c.stroke()
    },
    {},
  )
  const f = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 24), new THREE.MeshStandardMaterial({ map: face, roughness: 0.4, emissive: 0xfff0d0, emissiveMap: face, emissiveIntensity: 0.35 }))
  f.userData.keep = true
  return grp(at(cyl(r, r, 0.12, gold, 24), 0, 0, 0, Math.PI / 2), at(f, 0, 0, 0.07))
}

function lampPost(light: boolean) {
  const g = grp(at(cyl(0.16, 0.2, 0.2, dark, 12), 0, 0.1, 0), at(cyl(0.055, 0.07, 2.1, dark, 10), 0, 1.15, 0), at(box(0.34, 0.06, 0.34, dark, 0.02), 0, 2.2, 0), at(box(0.26, 0.34, 0.26, lantern, 0.06), 0, 2.4, 0), at(cone(0.28, 0.24, dark, 4), 0, 2.68, 0, 0, Math.PI / 4, 0))
  if (light) {
    const l = new THREE.PointLight(0xffc878, 10, 8, 1.7)
    l.position.set(0, 2.4, 0)
    g.add(l)
  }
  return g
}

function bench() {
  const g = grp(at(box(1.2, 0.08, 0.4, timberLight, 0.03), 0, 0.42, 0), at(box(1.2, 0.34, 0.07, timberLight, 0.03), 0, 0.7, -0.19, -0.15, 0, 0))
  for (const x of [-0.5, 0.5]) g.add(at(box(0.08, 0.42, 0.4, dark, 0.02), x, 0.21, 0))
  return g
}

function pegPerson(body: number, hat: number, skin = 0xf3c9a5) {
  const g = dyn(grp(at(cyl(0.2, 0.3, 0.62, paint(body), 16), 0, 0.31, 0), at(sph(0.25, mat(skin, { rough: 0.6 }), 16, 12), 0, 0.8, 0), at(cyl(0.2, 0.26, 0.14, paint(hat), 16), 0, 1.02, 0), at(cyl(0.34, 0.34, 0.04, paint(hat), 16), 0, 0.95, 0)))
  const eye = mat(0x22222a, { rough: 0.2 })
  for (const x of [-0.09, 0.09]) g.add(at(sph(0.035, eye, 8, 6), x, 0.83, 0.225))
  const ph = rand() * 10
  tick.push((_, t) => {
    g.rotation.z = Math.sin(t * 1.3 + ph) * 0.06
    g.position.y = g.userData.y0 + Math.max(0, Math.sin(t * 2.1 + ph) - 0.86) * 0.9
  })
  return g
}

function waterTower() {
  const g = grp()
  for (const [x, z] of [
    [-0.75, -0.75],
    [0.75, -0.75],
    [-0.75, 0.75],
    [0.75, 0.75],
  ]) {
    g.add(at(box(0.16, 2.5, 0.16, timber, 0.03), x * 0.9, 1.25, z * 0.9, z * 0.07, 0, -x * 0.07))
  }
  for (const y of [0.8, 1.8]) {
    g.add(at(box(1.6, 0.1, 0.1, timber, 0.02), 0, y, 0.68), at(box(1.6, 0.1, 0.1, timber, 0.02), 0, y, -0.68), at(box(0.1, 0.1, 1.6, timber, 0.02), 0.68, y, 0), at(box(0.1, 0.1, 1.6, timber, 0.02), -0.68, y, 0))
  }
  g.add(at(box(2.0, 0.14, 2.0, timber, 0.04), 0, 2.52, 0))
  g.add(at(cyl(1.05, 0.95, 1.5, mat(0xb97843, { rough: 0.8, map: tex.planks(8, 1) }), 20), 0, 3.35, 0))
  for (const y of [2.85, 3.35, 3.85]) g.add(at(cyl(1.06, 1.04, 0.08, dark, 20), 0, y, 0))
  g.add(at(cone(1.25, 0.8, roofMat(0x4f7d6a), 12), 0, 4.5, 0), at(sph(0.1, gold, 8, 6), 0, 4.95, 0))
  g.add(at(cyl(0.08, 0.08, 1.3, dark, 8), 0.9, 2.9, 0, 0, 0, -1.0), at(cyl(0.11, 0.08, 0.4, dark, 8), 1.42, 2.4, 0))
  return g
}

function signalBox() {
  const g = grp(at(box(1.9, 1.4, 1.5, brick, 0.08), 0, 0.7, 0), at(box(2.1, 1.1, 1.7, wallMat(0xf2e3c2), 0.08), 0, 1.95, 0))
  const roof = gableRoof(2.1, 1.7, 0.7, roofMat(0x3f6b8c), mat(0xf2e3c2, { rough: 0.85 }), 0.3)
  roof.position.y = 2.5
  g.add(roof)
  g.add(at(box(1.7, 0.6, 0.08, litWin, 0.03), 0, 2.05, 0.85), at(box(1.76, 0.07, 0.1, white, 0.02), 0, 2.05, 0.87))
  for (const x of [-0.56, 0, 0.56]) g.add(at(box(0.07, 0.66, 0.1, white, 0.02), x, 2.05, 0.87))
  for (const s of [-1, 1]) g.add(at(windowUnit(0.8, 0.5), s * 1.05, 2.05, 0, 0, (s * Math.PI) / 2))
  g.add(at(door(0.6, 1.1, paint(0x2f6f4f), false), 0.45, 0, 0.75))
  // outside stair
  for (let i = 0; i < 5; i++) g.add(at(box(0.6, 0.08, 0.26, timber, 0.02), -1.25, 0.2 + i * 0.25, 0.9 - i * 0.3))
  return g
}

function chapel() {
  const wall = 0xfaf1df
  const g = house({ w: 2.3, d: 3.2, h: 1.9, wall, roof: 0x5c6f8f, door: 0x8a4a32, shutter: 0x5c6f8f, gableFront: true, chimney: false })
  g.add(at(box(1.15, 3.6, 1.15, wallMat(wall), 0.08), 0, 2.1, 0.9))
  g.add(at(cone(1.05, 1.7, roofMat(0x5c6f8f), 4), 0, 4.75, 0.9, 0, Math.PI / 4, 0))
  g.add(at(box(0.07, 0.6, 0.07, gold, 0.02), 0, 5.85, 0.9), at(box(0.34, 0.07, 0.07, gold, 0.02), 0, 5.95, 0.9))
  g.add(at(clock(0.36), 0, 3.45, 1.5))
  return g
}

function well() {
  const g = grp(at(cyl(0.72, 0.78, 0.7, stoneDark, 14), 0, 0.35, 0), at(cyl(0.6, 0.6, 0.05, mat(0x3f86b8, { rough: 0.1, metal: 0.2 }), 14), 0, 0.62, 0))
  for (const x of [-0.62, 0.62]) g.add(at(box(0.12, 1.5, 0.12, timber, 0.03), x, 1.2, 0))
  g.add(at(cyl(0.06, 0.06, 1.4, timber, 8), 0, 1.55, 0, 0, 0, Math.PI / 2))
  const roof = gableRoof(1.5, 1.0, 0.45, roofMat(0xb5533c), timber, 0.2)
  roof.position.y = 1.9
  g.add(roof)
  g.add(at(cyl(0.16, 0.13, 0.26, timberLight, 10), 0.2, 0.95, 0), at(cyl(0.015, 0.015, 0.5, dark, 4), 0.2, 1.3, 0))
  return g
}

function haystack(r = 0.7) {
  const g = grp(at(cyl(r, r, r * 1.1, hay, 18), 0, r, 0, Math.PI / 2, 0, 0))
  for (const z of [-0.35, 0.35]) g.add(at(cyl(r * 1.02, r * 1.02, 0.06, mat(0xb8862f, { rough: 1 }), 18), 0, r, z * r, Math.PI / 2))
  return g
}

function tractor() {
  const red = paint(0xe2472f)
  const tyre = mat(0x2a2a30, { rough: 0.9 })
  const g = grp(at(box(0.8, 0.55, 1.5, red, 0.12), 0, 0.85, 0.35), at(box(0.95, 0.8, 0.9, red, 0.12), 0, 1.15, -0.55), at(box(1.1, 0.1, 1.05, white, 0.04), 0, 1.95, -0.55), at(cyl(0.06, 0.06, 0.7, dark, 8), 0.2, 1.4, 0.8), at(box(0.5, 0.3, 0.06, dark, 0.03), 0, 0.85, 1.12))
  for (const x of [-0.42, 0.42]) for (const z of [-0.9, -0.2]) g.add(at(box(0.07, 0.72, 0.07, dark, 0.02), x, 1.55, z))
  for (const s of [-1, 1]) {
    g.add(at(cyl(0.62, 0.62, 0.36, tyre, 20), s * 0.62, 0.62, -0.55, 0, 0, Math.PI / 2), at(cyl(0.3, 0.3, 0.4, gold, 14), s * 0.62, 0.62, -0.55, 0, 0, Math.PI / 2))
    g.add(at(cyl(0.34, 0.34, 0.26, tyre, 16), s * 0.5, 0.34, 0.85, 0, 0, Math.PI / 2), at(cyl(0.16, 0.16, 0.3, gold, 12), s * 0.5, 0.34, 0.85, 0, 0, Math.PI / 2))
    g.add(at(sph(0.09, lantern, 8, 6), s * 0.25, 0.95, 1.12))
  }
  return g
}

function scarecrow() {
  const g = dyn(grp(at(box(0.09, 1.9, 0.09, timber, 0.02), 0, 0.95, 0), at(box(1.3, 0.09, 0.09, timber, 0.02), 0, 1.35, 0), at(box(0.62, 0.7, 0.3, mat(0x4a79b8, { rough: 0.9 }), 0.1), 0, 1.25, 0), at(sph(0.26, mat(0xe9c98a, { rough: 1 }), 12, 10), 0, 1.85, 0), at(cone(0.36, 0.4, mat(0x8a5a36, { rough: 1 }), 12), 0, 2.17, 0), at(cyl(0.44, 0.44, 0.04, mat(0x8a5a36, { rough: 1 }), 14), 0, 2.0, 0)))
  for (const s of [-1, 1]) g.add(at(blob(0.14, 0.1, 0.1, hay), s * 0.68, 1.35, 0))
  const eye = mat(0x22222a, { rough: 0.3 })
  for (const x of [-0.09, 0.09]) g.add(at(sph(0.04, eye, 6, 5), x, 1.88, 0.24))
  tick.push((_, t) => (g.rotation.z = Math.sin(t * 1.1) * 0.05))
  return g
}

function tent() {
  const cloth = mat(0xf0a23c, { rough: 0.9, side: THREE.DoubleSide })
  const g = grp(
    at(
      prism(
        [
          [-0.95, 0],
          [0.95, 0],
          [0, 1.25],
        ],
        1.9,
        cloth,
        0.03,
      ),
      0,
      0,
      0,
    ),
    at(
      prism(
        [
          [-0.3, 0],
          [0.3, 0],
          [0, 0.85],
        ],
        0.04,
        mat(0x4a2f22, { rough: 1 }),
      ),
      0,
      0,
      0.98,
    ),
    at(box(0.06, 1.45, 0.06, timber, 0.02), 0, 0.72, 1.0),
  )
  return g
}

function campfire() {
  const g = grp()
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU
    g.add(at(blob(0.16, 0.12, 0.14, stoneDark), Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42, 0, a, 0))
  }
  for (let i = 0; i < 3; i++) g.add(at(cyl(0.07, 0.07, 0.7, timber, 8), 0, 0.14, 0, Math.PI / 2 - 0.3, (i * TAU) / 3, 0))
  const flame = dyn(grp())
  const fm = [mat(0xffe08a, { emissive: 0xffc23a, emissiveIntensity: 5 }), mat(0xff8a3a, { emissive: 0xff5a1a, emissiveIntensity: 4 })]
  const outer = at(cone(0.22, 0.6, fm[1], 8), 0, 0.42, 0)
  const inner = at(cone(0.12, 0.38, fm[0], 8), 0, 0.36, 0)
  outer.castShadow = inner.castShadow = false
  flame.add(outer, inner)
  const light = new THREE.PointLight(0xff9a3a, 12, 7, 1.8)
  light.position.y = 0.6
  flame.add(light)
  tick.push((_, t) => {
    const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.1
    outer.scale.set(1, f, 1)
    inner.scale.set(1, 2 - f, 1)
    flame.rotation.y = t * 2
    light.intensity = 12 * f
  })
  g.add(flame)
  return g
}

// ---------- fences ----------

export function fence(root: THREE.Group, pts: [number, number][], closed: boolean, m: THREE.Material = white, gapAfter = -1) {
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[(i + 1) % pts.length]
    const len = Math.hypot(x2 - x1, z2 - z1)
    const steps = Math.max(1, Math.round(len / 0.95))
    const ry = Math.atan2(x2 - x1, z2 - z1)
    for (let k = 0; k < steps; k++) {
      const u = k / steps
      const post = box(0.15, 0.85, 0.15, m, 0.04)
      root.add(at(post, x1 + (x2 - x1) * u, 0.42, z1 + (z2 - z1) * u, 0, ry + rr(-0.06, 0.06), rr(-0.04, 0.04)))
      root.add(at(sph(0.1, m, 8, 6), x1 + (x2 - x1) * u, 0.86, z1 + (z2 - z1) * u))
    }
    if (i === gapAfter) continue
    for (const y of [0.34, 0.64]) root.add(at(box(0.07, 0.11, len, m, 0.02), (x1 + x2) / 2, y, (z1 + z2) / 2, 0, ry, 0))
  }
  if (!closed) {
    const [x, z] = pts[pts.length - 1]
    root.add(at(box(0.15, 0.85, 0.15, m, 0.04), x, 0.42, z))
  }
}

// ---------- placement ----------

function place(root: THREE.Group, g: THREE.Object3D, x: number, z: number, ry = 0, r = 0, y = 0) {
  g.position.set(x, y, z)
  g.rotation.y = ry
  g.userData.y0 = y
  root.add(g)
  if (r > 0) block(x, z, r)
  g.updateMatrixWorld(true)
  for (const c of (g.userData.chimneys ?? []) as THREE.Vector3[]) chimneys.push(g.localToWorld(c.clone()))
  return g
}

const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z)

export function buildScenery(root: THREE.Group) {
  // ----- farm, inside loop A -----
  place(root, barn(), -20.2, 0.6, face(-20.2, 0.6, -12, 6), 3.3)
  place(root, silo(), -16.2, -2.2, 0.6, 1.4)
  groundPatch(-17.4, 2.2, 3.4, 2.4, '#c7a36c', 0.85, 0.5)
  groundPath(
    [
      [-18.6, 2.2],
      [-15, 3.4],
      [-11.5, 5.0],
      [-9.4, 7.0],
    ],
    1.0,
  )
  place(root, tractor(), -15.2, 1.0, 2.3, 1.2)
  place(root, haystack(0.72), -22.7, 5.2, 0.4, 0.9)
  place(root, haystack(0.62), -21.5, 4.6, 1.2, 0.8)
  place(root, haystack(0.55), -22.1, 4.9, 0.8, 0, 1.15)

  // pasture
  const PX = -17.2
  const PZ = 7.4
  const pasture: [number, number][] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.2
    pasture.push([PX + Math.cos(a) * 4.0, PZ + Math.sin(a) * 2.7])
  }
  fence(root, pasture, true, white, 10)
  block(PX - 2, PZ, 2.5)
  block(PX + 2, PZ, 2.5)
  block(PX, PZ, 2.9)
  groundPatch(PX, PZ, 3.9, 2.6, '#8fc257', 0.6)
  groundPatch(PX + 2.4, PZ - 1.6, 1.2, 0.9, '#b79a64', 0.7)
  const trough = grp(at(box(1.3, 0.34, 0.5, timber, 0.05), 0, 0.3, 0), at(box(1.14, 0.06, 0.36, mat(0x4d93c4, { rough: 0.1 }), 0.02), 0, 0.46, 0))
  for (const x of [-0.5, 0.5]) trough.add(at(box(0.1, 0.3, 0.5, timber, 0.02), x, 0.12, 0))
  place(root, trough, PX - 0.8, PZ + 1.7, 0.3)

  // pig pen
  const pen: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    pen.push([-11.2 + Math.cos(a) * 1.75, -1.2 + Math.sin(a) * 1.55])
  }
  fence(root, pen, true, timber)
  groundPatch(-11.2, -1.2, 1.9, 1.7, '#8a6444', 0.95)
  groundPatch(-11.5, -1.0, 0.9, 0.7, '#6b4a33', 0.9)
  block(-11.2, -1.2, 1.9)

  // wheat field + scarecrow, windmill
  groundPatch(-6.6, 0.4, 2.5, 1.7, '#c9a04e', 0.9, 0.2)
  place(root, scarecrow(), -6.6, 0.4, 0.5)
  place(root, windmill(), -3.6, 7.0, face(-3.6, 7.0, 6, 20), 1.9)
  groundPatch(-3.6, 7.0, 2.2, 2.2, '#c9ad77', 0.7)

  // ----- station, along the inside of loop A's front straight -----
  const SX = -9.2
  const sMid = trackA.nearest(SX, CROSSING.z).s
  const HALF = 5.4
  const platTop = mat(0xd9c7a8, { rough: 0.9, map: tex.bricks(1, 14) })
  root.add(mesh(sweep(trackA, sMid - HALF, sMid + HALF, 0.3, () => rect(-2.3, 0, 1.75, 0.46), true), platTop))
  root.add(mesh(sweep(trackA, sMid - HALF, sMid + HALF, 0.3, () => rect(-1.5, 0.4, 0.16, 0.08), true), mat(0xf4c542, { rough: 0.6 })))
  for (const e of [-1, 1]) {
    const f = trackA.frame(sMid + e * HALF)
    root.add(at(box(1.75, 0.46, 0.2, platTop, 0.04), f.x - f.nx * 2.3, 0.23, f.z - f.nz * 2.3, 0, f.yaw, 0))
  }
  const st = grp()
  const sw = 5.0
  const sd = 1.9
  st.add(at(box(sw + 0.3, 0.5, sd + 0.3, stone, 0.08), 0, 0.25, 0), at(box(sw, 1.9, sd, wallMat(0xf7d98b), 0.1), 0, 1.45, 0))
  const sr = gableRoof(sw, sd, 1.0, roofMat(0x2f8f86), mat(0xf7d98b, { rough: 0.85 }), 0.5)
  sr.position.y = 2.4
  st.add(sr)
  // central clock gable facing the platform
  st.add(at(box(1.5, 1.2, 0.5, wallMat(0xf7d98b), 0.08), 0, 2.9, 0.95))
  const cg = gableRoof(0.7, 1.5, 0.6, roofMat(0x2f8f86), mat(0xf7d98b, { rough: 0.85 }), 0.25)
  cg.position.set(0, 3.5, 0.95)
  cg.rotation.y = Math.PI / 2
  st.add(cg)
  st.add(at(clock(0.42), 0, 3.05, 1.22))
  st.add(at(door(0.8, 1.3, paint(0x2f6f8f)), 0, 0.5, sd / 2))
  for (const x of [-1.7, 1.7]) st.add(at(windowUnit(0.8, 0.8, paint(0x2f8f86), true), x, 1.6, sd / 2))
  for (const x of [-1.5, 0, 1.5]) st.add(at(windowUnit(0.6, 0.7, paint(0x2f8f86)), x, 1.6, -sd / 2, 0, Math.PI))
  for (const s of [-1, 1]) st.add(at(windowUnit(0.6, 0.7), (s * sw) / 2, 1.6, 0, 0, (s * Math.PI) / 2))
  // canopy over the platform
  st.add(at(box(sw + 1.4, 0.14, 1.9, roofMat(0x2f8f86), 0.05), 0, 2.32, 1.75, 0.1, 0, 0))
  for (const x of [-2.8, -0.95, 0.95, 2.8]) {
    st.add(at(box(0.12, 1.75, 0.12, white, 0.03), x, 1.33, 2.5), at(box(0.5, 0.08, 0.08, white, 0.02), x, 2.05, 2.3, 0, Math.PI / 2, 0.6))
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.56), new THREE.MeshStandardMaterial({ map: signTexture('MAPLE HOLLOW', '#234b5a', '#fff3d6'), roughness: 0.6 }))
  sign.userData.keep = true
  st.add(at(box(2.44, 0.7, 0.08, white, 0.04), 0, 2.02, 2.56), at(sign, 0, 2.02, 2.61))
  chimney(st, 1.7, 2.9, -0.3, 1.2)
  place(root, st, SX, 8.0, 0, 0)
  block(SX - 1.8, 8.0, 2.2)
  block(SX + 1.8, 8.0, 2.2)
  block(SX - 2.5, 10.4, 2.6)
  block(SX + 2.5, 10.4, 2.6)
  groundPatch(SX, 9.6, 5.4, 1.6, '#d6bf93', 0.8)
  place(root, bench(), SX - 3.4, 10.5, 0, 0, 0.46)
  place(root, bench(), SX + 3.3, 10.5, 0, 0, 0.46)
  place(root, lampPost(true), -14.0, 10.3, 0, 0, 0.46)
  place(root, lampPost(false), -4.6, 10.3, 0, 0, 0.46)
  place(root, pegPerson(0x3f6fb5, 0x2d3a55), SX - 0.8, 10.9, 0.2, 0, 0.46)
  place(root, pegPerson(0xe8617a, 0xf4c542), SX + 0.6, 10.7, -0.3, 0, 0.46)
  place(root, pegPerson(0x58a55c, 0x8a5a36), SX - 2.0, 11.0, 0.4, 0, 0.46)
  const lug = grp(at(box(0.5, 0.34, 0.32, mat(0x9c5a3c, { rough: 0.6 }), 0.06), 0, 0.17, 0), at(box(0.4, 0.26, 0.28, mat(0x3f7f6f, { rough: 0.6 }), 0.06), 0.03, 0.47, 0, 0, 0.3, 0))
  place(root, lug, SX + 1.6, 10.9, 0.4, 0, 0.46)

  // ----- village, inside loop B -----
  const plaza: [number, number] = [14.2, 2.0]
  groundPatch(plaza[0], plaza[1], 2.6, 2.4, '#d9c59c', 0.9)
  place(root, well(), plaza[0], plaza[1], 0.4, 1.7)
  const houses: [HouseOpts, number, number][] = [
    [{ w: 2.9, d: 2.5, h: 1.9, wall: 0xf6b8c4, roof: 0x8f4b5e, door: 0x6a3d7a, shutter: 0xffffff, porch: true }, 18.0, 6.6],
    [{ w: 2.6, d: 2.8, h: 2.3, wall: 0x9fd3e8, roof: 0x34506f, door: 0xe2572f, shutter: 0xfff0c9, gableFront: true }, 19.6, -2.6],
    [{ w: 3.0, d: 2.4, h: 1.8, wall: 0xf9e08e, roof: 0xc75c3a, door: 0x2f7f6f, shutter: 0x2f7f6f, porch: true }, 13.4, -4.6],
    [{ w: 2.6, d: 2.4, h: 1.8, wall: 0xbfe3c0, roof: 0x6b4f8a, door: 0xf4b63a, shutter: 0xffffff, porch: true }, 10.9, 7.4],
  ]
  for (const [o, x, z] of houses) {
    const ry = face(x, z, plaza[0], plaza[1])
    place(root, house(o), x, z, ry, 2.25)
    groundPath(
      [
        [x + Math.sin(ry) * 1.3, z + Math.cos(ry) * 1.3],
        [(x + plaza[0]) / 2 + 0.3, (z + plaza[1]) / 2],
        [plaza[0], plaza[1]],
      ],
      0.8,
    )
  }
  // lane from the square down to the pond
  groundPath(
    [
      [14.2, 3.6],
      [13.9, 6.5],
      [13.7, 9.5],
      [13.6, 11.2],
    ],
    0.8,
  )
  place(root, lampPost(true), 12.6, 3.6, 0, 0.3)
  place(root, lampPost(false), 16.0, 0.4, 0, 0.3)
  place(root, bench(), 15.8, 3.6, face(15.8, 3.6, plaza[0], plaza[1]), 0.6)
  place(root, bench(), 11.6, 11.6, face(11.6, 11.6, 13.6, 13.4), 0.6)
  place(root, pegPerson(0xf08a3c, 0xffffff), 13.2, 0.5, 0.8)
  place(root, pegPerson(0x8a5fc2, 0x2d3a55), 15.3, 2.9, -2.0)
  place(root, pegPerson(0x3f9bd6, 0xe8503f), 16.3, 11.9, -1.2)
  // market stall
  const stall = grp(at(box(1.6, 0.7, 0.8, timberLight, 0.05), 0, 0.35, 0), at(box(1.9, 0.1, 1.2, mat(0xe8503f, { rough: 0.8, map: tex.planks(6, 1) }), 0.03), 0, 1.75, 0.05, 0.2, 0, 0))
  for (const x of [-0.75, 0.75]) for (const z of [-0.35, 0.35]) stall.add(at(box(0.08, 1.75, 0.08, white, 0.02), x, 0.88, z))
  for (let i = 0; i < 12; i++) stall.add(at(sph(0.11, mat([0xe8503f, 0xf4a83a, 0x7fc24f][i % 3], { rough: 0.5 }), 8, 6), -0.6 + (i % 6) * 0.24, 0.78, -0.15 + Math.floor(i / 6) * 0.26))
  place(root, stall, 11.2, -0.4, face(11.2, -0.4, plaza[0], plaza[1]), 1.0)

  // chapel on the hill behind the village
  place(root, chapel(), 14, -12.5, face(14, -12.5, 12, 4), 2.3, groundY(14, -12.5) - 0.35)

  // ----- cottage and garden at the front -----
  place(root, house({ w: 2.7, d: 2.4, h: 1.7, wall: 0xfdf0d8, roof: 0x5f8f4a, door: 0xd6453d, shutter: 0x5f8f4a, porch: true }), -15.5, 18.6, face(-15.5, 18.6, -6, 24), 2.2)
  groundPath(
    [
      [-14.3, 19.7],
      [-11, 20.2],
      [-7, 19.2],
    ],
    0.7,
  )
  fence(
    root,
    [
      [-20, 21.2],
      [-11.5, 21.5],
      [-4, 21.1],
    ],
    false,
  )

  // ----- railway furniture in the lens between the loops -----
  place(root, signalBox(), 3.7, 6.6, face(3.7, 6.6, 1.2, 14), 1.5)
  place(root, waterTower(), 4.0, 0.4, 2.2, 1.4)
  groundPatch(3.6, 4.4, 1.8, 3.6, '#bfa878', 0.6)
  const pile = grp()
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) pile.add(at(cyl(0.14, 0.14, 0.9, timber, 10), 0, 0.14 + r * 0.25, -0.42 + i * 0.29 + r * 0.14, 0, 0, Math.PI / 2))
  place(root, pile, 2.6, 2.6, 0.5, 0.7)
  for (const [x, z, s] of [
    [4.9, 3.6, 0.6],
    [5.0, 4.4, 0.45],
  ]) {
    place(root, at(box(s, s, s, timberLight, 0.04), 0, 0, 0), x, z, rand(), 0.4, s / 2)
  }

  // ----- camp at the back -----
  place(root, tent(), -13.2, -18.4, 0.5, 1.4)
  place(root, campfire(), -11.2, -17.8, 0, 0.7)
  groundPatch(-11.8, -18.0, 2.2, 1.5, '#b99a66', 0.7)
  const log = grp(at(cyl(0.2, 0.2, 1.2, timber, 12), 0, 0.2, 0, 0, 0, Math.PI / 2))
  place(root, log, -11.0, -16.5, 0.3, 0.5)
  place(root, pegPerson(0xd9534f, 0x3f7f4f), -10.2, -18.2, -1.6)
}
