# 玻璃皮肤的背景层：谁在画、怎么改

这份笔记记的是「改了半天没生效」踩过的坑。写于 2026-11-24，对应版本 `0.15.4`。

## 一、颜色有两个入口，只有一个能改

DSH 的 `--dsw-*` token 有两条落地路径（[token-map.md](https://raw.githubusercontent.com/Cenuon/dsh-opencode-ui/66066534874a3f5479df10c2959bba42d787e961/docs/token-map.md)）：

| 路径 | 写入位置 | 谁写 |
|---|---|---|
| 静态样式表 | `document.head` 里的 `<style>` | `installThemeStyles(ctx)` |
| **内联样式** | **`document.body.style`** | `ThemePresenter.apply(snapshot)` |

`ctx.theme.overrideTokens()` 的叠加层最终**经 ThemePresenter 写成 body 内联样式**，而内联样式的优先级高于任何样式表规则（含 `!important`）。

**结论：token 只能用 `overrideTokens` 改，CSS 里写 `--dsw-xxx: … !important` 是无效的。**

## 二、背景一共 5 层，各有钩子

实测自 [dsh-theme-mist 视觉规范](https://raw.githubusercontent.com/ffyfox/dsh-theme-mist/078c7dfc4e2523935f11be0754080076b5c02a0b/docs/visual-spec.md)（0.2.1 / 0.2.2 双版本确认）：

| 层 | 节点 | 驱动它的 token |
|---|---|---|
| 1 AppFrame | `[id='root'] > div[data-slot='root'] > div` | `--dsw-alias-bg-base` |
| 2 SidebarCol | `[data-slot='root'] > div > :has(> [data-slot='sidebar'])` | `--dsw-specific-sidebar-fill` |
| 3 SidebarRoot | `[data-slot='sidebar'] > :first-child` | 同上 |
| 4 ConversationRoot | `[data-slot='main.conversation'] > div` | `--dsw-alias-bg-base` |
| 5 **ComposerSeat** | **`[data-composer-seat]`**（仅 `[data-phase=active]`） | `--dsw-alias-bg-base`（36px 渐变的**终点色**） |

第 5 层是踩坑最多的地方，见下。

## 三、输入框座位：半透明的 token 会毁掉渐隐

应用给座位挂的规则：

```css
[data-composer-seat] {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
    var(--dsw-alias-bg-base) 36px);
}
```

玻璃皮肤把 `--dsw-alias-bg-base` 设成半透明（0.42）之后，**渐变的「实色端」也半透明了**——座位底下没有底，壁纸/预模糊层直接透上来，看着就是「输入框底下垫了一张磨砂纸」。

这是官方记录过的坑：[dsh-web#98](https://github.com/zhu1090093659/dsh-web/issues/98)，官方修法是：

> `fix(skins): opaque composer seat fade for background skins (#98)`
> Override the composerSeat fade to **the skin body color below the 36px fade band**
> — [commit 4138d4d](https://github.com/zhu1090093659/dsh-web/commit/4138d4dadc344ab2a9b04566150a8b0efadcd7b2)

落到我们的样式：

```css
html[data-dsh-glass="1"] [data-composer-seat],
html[data-dsh-glass="1"] [class*="_composerSeat"] {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0, var(--dsh-canvas) 36px) !important;
}
```

**要点**：终点必须是**不透明**色（`--dsh-canvas`），不能继续用 `bg-base`。用半透明盖半透明，等于没盖——这是当时连着几版「改了没效果」的原因。

## 四、顶部那 40px 不是页面画的

标题栏那条是 `_frame` 的 `padding-top`，底色取 `--dsw-specific-sidebar-fill`；再往上是 Windows 的 WCO 遮罩，颜色来自主进程的 `chromeFallbackFill()`。

- 页面侧：`html[data-windows-titlebar]` 加在 **`html` 本身**上，选择器不能当后代找；
- 系统侧：`scripts/patch-titlebar-color.mjs` 把 `"#1b1b1c" : "#f9fafb"` 换成 `"#0e1116" : "#eef3fa"`（等长替换 3 处）。

## 五、窗口本身是两层

窗口是 `backgroundColor: #00000000` + `backgroundMaterial: acrylic`：DWM 在窗口后面画一份桌面模糊，页面再画自己的磨砂。**页面只要有一块透明，两层就会叠在一起**，看着又灰又脏。

- 想只留网页层：`scripts/patch-window-opaque.mjs`（把 `"#00000000"` 换成不透明的 `"#ffeef3fa"`，等长替换 27 处，跳过库里的 `NULL_COLOR` 哨兵值）；
- 想只留系统层：把页面壁纸层置空，但顶部那条改不了，不推荐。

## 六、排查顺序（下次别再猜）

1. **先确认插件加载了**：Client 的 `Slots.listSubTree` 查一个槽位的 `occupants`，看 `active` 是不是 `true`。控制台里 `import failed` 可能只是历史消息；
2. 再确认 token 生效：token 在 `body` 内联样式里，`getComputedStyle` 查 body 上的变量值；
3. 最后才改 CSS——而且要认准上面那张表的钩子，别用类名猜。
