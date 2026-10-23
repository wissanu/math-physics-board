<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { PALETTE, ink, bg, drawItem, hit, move } from './lib/draw.js'
import { runCommand, HELP } from './lib/commands.js'
import { recognizeShape, bounds } from './lib/recognize.js'
import { recognizeText } from './lib/handwriting.js'
import { speechToMath } from './lib/speechMath.js'
import { toLatex, looksMath } from './lib/mathTex.js'
import { mathMetrics, mathInlineSvg, onMathReady } from './lib/mathRender.js'

const TOOLS = [
  { id: 'select', label: 'เลือก/เลื่อน', key: 'V' },
  { id: 'pen', label: 'ปากกา', key: 'P' },
  { id: 'line', label: 'เส้นตรง', key: 'L' },
  { id: 'curve', label: 'โค้ง', key: 'C' },
  { id: 'text', label: 'ข้อความ', key: 'T' },
  { id: 'erase', label: 'ยางลบ', key: 'E' },
]
const KEYS = Object.fromEntries(TOOLS.map(t => [t.key.toLowerCase(), t.id]))
const ARCS = [['ครึ่งวงกลม', 0.5], ['โค้งหนึ่งในสี่วงกลม', 0.2071], ['โค้งเล็กน้อย', 0.1]]

const canvas = ref(null), cmdEl = ref(null), taEl = ref(null)
const tool = ref('pen'), color = ref('ink'), width = ref(3), dashed = ref(false)
const theme = ref('dark'), rawInk = ref(false), lang = ref('en'), cmd = ref(''), msg = ref('')
const zoomPct = ref(100), popup = ref(null), edit = ref(null)
const voice = ref(null), vlang = ref('th-TH'), prevEl = ref(null)
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
const cssColor = computed(() => (color.value === 'ink' ? ink(theme.value) : color.value))
// ขนาดตัวอักษรในกล่องเสียง = ขนาดที่จะวางจริงบนกระดาน (ตามแถบความหนา × ซูม) จำกัดให้อ่านออกเสมอ
const voicePx = computed(() => Math.min(72, Math.max(16, (textSize() * zoomPct.value) / 100)))
const voiceBg = computed(() => bg(theme.value) + 'f2')
// สมการที่จัดรูปแล้ว (LaTeX) ของข้อความในกล่องเสียง; null = ใช้ข้อความธรรมดา
const voiceTex = computed(() => {
  const v = voice.value
  if (!v || !v.text.trim() || v.mode === 'text' || (v.mode === 'auto' && !looksMath(v.text))) return null
  const tex = toLatex(v.text)
  return tex && mathMetrics(tex) ? tex : null
})
const voiceSvg = computed(() => (voiceTex.value ? mathInlineSvg(voiceTex.value, voicePx.value) : null))
const MODES = { auto: 'รูปแบบ: อัตโนมัติ', math: 'รูปแบบ: สมการ', text: 'รูปแบบ: ข้อความ' }
const cycleMode = () => { const v = voice.value; v.mode = { auto: 'math', math: 'text', text: 'auto' }[v.mode] }

let c, W = 0, H = 0, dpr = 1, tm
let items = [], undo = [], redo = []
let cur = null, drag = null, pan = null, pinch = null, erasing = false, snapped = false
let anchor = null, spaceDown = false, penSeen = false
let uid = 0, pending = [], inkTimer = null, errShown = false
const view = { s: 1, x: 0, y: 0 }
const touches = new Map()

const snap = () => { undo.push(JSON.stringify(items)); redo = []; if (undo.length > 150) undo.shift() }
function undoFn() { if (!undo.length) return; redo.push(JSON.stringify(items)); items = JSON.parse(undo.pop()); render() }
function redoFn() { if (!redo.length) return; undo.push(JSON.stringify(items)); items = JSON.parse(redo.pop()); render() }
function flash(s, ms = 3500) { msg.value = s; clearTimeout(tm); tm = setTimeout(() => (msg.value = ''), ms) }
const focusBar = () => cmdEl.value?.focus()
const textSize = () => 14 + width.value * 3

const spos = e => ({ x: e.clientX, y: e.clientY })
const wpos = e => {
  const p = { x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s }
  if (e.pointerType === 'pen') p.p = e.pressure || 0.5
  return p
}
function zoomAt(sx, sy, f) {
  const ns = Math.min(5, Math.max(0.2, view.s * f)), k = ns / view.s
  view.x = sx - (sx - view.x) * k; view.y = sy - (sy - view.y) * k; view.s = ns
  render()
}
function resetView() { view.s = 1; view.x = 0; view.y = 0; render() }

function fit() {
  dpr = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight
  canvas.value.width = W * dpr; canvas.value.height = H * dpr
  render()
}

function render() {
  if (!c) return
  const { s, x, y } = view
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.fillStyle = bg(theme.value); c.fillRect(0, 0, W, H)
  c.setTransform(dpr * s, 0, 0, dpr * s, dpr * x, dpr * y)
  c.fillStyle = theme.value === 'dark' ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'
  let step = 32
  while (step * s < 18) step *= 2
  for (let wx = Math.floor(-x / s / step) * step; wx < (W - x) / s; wx += step)
    for (let wy = Math.floor(-y / s / step) * step; wy < (H - y) / s; wy += step) c.fillRect(wx - 1 / s, wy - 1 / s, 2 / s, 2 / s)
  items.forEach(i => drawItem(c, i, theme.value))
  if (cur && cur.tool !== 'text') drawItem(c, build(cur), theme.value)
  if (anchor) {
    c.strokeStyle = '#fbbf24'; c.lineWidth = 2 / s
    c.beginPath(); c.arc(anchor.x, anchor.y, 7 / s, 0, Math.PI * 2); c.stroke()
  }
  zoomPct.value = Math.round(s * 100)
}

// ลากโค้งหยาบ ๆ → วงโค้งสมมาตร: ใช้จุดปลายสองจุด + จุดที่เบี่ยงจากคอร์ดมากที่สุดเป็นระยะนูน
function arcFromDrag(p) {
  const a = p[0], b = p[p.length - 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1
  const n = { x: -dy / L, y: dx / L }
  let h = 0
  for (const q of p) { const d = (q.x - a.x) * n.x + (q.y - a.y) * n.y; if (Math.abs(d) > Math.abs(h)) h = d }
  if (Math.abs(h) < 3 / view.s) return [a, b, 'line']
  return [a, { x: (a.x + b.x) / 2 + n.x * h, y: (a.y + b.y) / 2 + n.y * h }, b]
}

function build(k) {
  const p = k.pts, a = p[0], b = p[p.length - 1], s = { color: k.color, w: k.w, dash: k.dash }
  if (k.tool === 'line') return { type: 'line', pts: [a, b], ...s }
  if (k.tool === 'curve') {
    const r = arcFromDrag(p)
    return r[2] === 'line' ? { type: 'line', pts: [a, b], ...s } : { type: 'arc', pts: r, ...s }
  }
  return { type: 'stroke', pts: p, ...s }
}

function arcOptions(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, horiz = Math.abs(dx) >= Math.abs(dy)
  let n = { x: -dy / L, y: dx / L }
  if (horiz ? n.y > 0 : n.x > 0) n = { x: -n.x, y: -n.y }
  const names = horiz ? ['นูนขึ้น', 'นูนลง'] : ['นูนซ้าย', 'นูนขวา'], out = []
  for (const [lab, k] of ARCS) names.forEach((nm, i) => {
    const sg = i ? -1 : 1
    out.push({ label: `${lab} ${nm}`, type: 'arc', pts: [a, { x: (a.x + b.x) / 2 + sg * n.x * k * L, y: (a.y + b.y) / 2 + sg * n.y * k * L }, b] })
  })
  out.push({ label: 'เส้นตรง', type: 'line', pts: [a, b] })
  return out
}
function choose(o) {
  snap(); items.push({ type: o.type, pts: o.pts, color: color.value, w: width.value, dash: dashed.value })
  anchor = null; popup.value = null; render()
}

function commitText() {
  const e = edit.value
  if (!e) return
  edit.value = null
  if (e.value.trim()) { snap(); items.push({ type: 'text', x: e.x, y: e.y, text: e.value, size: e.size, color: e.color, w: 1 }); render() }
}

function erase(p) {
  const r = 14 / view.s, keep = items.filter(i => !hit(i, p.x, p.y, r, true))
  if (keep.length === items.length) return
  if (!snapped) { snap(); snapped = true }
  items = keep; render()
}

function startPinch() {
  const [a, b] = [...touches.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
  pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s, wx: (cx - view.x) / view.s, wy: (cy - view.y) / view.s }
}
function applyPinch() {
  const [a, b] = [...touches.values()], cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
  view.s = Math.min(5, Math.max(0.2, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d))
  view.x = cx - pinch.wx * view.s; view.y = cy - pinch.wy * view.s
  render()
}

function down(e) {
  if (popup.value) { popup.value = null; return }
  commitText()
  document.activeElement?.blur()
  canvas.value.setPointerCapture(e.pointerId)
  const s = spos(e)
  if (e.pointerType === 'pen') penSeen = true
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, s)
    if (touches.size === 2) { cur = null; drag = null; pan = null; erasing = false; startPinch(); return }
    if (touches.size > 2 || penSeen) return // กันฝ่ามือ: นิ้วเดี่ยวไม่เขียน
  }
  if (e.button === 1 || spaceDown) { pan = { sx: s.x, sy: s.y, ox: view.x, oy: view.y }; return }
  const p = wpos(e)
  const t = tool.value
  if (t === 'select') {
    const it = [...items].reverse().find(i => hit(i, p.x, p.y, 10 / view.s))
    if (it) { snap(); drag = { it, s } }
    else pan = { sx: s.x, sy: s.y, ox: view.x, oy: view.y, empty: true }
    return
  }
  if (t === 'erase') { erasing = true; snapped = false; erase(p); return }
  if (t === 'pen') clearTimeout(inkTimer)
  cur = { tool: t, pts: [p], s0: s, moved: e.pointerType === 'pen' && t === 'pen', color: color.value, w: width.value, dash: dashed.value }
  render()
}

function moveEv(e) {
  const s = spos(e)
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, s)
    if (pinch) return applyPinch()
  }
  if (pan) {
    if (Math.hypot(s.x - pan.sx, s.y - pan.sy) > 5) pan.moved = true
    if (!pan.empty) { view.x = pan.ox + s.x - pan.sx; view.y = pan.oy + s.y - pan.sy; render() } // ลากพื้นที่ว่างด้วยเครื่องมือเลือก ไม่เลื่อนกระดาน
    return
  }
  if (!cur && !drag && !erasing) return
  const co = e.getCoalescedEvents?.() ?? []
  for (const ev of co.length ? co : [e]) {
    if (cur) {
      cur.pts.push(wpos(ev))
      if (Math.hypot(ev.clientX - cur.s0.x, ev.clientY - cur.s0.y) > 5) cur.moved = true
    } else if (drag) { move(drag.it, (ev.clientX - drag.s.x) / view.s, (ev.clientY - drag.s.y) / view.s); drag.s = spos(ev) }
    else erase(wpos(ev))
  }
  render()
}

function up(e) {
  touches.delete(e.pointerId)
  if (touches.size < 2) pinch = null
  if (pan) { if (pan.empty && !pan.moved) focusBar(); pan = null; render(); return }
  if (cur) {
    const k = cur; cur = null
    if (k.moved) {
      snap(); const it = build(k); it.id = ++uid; items.push(it)
      if (k.tool === 'pen' && !rawInk.value) queueInk(it.id)
    }
    else if (k.tool === 'curve') {
      const p = k.pts[0]
      if (e.shiftKey && anchor) popup.value = { x: Math.min(e.clientX, W - 230), y: Math.min(e.clientY, H - 340), opts: arcOptions(anchor, p) }
      else anchor = p
    } else if (k.tool === 'text') {
      edit.value = { x: k.pts[0].x, y: k.pts[0].y, sx: e.clientX, sy: e.clientY, value: '', size: textSize(), color: color.value }
      nextTick(() => taEl.value?.focus())
    } else { focusBar(); if (pending.length) queueInk() }
  }
  drag = null; erasing = false; render()
}

function queueInk(id) { if (id) pending.push(id); clearTimeout(inkTimer); inkTimer = setTimeout(processInk, 750) }
function flushInk() { if (pending.length) { clearTimeout(inkTimer); processInk() } }

// หยุดเขียน 0.75 วินาที → เส้นใหญ่ที่เป็นรูปทรงถูกแปลงเป็นรูปทรง, เส้นเล็ก ๆ (ลายมือ) ส่งไปอ่านเป็นตัวอักษร
async function processInk() {
  const ids = new Set(pending); pending = []
  const shapes = [], texts = []
  for (const s of items.filter(i => ids.has(i.id))) {
    const B = bounds(s.pts), sh = recognizeShape(s.pts)
    if (sh && B.diag * view.s > 70) shapes.push([s, sh])
    else if (B.h * view.s < 130) texts.push(s)
  }
  if (shapes.length) {
    snap()
    for (const [s, sh] of shapes) { const k = items.indexOf(s); if (k >= 0) items[k] = { ...sh, color: s.color, w: s.w, dash: s.dash, id: s.id } }
    render()
  }
  if (!texts.length) return
  try {
    const str = await recognizeText(texts, view.s, lang.value)
    const keep = texts.filter(t => items.includes(t))
    if (!str || !keep.length) return
    const B = bounds(keep.flatMap(t => t.pts)), size = Math.max(18, Math.min(90, B.h * 0.9))
    snap()
    items = items.filter(i => !keep.includes(i))
    items.push({ type: 'text', text: str, x: B.x0, y: (B.y0 + B.y1) / 2 - size * 0.65, size, color: keep[0].color, w: 1, id: ++uid })
    render()
  } catch {
    if (!errShown) { errShown = true; flash('อ่านลายมือไม่ได้ (ต้องต่ออินเทอร์เน็ต) เส้นยังอยู่ตามเดิม', 5000) }
  }
}

// ───────── กล่องเสียง: พูด → สมการ/ข้อความ → ลากไปวางบนกระดาน ─────────
let rec = null, wantListen = false, vdrag = null

function openVoice() {
  commitText()
  const w = Math.min(560, W - 24)
  voice.value = { x: Math.round((W - w) / 2), y: Math.max(70, Math.round(H / 2 - 130)), w, text: '', interim: '', listening: false, mode: 'auto' }
}

function startListen() {
  if (!SR) return flash('เบราว์เซอร์นี้ไม่รองรับการรับเสียง ลองใช้ Chrome, Edge หรือ Safari (พิมพ์ลงกล่องแล้วกด “แปลงสัญลักษณ์” ได้เหมือนกัน)', 6000)
  if (!window.isSecureContext) return flash('การรับเสียงต้องเปิดผ่าน https หรือ localhost เท่านั้น (เปิดผ่าน http://IP ในวง LAN ไมค์จะถูกบล็อก)', 7000)
  if (rec) return
  rec = new SR()
  rec.lang = vlang.value; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1
  rec.onstart = () => { if (voice.value) voice.value.listening = true }
  rec.onresult = ev => {
    const v = voice.value
    if (!v) return
    let interim = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]
      if (r.isFinal) appendVoice(r[0].transcript)
      else interim += r[0].transcript
    }
    v.interim = speechToMath(interim).replace(/\n+/g, ' ⏎ ').trim()
  }
  rec.onerror = e => {
    const fatal = {
      'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาอนุญาตในเบราว์เซอร์แล้วลองใหม่',
      'service-not-allowed': 'เบราว์เซอร์ไม่อนุญาตให้ใช้บริการรับเสียงในหน้านี้',
      'audio-capture': 'ไม่พบไมโครโฟน',
      network: 'บริการแปลงเสียงต้องต่ออินเทอร์เน็ต',
      'language-not-supported': 'ไม่รองรับภาษานี้ในเบราว์เซอร์ของคุณ',
    }[e.error]
    if (fatal) { wantListen = false; flash(fatal, 6000) } // no-speech / aborted: ปล่อยให้ onend เริ่มฟังต่อเอง
  }
  rec.onend = () => {
    if (wantListen && voice.value) {
      try { rec.lang = vlang.value; rec.start(); return } catch { /* ตกไปปิดการฟัง */ }
    }
    wantListen = false; rec = null
    if (voice.value) { voice.value.listening = false; voice.value.interim = '' }
  }
  wantListen = true
  try { rec.start() } catch { wantListen = false; rec = null }
}

function stopListen() {
  wantListen = false
  try { rec?.stop() } catch { /* ไม่ได้ฟังอยู่ */ }
  if (voice.value) { voice.value.listening = false; voice.value.interim = '' }
}

function toggleMic() {
  if (!voice.value) { openVoice(); startListen() }
  else if (wantListen) stopListen()
  else startListen()
}

function appendVoice(raw) {
  const t = speechToMath(raw), v = voice.value
  if (!t || !v) return
  v.text = !v.text || v.text.endsWith('\n') || t.startsWith('\n') ? v.text + t : v.text + ' ' + t
}

function closeVoice() { stopListen(); voice.value = null }
function changeVoiceLang() { if (rec && wantListen) try { rec.stop() } catch { /* onend จะเริ่มใหม่ด้วยภาษาใหม่ */ } }
function convertVoiceText() { if (voice.value) voice.value.text = speechToMath(voice.value.text) }

function vDown(e) {
  if (e.target.closest('button, select')) return
  vdrag = { dx: e.clientX - voice.value.x, dy: e.clientY - voice.value.y }
  e.currentTarget.setPointerCapture(e.pointerId)
}
function vMove(e) {
  if (!vdrag || !voice.value) return
  const v = voice.value
  v.x = Math.round(Math.min(W - 90, Math.max(90 - v.w, e.clientX - vdrag.dx)))
  v.y = Math.round(Math.min(H - 50, Math.max(0, e.clientY - vdrag.dy)))
}
const vUp = () => { vdrag = null }

// วางลงกระดาน: มุมซ้ายบนของตัวอย่างในกล่อง = ตำแหน่งที่สมการ/ข้อความจะอยู่
function placeVoice() {
  const v = voice.value, el = prevEl.value
  if (!v || !el) return
  const text = v.text.replace(/\s+$/g, '')
  if (!text.trim()) return flash('ยังไม่มีข้อความ — กดไมค์แล้วพูด หรือพิมพ์ลงในกล่อง')
  const r = el.getBoundingClientRect(), size = voicePx.value / view.s
  const x = (r.left - view.x) / view.s, y = (r.top - view.y) / view.s
  snap()
  if (voiceTex.value) items.push({ type: 'math', tex: voiceTex.value, x, y, size, color: color.value, w: 1, id: ++uid })
  else items.push({ type: 'text', text, x, y: y + size * 0.15, size, color: color.value, w: 1, id: ++uid })
  closeVoice(); render()
  flash('วางแล้ว ใช้เครื่องมือ “เลือก/เลื่อน” เพื่อย้ายได้อีก', 3500)
}

function wheel(e) {
  let dy = e.deltaY; if (e.deltaMode === 1) dy *= 30
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)))
}

function submit() {
  const r = runCommand(cmd.value, { W: W / view.s, H: H / view.s, items })
  if (r.error) return flash(r.error)
  if (r.action === 'clear') { snap(); items = [] }
  else if (r.action === 'undo') undoFn()
  else if (r.action === 'help') return flash(HELP, 12000)
  else if (r.addExpr) { snap(); items.at(-1).exprs.push(r.addExpr) }
  else if (r.item) {
    snap()
    r.item.x += -view.x / view.s; r.item.y += -view.y / view.s // วางกลางหน้าจอที่กำลังมองอยู่
    items.push({ color: 'ink', w: 2, ...r.item })
  }
  cmd.value = ''; render()
}

function exportPng() {
  const a = document.createElement('a')
  a.download = 'whiteboard.png'; a.href = canvas.value.toDataURL('image/png'); a.click()
}

function escape() {
  flushInk(); commitText(); stopListen()
  cur = null; drag = null; pan = null; erasing = false; anchor = null; popup.value = null
  tool.value = 'select'
  document.activeElement?.blur(); render()
}

function key(e) {
  if (e.key === 'Escape') return escape()
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redoFn() : undoFn(); return }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.code === 'Space') { e.preventDefault(); document.activeElement?.blur(); spaceDown = true; return }
  const k = e.key.toLowerCase()
  if (KEYS[k]) tool.value = KEYS[k]
  else if (k === '/') focusBar()
  else if (k === 'm') toggleMic()
  else if (k === '=' || k === '+') zoomAt(W / 2, H / 2, 1.25)
  else if (k === '-') zoomAt(W / 2, H / 2, 0.8)
  else if (k === '0') resetView()
}
const keyUp = e => { if (e.code === 'Space') spaceDown = false }

watch(theme, render)
watch(rawInk, on => {
  if (on) { clearTimeout(inkTimer); pending = [] } else flushInk()
  flash(on ? 'ลายมือดิบ: ปากกาจะไม่แปลงอะไรทั้งสิ้น' : 'โหมดแปลง: เส้นตรง วงกลม วงรี รูปหลายเหลี่ยม วงโค้ง และตัวอักษร', 4000)
})
watch(tool, t => {
  if (t !== 'pen') flushInk()
  commitText()
  if (t !== 'curve') { anchor = null; popup.value = null; render() }
  else flash('โค้ง: ลากเป็นโค้งหยาบ ๆ หรือคลิกจุดแรก แล้วกด Shift ค้างพร้อมคลิกจุดที่สอง เพื่อเลือกรูปโค้ง', 6000)
})
onMounted(() => {
  c = canvas.value.getContext('2d'); fit(); onMathReady(render)
  window.addEventListener('resize', fit); window.addEventListener('keydown', key); window.addEventListener('keyup', keyUp)
})
onBeforeUnmount(() => {
  stopListen()
  window.removeEventListener('resize', fit); window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp)
})
</script>

<template>
  <canvas
    ref="canvas"
    :style="{ cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair' }"
    @pointerdown.prevent="down"
    @pointermove="moveEv"
    @pointerup="up"
    @pointercancel="up"
    @wheel.prevent="wheel"
    @contextmenu.prevent
  />

  <textarea
    v-if="edit" ref="taEl" v-model="edit.value" class="textbox" spellcheck="false"
    :rows="edit.value.split('\n').length"
    :style="{ left: edit.sx + 'px', top: edit.sy + 'px', fontSize: (edit.size * zoomPct) / 100 + 'px', color: edit.color === 'ink' ? ink(theme) : edit.color }"
    placeholder="พิมพ์ข้อความ…"
    @blur="commitText" @keydown.ctrl.enter.prevent="commitText" @keydown.meta.enter.prevent="commitText"
  />

  <div class="toolbar">
    <button v-for="t in TOOLS" :key="t.id" :class="{ on: tool === t.id }" :title="`${t.label} (${t.key})`" @click="tool = t.id">{{ t.label }}</button>
    <button class="mic" :class="{ on: !!voice, rec: voice?.listening }" title="พูดเป็นข้อความ/สมการ (M)" @click="toggleMic">🎤 เสียง</button>
    <label><input type="checkbox" v-model="dashed" /> เส้นประ</label>
    <span class="sep" />
    <button
      v-for="p in PALETTE" :key="p" class="dot" :class="{ on: color === p }"
      :style="{ background: p === 'ink' ? ink(theme) : p }" :aria-label="'สี ' + p" @click="color = p"
    />
    <input type="range" min="1" max="12" v-model.number="width" aria-label="ความหนาเส้น" />
    <span class="sep" />
    <button @click="zoomAt(W / 2, H / 2, 0.8)" aria-label="ซูมออก" title="ซูมออก (-)">−</button>
    <button class="zoom" @click="resetView" title="กลับ 100% (0)">{{ zoomPct }}%</button>
    <button @click="zoomAt(W / 2, H / 2, 1.25)" aria-label="ซูมเข้า" title="ซูมเข้า (+)">+</button>
    <span class="sep" />
    <button @click="undoFn" aria-label="ย้อนกลับ">↶</button>
    <button @click="redoFn" aria-label="ทำซ้ำ">↷</button>
    <button @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme === 'dark' ? 'กระดานขาว' : 'กระดานดำ' }}</button>
    <button @click="exportPng">บันทึก PNG</button>
    <label title="เลือก = ลายมือดิบ ไม่แปลงอะไรเลย / ไม่เลือก = ปากกาแปลงเป็นรูปทรงและตัวอักษร"><input type="checkbox" v-model="rawInk" /> ปากกาเท่านั้น</label>
    <select v-if="!rawInk" v-model="lang" title="ภาษาของลายมือ"><option value="en">EN</option><option value="th">ไทย</option></select>
  </div>

  <div
    v-if="voice" class="voicebox" role="dialog" aria-label="กล่องข้อความจากเสียง"
    :style="{ left: voice.x + 'px', top: voice.y + 'px', width: voice.w + 'px', background: voiceBg, color: ink(theme) }"
  >
    <div class="vbar vhead" @pointerdown="vDown" @pointermove="vMove" @pointerup="vUp" @pointercancel="vUp">
      <span class="grip" aria-hidden="true">⠿</span>
      <span class="vstate" :class="{ rec: voice.listening }">{{ voice.listening ? 'กำลังฟัง…' : 'หยุดฟังอยู่' }}</span>
      <select v-model="vlang" title="ภาษาที่พูด" @change="changeVoiceLang"><option value="th-TH">ไทย</option><option value="en-US">EN</option></select>
      <button :class="{ on: voice.listening }" @click="toggleMic">{{ voice.listening ? 'หยุด' : '🎤 พูด' }}</button>
      <button aria-label="ปิดกล่อง" title="ปิดโดยไม่วาง" @click="closeVoice">✕</button>
    </div>
    <div class="vprev" :style="{ color: color === 'ink' ? ink(theme) : color }">
      <div ref="prevEl" class="vprevin">
        <div v-if="voiceSvg" class="vsvg" v-html="voiceSvg" />
        <pre v-else-if="voice.text.trim()" class="vplain" :style="{ fontSize: voicePx + 'px' }">{{ voice.text }}</pre>
        <span v-else class="vhint" :style="{ fontSize: Math.min(voicePx, 22) + 'px' }">สมการหรือข้อความจะแสดงที่นี่</span>
      </div>
    </div>
    <textarea
      v-model="voice.text" class="vtext" wrap="off" spellcheck="false" :rows="Math.max(2, voice.text.split('\n').length)"
      placeholder="พูดได้เลย เช่น “ซิกม่า เอฟ เท่ากับ รูท เปิดวงเล็บ เอ กำลังสอง บวก บี กำลังสอง ปิดวงเล็บ” หรือพิมพ์เอง (รองรับ LaTeX เช่น \frac{a}{b})"
      @keydown.ctrl.enter.prevent="placeVoice" @keydown.meta.enter.prevent="placeVoice"
    />
    <div class="vlive" :class="{ off: !voice.interim }">{{ voice.interim ? '🎙 ' + voice.interim : '' }}</div>
    <div class="vbar vfoot">
      <button title="แปลงข้อความที่พิมพ์ เช่น sigma F = root(a^2+b^2) ให้เป็นสัญลักษณ์" @click="convertVoiceText">แปลงสัญลักษณ์</button>
      <button @click="voice.text = ''">ล้าง</button>
      <button title="สลับระหว่างจัดเป็นสมการ / ข้อความธรรมดา" @click="cycleMode">{{ MODES[voice.mode] }}</button>
      <span class="grow" />
      <button class="go" title="วางที่ตำแหน่งปัจจุบันของกล่อง (Ctrl+Enter)" @click="placeVoice">วางบนกระดาน</button>
    </div>
  </div>

  <ul v-if="popup" class="popup" :style="{ left: popup.x + 'px', top: popup.y + 'px' }" role="menu">
    <li v-for="o in popup.opts" :key="o.label"><button role="menuitem" @click="choose(o)">{{ o.label }}</button></li>
  </ul>

  <pre v-if="msg" class="toast">{{ msg }}</pre>

  <form class="cmd" @submit.prevent="submit">
    <input
      ref="cmdEl" v-model="cmd" enterkeyhint="go" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
      placeholder="พิมพ์สมการหรือคำสั่ง เช่น sin(x)  /unitcircle 40  /projectile v=20 angle=45  /help"
    />
  </form>
</template>

<style>
:root { --board-font: "Sarabun", system-ui, "Cambria Math", "STIX Two Math", "Apple Symbols", "Noto Sans Math", "Segoe UI Symbol", sans-serif; --ink: #f2efe6; --panel: rgba(18, 26, 22, 0.88); --line: rgba(242, 239, 230, 0.2); }
html, body, #app { margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none; font-family: "Sarabun", system-ui, -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
canvas { position: fixed; inset: 0; width: 100vw; height: 100dvh; display: block; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }

.toolbar {
  position: fixed; top: calc(12px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; max-width: 96vw; overflow-x: auto; padding: 6px 10px;
  background: var(--panel); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 14px; color: var(--ink); font-size: 15px;
}
.toolbar button { background: none; border: 0; color: inherit; font: inherit; padding: 7px 11px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.toolbar button.on { background: rgba(242, 239, 230, 0.18); }
.toolbar button.zoom { min-width: 56px; padding: 7px 4px; }
.toolbar label { display: flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer; }
.toolbar .dot { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid transparent; flex: none; }
.toolbar .dot.on { border-color: #fff; background-clip: padding-box; }
.toolbar select { background: transparent; color: inherit; font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; }
.toolbar select option { color: #111; }
.sep { width: 1px; height: 22px; background: var(--line); flex: none; }

.cmd { position: fixed; left: 10%; width: 80%; bottom: calc(16px + env(safe-area-inset-bottom)); }
.cmd input {
  width: 100%; box-sizing: border-box; height: 54px; padding: 0 26px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(10px);
  color: var(--ink); font: inherit; font-size: 18px; outline: none;
}
.cmd input:focus-visible { border-color: #fbbf24; }
.cmd input::placeholder { color: rgba(242, 239, 230, 0.5); }

.toast {
  position: fixed; left: 50%; bottom: calc(86px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  margin: 0; max-width: 90vw; padding: 12px 18px; border-radius: 12px; background: var(--panel);
  border: 1px solid var(--line); color: var(--ink); font: inherit; font-size: 15px; white-space: pre-wrap;
}

.popup {
  position: fixed; z-index: 10; margin: 0; padding: 6px; list-style: none; min-width: 210px;
  background: var(--panel); backdrop-filter: blur(10px); border: 1px solid var(--line); border-radius: 12px;
}
.popup button { width: 100%; text-align: left; background: none; border: 0; color: var(--ink); font: inherit; font-size: 16px; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
.popup button:hover, .popup button:focus-visible { background: rgba(242, 239, 230, 0.18); outline: none; }

.toolbar button.mic.rec { color: #f87171; }
.voicebox {
  position: fixed; z-index: 8; box-sizing: border-box; display: flex; flex-direction: column;
  border: 1px solid var(--line); border-radius: 14px; overflow: hidden; backdrop-filter: blur(6px);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.4); max-width: calc(100vw - 16px);
}
.vbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: var(--panel); color: var(--ink); font-size: 15px; }
.vhead { cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.vhead:active { cursor: grabbing; }
.vbar button { background: none; border: 0; color: inherit; font: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.vbar button:hover, .vbar button.on { background: rgba(242, 239, 230, 0.18); }
.vbar select { background: transparent; color: inherit; font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 3px 6px; }
.vbar select option { color: #111; }
.vbar .grip { font-size: 20px; line-height: 1; opacity: 0.6; padding: 0 4px; }
.vstate { flex: 1; opacity: 0.75; }
.vstate.rec { opacity: 1; color: #f87171; }
.vstate.rec::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 50%; background: #f87171; animation: vpulse 1.2s ease-in-out infinite; }
@keyframes vpulse { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .vstate.rec::before { animation: none; } }
.vprev { margin: 10px 10px 0; padding: 14px 16px; min-height: 64px; border: 1px dashed rgba(128, 128, 128, 0.7); border-radius: 6px; overflow: auto; box-sizing: border-box; }
.vprevin { display: inline-block; vertical-align: top; }
.vsvg { line-height: 0; }
.vsvg svg { display: block; max-width: none; }
.vplain { margin: 0; font-family: var(--board-font); line-height: 1.3; white-space: pre; }
.vhint { opacity: 0.4; }
.vtext {
  display: block; box-sizing: border-box; width: calc(100% - 20px); min-height: 3em; margin: 10px; padding: 6px 8px; font-size: 15px;
  background: transparent; color: inherit; border: 1px solid rgba(128, 128, 128, 0.45); border-radius: 6px; outline: none; resize: none;
  font-family: var(--board-font); line-height: 1.35; white-space: pre; overflow: auto;
}
.vtext:focus-visible { border-color: #fbbf24; }
.vlive { margin: 0 12px 8px; min-height: 1.3em; font-size: 14px; opacity: 0.65; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.vlive.off { min-height: 0; margin: 0; }
.vfoot .grow { flex: 1; }
.vfoot button.go { background: #fbbf24; color: #1c1917; font-weight: 600; }
.vfoot button.go:hover { background: #fcd34d; }

.textbox {
  position: fixed; z-index: 5; min-width: 200px; padding: 0; margin: 0; background: transparent; border: 1px dashed var(--line);
  outline: none; resize: none; font-family: var(--board-font); line-height: 1.3; white-space: pre; overflow: hidden;
}
</style>
