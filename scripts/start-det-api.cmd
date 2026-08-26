@echo off
REM ==========================================================================
REM Sobe a API do DCTF (porta 38572) se ainda nao estiver rodando.
REM Usado pela Tarefa Agendada "DCTF-DET-API" no logon de CENTRAL\bruno, para a
REM coleta automatica do DET (seg-sex 06:00) ter a API de pe.
REM
REM Roda na sessao do bruno de proposito: o login por certificado A1 depende do
REM repositorio do usuario (Cert:\CurrentUser\My) e da politica no HKCU, que uma
REM tarefa como SYSTEM nao enxergaria.
REM
REM Idempotente: se a porta ja esta escutando, sai sem subir uma 2a instancia.
REM ==========================================================================

cd /d "D:\aplicativos\DCTF WEB\DCTF_MPC"

netstat -ano | findstr ":38572" | findstr LISTENING > NUL
if %errorlevel%==0 (
  echo API ja rodando na porta 38572 - nada a fazer.
  exit /b 0
)

echo Subindo a API...
start "DCTF-API" /min cmd /c "npm run dev"
exit /b 0
