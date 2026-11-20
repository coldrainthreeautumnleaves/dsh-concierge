# 密钥与安全模式

这份文档讲两件事：**GitHub Token 怎么申请、插件从哪里读**，以及**插件把应用搞崩时怎么进安全模式**。

---

## 一、GitHub Token

### 为什么要配

维护中心要查 GitHub 上的插件版本（releases / tags / commits）、读仓库 README 生成安装步骤、检测你添加的 GitHub 来源。GitHub 对 API 请求有限流：

| 身份 | 上限 |
|---|---|
| 匿名（不带 token） | 60 次/小时，按 IP 算 |
| 带 token | 5,000 次/小时，按账号算 |

不配也能用，只是几条来源加几次刷新就可能把匿名额度用完，界面会提示「GitHub 速率限制」。

### 两种 token 怎么申请

GitHub 现在有两种个人访问令牌，**任选一种**，只读公开仓库就够。

#### 方式一：细粒度 token（推荐）

1. 打开 <https://github.com/settings/personal-access-tokens/new>
2. **Token name**：随便填，例如 `dsh-concierge`
3. **Expiration**：选有效期（30 天 / 90 天 / 自定义）
4. **Repository access**：选 **Public repositories (read-only)**
5. **Permissions**：一个都不用勾（读公开仓库的 releases/tags 是默认能力）
6. 点 **Generate token**，复制生成的 `github_pat_…`

#### 方式二：经典 token

1. 打开 <https://github.com/settings/tokens>
2. **Generate new token (classic)**
3. **Note**：随便填；**Expiration**：选有效期
4. **Scopes**：一个都不勾
5. 点 **Generate token**，复制生成的 `ghp_…`

> 两种 token 生成后**只显示一次**，关掉页面就看不到了，记得当场复制。

### 插件从哪里读

按这个顺序，前一个存在就用前一个：

| 顺序 | 来源 | 读取时机 |
|---|---|---|
| 1 | 环境变量 `GITHUB_TOKEN` | 每次请求时读，改了要重启应用 |
| 2 | 环境变量 `GH_TOKEN` | 同上 |
| 3 | `~/.dsh/update-center/settings.json` 里的 `githubToken` | 启动时读一次；页面保存后立即生效，不用重启 |

页面里填的写进第 3 项。如果同时设了环境变量，页面会提示「已从环境变量读取，这里的输入会被覆盖」。

### 怎么填

设置 → 维护中心 → **更新** → **GitHub Token** → 粘贴 → 保存。已配置时会显示掩码（例如 `ghp_…7890`），旁边有「清除」。

### 额度用完了怎么办

- 等一小时（额度按小时滚动）；
- 或者配 token；
- 或者减少 GitHub 来源、少点「检查更新」。

---

## 二、安全模式

### 什么时候用

某个插件损坏（更新后不兼容、代码有 bug）导致应用**起不来**时。这种情况下插件自己也没机会运行，所以维护中心会在启动时把恢复脚本写到 `~/.dsh/update-center/`，用脚本在**应用外面**先把坏的第三方插件停掉，再启动。

### 三个脚本

| 脚本 | 作用 |
|---|---|
| `safe-launch.cmd` | **自动版**：启动应用 → 观察 30 秒 → 进程没活下来就判定启动失败 → 备份配置、只留官方插件（`@deepseek-ai/*`）→ 重启进安全模式 |
| `safe-mode.cmd` | **手动版**：直接备份配置、只留官方插件、启动应用 |
| `restore-mode.cmd` | 恢复：把 `safe-backup/` 里的 `package.json` 和 `cordis.patch.yml` 拷回去，然后重启 |

安全模式做的事很简单：把 profile 的 `dsh.profile.bundles` 过滤成只剩官方插件。第三方插件（包括维护中心自己）临时不加载。

### 怎么用自动版

把桌面快捷方式的「目标」从应用 exe 改成：

```
C:\Users\<你>\.dsh\update-center\safe-launch.cmd
```

之后每次双击快捷方式启动，都会自动检测：启动失败就落到安全模式，正常启动什么都不做。

> 副作用：每次启动会多一个命令行窗口，观察 30 秒后自动消失。

### 恢复

确认应用能正常启动后，**先完全退出应用**，再双击 `restore-mode.cmd`。它会恢复原来的插件配置并重新启动。

想手动恢复也可以：把 `~/.dsh/update-center/safe-backup/` 里的两个文件拷回 `~/.dsh/profiles/desktop/`。

### 注意事项

- 所有脚本都要求应用**已完全退出**，否则会提示先退出；
- 不需要管理员权限；
- `.ps1` 带 UTF-8 BOM，Windows PowerShell 5.1 读中文不会乱码；
- 恢复用的备份只有一份，每次进安全模式会覆盖上一次的备份——如果你在安全模式下又手动改过配置，恢复前先自己再备份一次。

---

## 常见问题

**Q：填了 token 还是提示速率限制？**
先看页面提示是不是「已从环境变量读取」——如果是，环境变量里的 token 优先，页面里填的无效。也可能是 token 过期或权限不够，重新生成一个。

**Q：安全模式启动了，但插件列表全没了？**
这是预期行为：安全模式只加载官方插件。双击 `restore-mode.cmd` 恢复。

**Q：`safe-launch.cmd` 每次都要等 30 秒窗口？**
窗口只是观察期，应用本身已经启动，可以正常使用，30 秒后窗口自动关。

**Q：能把安全模式做成开机自动检测吗？**
可以，但需要常驻进程或计划任务，维护中心没有这么做——它只在启动时写脚本，不常驻。
