# 🚀 Comandos para Configurar o ngrok

## 1. Instalar ngrok
Siga as instruções na página do ngrok que você está vendo:
- Via Microsoft Store (recomendado)
- Ou via WinGet, Scoop, ou Download direto

## 2. Configurar Authtoken
Depois de instalar, execute no terminal:
```bash
ngrok config add-authtoken SEU_AUTH_TOKEN
```
(Substitua `SEU_AUTH_TOKEN` pelo token que você copiou da página do ngrok)

## 3. Iniciar o Túnel
**⚠️ IMPORTANTE**: Como seu backend está na porta **3000** (não 80), use:

```bash
ngrok http 3000
```

Isso irá:
- Expor o backend local na porta 3000
- Gerar uma URL HTTPS pública (ex: `https://abc123.ngrok-free.dev`)
- Mostrar a URL no terminal do ngrok

## 4. Copiar a URL
Você verá algo como:
```
Forwarding    https://abc123.ngrok-free.dev -> http://localhost:3000
```

Copie a URL **HTTPS** (não a HTTP): `https://abc123.ngrok-free.dev`

## 5. Configurar no GitHub
1. Vá em **Settings** → **Secrets and variables** → **Actions**
2. Crie um secret: `VITE_API_BASE_URL`
3. Valor: `https://SUA-URL-NGROK.ngrok-free.dev/api` (adicione `/api` no final!)

## 6. Manter Rodando
- **Mantenha o terminal do ngrok aberto** enquanto usar o site
- Se fechar, a URL muda e você precisará atualizar o secret no GitHub

## 📝 Exemplo Completo

```bash
# Terminal 1: Backend
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
npm run dev

# Terminal 2: ngrok
ngrok http 3000
```

Você verá no ngrok:
```
Session Status                online
Forwarding                    https://abc123.ngrok-free.dev -> http://localhost:3000
```

Use `https://abc123.ngrok-free.dev/api` no secret do GitHub!

