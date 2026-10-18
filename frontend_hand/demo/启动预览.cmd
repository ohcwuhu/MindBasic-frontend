@echo off
chcp 65001 >nul
title 斐思同行 · 前后端联调
cd /d "%~dp0.."
where npm >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js，再重新启动。
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call npm install
  if errorlevel 1 exit /b 1
)
echo 正在启动 http://127.0.0.1:5178/ ，后端需在 8000 端口运行。
call npm run dev -- --open /index.html
pause
