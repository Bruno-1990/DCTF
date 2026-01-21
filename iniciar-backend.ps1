# Script para iniciar o backend DCTF

Write-Host "🚀 Iniciando backend DCTF..." -ForegroundColor Cyan
Write-Host ""

# Verificar se a porta 3000 está em uso
$portaEmUso = netstat -ano | findstr :3000
if ($portaEmUso) {
    Write-Host "⚠️  Porta 3000 já está em uso!" -ForegroundColor Yellow
    Write-Host "   Tentando encontrar o processo..." -ForegroundColor Yellow
    $portaEmUso | ForEach-Object {
        $linha = $_.Trim()
        if ($linha -match '\s+(\d+)$') {
            $pid = $matches[1]
            $processo = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($processo) {
                Write-Host "   Processo encontrado: $($processo.ProcessName) (PID: $pid)" -ForegroundColor Yellow
            }
        }
    }
    Write-Host ""
    Write-Host "💡 Se o backend não estiver funcionando, você pode:" -ForegroundColor Cyan
    Write-Host "   1. Parar o processo na porta 3000" -ForegroundColor White
    Write-Host "   2. Ou usar uma porta diferente: npm run dev -- --port 3001" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✅ Porta 3000 está livre" -ForegroundColor Green
    Write-Host ""
}

# Verificar se o arquivo .env existe
if (Test-Path .env) {
    Write-Host "✅ Arquivo .env encontrado" -ForegroundColor Green
} else {
    Write-Host "❌ Arquivo .env NÃO encontrado!" -ForegroundColor Red
    Write-Host "   Crie um arquivo .env na raiz do projeto com as configurações necessárias" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "📦 Verificando dependências..." -ForegroundColor Cyan
if (-not (Test-Path node_modules)) {
    Write-Host "⚠️  node_modules não encontrado. Instalando dependências..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

Write-Host "🔧 Iniciando servidor backend..." -ForegroundColor Cyan
Write-Host "   Use Ctrl+C para parar o servidor" -ForegroundColor Gray
Write-Host ""

# Iniciar o backend
npm run dev





