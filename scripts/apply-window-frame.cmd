@echo off
chcp 65001 >nul
cd /d "%~dp0.."

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 goto running

echo 正在生成并应用「去掉 11px 缩放边框」补丁...
node scripts\patch-window-frame.mjs
if errorlevel 1 goto failed

node scripts\patch-window-frame.mjs --apply
if errorlevel 1 goto failed

echo 已应用，正在启动 DSH，并观察 25 秒...
start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
timeout /t 25 /nobreak >nul

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if errorlevel 1 goto crashed

echo.
echo DSH 起来了。窗口边缘那圈 11px 应该没了，代价是不能拖边改大小。
echo 要还原的话，运行下面这行：
echo    node scripts\patch-window-frame.mjs --revert
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
node scripts\patch-window-frame.mjs --revert
echo 已还原，重新启动 DSH...
start "" "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
echo.
echo 结论：这个补丁在当前版本会让启动失败，先别用了。
pause
exit /b 1