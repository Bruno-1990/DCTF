# ============================================================================
# Sobe a API do DCTF (porta 38572) se ainda não estiver rodando.
# ----------------------------------------------------------------------------
# Usado pela Tarefa Agendada "DCTF-DET-API" que dispara NO LOGON de CENTRAL\bruno.
#
# POR QUE NO LOGON DO BRUNO, E NÃO NO BOOT COMO SYSTEM: a coleta do DET faz
# login por certificado digital A1, que vive no repositório do usuário
# (Cert:\CurrentUser\My) junto com a política AutoSelectCertificateForUrls
# (HKCU). Uma tarefa rodando como SYSTEM/sem sessão NÃO enxerga esse certificado
# e o login no gov.br falharia. Por isso a tarefa roda na sessão do bruno.
#
# Idempotente: se a API já está de pé (porta em uso), não sobe uma segunda.
# ============================================================================

$porta = 38572
$emUso = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($emUso) {
    Write-Host "API já rodando na porta $porta — nada a fazer."
    exit 0
}

Set-Location 'D:\aplicativos\DCTF WEB\DCTF_MPC'

# Sobe em janela minimizada; nodemon mantém o processo vivo. Mesma forma que a
# API já roda hoje (npm run dev), para não introduzir um caminho novo não testado.
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev' -WindowStyle Minimized
Write-Host "API iniciada."
