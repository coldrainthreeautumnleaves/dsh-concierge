#!/usr/bin/env node
/**
 * 切换 DSH 主窗口的「透明窗口」模式（等长替换，不动 asar 头）。
 *
 * 两种模式：
 *   transparent  窗口变成分层窗口（transparent:!0），系统没法再用窗口类的背景刷
 *                擦出新露出的区域——露出来的是桌面而不是白色。backgroundColor 置透明。
 *   opaque       回到不透明窗口，底色 #ccd8ee，acrylic 关掉。
 *
 * 为什么只用等长替换：asar 头里存着每个文件的偏移和大小，长度一变就要重写整个头，
 * 风险高。下面每一对的字符数都严格相等。
 *
 * 用法：
 *   node scripts/patch-window-fallback.mjs --mode transparent
 *   node scripts/patch-window-fallback.mjs --mode opaque --color '#ccd8ee'
 *   node scripts/patch-window-fallback.mjs --check
 *   node scripts/patch-window-fallback.mjs --revert [--force]
 *   node scripts/patch-window-fallback.mjs --asar <path>
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function defaultAsar() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
}

const asarPath = valueOf('--asar') || process.env.DSH_ASAR || defaultAsar()
if (!fs.existsSync(asarPath)) {
  console.error(`找不到 app.asar：${asarPath}`)
  process.exit(1)
}
const backupPath = `${asarPath}.bak`
const manifestPath = `${asarPath}.patch.json`

const readManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

// asar 头是 pickle：JSON 在偏移 16，长度在偏移 12。
function readAsarJson(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    fs.readSync(fd, head, 0, 16, 0)
    const jsonLength = head.readUInt32LE(12)
    if (!jsonLength || jsonLength > 64 * 1024 * 1024) throw new Error('asar 头长度异常')
    const json = Buffer.alloc(jsonLength)
    fs.readSync(fd, json, 0, jsonLength, 16)
    return { header: JSON.parse(json.toString('utf8')), dataOffset: 8 + head.readUInt32LE(4) }
  } finally {
    fs.closeSync(fd)
  }
}

function readAppVersion(file) {
  try {
    const { header, dataOffset } = readAsarJson(file)
    const entry = header.files && header.files['package.json']
    if (!entry) return ''
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(entry.size)
      fs.readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset))
      return JSON.parse(buf.toString('utf8')).version || ''
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)

// 每条都是 [源, 目标]，长度必须相等。
const PAD = (n) => ' '.repeat(n)

const OPAQUE_COLORS = ['#ccd8ee', '#e8f0fa', '#ff0000', '#000000']

function opaquePatches(color) {
  const hex = `${color}ff`
  return [
    {
      name: '窗口底色',
      alternatives: OPAQUE_COLORS.map((c) => `backgroundColor:"${c}ff",`).concat(['backgroundColor:"#00000000",']),
      to: `backgroundColor:"${hex}",`,
    },
    {
      name: '不透明窗口',
      alternatives: [
        // 从透明模式回来
        `transparent:!0,${PAD(14)}`,
        // 原始状态（acrylic 还在）
        'backgroundMaterial:"acrylic",',
        // 已经是关掉材质的状态
        `backgroundMaterial:"none"   ,`,
      ],
      to: `backgroundMaterial:"none"   ,`,
    },
  ]
}

const TRANSPARENT_PATCHES = [
  {
    name: '窗口底色透明',
    alternatives: OPAQUE_COLORS.map((c) => `backgroundColor:"${c}ff",`).concat(['backgroundColor:"#00000000",']),
    to: 'backgroundColor:"#00000000",',
  },
  {
    name: '透明窗口',
    alternatives: [
      'backgroundMaterial:"acrylic",',
      `backgroundMaterial:"none"   ,`,
      `transparent:!0,${PAD(14)}`,
    ],
    // transparent:!0, = 15 字符，补 14 个空格凑满 29
    to: `transparent:!0,${PAD(14)}`,
  },
]

const colorArg = (valueOf('--color') || '#ccd8ee').toLowerCase()
if (!/^#[0-9a-f]{6}$/.test(colorArg)) {
  console.error(`颜色格式要 #rrggbb，收到：${colorArg}`)
  process.exit(1)
}
const mode = valueOf('--mode') || (flag('--transparent') ? 'transparent' : 'opaque')
if (mode !== 'transparent' && mode !== 'opaque') {
  console.error(`--mode 只接受 transparent 或 opaque，收到：${mode}`)
  process.exit(1)
}
const patches = mode === 'transparent' ? TRANSPARENT_PATCHES : opaquePatches(colorArg)

for (const patch of patches) {
  for (const from of patch.alternatives) {
    if (from.length !== patch.to.length) {
      console.error(`补丁「${patch.name}」长度不等（${from.length} vs ${patch.to.length}）。`)
      process.exit(1)
    }
  }
}

const buffer = fs.readFileSync(asarPath)
const text = buffer.toString('latin1')
const count = (needle) => {
  let n = 0
  let i = -1
  while ((i = text.indexOf(needle, i + 1)) !== -1) n += 1
  return n
}

const status = patches.map((patch) => {
  const applied = count(patch.to) > 0
  const pending = applied ? 0 : patch.alternatives.reduce((sum, from) => sum + count(from), 0)
  return { ...patch, applied, pending }
})

const appVersion = readAppVersion(asarPath)
const manifest = readManifest()
const currentMode = text.includes(`transparent:!0,${PAD(14)}`) ? 'transparent' : 'opaque'
const currentColor = (() => {
  const m = /backgroundColor:"(#[0-9a-f]{8})",/.exec(text)
  return m ? m[1] : '未知'
})()

if (flag('--check')) {
  console.log(`asar:        ${asarPath}`)
  console.log(`应用版本:    ${appVersion || '（读不到）'}`)
  console.log(`当前模式:    ${currentMode}`)
  console.log(`窗口底色:    ${currentColor}`)
  console.log(`acrylic:     ${text.includes('backgroundMaterial:"acrylic",') ? '还开着' : '已关'}`)
  console.log(`备份:        ${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  if (manifest) {
    console.log(`补丁记录:    ${manifest.appVersion} / ${manifest.mode} / ${manifest.patchedAt}`)
    if (manifest.appVersion && appVersion && manifest.appVersion !== appVersion) {
      console.log(`⚠ 应用已从 ${manifest.appVersion} 更新到 ${appVersion}，补丁已失效，请重打。`)
    }
  }
  process.exit(0)
}

if (flag('--revert')) {
  if (!fs.existsSync(backupPath)) {
    console.error(`没有备份，无法还原：${backupPath}`)
    process.exit(1)
  }
  if (manifest && manifest.appVersion && appVersion && manifest.appVersion !== appVersion && !flag('--force')) {
    console.error(`拒绝还原：备份来自应用 ${manifest.appVersion}，当前是 ${appVersion}。`)
    console.error('更新后再还原会把应用整个退回旧版。确实要退版本，加 --force。')
    process.exit(1)
  }
  fs.copyFileSync(backupPath, asarPath)
  console.log('已用备份还原 app.asar')
  process.exit(0)
}

// --ensure：给启动器用。只做一件事——应用更新后按上次记录的模式自动重打；
// 没有记录就什么都不做（不猜用户想要哪种模式）。
if (flag('--ensure')) {
  if (!manifest) {
    console.log('没有补丁记录，跳过。')
    process.exit(0)
  }
  if (manifest.appVersion === appVersion) {
    console.log('应用版本未变，补丁仍然有效。')
    process.exit(0)
  }
  console.log(`应用已从 ${manifest.appVersion} 更新到 ${appVersion}，按记录重打 ${manifest.mode} 模式。`)
}

const todo = status.filter((item) => !item.applied)
if (todo.length === 0) {
  console.log(`已经是 ${mode} 模式（${currentColor}），无需操作。`)
  process.exit(0)
}
for (const item of todo) {
  if (item.pending !== 1) {
    console.error(`「${item.name}」的目标串应出现 1 次，实际 ${item.pending} 次——应用版本可能变了，先确认再改。`)
    process.exit(1)
  }
}

if (!fs.existsSync(backupPath) || (manifest && manifest.appVersion && manifest.appVersion !== appVersion)) {
  fs.copyFileSync(asarPath, backupPath)
  console.log(`已备份到 ${backupPath}`)
}

let next = text
for (const item of todo) {
  const from = item.alternatives.find((candidate) => next.includes(candidate))
  next = next.replace(from, item.to)
}
const nextBuffer = Buffer.from(next, 'latin1')
if (nextBuffer.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入（会破坏 asar 头）。')
  process.exit(1)
}
try {
  fs.writeFileSync(asarPath, nextBuffer)
} catch (error) {
  console.error(`写入失败：${error.message}`)
  console.error('多半是应用正在运行锁住了文件——先退出 DSH，再跑一次。')
  process.exit(1)
}

fs.writeFileSync(manifestPath, JSON.stringify({
  appVersion,
  mode,
  color: mode === 'opaque' ? colorArg : '#00000000',
  backupSha256: sha256(backupPath),
  patchedAt: new Date().toISOString(),
}, null, 2) + '\n')

console.log(`已写入：${mode} 模式（${todo.map((item) => item.name).join('、')}）`)
console.log('重启 DSH 生效（主进程参数，刷新界面不够）。')
