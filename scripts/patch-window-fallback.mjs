#!/usr/bin/env node
/**
 * 给 DSH 主窗口换掉 acrylic 材质，并把窗口底色设成「内容区实际合成色」。
 *
 * 为什么：窗口缩放期间 Chromium 不重绘视图，新露出的区域直接用窗口底色填
 * （electron#10801、#44689、#1391：维护者的结论就是 "How Chromium Works"，
 * 唯一解法是把 BrowserWindow 的 backgroundColor 设成应用背景色）。所以那个
 * 白条不在页面里，CSS 改不到，只能改主进程。
 *
 * 底色取实测的内容区合成色 RGB(204,216,238) = #ccd8ee，不是 tint——tint 太浅，
 * 露出来仍然像白条。
 *
 * 另外玻璃皮肤的观感是「预模糊壁纸层 + 不透明内容」画出来的，窗口后面的 DWM
 * 亚克力根本看不见，只贡献 Windows 上那串 bug（electron#39959），所以一并关掉。
 *
 * 三条补丁都是**等长替换**，不动 asar 头：
 *   1. `#00000000` / 旧值 → `#ccd8eeff`    窗口底色 = 内容区颜色（不透明）
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

const WINDOW_COLOR = '#ccd8eeff'

const PATCHES = [
  {
    name: '窗口底色',
    // 原始值是透明；也可能已经是历史版本写过的 #e8f0faff
    alternatives: [
      'backgroundColor:"#00000000",backgroundMaterial',
      'backgroundColor:"#e8f0faff",backgroundMaterial',
    ],
    to: `backgroundColor:"${WINDOW_COLOR}",backgroundMaterial`,
  },
  {
    name: '关掉 acrylic',
    alternatives: ['backgroundMaterial:"acrylic"'],
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
  console.log('补丁都已生效，无需操作。')
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
console.log(`已写入：${todo.map((item) => item.name).join('、')}（窗口底色 ${WINDOW_COLOR}）`)
console.log('重启 DSH 生效（主进程参数，刷新界面不够）。')
