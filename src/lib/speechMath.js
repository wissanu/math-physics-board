// แปลงข้อความที่พูด (ไทย/อังกฤษ) หรือที่พิมพ์แบบ ASCII ให้เป็นสมการที่ใช้สัญลักษณ์จริง
//   "sigma F = root( a^2 + b^2)"                                  →  ΣF = √(a² + b²)
//   "sigma F equals root open bracket a squared plus b squared close bracket" → ΣF = √(a² + b²)
//   "ซิกม่า เอฟ เท่ากับ รูท เปิดวงเล็บ เอ กำลังสอง บวก บี กำลังสอง ปิดวงเล็บ"   →  ΣF = √(a² + b²)
// ผลลัพธ์เป็นอักขระ Unicode ล้วน (Σ √ ² ₀ ฯลฯ) จึงแสดงบน canvas ได้ตรงตามที่เห็นในกล่องข้อความ

export const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '−': '⁻', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ' }
export const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '−': '₋', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }

// ชื่อกรีก: [ตัวเล็ก, ตัวใหญ่ (ถ้ามีรูปต่างจากอักษรละติน), ค่าเริ่มต้น 'l' | 'u']
const GREEK = {
  alpha: ['α', null, 'l'], beta: ['β', null, 'l'], gamma: ['γ', 'Γ', 'l'], delta: ['δ', 'Δ', 'u'],
  epsilon: ['ε', null, 'l'], eta: ['η', null, 'l'], theta: ['θ', 'Θ', 'l'], kappa: ['κ', null, 'l'],
  lambda: ['λ', 'Λ', 'l'], mu: ['μ', null, 'l'], nu: ['ν', null, 'l'], pi: ['π', 'Π', 'l'],
  rho: ['ρ', null, 'l'], sigma: ['σ', 'Σ', 'u'], tau: ['τ', null, 'l'], phi: ['φ', 'Φ', 'l'], omega: ['ω', 'Ω', 'l'],
}
const EN_ALIAS = { lamda: 'lambda', lambda: 'lambda' }
// คำไทยที่ออกเสียงชื่อกรีก (ใช้ lookahead กันไม่ให้ไปชนสระ/วรรณยุกต์ของคำอื่น เช่น "พายุ")
const TH_GREEK = {
  sigma: 'ซิกม่า|ซิกมา|ซิกม้า', delta: 'เดลต้า|เดลตา', theta: 'ธีต้า|ทีต้า|เธต้า|ธีตา|ทีตา|เธตา',
  alpha: 'อัลฟา|แอลฟา|อัลฟ่า|แอลฟ่า', beta: 'เบต้า|เบตา', gamma: 'แกมม่า|แกมมา|แกมม้า',
  lambda: 'แลมบ์ดา|แลมดา|แลมด้า|แลมบ์ด้า', mu: 'มิว', pi: 'พาย|ไพ', omega: 'โอเมก้า|โอเมกา|โอเมก้',
  phi: 'ฟาย', epsilon: 'เอปซิลอน|เอปไซลอน|เอพซิลอน', tau: 'ทาว', eta: 'อีต้า|อีตา', rho: 'โรว์', kappa: 'แคปปา|กัปปา',
}
const TH_END = '(?![\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E])' // ห้ามมีสระ/วรรณยุกต์ต่อท้าย

const LETTER_TH = {
  a: 'เอ', b: 'บี', c: 'ซี', d: 'ดี', e: 'อี', f: 'เอฟ', g: 'จี', h: 'เอช', i: 'ไอ', j: 'เจ', k: 'เค', l: 'แอล', m: 'เอ็ม',
  n: 'เอ็น', o: 'โอ', p: 'พี', q: 'คิว', r: 'อาร์', s: 'เอส', t: 'ที', u: 'ยู', v: 'วี', w: 'ดับเบิลยู|ดับบลิว|ดับเบิ้ลยู|ดับเบิลยู',
  x: 'เอ็กซ์|เอกซ์|เอ๊กซ์', y: 'วาย', z: 'แซด|แซ็ด',
}
const TH_DIGIT = { สอง: '2', สาม: '3', สี่: '4', ห้า: '5', หก: '6', เจ็ด: '7', แปด: '8', เก้า: '9' }
const ORD = { second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', nth: 'n', 'n-th': 'n' }

const b = s => `\\b(?:${s})\\b` // ขอบคำอังกฤษ
const sp = ' ' // เว้นรอบสัญลักษณ์ (ตัวจัดช่องไฟด้านล่างจะเก็บกวาดอีกที)

// ── กฎแปลงคำ → สัญลักษณ์ (เรียงลำดับสำคัญ: วลียาวมาก่อน) ───────────────────────────
const RULES = []
const add = (re, to) => RULES.push([re, to])

// ขึ้นบรรทัดใหม่
add(/\b(?:new\s*line|next\s+line)\b|ขึ้นบรรทัดใหม่|บรรทัดใหม่/gi, '\n')

// ตัวอักษรกรีก: ตัวเล็ก/ตัวใหญ่ที่ระบุเอง ก่อน แล้วค่าเริ่มต้น
for (const [name, [lo, up, def]] of Object.entries(GREEK)) {
  const names = name === 'lambda' ? 'lambda|lamda' : name
  add(new RegExp(b(`(?:small|lower\\s*case|lowercase)\\s+(?:${names})`), 'gi'), sp + lo + sp)
  add(new RegExp(b(`(?:capital|big|upper\\s*case|uppercase)\\s+(?:${names})`), 'gi'), sp + (up || lo) + sp)
  const th = TH_GREEK[name]
  if (th) {
    add(new RegExp(`(?:${th})\\s*ตัวเล็ก${TH_END}`, 'g'), sp + lo + sp)
    add(new RegExp(`(?:${th})\\s*ตัวใหญ่${TH_END}`, 'g'), sp + (up || lo) + sp)
  }
  add(new RegExp(b(names), 'gi'), sp + (def === 'u' ? up : lo) + sp)
  if (th) add(new RegExp(`(?:${th})${TH_END}`, 'g'), sp + (def === 'u' ? up : lo) + sp)
}
add(/\bohms?\b|โอห์ม/gi, ' Ω ')

// รากที่สอง/สาม (ต้องมาก่อน "root")
add(/\bcube\s+root(?:\s+of)?\b|รากที่สาม(?:ของ)?/gi, ' ∛ ')
add(new RegExp(`\\b(?:the\\s+)?(?:square\\s+root|sqrt|root)\\b(?:\\s+of\\b)?|(?:รากที่สอง|รูท|กรณฑ์ที่สอง)(?:ของ)?${TH_END}`, 'gi'), ' √ ')

// ยกกำลัง
add(/(?:ยก)?กำลัง\s*(สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)/g, (_, w) => '^' + TH_DIGIT[w] + ' ')
add(/ยกกำลัง|ตัวยก/g, ' ^ ')
add(/\bsquared\b/gi, '^2 ')
add(/\bcubed\b/gi, '^3 ')
add(/\bto\s+the\s+(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|nth|n-th)(?:\s+power)?\b/gi, (_, w) => ' ^' + ORD[w.toLowerCase()] + ' ')
add(/\b(?:raised\s+to(?:\s+the\s+power)?(?:\s+of)?|to\s+the\s+power(?:\s+of)?|power\s+of)\b/gi, ' ^ ')
add(/\bsub(?:script)?\b|ซับ|ตัวห้อย/gi, ' _ ')
add(/\b([a-z])\s+(?:naught|nought)\b/gi, '$1_0 ')

// เครื่องหมายเปรียบเทียบ
add(/\bplus\s+or\s+minus\b|\bplus\s*minus\b|บวกลบ/gi, ' ± ')
add(/\bminus\s+or\s+plus\b/gi, ' ∓ ')
add(/\b(?:is\s+|does\s+)?not\s+equals?(?:\s+to)?\b|ไม่เท่ากับ/gi, ' ≠ ')
add(/\bless\s+than\s+or\s+equal(?:s)?(?:\s+to)?\b|น้อยกว่าหรือเท่ากับ/gi, ' ≤ ')
add(/\b(?:greater|more)\s+than\s+or\s+equal(?:s)?(?:\s+to)?\b|มากกว่าหรือเท่ากับ/gi, ' ≥ ')
add(/\bless\s+than\b|น้อยกว่า/gi, ' < ')
add(/\b(?:greater|more)\s+than\b|มากกว่า/gi, ' > ')
add(/\b(?:approximately\s+equal(?:s)?(?:\s+to)?|about\s+equal\s+to|approximately|approx)\b\.?|ประมาณเท่ากับ|ประมาณ/gi, ' ≈ ')
add(/\bproportional\s+to\b|แปรผันตรงกับ/gi, ' ∝ ')
add(/\b(?:is\s+)?equals?(?:\s+to)?\b|เท่ากับ/gi, ' = ')
add(/\binfinity\b|อนันต์/gi, ' ∞ ')
add(/\b(?:goes\s+to|tends\s+to|approaches|arrow)\b|ลู่เข้าสู่/gi, ' → ')

// เครื่องหมายคำนวณ
add(/\bplus\b|บวก/gi, ' + ')
add(/\bminus\b|\bnegative\b|ติดลบ|ลบ/gi, ' − ')
add(/\b(?:multiplied\s+by|multiply\s+by|times)\b|คูณ/gi, ' × ')
add(/\bdot\s+product\b/gi, ' · ')
add(/\bcross\s+product\b/gi, ' × ')
add(/\bdivided\s+by\b|หารด้วย|หาร/gi, ' ÷ ')
add(/\bover\b|\bper\b|ส่วน/gi, ' / ')
add(/\bfactorial\b/gi, '! ')
add(/\bpercent\b|เปอร์เซ็นต์|เปอร์เซนต์/gi, '% ')
add(/(\d|\))\s*degrees?\s+(?:celsius|centigrade)\b|(\d|\))\s*องศาเซลเซียส/gi, (_, a, c) => (a || c) + '°C ')
add(/(\d|\))\s*degrees?\b/gi, '$1° ')
add(/\s*องศา/g, '° ')

// อินทิกรัล/อนุพันธ์
add(/\bintegral(?:\s+of)?\b|อินทิกรัล|ปริพันธ์/gi, ' ∫ ')
add(/\b(?:summation|sum\s+of)\b|ผลรวม/gi, ' Σ ')
add(/\bpartial\b|พาร์เชียล/gi, ' ∂ ')
add(/\bnabla\b|\bdel\b/gi, ' ∇ ')

// ฟังก์ชันตรีโกณ/ลอการิทึม
add(/\b(sin|cos|tan|log|ln)\s+of\b/gi, ' $1 ')
add(/\bsine\b|ไซน์|ไซน/gi, ' sin ')
add(/\bcosine\b|โคไซน์|คอสไซน์|โคซายน์/gi, ' cos ')
add(/\btangent\b|แทนเจนต์|แทนเจ้นท์/gi, ' tan ')
add(/\bnatural\s+log(?:arithm)?\b/gi, ' ln ')

// วงเล็บ (วงเล็บเหลี่ยมก่อน)
add(/\b(?:open|left)\s+square\s+brackets?\b|เปิดวงเล็บเหลี่ยม/gi, ' [ ')
add(/\b(?:close|closed|right)\s+square\s+brackets?\b|ปิดวงเล็บเหลี่ยม/gi, ' ] ')
add(/\b(?:open|left|begin|start)\s+(?:round\s+)?(?:brackets?|parentheses|parenthesis|paren)\b|(?:เปิดวงเล็บ|วงเล็บเปิด|เริ่มวงเล็บ)/gi, ' ( ')
add(/\b(?:close|closed|right|end)\s+(?:round\s+)?(?:brackets?|parentheses|parenthesis|paren)\b|(?:ปิดวงเล็บ|วงเล็บปิด|จบวงเล็บ)/gi, ' ) ')

// ตัวพิมพ์ใหญ่/เล็กของตัวอักษรเดี่ยว
add(/\b(?:capital|big|upper\s*case|uppercase)\s+([a-z])\b/gi, (_, c) => ' ' + c.toUpperCase() + ' ')
add(/\b(?:small|lower\s*case|lowercase)\s+([a-z])\b/gi, (_, c) => ' ' + c.toLowerCase() + ' ')

// ศูนย์ → 0 (เฉพาะที่ยืนเป็นคำโดด ๆ กันไปชน "ศูนย์กลาง")
add(/\bzero\b/gi, ' 0 ')
add(/(^|[^\u0E00-\u0E7F])ศูนย์(?![\u0E00-\u0E7F])/g, (_, pre) => pre + ' 0 ')
// ทศนิยม "3 point 14" / "3 จุด 14"
add(/(\d)\s*(?:point|จุด)\s*(\d)/gi, '$1.$2')

// ── พิมพ์ตรง ๆ แบบ ASCII ────────────────────────────────────────────────────
const ASCII = [
  [/\*\*/g, '^'],
  [/<=|=</g, ' ≤ '], [/>=|=>/g, ' ≥ '], [/!=|<>/g, ' ≠ '], [/->/g, ' → '], [/\+\/-|\+-/g, ' ± '], [/~=|≃/g, ' ≈ '],
  [/\*/g, ' × '],
  [/(\d)\s*deg\b/gi, '$1° '],
  [/(^|[\s(=])-(?=\s*[\d(a-zA-Zα-ωΑ-Ω√])/g, '$1−'], // ลบนำหน้า
  [/\s-\s/g, ' − '], [/(\d)-(?=\d)/g, '$1−'],
]

// ชื่อตัวอักษรภาษาไทยที่ยืนโดด ๆ (กันไปแตะคำไทยทั่วไป) → ตัวอักษรละติน
const BOUND = '[\\s+\\-−×÷=<>≤≥≠≈±∓/()\\[\\]²³^_√∛ΣΔ∂∇∫,.!?%°]'
const TH_LET = Object.entries(LETTER_TH).map(([l, th]) => [l, new RegExp(`^(?:${th})$`)])
function thaiLetters(s) {
  const alt = Object.values(LETTER_TH).join('|')
  const re = new RegExp(`(^|${BOUND})(?:(ตัวใหญ่|ตัวเล็ก)\\s*)?(${alt})(?:\\s*(ตัวใหญ่|ตัวเล็ก))?(?=$|${BOUND})`, 'g')
  const once = t => t.replace(re, (_, pre, m1, name, m2) => {
    const l = TH_LET.find(([, r]) => r.test(name))[0], m = m1 || m2
    return pre + (m === 'ตัวใหญ่' ? l.toUpperCase() : l)
  })
  return once(once(s)) // 2 รอบ เพราะตัวคั่นที่ถูกใช้ร่วมกันของตัวอักษรติดกัน
}

function script(s, ch, map) {
  const re = new RegExp(`\\${ch}\\s*(\\([^()]*\\)|[+−-]?\\d+|[+−-]?[A-Za-z]${ch === '_' ? '+' : ''})`, 'g')
  return s.replace(re, (all, g) => {
    const inner = g.startsWith('(') ? g.slice(1, -1) : g
    let out = ''
    for (const c of inner.replace(/\s+/g, '')) { if (!map[c]) return all; out += map[c] }
    return out
  })
}

function tidyLine(s) {
  s = s.replace(/\s+/g, ' ').trim()
  // เลขไทยในตำแหน่งกำลัง ถูกแปลงแล้วด้านบน; จัดเครื่องหมาย ^ _ ให้ติดตัวเลข/เครื่องหมายหลังมัน
  s = s.replace(/\s*([\^_])\s*([+−-]?)\s*/g, '$1$2')
  s = script(s, '^', SUP)
  s = script(s, '_', SUB)
  // ช่องไฟรอบเครื่องหมายสองข้าง
  s = s.replace(/\s*([+−×÷=≠≤≥<>≈±∓∝→])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim()
  s = s.replace(/([(\[])\s+/g, '$1')
  // เครื่องหมายบวก/ลบนำหน้า (ต้นประโยค, หลังวงเล็บ, หลังเครื่องหมายอื่น) ให้ติดตัวถัดไป
  s = s.replace(/(^|[(\[]|[+−×÷=≠≤≥<>≈±∓∝→] )([+−±∓]) /g, '$1$2')
  s = s.replace(/\s*\/\s*/g, '/')
  s = s.replace(/([√∛∫∂∇(\[])\s+/g, '$1').replace(/\s+([)\]!%°])/g, '$1')
  s = s.replace(/\s+([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ₀-₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ])/g, '$1')
  s = s.replace(/([°%])\s+(?=[A-Za-z])/g, '$1') // 30° C
  // Σ/Δ/∂/∇ ติดตัวแปรถัดไป และ Σ + ตัวอักษรเดี่ยว → ตัวใหญ่ (ΣF, ΣM, ΣFx)
  s = s.replace(/Σ\s*([A-Za-z])(?:\s+([xyz]))?(?![A-Za-z])/g, (_, a, c) => 'Σ' + a.toUpperCase() + (c || ''))
  s = s.replace(/([ΣΔ∂∇])\s+(?=[A-Za-zα-ωΑ-Ω(])/g, '$1')
  // ในบรรทัดที่เป็นสมการ: "2 π" → 2π, "m a" → ma, "2 x" → 2x (ยกเว้นตัวที่มักเป็นหน่วย m s g h k l i j o)
  if (/[=+−×÷√∛Σ²³<>≤≥≈∫∝]|[\u0370-\u03FF]/.test(s)) {
    s = s.replace(/(\d)\s+(?=[α-ωΑ-Ω])/g, '$1')
    s = s.replace(/(\d)\s+(?=[abcdefnpqrtuvwxyz](?![A-Za-z]))/g, '$1')
    const one = '[A-Za-zα-ωΑ-Ω]', pair = new RegExp(`(^|[^A-Za-zα-ωΑ-Ω])(${one})\\s+(?=${one}(?![A-Za-zα-ωΑ-Ω]))`, 'g')
    s = s.replace(pair, '$1$2').replace(pair, '$1$2')
  }
  return s.replace(/\s+/g, ' ').trim()
}

export function speechToMath(input) {
  if (!input) return ''
  let s = ' ' + String(input).replace(/[\u200B-\u200D\uFEFF]/g, '') + ' '
  for (const [re, to] of ASCII) s = s.replace(re, to)
  for (const [re, to] of RULES) s = s.replace(re, to)
  s = thaiLetters(s)
  return s.split('\n').map(tidyLine).join('\n') // เก็บ \n ต้น/ท้ายไว้ เพื่อให้ "ขึ้นบรรทัดใหม่" ที่ตกอยู่ขอบประโยคยังมีผล
}
