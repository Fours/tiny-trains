import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/** Final colour grade: runs after tone mapping, in display space. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // a whisper of lens fringing toward the corners
      vec2 off = c * r2 * 0.010;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.16);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      // warm highlights, cool shadows
      col += vec3(0.035, 0.014, -0.02) * smoothstep(0.35, 1.0, l);
      col += vec3(-0.012, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.4, l));
      col *= 1.0 - 0.5 * smoothstep(0.1, 0.6, r2);
      col += (hash(vUv * 937.0 + uTime) - 0.5) * 0.022;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/**
 * Renders the scene into its own 4x MSAA HDR target and copies the resolved
 * image into the composer. Keeping the composer's ping-pong buffers
 * single-sampled avoids a full multisample resolve after every later pass.
 */
class MsaaScenePass extends Pass {
  private rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  private quad: FullScreenQuad
  private scene: THREE.Scene
  private camera: THREE.Camera

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super()
    this.scene = scene
    this.camera = camera
    this.needsSwap = false
    const copy = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    })
    copy.uniforms.tDiffuse.value = this.rt.texture
    this.quad = new FullScreenQuad(copy)
  }

  setSize(w: number, h: number) {
    this.rt.setSize(w, h)
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.rt)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(read)
    this.quad.render(renderer)
  }
}

/**
 * Miniature-style depth of field. Reuses the depth buffer the AO pass already
 * rendered, blurs at half resolution with a per-pixel radius, then blends the
 * result back over the sharp image so the focal band stays pin sharp.
 */
class TiltShiftPass extends Pass {
  focus = 80
  private a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private b = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private blur: THREE.ShaderMaterial
  private mix: THREE.ShaderMaterial
  private quad = new FullScreenQuad()

  constructor(depth: THREE.Texture, camera: THREE.PerspectiveCamera, opts: { dead: number; range: number; radius: number }) {
    super()
    const coc = /* glsl */ `
      uniform sampler2D tDepth;
      uniform float uNear, uFar, uFocus, uDead, uRange;
      float coc(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        float z = (uNear * uFar) / ((uFar - uNear) * d - uFar);
        return smoothstep(0.0, 1.0, clamp((abs(-z - uFocus) - uDead) / uRange, 0.0, 1.0));
      }`
    const shared = () => ({
      tDiffuse: { value: null as THREE.Texture | null },
      tDepth: { value: depth },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: 80 },
      uDead: { value: opts.dead },
      uRange: { value: opts.range },
    })
    const vertexShader = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
    this.blur = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uDir: { value: new THREE.Vector2() } },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uDir;
        ${coc}
        void main() {
          float c = coc(vUv);
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int i = -6; i <= 6; i++) {
            float f = float(i) / 6.0;
            vec2 uv = vUv + uDir * f * c;
            // out-of-focus taps count fully, in-focus ones barely: keeps sharp edges from smearing outward
            float w = exp(-2.2 * f * f) * (0.06 + coc(uv));
            sum += texture2D(tDiffuse, uv).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(sum / wsum, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.mix = new THREE.ShaderMaterial({
      uniforms: { ...shared(), tBlur: { value: this.b.texture } },
      vertexShader,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tDiffuse, tBlur;
        ${coc}
        void main() {
          float c = coc(vUv);
          gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, texture2D(tBlur, vUv).rgb, smoothstep(0.0, 0.3, c)), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.radius = opts.radius
  }

  private radius: number
  private w = 1
  private h = 1

  setSize(w: number, h: number) {
    this.w = w
    this.h = h
    this.a.setSize(Math.round(w / 2), Math.round(h / 2))
    this.b.setSize(Math.round(w / 2), Math.round(h / 2))
  }

  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    // radius is expressed relative to a 1080p-tall frame so the look is resolution independent
    const px = (this.radius * this.h) / 1080
    for (const m of [this.blur, this.mix]) m.uniforms.uFocus.value = this.focus
    this.quad.material = this.blur
    this.blur.uniforms.tDiffuse.value = read.texture
    this.blur.uniforms.uDir.value.set(px / this.w, 0)
    renderer.setRenderTarget(this.a)
    this.quad.render(renderer)
    this.blur.uniforms.tDiffuse.value = this.a.texture
    this.blur.uniforms.uDir.value.set(0, px / this.h)
    renderer.setRenderTarget(this.b)
    this.quad.render(renderer)
    this.quad.material = this.mix
    this.mix.uniforms.tDiffuse.value = read.texture
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.quad.render(renderer)
  }
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType })
  const composer = new EffectComposer(renderer, target)

  composer.addPass(new MsaaScenePass(scene, camera))

  const gtao = new GTAOPass(scene, camera, size.x, size.y)
  gtao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 1.2, scale: 1.3, samples: 10 })
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 8 })
  gtao.blendIntensity = 0.95
  composer.addPass(gtao)

  const bokeh = new TiltShiftPass(gtao.depthTexture, camera, { dead: 9, range: 42, radius: 22 })
  composer.addPass(bokeh)

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.7, 1.7)
  composer.addPass(bloom)

  composer.addPass(new OutputPass())

  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)

  return {
    composer,
    gtao,
    bokeh,
    bloom,
    render(time: number, focus: number) {
      bokeh.focus = focus
      grade.uniforms.uTime.value = time % 10
      composer.render()
    },
    resize(w: number, h: number, pr: number) {
      composer.setPixelRatio(pr)
      composer.setSize(w, h)
      // AO is by far the most expensive pass: half resolution is visually identical after denoising
      gtao.setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5))
    },
  }
}
