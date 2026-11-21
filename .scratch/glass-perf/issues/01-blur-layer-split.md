# 01 会话区模糊拆到独立层，输入框去掉重复模糊

Status: ready-for-agent

## 要做什么

玻璃皮肤掉帧：把 `[data-conversation-region="chat"]` 的 `backdrop-filter` 挪到
`::before` 独立层（父元素 `isolation: isolate`，层 `will-change: transform`），
元素自己不再带模糊；输入框座位不再自己模糊；半径统一降一档。

## 落点

- `client.js` / `LOOK_CSS`
  - 删掉通用模糊列表里的 `[data-conversation-region]`（它同时匹配聊天正文和输入
    框座位），改成只给 `[data-conversation-region="chat"]::before` 加模糊。
  - 通用浮层：`blur(12px) saturate(150%)`；对话框那档 `blur(14px) saturate(150%)`；
    去掉 `brightness(1.03)`。
- `client.js` / `glassTokens`
  - `--dsw-menu-backdrop-filter`：`blur(20px)` → `blur(12px)`。
- `CHANGELOG.md`：写进「未发布」。

## 怎么算做完

- [x] 会话区元素本身 `backdrop-filter` 为 `none`，模糊在 `::before`。
- [x] 轻玻璃打开时 `::before` 也没有模糊，浮层照旧。
- [x] 输入框座位不再有模糊。
- [x] `node --check client.js` 通过。
- [ ] 真实应用里流式输出帧率回升（需要人眼/性能面板确认）。

## Comments

- 2026-11-21：查完 Chromium 合成器文档和 unsloth PR #16942 后按"模糊单独成层"
  改的。headless Edge 验算：玻璃 + 轻玻璃关 → 会话区 `none`、`::before`
  `blur(12px) saturate(1.5)`、dialog `blur(14px)`、menu/card `blur(12px)`；
  轻玻璃开 → `::before` 也 `none`；非玻璃 → 全 `none`。`node --check` 通过。
- 2026-11-21：合成页对照测过四组状态都是 120fps，说明本地复现不了掉帧，所以这次
  是按机制改的，效果要靠真实应用确认。
- 2026-11-21：按新规则发版——版本号 0.1.48，改动已提交。
