# dsh-concierge

DeepSeek Harness 的维护中心：更新应用与插件，顺便盯着聊天性能。

设置 → 维护中心，分四个标签页：**更新**、**插件**、**性能**、**打字机**。

## 功能

### 更新

- **应用本体**：读取桌面版 `resources/app-update.yml` 声明的更新源，与已装版本比较；只有桌面端自己报告有更新时才提供更新入口，走的是桌面壳原生更新流程。
- **插件**：npm 插件查镜像与插件管理器，GitHub 插件查 releases（没有 release 时退回 tags），本地插件看源目录版本或文件指纹。
- **一键更新 / 全部更新 / 自动更新**：更新完成后顶部弹窗提示「刷新界面」或「重启应用」。
- **回退**：npm 插件可回退到镜像上任意历史版本，GitHub 插件可回退到任意 tag；失败自动装回原版本。

### 插件

- **GitHub 来源**：添加任意多个仓库，持续检测最新 release；未装的可以一键安装，已装的可以重新安装，安装时把 HEAD 固定成完整 commit，之后才能被更新检测和回退识别。
- **从 Git 安装**：填 `owner/repo` 或完整 GitHub 地址即可。
- **安装步骤**：读仓库 README 的「快速开始 / 安装」章节，把分步骤安装的插件（装完要重启、去设置里配置、再重启）列成清单，附带「重启应用」按钮。
- **启用 / 禁用**：直接调插件管理器的启停接口。
- **打开插件目录 / 打开配置**：直接定位到 profile 的 `node_modules` 和 `cordis.patch.yml`。
- **失败插件提示**：上次启动时加载失败被自动禁用的插件会在页面顶部提示，可一键全部启用。

### 性能

- 帧率（5 秒平均，上限跟随屏幕刷新率，可手动指定）、消息行数、最近 10 秒长任务次数与累计阻塞、最近 80 秒长任务条形历史与峰值。
- **自动降级**：帧率低于刷新率 75% 时关掉聊天区动画、模糊和阴影，恢复到 90% 以上再打开。
- **长对话精简**、**强制精简**、**屏幕外行跳过**（按真实高度给聊天流每一行加 `content-visibility`，只在超过 40 行时启用，空闲时扫描）。

### 打字机

- 流式输出的文字逐字显示，思考、工具调用、图片保持原生；速度可调（10–240 字/秒），低帧率时自动让位。

## 安装

在 DSH 里打开 **插件 → 安装插件**，填入：

```
github:coldrainthreeautumnleaves/dsh-concierge
```

或者命令行：

```sh
dsh plugin --profile <profile> add github:coldrainthreeautumnleaves/dsh-concierge
```

安装后重启 DSH（Host 部分需要重启，客户端部分刷新页面即可）。

> 密钥怎么申请、安全模式怎么用，见 [docs/GUIDE.zh.md](docs/GUIDE.zh.md)。

## 安全模式

如果某个插件损坏、应用起不来，插件自己也没机会运行——所以启动时它会把脚本写到 `~/.dsh/update-center/`：

- `safe-launch.cmd`：**自动版**，启动后观察 30 秒，崩溃就自动切安全模式重启；把桌面快捷方式指向它即可；
- `safe-mode.cmd`：手动版，双击后备份配置 → 只加载官方插件启动；
- `restore-mode.cmd`：恢复配置并重启。

脚本都要求应用已退出，不需要管理员权限。

## GitHub Token

更新页可以填一个 GitHub token：不带时 GitHub API 每小时 60 次（按 IP），带了是 5000 次（按账号）。存在 `~/.dsh/update-center/settings.json`，只读公开仓库的 token 就够；环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 优先。

## 要求

- DSH 0.2.1 及以上（`engines.dsh`）
- Node.js 22 及以上

## 开发

```sh
# 本地链接安装
dsh plugin --profile <profile> add link:<本仓库绝对路径>
```

改 `index.js` 后需要重启 DSH；改 `client.js` 后刷新页面。

## 许可

MIT
