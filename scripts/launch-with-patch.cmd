@echo off
rem 启动 DSH，并可选地带上 GPU/合成层/默认底色的开关。
rem
rem   launch-with-patch.cmd        → 不带任何开关（原样）
rem   launch-with-patch.cmd 1      → --enable-features=windows11-mica-titlebar
rem   launch-with-patch.cmd 2      → --use-angle=d3d9               （消白闪，帧率会掉）
rem   launch-with-patch.cmd 3      → --disable-gpu-compositing       （软件合成，整体变慢）
rem   launch-with-patch.cmd 4      → --disable-direct-composition    （绕开 DirectComposition）
rem   launch-with-patch.cmd 5      → --default-background-color=ffccd8ee（内容区同色，AARRGGBB）
rem   launch-with-patch.cmd 6      → --default-background-color=00000000（完全透明）
rem   launch-with-patch.cmd 7      → --disable-frame-rate-limit --disable-gpu-vsync（放开帧率）
rem   launch-with-patch.cmd 8      → --enable-gpu-rasterization --num-raster-threads=4
rem   launch-with-patch.cmd 9      → --disable-gpu（完全软件渲染，最后手段）
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
rem AARRGGBB：alpha 在前。ffccd8ee = 不透明的 #ccd8ee
if "%PICK%"=="5" set "FLAGS=--default-background-color=ffccd8ee"
if "%PICK%"=="6" set "FLAGS=--default-background-color=00000000"
rem 放开帧率限制：让合成器不等垂直同步，尽快提交新帧（代价：可能撕裂、GPU 占用高）
if "%PICK%"=="7" set "FLAGS=--disable-frame-rate-limit --disable-gpu-vsync"
rem 光栅化提速：更多光栅线程 + GPU 光栅
if "%PICK%"=="8" set "FLAGS=--enable-gpu-rasterization --num-raster-threads=4"
rem 彻底关掉 GPU 加速（完全软件渲染，最后手段：不闪但整体会变慢）
if "%PICK%"=="9" set "FLAGS=--disable-gpu"

where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 node，跳过补丁检查，直接启动。
  goto launch
)

node "%HERE%patch-window-fallback.mjs" --ensure

:launch
if "%FLAGS%"=="" (
  echo 启动参数：无
) else (
  echo 启动参数：%FLAGS%
)
start "" "%APP%" %FLAGS%
