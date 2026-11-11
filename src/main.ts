import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPost } from './post.ts'
import { buildTracks } from './tracks.ts'
import { buildTrains } from './trains.ts'
import { buildGround } from './world.ts'
import { bake, chimneys, clamp, fires, rr, tick } from './util.ts'
import { buildScenery } from './scenery.ts'
import { buildNature } from './nature.ts'
import { buildAnimals } from './animals.ts'
import { buildExtras } from './extras.ts'
import { SUN_DIR } from './trees.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.06

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x120a08)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.42

// ---------- lights: a low warm sun with cool sky fill ----------
const sun = new THREE.DirectionalLight(0xffc98f, 3.3)
sun.position.copy(SUN_DIR).multiplyScalar(52)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
const sc = sun.shadow.camera
sc.left = -44
sc.right = 44
sc.top = 36
sc.bottom = -36
sc.near = 5
sc.far = 130
sun.shadow.bias = -0.0003
sun.shadow.normalBias = 0.05
sun.shadow.radius = 3.5
scene.add(sun)
scene.add(new THREE.HemisphereLight(0xa9c2f5, 0x6b5238, 0.62))
const rim = new THREE.DirectionalLight(0x8fb0ff, 1.0)
rim.position.set(24, 18, -26)
scene.add(rim)

// ---------- world ----------
const world = new THREE.Group()
scene.add(world)
buildTracks(world)
const trains = buildTrains(world)
buildScenery(world)
buildNature(world)
buildAnimals(world)
buildExtras(world)
buildGround(world)
bake(world)

// hearth smoke: a thin blue-grey column from every chimney that meanders as it climbs
const puffClock = chimneys.map(() => Math.random())
const puffVel = new THREE.Vector3()
const puffPos = new THREE.Vector3()
let fireClock = 0
tick.push((dt, time) => {
  chimneys.forEach((c, i) => {
    if ((puffClock[i] -= dt) > 0) return
    puffClock[i] = rr(0.09, 0.14)
    puffVel.set(Math.sin(time * 0.7 + i * 2.1) * 0.3, rr(0.95, 1.25), Math.cos(time * 0.5 + i * 1.3) * 0.25)
    trains.smoke.emit(c, puffVel, rr(0.28, 0.38), 5.5, 0.8, 'wisp')
  })
  // campfire: woodsmoke and a steady drift of embers
  if ((fireClock -= dt) > 0) return
  fireClock = 0.07
  for (const f of fires) {
    puffPos.copy(f).add(puffVel.set(rr(-0.12, 0.12), 0, rr(-0.12, 0.12)))
    if (Math.random() < 0.6) trains.smoke.emit(puffPos, puffVel.set(rr(-0.15, 0.15), rr(1.1, 1.6), rr(-0.15, 0.15)), rr(0.3, 0.45), 4.5, 0.55, 'wisp')
    trains.smoke.spark(puffPos, puffVel.set(rr(-0.35, 0.35), rr(1.2, 2.8), rr(-0.35, 0.35)), 1.7, 0.08)
  }
})

// ---------- camera rig: arrow keys step around the four sides ----------
const camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 10, 400)
const ELEV = [0.42, 0.62, 0.9]
const rig = { side: 0, tilt: 1, az: Math.PI / 4, el: ELEV[1], dist: 90, zoom: 1 }
const target = new THREE.Vector3(0, 1.0, 0.5)

function fitDistance() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  return Math.max(66 / (2 * t * camera.aspect), 41 / (2 * t))
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') rig.side -= 1
  else if (e.key === 'ArrowRight') rig.side += 1
  else if (e.key === 'ArrowUp') rig.tilt = clamp(rig.tilt + 1, 0, ELEV.length - 1)
  else if (e.key === 'ArrowDown') rig.tilt = clamp(rig.tilt - 1, 0, ELEV.length - 1)
  else return
  e.preventDefault()
  document.querySelector('#hint')?.classList.add('used')
})

const post = createPost(renderer, scene, camera)
post.excludeFromAO.push(trains.smoke.mesh, trains.smoke.sparks)

// Looks come first, but if a machine can't hold ~30fps the resolution steps down a notch at a time.
let quality = 1
function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  const pr = Math.max(0.75, Math.min(window.devicePixelRatio, 2) * quality)
  renderer.setPixelRatio(pr)
  renderer.setSize(w, h)
  post.resize(w, h, pr)
}
window.addEventListener('resize', resize)
resize()

const timer = new THREE.Timer()
let slowFrames = 0
let frames = 0
renderer.setAnimationLoop((now) => {
  timer.update(now)
  const raw = timer.getDelta()
  const dt = Math.min(raw, 0.05)
  // ignore the first seconds (shader compilation) and tab-switch hiccups
  if (++frames > 120 && raw < 0.5) {
    slowFrames = raw > 1 / 26 ? slowFrames + 1 : Math.max(0, slowFrames - 2)
    if (slowFrames > 90 && quality > 0.5) {
      quality -= 0.125
      slowFrames = 0
      resize()
    }
  }
  const time = timer.getElapsed()

  trains.update(dt, time)
  for (const f of tick) f(dt, time)

  const k = 1 - Math.exp(-dt * 3.2)
  rig.az += (Math.PI / 4 + (rig.side * Math.PI) / 2 + Math.sin(time * 0.17) * 0.035 - rig.az) * k
  rig.el += (ELEV[rig.tilt] + Math.sin(time * 0.23) * 0.012 - rig.el) * k
  // a zero-sized window (hidden tab at load) would otherwise poison the eased distance with NaN
  const want = fitDistance() * rig.zoom
  if (Number.isFinite(want)) rig.dist = Number.isFinite(rig.dist) ? rig.dist + (want - rig.dist) * k : want
  camera.position.set(
    target.x + Math.sin(rig.az) * Math.cos(rig.el) * rig.dist,
    target.y + Math.sin(rig.el) * rig.dist,
    target.z + Math.cos(rig.az) * Math.cos(rig.el) * rig.dist,
  )
  camera.lookAt(target)

  post.render(time, rig.dist)
})

// handy for poking at the scene from the console during development
if (import.meta.env.DEV) {
  // fast-forward the simulation without waiting on animation frames
  let simTime = 1000
  const step = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      simTime += 1 / 30
      trains.update(1 / 30, simTime)
      for (const f of tick) f(1 / 30, simTime)
    }
  }
  Object.assign(window, { scene, camera, rig, post, renderer, target, trains, step })
}
