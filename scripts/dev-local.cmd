@echo off
setlocal

cd /d "%~dp0.."

if not exist "node_modules\vite\bin\vite.js" (
  echo Missing dependencies. Please run npm install or pnpm install first.
  exit /b 1
)

node "node_modules\vite\bin\vite.js" --host 127.0.0.1
