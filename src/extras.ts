import * as THREE from 'three'
import { groundY, POND } from './nature.ts'
import { at, blob, box, canvasTexture, cyl, dyn, frozen, grp, mat, paint, prism, rand, rr, sph, tex, tick, TAU } from './util.ts'

const TABLE_Y = -1.62

function softDot() {
  return canvasTexture(
    64,
    64,
    (g) => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
    },
    {},
  )
}

// ---------- drifting motes of dust and pollen in the sunlight ----------

function motes(root: THREE.Group) {
  const n = 320
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos.set([rr(-26, 26), rr(0.8, 13), rr(-19, 19)], i * 3)
    seed[i] = rand() * 100
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const uTime = { value: 0 }
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime, uMap: { value: softDot() }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.21 + aSeed) * 1.6 + uTime * 0.12;
        p.x = mod(p.x + 26.0, 52.0) - 26.0;
        p.y += sin(uTime * 0.33 + aSeed * 1.7) * 0.7;
        p.z += cos(uTime * 0.17 + aSeed * 2.3) * 1.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.05 + 0.07 * fract(aSeed * 7.13)) / -mv.z;
        vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 5.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA;
      void main() { gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * 1.4, texture2D(uMap, gl_PointCoord).r * vA * 0.42); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(g, m)
  pts.frustumCulled = false
  pts.userData.dynamic = true
  root.add(pts)
  tick.push((_, t) => {
    uTime.value = t
    // world-size points: scale by the drawing-buffer height and projection
    m.uniforms.uScale.value = window.innerHeight * Math.min(window.devicePixelRatio, 2) * 2.35
  })
}

// ---------- hot air balloon ----------

function balloon(root: THREE.Group) {
  const stripes = canvasTexture(
    512,
    64,
    (g, w, h) => {
      const cols = ['#e8503f', '#fff1d6', '#f4b63a', '#fff1d6', '#2f9e96', '#fff1d6']
      for (let i = 0; i < 12; i++) {
        g.fillStyle = cols[i % cols.length]
        g.fillRect((i * w) / 12, 0, w / 12 + 1, h)
      }
    },
    {},
  )
  const skin = new THREE.MeshPhysicalMaterial({ map: stripes, roughness: 0.45, clearcoat: 0.5, envMapIntensity: 0.8 })
  const env = new THREE.Mesh(new THREE.SphereGeometry(1.7, 36, 24), skin)
  env.scale.set(1, 1.12, 1)
  env.castShadow = true
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 0.5, 1.5, 36, 1, true), skin)
  neck.position.y = -1.95
  neck.castShadow = true
  const wicker = mat(0xb9803f, { rough: 0.9, map: tex.planks(2, 1) })
  const g = grp(env, neck, at(cyl(0.52, 0.52, 0.12, paint(0xe8503f), 20), 0, -2.72, 0), at(box(0.9, 0.62, 0.9, wicker, 0.12), 0, -3.9, 0), at(box(1.0, 0.1, 1.0, mat(0x7a4a2b, { rough: 0.8 }), 0.04), 0, -3.58, 0))
  for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) g.add(at(cyl(0.02, 0.02, 0.95, mat(0x5a4030), 4), x, -3.15, z, z * 0.12, 0, -x * 0.12))
  g.add(at(cyl(0.16, 0.22, 0.4, paint(0x3f6fb5), 12), 0, -3.5, 0), at(sph(0.19, mat(0xf3c9a5, { rough: 0.6 }), 12, 10), 0, -3.2, 0), at(cyl(0.22, 0.22, 0.05, paint(0xf4b63a), 12), 0, -3.06, 0))
  g.add(at(sph(0.1, mat(0xffe9a8, { emissive: 0xffa53a, emissiveIntensity: 5 }), 8, 6), 0, -2.95, 0))
  frozen(g)
  root.add(g)
  tick.push((_, t) => {
    // a slow lap of the whole table, so it drifts through every view rather than parking in one
    const a = t * 0.06 + 3.6
    g.position.set(Math.cos(a) * 25, 12 + Math.sin(t * 0.4) * 0.45, Math.sin(a) * 18.5)
    g.rotation.y = t * 0.08
    g.rotation.z = Math.sin(t * 0.5) * 0.03
  })
}

// ---------- bunting ----------

function bunting(root: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number) {
  const cols = [0xe8503f, 0xf4b63a, 0x2f9e96, 0xfff1d6, 0x8a5fc2, 0x58a55c]
  const ry = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2
  const cord = mat(0x5a4030, { rough: 0.9 })
  let prev = a.clone()
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const p = a.clone().lerp(b, u)
    p.y -= Math.sin(u * Math.PI) * sag
    const seg = cyl(0.015, 0.015, prev.distanceTo(p), cord, 4)
    seg.position.copy(prev).lerp(p, 0.5)
    seg.lookAt(p)
    seg.rotateX(Math.PI / 2)
    root.add(seg)
    if (i < n) {
      const flag = prism(
        [
          [-0.15, 0],
          [0.15, 0],
          [0, -0.36],
        ],
        0.025,
        mat(cols[i % cols.length], { rough: 0.7, side: THREE.DoubleSide }),
      )
      flag.position.copy(p)
      flag.rotation.set(rr(-0.15, 0.15), ry, rr(-0.1, 0.1))
      root.add(flag)
    }
    prev = p
  }
}

// ---------- warm light pools ----------

function glowPools(root: THREE.Group) {
  const m = new THREE.MeshBasicMaterial({ map: softDot(), color: 0xffb45a, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending })
  const spots: [number, number, number, number][] = [
    [9.2, 1.4, 2.4, 0.03],
    [12.0, -0.9, 2.4, 0.03],
    [-10.9, 9.2, 2.2, 0.49],
    [-3.5, 9.2, 2.2, 0.49],
    [-10.6, -14.6, 2.6, 0.03],
  ]
  for (const [x, z, r, y] of spots) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), m)
    p.rotation.x = -Math.PI / 2
    p.position.set(x, y, z)
    p.userData.keep = true
    p.renderOrder = 2
    root.add(p)
  }
}

// ---------- sparkles on the pond ----------

function sparkles(root: THREE.Group) {
  const star = canvasTexture(
    64,
    64,
    (g) => {
      g.translate(32, 32)
      g.fillStyle = '#fff'
      for (let i = 0; i < 2; i++) {
        g.rotate(Math.PI / 2)
        g.beginPath()
        g.moveTo(-30, 0)
        g.quadraticCurveTo(0, -3, 30, 0)
        g.quadraticCurveTo(0, 3, -30, 0)
        g.fill()
      }
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 12)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(-12, -12, 24, 24)
    },
    {},
  )
  for (let i = 0; i < 7; i++) {
    const m = new THREE.MeshBasicMaterial({ map: star, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const s = dyn(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), m))
    s.rotation.x = -Math.PI / 2
    const a = rand() * TAU
    const d = rr(0.15, 0.75)
    s.position.set(POND.x + Math.cos(a) * POND.rx * d, 0.1, POND.z + Math.sin(a) * POND.rz * d)
    const ph = rand() * 10
    const sp = rr(1.2, 2.4)
    tick.push((_, t) => {
      const k = Math.max(0, Math.sin(t * sp + ph))
      m.opacity = k * k * 0.9
      s.scale.setScalar(0.5 + k * 0.9)
      s.rotation.z = t * 0.3 + ph
    })
    root.add(s)
  }
}

// ---------- a kite flown from the front-left hill ----------

function kite(root: THREE.Group) {
  const hx = -18.2
  const hz = 13.9
  const hy = groundY(hx, hz)
  const kid = frozen(grp(at(cyl(0.18, 0.27, 0.56, paint(0xf4b63a), 14), 0, 0.28, 0), at(sph(0.23, mat(0xf3c9a5, { rough: 0.6 }), 14, 10), 0, 0.72, 0), at(blob(0.25, 0.14, 0.25, paint(0xe8503f)), 0, 0.88, 0)))
  kid.position.set(hx, hy, hz)
  root.add(kid)
  const sail = prism(
    [
      [0, 0.7],
      [0.48, 0],
      [0, -0.9],
      [-0.48, 0],
    ],
    0.03,
    mat(0xe8503f, { rough: 0.6, side: THREE.DoubleSide }),
  )
  const k = grp(sail, at(box(0.05, 1.6, 0.05, mat(0xfff1d6), 0.01), 0, -0.1, 0.03), at(box(0.96, 0.05, 0.05, mat(0xfff1d6), 0.01), 0, 0, 0.03))
  for (let i = 0; i < 4; i++) k.add(at(blob(0.12, 0.06, 0.02, mat([0xf4b63a, 0x2f9e96][i % 2], { rough: 0.6 })), Math.sin(i * 1.3) * 0.1, -1.15 - i * 0.3, 0, 0, 0, 0.5 - i * 0.3))
  frozen(k)
  root.add(k)
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff6e6, transparent: true, opacity: 0.8 }))
  line.frustumCulled = false
  line.userData.dynamic = true
  root.add(line)
  const hand = new THREE.Vector3(hx + 0.25, hy + 0.55, hz)
  tick.push((_, t) => {
    k.position.set(hx + 2.6 + Math.sin(t * 0.7) * 0.7, hy + 5.6 + Math.sin(t * 1.1) * 0.35, hz - 1.4 + Math.cos(t * 0.5) * 0.6)
    k.rotation.set(-0.5 + Math.sin(t * 1.3) * 0.1, 0.6 + Math.sin(t * 0.6) * 0.3, Math.sin(t * 0.9) * 0.25)
    const p = lineGeo.getAttribute('position')
    p.setXYZ(0, hand.x, hand.y, hand.z)
    p.setXYZ(1, k.position.x, k.position.y - 0.2, k.position.z)
    p.needsUpdate = true
    kid.rotation.z = Math.sin(t * 0.7) * 0.06
  })
}

// ---------- toys left out on the table around the set ----------

function tableProps(root: THREE.Group) {
  const letter = (ch: string, bg: string, fg: string) =>
    new THREE.MeshPhysicalMaterial({
      roughness: 0.45,
      clearcoat: 0.4,
      envMapIntensity: 0.7,
      map: canvasTexture(
        128,
        128,
        (g) => {
          g.fillStyle = '#e9c48d'
          g.fillRect(0, 0, 128, 128)
          g.fillStyle = bg
          g.beginPath()
          g.roundRect(12, 12, 104, 104, 14)
          g.fill()
          g.fillStyle = fg
          g.font = '800 84px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(ch, 64, 70)
        },
        {},
      ),
    })
  const blocks: [string, string, number, number, number, number][] = [
    ['A', '#e8503f', -31.5, -17, 0.4, 0],
    ['B', '#2f9e96', -34.2, -13.6, 1.1, 0],
    ['C', '#f4b63a', -32.6, -15.4, 0.8, 1],
    ['T', '#3f6fb5', 32, 15.5, 0.3, 0],
    ['O', '#58a55c', 34.8, 12.4, -0.5, 0],
    ['Y', '#8a5fc2', 29.5, -21.5, 0.9, 0],
    ['S', '#e8503f', -29, 22.5, -0.3, 0],
  ]
  const S = 3.0
  for (const [ch, bg, x, z, ry, level] of blocks) {
    const b = box(S, S, S, letter(ch, bg, '#fff6e6'), 0.3)
    b.userData.keep = true
    root.add(at(b, x, TABLE_Y + S / 2 + level * S, z, 0, ry, 0))
  }
  // a striped ball and a couple of crayons
  const ballTex = canvasTexture(
    256,
    64,
    (g, w, h) => {
      const cols = ['#e8503f', '#fff1d6', '#3f6fb5', '#fff1d6', '#f4b63a', '#fff1d6']
      cols.forEach((c, i) => {
        g.fillStyle = c
        g.fillRect((i * w) / 6, 0, w / 6 + 1, h)
      })
    },
    {},
  )
  const ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 40, 28), new THREE.MeshPhysicalMaterial({ map: ballTex, roughness: 0.3, clearcoat: 0.8, envMapIntensity: 0.9 }))
  ball.castShadow = ball.receiveShadow = true
  ball.userData.keep = true
  root.add(at(ball, 33, TABLE_Y + 2.2, -12, 0.5, 0.4, 0.9))
  for (const [x, z, ry, c] of [
    [-6, 25.5, 1.2, 0xe8503f],
    [-3.4, 26.8, 1.75, 0x3f9bd6],
    [10, -25, 0.3, 0x58a55c],
  ]) {
    const crayon = grp(at(cyl(0.34, 0.34, 5, paint(c), 12), 0, 0, 0, 0, 0, Math.PI / 2), at(cyl(0.02, 0.33, 0.8, paint(c), 12), -2.9, 0, 0, 0, 0, Math.PI / 2), at(cyl(0.35, 0.35, 1.6, mat(0xfff1d6, { rough: 0.8 }), 12), 0.6, 0, 0, 0, 0, Math.PI / 2))
    root.add(at(crayon, x, TABLE_Y + 0.34, z, 0, ry, 0))
  }
}

export function buildExtras(root: THREE.Group) {
  motes(root)
  balloon(root)
  bunting(root, new THREE.Vector3(9.2, 2.55, 1.4), new THREE.Vector3(12.0, 2.55, -0.9), 0.45, 9)
  bunting(root, new THREE.Vector3(12.0, 2.55, -0.9), new THREE.Vector3(9.5, 2.5, -3.4), 0.4, 8)
  bunting(root, new THREE.Vector3(-10.9, 3.0, 9.2), new THREE.Vector3(-3.5, 3.0, 9.2), 0.5, 16)
  glowPools(root)
  sparkles(root)
  kite(root)
  tableProps(root)
}
