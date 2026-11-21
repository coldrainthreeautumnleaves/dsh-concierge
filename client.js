/**
 * dsh-concierge — Client half.
 * A dashboard-style settings page plus a top notification strip.
 */
window.__ModuleLoader__.load({
  id: 'dsh-concierge',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-concierge'
    const API = '/dsh-concierge'

    // Present only inside the Desktop shell (dsh-app://app); Web has no native updater.
    const DESKTOP_UPDATES = (() => {
      try {
        return window.dshDesktop && window.dshDesktop.updates ? window.dshDesktop.updates : null
      } catch {
        return null
      }
    })()

    function createStore() {
      let state = null
      const listeners = new Set()
      return {
        get: () => state,
        set(next) {
          state = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    const bannerStore = createStore()

    // The Host owns the restart helper now that dsh-desktop-restart is gone.
    async function requestRestart() {
      try {
        const response = await fetch(`${API}/restart`, { method: 'POST' })
        const body = await response.json().catch(() => null)
        if (!response.ok || !body || body.ok === false) {
          return { ok: false, error: body && body.error ? body.error : `HTTP ${response.status}` }
        }
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) }
      }
    }

    /* ---------------------------------------------------------- performance -- */

    const perf = {
      fps: 60,
      refresh: 60,
      refreshOverride: 0,
      history: [],
      peak: 0,
      samples: [],
      rows: 0,
      streaming: false,
      longTasks: 0,
      blocking: 0,
      mode: 'normal',
      auto: true,
      // Off by default: freezing every animation in the chat flow also freezes
      // the thinking/streaming indicators, which reads as "the app is stuck".
      longPref: false,
      forced: false,
      // Off by default: Chromium reports content-visibility repaints and scroll
      // stutter with it, and the chat already virtualizes its rows.
      // Offscreen rows are skipped with content-visibility (the transcript is
      // not virtualized, so this is what keeps layout bounded).
      offscreen: true,
      // Skip offscreen rows only while the sidebar animates its width.
      resizeShield: true,
      // Opt-in: make the sidebar collapse instant instead of animated.
      noAnim: false,
      low: false,
      longActive: false,
      // 玻璃自动降级：帧率掉下来时临时关掉会话区模糊，不是用户的设置。
      glassAuto: false,
    }
    const perfListeners = new Set()
    const perfUpdate = (patch) => {
      Object.assign(perf, patch)
      for (const listener of [...perfListeners]) listener()
    }
    const longTaskLog = []
    // v2: the older key remembered long/offscreen modes that are now opt-in.
    const PERF_STORAGE_KEY = 'dsh-concierge:perf:v2'

    // Only animation timing is touched: changing backdrop-filter or box-shadow
    // repaints the whole chat and reads as a flash, so those are left alone.
    const PERF_CSS = `
html[data-dsh-perf="low"] [data-conversation-region] *,
html[data-dsh-perf="low"] [data-conversation-region] {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
}
html[data-dsh-perf="long"] [data-slot="conversation.chat.flow"] * {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
}
/* The transcript is not virtualized, so every re-render, keystroke, menu open
   or sidebar frame re-lays out the whole conversation. Skipping offscreen rows
   bounds that cost to what is actually on screen. contain-intrinsic-size: auto
   reuses each row's last real height, so the scroll position does not jump. */
html[data-dsh-offscreen="1"] [data-slot="conversation.chat.flow"] > * {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
/* The sidebar animates its width for 0.3s ([data-animating] is the app's own
   marker); the same rule covers it, this keeps it explicit for the no-scan case. */
[data-animating] [data-slot="conversation.chat.flow"] > *,
html[data-dsh-resizing="1"] [data-slot="conversation.chat.flow"] > * {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
/* The sidebar itself is cheap to lay out but expensive to repaint while it
   changes width; isolating it keeps that work off the conversation. */
[data-animating] [data-dsh-sidebar] {
  contain: layout paint;
}
/* dsh-better-sidebar compatibility: its explorer and task lists are not
   virtualized either, so skip offscreen rows there too. It follows the same
   switch as the chat rows, so turning "Skip offscreen rows" off disables this
   as well. The selectors are its own stable attributes, so nothing happens
   when the plugin is not installed. */
html[data-dsh-offscreen="1"] [data-dsh-better-sidebar] [class*="_explorerRow"] {
  content-visibility: auto;
  contain-intrinsic-size: auto 28px;
}
html[data-dsh-offscreen="1"] [data-dsh-better-sidebar] [role="treeitem"] {
  content-visibility: auto;
  contain-intrinsic-size: auto 26px;
}
/* Opt-in: zero out the 0.3s width animation. The collapse then costs exactly
   one reflow instead of ~36, at the price of the sliding motion. */
html[data-dsh-noanim="1"] [data-animating] {
  --ds-transition-duration-slow: 0s !important;
}
`

    // Glass skin: a wallpaper layer behind everything plus backdrop-filter on the
    // surfaces that paint a background. The tokens stay translucent (set through
    // the official theme service), so the frost reads as real depth instead of a
    // flat tint. Inert unless html[data-dsh-glass="1"] is on.
    const LOOK_CSS = `
/* Keep the root OPAQUE. Chromium can only treat the frame as opaque (and let
   Windows composite it without a per-frame blend) when the root background has
   no alpha; a transparent root forces the compositor to blend the page with the
   window surface every frame. The wallpaper layer sits at z-index: -1, i.e.
   above this background, so nothing changes visually. */
html[data-dsh-glass="1"] { background-color: #f0f3fc !important; }
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] { background-color: #151b2b !important; }
html[data-dsh-glass="1"] body { background: transparent !important; }
/* The frost lives on the wallpaper itself: one blurred layer covers every
   translucent surface, instead of paying a backdrop-filter per panel (each one
   reads the pixels behind it and runs a blur kernel, so the cost scales with
   area). Panels only keep a light blur where depth reads best: overlays.
   It is a real element (not body::before) so no ancestor stacking context can
   swallow it. */
#dsh-concierge-glass { display: none; }
html[data-dsh-glass="1"] #dsh-concierge-glass {
  display: block;
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}
/* The wallpaper stays SHARP. Frost comes from each panel blurring what is
   behind it (backdrop-filter); pre-blurring the wallpaper leaves nothing to
   blur, so panels read as tinted boxes instead of glass. */
#dsh-concierge-glass > div:first-child {
  position: absolute;
  inset: 0;
  /* 冷调三团色：蓝 / 淡紫 / 青。底色压到中灰蓝，色块中心是实色——玻璃要「看得出
     在透」，背后必须有明暗和色相，否则半透明面板叠上去只是一片接近白的淡色。 */
  background:
    radial-gradient(900px 700px at 8% 0%, rgba(111, 154, 216, 1) 0%, rgba(111, 154, 216, 0) 60%),
    radial-gradient(820px 640px at 96% 4%, rgba(154, 143, 208, 0.92) 0%, rgba(154, 143, 208, 0) 62%),
    radial-gradient(940px 720px at 80% 104%, rgba(95, 176, 184, 0.95) 0%, rgba(95, 176, 184, 0) 62%),
    linear-gradient(165deg, #dbe4f3 0%, #d5dfef 50%, #d9e9ea 100%);
}
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] #dsh-concierge-glass > div:first-child {
  background:
    radial-gradient(900px 700px at 8% 0%, rgba(46, 74, 118, 1) 0%, rgba(46, 74, 118, 0) 60%),
    radial-gradient(820px 640px at 96% 4%, rgba(74, 62, 118, 0.92) 0%, rgba(74, 62, 118, 0) 62%),
    radial-gradient(940px 720px at 80% 104%, rgba(26, 84, 92, 0.95) 0%, rgba(26, 84, 92, 0) 62%),
    linear-gradient(165deg, #10151d 0%, #121a24 50%, #0c1417 100%);
}
/* Grain: a tiled fractal-noise plate that rides ON the wallpaper layer, behind
   all content. It used to be a fixed overlay at z-index 2 above the page, which
   forces the compositor to re-blend a full-viewport layer on every frame —
   scrolling and streaming text both paid for it. Behind the content it is
   painted once with the wallpaper and costs nothing while you interact.
   The strength is baked into the SVG's own opacity (set by applyGrainImage)
   instead of an opacity property on this element: a fractional opacity would make
   the compositor keep it as its own full-screen layer and re-blend it every frame. */
#dsh-concierge-grain { display: none; }
html[data-dsh-glass="1"] #dsh-concierge-grain {
  display: block;
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-size: 140px 140px;
}
/* 顶部那条 40px（窗口按钮所在的标题栏）：它是外壳的原生 WCO 遮罩，插件只能改它的
   颜色（token → windowsAppearance IPC → setTitleBarOverlay），改不了它是不是盖着页面。
   所以这里做两件事：
   1. token 给一个几乎透明的值——透明通道生效时页面就能透上来，和聊天区一样；
   2. 页面自己在这一条上画磨砂（这一层），tint 对齐聊天区的 bg-base（约 0.36 白），
      这样就算 overlay 完全透明，顶部看起来也还是「一块玻璃」，不是空的。
   参考 dsh-web-bg-2 的结论：顶栏那条属于外壳，页面只能在下面补一层；
   dsh-glass-skin 则干脆改 app.asar 的窗口材质（backgroundMaterial: acrylic）。
   全屏时标题栏高度归零，这条跟着藏起来。 */
#dsh-concierge-top { display: none; }
html[data-dsh-glass="1"] #dsh-concierge-top {
  display: block;
  position: absolute;
  inset: 0 0 auto;
  height: var(--dsh-windows-titlebar-height, 40px);
  pointer-events: none;
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  background: rgba(255, 255, 255, 0.42);
}
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] #dsh-concierge-top {
  background: rgba(21, 27, 43, 0.48);
}
html[data-dsh-glass="1"][data-fullscreen] #dsh-concierge-top { display: none; }
/* 侧边栏：从「压回实色」改成半透明，和聊天区一样透出壁纸。这里**不加**
   backdrop-filter——侧边栏里挂着 fixed 定位的弹层，给容器加 filter 会把它们的
   包含块换成侧边栏，弹层会错位（dsh-glass-skin 的 README 也提到这一点）。
   壁纸是柔和的冷调渐变，不糊也看不出锯齿。 */
html[data-dsh-glass="1"] [class*="_sidebarCol"] {
  background: rgba(245, 247, 252, 0.42) !important;
}
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] [class*="_sidebarCol"] {
  background: rgba(18, 22, 30, 0.52) !important;
}
/* 官方 Windows 布局在内容列左上角留 16px 圆角（--dsh-windows-content-radius），
   壁纸铺满整窗之后，那个圆角会切出一块露壁纸的缺口，看着就是「一块空的」。
   玻璃皮肤下把它归零，内容铺满、不留弧度。 */
html[data-dsh-glass="1"] [class*="_frame"] {
  --dsh-windows-content-radius: 0px !important;
}
html[data-dsh-glass="1"] [class*="_centerCol"] {
  border-radius: 0 !important;
}
/* Real frosted glass: every surface blurs the pixels behind it, then gets the
   rim highlight and shadow that make it read as a pane instead of a tint.
   Only surfaces are listed (not every element): each backdrop-filter samples
   the area behind it, so cost grows with the number of layers. */
/* 会话区不再把 backdrop-filter 挂在元素自己身上：Chromium 里带模糊的元素只要
   自己内部在滚动、在流式更新，就会连同模糊整块重画；把模糊挪到独立的
   ::before 一层（这一层背后只有静态壁纸），它只算一次，上面的文字照常重排。
   同一招（模糊单独成层 + isolation）在 unsloth PR #16942 里把设置面板滚动的
   CPU 压掉了 10–22 倍。 */
html[data-dsh-glass="1"]:not([data-dsh-glass-light="1"]) [data-conversation-region="chat"] {
  isolation: isolate;
}
html[data-dsh-glass="1"]:not([data-dsh-glass-light="1"]) [data-conversation-region="chat"]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  will-change: transform;
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}
/* 视频壁纸每帧都是新画面：会话区那块模糊背后一直在变，等于每帧重算整屏。
   静态壁纸才缓存得住，所以视频模式下这块不模糊——壁纸本身在动，面板半透明
   已经够玻璃感。 */
html[data-dsh-glass="1"][data-dsh-glass-wall="video"] [data-conversation-region="chat"]::before {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* 玻璃自动降级：帧率掉下来时由性能监控临时关掉会话区模糊（不动用户的「轻玻璃」
   设置），回升后自己还原。 */
html[data-dsh-glass="1"][data-dsh-glass-auto="1"] [data-conversation-region="chat"]::before {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* 流式输出期间自动摘掉会话区那块大模糊。实测（2560×1600 / Iris Xe / 120Hz）：
   这块开着流式 90fps，摘掉 117fps——每来一段文字它都跟着重算，约 2.8ms/帧。
   data-dsh-stream 由性能监控维护（停止输出 5 秒后自动恢复），所以只有输出那几秒
   是「半透明、不糊」的，不影响平时的玻璃观感。 */
html[data-dsh-glass="1"][data-dsh-stream="1"] [data-conversation-region="chat"]::before {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* 输入框那一圈不再自己模糊：它里面还压着输入卡自己的 backdrop-filter（走
   --dsw-menu-backdrop-filter），两层叠在「每帧都在动的聊天记录」上——这是全
   界面唯一 blur 背后一直在变的地方。留卡片那一层就够看。 */
html[data-dsh-glass="1"] [role="dialog"],
html[data-dsh-glass="1"] [role="alertdialog"],
html[data-dsh-glass="1"] [role="menu"],
html[data-dsh-glass="1"] [role="listbox"],
html[data-dsh-glass="1"] [role="tooltip"],
html[data-dsh-glass="1"] [data-shell-overlay="true"] [data-slot] > *,
html[data-dsh-glass="1"] [class*="_menu"],
html[data-dsh-glass="1"] [class*="_portal_"],
html[data-dsh-glass="1"] .uc-card,
html[data-dsh-glass="1"] .uc-banner {
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}
/* 设置面板这种大面积浮层多糊一点：背后的色块糊开了，文字才不打架。
   半径别往 26px 堆——采样成本随半径线性涨，14px 已经够糊开色块。 */
html[data-dsh-glass="1"] [role="dialog"],
html[data-dsh-glass="1"] [data-shell-overlay="true"] [data-slot] > * {
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
}
html[data-dsh-glass="1"] [role="dialog"],
html[data-dsh-glass="1"] [role="menu"],
html[data-dsh-glass="1"] [role="listbox"],
html[data-dsh-glass="1"] [role="tooltip"],
html[data-dsh-glass="1"] .uc-card,
html[data-dsh-glass="1"] .uc-banner {
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 10px 30px rgba(10, 15, 30, 0.1);
}
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] [role="dialog"],
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] [role="menu"],
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] [role="listbox"],
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] [role="tooltip"],
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] .uc-card,
html[data-dsh-glass="1"][data-dsh-glass-scheme="dark"] .uc-banner {
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 30px rgba(0, 0, 0, 0.35);
}
`

    function installLookCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-concierge-look-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-concierge-look-css'
      style.textContent = LOOK_CSS
      document.head.appendChild(style)
    }

    // 本地路径走宿主的 /wallpaper 路由（页面是 dsh-app:// 文档，读不了 file://），
    // http(s)/data/blob 直接用。
    function wallpaperUrl(src) {
      const value = String(src || '').trim()
      if (!value) return ''
      if (/^(?:https?:|data:|blob:)/i.test(value)) return value
      return `/dsh-concierge/wallpaper?path=${encodeURIComponent(value)}`
    }

    function applyWallpaper() {
      if (typeof document === 'undefined') return
      const root = document.getElementById('dsh-concierge-glass')
      const media = root && root.firstElementChild
      if (!media) return
      const video = media.querySelector('video')
      if (video) video.remove()
      media.style.backgroundImage = ''
      if (!look.enabled || look.skin !== 'glass') return
      const mode = look.wall && look.wall.mode
      const url = wallpaperUrl(look.wall && look.wall.src)
      if (!url) return
      if (mode === 'image') {
        media.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`
        media.style.backgroundSize = 'cover'
        media.style.backgroundPosition = 'center'
        return
      }
      if (mode === 'video') {
        const node = document.createElement('video')
        node.src = url
        node.autoplay = true
        node.loop = true
        node.muted = true
        node.setAttribute('muted', '')
        node.setAttribute('playsinline', '')
        node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover'
        media.appendChild(node)
      }
    }

    // 壁纸用真元素，不用 body::before：有的容器会建层叠上下文，把 -1 的伪元素
    // 压到看不见的地方。
    function ensureGlassNodes() {
      if (typeof document === 'undefined' || !document.body) return
      let root = document.getElementById('dsh-concierge-glass')
      if (!root) {
        root = document.createElement('div')
        root.id = 'dsh-concierge-glass'
        const media = document.createElement('div')
        root.appendChild(media)
        document.body.appendChild(root)
      }
      // Grain rides inside the wallpaper layer (behind content). Repair it if an
      // older root from a previous load is still around without one.
      if (!root.querySelector('#dsh-concierge-grain')) {
        const grain = document.createElement('div')
        grain.id = 'dsh-concierge-grain'
        root.appendChild(grain)
      }
      // 顶部标题栏那条磨砂：盖在壁纸和颗粒之上，仍在页面内容之下。
      if (!root.querySelector('#dsh-concierge-top')) {
        const top = document.createElement('div')
        top.id = 'dsh-concierge-top'
        root.appendChild(top)
      }
    }

    function applyNoAnim() {
      if (typeof document === 'undefined') return
      if (perf.noAnim) document.documentElement.dataset.dshNoanim = '1'
      else delete document.documentElement.dataset.dshNoanim
    }

    // Pure CSS offscreen skipping: no layout reads, no per-row bookkeeping.
    function applyOffscreen() {
      if (typeof document === 'undefined') return
      if (perf.offscreen) document.documentElement.dataset.dshOffscreen = '1'
      else delete document.documentElement.dataset.dshOffscreen
    }

    function installPerfCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-concierge-perf-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-concierge-perf-css'
      style.textContent = PERF_CSS
      document.head.appendChild(style)
    }

    function readPerfPrefs() {
      try {
        const raw = localStorage.getItem(PERF_STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (typeof parsed.auto === 'boolean') perf.auto = parsed.auto
        if (typeof parsed.long === 'boolean') perf.longPref = parsed.long
        if (typeof parsed.forced === 'boolean') perf.forced = parsed.forced
        if (typeof parsed.offscreen === 'boolean') perf.offscreen = parsed.offscreen
        if (typeof parsed.resizeShield === 'boolean') perf.resizeShield = parsed.resizeShield
        if (typeof parsed.noAnim === 'boolean') perf.noAnim = parsed.noAnim
        if (typeof parsed.refresh === 'number' && Number.isFinite(parsed.refresh)) perf.refreshOverride = parsed.refresh
      } catch {
        /* keep defaults */
      }
    }

    function savePerfPrefs() {
      try {
        localStorage.setItem(PERF_STORAGE_KEY, JSON.stringify({
          auto: perf.auto,
          long: perf.longPref,
          forced: perf.forced,
          offscreen: perf.offscreen,
        resizeShield: perf.resizeShield,
        noAnim: perf.noAnim,
          refresh: perf.refreshOverride,
        }))
      } catch {
        /* storage unavailable */
      }
    }

    function applyPerfStreaming() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (perf.streaming) root.dataset.dshStream = '1'
      else delete root.dataset.dshStream
    }

    // 诊断：把「流式开始/结束」前后的长帧记下来，发给宿主落盘。用来回答
    // 「结束那一刻掉到 60」到底是模糊挂回去的一次大重绘，还是应用自己在收尾。
    const probeLongFrames = []
    const probeEvents = []
    let probeReportTimer = 0

    function probeLongFrame(elapsed) {
      if (!(elapsed >= 40)) return
      probeLongFrames.push({ at: Date.now(), ms: Math.round(elapsed) })
      if (probeLongFrames.length > 40) probeLongFrames.shift()
    }

    function probeEvent(kind) {
      probeEvents.push({ at: Date.now(), kind })
      if (probeEvents.length > 20) probeEvents.shift()
      if (probeReportTimer) clearTimeout(probeReportTimer)
      // 2.5 秒后再发：这样事件之后那几帧也收进来了。
      probeReportTimer = setTimeout(() => {
        probeReportTimer = 0
        if (typeof fetch !== 'function') return
        const payload = {
          at: new Date().toISOString(),
          events: probeEvents.slice(),
          longFrames: probeLongFrames.slice(),
          fps: perf.samples.slice(-8),
          streaming: perf.streaming,
          glassAuto: perf.glassAuto,
          lightGlass: look.lightGlass,
          skin: look.skin,
          enabled: look.enabled,
        }
        fetch(`${API}/perf-report`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {})
      }, 2500)
    }

    function applyPerfMode() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      const mode = perf.forced || perf.low ? 'low' : perf.longActive ? 'long' : ''
      if (mode) root.dataset.dshPerf = mode
      else delete root.dataset.dshPerf
      const next = mode || 'normal'
      if (perf.mode !== next) perfUpdate({ mode: next })
    }

    // 玻璃自动降级只写一个属性，不碰用户的「轻玻璃」设置；关掉外观或换皮肤时由
    // applyLook 清掉。
    function applyGlassAuto() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (perf.glassAuto && look.enabled && look.skin === 'glass') root.dataset.dshGlassAuto = '1'
      else delete root.dataset.dshGlassAuto
    }

    // Sidebar collapse animates the chat column width; during that window only
    // the rows on screen need laying out.
    let resizeShieldInstalled = false
    let resizeShieldTimer = 0

    function installResizeShield() {
      if (resizeShieldInstalled || typeof ResizeObserver !== 'function') return
      resizeShieldInstalled = true
      let lastWidth = 0
      const attach = () => {
        const region = document.querySelector('[data-conversation-region]')
        if (!region) return false
        lastWidth = region.getBoundingClientRect().width
        const observer = new ResizeObserver((entries) => {
          if (!perf.resizeShield) return
          const entry = entries[0]
          const width = entry && entry.contentRect ? entry.contentRect.width : 0
          if (!width || Math.abs(width - lastWidth) < 6) return
          lastWidth = width
          document.documentElement.dataset.dshResizing = '1'
          clearTimeout(resizeShieldTimer)
          resizeShieldTimer = setTimeout(() => {
            delete document.documentElement.dataset.dshResizing
          }, 600)
        })
        observer.observe(region)
        return true
      }
      if (!attach()) {
        const retry = setInterval(() => {
          if (attach()) clearInterval(retry)
        }, 2000)
      }
    }

    function startLongTasks() {
      if (typeof PerformanceObserver === 'undefined') return
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTaskLog.push({ at: Date.now(), d: entry.duration })
        })
        observer.observe({ entryTypes: ['longtask'] })
      } catch {
        /* unsupported */
      }
    }

    // rAF is vsync-locked, so the screen refresh rate is the hard ceiling; track
    // the highest observed second as that ceiling instead of assuming 60.
    const REFRESH_RATES = [60, 75, 90, 100, 120, 144, 165, 240]

    function snapRefresh(fps) {
      let best = 60
      let distance = Infinity
      for (const rate of REFRESH_RATES) {
        const delta = Math.abs(rate - fps)
        if (delta < distance) {
          distance = delta
          best = rate
        }
      }
      return distance <= 10 ? best : Math.max(60, Math.round(fps / 10) * 10)
    }

    function startPerfMonitor() {
      if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return
      let frames = 0
      let last = performance.now()
      let lowFor = 0
      let goodFor = 0
      // 玻璃自动降级的独立计数与冷却，和上面的精简模式互不影响。
      let glassLowFor = 0
      let glassGoodFor = 0
      let lastGlassAt = 0
      // Flipping the lite mode rewrites animations, shadows and backdrop blur,
      // which reads as a blink: never change it more than once every 15 seconds.
      let lastModeAt = 0
      let streamingSince = 0
      let prevFrameAt = 0
      const tick = (now) => {
        frames += 1
        if (prevFrameAt) probeLongFrame(now - prevFrameAt)
        prevFrameAt = now
        const elapsed = now - last
        if (elapsed >= 1000) {
          const fps = Math.round((frames * 1000) / elapsed)
          frames = 0
          last = now
          if (perf.refreshOverride === 0 && fps > perf.refresh) {
            const next = snapRefresh(fps)
            if (next > perf.refresh) perfUpdate({ refresh: next })
          }
          const effectiveRefresh = perf.refreshOverride > 0 ? perf.refreshOverride : perf.refresh
          const samples = perf.samples.length >= 5 ? perf.samples.slice(-4) : perf.samples.slice()
          samples.push(fps)
          const average = Math.min(effectiveRefresh, Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length))
          // Only really bad frame rates should flip the mode; at 75% of a 120Hz
          // panel normal streaming kept crossing the line and the chat flashed.
          const lowThreshold = Math.max(30, Math.round(effectiveRefresh * 0.5))
          const goodThreshold = Math.max(lowThreshold + 5, Math.round(effectiveRefresh * 0.65))
          let low = perf.low
          if (perf.auto) {
            if (average < lowThreshold) {
              lowFor += 1
              goodFor = 0
            } else if (average > goodThreshold) {
              goodFor += 1
              lowFor = 0
            } else {
              lowFor = 0
              goodFor = 0
            }
            if (lowFor >= 3) low = true
            if (goodFor >= 5) low = false
          } else {
            low = false
          }
          if (low !== perf.low) {
            if (now - lastModeAt < 15000) low = perf.low
            else lastModeAt = now
          }
          // 玻璃自动降级：120Hz 屏掉到 90 帧人已经能感觉到，但上面那条 50% 的阈值
          // 不会触发。单独给玻璃一条更敏感的线：低于刷新率 75% 连续 2 秒就关掉会话区
          // 模糊，回到 90% 连续 5 秒恢复；两次切换至少隔 20 秒，避免来回闪。
          let glassAuto = false
          if (perf.auto && look.skin === 'glass' && look.enabled) {
            glassAuto = perf.glassAuto
            const glassLow = Math.max(45, Math.round(effectiveRefresh * 0.75))
            const glassGood = Math.max(glassLow + 5, Math.round(effectiveRefresh * 0.9))
            if (average < glassLow) {
              glassLowFor += 1
              glassGoodFor = 0
            } else if (average > glassGood) {
              glassGoodFor += 1
              glassLowFor = 0
            } else {
              glassLowFor = 0
              glassGoodFor = 0
            }
            let next = glassAuto
            if (glassLowFor >= 2) next = true
            if (glassGoodFor >= 5) next = false
            if (next !== glassAuto && now - lastGlassAt >= 20000) {
              lastGlassAt = now
              glassAuto = next
            }
          }
          perfUpdate({ fps: average, samples, low, glassAuto })
          applyPerfMode()
          applyGlassAuto()
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      setInterval(() => {
        let rows = 0
        let streaming = false
        try {
          rows = document.querySelectorAll('[data-slot="conversation.chat.flow"] > *').length
          streaming = document.querySelector('[data-conversation-region] [data-phase="active"]') !== null
        } catch {
          rows = 0
          streaming = false
        }
        const nowMs = Date.now()
        // Keep the streaming flag for a few seconds after the last detection so
        // a pause between tokens does not toggle the chat backdrop on and off.
        if (streaming) streamingSince = nowMs
        const stickyStreaming = streaming || (streamingSince > 0 && nowMs - streamingSince <= 5000)
        if (stickyStreaming !== perf.streaming) probeEvent(stickyStreaming ? 'stream-start' : 'stream-end')
        const cutoff = nowMs - 10000
        while (longTaskLog.length > 0 && longTaskLog[0].at < cutoff) longTaskLog.shift()
        const blocking = Math.round(longTaskLog.reduce((sum, entry) => sum + entry.d, 0))
        const history = perf.history.length >= 40 ? perf.history.slice(-39) : perf.history.slice()
        history.push({ count: longTaskLog.length, ms: blocking })
        // Peak over the visible window only: a sticky maximum kept showing the
        // startup spike forever, which read as "the peak is always huge".
        const peak = history.reduce((max, item) => Math.max(max, item.ms), 0)
        // Hysteresis on the long-chat mode too: enter above 60 rows, leave below
        // 50, so a conversation hovering at the threshold does not flicker.
        const nextLong = perf.longPref ? (perf.longActive ? rows > 50 : rows > 60) : false
        perfUpdate({
          rows,
          streaming: stickyStreaming,
          longActive: nextLong,
          longTasks: longTaskLog.length,
          blocking,
          history,
          peak,
        })
        applyPerfStreaming()
        applyPerfMode()
      }, 2000)
    }

    function settingRow(title, hint, control) {
      return h('div', { className: 'uc-row-setting' },
        h('div', { className: 'uc-row-text' },
          h('div', { className: 'uc-row-title' }, title),
          hint ? h('div', { className: 'uc-row-hint' }, hint) : null,
        ),
        h('div', { className: 'uc-row-control' }, control),
      )
    }

    function switchControl(checked, onChange) {
      return h('label', { className: 'uc-switch' },
        h('input', { type: 'checkbox', checked, onChange }),
        h('span', { className: 'uc-switch-track' }),
      )
    }

    function perfChip(t, labelKey, checked, onChange) {
      return h('button', {
        type: 'button',
        className: checked ? 'uc-chip-toggle uc-chip-toggle-on' : 'uc-chip-toggle',
        'aria-pressed': checked ? 'true' : 'false',
        onClick: onChange,
      },
        h('span', { className: 'uc-chip-dot' }),
        t(labelKey),
      )
    }

    /* ------------------------------------------------------------ typewriter -- */

    // Off by default: revealing Markdown character by character re-renders the
    // message about 20 times a second, which reads as flicker on some layouts.
    // The throttle stays on: it batches the app's per-token renders into one
    // commit every 80ms, which is what actually stops the streaming flicker.
    // 33ms still batches the app's per-token renders without the text arriving
    // in visible chunks the way 80ms did.
    const typer = { enabled: false, speed: 60, throttle: true, throttleMs: 33 }
    const typerListeners = new Set()
    const TYPER_STORAGE_KEY = 'dsh-concierge:typer'
    const typerUpdate = () => {
      for (const listener of [...typerListeners]) listener()
    }

    function readTyperPrefs() {
      try {
        const raw = localStorage.getItem(TYPER_STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (typeof parsed.enabled === 'boolean') typer.enabled = parsed.enabled
        if (typeof parsed.throttle === 'boolean') typer.throttle = parsed.throttle
        if (typeof parsed.speed === 'number' && Number.isFinite(parsed.speed)) {
          typer.speed = Math.max(10, Math.min(240, Math.round(parsed.speed)))
        }
      } catch {
        /* keep defaults */
      }
    }

    function saveTyperPrefs() {
      try {
        localStorage.setItem(TYPER_STORAGE_KEY, JSON.stringify({ enabled: typer.enabled, speed: typer.speed, throttle: typer.throttle }))
      } catch {
        /* storage unavailable */
      }
    }

    /* ------------------------------------------------------------ appearance -- */

    // 走官方主题服务（ctx.get('theme').overrideTokens），不是往页面里注 CSS：
    // 官方要求每个 token 给 { light, dark } 一对，深浅色切换自动跟随，
    // DSH 升级也不会失效。
    const LOOK_STORAGE_KEY = 'dsh-concierge:look'
    const look = {
      enabled: false,
      skin: 'soft',
      brand: 'default',
      preference: 'system',
      fontStep: 0,
      codeFont: 'default',
      grain: 0.06,
      // 0 = 最实，100 = 最透；玻璃皮肤用它整体缩放各表面的 alpha
      transparency: 43,
      // 轻玻璃：会话区整块不模糊，只留浮层。流式输出时不再整块重糊。
      lightGlass: false,
      // 窗口外框直角：走宿主侧的 DWM 调用，和构造参数无关。
      squareWindow: true,
      // 背景：预设渐变 / 图片 / 视频（Wallpaper Engine 导出的 mp4/webm 走视频）
      wall: { mode: 'preset', src: '' },
    }
    const LOOK_WALL_MODES = ['preset', 'image', 'video']
    const LOOK_PREFERENCES = ['system', 'light', 'dark']
    const LOOK_FONT_STEPS = [-1, 0, 1]
    const LOOK_CODE_FONTS = {
      default: null,
      consolas: "'Cascadia Code', Consolas, 'Courier New', monospace",
      jetbrains: "'JetBrains Mono', Consolas, monospace",
      fira: "'Fira Code', Consolas, monospace",
    }
    let lookAppliedFontStep = 0
    let lookOriginalCodeFont = null
    const lookListeners = new Set()
    const lookUpdate = () => {
      for (const listener of [...lookListeners]) listener()
    }

    const LOOK_BRANDS = {
      default: null,
      indigo: { light: '#4f6ef7', dark: '#8ba4ff' },
      violet: { light: '#8b5cf6', dark: '#b79bff' },
      green: { light: '#16a34a', dark: '#4ade80' },
      amber: { light: '#d97706', dark: '#fbbf24' },
    }

    const BRAND_TOKEN_NAMES = [
      '--dsw-alias-brand-primary',
      '--dsw-alias-brand-text',
      '--dsw-alias-button-primary-fill',
      '--dsw-alias-state-business-primary',
    ]

    // 玻璃皮肤要把**所有**画背景的 token 都变半透明，否则总有一块地方是实心的。
    // 官方一共 65 个背景类 token，这里覆盖真正承载表面的那些：底色、层级、
    // 卡片、菜单、悬浮卡、提示、输入框、侧边栏、工具条、边框。
    function glassTokens(transparency = look.transparency) {
      const pair = (light, dark) => ({ light, dark })
      // transparency 0 → ×1.8（更实），100 → ×0.4（更透）
      const factor = 1.8 - (Math.max(0, Math.min(100, transparency)) / 100) * 1.4
      const scale = (alpha) => Math.max(0.04, Math.min(1, alpha * factor)).toFixed(3)
      const fill = (lightAlpha, darkAlpha) => pair(
        `rgba(255, 255, 255, ${scale(lightAlpha)})`,
        `rgba(20, 24, 32, ${scale(darkAlpha)})`,
      )
      return {
        '--dsw-alias-bg-base': fill(0.3, 0.32),
        '--dsw-alias-bg-layer-1': fill(0.5, 0.52),
        // 设置面板用的就是 layer-2，太薄了字会糊在壁纸上，这里给足不透明度
        '--dsw-alias-bg-layer-2': fill(0.62, 0.66),
        '--dsw-alias-bg-layer-3': fill(0.55, 0.6),
        '--dsw-alias-bg-overlay': fill(0.55, 0.6),
        '--dsw-alias-bg-mask-1': fill(0.2, 0.3),
        '--dsw-alias-bg-mask-2': fill(0.28, 0.38),
        '--dsw-alias-bg-mask-3': fill(0.36, 0.46),
        '--dsw-alias-card-fill': fill(0.34, 0.38),
        '--dsw-alias-card-fill-hover': fill(0.44, 0.48),
        '--dsw-alias-card-tile-fill': fill(0.3, 0.34),
        '--dsw-alias-settings-card-fill': fill(0.7, 0.72),
        '--dsw-alias-settings-card-stroke': pair('rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.12)'),
        '--dsw-alias-onboarding-card-fill': fill(0.34, 0.38),
        '--dsw-alias-onboarding-secondary-fill': fill(0.28, 0.32),
        '--dsw-menu-surface-fill': fill(0.52, 0.58),
        '--dsw-specific-menu': fill(0.52, 0.58),
        '--dsw-alias-menu-group-header-fill': fill(0.26, 0.3),
        '--dsw-alias-hovercard-bg': fill(0.56, 0.62),
        // 悬浮卡（会话卡片那种）有自己的 label token，默认是给「深底卡片」准备的
        // 近白色。底被改成半透明白之后，字就白压白了——这里跟着改成正文那组深色。
        '--dsw-alias-hovercard-label-primary': pair('#1a1d23', '#e8ebf1'),
        '--dsw-alias-hovercard-label-secondary': pair('#5d6470', '#9aa3b2'),
        '--dsw-alias-hovercard-label-tertiary': pair('#6f7683', '#8b93a3'),
        // toast / tooltip 是「深底白字」：它们的 label token 是白/近白，把底也改成
        // 半透明白，字就彻底看不见了。这两样保持深色、只把 alpha 降一点，玻璃感靠
        // 背后的壁纸透出来，字还是白的。
        '--dsw-alias-toast-bg': pair('rgba(22, 26, 34, 0.82)', 'rgba(30, 34, 42, 0.86)'),
        '--dsw-alias-tooltip-bg': pair('rgba(22, 26, 34, 0.86)', 'rgba(34, 38, 46, 0.88)'),
        '--dsw-alias-tooltip-key-bg': pair('rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.14)'),
        '--dsw-specific-input-major': fill(0.42, 0.46),
        '--dsw-specific-login-input': fill(0.42, 0.46),
        // 标题栏那条是 Windows 原生 WCO 画的，颜色来自 preload 探针读的这个 token。
        // 关键是 alpha 要「几乎 0 但不是 0」：完全 0 会被 Electron 当成没设，回退成
        // 窗口底色（#53004）；而 alpha 只要 < 1，WCO 的图层就不是不透明，#38693 之后
        // 页面就能透上来。1/255 在肉眼上看不见，却刚好落在这个区间里。
        // 侧边栏另用 `[class*="_sidebarCol"]` 的规则给一档半透明，不跟着一起空掉。
        '--dsw-specific-sidebar-fill': pair('rgba(240, 243, 252, 0.004)', 'rgba(21, 27, 43, 0.004)'),
        '--dsw-specific-sidebar-glass-fill': pair('#f0f3fc', '#151b2b'),
        '--dsw-specific-sidebar-glass-collapsed-fill': pair('#f0f3fc', '#151b2b'),
        '--dsw-alias-button-elevated-fill': fill(0.36, 0.4),
        '--dsw-alias-button-floating-fill': fill(0.44, 0.48),
        '--dsw-alias-button-tool-bar-fill': fill(0.3, 0.34),
        '--dsw-alias-turn-trigger-bg': fill(0.34, 0.38),
        '--dsw-alias-turn-trigger-bg-hover': fill(0.46, 0.5),
        '--dsw-alias-interactive-bg-hover': fill(0.24, 0.28),
        // 菜单 / 输入卡 / 弹层都吃这个 token。原来是 20px：这些面里输入卡是压在
        // 聊天记录上的，背后每帧都在变，模糊半径越大每帧越贵；12px 在浅色壁纸上
        // 已经够糊开色块。
        '--dsw-menu-backdrop-filter': pair('blur(12px) saturate(150%)', 'blur(12px) saturate(150%)'),
        '--dsw-alias-border-l1': pair('rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.12)'),
        '--dsw-alias-border-l2': pair('rgba(120, 130, 150, 0.18)', 'rgba(255, 255, 255, 0.18)'),
        '--dsw-alias-label-primary': pair('#1a1d23', '#e8ebf1'),
        '--dsw-alias-label-secondary': pair('#5d6470', '#9aa3b2'),
        '--dsw-radius-md': pair('14px', '14px'),
        '--dsw-radius-lg': pair('18px', '18px'),
        '--dsw-radius-panel': pair('18px', '18px'),
      }
    }

    // 每套皮肤是一组官方 token 覆盖，浅色/深色各一份。
    const LOOK_SKINS = {
      soft: {
        tokens: {
          '--dsw-specific-sidebar-fill': { light: '#f4f6fb', dark: '#161a21' },
          '--dsw-alias-bg-base': { light: '#fbfcfe', dark: '#0e1116' },
          '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#171b22' },
          '--dsw-alias-bg-layer-2': { light: '#f1f3f8', dark: '#20252e' },
          '--dsw-alias-border-l1': { light: '#e6e9f0', dark: '#2a3039' },
          '--dsw-alias-border-l2': { light: '#d9dee8', dark: '#343b46' },
          '--dsw-alias-label-primary': { light: '#1a1d23', dark: '#e8ebf1' },
          '--dsw-alias-label-secondary': { light: '#6b7280', dark: '#9aa3b2' },
          '--dsw-radius-md': { light: '12px', dark: '12px' },
          '--dsw-radius-lg': { light: '16px', dark: '16px' },
          '--dsw-radius-panel': { light: '16px', dark: '16px' },
        },
      },
      ink: {
        tokens: {
          '--dsw-specific-sidebar-fill': { light: '#eef0f4', dark: '#0f1216' },
          '--dsw-alias-bg-base': { light: '#f7f8fa', dark: '#0b0d10' },
          '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#14171c' },
          '--dsw-alias-bg-layer-2': { light: '#eceef2', dark: '#1b1f26' },
          '--dsw-alias-border-l1': { light: '#dfe3e9', dark: '#262b33' },
          '--dsw-alias-border-l2': { light: '#cfd5de', dark: '#333a44' },
          '--dsw-alias-label-primary': { light: '#111418', dark: '#eef1f5' },
          '--dsw-alias-label-secondary': { light: '#5f6772', dark: '#98a1ad' },
          '--dsw-radius-md': { light: '10px', dark: '10px' },
          '--dsw-radius-lg': { light: '14px', dark: '14px' },
          '--dsw-radius-panel': { light: '14px', dark: '14px' },
        },
      },
      glass: { tokens: glassTokens() },
      ocean: {
        tokens: {
          '--dsw-specific-sidebar-fill': { light: '#eaf3fb', dark: '#0d1822' },
          '--dsw-alias-bg-base': { light: '#f7fbff', dark: '#0a1218' },
          '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#101c26' },
          '--dsw-alias-bg-layer-2': { light: '#e9f2fa', dark: '#15242f' },
          '--dsw-alias-border-l1': { light: '#dceaf5', dark: '#1e3140' },
          '--dsw-alias-border-l2': { light: '#c9dcea', dark: '#294256' },
          '--dsw-alias-label-primary': { light: '#12222e', dark: '#e6f1f8' },
          '--dsw-alias-label-secondary': { light: '#5b7286', dark: '#93aebf' },
          '--dsw-radius-md': { light: '12px', dark: '12px' },
          '--dsw-radius-lg': { light: '16px', dark: '16px' },
          '--dsw-radius-panel': { light: '16px', dark: '16px' },
        },
      },
    }

    let lookCtx = null
    let lookDispose = null

    function readLookPrefs() {
      try {
        const raw = localStorage.getItem(LOOK_STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (typeof parsed.enabled === 'boolean') look.enabled = parsed.enabled
        if (typeof parsed.skin === 'string' && parsed.skin in LOOK_SKINS) look.skin = parsed.skin
        if (typeof parsed.brand === 'string' && parsed.brand in LOOK_BRANDS) look.brand = parsed.brand
        if (typeof parsed.preference === 'string' && LOOK_PREFERENCES.includes(parsed.preference)) look.preference = parsed.preference
        if (LOOK_FONT_STEPS.includes(parsed.fontStep)) look.fontStep = parsed.fontStep
        if (typeof parsed.codeFont === 'string' && parsed.codeFont in LOOK_CODE_FONTS) look.codeFont = parsed.codeFont
        if (typeof parsed.grain === 'number' && Number.isFinite(parsed.grain)) {
          look.grain = Math.max(0, Math.min(0.2, parsed.grain))
        }
        if (typeof parsed.transparency === 'number' && Number.isFinite(parsed.transparency)) {
          look.transparency = Math.max(0, Math.min(100, Math.round(parsed.transparency)))
        }
        if (typeof parsed.lightGlass === 'boolean') look.lightGlass = parsed.lightGlass
        if (typeof parsed.squareWindow === 'boolean') look.squareWindow = parsed.squareWindow
        if (parsed.wall && typeof parsed.wall === 'object') {
          const mode = typeof parsed.wall.mode === 'string' && LOOK_WALL_MODES.includes(parsed.wall.mode) ? parsed.wall.mode : 'preset'
          const src = typeof parsed.wall.src === 'string' ? parsed.wall.src : ''
          look.wall = { mode, src }
        }
      } catch {
        /* keep defaults */
      }
    }

    // 拖滑杆时每次 onChange 都走 applyLook 会重新 overrideTokens（整棵主题树
    // 重新发布 + 全页重渲染），手感就是一顿一顿的。这里只改那个 CSS 变量，
    // 存储和界面刷新合并到拖完之后。
    let lookSaveTimer = null

    function scheduleLookSave() {
      if (lookSaveTimer !== null) clearTimeout(lookSaveTimer)
      lookSaveTimer = setTimeout(() => {
        lookSaveTimer = null
        saveLookPrefs()
        lookUpdate()
      }, 220)
    }

    // 透明度和颗粒不同：它改的是 token，必须重新 overrideTokens，所以拖的时候
    // 用短防抖，松手就停。
    let lookApplyTimer = null

    function scheduleLookApply() {
      if (lookApplyTimer !== null) clearTimeout(lookApplyTimer)
      lookApplyTimer = setTimeout(() => {
        lookApplyTimer = null
        applyLook()
        lookUpdate()
      }, 140)
    }

    // 颗粒强度写进 SVG 自己的 opacity：元素上不挂 opacity，合成器就不会把它单独
    // 提成一层、每帧再和壁纸混一次。
    function grainImage(value) {
      const alpha = Math.max(0, Math.min(0.2, value))
      if (alpha <= 0) return ''
      return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='${alpha}'/%3E%3C/svg%3E")`
    }

    function applyGrainImage() {
      if (typeof document === 'undefined') return
      const node = document.getElementById('dsh-concierge-grain')
      if (!node) return
      node.style.backgroundImage = look.skin === 'glass' && look.enabled ? grainImage(look.grain) : ''
    }

    function applyGrain(value) {
      const next = Math.max(0, Math.min(0.2, value))
      look.grain = next
      applyGrainImage()
    }

    function saveLookPrefs() {
      try {
        localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify({
          enabled: look.enabled,
          skin: look.skin,
          brand: look.brand,
          transparency: look.transparency,
          wall: look.wall,
          preference: look.preference,
          fontStep: look.fontStep,
          codeFont: look.codeFont,
          grain: look.grain,
          lightGlass: look.lightGlass,
          squareWindow: look.squareWindow,
        }))
      } catch {
        /* storage unavailable */
      }
    }

    function themeService() {
      if (!lookCtx || typeof lookCtx.get !== 'function') return null
      try {
        const theme = lookCtx.get('theme')
        return theme && typeof theme.overrideTokens === 'function' ? theme : null
      } catch {
        return null
      }
    }

    // 官方主题服务的其余接口：setTheme / adjustFontSizes / setFontFamily。
    function applyThemePreference() {
      const theme = themeService()
      if (!theme || typeof theme.setTheme !== 'function') return
      try {
        theme.setTheme(look.preference)
      } catch {
        /* id rejected: keep current */
      }
    }

    function applyFontStep() {
      const theme = themeService()
      if (!theme || typeof theme.adjustFontSizes !== 'function') return
      const delta = look.fontStep - lookAppliedFontStep
      if (!delta) return
      try {
        theme.adjustFontSizes(delta)
        lookAppliedFontStep = look.fontStep
      } catch {
        /* ignore */
      }
    }

    function applyCodeFont() {
      const theme = themeService()
      if (!theme || typeof theme.setFontFamily !== 'function') return
      if (lookOriginalCodeFont === null) {
        try {
          const snapshot = typeof theme.getTheme === 'function' ? theme.getTheme() : null
          const families = snapshot && snapshot.fontFamilies
          if (families && typeof families.code === 'string') lookOriginalCodeFont = families.code
        } catch {
          /* ignore */
        }
      }
      const family = LOOK_CODE_FONTS[look.codeFont] ?? lookOriginalCodeFont
      if (!family) return
      try {
        theme.setFontFamily('code', family)
      } catch {
        /* ignore */
      }
    }

    // 窗口外框圆角由系统 DWM 画：客户端改不了，交给宿主侧调 DwmSetWindowAttribute。
    // 只在值变化时发一次；失败就清掉记录，下次 applyLook 再试。
    let appliedSquareWindow = null

    function applyWindowCorners(force = false) {
      if (typeof fetch !== 'function') return
      if (!look.enabled || look.skin !== 'glass') return
      if (!force && appliedSquareWindow === look.squareWindow) return
      appliedSquareWindow = look.squareWindow
      fetch(`${API}/window-corners`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ square: look.squareWindow }),
      })
        .then((response) => response.json())
        .then((body) => {
          if (!body || body.ok !== true) appliedSquareWindow = null
        })
        .catch(() => { appliedSquareWindow = null })
    }

    function applyLook() {
      if (lookDispose) {
        try {
          lookDispose()
        } catch {
          /* already gone */
        }
        lookDispose = null
      }
      const root = typeof document === 'undefined' ? null : document.documentElement
      // 关掉外观 / 换回非玻璃皮肤时，壁纸层和这些属性都要收干净：漏掉
      // data-dsh-glass 会话区虽然看不见了，`blur(14px)` 还在跑，壁纸层也一直挂着。
      // 所以清理放在所有 early return 之前。
      const clearGlassLayer = () => {
        if (!root) return
        delete root.dataset.dshGlass
        delete root.dataset.dshGlassLight
        delete root.dataset.dshGlassScheme
        delete root.dataset.dshGlassWall
        delete root.dataset.dshGlassAuto
        if (perf.glassAuto) perfUpdate({ glassAuto: false })
        applyGrainImage()
      }
      if (!look.enabled || !lookCtx) {
        clearGlassLayer()
        return
      }
      const theme = themeService()
      if (!theme) {
        clearGlassLayer()
        return
      }
      applyThemePreference()
      applyFontStep()
      applyCodeFont()
      const skin = look.skin === 'glass' ? { tokens: glassTokens() } : LOOK_SKINS[look.skin]
      if (!skin) {
        clearGlassLayer()
        return
      }
      const tokens = { ...skin.tokens }
      const brand = LOOK_BRANDS[look.brand]
      if (brand) for (const name of BRAND_TOKEN_NAMES) tokens[name] = brand
      try {
        lookDispose = theme.overrideTokens('dsh-concierge', tokens)
      } catch {
        lookDispose = null
      }
      // 玻璃皮肤额外挂一层壁纸 + backdrop-filter（纯 CSS，不进官方样式）
      if (look.skin === 'glass' && root) {
        root.dataset.dshGlass = '1'
        // 轻玻璃：只关会话区那一条 blur，浮层不动（规则在 LOOK_CSS 里）。
        if (look.lightGlass) root.dataset.dshGlassLight = '1'
        else delete root.dataset.dshGlassLight
        // 视频壁纸每帧都在变，会话区那块模糊会被逐帧重算，CSS 里按这个属性关掉。
        root.dataset.dshGlassWall = (look.wall && look.wall.mode) || 'preset'
        applyGrainImage()
        applyWindowCorners()
        applyGlassAuto()
        syncGlassScheme()
      } else {
        clearGlassLayer()
      }
      applyWallpaper()
    }

    function syncGlassScheme() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (look.skin !== 'glass' || !look.enabled) {
        delete root.dataset.dshGlassScheme
        return
      }
      const theme = themeService()
      let scheme = 'light'
      try {
        const snapshot = theme && typeof theme.getTheme === 'function' ? theme.getTheme() : null
        const active = snapshot && snapshot.active
        if (active && (active.colorScheme === 'dark' || active.id === 'dark')) scheme = 'dark'
      } catch {
        /* ignore */
      }
      root.dataset.dshGlassScheme = scheme
    }

    function useTypewriter(text, active, speed) {
      const initial = typeof text === 'string' ? text.length : 0
      const [shown, setShown] = React.useState(initial)
      const ref = React.useRef({ shown: initial, acc: 0, last: 0, emit: 0, text })

      React.useEffect(() => {
        const state = ref.current
        if (state.text !== text) {
          // Keep the reveal monotonic: clamp when the text shrinks, and only
          // restart when the block itself was replaced. Resetting to zero on
          // every shrink makes the message blink while it streams.
          const previous = typeof state.text === 'string' ? state.text : ''
          const sameBlock = previous.startsWith(text) || text.startsWith(previous)
          if (!sameBlock) state.shown = 0
          else if (text.length < state.shown) state.shown = text.length
          state.text = text
        }
        if (!active) {
          if (state.shown !== text.length) {
            state.shown = text.length
            setShown(text.length)
          }
          return undefined
        }
        let raf = 0
        const tick = (now) => {
          const current = ref.current
          if (!current.last) current.last = now
          const dt = Math.min(0.1, (now - current.last) / 1000)
          current.last = now
          if (current.shown < text.length) {
            current.acc += dt * speed
            const step = Math.floor(current.acc)
            if (step > 0) {
              current.acc -= step
              current.shown = Math.min(text.length, current.shown + step)
              if (now - current.emit >= 60) {
                current.emit = now
                setShown(current.shown)
              }
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
      }, [text, active, speed])

      return Math.min(shown, text.length)
    }

    function streamingTextIndex(blocks) {
      if (!Array.isArray(blocks)) return -1
      for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index]
        if (block && block.kind === 'text') return index
      }
      return -1
    }

    function makeTypewriterWrapper(inner) {
      const MemoInner = typeof React.memo === 'function' ? React.memo(inner) : inner

      function TypewriterAssistant(props) {
        const node = props && props.node
        const data = node && node.data
        const blocks = data && Array.isArray(data.blocks) ? data.blocks : null
        const running = Boolean(data && data.status === 'running')
        const index = blocks ? streamingTextIndex(blocks) : -1
        const target = index >= 0 && blocks[index] && typeof blocks[index].text === 'string' ? blocks[index].text : ''
        const lowPerf = typeof document !== 'undefined' && document.documentElement.dataset.dshPerf === 'low'
        const active = typer.enabled && running && index >= 0 && target.length > 0 && !lowPerf
        const shown = useTypewriter(target, active, typer.speed)
        const gate = React.useRef({ props: null, at: 0 })

        let nextProps = props
        if (active && shown < target.length) {
          const nextBlocks = blocks.slice()
          nextBlocks[index] = { ...blocks[index], text: target.slice(0, shown) }
          nextProps = { ...props, node: { ...node, data: { ...data, blocks: nextBlocks } } }
        }

        // Batch the app's per-token renders into one commit per interval: a
        // markdown block re-parsed 30 times a second is what reads as flicker.
        const throttling = running && typer.throttle && !lowPerf
        if (active || throttling) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
          const state = gate.current
          const interval = active ? 50 : typer.throttleMs
          if (state.props !== null && now - state.at < interval) return h(MemoInner, state.props)
          state.props = nextProps
          state.at = now
        } else {
          gate.current.props = null
        }
        return h(MemoInner, nextProps)
      }
      TypewriterAssistant.__dshTypewriter = true
      return TypewriterAssistant
    }

    function wrapAssistantTypewriter(ctx, restores) {
      const slots = ctx.slots
      if (!slots || typeof slots.entries !== 'function') return
      let entries = []
      try {
        entries = [...slots.entries('conversation.chat.node')]
      } catch {
        return
      }
      for (const entry of entries) {
        if (!entry || !entry.options || entry.options.key !== 'assistant-step') continue
        const current = entry.component
        if (current === undefined || current === null) continue
        if (current.__dshTypewriter === true) continue
        const wrapped = makeTypewriterWrapper(current)
        entry.component = wrapped
        restores.push(() => {
          if (entry.component === wrapped) entry.component = current
        })
      }
    }

    /* ------------------------------------------------------- ignore / diag -- */

    const IGNORE_KEY = 'dsh-concierge:ignore'
    const ignoreMap = {}
    const ignoreListeners = new Set()
    const ignoreUpdate = () => {
      for (const listener of [...ignoreListeners]) listener()
    }

    function readIgnore() {
      try {
        const raw = localStorage.getItem(IGNORE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') ignoreMap[key] = value
          }
        }
      } catch {
        /* keep empty */
      }
    }

    function saveIgnore() {
      try {
        localStorage.setItem(IGNORE_KEY, JSON.stringify(ignoreMap))
      } catch {
        /* storage unavailable */
      }
    }

    function setIgnore(name, version) {
      if (version) ignoreMap[name] = version
      else delete ignoreMap[name]
      saveIgnore()
      ignoreUpdate()
    }

    // Common plugin-manager error codes, translated into what to do about them.
    function diagnose(code) {
      if (!code) return null
      const map = {
        'invalid-spec': '地址格式不对：Git 用 owner/repo，npm 用 包名 或 包名@版本',
        'already-installed': '这个插件已经装过了',
        'incompatible-version': '与当前 DSH 版本不兼容，换一个兼容版本',
        pendingBuilds: '需要批准构建脚本：去插件页点「允许」再重试',
        'not-removable': '这个插件不能卸载（随 DSH 提供或受保护）',
        'bundle-in-use': '插件正在使用中，重启应用后再试',
        'not-bundle': '这个包不是 DSH 插件（缺少 dsh.bundle 声明）',
        'stale-approval': '授权已过期，再点一次即可',
        'unsupported-platform': '不支持当前平台',
        'management-required': '这个插件由外部管理，不能在这里改',
      }
      return map[code] || null
    }

    /* ------------------------------------------------------ background check -- */

    let backgroundStarted = false

    function startBackgroundCheck(t) {
      if (backgroundStarted || typeof setInterval !== 'function') return
      backgroundStarted = true
      let lastNotice = 0
      const tick = async () => {
        try {
          const response = await fetch(`${API}/status`, { signal: AbortSignal.timeout(30000) })
          const body = await response.json().catch(() => null)
          if (!body || !body.summary) return
          const updatable = Number(body.summary.updatable) || 0
          if (updatable <= 0) return
          if (Date.now() - lastNotice < 60 * 60 * 1000) return
          lastNotice = Date.now()
          bannerStore.set({
            kind: 'update',
            title: t('foundUpdates', { n: updatable }),
            detail: t('foundUpdatesDetail'),
            action: null,
          })
        } catch {
          /* offline or busy: try again next round */
        }
      }
      setTimeout(tick, 20000)
      setInterval(tick, 10 * 60 * 1000)
    }

    const zh = {
      title: '维护中心',
      subtitle: '更新应用与插件，顺便盯着聊天性能',
      kicker: '应用本体',
      check: '检查更新',
      checking: '检查中',
      auto: '自动更新',
      autoHint: '发现新版本时自动安装',
      statPlugins: '已装插件',
      statUpdates: '可更新',
      statChecked: '上次检查',
      filterAll: '全部',
      filterUpdates: '可更新',
      updateAll: '全部更新',
      plugins: '插件',
      upToDate: '最新',
      update: '更新',
      updating: '更新中',
      updated: '{name} 已更新到 {version}',
      restart: '更新完成，重启 DSH 后生效',
      restartApp: '重启应用',
      restartingApp: '正在重启…',
      restartRefused: '无法重启：{reason}',
      reloadUi: '刷新界面',
      reloadHint: '重载页面与客户端插件',
      restartHint: '关闭并重新打开 DSH',
      help: '刷新与重启',
      failed: '更新失败：{error}',
      noPlugins: '这个 profile 里还没有可检查的插件',
      noUpdates: '没有可更新的插件',
      local: '本地安装',
      localNote: '本地目录或压缩包安装，不参与更新检查',
      kindRegistry: 'npm',
      kindGit: 'GitHub',
      kindLocal: '本地',
      recheck: '重新检测',
      desktopUpdate: '更新',
      cancel: '取消',
      desktopPhase: '桌面端更新：{phase}{percent}',
      phase_checking: '正在检查',
      phase_available: '有新版本',
      phase_downloading: '下载中',
      phase_installing: '正在安装',
      phase_ready: '已就绪',
      phase_starting: '准备中',
      phase_error: '更新失败',
      githubReleases: 'GitHub',
      loadError: '读取更新状态失败：{error}',
      retry: '重试',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      bannerTitleOk: '插件更新完成',
      bannerTitleFail: '部分插件更新失败',
      bannerHint: '重启 DSH 后生效',
      bannerHintRefresh: '刷新后生效',
      bannerDismiss: '知道了',
      bannerCount: '{n} 个插件',
      bannerFailedCount: '{n} 个失败',
      bannerUpdateTitle: '发现新版本',
      bannerPlugins: '{n} 个插件可更新',
      downloadingTitle: '正在下载更新',
      installingTitle: '正在安装更新',
      startingTitle: '正在启动更新',
      groupRegistry: 'npm 插件',
      groupGit: 'GitHub 插件',
      groupLocal: '本地安装',
      boostTitle: '启动加速',
      boostSwitch: 'Defender 排除项',
      boostHint: '加进 Defender 排除项，启动不再逐个扫文件',
      boostOn: '已开启，排除项已添加（{time}）',
      boostOff: '已关闭，排除项已移除',
      boostUnknown: '还没设置过：打开开关会弹一次 UAC，确认后生效',
      boostWaiting: '等待 UAC 确认…',
      boostTimeout: '没等到提权结果：UAC 可能被取消，或系统不允许弹窗。可以双击 E:\\全局\\fix_startup_speed.cmd 手动执行。',
      perfTitle: '聊天性能',
      perfFps: '帧率',
      perfRows: '消息行',
      perfLongTasks: '长任务',
      perfBlocking: '阻塞',
      perfAuto: '自动降级',
      perfLong: '长对话精简',
      perfForced: '强制精简',
      perfTipsTitle: '掉帧时怎么调',
      perfTip1: '收起还卡 → 开「收起不做动画」',
      perfTip2: '滚动跳或闪 → 关「屏幕外行跳过」',
      perfTip3: '接管侧边栏渲染的插件会加重掉帧',
      perfResize: '侧边栏收起优化',
      perfResizeHint: '收起侧边栏时只重排可见行',
      perfNoAnim: '收起不做动画',
      perfNoAnimHint: '去掉滑动动画，瞬间完成',
      perfOffscreen: '屏幕外行跳过',
      perfHint: '帧率 5 秒平均，长任务看最近 10 秒。',
      perfPeak: '近 80 秒峰值 {ms}ms',
      perfRefresh: '刷新率',
      perfRefreshHint: '默认跟随屏幕刷新率',
      perfGlassAuto: '玻璃自动降级',
      perfGlassAutoHint: '低于刷新率 75% 连续 2 秒就关掉会话区模糊，回升到 90% 连续 5 秒恢复',
      perfGlassAutoOn: '已降级',
      perfGlassAutoOff: '正常',
      perfRefreshAuto: '自动识别',
      pendingDisabled: '上次启动时有 {count} 个插件加载失败被禁用：{names}',
      enableAll: '全部启用',
      safetyTitle: '安全',
      lookTitle: '外观',
      lookEnabled: '外观',
      lookEnabledHint: '走官方主题 token，换肤不失效',
      lookPreference: '主题',
      lookPreferenceSystem: '跟随系统',
      lookPreferenceLight: '浅色',
      lookPreferenceDark: '深色',
      lookFont: '字号',
      lookFontSmall: '小',
      lookFontStandard: '标准',
      lookFontLarge: '大',
      lookCodeFont: '代码字体',
      lookCodeFontDefault: '默认',
      lookSkin: '皮肤',
      lookSkinSoft: '柔和',
      lookSkinInk: '墨色',
      lookSkinOcean: '海洋',
      lookSkinGlass: '玻璃',
      lookGrain: '颗粒',
      lookTransparency: '透明度',
      lookLightGlass: '轻玻璃',
      lookLightGlassHint: '会话区不再整块模糊，菜单和弹窗仍是毛玻璃；流式输出更顺',
      lookSquareWindow: '窗口直角',
      lookSquareWindowHint: '去掉窗口外框的系统圆角（DWM 画的），只影响这个窗口',
      lookWall: '背景',
      lookWallPreset: '预设渐变',
      lookWallImage: '图片',
      lookWallVideo: '视频',
      lookWallVideoHint: '视频每帧都在动，会话区的模糊会逐帧重算，所以视频模式下自动关掉它',
      lookWallPlaceholder: '图片或视频的完整路径 / URL（支持 Wallpaper Engine 导出的 mp4、webm）',
      lookWallApply: '应用背景',
      lookBrand: '品牌色',
      lookBrandDefault: '默认',
      lookBrandIndigo: '靛蓝',
      lookBrandViolet: '紫',
      lookBrandGreen: '绿',
      lookBrandAmber: '橙',
      lookHint: '默认关闭。透明度、颗粒、轻玻璃只在玻璃皮肤下出现；本地背景走插件自己的路由，不读 file://。',
      foldersTitle: '目录与配置',
      safeModeAuto: '自动安全模式',
      safeModeAutoHint: '启动失败时自动进安全模式',
      openPlugins: '打开插件目录',
      openConfig: '打开配置',
      installGit: '从 Git 安装',
      installing: '安装中',
      installGitPlaceholder: 'GitHub 地址，例如 https://github.com/owner/repo',
      installedGit: '已安装 {spec}，重启后生效',
      sourcesTitle: 'GitHub 来源',
      sourcePlaceholder: '添加 GitHub 地址，例如 owner/repo',
      addSource: '添加',
      adding: '添加中',
      sourceEmpty: '还没有来源。添加后会持续检测这些仓库的新版本。',
      sourceLatest: '最新',
      sourceNoRelease: '没有发布版本',
      sourceInstalled: '已装',
      sourceNotInstalled: '未安装',
      sourceHasUpdate: '有更新',
      sourceInstall: '安装',
      sourceReinstall: '重新安装',
      sourceRemove: '移除',
      restartBannerTitle: '更新完成，需要重启',
      restartBannerDetail: '{name} 已更新到 {version}，重启应用后生效',
      refreshBannerTitle: '更新完成',
      refreshBannerDetail: '{name} 已更新到 {version}，刷新界面后生效',
      foundUpdates: '发现 {n} 个插件更新',
      foundUpdatesDetail: '打开 设置 → 维护中心 查看',
      uninstall: '卸载',
      confirmUninstall: '确认卸载？',
      uninstalled: '{name} 已卸载',
      installNpm: '从 npm 安装',
      installNpmPlaceholder: '包名或 包名@版本，例如 dsh-pet',
      installingNpm: '安装中',
      installedNpm: '已安装 {spec}，重启后生效',
      ignoreVersion: '忽略此版本',
      ignoredVersion: '已忽略 {version}',
      unignore: '取消忽略',
      changelog: '更新内容',
      tokenTitle: 'GitHub Token',
      tokenPlaceholder: 'ghp_… 或 github_pat_…',
      tokenReplacePlaceholder: '粘贴新的 token 以替换',
      tokenConfigured: '已配置',
      tokenMissing: '未配置',
      tokenFromEnvChip: '来自环境变量',
      tokenSavedHint: '保存在 ~/.dsh/update-center/settings.json',
      tokenSave: '保存',
      tokenClear: '清除',
      tokenSaved: 'Token 已保存',
      tokenHint: '不配每小时 60 次，配了 5000 次；只读公开仓库就够。',
      tokenDocWhy: '为什么要配：GitHub 对匿名请求按 IP 限流，每小时 60 次；带 token 是每小时 5000 次（按账号）。几条来源就能把匿名额度用完。',
      tokenDocHow: '怎么申请：打开下面的页面，',
      tokenLinkFine: '细粒度 token（推荐）',
      tokenLinkClassic: '经典 token',
      tokenDocHow2: 'Repository access 选 Public repositories (read-only)，权限一个都不勾（经典 token 的 Scopes 也不勾）。生成后只显示一次，当场复制。',
      tokenDocWhere: '插件从哪里读：环境变量 GITHUB_TOKEN → GH_TOKEN → 本机 ~/.dsh/update-center/settings.json，环境变量优先。保存后立即生效。',
      tokenFromEnv: '已从环境变量读取 GITHUB_TOKEN，这里的输入会被环境变量覆盖。',
      safeModeHint: '快捷方式指向 safe-launch.cmd；恢复用 restore-mode.cmd。',
      openSafeFolder: '打开目录',
      guideButton: '步骤',
      guideTitle: '安装步骤',
      guideLoading: '读取中…',
      guideEmpty: '没有找到安装步骤，去仓库看说明',
      guideReadme: '打开仓库',
      perfAutoHint: '低于 45 帧 2 秒就精简，回升 3 秒恢复',
      perfLongHint: '超过 60 行时关掉聊天动画',
      perfForcedHint: '始终精简，不看帧率',
      perfOffscreenHint: '跳过屏幕外行的渲染',
      typerEnabledHint: '流式文字逐字显示',
      tabUpdate: '更新',
      tabPlugins: '插件',
      tabAdd: '工具',
      tabPerf: '性能',
      tabTyper: '打字机',
      tabAbout: '关于',
      aboutTitle: '关于',
      aboutIntro: '维护中心（dsh-concierge）是 DeepSeek Harness 的插件：检查应用与插件更新、管理已装插件、盯聊天性能。',
      aboutRepo: 'GitHub 仓库',
      changelogTitle: '更新日志',
      changelogHint: '点版本号展开或收起',
      changelogCount: '{n} 条',
      changelogEmpty: '还没有更新日志',
      searchPlugins: '查找插件：名称或标题',
      typerTitle: '打字机',
      typerEnabled: '逐字显示',
      typerThrottle: '流式节流',
      typerThrottleHint: '每 33ms 提交一次渲染',
      typerSpeed: '速度',
      typerHint: '只作用于流式输出的那段文字。',

      rollback: '回退',
      enable: '启用',
      disable: '禁用',
      enabledNotice: '{name} 已启用',
      disabledNotice: '{name} 已禁用，重启后生效',
      versionsTitle: '可用版本',
      current: '当前',
      incompatible: '不兼容',
      deprecated: '已废弃',
      installVersion: '安装',
      rolledBack: '{name} 已切换到 {version}',
    }

    const en = {
      title: 'Update center',
      subtitle: 'App and installed plugin versions, with one-step updates',
      kicker: 'Application',
      check: 'Check',
      checking: 'Checking',
      auto: 'Auto-update',
      autoHint: 'Install new versions after a check',
      statPlugins: 'Plugins',
      statUpdates: 'Updatable',
      statChecked: 'Last check',
      filterAll: 'All',
      filterUpdates: 'Updatable',
      updateAll: 'Update all',
      plugins: 'Plugins',
      upToDate: 'Current',
      update: 'Update',
      updating: 'Updating',
      updated: '{name} updated to {version}',
      restart: 'Update applied. Restart DSH to load it.',
      restartApp: 'Restart app',
      restartingApp: 'Restarting…',
      restartRefused: 'Could not restart: {reason}',
      reloadUi: 'Reload UI',
      reloadHint: 'Reload the page and client plugins',
      restartHint: 'Close and reopen DSH',
      help: 'Reload & restart',
      failed: 'Update failed: {error}',
      noPlugins: 'No plugins to check in this profile',
      noUpdates: 'Nothing to update',
      local: 'Local',
      localNote: 'Installed from a local path or tarball; not checked',
      kindRegistry: 'npm',
      kindGit: 'GitHub',
      kindLocal: 'Local',
      recheck: 'Check again',
      desktopUpdate: 'Update',
      cancel: 'Cancel',
      desktopPhase: 'Desktop updater: {phase}{percent}',
      phase_checking: 'Checking',
      phase_available: 'Update available',
      phase_downloading: 'Downloading',
      phase_installing: 'Installing',
      phase_ready: 'Ready',
      phase_starting: 'Starting',
      phase_error: 'Update failed',
      githubReleases: 'GitHub',
      loadError: 'Could not read update status: {error}',
      retry: 'Retry',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      hoursAgo: '{n} h ago',
      bannerTitleOk: 'Plugin updates installed',
      bannerTitleFail: 'Some plugin updates failed',
      bannerHint: 'Restart DSH to load them',
      bannerHintRefresh: 'Refresh to load them',
      bannerDismiss: 'Got it',
      bannerCount: '{n} plugins',
      bannerFailedCount: '{n} failed',
      bannerUpdateTitle: 'Update available',
      bannerPlugins: '{n} plugins can update',
      downloadingTitle: 'Downloading update',
      installingTitle: 'Installing update',
      startingTitle: 'Starting update',
      groupRegistry: 'npm plugins',
      groupGit: 'GitHub plugins',
      groupLocal: 'Local installs',
      boostTitle: 'Startup boost',
      boostSwitch: 'Defender exclusions',
      boostHint: 'Add DSH to the Defender exclusions',
      boostOn: 'On — exclusions added ({time})',
      boostOff: 'Off — exclusions removed',
      boostUnknown: 'Not set yet: turning it on shows one UAC prompt',
      boostWaiting: 'Waiting for the UAC prompt…',
      boostTimeout: 'No result from the elevation prompt: UAC was probably cancelled. You can run fix_startup_speed.cmd by hand instead.',
      perfTitle: 'Chat performance',
      perfFps: 'FPS',
      perfRows: 'Rows',
      perfLongTasks: 'Long tasks',
      perfBlocking: 'Blocked',
      perfAuto: 'Auto degrade',
      perfLong: 'Long-chat lite',
      perfForced: 'Force lite',
      perfTipsTitle: 'When it still stutters',
      perfTip1: 'Still stutters → turn on "No collapse animation"',
      perfTip2: 'Scroll jumps or flashes → turn off "Skip offscreen rows"',
      perfTip3: 'Sidebar-takeover plugins make it worse',
      perfResize: 'Sidebar resize shield',
      perfResizeHint: 'Visible rows only during the animation',
      perfNoAnim: 'No collapse animation',
      perfNoAnimHint: 'Drop the slide, collapse instantly',
      perfOffscreen: 'Skip offscreen rows',
      perfHint: 'FPS is a 5s average; long tasks cover 10s.',
      perfPeak: '80s peak {ms}ms',
      perfRefresh: 'Refresh rate',
      perfRefreshHint: 'Follows the display refresh by default',
      perfGlassAuto: 'Glass auto-degrade',
      perfGlassAutoHint: 'Drops the chat blur after 2s below 75% of the refresh rate; restores after 5s above 90%',
      perfGlassAutoOn: 'Reduced',
      perfGlassAutoOff: 'Normal',
      perfRefreshAuto: 'Auto detect',
      pendingDisabled: '{count} plugin(s) failed to load after the last start and were disabled: {names}',
      enableAll: 'Enable all',
      safetyTitle: 'Safety',
      lookTitle: 'Appearance',
      lookEnabled: 'Appearance',
      lookEnabledHint: 'Native theme tokens, survives updates',
      lookPreference: 'Theme',
      lookPreferenceSystem: 'System',
      lookPreferenceLight: 'Light',
      lookPreferenceDark: 'Dark',
      lookFont: 'Text size',
      lookFontSmall: 'Small',
      lookFontStandard: 'Standard',
      lookFontLarge: 'Large',
      lookCodeFont: 'Code font',
      lookCodeFontDefault: 'Default',
      lookSkin: 'Skin',
      lookSkinSoft: 'Soft',
      lookSkinInk: 'Ink',
      lookSkinOcean: 'Ocean',
      lookSkinGlass: 'Glass',
      lookGrain: 'Grain',
      lookTransparency: 'Transparency',
      lookLightGlass: 'Light glass',
      lookLightGlassHint: 'No blur on the chat region; menus and dialogs stay frosted',
      lookSquareWindow: 'Square window',
      lookSquareWindowHint: 'Drops the Windows 11 corner rounding on this window frame',
      lookWall: 'Background',
      lookWallPreset: 'Preset gradient',
      lookWallImage: 'Image',
      lookWallVideo: 'Video',
      lookWallVideoHint: 'A video changes every frame, so the chat blur would re-run each frame; it stays off in video mode',
      lookWallPlaceholder: 'Full path or URL of an image/video (mp4, webm exported from Wallpaper Engine work)',
      lookWallApply: 'Apply background',
      lookBrand: 'Brand color',
      lookBrandDefault: 'Default',
      lookBrandIndigo: 'Indigo',
      lookBrandViolet: 'Violet',
      lookBrandGreen: 'Green',
      lookBrandAmber: 'Amber',
      lookHint: 'Off by default. Transparency and grain only apply to the Glass skin; local backgrounds are streamed through the plugin route.',
      foldersTitle: 'Folders',
      safeModeAuto: 'Automatic safe mode',
      safeModeAutoHint: 'Safe mode if a start fails',
      openPlugins: 'Open plugins folder',
      openConfig: 'Open config',
      installGit: 'Install from Git',
      installing: 'Installing',
      installGitPlaceholder: 'GitHub URL, e.g. https://github.com/owner/repo',
      installedGit: 'Installed {spec}; takes effect after a restart',
      sourcesTitle: 'GitHub sources',
      sourcePlaceholder: 'Add a GitHub repo, e.g. owner/repo',
      addSource: 'Add',
      adding: 'Adding',
      sourceEmpty: 'No sources yet. Added repos are checked for new releases continuously.',
      sourceLatest: 'latest',
      sourceNoRelease: 'no release',
      sourceInstalled: 'installed',
      sourceNotInstalled: 'not installed',
      sourceHasUpdate: 'update',
      sourceInstall: 'Install',
      sourceReinstall: 'Reinstall',
      sourceRemove: 'Remove',
      restartBannerTitle: 'Update finished — restart required',
      restartBannerDetail: '{name} updated to {version}; restart to apply',
      refreshBannerTitle: 'Update finished',
      refreshBannerDetail: '{name} updated to {version}; reload the UI to apply',
      foundUpdates: '{n} plugin update(s) available',
      foundUpdatesDetail: 'Open Settings → Maintenance center to review',
      uninstall: 'Uninstall',
      confirmUninstall: 'Confirm uninstall?',
      uninstalled: '{name} uninstalled',
      installNpm: 'Install from npm',
      installNpmPlaceholder: 'Package name or name@version, e.g. dsh-pet',
      installingNpm: 'Installing',
      installedNpm: 'Installed {spec}; takes effect after a restart',
      ignoreVersion: 'Ignore this version',
      ignoredVersion: 'Ignored {version}',
      unignore: 'Unignore',
      changelog: "What's new",
      tokenTitle: 'GitHub token',
      tokenPlaceholder: 'ghp_… or github_pat_…',
      tokenReplacePlaceholder: 'Paste a new token to replace it',
      tokenConfigured: 'Configured',
      tokenMissing: 'Not configured',
      tokenFromEnvChip: 'From environment',
      tokenSavedHint: 'Stored in ~/.dsh/update-center/settings.json',
      tokenSave: 'Save',
      tokenClear: 'Clear',
      tokenSaved: 'Token saved',
      tokenHint: '60/h without, 5,000/h with; public read-only is enough',
      tokenDocWhy: 'Why: GitHub rate-limits anonymous requests to 60/hour per IP; with a token it is 5,000/hour per account. A few sources exhaust the anonymous budget.',
      tokenDocHow: 'How to get one: open one of these,',
      tokenLinkFine: 'Fine-grained token (recommended)',
      tokenLinkClassic: 'Classic token',
      tokenDocHow2: 'Repository access → Public repositories (read-only), no permissions (classic: no scopes). It is shown only once, copy it then.',
      tokenDocWhere: 'Where it is read from: GITHUB_TOKEN → GH_TOKEN → ~/.dsh/update-center/settings.json; the environment wins. Saving applies immediately.',
      tokenFromEnv: 'GITHUB_TOKEN is set in the environment; it overrides this field.',
      safeModeHint: 'Shortcut → safe-launch.cmd; restore-mode.cmd restores',
      openSafeFolder: 'Open folder',
      guideButton: 'Steps',
      guideTitle: 'Install steps',
      guideLoading: 'Loading…',
      guideEmpty: 'No steps found; open the repository for instructions',
      guideReadme: 'Open repo',
      perfAutoHint: 'Below 45 FPS 2s: lite; above 55 3s: restore',
      perfLongHint: 'Above 60 rows: chat animations off',
      perfForcedHint: 'Always lite, ignore FPS',
      perfOffscreenHint: 'Skip offscreen rows',
      typerEnabledHint: 'Reveal streaming text gradually',
      tabUpdate: 'Update',
      tabPlugins: 'Plugins',
      tabAdd: 'Tools',
      tabPerf: 'Performance',
      tabTyper: 'Typewriter',
      tabAbout: 'About',
      aboutTitle: 'About',
      aboutIntro: 'Maintenance center (dsh-concierge) is a DeepSeek Harness plugin: it checks app and plugin updates, manages installed plugins and watches chat performance.',
      aboutRepo: 'GitHub repository',
      changelogTitle: 'Changelog',
      changelogHint: 'Click a version to expand or collapse',
      changelogCount: '{n} changes',
      changelogEmpty: 'No changelog yet',
      searchPlugins: 'Find a plugin by name or title',
      typerTitle: 'Typewriter',
      typerEnabled: 'Reveal text gradually',
      typerThrottle: 'Stream throttle',
      typerThrottleHint: 'One render per 33ms',
      typerSpeed: 'Speed',
      typerHint: 'Only affects the streaming text block.',

      rollback: 'Rollback',
      enable: 'Enable',
      disable: 'Disable',
      enabledNotice: '{name} is enabled',
      disabledNotice: '{name} is disabled; takes effect after a restart',
      versionsTitle: 'Available versions',
      current: 'Current',
      incompatible: 'Incompatible',
      deprecated: 'Deprecated',
      installVersion: 'Install',
      rolledBack: '{name} switched to {version}',
    }

    const CSS = `
.uc-root { --uc-accent: var(--dsw-alias-brand-primary); display: flex; flex-direction: column; gap: 18px; padding: 6px 0 32px; max-width: 720px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.uc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.uc-kicker { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.uc-title { margin: 0 0 4px; font-size: 20px; font-weight: 650; letter-spacing: -.01em; }
.uc-sub { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.uc-head-actions { display: flex; align-items: center; gap: 10px; }
.uc-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; }
.uc-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.uc-switch-track { position: relative; width: 34px; height: 20px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); transition: background .15s ease, border-color .15s ease; }
.uc-switch-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: transform .15s ease, background .15s ease; }
.uc-switch input:checked + .uc-switch-track { background: var(--uc-accent); border-color: var(--uc-accent); }
.uc-switch input:checked + .uc-switch-track::after { transform: translateX(14px); background: #fff; }
.uc-switch input:disabled + .uc-switch-track { opacity: .5; }
.uc-icon-btn { appearance: none; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: color .15s ease, border-color .15s ease, background .15s ease; }
.uc-icon-btn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--uc-accent); }
.uc-icon-btn:disabled { opacity: .5; cursor: default; }
.uc-spin { animation: uc-spin 1s linear infinite; }
@keyframes uc-spin { to { transform: rotate(360deg); } }
.uc-hero { position: relative; overflow: hidden; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.uc-glow { position: absolute; right: -70px; top: -90px; width: 240px; height: 240px; border-radius: 50%; background: var(--uc-accent); opacity: .09; filter: blur(34px); pointer-events: none; }
.uc-hero-body { position: relative; min-width: 0; }
.uc-hero-kicker { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.uc-hero-line { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.uc-hero-version { font-size: 26px; font-weight: 650; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.uc-hero-arrow { color: var(--dsw-alias-label-secondary); font-size: 16px; }
.uc-hero-next { font-size: 26px; font-weight: 650; letter-spacing: -.02em; color: var(--dsw-alias-state-success-primary); font-variant-numeric: tabular-nums; }
.uc-hero-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.uc-chip { font-size: 11px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.uc-chip-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.uc-chip-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.uc-chip-err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.uc-hero-actions { position: relative; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.uc-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 9px; padding: 7px 13px; font-size: 12px; line-height: 1.3; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: border-color .15s ease, background .15s ease; }
.uc-btn:hover:not(:disabled) { border-color: var(--uc-accent); background: var(--dsw-alias-bg-layer-2); }
.uc-btn:disabled { opacity: .55; cursor: default; }
.uc-btn-accent { background: var(--uc-accent); border-color: var(--uc-accent); color: #fff; font-weight: 600; }
.uc-btn-accent:hover:not(:disabled) { background: var(--uc-accent); border-color: var(--uc-accent); filter: brightness(1.05); }
.uc-btn-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 10px; }
.uc-btn-ghost:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: transparent; }
.uc-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.uc-stat { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); padding: 12px 14px; }
.uc-stat-value { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
.uc-stat-value-hot { color: var(--dsw-alias-state-warn-primary); }
.uc-stat-label { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.uc-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.uc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 12px; flex-wrap: wrap; }
.uc-card-actions { display: flex; align-items: center; gap: 10px; }
.uc-card-title { font-size: 13px; font-weight: 650; }
.uc-segment { display: inline-flex; padding: 2px; gap: 2px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2); }
.uc-segment button { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 4px 10px; border-radius: 7px; cursor: pointer; }
.uc-segment button.on { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.uc-rows { display: flex; flex-direction: column; }
.uc-group { display: flex; flex-direction: column; }
.uc-group + .uc-group { border-top: 1px solid var(--dsw-alias-border-l1); }
.uc-group-head { display: flex; align-items: center; gap: 8px; padding: 8px 18px; background: var(--dsw-alias-bg-layer-2); }
.uc-group-label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.uc-group-count { font-size: 10px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.uc-group-count-hot { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.uc-group .uc-row:first-of-type { border-top: none; }
.uc-versions { border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); padding: 10px 18px 12px; }
.uc-versions-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.uc-versions-list { display: flex; flex-direction: column; gap: 1px; max-height: 190px; overflow: auto; }
.uc-version { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 8px; font-size: 12px; }
.uc-version:hover { background: var(--dsw-alias-bg-layer-1); }
.uc-version-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; min-width: 90px; }
.uc-version-spacer { flex: 1; }
.uc-row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--dsw-alias-border-l1); }
.uc-row:hover { background: var(--dsw-alias-bg-layer-2); }
.uc-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.uc-dot-warn { background: var(--dsw-alias-state-warn-primary); }
.uc-dot-err { background: var(--dsw-alias-state-error-primary); }
.uc-dot-ok { background: var(--dsw-alias-state-success-primary); }
.uc-row-main { flex: 1; min-width: 0; }
.uc-row-name { display: flex; align-items: center; gap: 8px; font-weight: 550; }
.uc-row-name span:first-child { overflow-wrap: anywhere; white-space: normal; line-height: 1.35; }
.uc-tag { flex: none; font-size: 10px; padding: 1px 6px; border-radius: 999px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); }
.uc-row-pkg { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; text-overflow: ellipsis; white-space: nowrap; }
.uc-row-note { margin-top: 3px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.uc-row-err { margin-top: 3px; font-size: 11px; color: var(--dsw-alias-state-error-primary); }
.uc-vers { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; min-width: 128px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.uc-vers-next { color: var(--dsw-alias-state-success-primary); font-weight: 600; }
.uc-row-act { flex: none; display: flex; align-items: center; gap: 6px; }
.uc-row-act .uc-btn { padding-left: 8px; padding-right: 8px; }
.uc-muted { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.uc-empty { padding: 34px 18px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.uc-empty-icon { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l1); display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-state-success-primary); }
.uc-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); font-size: 12px; }
.uc-notice-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.uc-notice-err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.uc-spark-wrap { display: flex; align-items: flex-end; gap: 10px; }
.uc-spark { display: flex; align-items: flex-end; gap: 2px; height: 30px; flex: 1; min-width: 0; }
.uc-spark-bar { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-brand-primary); opacity: .55; }
.uc-spark-cap { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.uc-select { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; padding: 4px 8px; }
.uc-row-setting { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 13px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.uc-row-setting:last-of-type { border-bottom: none; }
.uc-row-text { min-width: 0; }
.uc-row-title { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.uc-row-hint { margin-top: 3px; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.uc-row-control { flex: 0 0 auto; padding-top: 2px; }
.uc-progress { position: relative; height: 2px; border-radius: 2px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); margin: -6px 0 4px; }
.uc-progress::after { content: ''; position: absolute; top: 0; bottom: 0; width: 35%; border-radius: 2px; background: var(--uc-accent); animation: uc-progress-slide 1.1s ease-in-out infinite; }
@keyframes uc-progress-slide { 0% { left: -35%; } 100% { left: 100%; } }
.uc-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--dsw-alias-border-l1); margin: 0 0 2px; }
.uc-tab { appearance: none; border: none; background: transparent; padding: 9px 1px 11px; font-size: 13px; color: var(--dsw-alias-label-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s ease; }
.uc-tab:hover { color: var(--dsw-alias-label-primary); }
.uc-tab[data-active="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-label-primary); }
.uc-sources { display: flex; flex-direction: column; padding: 6px 0 8px; }
.uc-source { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 18px; border-top: 1px solid var(--dsw-alias-border-l1); }
.uc-source-main { min-width: 0; }
.uc-source-repo { font-size: 13px; color: var(--dsw-alias-brand-primary); text-decoration: none; }
.uc-source-repo:hover { text-decoration: underline; }
.uc-source-meta { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary); display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.uc-source-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.uc-guide { margin: 0 18px 12px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.uc-guide-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.uc-guide-steps { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.uc-guide-actions { display: flex; gap: 8px; margin-top: 10px; }
.uc-tag-hot { color: var(--dsw-alias-brand-primary); }
.uc-btn-danger { color: #d9534f !important; border-color: rgba(217, 83, 79, .45) !important; }
.uc-btn-danger:hover { background: rgba(217, 83, 79, .12) !important; }
.uc-row-link { color: var(--dsw-alias-brand-primary); text-decoration: none; font-size: 11px; margin-left: 4px; }
.uc-row-link:hover { text-decoration: underline; }
.uc-about { display: flex; flex-direction: column; gap: 8px; padding: 2px 20px 16px; }
.uc-about p { margin: 0; font-size: 12px; line-height: 1.6; }
.uc-about-desc { color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
.uc-about-links { display: flex; align-items: center; gap: 14px; font-size: 11.5px; }
.uc-about-license { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.uc-log { display: flex; flex-direction: column; padding: 2px 12px 12px; }
.uc-log-entry { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.uc-log-entry:last-child { border-bottom: none; }
.uc-log-head { appearance: none; width: 100%; border: none; background: transparent; display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-radius: 9px; cursor: pointer; color: var(--dsw-alias-label-primary); text-align: left; font: inherit; }
.uc-log-head:hover { background: var(--dsw-alias-bg-layer-2); }
.uc-log-chevron { color: var(--dsw-alias-label-secondary); font-size: 10px; transition: transform .15s ease; }
.uc-log-chevron[data-open="1"] { transform: rotate(90deg); }
.uc-log-version { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.uc-log-count { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.uc-log-items { margin: 0 0 10px; padding: 0 8px 0 26px; display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.uc-hintbox { margin: 2px 0 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-left: 3px solid var(--uc-accent); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.uc-hintbox-title { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-primary); margin-bottom: 4px; }
.uc-hintbox-list { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
.uc-look-editor { display: flex; flex-direction: column; gap: 8px; padding: 2px 20px 14px; }
.uc-look-text { width: 100%; box-sizing: border-box; min-height: 190px; resize: vertical; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.55; padding: 10px 12px; outline: none; }
.uc-look-text:focus { border-color: var(--uc-accent); }
.uc-look-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.uc-look-error { margin: 0; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.uc-token-current { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0 20px 2px; }
.uc-token-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-primary); }
.uc-token-current-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.uc-token-doc { display: flex; flex-direction: column; gap: 5px; padding: 2px 18px 14px; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.uc-token-doc p { margin: 0; }
.uc-token-links { display: flex; flex-wrap: wrap; gap: 12px; }
.uc-token-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.uc-token-link:hover { text-decoration: underline; }
.uc-token-block { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.uc-token-head { display: flex; flex-direction: column; gap: 2px; }
.uc-token-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.uc-token-sub { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.uc-token-row { padding: 0; }
.uc-token-msg { font-size: 11px; color: var(--dsw-alias-brand-primary); }
.uc-safe { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.uc-safe-text { min-width: 0; }
.uc-changelog { margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; max-height: 160px; overflow: auto; }
.uc-install { display: flex; gap: 8px; padding: 12px 18px 2px; }
.uc-install input { flex: 1; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 13px; padding: 8px 12px; outline: none; }
.uc-install input:focus { border-color: var(--dsw-alias-brand-primary); }
.uc-search { padding: 12px 18px 2px; }
.uc-search input { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 13px; padding: 8px 12px; outline: none; }
.uc-search input:focus { border-color: var(--dsw-alias-brand-primary); }
.uc-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.uc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.uc-chip-toggle { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 5px 12px; font-size: 12px; line-height: 1.3; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: border-color .15s ease, color .15s ease; }
.uc-chip-toggle:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
.uc-chip-toggle-on { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.uc-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .35; }
.uc-chip-toggle-on .uc-chip-dot { opacity: 1; }
.uc-perf { padding: 4px 18px 14px; display: flex; flex-direction: column; gap: 10px; }
.uc-perf-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.uc-perf-stat { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 8px 10px; background: var(--dsw-alias-bg-layer-1); }
.uc-perf-value { font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; }
.uc-perf-cap { font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.uc-perf-label { margin-top: 1px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.uc-perf-rows { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.uc-perf-hint { margin: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.uc-typer { display: flex; align-items: center; gap: 10px; }
.uc-typer input { width: 160px; accent-color: var(--dsw-alias-brand-primary); }
.uc-typer-value { font-size: 12px; min-width: 30px; text-align: right; font-variant-numeric: tabular-nums; }
.uc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--dsw-alias-label-secondary); font-size: 11px; flex-wrap: wrap; }
.uc-foot a { color: var(--dsw-alias-label-secondary); text-decoration: none; border-bottom: 1px dotted var(--dsw-alias-border-l2); }
.uc-foot a:hover { color: var(--dsw-alias-label-primary); }

/* --- polish --- */
.uc-root { gap: 16px; padding: 8px 0 36px; max-width: 780px; }
.uc-title { font-size: 21px; }
.uc-tabs { gap: 4px; }
.uc-tab { padding: 9px 12px 11px; border-radius: 9px 9px 0 0; }
.uc-tab:hover { background: var(--dsw-alias-bg-layer-2); }
.uc-tab[data-active="true"] { color: var(--uc-accent); border-bottom-color: var(--uc-accent); font-weight: 600; }
.uc-card { border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); box-shadow: none; }
.uc-card-head { padding: 14px 18px 10px; }
.uc-row { padding: 12px 18px; }
.uc-row:hover { background: var(--dsw-alias-bg-layer-2); }
.uc-btn { min-height: 30px; border-radius: 10px; }
.uc-btn-ghost:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.uc-install { padding: 14px 20px 4px; }
.uc-search { padding: 14px 20px 4px; }
.uc-install input, .uc-search input { border-radius: 11px; padding: 9px 13px; transition: border-color .15s ease, box-shadow .15s ease; }
.uc-install input:focus, .uc-search input:focus { border-color: var(--uc-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--uc-accent) 20%, transparent); }
.uc-stat { border-radius: 14px; padding: 14px 16px; }
.uc-stat-value { font-size: 22px; }
.uc-hero { border-radius: 16px; padding: 20px 22px; }
.uc-notice { border-radius: 12px; }
.uc-source { padding: 12px 20px; }
.uc-source:hover { background: var(--dsw-alias-bg-layer-2); }
.uc-sources { padding: 2px 0 10px; }
.uc-token-doc { padding: 4px 20px 16px; }
.uc-perf { padding: 4px 20px 16px; }
.uc-empty { padding: 28px 20px; }
.uc-guide { margin: 0 20px 14px; }
.uc-safe { padding: 12px 16px; border-radius: 12px; }

/* --- own layout: vertical rail + content pane (not the official tab strip) --- */
.uc-tabs { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-2); width: fit-content; }
.uc-tab { padding: 6px 14px; border-radius: 999px; border: none; background: transparent; font-size: 12.5px; color: var(--dsw-alias-label-secondary); cursor: pointer; transition: color .15s ease, background .15s ease; }
.uc-tab:hover { color: var(--dsw-alias-label-primary); }
.uc-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--uc-accent); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
.uc-folder-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 20px 10px; }
.uc-folder-hint { margin: 0; padding: 0 20px 16px; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
`

    // A corner toast, not a centered bar: the centered version covered the
    // conversation header and the first lines of the message.
    const BANNER_CSS = `
[data-shell-overlay]{z-index:500!important;}
.uc-banner{position:fixed;top:46px;right:14px;left:auto;transform:none;width:min(376px,calc(100vw - 28px));z-index:9999;pointer-events:auto;display:flex;flex-direction:column;gap:9px;padding:12px 13px 12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 14px 34px rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.08);font-size:12px;line-height:1.45;animation:uc-toast-in .18s ease-out;}
@keyframes uc-toast-in{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.uc-banner::before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:var(--dsw-alias-state-success-primary);}
.uc-banner-error::before{background:var(--dsw-alias-state-error-primary);}
.uc-banner-update::before{background:var(--dsw-alias-state-warn-primary);}
.uc-banner-top{display:flex;align-items:flex-start;gap:10px;}
.uc-banner-icon{flex:none;width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-success-primary);}
.uc-banner-error .uc-banner-icon{color:var(--dsw-alias-state-error-primary);}
.uc-banner-update .uc-banner-icon{color:var(--dsw-alias-state-warn-primary);}
.uc-banner-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.uc-banner-title{font-weight:600;font-size:12.5px;}
.uc-banner-detail{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.uc-banner-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;}
.uc-banner-hint{color:var(--dsw-alias-label-secondary);font-size:11px;margin-right:auto;}
.uc-banner-error-text{color:var(--dsw-alias-state-error-primary);font-size:11px;}
.uc-banner-action{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer;}
.uc-banner-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.uc-banner-action-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;font-weight:600;}
.uc-banner-action-primary:hover{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;filter:brightness(1.06);}
.uc-banner-progress{padding-bottom:18px;}
.uc-banner-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--dsw-alias-border-l1);border-radius:0 0 14px 14px;overflow:hidden;}
.uc-banner-bar-fill{height:100%;background:var(--dsw-alias-brand-primary);transition:width .35s ease;}
.uc-banner-bar-indeterminate{width:30%;animation:uc-indeterminate 1.2s ease-in-out infinite;}
@keyframes uc-indeterminate{0%{margin-left:-30%}100%{margin-left:100%}}
`

    function useLocaleRevision(loc) {
      const subscribe = React.useCallback((callback) => {
        try {
          if (loc && typeof loc.subscribe === 'function') return loc.subscribe(callback)
        } catch {
          /* fall through */
        }
        return () => {}
      }, [loc])
      const snapshot = React.useCallback(() => {
        try {
          if (loc && typeof loc.getSnapshot === 'function') return loc.getSnapshot().revision
        } catch {
          /* fall through */
        }
        return 0
      }, [loc])
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, snapshot, snapshot)
      }
      const [revision, setRevision] = React.useState(snapshot)
      React.useEffect(() => subscribe(() => setRevision(snapshot())), [subscribe, snapshot])
      return revision
    }

    function activeLocale(loc) {
      try {
        if (loc && typeof loc.getLocale === 'function') return loc.getLocale().active || 'zh'
      } catch {
        /* fall through */
      }
      return 'zh'
    }

    function localizedText(value, active) {
      if (typeof value === 'string') return value
      if (!value || typeof value !== 'object') return ''
      const keys = String(active || '').toLowerCase().startsWith('en')
        ? ['en', 'zh-CN', 'zh']
        : ['zh-CN', 'zh', 'en']
      for (const key of keys) {
        if (typeof value[key] === 'string') return value[key]
      }
      const first = Object.values(value).find((item) => typeof item === 'string')
      return first || ''
    }

    function phaseLabel(phase, t) {
      const key = `phase_${phase}`
      const label = t(key)
      return label === key ? phase : label
    }

    function relativeTime(ts, t) {
      const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000))
      if (minutes < 1) return t('justNow')
      if (minutes < 60) return t('minutesAgo', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('hoursAgo', { n: hours })
      return new Date(ts).toLocaleDateString()
    }

    function IconRefresh(props) {
      return h('svg', {
        viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor',
        'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': true, className: props && props.spin ? 'uc-spin' : undefined,
      },
        h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
        h('path', { d: 'M20 4v7h-7' }),
      )
    }

    function UpdateCenter(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const loc = props.locale
      useLocaleRevision(loc)
      const active = activeLocale(loc)

      const [data, setData] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [loadError, setLoadError] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [filter, setFilter] = React.useState('all')
      const [tab, setTab] = React.useState('update')
      const [query, setQuery] = React.useState('')
      const [gitUrl, setGitUrl] = React.useState('')
      const [addingSource, setAddingSource] = React.useState(false)
      const [sourceBusy, setSourceBusy] = React.useState(null)
      const [guideRepo, setGuideRepo] = React.useState(null)
      const [guideData, setGuideData] = React.useState(null)
      const [guideLoading, setGuideLoading] = React.useState(false)
      const [tokenInput, setTokenInput] = React.useState('')
      const [tokenState, setTokenState] = React.useState(null)
      const [npmSpec, setNpmSpec] = React.useState('')
      const [installingNpm, setInstallingNpm] = React.useState(false)
      const [confirmUninstall, setConfirmUninstall] = React.useState(null)
      const [openLog, setOpenLog] = React.useState(null)
      const [ignoreTick, setIgnoreTick] = React.useState(0)

      React.useEffect(() => {
        const listener = () => setIgnoreTick((value) => value + 1)
        ignoreListeners.add(listener)
        return () => ignoreListeners.delete(listener)
      }, [])
      const [autoUpdate, setAutoUpdate] = React.useState(() => {
        try {
          return typeof localStorage === 'undefined' || localStorage.getItem('dsh-concierge:auto') !== '0'
        } catch {
          return true
        }
      })
      const autoKeyRef = React.useRef('')
      const announceRef = React.useRef('')
      const lockRef = React.useRef(false)
      const [desktopState, setDesktopState] = React.useState(null)
      const [appDismissed, setAppDismissed] = React.useState(false)
      const [restarting, setRestarting] = React.useState(false)
      const [restartReady, setRestartReady] = React.useState(false)
      const [perfSnapshot, setPerfSnapshot] = React.useState({ ...perf })
      const [typerSnapshot, setTyperSnapshot] = React.useState({ ...typer })
      const [lookSnapshot, setLookSnapshot] = React.useState({ ...look })
      const [wallDraft, setWallDraft] = React.useState(() => (look.wall && look.wall.src) || '')

      const applyWallDraft = () => {
        const src = wallDraft.trim()
        look.wall = {
          mode: look.wall.mode === 'preset' ? 'image' : look.wall.mode,
          src,
        }
        look.enabled = true
        saveLookPrefs()
        applyLook()
        lookUpdate()
      }

      React.useEffect(() => {
        const listener = () => setLookSnapshot({ ...look })
        lookListeners.add(listener)
        return () => lookListeners.delete(listener)
      }, [])

      React.useEffect(() => {
        let alive = true
        fetch(`${API}/about`, { cache: 'no-store' })
          .then((response) => response.json())
          .then((body) => {
            if (alive && body && body.ok) setAboutData(body)
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])

      const [boostState, setBoostState] = React.useState(null)
      const [boostBusy, setBoostBusy] = React.useState(false)
      // Batch updates set busy to each row name in turn, so the batch button
      // needs its own flag to show that the whole run is in progress.
      const [bulkBusy, setBulkBusy] = React.useState(false)

      const loadBoost = React.useCallback(async () => {
        try {
          const response = await fetch(`${API}/startup-boost`, { cache: 'no-store' })
          const body = await response.json().catch(() => null)
          if (body && body.ok) setBoostState(body.state || null)
        } catch {
          /* ignore */
        }
      }, [])

      React.useEffect(() => {
        void loadBoost()
      }, [loadBoost])

      const [boostTimeout, setBoostTimeout] = React.useState(false)

      const toggleBoost = React.useCallback(async () => {
        if (boostBusy) return
        const next = !(boostState && boostState.enabled)
        setBoostBusy(true)
        setBoostTimeout(false)
        let done = false
        try {
          await fetch(`${API}/startup-boost`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: next }),
          })
          // The elevated script needs a UAC click; poll for its result.
          for (let round = 0; round < 20; round += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            const response = await fetch(`${API}/startup-boost`, { cache: 'no-store' })
            const body = await response.json().catch(() => null)
            if (body && body.ok && body.state && body.state.enabled === next) {
              setBoostState(body.state)
              done = true
              break
            }
          }
        } catch {
          /* ignore */
        } finally {
          setBoostBusy(false)
          if (!done) setBoostTimeout(true)
        }
      }, [boostState, boostBusy])

      React.useEffect(() => {
        const listener = () => setPerfSnapshot({ ...perf })
        perfListeners.add(listener)
        return () => perfListeners.delete(listener)
      }, [])

      React.useEffect(() => {
        const listener = () => setTyperSnapshot({ ...typer })
        typerListeners.add(listener)
        return () => typerListeners.delete(listener)
      }, [])
      const [aboutData, setAboutData] = React.useState(null)
      const [openVersions, setOpenVersions] = React.useState({})
      const [rollbackName, setRollbackName] = React.useState(null)
      const [rollbackData, setRollbackData] = React.useState(null)
      const [rollbackLoading, setRollbackLoading] = React.useState(false)
      const [rollbackError, setRollbackError] = React.useState(null)

      const load = React.useCallback(async (refresh) => {
        setLoading(true)
        setLoadError(null)
        try {
          const response = await fetch(`${API}/status${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = await response.json()
          if (body && body.ok === false && body.error) throw new Error(body.error)
          setData(body)
        } catch (error) {
          setLoadError(error && error.message ? error.message : String(error))
        } finally {
          setLoading(false)
        }
      }, [])

      React.useEffect(() => {
        load(false)
      }, [load])

      // Restart only exists inside the desktop shell.
      React.useEffect(() => {
        setRestartReady(Boolean(DESKTOP_UPDATES))
      }, [])

      React.useEffect(() => {
        if (!DESKTOP_UPDATES) return undefined
        let alive = true
        const apply = (state) => {
          if (alive) setDesktopState(state || null)
        }
        Promise.resolve()
          .then(() => DESKTOP_UPDATES.status())
          .then(apply)
          .catch(() => {})
        const unsubscribe = typeof DESKTOP_UPDATES.subscribe === 'function'
          ? DESKTOP_UPDATES.subscribe(apply)
          : undefined
        return () => {
          alive = false
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [])

      // One update runs at a time: the lock rejects a second click while a batch or a
      // single update is still in flight, including the tail end before the reload.
      const applyUpdate = React.useCallback(async (row) => {
        try {
          const response = await fetch(`${API}/update`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: row.name }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            return { ok: false, error: body && body.error ? body.error : `HTTP ${response.status}` }
          }
          const application = body.result && body.result.result ? body.result.result.application : null
          if (application === 'failed' || application === 'cancelled') {
            const reason = body.result.result.error && body.result.result.error.code
              ? body.result.result.error.code
              : application
            return { ok: false, error: reason }
          }
          return {
            ok: true,
            application,
            to: body.result && body.result.to ? body.result.to : (row.latest || ''),
          }
        } catch (error) {
          return { ok: false, error: error && error.message ? error.message : String(error) }
        }
      }, [])

      const updateOne = React.useCallback(async (row) => {
        if (lockRef.current || busy !== null) return
        lockRef.current = true
        setBusy(row.name)
        setNotice(null)
        try {
          const result = await applyUpdate(row)
          if (result.ok) {
            if (result.application === 'restart-required') {
              // Restart prompts live in the top popup, like the app updater's own.
              bannerStore.set({
                kind: 'restart',
                needsRestart: true,
                title: t('restartBannerTitle'),
                detail: t('restartBannerDetail', { name: row.name, version: result.to }),
                // The host can always restart the app, so the button is always
                // there; a failure is reported back in the banner.
                action: { label: t('restartApp'), run: () => requestRestart() },
              })
            } else {
              bannerStore.set({
                kind: 'refresh',
                title: t('refreshBannerTitle'),
                detail: t('refreshBannerDetail', { name: row.name, version: result.to }),
                action: { label: t('reloadUi'), run: () => { try { window.location.reload() } catch { /* ignore */ } } },
              })
            }
          } else {
            setNotice({ kind: 'err', text: t('failed', { error: result.error }) })
          }
          await load(true)
        } finally {
          lockRef.current = false
          setBusy(null)
        }
      }, [applyUpdate, load, t, busy])

      const updateAll = React.useCallback(async () => {
        if (!data || lockRef.current || busy !== null) return
        const pending = data.plugins.filter((row) => row.updateAvailable)
        if (pending.length === 0) return
        lockRef.current = true
        setNotice(null)
        setBulkBusy(true)
        const results = []
        let failed = 0
        try {
          for (const row of pending) {
            setBusy(row.name)
            const result = await applyUpdate(row)
            results.push({
              name: row.name,
              from: row.version,
              to: row.latest,
              ok: result.ok,
              restart: result.application === 'restart-required',
            })
            if (!result.ok) failed += 1
          }
          const needsRestart = results.some((item) => item.ok && item.restart)
          bannerStore.set({
            kind: failed === 0 ? 'ok' : 'error',
            items: results,
            needsRestart,
            action: needsRestart
              ? { label: t('restartApp'), run: () => requestRestart() }
              : (failed === 0 ? { label: t('reloadUi'), run: () => { try { window.location.reload() } catch { /* ignore */ } } } : null),
          })
          await load(true)
        } finally {
          lockRef.current = false
          setBusy(null)
          setBulkBusy(false)
        }
      }, [data, applyUpdate, load])

      // Rollback only for npm-installed plugins, and only one update flow at a time.
      const openRollback = React.useCallback(async (row) => {
        if (rollbackName === row.name) {
          setRollbackName(null)
          return
        }
        setRollbackName(row.name)
        setRollbackData(null)
        setRollbackError(null)
        setRollbackLoading(true)
        try {
          const response = await fetch(`${API}/versions?name=${encodeURIComponent(row.name)}`)
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            throw new Error(body && body.error ? body.error : `HTTP ${response.status}`)
          }
          setRollbackData(body)
        } catch (error) {
          setRollbackError(error && error.message ? error.message : String(error))
        } finally {
          setRollbackLoading(false)
        }
      }, [rollbackName])

      const installVersion = React.useCallback(async (row, version, ref) => {
        if (lockRef.current || busy !== null) return
        lockRef.current = true
        setBusy(row.name)
        setNotice(null)
        try {
          const response = await fetch(`${API}/install`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: row.name, version, spec: ref || null }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: t('failed', { error: body && body.error ? body.error : `HTTP ${response.status}` }) })
          } else {
            setNotice({ kind: 'ok', text: t('rolledBack', { name: row.name, version }) })
            setRollbackName(null)
          }
          await load(true)
        } finally {
          lockRef.current = false
          setBusy(null)
        }
      }, [busy, load, t])

      const toggleRow = React.useCallback(async (row) => {
        if (busy !== null) return
        setBusy(row.name)
        setNotice(null)
        const nextEnabled = row.enabled === false
        try {
          const response = await fetch(`${API}/toggle`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: row.name, enabled: nextEnabled }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: body && body.error ? body.error : `HTTP ${response.status}` })
          } else {
            setNotice({
              kind: 'ok',
              text: nextEnabled ? t('enabledNotice', { name: row.name }) : t('disabledNotice', { name: row.name }),
            })
          }
          await load(true)
        } finally {
          setBusy(null)
        }
      }, [busy, load, t])

      const enablePending = React.useCallback(async () => {
        const names = data && data.pending && Array.isArray(data.pending.disabled) ? data.pending.disabled : []
        for (const name of names) {
          try {
            await fetch(`${API}/toggle`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name, enabled: true }),
            })
          } catch {
            /* keep going */
          }
        }
        await load(true)
      }, [data, load])

      const addSource = React.useCallback(async () => {
        const url = gitUrl.trim()
        if (!url || addingSource) return
        setAddingSource(true)
        setNotice(null)
        try {
          const response = await fetch(`${API}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'add', url }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: body && body.error ? body.error : `HTTP ${response.status}` })
          } else {
            setGitUrl('')
            await load(true)
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        } finally {
          setAddingSource(false)
        }
      }, [gitUrl, addingSource, load])

      const removeSource = React.useCallback(async (repo) => {
        try {
          await fetch(`${API}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'remove', url: repo }),
          })
          await load(true)
        } catch {
          /* ignore */
        }
      }, [load])

      const loadGuide = React.useCallback(async (repo) => {
        if (guideRepo === repo) {
          setGuideRepo(null)
          return
        }
        setGuideRepo(repo)
        setGuideData(null)
        setGuideLoading(true)
        try {
          const response = await fetch(`${API}/guide?repo=${encodeURIComponent(repo)}`)
          const body = await response.json().catch(() => null)
          setGuideData(body)
        } catch (error) {
          setGuideData({ ok: false, error: error && error.message ? error.message : String(error) })
        } finally {
          setGuideLoading(false)
        }
      }, [guideRepo])

      const installSource = React.useCallback(async (item) => {
        if (sourceBusy !== null) return
        setSourceBusy(item.repo)
        setNotice(null)
        try {
          const response = await fetch(`${API}/install-git`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: `github:${item.repo}` }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: body && body.error ? body.error : `HTTP ${response.status}` })
          } else {
            setNotice({ kind: 'ok', text: t('installedGit', { spec: body.spec || item.repo }) })
            await load(true)
            await loadGuide(item.repo)
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        } finally {
          setSourceBusy(null)
        }
      }, [sourceBusy, load, t, loadGuide])

      const openFolder = React.useCallback(async (target) => {
        try {
          const response = await fetch(`${API}/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: body && body.error ? body.error : `HTTP ${response.status}` })
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        }
      }, [])

      const loadTokenState = React.useCallback(async () => {
        try {
          const response = await fetch(`${API}/settings`)
          const body = await response.json().catch(() => null)
          if (body && body.ok) setTokenState(body)
        } catch {
          /* ignore */
        }
      }, [])

      React.useEffect(() => {
        void loadTokenState()
      }, [loadTokenState])

      const saveToken = React.useCallback(async () => {
        setNotice(null)
        try {
          const response = await fetch(`${API}/settings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ githubToken: tokenInput.trim() }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            setNotice({ kind: 'err', text: body && body.error ? body.error : `HTTP ${response.status}` })
          } else {
            setTokenState(body)
            setTokenInput('')
            setNotice({ kind: 'ok', text: t('tokenSaved') })
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        }
      }, [tokenInput, t])

      const toggleSafeModeAuto = React.useCallback(async () => {
        const next = !(tokenState && tokenState.safeModeAuto)
        try {
          const response = await fetch(`${API}/settings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ safeModeAuto: next }),
          })
          const body = await response.json().catch(() => null)
          if (body && body.ok) setTokenState(body)
        } catch {
          /* ignore */
        }
      }, [tokenState])

      const clearToken = React.useCallback(async () => {
        setNotice(null)
        try {
          const response = await fetch(`${API}/settings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ githubToken: '' }),
          })
          const body = await response.json().catch(() => null)
          if (body && body.ok) setTokenState(body)
        } catch {
          /* ignore */
        }
      }, [])

      const installNpm = React.useCallback(async () => {
        const spec = npmSpec.trim()
        if (!spec || installingNpm) return
        setInstallingNpm(true)
        setNotice(null)
        try {
          const response = await fetch(`${API}/install-npm`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ spec }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            const hint = diagnose(body && body.error)
            setNotice({ kind: 'err', text: hint || (body && body.error) || `HTTP ${response.status}` })
          } else {
            setNotice({ kind: 'ok', text: t('installedNpm', { spec: body.spec || spec }) })
            setNpmSpec('')
            await load(true)
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        } finally {
          setInstallingNpm(false)
        }
      }, [npmSpec, installingNpm, load, t])

      const uninstallRow = React.useCallback(async (row) => {
        if (busy !== null) return
        setBusy(row.name)
        setNotice(null)
        try {
          const response = await fetch(`${API}/uninstall`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: row.name }),
          })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok === false) {
            const hint = diagnose(body && body.error)
            setNotice({ kind: 'err', text: hint || (body && body.error) || `HTTP ${response.status}` })
          } else {
            setNotice({ kind: 'ok', text: t('uninstalled', { name: row.name }) })
            await load(true)
          }
        } catch (error) {
          setNotice({ kind: 'err', text: error && error.message ? error.message : String(error) })
        } finally {
          setBusy(null)
          setConfirmUninstall(null)
        }
      }, [busy, load, t])

      const reloadUi = () => {
        try {
          window.location.reload()
        } catch {
          /* ignore */
        }
      }

      const restartNow = React.useCallback(async () => {
        if (restarting) return
        setRestarting(true)
        const result = await requestRestart()
        if (!result.ok) {
          setNotice({ kind: 'err', text: t('restartRefused', { reason: result.error }) })
        }
        setRestarting(false)
      }, [restarting, t])

      const toggleAutoUpdate = () => {
        const next = !autoUpdate
        setAutoUpdate(next)
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dsh-concierge:auto', next ? '1' : '0')
          }
        } catch {
          /* storage unavailable: the switch still works for this session */
        }
      }

      const refreshDesktop = () => {
        if (!DESKTOP_UPDATES) return
        try {
          Promise.resolve(DESKTOP_UPDATES.status()).then((state) => setDesktopState(state || null)).catch(() => {})
        } catch {
          /* bridge unavailable */
        }
      }

      const autoKey = data
        ? data.plugins.filter((row) => row.updateAvailable).map((row) => `${row.name}@${row.latest}`).join('|')
        : ''

      React.useEffect(() => {
        if (!autoUpdate || !data || loading || busy !== null || lockRef.current) return
        if (!autoKey || autoKey === autoKeyRef.current) return
        autoKeyRef.current = autoKey
        updateAll()
      }, [autoUpdate, data, loading, busy, autoKey, updateAll])

      // A detected update is announced as the top banner, never as a popup.
      React.useEffect(() => {
        if (!data) return
        const bridgeUpdating = Boolean(DESKTOP_UPDATES && desktopState && (
          desktopState.phase === 'available' ||
          desktopState.phase === 'downloading' ||
          desktopState.phase === 'installing' ||
          desktopState.phase === 'ready' ||
          desktopState.phase === 'starting'
        ))
        const appNew = Boolean(data.app && bridgeUpdating)
        const appVersion = appNew && desktopState && desktopState.version ? desktopState.version : (data.app ? data.app.latest : null)
        const pending = data.plugins.filter((row) => row.updateAvailable)
        if (!appNew && (pending.length === 0 || autoUpdate)) return
        const key = `${appNew ? appVersion : ''}|${pending.map((row) => `${row.name}@${row.latest}`).join(',')}`
        if (announceRef.current === key) return
        announceRef.current = key
        const parts = []
        if (appNew) parts.push(`DeepSeek Harness ${data.app.current} → ${appVersion}`)
        if (pending.length > 0) parts.push(t('bannerPlugins', { n: pending.length }))
        bannerStore.set({
          kind: 'update',
          title: t('bannerUpdateTitle'),
          detail: parts.join(' · '),
          action: appNew && DESKTOP_UPDATES
            ? {
                label: t('desktopUpdate'),
                run: () => {
                  try {
                    DESKTOP_UPDATES.open()
                  } catch {
                    /* bridge unavailable */
                  }
                },
              }
            : null,
        })
      }, [data, autoUpdate, desktopState, t])

      const app = data ? data.app : null
      const rows = data ? data.plugins : []
      const updatable = rows.filter((row) => row.updateAvailable).length
      const needle = query.trim().toLowerCase()
      const visible = (filter === 'updates' ? rows.filter((row) => row.updateAvailable) : rows)
        .filter((row) => {
          if (!needle) return true
          const name = String(row.name || '').toLowerCase()
          const title = String(localizedText(row.title, active) || '').toLowerCase()
          return name.includes(needle) || title.includes(needle)
        })
      const desktopPhase = desktopState && desktopState.phase && desktopState.phase !== 'idle' ? desktopState : null

      // The app card follows the desktop shell's own updater, not the feed: a newer
      // version on the mirror/feed only counts when the shell reports it, because
      // only the shell can run the official update.
      const bridgeUpdate = Boolean(DESKTOP_UPDATES && desktopState && (
        desktopState.phase === 'available' ||
        desktopState.phase === 'downloading' ||
        desktopState.phase === 'installing' ||
        desktopState.phase === 'ready' ||
        desktopState.phase === 'starting'
      ))
      const appNew = Boolean(app && bridgeUpdate)
      const appNext = appNew && desktopState && desktopState.version ? desktopState.version : (app ? app.latest : null)

      const kindOf = (row) => (row.kind === 'git' ? 'git' : row.kind === 'registry' ? 'registry' : 'local')
      const groups = ['registry', 'git', 'local']
        .map((key) => ({
          key,
          label: t(key === 'registry' ? 'groupRegistry' : key === 'git' ? 'groupGit' : 'groupLocal'),
          rows: visible.filter((row) => kindOf(row) === key),
        }))
        .filter((group) => group.rows.length > 0)

      const tabButton = (key, label) => h('button', {
        type: 'button',
        className: 'uc-tab',
        role: 'tab',
        'data-active': tab === key ? 'true' : 'false',
        'aria-selected': tab === key ? 'true' : 'false',
        onClick: () => setTab(key),
      }, label)

      return h('div', { className: 'uc-root' },
        h('style', null, CSS),

        h('header', { className: 'uc-head' },
          h('div', null,
            h('div', { className: 'uc-kicker' }, t('kicker')),
            h('h2', { className: 'uc-title' }, t('title')),
            h('p', { className: 'uc-sub' }, t('subtitle')),
          ),
        ),

        h('div', { className: 'uc-tabs', role: 'tablist' },
          tabButton('update', t('tabUpdate')),
          tabButton('plugins', t('tabPlugins')),
          tabButton('add', t('tabAdd')),
          tabButton('perf', t('tabPerf')),
          tabButton('typer', t('tabTyper')),
          tabButton('about', t('tabAbout')),
        ),

        loading ? h('div', { className: 'uc-progress', role: 'progressbar' }) : null,

        data && data.pending && Array.isArray(data.pending.disabled) && data.pending.disabled.length > 0
          ? h('div', { className: 'uc-notice uc-notice-err' },
              h('span', null, t('pendingDisabled', {
                count: data.pending.disabled.length,
                names: data.pending.disabled.join('、'),
              })),
              h('button', { type: 'button', className: 'uc-btn', onClick: enablePending }, t('enableAll')),
            )
          : null,

        notice
          ? h('div', { className: notice.kind === 'ok' ? 'uc-notice uc-notice-ok' : 'uc-notice uc-notice-err' },
              h('span', null, notice.text),
              notice.restart && restartReady
                ? h('button', {
                    type: 'button',
                    className: 'uc-btn',
                    disabled: restarting,
                    onClick: restartNow,
                  }, restarting ? t('restartingApp') : t('restartApp'))
                : null,
              h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: () => setNotice(null) }, t('bannerDismiss')),
            )
          : null,

        loadError && !data
          ? h('div', { className: 'uc-card' },
              h('div', { className: 'uc-row-err', style: { padding: '14px 18px 0' } }, t('loadError', { error: loadError })),
              h('div', { style: { padding: '10px 18px 16px' } },
                h('button', { type: 'button', className: 'uc-btn', onClick: () => load(true) }, t('retry')),
              ),
            )
          : null,



        app && tab === 'update'
          ? h('section', { className: 'uc-hero' },
              h('div', { className: 'uc-glow' }),
              h('div', { className: 'uc-hero-body' },
                h('div', { className: 'uc-hero-kicker' }, `${app.packageName || 'DeepSeek Harness'} · ${app.mode === 'desktop' ? t('kicker') : 'Web'}`),
                h('div', { className: 'uc-hero-line' },
                  h('span', { className: 'uc-hero-version' }, app.current || '—'),
                  appNew && appNext
                    ? h('span', { className: 'uc-hero-arrow' }, '→')
                    : null,
                  appNew && appNext
                    ? h('span', { className: 'uc-hero-next' }, appNext)
                    : null,
                ),
                h('div', { className: 'uc-hero-meta' },
                  app.channel ? h('span', { className: 'uc-chip' }, app.channel) : null,
                  appNew
                    ? h('span', { className: 'uc-chip uc-chip-warn' }, t('phase_available'))
                    : h('span', { className: 'uc-chip uc-chip-ok' }, t('upToDate')),
                  desktopPhase
                    ? h('span', { className: 'uc-chip' }, t('desktopPhase', {
                        phase: phaseLabel(desktopPhase.phase, t),
                        percent: typeof desktopPhase.percent === 'number' ? ` ${desktopPhase.percent}%` : '',
                      }))
                    : null,
                ),
                app.error ? h('div', { className: 'uc-row-err' }, app.error) : null,
              ),
              h('div', { className: 'uc-hero-actions' },
                appNew && !appDismissed && DESKTOP_UPDATES
                  ? [
                      h('button', {
                        key: 'recheck',
                        type: 'button',
                        className: 'uc-btn',
                        onClick: () => {
                          setAppDismissed(false)
                          refreshDesktop()
                          load(true)
                        },
                      }, t('recheck')),
                      h('button', {
                        key: 'update',
                        type: 'button',
                        className: 'uc-btn uc-btn-accent',
                        onClick: () => {
                          try {
                            DESKTOP_UPDATES.open()
                          } catch {
                            /* bridge unavailable */
                          }
                        },
                      }, t('desktopUpdate')),
                      h('button', {
                        key: 'cancel',
                        type: 'button',
                        className: 'uc-btn',
                        onClick: () => setAppDismissed(true),
                      }, t('cancel')),
                    ]
                  : null,
                appNew && !appDismissed && !DESKTOP_UPDATES && app.downloadUrl
                  ? h('a', {
                      key: 'download',
                      className: 'uc-btn uc-btn-accent',
                      href: app.downloadUrl,
                      target: '_blank',
                      rel: 'noreferrer',
                    }, t('desktopUpdate'))
                  : null,
                app.githubUrl
                  ? h('a', {
                      key: 'github',
                      className: 'uc-btn',
                      href: app.githubUrl,
                      target: '_blank',
                      rel: 'noreferrer',
                    }, t('githubReleases'))
                  : null,
              ),
            )
          : null,

        tab === 'update'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-perf' },
                settingRow(t('auto'), t('autoHint'), switchControl(autoUpdate, toggleAutoUpdate)),
              ),
            )
          : null,

        data && tab === 'update'
          ? h('div', { className: 'uc-stats' },
              h('div', { className: 'uc-stat' },
                h('div', { className: 'uc-stat-value' }, String(rows.length)),
                h('div', { className: 'uc-stat-label' }, t('statPlugins')),
              ),
              h('div', { className: 'uc-stat' },
                h('div', { className: updatable > 0 ? 'uc-stat-value uc-stat-value-hot' : 'uc-stat-value' }, String(updatable)),
                h('div', { className: 'uc-stat-label' }, t('statUpdates')),
              ),
              h('div', { className: 'uc-stat' },
                h('div', { className: 'uc-stat-value', style: { fontSize: '15px', paddingTop: '4px' } }, relativeTime(data.checkedAt, t)),
                h('div', { className: 'uc-stat-label' }, t('statChecked')),
              ),
            )
          : null,



        tab === 'update' ? h('div', { className: 'uc-toolbar' },
          h('button', {
            type: 'button',
            className: 'uc-btn',
            disabled: loading || busy !== null,
            onClick: () => load(true),
          }, loading ? t('checking') : t('check')),
          updatable > 0
            ? h('button', {
                type: 'button',
                className: 'uc-btn uc-btn-accent',
                disabled: busy !== null,
                onClick: updateAll,
              }, bulkBusy ? t('updating') : `${t('updateAll')} ${updatable}`)
            : null,
          h('button', { type: 'button', className: 'uc-btn', onClick: reloadUi }, t('reloadUi')),
          h('button', {
            type: 'button',
            className: 'uc-btn',
            disabled: restarting,
            onClick: restartNow,
          }, restarting ? t('restartingApp') : t('restartApp')),
        ) : null,

        tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('safetyTitle')),
              ),
              h('div', { className: 'uc-perf' },
                settingRow(t('safeModeAuto'), t('safeModeAutoHint'), switchControl(
                  Boolean(tokenState && tokenState.safeModeAuto),
                  toggleSafeModeAuto,
                )),
              ),
            )
          : null,

        tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('lookTitle')),
              ),
              h('div', { className: 'uc-perf' },
                settingRow(t('lookEnabled'), t('lookEnabledHint'), switchControl(lookSnapshot.enabled, () => {
                  look.enabled = !look.enabled
                  saveLookPrefs()
                  applyLook()
                  lookUpdate()
                })),
                settingRow(t('lookPreference'), null,
                  h('select', {
                    className: 'uc-select',
                    value: lookSnapshot.preference,
                    disabled: !lookSnapshot.enabled,
                    onChange: (event) => {
                      look.preference = event.target.value
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    },
                  },
                    h('option', { value: 'system' }, t('lookPreferenceSystem')),
                    h('option', { value: 'light' }, t('lookPreferenceLight')),
                    h('option', { value: 'dark' }, t('lookPreferenceDark')),
                  )),
                settingRow(t('lookSkin'), null,
                  h('select', {
                    className: 'uc-select',
                    value: lookSnapshot.skin,
                    disabled: !lookSnapshot.enabled,
                    onChange: (event) => {
                      look.skin = event.target.value
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    },
                  },
                    h('option', { value: 'soft' }, t('lookSkinSoft')),
                    h('option', { value: 'ink' }, t('lookSkinInk')),
                    h('option', { value: 'ocean' }, t('lookSkinOcean')),
                    h('option', { value: 'glass' }, t('lookSkinGlass')),
                  )),
                lookSnapshot.skin === 'glass'
                  ? settingRow(t('lookGrain'), null,
                      h('div', { className: 'uc-typer' },
                        h('input', {
                          type: 'range',
                          min: 0,
                          max: 20,
                          step: 1,
                          value: Math.round((lookSnapshot.grain || 0) * 100),
                          disabled: !lookSnapshot.enabled,
                          onChange: (event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value)) return
                            applyGrain(Math.round(value) / 100)
                            scheduleLookSave()
                          },
                        }),
                        h('span', { className: 'uc-typer-value' }, `${Math.round((lookSnapshot.grain || 0) * 100)}%`),
                      ))
                  : null,
                settingRow(t('lookBrand'), null,
                  h('select', {
                    className: 'uc-select',
                    value: lookSnapshot.brand,
                    disabled: !lookSnapshot.enabled,
                    onChange: (event) => {
                      look.brand = event.target.value
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    },
                  },
                    h('option', { value: 'default' }, t('lookBrandDefault')),
                    h('option', { value: 'indigo' }, t('lookBrandIndigo')),
                    h('option', { value: 'violet' }, t('lookBrandViolet')),
                    h('option', { value: 'green' }, t('lookBrandGreen')),
                    h('option', { value: 'amber' }, t('lookBrandAmber')),
                  )),
                settingRow(t('lookFont'), null,
                  h('select', {
                    className: 'uc-select',
                    value: String(lookSnapshot.fontStep),
                    disabled: !lookSnapshot.enabled,
                    onChange: (event) => {
                      const value = Number(event.target.value)
                      if (!LOOK_FONT_STEPS.includes(value)) return
                      look.fontStep = value
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    },
                  },
                    h('option', { value: '-1' }, t('lookFontSmall')),
                    h('option', { value: '0' }, t('lookFontStandard')),
                    h('option', { value: '1' }, t('lookFontLarge')),
                  )),
                settingRow(t('lookCodeFont'), null,
                  h('select', {
                    className: 'uc-select',
                    value: lookSnapshot.codeFont,
                    disabled: !lookSnapshot.enabled,
                    onChange: (event) => {
                      look.codeFont = event.target.value
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    },
                  },
                    h('option', { value: 'default' }, t('lookCodeFontDefault')),
                    h('option', { value: 'consolas' }, 'Cascadia / Consolas'),
                    h('option', { value: 'jetbrains' }, 'JetBrains Mono'),
                    h('option', { value: 'fira' }, 'Fira Code'),
                  )),
                lookSnapshot.skin === 'glass'
                  ? settingRow(t('lookTransparency'), null,
                      h('div', { className: 'uc-typer' },
                        h('input', {
                          type: 'range',
                          min: 0,
                          max: 100,
                          step: 1,
                          value: lookSnapshot.transparency,
                          disabled: !lookSnapshot.enabled,
                          onChange: (event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value)) return
                            look.transparency = Math.max(0, Math.min(100, Math.round(value)))
                            scheduleLookApply()
                          },
                        }),
                        h('span', { className: 'uc-typer-value' }, `${lookSnapshot.transparency}%`),
                      ))
                  : null,
                lookSnapshot.skin === 'glass'
                  ? settingRow(t('lookLightGlass'), t('lookLightGlassHint'), switchControl(lookSnapshot.lightGlass, () => {
                      look.lightGlass = !look.lightGlass
                      saveLookPrefs()
                      applyLook()
                      lookUpdate()
                    }))
                  : null,
                lookSnapshot.skin === 'glass'
                  ? settingRow(t('lookSquareWindow'), t('lookSquareWindowHint'), switchControl(lookSnapshot.squareWindow, () => {
                      look.squareWindow = !look.squareWindow
                      saveLookPrefs()
                      applyWindowCorners(true)
                      lookUpdate()
                    }))
                  : null,
                lookSnapshot.skin === 'glass'
                  ? settingRow(t('lookWall'), lookSnapshot.wall.mode === 'video' ? t('lookWallVideoHint') : null,
                      h('select', {
                        className: 'uc-select',
                        value: lookSnapshot.wall.mode,
                        disabled: !lookSnapshot.enabled,
                        onChange: (event) => {
                          look.wall = { ...look.wall, mode: event.target.value }
                          saveLookPrefs()
                          applyLook()
                          lookUpdate()
                        },
                      },
                        h('option', { value: 'preset' }, t('lookWallPreset')),
                        h('option', { value: 'image' }, t('lookWallImage')),
                        h('option', { value: 'video' }, t('lookWallVideo')),
                      ))
                  : null,
                lookSnapshot.skin === 'glass' && lookSnapshot.wall.mode !== 'preset'
                  ? h('div', { className: 'uc-install' },
                      h('input', {
                        type: 'text',
                        value: wallDraft,
                        placeholder: t('lookWallPlaceholder'),
                        onChange: (event) => setWallDraft(event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter') applyWallDraft()
                        },
                      }),
                      h('button', {
                        type: 'button',
                        className: 'uc-btn uc-btn-accent',
                        disabled: wallDraft.trim() === '',
                        onClick: applyWallDraft,
                      }, t('lookWallApply')),
                    )
                  : null,
                h('p', { className: 'uc-perf-hint' }, t('lookHint')),
              ),
            )
          : null,

        data && tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('sourcesTitle')),
              ),
              h('div', { className: 'uc-install' },
                h('input', {
                  type: 'text',
                  value: gitUrl,
                  placeholder: t('sourcePlaceholder'),
                  onChange: (event) => setGitUrl(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') addSource()
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'uc-btn uc-btn-accent',
                  disabled: addingSource || gitUrl.trim() === '',
                  onClick: addSource,
                }, addingSource ? t('adding') : t('addSource')),
              ),
              Array.isArray(data.sources) && data.sources.length > 0
                ? h('div', { className: 'uc-sources' },
                    data.sources.map((item) => [
                      h('div', { key: item.repo, className: 'uc-source' },
                      h('div', { className: 'uc-source-main' },
                        h('a', {
                          className: 'uc-source-repo',
                          href: item.url,
                          target: '_blank',
                          rel: 'noreferrer',
                        }, item.repo),
                        h('div', { className: 'uc-source-meta' },
                          item.latest ? `${t('sourceLatest')} ${item.latest}` : t('sourceNoRelease'),
                          item.installed ? ` · ${t('sourceInstalled')} ${item.installedVersion}` : ` · ${t('sourceNotInstalled')}`,
                          item.updateAvailable ? h('span', { className: 'uc-tag uc-tag-hot' }, t('sourceHasUpdate')) : null,
                          item.error ? h('span', { className: 'uc-tag' }, item.error) : null,
                        ),
                      ),
                      h('div', { className: 'uc-source-actions' },
                        h('button', {
                          type: 'button',
                          className: 'uc-btn uc-btn-ghost',
                          disabled: sourceBusy !== null,
                          onClick: () => installSource(item),
                        }, sourceBusy === item.repo ? t('installing') : item.installed ? t('sourceReinstall') : t('sourceInstall')),
                        h('button', {
                          type: 'button',
                          className: 'uc-btn uc-btn-ghost',
                          onClick: () => loadGuide(item.repo),
                        }, t('guideButton')),
                        h('button', {
                          type: 'button',
                          className: 'uc-btn uc-btn-ghost',
                          onClick: () => removeSource(item.repo),
                        }, t('sourceRemove')),
                      ),
                    ),
                    guideRepo === item.repo
                      ? h('div', { key: `${item.repo}-guide`, className: 'uc-guide' },
                          guideLoading ? h('div', { className: 'uc-muted' }, t('guideLoading')) : null,
                          !guideLoading && guideData && guideData.ok && Array.isArray(guideData.steps) && guideData.steps.length > 0
                            ? h('div', null,
                                h('div', { className: 'uc-guide-title' }, t('guideTitle')),
                                h('ol', { className: 'uc-guide-steps' },
                                  guideData.steps.map((step, index) => h('li', { key: index }, step)),
                                ),
                                h('div', { className: 'uc-guide-actions' },
                                  h('button', { type: 'button', className: 'uc-btn', onClick: restartNow }, t('restartApp')),
                                  h('a', {
                                    className: 'uc-btn uc-btn-ghost',
                                    href: guideData.url,
                                    target: '_blank',
                                    rel: 'noreferrer',
                                  }, t('guideReadme')),
                                ),
                              )
                            : null,
                          !guideLoading && guideData && (!guideData.ok || !Array.isArray(guideData.steps) || guideData.steps.length === 0)
                            ? h('div', { className: 'uc-muted' }, t('guideEmpty'))
                            : null,
                        )
                      : null,
                    ]),
                  )
                : h('div', { className: 'uc-muted', style: { padding: '4px 18px 14px' } }, t('sourceEmpty')),
            )
          : null,

        tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('installNpm')),
              ),
              h('div', { className: 'uc-install' },
                h('input', {
                  type: 'text',
                  value: npmSpec,
                  placeholder: t('installNpmPlaceholder'),
                  onChange: (event) => setNpmSpec(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') installNpm()
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'uc-btn uc-btn-accent',
                  disabled: installingNpm || npmSpec.trim() === '',
                  onClick: installNpm,
                }, installingNpm ? t('installingNpm') : t('installNpm')),
              ),
            )
          : null,

        data && tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('tokenTitle')),
                tokenState
                  ? h('span', {
                      className: tokenState.hasToken ? 'uc-chip uc-chip-ok' : 'uc-chip',
                    }, tokenState.fromEnv
                      ? t('tokenFromEnvChip')
                      : tokenState.hasToken
                        ? t('tokenConfigured')
                        : t('tokenMissing'))
                  : null,
              ),
              tokenState && tokenState.hasToken
                ? h('div', { className: 'uc-token-current' },
                    h('span', { className: 'uc-token-mono' }, tokenState.masked || '****'),
                    h('span', { className: 'uc-token-current-hint' },
                      tokenState.fromEnv ? t('tokenFromEnv') : t('tokenSavedHint')),
                  )
                : null,
              h('div', { className: 'uc-install' },
                h('input', {
                  type: 'password',
                  value: tokenInput,
                  placeholder: tokenState && tokenState.hasToken ? t('tokenReplacePlaceholder') : t('tokenPlaceholder'),
                  onChange: (event) => setTokenInput(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') saveToken()
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'uc-btn uc-btn-accent',
                  disabled: tokenInput.trim() === '',
                  onClick: saveToken,
                }, t('tokenSave')),
                tokenState && tokenState.hasToken && !tokenState.fromEnv
                  ? h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: clearToken }, t('tokenClear'))
                  : null,
              ),
              h('div', { className: 'uc-token-doc' },
                h('p', null, tokenState && tokenState.fromEnv ? t('tokenFromEnv') : t('tokenDocWhy')),
                h('p', null, t('tokenDocHow')),
                h('div', { className: 'uc-token-links' },
                  h('a', {
                    className: 'uc-token-link',
                    href: 'https://github.com/settings/personal-access-tokens/new',
                    target: '_blank',
                    rel: 'noreferrer',
                  }, t('tokenLinkFine')),
                  h('a', {
                    className: 'uc-token-link',
                    href: 'https://github.com/settings/tokens',
                    target: '_blank',
                    rel: 'noreferrer',
                  }, t('tokenLinkClassic')),
                ),
                h('p', null, t('tokenDocHow2')),
                h('p', null, t('tokenDocWhere')),
              ),
            )
          : null,

        tab === 'add'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('foldersTitle')),
              ),
              h('div', { className: 'uc-folder-actions' },
                h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: () => openFolder('plugins') }, t('openPlugins')),
                h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: () => openFolder('config') }, t('openConfig')),
                h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: () => openFolder('safe') }, t('openSafeFolder')),
              ),
              h('p', { className: 'uc-folder-hint' }, t('safeModeHint')),
            )
          : null,

        data && tab === 'plugins'
          ? h('section', { className: 'uc-card' },
              h('div', { className: 'uc-card-head' },
                h('div', { className: 'uc-card-title' }, t('plugins')),
                h('div', { className: 'uc-card-actions' },
                  h('div', { className: 'uc-segment' },
                    h('button', {
                      type: 'button',
                      className: filter === 'all' ? 'on' : undefined,
                      onClick: () => setFilter('all'),
                    }, `${t('filterAll')} ${rows.length}`),
                    h('button', {
                      type: 'button',
                      className: filter === 'updates' ? 'on' : undefined,
                      onClick: () => setFilter('updates'),
                    }, `${t('filterUpdates')} ${updatable}`),
                  ),
                ),
              ),
              h('div', { className: 'uc-search' },
                h('input', {
                  type: 'search',
                  value: query,
                  placeholder: t('searchPlugins'),
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              visible.length === 0
                ? h('div', { className: 'uc-empty' },
                    h('span', { className: 'uc-empty-icon' },
                      h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true },
                        h('path', { d: 'M20 6 9 17l-5-5' }),
                      ),
                    ),
                    h('span', null, rows.length === 0 ? t('noPlugins') : t('noUpdates')),
                  )
                : h('div', { className: 'uc-rows' },
                    groups.map((group) => {
                      const hot = group.rows.filter((row) => row.updateAvailable).length
                      return h('div', { key: group.key, className: 'uc-group' },
                        h('div', { className: 'uc-group-head' },
                          h('span', { className: 'uc-group-label' }, group.label),
                          h('span', { className: hot > 0 ? 'uc-group-count uc-group-count-hot' : 'uc-group-count' }, hot > 0 ? `${hot}/${group.rows.length}` : String(group.rows.length)),
                        ),
                        group.rows.map((row) => [
                          renderRow(row, {
                            t,
                            active,
                            busy,
                            onUpdate: updateOne,
                            onRollback: openRollback,
                            onToggle: toggleRow,
                            onAskUninstall: (item) => setConfirmUninstall(item.name),
                            confirmUninstall,
                            onUninstall: uninstallRow,
                            ignored: ignoreMap[row.name] === row.latest,
                            onIgnore: () => setIgnore(row.name, row.latest),
                            onUnignore: () => setIgnore(row.name, null),
                            openLog,
                            onToggleLog: (name) => setOpenLog(openLog === name ? null : name),
                          }),
                          rollbackName === row.name
                            ? h('div', { key: `${row.name}-versions`, className: 'uc-versions' },
                                h('div', { className: 'uc-versions-head' },
                                  h('span', null, t('versionsTitle')),
                                  rollbackLoading ? h('span', { className: 'uc-muted' }, t('checking')) : null,
                                ),
                                rollbackError ? h('div', { className: 'uc-row-err' }, rollbackError) : null,
                                rollbackData && Array.isArray(rollbackData.versions)
                                  ? h('div', { className: 'uc-versions-list' },
                                      rollbackData.versions.map((item) => h('div', { key: item.version, className: 'uc-version' },
                                        h('span', { className: 'uc-version-num' }, item.version),
                                        item.version === rollbackData.current ? h('span', { className: 'uc-tag' }, t('current')) : null,
                                        item.incompatible ? h('span', { className: 'uc-tag' }, t('incompatible')) : null,
                                        item.deprecated ? h('span', { className: 'uc-tag' }, t('deprecated')) : null,
                                        h('span', { className: 'uc-version-spacer' }),
                                        item.version === rollbackData.current
                                          ? null
                                          : h('button', {
                                              type: 'button',
                                              className: 'uc-btn uc-btn-accent',
                                              disabled: busy !== null || item.incompatible,
                                              onClick: () => installVersion(row, item.version, item.ref),
                                            }, t('installVersion')),
                                      )),
                                    )
                                  : null,
                              )
                            : null,
                        ]),
                      )
                    }),
                  ),
            )
          : null,

        tab === 'perf' ? h('section', { className: 'uc-card' },
          h('div', { className: 'uc-card-head' },
            h('div', { className: 'uc-card-title' }, t('boostTitle')),
          ),
          h('div', { className: 'uc-perf' },
            settingRow(t('boostSwitch'), t('boostHint'), switchControl(
              Boolean(boostState && boostState.enabled),
              toggleBoost,
            )),
            h('p', { className: 'uc-perf-hint' },
              boostBusy
                ? t('boostWaiting')
                : boostTimeout
                  ? t('boostTimeout')
                  : !boostState
                    ? t('boostUnknown')
                    : boostState.enabled
                      ? t('boostOn', { time: boostState.at ? new Date(boostState.at).toLocaleString() : '' })
                      : t('boostOff')),
          ),
        ) : null,

        tab === 'perf' ? h('section', { className: 'uc-card' },
          h('div', { className: 'uc-card-head' },
            h('div', { className: 'uc-card-title' }, t('perfTitle')),
          ),
          h('div', { className: 'uc-perf' },
            h('div', { className: 'uc-perf-stats' },
              h('div', { className: 'uc-perf-stat' },
                h('div', { className: 'uc-perf-value' },
                  String(perfSnapshot.fps),
                  h('span', { className: 'uc-perf-cap' }, ` / ${perfSnapshot.refreshOverride > 0 ? perfSnapshot.refreshOverride : perfSnapshot.refresh}`),
                ),
                h('div', { className: 'uc-perf-label' }, t('perfFps')),
              ),
              h('div', { className: 'uc-perf-stat' },
                h('div', { className: 'uc-perf-value' }, String(perfSnapshot.rows)),
                h('div', { className: 'uc-perf-label' }, t('perfRows')),
              ),
              h('div', { className: 'uc-perf-stat' },
                h('div', { className: 'uc-perf-value' }, String(perfSnapshot.longTasks)),
                h('div', { className: 'uc-perf-label' }, t('perfLongTasks')),
              ),
              h('div', { className: 'uc-perf-stat' },
                h('div', { className: 'uc-perf-value' }, `${perfSnapshot.blocking}ms`),
                h('div', { className: 'uc-perf-label' }, t('perfBlocking')),
              ),
            ),
            h('div', { className: 'uc-spark-wrap' },
              h('div', { className: 'uc-spark' },
                (Array.isArray(perfSnapshot.history) ? perfSnapshot.history : []).map((item, index) => h('span', {
                  key: index,
                  className: 'uc-spark-bar',
                  title: `${item.count} · ${item.ms}ms`,
                  style: { height: `${Math.max(8, Math.min(100, Math.round((item.ms / Math.max(1, perfSnapshot.peak)) * 100)))}%` },
                })),
              ),
              h('span', { className: 'uc-spark-cap' }, t('perfPeak', { ms: perfSnapshot.peak })),
            ),
            settingRow(t('perfAuto'), t('perfAutoHint'), switchControl(perfSnapshot.auto, () => {
              perf.auto = !perf.auto
              savePerfPrefs()
              applyPerfMode()
              perfUpdate({})
            })),
            settingRow(t('perfLong'), t('perfLongHint'), switchControl(perfSnapshot.longPref, () => {
              perf.longPref = !perf.longPref
              savePerfPrefs()
              perfUpdate({ longActive: perf.longPref && perf.rows > 60 })
              applyPerfMode()
            })),
            settingRow(t('perfForced'), t('perfForcedHint'), switchControl(perfSnapshot.forced, () => {
              perf.forced = !perf.forced
              savePerfPrefs()
              applyPerfMode()
              perfUpdate({})
            })),
            settingRow(t('perfResize'), t('perfResizeHint'), switchControl(perfSnapshot.resizeShield, () => {
              perf.resizeShield = !perf.resizeShield
              savePerfPrefs()
              perfUpdate({})
            })),
            settingRow(t('perfNoAnim'), t('perfNoAnimHint'), switchControl(perfSnapshot.noAnim, () => {
              perf.noAnim = !perf.noAnim
              savePerfPrefs()
              applyNoAnim()
              perfUpdate({})
            })),
            settingRow(t('perfOffscreen'), t('perfOffscreenHint'), switchControl(perfSnapshot.offscreen, () => {
              perf.offscreen = !perf.offscreen
              savePerfPrefs()
              applyOffscreen()
              perfUpdate({})
            })),
            settingRow(t('perfRefresh'), t('perfRefreshHint'),
              h('select', {
                className: 'uc-select',
                value: String(perfSnapshot.refreshOverride),
                onChange: (event) => {
                  const value = Number(event.target.value)
                  perf.refreshOverride = Number.isFinite(value) ? value : 0
                  savePerfPrefs()
                  perfUpdate({})
                },
              },
                h('option', { value: '0' }, t('perfRefreshAuto')),
                [60, 90, 120, 144, 165, 240].map((rate) => h('option', { key: rate, value: String(rate) }, `${rate}Hz`)),
              )),
            settingRow(t('perfGlassAuto'), t('perfGlassAutoHint'),
              h('span', { className: 'uc-typer-value' }, perfSnapshot.glassAuto ? t('perfGlassAutoOn') : t('perfGlassAutoOff'))),
            h('p', { className: 'uc-perf-hint' }, t('perfHint')),
            h('div', { className: 'uc-hintbox' },
              h('div', { className: 'uc-hintbox-title' }, t('perfTipsTitle')),
              h('ul', { className: 'uc-hintbox-list' },
                h('li', null, t('perfTip1')),
                h('li', null, t('perfTip2')),
                h('li', null, t('perfTip3')),
              ),
            ),
          ),
        ) : null,

        tab === 'typer' ? h('section', { className: 'uc-card' },
          h('div', { className: 'uc-card-head' },
            h('div', { className: 'uc-card-title' }, t('typerTitle')),
          ),
          h('div', { className: 'uc-perf' },
            settingRow(t('typerEnabled'), t('typerEnabledHint'), switchControl(typerSnapshot.enabled, () => {
              typer.enabled = !typer.enabled
              saveTyperPrefs()
              typerUpdate()
            })),
            settingRow(t('typerThrottle'), t('typerThrottleHint'), switchControl(typerSnapshot.throttle, () => {
              typer.throttle = !typer.throttle
              saveTyperPrefs()
              typerUpdate()
            })),
            settingRow(t('typerSpeed'), null,
              h('div', { className: 'uc-typer' },
                h('input', {
                type: 'range',
                min: 10,
                max: 240,
                step: 5,
                value: typerSnapshot.speed,
                disabled: !typerSnapshot.enabled,
                onChange: (event) => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return
                  typer.speed = Math.max(10, Math.min(240, Math.round(value)))
                  saveTyperPrefs()
                  typerUpdate()
                },
              }),
                h('span', { className: 'uc-typer-value' }, String(typerSnapshot.speed)),
              ),
            ),
            h('p', { className: 'uc-perf-hint' }, t('typerHint')),
          ),
        ) : null,

        tab === 'about' ? h('section', { className: 'uc-card' },
          h('div', { className: 'uc-card-head' },
            h('div', { className: 'uc-card-title' }, t('aboutTitle')),
            h('span', { className: 'uc-chip uc-chip-ok' }, aboutData ? `v${aboutData.version}` : '…'),
          ),
          h('div', { className: 'uc-about' },
            h('p', null, t('aboutIntro')),
            aboutData && aboutData.description
              ? h('p', { className: 'uc-about-desc' }, aboutData.description)
              : null,
            h('div', { className: 'uc-about-links' },
              h('a', {
                className: 'uc-token-link',
                href: 'https://github.com/coldrainthreeautumnleaves/dsh-concierge',
                target: '_blank',
                rel: 'noreferrer',
              }, t('aboutRepo')),
              aboutData && aboutData.license ? h('span', { className: 'uc-about-license' }, aboutData.license) : null,
            ),
          ),
        ) : null,

        tab === 'about' ? h('section', { className: 'uc-card' },
          h('div', { className: 'uc-card-head' },
            h('div', { className: 'uc-card-title' }, t('changelogTitle')),
            h('span', { className: 'uc-about-license' }, t('changelogHint')),
          ),
          h('div', { className: 'uc-log' },
            !aboutData || !Array.isArray(aboutData.changelog) || aboutData.changelog.length === 0
              ? h('div', { className: 'uc-empty' }, t('changelogEmpty'))
              : aboutData.changelog.map((entry, index) => {
                  const open = openVersions[entry.version] !== undefined ? openVersions[entry.version] : index === 0
                  return h('div', { className: 'uc-log-entry', key: entry.version },
                    h('button', {
                      type: 'button',
                      className: 'uc-log-head',
                      onClick: () => setOpenVersions({ ...openVersions, [entry.version]: !open }),
                    },
                      h('span', { className: 'uc-log-chevron', 'data-open': open ? '1' : '0' }, '▸'),
                      h('span', { className: 'uc-log-version' }, `v${entry.version}`),
                      h('span', { className: 'uc-log-count' }, t('changelogCount', { n: entry.items.length })),
                    ),
                    open
                      ? h('ul', { className: 'uc-log-items' },
                          entry.items.map((item, itemIndex) => h('li', { key: itemIndex }, item)),
                        )
                      : null,
                  )
                }),
          ),
        ) : null,

        h('footer', { className: 'uc-foot' },
          h('span', null, t('autoHint')),
          h('span', null, data ? relativeTime(data.checkedAt, t) : ''),
        ),
      )
    }

    function renderRow(row, ctx) {
      const {
        t, active, busy, onUpdate, onRollback, onToggle,
        onAskUninstall, confirmUninstall, onUninstall,
        ignored, onIgnore, onUnignore, openLog, onToggleLog,
      } = ctx
      const updating = busy === row.name
      const kindLabel = row.kind === 'registry'
        ? t('kindRegistry')
        : row.kind === 'git'
          ? t('kindGit')
          : t('kindLocal')
      const dotClass = row.updateAvailable
        ? 'uc-dot uc-dot-warn'
        : row.error
          ? 'uc-dot uc-dot-err'
          : row.kind === 'local'
            ? 'uc-dot'
            : 'uc-dot uc-dot-ok'

      return h('div', { key: row.name, className: 'uc-row' },
        h('span', { className: dotClass, 'aria-hidden': true }),
        h('div', { className: 'uc-row-main' },
          h('div', { className: 'uc-row-name' },
            h('span', null, localizedText(row.title, active) || row.name),
            h('span', { className: 'uc-tag' }, kindLabel),
            row.enabled === false ? h('span', { className: 'uc-tag' }, 'disabled') : null,
            row.homepage
              ? h('a', {
                  className: 'uc-row-link',
                  href: row.homepage,
                  target: '_blank',
                  rel: 'noreferrer',
                  title: row.homepage,
                }, '↗')
              : null,
          ),
          h('div', { className: 'uc-row-pkg' }, row.name),
          row.error ? h('div', { className: 'uc-row-err' }, row.error) : null,
          row.notes && row.notes.length > 0
            ? h('div', { className: 'uc-row-note' }, row.notes.join(' · '))
            : null,
          row.changelog && openLog === row.name
            ? h('div', { className: 'uc-changelog' }, row.changelog)
            : null,
        ),
        h('div', { className: 'uc-vers' },
          h('span', null, row.version),
          row.updateAvailable && row.latest
            ? h('span', { className: 'uc-vers-next' }, `→ ${row.latest}`)
            : null,
        ),
        h('div', { className: 'uc-row-act' },
          row.updateAvailable && !ignored
            ? h('button', {
                type: 'button',
                className: 'uc-btn uc-btn-accent',
                disabled: busy !== null,
                onClick: () => onUpdate(row),
              }, updating ? t('updating') : t('update'))
            : row.updateAvailable && ignored
              ? h('span', { className: 'uc-muted' }, t('ignoredVersion', { version: row.latest }))
              : h('span', { className: 'uc-muted' }, row.kind === 'local' ? t('local') : t('upToDate')),
          row.updateAvailable
            ? ignored
              ? h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: onUnignore }, t('unignore'))
              : h('button', { type: 'button', className: 'uc-btn uc-btn-ghost', onClick: onIgnore }, t('ignoreVersion'))
            : null,
          row.changelog && row.updateAvailable
            ? h('button', {
                type: 'button',
                className: 'uc-btn uc-btn-ghost',
                onClick: () => onToggleLog(row.name),
              }, t('changelog'))
            : null,
          row.kind === 'registry' || row.kind === 'git'
            ? h('button', {
                type: 'button',
                className: 'uc-btn uc-btn-ghost',
                disabled: busy !== null,
                onClick: () => onRollback(row),
              }, t('rollback'))
            : null,
          row.name === 'dsh-concierge'
            ? null
            : h('button', {
                type: 'button',
                className: 'uc-btn uc-btn-ghost',
                disabled: busy !== null,
                onClick: () => onToggle(row),
              }, row.enabled === false ? t('enable') : t('disable')),
          row.name === 'dsh-concierge'
            ? null
            : confirmUninstall === row.name
              ? h('button', {
                  type: 'button',
                  className: 'uc-btn uc-btn-ghost uc-btn-danger',
                  disabled: busy !== null,
                  onClick: () => onUninstall(row),
                }, t('confirmUninstall'))
              : h('button', {
                  type: 'button',
                  className: 'uc-btn uc-btn-ghost',
                  disabled: busy !== null,
                  onClick: () => onAskUninstall(row),
                }, t('uninstall')),
        ),
      )
    }

    function UpdateBanner(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [state, setState] = React.useState(() => bannerStore.get())
      const [actionError, setActionError] = React.useState(null)
      React.useEffect(() => bannerStore.subscribe(() => setState(bannerStore.get())), [])

      const runAction = async () => {
        if (!state || !state.action) return
        setActionError(null)
        try {
          const result = await state.action.run()
          if (result && result.ok === false) setActionError(result.error || t('restartRefused', { reason: 'unknown' }))
        } catch (error) {
          setActionError(error && error.message ? error.message : String(error))
        }
      }

      // Success banners go away on their own even when they carry an action, so
      // a finished update cannot keep covering the chat.
      React.useEffect(() => {
        if (!state || state.kind !== 'ok') return undefined
        const timer = setTimeout(() => bannerStore.set(null), 20000)
        return () => clearTimeout(timer)
      }, [state])

      // The download/install progress lives inside this same top popup.
      const [desktop, setDesktop] = React.useState(null)
      React.useEffect(() => {
        if (!DESKTOP_UPDATES) return undefined
        let alive = true
        const apply = (next) => {
          if (alive) setDesktop(next || null)
        }
        Promise.resolve()
          .then(() => DESKTOP_UPDATES.status())
          .then(apply)
          .catch(() => {})
        const unsubscribe = typeof DESKTOP_UPDATES.subscribe === 'function'
          ? DESKTOP_UPDATES.subscribe(apply)
          : undefined
        return () => {
          alive = false
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [])

      const phase = desktop && desktop.phase
      const busyPhase = phase === 'downloading' || phase === 'installing' || phase === 'starting'
      if (busyPhase) {
        const percent = typeof desktop.percent === 'number'
          ? Math.max(0, Math.min(100, Math.round(desktop.percent)))
          : null
        const version = desktop.version || ''
        const title = phase === 'downloading'
          ? t('downloadingTitle')
          : phase === 'installing'
            ? t('installingTitle')
            : t('startingTitle')
        return h('div', {
          className: 'uc-banner uc-banner-update uc-banner-progress',
          role: 'status',
          'aria-live': 'polite',
        },
          h('style', null, BANNER_CSS),
          h('div', { className: 'uc-banner-top' },
            h('span', { className: 'uc-banner-icon', 'aria-hidden': true },
              h('svg', {
                viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor',
                'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
              },
                h('path', { d: 'M12 4v11' }),
                h('path', { d: 'M7 10l5 5 5-5' }),
                h('path', { d: 'M5 20h14' }),
              ),
            ),
            h('div', { className: 'uc-banner-copy' },
              h('div', { className: 'uc-banner-title' }, title),
              h('div', { className: 'uc-banner-detail' }, percent === null ? version : `${version} · ${percent}%`),
            ),
          ),
          h('div', { className: 'uc-banner-bar' },
            h('div', {
              className: percent === null ? 'uc-banner-bar-fill uc-banner-bar-indeterminate' : 'uc-banner-bar-fill',
              style: percent === null ? undefined : { width: `${percent}%` },
            }),
          ),
        )
      }

      if (!state) return null

      const isUpdate = state.kind === 'update' || state.kind === 'restart' || state.kind === 'refresh'
      if (!isUpdate && (!Array.isArray(state.items) || state.items.length === 0)) return null

      const failed = isUpdate ? 0 : state.items.filter((item) => !item.ok).length
      const detail = isUpdate
        ? (state.detail || '')
        : state.items.map((item) => `${item.name} ${item.from}${item.to ? ` → ${item.to}` : ''}`).join(' · ')
      const title = isUpdate
        ? state.title
        : state.kind === 'ok'
          ? `${t('bannerTitleOk')} · ${t('bannerCount', { n: state.items.length })}`
          : `${t('bannerTitleFail')} · ${t('bannerFailedCount', { n: failed })}`
      const className = state.kind === 'ok'
        ? 'uc-banner'
        : state.kind === 'error'
          ? 'uc-banner uc-banner-error'
          : 'uc-banner uc-banner-update'

      return h('div', {
        className,
        role: 'status',
        'aria-live': 'polite',
      },
        h('style', null, BANNER_CSS),
        h('div', { className: 'uc-banner-top' },
          h('span', { className: 'uc-banner-icon', 'aria-hidden': true },
            h('svg', {
              viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor',
              'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            },
              state.kind === 'ok'
                ? h('path', { d: 'M20 6 9 17l-5-5' })
                : state.kind === 'error'
                  ? h('g', null,
                      h('path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }),
                      h('path', { d: 'M12 9v4' }),
                      h('path', { d: 'M12 17h.01' }),
                    )
                  : state.kind === 'restart' || state.kind === 'refresh'
                    ? h('g', null,
                        h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
                        h('path', { d: 'M21 3v6h-6' }),
                      )
                    : h('g', null,
                        h('path', { d: 'M12 19V5' }),
                        h('path', { d: 'M5 12l7-7 7 7' }),
                      ),
            ),
          ),
          h('div', { className: 'uc-banner-copy' },
            h('div', { className: 'uc-banner-title' }, title),
            h('div', { className: 'uc-banner-detail', title: detail }, detail),
            actionError ? h('div', { className: 'uc-banner-error-text' }, actionError) : null,
          ),
        ),
        h('div', { className: 'uc-banner-actions' },
          // The hint names what actually has to happen: restart banners say so,
          // refresh banners say refresh, the background "updates found" one says nothing.
          state.kind === 'update'
            ? null
            : h('span', { className: 'uc-banner-hint' },
                state.kind === 'restart' || state.needsRestart ? t('bannerHint') : t('bannerHintRefresh')),
          state.action
            ? h('button', {
                type: 'button',
                className: 'uc-banner-action uc-banner-action-primary',
                onClick: runAction,
              }, state.action.label)
            : null,
          h('button', {
            type: 'button',
            className: 'uc-banner-action',
            onClick: () => bannerStore.set(null),
          }, t('bannerDismiss')),
        ),
      )
    }

    const SIDE_CSS = `
.uc-help { position: relative; display: flex; }
.uc-help-btn { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary); height: 28px; padding: 0 8px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; white-space: nowrap; }
.uc-help-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.uc-help-menu { position: fixed; padding: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 16px 40px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.1); display: flex; flex-direction: column; gap: 2px; z-index: 1000; animation: uc-pop .16s ease-out; }
@keyframes uc-pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.uc-help-item { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-primary); text-align: left; padding: 8px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: flex-start; gap: 10px; }
.uc-help-item:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.uc-help-item:disabled { opacity: .5; cursor: default; }
.uc-help-icon { flex: none; width: 16px; height: 16px; margin-top: 1px; color: var(--dsw-alias-label-secondary); }
.uc-help-item:hover:not(:disabled) .uc-help-icon { color: var(--dsw-alias-label-primary); }
.uc-help-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.uc-help-title { font-size: 12px; line-height: 1.4; }
.uc-help-hint { font-size: 10.5px; line-height: 1.4; color: var(--dsw-alias-label-secondary); }
`

    function SidebarActions(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [open, setOpen] = React.useState(false)
      const [menuPos, setMenuPos] = React.useState(null)
      const [restarting, setRestarting] = React.useState(false)
      const wrapRef = React.useRef(null)
      const btnRef = React.useRef(null)

      React.useEffect(() => {
        if (!open) return undefined
        const close = (event) => {
          if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const dismiss = () => setOpen(false)
        document.addEventListener('mousedown', close)
        window.addEventListener('resize', dismiss)
        window.addEventListener('scroll', dismiss, true)
        return () => {
          document.removeEventListener('mousedown', close)
          window.removeEventListener('resize', dismiss)
          window.removeEventListener('scroll', dismiss, true)
        }
      }, [open])

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const rect = btnRef.current && typeof btnRef.current.getBoundingClientRect === 'function'
          ? btnRef.current.getBoundingClientRect()
          : null
        if (rect) {
          const width = 208
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
          const bottom = Math.max(8, window.innerHeight - rect.top + 6)
          setMenuPos({ left, bottom, width })
        } else {
          setMenuPos(null)
        }
        setOpen(true)
      }

      const reload = () => {
        try {
          window.location.reload()
        } catch {
          /* ignore */
        }
      }

      const restart = async () => {
        if (restarting) return
        setRestarting(true)
        const result = await requestRestart()
        if (!result.ok) setRestarting(false)
      }

      return h('div', { className: 'uc-help', ref: wrapRef },
        h('style', null, SIDE_CSS),
        h('button', {
          type: 'button',
          className: 'uc-help-btn',
          ref: btnRef,
          title: t('help'),
          'aria-label': t('help'),
          'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        },
          h('svg', {
            viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
            'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true,
          },
            h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
            h('path', { d: 'M20 4v7h-7' }),
          ),
          h('span', null, t('help')),
        ),
        open
          ? h('div', {
              className: 'uc-help-menu',
              role: 'menu',
              style: menuPos
                ? { left: `${menuPos.left}px`, bottom: `${menuPos.bottom}px`, width: `${menuPos.width}px` }
                : undefined,
            },
              h('button', {
                type: 'button',
                className: 'uc-help-item',
                role: 'menuitem',
                onClick: () => {
                  setOpen(false)
                  reload()
                },
              },
                h('span', { className: 'uc-help-icon' },
                  h('svg', {
                    viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
                    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true,
                  },
                    h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
                    h('path', { d: 'M20 4v7h-7' }),
                  ),
                ),
                h('span', { className: 'uc-help-text' },
                  h('span', { className: 'uc-help-title' }, t('reloadUi')),
                  h('span', { className: 'uc-help-hint' }, t('reloadHint')),
                ),
              ),
              h('button', {
                type: 'button',
                className: 'uc-help-item',
                role: 'menuitem',
                disabled: restarting,
                onClick: () => {
                  setOpen(false)
                  restart()
                },
              },
                h('span', { className: 'uc-help-icon' },
                  h('svg', {
                    viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
                    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true,
                  },
                    h('path', { d: 'M12 3v9' }),
                    h('path', { d: 'M6.5 6.5a7.5 7.5 0 1 0 11 0' }),
                  ),
                ),
                h('span', { className: 'uc-help-text' },
                  h('span', { className: 'uc-help-title' }, restarting ? t('restartingApp') : t('restartApp')),
                  h('span', { className: 'uc-help-hint' }, t('restartHint')),
                ),
              ),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'theme'],
      apply(ctx) {
        const slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
        // Access `locale` through get(): a service not named in `inject` throws on property access.
        const loc = typeof ctx.get === 'function' ? ctx.get('locale') : undefined

        readPerfPrefs()
        readIgnore()
        readLookPrefs()
        installPerfCss()
        installLookCss()
        ensureGlassNodes()
        lookCtx = ctx
        applyLook()
        // 主题在别处被切换时（官方外观设置），玻璃壁纸跟着换深浅色。
        // 这里只同步属性，不能再调 overrideTokens——那会 publish 出新的
        // theme/change，自己把自己转成死循环。
        if (typeof ctx.on === 'function') ctx.on('theme/change', () => syncGlassScheme())
        applyNoAnim()
        applyOffscreen()
        startLongTasks()
        startPerfMonitor()
        installResizeShield()

        readTyperPrefs()
        const typerRestores = []
        wrapAssistantTypewriter(ctx, typerRestores)
        if (ctx && typeof ctx.on === 'function') {
          const off = ctx.on('slots/changed', (key) => {
            if (key === 'conversation.chat.node') wrapAssistantTypewriter(ctx, typerRestores)
          })
          if (typeof ctx.effect === 'function') {
            ctx.effect(() => () => {
              if (typeof off === 'function') off()
              for (const restore of typerRestores.splice(0)) restore()
            }, 'dsh-concierge: restore typewriter rows')
          }
        }

        if (!slots || typeof slots.inject !== 'function') return

        let t = (key, vars) => {
          const dict = activeLocale(loc).toLowerCase().startsWith('en') ? en : zh
          let text = dict[key] !== undefined ? dict[key] : (zh[key] !== undefined ? zh[key] : key)
          if (vars) {
            text = text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
          }
          return text
        }
        try {
          if (loc && typeof loc.bind === 'function') {
            const bound = loc.bind(NS)
            if (typeof bound === 'function') {
              t = (key, vars) => {
                let text = bound(key)
                if (!text || text === key) {
                  const dict = activeLocale(loc).toLowerCase().startsWith('en') ? en : zh
                  text = dict[key] !== undefined ? dict[key] : key
                }
                if (vars) {
                  text = text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
                }
                return text
              }
            }
          }
        } catch {
          /* keep the local fallback */
        }

        startBackgroundCheck(t)

        if (loc && typeof loc.register === 'function') {
          for (const [id, dict] of [['zh', zh], ['zh-CN', zh], ['en', en]]) {
            try {
              const install = () => loc.register(NS, id, dict)
              if (typeof ctx.effect === 'function') {
                ctx.effect(install, `dsh-concierge: locale ${id}`)
              } else {
                install()
              }
            } catch {
              /* duplicate or unsupported id: keep going */
            }
          }
        }

        slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: 'dsh-concierge',
          order: 42,
          label: () => t('title'),
          locale: NS,
          inject: () => ({ t, locale: loc }),
        }, UpdateCenter))

        slots.inject('sidebar.footer.action', () => slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-concierge-actions',
          order: 10,
          label: () => t('title'),
          locale: NS,
          inject: () => ({ t }),
        }, SidebarActions))

        slots.inject('shell.overlay', () => slots.register({
          name: 'shell.overlay',
          id: 'dsh-concierge-banner',
          order: 5,
          label: () => t('title'),
          locale: NS,
          inject: () => ({ t }),
        }, UpdateBanner))


      },
    }
  },
})
