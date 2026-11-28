// 直接调用 Claude Agent SDK 的 query()，不再 spawn claude-agent-acp。
//
// 为什么换掉 ACP：`claude-agent-acp` 从 0.113 起加了一道认证门
// （hide-claude-auth.js 里的 refuseClaudeSubscriptionTurn），它读 SDK 缓存的
// AccountInfo，判断「这个账号有没有可用凭据」。走中转站时凭据在
// settings.json 的 env 里（ANTHROPIC_AUTH_TOKEN），SDK 报的 apiKeySource 是
// `none`，不在它的白名单（ANTHROPIC_API_KEY / apiKeyHelper / managed key）里，
// 于是每一轮都回 `Authentication required`，CLI 根本不发请求。
//
// 上游 Issue：agentclientprotocol/claude-agent-acp#1270
// 「gateway deployments (Anthropic protocol, auth in settings.json) get
//  unusable sign-in prompts」——就是这个问题。
//
// 换成直接调 SDK：少一层进程、没有那道门、模型用 options.model 指定（不用
// ACP 的 configOptions），也不再有 session/new 和 set_config_option 的启动开销。
//
// SDK 从 claude-agent-acp 的依赖目录里取：它本来就装着，不用另装一份
//（@agentproto/adapter-claude-sdk 那条路试过，依赖 @agentproto/memory@0.1.1
//  在 npm 上不存在，装不上）。
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 找 SDK 的位置：先看全局 npm 里 claude-agent-acp 自带的，再看常见的平铺位置。
const SDK_CANDIDATES = [
  path.join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@agentclientprotocol', 'claude-agent-acp', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
  path.join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
]

let sdkPromise = null

/** 懒加载 SDK：加载失败只在这一轮报错，不影响插件其余功能。 */
function loadSdk() {
  if (sdkPromise) return sdkPromise
  sdkPromise = (async () => {
    for (const file of SDK_CANDIDATES) {
      if (!existsSync(file)) continue
      return import(pathToFileURL(file).href)
    }
    throw new Error(
      '找不到 @anthropic-ai/claude-agent-sdk（需要 claude-agent-acp 或单独装它）',
    )
  })()
  return sdkPromise
}

/** 从 CLI 的 session/new 那套 configOptions 里拿模型清单的逻辑已经不用了，
 *  改成读 CLI 的 /v1/models。这里保留一个空实现，避免调用方炸。 */

/**
 * 跑一轮。
 *
 * @param {object} options
 * @param {string} options.prompt         这一轮要发给模型的话
 * @param {string} [options.system]       DSH 给的 system（拼进 prompt 前面）
 * @param {string} options.model          模型 id（带 [1m] 也行，SDK 认）
 * @param {object} options.env            网关环境（ANTHROPIC_BASE_URL 等）
 * @param {(chunk: string, kind: 'text'|'thought') => void} options.onChunk
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.maxTurns]
 */
export async function runQuery(options) {
  const { prompt, system, model, env, onChunk, signal } = options
  const sdk = await loadSdk()
  const query = sdk.query
  if (typeof query !== 'function') throw new Error('SDK 没有导出 query()')

  const opts = {
    env,
    model: String(model || '').replace(/\[[^\]]*\]$/, '') || undefined,
    // 一轮就够：DSH 自己管多轮，这里只负责把这一问发出去、把回答收回来
    maxTurns: options.maxTurns || 1,
    // 不要 CLI 自己的权限弹窗：DSH 那边有自己的权限体系
    permissionMode: 'bypassPermissions',
    // 不开这个，SDK 只在回答整段生成完之后给一个 assistant 消息——
    // 界面上就是「转半天然后一下子全出来」。开了才有 stream_event 增量。
    includePartialMessages: true,
  }
  if (system) {
    // SDK 没有单独的 system 参数通道时，并进 prompt；有 appendSystemPrompt 就用它
    opts.appendSystemPrompt = String(system)
  }

  const started = Date.now()
  let firstAt = 0
  let text = ''
  const thinking = []

  try {
    for await (const msg of query({ prompt: String(prompt || ''), options: opts })) {
      if (signal && signal.aborted) break
      if (!msg || typeof msg !== 'object') continue

      // 流式增量
      if (msg.type === 'stream_event' && msg.event) {
        const ev = msg.event
        if (ev.type === 'content_block_delta' && ev.delta) {
          if (ev.delta.type === 'text_delta' && ev.delta.text) {
            if (!firstAt) firstAt = Date.now() - started
            text += ev.delta.text
            onChunk(ev.delta.text, 'text')
          } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
            if (!firstAt) firstAt = Date.now() - started
            thinking.push(ev.delta.thinking)
            onChunk(ev.delta.thinking, 'thought')
          }
        }
        continue
      }

      // 整段消息：开了 includePartialMessages 时这些已经通过 stream_event
      // 增量吐过了，这里只补思考（思考不走 text_delta）和兜底。
      if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
        for (const c of msg.message.content) {
          if (c.type === 'text' && c.text) {
            if (!opts.includePartialMessages && !text) {
              if (!firstAt) firstAt = Date.now() - started
              text += c.text
              onChunk(c.text, 'text')
            }
          } else if (c.type === 'thinking' && c.thinking) {
            thinking.push(c.thinking)
          }
        }
        continue
      }

      if (msg.type === 'result') {
        // result 里也带最终文本；前面已经吐过就用前面的
        if (!text && typeof msg.result === 'string' && msg.result) {
          text = msg.result
          if (!firstAt) firstAt = Date.now() - started
          onChunk(msg.result, 'text')
        }
        if (msg.is_error) {
          throw new Error(msg.result || 'SDK 返回错误结果')
        }
      }
    }
  } finally {
    /* 收尾 */
  }

  return {
    text,
    thinking: thinking.join(''),
    firstMs: firstAt,
    totalMs: Date.now() - started,
    usage: undefined,
  }
}

/**
 * 读 CLI 的 settings.json，拼出网关环境。
 * 和原来的 claudeGatewayEnv 保持同一份语义，只是不再有 ACP 那些额外变量。
 */
export function gatewayEnv(overrides = {}) {
  const env = {
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:3425',
    ANTHROPIC_AUTH_TOKEN: 'magpie',
    CLAUDE_CODE_THINKING_DISPLAY: 'summarized',
    MAX_THINKING_TOKENS: '8000',
    CLAUDE_CODE_AUTO_MODE_SERVER: '0',
    ENABLE_PROMPT_CACHING_1H: '1',
    ...overrides,
  }
  try {
    const raw = readFileSync(path.join(homedir(), '.claude', 'settings.json'), 'utf8')
    const json = JSON.parse(raw)
    const fileEnv = (json && json.env) || {}
    for (const key of [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_THINKING_DISPLAY',
      'MAX_THINKING_TOKENS',
      'CLAUDE_CODE_AUTO_MODE_SERVER',
    ]) {
      const value = fileEnv[key]
      if (typeof value === 'string' && value.trim()) env[key] = value.trim()
    }
  } catch {
    /* 没有 settings.json 就用默认 */
  }
  return env
}
