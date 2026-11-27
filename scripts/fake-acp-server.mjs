// 假 ACP 服务端：用来测「CLI 申请权限时客户端必须回话」。
//
// 流程：
//   initialize   → 回 protocolVersion 1
//   session/new  → 回 sessionId
//   session/prompt → 先发一条 session/request_permission 并等回复；
//                    收到回复后推一段正文，再回 PromptResponse
//
// 如果客户端不回权限请求，session/prompt 永远不会 resolve——正是线上那个
// 「问一句就卡住、240 秒不返回」的现象。

const out = (value) => process.stdout.write(JSON.stringify(value) + '\n')

let buffer = ''
let pendingPromptId = null
let permissionAnswered = false

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }

    // 客户端对我们请求的回复
    if (message.id === 900 && (message.result !== undefined || message.error !== undefined)) {
      permissionAnswered = true
      const outcome = message.result && message.result.outcome
      const optionId = outcome && outcome.optionId ? outcome.optionId : '(none)'
      out({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'fake-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '权限回复=' + outcome.outcome + '/' + optionId },
          },
        },
      })
      if (pendingPromptId !== null) {
        out({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
        pendingPromptId = null
      }
      continue
    }

    if (message.method === 'initialize') {
      out({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } })
      continue
    }
    if (message.method === 'session/new') {
      out({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'fake-session' } })
      continue
    }
    if (message.method === 'session/prompt') {
      pendingPromptId = message.id
      out({
        jsonrpc: '2.0',
        method: 'session/request_permission',
        id: 900,
        params: {
          sessionId: 'fake-session',
          toolCall: { toolCallId: 't1', title: 'Bash', kind: 'execute' },
          options: [
            { optionId: 'opt-allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'opt-allow-always', name: 'Always allow', kind: 'allow_always' },
            { optionId: 'opt-reject', name: 'Reject', kind: 'reject_once' },
          ],
        },
      })
      continue
    }
    if (message.method === 'session/cancel') {
      if (pendingPromptId !== null) {
        out({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'cancelled' } })
        pendingPromptId = null
      }
      continue
    }
    // 其它请求一律回成功，别让客户端等
    if (message.id !== undefined) {
      out({ jsonrpc: '2.0', id: message.id, result: {} })
    }
  }
})

process.on('exit', () => {
  if (!permissionAnswered) process.exitCode = 3
})
