@echo off
setlocal
rem 用法：watch-dramas.cmd --output "D:\已达标" --threshold 10000 "D:\下载" "E:\新剧"
rem 需要 Node.js 22.12 或更新的 22.x 版本，并已在本目录运行 npm run build。
node "%~dp0dist\watch-dramas.js" %*
endlocal
