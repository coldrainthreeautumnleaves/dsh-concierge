# 06 窗口外框直角（DWM）

Status: ready-for-agent

## 背景

Windows 11 给顶层窗口画圆角，玻璃皮肤铺满壁纸之后，外框那圈圆角把内容切掉一块。
`BrowserWindow` 的 `roundedCorners` 构造参数插件拿不到（窗口在插件加载前就建好了），
但 **DWM 的圆角偏好可以在运行时改**——dsh-win11-material 的 README 也写明：插件跑在
Host 进程里，可以调 Win32/DWM，只是动不了构造参数。

## 做法

- 宿主 `index.js` 加 `POST /dsh-concierge/window-corners`，body `{ square: boolean }`；
  用 PowerShell 调 `DwmSetWindowAttribute(hwnd, 33, DWMWCP_DONOTROUND(1) | DWMWCP_ROUND(2), 4)`，
  按 `Get-Process 'DeepSeek Harness' | MainWindowHandle` 找主窗口。
- 客户端 `look.squareWindow`（默认开），外观卡片里加「窗口直角」开关；`applyLook` 时
  按需调用（只在值变化时发一次，失败下次重试）。
- 宿主代码改动需要重启应用才生效；客户端部分刷新即可。

## 验证

- 直接对运行中的窗口调用 `DwmSetWindowAttribute(…, 33, 1, 4)` 返回 `hr=0`，截图确认
  左上角从圆角变成直角。
- 把 `index.js` 里的脚本原样抽出来跑：`{"ok":true,"output":"hr=0"}`。
- `node --check index.js` / `node --check client.js` 通过。

## Comments

- 2026-11-21：0.1.60 发版。宿主路由要重启应用后才有；重启后开关应立即可用。
