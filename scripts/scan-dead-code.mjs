import fs from 'node:fs'

const src = fs.readFileSync('client.js', 'utf8')
const defs = [...src.matchAll(/(?:^|\n)\s*function\s+([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1])
const uniq = [...new Set(defs)]
const dead = uniq.filter((name) => {
  const re = new RegExp(`\\b${name}\\b`, 'g')
  return (src.match(re) || []).length <= 1
})
console.log(`functions: ${uniq.length}`)
console.log(`defined but never referenced: ${dead.length ? dead.join(', ') : '(none)'}`)

// data-* hooks written by JS but never used in the CSS text.
const cssStart = src.indexOf('const CSS = `')
const cssEnd = src.indexOf('const SIDE_CSS = `')
const css = src.slice(cssStart, cssEnd)
const attrs = [...new Set([...src.matchAll(/dataset\.(dsh[A-Za-z0-9]+)/g)].map((m) => m[1]))]
const kebab = (s) => 'data-' + s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
const orphan = attrs.filter((a) => !css.includes(kebab(a)))
console.log(`dataset hooks: ${attrs.length}`)
console.log(`hooks with no CSS rule: ${orphan.length ? orphan.map(kebab).join(', ') : '(none)'}`)

// CSS classes referenced in the markup string vs defined.
const cssClasses = new Set([...css.matchAll(/\.(uc-[a-z0-9-]+)/g)].map((m) => m[1]))
const usedClasses = new Set([...src.matchAll(/className:\s*'([^']+)'/g)].flatMap((m) => m[1].split(/\s+/)))
const unusedClasses = [...cssClasses].filter((c) => !usedClasses.has(c) && !css.includes(`.${c}-`) && !src.includes(`'${c}`))
console.log(`uc-* classes: ${cssClasses.size}`)
console.log(`defined but never used: ${unusedClasses.length ? unusedClasses.join(', ') : '(none)'}`)
