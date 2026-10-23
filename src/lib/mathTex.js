// แปลงสมการที่เป็นข้อความ (ผลจาก speechMath หรือที่พิมพ์เอง) ให้เป็น LaTeX เพื่อเรนเดอร์เป็นสมการจริง
//   ΣF = √(a² + b²)   →   \Sigma F = \sqrt{a^{2}+b^{2}}
// ถ้าข้อความมีคำสั่ง LaTeX (\frac ฯลฯ) อยู่แล้ว จะใช้ตามนั้นโดยไม่แตะ
import { SUP, SUB } from './speechMath.js'

const invert = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k === '-' ? '−' : k]))
const SUPR = invert(SUP), SUBR = invert(SUB)
const SUPS = Object.keys(SUPR).join(''), SUBS = Object.keys(SUBR).join('')
const esc = x => x.replace(/\\/g, '').replace(/([&%$#_{}])/g, '\\$1').replace(/[~^]/g, '')

const GREEK = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', Γ: '\\Gamma', δ: '\\delta', Δ: '\\Delta', ε: '\\varepsilon', η: '\\eta', θ: '\\theta', Θ: '\\Theta',
  κ: '\\kappa', λ: '\\lambda', Λ: '\\Lambda', μ: '\\mu', ν: '\\nu', π: '\\pi', Π: '\\Pi', ρ: '\\rho', σ: '\\sigma', Σ: '\\Sigma', τ: '\\tau',
  φ: '\\varphi', Φ: '\\Phi', ω: '\\omega', Ω: '\\Omega', '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty',
}
const VULGAR = { '½': '\\frac{1}{2}', '¼': '\\frac{1}{4}', '¾': '\\frac{3}{4}' }
const OPS = {
  '+': '+', '−': '-', '-': '-', '=': '=', '<': '<', '>': '>', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '≠': '\\neq',
  '≤': '\\leq', '≥': '\\geq', '≈': '\\approx', '∝': '\\propto', '→': '\\to', '·': '\\cdot', ',': ',', ';': ';', ':': ':', '∫': '\\int', '|': '|', '!': '!',
}
const FN = /^(sin|cos|tan|log|ln|exp)(?![A-Za-z])/
const WORD3 = new Set(['sec', 'min', 'net', 'rad', 'the', 'and', 'for', 'max'])
const TEXT = /^(?:[\u0E00-\u0E7F]+|[A-Za-z]{4,}|(?:sec|min|net|rad|the|and|for|max)(?![A-Za-z]))(?:[ ]+(?:[\u0E00-\u0E7F]+|[A-Za-z]{4,}|(?:sec|min|net|rad|the|and|for|max)(?![A-Za-z])))*/
const NOT_ATOM = /[\s+\-−=<>×÷±∓≠≤≥≈∝→·,;:!|/)\]%∫]/

function line(s) {
  let i = 0
  const dec = (str, map) => [...str].map(c => map[c] ?? c).join('')
  const sub = str => (/^[A-Za-z]{2,}$/.test(str) ? `\\mathrm{${str}}` : str)
  const tok = str => [...str].map(c => GREEK[c] ?? (c === '−' ? '-' : c)).join(' ')

  function scripts(u) {
    for (;;) {
      const c = s[i]
      if (!c) break
      if (SUPS.includes(c)) { let r = ''; while (s[i] && SUPS.includes(s[i])) r += SUPR[s[i++]]; u.t += `^{${r.replace(/−/g, '-')}}`; u.sc = 1 }
      else if (SUBS.includes(c)) { let r = ''; while (s[i] && SUBS.includes(s[i])) r += SUBR[s[i++]]; u.t += `_{${sub(r)}}`; u.sc = 1 }
      else if (c === '^' || c === '_') {
        i++; while (s[i] === ' ') i++
        let body = ''
        if (s[i] === '(') { i++; body = run(')'); if (s[i] === ')') i++ }
        else { const m = /^[+−-]?(?:\d+(?:\.\d+)?|[A-Za-z]+|[α-ωΑ-Ω])/.exec(s.slice(i)); if (!m) break; i += m[0].length; body = tok(m[0]) }
        u.t += c === '^' ? `^{${body}}` : `_{${c === '_' && /^[A-Za-z]{2,}$/.test(body) ? sub(body) : body}}`; u.sc = 1
      } else if (c === '°') { i++; u.t += '^{\\circ}'; u.sc = 1 }
      else break
    }
    return u
  }

  function atom(sp) {
    const ch = s[i], rest = s.slice(i)
    let m, u
    if (ch === '(' || ch === '[') {
      const close = ch === '(' ? ')' : ']'
      i++; const inner = run(close); if (s[i] === close) i++
      u = { k: 'atom', t: `\\left${ch}${inner}\\right${close}`, inner }
    } else if (ch === '√' || ch === '∛') {
      i++; while (s[i] === ' ') i++
      const a = i < s.length && !NOT_ATOM.test(s[i]) ? atom(false) : null
      const body = a ? (a.inner !== undefined && !a.sc ? a.inner : a.t) : ''
      u = { k: 'atom', t: ch === '√' ? `\\sqrt{${body}}` : `\\sqrt[3]{${body}}` }
    } else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { i += m[0].length; u = { k: 'atom', t: m[0] } }
    else if ((m = FN.exec(rest))) { i += m[0].length; u = { k: 'fn', t: '\\' + m[1] } }
    else if ((m = TEXT.exec(rest))) { i += m[0].length; u = { k: 'text', t: `\\text{${esc(m[0])}}` } }
    else if (/^[A-Za-z]/.test(ch)) { i++; u = { k: 'atom', t: ch } }
    else if (GREEK[ch]) { i++; u = { k: 'atom', t: GREEK[ch] } }
    else if (VULGAR[ch]) { i++; u = { k: 'atom', t: VULGAR[ch] } }
    else if (ch === '%') { i++; u = { k: 'atom', t: '\\%' } }
    else { i++; u = { k: 'text', t: `\\text{${esc(ch)}}` } }
    u.sp = sp
    return u.k === 'atom' ? scripts(u) : u
  }

  const numTex = u => (u.length === 1 && u[0].inner !== undefined && !u[0].sc ? u[0].inner : join(u))
  function join(out) {
    let r = ''
    out.forEach((u, j) => {
      if (j && u.sp && (u.k === 'text' || out[j - 1].k === 'text')) r += '\\ '
      r += u.t
      if (/\\[a-zA-Z]+$/.test(u.t)) r += ' '
    })
    return r.trim()
  }

  function run(close) {
    const out = []
    let sp = false
    while (i < s.length && s[i] !== close) {
      const ch = s[i]
      if (/\s/.test(ch)) { sp = true; i++; continue }
      if (ch === '/') {
        let k = out.length
        while (k > 0 && out[k - 1].k === 'atom') { k--; if (out[k].sp) break }
        const num = out.splice(k)
        i++
        const den = []
        while (i < s.length && s[i] !== close && !NOT_ATOM.test(s[i])) den.push(atom(false))
        if (!num.length || !den.length) { out.push(...num, { k: 'op', t: '/', sp }); out.push(...den) }
        else out.push({ k: 'atom', t: `\\frac{${numTex(num)}}{${numTex(den)}}`, sp: num[0].sp })
        sp = false; continue
      }
      if (OPS[ch]) { i++; out.push({ k: 'op', t: OPS[ch], sp }); sp = false; continue }
      out.push(atom(sp)); sp = false
    }
    return join(out)
  }
  return run(null)
}

// ข้อความหลายบรรทัด → LaTeX ก้อนเดียว
export function toLatex(text) {
  const rows = String(text).split('\n').map(l => l.trim()).filter(Boolean)
  if (!rows.length) return ''
  const tex = rows.map(l => (/\\[a-zA-Z]/.test(l) ? l : line(l)))
  return tex.length === 1 ? tex[0] : `\\begin{array}{l}${tex.join('\\\\')}\\end{array}`
}

// ข้อความนี้ควรจัดเป็นสมการหรือเป็นข้อความธรรมดา
export function looksMath(text) {
  return /[=+−×÷√∛Σ∫<>≤≥≈∝±^_\\\u0370-\u03FF°²³⁰-⁹₀-₉ⁿˣʸ]|[A-Za-z0-9)]\/[A-Za-z0-9(]/.test(text)
}
