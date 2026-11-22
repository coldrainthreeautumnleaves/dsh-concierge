#!/usr/bin/env node
/**
 * 给 DSH 主窗口设置底色、关掉 acrylic 材质（等长替换，不动 asar 头）。
 *
 * 为什么：窗口缩放期间 Chromium 不重绘视图，新露出的区域直接用窗口底色填
 * （electron#10801、#44689、#1391）。所以那个「白带」不在页面里，CSS 改不到。
 *
 * 更新安全：
 * - 备份旁边会写一份 `app.asar.patch.json`（应用版本 + 备份哈希 + 打的颜色）；
 * - `--revert` 会核对当前应用版本，**版本对不上就拒绝还原**——否则会把应用
 *   整个退回旧版本；
 * - `--check` 会告诉你补丁是否已经过期（应用更新过就需要重打）。
 *
 * 用法：
 *   node scripts/patch-window-fallback.mjs --check
 *   node scripts/patch-window-fallback.mjs                       # 默认色 #ccd8ee
 *   node scripts/patch-window-fallback.mjs --color '#ff0000'     # 换颜色（诊断用）
 *   node scripts/patch-window-fallback.mjs --revert [--force]
 *   node scripts/patch-window-fallback.mjs --asar <path>
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const DEFAULT_COLOR = '#ccd8ee'
const KNOWN_COLORS = ['#000000', '#e8f0fa', '#ccd8ee', '#ff0000', '#00ff00', '#0000ff']

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

// asar 头是 pickle：8 字节前缀，16 字节处是 JSON，长度在偏移 12。
function readAsarJson(asarPath) {
  const fd = fs.openSync(asarPath, 'r')
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

function readAppVersion(asarPath) {
  try {
    const { header, dataOffset } = readAsarJson(asarPath)
    const entry = header.files && header.files['package.json']
    if (!entry) return ''
    const fd = fs.openSync(asarPath, 'r')
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

const colorArg = (valueOf('--color') || DEFAULT_COLOR).toLowerCase()
if (!/^#[0-9a-f]{6}$/.test(colorArg)) {
  console.error(`颜色格式要 #rrggbb，收到：${colorArg}`)
  process.exit(1)
}
const windowColor = `${colorArg}ff`

const PATCHES = [
  {
    name: '窗口底色',
    alternatives: KNOWN_COLORS.map((color) => `backgroundColor:"${color}ff",backgroundMaterial`).concat([
      'backgroundColor:"#00000000",backgroundMaterial',
    ]),
    to: `backgroundColor:"${windowColor}",backgroundMaterial`,
  },
  {
    name: '关掉 acrylic',
    alternatives: ['backgroundMaterial:"acrylic"'],
    to: 'backgroundMaterial:"none"   ',
  },
]

for (const patch of PATCHES) {
  for (const from of patch.alternatives) {
    if (from.length !== patch.to.length) {
      console.error(`补丁「${patch.name}」长度不等（${from.length} vs ${patch.to.length}），会破坏 asar 头。`)
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

const status = PATCHES.map((patch) => {
  const applied = count(patch.to) > 0
  const pending = applied ? 0 : patch.alternatives.reduce((sum, from) => sum + count(from), 0)
  return { ...patch, applied, pending }
})

const appVersion = readAppVersion(asarPath)
const manifest = readManifest()

// 当前 asar 里实际是哪个颜色：逐个候选探一遍，不要只看默认色。
const detectedColor = (() => {
  for (const color of KNOWN_COLORS) {
    if (text.includes(`backgroundColor:"${color}ff",backgroundMaterial`)) return `${color}ff`
  }
  if (text.includes('backgroundColor:"#00000000",backgroundMaterial')) return '#00000000（透明）'
  return '未知'
})()

if (flag('--check')) {
  console.log(`asar:        ${asarPath}`)
  console.log(`应用版本:    ${appVersion || '（读不到）'}`)
  console.log(`窗口底色:    ${detectedColor}`)
  for (const item of status) {
    if (item.name === '窗口底色') continue
    console.log(`${item.applied ? '✓' : '·'} ${item.name}: ${item.applied ? '已打' : `未打（可替换 ${item.pending} 处）`}`)
  }
  console.log(`备份:        ${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  if (manifest) {
    console.log(`补丁记录:    ${manifest.appVersion} / ${manifest.color} / ${manifest.patchedAt}`)
    if (manifest.appVersion && appVersion && manifest.appVersion !== appVersion) {
      console.log(`⚠ 应用已从 ${manifest.appVersion} 更新到 ${appVersion}，补丁已失效，请重打。`)
    }
  } else {
    console.log('补丁记录:    （无）')
  }
  process.exit(status.every((item) => item.applied) ? 0 : 2)
}

if (flag('--revert')) {
  if (!fs.existsSync(backupPath)) {
    console.error(`没有备份，无法还原：${backupPath}`)
    process.exit(1)
  }
  // 关键保护：备份是「打补丁那一刻的应用版本」。应用更新过之后再还原，
  // 等于把整个应用退回旧版——必须拦住。
  if (manifest && manifest.appVersion && appVersion && manifest.appVersion !== appVersion) {
    if (!flag('--force')) {
      console.error(`拒绝还原：备份来自应用 ${manifest.appVersion}，当前是 ${appVersion}。`)
      console.error('更新后再还原会把应用整个退回旧版。确实要退版本，加 --force。')
      process.exit(1)
    }
    console.warn(`⚠ --force：把应用从 ${appVersion} 退回 ${manifest.appVersion}。`)
  }
  fs.copyFileSync(backupPath, asarPath)
  console.log('已用备份还原 app.asar')
  process.exit(0)
}

const todo = status.filter((item) => !item.applied)
if (todo.length === 0 && manifest && manifest.color === colorArg) {
  console.log(`已经是指定颜色 ${windowColor}，无需操作。`)
  process.exit(0)
}
for (const item of todo) {
  if (item.pending !== 1) {
    console.error(`「${item.name}」的目标串应出现 1 次，实际 ${item.pending} 次——应用版本可能变了，先确认再改。`)
    process.exit(1)
  }
}

// 备份只在「还没有备份」或「应用版本已经变了」时重建，避免把旧版本备份覆盖掉。
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
  color: colorArg,
  windowColor,
  backupSha256: sha256(backupPath),
  patchedAt: new Date().toISOString(),
}, null, 2) + '\n')

console.log(`已写入：${todo.length ? todo.map((item) => item.name).join('、') : '窗口底色'}（${windowColor}）`)
console.log('重启 DSH 生效（主进程参数，刷新界面不够）。')
