# ============================================
# Script Helper para Configurar Ambientes (PowerShell)
# ============================================

Write-Host "Configurador de Ambientes - DCTF MPC" -ForegroundColor Cyan
Write-Host ""

# Menu
Write-Host "Selecione o ambiente que deseja configurar:"
Write-Host "  1) Desenvolvimento"
Write-Host "  2) Producao"
Write-Host ""
$option = Read-Host "Opcao (1 ou 2)"

switch ($option) {
  "1" {
    Write-Host "Configurando ambiente de DESENVOLVIMENTO..." -ForegroundColor Blue
    
    if (Test-Path ".env.development.example") {
      if (-not (Test-Path ".env.development")) {
        Copy-Item ".env.development.example" ".env.development"
        Write-Host "Arquivo .env.development criado" -ForegroundColor Green
      } else {
        Write-Host "Arquivo .env.development ja existe" -ForegroundColor Yellow
      }
    } else {
      Write-Host "Arquivo .env.development.example nao encontrado" -ForegroundColor Yellow
      Write-Host "Criando arquivo .env.development com valores padrao..." -ForegroundColor Yellow
      # Criar arquivo .env.development básico
      $envContent = @"
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=dctf_web
MYSQL_CONNECTION_LIMIT=10
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
"@
      $envContent | Out-File -FilePath ".env.development" -Encoding utf8 -NoNewline
      Write-Host "Arquivo .env.development criado" -ForegroundColor Green
    }
    
    if (-not (Test-Path ".env")) {
      if (Test-Path ".env.development") {
        Copy-Item ".env.development" ".env"
        Write-Host "Arquivo .env criado a partir de .env.development" -ForegroundColor Green
      }
    } else {
      Write-Host "Arquivo .env ja existe. Nao sera sobrescrito." -ForegroundColor Yellow
    }
    
    if (-not (Test-Path "frontend/.env")) {
      if (Test-Path "frontend/.env.development") {
        Copy-Item "frontend/.env.development" "frontend/.env"
        Write-Host "Arquivo frontend/.env criado" -ForegroundColor Green
      } else {
        "VITE_API_URL=http://localhost:3000" | Out-File -FilePath "frontend/.env" -Encoding utf8
        Write-Host "Arquivo frontend/.env criado com valores padrao" -ForegroundColor Green
      }
    } else {
      Write-Host "Arquivo frontend/.env ja existe" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Ambiente de desenvolvimento configurado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:"
    Write-Host "  1. Edite .env.development com suas configuracoes locais"
    Write-Host "  2. Execute: npm install"
    Write-Host "  3. Execute: npm run dev"
  }
  
  "2" {
    Write-Host "Configurando ambiente de PRODUCAO..." -ForegroundColor Blue
    
    if (Test-Path ".env.production.example") {
      if (-not (Test-Path ".env.production")) {
        Copy-Item ".env.production.example" ".env.production"
        Write-Host "Arquivo .env.production criado" -ForegroundColor Green
        Write-Host "IMPORTANTE: Edite .env.production com suas credenciais de producao!" -ForegroundColor Yellow
      } else {
        Write-Host "Arquivo .env.production ja existe" -ForegroundColor Yellow
      }
    } else {
      Write-Host "Arquivo .env.production.example nao encontrado" -ForegroundColor Yellow
      Write-Host "Criando arquivo .env.production com valores padrao..." -ForegroundColor Yellow
      # Criar arquivo .env.production básico
      $envContent = @"
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
MYSQL_HOST=seu-servidor-mysql.com
MYSQL_PORT=3306
MYSQL_USER=usuario_producao
MYSQL_PASSWORD=senha_segura_producao
MYSQL_DATABASE=dctf_web_production
MYSQL_CONNECTION_LIMIT=20
FRONTEND_URL=https://seu-dominio.com
LOG_LEVEL=info
"@
      $envContent | Out-File -FilePath ".env.production" -Encoding utf8 -NoNewline
      Write-Host "Arquivo .env.production criado" -ForegroundColor Green
      Write-Host "IMPORTANTE: Edite .env.production com suas credenciais de producao!" -ForegroundColor Yellow
    }
    
    if (-not (Test-Path "frontend/.env.production")) {
      if (Test-Path "frontend/.env.production.example") {
        Copy-Item "frontend/.env.production.example" "frontend/.env.production"
        Write-Host "Arquivo frontend/.env.production criado" -ForegroundColor Green
        Write-Host "IMPORTANTE: Edite frontend/.env.production com a URL de producao!" -ForegroundColor Yellow
      } else {
        "VITE_API_URL=https://api.seu-dominio.com" | Out-File -FilePath "frontend/.env.production" -Encoding utf8
        Write-Host "Arquivo frontend/.env.production criado com valores padrao" -ForegroundColor Green
        Write-Host "IMPORTANTE: Edite frontend/.env.production com a URL de producao!" -ForegroundColor Yellow
      }
    } else {
      Write-Host "Arquivo frontend/.env.production ja existe" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Arquivos de producao criados!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:"
    Write-Host "  1. Edite .env.production com suas credenciais de producao"
    Write-Host "  2. Edite frontend/.env.production com a URL de producao"
    Write-Host "  3. Execute: .\scripts\deploy-production.ps1"
  }
  
  default {
    Write-Host "Opcao invalida" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pressione qualquer tecla para sair..."
    try {
      $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } catch {
      Read-Host "Pressione Enter para sair"
    }
    exit 1
  }
}

# Pausa no final para o usuário ver o resultado
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
try {
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
  Read-Host "Pressione Enter para sair"
}
