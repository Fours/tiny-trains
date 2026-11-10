import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(3, 2, 5)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

scene.add(new THREE.AmbientLight(0xffffff, 0.4))
const keyLight = new THREE.DirectionalLight(0xffffff, 2)
keyLight.position.set(5, 5, 5)
scene.add(keyLight)

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.4 }),
)
scene.add(cube)
scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222))

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const timer = new THREE.Timer()

renderer.setAnimationLoop((time) => {
  timer.update(time)
  const delta = timer.getDelta()
  cube.rotation.x += delta * 0.5
  cube.rotation.y += delta * 0.8
  controls.update()
  renderer.render(scene, camera)
})
