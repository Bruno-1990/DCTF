# ============================================
# Script de Deploy para Produção (PowerShell)
# ============================================
# Este script prepara e faz o build do ambiente de produção no Windows

Write-Host "🚀 Iniciando deploy para PRODUÇÃO..." -ForegroundColor Cyan

# Verificar se estamos no diretório raiz
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Verificar se o arquivo .env.production existe
if (-not (Test-Path ".env.production")) {
    Write-Host "❌ Erro: Arquivo .env.production não encontrado!" -ForegroundColor Red
    exit 1
}

# Aviso sobre sobrescrever .env
Write-Host "⚠️  ATENÇÃO: Este script irá sobrescrever o arquivo .env atual com as configurações de produção!" -ForegroundColor Yellow
$confirmation = Read-Host "Deseja continuar? (s/N)"
if ($confirmation -ne "s" -and $confirmation -ne "S") {
    Write-Host "Deploy cancelado." -ForegroundColor Yellow
    exit 1
}

# Copiar arquivo .env.production para .env
Write-Host "📋 Copiando .env.production para .env..." -ForegroundColor Yellow
Copy-Item ".env.production" ".env" -Force
Write-Host "✅ Arquivo .env atualizado com configurações de produção" -ForegroundColor Green

# Copiar arquivo frontend/.env.production para frontend/.env
if (-not (Test-Path "frontend/.env.production")) {
    Write-Host "⚠️  Arquivo frontend/.env.production não encontrado. Criando..." -ForegroundColor Yellow
    Copy-Item "frontend/.env.development" "frontend/.env.production"
    Write-Host "⚠️  ATENÇÃO: Atualize frontend/.env.production com a URL de produção do backend!" -ForegroundColor Yellow
}

Write-Host "📋 Copiando frontend/.env.production para frontend/.env..." -ForegroundColor Yellow
Copy-Item "frontend/.env.production" "frontend/.env" -Force
Write-Host "✅ Arquivo frontend/.env atualizado com configurações de produção" -ForegroundColor Green

# Instalar dependências do backend (apenas produção)
Write-Host "📦 Instalando dependências de produção do backend..." -ForegroundColor Yellow
npm ci --omit=dev

# Build do backend
Write-Host "🔨 Compilando backend..." -ForegroundColor Yellow
npm run build

# Instalar dependências do frontend
Write-Host "📦 Instalando dependências do frontend..." -ForegroundColor Yellow
Set-Location frontend
npm ci

# Build do frontend
Write-Host "🔨 Compilando frontend..." -ForegroundColor Yellow
npm run build
Set-Location ..

# Verificar se os builds foram criados
if (-not (Test-Path "dist")) {
    Write-Host "❌ Erro: Build do backend não foi criado!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "frontend/dist")) {
    Write-Host "❌ Erro: Build do frontend não foi criado!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build de produção concluído com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "Artefatos criados:"
Write-Host "  - Backend: ./dist/"
Write-Host "  - Frontend: ./frontend/dist/"
Write-Host ""
Write-Host "Para iniciar em produção:"
Write-Host "  npm start"
Write-Host ""
Write-Host "Ou use Docker:"
Write-Host "  docker build -t dctf-mpc:production ."
Write-Host "  docker run -p 3000:3000 --env-file .env.production dctf-mpc:production"
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

