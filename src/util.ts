import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// ---------- deterministic randomness ----------

export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rand = mulberry(20261110)
export const rr = (a: number, b: number) => a + (b - a) * rand()
export const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const mod = (v: number, m: number) => ((v % m) + m) % m
export const smooth = (t: number) => {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}

// ---------- canvas textures ----------

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: [number, number]; srgb?: boolean } = {},
) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1])
  t.anisotropy = 8
  return t
}

/** Greyscale-ish detail textures meant to be tinted by the material colour. */
export const tex = {
  planks: (rx: number, ry: number) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#f4f4f4'
        g.fillRect(0, 0, w, h)
        const rows = 4
        for (let i = 0; i < rows; i++) {
          const y = (i * h) / rows
          g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.07})`
          g.fillRect(0, y, w, h / rows)
          for (let k = 0; k < 14; k++) {
            g.strokeStyle = `rgba(60,40,20,${0.03 + rand() * 0.06})`
            g.lineWidth = 1 + rand() * 2
            const yy = y + rand() * (h / rows)
            g.beginPath()
            g.moveTo(0, yy)
            g.bezierCurveTo(w * 0.3, yy + rr(-3, 3), w * 0.6, yy + rr(-3, 3), w, yy)
            g.stroke()
          }
          g.fillStyle = 'rgba(0,0,0,0.38)'
          g.fillRect(0, y, w, 5)
          g.fillStyle = 'rgba(255,255,255,0.35)'
          g.fillRect(0, y + 5, w, 3)
        }
      },
      { repeat: [rx, ry] },
    ),
  shingles: (rx: number, ry: number) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#e9e9e9'
        g.fillRect(0, 0, w, h)
        const rows = 4
        const cols = 4
        const rh = h / rows
        const cw = w / cols
        for (let r = 0; r < rows; r++) {
          for (let c = -1; c <= cols; c++) {
            const x = c * cw + (r % 2 ? cw / 2 : 0)
            const y = r * rh
            const shade = 215 + Math.floor(rand() * 40)
            g.fillStyle = `rgb(${shade},${shade},${shade})`
            g.beginPath()
            g.moveTo(x + 2, y)
            g.lineTo(x + cw - 2, y)
            g.lineTo(x + cw - 2, y + rh * 0.55)
            g.quadraticCurveTo(x + cw / 2, y + rh * 1.25, x + 2, y + rh * 0.55)
            g.closePath()
            g.fill()
            g.strokeStyle = 'rgba(0,0,0,0.35)'
            g.lineWidth = 4
            g.stroke()
          }
          const grad = g.createLinearGradient(0, r * rh, 0, r * rh + rh * 0.45)
          grad.addColorStop(0, 'rgba(0,0,0,0.4)')
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          g.fillStyle = grad
          g.fillRect(0, r * rh, w, rh * 0.45)
        }
      },
      { repeat: [rx, ry] },
    ),
  bricks: (rx: number, ry: number) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#b9b2a8'
        g.fillRect(0, 0, w, h)
        const rows = 6
        const cols = 3
        for (let r = 0; r < rows; r++)
          for (let c = -1; c <= cols; c++) {
            const s = 205 + Math.floor(rand() * 50)
            g.fillStyle = `rgb(${s},${s},${s})`
            const x = (c + (r % 2 ? 0.5 : 0)) * (w / cols)
            g.beginPath()
            g.roundRect(x + 4, (r * h) / rows + 4, w / cols - 8, h / rows - 8, 8)
            g.fill()
          }
      },
      { repeat: [rx, ry] },
    ),
  gravel: (rx: number, ry: number) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#d8d8d8'
        g.fillRect(0, 0, w, h)
        for (let i = 0; i < 1400; i++) {
          const s = 150 + Math.floor(rand() * 105)
          g.fillStyle = `rgb(${s},${s},${s})`
          g.beginPath()
          g.ellipse(rand() * w, rand() * h, rr(3, 8), rr(2, 6), rand() * 3, 0, TAU)
          g.fill()
        }
      },
      { repeat: [rx, ry] },
    ),
  wood: (rx: number, ry: number) =>
    canvasTexture(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = '#efefef'
        g.fillRect(0, 0, w, h)
        for (let i = 0; i < 260; i++) {
          g.strokeStyle = `rgba(40,20,5,${0.03 + rand() * 0.08})`
          g.lineWidth = 1 + rand() * 3
          const y = rand() * h
          g.beginPath()
          g.moveTo(0, y)
          g.bezierCurveTo(w * 0.33, y + rr(-8, 8), w * 0.66, y + rr(-8, 8), w, y)
          g.stroke()
        }
      },
      { repeat: [rx, ry] },
    ),
}

// ---------- materials ----------

export interface MatOpts {
  rough?: number
  metal?: number
  emissive?: number
  emissiveIntensity?: number
  clearcoat?: number
  map?: THREE.Texture
  side?: THREE.Side
  flat?: boolean
  env?: number
}

const matCache = new Map<string, THREE.MeshStandardMaterial>()

export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = [color, o.rough, o.metal, o.emissive, o.emissiveIntensity, o.clearcoat, o.map?.uuid, o.side, o.flat, o.env].join('|')
  const hit = matCache.get(key)
  if (hit) return hit
  const params: THREE.MeshPhysicalMaterialParameters = {
    color,
    roughness: o.rough ?? 0.72,
    metalness: o.metal ?? 0,
    map: o.map ?? null,
    side: o.side ?? THREE.FrontSide,
    flatShading: o.flat ?? false,
    envMapIntensity: o.env ?? 0.55,
  }
  if (o.emissive !== undefined) {
    params.emissive = o.emissive
    params.emissiveIntensity = o.emissiveIntensity ?? 1
  }
  let m: THREE.MeshStandardMaterial
  if (o.clearcoat) {
    m = new THREE.MeshPhysicalMaterial({ ...params, clearcoat: o.clearcoat, clearcoatRoughness: 0.3 })
  } else {
    m = new THREE.MeshStandardMaterial(params)
  }
  matCache.set(key, m)
  return m
}

let turfCache: THREE.MeshStandardMaterial | null = null
/** Mottled grass used for hills and embankments so they match the painted board. */
export function turfMat() {
  if (turfCache) return turfCache
  const map = canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, w, h)
      const cols = ['#d8f0b0', '#b9dc92', '#f4ffd0', '#a8d184']
      for (let i = 0; i < 500; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = rr(14, 60)
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        const c = cols[Math.floor(rand() * cols.length)]
        grad.addColorStop(0, c)
        grad.addColorStop(1, c + '00')
        g.globalAlpha = 0.35
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
    },
    { repeat: [0.14, 0.14] },
  )
  turfCache = mat(0x6cae42, { rough: 1, map, env: 0.3 })
  return turfCache
}

/** Glossy toy paint. */
export const paint = (color: number) => mat(color, { rough: 0.4, clearcoat: 0.8, env: 0.8 })

// ---------- mesh helpers ----------

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function box(w: number, h: number, d: number, m: THREE.Material, r = 0.06) {
  const rad = Math.min(r, Math.min(w, h, d) * 0.49)
  return shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), m))
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 20) {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m))
}

export function sph(r: number, m: THREE.Material, ws = 20, hs = 14) {
  return shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m))
}

export function cone(r: number, h: number, m: THREE.Material, seg = 16) {
  return shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m))
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material) {
  return shadowed(new THREE.Mesh(g, m))
}

/** Capsule-ish blob: a sphere stretched per axis. */
export function blob(rx: number, ry: number, rz: number, m: THREE.Material) {
  const s = sph(1, m, 20, 14)
  s.scale.set(rx, ry, rz)
  return s
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  return o
}

export function grp(...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  if (children.length) g.add(...children)
  return g
}

/** Mark a subtree as animated so `bake` leaves it alone. */
export function dyn<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true
  return o
}

/** Extruded 2D outline (x,y) with depth along z, centred on z. */
export function prism(points: [number, number][], depth: number, m: THREE.Material, bevel = 0) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  })
  g.translate(0, 0, -depth / 2)
  return mesh(g, m)
}

/** A lumpy icosphere: cartoon foliage, clouds, smoke, rocks. */
export function lumpy(detail: number, amount: number, seed: number, flat = false) {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.getAttribute('position')
  const v = new THREE.Vector3()
  const r = mulberry(seed)
  const dirs = Array.from({ length: 7 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize())
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    let n = 0
    dirs.forEach((d, k) => (n += Math.sin(v.dot(d) * (3 + k * 0.9) + k) / dirs.length))
    v.multiplyScalar(1 + n * amount)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  if (!flat) {
    // icosahedron is non-indexed: smooth normals come from the (near-spherical) position
    const nrm = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize()
      nrm.setXYZ(i, v.x, v.y, v.z)
    }
  } else g.computeVertexNormals()
  return g
}

// ---------- static geometry baking ----------

/**
 * Merges every static mesh under `root` into one mesh per material, cutting
 * draw calls from thousands to dozens. Subtrees flagged with `dyn()` and
 * instanced meshes are left in place.
 */
export function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>()
  const remove: THREE.Mesh[] = []

  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.userData.dynamic) return
    const m = o as THREE.Mesh
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && !m.userData.keep) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
      if (m.matrixWorld.determinant() < 0) {
        // mirrored transform: flip winding
        const p = g.getAttribute('position')
        const idx: number[] = []
        for (let i = 0; i < p.count; i += 3) idx.push(i, i + 2, i + 1)
        g.setIndex(idx)
        g = g.toNonIndexed()
      }
      const clean = new THREE.BufferGeometry()
      clean.setAttribute('position', g.getAttribute('position'))
      clean.setAttribute('normal', g.getAttribute('normal'))
      const uv = g.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)
      clean.setAttribute('uv', uv)
      let b = buckets.get(m.material)
      if (!b) buckets.set(m.material, (b = { geos: [], cast: m.castShadow, receive: m.receiveShadow }))
      b.geos.push(clean)
      remove.push(m)
    }
    for (const c of [...o.children]) visit(c)
  }
  visit(root)

  for (const m of remove) {
    // keep any children (rare) attached to the scene graph
    if (m.children.length === 0) m.removeFromParent()
    else {
      m.geometry = new THREE.BufferGeometry()
      m.visible = true
    }
  }
  for (const [material, b] of buckets) {
    const merged = mergeGeometries(b.geos, false)
    if (!merged) continue
    const out = new THREE.Mesh(merged, material)
    out.castShadow = b.cast
    out.receiveShadow = b.receive
    root.add(out)
  }
}

// ---------- shared animation hooks ----------

/** Per-frame callbacks registered by anything that moves. */
export const tick: ((dt: number, time: number) => void)[] = []
/** World-space chimney tops that should puff smoke. */
export const chimneys: THREE.Vector3[] = []
/** World-space open fires: smoke and embers. */
export const fires: THREE.Vector3[] = []

/** Collapse an animated part into one mesh per material, then flag it as dynamic. */
export function frozen<T extends THREE.Object3D>(o: T): T {
  bake(o)
  return dyn(o)
}
