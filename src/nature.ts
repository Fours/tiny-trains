import * as THREE from 'three'
import { BOARD, BRIDGE_HALF, CROSSING, block, free, onBoard, trackB } from './tracks.ts'
import { at, blob, cyl, dyn, grp, mat, mesh, lumpy, mulberry, pick, rand, rr, sph, tick, turfMat, TAU } from './util.ts'
import { groundPatch } from './world.ts'
import { Batch, SUN_DIR, barkTexture, fallenLeaf, firTier, leafClump, leafMaterial, trunkGeometry } from './trees.ts'

// ---------- hills ----------

const hills = [
  { x: -22, z: -15.5, r: 5.6, h: 2.5 },
  { x: 14, z: -12.5, r: 3.6, h: 2.0 },
  { x: 24.6, z: -17.2, r: 3.9, h: 2.0 },
  { x: 25, z: 17.2, r: 3.5, h: 1.6 },
  { x: -24.4, z: 18.2, r: 3.9, h: 1.4 },
  { x: -7.5, z: -19, r: 3.0, h: 1.2 },
]

export function groundY(x: number, z: number) {
  let y = 0
  for (const h of hills) {
    const d = Math.hypot(x - h.x, z - h.z) / h.r
    if (d < 1) y = Math.max(y, h.h * (1 - d * d) ** 2)
  }
  return y
}

export const POND = { x: 13.6, z: 13.4, rx: 2.7, rz: 2.0 }

// ---------- wind-swayed foliage material ----------

const windTime = { value: 0 }
tick.push((_, t) => (windTime.value = t))

function foliage(color: number, amp: number, grass = false, rough = 0.85) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, envMapIntensity: 0.35, side: grass ? THREE.DoubleSide : THREE.FrontSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vShade;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShade = ${grass ? 'position.y * 2.0 - 0.6' : 'normal.y'};
        #ifdef USE_INSTANCING
          vec3 wp = (instanceMatrix * vec4(position, 1.0)).xyz;
          float w1 = sin(uTime * 1.5 + wp.x * 0.42 + wp.z * 0.36);
          float w2 = sin(uTime * 2.9 + wp.x * 0.9 - wp.z * 0.7);
          float k = ${grass ? 'position.y * position.y * 1.2' : '(position.y + 1.2) * 0.5'};
          transformed.x += (w1 + 0.4 * w2) * ${amp.toFixed(3)} * k;
          transformed.z += (w2 * 0.7 + 0.3 * w1) * ${(amp * 0.6).toFixed(3)} * k;
        #endif`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.55, 1.16, smoothstep(-0.9, 0.95, vShade));')
    // velvety rim light so canopies glow against the light
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5) * ' + (grass ? '0.0' : '0.2') + ';',
    )
    // blades are lit like the turf they grow from, whichever way they face
    if (grass) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
  }
  return m
}

function grassTuft(blades: number, seed: number) {
  const r = mulberry(seed)
  const pos: number[] = []
  const nrm: number[] = []
  for (let b = 0; b < blades; b++) {
    const a = r() * TAU
    const bx = Math.cos(a) * r() * 0.22
    const bz = Math.sin(a) * r() * 0.22
    const h = 0.42 + r() * 0.4
    const w = 0.065 + r() * 0.03
    const lean = 0.1 + r() * 0.25
    const la = r() * TAU
    const dx = Math.cos(la)
    const dz = Math.sin(la)
    const px = -dz
    const pz = dx
    const pt = (t: number, s: number): [number, number, number] => [bx + dx * lean * t * t + px * w * s * (1 - t * 0.8), h * t, bz + dz * lean * t * t + pz * w * s * (1 - t * 0.8)]
    const quads: [number, number][] = [
      [0, 0.5],
      [0.5, 1],
    ]
    for (const [t0, t1] of quads) {
      const a0 = pt(t0, -1)
      const b0 = pt(t0, 1)
      const a1 = pt(t1, -1)
      const b1 = pt(t1, 1)
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1)
      for (let i = 0; i < 6; i++) nrm.push(0, 1, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  return g
}

const jitter = (hex: number, dh = 0.03, ds = 0.08, dl = 0.07) => new THREE.Color(hex).offsetHSL(rr(-dh, dh), rr(-ds, ds), rr(-dl, dl))

// ---------- build ----------

export function buildNature(root: THREE.Group) {
  // hills: polar grids following groundY
  const hillMat = turfMat()
  for (const h of hills) {
    const rings = 14
    const seg = 44
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= rings; i++)
      for (let k = 0; k <= seg; k++) {
        const rad = (i / rings) * h.r
        const a = (k / seg) * TAU
        const x = h.x + Math.cos(a) * rad
        const z = h.z + Math.sin(a) * rad
        pos.push(x, groundY(x, z) + 0.006, z)
        uv.push(x, z)
      }
    for (let i = 0; i < rings; i++)
      for (let k = 0; k < seg; k++) {
        const a = i * (seg + 1) + k
        const b = a + seg + 1
        idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = mesh(g, hillMat)
    m.castShadow = false
    m.userData.keep = true
    root.add(m)
    groundPatch(h.x, h.z, h.r * 1.08, h.r * 1.08, '#62a53d', 0.9)
  }

  // ----- pond -----
  groundPatch(POND.x, POND.z, POND.rx + 1.0, POND.rz + 1.0, '#5f9c3e', 0.7)
  groundPatch(POND.x, POND.z, POND.rx + 0.45, POND.rz + 0.45, '#d9c48e', 1)
  block(POND.x - 0.7, POND.z, 2.2)
  block(POND.x + 0.7, POND.z, 2.2)
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x3aa6cf, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 })
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 56), waterMat)
  water.rotation.x = -Math.PI / 2
  water.scale.set(POND.rx, POND.rz, 1)
  water.position.set(POND.x, 0.075, POND.z)
  water.receiveShadow = true
  water.userData.keep = true
  root.add(water)
  const bed = cyl(1, 1, 0.05, mat(0xcdb98a, { rough: 1 }), 48)
  bed.scale.set(POND.rx + 0.14, 1, POND.rz + 0.14)
  root.add(at(bed, POND.x, 0.012, POND.z))
  // expanding ripple rings
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
  const ripples = Array.from({ length: 4 }, (_, i) => {
    const m = rippleMat.clone()
    const ring = dyn(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), m))
    ring.rotation.x = -Math.PI / 2
    root.add(ring)
    return { ring, m, ph: i / 4, x: POND.x + rr(-1.2, 1.2), z: POND.z + rr(-0.8, 0.8) }
  })
  tick.push((_, t) => {
    for (const r of ripples) {
      const u = (t * 0.22 + r.ph) % 1
      if (u < 0.02) {
        r.x = POND.x + rr(-1.3, 1.3)
        r.z = POND.z + rr(-0.9, 0.9)
      }
      r.ring.position.set(r.x, 0.085, r.z)
      r.ring.scale.setScalar(0.15 + u * 0.75)
      r.m.opacity = 0.55 * (1 - u) * Math.min(1, u * 8)
    }
  })

  // ----- batches -----
  const leafGeo = lumpy(3, 0.2, 11)
  // canopies: balls of real leaves around a dark core that hides the gaps
  const leafMat = leafMaterial(windTime, SUN_DIR, { sway: 0.03, flutter: 0.04 })
  const clumps = new Batch(leafClump(31, 150, 0.4), leafMat)
  const airy = new Batch(leafClump(47, 105, 0.32, 0.8), leafMat)
  const shrub = new Batch(leafClump(59, 68, 0.48), leafMat)
  const boughs = new Batch(firTier(71, 185), leafMaterial(windTime, SUN_DIR, { sway: 0.015, flutter: 0.02, warm: 0.5, tips: 0.26 }))
  const cores = new Batch(lumpy(2, 0.14, 12), foliage(0xffffff, 0.02))
  // optional decoration applied to every clump of the tree being built
  let fruit: number | null = null
  let blossom: number | null = null
  const canopy = (x: number, y: number, z: number, r: number, squash: number, color: THREE.Color, batch = clumps, core = 0.7) => {
    batch.add(x, y, z, r, r * squash, r, color, 0, rand() * TAU, 0)
    cores.add(x, y, z, r * core, r * squash * core * 0.97, r * core, color.clone().multiplyScalar(0.68), rand() * 6, rand() * 6, rand() * 6)
    const dot = (el0: number, el1: number, size: number, flat: number, col: THREE.ColorRepresentation) => {
      const a = rand() * TAU
      const el = rr(el0, el1)
      petals.add(x + Math.cos(a) * Math.cos(el) * r * 0.98, y + Math.sin(el) * r * squash * 0.98, z + Math.sin(a) * Math.cos(el) * r * 0.98, size, size * flat, size, col)
    }
    if (fruit !== null) for (let i = 0; i < 4; i++) dot(-0.7, 0.5, 0.13, 1, jitter(fruit, 0.02, 0.05, 0.05))
    if (blossom !== null) for (let i = 0; i < 9; i++) dot(-0.3, 1.5, 0.085, 0.8, jitter(blossom, 0.01, 0.05, 0.04))
  }
  const litter = new Batch(fallenLeaf(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }), false)
  const scatterLitter = (x: number, z: number, radius: number, count: number, color: THREE.Color) => {
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU
      const d = Math.sqrt(rand()) * radius
      const lx = x + Math.cos(a) * d
      const lz = z + Math.sin(a) * d
      const sz = rr(0.2, 0.32)
      litter.add(lx, groundY(lx, lz) + rr(0.03, 0.07), lz, sz, sz, sz, color.clone().offsetHSL(rr(-0.03, 0.03), 0, rr(-0.08, 0.08)), rr(-0.3, 0.3), rand() * TAU, rr(-0.3, 0.3))
    }
  }
  const coneGeo = new THREE.ConeGeometry(1, 1, 10, 3)
  {
    const p = coneGeo.getAttribute('position')
    const r = mulberry(5)
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      // droop the skirt outward for a chunky fir silhouette
      const k = y < -0.45 ? 1.0 : 1 + (0.5 - y) * 0.12
      p.setXYZ(i, p.getX(i) * k + (r() - 0.5) * 0.04, y + (y < -0.45 ? -0.04 : 0), p.getZ(i) * k + (r() - 0.5) * 0.04)
    }
    coneGeo.translate(0, 0.5, 0)
    coneGeo.computeVertexNormals()
  }
  const cones = new Batch(coneGeo, foliage(0xffffff, 0.02))
  const trunkGeo = trunkGeometry(8)
  const trunks = new Batch(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: barkTexture(false) }))
  const birchTrunks = new Batch(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: barkTexture(true) }))
  const limbGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7).translate(0, 0.5, 0)
  const limbs = new Batch(limbGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }))
  const rockGeo = lumpy(1, 0.28, 3, true)
  const rocks = new Batch(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }))
  const grass = new Batch(grassTuft(7, 21), foliage(0xffffff, 0.12, true, 1), false)
  const petals = new Batch(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), false)
  const stems = new Batch(new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), false)

  const greens = [0x3f9336, 0x4fa53d, 0x66b544, 0x35823f, 0x7fbf45, 0x479a52]
  const special = [0xff9cc4, 0xf2c14e, 0xf08a4b, 0xffc2dc]
  const pines = [0x2f7f5a, 0x2a6f55, 0x3b8a57, 0x25645a]

  const P0 = new THREE.Vector3()
  const DIR = new THREE.Vector3()
  /** Limbs fan out from the top of the trunk; each carries a clump of leaves at its end. */
  const crown = (x: number, y: number, z: number, s: number, count: number, reach: number, lift: [number, number], size: [number, number], base: THREE.Color, bark: THREE.ColorRepresentation, batch = clumps, core = 0.7) => {
    const a0 = rand() * TAU
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * TAU + rr(-0.35, 0.35)
      const el = rr(lift[0], lift[1])
      DIR.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
      const len = reach * rr(0.85, 1.15)
      P0.set(x, y, z)
      limbs.addAlong(P0, DIR, 0.1 * s, len, 0.1 * s, bark)
      const r = s * rr(size[0], size[1])
      canopy(x + DIR.x * len, y + DIR.y * len + r * 0.25, z + DIR.z * len, r, 0.88, base.clone().offsetHSL(rr(-0.03, 0.03), rr(-0.06, 0.04), rr(-0.07, 0.05) + (el - 0.6) * 0.06), batch, core)
    }
  }

  const roundTree = (x: number, z: number, s: number, hex = pick(greens), birch = false, apples = false) => {
    const y = groundY(x, z)
    const base = new THREE.Color(hex)
    const pink = hex === special[0] || hex === special[3]
    fruit = apples ? 0xe2372c : null
    blossom = pink ? 0xfff4f8 : null
    // a carpet of fallen petals and leaves under the showier trees
    if (special.includes(hex)) scatterLitter(x, z, 2.3 * s, 34, base.clone().offsetHSL(0, 0, pink ? 0.06 : -0.04))
    else if (!birch) scatterLitter(x, z, 1.9 * s, 7, new THREE.Color(0xd9b24a))
    if (apples) for (let i = 0; i < 5; i++) petals.add(x + rr(-1.6, 1.6) * s, y + 0.12, z + rr(-1.6, 1.6) * s, 0.13, 0.13, 0.13, 0xe2372c)
    const tilt = [rr(-0.05, 0.05), rand() * TAU, rr(-0.05, 0.05)] as const
    if (birch) {
      // slender white stem, steep limbs, small airy sprays of pale leaves
      const th = 2.9 * s
      birchTrunks.add(x, y - 0.05, z, 0.17 * s, th, 0.17 * s, 0xffffff, ...tilt)
      crown(x, y + th * 0.62, z, s, 3, 1.0 * s, [0.55, 1.0], [0.6, 0.76], base, 0xe9e4d8, airy, 0.52)
      crown(x, y + th * 0.9, z, s, 3, 0.8 * s, [0.2, 0.7], [0.56, 0.7], base, 0xe9e4d8, airy, 0.52)
      canopy(x, y + th + 0.45 * s, z, 0.78 * s, 1.05, base.clone().offsetHSL(0.01, 0, 0.05), airy, 0.52)
    } else if (rand() < 0.3 && !special.includes(hex)) {
      // tall, narrow tree: clumps stacked up a straight leader
      const bark = jitter(0x8a5a38, 0.01, 0.05, 0.05)
      const th = 2.2 * s
      trunks.add(x, y - 0.05, z, 0.26 * s, th + 1.6 * s, 0.26 * s, bark, ...tilt)
      crown(x, y + th * 0.75, z, s, 4, 0.8 * s, [0.1, 0.45], [0.74, 0.92], base, bark)
      crown(x, y + th + 0.7 * s, z, s, 3, 0.62 * s, [0.3, 0.7], [0.66, 0.82], base, bark)
      canopy(x, y + th + 2.05 * s, z, 0.86 * s, 1.25, base.clone().offsetHSL(0.012, 0, 0.06))
    } else {
      // broad spreading crown, wider than it is tall
      const bark = jitter(0x8a5a38, 0.01, 0.05, 0.05)
      const th = 1.75 * s
      trunks.add(x, y - 0.05, z, 0.32 * s, th + 0.5 * s, 0.32 * s, bark, ...tilt)
      crown(x, y + th * 0.82, z, s, 5, 1.32 * s, [0.25, 0.6], [0.86, 1.06], base, bark)
      crown(x, y + th, z, s, 3, 1.0 * s, [0.8, 1.15], [0.8, 0.98], base, bark)
      canopy(x, y + th + 1.45 * s, z, 1.12 * s, 0.86, base.clone().offsetHSL(0.012, 0, 0.06))
      // a heart of foliage that fuses the limb clumps into one crown
      canopy(x, y + th + 0.75 * s, z, 1.3 * s, 0.7, base.clone().offsetHSL(0, 0, -0.03))
    }
    fruit = blossom = null
    block(x, z, 0.75 * s)
  }

  const pine = (x: number, z: number, s: number) => {
    const y = groundY(x, z)
    const hex = pick(pines)
    trunks.add(x, y - 0.05, z, 0.21 * s, 1.5 * s, 0.21 * s, jitter(0x7a4c30, 0.01, 0.05, 0.04), 0, rand() * TAU, 0)
    const tiers = 6
    for (let i = 0; i < tiers; i++) {
      const u = i / (tiers - 1)
      const r = (1.26 - u * 0.92) * s
      const h = (1.2 - u * 0.25) * s
      const yy = y + (0.62 + i * 0.56) * s
      const col = new THREE.Color(hex).offsetHSL(rr(-0.015, 0.015), 0, u * 0.08 + rr(-0.02, 0.02))
      boughs.add(x, yy, z, r, h, r, col, 0, rand() * 6, 0)
      cones.add(x, yy + h * 0.03, z, r * 0.84, h * 0.92, r * 0.84, col.clone().multiplyScalar(0.72), 0, rand() * 6, 0)
    }
    block(x, z, 0.7 * s)
  }

  const bush = (x: number, z: number, s: number, hex = pick(greens), berries = rand() < 0.4) => {
    const y = groundY(x, z)
    const base = new THREE.Color(hex)
    const n = 3 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand()
      const r = s * rr(0.42, 0.62)
      const d = i === 0 ? 0 : s * 0.42
      canopy(x + Math.cos(a) * d, y + r * 0.62, z + Math.sin(a) * d, r, 0.82, base.clone().offsetHSL(rr(-0.02, 0.02), 0, rr(-0.04, 0.07)), shrub)
      if (berries) {
        const col = pick([0xff5a6e, 0xffd24a, 0xffffff, 0xff9a4a])
        for (let k = 0; k < 5; k++) {
          const ba = rand() * TAU
          const be = rr(0.2, 1.3)
          petals.add(x + Math.cos(a) * d + Math.cos(ba) * Math.cos(be) * r, y + r * 0.62 + Math.sin(be) * r * 0.82, z + Math.sin(a) * d + Math.sin(ba) * Math.cos(be) * r, 0.085, 0.085, 0.085, col)
        }
      }
    }
    block(x, z, 0.5 * s)
  }

  const rock = (x: number, z: number, s: number) => {
    rocks.add(x, groundY(x, z) + s * 0.3, z, s, s * rr(0.55, 0.8), s * rr(0.7, 1.1), jitter(0xa9a59c, 0.02, 0.03, 0.06), rand(), rand() * 6, rand())
  }

  const flower = (x: number, z: number, col: number) => {
    const y = groundY(x, z)
    const h = rr(0.28, 0.5)
    stems.add(x, y, z, 0.022, h, 0.022, 0x4f9a3d, rr(-0.15, 0.15), 0, rr(-0.15, 0.15))
    petals.add(x, y + h, z, 0.15, 0.07, 0.15, jitter(col, 0.02, 0.05, 0.05), 0, rand() * 6, 0)
    petals.add(x, y + h + 0.05, z, 0.06, 0.05, 0.06, 0xffd84a)
  }

  // ----- hero trees (hand placed) -----
  const heroes: [number, number, number, number?][] = [
    [-25.2, 17.2, 1.6, 0x5fb347],
    [-6.3, -8.2, 1.0],
    [22.6, -5.4, 1.25, special[0]],
    [17.8, 12.4, 1.05, special[3]],
    [10.2, -9.8, 1.1],
    [-23.4, -8.8, 1.3],
    [-17.0, -9.6, 1.1, special[2]],
    [-12.4, 2.6, 0.95],
    [-10.5, 16.8, 1.15, special[1]],
    [-4.6, 17.2, 0.95],
    [10.2, 16.6, 1.0],
    [11.0, -15.2, 1.0],
    [22.4, 1.6, 0.95, 0x8cc84f],
  ]
  for (const [x, z, s, c] of heroes) roundTree(x, z, s, c, false, (x === -12.4 && z === 2.6) || (x === 10.2 && z === 16.6))
  // firs in the lens between the two loops and on the hills
  for (const [x, z, s] of [
    [4.5, -3.6, 0.8],
    [4.6, -6.6, 0.7],
    [3.0, 3.4, 0.75],
    [-22, -15.8, 1.5],
    [-24.6, -13.4, 1.1],
    [-19.6, -17.6, 1.2],
    [-24.4, -18.4, 1.0],
    [-20.2, -12.6, 1.0],
    [-7.6, -19.2, 1.2],
    [-5.8, -20.5, 0.9],
    [-9.5, -20.3, 0.9],
    [24.6, -17.4, 1.3],
    [27.0, -15.2, 1.0],
    [22.6, -19.6, 1.0],
    [27.0, -19.4, 0.9],
    [25.2, 17.4, 1.25],
    [27.2, 15.2, 0.95],
    [23.4, 19.6, 1.0],
    [27.0, 19.8, 0.9],
  ]) {
    pine(x, z, s)
  }
  // birches
  for (const [x, z] of [
    [27.7, -1.0],
    [-27.6, -9.0],
    [2.6, 21.4],
    [-27.4, 12.6],
    [16.6, 17.0],
    [23.2, 13.4],
  ]) {
    roundTree(x, z, 0.85, 0x9bd45a, true)
  }

  // keep sight lines to the crossing and paths open
  block(CROSSING.x, CROSSING.z, 3.6)
  for (const [x, z] of [
    [-15, 3.4],
    [-11.5, 5.0],
    [13.9, 6.5],
    [13.7, 9.5],
    [-11, 20.2],
  ])
    block(x, z, 0.8)

  // ----- scatter -----
  const scatter = (count: number, r: number, fn: (x: number, z: number) => void, tries = 40) => {
    let made = 0
    for (let i = 0; i < count * tries && made < count; i++) {
      const x = rr(-BOARD.w / 2, BOARD.w / 2)
      const z = rr(-BOARD.d / 2, BOARD.d / 2)
      if (!free(x, z, r)) continue
      fn(x, z)
      made++
    }
  }
  scatter(26, 1.0, (x, z) => roundTree(x, z, rr(0.7, 1.0), rand() < 0.14 ? pick(special) : pick(greens)))
  scatter(28, 0.8, (x, z) => pine(x, z, rr(0.65, 1.0)))
  scatter(110, 0.45, (x, z) => bush(x, z, rr(0.6, 1.05)))
  scatter(70, 0.3, (x, z) => rock(x, z, rr(0.18, 0.42)))
  // rocks ringing the pond
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + rr(-0.1, 0.1)
    rock(POND.x + Math.cos(a) * (POND.rx + 0.2), POND.z + Math.sin(a) * (POND.rz + 0.2), rr(0.2, 0.38))
  }
  // flower drifts
  scatter(100, 0.35, (x, z) => {
    const col = pick([0xff6f91, 0xffc94d, 0xffffff, 0xff8f5a, 0xc38cff, 0xff5a5a, 0x7fb8ff])
    const n = 4 + Math.floor(rand() * 6)
    for (let i = 0; i < n; i++) {
      const fx = x + rr(-0.7, 0.7)
      const fz = z + rr(-0.7, 0.7)
      if (free(fx, fz, 0.05)) flower(fx, fz, col)
    }
  })
  // grass tufts: unblocked, so they crowd right up against everything
  const grassCols = [0x62ad3f, 0x529c3b, 0x78bd47, 0x478f3e, 0x8cc850]
  for (let i = 0, made = 0; i < 60000 && made < 8000; i++) {
    const x = rr(-BOARD.w / 2, BOARD.w / 2)
    const z = rr(-BOARD.d / 2, BOARD.d / 2)
    if (!onBoard(x, z, 0.35) || !free(x, z, -0.25)) continue
    const s = rr(0.55, 1.15)
    grass.add(x, groundY(x, z), z, s, s * rr(0.7, 1.25), s, jitter(pick(grassCols), 0.015, 0.05, 0.04), 0, rand() * TAU, 0)
    made++
  }
  // tufts and flowers climbing the embankment slopes
  for (let i = 0, made = 0; i < 12000 && made < 1400; i++) {
    const sb = rand() * trackB.length
    const h = trackB.height(sb)
    const L = trackB.length
    if (h < 0.06 || Math.abs(((sb - trackB.bridgeS! + L * 1.5) % L) - L / 2) < BRIDGE_HALF + 0.3) continue
    const u = rr(0.08, 1)
    const lat = (rand() < 0.5 ? -1 : 1) * (1.38 + u * h * 0.75)
    const f = trackB.frame(sb)
    const x = f.x + f.nx * lat
    const z = f.z + f.nz * lat
    const s = rr(0.5, 1.0)
    grass.add(x, h * (1 - u) - 0.03, z, s, s * rr(0.7, 1.2), s, jitter(pick(grassCols), 0.015, 0.05, 0.04), 0, rand() * TAU, 0)
    if (made % 14 === 0) {
      stems.add(x, h * (1 - u), z, 0.022, 0.4, 0.022, 0x4f9a3d)
      petals.add(x, h * (1 - u) + 0.4, z, 0.15, 0.07, 0.15, pick([0xffffff, 0xffc94d, 0xff8fb0]), 0, rand() * 6, 0)
    }
    made++
  }
  // wheat
  for (let i = 0; i < 520; i++) {
    const a = rand() * TAU
    const d = Math.sqrt(rand())
    const x = -6.6 + Math.cos(a) * d * 2.3
    const z = 0.4 + Math.sin(a) * d * 1.55
    grass.add(x, 0, z, 0.8, rr(1.5, 1.9), 0.8, jitter(0xe6c04f, 0.01, 0.05, 0.05), 0, rand() * TAU, 0)
  }
  block(-6.6, 0.4, 2.3)

  clumps.build(root)
  litter.build(root)
  airy.build(root)
  shrub.build(root)
  boughs.build(root)
  cores.build(root)
  limbs.build(root)
  birchTrunks.build(root)
  cones.build(root)
  trunks.build(root)
  rocks.build(root)
  grass.build(root)
  petals.build(root)
  stems.build(root)

  // ----- small hand-built plants (baked) -----
  const stemMat = mat(0x4f9a3d, { rough: 0.9 })
  // reeds + lily pads
  for (let i = 0; i < 16; i++) {
    const a = rr(2.2, 5.2)
    const x = POND.x + Math.cos(a) * (POND.rx - 0.15)
    const z = POND.z + Math.sin(a) * (POND.rz - 0.15)
    const h = rr(0.8, 1.4)
    root.add(at(cyl(0.025, 0.035, h, stemMat, 5), x, h / 2, z, rr(-0.1, 0.1), 0, rr(-0.1, 0.1)))
    root.add(at(cyl(0.06, 0.06, 0.26, mat(0x7a4a2b, { rough: 1 }), 6), x, h, z))
  }
  const pad = mat(0x4fae58, { rough: 0.5 })
  for (let i = 0; i < 7; i++) {
    const a = rand() * TAU
    const d = rr(0.2, 0.75)
    const x = POND.x + Math.cos(a) * POND.rx * d
    const z = POND.z + Math.sin(a) * POND.rz * d
    const r = rr(0.18, 0.3)
    root.add(at(cyl(r, r, 0.03, pad, 12), x, 0.09, z))
    if (i % 2 === 0) root.add(at(sph(0.09, mat(0xffc1dc, { rough: 0.5 }), 8, 6), x, 0.15, z))
  }
  // mushrooms
  const cap = mat(0xe8483f, { rough: 0.45 })
  const spot = mat(0xffffff, { rough: 0.6 })
  const stalk = mat(0xfff3e0, { rough: 0.8 })
  scatter(34, 0.25, (x, z) => {
    const s = rr(0.7, 1.3)
    const y = groundY(x, z)
    const g = grp(at(cyl(0.07 * s, 0.09 * s, 0.24 * s, stalk, 8), 0, 0.12 * s, 0), at(blob(0.22 * s, 0.15 * s, 0.22 * s, cap), 0, 0.26 * s, 0))
    for (let i = 0; i < 4; i++) g.add(at(sph(0.035 * s, spot, 6, 5), Math.cos(i * 1.7) * 0.13 * s, 0.36 * s, Math.sin(i * 1.7) * 0.13 * s))
    root.add(at(g, x, y, z))
  })
  // sunflowers by the cottage, pumpkins by the barn
  const petal = mat(0xffcc33, { rough: 0.6 })
  const seed = mat(0x6b4226, { rough: 0.9 })
  for (const [x, z] of [
    [-18.2, 17.2],
    [-17.6, 16.6],
    [-18.7, 18.2],
    [-12.9, 17.0],
    [-12.6, 17.8],
    [-13.4, 20.7],
  ]) {
    const h = rr(1.3, 1.9)
    const g = grp(at(cyl(0.04, 0.05, h, stemMat, 6), 0, h / 2, 0), at(blob(0.2, 0.06, 0.12, stemMat), 0.16, h * 0.5, 0, 0, 0, 0.5))
    const head = grp(at(cyl(0.17, 0.17, 0.07, seed, 12), 0, 0, 0, Math.PI / 2))
    for (let i = 0; i < 12; i++) head.add(at(blob(0.14, 0.05, 0.03, petal), Math.cos((i / 12) * TAU) * 0.24, Math.sin((i / 12) * TAU) * 0.24, 0, 0, 0, (i / 12) * TAU))
    g.add(at(head, 0, h, 0.04, -0.35, 0, 0))
    root.add(at(g, x, 0, z, 0, rr(-0.6, 0.6) + 0.6, 0))
  }
  const pumpkin = mat(0xf08a2c, { rough: 0.55 })
  for (const [x, z, s] of [
    [-17.6, -1.2, 0.3],
    [-17.1, -0.7, 0.22],
    [-18.1, -0.6, 0.25],
    [-9.3, 2.0, 0.26],
    [-8.8, 2.5, 0.2],
    [-13.2, 20.0, 0.24],
  ]) {
    root.add(at(grp(at(blob(s, s * 0.74, s, pumpkin), 0, s * 0.7, 0), at(cyl(0.03, 0.04, 0.12, stemMat, 5), 0, s * 1.45, 0)), x, 0, z))
  }

  // ----- drifting toy clouds -----
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 1 })
  for (let i = 0; i < 3; i++) {
    const c = dyn(grp())
    const n = 5 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(leafGeo, cloudMat)
      const r = rr(0.5, 0.85) * (k === 0 ? 1.3 : 1)
      s.scale.set(r, r * 0.72, r)
      s.position.set((k - n / 2) * 0.6 + rr(-0.15, 0.15), rr(-0.1, 0.25), rr(-0.3, 0.3))
      s.castShadow = true
      c.add(s)
    }
    const z0 = -15 + i * 14 + rr(-1, 1)
    const y0 = 8.5 + rr(0, 1.5)
    const sp = rr(0.35, 0.6)
    const off = rand() * 86
    tick.push((_, t) => {
      const u = ((t * sp + off) % 86) / 86
      c.position.set(-43 + u * 86, y0 + Math.sin(t * 0.5 + i) * 0.25, z0)
      const edge = Math.min(1, Math.min(u, 1 - u) * 8)
      c.scale.setScalar(0.001 + edge)
    })
    root.add(c)
  }
}
