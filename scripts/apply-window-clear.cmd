@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 (
  echo.
  echo DSH 还在运行。请先完全退出：窗口关掉之后，托盘图标也要右键退出。
  echo 然后再双击本文件。
  echo.
  pause
  exit /b 1
)

echo 正在应用窗口透明补丁……
node scripts\patch-window-clear.mjs --apply
if errorlevel 1 (
  echo.
  echo 应用失败，上面的信息就是原因。
  pause
  exit /b 1
)

echo.
echo 已应用。正在启动 DSH……
start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
exit /b 0
