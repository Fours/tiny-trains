import * as THREE from 'three'
import { SUN_DIR } from './trees.ts'
import { rr } from './util.ts'

// Smoke and steam are drawn as soft, camera-facing puffs with a procedural
// billowing edge and a fake volume normal, so each puff is lit on its sunward
// side and shaded on the other. They are simulated on the CPU, sorted back to
// front, and kept out of the ambient-occlusion pass (see post.ts).

export type SmokeKind = 'smoke' | 'steam' | 'wisp'

interface Puff {
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
  grow: number
  alpha: number
  rot: number
  spin: number
  seed: number
  /** 1 is clean, 0 is thick soot */
  shade: number
  steam: number
  drag: number
  buoy: number
  /** how strongly the wind carries it */
  carry: number
  depth: number
}

interface Spark {
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
  seed: number
}

const PRESET: Record<SmokeKind, { grow: number; alpha: number; drag: number; buoy: number; carry: number; steam: number }> = {
  smoke: { grow: 1.55, alpha: 0.92, drag: 1.0, buoy: 1.0, carry: 0.55, steam: 0 },
  steam: { grow: 3.2, alpha: 0.7, drag: 2.4, buoy: 0.55, carry: 0.8, steam: 1 },
  wisp: { grow: 2.6, alpha: 0.5, drag: 0.5, buoy: 0.22, carry: 0.9, steam: 0 },
}

const quad = () => {
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  return g
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      a *= 0.5;
    }
    return s;
  }`

export class Smoke {
  readonly mesh: THREE.Mesh
  readonly sparks: THREE.Mesh
  private puffs: Puff[] = []
  private embers: Spark[] = []
  private max: number
  private maxSparks = 220
  private iPos: THREE.InstancedBufferAttribute
  private iData: THREE.InstancedBufferAttribute
  private iLook: THREE.InstancedBufferAttribute
  private sPos: THREE.InstancedBufferAttribute
  private sData: THREE.InstancedBufferAttribute
  private wind = new THREE.Vector3()
  private time = 0

  constructor(max = 1400) {
    this.max = max
    const g = quad()
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4)
    this.iLook = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
    for (const a of [this.iPos, this.iData, this.iLook]) a.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('iPos', this.iPos)
    g.setAttribute('iData', this.iData)
    g.setAttribute('iLook', this.iLook)
    g.instanceCount = 0

    const m = new THREE.ShaderMaterial({
      uniforms: { uSunView: { value: new THREE.Vector3() } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iData; // size, alpha, rotation, seed
        attribute vec3 iLook; // shade, age 0..1, steam
        varying vec2 vUv;
        varying float vAlpha;
        varying float vRot;
        varying float vSeed;
        varying vec3 vLook;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iData.x;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy * 2.0;
          vAlpha = iData.y;
          vRot = iData.z;
          vSeed = iData.w;
          vLook = iLook;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunView;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vRot;
        varying float vSeed;
        varying vec3 vLook;
        ${NOISE}
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float shade = vLook.x;
          float age = vLook.y;
          float steam = vLook.z;
          // billowing detail that churns upward as the puff ages
          // the pattern turns with the puff; the lighting stays fixed to the view
          float cr = cos(vRot);
          float sr = sin(vRot);
          vec2 q = (mat2(cr, -sr, sr, cr) * vUv) * (1.5 + steam * 0.7) + vSeed * 31.0;
          float n = fbm(q + vec2(0.0, -age * 1.4));
          float n2 = fbm(q * 2.3 + 40.0 + vec2(age * 0.9, 0.0));
          // eat away the rim more and more with age so puffs break into wisps
          float erode = mix(0.45, 0.95, age) + steam * 0.15;
          float body = smoothstep(1.0, 0.42, r + (n - 0.5) * erode * 1.3);
          body *= mix(1.0, smoothstep(0.2, 0.7, n2 + 0.3 - age * 0.4), 0.35 + steam * 0.3);
          float a = body * vAlpha;
          if (a < 0.004) discard;

          // fake a rounded, lumpy volume and light it from the sun
          // the noise also bumps the surface, so each puff reads as a cluster of billows
          float e = 0.35;
          vec2 grad = vec2(fbm(q + vec2(e, -age * 1.4)) - n, fbm(q + vec2(0.0, e - age * 1.4)) - n) / e;
          grad = mat2(cr, sr, -sr, cr) * grad;
          vec3 N = normalize(vec3(vUv.x, vUv.y, sqrt(max(0.0, 1.0 - r * r)) * 0.8) - vec3(grad, 0.0) * 1.1);
          float wrap = clamp(dot(N, uSunView) * 0.62 + 0.42, 0.0, 1.0);
          // undersides sit in the plume's own shadow
          wrap *= mix(1.0, 0.62, smoothstep(0.15, -0.85, N.y));
          vec3 lightCol = mix(vec3(1.22, 1.08, 0.9), vec3(1.3, 1.27, 1.22), steam);
          vec3 shadowCol = mix(vec3(0.42, 0.45, 0.58), vec3(0.6, 0.67, 0.82), steam);
          vec3 clean = mix(shadowCol, lightCol, smoothstep(0.1, 0.95, wrap));
          vec3 soot = mix(vec3(0.1, 0.09, 0.1), vec3(0.44, 0.36, 0.3), wrap);
          vec3 col = mix(soot, clean, shade);
          // the dense heart of a puff is a touch darker than its feathered edge
          col *= mix(1.06, 0.86, body * (1.0 - steam * 0.6));
          // sun behind the smoke: thin edges light up
          float back = clamp(-uSunView.z, 0.0, 1.0);
          col += lightCol * back * (1.0 - body) * 0.55 * mix(0.5, 1.0, shade);
          gl_FragColor = vec4(col, a);
        }`,
    })
    this.mesh = new THREE.Mesh(g, m)
    this.mesh.frustumCulled = false
    this.mesh.userData.dynamic = true
    this.mesh.renderOrder = 5
    this.mesh.onBeforeRender = (_r, _s, camera) => this.upload(camera)

    // embers: tiny additive glints
    const sg = quad()
    this.sPos = new THREE.InstancedBufferAttribute(new Float32Array(this.maxSparks * 3), 3)
    this.sData = new THREE.InstancedBufferAttribute(new Float32Array(this.maxSparks * 2), 2)
    this.sPos.setUsage(THREE.DynamicDrawUsage)
    this.sData.setUsage(THREE.DynamicDrawUsage)
    sg.setAttribute('iPos', this.sPos)
    sg.setAttribute('iData', this.sData)
    sg.instanceCount = 0
    this.sparks = new THREE.Mesh(
      sg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 iPos;
          attribute vec2 iData; // size, heat 0..1
          varying vec2 vUv;
          varying float vHeat;
          void main() {
            vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
            mv.xy += position.xy * iData.x;
            gl_Position = projectionMatrix * mv;
            vUv = position.xy * 2.0;
            vHeat = iData.y;
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying float vHeat;
          void main() {
            float d = 1.0 - smoothstep(0.0, 1.0, length(vUv));
            vec3 col = mix(vec3(1.0, 0.16, 0.03), vec3(1.0, 0.75, 0.3), vHeat);
            gl_FragColor = vec4(col * d * d * vHeat * 9.0, 1.0);
          }`,
      }),
    )
    this.sparks.frustumCulled = false
    this.sparks.userData.dynamic = true
    this.sparks.renderOrder = 6
  }

  /** `size` is the starting diameter; puffs swell as they age. `shade` runs from 0 (soot) to 1 (clean). */
  emit(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life = 2.4, shade = 1, kind: SmokeKind = 'smoke') {
    if (this.puffs.length >= this.max) this.puffs.shift()
    const p = PRESET[kind]
    this.puffs.push({
      pos: pos.clone(),
      vel: vel.clone(),
      age: 0,
      life: life * rr(0.8, 1.2),
      size: size * rr(0.8, 1.2),
      grow: p.grow * rr(0.8, 1.25),
      alpha: p.alpha * rr(0.8, 1.1),
      rot: rr(0, 6.28),
      spin: rr(-0.5, 0.5),
      seed: Math.random(),
      shade,
      steam: p.steam,
      drag: p.drag,
      buoy: p.buoy,
      carry: p.carry,
      depth: 0,
    })
  }

  spark(pos: THREE.Vector3, vel: THREE.Vector3, life = 1.4, size = 0.09) {
    if (this.embers.length >= this.maxSparks) this.embers.shift()
    this.embers.push({ pos: pos.clone(), vel: vel.clone(), age: 0, life: life * rr(0.7, 1.3), size: size * rr(0.7, 1.3), seed: Math.random() * 100 })
  }

  update(dt: number, time = this.time + dt) {
    this.time = time
    // a breeze that leans and gusts, so columns bend and recover
    const gust = 0.5 + 0.5 * Math.sin(time * 0.31) * Math.sin(time * 0.13 + 1.0)
    this.wind.set(0.35 + 0.75 * gust, 0, 0.28 * Math.sin(time * 0.19 + 2.0))

    this.puffs = this.puffs.filter((p) => (p.age += dt) < p.life)
    for (const p of this.puffs) {
      const u = p.age / p.life
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
      p.vel.y += p.buoy * dt
      // ease toward the wind, more so once the puff has slowed and spread
      const k = p.carry * dt * (0.4 + u)
      p.vel.x += (this.wind.x - p.vel.x) * k
      p.vel.z += (this.wind.z - p.vel.z) * k
      // a little swirl so columns curl instead of rising dead straight
      const s = p.seed * 40
      p.vel.x += Math.sin(s + p.age * 2.3) * 0.45 * dt
      p.vel.z += Math.cos(s * 1.7 + p.age * 1.9) * 0.45 * dt
      p.pos.addScaledVector(p.vel, dt)
      // steam blown at the ground rolls along it rather than sinking through
      if (p.pos.y < 0.2 && p.vel.y < 0) p.vel.y *= -0.3
      p.rot += p.spin * dt
    }

    this.embers = this.embers.filter((e) => (e.age += dt) < e.life)
    for (const e of this.embers) {
      e.vel.multiplyScalar(Math.max(0, 1 - 0.8 * dt))
      e.vel.y += 0.5 * dt
      e.vel.x += (this.wind.x * 0.6 - e.vel.x) * 0.5 * dt + Math.sin(e.seed + e.age * 9) * 1.6 * dt
      e.vel.z += Math.cos(e.seed * 1.3 + e.age * 8) * 1.6 * dt
      e.pos.addScaledVector(e.vel, dt)
    }
  }

  /** Sort back to front for the current camera and fill the instance buffers. */
  private upload(camera: THREE.Camera) {
    const m = (this.mesh.material as THREE.ShaderMaterial).uniforms
    ;(m.uSunView.value as THREE.Vector3).copy(SUN_DIR).transformDirection(camera.matrixWorldInverse)
    const e = camera.matrixWorldInverse.elements
    for (const p of this.puffs) p.depth = e[2] * p.pos.x + e[6] * p.pos.y + e[10] * p.pos.z + e[14]
    this.puffs.sort((a, b) => a.depth - b.depth)
    const pos = this.iPos.array as Float32Array
    const data = this.iData.array as Float32Array
    const look = this.iLook.array as Float32Array
    this.puffs.forEach((p, i) => {
      const u = p.age / p.life
      const fadeIn = Math.min(1, p.age / 0.12)
      const fadeOut = Math.pow(1 - u, 1.25)
      pos[i * 3] = p.pos.x
      pos[i * 3 + 1] = p.pos.y
      pos[i * 3 + 2] = p.pos.z
      data[i * 4] = p.size * (1 + p.grow * Math.pow(u, 0.62))
      data[i * 4 + 1] = p.alpha * fadeIn * fadeOut
      data[i * 4 + 2] = p.rot
      data[i * 4 + 3] = p.seed
      // soot thins and pales as the puff spreads
      look[i * 3] = Math.min(1, p.shade + (1 - p.shade) * u * 1.25)
      look[i * 3 + 1] = u
      look[i * 3 + 2] = p.steam
    })
    ;(this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = this.puffs.length
    this.iPos.needsUpdate = this.iData.needsUpdate = this.iLook.needsUpdate = true

    const sp = this.sPos.array as Float32Array
    const sd = this.sData.array as Float32Array
    this.embers.forEach((s, i) => {
      const u = s.age / s.life
      sp[i * 3] = s.pos.x
      sp[i * 3 + 1] = s.pos.y
      sp[i * 3 + 2] = s.pos.z
      sd[i * 2] = s.size
      // embers gutter as they cool
      sd[i * 2 + 1] = (1 - u) * (0.65 + 0.35 * Math.sin(s.seed + s.age * 30))
    })
    ;(this.sparks.geometry as THREE.InstancedBufferGeometry).instanceCount = this.embers.length
    this.sPos.needsUpdate = this.sData.needsUpdate = true
  }
}
