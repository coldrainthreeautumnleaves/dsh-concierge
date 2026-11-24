@echo off
chcp 65001 >nul
cd /d "%~dp0.."

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 goto running

echo 正在生成并应用「窗口不透明」补丁...
node scripts\patch-window-opaque.mjs
if errorlevel 1 goto failed

node scripts\patch-window-opaque.mjs --apply
if errorlevel 1 goto failed

echo 已应用，正在启动 DSH，并观察 25 秒...
start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
timeout /t 25 /nobreak >nul

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if errorlevel 1 goto crashed

echo.
echo DSH 起来了。窗口背景现在是不透明的浅色画布，
echo 系统那层亚克力模糊被盖住，只剩网页这一层。
echo 要还原的话，运行下面这行：
echo    node scripts\patch-window-opaque.mjs --revert
pause
exit /b 0

:running
echo.
echo DSH 还在运行。请先完全退出：窗口关掉之后，托盘图标也要右键退出。
echo 然后再双击本文件。
echo.
pause
exit /b 1

:failed
echo.
echo 补丁没应用成功，上面就是原因。
pause
exit /b 1

:crashed
echo.
echo DSH 没起来，正在自动还原...
node scripts\patch-window-opaque.mjs --revert
echo 已还原，重新启动 DSH...
start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
echo.
echo 结论：这个补丁在当前版本会让启动失败，先别用了。
pause
exit /b 1