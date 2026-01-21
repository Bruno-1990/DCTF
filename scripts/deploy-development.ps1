# ============================================
# Script de Deploy para Desenvolvimento (PowerShell)
# ============================================
# Este script prepara e inicia o ambiente de desenvolvimento no Windows

Write-Host "🚀 Iniciando deploy para DESENVOLVIMENTO..." -ForegroundColor Cyan

# Verificar se estamos no diretório raiz
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Copiar arquivo .env.development para .env se não existir
if (-not (Test-Path ".env")) {
    Write-Host "📋 Copiando .env.development para .env..." -ForegroundColor Yellow
    Copy-Item ".env.development" ".env"
    Write-Host "✅ Arquivo .env criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  Arquivo .env já existe. Não será sobrescrito." -ForegroundColor Yellow
}

# Copiar arquivo frontend/.env.development para frontend/.env se não existir
if (-not (Test-Path "frontend/.env")) {
    Write-Host "📋 Copiando frontend/.env.development para frontend/.env..." -ForegroundColor Yellow
    Copy-Item "frontend/.env.development" "frontend/.env"
    Write-Host "✅ Arquivo frontend/.env criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  Arquivo frontend/.env já existe. Não será sobrescrito." -ForegroundColor Yellow
}

# Instalar dependências do backend
Write-Host "📦 Instalando dependências do backend..." -ForegroundColor Yellow
npm install

# Instalar dependências do frontend
Write-Host "📦 Instalando dependências do frontend..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

# Verificar conexão com banco de dados
Write-Host "🔍 Verificando conexão com banco de dados..." -ForegroundColor Yellow
npm run test:mysql-connection
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Não foi possível conectar ao banco. Verifique as configurações." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Ambiente de desenvolvimento configurado!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar os serviços:"
Write-Host "  Backend:  npm run dev"
Write-Host "  Frontend: cd frontend && npm run dev"
Write-Host ""
Write-Host "Ou use o script: .\1run.bat"
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

