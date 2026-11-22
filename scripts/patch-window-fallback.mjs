#!/usr/bin/env node
/**
 * 给 DSH 主窗口的 acrylic 配一个「壁纸近似色」回退底。
 *
 * 为什么需要：窗口挂的是 `backgroundMaterial: "acrylic"`，缩放时新露出的那一帧
 * 还没被 DWM 重新采样，Windows 会先画 acrylic 的回退色——默认偏冷的浅色，于是
 * 拖窗口时底部会闪一条横贯整窗的浅色带。把 `backgroundColor` 换成壁纸同色系的
 * 值，回退色就和壁纸接近，看不出来了。
 *
 * 关键约束：asar 头里存着每个文件的偏移和大小，所以这里**只做等长替换**
 * （`#00000000` → `#e8f0faff`，都是 9 个字符），不动文件长度，不重写头。
 *
 * 用法：
 *   node scripts/patch-window-fallback.mjs --check     # 看当前状态
 *   node scripts/patch-window-fallback.mjs             # 打补丁（会先备份）
 *   node scripts/patch-window-fallback.mjs --revert    # 用备份还原
 *   node scripts/patch-window-fallback.mjs --asar <path>
 *
 * 应用更新后重跑一次即可。打补丁期间应用可以开着，写不进去就退出应用再跑。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FROM = 'backgroundColor:"#00000000",backgroundMaterial:"acrylic"'
const TO = 'backgroundColor:"#e8f0faff",backgroundMaterial:"acrylic"'

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

function countOccurrences(buffer, needle) {
  const hay = buffer.toString('latin1')
  const pin = Buffer.from(needle, 'latin1').toString('latin1')
  let count = 0
  let i = -1
  while ((i = hay.indexOf(pin, i + 1)) !== -1) count += 1
  return count
}

const buffer = fs.readFileSync(asarPath)
const patched = countOccurrences(buffer, TO)
const original = countOccurrences(buffer, FROM)

if (flag('--check')) {
  console.log(`asar:      ${asarPath}`)
  console.log(`已打补丁:  ${patched === 1 ? '是' : '否'}（目标串 ${patched} 处）`)
  console.log(`原始串:    ${original} 处`)
  console.log(`备份:      ${fs.existsSync(backupPath) ? backupPath : '（无）'}`)
  process.exit(patched === 1 ? 0 : 2)
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

if (patched === 1) {
  console.log('已经打过补丁，无需重复操作。')
  process.exit(0)
}
if (original !== 1) {
  console.error(`目标串应出现 1 次，实际 ${original} 次——应用版本可能变了，先确认再改。`)
  process.exit(1)
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(asarPath, backupPath)
  console.log(`已备份到 ${backupPath}`)
}

const next = Buffer.from(buffer.toString('latin1').replace(FROM, TO), 'latin1')
if (next.length !== buffer.length) {
  console.error('替换后长度变了，拒绝写入（会破坏 asar 头）。')
  process.exit(1)
}
try {
  fs.writeFileSync(asarPath, next)
} catch (error) {
  console.error(`写入失败：${error.message}`)
  console.error('多半是应用正在运行锁住了文件——先退出 DSH，再跑一次。')
  process.exit(1)
}
console.log('已写入：acrylic 回退色改为 #e8f0fa（不透明，等价 #e8f0faff）')
console.log('重启 DSH 生效。')
