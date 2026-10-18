@echo off
chcp 65001 >nul
title PREDIC
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js 20 ou superior: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias... & call npm install --omit=dev || (pause & exit /b 1))
if not exist .env (copy .env.example .env >nul & echo Arquivo .env criado. Coloque sua ANTHROPIC_API_KEY nele para ativar a IA.)
start "" http://localhost:8787
node server\server.mjs
pause
