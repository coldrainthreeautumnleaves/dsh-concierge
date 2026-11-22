#!/usr/bin/env node
/**
 * 给 DSH 主窗口加 thickFrame: false / roundedCorners: false。
 *
 * 为什么需要这个补丁：Electron 41.3 之后，无边框窗口会在左/右/下各留一圈
 * SM_CXSIZEFRAME + SM_CXPADDEDBORDER 的不可见缩放边框（顶部为 0），代码在
 * shell/browser/ui/views/win_frame_view.cc 的 RestoredFrameBorderInsets()：
 *
 *   if (window_->has_frame() || !window_->has_thick_frame() || !window_->IsResizable())
 *     return {};
 *
 * 也就是说只有 thickFrame:false（或不可缩放）时 inset 才归零。inset 存在时
 * 窗口的 acrylic 会铺满整个窗口矩形，而页面只铺客户区，边缘就露出一圈「第二层」。
 *
 * 这是**插入**修改，会改变文件长度，asar 头里的偏移要重算。做法：
 *   1. 读出 header JSON 和数据区；
 *   2. 改主文件，把新内容**追加**到数据区末尾，只改它自己的 offset/size；
 *   3. 其余文件的 offset 都相对数据区起点，不受影响；
 *   4. 重建 header（长度变了，重新对齐）。
 *
 * 用法：
 *   node scripts/patch-window-frame.mjs           # 生成 app.asar.frame.new
 *   node scripts/patch-window-frame.mjs --apply   # DSH 完全退出后替换
 *   node scripts/patch-window-frame.mjs --check
 *   node scripts/patch-window-frame.mjs --revert
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
const stagedPath = `${asarPath}.frame.new`
const backupPath = `${asarPath}.frame.bak`

const ANCHOR = 'backgroundMaterial: "acrylic"'
const INSERT = ',thickFrame:!1,roundedCorners:!1'

const align4 = (n) => (n + 3) & ~3

function readAsar(file) {
  const buf = fs.readFileSync(file)
  const headerSize = buf.readUInt32LE(4)
  const jsonLen = buf.readUInt32LE(12)
  const json = buf.subarray(16, 16 + jsonLen).toString('utf8')
  const dataStart = 8 + headerSize
  return { buf, headerSize, jsonLen, json, dataStart }
}

function buildAsar({ buf, json, dataStart }, extra) {
  const jsonBuf = Buffer.from(json, 'utf8')
  const headerSize = align4(8 + jsonBuf.length)
  const head = Buffer.alloc(8 + headerSize)
  head.writeUInt32LE(4, 0)
  head.writeUInt32LE(headerSize, 4)
  head.writeUInt32LE(headerSize - 4, 8)
  head.writeUInt32LE(jsonBuf.length, 12)
  jsonBuf.copy(head, 16)
  return Buffer.concat([head, buf.subarray(dataStart), extra || Buffer.alloc(0)])
}

/** 找到包含某个数据偏移的条目（返回 { entry, dir }）。 */
function findByOffset(node, offset, dir = []) {
  for (const [name, value] of Object.entries(node.files || {})) {
    if (value.files) {
      const hit = findByOffset(value, offset, [...dir, name])
      if (hit) return hit
    } else if (value.offset !== undefined) {
      const start = Number(value.offset)
      const end = start + Number(value.size)
      if (offset >= start && offset < end) {
        return { entry: value, path: [...dir, name].join('/'), start }
      }
    }
  }
  return null
}

if (!fs.existsSync(asarPath)) {
  console.error(`找不到 app.asar：${asarPath}`)
  process.exit(1)
}

if (flag('--check')) {
  const { json } = readAsar(asarPath)
  const patched = json.includes('thickFrame:!1')
  console.log(`asar: ${asarPath}`)
  console.log(`thickFrame 补丁：${patched ? '已应用' : '未应用'}`)
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
    console.log('已应用：窗口不再有 11px 的不可见缩放边框，下次启动生效。')
    console.log('注意：窗口不能再拖边改大小。')
  } catch (error) {
    console.error(`替换失败：${error.message}（DSH 还开着？）`)
    process.exit(1)
  }
  process.exit(0)
}

// 默认：生成 app.asar.frame.new
const asar = readAsar(asarPath)
if (asar.json.includes('thickFrame:!1')) {
  console.log('补丁已经在里面了，无需重复打。')
  process.exit(0)
}

const data = asar.buf.subarray(asar.dataStart)
const anchorIndex = data.indexOf(Buffer.from(ANCHOR, 'latin1'))
if (anchorIndex < 0) {
  console.error('没找到 backgroundMaterial: "acrylic"，应用版本可能变了。')
  process.exit(1)
}

const parsed = JSON.parse(asar.json)
const found = findByOffset(parsed, anchorIndex)
if (!found) {
  console.error('找到了锚点，但定位不到它属于哪个文件。')
  process.exit(1)
}

const fileStart = found.start
const fileSize = Number(found.entry.size)
const original = data.subarray(fileStart, fileStart + fileSize)
const anchorInFile = anchorIndex - fileStart

// 在锚点后面插入两个构造参数。
const patched = Buffer.concat([
  original.subarray(0, anchorInFile + ANCHOR.length),
  Buffer.from(INSERT, 'latin1'),
  original.subarray(anchorInFile + ANCHOR.length),
])

// 把新文件追加到数据区末尾，只改它自己的 offset/size。
found.entry.offset = String(data.length)
found.entry.size = patched.length
delete found.entry.integrity

const next = buildAsar(
  { buf: asar.buf, json: JSON.stringify(parsed), dataStart: asar.dataStart },
  patched,
)

fs.writeFileSync(stagedPath, next)
console.log(`目标文件: ${found.path}（原 ${fileSize} 字节 → ${patched.length} 字节）`)
console.log(`已生成 ${stagedPath}（${next.length} 字节）`)
console.log('')
console.log('下一步：完全退出 DSH，然后双击 scripts\\apply-window-frame.cmd')
console.log('（或运行 node scripts/patch-window-frame.mjs --apply）')
