# 02 颗粒不再单独占一层，视频壁纸下会话区不模糊

Status: ready-for-agent

## 要做什么

1. 颗粒的强度写进噪点 SVG 自己的 `opacity`，元素上不再挂 `opacity`——否则合成器会把
   它当成一个全屏图层，每帧和壁纸再混一次。
2. 背景是视频时，会话区那层 `::before` 不生成模糊：视频每帧都是新画面，模糊背后一直在
   变，等于逐帧重算整屏；静态壁纸才缓存得住。

## 落点

- `client.js` / `LOOK_CSS`
  - `#dsh-concierge-grain` 去掉 `opacity`，改由 `applyGrainImage()` 写 `background-image`。
  - 新增 `[data-dsh-glass-wall="video"] [data-conversation-region="chat"]::before` 关模糊。
- `client.js`
  - `grainImage(value)` / `applyGrainImage()`；`applyGrain` 与 `applyLook` 都走它。
  - `applyLook` 玻璃分支写 `data-dsh-glass-wall`，`clearGlassLayer` 里删掉。
  - 背景选「视频」时那一行带提示（中英文案 `lookWallVideoHint`）。
- `CHANGELOG.md`：写进 0.1.49。

## 怎么算做完

- [x] 颗粒元素 `opacity` 计算值为 `1`，`background-image` 带 `opacity='0.06'` 的噪点图。
- [x] 壁纸预设 → 会话区 `::before` 是 `blur(12px) saturate(1.5)`；壁纸视频 → `none`。
- [x] `node --check client.js` 通过。
- [x] 噪点 SVG 渲染正常（0.5 强度截图能看到颗粒）。
- [ ] 真实应用里确认颗粒滑杆仍然有效、视频背景不闪。

## Comments

- 2026-11-21：0.1.49 发版。headless Edge 验算：颗粒 `opacity: 1`、背景图已设置、平铺
  140px；壁纸预设时会话区 `::before` 为 `blur(12px) saturate(1.5)`，壁纸视频时为 `none`。
