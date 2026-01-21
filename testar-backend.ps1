# Script para testar o backend e capturar erros

Write-Host "🧪 Testando inicialização do backend..." -ForegroundColor Cyan
Write-Host ""

# Limpar processos antigos
Write-Host "🧹 Limpando processos Node antigos..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { 
    $_.StartTime -lt (Get-Date).AddMinutes(-5) 
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Tentar compilar primeiro
Write-Host "🔨 Compilando TypeScript..." -ForegroundColor Yellow
$compileResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Compilação bem-sucedida" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Tentando iniciar servidor compilado..." -ForegroundColor Yellow
    Write-Host ""
    
    # Iniciar em background e capturar saída
    $job = Start-Job -ScriptBlock {
        Set-Location "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
        $env:NODE_ENV = "development"
        node dist/index.js 2>&1
    }
    
    Start-Sleep -Seconds 8
    
    # Verificar se está rodando
    $porta = netstat -ano | findstr ":3000"
    if ($porta) {
        Write-Host "✅ Backend está rodando na porta 3000!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Saída do servidor:" -ForegroundColor Cyan
        Receive-Job $job | Select-Object -First 20
    } else {
        Write-Host "❌ Backend não iniciou na porta 3000" -ForegroundColor Red
        Write-Host ""
        Write-Host "📋 Saída do servidor (últimas 30 linhas):" -ForegroundColor Cyan
        Receive-Job $job | Select-Object -Last 30
    }
    
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
} else {
    Write-Host "❌ Erro na compilação:" -ForegroundColor Red
    $compileResult | Select-Object -Last 20
}

Write-Host ""
Write-Host "💡 Dica: Se o servidor compilado funcionar, use 'npm start' em vez de 'npm run dev'" -ForegroundColor Yellow





