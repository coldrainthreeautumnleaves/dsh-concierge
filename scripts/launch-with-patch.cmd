@echo off
rem 启动 DSH，并可选地带上 GPU/合成层的开关。
rem
rem   launch-with-patch.cmd        → 不带任何开关（原样）
rem   launch-with-patch.cmd 1      → --enable-features=windows11-mica-titlebar
rem   launch-with-patch.cmd 2      → --use-angle=d3d9            （消白闪，帧率会掉）
rem   launch-with-patch.cmd 3      → --disable-gpu-compositing    （软件合成，整体变慢）
rem   launch-with-patch.cmd 4      → --disable-direct-composition （绕开 DirectComposition）
rem
rem 每次只用一个，方便定位是哪个起作用。
setlocal
set "HERE=%~dp0"
set "APP=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"

set "PICK=%~1"
set "FLAGS="
if "%PICK%"=="1" set "FLAGS=--enable-features=windows11-mica-titlebar"
if "%PICK%"=="2" set "FLAGS=--use-angle=d3d9"
if "%PICK%"=="3" set "FLAGS=--disable-gpu-compositing"
if "%PICK%"=="4" set "FLAGS=--disable-direct-composition"

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
if "%FLAGS%"=="" (
  echo 启动参数：无
) else (
  echo 启动参数：%FLAGS%
)
start "" "%APP%" %FLAGS%
