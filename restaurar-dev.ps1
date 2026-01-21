# Script para restaurar ambiente de desenvolvimento
# Use este script se você executou o deploy de produção e precisa voltar para desenvolvimento

Write-Host "🔄 Restaurando ambiente de DESENVOLVIMENTO..." -ForegroundColor Cyan
Write-Host ""

# Verificar se .env.development existe
if (-not (Test-Path ".env.development")) {
    Write-Host "❌ Arquivo .env.development não encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Soluções:" -ForegroundColor Yellow
    Write-Host "   1. Execute: .\scripts\setup-env.ps1" -ForegroundColor White
    Write-Host "   2. Ou copie manualmente .env.example para .env.development" -ForegroundColor White
    exit 1
}

# Fazer backup do .env atual
if (Test-Path ".env") {
    $backupName = ".env.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item ".env" $backupName
    Write-Host "📦 Backup do .env atual criado: $backupName" -ForegroundColor Gray
}

# Copiar .env.development para .env
Write-Host "📋 Copiando .env.development para .env..." -ForegroundColor Yellow
Copy-Item ".env.development" ".env" -Force
Write-Host "✅ Arquivo .env restaurado para desenvolvimento" -ForegroundColor Green

# Restaurar frontend/.env também
if (Test-Path "frontend/.env.development") {
    if (Test-Path "frontend/.env") {
        $frontendBackup = "frontend/.env.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item "frontend/.env" $frontendBackup
        Write-Host "📦 Backup do frontend/.env criado: $frontendBackup" -ForegroundColor Gray
    }
    Write-Host "📋 Copiando frontend/.env.development para frontend/.env..." -ForegroundColor Yellow
    Copy-Item "frontend/.env.development" "frontend/.env" -Force
    Write-Host "✅ Arquivo frontend/.env restaurado" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Ambiente de desenvolvimento restaurado!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o backend:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Para iniciar o frontend:" -ForegroundColor Cyan
Write-Host "  cd frontend && npm run dev" -ForegroundColor White
Write-Host ""





