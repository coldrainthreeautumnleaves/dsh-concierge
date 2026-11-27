// 回归测试：turnPromptText 必须挑出真正的提问，而不是排在它后面的注入上下文。
//
// 消息形状照抄会话日志 session-060a6c91 turn 10（seq 198–203）：
//   1 <memory_handoff>        source.kind = memory-handoff-context
//   2 能够干什么               source.kind = user          ← 真正的提问
//   3 <system-reminder>…      source.kind = runtime-context
//   4 Time sampled while…     source.kind = time-context
//   5 <memory_prefetch>…      source.kind = memory-prefetch
//   6 <memory_answer_rules>…  source.kind = memory-answer-rules
//
// 旧实现取「最后一条 role === 'user'」，拿到的是第 6 条规则，提问被丢掉，
// CLI 只能胡答。这里断言新实现把提问放在末尾、并且上下文也在。

import { turnPromptText } from '../index.js'

const u = (text, kind) => ({
  role: 'user',
  content: [{ type: 'text', text }],
  ...(kind ? { source: { kind } } : {}),
})
const a = (text) => ({ role: 'assistant', content: [{ type: 'text', text }] })

const messages = [
  a('你好！我在 `<home>/.dsh/profiles/desktop`。你想让我帮你做什么？'),
  u('<memory_handoff>\n以下是已保存的近期对话原文，用于接续。', 'memory-handoff-context'),
  u('能够干什么', 'user'),
  u('<system-reminder>\nCurrent working directory: "<workspace>".', 'runtime-context'),
  u('Time sampled while preparing turn 10, step 1: 2026-11-27T22:57:52+08:00', 'time-context'),
  u('<memory_prefetch>\n- [原话 · 用户说 · 2026-11-27 22:42 +08:00（今天）] 能够干什么', 'memory-prefetch'),
  u('<memory_answer_rules>\n当前本地时间：2026-11-27 22:57 +08:00 星期五', 'memory-answer-rules'),
]

const prompt = turnPromptText(messages)
const problems = []

if (!prompt.includes('能够干什么')) problems.push('提问「能够干什么」没进 prompt')
if (!prompt.trimEnd().endsWith('能够干什么')) problems.push('提问没放在 prompt 末尾')
if (!prompt.includes('<system-reminder>')) problems.push('运行时提醒丢了')
if (!prompt.includes('<memory_answer_rules>')) problems.push('记忆规则丢了')
if (prompt.includes('你好！我在')) problems.push('上一轮的助手回复被当成输入塞进去了')
// 上下文全部排在提问之前：用 lastIndexOf，因为 memory_prefetch 里也会引用这句提问
if (prompt.indexOf('<memory_answer_rules>') > prompt.lastIndexOf('能够干什么')) {
  problems.push('规则排在提问之后，提问又会被埋进背景里')
}

console.log('--- prompt ---')
console.log(prompt)
console.log('--- 结束，' + prompt.length + ' 字 ---')

// 认不出 source 时退回「最后一条 user 消息」
const noSource = [a('x'), u('第一句'), u('第二句')]
if (turnPromptText(noSource) !== '第二句') problems.push('没有 source 时没有退回最后一条 user 消息')

// 只有注入上下文、没有真提问时，退回最后一条 user 消息，不返回空
const onlyContext = [a('x'), u('<memory_answer_rules>…', 'memory-answer-rules')]
if (!turnPromptText(onlyContext).includes('memory_answer_rules')) {
  problems.push('只有上下文时不该返回空')
}

if (problems.length) {
  console.log('\n问题：')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}
console.log('\n通过')
