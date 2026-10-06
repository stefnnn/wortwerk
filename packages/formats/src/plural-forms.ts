import { localePluralCategories, type PluralCategory } from './icu.ts'

const formulas: Array<[string[], string]> = [
  [['ja', 'zh', 'ko', 'th', 'vi', 'id', 'ms', 'tr', 'ka'], 'nplurals=1; plural=0;'],
  [['fr', 'pt-BR', 'pt_BR', 'oc', 'fil', 'tl'], 'nplurals=2; plural=(n > 1);'],
  [
    ['ru', 'uk', 'be', 'sr', 'hr', 'bs'],
    'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);',
  ],
  [['pl'], 'nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);'],
  [['cs', 'sk'], 'nplurals=3; plural=(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2;'],
  [['ro'], 'nplurals=3; plural=(n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2);'],
  [['sl'], 'nplurals=4; plural=(n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3);'],
  [
    ['ar'],
    'nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);',
  ],
]

export function defaultPluralForms(locale: string) {
  const base = locale.split(/[-_]/)[0]!
  for (const [locales, formula] of formulas) {
    if (locales.includes(locale) || locales.includes(base)) return formula
  }
  return 'nplurals=2; plural=(n != 1);'
}

export function parsePluralForms(header: string) {
  const nplurals = Number(/nplurals\s*=\s*(\d+)/.exec(header)?.[1] ?? 2)
  const expression = /plural\s*=\s*([^;]+);?/.exec(header)?.[1] ?? '(n != 1)'
  return { nplurals, evaluate: compile(expression) }
}

export function pluralIndexCategories(locale: string, header: string): PluralCategory[] {
  const { nplurals, evaluate } = parsePluralForms(header)
  const rules = new Intl.PluralRules(locale)
  const available = localePluralCategories(locale)
  const result: PluralCategory[] = []
  for (let index = 0; index < nplurals; index++) {
    let category: PluralCategory | undefined
    for (let n = 0; n <= 1000 && !category; n++) {
      if (evaluate(n) === index) category = rules.select(n) as PluralCategory
    }
    result.push(category ?? available[Math.min(index, available.length - 1)] ?? 'other')
  }
  return result
}

type Token = { type: 'num'; value: number } | { type: 'n' } | { type: 'op'; value: string }

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(\d+|n|==|!=|<=|>=|&&|\|\||[()?:<>%!+\-*/])/y
  let match: RegExpExecArray | null
  while (re.lastIndex < expression.length && (match = re.exec(expression))) {
    const t = match[1]!
    if (/^\d+$/.test(t)) tokens.push({ type: 'num', value: Number(t) })
    else if (t === 'n') tokens.push({ type: 'n' })
    else tokens.push({ type: 'op', value: t })
  }
  if (expression.slice(re.lastIndex).trim()) throw new Error(`invalid plural expression: ${expression}`)
  return tokens
}

const binary: Array<Record<string, (a: number, b: number) => number>> = [
  { '||': (a, b) => +(a || b) },
  { '&&': (a, b) => +(a && b) },
  { '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b) },
  { '<': (a, b) => +(a < b), '>': (a, b) => +(a > b), '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b) },
  { '+': (a, b) => a + b, '-': (a, b) => a - b },
  { '*': (a, b) => a * b, '/': (a, b) => Math.trunc(a / b), '%': (a, b) => a % b },
]

export function compile(expression: string): (n: number) => number {
  const tokens = tokenize(expression)
  return (n) => {
    let pos = 0
    const peek = () => tokens[pos]
    const isOp = (value: string) => {
      const t = peek()
      return t?.type === 'op' && t.value === value
    }
    const expect = (value: string) => {
      if (!isOp(value)) throw new Error(`expected ${value} in plural expression`)
      pos++
    }
    const primary = (): number => {
      const t = tokens[pos++]
      if (!t) throw new Error('unexpected end of plural expression')
      if (t.type === 'num') return t.value
      if (t.type === 'n') return n
      if (t.value === '!') return +!primary()
      if (t.value === '(') {
        const value = ternary()
        expect(')')
        return value
      }
      throw new Error(`unexpected ${t.value} in plural expression`)
    }
    const level = (i: number): number => {
      if (i >= binary.length) return primary()
      let left = level(i + 1)
      for (;;) {
        const t = peek()
        const fn = t?.type === 'op' ? binary[i]![t.value] : undefined
        if (!fn) return left
        pos++
        left = fn(left, level(i + 1))
      }
    }
    const ternary = (): number => {
      const condition = level(0)
      if (!isOp('?')) return condition
      pos++
      const a = ternary()
      expect(':')
      const b = ternary()
      return condition ? a : b
    }
    return ternary()
  }
}
