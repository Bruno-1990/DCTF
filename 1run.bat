@echo off
rem Garante que o CMD comece na pasta onde está o .bat
cd /d "%~dp0"

rem 1ª janela: projeto raiz
start "DEV ROOT" cmd /k "npm run dev"

rem 2ª janela: pasta frontend
start "DEV FRONTEND" cmd /k "cd frontend && npm run dev"
