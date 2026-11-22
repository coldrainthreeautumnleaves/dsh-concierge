# 参与开发

## 提交信息

用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 的格式：

```
<类型>(<范围>): <一句话描述>
```

| 类型 | 进更新日志 | 说明 |
| --- | --- | --- |
| `feat` | ✅ Added | 新功能 |
| `fix` | ✅ Fixed | 修 bug |
| `perf` | ✅ Changed | 性能改进，用户能感觉到 |
| `refactor` | ❌ | 重构，行为不变 |
| `style` | ❌ | 格式、空白、分号 |
| `docs` | ❌ | 文档 |
| `test` | ❌ | 测试 |
| `build` | ❌ | 构建、依赖 |
| `ci` | ❌ | CI 配置 |
| `chore` | ❌ | 杂项 |

`BREAKING CHANGE` 写在提交正文里，或类型后加 `!`。

**更新日志只记人关心的事**：新功能、行为变化、修了什么 bug、删了什么。探针迭代、CSS 微调、更新日志自身的改版都不进——它们在 git 历史里。

## 版本号

每段只到 `x.y.9`，然后进下一位：0.2.0 → … → 0.2.9 → 0.3.0。不使用三位 patch。

- `fix` / `perf` → 最后一位 +1
- `feat` → 最后一位 +1（到 9 进位到下一个次版本）
- 只有 `docs` / `chore` / `style` / `test` / `ci` 的提交**不发版**，也不写更新日志

## 更新日志

格式按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，写法向 VS Code / Raycast / Linear 看齐：

- 顶部 `## [Unreleased]` 攒没发版的改动；
- 每版一条 `## [x.y.z] - YYYY-MM-DD`，紧跟一句 `> 头条`——一句话说清这版最值得知道的事；
- 分组固定为 `Added` / `Changed` / `Fixed` / `Removed`，空组不写；
- **每条以功能域打头**：`更新:` `插件:` `外观:` `性能:` `关于:` `文档:`，人能直接跳到关心的部分；
- 一版通常 1–3 条；
- 设置页只显示最近 3 条的「版本 + 日期 + 头条」，完整历史看仓库里的 `CHANGELOG.md`。

## 发布

1. 改 `package.json` 的版本号；
2. 在 `CHANGELOG.md` 顶部加一节；
3. 提交并推送；
4. 打 tag、在 GitHub 上发 Release（分类由 `.github/release.yml` 按 PR 标签自动生成）。
