# 🚀 Passo a Passo: Deploy do Frontend no GitHub Pages

## ⚡ Passos Rápidos

### 1️⃣ Habilitar GitHub Pages
1. No GitHub, vá em **Settings** → **Pages**
2. Em **Source**, selecione **GitHub Actions**
3. Salve

### 2️⃣ Configurar Túnel do Backend (Obrigatório)

**Por que?** O frontend no GitHub Pages precisa acessar o backend, que está rodando localmente na sua máquina.

#### Opção Recomendada: ngrok
```bash
# 1. Instale ngrok: https://ngrok.com/download
# 2. Crie conta gratuita e obtenha o authtoken
# 3. Configure:
ngrok config add-authtoken SEU_AUTH_TOKEN

# 4. Inicie o túnel:
ngrok http 3000

# 5. Copie a URL HTTPS (ex: https://abc123.ngrok.io)
```

### 3️⃣ Configurar Secret no GitHub
1. No GitHub, vá em **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Crie:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://SUA-URL-NGROK.ngrok.io/api` (com `/api` no final!)
4. Clique em **Add secret**

### 4️⃣ Fazer Push das Mudanças
```bash
git add .
git commit -m "feat: configura deploy para GitHub Pages"
git push origin master
```
(ou `main` se sua branch principal for `main`)

### 5️⃣ Verificar Deploy
1. Vá em **Actions** no GitHub
2. Aguarde o workflow "Deploy Frontend to GitHub Pages" terminar
3. Vá em **Settings** → **Pages** para ver a URL do site

### 6️⃣ Manter Túnel Ativo
⚠️ **IMPORTANTE**: O túnel precisa estar rodando sempre!

- Sempre que você quiser usar o site, inicie o túnel: `ngrok http 3000`
- Se a URL do túnel mudar (ngrok gratuito muda), atualize o secret `VITE_API_BASE_URL`

## 📋 Checklist

- [ ] GitHub Pages habilitado com "GitHub Actions"
- [ ] Túnel configurado (ngrok rodando)
- [ ] Secret `VITE_API_BASE_URL` configurado no GitHub
- [ ] Push feito para `master`/`main`
- [ ] Deploy concluído (verificar em Actions)
- [ ] Site acessível (URL em Settings → Pages)

## 🆘 Problemas Comuns

### Erro: "Não foi possível conectar ao servidor"
- ✅ Verifique se o túnel está rodando
- ✅ Verifique se o backend está rodando na porta 3000
- ✅ Verifique se a URL no secret está correta (deve terminar com `/api`)

### Erro: CORS
- ✅ O backend já está configurado para aceitar requisições do GitHub Pages
- ✅ Se usar túnel, adicione a URL do túnel no CORS do backend

### Erro: 404 Not Found no site
- ✅ Verifique se o deploy foi concluído em Actions
- ✅ Limpe o cache do navegador (Ctrl+Shift+R)

