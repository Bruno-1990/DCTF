# Abrir pasta da rede no Windows (botão "Abrir pasta")

O botão **"Abrir pasta"** ao lado do campo Rede pode abrir a pasta diretamente no Windows Explorer se você instalar um **protocolo personalizado** no seu PC (uma vez só).

## Por que não abre sozinho?

Navegadores não podem abrir pastas do Windows por segurança. O "Salvar como" só deixa você *escolher* uma pasta; o site nunca informa um caminho para o sistema abrir. Por isso usamos um protocolo (como `mailto:` ou `tel:`): o Windows chama um script seu que abre o Explorer.

## Instalação (uma vez)

1. **Copie o script**  
   Copie o arquivo:
   - `docs\scripts\open-pasta-rede.ps1`  
   para uma pasta fixa, por exemplo: **`C:\DCTF\open-pasta-rede.ps1`**  
   (crie a pasta `C:\DCTF` se não existir.)

2. **Permitir scripts no PowerShell** (se ainda não permitiu):
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
   ```

3. **Registrar o protocolo**  
   No PowerShell, na pasta onde está o script:
   ```powershell
   cd C:\DCTF
   .\open-pasta-rede.ps1 -Register
   ```
   Deve aparecer: *"Protocolo dctf-openfolder registrado..."*

4. **Pronto**  
   Da próxima vez que clicar em **"Abrir pasta"** no app, o Windows pode perguntar algo como “Abrir open-pasta-rede.ps1?” — escolha **Abrir** (e marque “Sempre abrir” se quiser). O Explorer abrirá na pasta da rede.

## Se não quiser instalar

O app continua copiando o caminho para a área de transferência. Pressione **Win+R**, cole o caminho e Enter para abrir a pasta no Explorer.
