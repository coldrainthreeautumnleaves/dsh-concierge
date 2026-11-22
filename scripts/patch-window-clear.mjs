#!/usr/bin/env node
/**
 * 让 DSH 主窗口真正透出桌面（亚克力/清晰桌面），供「真透明留边」使用。
 *
 * 为什么需要它：
 *   DSH 的窗口构造参数已经是 backgroundColor:"#00000000" + backgroundMaterial:"acrylic"，
 *   但主进程在运行时又会把底色改回不透明：
 *     window.setBackgroundColor(chromeFallbackFill())      // #f9fafb（浅色）
 *   一处挂在 nativeTheme 的 updated 事件上，一处挂在「进入工作区」时。
 *   这两次调用会把窗口底色刷成不透明浅色，亚克力被整个盖住——页面透明的地方
 *   露出的就是 #f9fafb，也就是「留边那圈发白」。CSS 改不了窗口底色，只能改 asar。
 *
 * 做法：等长替换（不动 asar 头），把三处调用换成透明色。
 *   setBackgroundColor(chromeFallbackFill())  →  setBackgroundColor("#00000000"          )
 *   color:chromeFallbackFill(),               →  color:"#00000000"          ,
 *
 * 用法：
 *   node scripts/patch-window-clear.mjs              # 生成 app.asar.new（应用运行时也能跑）
 *   node scripts/patch-window-clear.mjs --apply      # DSH 完全退出后，用它替换 app.asar
 *   node scripts/patch-window-clear.mjs --check      # 看当前状态
 *   node scripts/patch-window-clear.mjs --revert     # 用备份还原
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)

function defaultAsar() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
}

const asarPath = process.env.DSH_ASAR || defaultAsar()
const stagedPath = `${asarPath}.new`
const backupPath = `${asarPath}.clear.bak`

const PAD = (n) => ' '.repeat(n)
/** 把 value 补空格到 len（等长替换靠它，手数空格太容易错）。 */
const padTo = (value, len) => value + PAD(Math.max(0, len - value.length))

const RUNTIME_FROM = 'setBackgroundColor(chromeFallbackFill())'
const COLOR_FROM = 'color:chromeFallbackFill(),'

// 每条都是 [源, 目标]，长度必须严格相等。
const PATCHES = [
  {
    name: '运行时窗口底色',
    from: RUNTIME_FROM,
    to: `${padTo('setBackgroundColor("#00000000"', RUNTIME_FROM.length - 1)})`,
    expect: 3,
  },
  {
    name: '标题栏遮罩底色',
    from: COLOR_FROM,
    to: `${padTo('color:"#00000000"', COLOR_FROM.length - 1)},`,
    expect: 1,
  },
]

for (const p of PATCHES) {
  if (p.from.length !== p.to.length) {
    console.error(`补丁「${p.name}」长度不等（${p.from.length} vs ${p.to.length}）`)
    process.exit(1)
  }
}

if (!fs.existsSync(asarPath)) {
  console.error(`找不到 app.asar：${asarPath}`)
  process.exit(1)
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)

function count(text, needle) {
  let n = 0
  let i = -1
  while ((i = text.indexOf(needle, i + 1)) !== -1) n += 1
  return n
}

function inspect(file) {
  const text = fs.readFileSync(file).toString('latin1')
  return PATCHES.map((p) => ({
    ...p,
    found: count(text, p.from),
    applied: count(text, p.to),
  }))
}

if (flag('--check')) {
  console.log(`asar:     ${asarPath}`)
  const state = inspect(asarPath)
  for (const s of state) {
    console.log(`${s.name}: 原始 ${s.found} 处 / 已替换 ${s.applied} 处`)
  }
  console.log(`备份:     ${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  console.log(`待应用:   ${fs.existsSync(stagedPath) ? stagedPath : '（无）'}`)
  process.exit(0)
}

if (flag('--revert')) {
  if (!fs.existsSync(backupPath)) {
    console.error(`没有备份，无法还原：${backupPath}`)
    process.exit(1)
  }
  try {
    fs.copyFileSync(backupPath, asarPath)
    console.log('已用备份还原 app.asar')
  } catch (error) {
    console.error(`还原失败：${error.message}`)
    console.error('DSH 还开着，先完全退出再跑一次。')
    process.exit(1)
  }
  process.exit(0)
}

if (flag('--apply')) {
  if (!fs.existsSync(stagedPath)) {
    console.error(`没有待应用的文件：${stagedPath}`)
    console.error('先跑一次 node scripts/patch-window-clear.mjs 生成它。')
    process.exit(1)
  }
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(asarPath, backupPath)
      console.log(`已备份到 ${backupPath}`)
    } catch (error) {
      console.error(`备份失败：${error.message}（DSH 还开着？）`)
      process.exit(1)
    }
  }
  try {
    fs.copyFileSync(stagedPath, asarPath)
    fs.unlinkSync(stagedPath)
    console.log('已应用：窗口底色会在下次启动时保持透明。')
  } catch (error) {
    console.error(`替换失败：${error.message}`)
    console.error('DSH 还开着，先完全退出再跑一次。')
    process.exit(1)
  }
  process.exit(0)
}

// 默认：生成 app.asar.new。应用运行中也能跑，因为不碰原文件。
const buffer = fs.readFileSync(asarPath)
let text = buffer.toString('latin1')

for (const patch of PATCHES) {
  const found = count(text, patch.from)
  if (found === 0) {
    const applied = count(text, patch.to)
    if (applied > 0) {
      console.log(`「${patch.name}」已经是透明值，跳过。`)
      continue
    }
    console.error(`「${patch.name}」没找到源串——应用版本可能变了，先确认再改。`)
    process.exit(1)
  }
  if (found !== patch.expect) {
    console.error(`「${patch.name}」应出现 ${patch.expect} 次，实际 ${found} 次——应用版本可能变了。`)
    process.exit(1)
  }
  text = text.split(patch.from).join(patch.to)
  console.log(`「${patch.name}」替换 ${found} 处`)
}

const next = Buffer.from(text, 'latin1')
if (next.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入（会破坏 asar 头）。')
  process.exit(1)
}

fs.writeFileSync(stagedPath, next)
console.log(`已生成 ${stagedPath}（${next.length} 字节，与原文件等长）`)
console.log('')
console.log('下一步：完全退出 DSH（托盘里也要退），然后运行：')
console.log('  node scripts/patch-window-clear.mjs --apply')
console.log('再启动 DSH，窗口底色就会保持透明，留边那圈才是亚克力。')
