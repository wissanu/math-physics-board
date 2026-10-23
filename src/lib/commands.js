import { compile } from 'mathjs'

export const HELP = `พิมพ์แล้วกด Enter
sin(x)   x^2 - 4   y = 2x + 1      พล็อตกราฟ (พิมพ์ต่อเพื่อวาดซ้อนบนแกนเดิม)
/unitcircle 40                      วงกลมหนึ่งหน่วย (ใส่มุมได้)
/triangle 3 4                       สามเหลี่ยมมุมฉาก (ด้านประกอบมุมฉาก a b)
/vector 3 4                         เวกเตอร์ (vx vy)
/projectile v=20 angle=45           โพรเจกไทล์
/undo   /clear
🎤 เสียง (กด M)                    พูดเป็นข้อความ/สมการ แล้วลากกล่องไปวางบนกระดาน`

const PAL = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#c084fc']
const nums = s => (s.match(/-?\d+(\.\d+)?/g) || []).map(Number)
const kv = s => Object.fromEntries([...s.matchAll(/(\w+)\s*=\s*(-?[\d.]+)/g)].map(m => [m[1].toLowerCase(), +m[2]]))

export function runCommand(raw, { W, H, items }) {
  const s = raw.trim().replace(/^\//, '')
  if (!s) return {}
  const [cmd, ...rest] = s.split(/\s+/)
  const arg = rest.join(' '), n = nums(arg), k = kv(arg), m = Math.min(W, H)

  switch (cmd.toLowerCase()) {
    case 'clear': return { action: 'clear' }
    case 'undo': return { action: 'undo' }
    case 'help': return { action: 'help' }
    case 'unitcircle': case 'unit':
      return { item: { type: 'unit', x: W / 2, y: H / 2 - 20, r: m * 0.28, theta: n[0] } }
    case 'triangle': {
      const a = k.a ?? n[0], b = k.b ?? n[1]
      if (!(a > 0 && b > 0)) return { error: 'ใช้แบบนี้: /triangle 3 4' }
      const sc = (m * 0.45) / Math.max(a, b)
      return { item: { type: 'tri', a, b, s: sc, x: W / 2 - (a * sc) / 2, y: H / 2 + (b * sc) / 2 } }
    }
    case 'vector': {
      const vx = k.vx ?? n[0], vy = k.vy ?? n[1]
      if (vx == null || vy == null || (vx === 0 && vy === 0)) return { error: 'ใช้แบบนี้: /vector 3 4' }
      const nn = Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * 1.3)
      return { item: { type: 'vec', vx, vy, n: nn, s: (m * 0.4) / nn, x: W / 2, y: H / 2 } }
    }
    case 'projectile': case 'proj': {
      const v = k.v ?? n[0], ang = k.angle ?? k.a ?? n[1]
      if (!(v > 0 && ang > 0 && ang < 90)) return { error: 'ใช้แบบนี้: /projectile v=20 angle=45 (มุม 0-90 องศา)' }
      const a = (ang * Math.PI) / 180
      const R = (v * v * Math.sin(2 * a)) / 9.8, Hm = (v * Math.sin(a)) ** 2 / 19.6
      return { item: { type: 'proj', v, ang, s: Math.min((W * 0.6) / R, (H * 0.4) / Hm), x: W * 0.2, y: H * 0.7 } }
    }
  }

  const expr = s.replace(/^y\s*=\s*/i, '')
  try {
    const v = compile(expr).evaluate({ x: 1 })
    if (typeof v !== 'number' && typeof v?.re !== 'number') throw new Error()
  } catch {
    return { error: 'อ่านคำสั่งหรือสมการไม่ออก ลองพิมพ์ /help' }
  }
  const last = items.at(-1)
  if (last?.type === 'graph') return { addExpr: { expr, color: PAL[last.exprs.length % PAL.length] } }
  return { item: { type: 'graph', x: W / 2, y: H / 2 - 20, s: m / 22, n: 8, exprs: [{ expr, color: PAL[0] }] } }
}
