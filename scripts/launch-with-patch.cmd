@echo off
rem 启动 DSH 前先确认窗口补丁还在（应用更新会覆盖 app.asar，补丁随之失效）。
rem 补丁脚本是幂等的：已经打过就什么都不做，应用版本变了会自动重建备份再重打。
rem
rem 用法：把桌面/任务栏的快捷方式指向本文件即可。应用更新后照常点它。
setlocal
set "HERE=%~dp0"
set "APP=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"

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
start "" "%APP%"
