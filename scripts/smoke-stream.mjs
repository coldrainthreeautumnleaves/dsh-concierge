// 冒烟测试：直接调 streamClaudeCode，看它吐出来的 StreamChunk 长什么样。
//
// 验三件事：
//   1) 有没有 reasoning 块（思考），以及块里的文字是否非空
//   2) 正文块的文字是否完整
//   3) block-start / delta / block-end 的 index 与 blockType 是否自洽
//
// 用法：node scripts/smoke-stream.mjs

import { streamClaudeCode } from '../index.js'

const prompt = process.env.SMOKE_PROMPT || '一个农夫有17只羊，除了9只以外全都跑了，还剩几只？先想清楚再回答，只给答案。'

const options = {
  model: process.env.SMOKE_MODEL || '',
  messages: [{ role: 'user', content: prompt }],
}

const chunks = []
const started = Date.now()
for await (const chunk of streamClaudeCode(options)) {
  chunks.push({ at: Date.now() - started, ...chunk })
}

const blocks = new Map()
const problems = []
for (const chunk of chunks) {
  if (chunk.type === 'block-start') {
    if (blocks.has(chunk.index)) problems.push(`index ${chunk.index} 重复 block-start`)
    blocks.set(chunk.index, { type: chunk.blockType, text: '' })
  } else if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
    const block = blocks.get(chunk.index)
    if (!block) {
      problems.push(`${chunk.type} 落在未开启的块 ${chunk.index}`)
      continue
    }
    const want = chunk.type === 'reasoning-delta' ? 'reasoning' : 'text'
    if (block.type !== want) problems.push(`块 ${chunk.index} 是 ${block.type}，却收到 ${chunk.type}`)
    block.text += chunk.text
  } else if (chunk.type === 'block-end') {
    const block = blocks.get(chunk.index)
    if (!block) {
      problems.push(`block-end 指向未开启的块 ${chunk.index}`)
      continue
    }
    if (block.text !== chunk.block.text) {
      problems.push(`块 ${chunk.index} 的 block-end 正文和累计的不一致`)
    }
    block.closed = true
    block.finalType = chunk.block.type
  }
}
for (const [index, block] of blocks) {
  if (!block.closed) problems.push(`块 ${index} 没有 block-end`)
}

const finish = chunks.find((c) => c.type === 'finish')
const usage = chunks.find((c) => c.type === 'usage')

console.log('总耗时 ' + (Date.now() - started) + 'ms，共 ' + chunks.length + ' 个 chunk\n')

for (const [index, block] of [...blocks].sort((a, b) => a[0] - b[0])) {
  const label = block.type === 'reasoning' ? '思考' : '正文'
  console.log(`块 ${index}  ${label}  ${block.text.length} 字`)
  console.log('   ' + block.text.replace(/\n/g, '\n   ').slice(0, 600))
  console.log('')
}

const reasoning = [...blocks.values()].filter((b) => b.type === 'reasoning' && b.text.trim())
const text = [...blocks.values()].filter((b) => b.type === 'text' && b.text.trim())

console.log('思考块 ' + reasoning.length + ' 个，正文块 ' + text.length + ' 个')
console.log('finish = ' + JSON.stringify(finish?.reason))
if (usage) console.log('usage = ' + JSON.stringify(usage.usage))

if (problems.length) {
  console.log('\n问题：')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}
if (!reasoning.length) {
  console.log('\n注意：这一轮没有思考块（模型可能没触发思考，或上游不返回）')
}
console.log('\n块结构自洽')
process.exit(0)
