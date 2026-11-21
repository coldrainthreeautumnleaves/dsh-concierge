# 04 顶部标题栏也做磨砂

Status: ready-for-agent

## 背景

顶部那 40px 是 Windows 原生 WCO 画的，颜色由 preload 探针读
`--dsw-specific-sidebar-fill` 经 `windowsAppearance` IPC 交给主进程
`setTitleBarOverlay`。之前为了让标题栏和壁纸接上，这个 token 被压成实色，顶部就一直是
一条平色。Electron 从 #38693 起支持 WCO 透明（颜色带 alpha 时不再整块不透明），所以
只要给 token 一个带 alpha 的值，页面顶部就能透上来。

## 要做什么

1. 玻璃皮肤下把 `--dsw-specific-sidebar-fill` 改成带 alpha 的颜色
   （`rgba(240,243,252,.2)` / `rgba(21,27,43,.2)`），让原生标题栏尽量透明。
2. 侧边栏用 `[class*="_sidebarCol"]` 压回原来的实色，不跟着变透明。
3. 壁纸去掉顶部那 40px 的同色不透明渐变，壁纸现在铺到顶。
4. 壁纸层里加一条 `#dsh-concierge-top`（高 = `--dsh-windows-titlebar-height`），
   带 `backdrop-filter: blur(14px) saturate(150%)` 和一点白色 tint；全屏时隐藏。

## 回退

如果 Electron 在运行期调 `setTitleBarOverlay` 不认 alpha（#38693 备注里说创建后再设可能
不生效），顶部会退回接近实色——和今天一样，不算回退失败，只是没变化。

## 怎么算做完

- [x] `#dsh-concierge-top` 在玻璃下 `display: block`、高度 40px、`backdrop-filter` 生效。
- [x] 壁纸顶部不再有不透明 40px 条。
- [x] `node --check client.js` 通过。
- [ ] 真实应用里看顶部是不是磨砂；如果还是平色，说明运行期透明没生效。

## Comments

- 2026-11-21：0.1.51 发版。headless Edge 验过页面这一侧：band 生成、尺寸 40px、
  `backdrop-filter` 有值；壁纸顶部不再有实色条。原生 WCO 那一半只能在真机上确认。
- 2026-11-21：0.1.52 调整：顶部 tint 从纯白 12% 换成侧边栏那一档的冷白/深蓝
  （浅 `rgba(240,243,252,.62)`、深 `rgba(21,27,43,.68)`），不再让壁纸的彩色直接当
  顶栏颜色；模糊保留。
