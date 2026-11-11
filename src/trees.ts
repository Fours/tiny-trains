import * as THREE from 'three'
import { mulberry } from './util.ts'

// ---------- instanced batches ----------

export class Batch {
  private items: { m: THREE.Matrix4; c: THREE.Color }[] = []
  private d = new THREE.Object3D()
  private geo: THREE.BufferGeometry
  private material: THREE.Material
  private cast: boolean
  constructor(geo: THREE.BufferGeometry, material: THREE.Material, cast = true) {
    this.geo = geo
    this.material = material
    this.cast = cast
  }
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, rx = 0, ry = 0, rz = 0) {
    this.d.position.set(x, y, z)
    this.d.scale.set(sx, sy, sz)
    this.d.rotation.set(rx, ry, rz)
    this.d.updateMatrix()
    this.items.push({ m: this.d.matrix.clone(), c: new THREE.Color(color) })
  }
  /** Add with an explicit orientation: local +y is pointed along `dir`. */
  addAlong(pos: THREE.Vector3, dir: THREE.Vector3, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, twist = 0) {
    this.d.position.copy(pos)
    this.d.scale.set(sx, sy, sz)
    this.d.quaternion.setFromUnitVectors(UP, dir.clone().normalize())
    this.d.rotateY(twist)
    this.d.updateMatrix()
    this.items.push({ m: this.d.matrix.clone(), c: new THREE.Color(color) })
    this.d.rotation.set(0, 0, 0)
  }
  build(root: THREE.Group) {
    if (!this.items.length) return
    const im = new THREE.InstancedMesh(this.geo, this.material, this.items.length)
    this.items.forEach((it, i) => {
      im.setMatrixAt(i, it.m)
      im.setColorAt(i, it.c)
    })
    im.castShadow = this.cast
    im.receiveShadow = true
    im.frustumCulled = false
    root.add(im)
  }
}

const UP = new THREE.Vector3(0, 1, 0)

/** Direction toward the sun; the key light and the leaf translucency both use it. */
export const SUN_DIR = new THREE.Vector3(-36, 30, 22).normalize()

// ---------- leaf geometry ----------
// Canopies are built from real leaf-shaped polygons rather than alpha-tested
// cards, so shadows, ambient occlusion and depth of field all see true leaves.

interface LeafSpec {
  /** centre */
  c: THREE.Vector3
  /** soft shading normal (direction out of the canopy) */
  soft: THREE.Vector3
  /** the leaf's own facing */
  face: THREE.Vector3
  /** direction from stem to tip */
  tip: THREE.Vector3
  len: number
  width: number
}

function leafGeometry(specs: LeafSpec[], seed: number, softness = 0.72) {
  const r = mulberry(seed)
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const leaf: number[] = []
  const side = new THREE.Vector3()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (const s of specs) {
    side.crossVectors(s.face, s.tip).normalize()
    const phase = r()
    const tint = r() * 2 - 1
    // a pointed oval with a raised midrib: base, two shoulders, ridge, tip
    const P = (along: number, across: number, lift: number): [number, number, number, number, number, number] => {
      v.copy(s.c)
        .addScaledVector(s.tip, along * s.len)
        .addScaledVector(side, across * s.width)
        .addScaledVector(s.face, lift * s.width)
      n.copy(s.soft)
        .multiplyScalar(softness)
        .addScaledVector(s.face, 1 - softness)
        .addScaledVector(side, across * 0.5)
        .normalize()
      return [v.x, v.y, v.z, n.x, n.y, n.z]
    }
    // a rounded, pointed blade fanned around a raised midrib point
    const ridge = P(0, 0, 0.17)
    const rim: [ReturnType<typeof P>, number, number][] = [
      [P(-0.5, 0, 0), 0, 0.5],
      [P(-0.27, 0.4, 0.02), 0.23, 0.9],
      [P(0.12, 0.47, 0), 0.62, 0.97],
      [P(0.5, 0, -0.07), 1, 0.5],
      [P(0.12, -0.47, 0), 0.62, 0.03],
      [P(-0.27, -0.4, 0.02), 0.23, 0.1],
    ]
    const tris = rim.map((a, i) => [a, rim[(i + 1) % rim.length], [ridge, 0.5, 0.5] as [ReturnType<typeof P>, number, number]])
    for (const t of tris)
      for (const [p, u, w] of t) {
        pos.push(p[0], p[1], p[2])
        nrm.push(p[3], p[4], p[5])
        uv.push(u, w)
        leaf.push(phase, tint)
      }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(leaf, 2))
  return g
}

function randomUnit(r: () => number, out = new THREE.Vector3()) {
  const y = r() * 2 - 1
  const a = r() * Math.PI * 2
  const k = Math.sqrt(1 - y * y)
  return out.set(Math.cos(a) * k, y, Math.sin(a) * k)
}

/** A ball of leaves: the building block of every broadleaf canopy and bush. */
export function leafClump(seed: number, count: number, leafLen: number, droop = 0.35) {
  const r = mulberry(seed)
  const specs: LeafSpec[] = []
  const tmp = new THREE.Vector3()
  while (specs.length < count) {
    const d = randomUnit(r)
    // thin out the underside so branches can show through
    if (d.y < -0.35 && r() < 0.6) continue
    const rad = 0.74 + r() * 0.3
    const c = d.clone().multiplyScalar(rad)
    // tilt the face away from the pure outward direction
    const face = d
      .clone()
      .addScaledVector(randomUnit(r, tmp), 0.55)
      .normalize()
    // leaves hang: the tip heads along the surface, biased downward and outward
    const tip = randomUnit(r, tmp).clone()
    tip.y -= droop
    tip.addScaledVector(d, 0.25)
    tip.addScaledVector(face, -tip.dot(face)).normalize()
    const len = leafLen * (0.75 + r() * 0.5)
    specs.push({ c, soft: d, face, tip, len, width: len * (0.62 + r() * 0.14) })
  }
  return leafGeometry(specs, seed + 1)
}

// ---------- leaf material ----------

export interface LeafMatOpts {
  /** whole-clump sway, in local units */
  sway: number
  /** per-leaf flutter */
  flutter: number
  /** how strongly sunlit leaves warm up */
  warm?: number
  /** how much lighter the tips of the leaves are than their stems (fresh growth) */
  tips?: number
}

export function leafMaterial(windTime: { value: number }, sunDir: THREE.Vector3, o: LeafMatOpts) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, envMapIntensity: 0.3, side: THREE.DoubleSide })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windTime
    sh.uniforms.uSun = { value: sunDir }
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uSun;
        attribute vec2 aLeaf;
        varying float vShade;
        varying float vTint;
        varying float vTip;
        varying float vBack;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wn = normal;
        vec3 wp = position;
        #ifdef USE_INSTANCING
          wn = normalize(mat3(instanceMatrix) * normal);
          wp = (instanceMatrix * vec4(position, 1.0)).xyz;
        #endif
        vShade = wn.y;
        vTint = aLeaf.y;
        vTip = uv.x;
        float w1 = sin(uTime * 1.5 + wp.x * 0.42 + wp.z * 0.36);
        float w2 = sin(uTime * 2.9 + wp.x * 0.9 - wp.z * 0.7);
        // each leaf trembles on its stem, most at the tip
        float fl = sin(uTime * (4.5 + aLeaf.x * 4.0) + aLeaf.x * 40.0) * (0.6 + 0.4 * w2);
        transformed += normal * fl * ${o.flutter.toFixed(4)} * uv.x;
        transformed.x += (w1 + 0.4 * w2) * ${o.sway.toFixed(4)};
        transformed.z += (w2 * 0.7 + 0.3 * w1) * ${(o.sway * 0.6).toFixed(4)};
        // sun shining through the canopy toward the viewer
        vBack = clamp(-dot(normalize(cameraPosition - wp), uSun), 0.0, 1.0);`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vShade;
        varying float vTint;
        varying float vTip;
        varying float vBack;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lit = smoothstep(-0.85, 0.9, vShade);
        diffuseColor.rgb *= mix(0.66, 1.22, lit) * (1.0 + vTint * 0.2) * mix(${(1 - (o.tips ?? 0.1)).toFixed(2)}, ${(1 + (o.tips ?? 0.1)).toFixed(2)}, vTip);
        // sunlit leaves warm toward yellow, shaded ones cool toward blue-green
        diffuseColor.rgb += vec3(0.075, 0.06, -0.03) * max(vTint, 0.0) * lit * ${(o.warm ?? 1).toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.88, 0.98, 1.06), (1.0 - lit) * 0.2);`,
      )
      // light leaves by the canopy's soft normal whichever way the polygon faces
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuseColor.rgb * (vBack * vBack * 0.6 + rim * 0.1);`,
      )
  }
  return m
}

/** One tier of a fir: needle sprays laid down a cone, hanging past the rim as a ragged skirt. */
export function firTier(seed: number, count: number) {
  const r = mulberry(seed)
  const specs: LeafSpec[] = []
  const tmp = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const t = Math.pow(r(), 1.7)
    const a = r() * Math.PI * 2
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const c = out.clone().multiplyScalar((1 - t) * (0.96 + r() * 0.1))
    c.y = t * 0.94 + (r() - 0.5) * 0.04
    const soft = out.clone().multiplyScalar(1.0).add(new THREE.Vector3(0, 0.75, 0)).normalize()
    const face = soft.clone().addScaledVector(randomUnit(r, tmp), 0.35).normalize()
    // boughs sweep outward and down, drooping hardest at the rim
    const tip = out
      .clone()
      .add(new THREE.Vector3(0, -0.55 - (1 - t) * 0.45, 0))
      .addScaledVector(randomUnit(r, tmp), 0.3)
    tip.addScaledVector(face, -tip.dot(face)).normalize()
    const len = (0.34 + (1 - t) * 0.26) * (0.8 + r() * 0.45)
    specs.push({ c, soft, face, tip, len, width: len * (0.4 + r() * 0.12) })
  }
  return leafGeometry(specs, seed + 1, 0.6)
}

/** A single leaf lying flat, for litter under the trees. */
export function fallenLeaf() {
  return leafGeometry([{ c: new THREE.Vector3(), soft: UP.clone(), face: UP.clone(), tip: new THREE.Vector3(1, 0, 0), len: 1, width: 0.66 }], 5, 1)
}

// ---------- trunks ----------

/** Unit trunk (height 1, radius ~1 at the base): flared roots, a gentle S-curve and a taper. */
export function trunkGeometry(seed: number) {
  const r = mulberry(seed)
  const rings = 10
  const seg = 12
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const ph = [r() * 6, r() * 6, r() * 6]
  for (let i = 0; i <= rings; i++) {
    const y = i / rings
    const taper = 0.6 + 0.4 * (1 - y) ** 2
    const flare = 0.75 * Math.exp(-y * 13)
    const ox = 0.1 * Math.sin(y * 4.2 + ph[0])
    const oz = 0.08 * Math.sin(y * 3.1 + ph[1])
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      // buttress roots: lobes that fade out up the trunk
      const lobes = 1 + 0.28 * Math.sin(a * 4 + ph[2]) * Math.exp(-y * 9)
      const rad = (taper + flare) * lobes
      pos.push(Math.cos(a) * rad + ox, y, Math.sin(a) * rad + oz)
      uv.push((k / seg) * 2, y * 2.5)
    }
  }
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < seg; k++) {
      const a = i * (seg + 1) + k
      const b = a + seg + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function barkTexture(birch: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const r = mulberry(birch ? 9 : 4)
  g.fillStyle = birch ? '#f6f2ea' : '#d9d0c4'
  g.fillRect(0, 0, 256, 256)
  if (birch) {
    for (let i = 0; i < 46; i++) {
      g.fillStyle = `rgba(40,34,30,${0.45 + r() * 0.45})`
      const w = 14 + r() * 60
      g.beginPath()
      g.ellipse(r() * 256, r() * 256, w / 2, 2 + r() * 4, 0, 0, Math.PI * 2)
      g.fill()
    }
  } else {
    for (let i = 0; i < 90; i++) {
      const x = r() * 256
      g.strokeStyle = `rgba(40,22,10,${0.18 + r() * 0.34})`
      g.lineWidth = 2 + r() * 7
      g.beginPath()
      g.moveTo(x, -10)
      g.bezierCurveTo(x + (r() - 0.5) * 30, 80, x + (r() - 0.5) * 30, 170, x + (r() - 0.5) * 16, 266)
      g.stroke()
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(255,240,215,${0.12 + r() * 0.2})`
      g.lineWidth = 1 + r() * 3
      const x = r() * 256
      g.beginPath()
      g.moveTo(x, r() * 256)
      g.lineTo(x + (r() - 0.5) * 8, r() * 256)
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}
