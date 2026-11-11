import * as THREE from 'three'
import { BOARD, trackA, trackB } from './tracks.ts'
import { canvasTexture, mat, mesh, rand, rr, tex, TAU } from './util.ts'

// ---------- ground painting ----------
// The whole board top is one unique hand-painted texture, so scenery can
// register dirt paths, worn patches and shorelines exactly where it stands.

const PX = 64 // texture pixels per world unit
type Painter = (g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number) => void
const painters: Painter[] = []

export function groundPatch(x: number, z: number, rx: number, rz: number, color: string, alpha = 0.8, rot = 0) {
  painters.push((g, X, Z) => {
    g.save()
    g.translate(X(x), Z(z))
    g.rotate(rot)
    g.scale(rx * PX, rz * PX)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    grad.addColorStop(0, color)
    grad.addColorStop(0.72, color)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = alpha
    g.fillStyle = grad
    g.globalCompositeOperation = 'source-over'
    // radial gradient to transparent needs a matching rgb at the edge
    g.beginPath()
    g.arc(0, 0, 1, 0, TAU)
    g.fill()
    g.restore()
  })
}

export function groundPath(points: [number, number][], width: number, color = '#d2b07a') {
  painters.push((g, X, Z) => {
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const stroke = (w: number, style: string, alpha: number) => {
      g.globalAlpha = alpha
      g.strokeStyle = style
      g.lineWidth = w * PX
      g.beginPath()
      points.forEach(([x, z], i) => {
        if (i === 0) g.moveTo(X(x), Z(z))
        else {
          const [px, pz] = points[i - 1]
          g.quadraticCurveTo(X(px), Z(pz), X((px + x) / 2), Z((pz + z) / 2))
        }
      })
      const [lx, lz] = points[points.length - 1]
      g.lineTo(X(lx), Z(lz))
      g.stroke()
    }
    stroke(width + 0.7, '#8fae4a', 0.35)
    stroke(width + 0.3, '#b59a62', 0.6)
    stroke(width, color, 1)
    stroke(width * 0.5, '#e2c591', 0.5)
    g.globalAlpha = 1
  })
}

function paintGround() {
  const w = BOARD.w * PX
  const h = BOARD.d * PX
  return canvasTexture(w, h, (g) => {
    const X = (x: number) => (x + BOARD.w / 2) * PX
    const Z = (z: number) => (z + BOARD.d / 2) * PX
    g.fillStyle = '#63a63d'
    g.fillRect(0, 0, w, h)
    // broad mottling
    const greens = ['#7dba48', '#4f9338', '#8cc650', '#43873a', '#6eae42', '#99c95a', '#559c43']
    for (let i = 0; i < 4000; i++) {
      const x = rand() * w
      const y = rand() * h
      const r = rr(0.5, 3.2) * PX
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      const c = greens[Math.floor(rand() * greens.length)]
      grad.addColorStop(0, c)
      grad.addColorStop(1, c + '00')
      g.globalAlpha = rr(0.1, 0.32)
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    g.globalAlpha = 1
    // soil shadow under both track beds
    for (const t of [trackA, trackB]) {
      for (const [lw, a, c] of [
        [3.6, 0.3, '#5d8a3a'],
        [2.9, 0.55, '#8a7355'],
      ] as const) {
        g.globalAlpha = a
        g.strokeStyle = c
        g.lineWidth = lw * PX
        g.beginPath()
        t.outline().forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))))
        g.closePath()
        g.stroke()
      }
    }
    g.globalAlpha = 1
    for (const p of painters) p(g, X, Z)
    g.globalAlpha = 1
    // fine blade speckle
    for (let i = 0; i < 140000; i++) {
      const x = rand() * w
      const y = rand() * h
      g.fillStyle = rand() > 0.5 ? 'rgba(210,240,140,0.16)' : 'rgba(30,80,30,0.14)'
      g.fillRect(x, y, rr(1.5, 3), rr(3, 8))
    }
    // tiny painted wildflower dots
    const dots = ['#fff6c9', '#ffffff', '#ffd4e6', '#ffe36e']
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = dots[Math.floor(rand() * dots.length)]
      g.globalAlpha = rr(0.4, 0.8)
      g.beginPath()
      g.arc(rand() * w, rand() * h, rr(1.5, 3.2), 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1
  })
}

function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + d - r)
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + d)
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

function slab(w: number, d: number, r: number, depth: number, bevel: number, top: number, m: THREE.Material) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, d, r), {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 20,
  })
  g.rotateX(-Math.PI / 2)
  g.translate(0, top - depth + bevel, 0)
  const o = mesh(g, m)
  o.userData.keep = true
  return o
}

/** Call after all scenery has registered its ground paint. */
export function buildGround(root: THREE.Group) {
  const { w, d } = BOARD
  const R = 3.6

  // painted turf top
  const topGeo = new THREE.ShapeGeometry(roundedRect(w, d, R), 20)
  const uv = topGeo.getAttribute('uv')
  const pos = topGeo.getAttribute('position')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getY(i) + d / 2) / d)
  topGeo.rotateX(-Math.PI / 2)
  const ground = paintGround()
  ground.wrapS = ground.wrapT = THREE.ClampToEdgeWrapping
  ground.flipY = false
  const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: ground, roughness: 1, envMapIntensity: 0.35 }))
  top.receiveShadow = true
  top.position.y = 0.004
  top.userData.keep = true
  root.add(top)

  // turf lip, soil and a walnut plinth
  root.add(slab(w + 0.16, d + 0.16, R + 0.08, 0.34, 0.1, 0, mat(0x5d9f3a, { rough: 1 })))
  root.add(slab(w - 0.1, d - 0.1, R, 0.75, 0, -0.3, mat(0x8a5b3c, { rough: 1, map: tex.gravel(0.08, 0.5) })))
  root.add(slab(w + 1.5, d + 1.5, R + 0.7, 0.62, 0.14, -1.0, mat(0x6e4427, { rough: 0.45, clearcoat: 0.35, map: tex.wood(0.02, 0.2) })))

  // the table the set lives on, lit like a pool of lamplight
  const tableTex = canvasTexture(
    2048,
    2048,
    (g, tw, th) => {
      const rows = 64
      for (let i = 0; i < rows; i++) {
        const y = (i * th) / rows
        const l = 23 + rand() * 7
        g.fillStyle = `hsl(${26 + rand() * 6}, ${42 + rand() * 10}%, ${l}%)`
        g.fillRect(0, y, tw, th / rows + 1)
        for (let k = 0; k < 10; k++) {
          g.strokeStyle = `rgba(50,24,8,${0.04 + rand() * 0.1})`
          g.lineWidth = 1 + rand() * 2
          const yy = y + rand() * (th / rows)
          g.beginPath()
          g.moveTo(0, yy)
          g.bezierCurveTo(tw * 0.3, yy + rr(-6, 6), tw * 0.7, yy + rr(-6, 6), tw, yy)
          g.stroke()
        }
        g.fillStyle = 'rgba(30,14,4,0.55)'
        g.fillRect(0, y, tw, 3)
        // plank ends
        const off = rand() * tw
        g.fillRect(off, y, 3, th / rows)
        g.fillRect((off + tw * 0.55) % tw, y, 3, th / rows)
      }
      const grad = g.createRadialGradient(tw / 2, th / 2, tw * 0.1, tw / 2, th / 2, tw * 0.5)
      grad.addColorStop(0, 'rgba(18,9,6,0)')
      grad.addColorStop(0.55, 'rgba(18,9,6,0.55)')
      grad.addColorStop(1, 'rgba(12,6,5,0.97)')
      g.fillStyle = grad
      g.fillRect(0, 0, tw, th)
    },
    {},
  )
  const table = new THREE.Mesh(new THREE.CircleGeometry(170, 64), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.42, envMapIntensity: 0.5 }))
  table.rotation.x = -Math.PI / 2
  table.position.y = -1.62
  table.receiveShadow = true
  table.userData.keep = true
  root.add(table)
}
