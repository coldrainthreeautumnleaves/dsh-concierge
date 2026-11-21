# 03 根背景不透明 + 玻璃自动降级

Status: ready-for-agent

## 要做什么

1. 玻璃皮肤下把 `<html>` 背景从透明改成不透明底色（壁纸层在 z-index:-1，仍在它上面）。
   Chromium 只有在根背景不带 alpha 时才能把这一帧当成不透明帧来合成，否则每帧都要和窗口
   表面混一次；Windows 上不透明帧还可能走硬件叠加。
2. 玻璃自动降级：帧率低于刷新率 75% 连续 2 秒就把会话区模糊关掉（只加
   `data-dsh-glass-auto`，不动用户的「轻玻璃」设置），回到 90% 连续 5 秒恢复，两次切换
   至少隔 20 秒。原来 50% 的阈值在 120Hz 屏上等于 60 帧，掉到 90 根本不会触发。

## 落点

- `client.js` / `LOOK_CSS`：`html[data-dsh-glass="1"]` 给 `background-color`（浅/深两套），
  body 仍透明；新增 `[data-dsh-glass-auto="1"]` 关会话区模糊。
- `client.js`：`perf.glassAuto` 状态、`applyGlassAuto()`、性能采样里的阈值与冷却、
  `applyLook`/`clearGlassLayer` 里清属性。
- 性能页加一行只读状态（正常 / 已降级），中英文案。
- `CHANGELOG.md`：0.1.50。

## 怎么算做完

- [x] 玻璃下 `getComputedStyle(html).backgroundColor` 是 `rgb(240,243,252)`（深色 `rgb(21,27,43)`）。
- [x] 壁纸层仍然可见（截图确认渐变在根背景之上）。
- [x] `data-dsh-glass-auto="1"` 时会话区 `::before` 的 `backdrop-filter` 为 `none`。
- [x] `node --check client.js` 通过。
- [ ] 真实应用里：长回复流式输出掉帧 2 秒后会话区模糊自动消失，恢复后回来。

## Comments

- 2026-11-21：0.1.50 发版。headless Edge 验算：html 背景 `rgb(240,243,252)` / 深色
  `rgb(21,27,43)`；`::before` 平时 `blur(12px) saturate(1.5)`，加 auto 属性后 `none`；
  截图确认壁纸层仍在根背景之上。
