// 万能工具：把 DSH 的一堆工具收成 1 个，绕开上游「3 个以上 tools 就 403」的限制。
//
// 背景：codeflow 的 Claude 分组对请求里的 tools 数量有限制，实测 2 个能过、
// 3 个就 403。而 Claude Code 要带 14 个工具。DSH 自己的工具也有十几个。
// 所以把常用能力收进一个工具，模型看到的 tools 数组只有 1 项。
//
// 用法：模型调 omniglot({ action: 'read', path: '...' })，这里分发到对应实现。
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execAsync = promisify(exec)

export const name = 'dsh-omni-tool'
export const inject = ['tools']

// 支持的动作
const ACTIONS = ['read', 'write', 'edit', 'list', 'glob', 'grep', 'bash', 'stat']

function ok(value) {
  return value
}

async function doRead(args) {
  const text = await readFile(args.path, 'utf8')
  const limit = Number(args.limit) || 0
  if (limit > 0) {
    const lines = text.split('\n')
    return lines.slice(0, limit).join('\n')
  }
  // 太长就截断，别把上下文撑爆
  if (text.length > 60000) return text.slice(0, 60000) + '\n…（已截断）'
  return text
}

async function doWrite(args) {
  await mkdir(path.dirname(args.path), { recursive: true })
  await writeFile(args.path, String(args.content ?? ''), 'utf8')
  return `已写入 ${args.path}（${String(args.content ?? '').length} 字节）`
}

async function doEdit(args) {
  const before = await readFile(args.path, 'utf8')
  const target = String(args.old ?? '')
  if (!target) throw new Error('edit 需要 old 参数')
  const idx = before.indexOf(target)
  if (idx < 0) throw new Error('没找到要替换的内容')
  const after = before.slice(0, idx) + String(args.new ?? '') + before.slice(idx + target.length)
  await writeFile(args.path, after, 'utf8')
  return `已修改 ${args.path}`
}

async function doList(args) {
  const dir = args.path || '.'
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
    .sort()
    .join('\n')
}

async function doStat(args) {
  const s = await stat(args.path)
  return JSON.stringify({
    path: args.path,
    size: s.size,
    isFile: s.isFile(),
    isDirectory: s.isDirectory(),
    mtime: s.mtime.toISOString(),
  })
}

async function doGlob(args) {
  const pattern = String(args.pattern || '*')
  // 用 PowerShell 的 Get-ChildItem 递归找，比手写匹配可靠
  const cmd = `Get-ChildItem -Path "${args.path || '.'}" -Recurse -Filter "${pattern}" -ErrorAction SilentlyContinue | Select-Object -First 200 -ExpandProperty FullName`
  const { stdout } = await execAsync(cmd, { shell: 'powershell.exe', timeout: 30000 })
  return stdout.trim() || '（没有匹配）'
}

async function doGrep(args) {
  const pattern = String(args.pattern || '')
  const where = String(args.path || '.')
  if (!pattern) throw new Error('grep 需要 pattern 参数')
  const cmd = `Get-ChildItem -Path "${where}" -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern "${pattern}" -ErrorAction SilentlyContinue | Select-Object -First 100 | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }`
  const { stdout } = await execAsync(cmd, { shell: 'powershell.exe', timeout: 30000 })
  return stdout.trim() || '（没有匹配）'
}

async function doBash(args) {
  const command = String(args.command || '')
  if (!command) throw new Error('bash 需要 command 参数')
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: Number(args.timeout) || 60000,
      maxBuffer: 10 * 1024 * 1024,
      shell: 'powershell.exe',
    })
    const out = (stdout || '') + (stderr ? '\n[stderr]\n' + stderr : '')
    return out.trim() || '（没有输出）'
  } catch (error) {
    // 命令失败也要把输出交回去，模型才能判断
    const out = (error.stdout || '') + (error.stderr ? '\n[stderr]\n' + error.stderr : '')
    return `退出码 ${error.code}\n${out.trim() || error.message}`
  }
}

const HANDLERS = {
  read: doRead,
  write: doWrite,
  edit: doEdit,
  list: doList,
  stat: doStat,
  glob: doGlob,
  grep: doGrep,
  bash: doBash,
}

export function apply(ctx) {
  const tool = {
    name: 'omni',
    description: [
      '访问文件系统和执行命令的唯一工具。所有操作都通过 action 参数选择：',
      '',
      '- action=read  path=<路径> [limit=<行数>]     读取文本文件',
      '- action=write path=<路径> content=<内容>     写入文件（自动建目录）',
      '- action=edit  path=<路径> old=<原文> new=<新文>  替换文件中的一段',
      '- action=list  path=<目录>                    列出目录内容',
      '- action=stat  path=<路径>                    查看文件信息',
      '- action=glob  path=<目录> pattern=<通配符>   按名字找文件',
      '- action=grep  path=<目录> pattern=<正则>     在文件内容里搜',
      '- action=bash  command=<命令> [timeout=<毫秒>]  执行 shell 命令',
      '',
      `可选 action：${ACTIONS.join(' / ')}`,
    ].join('\n'),
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: '要执行的操作：read / write / edit / list / stat / glob / grep / bash',
      },
      path: { type: 'string', description: '文件或目录路径' },
      content: { type: 'string', description: 'write 时要写入的内容' },
      old: { type: 'string', description: 'edit 时要被替换的原文' },
      new: { type: 'string', description: 'edit 时的替换内容' },
      pattern: { type: 'string', description: 'glob 的通配符或 grep 的正则' },
      command: { type: 'string', description: 'bash 要执行的命令' },
      limit: { type: 'number', description: 'read 时最多读多少行' },
      timeout: { type: 'number', description: 'bash 超时毫秒数' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      const action = String(args.action || '').trim()
      const handler = HANDLERS[action]
      if (!handler) {
        throw new Error(`不支持的 action: ${action}（可用：${ACTIONS.join(' / ')}）`)
      }
      const result = await handler(args)
      return ok(result)
    },
  }

  ctx.tools.register(tool)
}
