# Script de diagnóstico para identificar problemas no backend

Write-Host "🔍 DIAGNÓSTICO DO BACKEND DCTF" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host ""

# 1. Verificar arquivo .env
Write-Host "1️⃣ Verificando arquivo .env..." -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host "   ✅ Arquivo .env encontrado" -ForegroundColor Green
    
    $envContent = Get-Content .env -Raw
    $requiredVars = @("MYSQL_HOST", "MYSQL_USER", "MYSQL_DATABASE", "PORT")
    $missingVars = @()
    
    foreach ($var in $requiredVars) {
        if ($envContent -notmatch "$var=") {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -eq 0) {
        Write-Host "   ✅ Variáveis essenciais presentes" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Variáveis faltando: $($missingVars -join ', ')" -ForegroundColor Red
    }
} else {
    Write-Host "   ❌ Arquivo .env NÃO encontrado!" -ForegroundColor Red
}
Write-Host ""

# 2. Verificar MySQL
Write-Host "2️⃣ Verificando MySQL..." -ForegroundColor Yellow
$mysqlProcess = Get-Process -Name mysqld -ErrorAction SilentlyContinue
if ($mysqlProcess) {
    Write-Host "   ✅ MySQL está rodando (PID: $($mysqlProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  MySQL não está rodando ou não foi encontrado" -ForegroundColor Yellow
    Write-Host "      Verifique se o MySQL está instalado e iniciado" -ForegroundColor Gray
}
Write-Host ""

# 3. Verificar porta 3000
Write-Host "3️⃣ Verificando porta 3000..." -ForegroundColor Yellow
$porta3000 = netstat -ano | findstr ":3000"
if ($porta3000) {
    Write-Host "   ⚠️  Porta 3000 está em uso:" -ForegroundColor Yellow
    $porta3000 | ForEach-Object {
        $linha = $_.Trim()
        if ($linha -match '\s+(\d+)$') {
            $pid = $matches[1]
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "      Processo: $($proc.ProcessName) (PID: $pid)" -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Host "   ✅ Porta 3000 está livre" -ForegroundColor Green
}
Write-Host ""

# 4. Verificar processos Node
Write-Host "4️⃣ Verificando processos Node..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   ⚠️  Encontrados $($nodeProcesses.Count) processos Node rodando:" -ForegroundColor Yellow
    $nodeProcesses | Select-Object -First 5 | ForEach-Object {
        Write-Host "      PID: $($_.Id) | Memória: $([math]::Round($_.WorkingSet64/1MB, 2)) MB | Iniciado: $($_.StartTime)" -ForegroundColor Gray
    }
    if ($nodeProcesses.Count -gt 5) {
        Write-Host "      ... e mais $($nodeProcesses.Count - 5) processos" -ForegroundColor Gray
    }
} else {
    Write-Host "   ✅ Nenhum processo Node encontrado" -ForegroundColor Green
}
Write-Host ""

# 5. Verificar dependências
Write-Host "5️⃣ Verificando dependências..." -ForegroundColor Yellow
if (Test-Path node_modules) {
    Write-Host "   ✅ node_modules existe" -ForegroundColor Green
    
    $criticalModules = @("express", "mysql2", "dotenv", "ts-node", "nodemon")
    $missingModules = @()
    
    foreach ($module in $criticalModules) {
        if (-not (Test-Path "node_modules\$module")) {
            $missingModules += $module
        }
    }
    
    if ($missingModules.Count -eq 0) {
        Write-Host "   ✅ Módulos críticos presentes" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Módulos faltando: $($missingModules -join ', ')" -ForegroundColor Red
        Write-Host "      Execute: npm install" -ForegroundColor Gray
    }
} else {
    Write-Host "   ❌ node_modules NÃO encontrado!" -ForegroundColor Red
    Write-Host "      Execute: npm install" -ForegroundColor Gray
}
Write-Host ""

# 6. Verificar arquivos fonte
Write-Host "6️⃣ Verificando arquivos fonte..." -ForegroundColor Yellow
$criticalFiles = @("src/index.ts", "src/server.ts", "src/config/index.ts", "src/config/mysql.ts")
$missingFiles = @()

foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file NÃO encontrado!" -ForegroundColor Red
        $missingFiles += $file
    }
}
Write-Host ""

# 7. Tentar testar conexão MySQL
Write-Host "7️⃣ Testando conexão MySQL..." -ForegroundColor Yellow
try {
    $result = npm run test:mysql-connection 2>&1 | Select-Object -Last 5
    if ($result -match "✅|sucesso|OK") {
        Write-Host "   ✅ Conexão MySQL OK" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erro na conexão MySQL:" -ForegroundColor Red
        $result | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    }
} catch {
    Write-Host "   ⚠️  Não foi possível testar conexão MySQL" -ForegroundColor Yellow
    Write-Host "      Erro: $_" -ForegroundColor Gray
}
Write-Host ""

# Resumo
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "📋 RESUMO" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar o backend:" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Se houver problemas:" -ForegroundColor Yellow
Write-Host "  1. Verifique se o MySQL está rodando" -ForegroundColor White
Write-Host "  2. Verifique as credenciais no arquivo .env" -ForegroundColor White
Write-Host "  3. Execute: npm install (se houver módulos faltando)" -ForegroundColor White
Write-Host "  4. Limpe processos Node antigos se necessário" -ForegroundColor White
Write-Host ""





