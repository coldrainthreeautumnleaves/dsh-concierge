#!/usr/bin/env node
/**
 * 给 DSH 主窗口换掉 acrylic 材质，并把窗口底色设成壁纸近似色。
 *
 * 为什么：玻璃皮肤的观感是「预模糊壁纸层 + 不透明内容」画出来的，窗口后面的
 * DWM 亚克力根本看不见——它不贡献任何视觉，只贡献 Windows 上那串 bug
 * （electron#39959：透明无边框窗口下 backgroundMaterial 在缩放前不生效，
 * 拖窗口时非客户区重绘，露出一条和壁纸不搭的浅色带）。
 *
 * 两条补丁都是**等长替换**，不动 asar 头：
 *   1. `#00000000` → `#e8f0faff`          窗口底色 = 壁纸同色系（不透明）
 *   2. `"acrylic"` → `"none"   `          关掉 DWM 材质，让底色真正参与绘制
 *
 * 用法：
 *   node scripts/patch-window-fallback.mjs --check     # 看当前状态
 *   node scripts/patch-window-fallback.mjs             # 打补丁（会先备份）
 *   node scripts/patch-window-fallback.mjs --revert    # 用备份还原
 *   node scripts/patch-window-fallback.mjs --asar <path>
 *
 * 应用更新后重跑一次。写不进去就退出 DSH 再跑。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PATCHES = [
  {
    name: '窗口底色',
    from: 'backgroundColor:"#00000000",backgroundMaterial',
    to: 'backgroundColor:"#e8f0faff",backgroundMaterial',
  },
  {
    name: '关掉 acrylic',
    from: 'backgroundMaterial:"acrylic"',
    to: 'backgroundMaterial:"none"   ',
  },
]

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

for (const patch of PATCHES) {
  if (patch.from.length !== patch.to.length) {
    console.error(`补丁「${patch.name}」长度不等（${patch.from.length} vs ${patch.to.length}），会破坏 asar 头。`)
    process.exit(1)
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

const status = PATCHES.map((patch) => ({
  ...patch,
  applied: count(patch.to) > 0,
  pending: count(patch.from),
}))

if (flag('--check')) {
  console.log(`asar:   ${asarPath}`)
  for (const item of status) {
    console.log(`${item.applied ? '✓' : '·'} ${item.name}: ${item.applied ? '已打' : `未打（可替换 ${item.pending} 处）`}`)
  }
  console.log(`备份:   ${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  process.exit(status.every((item) => item.applied) ? 0 : 2)
}

if (flag('--revert')) {
  if (!fs.existsSync(backupPath)) {
    console.error(`没有备份，无法还原：${backupPath}`)
    process.exit(1)
  }
  fs.copyFileSync(backupPath, asarPath)
  console.log('已用备份还原 app.asar')
  process.exit(0)
}

const todo = status.filter((item) => !item.applied)
if (todo.length === 0) {
  console.log('两条补丁都已生效，无需操作。')
  process.exit(0)
}
for (const item of todo) {
  if (item.pending !== 1) {
    console.error(`「${item.name}」的目标串应出现 1 次，实际 ${item.pending} 次——应用版本可能变了，先确认再改。`)
    process.exit(1)
  }
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(asarPath, backupPath)
  console.log(`已备份到 ${backupPath}`)
}

let next = text
for (const item of todo) next = next.replace(item.from, item.to)
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
console.log(`已写入：${todo.map((item) => item.name).join('、')}`)
console.log('重启 DSH 生效（主进程参数，Ctrl+R 不够）。')
