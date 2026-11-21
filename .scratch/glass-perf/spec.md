# 玻璃皮肤掉帧：把模糊从滚动内容里拆出去

Status: ready-for-agent

## 症状

玻璃皮肤下帧率下降，流式输出时最明显；关掉外观正常。屏幕 2560×1600 @120Hz
（DPR 1.5），GPU 是 Intel Iris Xe 核显。

## 先量了什么

用同机同 GPU 跑对照页（内嵌插件真实 `LOOK_CSS`，复刻壁纸层 + 半透明会话区 +
dock 输入卡 + 每 16ms 追加文字的流式输出，300 行富文本）：

| 状态 | 帧率 | 慢帧 |
| --- | --- | --- |
| 无玻璃 + 流式 | 120 | 0 |
| 玻璃 + 流式（会话区 + 输入卡 + 座位三层模糊） | 120 | 0 |
| 玻璃 + 轻玻璃 + 流式 | 120 | 0 |
| 玻璃 + 每帧重画壁纸 | 120 | 0 |

对照实验：每帧空转 30ms 立刻掉到 33fps，说明测量本身准。结论：**合成页里 blur
不花钱**——静态背景下 Chromium 会缓存模糊结果。所以问题不在"像素太多"，在
"什么时候被迫重算"。

## 外部资料（查到的机制）

- Chromium 合成器文档：backdrop filter 是合成器里最贵的特效，要读回父 surface
  已画好的内容、过滤、再合成；模糊代价随**面积**和**半径**涨
  （[chromium effect-optimizations](https://github.com/gridaco/nothing/blob/main/docs/wg/research/chromium/effect-optimizations.md)）。
- Chromium 的 damage 计算会把含 backdrop filter 的 render pass 并成一个大矩形，
  再拿去扩大 root damage rect——页面上有全屏模糊时，一帧的 damage 会被撑到整块
  （[Chromium 提交](https://openhub.net/p/chrome/commits/2410206544)）。
- 带 `backdrop-filter` 的元素，只要它自己的内容在滚/在变，模糊就会被逐帧重算。
  unsloth 的实测做法是把模糊挪到元素下面独立一层（`::before` + `inset: 0` +
  `z-index: -1` + `will-change: transform`，父元素 `isolation: isolate`），
  设置面板滚动的 CPU 从 10–22 倍降到接近实心窗口
  （[unsloth PR #16942](https://github.com/unslothai/unsloth/pull/16942)）。
- 玻璃组件库的同款结论：模糊代价随面积和 sigma 涨，所以弹出层动画期间会把模糊
  从 0 渐入，而不是一上来就全强度（[popover blur ramp](https://github.com/sdegenaar/liquid_glass_widgets/blob/main/docs/POPOVER_BLUR_RAMP.md)）。

## 改法

1. 会话区的 `backdrop-filter` 从元素本身挪到 `::before` 独立层（父元素
   `isolation: isolate`，层 `will-change: transform`）。背后只有静态壁纸，模糊
   只算一次；上面的文字照常重排。
2. 输入框座位（`data-conversation-region="composer"`）不再自己模糊：它里面还压着
   输入卡的 `backdrop-filter`，两层叠在"每帧都在动"的聊天记录上。
3. 半径统一降一档：会话区 14→12px，浮层 20/18→12/14px；去掉大面积上的
   `brightness()`；`--dsw-menu-backdrop-filter` 20→12px。
4. 「轻玻璃」语义不变：打开时连 `::before` 那层也没有。

## 非目标

- 不改壁纸路由、不改透明度/颗粒语义。

## 验收

1. 玻璃 + 轻玻璃关：`getComputedStyle(会话区).backdropFilter === 'none'`，
   `::before` 是 `blur(12px) saturate(1.5)`。
2. 轻玻璃开：`::before` 也是 `none`，浮层仍模糊。
3. 输入框座位（composer 区域）任何状态下都不再模糊。
4. 非玻璃皮肤：全部 `none`。
5. `node --check client.js` 通过。
6. 真实应用里：长回复流式输出时帧率应回到接近关闭外观的水平；滚动设置面板也
   不该再掉。
