# Script para testar npm run dev

Write-Host "🧪 Testando npm run dev..." -ForegroundColor Cyan
Write-Host ""

# Parar processos antigos na porta 3000
Write-Host "🧹 Limpando processos antigos..." -ForegroundColor Yellow
$porta3000 = netstat -ano | findstr ":3000"
if ($porta3000) {
    $porta3000 | ForEach-Object {
        if ($_ -match '\s+(\d+)$') {
            $pid = $matches[1]
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq "node") {
                Write-Host "   Parando processo Node (PID: $pid)..." -ForegroundColor Gray
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Start-Sleep -Seconds 2
}

# Limpar cache
Remove-Item -Recurse -Force .ts-node -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

Write-Host "✅ Limpeza concluída" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Iniciando npm run dev..." -ForegroundColor Cyan
Write-Host "   (O servidor iniciará em alguns segundos)" -ForegroundColor Gray
Write-Host ""

# Iniciar em background
$job = Start-Job -ScriptBlock {
    Set-Location "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
    npm run dev 2>&1
}

# Aguardar e verificar
Start-Sleep -Seconds 10

# Verificar porta
$porta = netstat -ano | findstr ":3000"
if ($porta) {
    Write-Host "✅ Backend está rodando na porta 3000!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Backend ainda não está na porta 3000" -ForegroundColor Yellow
}

# Mostrar últimas linhas do output
Write-Host ""
Write-Host "📋 Últimas mensagens do servidor:" -ForegroundColor Cyan
Receive-Job $job | Select-Object -Last 15

Write-Host ""
Write-Host "💡 Para ver o output completo, execute 'npm run dev' diretamente no terminal" -ForegroundColor Yellow
Write-Host "💡 Para parar, use: Get-Process -Name node | Where-Object { `$_.StartTime -gt (Get-Date).AddMinutes(-1) } | Stop-Process" -ForegroundColor Yellow

# Não remover o job para que o servidor continue rodando
Write-Host ""
Write-Host "⚠️  O servidor está rodando em background. Para parar completamente, feche este terminal ou pare os processos Node." -ForegroundColor Yellow





