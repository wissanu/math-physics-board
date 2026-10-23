// อ่านลายมือเป็นตัวอักษรด้วย Google Input Tools (บริการไม่เป็นทางการ ต้องต่ออินเทอร์เน็ต)
const URL = 'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8'

export async function recognizeText(strokes, scale, lang) {
  const all = strokes.flatMap(s => s.pts)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of all) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  let t = 0
  const ink = strokes.map(s => {
    const xs = [], ys = [], ts = []
    for (const p of s.pts) { xs.push(Math.round((p.x - x0) * scale)); ys.push(Math.round((p.y - y0) * scale)); ts.push((t += 15)) }
    t += 250
    return [xs, ys, ts]
  })
  const body = {
    options: 'enable_pre_space',
    requests: [{
      writing_guide: { writing_area_width: Math.max(100, Math.round((x1 - x0) * scale * 1.2)), writing_area_height: Math.max(60, Math.round((y1 - y0) * scale * 1.2)) },
      ink, language: lang,
    }],
  }
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (j[0] !== 'SUCCESS') throw new Error('recognize failed')
  return j[1]?.[0]?.[1]?.[0] ?? null
}
