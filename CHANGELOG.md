# 更新日志

重要变更都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)：每版一句头条，条目按功能域打头，分组用 Added / Changed / Fixed / Removed，空组不写。

版本号规则：每段只到 x.y.9，然后进下一位（0.2.0 → … → 0.2.9 → 0.3.0）。

## [Unreleased]


## [0.31.2] - 2026-11-28

> 壁纸引擎进插件、壁纸画质并入性能页、悬停终于看得见

### Added

- 壁纸: 内置 **Wallpaper Engine 库读取**，不再依赖另一个插件。
  - Video 型**不打包**：`project.json` 的 `file` 字段直接指向目录里的 mp4，Chromium 原生就能播（实测是 H.264），所以既不用解包也不用内置解码器。
  - Scene 型需要 WebGL 场景渲染器，暂未接入，先回落到它的 `preview` 图并标注「静态预览」。
  - 本机实测：13 个壁纸里 2 个可播放、11 个走静态预览。
- 性能: **壁纸渲染**并入性能页，和全局设置共用一套：画质四档（低/中/高/极高）只调分辨率倍率和特效，**帧率四档都保持 60**、并受已有「刷新率上限」约束；另有「全屏时暂停」「电池时暂停」两个零成本开关。
- 悬停: 卡片增加 **1px 跟手描边**。只有面光的话在大卡片上几乎看不出来，描边是最显眼的一层；光被 `overflow: hidden` 裁在轮廓内，读作反光而不是发光。
- 悬停: 列表行改成「底色加深 + 左侧 2px 强调条」。行不能位移（行间距只有一条发丝线），用强调条表达悬停比单纯提亮明显得多。

### Fixed

- 壁纸: 壁纸路由补上 **Range 请求**。之前永远回 `200 + 全量`，视频拖不动进度，大文件可能直接不播。
- 壁纸: 自定义壁纸（图片/视频）时藏掉预设渐变的**两层彩色光斑**。伪元素画在壁纸层上面，图片会被粉/蓝光晕洗掉，视频右上角会多一块蓝晕。
- 外观: **调色盘拖动发卡、松手还在动**。应用外观改动原来是 140ms 防抖，拖动时每个 input 都把计时器重置——拖的过程中界面不动，松手后计时器才到点。改成按帧合并。
- 外观: 分组标题去掉底色改发丝线（页面里灰色元素已经太多）；正常行不再显示状态 pill（一屏十行「已是最新」等于没有信息）；版本号改 `tabular-nums` 让小数点对齐。
## [0.31.1] - 2026-11-28

> 卡片描边改到盒子外侧，灰带不再露缝

### Fixed

- 外观: 分组灰带左右各 1px 的缝没了。之前卡片的描边用的是 `border`，它画在盒子**内侧**；`overflow: hidden` 又会把子元素裁在边框内侧，所以灰带永远够不到那 1px，边缘就显出一条颜色不同的细线。
  - 改成把描边放进 `box-shadow` 的环（`0 0 0 0.5px stroke`），画在盒子**外侧**。灰带和卡片边缘现在完全重合，实测左右空隙从 `1.00px` 变成 `0.00px`。
## [0.31.0] - 2026-11-28

> 确认卡避开输入框

### Fixed

- 兼容: MattSkillsDeck 的确认卡纵向位置从视口正中（`50%`）改到会话区（`clamp(96px, 38%, 100% - 300px)`）。0.30.9 把它摆到视口正中，但在矮窗口下正中正好压在输入框和发送按钮上——那不是它的落点，会话区才是。
## [0.30.9] - 2026-11-28

> 把 deck 的确认卡摆回中间，但不用 JS

### Fixed

- 兼容: MattSkillsDeck 的「关闭整个 MattSkillsDeck」确认卡回到会话区中间。
  - 0.30.8 删掉了那段 JS 守卫（它盯着卡的 `style` 反复写 `!important`，和 deck 的渲染来回拉，导致弹窗一直闪），但删完之后 deck 自己的定位又把卡甩到窗口右下角、贴到边缘外面。
  - 这次只用**一条静态 CSS 规则**：`left/top: 50% !important` + 独立的 `translate: -50% -50% !important`。写一次就生效，没有 MutationObserver、没有 JS 反复写，所以不会再闪。
  - 用独立的 `translate` 而不是 `transform`，是为了不覆盖 deck 自己的入场动效。
  - 已确认 deck 的 8 处 `setProperty` 没有一处带 `important`，所以静态规则压得住内联样式（实测：内联 `left: 900px` 被压成 `577.5px`）。
## [0.30.8] - 2026-11-28

> 安全模式终于会自己生效了；不再和别的插件抢弹窗

### Added

- 安全: **进程内启动守护**。以前安全模式只在「你主动双击 `safe-launch.cmd`」时才生效——日常从快捷方式启动根本不经过它，所以 `safe-launch.log`、`safe-state.json`、`safe-backup` 一个都没生成过，等于没有这个功能。
  - 现在每次启动写一个「正在启动」时间戳，稳定 8 秒后再写「这次成功」。下次启动时如果发现上次只有「正在启动」没有「成功」，说明上次没走完，就自动降级到安全模式：备份 profile 配置，把 bundles 过滤成只剩官方 `@deepseek-ai/*`，写日志，然后提示重启。
  - **不占进程**：只是两个时间戳加一个 `setTimeout`，触发即结束，没有常驻进程。
  - 外部 `safe-launch.*` 保留作为兜底（DSH 连插件都加载不起来时用）。

### Fixed

- 兼容: **不再修改 MattSkillsDeck 的确认弹窗位置**。之前有一段守卫盯着那张卡的 `style` 属性，deck 一重写就补一次 `left/top !important`，自己的写入又触发观察器，两边来回写导致弹窗一直闪。整块删除（5182 字符），不再碰别的插件的 DOM。
- 外观: 分组标题带改成**不透明**混色。之前是 `color-mix(... 45%, transparent)`（alpha 0.42），半透明叠在卡片上、边缘被那 1px 边框压住时色差会显出一条缝。

## [0.30.7] - 2026-11-28

> 维护中心重排：一行只留一个状态，次要操作收起来，危险操作说清后果

### Added

- 更新: 插件行改成「主操作 + 启停开关 + ⋯」三层。之前一行最多平铺 6 个按钮（更新 / 忽略 / 更新内容 / 回退 / 启停 / 卸载），扫一眼分不出主次，误点代价也高。次要操作（更新内容、忽略、回退、打开主页、卸载）收进 ⋯ 里按需展开。
- 更新: 卸载改成确认弹窗。原来点一下变「确认卸载？」，既没说明会丢什么，也没有取消路径。现在弹窗写清「本地配置与缓存会被删除」，默认焦点在「取消」，Escape 可关。
- 关于: 新增危险区（全页唯一红框）与「恢复全部默认设置」，二次确认里逐项列出会被清掉的外观 / 性能 / 打字机设置，并说明插件和 Token 不受影响。
- 加载: 首次加载改用等高骨架屏（原来只有一条空转的进度条）；已有数据时仍只加顶部细进度条，不清空列表。
- 无障碍: 每个开关都有可访问名称（`aria-labelledby` 指向所在行标题 + `role="switch"`）；标签页补 roving tabindex 与方向键 / Home / End；帧率图改为整块 `role="img"` 带一句话摘要；失败横幅改用 `role="alert"` 立即播报。

### Changed

- 关于: 页面重排为「版本 → 更新日志 → 功能介绍 → 危险区」。版本信息不再折叠——它和入口是这一页最常看的东西，藏进折叠里等于没有；功能介绍挪到日志之后，因为它是一次性阅读内容。
- 性能: 帧率图与四项统计收进默认收起的「性能诊断」。折叠标题那一行 `58 fps · 长任务 2` 已经回答了「现在好不好」，图只在想查是哪几秒掉帧时才需要展开。它是观测，不是配置。
- 更新: 删掉中间那张「已装插件 / 可更新 / 上次检查」统计卡——它把「应用本体」和「插件」两个域混在一起，三个数字分别由本体状态卡、待更新标题和页脚承担。
- 更新: 合并两个「检查更新」入口（hero 的「重新检测」与工具栏的「检查更新」做的是同一件事）；「刷新界面」「重启应用」收进默认折叠的「刷新与重启」——它们是更新没生效时的补救手段，不是常规路径。
- 排版: 散文（更新日志、关于、引导步骤）字号改由 `--dsh-content-font-delta` 推导，用户在 DSH 里改字号时它们会跟着变；UI 骨架保持固定 px，与官方设置页的分法一致。
- 排版: 侧栏 footer 按钮从 28px 抬到官方侧栏的 42px，不再比旁边那行矮一截。
- 外观: 插件行去掉类型 pill（npm / GitHub / 本地）。分组标题已经写了类型，行内再挂一个灰块只是重复——之前「更新中心」那行会出现两个一模一样的「本地」灰块。

### Fixed

- 更新: 状态不再三重编码（圆点 + 文字 + 标签）。一列里三种符号说同一件事，读起来比信息本身还吵；现在只留一个状态 pill。
- 更新: 行内操作按钮常显（原来 `opacity: 0`、只有 hover 才出现，键盘用户根本找不到目标）。
- 更新: 启停统一成开关。之前插件页是按钮、外观和性能页是开关，同一种语义两种控件。

## [0.30.6] - 2026-11-28

> 维护中心对齐官方排版，并加上跟手的光

### Added

- 外观: 卡片悬停**跟手柔光**——光标在卡片里移动时，一圈 220px 的柔光跟着走，峰值 10% 白（深色 14%）。光被卡片圆角和 `overflow:hidden` 裁在轮廓内，读作「表面被照亮」，不是「发光」。
  - 位置变量用 `@property` 注册，**必须 `inherits: true`**：渐变画在 `::after` 上，写成 `false` 时伪元素永远拿到初始值，效果会静默失效，而且看起来只是「很淡」。
  - 事件委托 + `requestAnimationFrame` 合并，一帧最多写一次变量；`getBoundingClientRect` 只在进入新卡片时读一次并缓存（每帧现读会强制同步布局，实测代价高 13 倍）。
  - 键盘用户拿不到鼠标位置，`:focus-within` 时把光源钉在中心，给等效提示。
- 动效: 列表行入场按 28ms 一档依次上浮淡入，单项 240ms，第 7 项起不再累加（总时长约 408ms）。只播一次，轮询刷新和切标签都不会重播。

### Changed

- 排版: 字号收敛到官方阶梯，**每一档都配行高**——20/28、16/24、14/22、13/20、12/18、11/14。之前 4 档字号全无行高，11px 还被当通用小字用。
- 排版: 圆角改引用官方 token（卡片 `--dsw-radius-lg`、控件 `--dsw-radius-md`、chip `--dsw-radius-sm`），不再自己定 12/8。
- 排版: 边框从 `1px` 改成 `0.5px` 发丝线。DPR=1 下 Chromium 会抗锯齿成约 1px、50% alpha 的淡线，正是官方观感（官方在 104 个 module.css 里用了 293 处字面 0.5px）。
- 排版: 卡片改用官方设置卡片材质对 `--dsw-alias-settings-card-fill` / `-stroke`；阴影改三层纵深（半径按 3 倍递增），不再用 `--dsw-shadow-lv1` 叠自造阴影。
- 排版: 页内标签页从**胶囊分段条**改成官方 section 页的**下划线式**（gap 22、13/20、下划线 2px）。
- 排版: 去掉全大写 + 字距的小标签；字重收敛到 400/500/600（原来有 550 和 650，官方没有这两档）。
- 排版: 等宽字体改用 `--ds-font-family-code`。官方刻意不带裸 `monospace` 尾巴，否则 Windows 中文会回退到宋体。
- 布局: `.uc-root` 去掉 `margin: 12px` 和 `padding: 16px 16px 24px`，加 `max-width: 760px`。设置面板的 `.options` 已经有 `0 24px 24px`，再自己加等于白扔 56px 内容宽度、白加 28px 顶空。
- 控件: 图标按钮 32→28，按钮统一 32 高，下拉 36 高；开关轨道 32×20→36×20、拇指 14、加内描边把关态勾出来。

### Fixed

- 外观: **玻璃皮肤把整个 DSH 的圆角都改了**。`glassTokens()` 覆盖了 `--dsw-radius-md/lg/panel`（12→14、16→18、28→18），这三个是全局 token，连设置面板自己的 28px 圆角也被改掉。已删除——圆角和透明度没有关系。
- 外观: **界面没有层级**。`layer-1` 和 `layer-2` 是同一个 RGB、只差 alpha，叠在卡片上合成结果逐通道相同（实测 **1.00:1**），标签 / 提示条 / 分段控件的底色等于不存在。现在二级面混一点正文色，造出真实亮度台阶。
- 外观: **透明度下限从 0.40 抬到 0.70**。实测卡片不透明度 0.45 叠在深壁纸上时次要文字只有 **3.10:1**，低于 4.5:1。0.70 覆盖黑壁纸这个最坏情况。
- 外观: 普通 ghost 按钮悬停**会变红**，导致「回退 / 忽略此版本 / 启停」全部显示成危险操作。改成只提亮。
- 外观: 焦点环是 accent 25% 的 `box-shadow`（实测 **1.36:1**，玻璃背景上直接看不见），且 `outline: none` 之后键盘用户完全没有可见焦点。改用官方 `--dsw-focus-ring-width` / `-color`，并给开关补上（它的 input 是 `opacity: 0`，环必须画在 track 上）。
- 外观: 状态徽章文字对比度不足（`#2a9d6e` 只有 **2.88**、`#d33` 只有 **3.67**）。改成按主题极性压一档：浅色混深正文色、深色混浅正文色，两种主题都过 4.5:1。
- 外观: 帧率柱 `opacity: .55` 只有 **2.06:1**，改满色；柱顶圆角从 12px 收到 2px。
- 外观: 行内操作按钮 `opacity: 0`、只有 hover 才出现，键盘用户找不到目标。改成常显。
- 外观: 按钮按下时的 `scale(.98)` 用 80ms、松手用 120ms，两条曲线打架会出现一次可见顿挫。去掉缩放，只变色。
- 兼容: 删掉 `[data-shell-overlay]{z-index:500!important}`。这行把**整个宿主 overlay 层**抬到 500，影响所有其他插件的浮层（右键菜单、重命名弹窗、权限 toast），而 banner 自己已经有 z-index，这一行是多余的。
- 无障碍: `prefers-reduced-motion` 从 `0ms` 改成 `120ms`——设成 0 会让开关「瞬间跳」，失去因果感；同时补上入场动画和柔光的关闭。

## [0.30.5] - 2026-11-28

> 颗粒和透明度调成「看得出来」

### Fixed

- 外观: **透明度**滑块动了但看不出变化。
  - 主表面：系数从 `1.25 − t×0.7` 改成 `1.52 − t×1.32`。默认 43 仍是 ×0.95（观感不变），100 时 α 从 0.33 掉到 0.12。
  - **实底表面**（设置卡片、菜单、输入框底座、`.uc-card`）以前在样式表里写死 `0.96`，滑块对它们完全无效——而这正是用户看得最多的面。现在改成读 `--dsh-solid-alpha`，由 `applyLook()` 按透明度算：默认 43 → 0.96，0 → 1.0，100 → 0.45。
- 外观: **颗粒**上限从 0.2 提到 0.6（滑块 0–60%），并给噪声加 `feColorMatrix saturate=0` 去色。原来 20% 上限 + 彩色噪点，叠在浅色壁纸上基本看不出来。

### 数据

同一块面板（近白 `rgb(248,250,252)`）叠在浅粉壁纸 `rgb(255,230,242)` 上，透明度 0 → 100 的合成通道差：

| 表面 | 改动前 | 改动后 |
|---|---|---|
| 实底（卡片 / 菜单 / 输入框） | 0（写死 0.96，完全不动） | 最大 11 |
| 主表面（bg-base 等 token） | 最大 4 | 最大 16 |

### 排查记录

先确认了代码路径本身是通的：在模拟宿主里渲染外观页、拖动两个滑块，颗粒写出了 SVG data URL（`--dsh-grain` 非空），透明度让 `overrideTokens` 收到 `bg-base = rgba(248,250,252,0.330)`，两项也都落了 localStorage。

又核对了 DSH 的 `overrideTokens` 实现（`@deepseek-ai/dsh-client-ui-theme`）：它会先跑 `validateOverrides`，要求每个 token 是 `{light, dark}` 字符串对，不合格直接抛 `TypeError`。按这条规则重跑，本插件的 token 全部通过——所以不是被静默拒绝。

结论：状态、调用、落盘都对，问题只在**视觉幅度太小**，已按上表拉开。

## [0.30.4] - 2026-11-28

> 把那张确认卡摆回会话区中间（这次用实测收敛，不抢位置）

### Changed

- 外观: 重新接管 MattSkillsDeck「关闭整个 MattSkillsDeck」确认卡的位置，但换了一套做法：
  - **目标固定 + 实测收敛**：先把卡片写到目标点，再量它真实落在哪，按「目标 − 实测中心」修正要写的坐标，最多 3 轮。卡片若处在带 `transform` 的祖先里，`left/top` 会相对那个祖先解析，一轮写不准——只有按实测偏差才收得回来。
  - **已到位就不写**：每次落位先量一次，中心已经在目标 2px 内就直接返回。否则「写 style → 触发自己盯 style 的观察者 → 再写」会空转，一帧一次重排。
  - **只在被改写时补一次**：盯住这张卡的 `style` 属性。deck 重渲染用 CSSOM 赋值会连我们的 `!important` 一起清掉，那时才补。
  - 不再限定玻璃皮肤，也不再依赖样式表里那条全局 `:is(...)` 规则。

### 为什么 0.30.3 那样删掉不对

0.30.3 把接管代码整段删了，结果卡片回到 deck 自己按**点击时抓下的锚点**算出来的位置。锚点一过期（窗口改过尺寸、上一轮点过），算出来就在窗口右下角甚至贴边——比之前更难用。

0.30.2 及以前的问题是「和 deck 抢同一个元素」：两边都用 `!important` 写 `left/top`，deck 重渲染写回自己的值、我们又盖回去，谁也落不准。

这一版只做一件事：把这张卡稳定放到会话区里、输入区以上那块的中间，并且**只在需要时写一次**。

### 兼容范围

仍然只认这一个元素：`[role="dialog"][aria-modal="true"][aria-label*="MattSkillsDeck"]`。别的插件的浮层一概不碰；维护中心自己的 DOM 和官方主题 token 之外，不做别的接管。

## [0.30.3] - 2026-11-28

> 不再去改别的插件的弹窗

### Removed

- 外观: 删掉专门给 MattSkillsDeck「关闭整个 MattSkillsDeck」确认卡做定位的整套代码——一段 `html[data-dsh-glass="1"] :is(... [aria-label*="MattSkillsDeck"])` 的强制居中规则，和配套的 `installDeckDialogPlacement()`（MutationObserver 监听挂载 + 用内联 `!important` 写 `left/top`，再按会话区重算）。

### 为什么

MattSkillsDeck 是**另一个插件**，那张卡的位置由它自己算：渲染时抓锚点矩形，`computeTipPlace()` 算 `left/top`，挂载后 `deckDoorCorrectRef()` 再纠正一次。

维护中心去写 `!important` 等于两个插件抢同一个元素：deck 每次重渲染把自己的值写回去，我们下一帧又盖回来，谁也落不准。表现就是**弹窗位置不对**，以及窗口尺寸变化后**干脆看不见**。

现在维护中心不碰任何别的插件的对话框。玻璃皮肤对 `[role="dialog"]` 的样式只剩背景色、边框、阴影，不含 `display` / `visibility` / `opacity` / `position`，不会影响别的插件显示。

### 兼容约定

以后维护中心只操作自己的 DOM（`#dsh-concierge-*`、`.uc-*`）和官方主题 token，不再按 `aria-label` 或类名去接管其他插件的浮层定位。

## [0.30.2] - 2026-11-28

> 修好外观里三个不生效的开关

### Fixed

- 外观: **颗粒**滑块拖了没反应。`applyGrainImage()` 一直在往 `#dsh-concierge-glass` 上写 `--dsh-grain`，但整个样式表没有一处 `var(--dsh-grain)`——变量写了个没人读。现在用玻璃根层的一个全屏 `::after` 把它画出来（单条 `background-image`，不和壁纸层的单层渐变抢同一条声明）。
- 外观: **透明度**滑块拖完刷新就回到 43。滑块只调了 `scheduleLookApply()`（重算 token），从来没调 `scheduleLookSave()`，值根本没落盘。现在拖动时短防抖重算、松手后保存。
- 外观: **窗口直角**拨过去有效，过一会儿又圆回去。DWM 的圆角偏好会被 Electron 在 show / setBounds / 最大化 / 还原 / 最小化恢复时重写，而 Host 只在首次应用后盯 15 秒。现在把窗口盯的时间延长到 20 秒，并在客户端补上「缩放结束后」和「重新可见时」各补发一次（1.2 秒防抖，避免拖窗口时刷屏起进程）。

### 说明

顺手把外观、性能、打字机、更新四组开关逐个核对了一遍：除了上面三个，其余开关（外观总开关、主题偏好、皮肤、品牌色、调色板、自定义三色、字号、代码字体、壁纸、性能六项与刷新率、逐字显示与节流与速度、自动更新、启动加速、自动安全模式）都在改值之后同时做了保存和生效，没有同类问题。

## [0.30.1] - 2026-11-28

> 修好维护中心白屏

### Fixed

- 页面: 设置 → 维护中心 整页白屏。0.30.0 删路由时连带删掉了一段仍在使用的状态声明（`query`、`gitUrl`、`addingSource`、`sourceBusy`、`guideRepo`、`guideData`、`guideLoading`、`tokenInput`、`tokenState`、`npmSpec`、`installingNpm`、`confirmUninstall`、`openLog`、`ignoreTick`），组件渲染时抛 `gitUrl is not defined`，整个 `settings.section` 渲染失败。这 14 个声明已按原样补回。
- 清理: 删掉路由移除后无人引用的 `LOCAL_GATEWAYS` 常量。
- 文档: README 去掉已经不存在的「Claude Code（走 magpie）」一节，标签页改成实际发布的五个（更新 / 插件 / 外观 / 性能 / 关于），逐字显示的默认值更正为「开」。

### 说明

侧边栏底部入口（`sidebar.footer.action`）和顶部更新提示（`shell.overlay`）一直正常；白屏只发生在设置页那一块。三个槽位的组件现在都能渲染通过。

## [0.30.0] - 2026-11-28

> 删掉路由的全部功能

### Removed

- 路由: 删除 `claude-code` provider，聊天框模型菜单里不再有「路由」这一项
- 路由: 删除 `acp.js`、`sdkclient.js`、`omnitool.js`、`modelsstore.js` 四个文件
- 路由: 删除 `streamClaudeCode`、`createClaudeCodeAdapter`、`applyClaudeProvider`、`planClaudePrompt` 等整套 provider 代码
- 路由: 删除「路由」标签页和它背后的状态、加载函数、两个卡片
- 路由: 删除 `/claude-info`、`/claude-toggle`、`/claude-run`、`/gateways`、`/switch-gateway`、`/magpie-route`、`/trim-models`、`/restore-config` 八个端点
- 路由: 删除 `findClaudeCli`、`runClaudeOnce`、`readRoutingTools`、`readCcSwitch`、`readClaudeVersion`、`resolveRouteModelName`、`readRouteModels`、`readMagpieApplied`、`listGateways`、`readClaudeRoute`、`pickGatewayBase`、`probeGatewayModels`、`switchGateway` 等辅助函数
- 工具: 删除 `omni` 工具和 `ctx.tools.restrict` 调用，`inject` 回到 `['webServer']`

### 为什么删

Claude 模型的请求在 codeflow 上一直 403，试过的所有本地手段（换 UA、加头、改 beta、换协议、SDK 直连、经 Magpie、收工具数量）都没能解决。留着这套代码只会让模型菜单里多一个选了就报错的选项，排查范围也大一圈。

DeepSeek 模型走 `magpie-anthropic` 那条路完全正常，不需要这些代码。

`index.js` 从 176KB 降到 105KB。

回滚用 `git checkout before-remove-route`。
## [0.29.0] - 2026-11-28

> 把所有工具收成一个 omni，绕开上游「tools 数量」限制

### 背景

codeflow 的 Claude 分组对请求里的 `tools` 数量有限制，实测：

    0 个 tool   → 200
    1 个 tool   → 200
    2 个 tool   → 200
    3 个 tool   → 403

同一个 key、同一个模型，只改 tools 数量，重复多次结果一致。直连 codeflow、经 Magpie、经插件三条路都一样。而 `messages` 里塞 40KB 内容能过，说明不是体积或额度问题，就是这个字段的限制。

DSH 自己注册的工具加上 Claude Code 那套加起来十几个，一并发出去必然被拒。

### Added

- 工具: 新增 `omni` 工具，把 read / write / edit / list / stat / glob / grep / bash 收成 1 个，用 `action` 参数选择。工具内部直接调 `node:fs` 和子进程，不依赖 DSH 的工具注册表
- 工具: 注册 omni 后用 `ctx.tools.restrict({ allow: ['omni'] })` 把其余工具藏起来，模型看到的 `tools` 数组只剩 1 项
- 工具: `inject` 加上 `tools` 服务

### 实测

    omni 注册成功，9 个参数
    list:  ✅ 列出目录
    read:  ✅ 读取文件
    bash:  ✅ 执行命令

### 说明

`restrict` 是作用域化的，插件卸载时会自动撤销，不会影响其他插件。
## [0.28.0] - 2026-11-28

> 不再 spawn claude-agent-acp，直接调 Claude Agent SDK，绕开它的认证门

### 背景

`claude-agent-acp` 0.113 起加了一道认证门（`hide-claude-auth.js` 的 `refuseClaudeSubscriptionTurn`）：它读 SDK 缓存的 `AccountInfo`，判断账号有没有可用凭据。走中转站时凭据在 `settings.json` 的 env 里（`ANTHROPIC_AUTH_TOKEN`），SDK 报的 `apiKeySource` 是 `none`，不在它的白名单里，于是每轮都回 `Authentication required`，CLI 根本不发请求。

上游 Issue：[agentclientprotocol/claude-agent-acp#1270](https://github.com/agentclientprotocol/claude-agent-acp/issues/1270)

试过不行的：`ANTHROPIC_API_KEY`、两个都给、`settings.json` 里的 `apiKeyHelper`（CLI 自己认了，但认证门读的是 SDK 缓存）、`_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL`。

### Changed

- Claude Code（SDK）: 新增 `sdkclient.js`，直接调 `@anthropic-ai/claude-agent-sdk` 的 `query()`，不再 spawn `claude-agent-acp`
- Claude Code（SDK）: SDK 从 `claude-agent-acp` 的依赖目录里取（它本来就装着），不另装一份。`@agentproto/adapter-claude-sdk` 那条路试过，依赖 `@agentproto/memory@0.1.1` 在 npm 上不存在，装不上
- Claude Code（SDK）: 模型用 `options.model` 指定，不再有 ACP 的 `session/new` + `set_config_option` 那两笔启动开销
- Claude Code（SDK）: 开了 `includePartialMessages`，思考和正文都按增量吐（`thinking_delta` / `text_delta`）
- 路由: `listModels` 改从网关 `/v1/models` 拿，不再依赖 ACP 的 `configOptions`

### Removed

- Claude Code（SDK）: ACP 的会话管理与增量记账（`getAcpClient` / `planClaudePrompt` / `acpSentTexts`）——SDK 每次 `query()` 都是独立调用，没有跨轮会话，聊天侧改为每轮带完整历史

### 实测

    DeepSeek 模型  首字 3226ms  总 3972ms  "好"
    多轮记忆       首字 3678ms  总 4810ms
                   2 个块：[reasoning] The user asked "我叫什么？…"
                           [text] 小王

`acp.js` 暂时留着（`claudeGatewayEnv` 还在用），其余 ACP 逻辑已经不再调用。
## [0.27.6] - 2026-11-28

> 冷启动那 7 秒挪到插件加载阶段，首字从 7.1 秒降到 1.3 秒

### Fixed

- Claude Code（ACP）: `warmup()` 只建会话，没切模型。第一次 prompt 还要额外付一次 `session/set_config_option`（claude-agent-acp 里要重新解析模型、查上下文窗口，几秒级）。现在 `warmup(sessionKey, model)` 支持顺带切模型
- 路由: `listModels` 读到 CLI 报的模型清单后，顺手把模型切到 DSH 当前选中的那个。等用户真发消息时就不用再等这一刀

  实测：

      预热前  首轮首字 7121ms
      预热后  首轮首字 1348ms
              （那 5878ms 的 warmup 挪到了插件加载阶段）

### 说明

`warmupAcp()` 在模块初始化时就跑，那时候 `currentModel` 还没定义（const 暂时性死区），所以预热阶段只建会话不切模型；切模型放在 `listModels` 里做——那时 DSH 已经问过模型清单，`currentModel` 也就能用了。
## [0.27.5] - 2026-11-28

> 接管只摘 magpie 自己写的 provider，用户手写的不动

### Fixed

- 路由: 接管时会把 `llm-pi-ai` 下的 provider **全部**摘掉，包括用户自己手写的（实测有一个手写的 `aq`）。现在按认领规则来：备份里记过名字的、或者名字是 `magpie` / `magpie-anthropic` 的才算网关的，其余原样留着
- 路由: `if (state.claudeHandle) return` 会跳过接管。注册成功但摘 provider 失败时（比如那次 magpie 正好在写配置），之后再也不重试，菜单里就一直有两份一样的模型。现在已注册的情况下也会再确认一次接管
- 路由: 备份文件非空时 `hideGatewayProviders` 直接 return true，于是 magpie 把 provider 写回来之后不会再摘。现在备份非空也照样摘，只是不覆盖备份里的原始值

### 认领规则

    stash[name] 存在           → 网关的，摘
    name 以 magpie 开头        → 网关的，摘
    其余（如手写的 aq）        → 用户的，不碰

实测：

    配置里: aq, magpie-anthropic
    认领（要摘）: magpie-anthropic
    保留: aq
    结果: 只剩 aq
## [0.27.4] - 2026-11-28

> 模型目录存盘，冷启动不再等 3 秒；prompt 缓存延到 1 小时

### Added

- 路由: 模型目录存盘（`~/.dsh/update-center/dsh-concierge-models.json`）。DSH 每条消息前都会问一次模型清单，而清单要从 CLI 的 `session/new` 读，建会话得冷启动 3-7 秒。现在把上次读到的存盘，冷启动阶段直接给，读完再更新。做法参照 `dsh-llm-acp` 的 `models-store.js`
- 路由: 缓存带指纹（CLI 可执行文件的路径 + 大小 + mtime）。CLI 升级或换路径后指纹对不上，旧缓存自动失效，不会拿过期的模型名去请求
- Claude Code（ACP）: 加 `ENABLE_PROMPT_CACHING_1H=1`，把 prompt cache TTL 从默认 5 分钟提到 1 小时。DSH 这边一轮常常超过 5 分钟（看结果、切窗口），回来再问一句缓存就全废了，整段历史重新 prefill——既慢又烧 token。写入费率比 5 分钟高，但对「聊一会儿停一会儿」的用法整体是省的

### 设计取舍

- 只存模型元数据（id + 名字），不存 env、路径、prompt、回复
- 读不出来 / 写不进去都退化成内存缓存，绝不阻断请求
- 写入用 tmp + rename，避免半个文件
- 刷新失败时保留上一次的好数据——清空会让选择器重启后出现再消失（`agentconnect` 的 runtime-model-catalog 里记了这个坑）
## [0.27.3] - 2026-11-28

> 模型列表改成问 CLI 要，路由里从 1 个变回 15 个

### Fixed

- 路由: 「路由」下面只显示一个模型。原因是模型清单从网关 `/v1/models` 探的，那是**裸 id**；Claude Code CLI 认的是带 `[1m]` 后缀的那一份，两边对不上，`session/new` 的 `configOptions` 里 16 个选项只能显示 1 个能用的。现在优先读 CLI 自己在 `session/new` 报上来的 `configOptions`（`category === 'model'`），拿不到才退回网关探测

  实测 CLI 报上来 15 个，全是它认的 id：

      opus / fable / sonnet / haiku
      codeflow/deepseek-ai/DeepSeek-V4.1-Flash[1m]
      codeflow/claude-haiku-5-5[1m]
      … 共 15 个

- Claude Code（ACP）: 读 `configOptions` 时字段名用错了（写的 `configId`，ACP 实际是 `category` / `id`），所以之前一个模型都没读出来。照 `dsh-llm-acp` 的写法改成 `category === 'model' || id === 'model'`
- Claude Code（ACP）: 顺手把思考档位（`thought_level` / `effort`）也读出来，界面上能显示
## [0.27.2] - 2026-11-28

> 每轮不再重复切模型，首字从 7 秒降到 1.5 秒

### Fixed

- Claude Code（ACP）: `prompt()` 每轮都调一次 `session/set_config_option` 切模型。这个调用在 `claude-agent-acp` 里要重新解析模型、查上下文窗口，实测一次能卡十几秒（参考 LodyAI/acp-extension-claude#13：模型切换 ~15s → ~3ms 的优化，做法就是不重复切）。现在按会话记住已经切过去的模型，只有真的变了才调

  实测连续三轮同一模型：

      第1轮（冷启动+切模型）  首字 7310ms
      第2轮（不切模型）        首字 1563ms
      第3轮（不切模型）        首字 1853ms
## [0.27.1] - 2026-11-28

> 标题请求单独开会话，不再污染聊天上下文；ACP 提前预热

### Changed

- Claude Code（ACP）: DSH 每轮除了聊天还会发一个生成会话标题的小请求（`maxTokens` 64），原来和聊天共用同一条 ACP 会话。后果有三：标题的提问进了聊天历史；`acpSentTexts` 被两个请求轮流覆盖，下一轮聊天前缀对不上只能重放整段；标题请求切模型，切走再切回让聊天的 prompt 缓存整个失效。现在按 `maxTokens` 和 system 模板识别这类旁路请求，单独开一条用完即弃的会话，不参与增量记账、不切模型，DSH 给的 system 也一并转给 CLI
- Claude Code（ACP）: 插件接管后立刻建好 ACP 进程和默认会话（实测冷启动 3-4 秒），用户发第一句话不用再等进程启动

### Added

- acp.js: 一个 CLI 进程支持多条会话（`prompt(..., sessionKey, forceNewSession)`），并新增 `warmup()` 预热

## [0.27.0] - 2026-11-28

> ACP 会话增量发送：同一会话只发新增的用户消息，不再每轮重放完整历史

### Changed

- Claude Code（ACP）: 对话第 N 轮发送整段历史给 CLI，导致 prompt 每次都是全新内容、吃不到 ACP 侧缓存，首字延迟随轮次线性增长。现在追踪「已发出的消息」和「当前 ACP 会话 id」：同一会话且历史前缀吻合时只发新增的用户消息；会话重建（进程重启、网关切换）或 DSH 改写了历史时才整段重放，避免上下文不一致

## [0.26.9] - 2026-11-28

> 启动时不再漏注册：llm 服务晚到时自动补上

### Fixed

- Claude Code（ACP）: 重启 DSH 后偶发「开关是开的、模型菜单里却没有」——cordis 按服务可用性激活插件，加载顺序不保证（dsh-base 里写明 "Row order carries no load semantics"），启动时 `llm` 服务可能还没就绪，`ctx.get('llm')` 返回 `undefined`，旧代码直接 `return`，于是什么都没注册。现在改用 `ctx.inject(['llm'])`：服务一出现就补注册，不用再手动关一次开一次
- Claude Code（ACP）: 启动读开关和用户点开关可能同时到达，两次注册撞车会抛 `DUPLICATE_ADAPTER`。现在串行执行，后来者等前一次完成

## [0.26.8] - 2026-11-28

> 插件接管时连 magpie 的接入状态一起关掉，界面不再提示「重新接入」

### Fixed

- Claude Code（ACP）: 接管时只摘 `cordis.patch.yml` 里的 provider 不够——magpie 那边 `applied.json` 里还记着 `dsh` 这条接入，界面会显示「配置已变更 · 重新接入」，用户点一下就又把 provider 写回来了。现在接管时把 `applied.json` 的 `dsh` 键也挪到备份里，让 magpie 认为没接入；让出时原样还原
- Claude Code（ACP）: 备份文件里除了 provider 还存一条 `__applied`（magpie 那条接入记录的备份），还原时跳过它，不当成 provider 处理

### 两条链路

   插件开启（路由功能）：插件 → 模型 → 聊天框
   插件关闭：           Magpie → 模型 → 聊天框

接管时摘掉 `magpie-anthropic` 等 provider 并清 `applied.json` 的 `dsh`；让出时按备份原样写回。
## [0.26.7] - 2026-11-28

> 插件不再失忆：完整对话历史都交给 CLI

### Fixed

- Claude Code（ACP）: 用插件时模型看不到前面的对话，每次提问都像第一次见面。原因是 `turnPromptText` 只取「最后一条 assistant 之后」的那几条——DSH 每轮重新整理消息，插件只把本轮提问递进去，历史全丢了。现在新增 `turnPromptMessages`，把完整对话整理成 `[{role, text}]` 交给 ACP 的 `session/prompt`（它本来就支持多段 prompt）
- Claude Code（ACP）: 注入的上下文（运行时提醒、时间戳、记忆预取）和用户真正说的话分不清，模型容易把上下文当成用户说的。现在给非 `source.kind === 'user'` 的消息加 `[上下文]` 前缀
- Claude Code（ACP）: 长会话会把整个历史塞进 prompt，可能超上下文。现在超过 40 条就截断——保留最早一条 + 最近 39 条，中间标「（中间省略了一段较早的对话）」

### Changed

- Claude Code（ACP）: `acp.js` 的 `prompt()` 现在接受字符串或 `[{role, text}]` 数组，字符串自动包成一条，旧调用方式不受影响
## [0.26.6] - 2026-11-28

> 去掉自研路由台的痕迹，网关只剩 magpie 和 CCR

### Changed

- 路由: `LOCAL_GATEWAYS` 只剩 magpie（3425）和 CCR（3456）。自研的「路由台」（19999）已经不用了，从候选表、探测、切换器里一并去掉
- 路由: `readRoutingTools` 不再给每个网关手写一遍探测代码，改成遍历 `LOCAL_GATEWAYS`——加网关只改一处
- 路由: 模型来源的描述（`via xxx`）按实际网关名写，不再写死「via 路由台 / via magpie」

### Fixed

- 路由: 探测网关时 `clearTimeout` 写在 fetch 后面，`fetch` 抛错就不清理。现在放 `finally`
## [0.26.5] - 2026-11-28

> 认得出 CC Switch 装了什么，不再一律显示「未安装」

### Fixed

- 路由: CC Switch v3.8+ 把 provider 搬进了 SQLite（`~/.cc-switch/cc-switch.db`），插件只查 `live-state.json` 和 `config.json`，所以装好了也一直显示「未安装」。现在用 Node 22 内置的 `node:sqlite` 读 `providers` 表，读出当前用的是哪个 provider、一共装了几个；拿不到驱动就退回原来的两个 JSON

  CC Switch 本身不是网关，是「配置切换器」——它把 `~/.claude/settings.json` 指向不同 provider（官方、中转、本机网关都可能）。所以它不进 `LOCAL_GATEWAYS`，读出来的 provider 只用来显示
## [0.26.4] - 2026-11-28

> 三个本机网关能在界面上直接切，不用再手改 settings.json

### Added

- 路由: 「路由」那行改成网关切换器，本机装了哪些网关各显示一个芯片——亮着表示在跑、当前用的那个高亮、没运行的置灰。点一下就切，不用再手改 `~/.claude/settings.json`
- 路由: `GET /dsh-concierge/gateways` 返回三个本机网关的在线状态和可用模型数；`POST /dsh-concierge/switch-gateway` 切过去。切换只改 `ANTHROPIC_BASE_URL` 这一个字段，其余原样写回
- 路由: 网关切换后模型缓存跟着失效，不会继续拿旧网关的清单

### Fixed

- 路由: `settings.json` 开头有 BOM 时 `JSON.parse` 直接抛错，`settingsGatewayBase()` 只好返回空、退回默认网关——表现是切到 magpie 后插件还报路由台的 16 个模型。现在读之前先去掉 BOM（PowerShell 的 `Set-Content -Encoding UTF8` 会写进去）
- 路由: `pickGatewayBase()` 记住上一次的结果就不再看 `settings.json` 了，用户用 CC Switch 或界面切换器换了网关之后插件还走旧的。现在每次都以 `settings.json` 为准
- 路由: 模型缓存只按 10 分钟过期，不判断是哪个网关的结果，换网关后仍然命中旧缓存。现在缓存带上网关地址，对不上就重拉
## [0.26.3] - 2026-11-28

> 设置页改名叫「路由」，字体和排版收一遍

### Changed

- 外观: Claude Code 那个标签和卡片标题改成「路由」，聊天框模型菜单里的供应方名也一起改成「路由」，三处保持一致
- 外观: 卡片标题字重 600 → 550，加 `letter-spacing: -.01em`。16px/600 的中文标题偏重，旁边紧挨着开关，两边在抢注意力
- 外观: 卡片头 padding 从 `12px 16px` 统一成 `16px`，和左右留白对齐
- 外观: 每行右侧的值不再内联写 `fontSize: '12px'`（比正文 13px 小一档，一行里两种字号看着发虚），改用 `.uc-row-value`，和标题同字号，只靠颜色区分主次
- 外观: 行与行的间距从 `gap: 12px` 改成靠分隔线分隔（`gap: 0`），行内 `align-items` 从 `flex-start` 改成 `center`，值不再和标题错位
- 外观: 六处说明文字精简，比如「由 ~/.claude/settings.json 决定，插件不自己拼」→「settings.json 指向的地址」

## [0.26.2] - 2026-11-28

> 修掉「resolves no models」红色报错

### Fixed

- Claude Code（ACP）: 上一版接管时保留 `magpie-route` 这个 provider、只把 `models` 清空，DSH 的模型页会报错：`llm-pi-ai: provider "magpie-route" resolves no models; the installed catalog does not describe this route, so its models must be listed in configuration`。原因是 `llm-pi-ai` 校验里，provider 解析出的模型数为 0 就判无效——内置目录只描述它认识的 route（`deepseek` 之类），自定义名字不在里面，所以 `models` 不能空着。既然不能空着、又不能和插件那份重复，就只能整条移走，回到 0.26.0 的做法

  让出时按备份原样写回，16 个模型和全部规格字段一起恢复

## [0.26.1] - 2026-11-28

> 接管时保留路由台这个 provider，只把模型挪走

### Fixed

- Claude Code（ACP）: 上一版接管时把 `magpie-route` 整条从 DSH 配置里删掉，结果模型页里连「路由台」这一项都不见了，看着像坏了。现在改成保留 provider、只清空 `models`，`displayName` 改成「路由台（由插件接管）」。这样模型页里还在（能看出是插件在管），聊天框的模型菜单里也不会和插件那份重复

  让出时按备份原样写回，模型和 `displayName` 一起恢复

## [0.26.0] - 2026-11-28

> 网关候选覆盖三个来源：路由台、magpie、Claude Code Router

### Changed

- Claude Code（ACP）: 探测本机网关时只试了路由台（19999）和 magpie（3425），漏了 Claude Code Router 默认的 3456。现在抽成一张 `LOCAL_GATEWAYS` 表，三个都试，`settings.json` 里写的地址仍然最优先
- Claude Code（ACP）: 「谁在实际接管」的判断原来把端口硬编码在 `if (port === '19999') …` 里，和候选列表各写一份。现在统一查 `LOCAL_GATEWAYS`，加新网关只改一处

### Fixed

- Claude Code（ACP）: `LOCAL_GATEWAYS` 定义在用到它的 `readRoutingTools` 后面，`const` 的暂时性死区会让那个函数执行时抛 `ReferenceError`。已挪到文件顶部

## [0.23.2 – 0.25.9] - 2026-11-27

> 装了插件就不再显示路由台那份模型，两条链路二选一

### Added

- Claude Code（ACP）: 插件接管时调路由台的 `/api/takeover`，把 `magpie-route` 这个 provider 从 DSH 配置里摘掉；卸载或禁用时再放回来。两条链路是二选一——装了插件走「路由台 → 模型 → 插件 → 聊天框」，没装插件走「路由台 → 模型 → 聊天框」。之前两个 provider 同时挂着，模型菜单里出现两份一样的模型，不知道点哪个
- `scripts/test-turn-prompt.mjs`: 回归测试，喂一段和会话日志里形状相同的消息，检查挑出来的提问对不对
- `scripts/fake-acp-server.mjs`、`scripts/test-permission-reply.mjs`: 用假 ACP 服务端复现「CLI 申请权限、客户端不回话」的卡死，并验证修复
- `scripts/e2e-turn-prompt.mjs`: 端到端跑真模型，验证注入上下文时提问有没有被丢掉
- `scripts/smoke-stream.mjs`: 直接调 `streamClaudeCode` 跑一轮，检查块结构（`block-start` / delta / `block-end` 的 index 与类型是否自洽、思考块是否非空）。`streamClaudeCode` 为此加了导出
- 诊断: 新增 `collectDockChain()` —— 把 `[data-composer-dock]` 的父级链（最多 8 层）连同 `display / position / height / minHeight / maxHeight / flex / gridTemplate / alignSelf / overflow` 一起上报到 `perf-report.json` 的 `dockChain`。dock 塌掉时只有往上看才知道是谁把它压扁的
- 外观: `[data-composer-dock]` 加最小宽度兜底（`min-width: min(100%, 320px)`），尺寸正常时不生效
- 外观: 「路由」一行加了连通性判断——`settings.json` 指向本机端口时，插件探一次 `/v1/models`，通就标「· 通」，不通就标红「· 连不上（网关没启动？）」。之前路由台退出后 `settings.json` 还指着 `127.0.0.1:19999`，界面上完全看不出问题
- 模型: `probeGatewayModels()` —— 从 `127.0.0.1:3425/v1/models` 取全部模型，**挨个发一次最小请求**（`max_tokens: 1`）探测，只保留返回 200 的；结果缓存 10 分钟
- 模型: `listModels` 改成报探测结果，一个都不通时才退回 `applied.json` 里 magpie 给 Claude Code 选的那个
- 模型: 选中哪个模型，`stream` 就把它传给 ACP，用 `session/set_config_option` 切过去；切不了就沿用 CLI 当前的，不中断这一轮
- 模型: 重新注册 `ctx.llm.registerAdapter(['claude-code'], …)`，聊天框的模型菜单里会出现「Claude Code」，选中后这一轮对话直接交给本机 Claude Code
- 模型: 只报一个模型、只用一个名字（`listModels` / `resolveModel` / `prepareCall` 共用同一个 `currentModel()`），并带 `context: { contextWindow: 1048576 }`——避免之前出现过的「同一条目显示两次」和「切模型报 `MODEL_SWITCH_COMPACTION_FAILED`」
- 路由: `stream` 里的模型优先取 `~/.config/magpie/applied.json` 中 magpie 给 Claude Code 选的那个（去掉 `[1m]` 后缀），走 `127.0.0.1:3425` 网关
- 开关仍然有效：关掉会立刻注销这个 provider，模型菜单里就不出现；注册失败只记一条 `console.warn`，不影响其余功能
- 外观: Claude Code 页加回「跑一次」——输入框 + 运行按钮 + 输出框
- 路由: `POST /dsh-concierge/claude-run` 现在会先读 `~/.config/magpie/applied.json` 里 **magpie 的 Agent 页给 Claude Code 选的模型**（去掉 `[1m]` 后缀），再起 `claude -p <任务> --output-format json --model <模型>`，子进程环境设 `ANTHROPIC_BASE_URL=http://127.0.0.1:3425`、`ANTHROPIC_AUTH_TOKEN=magpie`
- 返回里带上实际用的模型名，输出框第一行显示它
- 外观: Claude Code 页多了「magpie 路由」一行，显示 magpie 的 Agent 页给 Claude Code 选的是哪个模型
- 路由: 新增 `readMagpieApplied()`，读 `~/.config/magpie/applied.json`（magpie 每次应用设置都会写这里：`{ "claude": { "fields": { "model": "…" } } }`）；`/claude-info` 多返回 `magpieRoute`
- 运行: 跑 Claude Code 时优先用 magpie 页面上选的那个模型（去掉 `[1m]` 这类后缀），并给子进程设 `ANTHROPIC_BASE_URL=http://127.0.0.1:3425`、`ANTHROPIC_AUTH_TOKEN=magpie`——**不再依赖 `~/.claude/settings.json`**
- 外观: Claude Code 页新增「Magpie 网关」卡片——显示 magpie 注入了几条路由、共几个模型，选一个协议（OpenAI Chat Completions / OpenAI Responses / Anthropic Messages），点「合并成一条路由」
- 路由: `GET /dsh-concierge/magpie-route`（读现状）、`POST /dsh-concierge/magpie-route`（合并）
- 实现: 借鉴 `dsh-x-magpie` 的思路——把 `llm-pi-ai` 里各 provider 的模型**原样搬运**（`id` / `name` / `contextWindow` / `maxTokens` / `input` / `reasoningEfforts` / `compat` 一个字段不改），合并去重后只留一个 `magpie` provider，只换 `api`、`baseURL`、`apiKeyEnv` 三样；`baseURL` 按协议给（OpenAI 类带 `/v1`，Anthropic 用根地址）
- 外观: Claude Code 页的「当前模型」从只读文字改成**下拉**，选项来自 `~/.claude/settings.json` 的 `modelPicker.options`；选完立即写回该文件的 `model` 字段
- 路由: `POST /dsh-concierge/claude-model`，body `{ model }`；写之前把原文件备份成 `settings.json.bak-<毫秒时间戳>`，只改 `model` 一个字段，其余原样保留（2 空格缩进）
- 模型: 切换后 Claude Code 下次请求就走新模型，不需要重启

### Changed

- Claude Code（ACP）: `listModels` 从 16 个模型各发一次 `/v1/messages` 探测改成直接读路由台的 `/api/models`。路由台本来就探过了（它有「全部探测」按钮，启动时也会拉清单），插件再探一遍是重复劳动，还拖慢菜单——原来 16 个请求各超时 15 秒，现在 41ms 返回。不是路由台（老的 magpie 3425）时退回 `/v1/models`，那个列表本来就是网关认为可用的
- 模型: 新增 `pickGatewayBase()` —— 先试**路由台** `127.0.0.1:19999`，不通才回落到 magpie `127.0.0.1:3425`；结果缓存到 `lastGatewayBase`，启动时预热一次
- 模型: `probeGatewayModels` 的模型清单和探测请求都改用选中的网关，不再硬编码 3425
- 模型: ACP 子进程的 `ANTHROPIC_BASE_URL` 也跟着走选中的网关
- 外观: 路由工具检测多一项「路由台」；Claude Code 页文案从「走 magpie」改成「走路由台 / 中转」
- 模型: `currentModel()` 改成优先读 `applied.json` 的 **`claude`** 那一项（magpie 的 Agent 页「Claude Code」行选的模型），没有才回落到 `dsh` 那一项。0.24.3 是反过来的
- 模型: `currentModel()` 现在优先读 `~/.config/magpie/applied.json` 里 **`dsh`** 那一项（magpie 的 Agent 页给 DeepSeek Harness 选的模型，去掉 `magpie/` 前缀和 `[1m]` 后缀），没选才回落到 `claude` 那一项
- 效果: 你在 magpie 的 Agent 页换模型，DSH 模型菜单里这一条的名字跟着变，不用改插件
- 模型: 插件注册的 provider 显示名从「Claude Code」改成「**Magpie · Anthropic**」，和原来 magpie 注入的那组同名——菜单里看起来就是同一组，点它走的是 Claude Code（ACP）
- 配置: 删掉 `cordis.patch.yml` 里的 `llm-pi-ai` 条目（magpie 写的那组 HTTP 模型）。它和插件这组是两个不同的 provider，留着就是两组；模型名相同但一个是 HTTP 直连、一个是本地 CLI
- 模型: `Claude Code` 提供方的 `stream` 从「每轮起一个 `claude -p` 进程」换成 **ACP（Agent Client Protocol）**，借鉴 `dsh-llm-acp` 的做法
- 新增 `acp.js`：极简 ACP 客户端（JSON-RPC 2.0 / ndjson），`initialize` → `session/new` → `session/prompt`，从 `session/update` 的 `agent_message_chunk` 取增量正文
- 效果：**边生成边显示**（之前是一次性返回）、CLI 进程与它自己的会话常驻复用（省掉每轮冷启动）、`session/cancel` 支持中断、`usage` 透传真实 token
- 依赖：需要本机装 `@agentclientprotocol/claude-agent-acp`（`npm i -g`），找不到时回落到原来的 `claude -p` 路径
- 外观: 状态行文案改成「已安装（借用 magpie 的模型，不单独占一条）」；开关只控制本页功能，不再影响 DSH 的模型菜单
- 保留: `magpie 路由` 一行仍显示 magpie 的 Agent 页给 Claude Code 选了什么

### Fixed

- Claude Code（ACP）: 模型菜单里出现两条一样的「DeepSeek V4.1 Flash」——DeepSeek 官方和 codeflow 中转都提供这个模型，id 不同但名字相同（一个带空格、一个带连字符），选起来分不清。现在重名时给名字加上上游名（`DeepSeek V4.1 Flash · codeflow`、`DeepSeek-V4.1-Flash · deepseek`）
- Claude Code（ACP）: 问一句就永远不返回，实测 240 秒都没结束。原因是 ACP 的 RPC 只处理「我们发出去、CLI 回」的响应，CLI 反过来发来的请求（`session/request_permission` 申请工具权限）被当成通知丢掉了，CLI 就一直在等回复。现在 RPC 支持按 method 注册反向请求处理器，不认识的 method 也会回一个「不支持」错误让 CLI 自己往下走
- Claude Code（ACP）: 工具调用要权限时没人应答。插件没有画审批框的地方，问也问不到人，现在默认选「总是允许」那一档（`CLAUDE_ACP_PERMISSION=deny` 可以改成拒绝）；一个可选档都没有时回「取消」，让 CLI 按被拒处理并继续，而不是继续等
- Claude Code（ACP）: 回答开头经常顶着一块 `> **Warning:** …` 的 Claude Code 公告。`initialize` 里的 `clientCapabilities` 原来是空对象，CLI 没有「通知」通道可用，只能把警告塞进 `agent_message_chunk` 混在正文里。现在声明 `session: { notices: {} }`
- Claude Code（ACP）: 问「你好」时回答「我是 Claude，能帮你写代码…」这类空话，真实问题被整段丢掉。原来取的是「最后一条 `role === 'user'` 的消息」，但 DSH 会在用户那句话**之后**再注入好几条 role 也是 user 的上下文——运行时提醒、时间戳、记忆预取、记忆回答规则——于是最后一条 user 消息根本不是提问。现在从最后一条 assistant 之后开始找，只把 `source.kind === 'user'` 的当提问，其余作为上下文拼在前面，提问落在末尾
- Claude Code（ACP）: 每个新会话都弹一条「this session isn't eligible for auto mode's no-charge classifier requests」。原因是网关（`127.0.0.1:19999`）只是本机转发到中转站，不是 Anthropic 官方服务端，给不出自动模式要的服务端分类器检查（`safeguard_results`），Claude Code 就退回自己发分类器请求、照 token 计费，并弹这条警告。现在 ACP 子进程默认带 `CLAUDE_CODE_AUTO_MODE_SERVER=0`，`settings.json` 的 `env` 里自己配过就以他的值为准
- Claude Code（ACP）: 界面上永远没有思考过程，回复也像是「搞完一次性蹦出来」。两处原因：
- Claude Code（ACP）: `streamClaudeCode` 改成按到达顺序开块——思考进 `reasoning` 块（`reasoning-delta`），正文进 `text` 块（`text-delta`）。原来只开一个固定的 `index: 0` 文本块，思考没有位置可放
- 外观: 逐字显示改成默认开启。关着的时候，模型/网关把一段回答攒成几块一口气推过来（实测一轮 6 块全落在 300ms 内），屏幕上一瞬间就全出来了。嫌闪可以在 维护中心 → 外观 → 打字机 关掉
- 模型菜单: 走路由台时菜单里显示 `claude-opus-5-5` 这种裸 id，看着像没配好。原因是 OpenAI 规范的 `/v1/models` 只有 `id`，没有显示名，`probeGatewayModels` 又把 `name` 硬写成 `id`。现在：
- 模型菜单: 描述从固定 `via magpie` 改成按实际探测的网关写（`via 路由台` / `via magpie`），排查时不会被带偏
- Claude Code（ACP）: 报「There's an issue with the selected model (codeflow/claude-haiku-5-5)…」，错误码 `claude-code-acp-failed`。根因是**模型名和网关地址不是同一套**：
- Claude Code（ACP）: 网关地址变了（换路由台 / 换 magpie）就收掉旧进程重建，否则新地址不生效、还会拿旧网关的模型名去问新网关
- Claude Code（ACP）: DSH 里的模型清单改成从 settings.json 指的那个网关探测（原来固定先探 19999），清单和 CLI 实际请求的网关保持同一个
- Claude Code（ACP）: 报模型错时补一句能动手的说明（去路由台点「接入」，或把模型名改成网关 `/v1/models` 里有的 id）
- 外观: 0.25.2 把 deck 的确认卡按视口 `50%/50%` 居中之后，矮窗口里视口正中正好是输入卡的位置，看着像「弹窗掉进了输入框」。现在改成按**输入区以上那块消息区**居中：
- 外观: 落位用内联 `!important` 写 `left/top`。样式表的 `!important` 输给内联 `!important`，而 deck 的 ref 重渲染只写不带优先级的 inline 值，压不动它；再补 120ms / 400ms 两次延迟落位，覆盖 React 重渲染重写 style 的那一帧
- 外观: 样式表里的视口居中保留，作为卡片出现那一帧的兜底
- 外观: 新会话页的标题和输入框被顶到窗口最上面、下面留一大片空壁纸；聊天页会话区只剩两百多像素、底栏被挤成一条。根因是 0.25.0 加的
- 外观: 删掉那条规则。官方布局本来就是满高的（`AppFrame .frame { height: 100% }`、`HeroShell .root { height: 100% }`），皮肤不该动任何祖先的高度；它当初要修的那个现象（`root` 124px / `stack` 166px）在加规则前后实测完全一致，说明它根本没修到东西
- 外观: 模态确认框的居中选择器兼容 `position:fixed` 不带空格的序列化写法
- 外观: 「关闭整个 MattSkillsDeck」这类确认框跑到右下角。实测它的样式是
- 外观: 选择器限定为 `[role="dialog"][aria-modal="true"]` + 内联 `position: fixed` + 内联 `left:`/`top:`，并排除已经用 `left: 50%` 的。**不用全局 `[aria-modal="true"]`**——DSH 自己在用 `MutationObserver` 监听 `role` 和 `aria-modal` 管理模态行为，而且设置面板这类本来就居中的对话框再套一层 translate 会偏
- 外观: 点掉底栏工具条（如「关闭整个 MattSkillsDeck」）后，输入区上移、下方留一大片空白。用 `dockChain` 实测出根因：
- 外观: 选择器用 `div[class*="_root"]:has(> [data-composer-dock])` 精确锁到「直接包着 dock 的那一层」，避免误伤 `#root` 和别的 `_root`（页面上同时存在 `an3WzG_root` 和 `GRgSLq_root`）
- 外观: 冲突提示原来按「**装了几个**」判断，只要机器上装过 magpie 就永远弹红条（哪怕 `settings.json` 已经指向路由台）。改成按「**谁在接管**」判断：解析 `settings.json` 的 `ANTHROPIC_BASE_URL` 端口，19999→路由台、3425→magpie、3456→Claude Code Router，只有一个在用时不算冲突
- 外观: 「路由工具」一行改成显示谁在用：`路由台（在用）· 另装了 1 个未接管`；都没接管时显示 `装了 X，但都没接管`
- 外观: 「当前模型」下拉原来只写 `~/.claude/settings.json`，但运行时按 magpie 的选择走，**选了不生效**。现在下拉改成调 `magpie claude <model>`，由 magpie 自己同时更新 `settings.json` 和 `applied.json`，选完即生效
- 外观: 去掉重复的「模型」和「magpie 路由」两行（同一个值显示两遍），只留「模型」一行
- 模型: 同一个模型 id 原来在 `listModels` 和 `resolveModel` 里返回**两个不同的名字**（`Claude Code · 永不卡住 · routing group` 和 `Claude Code · 2.1.332`），DSH 因此把它当成两条。现在名字只在一处计算（`currentModel()`），`listModels` / `resolveModel` / `prepareCall` 共用同一个对象
- 模型: 名称取不到时回落到版本号或「本机 CLI」，不会出现空名字

### Removed

- 外观: Claude Code 页去掉「模型」下拉，以及 `POST /dsh-concierge/claude-model` 路由和 `setClaudeModel`。它改的是 `~/.claude/settings.json`，但 DSH 聊天框走的是自己的 provider，只有插件调 `claude.exe` 那条路才吃它——那条路在 0.23.6 已经删了，所以这个下拉是孤立设置，改了不影响任何行为
- Claude Code 的模型仍由 magpie 的 Agent 页管理，这一页只显示只读信息
- 外观: 删掉「Magpie 网关」卡片里的协议选择和「合并成一条路由」——magpie 每次同步都会拆回去，这个功能实际没用
- 卡片改名「DSH provider 配置」，只保留「只留当前模型 / 恢复配置」两个按钮，并注明它们操作的是 `cordis.patch.yml`、和上面的模型选择无关
- 模型: 去掉 `ctx.llm.registerAdapter` 的 provider 注册（0.21.6 加的），以及配套的 `createClaudeCodeAdapter` / `streamClaudeCode` / `CLAUDE_PROVIDER`。模型菜单里不再出现独立的「Claude Code」分组
- 现在 Claude Code 直接借用 magpie 的模型（`Magpie · Anthropic` 那一组里的 `codeflow/claude-haiku-5-5` 等），插件不再往 DSH 塞 provider

### Other

- 0.25.0 把「输入框塌陷」误判成了 `sticky` 父级高度问题，实测数据前后一致（`root` 124px / `stack` 166px），并没有随修复改变。真正在右下角的是这个确认框。输入区那两条兜底规则留着，尺寸正常时不生效
- 新增 `dockChain` 上报（0.24.9 加的）：`[data-composer-dock]` 的父级链最多 8 层，带 `display/position/height/minHeight/flex/gridTemplate/overflow`。这次就是靠它定位到 `root` 和 `stack` 的 42px 差值
- 截图里点掉底栏工具条后输入区上移、下方留白，实测 `dock` 只有 **280×26**，而外壳 `_frame` 是满尺寸 1281×821。插件 CSS 只改背景色和透明度（49 处 height 规则全是 `.uc-*` 自己的控件），**不改任何 DSH 布局尺寸**，所以这更像 DSH 自身的收起行为；`dockChain` 就是为定位这个加的
- 路由台的接口和 magpie 一致（`/v1/models`、`/v1/messages`），所以换过去不用改协议层
- magpie 那组 provider（`magpie-anthropic`）仍在配置里，由路由台的接入页决定去留
- `agent-default-model` 本来就指向 `claude-code`，删 `llm-pi-ai` 不影响当前会话
- `codeflow/deepseek-ai/…`、`deepseek/deepseek-flash` 这几个 magpie 模型会从菜单消失；`DeepSeek 账号` 那组不受影响
- magpie 下次接管 DSH 时可能把 `llm-pi-ai` 写回来，届时又会出现两组
- 不碰 DSH 凭据、不改 `package.json` 的插件列表，只注册一个 llm adapter
- 不碰 DSH 的 provider、不碰凭据，只起一个子进程，坏了也影响不到应用启动
- magpie 在 Agent 页给某个 agent 点了「断开」时，`applied.json` 里对应那条会消失，本行会显示「—」，此时回落到 `settings.json` 的路由
- 写前备份成 `cordis.patch.yml.bak-merge2-<毫秒时间戳>`，写后用 js-yaml 回读校验，失败就不写盘
- magpie 官方设计就是**按协议拆路由**（源码注释 `dshKinds`：DSH 的 `llm-pi-ai` 一条路由只能有一种协议），所以它写出 `magpie` + `magpie-anthropic` 两条；合并只能由外部改配置完成

## [0.20.5 – 0.23.1] - 2026-11-26

> 裁剪失败时留下可查的记录

### Added

- 诊断: 每次点「只留当前模型」都把 `{ 时间, target, result }` 追加到 `~/.dsh/logs/dsh-concierge-trim.log`——卡片上是短提示，这里能看到到底卡在哪一步（找不到配置 / 读不到当前模型 / YAML 校验失败 / 已写入）
- 路由: 新增两个动作——`POST /dsh-concierge/trim-models`（把 `~/.dsh/profiles/*/cordis.patch.yml` 里 `llm-pi-ai` 的 `providers.*.models` 裁到只剩当前勾选的模型）与 `POST /dsh-concierge/restore-config`（用最近一次备份还原）
- 外观: Claude Code 页加了「只留当前模型」和「恢复配置」两个按钮
- 模型: 适配器的 `listModels` 不再写死一个「Claude Code · 2.1.332」，改成**从路由读**——`~/.claude/settings.json` 的 `modelPicker.options` 与 `ANTHROPIC_DEFAULT_*` 映射，本机 magpie 再补一份 `/v1/models`。菜单里因此会列出 Sonnet 5 / Opus 5.5 / Haiku 5.5 这些真实可用的模型
- 模型: 选中的模型会通过 `claude -p … --model <id>` 传给 CLI
- 外观: Claude Code 页多一行「可用模型」，显示检测到的清单
- 路由: `readRoutingTools()` 自动检测本机在用的路由工具——Magpie（3425 端口探活）、CC Switch（`~/.cc-switch`）、Claude Code Router（`~/.claude-code-router`）
- 外观: Claude Code 页多一行「路由工具」，显示检测到哪些；**检测到两个以上时页面顶部弹红色提示**，写明它们改的是同一份 `~/.claude/settings.json` 的 `env.ANTHROPIC_*`，同时用会互相覆盖
- 外观: 模型菜单里的名字带上 CLI 版本（`Claude Code · 2.1.332`），注册前读一次版本号；两个同名条目因此也能区分
- 外观: Claude Code 页多一行「切换器」，显示 CC Switch 是否装了、当前用的是哪个供应商
- 路由: `GET /dsh-concierge/claude-info` 多返回 `switcher`——读 `~/.cc-switch/live-state.json`（当前供应商）与 `~/.cc-switch/config.json`（v3.2~v3.7 的供应商列表）；v3.8+ 的数据在 SQLite（`cc-switch.db`），没有驱动读不了，只报「已装（sqlite）」
- 外观: Claude Code 页多一行「版本」，显示已装的 Claude Code CLI 版本（如 `Claude Code 2.1.332`）
- 路由: `GET /dsh-concierge/claude-info` 多返回 `version`——直接读 npm 全局包里 `@anthropic-ai/claude-code/package.json` 的 `version`，不起进程、不拖慢卡片
- 模型: 用 `ctx.llm.registerAdapter(['claude-code'], …)` 把本机 Claude Code 注册成一个模型提供方，聊天框的模型菜单里会出现「Claude Code」，选中后这一轮对话直接交给它
- 适配器: 实现 `providerInfo` / `listModels` / `resolveModel` / `prepareCall` / `stream`；`stream` 把最后一条用户消息交给 `claude -p … --output-format json`，再把 `result` 作为一条文本流交回 DSH
- 路由: 依旧不自己拼——Claude Code 读 `~/.claude/settings.json`，`ANTHROPIC_BASE_URL` 指向 magpie
- 注册失败只记一条 `console.warn`，不影响插件其余功能
- 维护中心: 新增「Claude Code（走 magpie）」卡片。填一句话任务 → 点运行 → 插件在宿主侧起 `claude -p <任务> --output-format json`，把 `result` 显示出来
- 路由: 不自己拼路由——Claude Code 读 `~/.claude/settings.json`，那里 `ANTHROPIC_BASE_URL` 指向 magpie，所以模型走的是 magpie 里配的那条
- 路由: `POST /dsh-concierge/claude-run`，body `{ prompt, cwd? }`，返回 `{ ok, text }` 或 `{ ok: false, error }`
- 外观: 「背景配色」下拉加了 **自定义（三色）**，下面跟三个取色器（起 / 中 / 终）。改任意一个就切到自定义，用 `linear-gradient(160deg, 起 0%, 中 46%, 终 100%)` 拼整页渐变；三色存进 `look.wallColors`，重启后保留
- 说明: 自定义模式下把两团光斑的变量清掉，避免预设的光斑颜色和新底色打架
- 外观: 新增「背景配色」下拉。整页那层渐变和两团光斑改成由 `--dsh-wall` / `--dsh-blob-a` / `--dsh-blob-b`（深色另加 `--dsh-wall-dark`）驱动，`applyPalette()` 把选中的配色写到 `html` 上；选「默认」就把变量删掉，回落到 CSS 里原来那组粉蓝紫
- 配色: `LOOK_PALETTES` 五组，每组浅/深两套（底色 + 两团光斑），跟着 DSH 明暗主题走
- 说明: 只改**背景**，不动品牌色、不动玻璃表面的白——两者是分开的

### Changed

- 模型: `listModels` 只返回一个条目，名字跟着 `settings.json` 的 `model` / `modelPicker` 走（如 `Claude Code · DeepSeek-V4.1-Flash · DeepSeek`）；请求时不传 `--model`，让 Claude Code 用它自己当前选中的那个——路由上同一时间只有一个勾选，菜单里也不该列一长串
- 外观: Claude Code 页「可用模型」改成「当前模型」，只显示勾选的那一个
- 外观: Claude Code 页去掉 5 秒轮询，改成**切页读一次 + 右上角 ↻ 手动刷新**。原来每次刷新都会探活一次 magpie，中转用户白等 800ms 超时
- 路由: 路由工具按「当前生效的是谁」判断——`ANTHROPIC_BASE_URL` 不是本机地址时显示 `中转 · <host>`，不再把本机 magpie 当成在用
- 标题: 「Claude Code（走 magpie）」→「Claude Code（走 magpie / 中转）」
- 外观: Claude Code 页每 5 秒自动重读一次状态——CC Switch 切供应商是自动生效的，这边跟着变，不用手动刷新
- 外观: Claude Code 从「更新」页挪到**单独的标签页**（更新 / 插件 / 外观 / 性能 / **Claude Code** / 关于），只在切到这个标签时才读取状态
- 交互: 开关失败不再静默——读取或切换失败时卡片底部显示具体原因（HTTP 状态或错误文本），不再出现「点了没反应」
- 外观: 「Claude Code（走 magpie）」卡片去掉任务输入框和运行按钮，改成**开关 + 路由信息**：开关控制是否把 Claude Code 注册成模型提供方，下面三行显示路由（`settings.json` 里的 `ANTHROPIC_BASE_URL`）、模型映射、接入状态
- 路由: 新增 `GET /dsh-concierge/claude-info`（开关/已安装/已注册/路由）与 `POST /dsh-concierge/claude-toggle`；开关状态存 `~/.dsh/update-center/claude-code.json`，重启后保持
- 外观: 「自定义（三色）」那一行改成卡片（`.uc-card` + `.uc-card-head` + `.uc-card-title`），三个取色器放在卡片体里、带 12/16 内边距。原来是裸的一行，夹在其它 `settingRow` 之间没有边界
- 外观: 这张卡去掉淡入动画（`animation: none`），出现时不再有那一下延迟
- 外观: 删掉「薄荷 / 海盐 / 奶油」三组配色——它们的三个色相太接近，看着就是单色。现在「背景配色」只剩 **粉蓝紫（默认）**、**晚霞**、**自定义（三色）**
- 外观: 自定义三色保留，三个取色器任意搭；改任意一个就切到自定义
- 外观: 在 `html[data-dsh-glass="1"] body` 里把 `--dsw-alias-bg-mask-1/2/3` 压薄成 `rgba(0,0,0,0.08 / 0.05 / 0.12)`。DSH 默认是 `#0000003d`（24% 黑），压在渐变页面上就是整块 `#B5B9BE` 的死灰——更新提示、确认框都会出现这个。现在能看见后面的界面
- 说明: 这几个名字用 `overrideTokens` 写不生效（和 `bg-module-platform` 一样），只能走样式表 + `!important`

### Fixed

- 模型: 菜单里原来显示 `Claude Code · sonnet`——`sonnet` 只是 `settings.json` 里 `model` 的**别名**，真正的路由模型在 `ANTHROPIC_DEFAULT_SONNET_MODEL` 里。现在先做别名还原（sonnet / opus / haiku → `ANTHROPIC_DEFAULT_*_MODEL`），再去 `modelPicker` 里找展示名，所以会显示成 `Claude Code · 永不卡住 · routing group` 这种真实的名字
- 外观: Claude Code 页的「当前模型」也用同一套还原
- 外观: `.uc-row-title` 加 `white-space: nowrap`，`.uc-row-control` 改成 `flex: 0 1 auto; max-width: 62%`——之前控制列是 `flex: 0 0 auto`，值一长就把标签列压到只剩一个字宽，「可用模型」被挤成竖着排的四行
- 模型: `readRouteModels` 改成**有 `modelPicker.options` 就只用它**（`[1m]` 这类后缀先剥掉再去重），不再把 `deepseek/deepseek-flash`、`codeflow-2/claude-haiku-5-5` 这些裸 id 和带标签的条目堆在一起；`/v1/models` 只在没有 `modelPicker` 时兜底
- 模型: 同时去掉 `ANTHROPIC_DEFAULT_SONNET_MODEL` / `HAIKU_MODEL` 的额外条目——它们本来就是 `modelPicker` 里那几项，重复出现只会更长
- 模型: `stream` 现在把 `options.signal` 传给 `runClaudeOnce`——在 DSH 里中断一轮会真的 `kill` 掉 Claude Code 进程，之前中断了进程还在后台跑满 180 秒
- 外观: 「版本」不再只认 `%APPDATA%\npm\node_modules\…` 这一条路径。找不到时按 `claude.exe` 的位置反推包根（`<pkg>/bin/claude.exe` → `<pkg>/package.json`），装到 `~/.local/bin` 之类的地方也能读到
- 安全: `runClaudeOnce` 不再用 `spawn(…, { shell: true })`。走 `claude.cmd` 必须经过 `cmd.exe` 重新解析参数，任务文本里的 `&`、`|`、`"` 会被当成命令拼接——现在直接用原生 `claude.exe`、`shell: false`；找不到 exe 就明确报错
- 模型: 适配器返回的模型信息补上 `context: { contextWindow: 1048576 }` 和 `defaultMaxTokens: 32000`。DSH 切模型前要先压缩上下文，拿不到窗口大小就直接拒绝切换：`compaction-basic: no context capacity for claude-code/claude-code`
- 外观: `[data-windows-titlebar] [class*="_frame"]` 不再铺任何底色，改成 `background: transparent`。`_frame` 是**整个窗口容器**不是标题栏，原来那条 `background: var(--dsh-canvas) !important` 等于拿画布色把壁纸层整个盖住——整页变成 `#EEF1F8`，看起来像「渐变没了」
- 外观: 顶部标题栏那 40px 也跟着透出渐变。窗口本身已经不透明（补丁把底色改成 `#ffeef3fa`），壁纸层又往上多铺了一个标题栏高度，所以不需要再铺实色；之前铺了反而在顶部留一条和渐变对不上的色带（实测 y=0..50 全是 `#EEF1F8`，y=60 才是渐变）
- 外观: 壁纸层不再用 `background: var(--dsh-wall, 默认渐变)` 兜底。**变量一旦被赋成非法值，`var()` 里的默认值也会一起失效**，整条 `background` 作废，壁纸层什么都不画，整页就露出 `--dsh-canvas` 的 `#EEF1F8`——0.21.x 的自定义三色一旦写入异常值就会这样
- 改法: 默认那条规则直接写字面渐变（永远画得出来），配色靠 `html[data-dsh-palette="sunset"|"custom"]` 覆盖；自定义三色先过 `/^#[0-9a-fA-F]{6}$/` 校验，不合法就不写变量、落回默认
- 外观: 0.20.8 改壁纸层那条规则时，把 `background` 声明写丢了，注释也没闭合——CSS 从那里开始整段被吞，所以「背景配色」选什么都是原来的粉蓝紫。现在规则补回：`background: var(--dsh-wall, linear-gradient(160deg, #ffe6f2 0%, #e8efff 46%, #efe6ff 100%))`
- 外观: 顺手修掉一处更早留下的坏注释（`--dsh-canvas` 那段提前 `*/` 闭合），它会把紧跟的 `html[data-dsh-glass="1"] { --dsh-canvas: … }` 规则一起吞掉
- 外观: 新增 `html[data-dsh-glass="1"] [class*='_mask_']::after { background: rgba(0,0,0,0.08) !important }`。Modal 原语的遮罩不是画在 mask 元素本身，而是它的 `::after`（`._mask_1ytzq_18:after { background: var(--dsw-alias-bg-mask-1) }`），只改 body 上的 token 在伪元素里不一定吃到。设置页、插件市场、更新提示共用这个遮罩
- 外观: `--dshm-sticky-bg` 从 `rgba(252,253,255,0.86)` 改成透明，只留 `--dshm-stuck-bg`（0.9）。这两个变量是插件市场吸顶搜索条 / 分类条的底，之前**不管钉没钉住都铺**，所以那排永远是一条白带；按 [dsh-market THEMING.md](https://raw.githubusercontent.com/dsh-market/dsh-market/master/THEMING.md) 的 transparent-base contract，流动状态应该透明，只有 `[data-dshm-stuck]` 钉住时才需要底

### Other

- 改之前把原文件备份成 `cordis.patch.yml.bak-<毫秒时间戳>`，同一份配置里只动手写过的 `models:` 列表，注释和格式不动
- 改完立刻用 profile 自带的 `js-yaml` 解析校验，解析不过就放弃、不写盘
- **每个 provider 至少留一个模型**——演练时发现直接裁会把 `magpie-anthropic` 裁成零模型，所以某个 provider 没有命中项时保留它的第一个模型
- 工具调用不显示成卡片：Claude Code 的工具循环在它自己进程内完成，DSH 只拿到最终文本
- 不是逐字流式：一条回复一次性到达
- 只取文本：`lastUserText` 只拼 `text` 块，发图会被丢掉
- 不做切换动作：CC Switch 自己就是干这个的，而且它切换时改的也是 `~/.claude/settings.json` 的 `env.ANTHROPIC_*`——插件只读不写，避免和它抢同一个文件
- README 增加「Claude Code（走 magpie）」一节，写明开关、路由来源和两条限制
- 仓库简介补上「Claude Code（走 magpie）开关与模型接入」
- 只做文本流：Claude Code 自己的工具循环在它进程内跑完，DSH 这边看不到工具卡片，也拿不到 token 用量
- 一条回复一次性到达，不是逐字流式
- 临时探针把 DOM 实况写进 `~/.dsh/logs/dsh-concierge-look.log`，读出来：壁纸层 `display:block`、1281×861 铺满、`background` 就是那组粉蓝紫渐变——**层是好的**；
- `body` / `#root` / `_frame` 的计算背景：前两个透明，**`_frame` 是 `#eef1f8`**——盖住的就是它；
- 改完再量：内容左 `#F8E6F5`、中 `#EEF1FE`、右 `#E8EBFF`，渐变回来了
- `LOOK_CSS` 现在注释 56/56 配对、括号深度 0；这两项以后改完 CSS 都该跑一遍
- 遮罩来源：`dsh-web-frontend\dist\assets\index-*.css` 的 `._mask_1ytzq_18:after`
- token 定义：`@deepseek-ai/dsh-client-ui-theme\src\styles\design-platform.css`，`--dsw-alias-bg-mask-1: rgba(0,0,0,0.24)`
- 模糊本来就没有：`gradient-shadow-text.css` 里 `--dsw-mask-blur: none`，所以 `backdrop-filter: var(--dsw-mask-blur)` 一直等于 none——不是我们关掉的

## [0.18.2 – 0.20.4] - 2026-11-25

> 白块真凶：`[class*="_menu"]` 误伤了 `m2hUqa_menuAnchor`

### Changed

- 外观: 补上插件市场消费、我们一直没覆盖的 25 个 alias token——`bg-module-platform`、`border-l3/l4`、`button-primary-fill/hover`、`button-ghost-active-fill/border`、`button-tool-bar-hover`、`interactive-bg-active`、`interactive-bg-hover-danger`、`label-primary-foreground`、`brand-primary`、`link`、`menu-icon`、`state-*` 八个、`toast-label/action`、`tooltip-label`
- 外观: 设置市场吸顶搜索条 / 分类条的 `--dshm-sticky-bg`（0.86）与 `--dshm-stuck-bg`（0.97）。不设的话钉住时是透明的，卡片从底下滚过就是「磨砂」
- 移除: 按哈希类名写的 `nUhMVa_card` / `nUhMVa_recentTile` / `nUhMVa_viewBar` 补丁
- 外观: 全局关掉 `backdrop-filter`（含 `::before` / `::after`）。菜单那条 token 早就是 `none`，但应用里有硬编码的 `blur(10px)`（拖放遮罩之类）压不住，这次按元素统一清掉
- 外观: 搜索框 / 筛选胶囊（`_searchField`、`_searchInput`、`_tabSearchRow` 里的 `_pill_`）改成实色画布。半透明白铺在渐变上，观感就是毛玻璃

### Fixed

- 外观: 浮层那条「必须给足不透明底」的规则里，`[class*="_menu"]` 改成 `[class*="_menu_"]`。原来它匹配到 `<span class="m2hUqa_menuAnchor">`——一个只用来做 CSS 锚点定位（`anchor-name`）的空容器，被刷上了 `rgba(var(--dsh-tint-rgb), 0.96)` 的 96% 近白底。新会话页「标准模式」旁边那块白就是它
- 外观: 新增 `[class*='_seat']` / `[class*='_menuAnchor']` 的 `background: transparent !important`（同时清 `background-image` 和 `box-shadow`）。之前三轮（`_selector`、`bg-module-platform` token、`heroOptions` 子树）全是猜的类名，一次都没命中——真实类名是用户从 DevTools 贴出来的 `<button class="m2hUqa_seat">`
- 外观: 新增 `html[data-dsh-glass="1"] body { --dsw-alias-bg-base: transparent !important }`。之前只用 `overrideTokens` 把 `bg-base` 设成 0.6 白——**宿主的偏好写入会盖回来**，而且 0.6 的白铺在渐变上就是整页发白。现在在样式表里直接打成透明，渐变才能从每一页（包括新会话页）透出来
- 外观: 给 `[class*="_root"][data-phase]` / `[class*="_root"][data-content-phase]` 补上 `background: transparent`。新会话页（hero）的根节点 `.an3WzG_root` 自己铺 `var(--dsw-alias-bg-base)`，0.6 的白盖在渐变上就是**整页发白**——聊天页早就清成透明了，这个根节点漏了
- 外观: 删掉 `--dsw-alias-interactive-bg-hover` 的覆盖，回到 DSH 原值。它原本是 `color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)`——一层几乎看不见的淡红；我把它设成了 `fill(0.24)`（24% 白），于是**所有悬停态都变成一块白**
- 外观: `bg-layer-1` 回到 `0.6`（0.19.9 把它压到 0.34 是基于错误猜测）
- 移除: 0.19.6–0.19.8 按 `heroWorkspaceRow` / `heroOptions` 猜的那批规则
- 外观: 撤掉 0.19.0 补市场 token 时顺手加进去的 19 个**颜色**覆盖，回到 DSH 原值。`brand-primary` 在 DSH 里是 `neutral-bluish-1000`（**近黑**），我把它改成了蓝色 `#2f6bff`；`button-primary-fill`、`link`、`state-*` 八个、`toast-*`、`tooltip-label`、`menu-icon`、`label-primary-foreground` 同理。结果按钮、开关、状态点全都发蓝发绿，和原版对不上
- 保留: 表面类 token（`bg-*`、`border-l3/l4`、`settings-card-*`、`button-tool-bar-hover`、`interactive-bg-active` 等）不动——玻璃皮肤只该改「面」，不该改「色」
- 外观: 0.19.2 只把 `--dsw-alias-bg-module-platform` 设成 `transparent`，实测没生效（主题运行时很可能把这个值当非法颜色丢掉了）。这次改成合法的 `rgba(0, 0, 0, 0)`，**同时**加一条直接规则 `html[data-dsh-glass="1"] [class*='_selector'] { background: transparent !important }`，不经过 token
- 依据: 应用里有三个构建变体的选择器规则（`.CDP_Dq_selector` / `.-TO4SG_selector` / `.V68kMG_selector`），全是 `background: var(--dsw-alias-bg-module-platform)`
- 外观: `--dsw-alias-bg-module-platform` 从 `fill(0.72, 0.66)` 改成 `transparent`。应用里 `.CDP_Dq_selector` / `.-TO4SG_selector`（新会话的「标准模式」「工作区」选择器）就是 `background: var(--dsw-alias-bg-module-platform)`，默认值 `var(--dsw-static-neutral-bluish-60)` 是浅灰蓝——在白页面上看不出来，铺到彩色渐变上就是一块白板。这个 token 是 0.19.0 补市场 token 时一起加的
- 参考: 社区主题同样在跟这个按钮较劲——[dsh-gemini-cat-theme](https://dshmp.com/zh/plugins/dsh-gemini-cat-theme) 给它「补衬底」，[dsh-glass-ranswork](https://socket.dev/npm/package/dsh-glass-ranswork) 则明确「不要白底」并把 `.frame` 清成透明。玻璃皮肤取后者
- 外观: 上一版把 `[class*='_pill_']` 和 `[class*='_wrap_'] input` 一律刷成 `--dsh-canvas` 实色，误伤了新会话界面的「标准模式」选择器（被刷出一块白底）以及其它 `Pill` 组件。现在只保留 `_searchField` / `_searchInput` / `[data-chip]`（插件市场的搜索框与分类胶囊）
- 外观: 直接给 `nUhMVa_card` / `nUhMVa_recentTile` / `nUhMVa_viewBar` 写 `#fcfdff`（深色 `#1e2026`）。实测改 `--dsw-alias-settings-card-fill` 之后卡片依旧跟着渐变变色（左 `#F7E7F6`、右 `#E7EBFD`），说明那条 token 没有落到卡片上；这次按市场自己的类名前缀直接写死，不经过 token
- 注意: 前缀 `nUhMVa_` 是 dshmarket v1.84.1 的构建哈希，市场升级后可能失效
- 外观: `--dsw-alias-settings-card-fill` 从 `fill(0.9, 0.84)` 改成写死的 `rgba(252,253,255,1)` / `rgba(30,32,38,1)`，**不参与透明度缩放**。市场的卡片就是 `.nUhMVa_card { background: var(--dsw-alias-settings-card-fill, …) }`，0.9 再乘滑杆系数只剩 0.85，压在渐变上看着像磨砂
- 外观: 搜索框 / 筛选胶囊的选择器从「内置插件页的 `_tabSearchRow` 容器」改成按组件本身匹配——`_searchField`、`_searchInput`、`_wrap_ input`、`[data-chip]`、`_pill_`。插件市场（dshmarket）用的是公共 `Pill` 组件（`data-chip="1"`）和 `nUhMVa_searchField`，没有那个容器，所以之前一条都没命中
- 外观: `_centerCol:not(:has([data-conversation-region="chat"]))` 从铺 `bg-base` 改成 `transparent`。插件 / 插件市场 / 维护中心 / 自动化任务这些页面，内容区原本是一块浮起来的浅色板，和周围的彩色渐变割裂；现在整列直接坐在渐变上

### Other

- 前面 5 轮（`_selector`、`bg-module-platform` token、`heroOptions` 子树、`interactive-bg-hover`、`_seat`）全是猜的，一次都没命中；
- 最后是用户开 DevTools，**Styles 面板直接显示了命中的那条规则**——`background-color: rgba(var(--dsh-tint-rgb), 0.96) !important`，正是我们自己写的浮层规则；
- 教训：**宽泛的 `[class*="..."]` 属性选择器是雷区**。哈希类名里 `_menu`、`_card`、`_pill` 这类词根会被别的组件复用（`menuAnchor`、`cardShots`、`pillRow`），一律要带尾部下划线或更长的前缀。
- `.m2hUqa_seat` 自己的规则是 `background: 0 0`（透明），只在 `:hover` / `[aria-expanded=true]` 时取 `--dsw-alias-interactive-bg-hover`；这两条都已还原成 DSH 原值，白块仍在，所以还有别的东西在画底。这条按真类名压死
- [dsh-theme-theresa 架构说明](https://dshhub.org/en/plugins/wanxi123w/dsh-theme-theresa/)：「色板注入作用域样式表，`--dsw-alias-bg-base` 设为 `transparent`；**不走 ctx.theme.overrideTokens**，所以 `rgba()` / 渐变 / `backdrop-filter` 都能写，也不会和宿主的偏好写入抢状态」
- [dsh-ui-appearance](https://dshbase.com/zh/plugins/dsh-ui-appearance/)：「当壁纸/视频生效时，自动对宿主底座（`--dsw-alias-bg-base`）进行**透明打孔**」
- [dsh-market THEMING.md](https://raw.githubusercontent.com/dsh-market/dsh-market/master/THEMING.md)：市场**故意不画自己的颜色**，全部走宿主 alias token；「类名是构建哈希，主题永远不要点它」，稳定钩子只有 `[data-dsh-market-root]`、`[data-dsh-market-tab]`、`[data-dshm-stuck]` 和 `--dshm-sticky-bg` / `--dshm-stuck-bg`
- 同一份文档的 transparent-base contract：透明主题必须自己给吸顶行铺底，否则「卡片从它们下面滚过，两层文字叠在一起」

## [0.13.6 – 0.18.1] - 2026-11-24

> 修掉维护中心整页崩掉的真因：effect 写在了 state 之前

### Added

- 路由: `GET/POST /dsh-concierge/auto`，读写自动更新开关并回报最近一次自动更新的结果（`lastAuto`）
- 状态: `/status` 增加 `auto` 与 `lastAuto` 两个字段
- 外观: `_sidebarCol` 加 `box-shadow: inset -1px 0 0 var(--dsw-alias-border-l1)`，在右边缘画一条 1px 发丝线。两边同色之后需要一条分界，用 inset 阴影而不是 border——border 会把列宽挤掉 1px，窗口缩放时还会闪
- 工具: `patch-window-opaque.mjs`（配 `apply-window-opaque.cmd`）。把窗口的 `"#00000000"` 换成不透明 `"#ffeef3fa"`（等长替换 27 处，跳过库里的 `NULL_COLOR={css:"#00000000"}` 空色常量）。窗口不透明之后 DWM 的亚克力被完全盖住，页面不再叠两层模糊——这也是「看着又灰又脏」的结构性原因
- 说明: 等长替换只能放一套颜色，深色模式下也会是浅色底；确认方向后再走重建 asar 的版本
- 工具: `patch-titlebar-color.mjs`（配 `apply-titlebar-color.cmd`）。顶栏那 40px 是 Windows 按主进程给的 `titleBarOverlay.color` 自己刷的，CSS 碰不到；把 `chromeFallbackFill()` 的返回值从 `"#1b1b1c" : "#f9fafb"` 换成 `"#0e1116" : "#eef3fa"`（等长替换 3 处，asar 头不用动）

### Changed

- 外观: 输入卡 / 状态栏 `0.85 → 0.62`，代码块 `0.55 → 0.34`、代码块标题条 `0.64 → 0.44`，设置面板 `0.85 → 0.70`。0.85 的白压在彩色底上就是一块白板，降到 0.62 之后能透出底下的淡紫，边界也软下来
- 外观: 输入框座位改成 `transparent`，撤掉那条 `#efeaf9` 的紫色带子。座位原来的不透明底是为了挡滚动文字，但页面改成彩色渐变之后，任何单一实色都拼不上底下的渐变，只能整条撤掉
- 外观: 彩色光斑用**伪元素分层**加回来——`::before` 粉、`::after` 蓝，各只有一条 `background`，不会重蹈多层 `background-image` 被整体丢弃的覆辙；深色另配一套
- 外观: 输入框座位从纯白 `#fbfcff` 改成淡紫 `#efeaf9`（不透明，仍挡滚动文字），和页面底部同调，不再切出一条白带
- 外观: 深色壁纸层也从多层写法改成单层渐变
- 外观: 浅色壁纸层从「3 个 radial + 1 个 linear + background-size/repeat 各 4 个值」简化成**一条 `background: linear-gradient(160deg, #ffe6f2, #e8efff, #efe6ff)`**。多层声明里任何一处不合法，整条 `background-image` 都会被丢弃，表现就是「这一层什么都不画」——先排除这一类，再谈配色
- 外观: 背景改成**三团彩色光斑**（粉 `rgba(255,224,240,.92)` / 蓝 `rgba(212,228,255,.95)` / 紫 `rgba(224,212,255,.88)`）铺在 `#eef1f8` 上；结构层（AppFrame、ConversationRoot、`_centerCol`、`_bottomRow`、`_sidebarCol`）全部改成 `transparent`，让光斑透上来
- 外观: 表面回到白纱——`bg-base` / `layer-1` 0.60、`layer-2` 0.85、`layer-3` 0.78、`overlay` 0.80、输入卡 0.85、卡片 0.66
- 外观: 竖杠换成 `rgba(15,15,20,0.08)`（Arc 的 `--border-alt`），输入卡保留 `rgba(255,255,255,.55)` 内高光
- 依据: 玻璃的颜色来自**背景**而不是表面——「纯白背景无法显示明显的背景采样」（[linear-glass-ui](https://gitee.com/xiaobait9/linear-glass-ui/blob/master/README.md)）；Arc 的配方是彩色光斑 + 白 0.60/0.85 表面（[Arc Glass](https://raw.githubusercontent.com/rohitg00/awesome-claude-design/main/design-md/glass/arc.md)）；WinUI Acrylic 同构：模糊 → 亮度层 → 色调，`tintOpacity` ≈ 0.6、`luminosityOpacity` ≈ 0.85（[msime-windows #1033](https://github.com/metasequoiaime/msime-windows/pull/1033)）
- 外观: `--dsh-canvas` 浅色从 `#eef3fa` 压到 `#e4ecf7`，壁纸渐变同步（`#e4ecf7 → #dfe9f4 → #e4edf2`）。之前画布和卡片只差 10 个色阶（`#eef3fa` vs `#F8FAFD`），而原页面本来就是 `#F2F6FB`，所以 0.16.0/0.16.1 换完肉眼几乎看不出差别——实测侧边栏 `#F0F5FA`、内容 `#F7F9FC`
- 外观: 底色改成不透明之后整窗一个色、太平，所以把「卡片这一档」整体提亮：`layer-1` 0.62 → 0.80、`layer-2` 0.72 → 0.88、`layer-3` 0.66 → 0.84、`overlay` 0.66 → 0.86、`card-fill` 0.50 → 0.72、`card-tile` 0.48 → 0.68、`settings-card` 0.80 → 0.92、输入卡/状态栏 0.46 → 0.82、菜单 0.74 → 0.92
- 思路: 底是一层实色画布（`#eef3fa`），卡片是「压在上面的纸」（≈`#F8FAFD`），层次靠亮度差 + 投影 + 发丝线，不再靠多层半透明叠出磨砂
- 外观: AppFrame、ConversationRoot、`_centerCol`、`_bottomRow`、`_sidebarCol` 全部改成 `var(--dsh-canvas)`（不透明）。之前每层都是半透明白（0.42 / 0.62 / 0.72…），叠起来就是一层层磨砂纸，越叠越白越叠越灰；改成一层实底之后颜色只有一个来源，层次交给卡片填充和那条发丝线
- 钩子: 用的是 dsh-theme-mist 层级实测里的稳定选择器——`[id='root'] > div[data-slot='root'] > div`（AppFrame）、`[data-slot='main.conversation'] > div`（ConversationRoot），不再靠哈希类名猜
- 外观: `#dsh-concierge-frost` 改成 `display: none`，同时删掉它的子层样式。这一层是「预模糊的壁纸副本」，铺在整页底下，所有半透明面板都压在它上面——填充降到 0.42/0.46 之后，透出来的就是这层糊过的壁纸，输入框底下看着像垫了一张磨砂纸。壁纸本身由 `#dsh-concierge-glass` 铺，去掉这层不影响底色，只是不再糊
- 外观: 预模糊层 `saturate(0.62)` → `saturate(1.25)`。玻璃材质的判据是「场景颜色要活下来（saturation ≥ 1.3）」，之前是反向操作，把壁纸的蓝和薄荷全压掉了，剩下的就是一层灰
- 外观: 填充整体降一档——`bg-base` 0.58 → 0.42、`layer-1` 0.76 → 0.62、`layer-2` 0.86 → 0.72、`layer-3`/`overlay` 0.80 → 0.66、输入卡 0.76 → 0.46、状态栏 0.76 → 0.46、菜单 0.92 → 0.74、设置卡 0.95 → 0.80、卡片 0.65 → 0.50。tint 一旦超过 0.4，玻璃就退化成磨砂塑料
- 外观: 输入卡补 1px 内高光（`inset 0 0 0 1px rgba(255,255,255,.55)`，深色 0.16），边界靠「棱」而不是靠「白」
- 外观: 删掉调试用的洋红 / 青色标记（`frame` / `frame::before`），确认了那条不属于页面
- 外观: 给顶层表面（`html` / `body` / `#root` / `_frame` / `_sidebarCol` / `_centerCol` / `_bottomRow`）加 240ms 的 `background-color` + `color` 过渡。切浅深、切皮肤、改主题时颜色渐变过去，不再瞬间跳变
- 外观: 「过渡期兜底」那个状态排除在过渡之外——它要求根层立刻变不透明，加了过渡反而会把白带放回来
- 兼容: `prefers-reduced-motion` 下关闭过渡

### Fixed

- 客户端: `POST /auto` 那个 `React.useEffect` 原本插在 `const [autoUpdate, setAutoUpdate] = React.useState(…)` **之前**。`const` 初始化前处于暂时性死区，渲染到这里会抛 `Cannot access 'autoUpdate' before initialization`，整个维护中心组件崩掉——表现就是「设置页界面没了」，只剩遮罩盖着聊天。现在 effect 移到 state 声明之后
- 说明: 之前把这个问题归因到 `--dsw-alias-bg-*` 那批 token（0.18.2–0.18.5 连加了补 token、`solid()`、涂遮罩三层），全部是误判，已在退回时删掉，现在一行业务样式都没动
- 自动更新: 以前自动安装写在维护页组件的 effect 里（`if (!autoUpdate || !data …) return; updateAll()`），**只有打开更新页才会执行**。现在由宿主定时器负责：启动 90 秒后先跑一次，之后每 30 分钟一次，页面开不开都一样
- 自动更新: 开关从页面里的 `localStorage` 标志改成宿主侧持久化（`~/.dsh/update-center/auto.json`），页面挂载和切换时通过 `POST /dsh-concierge/auto` 同步给宿主
- 弹窗: 「已提示」与「节流时间」从内存变量改成 `localStorage` 持久化。以前重启就重置，所以每次启动都会再弹一次；现在同一个更新集合只提示一次
- 弹窗: 宿主开着自动更新时，后台轮询不再弹「发现新版本」——它会被自动装掉，弹了只是噪音
- 外观: `applyWallpaper()` 用 `style.removeProperty('background-image')` 取代 `style.backgroundImage = ''`——后者在 CSSOM 里是空操作，上一次写进去的 `url(...)` 会一直盖住样式表里的渐变
- 外观: 自定义壁纸改成**先探测再挂**：`new Image()` 加载成功才写内联样式，失败就保持渐变。壁纸文件被移走/改名时，那一层不再变成空白、露出窗口底色
- 外观: 从壁纸层的 `background-image` 里去掉 `var(--dsh-grain, none)`。颗粒是 SVG data URI（带引号和逗号），`var()` 替换进去之后**整条 `background-image` 被判定非法、整体丢弃**——所以纯色能画、渐变一条都画不出来，页面永远是白的。用洋红/绿标记逐层验证过：子层能画纯色，画不了渐变
- 外观: `background-size` / `background-repeat` 同步改成 4 个值（原来按 5 层写）
- 外观: `html[data-dsh-glass="1"]`、`body`、`#root` 全部 `background: transparent`。应用 boot 时写了 `body{background-color:#fff}`（深色 `#151517`），而壁纸层是 `z-index: -1`，**正好被 body 那层不透明背景盖住**——这是今天所有「壁纸/光斑没生效」的总原因：改动全画在了 body 背后
- 说明: 这个 profile 没有 HMR，客户端改动必须**完整重启**才生效（刷新只是重新请求同一个旧 bundle）
- 外观: 侧边栏那条发丝线从 `--dsw-alias-border-l1` 换成 `--dsw-alias-border-l2`。浅色下 `border-l1` 是 `rgba(255,255,255,0.6)`——白色画在白底上，等于没画（截图实测侧边栏右缘 x=420–450 全是 `#F2F6FB`）；`border-l2` 是 `rgba(120,130,150,0.18)`，深色下白 18%
- 外观: 座位改用**官方稳定钩子** `[data-composer-seat]`，渐隐终点从不透明的 `var(--dsh-canvas)` 起（36px 之后实底），不再用半透明的 `bg-base`。之前按类名猜（`_composerSeat` / `_composerStack`）一直没命中真正那一层
- 依据: [dsh-web commit 4138d4d](https://github.com/zhu1090093659/dsh-web/commit/4138d4dadc344ab2a9b04566150a8b0efadcd7b2)「opaque composer seat fade for background skins (#98)」；层级实测见 [dsh-theme-mist 视觉规范](https://raw.githubusercontent.com/ffyfox/dsh-theme-mist/078c7dfc4e2523935f11be0754080076b5c02a0b/docs/visual-spec.md)（第 5 层 = `[data-composer-seat]`，36px 渐变终点色）
- 外观: `_composerSeat` / `_composerStack` 的背景从 `var(--dsw-alias-bg-base)`（半透明）换成 `var(--dsh-canvas)`（不透明）。之前是拿「同一种半透明色」去盖半透明，等于没盖——座位自带的 `color-mix(… bg-base …)` 渐隐整体变透，壁纸透上来，输入框底下像垫了张磨砂纸
- 依据: [dsh-web#98](https://github.com/zhu1090093659/dsh-web/issues/98) 记录的是同一个坑——插画皮肤把 `--dsw-alias-bg-base` 改透明后，`composerSeat` 的 `color-mix` 遮罩整体失效；[token-map.md](https://raw.githubusercontent.com/Cenuon/dsh-opencode-ui/66066534874a3f5479df10c2959bba42d787e961/docs/token-map.md) 说明 token 是写在 `<body>` 上的内联样式，只能走 `overrideTokens`，CSS 改不动
- 外观: `--dsw-specific-input-major` 和 `--dsw-specific-tip` 从 `fill(0.76, 0.78)` 降到 `fill(0.58, 0.62)`。输入卡用的是这个 token（`GRgSLq_card`），0.76 比会话区的 bg-base（0.55）实一档，在玻璃上就是一块白板
- 外观: 壁纸渐变的末端从 `#eaf1f1`（薄荷，R234 G241 B241）改成 `#edf1f4`（中性偏蓝）。页面只有 0.55 不透明度，壁纸从底下透上来，越靠下越青——输入框那一带正好压在渐变末端，实测从 `#E2E8EA` 渐变到 `#CCE8EB`。三处渐变（玻璃层、预模糊层、兜底层）一起改
- 外观: 0.14.5 只写了 `_composerSeat`，但实际渲染出来的是 `_composerStack`（用户贴的 DOM 确认），规则没命中。现在两个类名都兜上，统一铺 `var(--dsw-alias-bg-base)`。渐隐的尽头露出的是预模糊壁纸（`blur(28px) saturate(0.62)`，底部薄荷段），所以发青
- 外观: `_composerSeat` 的渐隐（`linear-gradient(180deg, transparent 0, var(--dsw-alias-bg-base) 36px)`）在玻璃下失效——`bg-base` 只有 0.55 不透明度，渐变的「实色端」照样半透明，壁纸从底下透上来，整块发青（实测从 `#E2E8EA` 渐变到 `#CCE8EB`）。改成和会话区同一个平色 `var(--dsw-alias-bg-base)`
- 外观: `_bottomRow` 从 `transparent` 改成 `var(--dsw-alias-bg-base)`。会话区现在统一铺 bg-base，底栏透明就会直接露出壁纸——实测底栏 `#CEE7EA`、内容区 `#E4EAED`，输入框周围那一圈因此发青
- 外观: `#dsh-concierge-frost` 的兜底色从 `rgba(tint, 0.32)`（中性白）换成壁纸渐变。子层（模糊壁纸）不透明，平时完全盖住兜底色；但静止时 GPU 可能把那个大模糊层丢掉，露出来的就是中性白纱——压在桌面上正是「去饱和的灰」。换成壁纸之后，子层掉了只是少一层模糊，不会变色
- 外观: `#dsh-concierge-glass` 加 `top: calc(-1 * var(--dsh-windows-titlebar-height))`。frame 有 `padding-top: 40px`（放标题栏），而壁纸层是 `position: fixed; inset: 0`——包含块是 frame 的 padding box 时，`inset: 0` 从内容区开始，窗口最上面那 40px 直接漏出桌面。实测那 40px 两列颜色不同（`#B1D2DE` / `#A8D2E1`），正是各透各的证据
- 外观: 玻璃下 frame 和它的 `::before` 直接用 `--dsh-canvas`（`#eef3fa` / `#0e1116`），不再叠一层 `bg-base`。补丁把系统标题栏改成了同一个值，而 CSS 这边还多叠了 0.55 层白，实测系统 `#eef3fa`、页面 `#D8E8EF`，差一档
- 外观: `data-windows-titlebar` 可能挂在 `<html>` 上，也可能挂在 `<body>` 上。0.13.8 只写了 html 那一版，实测顶栏仍是 `#B1D2DE`（内容是 `#D8E8EF`）。现在两种写法都写上，`::before` 和 native 分支同样处理
- 外观: 顶栏选择器从 `html[data-dsh-glass="1"] [data-windows-titlebar] …` 改成 `html[data-dsh-glass="1"][data-windows-titlebar] …`。`data-windows-titlebar` 加在 **`<html>` 本身**上（`documentElement.hasAttribute`），当后代找永远匹配不到——0.12.2 到 0.13.7 这几版对顶栏的修改其实都没生效
- 外观: 顶栏那条是 `_frame` 的 `padding-top`（应用规则 `[data-windows-titlebar] .frame { padding-top: …; background: sidebar-fill }`），而 `sidebar-fill` 在玻璃下是 0.004 → 整条直接露出桌面（实测 `#9FBFCC`），和内容的 `#D8E8EF` 差一大截。现在把「壁纸渐变 + bg-base」画到 frame 上，padding 区自然和内容同色
- 外观: 玻璃下顶栏（`[data-windows-titlebar] [class*="_frame"]` 和它的 `::before`）改成「壁纸渐变 + bg-base」两层叠加。之前只铺了 `bg-base`（0.55 白），背后没有壁纸层，直接露出桌面 → 整条发蓝（实测 `#B3D2DF`），而下面的内容背后有壁纸（`#D8E8EF`），两截对不上
- 外观: 侧边栏改回 `--dsw-alias-bg-base`。会话区根节点铺的就是这个 token（玻璃下 `rgba(248,250,252,0.55)`，发白），而侧边栏之前被强制成 `transparent`，直接露壁纸（发蓝）——两块并排差一大截

### Other

- 外观: `--dsw-specific-input-major` 和 `--dsw-specific-tip` 回到 `fill(0.76, 0.78)`。0.58 那版卡片和页面几乎同色，边界全靠描边，实际看着更差——用户反馈「真的不好看」

## [0.2.0 – 0.13.5] - 2026-11-22

> 插件路由补上 DSH 自己的访问检查

### Added

- 工具: 性能上报里多一份 `hits`——页面顶部 30/90/230px 三处的元素层级和背景色。按 `Ctrl+Alt+H` 立刻上报一次
- 用途: 横带到底是哪一层画的，直接看元素链和它的 `background-color`，不再靠截图猜颜色
- 工具: `scripts/patch-window-frame.mjs`（配 `apply-window-frame.cmd`）。给主窗口构造插入 `thickFrame:!1,roundedCorners:!1`。Electron 41.3+ 的 `RestoredFrameBorderInsets()` 会在无边框窗口的左/右/下各留一圈不可见缩放边框（顶部为 0），acrylic 铺满整个窗口矩形、页面只铺客户区，那圈就是「后面一层」
- 工具: 这是插入式修改，会重建 asar 头——新内容追加到数据区末尾，只改它自己的 offset/size 并去掉 integrity，其余文件的偏移不变（已验证：20055 个文件字节一致，只有 `lib/main.js` 变化）
- 代价: 窗口不能再拖边改大小（`thickFrame:false` 的直接结果）
- 工具: `scripts/scan-dead-code.mjs`，静态扫「定义了没人调用的函数 / 写了没人用的 dataset 钩子 / 定义了没人用的 `uc-*` 类」
- 工具: `scripts/patch-window-match.mjs`（配 `apply-window-match.cmd`）。把 `chromeFallbackFill()` 的返回值从 `"#1b1b1c" : "#f9fafb"` 换成 `"#0e1116" : "#eef3fa"`——等长替换，窗口底色、标题栏遮罩和所有 `setBackgroundColor` 调用一起变成玻璃皮肤的基色
- 文档: 说明窗口有约 11px 非客户区，页面画不进去；窗口透明时那圈会露出桌面，所以改成同色而不是透明
- 外观: 开「真透明留边」时，宿主通过 `DWMWA_BORDER_COLOR`（34）把 Windows 画的那圈 1px 窗口边框设成 `DWMWA_COLOR_NONE`，关掉留边时设回默认。之前窗口边框和内容圆角边之间夹着 10px 留边，视觉上是两条边；去掉外框后只剩内容自己那条圆角边
- 工具: `/window-corners` 路由接受 `borderless` 参数（宿主侧改动，需要重启 DSH 生效）
- 工具: `scripts/patch-window-clear.mjs`（配 `scripts/apply-window-clear.cmd`）。DSH 的窗口构造参数本来是 `backgroundColor:"#00000000"` + `backgroundMaterial:"acrylic"`，但主进程在 `nativeTheme` 更新和「进入工作区」时又调了 `window.setBackgroundColor(chromeFallbackFill())`——浅色下就是 `#f9fafb`，正好是留边那圈的颜色。这个补丁把那三处调用等长替换成透明色，让窗口底色保持透明，亚克力才透得出来
- 外观: 「留边调试（品红 / 绿）」，只在留边开启时出现。外圈涂品红、内容涂绿并关掉投影，用来定位缝属于哪一层、有多宽；开关保留在代码里，以后调边距和圆角继续用
- 外观: 「真透明留边（试验）」。DSH 主窗口本来就是 `backgroundColor:"#00000000"` + `backgroundMaterial:"acrylic"`，页面四周留空后露出的是桌面壁纸的模糊；内容区同步内缩，中间仍然实心，尺寸变化时不会露白
- 工具: 开关 9 = `--disable-gpu`，完全软件渲染（最后手段，整体会变慢）
- 工具: 开关 7 = `--disable-frame-rate-limit --disable-gpu-vsync`，开关 8 = `--enable-gpu-rasterization --num-raster-threads=4`
- 工具: 开关 5 / 6 = `--default-background-color=ffccd8ee` / `00000000`
- 工具: `--mode transparent|opaque`，透明窗口用等长替换（`transparent:!0,`）塞进构造参数，不动 asar 头
- 工具: `--ensure`，应用更新后按上次记录的模式自动重打
- 工具: `scripts/launch-with-patch.cmd`，启动前检查补丁，缺失或过期就自动重打再启动
- 工具: 补丁记录 `app.asar.patch.json`（应用版本 / 颜色 / 备份哈希）
- 工具: `--color` 换窗口底色，`--check` 报告当前实际颜色与是否过期
- 外观: 「简化壁纸」开关（默认开），砍掉三层径向光斑，缩放重绘更轻
- 外观: 「拖动时降级」开关（默认开），拖窗口时壁纸和预模糊层换成纯色，松手 150ms 恢复
- 工具: `scripts/toggle-live-resize.ps1`，一键切换 Windows 的 DragFullWindows，带 -Status / -On / -Off
- 工具: `scripts/patch-window-fallback.mjs`，把主窗口的 acrylic 回退色换成壁纸同色系，带 `--check` / `--revert`
- 关于: 功能介绍只列功能，不列设计取舍

### Changed

- 工具: 探针改成轮询 `_pageHead` 是否出现，出现后 900ms 自动上报一次。之前要手动按 `Ctrl+Alt+H`，两次都按在了会话页上，拿不到设置页的数据
- 工具: 探针的 `hits` 现在也带 `::before` / `::after` 的底色和渐变，方便下次直接看到伪元素
- 外观: 不再由插件设置 `DWMWA_SYSTEMBACKDROP_TYPE`。那块「亚克力板」的根因是窗口的 11px 缩放边框，不是材质本身；材质交给应用自己决定
- 界面: 更新页的三个数字从「三张独立小卡」合成一张卡，格子之间只留竖分隔线；格子里不再各自画底、描边和投影
- 界面: `.uc-tabs` 加 1px 描边、内边距收到 3px，激活项改用官方 `--dsw-shadow-lv1`，hover 补了底色。之前页签容器和面板几乎同色，看不出是一组
- 两套皮肤共用同一套样式，颜色走 token，玻璃下自动跟着壁纸
- 界面: `.uc-hero`（应用本体那块）加 1px 描边和 `--dsw-shadow-lv1` 投影，和卡片同一套材质；之前只有一层和背景几乎同色的底，看着像一段裸文字
- 界面: `.uc-btn` 改成「白底 + 1px 描边」，内边距 8→7px 补上边框占的高度；`uc-btn-ghost` / `uc-btn-danger` 去掉描边，保持纯文字按钮
- 界面: `.uc-card` / `.uc-stat` 加官方 `--dsw-shadow-lv1` 投影，卡片不再只靠描边区分
- 界面: `.uc-card-head` 加一条 `--uc-sep` 分隔线，内边距改成上下对称的 12px；卡头和内容之间现在是「一条线」，不是靠留白
- 界面: `.uc-card` 和 `.uc-stat` 各加 1px `--dsw-alias-border-l1` 边框。之前只有背景色和顶部一条高光，在浅色面板上几乎看不出边界，加卡头也不明显
- 界面: 「更新」页里自动更新那一块补上 `uc-card-head`，标题「更新设置」。之前只有一行开关，没有卡头，和页面上其它卡片不是一套样式
- 文案: 新增 `updateSettings`（中英）
- 外观: 原生皮肤下 `.uc-root` 面板底色从 `bg-base` 改成 `bg-layer-2`。原生页面本身是纯白，面板再用纯白，卡片（`layer-1` 白）就没有边界了；玻璃下是「有色面板 + 更亮卡片」，原生现在保持同一个层级关系，排版看起来一致
- 外观: 「原生」不再覆盖任何 token。之前覆盖 `bg-base` 和 `specific-sidebar-fill` 去对齐玻璃底色，结果是画布偏蓝、官方白卡片压在上面像贴了另一块纸
- 外观: 原生画布改用官方的 `neutral-bluish-00` / `-950`（`#ffffff` / `#151517`），不再借用玻璃的 `#eef3fa` / `#0e1116`
- 外观: 底栏作用域里的 `--dsw-specific-menu` 从「完全透明」改成 `rgba(var(--dsh-tint-rgb), 0.55)`，并恢复卡片的投影。0.87（token 原值）像块白板，全透明又没了边界，0.55 是中间档：卡片还在，但和会话区更接近
- 外观: 底栏作用域里把 `--dsw-specific-menu` 设为透明、`--dsw-elevation-panel` 设为 `none`。输入卡的底色不是 `input-major`，而是卡片自己的 `::before` 用 menu token 画的（和菜单共用同一个值），直接改 token 会把菜单一起变透；限定在 `_bottomRow` 里改，卡片就和会话区同色了，菜单不受影响
- 外观: 新增 `--dsh-canvas`（浅 `#eef3fa` / 深 `#0e1116`）。根层、壁纸渐变起点、简化壁纸、拖动降级、过渡兜底、原生皮肤全部改用它；CSS 里原本重复 18 次的画布字面量，现在只剩 4 处定义
- 外观: JS 侧新增 `LOOK_CANVAS` 常量，给「原生」皮肤的 token 用（token 是 JS 对象，读不到 CSS 变量）
- 工具: `apply-window-match.cmd` 沿用「应用 → 启动 → 观察 25 秒 → 没起来就自动还原」的流程
- 工具: `/window-corners` 改成枚举该进程的可见顶层窗口、取面积最大的那个（跳过 DevTools 和小于 700×500 的窗口），不再依赖 `MainWindowHandle`——启动早期它可能是 0，标题也还是空的
- 工具: 页面加载后的第一次调用会带 `watch: 15`。PowerShell 在应用启动收尾期间每 1.5 秒重设一次圆角和边框色，兜住「应用 show / setBounds 时重写窗口样式、把 DWM 属性冲掉」这个情况
- 工具: `runPowerShellCommand` 支持自定义超时，watch 期间按 `watch + 8` 秒算
- 外观: `--dsh-edge-radius` 改成 `0`，四角变方、不再透出桌面
- 外观: 开关改名「无边框窗口」，提示同步更新
- 外观: `--dsh-edge` 从 10px 改成 0px。内容直接铺满窗口，窗口边缘不再有那圈 10px 的亚克力带；圆角、透明窗口、去掉 DWM 边框都保留。想要回那圈，把它改大即可（10px 是之前试过的值）
- 外观: 开关改名「无边框圆角（真透明）」，提示同步更新
- 工具: 应用脚本把「还原命令」单独放一行，避免 cmd 把 `node ...` 当成命令去执行而报「不是内部或外部命令」
- 工具: `patch-window-clear.mjs` 只改运行时那 3 处 `setBackgroundColor(chromeFallbackFill())`，不再动标题栏遮罩的构造颜色——后者的颜色本来就会被 preload 探针按 token 覆盖，少改一处少一个变量
- 工具: `apply-window-clear.cmd` 改成「应用 → 启动 → 观察 25 秒 → 进程不在就自动还原并重启」。上一次打完补丁启动即退（崩溃日志是 `desktop welcome: Web request failed`，不是颜色报错，但无法排除补丁影响），所以这次让脚本自己兜底
- 文档: 说明窗口底色是主进程运行时改的，CSS 改不到，必须打这个补丁
- 外观: 留边从 `clip-path` 换成「`body` 透明 border + `overflow: hidden` + `border-radius`」。`clip-path` 的 `inset` 是相对元素自己的参考盒算的，元素盒子不在窗口原点时整个切口会跟着偏移（之前「一上一下」的根因）；border 参与布局，菜单栏和 `#root` 会一起向内缩，基准天然是视口
- 外观: 壁纸层用同一组变量自己内缩（它是 `fixed`，不参与 border 布局），和内容共用同一个内半径
- 外观: 去掉外投影和 1px 描边，回到最简形态；调试开关保留
- 文档: README 的皮肤列表改成「玻璃 / 原生（纯白）」，补上简化壁纸、拖动时降级、真透明留边；窗口材质补丁那节改写为「白条已由 CSS 修好，补丁只用于换材质」，并说明 `acrylic` / `none` 对留边观感的区别
- 文档: `docs/RESIZE-BAND.md` 补上「真透明留边」这个例外
- 文档: `docs/DETAIL.md` / `DETAIL.zh.md` 删掉「流式时临时关聊天区 backdrop-filter」这条已不存在的机制
- 外观: 留边的边距 / 圆角改成 `--dsh-edge` / `--dsh-edge-radius`（10px / 16px），只在一处定义
- 外观: 窗口外圈加投影、内圈加 1px 高光。投影挂在**没被裁剪**的 `body::before` 上，和切口完全对齐；深色用单独一组更重的阴影
- 外观: 「原生」只覆盖 `--dsw-alias-bg-base`（浅色 `#eef3fa`、深色 `#0e1116`），卡片仍是官方白，两套皮肤来回切时底色不再跳
- 外观: 壁纸光斑从蓝 / 紫 / 青三种色相收成同色系蓝加一个暖中性，源色先降饱和，模糊层不再用 `saturate(0.32)` 硬压
- 外观: 玻璃 tint 改成中性近白 `248,250,252` / 近黑 `26,28,32`，不再偏蓝
- 外观: 面板不透明度抬到 Acrylic 量级（`bg-base` 0.55、`layer-1` 0.72、`layer-2` 0.82、设置卡 0.90），透明度滑杆映射改为 ×1.25–×0.55
- 外观: 颗粒默认 3%（原 6%），预模糊从 18px 提到 28px
- 外观: 旧存档里的透明度和颗粒滑杆值一次性回落到新默认（`lookRev` 迁移）
- 外观: 皮肤下拉只保留「玻璃」和「原生（纯白）」；旧的柔和 / 墨色 / 海洋存档自动落到玻璃
- 外观: 「原生」不再依赖 DWM Acrylic 和 asar 补丁，改为官方默认配色，不挂壁纸和模糊层
- 外观: 「拖动时降级」同时把会话区的布局/绘制范围限制在自身盒子里，内容不消失
- 工具: `--check` 直接报告当前模式、底色和 acrylic 状态
- 工具: 四个 GPU/合成层开关编号化，另外补上 `--disable-direct-composition`
- 工具: `launch-with-patch.cmd` 增加 `FLAGS` 一行，切换 `--enable-features` / `--use-angle` / `--disable-gpu-compositing` 不用改 asar
- 外观: 壁纸层加 `will-change: transform`，缩放时走图层缩放而不是在新尺寸上重新栅格化
- 工具: 补丁脚本同时把 `backgroundMaterial` 换成 `none`；acrylic 在玻璃皮肤下看不见，只带来缩放时的浅色带
- 外观: 标题栏加 0.16 的 tint 压住壁纸渐变，底部 16px 收到 0，和内容区之间没有硬边
- 外观: 中心列的直接子元素不再铺底色，会话标题栏（标题 + 图标 + 标签行）和会话区同一层
- 诊断: `columns` 字段输出两列各自的计算底色与五层祖先，用来定位色差在哪一层
- 外观: 面板 `.dsh-console-modal` 半透明（0.72，深色 0.74），去边框；遮罩调淡到 0.12
- 外观: 撤回主窗口 12px 内缩与圆角，恢复铺满窗口
- 外观: 标题栏不再自己刷底色，窗口框架背景透明，和会话区同一层壁纸，没有分界
- 外观: 主窗口框架内缩 12px 当玻璃壳（0.76，深色 0.78），圆角 12px，内容仍在壳内
- 外观: 顶栏从 0.92 降到 0.88，和内容层一致；不加边框，靠内容从下面滑过暗示层级
- 外观: 控制台外壳不透明度降到 0.76（深色 0.78），内容改由内缩 12px 的内窗口承载
- 外观: 内窗口 0.88、圆角 12px、带内侧顶部高光；标签栏和内容都在内窗口里
- 外观: 按钮按下加深并轻微缩放，行内操作按钮悬停该行才淡入
- 外观: 焦点环只在键盘导航时出现；图标按钮悬停图标提亮到 100%
- 外观: 滚动条变细，悬停时滑块加深
- 外观: 卡片加 1px 内侧顶部高光，卡片内分区改用 1px 内分隔线
- 外观: 徽标改小圆角 + 低饱和底色，空状态图标改圆角方块底
- 外观: 折叠展开用高度 + 透明度过渡（200ms），切标签时卡片淡入（150ms）
- 性能: 顺序改为聊天性能 → 启动加速 → 安全
- 外观: 列表行与折叠标题悬停提亮、按钮悬停加深，过渡 120ms，不做位移和发光
- 外观: 统计值与版本号回到 16px，只有页面标题保留 20px
- 外观: 进度条改胶囊、柱状图改 12px 上圆角，2px 这类零散圆角清零
- 外观: 阴影统一到 .07，表面色掺 3% 主题色，不再用纯灰
- 外观: 设置页间距收敛到 4 的倍数、字号三档、圆角三种、阴影一种，卡片去边框
- 关于: 更新日志改回默认展开（最近 3 条 + 展开全部），只有维护中心和功能介绍折叠
- 关于: 维护中心卡片默认收起，头部显示「dsh-concierge · v版本 · MIT」
- 关于: 更新日志卡片默认收起，头部显示「最近 3 版 · 展开全部 N 版」
- 关于: 默认显示最近 3 条摘要，底部「展开全部」在设置页内铺开完整历史
- 文档: 更新日志按功能域打头，设置页改成只读摘要
- 文档: 历史版本合并成区间，按 Added / Changed / Fixed / Removed 分组
- 更新: 更新页只列有更新的行
- 插件: 全量列表放在维护卡片之前
- 外观: 打字机三项并入外观
- 性能: 安全开关移到性能页顶部

### Fixed

- 外观: 玻璃下把 `header._pageHead`、`_page`、`_pageBody`、`_tabSearchRow` 的 `background` / `background-image` / `box-shadow` / `border-bottom` 全部归零，伪元素也一并清掉。页头是自定义组件（三个部件用 `--plugin-part-y` 内联定位、跟滚动收放），自带底色，和内容区两种材质，交界处就是那条硬台阶
- 依据: 用户贴出的 DOM 显示 `header.V7pFBG_pageHead` 结构，页头 + 搜索行都在中心列里
- 工具: 设置页容器是 `pointer-events: none`，`elementFromPoint` 会穿透到下面的会话页，所以前几版一直报 `page=chat`。改成量 `_page` 的 `getBoundingClientRect()`
- 工具: 上报里新增 `pageChain`——从 `_page` 起逐层往下 6 级的 `y / height / background / ::before / ::after`，横带画在哪一层可以直接读出来
- 工具: 自动上报的判定从「DOM 里有 `_pageHead`」改成「屏幕中部那个点落在 `_page` 里」。设置页可能挂载着但隐藏，前两版都在会话页上报的
- 工具: 上报里加了 `page` 字段（`settings` / `chat`），一眼能看出这次抓的是哪一页
- 外观: 玻璃下清掉 `_pageHead` / `_page` / `_pageBody` 的 `::before` / `::after` 背景。设置页的硬台阶就是它画的——探针显示 90px 和 230px 处整条元素链的 `background-color` 完全一致，只剩伪元素这一种可能
- 外观: 设置页（插件 / 插件市场 / 维护中心）的中心列统一铺 `--dsw-alias-bg-base`。页头原来是透明的（露出壁纸、发蓝），内容区自己上了色（发白），交界处一条硬台阶（实测 `#AFCCD7` → `#DBE6EB`）
- 依据: unsloth #17403「Fix header gradient banding on plain glass backgrounds」——玻璃下不要再叠页头渐隐，否则必然出横带
- 外观: 会话标题栏那层 0.16 的压色只在「中心列里确实有会话区」时生效。设置页（插件 / 插件市场 / 维护中心）也是中心列的直接子元素，但里面没有会话区——原来的选择器把整页也压了一层，页头和内容各压一层，交界处就是一条横带（实测 `#DBE6EB → #D1D2D3`，跨度约 90px）
- 工具: `patch-window-frame.mjs` 的锚点改成主窗口那处 `backgroundMaterial:"acrylic",titleBarStyle:"hidden"`（压缩代码，冒号后无空格）。之前用的是带空格的 `backgroundMaterial: "acrylic"`，只匹配到**欢迎窗口**，主窗口的 11px 依然存在
- 工具: `--check` 改成读 `lib/main.js` 的内容判断，之前看的是 header JSON，永远报「未应用」
- 工具: 新增 `verify-frame-patch.mjs`，打印打完补丁后主窗口那段构造代码
- 外观: 「无边框窗口」下把 DWM 的材质（`DWMWA_SYSTEMBACKDROP_TYPE`，38）设成 `1`（None）。应用创建窗口时给的是 `backgroundMaterial: "acrylic"`，页面一旦有透明区域，那层亚克力就在窗口后面显形，看起来像贴了一块板；关掉之后透明处直接是桌面。关掉无边框时设回 `3`（Acrylic）
- 工具: `/window-corners` 的守护循环也一起重设 38，避免启动收尾时被改回去
- 外观: 0.12.1 把标题栏那 40px 改成透明之后，它会直接露出窗口后面的桌面，接缝只是换了颜色。改成 `var(--dsw-alias-bg-base)`——和下面各列同一个底，两套皮肤都是
- 外观: 标题栏那 40px（`[data-windows-titlebar] [class*="_frame"]::before`）不再铺 `--dsw-specific-sidebar-fill`。它是拖拽区，和下面各列是两种材质，交界处会横出一条线，正好压在页面标题上；两套皮肤都改成透明，上下露出同一块底
- 外观: `.uc-root` 改成透明，并去掉那层内高光。之前面板自己刷一层底色（玻璃 0.55 / 原生 layer-2），叠在设置窗口的底上，玻璃下等于 0.55 叠 0.55，明显偏白——看起来就是「插件自己调的一块颜色」
- 外观: 卡片 / 统计 / hero 的底色回到 `--dsw-alias-bg-layer-1`、边框回到 `--dsw-alias-border-l1`，和应用自己的卡片同一套 token；删掉玻璃下换 `l2` 的覆盖
- 外观: 玻璃下 `.uc-root` 面板改用一层 6% 中性压暗（深色 5% 白），卡片底色提到 0.86。之前面板 0.55 白、卡片 0.72 白，对话框本身又是白的，叠出来面板 `#F6F9FB`、卡片 `#F7F9FB`——只差 1 个色阶，层级看不出来
- 外观: 玻璃下 `.uc-root` 面板的不透明度从 0.88 降到 0.55。卡片用的是 `layer-1`（约 0.72），面板比卡片还实，卡片压上去就成了「比底更暗的一块」——层级是反的。0.55 和应用的 `bg-base`（0.58）同一档，卡片重新亮一档浮在上面
- 外观: 玻璃下卡片的描边改用 `--dsw-alias-border-l2`（灰 0.18）。`l1` 是白 0.6，压在白色卡面上等于没有边
- 界面: `.uc-help-menu` 的底色从 `--dsw-alias-bg-overlay` 换成 `--dsw-menu-surface-fill`（带兜底）。`bg-overlay` 是盖在内容上的一层暗色罩，单独当面板用就是一块灰（实测 `#E9ECF2`），和旁边的侧边栏 `#F9FAFB` 对不上
- 界面: 弹层里两处 hover 用的 `--uc-surface-2` / `--uc-hover` 只在 `.uc-root` 里定义，侧边栏这个位置取不到值，补了官方层级色兜底
- 外观: `--dsw-specific-input-major` 从 0.42 提到 0.76（与面板 `layer-1` 同档），`--dsw-specific-tip` 从 0.86 降到 0.76，两者现在一致；`--dsw-specific-selector` 用 0.82 保持略亮，登录输入框同步到 0.76。之前输入卡比它下面那条状态栏透一倍，交界处一条硬边，看起来就是「聊天框和别处不一致」
- 外观: 「原生」除了 `--dsw-alias-bg-base`，再覆盖 `--dsw-specific-sidebar-fill`。侧边栏和标题栏用的是后者（`_sidebarCol` 和 `_frame::before`），只改前者会留下官方 `#f9fafb`，和聊天区的 `#eef3fa` 并排就是两种近白，一眼能看出偏暖/偏冷
- 外观: 「无边框窗口」下，`resize`（含全屏切换）后的 200ms 里给根层铺一块和壁纸同色的实色。窗口是真透明的，新露出的区域在下一帧提交前会露出桌面；铺实之后整帧重新判定为不透明，合成器会拉伸上一帧，露出来的是内容。这段兜底和「拖动时降级」开关无关
- 外观: 「原生（纯白）」补上不透明的根层（浅色 `#eef3fa`、深色 `#0e1116`，深色用 `body[data-ds-dark-theme]` 判断）。窗口底色被透明补丁放开之后，原生没有壁纸层，不涂根层就会真的透出桌面
- 工具: `apply-window-clear.cmd` 改用 CRLF 换行。之前是 LF，cmd.exe 解析不了，双击后窗口一闪就关；顺带把括号块改成 `goto` 标签，行为更稳
- 外观: `clip-path` 的 `inset` 是相对元素自己的参考盒算的，不是视口。裁 `#root` / `body` 时切口跟着它们的盒子下移，顶部露出一大条亚克力（实测约 130px），就是「玻璃和界面一上一下」。改裁根元素 `html`——它的 border-box 恒等于视口
- 外观: 去掉留边的外投影。裁剪挂到 `html` 之后页面上没有任何元素在切口外，CSS 画不出落在外面的阴影；窗口投影交回 DWM
- 外观: `promoteLookCss()` 只在样式表后面确实还有节点时才把它挪到 `head` 末尾。此前每次 `applyLook()` 都重插一遍，拖透明度滑杆会连续触发整页样式重算
- 外观: 留边从裁 `#root` 改成裁 `body`。应用把菜单栏（「应用 / 编辑」那条）画在 `#root` 外面，裁 `#root` 会把它整条留在切口外，顶部露出一大条亚克力（实测约 130px），看起来像玻璃和界面「一上一下」
- 外观: 投影从 `body::before` 挪到 `html::before`，否则会被 `body` 的新切口一起裁掉
- 外观: 调试模式改由 `body` 铺绿，把菜单栏区域也盖住
- 外观: `#dsh-concierge-frost` 不再单独套 `clip-path`。它的盒子只是会话区那一小块，再裁 10px 会让模糊层四边各缩进 10px、整体偏上；父层（玻璃层）的切口已经覆盖它
- 外观: 顶部 40px 的 WCO 遮罩颜色来自 `--dsw-specific-sidebar-fill`（原值 alpha 0.004），它会在留边模式下盖出一层极淡的白，和左右下三边的纯亚克力形成一条线；现在留边时设为 `rgba(1,0,0,0)`（`rgba(0,0,0,0)` 在部分 Electron 版本会回退成默认帧色）
- 外观: 切换留边时轻推一下 `body` 的 style，让 preload 的探针重新读 token 并通过 IPC 重发遮罩颜色
- 外观: 留边的 `clip-path` 边缘会因抗锯齿和窗口表面混色，留下一道发白细线；现在在切口内侧压 1px 壁纸色描边覆盖它（调试模式下自动隐藏）
- 外观: 留边不再在 `body::before` 上画 1px 描边。它和裁剪各自定位，抗锯齿叠出一条缝；现在边界只由裁剪这一条线定义，伪元素只负责外阴影
- 外观: 「真透明留边」去掉 `_frame` 的 margin 和壁纸层的 `inset`，页面与壁纸统一用同一个 `clip-path` 切口，不再出现两套基准对不齐的缝
- 外观: 「真透明留边」用 `#root` 的 `clip-path` 裁掉外圈，修掉祖先容器铺底导致的浅色边框
- 外观: 外观样式表每次应用时移到 `head` 末尾，避免被宿主启动过程中后追加的样式盖掉
- 外观: 原生皮肤（以及外观关掉时）面板底色改用官方 `--dsw-alias-bg-base`，不再回退到玻璃色温的浅蓝兜底值
- 外观: 根层 `html` / `body` / `#root` 改为不透明，整帧被判定为不透明后合成器可以拉伸上一帧，尺寸跳变不再露出窗口表面色
- 工具: `--revert` 核对应用版本，版本对不上就拒绝还原（否则会把应用整个退回旧版）
- 外观: 补丁的窗口底色从 tint（#e8f0fa，太浅）改为内容区实测合成色 #ccd8ee，缩放时露出的不再是白条
- 外观: `html` / `body` / `#root` 不再画不透明底；那条带实测 RGB(239,242,251)，和原底色 #f0f3fc 是同一块
- 外观: 底部那一行不再铺 `--dsw-alias-bg-base` 浅底，缩放滞后时露出的是壁纸
- 外观: 中心列的 border-left / border-right 与标签行的 border-bottom 一并去掉
- 外观: 侧边栏从 0.3 的半透明改成透明，和内容列（玻璃皮肤下为 transparent）完全一致
- 外观: 侧边栏底色从 0.42 对齐到内容列的 0.3（深色 0.32），并显式去掉右边框
- 外观: 头部与标签栏不再写死宽度，右侧操作区 flex-shrink: 0，标题超长时省略而不是挤走按钮
- 外观: 顶栏底色从 0.58 提到 0.92（深色 0.9），任何壁纸下都是一块纯色，不再透出渐变
- 外观: 系统开启「减弱动效」时，所有过渡和动画停用
- 外观: 悬停提亮与主按钮加深的数值按规格校正
- 关于: 提示还写着「完整日志见仓库」，但外链已经去掉；顺手清掉重复的语言键
- 关于: 版本号不再冻结在首次挂载

### Removed

- 外观: 「简化壁纸」「拖动时降级」两个开关，连同持久化字段、`data-dsh-simple-wallpaper` / `data-dsh-resize-degrade` 两个钩子和对应的 B6 / B1 样式。这两个开关对现在的帧率已经没有影响，留着只是让外观页更长
- 代码: `perfChip`、`IconRefresh` 两个没人调用的函数
- 样式: `.uc-token-*`（7 条）、`.uc-look-editor`、`.uc-look-actions`、`.uc-look-error`、`.uc-log-entry`、`.uc-chips`、`.uc-perf-rows`、`.uc-head-actions`、`.uc-safe`、`.uc-chip-toggle*`（5 条）、`.uc-spin` 等 23 条死规则
- 外观: `LOOK_SKINS` 里的 `soft` / `ink` / `ocean` 三套 token（约 45 个颜色值）。下拉里早就不提供了，旧存档也会被强制落到玻璃，留着只会让人以为还有这几套皮肤
- 文案: 对应的 `lookSkinSoft` / `lookSkinInk` / `lookSkinOcean` 中英文案
- 外观: 「留边调试（品红 / 绿）」开关，以及它的样式、持久化字段和文案
- 性能: 玻璃自动降级
- 外观: 「关掉浮层模糊」
- 插件: 未使用的 `data-dsh-stream` 与 `data-dsh-glass-wall`

### Other

- 工具: 所有 `/dsh-concierge/*` 路由先过 `ctx.connection.requestRejection()`（Connection 的 Host/Origin 校验 + 浏览器凭据），再走原来的同源校验。之前只有 `Origin` / `Host` 判断，插件市场的扫描把这条标成了「HTTP routes have no DSH access check」
- 兼容: 宿主没有 `connection` 服务时直接跳过，不影响极简 profile

## [0.1.10 – 0.1.99] - 2026-11-21

> 浮层防透专项：白块和重影全部修掉

### Added

- 外观: 原生材质皮肤（DWM Acrylic，需给 app.asar 打补丁）
- 外观: 玻璃皮肤、透明度滑杆、颗粒滑杆
- 外观: 窗口直角（DWM）
- 外观: 三套内置皮肤、品牌色、字号、代码字体
- 关于: 维护中心自有排版（竖向导航 + 内容区）
- 更新: 安全模式与自动恢复、自检修复
- 性能: 侧边栏收起优化、收起不做动画、屏幕外行跳过

### Changed

- 性能: 会话区改用预模糊层，静态元素只栅格化一次
- 外观: 统一色温 `--dsh-tint-rgb`
- 性能: 会话区改为不透明，恢复合成器的遮挡剔除
- 性能: 颗粒并进壁纸层，不再单独占全屏图层
- 外观: 壁纸换成冷调低饱和，侧边栏与顶部磨砂带对齐

### Fixed

- 外观: 设置面板与浮层重影
- 外观: 状态栏白带、用量徽标、滚动条、代码块
- 外观: tooltip 白字压在浅色底上不可读
- 外观: 会话区被壁纸青段染成薄荷绿、侧边栏偏紫蓝
- 外观: 说明文字与未选中菜单项对比度不足
- 性能: 流式输出期间掉帧
- 性能: 每秒写 dataset 导致的整页样式失效
- 更新: 重启后窗口不出来、聊天框不出来

## [0.1.0] - 2026-11-20

> 首个可用版本

### Added

- 更新: 应用与插件更新检查
- 插件: 一键全部更新、长对话精简
- 关于: 「关于」页
- 性能: 启动加速（Defender 排除项）

