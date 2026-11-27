// 端到端复现 + 验证：用 turn 10 那套消息（含注入上下文）跑一轮真模型，
// 看它到底有没有拿到「能够干什么」这个问题。
//
// 旧实现：只把 <memory_answer_rules> 发给 CLI → 回答是空话/胡话
// 新实现：上下文在前、提问在末尾 → 回答应该是在介绍自己会什么

import { streamClaudeCode } from '../index.js'

const u = (text, kind) => ({
  role: 'user',
  content: [{ type: 'text', text }],
  ...(kind ? { source: { kind } } : {}),
})
const a = (text) => ({ role: 'assistant', content: [{ type: 'text', text }] })

const messages = [
  a('你好！我在 `<home>/.dsh/profiles/desktop`。你想让我帮你做什么？'),
  u('<memory_handoff>\n以下是已保存的近期对话原文，用于接续。', 'memory-handoff-context'),
  u(process.env.E2E_QUESTION || '能够干什么', 'user'),
  u('<system-reminder>\nCurrent working directory: "<workspace>".', 'runtime-context'),
  u('Time sampled while preparing turn 10, step 1: 2026-11-27T22:57:52+08:00', 'time-context'),
  u('<memory_prefetch>\n- [原话 · 用户说 · 2026-11-27 22:42 +08:00（今天）] 能够干什么', 'memory-prefetch'),
  u('<memory_answer_rules>\n当前本地时间：2026-11-27 22:57 +08:00 星期五', 'memory-answer-rules'),
]

let text = ''
const started = Date.now()
const deadline = setTimeout(() => {
  console.log('超时：' + (Date.now() - started) + 'ms 内没有结束——多半是权限请求没被回答')
  process.exit(1)
}, 90000)

try {
  for await (const chunk of streamClaudeCode({ messages, model: '' })) {
    if (chunk.type === 'text-delta') text += chunk.text
  }
} finally {
  clearTimeout(deadline)
}

console.log('--- 回答 ---')
console.log(text.trim())
console.log('--- 结束，' + text.trim().length + ' 字 ---')
