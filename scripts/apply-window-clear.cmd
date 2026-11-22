@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

set "EXE=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 (
  echo.
  echo DSH 还在运行。请先完全退出：窗口关掉之后，托盘图标也要右键退出。
  echo 然后再双击本文件。
  echo.
  pause
  exit /b 1
)

echo 正在生成并应用窗口透明补丁……
node scripts\patch-window-clear.mjs
if errorlevel 1 (
  echo 生成失败，上面的信息就是原因。
  pause
  exit /b 1
)

node scripts\patch-window-clear.mjs --apply
if errorlevel 1 (
  echo 应用失败，上面的信息就是原因。
  pause
  exit /b 1
)

echo.
echo 已应用，正在启动 DSH，并观察 25 秒……
start "" "%EXE%"
timeout /t 25 /nobreak >nul

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if errorlevel 1 (
  echo.
  echo DSH 没起来，正在自动还原……
  node scripts\patch-window-clear.mjs --revert
  echo 已还原。再启动一次应该就正常了。
  start "" "%EXE%"
  echo.
  echo 结论：这个补丁在当前版本会让启动失败，先别用了。
  pause
  exit /b 1
)

echo.
echo DSH 起来了。看看留边那圈是不是变成桌面壁纸的模糊了。
echo 如果不是，双击 scripts\patch-window-clear.cmd 里的 --revert 可以还原：
echo   node scripts\patch-window-clear.mjs --revert
pause
exit /b 0
