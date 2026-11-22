#!/usr/bin/env node
/**
 * 让 DSH 主窗口的底色和玻璃皮肤一致（而不是透明）。
 *
 * 背景：窗口有一圈约 11px 的非客户区（WS_THICKFRAME 那套，Windows 用来做拖边
 * 命中），页面永远画不进去。窗口透明时那圈露出的就是桌面；所以这里不再追求透明，
 * 改成让窗口底色等于玻璃壁纸的基色——那圈看起来就和内容是一块。
 *
 * 做法：改 chromeFallbackFill() 的两个返回值。
 *   "#1b1b1c" : "#f9fafb"   →   "#0e1116" : "#eef3fa"
 * 等长替换，不动 asar 头；主进程里所有 setBackgroundColor 调用、标题栏遮罩的
 * 颜色都会跟着变，不用逐个改。
 *
 * 源文件优先用 app.asar.clear.bak（透明补丁之前的原版）；如果当前 asar 已经是
 * 原版，就直接用它。
 *
 * 用法：
 *   node scripts/patch-window-match.mjs           # 生成 app.asar.new
 *   node scripts/patch-window-match.mjs --apply   # DSH 完全退出后替换
 *   node scripts/patch-window-match.mjs --check
 *   node scripts/patch-window-match.mjs --revert  # 用备份还原
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
const clearBackup = `${asarPath}.clear.bak`
const backupPath = `${asarPath}.match.bak`

const FROM = '"#1b1b1c" : "#f9fafb"'
const TO = '"#0e1116" : "#eef3fa"'
if (FROM.length !== TO.length) {
  console.error(`颜色串长度不等（${FROM.length} vs ${TO.length}）`)
  process.exit(1)
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
const count = (text, needle) => {
  let n = 0
  let i = -1
  while ((i = text.indexOf(needle, i + 1)) !== -1) n += 1
  return n
}

if (!fs.existsSync(asarPath)) {
  console.error(`找不到 app.asar：${asarPath}`)
  process.exit(1)
}

const inspect = (file) => {
  const text = fs.readFileSync(file).toString('latin1')
  return {
    original: count(text, 'setBackgroundColor(chromeFallbackFill())'),
    clear: count(text, 'setBackgroundColor("#00000000"'),
    from: count(text, FROM),
    to: count(text, TO),
  }
}

if (flag('--check')) {
  console.log(`asar:   ${asarPath}`)
  const s = inspect(asarPath)
  console.log(`原始调用 ${s.original} / 透明补丁 ${s.clear} / 旧颜色 ${s.from} / 新颜色 ${s.to}`)
  console.log(`备份:   ${fs.existsSync(clearBackup) ? clearBackup : '（无 clear 备份）'}`)
  console.log(`待应用: ${fs.existsSync(stagedPath) ? stagedPath : '（无）'}`)
  process.exit(0)
}

if (flag('--revert')) {
  const source = fs.existsSync(backupPath) ? backupPath : (fs.existsSync(clearBackup) ? clearBackup : null)
  if (!source) {
    console.error('没有可用的备份，无法还原。')
    process.exit(1)
  }
  try {
    fs.copyFileSync(source, asarPath)
    console.log(`已用 ${path.basename(source)} 还原 app.asar`)
  } catch (error) {
    console.error(`还原失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

if (flag('--apply')) {
  if (!fs.existsSync(stagedPath)) {
    console.error(`没有待应用的文件：${stagedPath}`)
    console.error('先跑一次 node scripts/patch-window-match.mjs。')
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
    console.log('已应用：窗口底色会与玻璃皮肤同色，下次启动生效。')
  } catch (error) {
    console.error(`替换失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

// 默认：生成 app.asar.new。
// 源文件优先用 clear 备份（透明补丁之前的原版）；否则用当前 asar，但要求它没有
// 透明补丁，否则窗口会一直是透明的，这个颜色补丁就没意义了。
const source = fs.existsSync(clearBackup) ? clearBackup : asarPath
const state = inspect(source)
if (state.clear > 0 && state.original === 0) {
  console.error('当前 asar 还是「透明窗口」版本，先还原再打这个补丁：')
  console.error('  node scripts/patch-window-clear.mjs --revert')
  process.exit(1)
}
if (state.to > 0 && state.from === 0) {
  console.log('颜色已经是目标值，无需重复打补丁。')
  process.exit(0)
}
if (state.from !== 1) {
  console.error(`颜色串应出现 1 次，实际 ${state.from} 次——应用版本可能变了。`)
  process.exit(1)
}

const buffer = fs.readFileSync(source)
const text = buffer.toString('latin1').split(FROM).join(TO)
const next = Buffer.from(text, 'latin1')
if (next.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入。')
  process.exit(1)
}

fs.writeFileSync(stagedPath, next)
console.log(`源文件: ${path.basename(source)}`)
console.log(`已生成 ${stagedPath}（${next.length} 字节，等长）`)
console.log('')
console.log('下一步：完全退出 DSH，然后双击 scripts\\apply-window-match.cmd')
console.log('（或运行 node scripts/patch-window-match.mjs --apply）')
