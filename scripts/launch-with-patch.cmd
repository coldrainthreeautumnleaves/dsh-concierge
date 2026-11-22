@echo off
rem 启动 DSH：
rem   1) 先确认窗口补丁还在（应用更新会覆盖 app.asar，补丁随之失效）；
rem   2) 再把下面的 FLAGS 传给主程序——GPU/合成层的开关走命令行就行，不用改 asar。
rem
rem 测试开关时只改 FLAGS 这一行，一次只留一个，方便定位是哪个起作用。
setlocal
set "HERE=%~dp0"
set "APP=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"

rem 当前测试：第 1 个开关（缓解 resize 白闪，代价最小）
set "FLAGS=--enable-features=windows11-mica-titlebar"
rem 第 2 个开关（消白闪但帧率会掉，测完记得改回来）：
rem set "FLAGS=--use-angle=d3d9"
rem 第 3 个（更彻底，整体合成变慢）：
rem set "FLAGS=--disable-gpu-compositing"
rem 都不加（恢复原状）：
rem set "FLAGS="

where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 node，跳过补丁检查，直接启动。
  goto launch
)

node "%HERE%patch-window-fallback.mjs" --color "#ccd8ee" --check >nul 2>nul
if errorlevel 1 (
  echo 补丁不在或已过期，正在重打……
  node "%HERE%patch-window-fallback.mjs" --color "#ccd8ee"
  if errorlevel 1 echo 补丁失败（应用可能还在运行），这次先直接启动。
)

:launch
echo 启动参数：%FLAGS%
start "" "%APP%" %FLAGS%
