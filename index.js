/**
 * dsh-concierge — Host half.
 *
 * Serves a small same-origin JSON API used by the settings page:
 *   GET  /dsh-concierge/status[?refresh=1]  app + plugin update status
 *   POST /dsh-concierge/update               { name } -> plugin update
 *
 * Sources:
 *   - app:      resources/app-update.yml + the generic feed it names
 *   - plugins:  pluginManager.listBundles() / listVersions()
 *   - market:   pluginMarket configured indexes (entry lookup per plugin)
 *   - git:      GitHub releases (or tags) for git-installed bundles
 *
 * Updates go through pluginManager.updateBundle(), so pnpm, rollback on
 * failure and restart reporting stay owned by the plugin manager.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat as statOf, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer']

const ROUTE = '/dsh-concierge'
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 12_000
const CONCURRENCY = 32
const REGISTRY_TIMEOUT_MS = 12_000
const MIRROR_BASE = 'https://registry.npmmirror.com'
const GITHUB_API = 'https://api.github.com'
const GITHUB_RELEASES = 'https://github.com/deepseek-ai/deepseek-harness/releases'
// Names whose last update asked for a restart; checked once on the next Host start.
const PENDING_FILE = path.join(homedir(), '.dsh', 'update-center', 'pending.json')

// Safe-mode helpers: when a broken third-party bundle keeps the app from
// starting, nothing inside the app can fix it, so the plugin writes a pair of
// double-click scripts that disable third-party bundles before launch.
const SAFE_DIR = path.join(homedir(), '.dsh', 'update-center')
const SETTINGS_FILE = path.join(SAFE_DIR, 'settings.json')

// A GitHub token raises the anonymous 60 requests/hour to 5,000. It can come
// from the environment or from the settings file the page writes.
let storedToken = null
// Whether safe-launch.cmd should fall back to safe mode when the app crashes.
let safeModeAuto = true

async function readSettings() {
  try {
    const text = await readFile(SETTINGS_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed.githubToken === 'string') storedToken = parsed.githubToken
    if (parsed && typeof parsed.safeModeAuto === 'boolean') safeModeAuto = parsed.safeModeAuto
  } catch {
    /* no settings yet */
  }
}

async function writeSettings() {
  try {
    await mkdir(SAFE_DIR, { recursive: true })
    await writeFile(
      SETTINGS_FILE,
      JSON.stringify({ githubToken: storedToken || '', safeModeAuto }, null, 2),
      'utf8',
    )
  } catch {
    /* best effort */
  }
}

function maskToken(token) {
  if (!token) return null
  if (token.length <= 8) return '****'
  // Keep the recognizable prefix so the page can say which kind of token it is.
  const prefix = /^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/.exec(token)
  if (prefix) return `${prefix[1]}…${token.slice(-4)}`
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

const SAFE_MODE_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
$pkg = Join-Path $profileDir 'package.json'
$patch = Join-Path $profileDir 'cordis.patch.yml'
$backupDir = Join-Path $env:USERPROFILE '.dsh\update-center\safe-backup'

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '应用正在运行，请先完全退出 DeepSeek Harness，再运行本脚本。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $pkg (Join-Path $backupDir 'package.json') -Force
if (Test-Path $patch) { Copy-Item $patch (Join-Path $backupDir 'cordis.patch.yml') -Force }

$json = Get-Content $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
$json.dsh.profile.bundles = @($json.dsh.profile.bundles | Where-Object { $_ -like '@deepseek-ai/*' })
$json | ConvertTo-Json -Depth 100 | Set-Content $pkg -Encoding UTF8

Write-Host '已进入安全模式：只加载官方插件，第三方插件已临时停用。' -ForegroundColor Green
Write-Host '恢复：双击 restore-mode.cmd'
Start-Process -FilePath $exe
Read-Host '按回车关闭窗口'
`

const RESTORE_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
$backupDir = Join-Path $env:USERPROFILE '.dsh\update-center\safe-backup'

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '应用正在运行，请先完全退出 DeepSeek Harness，再运行本脚本。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}

if (-not (Test-Path (Join-Path $backupDir 'package.json'))) {
  Write-Host '没有找到安全模式备份，无法恢复。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}

Copy-Item (Join-Path $backupDir 'package.json') (Join-Path $profileDir 'package.json') -Force
if (Test-Path (Join-Path $backupDir 'cordis.patch.yml')) {
  Copy-Item (Join-Path $backupDir 'cordis.patch.yml') (Join-Path $profileDir 'cordis.patch.yml') -Force
}

Write-Host '已恢复原来的插件配置。' -ForegroundColor Green
Start-Process -FilePath $exe
Read-Host '按回车关闭窗口'
`

const SAFE_LAUNCH_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkg = Join-Path $profileDir 'package.json'
$patch = Join-Path $profileDir 'cordis.patch.yml'
$backupDir = Join-Path $env:USERPROFILE '.dsh\update-center\safe-backup'

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) { Write-Host '应用已经在运行。' -ForegroundColor Yellow; Read-Host '按回车退出'; exit 0 }

Start-Process -FilePath $exe
Write-Host '正在启动，观察 30 秒看是否崩溃...'
Start-Sleep -Seconds 30
$alive = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($alive) { Write-Host '启动正常。' -ForegroundColor Green; exit 0 }

Write-Host '检测到启动失败，自动进入安全模式...' -ForegroundColor Yellow
Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $pkg (Join-Path $backupDir 'package.json') -Force
if (Test-Path $patch) { Copy-Item $patch (Join-Path $backupDir 'cordis.patch.yml') -Force }

$json = Get-Content $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
$json.dsh.profile.bundles = @($json.dsh.profile.bundles | Where-Object { $_ -like '@deepseek-ai/*' })
$json | ConvertTo-Json -Depth 100 | Set-Content $pkg -Encoding UTF8

Start-Process -FilePath $exe
Write-Host '已用安全模式重启（只加载官方插件）。修好后双击 restore-mode.cmd 恢复。' -ForegroundColor Green
Read-Host '按回车关闭窗口'
`

const PLAIN_LAUNCH_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) { Write-Host '应用已经在运行。' -ForegroundColor Yellow; Read-Host '按回车退出'; exit 0 }

Start-Process -FilePath $exe
Write-Host '已启动（自动安全模式已关闭）。' -ForegroundColor Green
`

const CMD_WRAPPER = (script) => `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${script}"\r\n`

async function writeSafeModeScripts() {
  try {
    await mkdir(SAFE_DIR, { recursive: true })
    // A BOM keeps Windows PowerShell 5.1 from reading the Chinese text as ANSI.
    const bom = '\uFEFF'
    await writeFile(path.join(SAFE_DIR, 'safe-mode.ps1'), bom + SAFE_MODE_PS1, 'utf8')
    await writeFile(path.join(SAFE_DIR, 'restore-mode.ps1'), bom + RESTORE_PS1, 'utf8')
    await writeFile(path.join(SAFE_DIR, 'safe-mode.cmd'), CMD_WRAPPER('safe-mode.ps1'), 'utf8')
    await writeFile(path.join(SAFE_DIR, 'restore-mode.cmd'), CMD_WRAPPER('restore-mode.ps1'), 'utf8')
    // The switch decides whether safe-launch.cmd watches for a crash and falls
    // back to safe mode, or just starts the app.
    const launchScript = safeModeAuto ? SAFE_LAUNCH_PS1 : PLAIN_LAUNCH_PS1
    await writeFile(path.join(SAFE_DIR, 'safe-launch.ps1'), bom + launchScript, 'utf8')
    await writeFile(path.join(SAFE_DIR, 'safe-launch.cmd'), CMD_WRAPPER('safe-launch.ps1'), 'utf8')
  } catch {
    /* best effort */
  }
}

export function apply(ctx) {
  const state = {
    cache: null,
    inflight: null,
    targets: new Map(),
    // One in-flight update per package, so a second request cannot race the first.
    updating: new Set(),
  }

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      resource: (request, peer) => handle(ctx, state, request, peer),
    }),
    'dsh-concierge: read route',
  )

  // Resource routes answer GET/HEAD only, so the mutations have their own routes.
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/update`,
      handler: (request, response) => handleUpdate(ctx, state, request, response),
    }),
    'dsh-concierge: update route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/install`,
      handler: (request, response) => handleInstall(ctx, state, request, response),
    }),
    'dsh-concierge: install route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/restart`,
      handler: (request, response) => handleRestart(ctx, request, response),
    }),
    'dsh-concierge: restart route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/toggle`,
      handler: (request, response) => handleToggle(ctx, request, response),
    }),
    'dsh-concierge: toggle route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/open`,
      handler: (request, response) => handleOpen(ctx, request, response),
    }),
    'dsh-concierge: open route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/install-git`,
      handler: (request, response) => handleInstallGit(ctx, state, request, response),
    }),
    'dsh-concierge: install git route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/sources`,
      handler: (request, response) => handleSources(state, request, response),
    }),
    'dsh-concierge: sources route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/guide`,
      handler: (request, response) => handleGuide(request, response),
    }),
    'dsh-concierge: guide route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/uninstall`,
      handler: (request, response) => handleUninstall(ctx, state, request, response),
    }),
    'dsh-concierge: uninstall route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/install-npm`,
      handler: (request, response) => handleInstallNpm(ctx, state, request, response),
    }),
    'dsh-concierge: install npm route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/settings`,
      handler: (request, response) => handleSettings(request, response),
    }),
    'dsh-concierge: settings route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/about`,
      handler: (request, response) => handleAbout(request, response),
    }),
    'dsh-concierge: about route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE}/startup-boost`,
      handler: (request, response) => handleStartupBoost(request, response),
    }),
    'dsh-concierge: startup boost route',
  )

  // A plugin updated into a broken state should not keep breaking every start.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      void runStartupCheck(ctx)
    }, 2500)
    return () => clearTimeout(timer)
  }, 'dsh-concierge: startup self-check')

  // Keep the double-click recovery scripts on disk so they are there even when
  // the app cannot start any more.
  ctx.effect(() => {
    void writeSafeModeScripts()
    void readSettings()
    return () => {}
  }, 'dsh-concierge: safe-mode scripts')
}

async function handleRestart(ctx, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const result = await requestAppRestart(ctx)
    sendNodeJson(response, result, result.ok ? 202 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function handleToggle(ctx, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const result = await togglePlugin(ctx, body)
    sendNodeJson(response, result, result.ok ? 200 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function togglePlugin(ctx, body) {
  const name = body && typeof body.name === 'string' ? body.name : ''
  const enabled = Boolean(body && body.enabled)
  if (!name) return { ok: false, error: '缺少插件名' }
  const pm = ctx.get('pluginManager')
  if (!pm || typeof pm.setPluginEnabled !== 'function') return { ok: false, error: 'pluginManager 不支持启停' }

  let entryId = null
  try {
    const plugins = await pm.listPlugins()
    const row = plugins.find((item) => item && (item.moduleName === name || item.packageName === name))
    entryId = row && row.entryId ? row.entryId : null
  } catch {
    entryId = null
  }
  if (!entryId) {
    try {
      const bundles = await pm.listBundles()
      const bundle = bundles.find((item) => item && item.name === name)
      entryId = bundle && bundle.entryId ? bundle.entryId : null
    } catch {
      entryId = null
    }
  }
  if (!entryId) return { ok: false, error: `找不到 ${name} 的入口` }

  try {
    const result = await pm.setPluginEnabled(entryId, enabled)
    return { ok: true, enabled, result }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

function normalizeGitSpec(input) {
  const text = String(input || '').trim()
  if (!text) return null
  if (/^github:/i.test(text)) return text
  const match = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(text)
  if (match) return `github:${match[1]}/${match[2]}`
  if (/^git\+/.test(text) || /^ssh:\/\//.test(text) || /^https?:\/\/[^/]+\/.+\.git/i.test(text)) return text
  return null
}

// GitHub repositories the user watches: checked for new releases even when the
// plugin is not installed, and installed on demand from the row.
const SOURCES_FILE = path.join(homedir(), '.dsh', 'update-center', 'github-sources.json')

async function readSources() {
  try {
    const text = await readFile(SOURCES_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string')
  } catch {
    /* none yet */
  }
  return []
}

async function writeSources(list) {
  try {
    await mkdir(path.dirname(SOURCES_FILE), { recursive: true })
    await writeFile(SOURCES_FILE, JSON.stringify(list, null, 2), 'utf8')
  } catch {
    /* best effort */
  }
}

function normalizeSourceRepo(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const shorthand = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(text)
  if (shorthand) return `${shorthand[1]}/${shorthand[2]}`
  const url = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(text)
  if (url) return `${url[1]}/${url[2]}`
  const bare = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text)
  if (bare) return `${bare[1]}/${bare[2]}`
  return null
}

async function handleSettings(request, response) {
  try {
    if (request.method === 'GET') {
      const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null
      sendNodeJson(response, {
        ok: true,
        hasToken: Boolean(env || storedToken),
        fromEnv: Boolean(env),
        masked: maskToken(env || storedToken),
        safeModeAuto,
      }, 200)
      return
    }
    if (request.method !== 'POST') {
      response.statusCode = 405
      response.setHeader('allow', 'GET, POST')
      response.end()
      return
    }
    const body = await readNodeJson(request)
    if (typeof body.githubToken === 'string') {
      const token = body.githubToken.trim()
      storedToken = token || null
    }
    const autoChanged = typeof body.safeModeAuto === 'boolean' && body.safeModeAuto !== safeModeAuto
    if (typeof body.safeModeAuto === 'boolean') safeModeAuto = body.safeModeAuto
    await writeSettings()
    if (autoChanged) await writeSafeModeScripts()
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null
    sendNodeJson(response, {
      ok: true,
      hasToken: Boolean(storedToken || env),
      fromEnv: Boolean(env),
      masked: maskToken(env || storedToken),
      safeModeAuto,
    }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

// Startup boost: the Host cannot touch Defender itself (that needs elevation),
// so it writes a small script and asks Windows to run it elevated. The script
// reports back through a JSON file the page polls.
const STARTUP_BOOST_FILE = path.join(SAFE_DIR, 'startup-boost.json')
const STARTUP_BOOST_SCRIPT = path.join(SAFE_DIR, 'startup-boost.ps1')
const STARTUP_BOOST_LAUNCHER = path.join(SAFE_DIR, 'startup-boost-launch.ps1')

function startupBoostPaths() {
  return [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness'),
    path.join(homedir(), '.dsh'),
    path.dirname(PLUGIN_DIR),
  ].filter(Boolean)
}

function buildStartupBoostScript(enabled) {
  const quoted = startupBoostPaths()
    .map((item) => `'${String(item).replace(/'/g, "''")}'`)
    .join(', ')
  const action = enabled
    ? 'Add-MpPreference -ExclusionPath $p -ErrorAction Stop'
    : 'Remove-MpPreference -ExclusionPath $p -ErrorAction Stop'
  return `$ErrorActionPreference = 'Stop'
$paths = @(${quoted})
$result = [ordered]@{
  ok = $true
  enabled = ${enabled ? '$true' : '$false'}
  at = (Get-Date).ToString('o')
  paths = @()
  errors = @()
}
foreach ($p in $paths) {
  if (-not (Test-Path $p)) { $result.errors += "missing: $p"; continue }
  try {
    ${action}
    $result.paths += $p
  } catch {
    $result.ok = $false
    $result.errors += $_.Exception.Message
  }
}
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath '${STARTUP_BOOST_FILE.replace(/'/g, "''")}' -Encoding UTF8
`
}

async function readStartupBoost() {
  try {
    const parsed = JSON.parse(await readFile(STARTUP_BOOST_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function handleStartupBoost(request, response) {
  try {
    if (request.method === 'GET') {
      sendNodeJson(response, { ok: true, state: await readStartupBoost() }, 200)
      return
    }
    if (request.method !== 'POST') {
      response.statusCode = 405
      response.setHeader('allow', 'GET, POST')
      response.end()
      return
    }
    const body = await readNodeJson(request)
    const enabled = body.enabled === true
    await mkdir(SAFE_DIR, { recursive: true })
    await writeFile(STARTUP_BOOST_SCRIPT, `\uFEFF${buildStartupBoostScript(enabled)}`, 'utf8')
    // Elevation lives in its own .ps1: passing the whole Start-Process call as
    // a -Command string got mangled by Node's Windows argument quoting.
    await writeFile(
      STARTUP_BOOST_LAUNCHER,
      `\uFEFF$ErrorActionPreference = 'Stop'\r\nStart-Process powershell -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${STARTUP_BOOST_SCRIPT.replace(/'/g, "''")}')\r\n`,
      'utf8',
    )
    // detached: true puts the child in a new process group and the elevation
    // prompt then never shows; a plain spawn lets Windows raise UAC normally.
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      STARTUP_BOOST_LAUNCHER,
    ], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    sendNodeJson(response, { ok: true, launched: true }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

// The About page shows the plugin's own package.json and CHANGELOG.md, so the
// version and the notes live in exactly one place on disk.
async function readChangelog() {
  try {
    const text = await readFile(path.join(PLUGIN_DIR, 'CHANGELOG.md'), 'utf8')
    const entries = []
    let current = null
    for (const line of text.split(/\r?\n/)) {
      const heading = /^##\s+(.+?)\s*$/.exec(line)
      if (heading) {
        current = { version: heading[1].trim(), items: [] }
        entries.push(current)
        continue
      }
      const item = /^[-*]\s+(.+?)\s*$/.exec(line)
      if (item && current) current.items.push(item[1].trim())
    }
    return entries
  } catch {
    return []
  }
}

async function handleAbout(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('allow', 'GET')
    response.end()
    return
  }
  try {
    let pkg = {}
    try {
      pkg = JSON.parse(await readFile(path.join(PLUGIN_DIR, 'package.json'), 'utf8'))
    } catch {
      pkg = {}
    }
    const repository = pkg.repository && typeof pkg.repository === 'object'
      ? pkg.repository.url
      : pkg.repository
    sendNodeJson(response, {
      ok: true,
      name: pkg.name || 'dsh-concierge',
      version: pkg.version || '0.0.0',
      description: pkg.description || '',
      license: pkg.license || '',
      repository: repository || '',
      changelog: await readChangelog(),
    }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

function normalizeNpmSpec(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const match = /^(@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+(?:@[A-Za-z0-9_.^~<>=|*xX-]+)?$/.exec(text)
  return match ? text : null
}

async function handleInstallNpm(ctx, state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const spec = normalizeNpmSpec(body && body.spec)
    if (!spec) {
      sendNodeJson(response, { ok: false, error: '不是可识别的包名' }, 400)
      return
    }
    const pm = ctx.get('pluginManager')
    if (!pm || typeof pm.installBundle !== 'function') {
      sendNodeJson(response, { ok: false, error: 'pluginManager 服务不可用' }, 400)
      return
    }
    const result = await pm.installBundle(spec, {})
    state.cache = null
    const application = result && result.application
    const failed = application === 'failed' || application === 'cancelled'
    const error = failed && result && result.error
      ? (result.error.diagnostic || result.error.code || '安装失败')
      : undefined
    sendNodeJson(response, { ok: !failed, spec, error, result }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function handleUninstall(ctx, state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const name = body && typeof body.name === 'string' ? body.name : ''
    if (!name) {
      sendNodeJson(response, { ok: false, error: '缺少插件名' }, 400)
      return
    }
    const pm = ctx.get('pluginManager')
    if (!pm || typeof pm.removeBundle !== 'function') {
      sendNodeJson(response, { ok: false, error: 'pluginManager 服务不可用' }, 400)
      return
    }
    const result = await pm.removeBundle(name)
    state.cache = null
    const application = result && result.application
    const failed = application === 'failed' || application === 'cancelled'
    const error = failed && result && result.error
      ? (result.error.diagnostic || result.error.code || '卸载失败')
      : undefined
    sendNodeJson(response, { ok: !failed, error, result }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function handleGuide(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('allow', 'GET')
    response.end()
    return
  }
  try {
    const url = new URL(request.url, 'http://localhost')
    const repo = normalizeSourceRepo(url.searchParams.get('repo') || '')
    if (!repo) {
      sendNodeJson(response, { ok: false, error: '缺少仓库' }, 400)
      return
    }
    const guide = await fetchGuide(repo)
    sendNodeJson(response, guide, guide.ok ? 200 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function handleSources(state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const action = body && body.action === 'remove' ? 'remove' : 'add'
    const repo = normalizeSourceRepo(body && body.url)
    if (!repo) {
      sendNodeJson(response, { ok: false, error: '不是可识别的 GitHub 地址' }, 400)
      return
    }
    let list = await readSources()
    if (action === 'add') {
      if (!list.includes(repo)) list.push(repo)
    } else {
      list = list.filter((item) => item !== repo)
    }
    await writeSources(list)
    state.cache = null
    sendNodeJson(response, { ok: true, sources: list }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function repoPackageName(repo) {
  try {
    const response = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${repo}/HEAD/package.json`,
      { headers: { 'user-agent': 'dsh-concierge' } },
      8000,
    )
    if (!response.ok) return null
    const pkg = await response.json().catch(() => null)
    return pkg && typeof pkg.name === 'string' ? pkg.name : null
  } catch {
    return null
  }
}

async function checkSources(bundles) {
  const list = await readSources()
  if (list.length === 0) return []
  const rows = await mapLimit(list, 6, async (repo) => {
    const row = {
      repo,
      url: `https://github.com/${repo}`,
      installed: false,
      installedVersion: null,
      latest: null,
      releaseUrl: null,
      updateAvailable: false,
      error: null,
    }
    // The same plugin can be installed from a tarball or a local path, so match
    // by the repository's package name as well as by its install source.
    const packageName = await repoPackageName(repo)
    row.packageName = packageName
    let installed = bundles.find((bundle) => {
      if (!bundle) return false
      const source = String(bundle.source || (bundle.installTarget && bundle.installTarget.spec) || '')
      return source.includes(repo)
    })
    if (!installed && packageName) {
      installed = bundles.find((bundle) => bundle && bundle.name === packageName)
    }
    if (installed) {
      row.installed = true
      row.installedVersion = installed.version || null
      row.installedName = installed.name || null
    }
    try {
      const latest = await githubLatest(repo)
      if (latest) {
        row.latest = latest.version
        row.releaseUrl = latest.url
        row.updateAvailable = Boolean(
          row.installed && row.installedVersion && compareVersions(latest.version, row.installedVersion) > 0,
        )
      }
    } catch (error) {
      const message = messageOf(error)
      row.error = /HTTP 40[13]|rate limit/i.test(message) ? 'GitHub 速率限制' : message
    }
    return row
  })
  rows.sort((a, b) => a.repo.localeCompare(b.repo))
  return rows
}

// Multi-step plugins (memory starters and the like) document their install in
// the repository README; pull the quick-start steps out so the panel can walk
// the user through them after the bundle itself is installed.
function extractSteps(markdown) {
  const lines = String(markdown || '').split(/\r?\n/)
  const steps = []
  let inSection = false
  let inFence = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (heading && !inFence) {
      const title = heading[1].trim()
      if (!inSection && /(快速开始|安装|使用|getting started|install|setup|quick start)/i.test(title)) {
        inSection = true
        continue
      }
      if (inSection && steps.length >= 2) break
      continue
    }
    if (!inSection || inFence) continue
    const item = /^\s*(?:\d+[.)]|[-*])\s+(.+)$/.exec(line)
    if (item) {
      const text = item[1].replace(/`/g, '').replace(/\*\*/g, '').trim()
      if (text.length > 1 && text.length < 300) steps.push(text)
    }
    if (steps.length >= 10) break
  }
  return steps
}

async function fetchGuide(repo) {
  const response = await fetchWithTimeout(
    `${GITHUB_API}/repos/${repo}/readme`,
    { headers: { ...githubHeaders(), accept: 'application/vnd.github.raw' } },
    10000,
  )
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
  const text = await response.text()
  return {
    ok: true,
    repo,
    url: `https://github.com/${repo}`,
    steps: extractSteps(text),
  }
}

async function resolveGitHead(repo) {
  try {
    const response = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}/commits/HEAD`, { headers: githubHeaders() }, 8000)
    if (!response.ok) return null
    const commit = await response.json().catch(() => null)
    return commit && typeof commit.sha === 'string' ? commit.sha : null
  } catch {
    return null
  }
}

async function handleInstallGit(ctx, state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    let spec = normalizeGitSpec(body && body.url)
    if (!spec) {
      sendNodeJson(response, { ok: false, error: '不是可识别的 Git 地址' }, 400)
      return
    }
    // Pin the install to a full commit: only a pinned Git spec is updatable
    // (and rollback-able) through the plugin manager afterwards.
    const shorthand = /^github:([^#]+)$/.exec(spec)
    if (shorthand) {
      const sha = await resolveGitHead(shorthand[1])
      if (sha) spec = `github:${shorthand[1]}#${sha}`
    }
    const pm = ctx.get('pluginManager')
    if (!pm || typeof pm.installBundle !== 'function') {
      sendNodeJson(response, { ok: false, error: 'pluginManager 服务不可用' }, 400)
      return
    }
    const result = await pm.installBundle(spec, {})
    state.cache = null
    const application = result && result.application
    const failed = application === 'failed' || application === 'cancelled'
    const error = failed && result && result.error
      ? (result.error.diagnostic || result.error.code || '安装失败')
      : undefined
    sendNodeJson(response, { ok: !failed, spec, error, result }, 200)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function handleOpen(ctx, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const target = body && body.target === 'config' ? 'config' : body && body.target === 'safe' ? 'safe' : 'plugins'
    const dir = profileDir()
    const openPath = target === 'safe'
      ? SAFE_DIR
      : existsSync(target === 'config' ? path.join(dir, 'cordis.patch.yml') : path.join(dir, 'node_modules'))
        ? (target === 'config' ? path.join(dir, 'cordis.patch.yml') : path.join(dir, 'node_modules'))
        : dir
    const result = openInExplorer(openPath)
    sendNodeJson(response, result, result.ok ? 200 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

function profileDir() {
  const profile = process.env.DSH_PROFILE || 'desktop'
  return path.join(homedir(), '.dsh', 'profiles', profile)
}

function openInExplorer(target) {
  if (process.platform !== 'win32') return { ok: false, error: '仅支持 Windows' }
  try {
    const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return { ok: true, path: target }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

async function readPending() {
  try {
    const text = await readFile(PENDING_FILE, 'utf8')
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed.disabled)) return parsed.disabled
  } catch {
    /* no pending record */
  }
  return []
}

/**
 * Relaunch the desktop app without dsh-desktop-restart: a PowerShell helper is
 * created through WMI, so it lives outside this process tree (and its job
 * object), then kills the Electron main process and starts the executable.
 */
async function requestAppRestart(ctx) {
  if (process.platform !== 'win32') return { ok: false, error: '仅支持 Windows' }
  const exe = process.execPath
  if (!exe || !existsSync(exe)) return { ok: false, error: '找不到应用可执行文件' }
  const parent = process.ppid
  if (!parent) return { ok: false, error: '找不到宿主进程' }

  const dir = path.join(homedir(), '.dsh', 'update-center')
  await mkdir(dir, { recursive: true })
  const log = path.join(dir, 'restart.log')
  const script = path.join(dir, 'restart.ps1')
  const quote = (value) => String(value).replace(/'/g, "''")
  const lines = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$exe = '${quote(exe)}'`,
    `$parent = ${parent}`,
    `$log = '${quote(log)}'`,
    'function Note($m) { "$([DateTime]::Now.ToString(\'o\')) $m" | Out-File -FilePath $log -Encoding utf8 -Append }',
    "Note 'helper start'",
    'Start-Sleep -Seconds 2',
    'Stop-Process -Id $parent -Force',
    "Note 'killed parent'",
    'Start-Sleep -Seconds 4',
    'for ($i = 0; $i -lt 3; $i++) {',
    '  Start-Process -FilePath $exe',
    '  Note "launched $i"',
    '  Start-Sleep -Seconds 10',
    '  $p = Get-Process | Where-Object { $_.Path -eq $exe }',
    '  if ($p) { Note "back"; break }',
    '}',
  ]
  await writeFile(script, lines.join('\n'), 'utf8')
  const commandLine = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${script}"`
  const wmi = `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${quote(commandLine)}'}`
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', wmi], {
    stdio: 'ignore',
    windowsHide: true,
  })
  helper.on('error', () => {})
  return { ok: true, restarting: true, logPath: log }
}

async function recordPending(name) {
  try {
    await mkdir(path.dirname(PENDING_FILE), { recursive: true })
    let names = []
    try {
      const previous = JSON.parse(await readFile(PENDING_FILE, 'utf8'))
      if (Array.isArray(previous.names)) names = previous.names
    } catch {
      names = []
    }
    if (!names.includes(name)) names.push(name)
    await writeFile(PENDING_FILE, JSON.stringify({ names, at: Date.now() }), 'utf8')
  } catch {
    /* the self-check is best effort */
  }
}

async function runStartupCheck(ctx) {
  try {
    if (!existsSync(PENDING_FILE)) return
    const pending = JSON.parse(await readFile(PENDING_FILE, 'utf8'))
    const names = Array.isArray(pending.names) ? pending.names : []
    if (names.length === 0) {
      await rm(PENDING_FILE, { force: true })
      return
    }
    const pm = ctx.get('pluginManager')
    if (!pm || typeof pm.listPlugins !== 'function') return
    const plugins = await pm.listPlugins()
    const failed = plugins.filter((row) => row && row.fiberPhase === 'failed' && names.includes(row.moduleName))
    const disabled = []
    for (const row of failed) {
      try {
        await pm.setPluginEnabled(row.entryId, false)
        disabled.push(row.moduleName)
      } catch {
        /* leave it; the next start reports the same failure */
      }
    }
    await writeFile(PENDING_FILE, JSON.stringify({ checkedAt: Date.now(), disabled }), 'utf8')
  } catch {
    /* the self-check is best effort */
  }
}

async function handleInstall(ctx, state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const result = await installVersion(ctx, state, body)
    sendNodeJson(response, result, result.ok ? 200 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

async function listVersions(ctx, state, name) {
  if (!name) return { ok: false, error: '缺少插件名' }
  const pm = ctx.get('pluginManager')
  if (!pm) return { ok: false, error: 'pluginManager 服务不可用' }

  let current = null
  let kind = null
  let source = null
  try {
    const bundles = await pm.listBundles()
    const bundle = bundles.find((item) => item && item.name === name)
    current = bundle ? bundle.version : null
    kind = bundle ? bundle.update || null : null
    source = bundle ? (bundle.source || (bundle.installTarget && bundle.installTarget.spec) || null) : null
  } catch {
    /* keep nulls */
  }
  if (kind === 'git') {
    return listGitVersions(name, current, source)
  }
  if (kind && kind !== 'registry') {
    return { ok: false, error: '本地安装的插件没有可回退的版本' }
  }

  // The manager only lists versions newer than the installed one, so read the
  // full published list from the mirror's abbreviated packument instead.
  try {
    const path = String(name).replace('/', '%2F')
    const response = await fetchWithTimeout(
      `${MIRROR_BASE}/${path}`,
      { headers: { accept: 'application/vnd.npm.install-v1+json' } },
      8000,
    )
    if (response.ok) {
      const body = await response.json().catch(() => null)
      const published = body && body.versions && typeof body.versions === 'object' ? Object.keys(body.versions) : []
      if (published.length > 0) {
        const sorted = published.sort((a, b) => compareVersions(b, a))
        return {
          ok: true,
          current,
          versions: sorted.slice(0, 100).map((version) => ({
            version,
            incompatible: false,
            deprecated: body.versions[version] && body.versions[version].deprecated
              ? String(body.versions[version].deprecated)
              : null,
          })),
        }
      }
    }
  } catch {
    /* fall through to the manager */
  }

  if (typeof pm.listVersions === 'function') {
    const list = await withTimeout(pm.listVersions(name), REGISTRY_TIMEOUT_MS, '版本检查超时')
    if (list.status === 'listed' && Array.isArray(list.versions)) {
      return {
        ok: true,
        current,
        versions: list.versions.slice(0, 100).map((item) => ({
          version: item.version,
          incompatible: Boolean(item.incompatible),
          deprecated: item.deprecated || null,
        })),
      }
    }
  }
  return { ok: false, error: '无法读取版本列表' }
}

async function listGitVersions(name, current, source) {
  const repo = parseGitHubRepo(source)
  if (!repo) return { ok: false, error: '无法从安装源识别 GitHub 仓库' }
  const response = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}/tags?per_page=100`, { headers: githubHeaders() })
  if (!response.ok) return { ok: false, error: `GitHub tags: HTTP ${response.status}` }
  const tags = await response.json()
  const versions = []
  for (const tag of Array.isArray(tags) ? tags : []) {
    const tagName = tag && typeof tag.name === 'string' ? tag.name : null
    if (!tagName) continue
    const version = tagToVersion(tagName)
    if (!version) continue
    versions.push({
      version,
      ref: `git+https://github.com/${repo}.git#${tagName}`,
      tag: tagName,
      incompatible: false,
      deprecated: null,
    })
  }
  versions.sort((a, b) => compareVersions(b.version, a.version))
  return { ok: true, current, kind: 'git', repo, versions: versions.slice(0, 100) }
}

async function installVersion(ctx, state, body) {
  const name = body && typeof body.name === 'string' ? body.name : ''
  const version = body && typeof body.version === 'string' ? body.version : ''
  if (!name || !version) return { ok: false, error: '缺少插件名或版本' }
  if (state.updating.has(name)) return { ok: false, error: `${name} 正在更新，请稍候` }
  const pm = ctx.get('pluginManager')
  if (!pm) return { ok: false, error: 'pluginManager 服务不可用' }

  let bundle = null
  try {
    const bundles = await pm.listBundles()
    bundle = bundles.find((item) => item && item.name === name) || null
  } catch {
    bundle = null
  }
  if (!bundle) return { ok: false, error: `未安装 ${name}` }
  if (bundle.version === version) return { ok: false, error: '已经是这个版本' }
  if (bundle.update === 'git') return installGitVersion(ctx, state, bundle, version, body)
  if (bundle.update !== 'registry') return { ok: false, error: '本地安装的插件没有可回退的版本' }

  const previous = bundle.version
  state.updating.add(name)
  try {
    // updateBundle refuses anything but a newer version, so a rollback removes the
    // copy and installs the requested version, restoring the previous one on failure.
    const removed = await pm.removeBundle(name)
    if (removed && (removed.application === 'failed' || removed.application === 'cancelled')) {
      state.cache = null
      const reason = removed.error && removed.error.diagnostic ? removed.error.diagnostic : '移除失败'
      return { ok: false, error: reason }
    }
    try {
      const result = await pm.installBundle(`${name}@${version}`, {
        saveExact: true,
        expected: { name, version },
      })
      state.cache = null
      const application = result && result.application
      return { ok: application !== 'failed' && application !== 'cancelled', result }
    } catch (error) {
      try {
        await pm.installBundle(`${name}@${previous}`, {
          saveExact: true,
          expected: { name, version: previous },
        })
      } catch {
        /* restore failed; report the original error */
      }
      state.cache = null
      return { ok: false, error: messageOf(error) }
    }
  } finally {
    state.updating.delete(name)
  }
}

async function installGitVersion(ctx, state, bundle, version, body) {
  const name = bundle.name
  const spec = body && typeof body.spec === 'string' ? body.spec : ''
  if (!spec) return { ok: false, error: '缺少 Git 安装地址' }
  if (state.updating.has(name)) return { ok: false, error: `${name} 正在更新，请稍候` }
  const pm = ctx.get('pluginManager')
  if (!pm) return { ok: false, error: 'pluginManager 服务不可用' }

  const previous = bundle.version
  const previousSpec = bundle.source || (bundle.installTarget && bundle.installTarget.spec) || null
  state.updating.add(name)
  try {
    const removed = await pm.removeBundle(name)
    if (removed && (removed.application === 'failed' || removed.application === 'cancelled')) {
      state.cache = null
      return { ok: false, error: '移除失败' }
    }
    try {
      const result = await pm.installBundle(spec, { expected: { name, version } })
      state.cache = null
      const application = result && result.application
      return { ok: application !== 'failed' && application !== 'cancelled', result }
    } catch (error) {
      if (previousSpec) {
        try {
          await pm.installBundle(previousSpec, { expected: { name, version: previous } })
        } catch {
          /* restore failed; report the original error */
        }
      }
      state.cache = null
      return { ok: false, error: messageOf(error) }
    }
  } finally {
    state.updating.delete(name)
  }
}

async function handleUpdate(ctx, state, request, response) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return
  }
  try {
    const body = await readNodeJson(request)
    const result = await updateOne(ctx, state, body)
    sendNodeJson(response, result, result.ok ? 200 : 400)
  } catch (error) {
    sendNodeJson(response, { ok: false, error: messageOf(error) }, 500)
  }
}

function readNodeJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        request.destroy()
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        resolve({})
      }
    })
    request.on('error', reject)
  })
}

function sendNodeJson(response, value, status) {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

async function handle(ctx, state, request, peer) {
  try {
    if (peer && peer.principal && peer.principal.kind !== 'owner') {
      return json({ ok: false, error: 'forbidden' }, 403)
    }
    const url = new URL(request.url)
    const rest = normalizeRest(url.pathname)

    if (request.method === 'GET' && (rest === '/' || rest === '/health')) {
      return json({ ok: true, plugin: 'dsh-concierge' })
    }
    if (request.method === 'GET' && rest === '/status') {
      const refresh = url.searchParams.get('refresh') === '1'
      const data = await getStatus(ctx, state, refresh)
      return json(data)
    }
    if (request.method === 'GET' && rest === '/versions') {
      const result = await listVersions(ctx, state, url.searchParams.get('name') || '')
      return json(result, result.ok ? 200 : 400)
    }
    return json({ ok: false, error: 'not-found' }, 404)
  } catch (error) {
    return json({ ok: false, error: messageOf(error) }, 500)
  }
}

function normalizeRest(pathname) {
  let rest = pathname.startsWith(ROUTE) ? pathname.slice(ROUTE.length) : pathname
  if (!rest.startsWith('/')) rest = `/${rest}`
  rest = rest.replace(/\/+$/, '')
  return rest || '/'
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function getStatus(ctx, state, refresh) {
  const now = Date.now()
  if (!refresh && state.cache && now - state.cache.at < CACHE_TTL_MS) {
    return state.cache.data
  }
  if (state.inflight) return state.inflight
  const run = scan(ctx, state)
    .then((data) => {
      state.cache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      state.inflight = null
    })
  state.inflight = run
  return run
}

async function scan(ctx, state) {
  const pm = ctx.get('pluginManager')

  let bundles = []
  let bundleError = null
  if (pm) {
    try {
      bundles = await pm.listBundles()
    } catch (error) {
      bundleError = messageOf(error)
    }
  } else {
    bundleError = 'pluginManager service is unavailable'
  }

  // The app feed and the plugin lookups do not depend on each other.
  const [plugins, app, sources] = await Promise.all([
    checkPlugins(pm, bundles).then((rows) => {
      if (bundleError) {
        for (const row of rows) row.error = row.error || bundleError
      }
      return rows
    }),
    checkApp(),
    checkSources(bundles).catch(() => []),
  ])

  state.targets = new Map()
  for (const row of plugins) {
    if (row.target) state.targets.set(row.name, row.target)
  }

  const updatable = plugins.filter((row) => row.updateAvailable).length
  const pending = await readPending()
  return {
    checkedAt: Date.now(),
    app,
    plugins,
    sources,
    pending: { disabled: pending },
    summary: {
      total: plugins.length,
      updatable,
      appUpdate: Boolean(app.updateAvailable),
    },
  }
}

/* ------------------------------------------------------------------ app -- */

async function checkApp() {
  const app = {
    mode: 'web',
    name: 'DeepSeek Harness',
    current: null,
    latest: null,
    channel: null,
    feedUrl: null,
    downloadUrl: null,
    githubUrl: GITHUB_RELEASES,
    updateAvailable: false,
    error: null,
  }

  const resources = findResourcesDir()
  if (!resources) {
    app.error = '未找到桌面版安装目录，跳过应用本体检查'
    return app
  }
  app.mode = 'desktop'

  const pkg = await readJsonFile(path.join(resources, 'app.asar', 'package.json'))
  if (pkg) {
    if (typeof pkg.name === 'string' && pkg.name) app.packageName = pkg.name
    if (typeof pkg.version === 'string' && pkg.version) app.current = pkg.version
    const origin = pkg.dshMandatoryUpdatePolicy && pkg.dshMandatoryUpdatePolicy.origin
    if (typeof origin === 'string' && origin) app.downloadUrl = origin
  }

  const config = await readTextFile(path.join(resources, 'app-update.yml'))
  if (!config) {
    app.error = '未找到 app-update.yml'
    return app
  }
  const parsed = parseSimpleYaml(config)
  const base = parsed.url
  app.channel = parsed.channel || 'latest'
  const feed = feedUrl(base, app.channel)
  app.feedUrl = feed
  if (!feed) {
    app.error = 'app-update.yml 缺少可用的更新源地址'
    return app
  }

  try {
    const response = await fetchWithTimeout(feed, {
      headers: { 'cache-control': 'no-cache' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    const feedData = parseSimpleYaml(text)
    app.latest = typeof feedData.version === 'string' ? feedData.version : null
    app.updateAvailable = Boolean(
      app.current && app.latest && compareVersions(app.latest, app.current) > 0,
    )
    if (!app.latest) app.error = '更新源没有给出 version'
  } catch (error) {
    app.error = `读取更新源失败：${messageOf(error)}`
  }
  return app
}

function findResourcesDir() {
  const candidates = []
  if (process.resourcesPath) candidates.push(process.resourcesPath)
  const exe = process.env.DSH_NODE_EXECUTABLE || process.execPath
  if (exe) {
    const dir = path.dirname(exe)
    candidates.push(path.join(dir, 'resources'))
    candidates.push(path.join(dir, '..', 'Resources'))
  }
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

function feedUrl(base, channel) {
  if (!base) return null
  const name = process.platform === 'darwin'
    ? `${channel}-mac`
    : process.platform === 'linux'
      ? `${channel}-linux`
      : channel
  try {
    return new URL(`${name}.yml`, base.endsWith('/') ? base : `${base}/`).href
  } catch {
    return null
  }
}

/* -------------------------------------------------------------- plugins -- */

async function checkPlugins(pm, bundles) {
  const installed = bundles.filter((bundle) => (
    bundle
    && bundle.availability === 'profile'
    && bundle.installed === true
    && typeof bundle.version === 'string'
    && bundle.version
    && bundle.official !== true
  ))

  const rows = await mapLimit(installed, CONCURRENCY, async (bundle) => {
    const row = {
      name: bundle.name,
      title: bundle.meta && bundle.meta.title ? bundle.meta.title : bundle.name,
      version: bundle.version,
      latest: null,
      kind: bundle.update || 'local',
      source: bundle.source || (bundle.installTarget && bundle.installTarget.spec) || null,
      repo: null,
      enabled: bundle.enabled !== false,
      updateAvailable: false,
      releaseUrl: null,
      homepage: bundle.meta && typeof bundle.meta.homepage === 'string' ? bundle.meta.homepage : null,
      changelog: null,
      error: null,
      notes: [],
      target: null,
    }

    try {
      // A GitHub spec without a pinned commit is classified as "local" by the
      // manager, but it is still a Git install: check its releases like one.
      const looksGit = bundle.update === 'git'
        || /^github:/.test(String(row.source || ''))
        || /github\.com[:/]/.test(String(row.source || ''))
      if (bundle.update === 'registry') {
        await checkRegistry(pm, bundle, row)
      } else if (looksGit) {
        row.kind = 'git'
        await checkGitHub(bundle, row)
      } else {
        await checkLocal(bundle, row)
      }
    } catch (error) {
      row.error = messageOf(error)
    }
    return row
  })

  rows.sort((a, b) => {
    if (a.updateAvailable !== b.updateAvailable) return a.updateAvailable ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return rows
}

async function checkRegistry(pm, bundle, row) {
  if (!pm || typeof pm.listVersions !== 'function') {
    row.error = 'pluginManager.listVersions 不可用'
    return
  }

  // Fast path: if the mirror's dist-tag is not newer than what is installed, there is
  // nothing to resolve, so the slow packument lookup can be skipped entirely.
  const mirror = await mirrorLatest(bundle.name).catch(() => null)
  if (mirror && compareVersions(mirror, bundle.version) <= 0) {
    row.latest = mirror
    return
  }

  const list = await withTimeout(pm.listVersions(bundle.name), REGISTRY_TIMEOUT_MS, '版本检查超时')
  if (list.status === 'listed' && Array.isArray(list.versions) && list.versions.length > 0) {
    const compatible = list.versions.filter((item) => !item.incompatible)
    const newest = compatible[0] || list.versions[0]
    row.latest = newest.version
    row.updateAvailable = compareVersions(newest.version, bundle.version) > 0
    if (newest.incompatible) row.notes.push('新版本与当前 DSH 版本不兼容')
    if (newest.deprecated) row.notes.push(`新版本已标记废弃：${newest.deprecated}`)
    if (row.updateAvailable) row.target = { version: newest.version }
    return
  }
  if (list.status === 'refused') {
    row.error = list.reason || list.problem || '无法读取版本列表'
  }
}

// Local installs (link / file) have no registry and no release feed, so compare
// the source directory itself: its package.json version, and for a Git checkout
// the last commit seen by this plugin.
const LOCAL_STATE_FILE = path.join(homedir(), '.dsh', 'update-center', 'local-state.json')

function sourceToDir(source) {
  const text = String(source || '').trim()
  let rest = null
  if (text.startsWith('link:')) rest = text.slice(5)
  else if (text.startsWith('file:')) rest = text.slice(5)
  else if (path.isAbsolute(text)) rest = text
  if (!rest) return null
  rest = rest.split('#')[0].split('?')[0]
  return path.isAbsolute(rest) ? rest : null
}

async function readLocalState() {
  try {
    const text = await readFile(LOCAL_STATE_FILE, 'utf8')
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeLocalState(name, commit) {
  try {
    await mkdir(path.dirname(LOCAL_STATE_FILE), { recursive: true })
    const state = await readLocalState()
    state[name] = commit
    await writeFile(LOCAL_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    /* best effort */
  }
}

function tgzVersion(file) {
  return new Promise((resolve) => {
    try {
      const child = spawn('tar', ['-xOf', file, 'package/package.json'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      let out = ''
      child.stdout.on('data', (chunk) => {
        out += chunk.toString('utf8')
      })
      child.on('error', () => resolve(null))
      child.on('close', (code) => {
        if (code !== 0 || !out) {
          resolve(null)
          return
        }
        try {
          const pkg = JSON.parse(out)
          resolve(pkg && typeof pkg.version === 'string' ? pkg.version : null)
        } catch {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

function gitOutput(dir, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      let out = ''
      child.stdout.on('data', (chunk) => {
        out += chunk.toString('utf8')
      })
      child.on('error', () => resolve(null))
      child.on('close', (code) => resolve(code === 0 ? out.trim() : null))
    } catch {
      resolve(null)
    }
  })
}

async function checkLocal(bundle, row) {
  const dir = sourceToDir(row.source)
  if (!dir) {
    row.notes.push('本地安装，源路径不可识别')
    return
  }
  if (!existsSync(dir)) {
    row.notes.push('源路径不存在')
    return
  }
  let isDir = false
  try {
    const stat = await statOf(dir)
    isDir = Boolean(stat && stat.isDirectory())
  } catch {
    isDir = false
  }
  if (!isDir) {
    // Tarball install: read its package.json when tar can, and remember the
    // file's size+mtime so a replaced tarball still shows up as an update.
    const sourceVersion = await tgzVersion(dir)
    if (sourceVersion && bundle.version && compareVersions(sourceVersion, bundle.version) > 0) {
      row.latest = sourceVersion
      row.updateAvailable = true
      row.target = { spec: row.source, version: sourceVersion }
      row.notes.push('源压缩包版本更新')
      return
    }
    let fingerprint = null
    try {
      const stat = await statOf(dir)
      fingerprint = `${stat.size}:${Math.round(stat.mtimeMs)}`
    } catch {
      fingerprint = null
    }
    if (!fingerprint) {
      row.notes.push('压缩包安装，无法读取源文件')
      return
    }
    const state = await readLocalState()
    const key = `${bundle.name}:file`
    const seen = state[key]
    if (!seen) {
      await writeLocalState(key, fingerprint)
      row.notes.push('压缩包安装，已记录源文件')
    } else if (seen !== fingerprint) {
      row.updateAvailable = true
      row.latest = sourceVersion || bundle.version
      row.target = { spec: row.source, version: sourceVersion || bundle.version }
      row.notes.push('源压缩包已更新')
    } else {
      row.notes.push('压缩包安装，源文件没有变化')
    }
    return
  }

  const pkg = await readJsonFile(path.join(dir, 'package.json'))
  const sourceVersion = pkg && typeof pkg.version === 'string' ? pkg.version : null
  const isLink = String(row.source || '').startsWith('link:')

  if (sourceVersion && bundle.version && compareVersions(sourceVersion, bundle.version) > 0) {
    row.latest = sourceVersion
    row.updateAvailable = true
    row.target = { spec: row.source, version: sourceVersion }
    row.notes.push('源目录版本更新')
    return
  }

  if (existsSync(path.join(dir, '.git'))) {
    const head = await gitOutput(dir, ['rev-parse', 'HEAD'])
    if (head) {
      row.localCommit = head
      const state = await readLocalState()
      const seen = state[bundle.name]
      if (!seen) {
        await writeLocalState(bundle.name, head)
        row.notes.push('本地 Git 安装，已记录当前提交')
      } else if (seen !== head && !isLink) {
        row.updateAvailable = true
        row.latest = sourceVersion || bundle.version
        row.target = { spec: row.source, version: sourceVersion || bundle.version }
        row.notes.push('源仓库有新提交')
      } else if (seen !== head && isLink) {
        await writeLocalState(bundle.name, head)
        row.notes.push('本地 Git 安装（link），代码实时生效')
      } else {
        row.notes.push('本地 Git 安装，源没有变化')
      }
      return
    }
  }
  row.notes.push(isLink ? '本地 link 安装，代码实时生效' : '本地安装，源版本一致')
}

async function checkGitHub(bundle, row) {
  const source = bundle.source || (bundle.installTarget && bundle.installTarget.spec) || ''
  const repo = parseGitHubRepo(source)
  if (!repo) {
    row.notes.push('无法从安装源识别 GitHub 仓库')
    return
  }
  row.repo = repo
  let latest = null
  try {
    latest = await githubLatest(repo)
  } catch (error) {
    const message = messageOf(error)
    if (/HTTP 40[13]|rate limit/i.test(message)) {
      row.error = 'GitHub 速率限制，配置 GITHUB_TOKEN 可提高上限'
      return
    }
    throw error
  }
  if (!latest) {
    row.notes.push('GitHub 上没有可用的发布版本')
    return
  }
  row.latest = latest.version
  row.releaseUrl = latest.url
  row.changelog = latest.body ? String(latest.body).slice(0, 1200) : null
  row.updateAvailable = compareVersions(latest.version, bundle.version) > 0
  if (row.updateAvailable) {
    // The spec must pin a commit of the installed copy's repository directory,
    // so keep the form the plugin was installed with (github: vs git+https).
    const githubShorthand = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(String(source || ''))
    row.target = {
      version: latest.version,
      spec: githubShorthand
        ? `github:${githubShorthand[1]}/${githubShorthand[2]}#${latest.sha}`
        : `git+https://github.com/${repo}.git#${latest.sha}`,
    }
  }
}

function parseGitHubRepo(source) {
  const text = String(source || '')
  let match = /github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(text)
  if (match) return `${match[1]}/${match[2]}`
  match = /github\.com[:/]([^/\s]+)\/([^/\s#?]+)/.exec(text)
  if (match) return `${match[1]}/${match[2].replace(/\.git$/, '')}`
  return null
}

async function githubLatest(repo) {
  const headers = githubHeaders()
  let tag = null
  let url = null
  let body = null

  let response = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}/releases/latest`, { headers })
  if (response.status === 404) {
    response = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}/tags?per_page=20`, { headers })
    if (!response.ok) throw new Error(`GitHub tags: HTTP ${response.status}`)
    const tags = await response.json()
    const best = pickBestTag(Array.isArray(tags) ? tags : [])
    if (!best) return null
    tag = best
  } else if (response.ok) {
    const release = await response.json()
    if (!release || release.draft || !release.tag_name) return null
    tag = release.tag_name
    url = typeof release.html_url === 'string' ? release.html_url : null
    body = typeof release.body === 'string' ? release.body : null
  } else {
    throw new Error(`GitHub releases: HTTP ${response.status}`)
  }

  const version = tagToVersion(tag)
  if (!version) return null

  const commitResponse = await fetchWithTimeout(
    `${GITHUB_API}/repos/${repo}/commits/${encodeURIComponent(tag)}`,
    { headers },
  )
  if (!commitResponse.ok) throw new Error(`GitHub commit: HTTP ${commitResponse.status}`)
  const commit = await commitResponse.json()
  const sha = commit && typeof commit.sha === 'string' ? commit.sha : null
  if (!sha) return null

  return {
    version,
    tag,
    sha,
    url: url || `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
    body,
  }
}

function pickBestTag(tags) {
  let best = null
  for (const tag of tags) {
    const name = tag && typeof tag.name === 'string' ? tag.name : null
    if (!name) continue
    const version = tagToVersion(name)
    if (!version) continue
    if (!best || compareVersions(version, best.version) > 0) best = { name, version }
  }
  return best ? best.name : null
}

function tagToVersion(tag) {
  const text = String(tag || '').trim().replace(/^v/i, '')
  return parseVersion(text) ? text : null
}

function githubHeaders() {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-concierge',
    'x-github-api-version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || storedToken || ''
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

/* --------------------------------------------------------------- update -- */

async function updateOne(ctx, state, body) {
  const name = body && typeof body.name === 'string' ? body.name : ''
  if (!name) return { ok: false, error: '缺少插件名' }
  if (state.updating.has(name)) {
    return { ok: false, error: `${name} 正在更新，请稍候` }
  }
  state.updating.add(name)
  try {
    return await runUpdate(ctx, state, name)
  } finally {
    state.updating.delete(name)
  }
}

async function runUpdate(ctx, state, name) {
  const pm = ctx.get('pluginManager')
  if (!pm) return { ok: false, error: 'pluginManager 服务不可用' }

  let target = state.targets.get(name)
  if (!target) {
    await getStatus(ctx, state, true)
    target = state.targets.get(name)
  }
  if (!target) return { ok: false, error: `${name} 没有可用的更新` }

  const bundles = await pm.listBundles()
  const bundle = bundles.find((item) => item && item.name === name)
  if (!bundle) return { ok: false, error: `未安装 ${name}` }

  try {
    let result
    if (bundle.update === 'registry') {
      result = await pm.updateBundle(name, target.version)
    } else if (bundle.update === 'git' && target.spec) {
      try {
        result = await pm.updateBundle(name, target.version, { spec: target.spec })
      } catch (error) {
        // A Git install may refuse a foreign spec form; reinstall from the pinned spec.
        const fallback = await reinstallFromSpec(ctx, state, bundle, target.spec, target.version)
        if (fallback.ok) return fallback
        throw error
      }
    } else if (!bundle.update && target.spec) {
      return reinstallFromSpec(ctx, state, bundle, target.spec, target.version)
    } else {
      return { ok: false, error: '该插件不是可更新的安装类型' }
    }
    state.cache = null
    const application = result && result.result ? result.result.application : undefined
    if (application === 'restart-required') await recordPending(name)
    return {
      ok: application !== 'failed' && application !== 'cancelled',
      result,
    }
  } catch (error) {
    state.cache = null
    return { ok: false, error: messageOf(error) }
  }
}

async function reinstallFromSpec(ctx, state, bundle, spec, version) {
  const pm = ctx.get('pluginManager')
  if (!pm) return { ok: false, error: 'pluginManager 服务不可用' }
  try {
    const removed = await pm.removeBundle(bundle.name)
    if (removed && (removed.application === 'failed' || removed.application === 'cancelled')) {
      state.cache = null
      return { ok: false, error: '移除失败' }
    }
    try {
      const result = await pm.installBundle(spec, { expected: { name: bundle.name, version } })
      state.cache = null
      const application = result && result.application
      return { ok: application !== 'failed' && application !== 'cancelled', result }
    } catch (error) {
      // Put the previous copy back so a failed reinstall never leaves a hole.
      const previousSpec = bundle.source || (bundle.installTarget && bundle.installTarget.spec) || null
      if (previousSpec) {
        try {
          await pm.installBundle(previousSpec, { expected: { name: bundle.name, version: bundle.version } })
        } catch {
          /* restore failed; report the original error */
        }
      }
      state.cache = null
      return { ok: false, error: messageOf(error) }
    }
  } catch (error) {
    state.cache = null
    return { ok: false, error: messageOf(error) }
  }
}

/* -------------------------------------------------------------- helpers -- */

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message || 'timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const size = Math.max(1, Math.min(limit, items.length))
  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function parseSimpleYaml(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (!value) continue
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[match[1]] = value
  }
  return out
}

async function readTextFile(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function readJsonFile(file) {
  const text = await readTextFile(file)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined
  return fetch(url, { ...init, signal, redirect: 'follow' })
}

// A dist-tag request is a few hundred bytes; the npm packument is ~150 KB and takes
// seconds. The mirror answers in tens of milliseconds from mainland networks.
async function mirrorLatest(name) {
  const path = String(name || '').replace('/', '%2F')
  const response = await fetchWithTimeout(`${MIRROR_BASE}/${path}/latest`, { headers: { accept: 'application/json' } }, 6000)
  if (!response.ok) return null
  const body = await response.json().catch(() => null)
  return body && typeof body.version === 'string' ? body.version : null
}

function messageOf(error) {
  if (!error) return '未知错误'
  if (typeof error === 'string') return error
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return '请求超时'
  return error.message ? String(error.message) : String(error)
}

function parseVersion(value) {
  const match = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?\s*$/.exec(String(value || ''))
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  }
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return String(left).localeCompare(String(right))
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  const length = Math.max(a.pre.length, b.pre.length)
  for (let i = 0; i < length; i += 1) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (xNumeric) {
      return -1
    } else if (yNumeric) {
      return 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}
