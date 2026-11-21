# 01 玻璃皮肤加「轻玻璃」开关

Status: ready-for-agent

## 要做什么

在设置 → 工具 → 外观里，玻璃皮肤下加一个「轻玻璃」开关（默认关）。打开后
`[data-conversation-region]` 整块不再 `backdrop-filter`，其余浮层模糊不变。

## 落点

- `client.js`
  - `look` 默认值加 `lightGlass: false`；`readLookPrefs` / `saveLookPrefs` 带上它。
  - `applyLook`：玻璃皮肤下按开关设置 `root.dataset.dshGlassLight`，其余情况删除。
  - `LOOK_CSS`：会话区的模糊规则加 `:not([data-dsh-glass-light="1"])` 条件。
  - 外观卡片：透明度滑杆之后加一行 `switchControl`。
  - 中文 / 英文文案各两条（标签 + 提示），`lookHint` 顺带提一句。
- `README.md`：外观那一条补上轻玻璃。
- `CHANGELOG.md`：加「未发布」小节，不动 `package.json` 版本号。

## 怎么算做完

- [x] 开关默认关，只在玻璃皮肤下出现。
- [x] 打开后会话区无 `backdrop-filter`，菜单 / 对话框 / 卡片仍有。
- [x] 关掉开关或换皮肤后没有残留属性。
- [x] `node --check client.js` 通过。
- [ ] 刷新应用后人工确认：流式输出时整块不再重糊，浮层仍是毛玻璃。

## Comments

- 2026-11-21：实现完成，未提交。`client.js` 加 `lightGlass` 状态、`:not([data-dsh-glass-light="1"])`
  守卫和外观卡片里的开关；顺手把 `applyLook` 的清理挪到所有 early return 之前——原来关掉
  「外观」或主题服务拿不到时，`data-dsh-glass` 会留在 `<html>` 上，会话区虽然看不见但仍在
  跑 `blur(14px)`，壁纸层也一直挂着。这属于白付成本，跟着这次一起收干净。
- 2026-11-21：用 headless Edge 把 `LOOK_CSS` 抠出来实测四种状态（浮层取 dialog / menu / card）：
  - 玻璃 + 轻玻璃关：conv `blur(14px) saturate(1.6) brightness(1.03)`，dialog `blur(18px)`，menu/card `blur(14px)`
  - 玻璃 + 轻玻璃开：conv `none`，dialog / menu / card 不变
  - 无玻璃：全部 `none`
  - 深色 + 轻玻璃开：conv `none`，浮层不变
- 2026-11-21：`node --check client.js` 通过；版本号仍是 0.1.47，等人工确认效果再一起 bump。
- 2026-11-21：开关语义没变，但底层换了形状——会话区的模糊挪到了 `::before` 独立层
  （见 `.scratch/glass-perf/`），轻玻璃现在是「连 `::before` 那层也不生成」，而不是
  「元素上不加 backdrop-filter」。实测：轻玻璃开时 `::before` 也是 `none`。
- 2026-11-21：按新规则发版——版本号 0.1.48，改动已提交。
