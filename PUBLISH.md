# 上架流程

## 0. 准备

这个目录已经是一个可以直接推的包：

- `package.json` 已去掉 `private`，补齐 `license` / `keywords` / `engines` / `repository`；
- `README.md`、`LICENSE`、`.gitignore` 已就位；
- `awesome-entry.yml` 是提交到 awesome-dsh-plugin 的条目模板。

把 `package.json` 和 `awesome-entry.yml` 里的 `<owner>` 换成你的 GitHub 账号。

## 1. 建公开仓库

在 GitHub 新建仓库 `dsh-concierge`（公开）。

**注意**：如果这个目录位于另一个 git 仓库里面，直接在原地 `git init` 会变成嵌套仓库。两种干净的做法：

**做法 A（推荐，复制出去）**

```sh
# 复制到一个不在任何仓库里的位置
robocopy "<插件目录>" "<新目录>" /E
cd <新目录>
git init
git add .
git commit -m "dsh-concierge 0.1.0"
git branch -M main
git remote add origin https://github.com/<owner>/dsh-concierge.git
git push -u origin main
```

**做法 B（不复制，用父仓库的 subtree 推）**

```sh
cd <父仓库>
git add <插件目录>
git commit -m "dsh-concierge: 准备上架"
git subtree push --prefix=<插件目录> origin main
```

给仓库加 topic：`dsh-plugin`。

> 仓库创建满 1 天后提交才会过 CI 的年龄检查。

## 2. 提交到精选列表

市场（侧边栏「插件市场」）的条目来自 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

1. Fork 该仓库；
2. 新建 `data/plugins/<owner>__dsh-concierge.yml`，内容照抄 `awesome-entry.yml`；
3. 提 PR（一个 PR 最多 3 条）。

CI 会检查条目格式、`dsh.bundle` 声明、仓库年龄；维护者会读一遍代码再合并，通常一天内出现在市场里。

## 3. 官方「发现」标签

官方发现页读的是 format-1 插件索引，没有提交入口。等你进了 awesome-dsh-plugin，同一份列表也会出现在 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`——用户在「索引源」里加这个地址就能搜到你。

## 4. npm（可选）

不发 npm 也完全能上架：本插件没有构建脚本，从 GitHub 源码安装不会触发 `allowBuilds` 授权。

想发 npm 的话，先确认包名没被占用；被占了就改成 scope（`@你的账号/dsh-concierge`，同时改 `package.json` 的 name，插件标识会跟着变）或换名。

## 5. 检查清单

- [ ] `package.json` 有 `dsh.bundle.patch`（客户端部分有 `dsh.client`）
- [ ] 仓库公开、有 `dsh-plugin` topic、创建满 1 天
- [ ] `README.md` 写清楚安装方式和功能
- [ ] `awesome-entry.yml` 里的 `url` 与仓库地址完全一致
- [ ] 没有把本地路径、密钥、日志、运行时数据提交进去
