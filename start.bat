@echo off
title 复习系统后端服务
echo 正在启动 Python 后端...

:: 在后台启动 Python 服务（不阻塞界面）
start /b python server.py

echo 等待后端初始化...
:: 暂停 2 秒，等服务器跑起来
timeout /t 2 /nobreak > nul

echo 正在打开前端页面...
:: 直接使用默认浏览器打开本地的 html 文件
start index.html

exit