#!/usr/bin/env node
/**
 * 把系统画的标题栏（titleBarOverlay）底色改成和界面一致。
 *
 * 顶栏那 40px 不是页面画的，是 Windows 按主进程给的 `titleBarOverlay.color`
 * 自己刷的——CSS 碰不到，只能改主进程。那个颜色来自 chromeFallbackFill()：
 *
 *   return nativeTheme.shouldUseDarkColors ? "#1b1b1c" : "#f9fafb";
 *
 * 改成玻璃皮肤的基色（#0e1116 / #eef3fa），两个串长度相同，等长替换，
 * asar 头不用动，也不用重建。
 *
 * 用法：
 *   node scripts/patch-titlebar-color.mjs           # 生成 app.asar.color.new
 *   node scripts/patch-titlebar-color.mjs --apply   # DSH 完全退出后替换
 *   node scripts/patch-titlebar-color.mjs --check
 *   node scripts/patch-titlebar-color.mjs --revert
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
const stagedPath = `${asarPath}.color.new`
const backupPath = `${asarPath}.color.bak`

const FROM = '"#1b1b1c" : "#f9fafb"'
const TO = '"#0e1116" : "#eef3fa"'

if (FROM.length !== TO.length) {
  console.error(`颜色串长度不等（${FROM.length} vs ${TO.length}）`)
  process.exit(1)
}

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
  console.log(`旧颜色 ${count(text, FROM)} 处 / 新颜色 ${count(text, TO)} 处`)
  console.log(`备份：${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  console.log(`待应用：${fs.existsSync(stagedPath) ? stagedPath : '（无）'}`)
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
    console.log('已应用：标题栏底色 = 界面基色，下次启动生效。')
  } catch (error) {
    console.error(`替换失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

// 默认：生成 app.asar.color.new
const buffer = fs.readFileSync(asarPath)
const text = buffer.toString('latin1')
const hits = count(text, FROM)
if (hits === 0) {
  console.log(count(text, TO) > 0 ? '颜色已经是目标值，无需重复打。' : '没找到目标颜色串，应用版本可能变了。')
  process.exit(count(text, TO) > 0 ? 0 : 1)
}

const next = Buffer.from(text.split(FROM).join(TO), 'latin1')
if (next.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入。')
  process.exit(1)
}

fs.writeFileSync(stagedPath, next)
console.log(`替换 ${hits} 处：${FROM} → ${TO}`)
console.log(`已生成 ${stagedPath}（${next.length} 字节，等长）`)
console.log('')
console.log('下一步：完全退出 DSH，然后双击 scripts\\apply-titlebar-color.cmd')
console.log('（或运行 node scripts/patch-titlebar-color.mjs --apply）')
