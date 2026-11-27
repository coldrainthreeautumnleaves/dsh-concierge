// 极简 ACP（Agent Client Protocol）客户端。
// 借鉴 dsh-llm-acp 的思路：把本机 ACP CLI（这里用 Claude Code 的 claude-agent-acp）
// 当成一个模型端点——常驻一个进程、复用它的原生会话，边生成边把文本吐出来。
//
// 协议：JSON-RPC 2.0，换行分隔（ndjson），走子进程 stdin/stdout。
//   initialize          → 握手，拿 capabilities
//   session/new         → 建会话，拿 sessionId
//   session/prompt      → 发一轮，期间收 session/update 通知
//   session/cancel      → 中断
// session/update 里 sessionUpdate === 'agent_message_chunk' 的 content.text 就是增量正文。

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

const MAGPIE_GATEWAY = 'http://127.0.0.1:3425'

// claude-agent-acp 的可执行文件：优先 npm 全局目录里的 .cmd
export function findAcpCommand() {
  const candidates = [
    path.join(homedir(), 'AppData', 'Roaming', 'npm', 'claude-agent-acp.cmd'),
    path.join(homedir(), 'AppData', 'Roaming', 'npm', 'claude-agent-acp'),
    'claude-agent-acp',
  ]
  for (const candidate of candidates) {
    if (candidate === 'claude-agent-acp') return candidate
    if (existsSync(candidate)) return candidate
  }
  return 'claude-agent-acp'
}

function createRpc(child) {
  let buffer = ''
  const pending = new Map()
  const listeners = new Set()
  let nextId = 1
  let closed = false

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
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
      if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
        const entry = pending.get(message.id)
        if (!entry) continue
        pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message || 'ACP 调用失败'))
        else entry.resolve(message.result)
        continue
      }
      for (const listener of listeners) {
        try {
          listener(message)
        } catch {
          /* 监听器自己的错不影响其它 */
        }
      }
    }
  })

  child.on('exit', (code) => {
    closed = true
    for (const [, entry] of pending) entry.reject(new Error('ACP 进程已退出（code ' + code + '）'))
    pending.clear()
  })

  return {
    request(method, params, timeoutMs = 180000) {
      if (closed) return Promise.reject(new Error('ACP 进程已退出'))
      const id = nextId++
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error('ACP ' + method + ' 超时'))
        }, timeoutMs)
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer)
            resolve(value)
          },
          reject: (error) => {
            clearTimeout(timer)
            reject(error)
          },
        })
        child.stdin.write(payload)
      })
    },
    notify(method, params) {
      if (closed) return
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
    },
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get closed() {
      return closed
    },
  }
}

export function createAcpClient(options = {}) {
  const command = options.command || findAcpCommand()
  const useShell = command !== 'claude-agent-acp' && process.platform === 'win32'
  let child = null
  let rpc = null
  let ready = null
  let sessionId = null

  function ensureChild() {
    if (child && rpc && !rpc.closed) return { child, rpc }
    child = spawn(command, [], {
      shell: useShell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, options.env || {}),
    })
    child.stderr.setEncoding('utf8')
    // CLI 自己往 stderr 打日志，吞掉避免刷屏
    child.stderr.on('data', () => {})
    rpc = createRpc(child)
    sessionId = null
    ready = null
    return { child, rpc }
  }

  async function ensureReady() {
    if (sessionId && rpc && !rpc.closed) return sessionId
    if (ready) return ready
    const { rpc: client } = ensureChild()
    ready = (async () => {
      await client.request('initialize', { protocolVersion: 1, clientCapabilities: {} }, 60000)
      const result = await client.request('session/new', { cwd: options.cwd || process.cwd(), mcpServers: [] }, 120000)
      sessionId = result && result.sessionId
      if (!sessionId) throw new Error('ACP 会话创建失败')
      return sessionId
    })()
    try {
      return await ready
    } catch (error) {
      ready = null
      throw error
    }
  }

  return {
    // 跑一轮：text 是这一段要发给 CLI 的文字；onChunk 收增量正文。
    // onChunk(chunk, kind) 的 kind 是 'text' 或 'thought'——ACP 把「正文」和
    // 「思考」分成两种 session/update（agent_message_chunk / agent_thought_chunk），
    // 只认前者的话思考就整段丢掉，界面上看不到任何推理过程。
    // model 非空时先尝试 session/set_config_option 把会话切到那个模型，
    // 切不了（不是 ACP 的选项）就沿用 CLI 当前的，不中断这一轮。
    async prompt(text, onChunk, signal, model) {
      const sid = await ensureReady()
      const { rpc: client } = ensureChild()
      if (model) {
        try {
          await client.request('session/set_config_option', {
            sessionId: sid,
            configId: 'model',
            value: model,
          }, 30000)
        } catch {
          /* 沿用当前模型 */
        }
      }
      let cancelled = false
      const off = client.onMessage((message) => {
        if (message.method !== 'session/update') return
        const params = message.params || {}
        if (params.sessionId !== sid) return
        const update = params.update || {}
        const kind =
          update.sessionUpdate === 'agent_message_chunk'
            ? 'text'
            : update.sessionUpdate === 'agent_thought_chunk'
              ? 'thought'
              : null
        if (kind === null) return
        const content = update.content
        if (content && content.type === 'text' && typeof content.text === 'string' && content.text) {
          try {
            onChunk(content.text, kind)
          } catch {
            /* 消费失败不影响这一轮 */
          }
        }
      })
      const onAbort = () => {
        cancelled = true
        try {
          client.notify('session/cancel', { sessionId: sid })
        } catch {
          /* 进程可能已退出 */
        }
      }
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      try {
        const result = await client.request('session/prompt', {
          sessionId: sid,
          prompt: [{ type: 'text', text }],
        }, options.promptTimeoutMs || 1800000)
        return { stopReason: result && result.stopReason, usage: result && result.usage, cancelled }
      } finally {
        off()
        if (signal) signal.removeEventListener('abort', onAbort)
      }
    },
    dispose() {
      try {
        if (child && !child.killed) child.kill()
      } catch {
        /* 已经退出 */
      }
      child = null
      rpc = null
      ready = null
      sessionId = null
    },
  }
}

// ACP 子进程的网关环境。
//
// 必须跟 ~/.claude/settings.json 一致：Claude Code 自己就是读那份配置，
// 它以 settings.json 的 env 为准（实测：插件传 3425，settings.json 写 19999，
// 请求实际发到 19999）。插件这边再钉一个别的地址只会两边打架——
// 模型名来自一个网关、请求发到另一个网关，就是「模型不存在或没有权限」。
//
// 所以这里直接跟随 settings.json；没有这个文件时才回落到 magpie 默认端口。
//
// 顺带打开思考显示：新版模型默认 thinking.display = "omitted"，只推签名、
// 正文为空，CLI 那边 `if (chunk.thinking)` 判断直接跳过，于是 ACP 一个
// agent_thought_chunk 都不发——界面上自然没有思考可看。实测加上
// CLAUDE_CODE_THINKING_DISPLAY=summarized 之后，同一轮能收到 11 块思考。
// 已经自己配过这两项的用户，以他的值为准。
export function claudeGatewayEnv() {
  const env = {
    ANTHROPIC_BASE_URL: MAGPIE_GATEWAY,
    ANTHROPIC_AUTH_TOKEN: 'magpie',
    CLAUDE_CODE_THINKING_DISPLAY: 'summarized',
    MAX_THINKING_TOKENS: '8000',
  }
  try {
    const raw = readFileSync(path.join(homedir(), '.claude', 'settings.json'), 'utf8')
    const json = JSON.parse(raw)
    const fileEnv = json && json.env ? json.env : {}
    const base = fileEnv.ANTHROPIC_BASE_URL
    const token = fileEnv.ANTHROPIC_AUTH_TOKEN
    if (typeof base === 'string' && base.trim()) env.ANTHROPIC_BASE_URL = base.trim()
    if (typeof token === 'string' && token.trim()) env.ANTHROPIC_AUTH_TOKEN = token.trim()
    const display = fileEnv.CLAUDE_CODE_THINKING_DISPLAY
    if (typeof display === 'string' && display.trim()) env.CLAUDE_CODE_THINKING_DISPLAY = display.trim()
    const tokens = fileEnv.MAX_THINKING_TOKENS
    if (typeof tokens === 'string' && tokens.trim()) env.MAX_THINKING_TOKENS = tokens.trim()
  } catch {
    /* 没有 settings.json 就用默认端口 */
  }
  return env
}

// 老名字留着，别的调用点还在用常量形式。
export const ACP_GATEWAY_ENV = claudeGatewayEnv()
