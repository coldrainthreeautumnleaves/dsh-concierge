#!/usr/bin/env node
/**
 * 把窗口背景从「全透明 + 亚克力」改成不透明，只留网页那一层。
 *
 * 现状：窗口 backgroundColor 是 #00000000（透明），背后 DWM 一直在画桌面壁纸的
 * 模糊。页面只要有一块是透明的（顶部那 40px、某些容器），系统那层模糊就透上来，
 * 和网页自己的磨砂叠成两层——看着又灰又脏，而且 CSS 改不动它。
 *
 * 这个补丁把 #00000000 换成 #ffeef3fa（不透明的浅色画布），等长替换，
 * asar 头不用动。深色模式暂时也会是这个浅色底，因为等长替换塞不下两套颜色；
 * 确认方向对了再走重建 asar 的版本。
 *
 * 用法：
 *   node scripts/patch-window-opaque.mjs           # 生成 app.asar.opaque.new
 *   node scripts/patch-window-opaque.mjs --apply
 *   node scripts/patch-window-opaque.mjs --check
 *   node scripts/patch-window-opaque.mjs --revert
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)

function defaultAsar() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
}

const asarPath = process.env.DSH_ASAR || defaultAsar()
const stagedPath = `${asarPath}.opaque.new`
const backupPath = `${asarPath}.opaque.bak`

const FROM = '"#00000000"'
const TO = '"#ffeef3fa"'

if (!fs.existsSync(asarPath)) {
  console.error(`找不到 app.asar：${asarPath}`)
  process.exit(1)
}

const count = (text, needle) => {
  let n = 0
  let i = -1
  while ((i = text.indexOf(needle, i + 1)) !== -1) n += 1
  return n
}

if (flag('--check')) {
  const text = fs.readFileSync(asarPath).toString('latin1')
  console.log(`asar: ${asarPath}`)
  console.log(`透明底色 ${count(text, FROM)} 处 / 不透明底色 ${count(text, TO)} 处`)
  console.log(`备份：${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
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
    console.error(`还原失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

if (flag('--apply')) {
  if (!fs.existsSync(stagedPath)) {
    console.error(`没有待应用的文件：${stagedPath}`)
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
    console.log('已应用：窗口背景不透明，下次启动生效。')
  } catch (error) {
    console.error(`替换失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

const buffer = fs.readFileSync(asarPath)
const text = buffer.toString('latin1')
// 库里有个「空颜色」常量 NULL_COLOR={css:"#00000000",rgba:0}，它表示「没有颜色」，
// 换成不透明色会让绘制代码把空色当成实色。先把它藏起来，替换完再还原。
const NULL_COLOR = 'css:"#00000000"'
const GUARD = 'css:"#__NULL_COLOR__"'
let work = text.split(NULL_COLOR).join(GUARD)
const hits = count(work, FROM)
if (hits === 0) {
  console.log(count(text, TO) > 0 ? '已经是不透明底色，无需重复打。' : '没找到目标串，应用版本可能变了。')
  process.exit(count(text, TO) > 0 ? 0 : 1)
}

const next = Buffer.from(work.split(FROM).join(TO).split(GUARD).join(NULL_COLOR), 'latin1')
if (next.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入。')
  process.exit(1)
}

fs.writeFileSync(stagedPath, next)
console.log(`替换 ${hits} 处：${FROM} → ${TO}`)
console.log(`已生成 ${stagedPath}（${next.length} 字节，等长）`)
console.log('')
console.log('下一步：完全退出 DSH，然后双击 scripts\\apply-window-opaque.cmd')
