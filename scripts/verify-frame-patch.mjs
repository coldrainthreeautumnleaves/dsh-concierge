import fs from 'node:fs'
import path from 'node:path'

const asar = path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
const buf = fs.readFileSync(`${asar}.frame.new`)
const headerSize = buf.readUInt32LE(4)
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8'))
const dataStart = 8 + headerSize
const entry = json.files.lib.files['main.js']
const start = dataStart + Number(entry.offset)
const text = buf.subarray(start, start + Number(entry.size)).toString('latin1')

console.log('header ok, main.js size:', entry.size)
console.log('main window patched:', text.includes('backgroundMaterial:"acrylic",thickFrame:!1'))
console.log('welcome patched    :', text.includes('backgroundMaterial: "acrylic",thickFrame:!1'))
const i = text.indexOf('backgroundMaterial:"acrylic"')
console.log('main opts:', text.slice(Math.max(0, i - 70), i + 110).replace(/\s+/g, ' '))
