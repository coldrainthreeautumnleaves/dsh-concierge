# 更新日志

重要变更都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)：每版一句头条，条目按功能域打头，分组用 Added / Changed / Fixed / Removed，空组不写。

版本号规则：每段只到 x.y.9，然后进下一位（0.2.0 → … → 0.2.9 → 0.3.0）。

## [Unreleased]

## [0.23.8] - 2026-11-27

> 删掉没用的模型下拉

### Removed

- 外观: Claude Code 页去掉「模型」下拉，以及 `POST /dsh-concierge/claude-model` 路由和 `setClaudeModel`。它改的是 `~/.claude/settings.json`，但 DSH 聊天框走的是自己的 provider，只有插件调 `claude.exe` 那条路才吃它——那条路在 0.23.6 已经删了，所以这个下拉是孤立设置，改了不影响任何行为
- Claude Code 的模型仍由 magpie 的 Agent 页管理，这一页只显示只读信息

## [0.23.7] - 2026-11-27

> 模型下拉真的生效了；去掉没用的网关合并

### Fixed

- 外观: 「当前模型」下拉原来只写 `~/.claude/settings.json`，但运行时按 magpie 的选择走，**选了不生效**。现在下拉改成调 `magpie claude <model>`，由 magpie 自己同时更新 `settings.json` 和 `applied.json`，选完即生效
- 外观: 去掉重复的「模型」和「magpie 路由」两行（同一个值显示两遍），只留「模型」一行

### Removed

- 外观: 删掉「Magpie 网关」卡片里的协议选择和「合并成一条路由」——magpie 每次同步都会拆回去，这个功能实际没用
- 卡片改名「DSH provider 配置」，只保留「只留当前模型 / 恢复配置」两个按钮，并注明它们操作的是 `cordis.patch.yml`、和上面的模型选择无关

## [0.23.6] - 2026-11-27

> 不再单独占一条 Claude Code，并进 magpie 那一组

### Removed

- 模型: 去掉 `ctx.llm.registerAdapter` 的 provider 注册（0.21.6 加的），以及配套的 `createClaudeCodeAdapter` / `streamClaudeCode` / `CLAUDE_PROVIDER`。模型菜单里不再出现独立的「Claude Code」分组
- 现在 Claude Code 直接借用 magpie 的模型（`Magpie · Anthropic` 那一组里的 `codeflow/claude-haiku-5-5` 等），插件不再往 DSH 塞 provider

### Changed

- 外观: 状态行文案改成「已安装（借用 magpie 的模型，不单独占一条）」；开关只控制本页功能，不再影响 DSH 的模型菜单
- 保留: `magpie 路由` 一行仍显示 magpie 的 Agent 页给 Claude Code 选了什么

## [0.23.5] - 2026-11-27

> Claude Code 的路由直接从 magpie 的 Agent 页取

### Added

- 外观: Claude Code 页多了「magpie 路由」一行，显示 magpie 的 Agent 页给 Claude Code 选的是哪个模型
- 路由: 新增 `readMagpieApplied()`，读 `~/.config/magpie/applied.json`（magpie 每次应用设置都会写这里：`{ "claude": { "fields": { "model": "…" } } }`）；`/claude-info` 多返回 `magpieRoute`
- 运行: 跑 Claude Code 时优先用 magpie 页面上选的那个模型（去掉 `[1m]` 这类后缀），并给子进程设 `ANTHROPIC_BASE_URL=http://127.0.0.1:3425`、`ANTHROPIC_AUTH_TOKEN=magpie`——**不再依赖 `~/.claude/settings.json`**

### 说明

- magpie 在 Agent 页给某个 agent 点了「断开」时，`applied.json` 里对应那条会消失，本行会显示「—」，此时回落到 `settings.json` 的路由

## [0.23.4] - 2026-11-27

> Claude Code 在模型菜单里只出现一条

### Fixed

- 模型: 同一个模型 id 原来在 `listModels` 和 `resolveModel` 里返回**两个不同的名字**（`Claude Code · 永不卡住 · routing group` 和 `Claude Code · 2.1.332`），DSH 因此把它当成两条。现在名字只在一处计算（`currentModel()`），`listModels` / `resolveModel` / `prepareCall` 共用同一个对象
- 模型: 名称取不到时回落到版本号或「本机 CLI」，不会出现空名字

## [0.23.3] - 2026-11-27

> Claude Code 页里能把 magpie 的多条协议路由合成一条

### Added

- 外观: Claude Code 页新增「Magpie 网关」卡片——显示 magpie 注入了几条路由、共几个模型，选一个协议（OpenAI Chat Completions / OpenAI Responses / Anthropic Messages），点「合并成一条路由」
- 路由: `GET /dsh-concierge/magpie-route`（读现状）、`POST /dsh-concierge/magpie-route`（合并）
- 实现: 借鉴 `dsh-x-magpie` 的思路——把 `llm-pi-ai` 里各 provider 的模型**原样搬运**（`id` / `name` / `contextWindow` / `maxTokens` / `input` / `reasoningEfforts` / `compat` 一个字段不改），合并去重后只留一个 `magpie` provider，只换 `api`、`baseURL`、`apiKeyEnv` 三样；`baseURL` 按协议给（OpenAI 类带 `/v1`，Anthropic 用根地址）

### 安全

- 写前备份成 `cordis.patch.yml.bak-merge2-<毫秒时间戳>`，写后用 js-yaml 回读校验，失败就不写盘

### 背景

- magpie 官方设计就是**按协议拆路由**（源码注释 `dshKinds`：DSH 的 `llm-pi-ai` 一条路由只能有一种协议），所以它写出 `magpie` + `magpie-anthropic` 两条；合并只能由外部改配置完成

## [0.23.2] - 2026-11-27

> Claude Code 页可以直接切换模型

### Added

- 外观: Claude Code 页的「当前模型」从只读文字改成**下拉**，选项来自 `~/.claude/settings.json` 的 `modelPicker.options`；选完立即写回该文件的 `model` 字段
- 路由: `POST /dsh-concierge/claude-model`，body `{ model }`；写之前把原文件备份成 `settings.json.bak-<毫秒时间戳>`，只改 `model` 一个字段，其余原样保留（2 空格缩进）
- 模型: 切换后 Claude Code 下次请求就走新模型，不需要重启

## [0.23.1] - 2026-11-26

> 裁剪失败时留下可查的记录

### Added

- 诊断: 每次点「只留当前模型」都把 `{ 时间, target, result }` 追加到 `~/.dsh/logs/dsh-concierge-trim.log`——卡片上是短提示，这里能看到到底卡在哪一步（找不到配置 / 读不到当前模型 / YAML 校验失败 / 已写入）

## [0.23.0] - 2026-11-26

> 可以把 magpie 写进 profile 的模型列表裁到只剩勾选的那个

### Added

- 路由: 新增两个动作——`POST /dsh-concierge/trim-models`（把 `~/.dsh/profiles/*/cordis.patch.yml` 里 `llm-pi-ai` 的 `providers.*.models` 裁到只剩当前勾选的模型）与 `POST /dsh-concierge/restore-config`（用最近一次备份还原）
- 外观: Claude Code 页加了「只留当前模型」和「恢复配置」两个按钮

### 安全

- 改之前把原文件备份成 `cordis.patch.yml.bak-<毫秒时间戳>`，同一份配置里只动手写过的 `models:` 列表，注释和格式不动
- 改完立刻用 profile 自带的 `js-yaml` 解析校验，解析不过就放弃、不写盘
- **每个 provider 至少留一个模型**——演练时发现直接裁会把 `magpie-anthropic` 裁成零模型，所以某个 provider 没有命中项时保留它的第一个模型

## [0.22.9] - 2026-11-26

> `Claude Code · sonnet` 这个名字是错的

### Fixed

- 模型: 菜单里原来显示 `Claude Code · sonnet`——`sonnet` 只是 `settings.json` 里 `model` 的**别名**，真正的路由模型在 `ANTHROPIC_DEFAULT_SONNET_MODEL` 里。现在先做别名还原（sonnet / opus / haiku → `ANTHROPIC_DEFAULT_*_MODEL`），再去 `modelPicker` 里找展示名，所以会显示成 `Claude Code · 永不卡住 · routing group` 这种真实的名字
- 外观: Claude Code 页的「当前模型」也用同一套还原

## [0.22.8] - 2026-11-26

> 设置行不再被长文本挤成竖排

### Fixed

- 外观: `.uc-row-title` 加 `white-space: nowrap`，`.uc-row-control` 改成 `flex: 0 1 auto; max-width: 62%`——之前控制列是 `flex: 0 0 auto`，值一长就把标签列压到只剩一个字宽，「可用模型」被挤成竖着排的四行

## [0.22.7] - 2026-11-26

> 菜单里只报路由上勾选的那一个模型

### Changed

- 模型: `listModels` 只返回一个条目，名字跟着 `settings.json` 的 `model` / `modelPicker` 走（如 `Claude Code · DeepSeek-V4.1-Flash · DeepSeek`）；请求时不传 `--model`，让 Claude Code 用它自己当前选中的那个——路由上同一时间只有一个勾选，菜单里也不该列一长串
- 外观: Claude Code 页「可用模型」改成「当前模型」，只显示勾选的那一个

## [0.22.6] - 2026-11-26

> 模型菜单不再混进一列裸 id

### Fixed

- 模型: `readRouteModels` 改成**有 `modelPicker.options` 就只用它**（`[1m]` 这类后缀先剥掉再去重），不再把 `deepseek/deepseek-flash`、`codeflow-2/claude-haiku-5-5` 这些裸 id 和带标签的条目堆在一起；`/v1/models` 只在没有 `modelPicker` 时兜底
- 模型: 同时去掉 `ANTHROPIC_DEFAULT_SONNET_MODEL` / `HAIKU_MODEL` 的额外条目——它们本来就是 `modelPicker` 里那几项，重复出现只会更长

## [0.22.5] - 2026-11-26

> 模型菜单列出路由真正提供的模型

### Added

- 模型: 适配器的 `listModels` 不再写死一个「Claude Code · 2.1.332」，改成**从路由读**——`~/.claude/settings.json` 的 `modelPicker.options` 与 `ANTHROPIC_DEFAULT_*` 映射，本机 magpie 再补一份 `/v1/models`。菜单里因此会列出 Sonnet 5 / Opus 5.5 / Haiku 5.5 这些真实可用的模型
- 模型: 选中的模型会通过 `claude -p … --model <id>` 传给 CLI
- 外观: Claude Code 页多一行「可用模型」，显示检测到的清单

## [0.22.4] - 2026-11-26

> 按「中转」认路由；不再每 5 秒轮询

### Changed

- 外观: Claude Code 页去掉 5 秒轮询，改成**切页读一次 + 右上角 ↻ 手动刷新**。原来每次刷新都会探活一次 magpie，中转用户白等 800ms 超时
- 路由: 路由工具按「当前生效的是谁」判断——`ANTHROPIC_BASE_URL` 不是本机地址时显示 `中转 · <host>`，不再把本机 magpie 当成在用
- 标题: 「Claude Code（走 magpie）」→「Claude Code（走 magpie / 中转）」

## [0.22.3] - 2026-11-26

> 取消能杀掉进程；版本号不再写死路径

### Fixed

- 模型: `stream` 现在把 `options.signal` 传给 `runClaudeOnce`——在 DSH 里中断一轮会真的 `kill` 掉 Claude Code 进程，之前中断了进程还在后台跑满 180 秒
- 外观: 「版本」不再只认 `%APPDATA%\npm\node_modules\…` 这一条路径。找不到时按 `claude.exe` 的位置反推包根（`<pkg>/bin/claude.exe` → `<pkg>/package.json`），装到 `~/.local/bin` 之类的地方也能读到

### 已知限制（不是 bug，写在这里免得再查）

- 工具调用不显示成卡片：Claude Code 的工具循环在它自己进程内完成，DSH 只拿到最终文本
- 不是逐字流式：一条回复一次性到达
- 只取文本：`lastUserText` 只拼 `text` 块，发图会被丢掉

## [0.22.2] - 2026-11-26

> 路由工具自动检测；两个同时在用就顶部报警

### Added

- 路由: `readRoutingTools()` 自动检测本机在用的路由工具——Magpie（3425 端口探活）、CC Switch（`~/.cc-switch`）、Claude Code Router（`~/.claude-code-router`）
- 外观: Claude Code 页多一行「路由工具」，显示检测到哪些；**检测到两个以上时页面顶部弹红色提示**，写明它们改的是同一份 `~/.claude/settings.json` 的 `env.ANTHROPIC_*`，同时用会互相覆盖
- 外观: 模型菜单里的名字带上 CLI 版本（`Claude Code · 2.1.332`），注册前读一次版本号；两个同名条目因此也能区分

### Changed

- 外观: Claude Code 页每 5 秒自动重读一次状态——CC Switch 切供应商是自动生效的，这边跟着变，不用手动刷新

## [0.22.1] - 2026-11-26

> Claude Code 页认 CC Switch

### Added

- 外观: Claude Code 页多一行「切换器」，显示 CC Switch 是否装了、当前用的是哪个供应商
- 路由: `GET /dsh-concierge/claude-info` 多返回 `switcher`——读 `~/.cc-switch/live-state.json`（当前供应商）与 `~/.cc-switch/config.json`（v3.2~v3.7 的供应商列表）；v3.8+ 的数据在 SQLite（`cc-switch.db`），没有驱动读不了，只报「已装（sqlite）」

### 说明

- 不做切换动作：CC Switch 自己就是干这个的，而且它切换时改的也是 `~/.claude/settings.json` 的 `env.ANTHROPIC_*`——插件只读不写，避免和它抢同一个文件

## [0.22.0] - 2026-11-26

> Claude Code 页显示 CLI 版本

### Added

- 外观: Claude Code 页多一行「版本」，显示已装的 Claude Code CLI 版本（如 `Claude Code 2.1.332`）
- 路由: `GET /dsh-concierge/claude-info` 多返回 `version`——直接读 npm 全局包里 `@anthropic-ai/claude-code/package.json` 的 `version`，不起进程、不拖慢卡片

## [0.21.9] - 2026-11-26

> Claude Code 单独一页；开关失败能看到原因

### Changed

- 外观: Claude Code 从「更新」页挪到**单独的标签页**（更新 / 插件 / 外观 / 性能 / **Claude Code** / 关于），只在切到这个标签时才读取状态
- 交互: 开关失败不再静默——读取或切换失败时卡片底部显示具体原因（HTTP 状态或错误文本），不再出现「点了没反应」

## [0.21.8] - 2026-11-26

> Claude Code 卡片改成开关 + 路由；顺手修掉一个命令注入

### Changed

- 外观: 「Claude Code（走 magpie）」卡片去掉任务输入框和运行按钮，改成**开关 + 路由信息**：开关控制是否把 Claude Code 注册成模型提供方，下面三行显示路由（`settings.json` 里的 `ANTHROPIC_BASE_URL`）、模型映射、接入状态
- 路由: 新增 `GET /dsh-concierge/claude-info`（开关/已安装/已注册/路由）与 `POST /dsh-concierge/claude-toggle`；开关状态存 `~/.dsh/update-center/claude-code.json`，重启后保持

### Fixed

- 安全: `runClaudeOnce` 不再用 `spawn(…, { shell: true })`。走 `claude.cmd` 必须经过 `cmd.exe` 重新解析参数，任务文本里的 `&`、`|`、`"` 会被当成命令拼接——现在直接用原生 `claude.exe`、`shell: false`；找不到 exe 就明确报错

### Docs

- README 增加「Claude Code（走 magpie）」一节，写明开关、路由来源和两条限制
- 仓库简介补上「Claude Code（走 magpie）开关与模型接入」

## [0.21.7] - 2026-11-26

> 切到 Claude Code 时报 `MODEL_SWITCH_COMPACTION_FAILED`

### Fixed

- 模型: 适配器返回的模型信息补上 `context: { contextWindow: 1048576 }` 和 `defaultMaxTokens: 32000`。DSH 切模型前要先压缩上下文，拿不到窗口大小就直接拒绝切换：`compaction-basic: no context capacity for claude-code/claude-code`

## [0.21.6] - 2026-11-26

> Claude Code 进聊天框的模型菜单

### Added

- 模型: 用 `ctx.llm.registerAdapter(['claude-code'], …)` 把本机 Claude Code 注册成一个模型提供方，聊天框的模型菜单里会出现「Claude Code」，选中后这一轮对话直接交给它
- 适配器: 实现 `providerInfo` / `listModels` / `resolveModel` / `prepareCall` / `stream`；`stream` 把最后一条用户消息交给 `claude -p … --output-format json`，再把 `result` 作为一条文本流交回 DSH
- 路由: 依旧不自己拼——Claude Code 读 `~/.claude/settings.json`，`ANTHROPIC_BASE_URL` 指向 magpie
- 注册失败只记一条 `console.warn`，不影响插件其余功能

### 限制

- 只做文本流：Claude Code 自己的工具循环在它进程内跑完，DSH 这边看不到工具卡片，也拿不到 token 用量
- 一条回复一次性到达，不是逐字流式

## [0.21.5] - 2026-11-26

> 维护中心里能直接跑 Claude Code（走 magpie）

### Added

- 维护中心: 新增「Claude Code（走 magpie）」卡片。填一句话任务 → 点运行 → 插件在宿主侧起 `claude -p <任务> --output-format json`，把 `result` 显示出来
- 路由: 不自己拼路由——Claude Code 读 `~/.claude/settings.json`，那里 `ANTHROPIC_BASE_URL` 指向 magpie，所以模型走的是 magpie 里配的那条
- 路由: `POST /dsh-concierge/claude-run`，body `{ prompt, cwd? }`，返回 `{ ok, text }` 或 `{ ok: false, error }`

### 实测

```
claude --version → 2.1.332
claude -p "只回复两个字：可用" --output-format json
  → {"result":"可用","modelUsage":{"group/never-stuck[1m]":…}}
```

## [0.21.4] - 2026-11-26

> 自定义三色改成一张卡片

### Changed

- 外观: 「自定义（三色）」那一行改成卡片（`.uc-card` + `.uc-card-head` + `.uc-card-title`），三个取色器放在卡片体里、带 12/16 内边距。原来是裸的一行，夹在其它 `settingRow` 之间没有边界
- 外观: 这张卡去掉淡入动画（`animation: none`），出现时不再有那一下延迟

## [0.21.3] - 2026-11-26

> 标题栏那条规则把整页盖住了，渐变才「消失」

### Fixed

- 外观: `[data-windows-titlebar] [class*="_frame"]` 不再铺任何底色，改成 `background: transparent`。`_frame` 是**整个窗口容器**不是标题栏，原来那条 `background: var(--dsh-canvas) !important` 等于拿画布色把壁纸层整个盖住——整页变成 `#EEF1F8`，看起来像「渐变没了」
- 外观: 顶部标题栏那 40px 也跟着透出渐变。窗口本身已经不透明（补丁把底色改成 `#ffeef3fa`），壁纸层又往上多铺了一个标题栏高度，所以不需要再铺实色；之前铺了反而在顶部留一条和渐变对不上的色带（实测 y=0..50 全是 `#EEF1F8`，y=60 才是渐变）

### 定位过程

- 临时探针把 DOM 实况写进 `~/.dsh/logs/dsh-concierge-look.log`，读出来：壁纸层 `display:block`、1281×861 铺满、`background` 就是那组粉蓝紫渐变——**层是好的**；
- `body` / `#root` / `_frame` 的计算背景：前两个透明，**`_frame` 是 `#eef1f8`**——盖住的就是它；
- 改完再量：内容左 `#F8E6F5`、中 `#EEF1FE`、右 `#E8EBFF`，渐变回来了

## [0.21.2] - 2026-11-26

> 背景渐变整个消失（整页露出画布色）——改成按属性切换

### Fixed

- 外观: 壁纸层不再用 `background: var(--dsh-wall, 默认渐变)` 兜底。**变量一旦被赋成非法值，`var()` 里的默认值也会一起失效**，整条 `background` 作废，壁纸层什么都不画，整页就露出 `--dsh-canvas` 的 `#EEF1F8`——0.21.x 的自定义三色一旦写入异常值就会这样
- 改法: 默认那条规则直接写字面渐变（永远画得出来），配色靠 `html[data-dsh-palette="sunset"|"custom"]` 覆盖；自定义三色先过 `/^#[0-9a-fA-F]{6}$/` 校验，不合法就不写变量、落回默认

## [0.21.1] - 2026-11-26

> 背景配色只留三色分明的两组，其余交给自定义

### Changed

- 外观: 删掉「薄荷 / 海盐 / 奶油」三组配色——它们的三个色相太接近，看着就是单色。现在「背景配色」只剩 **粉蓝紫（默认）**、**晚霞**、**自定义（三色）**
- 外观: 自定义三色保留，三个取色器任意搭；改任意一个就切到自定义

## [0.21.0] - 2026-11-26

> 背景配色可以自己定三个色

### Added

- 外观: 「背景配色」下拉加了 **自定义（三色）**，下面跟三个取色器（起 / 中 / 终）。改任意一个就切到自定义，用 `linear-gradient(160deg, 起 0%, 中 46%, 终 100%)` 拼整页渐变；三色存进 `look.wallColors`，重启后保留
- 说明: 自定义模式下把两团光斑的变量清掉，避免预设的光斑颜色和新底色打架

## [0.20.9] - 2026-11-26

> 修 0.20.8 的 CSS 写坏：背景配色之前完全没生效

### Fixed

- 外观: 0.20.8 改壁纸层那条规则时，把 `background` 声明写丢了，注释也没闭合——CSS 从那里开始整段被吞，所以「背景配色」选什么都是原来的粉蓝紫。现在规则补回：`background: var(--dsh-wall, linear-gradient(160deg, #ffe6f2 0%, #e8efff 46%, #efe6ff 100%))`
- 外观: 顺手修掉一处更早留下的坏注释（`--dsh-canvas` 那段提前 `*/` 闭合），它会把紧跟的 `html[data-dsh-glass="1"] { --dsh-canvas: … }` 规则一起吞掉

### 自检

- `LOOK_CSS` 现在注释 56/56 配对、括号深度 0；这两项以后改完 CSS 都该跑一遍

## [0.20.8] - 2026-11-26

> 整页渐变底色可选：粉蓝紫 / 薄荷 / 晚霞 / 海盐 / 奶油

### Added

- 外观: 新增「背景配色」下拉。整页那层渐变和两团光斑改成由 `--dsh-wall` / `--dsh-blob-a` / `--dsh-blob-b`（深色另加 `--dsh-wall-dark`）驱动，`applyPalette()` 把选中的配色写到 `html` 上；选「默认」就把变量删掉，回落到 CSS 里原来那组粉蓝紫
- 配色: `LOOK_PALETTES` 五组，每组浅/深两套（底色 + 两团光斑），跟着 DSH 明暗主题走
- 说明: 只改**背景**，不动品牌色、不动玻璃表面的白——两者是分开的

## [0.20.7] - 2026-11-26

> 遮罩改成直接压 `::after`

### Fixed

- 外观: 新增 `html[data-dsh-glass="1"] [class*='_mask_']::after { background: rgba(0,0,0,0.08) !important }`。Modal 原语的遮罩不是画在 mask 元素本身，而是它的 `::after`（`._mask_1ytzq_18:after { background: var(--dsw-alias-bg-mask-1) }`），只改 body 上的 token 在伪元素里不一定吃到。设置页、插件市场、更新提示共用这个遮罩

### 背景（桌宠查到的）

- 遮罩来源：`dsh-web-frontend\dist\assets\index-*.css` 的 `._mask_1ytzq_18:after`
- token 定义：`@deepseek-ai/dsh-client-ui-theme\src\styles\design-platform.css`，`--dsw-alias-bg-mask-1: rgba(0,0,0,0.24)`
- 模糊本来就没有：`gradient-shadow-text.css` 里 `--dsw-mask-blur: none`，所以 `backdrop-filter: var(--dsw-mask-blur)` 一直等于 none——不是我们关掉的

## [0.20.6] - 2026-11-26

> 模态遮罩透出来，不再是一块死灰

### Changed

- 外观: 在 `html[data-dsh-glass="1"] body` 里把 `--dsw-alias-bg-mask-1/2/3` 压薄成 `rgba(0,0,0,0.08 / 0.05 / 0.12)`。DSH 默认是 `#0000003d`（24% 黑），压在渐变页面上就是整块 `#B5B9BE` 的死灰——更新提示、确认框都会出现这个。现在能看见后面的界面
- 说明: 这几个名字用 `overrideTokens` 写不生效（和 `bg-module-platform` 一样），只能走样式表 + `!important`

## [0.20.5] - 2026-11-26

> 市场的搜索/分类条不再常驻白带

### Fixed

- 外观: `--dshm-sticky-bg` 从 `rgba(252,253,255,0.86)` 改成透明，只留 `--dshm-stuck-bg`（0.9）。这两个变量是插件市场吸顶搜索条 / 分类条的底，之前**不管钉没钉住都铺**，所以那排永远是一条白带；按 [dsh-market THEMING.md](https://raw.githubusercontent.com/dsh-market/dsh-market/master/THEMING.md) 的 transparent-base contract，流动状态应该透明，只有 `[data-dshm-stuck]` 钉住时才需要底

## [0.20.4] - 2026-11-25

> 白块真凶：`[class*="_menu"]` 误伤了 `m2hUqa_menuAnchor`

### Fixed

- 外观: 浮层那条「必须给足不透明底」的规则里，`[class*="_menu"]` 改成 `[class*="_menu_"]`。原来它匹配到 `<span class="m2hUqa_menuAnchor">`——一个只用来做 CSS 锚点定位（`anchor-name`）的空容器，被刷上了 `rgba(var(--dsh-tint-rgb), 0.96)` 的 96% 近白底。新会话页「标准模式」旁边那块白就是它

### 定位过程

- 前面 5 轮（`_selector`、`bg-module-platform` token、`heroOptions` 子树、`interactive-bg-hover`、`_seat`）全是猜的，一次都没命中；
- 最后是用户开 DevTools，**Styles 面板直接显示了命中的那条规则**——`background-color: rgba(var(--dsh-tint-rgb), 0.96) !important`，正是我们自己写的浮层规则；
- 教训：**宽泛的 `[class*="..."]` 属性选择器是雷区**。哈希类名里 `_menu`、`_card`、`_pill` 这类词根会被别的组件复用（`menuAnchor`、`cardShots`、`pillRow`），一律要带尾部下划线或更长的前缀。

## [0.20.3] - 2026-11-25

> 按真类名压「标准模式」：`m2hUqa_seat`

### Fixed

- 外观: 新增 `[class*='_seat']` / `[class*='_menuAnchor']` 的 `background: transparent !important`（同时清 `background-image` 和 `box-shadow`）。之前三轮（`_selector`、`bg-module-platform` token、`heroOptions` 子树）全是猜的类名，一次都没命中——真实类名是用户从 DevTools 贴出来的 `<button class="m2hUqa_seat">`

### 说明

- `.m2hUqa_seat` 自己的规则是 `background: 0 0`（透明），只在 `:hover` / `[aria-expanded=true]` 时取 `--dsw-alias-interactive-bg-hover`；这两条都已还原成 DSH 原值，白块仍在，所以还有别的东西在画底。这条按真类名压死

## [0.20.2] - 2026-11-25

> 底座打孔：`bg-base` 在样式表里直接打成透明

### Fixed

- 外观: 新增 `html[data-dsh-glass="1"] body { --dsw-alias-bg-base: transparent !important }`。之前只用 `overrideTokens` 把 `bg-base` 设成 0.6 白——**宿主的偏好写入会盖回来**，而且 0.6 的白铺在渐变上就是整页发白。现在在样式表里直接打成透明，渐变才能从每一页（包括新会话页）透出来

### 依据

- [dsh-theme-theresa 架构说明](https://dshhub.org/en/plugins/wanxi123w/dsh-theme-theresa/)：「色板注入作用域样式表，`--dsw-alias-bg-base` 设为 `transparent`；**不走 ctx.theme.overrideTokens**，所以 `rgba()` / 渐变 / `backdrop-filter` 都能写，也不会和宿主的偏好写入抢状态」
- [dsh-ui-appearance](https://dshbase.com/zh/plugins/dsh-ui-appearance/)：「当壁纸/视频生效时，自动对宿主底座（`--dsw-alias-bg-base`）进行**透明打孔**」

## [0.20.1] - 2026-11-25

> 新会话页整页发白：hero 根节点漏了

### Fixed

- 外观: 给 `[class*="_root"][data-phase]` / `[class*="_root"][data-content-phase]` 补上 `background: transparent`。新会话页（hero）的根节点 `.an3WzG_root` 自己铺 `var(--dsw-alias-bg-base)`，0.6 的白盖在渐变上就是**整页发白**——聊天页早就清成透明了，这个根节点漏了

## [0.20.0] - 2026-11-25

> 「标准模式」白块的真因：我把悬停色改成了 24% 白

### Fixed

- 外观: 删掉 `--dsw-alias-interactive-bg-hover` 的覆盖，回到 DSH 原值。它原本是 `color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)`——一层几乎看不见的淡红；我把它设成了 `fill(0.24)`（24% 白），于是**所有悬停态都变成一块白**
- 外观: `bg-layer-1` 回到 `0.6`（0.19.9 把它压到 0.34 是基于错误猜测）
- 移除: 0.19.6–0.19.8 按 `heroWorkspaceRow` / `heroOptions` 猜的那批规则

### 定位过程（记下来，下次别重走）

1. `_selector`、`bg-module-platform`、`heroOptions button` 三轮都没命中——品红/荧光绿标记法证明前两条根本到不了那个元素；
2. 最后是**用户把元素的 HTML 贴出来**才定位到：`<button class="m2hUqa_seat" title="选择新任务使用的 Agent 预设">`；
3. 查 asar 的 `.m2hUqa_seat` 规则：平时 `background: 0 0`（透明），只在 `:hover` 和 `[aria-expanded=true]` 时取 `--dsw-alias-interactive-bg-hover`；
4. 而那个 token 被我改成了 24% 白——白块就是这么来的。

**教训**：改「交互色」（hover / active / selected）比改表面更危险——它们平时看不见，一出问题就是「凭空多出一块」。皮肤只该动 `bg-*` 表面，不该动 `interactive-*`。

## [0.19.4] - 2026-11-25

> 颜色回到 DSH 默认，别自作主张改品牌色

### Fixed

- 外观: 撤掉 0.19.0 补市场 token 时顺手加进去的 19 个**颜色**覆盖，回到 DSH 原值。`brand-primary` 在 DSH 里是 `neutral-bluish-1000`（**近黑**），我把它改成了蓝色 `#2f6bff`；`button-primary-fill`、`link`、`state-*` 八个、`toast-*`、`tooltip-label`、`menu-icon`、`label-primary-foreground` 同理。结果按钮、开关、状态点全都发蓝发绿，和原版对不上
- 保留: 表面类 token（`bg-*`、`border-l3/l4`、`settings-card-*`、`button-tool-bar-hover`、`interactive-bg-active` 等）不动——玻璃皮肤只该改「面」，不该改「色」

## [0.19.3] - 2026-11-25

> 选择器那块白底：token 加直接 CSS，两条一起压

### Fixed

- 外观: 0.19.2 只把 `--dsw-alias-bg-module-platform` 设成 `transparent`，实测没生效（主题运行时很可能把这个值当非法颜色丢掉了）。这次改成合法的 `rgba(0, 0, 0, 0)`，**同时**加一条直接规则 `html[data-dsh-glass="1"] [class*='_selector'] { background: transparent !important }`，不经过 token
- 依据: 应用里有三个构建变体的选择器规则（`.CDP_Dq_selector` / `.-TO4SG_selector` / `.V68kMG_selector`），全是 `background: var(--dsw-alias-bg-module-platform)`

## [0.19.2] - 2026-11-25

> 「标准模式」那块白底去掉

### Fixed

- 外观: `--dsw-alias-bg-module-platform` 从 `fill(0.72, 0.66)` 改成 `transparent`。应用里 `.CDP_Dq_selector` / `.-TO4SG_selector`（新会话的「标准模式」「工作区」选择器）就是 `background: var(--dsw-alias-bg-module-platform)`，默认值 `var(--dsw-static-neutral-bluish-60)` 是浅灰蓝——在白页面上看不出来，铺到彩色渐变上就是一块白板。这个 token 是 0.19.0 补市场 token 时一起加的
- 参考: 社区主题同样在跟这个按钮较劲——[dsh-gemini-cat-theme](https://dshmp.com/zh/plugins/dsh-gemini-cat-theme) 给它「补衬底」，[dsh-glass-ranswork](https://socket.dev/npm/package/dsh-glass-ranswork) 则明确「不要白底」并把 `.frame` 清成透明。玻璃皮肤取后者

## [0.19.1] - 2026-11-25

> 收窄实色底的选择器，别再给选择器刷白块

### Fixed

- 外观: 上一版把 `[class*='_pill_']` 和 `[class*='_wrap_'] input` 一律刷成 `--dsh-canvas` 实色，误伤了新会话界面的「标准模式」选择器（被刷出一块白底）以及其它 `Pill` 组件。现在只保留 `_searchField` / `_searchInput` / `[data-chip]`（插件市场的搜索框与分类胶囊）

## [0.19.0] - 2026-11-25

> 按官方 THEMING.md 把市场消费的 token 补齐

### Changed

- 外观: 补上插件市场消费、我们一直没覆盖的 25 个 alias token——`bg-module-platform`、`border-l3/l4`、`button-primary-fill/hover`、`button-ghost-active-fill/border`、`button-tool-bar-hover`、`interactive-bg-active`、`interactive-bg-hover-danger`、`label-primary-foreground`、`brand-primary`、`link`、`menu-icon`、`state-*` 八个、`toast-label/action`、`tooltip-label`
- 外观: 设置市场吸顶搜索条 / 分类条的 `--dshm-sticky-bg`（0.86）与 `--dshm-stuck-bg`（0.97）。不设的话钉住时是透明的，卡片从底下滚过就是「磨砂」
- 移除: 按哈希类名写的 `nUhMVa_card` / `nUhMVa_recentTile` / `nUhMVa_viewBar` 补丁

### 依据

- [dsh-market THEMING.md](https://raw.githubusercontent.com/dsh-market/dsh-market/master/THEMING.md)：市场**故意不画自己的颜色**，全部走宿主 alias token；「类名是构建哈希，主题永远不要点它」，稳定钩子只有 `[data-dsh-market-root]`、`[data-dsh-market-tab]`、`[data-dshm-stuck]` 和 `--dshm-sticky-bg` / `--dshm-stuck-bg`
- 同一份文档的 transparent-base contract：透明主题必须自己给吸顶行铺底，否则「卡片从它们下面滚过，两层文字叠在一起」

## [0.18.6] - 2026-11-25

> 市场卡片按它自己的类名写死

### Fixed

- 外观: 直接给 `nUhMVa_card` / `nUhMVa_recentTile` / `nUhMVa_viewBar` 写 `#fcfdff`（深色 `#1e2026`）。实测改 `--dsw-alias-settings-card-fill` 之后卡片依旧跟着渐变变色（左 `#F7E7F6`、右 `#E7EBFD`），说明那条 token 没有落到卡片上；这次按市场自己的类名前缀直接写死，不经过 token
- 注意: 前缀 `nUhMVa_` 是 dshmarket v1.84.1 的构建哈希，市场升级后可能失效

## [0.18.5] - 2026-11-25

> 插件市场的卡片改成不透明

### Fixed

- 外观: `--dsw-alias-settings-card-fill` 从 `fill(0.9, 0.84)` 改成写死的 `rgba(252,253,255,1)` / `rgba(30,32,38,1)`，**不参与透明度缩放**。市场的卡片就是 `.nUhMVa_card { background: var(--dsw-alias-settings-card-fill, …) }`，0.9 再乘滑杆系数只剩 0.85，压在渐变上看着像磨砂

## [0.18.4] - 2026-11-25

> 插件市场的搜索框和筛选胶囊也兜上

### Fixed

- 外观: 搜索框 / 筛选胶囊的选择器从「内置插件页的 `_tabSearchRow` 容器」改成按组件本身匹配——`_searchField`、`_searchInput`、`_wrap_ input`、`[data-chip]`、`_pill_`。插件市场（dshmarket）用的是公共 `Pill` 组件（`data-chip="1"`）和 `nUhMVa_searchField`，没有那个容器，所以之前一条都没命中

## [0.18.3] - 2026-11-25

> 玻璃下不再有任何毛玻璃

### Changed

- 外观: 全局关掉 `backdrop-filter`（含 `::before` / `::after`）。菜单那条 token 早就是 `none`，但应用里有硬编码的 `blur(10px)`（拖放遮罩之类）压不住，这次按元素统一清掉
- 外观: 搜索框 / 筛选胶囊（`_searchField`、`_searchInput`、`_tabSearchRow` 里的 `_pill_`）改成实色画布。半透明白铺在渐变上，观感就是毛玻璃

## [0.18.2] - 2026-11-25

> 设置页不再垫一块磨砂板

### Fixed

- 外观: `_centerCol:not(:has([data-conversation-region="chat"]))` 从铺 `bg-base` 改成 `transparent`。插件 / 插件市场 / 维护中心 / 自动化任务这些页面，内容区原本是一块浮起来的浅色板，和周围的彩色渐变割裂；现在整列直接坐在渐变上

## [0.18.1] - 2026-11-24

> 修掉维护中心整页崩掉的真因：effect 写在了 state 之前

### Fixed

- 客户端: `POST /auto` 那个 `React.useEffect` 原本插在 `const [autoUpdate, setAutoUpdate] = React.useState(…)` **之前**。`const` 初始化前处于暂时性死区，渲染到这里会抛 `Cannot access 'autoUpdate' before initialization`，整个维护中心组件崩掉——表现就是「设置页界面没了」，只剩遮罩盖着聊天。现在 effect 移到 state 声明之后
- 说明: 之前把这个问题归因到 `--dsw-alias-bg-*` 那批 token（0.18.2–0.18.5 连加了补 token、`solid()`、涂遮罩三层），全部是误判，已在退回时删掉，现在一行业务样式都没动

## [0.18.0] - 2026-11-24

> 自动更新搬到宿主侧定时器，弹窗只留一处

### Fixed

- 自动更新: 以前自动安装写在维护页组件的 effect 里（`if (!autoUpdate || !data …) return; updateAll()`），**只有打开更新页才会执行**。现在由宿主定时器负责：启动 90 秒后先跑一次，之后每 30 分钟一次，页面开不开都一样
- 自动更新: 开关从页面里的 `localStorage` 标志改成宿主侧持久化（`~/.dsh/update-center/auto.json`），页面挂载和切换时通过 `POST /dsh-concierge/auto` 同步给宿主
- 弹窗: 「已提示」与「节流时间」从内存变量改成 `localStorage` 持久化。以前重启就重置，所以每次启动都会再弹一次；现在同一个更新集合只提示一次
- 弹窗: 宿主开着自动更新时，后台轮询不再弹「发现新版本」——它会被自动装掉，弹了只是噪音

### Added

- 路由: `GET/POST /dsh-concierge/auto`，读写自动更新开关并回报最近一次自动更新的结果（`lastAuto`）
- 状态: `/status` 增加 `auto` 与 `lastAuto` 两个字段

## [0.17.6] - 2026-11-24

> 表面降透，撤掉输入框下面那条紫带

### Changed

- 外观: 输入卡 / 状态栏 `0.85 → 0.62`，代码块 `0.55 → 0.34`、代码块标题条 `0.64 → 0.44`，设置面板 `0.85 → 0.70`。0.85 的白压在彩色底上就是一块白板，降到 0.62 之后能透出底下的淡紫，边界也软下来
- 外观: 输入框座位改成 `transparent`，撤掉那条 `#efeaf9` 的紫色带子。座位原来的不透明底是为了挡滚动文字，但页面改成彩色渐变之后，任何单一实色都拼不上底下的渐变，只能整条撤掉

## [0.17.5] - 2026-11-24

> 彩色光斑回来了，输入框座位不再切白带

### Changed

- 外观: 彩色光斑用**伪元素分层**加回来——`::before` 粉、`::after` 蓝，各只有一条 `background`，不会重蹈多层 `background-image` 被整体丢弃的覆辙；深色另配一套
- 外观: 输入框座位从纯白 `#fbfcff` 改成淡紫 `#efeaf9`（不透明，仍挡滚动文字），和页面底部同调，不再切出一条白带
- 外观: 深色壁纸层也从多层写法改成单层渐变

## [0.17.4] - 2026-11-24

> 壁纸层改成单层渐变，排除多层写法

### Changed

- 外观: 浅色壁纸层从「3 个 radial + 1 个 linear + background-size/repeat 各 4 个值」简化成**一条 `background: linear-gradient(160deg, #ffe6f2, #e8efff, #efe6ff)`**。多层声明里任何一处不合法，整条 `background-image` 都会被丢弃，表现就是「这一层什么都不画」——先排除这一类，再谈配色

## [0.17.3] - 2026-11-24

> 失效的自定义壁纸不再盖住渐变

### Fixed

- 外观: `applyWallpaper()` 用 `style.removeProperty('background-image')` 取代 `style.backgroundImage = ''`——后者在 CSSOM 里是空操作，上一次写进去的 `url(...)` 会一直盖住样式表里的渐变
- 外观: 自定义壁纸改成**先探测再挂**：`new Image()` 加载成功才写内联样式，失败就保持渐变。壁纸文件被移走/改名时，那一层不再变成空白、露出窗口底色

## [0.17.2] - 2026-11-24

> 壁纸终于画出来了：颗粒层把整条 background-image 拖垮了

### Fixed

- 外观: 从壁纸层的 `background-image` 里去掉 `var(--dsh-grain, none)`。颗粒是 SVG data URI（带引号和逗号），`var()` 替换进去之后**整条 `background-image` 被判定非法、整体丢弃**——所以纯色能画、渐变一条都画不出来，页面永远是白的。用洋红/绿标记逐层验证过：子层能画纯色，画不了渐变
- 外观: `background-size` / `background-repeat` 同步改成 4 个值（原来按 5 层写）

## [0.17.1] - 2026-11-24

> 让开 body 的不透明背景，壁纸层才看得见

### Fixed

- 外观: `html[data-dsh-glass="1"]`、`body`、`#root` 全部 `background: transparent`。应用 boot 时写了 `body{background-color:#fff}`（深色 `#151517`），而壁纸层是 `z-index: -1`，**正好被 body 那层不透明背景盖住**——这是今天所有「壁纸/光斑没生效」的总原因：改动全画在了 body 背后
- 说明: 这个 profile 没有 HMR，客户端改动必须**完整重启**才生效（刷新只是重新请求同一个旧 bundle）

## [0.17.0] - 2026-11-24

> 按 Arc / Fluent 的配方重做玻璃：彩色背景 + 白纱表面

### Changed

- 外观: 背景改成**三团彩色光斑**（粉 `rgba(255,224,240,.92)` / 蓝 `rgba(212,228,255,.95)` / 紫 `rgba(224,212,255,.88)`）铺在 `#eef1f8` 上；结构层（AppFrame、ConversationRoot、`_centerCol`、`_bottomRow`、`_sidebarCol`）全部改成 `transparent`，让光斑透上来
- 外观: 表面回到白纱——`bg-base` / `layer-1` 0.60、`layer-2` 0.85、`layer-3` 0.78、`overlay` 0.80、输入卡 0.85、卡片 0.66
- 外观: 竖杠换成 `rgba(15,15,20,0.08)`（Arc 的 `--border-alt`），输入卡保留 `rgba(255,255,255,.55)` 内高光
- 依据: 玻璃的颜色来自**背景**而不是表面——「纯白背景无法显示明显的背景采样」（[linear-glass-ui](https://gitee.com/xiaobait9/linear-glass-ui/blob/master/README.md)）；Arc 的配方是彩色光斑 + 白 0.60/0.85 表面（[Arc Glass](https://raw.githubusercontent.com/rohitg00/awesome-claude-design/main/design-md/glass/arc.md)）；WinUI Acrylic 同构：模糊 → 亮度层 → 色调，`tintOpacity` ≈ 0.6、`luminosityOpacity` ≈ 0.85（[msime-windows #1033](https://github.com/metasequoiaime/msime-windows/pull/1033)）

## [0.16.2] - 2026-11-24

> 画布压深，让卡片真的浮起来

### Changed

- 外观: `--dsh-canvas` 浅色从 `#eef3fa` 压到 `#e4ecf7`，壁纸渐变同步（`#e4ecf7 → #dfe9f4 → #e4edf2`）。之前画布和卡片只差 10 个色阶（`#eef3fa` vs `#F8FAFD`），而原页面本来就是 `#F2F6FB`，所以 0.16.0/0.16.1 换完肉眼几乎看不出差别——实测侧边栏 `#F0F5FA`、内容 `#F7F9FC`

## [0.16.1] - 2026-11-24

> 实底之后把卡片层提亮，重新分出层次

### Changed

- 外观: 底色改成不透明之后整窗一个色、太平，所以把「卡片这一档」整体提亮：`layer-1` 0.62 → 0.80、`layer-2` 0.72 → 0.88、`layer-3` 0.66 → 0.84、`overlay` 0.66 → 0.86、`card-fill` 0.50 → 0.72、`card-tile` 0.48 → 0.68、`settings-card` 0.80 → 0.92、输入卡/状态栏 0.46 → 0.82、菜单 0.74 → 0.92
- 思路: 底是一层实色画布（`#eef3fa`），卡片是「压在上面的纸」（≈`#F8FAFD`），层次靠亮度差 + 投影 + 发丝线，不再靠多层半透明叠出磨砂

## [0.16.0] - 2026-11-24

> 所有背景层统一成不透明画布

### Changed

- 外观: AppFrame、ConversationRoot、`_centerCol`、`_bottomRow`、`_sidebarCol` 全部改成 `var(--dsh-canvas)`（不透明）。之前每层都是半透明白（0.42 / 0.62 / 0.72…），叠起来就是一层层磨砂纸，越叠越白越叠越灰；改成一层实底之后颜色只有一个来源，层次交给卡片填充和那条发丝线
- 钩子: 用的是 dsh-theme-mist 层级实测里的稳定选择器——`[id='root'] > div[data-slot='root'] > div`（AppFrame）、`[data-slot='main.conversation'] > div`（ConversationRoot），不再靠哈希类名猜

## [0.15.6] - 2026-11-24

> 竖杠换成真正看得见的边框色

### Fixed

- 外观: 侧边栏那条发丝线从 `--dsw-alias-border-l1` 换成 `--dsw-alias-border-l2`。浅色下 `border-l1` 是 `rgba(255,255,255,0.6)`——白色画在白底上，等于没画（截图实测侧边栏右缘 x=420–450 全是 `#F2F6FB`）；`border-l2` 是 `rgba(120,130,150,0.18)`，深色下白 18%

## [0.15.5] - 2026-11-24

> 侧边栏和内容之间加一条竖杠

### Added

- 外观: `_sidebarCol` 加 `box-shadow: inset -1px 0 0 var(--dsw-alias-border-l1)`，在右边缘画一条 1px 发丝线。两边同色之后需要一条分界，用 inset 阴影而不是 border——border 会把列宽挤掉 1px，窗口缩放时还会闪

## [0.15.4] - 2026-11-24

> 按官方修法处理输入框座位

### Fixed

- 外观: 座位改用**官方稳定钩子** `[data-composer-seat]`，渐隐终点从不透明的 `var(--dsh-canvas)` 起（36px 之后实底），不再用半透明的 `bg-base`。之前按类名猜（`_composerSeat` / `_composerStack`）一直没命中真正那一层
- 依据: [dsh-web commit 4138d4d](https://github.com/zhu1090093659/dsh-web/commit/4138d4dadc344ab2a9b04566150a8b0efadcd7b2)「opaque composer seat fade for background skins (#98)」；层级实测见 [dsh-theme-mist 视觉规范](https://raw.githubusercontent.com/ffyfox/dsh-theme-mist/078c7dfc4e2523935f11be0754080076b5c02a0b/docs/visual-spec.md)（第 5 层 = `[data-composer-seat]`，36px 渐变终点色）

## [0.15.3] - 2026-11-24

> 输入框座位改用不透明底

### Fixed

- 外观: `_composerSeat` / `_composerStack` 的背景从 `var(--dsw-alias-bg-base)`（半透明）换成 `var(--dsh-canvas)`（不透明）。之前是拿「同一种半透明色」去盖半透明，等于没盖——座位自带的 `color-mix(… bg-base …)` 渐隐整体变透，壁纸透上来，输入框底下像垫了张磨砂纸
- 依据: [dsh-web#98](https://github.com/zhu1090093659/dsh-web/issues/98) 记录的是同一个坑——插画皮肤把 `--dsw-alias-bg-base` 改透明后，`composerSeat` 的 `color-mix` 遮罩整体失效；[token-map.md](https://raw.githubusercontent.com/Cenuon/dsh-opencode-ui/66066534874a3f5479df10c2959bba42d787e961/docs/token-map.md) 说明 token 是写在 `<body>` 上的内联样式，只能走 `overrideTokens`，CSS 改不动

## [0.15.2] - 2026-11-24

> 关掉预模糊层

### Changed

- 外观: `#dsh-concierge-frost` 改成 `display: none`，同时删掉它的子层样式。这一层是「预模糊的壁纸副本」，铺在整页底下，所有半透明面板都压在它上面——填充降到 0.42/0.46 之后，透出来的就是这层糊过的壁纸，输入框底下看着像垫了一张磨砂纸。壁纸本身由 `#dsh-concierge-glass` 铺，去掉这层不影响底色，只是不再糊

## [0.15.1] - 2026-11-24

> 窗口不透明补丁：只留网页这一层

### Added

- 工具: `patch-window-opaque.mjs`（配 `apply-window-opaque.cmd`）。把窗口的 `"#00000000"` 换成不透明 `"#ffeef3fa"`（等长替换 27 处，跳过库里的 `NULL_COLOR={css:"#00000000"}` 空色常量）。窗口不透明之后 DWM 的亚克力被完全盖住，页面不再叠两层模糊——这也是「看着又灰又脏」的结构性原因
- 说明: 等长替换只能放一套颜色，深色模式下也会是浅色底；确认方向后再走重建 asar 的版本

## [0.15.0] - 2026-11-24

> 玻璃整体调薄，颜色交还给壁纸

### Changed

- 外观: 预模糊层 `saturate(0.62)` → `saturate(1.25)`。玻璃材质的判据是「场景颜色要活下来（saturation ≥ 1.3）」，之前是反向操作，把壁纸的蓝和薄荷全压掉了，剩下的就是一层灰
- 外观: 填充整体降一档——`bg-base` 0.58 → 0.42、`layer-1` 0.76 → 0.62、`layer-2` 0.86 → 0.72、`layer-3`/`overlay` 0.80 → 0.66、输入卡 0.76 → 0.46、状态栏 0.76 → 0.46、菜单 0.92 → 0.74、设置卡 0.95 → 0.80、卡片 0.65 → 0.50。tint 一旦超过 0.4，玻璃就退化成磨砂塑料
- 外观: 输入卡补 1px 内高光（`inset 0 0 0 1px rgba(255,255,255,.55)`，深色 0.16），边界靠「棱」而不是靠「白」

## [0.14.9] - 2026-11-24

> 撤回 0.14.8 的输入卡降透

### Reverted

- 外观: `--dsw-specific-input-major` 和 `--dsw-specific-tip` 回到 `fill(0.76, 0.78)`。0.58 那版卡片和页面几乎同色，边界全靠描边，实际看着更差——用户反馈「真的不好看」

## [0.14.8] - 2026-11-24

> 输入卡不再是白板

### Fixed

- 外观: `--dsw-specific-input-major` 和 `--dsw-specific-tip` 从 `fill(0.76, 0.78)` 降到 `fill(0.58, 0.62)`。输入卡用的是这个 token（`GRgSLq_card`），0.76 比会话区的 bg-base（0.55）实一档，在玻璃上就是一块白板

## [0.14.7] - 2026-11-24

> 壁纸末端去掉薄荷偏色

### Fixed

- 外观: 壁纸渐变的末端从 `#eaf1f1`（薄荷，R234 G241 B241）改成 `#edf1f4`（中性偏蓝）。页面只有 0.55 不透明度，壁纸从底下透上来，越靠下越青——输入框那一带正好压在渐变末端，实测从 `#E2E8EA` 渐变到 `#CCE8EB`。三处渐变（玻璃层、预模糊层、兜底层）一起改

## [0.14.6] - 2026-11-24

> 输入框容器两个类名一起兜

### Fixed

- 外观: 0.14.5 只写了 `_composerSeat`，但实际渲染出来的是 `_composerStack`（用户贴的 DOM 确认），规则没命中。现在两个类名都兜上，统一铺 `var(--dsw-alias-bg-base)`。渐隐的尽头露出的是预模糊壁纸（`blur(28px) saturate(0.62)`，底部薄荷段），所以发青

## [0.14.5] - 2026-11-24

> 输入框座位不再透出壁纸

### Fixed

- 外观: `_composerSeat` 的渐隐（`linear-gradient(180deg, transparent 0, var(--dsw-alias-bg-base) 36px)`）在玻璃下失效——`bg-base` 只有 0.55 不透明度，渐变的「实色端」照样半透明，壁纸从底下透上来，整块发青（实测从 `#E2E8EA` 渐变到 `#CCE8EB`）。改成和会话区同一个平色 `var(--dsw-alias-bg-base)`

## [0.14.4] - 2026-11-24

> 底栏和会话区用同一个底

### Fixed

- 外观: `_bottomRow` 从 `transparent` 改成 `var(--dsw-alias-bg-base)`。会话区现在统一铺 bg-base，底栏透明就会直接露出壁纸——实测底栏 `#CEE7EA`、内容区 `#E4EAED`，输入框周围那一圈因此发青

## [0.14.3] - 2026-11-24

> 静止时发灰：预模糊层的兜底色从白纱换成壁纸

### Fixed

- 外观: `#dsh-concierge-frost` 的兜底色从 `rgba(tint, 0.32)`（中性白）换成壁纸渐变。子层（模糊壁纸）不透明，平时完全盖住兜底色；但静止时 GPU 可能把那个大模糊层丢掉，露出来的就是中性白纱——压在桌面上正是「去饱和的灰」。换成壁纸之后，子层掉了只是少一层模糊，不会变色

## [0.14.2] - 2026-11-24

> 壁纸层往上多铺一个标题栏高度

### Fixed

- 外观: `#dsh-concierge-glass` 加 `top: calc(-1 * var(--dsh-windows-titlebar-height))`。frame 有 `padding-top: 40px`（放标题栏），而壁纸层是 `position: fixed; inset: 0`——包含块是 frame 的 padding box 时，`inset: 0` 从内容区开始，窗口最上面那 40px 直接漏出桌面。实测那 40px 两列颜色不同（`#B1D2DE` / `#A8D2E1`），正是各透各的证据

## [0.14.1] - 2026-11-24

> 顶栏区域和系统那条对齐

### Fixed

- 外观: 玻璃下 frame 和它的 `::before` 直接用 `--dsh-canvas`（`#eef3fa` / `#0e1116`），不再叠一层 `bg-base`。补丁把系统标题栏改成了同一个值，而 CSS 这边还多叠了 0.55 层白，实测系统 `#eef3fa`、页面 `#D8E8EF`，差一档

## [0.14.0] - 2026-11-24

> 顶栏那 40px 是系统画的，改用客户端补丁改色

### Added

- 工具: `patch-titlebar-color.mjs`（配 `apply-titlebar-color.cmd`）。顶栏那 40px 是 Windows 按主进程给的 `titleBarOverlay.color` 自己刷的，CSS 碰不到；把 `chromeFallbackFill()` 的返回值从 `"#1b1b1c" : "#f9fafb"` 换成 `"#0e1116" : "#eef3fa"`（等长替换 3 处，asar 头不用动）

### Changed

- 外观: 删掉调试用的洋红 / 青色标记（`frame` / `frame::before`），确认了那条不属于页面

## [0.13.9] - 2026-11-24

> 顶栏选择器同时覆盖 html / body 两种挂法

### Fixed

- 外观: `data-windows-titlebar` 可能挂在 `<html>` 上，也可能挂在 `<body>` 上。0.13.8 只写了 html 那一版，实测顶栏仍是 `#B1D2DE`（内容是 `#D8E8EF`）。现在两种写法都写上，`::before` 和 native 分支同样处理

## [0.13.8] - 2026-11-24

> 顶栏那一条终于真的刷上底色了

### Fixed

- 外观: 顶栏选择器从 `html[data-dsh-glass="1"] [data-windows-titlebar] …` 改成 `html[data-dsh-glass="1"][data-windows-titlebar] …`。`data-windows-titlebar` 加在 **`<html>` 本身**上（`documentElement.hasAttribute`），当后代找永远匹配不到——0.12.2 到 0.13.7 这几版对顶栏的修改其实都没生效
- 外观: 顶栏那条是 `_frame` 的 `padding-top`（应用规则 `[data-windows-titlebar] .frame { padding-top: …; background: sidebar-fill }`），而 `sidebar-fill` 在玻璃下是 0.004 → 整条直接露出桌面（实测 `#9FBFCC`），和内容的 `#D8E8EF` 差一大截。现在把「壁纸渐变 + bg-base」画到 frame 上，padding 区自然和内容同色

## [0.13.7] - 2026-11-24

> 顶栏不再发蓝

### Fixed

- 外观: 玻璃下顶栏（`[data-windows-titlebar] [class*="_frame"]` 和它的 `::before`）改成「壁纸渐变 + bg-base」两层叠加。之前只铺了 `bg-base`（0.55 白），背后没有壁纸层，直接露出桌面 → 整条发蓝（实测 `#B3D2DF`），而下面的内容背后有壁纸（`#D8E8EF`），两截对不上

## [0.13.6] - 2026-11-24

> 侧边栏和会话区同色，颜色切换不再硬跳

### Fixed

- 外观: 侧边栏改回 `--dsw-alias-bg-base`。会话区根节点铺的就是这个 token（玻璃下 `rgba(248,250,252,0.55)`，发白），而侧边栏之前被强制成 `transparent`，直接露壁纸（发蓝）——两块并排差一大截

### Changed

- 外观: 给顶层表面（`html` / `body` / `#root` / `_frame` / `_sidebarCol` / `_centerCol` / `_bottomRow`）加 240ms 的 `background-color` + `color` 过渡。切浅深、切皮肤、改主题时颜色渐变过去，不再瞬间跳变
- 外观: 「过渡期兜底」那个状态排除在过渡之外——它要求根层立刻变不透明，加了过渡反而会把白带放回来
- 兼容: `prefers-reduced-motion` 下关闭过渡

## [0.13.5] - 2026-11-22

> 插件路由补上 DSH 自己的访问检查

### Security

- 工具: 所有 `/dsh-concierge/*` 路由先过 `ctx.connection.requestRejection()`（Connection 的 Host/Origin 校验 + 浏览器凭据），再走原来的同源校验。之前只有 `Origin` / `Host` 判断，插件市场的扫描把这条标成了「HTTP routes have no DSH access check」
- 兼容: 宿主没有 `connection` 服务时直接跳过，不影响极简 profile

## [0.13.4] - 2026-11-22

> 设置页页头和搜索行不再自己刷底色

### Fixed

- 外观: 玻璃下把 `header._pageHead`、`_page`、`_pageBody`、`_tabSearchRow` 的 `background` / `background-image` / `box-shadow` / `border-bottom` 全部归零，伪元素也一并清掉。页头是自定义组件（三个部件用 `--plugin-part-y` 内联定位、跟滚动收放），自带底色，和内容区两种材质，交界处就是那条硬台阶
- 依据: 用户贴出的 DOM 显示 `header.V7pFBG_pageHead` 结构，页头 + 搜索行都在中心列里

## [0.13.3] - 2026-11-22

> 探针改用尺寸判定，并 dump 设置页子树

### Fixed

- 工具: 设置页容器是 `pointer-events: none`，`elementFromPoint` 会穿透到下面的会话页，所以前几版一直报 `page=chat`。改成量 `_page` 的 `getBoundingClientRect()`
- 工具: 上报里新增 `pageChain`——从 `_page` 起逐层往下 6 级的 `y / height / background / ::before / ::after`，横带画在哪一层可以直接读出来

## [0.13.2] - 2026-11-22

> 探针改成「设置页真的在前台」才上报

### Fixed

- 工具: 自动上报的判定从「DOM 里有 `_pageHead`」改成「屏幕中部那个点落在 `_page` 里」。设置页可能挂载着但隐藏，前两版都在会话页上报的
- 工具: 上报里加了 `page` 字段（`settings` / `chat`），一眼能看出这次抓的是哪一页

## [0.13.1] - 2026-11-22

> 设置页一出现就自动上报，不用手按

### Changed

- 工具: 探针改成轮询 `_pageHead` 是否出现，出现后 900ms 自动上报一次。之前要手动按 `Ctrl+Alt+H`，两次都按在了会话页上，拿不到设置页的数据

## [0.13.0] - 2026-11-22

> 清掉设置页页头的渐隐伪元素

### Fixed

- 外观: 玻璃下清掉 `_pageHead` / `_page` / `_pageBody` 的 `::before` / `::after` 背景。设置页的硬台阶就是它画的——探针显示 90px 和 230px 处整条元素链的 `background-color` 完全一致，只剩伪元素这一种可能

### Changed

- 工具: 探针的 `hits` 现在也带 `::before` / `::after` 的底色和渐变，方便下次直接看到伪元素

## [0.12.9] - 2026-11-22

> 加了一个临时探针，用来定位页面顶部那条横带

### Added

- 工具: 性能上报里多一份 `hits`——页面顶部 30/90/230px 三处的元素层级和背景色。按 `Ctrl+Alt+H` 立刻上报一次
- 用途: 横带到底是哪一层画的，直接看元素链和它的 `background-color`，不再靠截图猜颜色

## [0.12.8] - 2026-11-22

> 设置页页头那层「露壁纸」的底去掉

### Fixed

- 外观: 设置页（插件 / 插件市场 / 维护中心）的中心列统一铺 `--dsw-alias-bg-base`。页头原来是透明的（露出壁纸、发蓝），内容区自己上了色（发白），交界处一条硬台阶（实测 `#AFCCD7` → `#DBE6EB`）
- 依据: unsloth #17403「Fix header gradient banding on plain glass backgrounds」——玻璃下不要再叠页头渐隐，否则必然出横带

## [0.12.7] - 2026-11-22

> 设置页顶部那条横带

### Fixed

- 外观: 会话标题栏那层 0.16 的压色只在「中心列里确实有会话区」时生效。设置页（插件 / 插件市场 / 维护中心）也是中心列的直接子元素，但里面没有会话区——原来的选择器把整页也压了一层，页头和内容各压一层，交界处就是一条横带（实测 `#DBE6EB → #D1D2D3`，跨度约 90px）

## [0.12.6] - 2026-11-22

> 补丁打错了窗口：之前改的是欢迎窗口

### Fixed

- 工具: `patch-window-frame.mjs` 的锚点改成主窗口那处 `backgroundMaterial:"acrylic",titleBarStyle:"hidden"`（压缩代码，冒号后无空格）。之前用的是带空格的 `backgroundMaterial: "acrylic"`，只匹配到**欢迎窗口**，主窗口的 11px 依然存在
- 工具: `--check` 改成读 `lib/main.js` 的内容判断，之前看的是 header JSON，永远报「未应用」
- 工具: 新增 `verify-frame-patch.mjs`，打印打完补丁后主窗口那段构造代码

## [0.12.5] - 2026-11-22

> 新增「去掉 11px 缩放边框」的 asar 补丁

### Added

- 工具: `scripts/patch-window-frame.mjs`（配 `apply-window-frame.cmd`）。给主窗口构造插入 `thickFrame:!1,roundedCorners:!1`。Electron 41.3+ 的 `RestoredFrameBorderInsets()` 会在无边框窗口的左/右/下各留一圈不可见缩放边框（顶部为 0），acrylic 铺满整个窗口矩形、页面只铺客户区，那圈就是「后面一层」
- 工具: 这是插入式修改，会重建 asar 头——新内容追加到数据区末尾，只改它自己的 offset/size 并去掉 integrity，其余文件的偏移不变（已验证：20055 个文件字节一致，只有 `lib/main.js` 变化）
- 代价: 窗口不能再拖边改大小（`thickFrame:false` 的直接结果）

## [0.12.4] - 2026-11-22

> 撤销 0.12.3 的「关掉亚克力」

### Changed

- 外观: 不再由插件设置 `DWMWA_SYSTEMBACKDROP_TYPE`。那块「亚克力板」的根因是窗口的 11px 缩放边框，不是材质本身；材质交给应用自己决定

## [0.12.3] - 2026-11-22

> 关掉窗口后面那块亚克力

### Fixed

- 外观: 「无边框窗口」下把 DWM 的材质（`DWMWA_SYSTEMBACKDROP_TYPE`，38）设成 `1`（None）。应用创建窗口时给的是 `backgroundMaterial: "acrylic"`，页面一旦有透明区域，那层亚克力就在窗口后面显形，看起来像贴了一块板；关掉之后透明处直接是桌面。关掉无边框时设回 `3`（Acrylic）
- 工具: `/window-corners` 的守护循环也一起重设 38，避免启动收尾时被改回去

## [0.12.2] - 2026-11-22

> 标题栏那条改用 bg-base，别再露出桌面

### Fixed

- 外观: 0.12.1 把标题栏那 40px 改成透明之后，它会直接露出窗口后面的桌面，接缝只是换了颜色。改成 `var(--dsw-alias-bg-base)`——和下面各列同一个底，两套皮肤都是

## [0.12.1] - 2026-11-22

> 去掉页面标题上横着的那条线

### Fixed

- 外观: 标题栏那 40px（`[data-windows-titlebar] [class*="_frame"]::before`）不再铺 `--dsw-specific-sidebar-fill`。它是拖拽区，和下面各列是两种材质，交界处会横出一条线，正好压在页面标题上；两套皮肤都改成透明，上下露出同一块底

## [0.12.0] - 2026-11-22

> 删掉「简化壁纸」和「拖动时降级」两个开关

### Removed

- 外观: 「简化壁纸」「拖动时降级」两个开关，连同持久化字段、`data-dsh-simple-wallpaper` / `data-dsh-resize-degrade` 两个钩子和对应的 B6 / B1 样式。这两个开关对现在的帧率已经没有影响，留着只是让外观页更长
- 代码: `perfChip`、`IconRefresh` 两个没人调用的函数
- 样式: `.uc-token-*`（7 条）、`.uc-look-editor`、`.uc-look-actions`、`.uc-look-error`、`.uc-log-entry`、`.uc-chips`、`.uc-perf-rows`、`.uc-head-actions`、`.uc-safe`、`.uc-chip-toggle*`（5 条）、`.uc-spin` 等 23 条死规则

### Added

- 工具: `scripts/scan-dead-code.mjs`，静态扫「定义了没人调用的函数 / 写了没人用的 dataset 钩子 / 定义了没人用的 `uc-*` 类」

## [0.11.7] - 2026-11-22

> 维护中心不再自己配底色，和外面的设置窗口同一块

### Fixed

- 外观: `.uc-root` 改成透明，并去掉那层内高光。之前面板自己刷一层底色（玻璃 0.55 / 原生 layer-2），叠在设置窗口的底上，玻璃下等于 0.55 叠 0.55，明显偏白——看起来就是「插件自己调的一块颜色」
- 外观: 卡片 / 统计 / hero 的底色回到 `--dsw-alias-bg-layer-1`、边框回到 `--dsw-alias-border-l1`，和应用自己的卡片同一套 token；删掉玻璃下换 `l2` 的覆盖

## [0.11.6] - 2026-11-22

> 玻璃下面板和卡片终于拉开了

### Fixed

- 外观: 玻璃下 `.uc-root` 面板改用一层 6% 中性压暗（深色 5% 白），卡片底色提到 0.86。之前面板 0.55 白、卡片 0.72 白，对话框本身又是白的，叠出来面板 `#F6F9FB`、卡片 `#F7F9FB`——只差 1 个色阶，层级看不出来

## [0.11.5] - 2026-11-22

> 玻璃下面板和卡片的层级反了

### Fixed

- 外观: 玻璃下 `.uc-root` 面板的不透明度从 0.88 降到 0.55。卡片用的是 `layer-1`（约 0.72），面板比卡片还实，卡片压上去就成了「比底更暗的一块」——层级是反的。0.55 和应用的 `bg-base`（0.58）同一档，卡片重新亮一档浮在上面
- 外观: 玻璃下卡片的描边改用 `--dsw-alias-border-l2`（灰 0.18）。`l1` 是白 0.6，压在白色卡面上等于没有边

## [0.11.4] - 2026-11-22

> 三个数字合成一张卡，页签有了容器

### Changed

- 界面: 更新页的三个数字从「三张独立小卡」合成一张卡，格子之间只留竖分隔线；格子里不再各自画底、描边和投影
- 界面: `.uc-tabs` 加 1px 描边、内边距收到 3px，激活项改用官方 `--dsw-shadow-lv1`，hover 补了底色。之前页签容器和面板几乎同色，看不出是一组
- 两套皮肤共用同一套样式，颜色走 token，玻璃下自动跟着壁纸

## [0.11.3] - 2026-11-22

> 更新页的应用信息和按钮有了实体

### Changed

- 界面: `.uc-hero`（应用本体那块）加 1px 描边和 `--dsw-shadow-lv1` 投影，和卡片同一套材质；之前只有一层和背景几乎同色的底，看着像一段裸文字
- 界面: `.uc-btn` 改成「白底 + 1px 描边」，内边距 8→7px 补上边框占的高度；`uc-btn-ghost` / `uc-btn-danger` 去掉描边，保持纯文字按钮

## [0.11.2] - 2026-11-22

> 「刷新与重启」弹层的底色改用菜单面

### Fixed

- 界面: `.uc-help-menu` 的底色从 `--dsw-alias-bg-overlay` 换成 `--dsw-menu-surface-fill`（带兜底）。`bg-overlay` 是盖在内容上的一层暗色罩，单独当面板用就是一块灰（实测 `#E9ECF2`），和旁边的侧边栏 `#F9FAFB` 对不上
- 界面: 弹层里两处 hover 用的 `--uc-surface-2` / `--uc-hover` 只在 `.uc-root` 里定义，侧边栏这个位置取不到值，补了官方层级色兜底

## [0.11.1] - 2026-11-22

> 卡片加了投影和卡头分隔线

### Changed

- 界面: `.uc-card` / `.uc-stat` 加官方 `--dsw-shadow-lv1` 投影，卡片不再只靠描边区分
- 界面: `.uc-card-head` 加一条 `--uc-sep` 分隔线，内边距改成上下对称的 12px；卡头和内容之间现在是「一条线」，不是靠留白

## [0.11.0] - 2026-11-22

> 卡片加边框，不再是一层「白压白」

### Changed

- 界面: `.uc-card` 和 `.uc-stat` 各加 1px `--dsw-alias-border-l1` 边框。之前只有背景色和顶部一条高光，在浅色面板上几乎看不出边界，加卡头也不明显

## [0.10.9] - 2026-11-22

> 更新页的自动更新也做成带标题的卡片

### Changed

- 界面: 「更新」页里自动更新那一块补上 `uc-card-head`，标题「更新设置」。之前只有一行开关，没有卡头，和页面上其它卡片不是一套样式
- 文案: 新增 `updateSettings`（中英）

## [0.10.8] - 2026-11-22

> 原生的维护中心保住和玻璃一样的层级

### Changed

- 外观: 原生皮肤下 `.uc-root` 面板底色从 `bg-base` 改成 `bg-layer-2`。原生页面本身是纯白，面板再用纯白，卡片（`layer-1` 白）就没有边界了；玻璃下是「有色面板 + 更亮卡片」，原生现在保持同一个层级关系，排版看起来一致

## [0.10.7] - 2026-11-22

> 原生恢复官方纯白，卡片不再压在偏蓝的画布上

### Changed

- 外观: 「原生」不再覆盖任何 token。之前覆盖 `bg-base` 和 `specific-sidebar-fill` 去对齐玻璃底色，结果是画布偏蓝、官方白卡片压在上面像贴了另一块纸
- 外观: 原生画布改用官方的 `neutral-bluish-00` / `-950`（`#ffffff` / `#151517`），不再借用玻璃的 `#eef3fa` / `#0e1116`

## [0.10.6] - 2026-11-22

> 输入卡退回来，只是不再死白

### Changed

- 外观: 底栏作用域里的 `--dsw-specific-menu` 从「完全透明」改成 `rgba(var(--dsh-tint-rgb), 0.55)`，并恢复卡片的投影。0.87（token 原值）像块白板，全透明又没了边界，0.55 是中间档：卡片还在，但和会话区更接近

## [0.10.5] - 2026-11-22

> 玻璃皮肤下输入卡和会话区同色

### Changed

- 外观: 底栏作用域里把 `--dsw-specific-menu` 设为透明、`--dsw-elevation-panel` 设为 `none`。输入卡的底色不是 `input-major`，而是卡片自己的 `::before` 用 menu token 画的（和菜单共用同一个值），直接改 token 会把菜单一起变透；限定在 `_bottomRow` 里改，卡片就和会话区同色了，菜单不受影响

## [0.10.4] - 2026-11-22

> 玻璃皮肤下输入卡和状态栏终于同色

### Fixed

- 外观: `--dsw-specific-input-major` 从 0.42 提到 0.76（与面板 `layer-1` 同档），`--dsw-specific-tip` 从 0.86 降到 0.76，两者现在一致；`--dsw-specific-selector` 用 0.82 保持略亮，登录输入框同步到 0.76。之前输入卡比它下面那条状态栏透一倍，交界处一条硬边，看起来就是「聊天框和别处不一致」

## [0.10.3] - 2026-11-22

> 原生皮肤把侧边栏也归到画布色，修掉两种近白并排

### Fixed

- 外观: 「原生」除了 `--dsw-alias-bg-base`，再覆盖 `--dsw-specific-sidebar-fill`。侧边栏和标题栏用的是后者（`_sidebarCol` 和 `_frame::before`），只改前者会留下官方 `#f9fafb`，和聊天区的 `#eef3fa` 并排就是两种近白，一眼能看出偏暖/偏冷

## [0.10.2] - 2026-11-22

> 画布色收成一个变量，玻璃和原生共用

### Changed

- 外观: 新增 `--dsh-canvas`（浅 `#eef3fa` / 深 `#0e1116`）。根层、壁纸渐变起点、简化壁纸、拖动降级、过渡兜底、原生皮肤全部改用它；CSS 里原本重复 18 次的画布字面量，现在只剩 4 处定义
- 外观: JS 侧新增 `LOOK_CANVAS` 常量，给「原生」皮肤的 token 用（token 是 JS 对象，读不到 CSS 变量）

## [0.10.1] - 2026-11-22

> 颜色体检：删掉三套已经用不到的皮肤色板

### Removed

- 外观: `LOOK_SKINS` 里的 `soft` / `ink` / `ocean` 三套 token（约 45 个颜色值）。下拉里早就不提供了，旧存档也会被强制落到玻璃，留着只会让人以为还有这几套皮肤
- 文案: 对应的 `lookSkinSoft` / `lookSkinInk` / `lookSkinOcean` 中英文案

## [0.10.0] - 2026-11-22

> 窗口底色改成和界面同色，不再追求透明

### Added

- 工具: `scripts/patch-window-match.mjs`（配 `apply-window-match.cmd`）。把 `chromeFallbackFill()` 的返回值从 `"#1b1b1c" : "#f9fafb"` 换成 `"#0e1116" : "#eef3fa"`——等长替换，窗口底色、标题栏遮罩和所有 `setBackgroundColor` 调用一起变成玻璃皮肤的基色
- 文档: 说明窗口有约 11px 非客户区，页面画不进去；窗口透明时那圈会露出桌面，所以改成同色而不是透明

### Changed

- 工具: `apply-window-match.cmd` 沿用「应用 → 启动 → 观察 25 秒 → 没起来就自动还原」的流程

## [0.9.9] - 2026-11-22

> 全屏和改尺寸的过渡期不再透出桌面

### Fixed

- 外观: 「无边框窗口」下，`resize`（含全屏切换）后的 200ms 里给根层铺一块和壁纸同色的实色。窗口是真透明的，新露出的区域在下一帧提交前会露出桌面；铺实之后整帧重新判定为不透明，合成器会拉伸上一帧，露出来的是内容。这段兜底和「拖动时降级」开关无关

## [0.9.8] - 2026-11-22

> 窗口查找更稳，DWM 属性加 15 秒守护

### Changed

- 工具: `/window-corners` 改成枚举该进程的可见顶层窗口、取面积最大的那个（跳过 DevTools 和小于 700×500 的窗口），不再依赖 `MainWindowHandle`——启动早期它可能是 0，标题也还是空的
- 工具: 页面加载后的第一次调用会带 `watch: 15`。PowerShell 在应用启动收尾期间每 1.5 秒重设一次圆角和边框色，兜住「应用 show / setBounds 时重写窗口样式、把 DWM 属性冲掉」这个情况
- 工具: `runPowerShellCommand` 支持自定义超时，watch 期间按 `watch + 8` 秒算

## [0.9.7] - 2026-11-22

> 方角无边框：去掉透明角，删掉留边调试开关

### Changed

- 外观: `--dsh-edge-radius` 改成 `0`，四角变方、不再透出桌面
- 外观: 开关改名「无边框窗口」，提示同步更新

### Removed

- 外观: 「留边调试（品红 / 绿）」开关，以及它的样式、持久化字段和文案

## [0.9.6] - 2026-11-22

> 留边宽度改成 0：内容铺满窗口，只保留圆角和无边框

### Changed

- 外观: `--dsh-edge` 从 10px 改成 0px。内容直接铺满窗口，窗口边缘不再有那圈 10px 的亚克力带；圆角、透明窗口、去掉 DWM 边框都保留。想要回那圈，把它改大即可（10px 是之前试过的值）
- 外观: 开关改名「无边框圆角（真透明）」，提示同步更新

## [0.9.5] - 2026-11-22

> 开留边时去掉窗口那圈 1px 边框，让窗口边框和内容圆角边合成一条

### Added

- 外观: 开「真透明留边」时，宿主通过 `DWMWA_BORDER_COLOR`（34）把 Windows 画的那圈 1px 窗口边框设成 `DWMWA_COLOR_NONE`，关掉留边时设回默认。之前窗口边框和内容圆角边之间夹着 10px 留边，视觉上是两条边；去掉外框后只剩内容自己那条圆角边
- 工具: `/window-corners` 路由接受 `borderless` 参数（宿主侧改动，需要重启 DSH 生效）

## [0.9.4] - 2026-11-22

> 原生皮肤自己把根层涂实，窗口透明后不再透出桌面

### Fixed

- 外观: 「原生（纯白）」补上不透明的根层（浅色 `#eef3fa`、深色 `#0e1116`，深色用 `body[data-ds-dark-theme]` 判断）。窗口底色被透明补丁放开之后，原生没有壁纸层，不涂根层就会真的透出桌面

### Changed

- 工具: 应用脚本把「还原命令」单独放一行，避免 cmd 把 `node ...` 当成命令去执行而报「不是内部或外部命令」

## [0.9.3] - 2026-11-22

> 修掉批处理文件换行导致「双击没反应」

### Fixed

- 工具: `apply-window-clear.cmd` 改用 CRLF 换行。之前是 LF，cmd.exe 解析不了，双击后窗口一闪就关；顺带把括号块改成 `goto` 标签，行为更稳

## [0.9.2] - 2026-11-22

> 窗口透明补丁收窄范围，应用脚本加上自动回滚

### Changed

- 工具: `patch-window-clear.mjs` 只改运行时那 3 处 `setBackgroundColor(chromeFallbackFill())`，不再动标题栏遮罩的构造颜色——后者的颜色本来就会被 preload 探针按 token 覆盖，少改一处少一个变量
- 工具: `apply-window-clear.cmd` 改成「应用 → 启动 → 观察 25 秒 → 进程不在就自动还原并重启」。上一次打完补丁启动即退（崩溃日志是 `desktop welcome: Web request failed`，不是颜色报错，但无法排除补丁影响），所以这次让脚本自己兜底

## [0.9.1] - 2026-11-22

> 找到留边发白的真正原因：主进程在运行时把窗口底色刷成了不透明

### Added

- 工具: `scripts/patch-window-clear.mjs`（配 `scripts/apply-window-clear.cmd`）。DSH 的窗口构造参数本来是 `backgroundColor:"#00000000"` + `backgroundMaterial:"acrylic"`，但主进程在 `nativeTheme` 更新和「进入工作区」时又调了 `window.setBackgroundColor(chromeFallbackFill())`——浅色下就是 `#f9fafb`，正好是留边那圈的颜色。这个补丁把那三处调用等长替换成透明色，让窗口底色保持透明，亚克力才透得出来

### Changed

- 文档: 说明窗口底色是主进程运行时改的，CSS 改不到，必须打这个补丁

## [0.9.0] - 2026-11-22

> 留边推倒重做：改用 body 的透明 border 内缩，不再用 clip-path

### Changed

- 外观: 留边从 `clip-path` 换成「`body` 透明 border + `overflow: hidden` + `border-radius`」。`clip-path` 的 `inset` 是相对元素自己的参考盒算的，元素盒子不在窗口原点时整个切口会跟着偏移（之前「一上一下」的根因）；border 参与布局，菜单栏和 `#root` 会一起向内缩，基准天然是视口
- 外观: 壁纸层用同一组变量自己内缩（它是 `fixed`，不参与 border 布局），和内容共用同一个内半径
- 外观: 去掉外投影和 1px 描边，回到最简形态；调试开关保留

## [0.8.6] - 2026-11-22

> 留边的裁剪改挂到 html，切口基准终于等于视口

### Fixed

- 外观: `clip-path` 的 `inset` 是相对元素自己的参考盒算的，不是视口。裁 `#root` / `body` 时切口跟着它们的盒子下移，顶部露出一大条亚克力（实测约 130px），就是「玻璃和界面一上一下」。改裁根元素 `html`——它的 border-box 恒等于视口
- 外观: 去掉留边的外投影。裁剪挂到 `html` 之后页面上没有任何元素在切口外，CSS 画不出落在外面的阴影；窗口投影交回 DWM

## [0.8.5] - 2026-11-22

> 代码体检：修掉外观样式表的重复重插，文档对齐现状

### Fixed

- 外观: `promoteLookCss()` 只在样式表后面确实还有节点时才把它挪到 `head` 末尾。此前每次 `applyLook()` 都重插一遍，拖透明度滑杆会连续触发整页样式重算

### Changed

- 文档: README 的皮肤列表改成「玻璃 / 原生（纯白）」，补上简化壁纸、拖动时降级、真透明留边；窗口材质补丁那节改写为「白条已由 CSS 修好，补丁只用于换材质」，并说明 `acrylic` / `none` 对留边观感的区别
- 文档: `docs/RESIZE-BAND.md` 补上「真透明留边」这个例外
- 文档: `docs/DETAIL.md` / `DETAIL.zh.md` 删掉「流式时临时关聊天区 backdrop-filter」这条已不存在的机制

## [0.8.4] - 2026-11-22

> 裁剪挪到 body，把菜单栏圈进切口，修掉顶部那条亚克力带

### Fixed

- 外观: 留边从裁 `#root` 改成裁 `body`。应用把菜单栏（「应用 / 编辑」那条）画在 `#root` 外面，裁 `#root` 会把它整条留在切口外，顶部露出一大条亚克力（实测约 130px），看起来像玻璃和界面「一上一下」
- 外观: 投影从 `body::before` 挪到 `html::before`，否则会被 `body` 的新切口一起裁掉
- 外观: 调试模式改由 `body` 铺绿，把菜单栏区域也盖住

## [0.8.3] - 2026-11-22

> 修掉留边模式下模糊层比内容小一圈的错位

### Fixed

- 外观: `#dsh-concierge-frost` 不再单独套 `clip-path`。它的盒子只是会话区那一小块，再裁 10px 会让模糊层四边各缩进 10px、整体偏上；父层（玻璃层）的切口已经覆盖它

## [0.8.2] - 2026-11-22

> 留边模式下把 WCO 遮罩彻底透明，去掉顶部那条淡线

### Fixed

- 外观: 顶部 40px 的 WCO 遮罩颜色来自 `--dsw-specific-sidebar-fill`（原值 alpha 0.004），它会在留边模式下盖出一层极淡的白，和左右下三边的纯亚克力形成一条线；现在留边时设为 `rgba(1,0,0,0)`（`rgba(0,0,0,0)` 在部分 Electron 版本会回退成默认帧色）
- 外观: 切换留边时轻推一下 `body` 的 style，让 preload 的探针重新读 token 并通过 IPC 重发遮罩颜色

## [0.8.1] - 2026-11-22

> 切口内侧压一条壁纸色描边，盖掉抗锯齿白线

### Fixed

- 外观: 留边的 `clip-path` 边缘会因抗锯齿和窗口表面混色，留下一道发白细线；现在在切口内侧压 1px 壁纸色描边覆盖它（调试模式下自动隐藏）

## [0.8.0] - 2026-11-22

> 留边加调试开关：外圈品红、内容绿，用来看缝

### Added

- 外观: 「留边调试（品红 / 绿）」，只在留边开启时出现。外圈涂品红、内容涂绿并关掉投影，用来定位缝属于哪一层、有多宽；开关保留在代码里，以后调边距和圆角继续用

## [0.7.9] - 2026-11-22

> 去掉留边的第二条边，修掉窗口边框与玻璃之间的缝

### Fixed

- 外观: 留边不再在 `body::before` 上画 1px 描边。它和裁剪各自定位，抗锯齿叠出一条缝；现在边界只由裁剪这一条线定义，伪元素只负责外阴影

## [0.7.8] - 2026-11-22

> 留边加投影和玻璃边，几何参数收成两个变量

### Changed

- 外观: 留边的边距 / 圆角改成 `--dsh-edge` / `--dsh-edge-radius`（10px / 16px），只在一处定义
- 外观: 窗口外圈加投影、内圈加 1px 高光。投影挂在**没被裁剪**的 `body::before` 上，和切口完全对齐；深色用单独一组更重的阴影

## [0.7.7] - 2026-11-22

> 留边只留一套机制：统一裁剪，去掉内缩，消除缝隙

### Fixed

- 外观: 「真透明留边」去掉 `_frame` 的 margin 和壁纸层的 `inset`，页面与壁纸统一用同一个 `clip-path` 切口，不再出现两套基准对不齐的缝

## [0.7.6] - 2026-11-22

> 留边模式改用 clip-path，外圈不再被祖先容器盖住

### Fixed

- 外观: 「真透明留边」用 `#root` 的 `clip-path` 裁掉外圈，修掉祖先容器铺底导致的浅色边框
- 外观: 外观样式表每次应用时移到 `head` 末尾，避免被宿主启动过程中后追加的样式盖掉

## [0.7.5] - 2026-11-22

> 新增试验开关：窗口四周留 10px，露出 DWM 的 Acrylic

### Added

- 外观: 「真透明留边（试验）」。DSH 主窗口本来就是 `backgroundColor:"#00000000"` + `backgroundMaterial:"acrylic"`，页面四周留空后露出的是桌面壁纸的模糊；内容区同步内缩，中间仍然实心，尺寸变化时不会露白

## [0.7.4] - 2026-11-22

> 原生皮肤的画布底色对齐玻璃那套

### Changed

- 外观: 「原生」只覆盖 `--dsw-alias-bg-base`（浅色 `#eef3fa`、深色 `#0e1116`），卡片仍是官方白，两套皮肤来回切时底色不再跳

## [0.7.3] - 2026-11-22

> 玻璃配色重做：色相收到一种、底色抬到 Acrylic 量级、层级靠亮度

### Changed

- 外观: 壁纸光斑从蓝 / 紫 / 青三种色相收成同色系蓝加一个暖中性，源色先降饱和，模糊层不再用 `saturate(0.32)` 硬压
- 外观: 玻璃 tint 改成中性近白 `248,250,252` / 近黑 `26,28,32`，不再偏蓝
- 外观: 面板不透明度抬到 Acrylic 量级（`bg-base` 0.55、`layer-1` 0.72、`layer-2` 0.82、设置卡 0.90），透明度滑杆映射改为 ×1.25–×0.55
- 外观: 颗粒默认 3%（原 6%），预模糊从 18px 提到 28px
- 外观: 旧存档里的透明度和颗粒滑杆值一次性回落到新默认（`lookRev` 迁移）

## [0.7.2] - 2026-11-22

> 原生皮肤下维护中心面板不再偏浅蓝

### Fixed

- 外观: 原生皮肤（以及外观关掉时）面板底色改用官方 `--dsw-alias-bg-base`，不再回退到玻璃色温的浅蓝兜底值

## [0.7.1] - 2026-11-22

> 皮肤只留「玻璃」和「原生」两档

### Changed

- 外观: 皮肤下拉只保留「玻璃」和「原生（纯白）」；旧的柔和 / 墨色 / 海洋存档自动落到玻璃
- 外观: 「原生」不再依赖 DWM Acrylic 和 asar 补丁，改为官方默认配色，不挂壁纸和模糊层

## [0.7.0] - 2026-11-22

> 根层保持不透明，拖边框白带和全屏闪白同时消失

### Fixed

- 外观: 根层 `html` / `body` / `#root` 改为不透明，整帧被判定为不透明后合成器可以拉伸上一帧，尺寸跳变不再露出窗口表面色

## [0.6.8] - 2026-11-22

> 启动器补上最后一个开关 `--disable-gpu`

### Added

- 工具: 开关 9 = `--disable-gpu`，完全软件渲染（最后手段，整体会变慢）
## [0.6.7] - 2026-11-22

> 拖动期间给会话区加 `contain: layout paint`，切掉重排传播

### Changed

- 外观: 「拖动时降级」同时把会话区的布局/绘制范围限制在自身盒子里，内容不消失
## [0.6.6] - 2026-11-22

> 启动器增加帧率 / 光栅化开关，用来压缩缩放延迟

### Added

- 工具: 开关 7 = `--disable-frame-rate-limit --disable-gpu-vsync`，开关 8 = `--enable-gpu-rasterization --num-raster-threads=4`
## [0.6.5] - 2026-11-22

> 启动器增加默认底色开关（AARRGGBB），继续排查 resize 白闪

### Added

- 工具: 开关 5 / 6 = `--default-background-color=ffccd8ee` / `00000000`
## [0.6.4] - 2026-11-22

> 补丁脚本支持透明窗口模式，启动器改为按记录自动重打

### Added

- 工具: `--mode transparent|opaque`，透明窗口用等长替换（`transparent:!0,`）塞进构造参数，不动 asar 头
- 工具: `--ensure`，应用更新后按上次记录的模式自动重打

### Changed

- 工具: `--check` 直接报告当前模式、底色和 acrylic 状态
## [0.6.3] - 2026-11-22

> 启动器改成编号选开关：`launch-with-patch.cmd 1|2|3|4`

### Changed

- 工具: 四个 GPU/合成层开关编号化，另外补上 `--disable-direct-composition`
## [0.6.2] - 2026-11-22

> 启动器支持命令行开关，用来试 GPU/合成层的 resize 白闪

### Changed

- 工具: `launch-with-patch.cmd` 增加 `FLAGS` 一行，切换 `--enable-features` / `--use-angle` / `--disable-gpu-compositing` 不用改 asar
## [0.6.1] - 2026-11-22

> 新增带补丁自检的启动器：应用更新后自动重打

### Added

- 工具: `scripts/launch-with-patch.cmd`，启动前检查补丁，缺失或过期就自动重打再启动
## [0.6.0] - 2026-11-22

> 补丁脚本加了更新保护：应用更新后不会把版本退回去

### Added

- 工具: 补丁记录 `app.asar.patch.json`（应用版本 / 颜色 / 备份哈希）
- 工具: `--color` 换窗口底色，`--check` 报告当前实际颜色与是否过期

### Fixed

- 工具: `--revert` 核对应用版本，版本对不上就拒绝还原（否则会把应用整个退回旧版）
## [0.5.9] - 2026-11-22

> 壁纸提速：简化壁纸 + 提升合成层，拖动窗口时临时降级

### Added

- 外观: 「简化壁纸」开关（默认开），砍掉三层径向光斑，缩放重绘更轻
- 外观: 「拖动时降级」开关（默认开），拖窗口时壁纸和预模糊层换成纯色，松手 150ms 恢复

### Changed

- 外观: 壁纸层加 `will-change: transform`，缩放时走图层缩放而不是在新尺寸上重新栅格化
## [0.5.8] - 2026-11-22

> 新增「关闭实时缩放」开关脚本：拖动窗口只显示虚线框，不再露出填充块

### Added

- 工具: `scripts/toggle-live-resize.ps1`，一键切换 Windows 的 DragFullWindows，带 -Status / -On / -Off
## [0.5.7] - 2026-11-22

> 窗口底色改成内容区实测色 #ccd8ee，缩放时的白条是 Chromium 的既定行为

### Fixed

- 外观: 补丁的窗口底色从 tint（#e8f0fa，太浅）改为内容区实测合成色 #ccd8ee，缩放时露出的不再是白条
## [0.5.6] - 2026-11-22

> 根画布改成透明，缩放时不再露出浅色带

### Fixed

- 外观: `html` / `body` / `#root` 不再画不透明底；那条带实测 RGB(239,242,251)，和原底色 #f0f3fc 是同一块
## [0.5.5] - 2026-11-22

> 窗口材质补丁：关掉 acrylic，让窗口底色真正参与绘制

### Changed

- 工具: 补丁脚本同时把 `backgroundMaterial` 换成 `none`；acrylic 在玻璃皮肤下看不见，只带来缩放时的浅色带
## [0.5.4] - 2026-11-22

> 新增窗口回退色补丁：拖窗口时不再闪浅色带

### Added

- 工具: `scripts/patch-window-fallback.mjs`，把主窗口的 acrylic 回退色换成壁纸同色系，带 `--check` / `--revert`
## [0.5.3] - 2026-11-22

> 窗口缩放时底部不再露出浅色带

### Fixed

- 外观: 底部那一行不再铺 `--dsw-alias-bg-base` 浅底，缩放滞后时露出的是壁纸
## [0.5.2] - 2026-11-22

> 会话标题栏压一层 0.16 的色，底部渐隐，不留新边界

### Changed

- 外观: 标题栏加 0.16 的 tint 压住壁纸渐变，底部 16px 收到 0，和内容区之间没有硬边
## [0.5.1] - 2026-11-22

> 去掉聊天区标签行的横线和中心列的竖线

### Fixed

- 外观: 中心列的 border-left / border-right 与标签行的 border-bottom 一并去掉
## [0.5.0] - 2026-11-22

> 聊天区标题栏和内容区并成一块

### Changed

- 外观: 中心列的直接子元素不再铺底色，会话标题栏（标题 + 图标 + 标签行）和会话区同一层
## [0.4.9] - 2026-11-22

> 侧边栏改成和会话区一样透明，彻底同色

### Fixed

- 外观: 侧边栏从 0.3 的半透明改成透明，和内容列（玻璃皮肤下为 transparent）完全一致
## [0.4.8] - 2026-11-22

> 加「侧边栏 vs 内容列」底色对比探针

### Changed

- 诊断: `columns` 字段输出两列各自的计算底色与五层祖先，用来定位色差在哪一层
## [0.4.7] - 2026-11-22

> 侧边栏和内容区并成同一块，去掉中间的竖直接缝

### Fixed

- 外观: 侧边栏底色从 0.42 对齐到内容列的 0.3（深色 0.32），并显式去掉右边框
## [0.4.6] - 2026-11-22

> 别的插件的「DSH 控制台」浮层改成半透明

### Changed

- 外观: 面板 `.dsh-console-modal` 半透明（0.72，深色 0.74），去边框；遮罩调淡到 0.12
## [0.4.5] - 2026-11-22

> 撤回主窗口玻璃壳；标题栏和内容区并成同一块

### Changed

- 外观: 撤回主窗口 12px 内缩与圆角，恢复铺满窗口
- 外观: 标题栏不再自己刷底色，窗口框架背景透明，和会话区同一层壁纸，没有分界
## [0.4.4] - 2026-11-22

> 主窗口也做「玻璃外壳 + 内窗口」：外壳内缩 12px

### Changed

- 外观: 主窗口框架内缩 12px 当玻璃壳（0.76，深色 0.78），圆角 12px，内容仍在壳内
## [0.4.3] - 2026-11-22

> 顶栏改成和内容层同一个透明度：透，但不实

### Changed

- 外观: 顶栏从 0.92 降到 0.88，和内容层一致；不加边框，靠内容从下面滑过暗示层级
## [0.4.2] - 2026-11-22

> 面板头部改成弹性布局：按钮不再被挤出边界，标题先压缩

### Fixed

- 外观: 头部与标签栏不再写死宽度，右侧操作区 flex-shrink: 0，标题超长时省略而不是挤走按钮
## [0.4.1] - 2026-11-22

> 修窗口顶部那条被壁纸染成青→紫渐变的问题

### Fixed

- 外观: 顶栏底色从 0.58 提到 0.92（深色 0.9），任何壁纸下都是一块纯色，不再透出渐变
## [0.4.0] - 2026-11-22

> 控制台改成「玻璃外壳 + 内窗口」：外壳 0.76，内层 0.88

### Changed

- 外观: 控制台外壳不透明度降到 0.76（深色 0.78），内容改由内缩 12px 的内窗口承载
- 外观: 内窗口 0.88、圆角 12px、带内侧顶部高光；标签栏和内容都在内窗口里
## [0.3.9] - 2026-11-22

> 微交互补齐：按下反馈、键盘焦点环、行内操作淡入、尊重减弱动效

### Changed

- 外观: 按钮按下加深并轻微缩放，行内操作按钮悬停该行才淡入
- 外观: 焦点环只在键盘导航时出现；图标按钮悬停图标提亮到 100%
- 外观: 滚动条变细，悬停时滑块加深

### Fixed

- 外观: 系统开启「减弱动效」时，所有过渡和动画停用
## [0.3.8] - 2026-11-22

> 卡片和标签加质感：内侧高光、内分隔线、低饱和徽标、折叠动效

### Changed

- 外观: 卡片加 1px 内侧顶部高光，卡片内分区改用 1px 内分隔线
- 外观: 徽标改小圆角 + 低饱和底色，空状态图标改圆角方块底
- 外观: 折叠展开用高度 + 透明度过渡（200ms），切标签时卡片淡入（150ms）
## [0.3.7] - 2026-11-22

> 悬停高亮的幅度对齐到规格：提亮 4% 掺主题色，主按钮加深 6%

### Fixed

- 外观: 悬停提亮与主按钮加深的数值按规格校正
## [0.3.6] - 2026-11-22

> 性能页把聊天性能提到最前，列表和按钮加了悬停反馈

### Changed

- 性能: 顺序改为聊天性能 → 启动加速 → 安全
- 外观: 列表行与折叠标题悬停提亮、按钮悬停加深，过渡 120ms，不做位移和发光
## [0.3.5] - 2026-11-22

> 设置页收口：大号只留页面标题一档，零散圆角归零，表面掺一点主题色

### Changed

- 外观: 统计值与版本号回到 16px，只有页面标题保留 20px
- 外观: 进度条改胶囊、柱状图改 12px 上圆角，2px 这类零散圆角清零
- 外观: 阴影统一到 .07，表面色掺 3% 主题色，不再用纯灰
## [0.3.4] - 2026-11-22

> 设置页按设计规则重排：间距、字号、圆角、阴影统一，更新日志改回默认展开

### Changed

- 外观: 设置页间距收敛到 4 的倍数、字号三档、圆角三种、阴影一种，卡片去边框
- 关于: 更新日志改回默认展开（最近 3 条 + 展开全部），只有维护中心和功能介绍折叠
## [0.3.3] - 2026-11-22

> 「关于」页的维护中心信息也折叠，进去只剩三行标题

### Changed

- 关于: 维护中心卡片默认收起，头部显示「dsh-concierge · v版本 · MIT」
## [0.3.2] - 2026-11-22

> 「关于」页的更新日志也改成默认折叠

### Changed

- 关于: 更新日志卡片默认收起，头部显示「最近 3 版 · 展开全部 N 版」
## [0.3.1] - 2026-11-22

> 「关于」页的更新日志提示改成和实际行为一致

### Fixed

- 关于: 提示还写着「完整日志见仓库」，但外链已经去掉；顺手清掉重复的语言键
## [0.3.0] - 2026-11-22

> 更新日志在设置页里就地展开，不再跳转 GitHub

### Changed

- 关于: 默认显示最近 3 条摘要，底部「展开全部」在设置页内铺开完整历史
## [0.2.9] - 2026-11-22

> 更新日志改成「一句头条 + 功能域条目」，设置页只显示最近三条

### Changed

- 文档: 更新日志按功能域打头，设置页改成只读摘要

## [0.2.8] - 2026-11-22

> 106 条逐版记录压成 12 条，按类型分组

### Changed

- 文档: 历史版本合并成区间，按 Added / Changed / Fixed / Removed 分组

## [0.2.6 – 0.2.7] - 2026-11-22

> 「关于」页新增可折叠的功能介绍

### Added

- 关于: 功能介绍只列功能，不列设计取舍

## [0.2.4] - 2026-11-22

> 设置页重排成 5 个标签

### Changed

- 更新: 更新页只列有更新的行
- 插件: 全量列表放在维护卡片之前
- 外观: 打字机三项并入外观
- 性能: 安全开关移到性能页顶部

### Fixed

- 关于: 版本号不再冻结在首次挂载

## [0.2.0 – 0.2.1] - 2026-11-22

> 删掉没有消费者的开关

### Removed

- 性能: 玻璃自动降级
- 外观: 「关掉浮层模糊」
- 插件: 未使用的 `data-dsh-stream` 与 `data-dsh-glass-wall`

## [0.1.83 – 0.1.99] - 2026-11-21

> 浮层防透专项：白块和重影全部修掉

### Fixed

- 外观: 设置面板与浮层重影
- 外观: 状态栏白带、用量徽标、滚动条、代码块
- 外观: tooltip 白字压在浅色底上不可读

## [0.1.77 – 0.1.82] - 2026-11-21

> 预模糊层替代 backdrop-filter，色温统一

### Changed

- 性能: 会话区改用预模糊层，静态元素只栅格化一次
- 外观: 统一色温 `--dsh-tint-rgb`

### Fixed

- 外观: 会话区被壁纸青段染成薄荷绿、侧边栏偏紫蓝
- 外观: 说明文字与未选中菜单项对比度不足

## [0.1.61 – 0.1.76] - 2026-11-21

> 帧率攻坚：流式 90 → 117

### Added

- 外观: 原生材质皮肤（DWM Acrylic，需给 app.asar 打补丁）

### Changed

- 性能: 会话区改为不透明，恢复合成器的遮挡剔除
- 性能: 颗粒并进壁纸层，不再单独占全屏图层

### Fixed

- 性能: 流式输出期间掉帧
- 性能: 每秒写 dataset 导致的整页样式失效

## [0.1.48 – 0.1.60] - 2026-11-21

> 玻璃皮肤首版

### Added

- 外观: 玻璃皮肤、透明度滑杆、颗粒滑杆
- 外观: 窗口直角（DWM）

### Changed

- 外观: 壁纸换成冷调低饱和，侧边栏与顶部磨砂带对齐

## [0.1.31 – 0.1.47] - 2026-11-21

> 外观接入官方主题 API

### Added

- 外观: 三套内置皮肤、品牌色、字号、代码字体
- 关于: 维护中心自有排版（竖向导航 + 内容区）

## [0.1.15 – 0.1.30] - 2026-11-21

> 启动与安全

### Added

- 更新: 安全模式与自动恢复、自检修复

### Fixed

- 更新: 重启后窗口不出来、聊天框不出来

## [0.1.10 – 0.1.14] - 2026-11-21

> 性能开关

### Added

- 性能: 侧边栏收起优化、收起不做动画、屏幕外行跳过

## [0.1.0 – 0.1.9] - 2026-11-20

> 首个可用版本

### Added

- 更新: 应用与插件更新检查
- 插件: 一键全部更新、长对话精简
- 关于: 「关于」页
- 性能: 启动加速（Defender 排除项）
