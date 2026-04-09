# Script para abrir pasta da rede no Windows Explorer
# Usado pelo protocolo dctf-openfolder:// (botão "Abrir pasta" na tela de clientes)
#
# INSTALAÇÃO (uma vez):
#   1. Copie este arquivo para uma pasta fixa, ex: C:\DCTF\open-pasta-rede.ps1
#   2. Execute no PowerShell (como usuário atual):
#      Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
#      .\open-pasta-rede.ps1 -Register
#   3. Quando o navegador pedir, escolha "Abrir" ou "Abrir open-pasta-rede.ps1"
#
# Uso pelo app: o navegador abre dctf-openfolder://\\192.168.0.9\Clientes\NomePasta
# e o Windows chama este script com essa URL; o script abre o Explorer nessa pasta.

param(
  [Parameter(Position=0)] $Url,
  [Switch] $Register
)

$ProtocolName = "dctf-openfolder"
$ScriptPath = $MyInvocation.MyCommand.Source
if (-not $ScriptPath) { $ScriptPath = "C:\DCTF\open-pasta-rede.ps1" }

if ($Register) {
  $base = "HKCU:\Software\Classes\$ProtocolName"
  New-Item -Path $base -Force | Out-Null
  Set-ItemProperty -Path $base -Name "(Default)" -Value "URL:Abrir pasta rede DCTF" -Force
  Set-ItemProperty -Path $base -Name "URL Protocol" -Value "" -Force
  $cmd = "HKCU:\Software\Classes\$ProtocolName\shell\open\command"
  New-Item -Path $cmd -Force | Out-Null
  $cmdLine = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" `"%1`""
  Set-ItemProperty -Path $cmd -Name "(Default)" -Value $cmdLine -Force
  Write-Host "Protocolo $ProtocolName registrado. O botao 'Abrir pasta' no app pode abrir o Explorer."
  exit 0
}

if (-not $Url -or $Url -notmatch "^${ProtocolName}://") {
  Write-Host "Uso: $ScriptPath -Register   OU   abra no navegador: ${ProtocolName}://\\\\servidor\\pasta"
  exit 1
}

$raw = $Url -replace "^${ProtocolName}://", ""
$path = [System.Uri]::UnescapeDataString($raw)
$path = $path -replace "/", "\\"
if (-not $path) { exit 1 }
Start-Process explorer $path
exit 0
