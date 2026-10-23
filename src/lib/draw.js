import { compile } from 'mathjs'
import { mathMetrics, mathImage } from './mathRender.js'

export const PALETTE = ['ink', '#f87171', '#60a5fa', '#4ade80', '#fbbf24']
export const bg = t => (t === 'dark' ? '#1d2b26' : '#fbfbf8')
export const ink = t => (t === 'dark' ? '#f2efe6' : '#1c1917')

// ฟอนต์สำรองที่มีสัญลักษณ์คณิตศาสตร์ครบ (Σ √ ² ₀ ∫ ฯลฯ) กันตัวอักษรกลายเป็นสี่เหลี่ยม
const FONT = '"Sarabun", system-ui, "Cambria Math", "STIX Two Math", "Apple Symbols", "Noto Sans Math", "Segoe UI Symbol", sans-serif'
const TAU = Math.PI * 2
const rad = d => (d * Math.PI) / 180
const deg = r => (r * 180) / Math.PI
const fmt = n => +n.toFixed(2)
const cache = new Map()
const fn = s => cache.get(s) || (cache.set(s, compile(s)), cache.get(s))

function arrow(c, x0, y0, x1, y1, h = 10) {
  const t = Math.atan2(y1 - y0, x1 - x0)
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1)
  c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(t - 0.4), y1 - h * Math.sin(t - 0.4))
  c.moveTo(x1, y1); c.lineTo(x1 - h * Math.cos(t + 0.4), y1 - h * Math.sin(t + 0.4))
  c.stroke()
}

function text(c, s, x, y, size = 16, align = 'center') {
  c.font = `${size}px ${FONT}`
  c.textAlign = align; c.textBaseline = 'middle'
  c.fillText(String(s), x, y)
}

// แกนพิกัด: n = จำนวนหน่วยที่ยื่นออกจากจุดกำเนิดทั้งสองด้าน, s = พิกเซลต่อหน่วย
function axes(c, x, y, n, s) {
  c.save(); c.globalAlpha = 0.65; c.lineWidth = 1.5
  arrow(c, x - n * s, y, x + n * s, y); arrow(c, x, y + n * s, x, y - n * s)
  c.lineWidth = 1
  const step = Math.max(1, Math.ceil(n / 6))
  for (let k = step; k <= n; k += step) for (const q of [k, -k]) {
    c.beginPath()
    c.moveTo(x + q * s, y - 4); c.lineTo(x + q * s, y + 4)
    c.moveTo(x - 4, y - q * s); c.lineTo(x + 4, y - q * s)
    c.stroke()
    text(c, q, x + q * s, y + 16, 12); text(c, q, x - 14, y - q * s, 12)
  }
  c.restore()
}

const T2 = Math.PI * 2
const mod = v => ((v % T2) + T2) % T2
// วงกลมที่ผ่านจุด a, m, b (m = จุดยอดกึ่งกลางของวงโค้ง)
function arcGeom(it) {
  const [a, m, b] = it.pts
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y
  const cx = (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d
  const cy = (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d
  const A = Math.atan2(a.y - cy, a.x - cx), M = Math.atan2(m.y - cy, m.x - cx), B = Math.atan2(b.y - cy, b.x - cx)
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy), A, B, ccw: mod(M - A) > mod(B - A) }
}

const DRAW = {
  stroke(c, it) {
    const p = it.pts, n = p.length, w = it.w || 2
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    if (n < 3 || it.dash) {
      c.beginPath(); c.moveTo(p[0].x, p[0].y)
      if (n === 1) c.lineTo(p[0].x + 0.1, p[0].y)
      for (let i = 1; i < n - 1; i++) { const m = mid(p[i], p[i + 1]); c.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y) }
      if (n > 1) c.lineTo(p[n - 1].x, p[n - 1].y)
      c.stroke(); return
    }
    // ความหนาเส้นตามแรงกดของ Apple Pencil (เมาส์ = 0.5 = หนาปกติ)
    const seg = (s, k, e, q) => {
      c.lineWidth = w * (0.4 + 1.2 * (q.p ?? 0.5))
      c.beginPath(); c.moveTo(s.x, s.y)
      k ? c.quadraticCurveTo(k.x, k.y, e.x, e.y) : c.lineTo(e.x, e.y)
      c.stroke()
    }
    seg(p[0], null, mid(p[0], p[1]), p[0])
    for (let i = 1; i < n - 1; i++) seg(mid(p[i - 1], p[i]), p[i], mid(p[i], p[i + 1]), p[i])
    seg(mid(p[n - 2], p[n - 1]), null, p[n - 1], p[n - 1])
  },
  line(c, it) {
    const [a, b] = it.pts
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke()
  },
  arc(c, it) {
    const g = arcGeom(it)
    c.beginPath()
    if (!g) { c.moveTo(it.pts[0].x, it.pts[0].y); c.lineTo(it.pts[2].x, it.pts[2].y) }
    else c.arc(g.cx, g.cy, g.r, g.A, g.B, g.ccw)
    c.stroke()
  },
  text(c, it) {
    c.font = `${it.size}px ${FONT}`
    c.textAlign = 'left'; c.textBaseline = 'top'
    it.text.split('\n').forEach((l, i) => c.fillText(l, it.x, it.y + i * it.size * 1.3))
  },
  math(c, it) {
    const m = mathMetrics(it.tex), img = m && mathImage(it.tex, c.fillStyle)
    if (img) c.drawImage(img, it.x, it.y, m.w * it.size, m.h * it.size)
  },
  ellipse(c, it) {
    c.beginPath(); c.ellipse(it.x, it.y, it.rx, it.ry, it.rot || 0, 0, T2); c.stroke()
  },
  poly(c, it) {
    const p = it.pts
    c.beginPath(); c.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y)
    if (!it.open) c.closePath()
    c.stroke()
  },
  graph(c, it) {
    const { x, y, s, n } = it, L = n * s
    axes(c, x, y, n, s)
    c.save(); c.beginPath(); c.rect(x - L, y - L, 2 * L, 2 * L); c.clip(); c.lineWidth = 2.5
    for (const e of it.exprs) {
      c.strokeStyle = e.color; c.beginPath()
      let on = false
      for (let i = 0; i <= 800; i++) {
        const X = -n + (2 * n * i) / 800
        let Y
        try { Y = fn(e.expr).evaluate({ x: X }) } catch { Y = NaN }
        if (typeof Y !== 'number' || !isFinite(Y) || Math.abs(Y) > n * 4) { on = false; continue }
        const px = x + X * s, py = y - Y * s
        on ? c.lineTo(px, py) : c.moveTo(px, py)
        on = true
      }
      c.stroke()
    }
    c.restore()
    it.exprs.forEach((e, k) => { c.fillStyle = e.color; text(c, 'y = ' + e.expr, x + L - 8, y - L + 16 + k * 22, 15, 'right') })
  },
  unit(c, it) {
    const { x, y, r } = it
    axes(c, x, y, 1.4, r)
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke()
    c.save(); c.globalAlpha = 0.45; c.lineWidth = 1
    for (const d of [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]) {
      const a = rad(d), co = Math.cos(a), si = Math.sin(a)
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + r * co, y - r * si); c.stroke()
      text(c, d + '°', x + (r + 24) * co, y - (r + 24) * si, 13)
    }
    c.restore()
    if (it.theta != null) {
      const a = rad(it.theta), px = x + r * Math.cos(a), py = y - r * Math.sin(a)
      c.save(); c.lineWidth = 3; c.strokeStyle = '#fbbf24'
      c.beginPath(); c.moveTo(x, y); c.lineTo(px, py); c.stroke()
      c.setLineDash([6, 5]); c.strokeStyle = '#60a5fa'
      c.beginPath(); c.moveTo(px, py); c.lineTo(px, y); c.stroke()
      c.strokeStyle = '#f87171'
      c.beginPath(); c.moveTo(x, y); c.lineTo(px, y); c.stroke()
      c.restore()
      c.fillStyle = '#60a5fa'; text(c, 'sin = ' + Math.sin(a).toFixed(3), px + 10, (py + y) / 2, 15, 'left')
      c.fillStyle = '#f87171'; text(c, 'cos = ' + Math.cos(a).toFixed(3), (x + px) / 2, y + 34, 15)
      c.fillStyle = '#fbbf24'; text(c, `θ = ${it.theta}°`, x - r * 1.4, y - r * 1.4 - 8, 17, 'left')
    }
  },
  tri(c, it) {
    const { x, y, a, b, s } = it, A = a * s, B = b * s
    const th = deg(Math.atan(b / a))
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + A, y); c.lineTo(x, y - B); c.closePath(); c.stroke()
    c.strokeRect(x, y - 14, 14, 14)
    text(c, fmt(a), x + A / 2, y + 20); text(c, fmt(b), x - 20, y - B / 2)
    c.fillStyle = '#fbbf24'
    text(c, 'c = ' + fmt(Math.hypot(a, b)), x + A / 2 + 28, y - B / 2 - 16)
    text(c, fmt(th) + '°', x + A - 34, y - 10, 14)
    text(c, fmt(90 - th) + '°', x + 30, y - B + 22, 14)
  },
  vec(c, it) {
    const { x, y, vx, vy, s, n } = it, px = x + vx * s, py = y - vy * s
    axes(c, x, y, n, s)
    c.save(); c.lineWidth = 3; c.strokeStyle = '#fbbf24'; arrow(c, x, y, px, py, 14); c.restore()
    c.save(); c.setLineDash([6, 5]); c.beginPath()
    c.moveTo(px, py); c.lineTo(px, y); c.moveTo(px, py); c.lineTo(x, py); c.stroke(); c.restore()
    c.fillStyle = '#fbbf24'
    text(c, `|v| = ${fmt(Math.hypot(vx, vy))}   θ = ${fmt(deg(Math.atan2(vy, vx)))}°`, px + 12, py - 14, 15, 'left')
    text(c, 'vx = ' + vx, px, y + (vy >= 0 ? 34 : -34), 13)
    text(c, 'vy = ' + vy, x + (vx >= 0 ? -44 : 44), py, 13)
  },
  proj(c, it) {
    const { x, y, v, ang, s } = it, a = rad(ang), g = 9.8
    const T = (2 * v * Math.sin(a)) / g, R = (v * v * Math.sin(2 * a)) / g, H = (v * Math.sin(a)) ** 2 / (2 * g)
    c.beginPath(); c.moveTo(x - 20, y); c.lineTo(x + R * s + 30, y); c.stroke()
    c.save(); c.strokeStyle = '#60a5fa'; c.lineWidth = 3; c.beginPath()
    for (let i = 0; i <= 80; i++) {
      const t = (T * i) / 80, X = v * Math.cos(a) * t, Y = v * Math.sin(a) * t - 4.9 * t * t
      i ? c.lineTo(x + X * s, y - Y * s) : c.moveTo(x + X * s, y - Y * s)
    }
    c.stroke(); c.restore()
    c.save(); c.setLineDash([6, 5]); c.lineWidth = 1.5
    c.beginPath(); c.moveTo(x + (R * s) / 2, y); c.lineTo(x + (R * s) / 2, y - H * s); c.stroke(); c.restore()
    c.save(); c.strokeStyle = '#fbbf24'; c.lineWidth = 3
    arrow(c, x, y, x + 60 * Math.cos(a), y - 60 * Math.sin(a), 12); c.restore()
    c.fillStyle = '#fbbf24'
    text(c, `v₀ = ${v} m/s   θ = ${ang}°`, x, y - H * s - 44, 16, 'left')
    text(c, `t = ${fmt(T)} s`, x, y - H * s - 22, 15, 'left')
    text(c, `H = ${fmt(H)} m`, x + (R * s) / 2 + 10, y - (H * s) / 2, 15, 'left')
    text(c, `R = ${fmt(R)} m`, x + (R * s) / 2, y + 22, 15)
  },
}

export function drawItem(c, it, theme) {
  const f = DRAW[it.type]
  if (!f) return
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'
  c.strokeStyle = c.fillStyle = !it.color || it.color === 'ink' ? ink(theme) : it.color
  c.lineWidth = it.w || 2
  if (it.dash) c.setLineDash([it.w * 3 + 4, it.w * 2 + 4])
  f(c, it, theme)
  c.restore()
}

function ptsOf(it) {
  if (it.type === 'ellipse') {
    const o = [], k = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0)
    for (let i = 0; i < 48; i++) { const t = (i / 48) * T2, u = it.rx * Math.cos(t), v = it.ry * Math.sin(t); o.push({ x: it.x + u * k - v * sn, y: it.y + u * sn + v * k }) }
    o.push(o[0]); return o
  }
  if (it.type === 'poly') return it.open ? it.pts : [...it.pts, it.pts[0]]
  if (it.type !== 'arc') return it.pts
  const g = arcGeom(it)
  if (!g) return [it.pts[0], it.pts[2]]
  const sw = g.ccw ? -mod(g.A - g.B) : mod(g.B - g.A), out = []
  for (let i = 0; i <= 24; i++) { const t = g.A + (sw * i) / 24; out.push({ x: g.cx + g.r * Math.cos(t), y: g.cy + g.r * Math.sin(t) }) }
  return out
}

export function bbox(it) {
  if (it.pts || it.type === 'ellipse') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of ptsOf(it)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    return [x0, y0, x1, y1]
  }
  const { x, y } = it
  if (it.type === 'text') {
    const L = it.text.split('\n')
    return [x, y, x + Math.max(...L.map(l => l.length)) * it.size * 0.62, y + L.length * it.size * 1.3]
  }
  if (it.type === 'math') { const m = mathMetrics(it.tex) || { w: 1, h: 1 }; return [x, y, x + m.w * it.size, y + m.h * it.size] }
  if (it.type === 'graph' || it.type === 'vec') { const L = it.n * it.s; return [x - L, y - L, x + L, y + L] }
  if (it.type === 'unit') { const L = it.r * 1.4; return [x - L, y - L, x + L, y + L] }
  if (it.type === 'tri') return [x, y - it.b * it.s, x + it.a * it.s, y]
  const a = rad(it.ang)
  return [x, y - ((it.v * Math.sin(a)) ** 2 / 19.6) * it.s - 44, x + ((it.v * it.v * Math.sin(2 * a)) / 9.8) * it.s, y]
}

function dseg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

// edge=true (ยางลบ): object ใหญ่ ๆ จะโดนลบเมื่อแตะที่ขอบเท่านั้น
export function hit(it, px, py, r, edge = false) {
  if (it.pts || it.type === 'ellipse') {
    const q = ptsOf(it), rr = r + (it.w || 2), P = { x: px, y: py }
    if (q.length === 1) return Math.hypot(px - q[0].x, py - q[0].y) < rr
    for (let i = 1; i < q.length; i++) if (dseg(P, q[i - 1], q[i]) < rr) return true
    return false
  }
  const [x0, y0, x1, y1] = bbox(it)
  if (px < x0 - r || px > x1 + r || py < y0 - r || py > y1 + r) return false
  return !edge || px - x0 < r || x1 - px < r || py - y0 < r || y1 - py < r
}

export function move(it, dx, dy) {
  if (it.pts) it.pts.forEach(p => { p.x += dx; p.y += dy })
  else { it.x += dx; it.y += dy }
}
