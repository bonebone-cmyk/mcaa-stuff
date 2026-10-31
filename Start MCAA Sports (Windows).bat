@echo off
setlocal
title MCAA Sports
cd /d "%~dp0"
rem ------------------------------------------------------------
rem  MCAA Sports - double-click this file to start the website.
rem  First run downloads Node.js automatically, one time only.
rem ------------------------------------------------------------
set "NODE_VER=v22.12.0"
set "NODE_EXE=node"

where node >nul 2>nul
if errorlevel 1 goto portable
node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" >nul 2>nul
if errorlevel 1 goto portable
goto run

:portable
set "NODE_EXE=%~dp0.node\node.exe"
if exist "%NODE_EXE%" goto run

echo.
echo   First-time setup: downloading Node.js - about 30 MB, only happens once...
echo.
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $ProgressPreference='SilentlyContinue'; $n='node-%NODE_VER%-win-%ARCH%'; if (Test-Path '.node') { Remove-Item '.node' -Recurse -Force }; if (Test-Path '.node-tmp') { Remove-Item '.node-tmp' -Recurse -Force }; Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/%NODE_VER%/' + $n + '.zip') -OutFile 'node.zip'; Expand-Archive -Path 'node.zip' -DestinationPath '.node-tmp' -Force; Move-Item -Path ('.node-tmp\' + $n) -Destination '.node'; Remove-Item 'node.zip'; Remove-Item '.node-tmp' -Recurse -Force"
if errorlevel 1 goto dlfail
if not exist "%NODE_EXE%" goto dlfail

:run
set "OPEN_BROWSER=1"
"%NODE_EXE%" server.js
echo.
echo   MCAA Sports has stopped.
pause
exit /b 0

:dlfail
echo.
echo   Couldn't download Node.js. Check your internet and try again,
echo   or install Node.js from https://nodejs.org and double-click this file again.
pause
exit /b 1
