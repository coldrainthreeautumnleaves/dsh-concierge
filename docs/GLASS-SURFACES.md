# 玻璃皮肤的背景层：谁在画、怎么改

这份笔记记的是「改了半天没生效」踩过的坑。写于 2026-11-24，对应版本 `0.17.6`。

## 零、改完先确认：这一版到底跑起来没有

**这个 profile 没有 HMR**（`~/.dsh/profiles/desktop/node_modules/@deepseek-ai` 下没有 hmr 包），客户端改动**必须完整重启**：

| 改了什么 | 生效方式 |
|---|---|
| 宿主半（`index.js`、路由） | 重启 |
| **客户端半（`client.js`、样式）** | **重启**（刷新只是重新请求同一个旧 bundle） |
| 配置 / patch | 热生效 |

判断「到底加载的是不是这一版」最快的办法：临时加一条一眼能看见的 CSS（比如窗口左上角一块洋红方块写版本号），重启后看它有没有出现。别靠感觉判断。

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

1. **先确认这一版跑起来了**：加一条显眼的临时 CSS（洋红方块 + 版本号），重启看它出现没有。没出现就别往下查——你改的根本不是跑的那份代码；
2. **再确认插件加载了**：Client 的 `Slots.listSubTree` 查一个槽位的 `occupants`，看 `active` 是不是 `true`。控制台里 `import failed` 可能只是历史消息；
3. 再确认 token 生效：token 在 `body` 内联样式里，`getComputedStyle` 查 body 上的变量值；
4. 最后才改 CSS——而且要认准上面那张表的钩子，别用类名猜。

## 七、两个「整条声明被丢弃」的坑（都踩过）

CSS 里一个值不合法，坏的不是那一个值，是**整条声明**。玻璃皮肤上踩过两次，症状都是「改了完全没反应」：

1. **多层 `background-image` 里混进非法层**：壁纸层原本是
   ```css
   background-image: var(--dsh-grain, none), radial-gradient(…), radial-gradient(…), linear-gradient(…);
   ```
   颗粒是 SVG data URI（带引号和逗号），`var()` 一替换进去，整条 `background-image` 被判非法 → 全部丢弃 → 壁纸永远不画。`background-color` 是另一条属性，所以「纯色能画、渐变画不了」。
   **结论：壁纸层用单层 `background`；要叠多层就用伪元素，每个元素只一条 `background`。**

2. **`element.style.backgroundImage = ''` 清不掉内联样式**：CSSOM 会忽略空值。清内联必须用 `removeProperty('background-image')`。否则上一次写进去的 `url(坏壁纸)` 会一直盖住样式表里的渐变，图片又加载失败 → 那一层什么都不画 → 露出窗口底色。

## 八、body 有不透明背景

应用 boot 时写：

```js
const LIGHT_BACKGROUND = "#fff";   // 深色 #151517
body { background-color: #fff }
```

壁纸层是 `z-index: -1`，**正好被 body 那层不透明背景盖住**。玻璃皮肤必须让开：

```css
html[data-dsh-glass="1"],
html[data-dsh-glass="1"] body,
html[data-dsh-glass="1"] #root { background: transparent !important; }
```

## 九、先看报错，再谈样式（今天最贵的一条）

**症状**：设置页「界面没了」——面板区域一片空，只剩遮罩盖着聊天，后面的文字隐约可见。

**误判路径**（走了两个多小时）：以为是面板背景变透 → 调 `--dsw-alias-bg-layer-2` → 补 `bg-l1`/`bg-l2`/`bg-elevated` → 加 `solid()` 免缩放 → 涂实遮罩。全打偏。

**真因**：

```js
React.useEffect(() => { … }, [autoUpdate])              // 先用
const [autoUpdate, setAutoUpdate] = React.useState(…)   // 后声明
```

`const` 在初始化前处于暂时性死区（TDZ），渲染到这里直接抛
`Cannot access 'autoUpdate' before initialization`——**整个组件崩掉**，所以那块什么都没渲染。看起来像「样式变透了」，实际是「组件没了」。

**教训**：

1. 改完先看浏览器控制台有没有红字。有报错就别动样式——样式救不了崩溃的组件；
2. 「界面变透 / 变空 / 少一块」优先怀疑**渲染失败**，而不是颜色；
3. 只改过一处却出问题，先查自己改的那一处，别去翻无关的 token；
4. 同一个症状连试三次没解决，就换方法——今天的三层补丁加起来不如一行挪位置。

## 十、两条今天用六个版本换来的

### 1. 宽泛的 `[class*="..."]` 是雷区

浮层那条「必须给足不透明底」的规则里写了 `[class*="_menu"]`，本意是匹配菜单面板。它同时命中了：

```html
<span class="m2hUqa_menuAnchor">   <!-- 只是个 anchor-name 定位用的空容器 -->
```

于是这个空 span 被刷上 `rgba(var(--dsh-tint-rgb), 0.96)`，正好盖在「标准模式」下面——看起来像「按钮有白底」，实际是旁边一个不可见的定位容器。

**规矩**：属性选择器要带尾部下划线或更长前缀（`_menu_`、`_card_`），别用词根（`_menu`、`_card`、`_pill`）。这类词根会被 `menuAnchor`、`cardShots`、`pillRow` 复用。

### 2. `bg-base` 必须用样式表打孔，不能用 overrideTokens

`--dsw-alias-bg-base` 是「应用底色」，几乎所有页面根容器都铺它。用 `ctx.theme.overrideTokens` 给半透明有两个问题：

- 宿主的偏好写入会盖回来；
- 它只收合法颜色，`transparent` 会被丢掉。

社区壁纸主题的通行做法（dsh-theme-theresa / dsh-ui-appearance）是在注入的样式表里直接：

```css
html[data-dsh-glass="1"] body { --dsw-alias-bg-base: transparent !important; }
```

### 3. 别再猜类名，先开 DevTools

今天为了找一块白底，试了 `_selector`、`bg-module-platform` token、`heroOptions` 子树、`interactive-bg-hover`、`_seat` 五轮，**全部落空**。最后用户在 DevTools 的 **Styles 面板**里一眼看到命中的那条规则——就是我自己写的。

「元素没反应」时，第一件事是右键 → 检查 → 看 Styles 里哪条规则在生效、被划掉的又是哪条。比对着 asar 猜类名快十倍。
