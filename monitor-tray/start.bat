@echo off
echo ========================================
echo   DCTF MPC Monitor - Iniciando...
echo ========================================
echo.

REM Verificar se node_modules existe
if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install
    echo.
)

REM Iniciar aplicativo
echo Iniciando monitor...
call npm start

pause






