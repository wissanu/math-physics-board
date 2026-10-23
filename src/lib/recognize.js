// แปลงเส้นที่วาดด้วยมือให้เป็นรูปทรงเรขาคณิต (ทำงานในเครื่อง ไม่ต้องใช้อินเทอร์เน็ต)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
export const pathLen = p => { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]); return l }

export function bounds(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const q of p) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, diag: Math.hypot(x1 - x0, y1 - y0) }
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function resample(p, n = 64) {
  const step = pathLen(p) / (n - 1)
  if (!step) return p
  const out = [p[0]]
  let prev = p[0], acc = 0
  for (let i = 1; i < p.length; i++) {
    const cur = p[i]
    let d = dist(prev, cur)
    while (acc + d >= step) {
      const t = (step - acc) / d
      prev = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) }
      out.push(prev); d = dist(prev, cur); acc = 0
    }
    acc += d; prev = cur
  }
  while (out.length < n) out.push(p[p.length - 1])
  return out
}

function rdp(p, eps) {
  if (p.length < 3) return p
  const a = p[0], b = p[p.length - 1]
  let mi = 0, md = 0
  for (let i = 1; i < p.length - 1; i++) { const d = segDist(p[i], a, b); if (d > md) { md = d; mi = i } }
  if (md <= eps) return [a, b]
  return [...rdp(p.slice(0, mi + 1), eps).slice(0, -1), ...rdp(p.slice(mi), eps)]
}

// มุมเลี้ยวที่จุด b (เรเดียน)
function turn(a, b, c) {
  let d = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x))
  return d > Math.PI ? 2 * Math.PI - d : d
}

function circle3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { x, y, r: Math.hypot(a.x - x, a.y - y) }
}

function fitEllipse(p, th) {
  const k = Math.cos(th), s = Math.sin(th)
  const us = p.map(q => q.x * k + q.y * s), vs = p.map(q => -q.x * s + q.y * k)
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, rx = (u1 - u0) / 2, ry = (v1 - v0) / 2
  if (rx < 2 || ry < 2) return null
  let e = 0
  for (let i = 0; i < p.length; i++) e += Math.abs(Math.hypot((us[i] - cu) / rx, (vs[i] - cv) / ry) - 1)
  return { e: e / p.length, rx, ry, x: cu * k - cv * s, y: cu * s + cv * k, rot: th }
}

function rotRect(pts, t) {
  const k = Math.cos(t), s = Math.sin(t)
  const us = pts.map(q => q.x * k + q.y * s), vs = pts.map(q => -q.x * s + q.y * k)
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => ({ x: u * k - v * s, y: u * s + v * k }))
}

// คืนค่า item รูปทรง (line / arc / ellipse / poly) หรือ null ถ้าไม่ใช่รูปทรงที่รู้จัก
export function recognizeShape(raw) {
  if (raw.length < 5) return null
  const L = pathLen(raw), B = bounds(raw)
  if (B.diag < 12) return null
  const a = raw[0], b = raw[raw.length - 1], chord = dist(a, b)

  if (chord >= 0.2 * L) { // เส้นเปิด
    let md = 0
    for (const q of raw) md = Math.max(md, segDist(q, a, b))
    if (md / chord < 0.06) {
      const A = { ...a }, Bp = { ...b }, deg = (Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180) / Math.PI
      if (deg < 4 || deg > 176) A.y = Bp.y = (a.y + b.y) / 2
      else if (Math.abs(deg - 90) < 4) A.x = Bp.x = (a.x + b.x) / 2
      return { type: 'line', pts: [A, Bp] }
    }
    const p = resample(raw, 65), m = p[32], g = circle3(a, m, b)
    if (g && g.r < 25 * chord) {
      let e = 0
      for (const q of p) e += Math.abs(dist(q, g) - g.r)
      if (e / (p.length * g.r) < 0.07) return { type: 'arc', pts: [{ ...a }, { ...m }, { ...b }] }
    }
    const v = rdp(raw, 0.07 * B.diag)
    if (v.length >= 3 && v.length <= 5) {
      let ok = true
      for (let i = 1; i < v.length - 1; i++) if (turn(v[i - 1], v[i], v[i + 1]) < 0.5) ok = false
      for (let i = 1; i < v.length; i++) if (dist(v[i], v[i - 1]) < 0.12 * B.diag) ok = false
      if (ok) return { type: 'poly', open: true, pts: v }
    }
    return null
  }

  // เส้นปิด: วงกลม / วงรี
  const p = resample(raw, 64)
  let cx = 0, cy = 0
  p.forEach(q => { cx += q.x; cy += q.y }); cx /= p.length; cy /= p.length
  let sxx = 0, syy = 0, sxy = 0
  p.forEach(q => { const dx = q.x - cx, dy = q.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy })
  let th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  if (Math.abs(th) < 0.14) th = 0
  else if (Math.abs(Math.abs(th) - Math.PI / 2) < 0.14) th = Math.PI / 2
  const f = fitEllipse(p, th)
  if (f && f.e < 0.09) {
    if (Math.abs(f.rx - f.ry) / Math.max(f.rx, f.ry) < 0.15) { const r = (f.rx + f.ry) / 2; return { type: 'ellipse', x: f.x, y: f.y, rx: r, ry: r, rot: 0 } }
    return { type: 'ellipse', x: f.x, y: f.y, rx: f.rx, ry: f.ry, rot: f.rot }
  }

  // เส้นปิด: สามเหลี่ยม / สี่เหลี่ยม / รูปหลายเหลี่ยม
  const v = rdp(raw, 0.07 * B.diag)
  if (v.length > 2 && dist(v[0], v[v.length - 1]) < 0.2 * B.diag) v.pop()
  for (let ch = true; ch && v.length > 3;) {
    ch = false
    for (let i = 0; i < v.length; i++) {
      if (turn(v[(i + v.length - 1) % v.length], v[i], v[(i + 1) % v.length]) < 0.45) { v.splice(i, 1); ch = true; break }
    }
  }
  if (v.length === 3) return { type: 'poly', pts: v }
  if (v.length === 4) {
    const rect = v.every((q, i) => Math.abs(turn(v[(i + 3) % 4], q, v[(i + 1) % 4]) - Math.PI / 2) < 0.45)
    if (!rect) return { type: 'poly', pts: v }
    let best = 0, t = 0
    for (let i = 0; i < 4; i++) { const d = dist(v[i], v[(i + 1) % 4]); if (d > best) { best = d; t = Math.atan2(v[(i + 1) % 4].y - v[i].y, v[(i + 1) % 4].x - v[i].x) } }
    t = ((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
    if (t > Math.PI / 4) t -= Math.PI / 2
    if (Math.abs(t) < 0.12) t = 0
    return { type: 'poly', pts: rotRect(v, t) }
  }
  if (v.length === 5) return { type: 'poly', pts: v }
  return null
}
