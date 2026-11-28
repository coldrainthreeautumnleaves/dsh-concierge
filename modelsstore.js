// 模型目录的磁盘缓存。
//
// 为什么需要：DSH 在每条消息前都会问一次「有哪些模型」。这个清单要从
// Claude Code CLI 的 session/new 里读，而建会话要冷启动 CLI（实测 3-7 秒）。
// 每次聊天都等一遍不合适，所以把上次读到的清单存盘，下次直接给。
//
// 失效靠指纹：CLI 的路径 + 大小 + 修改时间。换版本、换安装位置都会让指纹变，
// 变了就当作没有缓存，重新发现。
//
// 参照 dsh-llm-acp 的 models-store.js 和 apache/maka PR #6197 的绑定方式
// （executor id + launch spec + realpath/size/mtime），但只保留这里用得上的部分。
//
// 设计取舍：
//   - 只存模型元数据，不存 env、路径、prompt、回复
//   - 读不出来 / 写不进去都退化成内存缓存，绝不阻断请求
//   - 写入用 tmp + rename，避免半个文件
//   - 失败时保留上一次的好数据（agentconnect 的 runtime-model-catalog 里明确写了
//     这条：刷不出来就清空缓存，会让选择器重启后出现再消失）
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const VERSION = 1
const MAX_MODELS = 500
const MAX_ID = 200
const MAX_NAME = 200
const MAX_AGE_MS = 30 * 24 * 3600_000
// 控制字符会污染终端和 UI，一律剥掉
const CONTROL = /[\u0000-\u001f\u007f]/g

const clean = (s, max) => String(s).replace(CONTROL, '').slice(0, max)

// 丢掉不该进目录的东西：伪模型 default、重复 id、超长的、非法的。
function cleanList(list) {
  const out = []
  const seen = new Set()
  for (const m of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_MODELS) break
    if (!m || typeof m !== 'object') continue
    if (typeof m.id !== 'string' || !m.id || m.id === 'default') continue
    if (m.id.length > MAX_ID) continue
    const id = clean(m.id, MAX_ID)
    if (!id || id === 'default' || seen.has(id)) continue
    seen.add(id)
    const item = { id }
    if (typeof m.name === 'string' && m.name) item.name = clean(m.name, MAX_NAME)
    out.push(item)
  }
  return out
}

function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.fp !== 'string' || !entry.fp) return null
  if (!Number.isFinite(entry.at)) return null
  if (!Array.isArray(entry.list)) return null
  const list = cleanList(entry.list)
  if (!list.length) return null
  return { fp: entry.fp, at: entry.at, list }
}

/**
 * @param {object} options
 * @param {string|undefined} options.file 缓存文件路径；undefined 表示只放内存
 * @param {number} [options.maxAgeMs] 超过这个年龄的条目当作没有
 * @param {(event: string, fields: object) => void} [options.warn]
 * @param {() => number} [options.now]
 */
export function createModelsStore({ file, maxAgeMs = MAX_AGE_MS, warn = () => {}, now = () => Date.now() }) {
  let entries = new Map()
  let loaded = false
  let timer
  // 写失败一次就不再每轮重试，内存缓存照样能用
  let broken = false

  const prune = () => {
    const cutoff = now() - maxAgeMs
    for (const [k, e] of entries) if (e.at < cutoff) entries.delete(k)
  }

  const load = async () => {
    if (loaded) return
    loaded = true
    if (file === undefined) return
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if (error && error.code !== 'ENOENT') warn('models-cache', { phase: 'read', message: String(error.message || error) })
      return
    }
    let doc
    try {
      doc = JSON.parse(text)
    } catch (error) {
      warn('models-cache', { phase: 'read', message: 'not JSON: ' + String(error.message || error) })
      return
    }
    if (!doc || typeof doc !== 'object' || doc.version !== VERSION || !doc.entries || typeof doc.entries !== 'object') {
      warn('models-cache', { phase: 'read', message: 'unsupported file version ' + JSON.stringify(doc && doc.version) })
      return
    }
    for (const [key, raw] of Object.entries(doc.entries)) {
      const entry = cleanEntry(raw)
      if (entry) entries.set(key, entry)
    }
    prune()
  }

  const write = async () => {
    timer = undefined
    if (file === undefined || broken) return
    try {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      const body = { version: VERSION, entries: Object.fromEntries(entries) }
      await writeFile(tmp, JSON.stringify(body), 'utf8')
      await rename(tmp, file)
    } catch (error) {
      broken = true
      warn('models-cache', { phase: 'write', message: String((error && error.message) || error) })
    }
  }

  const schedule = () => {
    if (file === undefined || timer !== undefined) return
    timer = setTimeout(() => {
      void write()
    }, 200)
    if (typeof timer.unref === 'function') timer.unref()
  }

  return {
    /** 取缓存：只有指纹对得上才算命中 */
    async get(key, fp) {
      await load()
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.fp !== fp) return undefined
      if (entry.at < now() - maxAgeMs) {
        entries.delete(key)
        schedule()
        return undefined
      }
      return { at: entry.at, list: entry.list.map((m) => ({ ...m })) }
    },
    /** 记一次成功发现 */
    async set(key, fp, list) {
      await load()
      const entry = cleanEntry({ fp, at: now(), list })
      if (!entry) return
      entries.delete(key)
      entries.set(key, entry)
      prune()
      schedule()
    },
    /** 指纹变了：忘掉旧的 */
    async delete(key) {
      await load()
      if (entries.delete(key)) schedule()
    },
    /** 插件卸载时把待写的一次性写掉 */
    async flush() {
      if (timer !== undefined) {
        clearTimeout(timer)
        await write()
      }
    },
  }
}
