# Script para iniciar o ambiente de desenvolvimento limpo

Write-Host "🧹 Limpando caches..." -ForegroundColor Yellow

# Parar processos Node existentes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Limpar caches
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".ts-node" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend\dist" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend\node_modules\.vite" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend\.vite" -ErrorAction SilentlyContinue

Write-Host "✅ Cache limpo!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verificando arquivos fonte..." -ForegroundColor Cyan

$arquivos = @(
    "src\index.ts",
    "frontend\src\components\Layout\Sidebar.tsx",
    "frontend\src\pages\Home.tsx",
    "frontend\src\pages\SituacaoFiscal.tsx",
    "frontend\src\router\index.tsx"
)

foreach ($arquivo in $arquivos) {
    if (Test-Path $arquivo) {
        Write-Host "  ✅ $arquivo" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $arquivo NÃO ENCONTRADO!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🚀 Iniciando servidores..." -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  IMPORTANTE:" -ForegroundColor Yellow
Write-Host "   1. Execute 'npm run dev' no diretório raiz para o BACKEND" -ForegroundColor White
Write-Host "   2. Execute 'cd frontend && npm run dev' para o FRONTEND" -ForegroundColor White
Write-Host "   3. Acesse http://localhost:5173 no navegador" -ForegroundColor White
Write-Host "   4. Use Ctrl+Shift+R para forçar atualização do cache do navegador" -ForegroundColor White
Write-Host ""




