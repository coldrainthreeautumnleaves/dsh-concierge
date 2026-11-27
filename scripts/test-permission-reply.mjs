// 回归测试：CLI 申请权限时，ACP 客户端必须回话。
//
// 不跑真 CLI：起一个假 ACP 服务端（scripts/fake-acp-server.mjs），它会在
// session/prompt 中间发一条 session/request_permission，然后等客户端回复。
// 客户端不回 → prompt 永远不 resolve（线上就是这么卡住的，240 秒都没返回）。
//
// 期望：客户端选中 allow_always，prompt 在几秒内正常结束。

import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAcpClient } from '../acp.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverSource = path.join(here, 'fake-acp-server.mjs')

// createAcpClient 只接受一个可执行文件路径（spawn(command, [])），
// 所以在临时目录里放一个 .cmd 包一层。
//
// 服务端脚本也要复制进临时目录：仓库路径里有中文（E:\全局），而 .cmd 是
// cmd.exe 读的，按系统代码页解释——UTF-8 写进去会变成乱码路径，脚本找不到。
// 临时目录是纯 ASCII，绕开这个问题。
const dir = mkdtempSync(path.join(tmpdir(), 'dsh-acp-'))
const serverPath = path.join(dir, 'fake-acp-server.mjs')
copyFileSync(serverSource, serverPath)
const wrapper = path.join(dir, 'fake-acp.cmd')
writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${serverPath}" %*\r\n`, 'utf8')

const client = createAcpClient({ command: wrapper, cwd: process.cwd() })

const chunks = []
const started = Date.now()

const timeout = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('10 秒内没有结束——权限请求很可能没被回答')), 10000)
})

try {
  await Promise.race([
    client.prompt('测试', (text) => chunks.push(text), undefined, ''),
    timeout,
  ])
} catch (error) {
  console.log('失败：' + error.message)
  client.dispose()
  process.exit(1)
} finally {
  client.dispose()
}

const elapsed = Date.now() - started
const text = chunks.join('')

console.log('耗时 ' + elapsed + 'ms')
console.log('收到的正文：' + JSON.stringify(text))

const problems = []
if (!text.includes('权限回复=selected/opt-allow-always')) {
  problems.push('没有按 allow_always 回复，实际收到：' + JSON.stringify(text))
}

if (problems.length) {
  console.log('\n问题：')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}
console.log('\n通过：权限请求被正确回答，这一轮正常结束')
