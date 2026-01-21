# Script para iniciar o backend (versão funcional)
# Usa o código compilado que está funcionando

Write-Host "🚀 Iniciando Backend DCTF (Modo Compilado)" -ForegroundColor Cyan
Write-Host ""

# Verificar se já está rodando
$porta = netstat -ano | findstr ":3000"
if ($porta) {
    Write-Host "⚠️  Backend já está rodando na porta 3000!" -ForegroundColor Yellow
    Write-Host "   Para parar, use: Get-Process -Name node | Stop-Process -Force" -ForegroundColor Gray
    exit 0
}

# Compilar se necessário
if (-not (Test-Path "dist/index.js")) {
    Write-Host "🔨 Compilando código TypeScript..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro na compilação!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Compilação concluída" -ForegroundColor Green
    Write-Host ""
}

# Iniciar servidor
Write-Host "🚀 Iniciando servidor..." -ForegroundColor Cyan
Write-Host "   Backend estará disponível em: http://localhost:3000" -ForegroundColor Gray
Write-Host "   Health check: http://localhost:3000/health" -ForegroundColor Gray
Write-Host "   Use Ctrl+C para parar" -ForegroundColor Gray
Write-Host ""

$env:NODE_ENV = "development"
node dist/index.js





