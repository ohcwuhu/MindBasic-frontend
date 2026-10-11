@echo off
chcp 65001 >nul
title 斐思同行 · 手绘风前端预览
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没找到 python 命令。两条路：
  echo   1^) 装一个 Python 3 并勾选 Add to PATH，再双击本文件；
  echo   2^) 直接用浏览器打开本目录下的 index.html —— 十六个页面都能看，
  echo      只有「自我教练」那页的 3D 角色会因为浏览器限制停在静帧。
  echo.
  pause
  exit /b 1
)

echo 正在启动本地预览服务 http://127.0.0.1:5178/ ...
echo 这个黑窗口不要关，关了预览就停了。
echo.
start "斐思同行-预览服务" /min python -m http.server 5178 --bind 127.0.0.1
timeout /t 2 >nul
start "" http://127.0.0.1:5178/index.html
echo 浏览器已经打开。关掉上面那个最小化的 python 窗口即可停止服务。
pause
