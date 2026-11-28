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
  /** 服务端（CLI）反过来问客户端的请求处理器，按 method 注册。 */
  const handlers = new Map()
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
      // 带 method + id 的是 CLI 发给**我们**的请求（申请权限、建终端之类）。
      // 原来这里直接当通知丢掉，CLI 就一直等回复——表现是这一轮永远不结束。
      // 不认识的 method 也要回一个错误，让 CLI 自己往下走。
      if (message.method && message.id !== undefined) {
        const handler = handlers.get(message.method)
        if (!handler) {
          reply(message.id, undefined, { code: -32601, message: 'unsupported: ' + message.method })
          continue
        }
        let settled = false
        const finish = (result, error) => {
          if (settled) return
          settled = true
          reply(message.id, result, error)
        }
        try {
          const outcome = handler(message.params || {})
          if (outcome && typeof outcome.then === 'function') outcome.then((r) => finish(r), (e) => finish(undefined, { code: -32603, message: String(e && e.message) }))
          else finish(outcome)
        } catch (error) {
          finish(undefined, { code: -32603, message: String(error && error.message) })
        }
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

  function reply(id, result, error) {
    if (closed) return
    const payload = error
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result: result === undefined ? {} : result }
    try {
      child.stdin.write(JSON.stringify(payload) + '\n')
    } catch {
      /* 进程可能已退出 */
    }
  }

  child.on('exit', (code) => {
    closed = true
    for (const [, entry] of pending) entry.reject(new Error('ACP 进程已退出（code ' + code + '）'))
    pending.clear()
  })

  return {
    onRequest(method, handler) {
      handlers.set(method, handler)
      return () => handlers.delete(method)
    },
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
  // 一个 CLI 进程里可以有多个会话。默认会话跑聊天，旁路会话（生成标题这类
  // 小 maxTokens 请求）单独一条——挤在同一条里会互相污染上下文，也会把
  // 聊天侧的增量记账冲掉（实测两个请求合并成一个回合，标题的提问进了聊天历史）。
  let handshaked = false
  const sessions = new Map() // key -> sessionId
  const sessionModels = new Map() // sessionId -> 已经切过去的模型，避免每轮重复切
  // CLI 自己报的模型清单（session/new 的 configOptions）。
  // 网关 /v1/models 给的是裸 id，CLI 认的是带 [1m] 的，两边对不上就会 404。
  let availableModels = []
  // 思考档位（session/new 的 configOptions 里 thought_level/effort）
  let availableEfforts = []
  const pending = new Map() // key -> Promise<sessionId>

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
    // 工具调用要权限时 CLI 会发 session/request_permission 并等回复。
    // 之前没人回，这一轮就永远不结束（实测：问一句就卡住，240 秒都不返回）。
    //
    // 这里直接选「总是允许」那一档：DSH 自己的权限由用户在外层选
    //（本会话是完全权限），这个 CLI 子进程是替 DSH 干活的，插件又没有画
    // 审批框的地方——问也问不到人。宁可放行，也不能让整轮卡死。
    // 想收紧就把 CLAUDE_ACP_PERMISSION=deny，那样会选拒绝档。
    rpc.onRequest('session/request_permission', (params) => {
      const options = Array.isArray(params && params.options) ? params.options : []
      const deny = String(process.env.CLAUDE_ACP_PERMISSION || '')
        .trim()
        .toLowerCase() === 'deny'
      const wanted = deny ? ['reject_always', 'reject_once'] : ['allow_always', 'allow_once']
      for (const kind of wanted) {
        const hit = options.find((option) => option && option.kind === kind && option.optionId)
        if (hit) return { outcome: { outcome: 'selected', optionId: hit.optionId } }
      }
      // 一个可选档都没有（或用户选了 deny 且没有拒绝档）：取消掉，
      // 让 CLI 按「被拒」处理并继续，而不是继续等。
      return { outcome: { outcome: 'cancelled' } }
    })
    sessions.clear()
    sessionModels.clear()
    pending.clear()
    handshaked = false
    return { child, rpc }
  }

  // 取（或建）一个会话。key 决定用哪一条：'default' 是聊天，其它是旁路。
  // forceNew 用于旁路请求：每轮换一条干净的会话，避免标题的旧提问越积越多。
  async function ensureSession(key = 'default', forceNew = false) {
    if (forceNew) sessions.delete(key)
    const existing = sessions.get(key)
    if (existing && rpc && !rpc.closed) return existing
    const inflight = pending.get(key)
    if (inflight) return inflight
    const { rpc: client } = ensureChild()
    const job = (async () => {
      if (!handshaked) {
        // 声明能收 session 通知：CLI 有「通知」通道时会把警告走 sessionUpdate:
        // 'notice'，没有时只能把 `> **Warning:** …` 塞进 agent_message_chunk。
        // 原来 clientCapabilities 是空对象，于是那段警告混在正文里，用户看到的
        // 回答开头就顶着一块 Claude Code 的公告（实测 23:07 那一轮）。
        await client.request(
          'initialize',
          {
            protocolVersion: 1,
            clientCapabilities: { session: { notices: {} } },
          },
          60000,
        )
        handshaked = true
      }
        const result = await client.request('session/new', { cwd: options.cwd || process.cwd(), mcpServers: [] }, 120000)
        const sid = result && result.sessionId
        if (!sid) throw new Error('ACP 会话创建失败')
        sessions.set(key, sid)
        // CLI 在 session/new 里就把模型清单给了。ACP 的字段是 category / id，
        // 不是 configId——按 category === 'model' 找，退回 id === 'model'。
        // 这是 CLI 自己认的 id，比从网关 /v1/models 猜准：网关给裸 id，
        // CLI 要的却是带 [1m] 后缀的那一份，两边对不上就 404。
        const cfgOpts = Array.isArray(result && result.configOptions) ? result.configOptions : []
        const pickOpt = (want) =>
          cfgOpts.find((o) => o && o.category === want) || cfgOpts.find((o) => o && o.id === want)
        const modelOpt = pickOpt('model')
        if (modelOpt && Array.isArray(modelOpt.options)) {
          const list = modelOpt.options
            .filter((o) => o && typeof o.value === 'string' && o.value && o.value !== 'default')
            .map((o) => ({ id: o.value, name: o.name || o.value }))
          if (list.length) availableModels = list
        }
        // 记住 CLI 当前用的模型，免得第一次 prompt 白切一刀
        if (modelOpt && typeof modelOpt.currentValue === 'string' && modelOpt.currentValue) {
          sessionModels.set(sid, modelOpt.currentValue)
        }
        // 思考档位也一起读走，界面上能显示
        const effortOpt = cfgOpts.find((o) => o && (o.category === 'thought_level' || o.id === 'effort' || o.id === 'thought_level'))
        if (effortOpt && Array.isArray(effortOpt.options)) {
          availableEfforts = effortOpt.options
            .filter((o) => o && typeof o.value === 'string' && o.value)
            .map((o) => ({ id: o.value, name: o.name || o.value }))
        }
        return sid
    })()
    pending.set(key, job)
    try {
      return await job
    } finally {
      pending.delete(key)
    }
  }

  return {
    // 当前会话 id：调用方靠它判断「这一轮还是不是同一个会话」。
    // 进程重启 / 会话重建时它会变（或变回 null），调用方就该重放整段历史。
    get sessionId() {
      // CLI 报上来的模型清单，没有就是空数组（还没建会话）
      return sessions.get('default') || null
    },
    // CLI 报上来的模型清单（session/new 的 configOptions 里读的），
    // 没建会话时是空数组。
    get models() {
      return availableModels
    },
    // 跑一轮：text 是这一段要发给 CLI 的文字；onChunk 收增量正文。
    // text 可以是字符串（只有这一轮），也可以是 {role, text} 数组（带历史）。
    //
    // 为什么数组：CLI 自己是有会话记忆的，但那是它自己的会话。DSH 这边每轮
    // 重新整理消息，插件只把「本轮提问」递进去的话，模型就看不到前面的对话——
    // 用户会感觉它失忆。把历史拼进 prompt 数组，CLI 就当成多轮对话处理。
    //
    // onChunk(chunk, kind) 的 kind 是 'text' 或 'thought'——ACP 把「正文」和
    // 「思考」分成两种 session/update（agent_message_chunk / agent_thought_chunk），
    // 只认前者的话思考就整段丢掉，界面上看不到任何推理过程。
    //
    // 模型只在真的变了时才切。set_config_option 在 claude-agent-acp 里要
    // 重新解析模型、查上下文窗口，实测一次可以卡十几秒（见
    // LodyAI/acp-extension-claude PR #13：模型切换 ~15s → ~3ms 的优化）。
    // 每轮都调一次等于每轮都付这笔钱，所以按会话记住切过的模型。
    async prompt(text, onChunk, signal, model, sessionKey = 'default', forceNewSession = false) {
      const sid = await ensureSession(sessionKey, forceNewSession)
      const { rpc: client } = ensureChild()
      const wantModel = String(model || '')
      const applied = sessionModels.get(sid)
      if (wantModel && applied !== wantModel) {
        try {
          await client.request('session/set_config_option', {
            sessionId: sid,
            configId: 'model',
            value: wantModel,
          }, 30000)
          sessionModels.set(sid, wantModel)
        } catch {
          /* 沿用当前模型 */
        }
      }
      // 组装 prompt：字符串包成一条，数组原样用（每项 {role, text}）
      const promptBlocks = Array.isArray(text)
        ? text
            .filter((m) => m && typeof m.text === 'string' && m.text.trim())
            .map((m) => ({
              type: 'text',
              text: m.text,
            }))
        : [{ type: 'text', text: String(text == null ? '' : text) }]
      if (!promptBlocks.length) promptBlocks.push({ type: 'text', text: '' })
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
          prompt: promptBlocks,
        }, options.promptTimeoutMs || 1800000)
        return { stopReason: result && result.stopReason, usage: result && result.usage, cancelled, sessionId: sid }
      } finally {
        off()
        if (signal) signal.removeEventListener('abort', onAbort)
      }
    },
    // 提前建好进程和默认会话。失败不要紧：真正请求时会再建一次，
    // 这里只是把冷启动（进程 + initialize + session/new，实测 3-4 秒）
    // 挪到插件加载阶段，用户发第一句话时就不用等。
    async warmup(sessionKey = 'default') {
      try {
        await ensureSession(sessionKey)
      } catch {
        /* 等真正请求时再报错 */
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
      sessions.clear()
      pending.clear()
      handshaked = false
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
    // 网关是本地转发到中转站，不是 Anthropic 官方服务端，提供不了自动模式
    // 的服务端分类器检查。不关这个开关，每个新会话都会弹一条
    // 「this session isn't eligible」的警告。
    // 关掉后分类器请求由 Claude Code 自己发、照常计费，但没有那条警告。
    CLAUDE_CODE_AUTO_MODE_SERVER: '0',
    // prompt cache 默认 5 分钟过期。DSH 这边一轮常常超过 5 分钟（等用户看
    // 结果、切窗口），回来再问一句缓存就全废了，整段历史重新 prefill——
    // 既慢又烧 token。提到 1 小时（Claude Code ≥ 2.1.108 支持）。
    // 写入费率比 5 分钟高，但对「聊一会儿停一会儿」的用法整体是省的。
    ENABLE_PROMPT_CACHING_1H: '1',
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
    const autoMode = fileEnv.CLAUDE_CODE_AUTO_MODE_SERVER
    if (typeof autoMode === 'string' && autoMode.trim()) env.CLAUDE_CODE_AUTO_MODE_SERVER = autoMode.trim()
  } catch {
    /* 没有 settings.json 就用默认端口 */
  }
  return env
}

// 老名字留着，别的调用点还在用常量形式。
export const ACP_GATEWAY_ENV = claudeGatewayEnv()
