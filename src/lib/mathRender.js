// เรนเดอร์ LaTeX → SVG ด้วย MathJax (ไม่พึ่งฟอนต์ภายนอก) แล้วทำเป็นรูปให้ canvas วาด
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const html = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams'] }), OutputJax: new SVG({ fontCache: 'none' }) })

const PX_PER_EM = 128 // ความละเอียดของรูปที่ใช้วาด (ซูมเข้าก็ยังคม)
const metrics = new Map(), images = new Map()
let notify = () => {}
export const onMathReady = fn => { notify = fn }

// → { svg, w, h } หน่วย em (ความกว้าง/สูงของสมการเมื่อฟอนต์ 1 หน่วย) หรือ null ถ้า LaTeX ผิด
export function mathMetrics(tex) {
  if (metrics.has(tex)) return metrics.get(tex)
  let r = null
  try {
    const svg = adaptor.innerHTML(html.convert(tex, { display: true, em: 16, ex: 8 }))
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)
    if (vb && !/merror/.test(svg)) r = { svg, w: +vb[3] / 1000, h: +vb[4] / 1000 }
  } catch { /* LaTeX ผิดรูป */ }
  metrics.set(tex, r)
  return r
}

const withSize = (svg, w, h) => svg.replace(/ width="[^"]*"/, ` width="${w}"`).replace(/ height="[^"]*"/, ` height="${h}"`).replace(/ style="[^"]*"/, '')

// SVG สำหรับแสดงในหน้าเว็บ (สีตามตัวอักษรรอบข้าง) ขนาด px ต่อ 1em
export function mathInlineSvg(tex, px) {
  const m = mathMetrics(tex)
  return m ? withSize(m.svg, +(m.w * px).toFixed(2), +(m.h * px).toFixed(2)) : null
}

// รูปสำหรับ canvas (โหลดแบบ async เสร็จแล้วสั่งวาดใหม่เอง) → Image หรือ null ถ้ายังไม่พร้อม
export function mathImage(tex, color) {
  const m = mathMetrics(tex)
  if (!m) return null
  const key = tex + '\u0000' + color
  let e = images.get(key)
  if (!e) {
    const img = new Image()
    e = { img, ready: false }
    img.onload = () => { e.ready = true; notify() }
    const svg = withSize(m.svg, m.w * PX_PER_EM, m.h * PX_PER_EM).replace(/currentColor/g, color)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    images.set(key, e)
  }
  return e.ready ? e.img : null
}
