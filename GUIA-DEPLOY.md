# 🚀 Guia de Deploy - DCTF MPC

Este guia explica como publicar seu projeto em hospedagem de forma simples e rápida.

## 📋 Estrutura do Projeto

- **Backend**: Node.js + Express + TypeScript (porta 3000)
- **Frontend**: React + Vite + TypeScript (porta 5173)
- **Banco de Dados**: Supabase (já está na nuvem)

## 🎯 Opções de Hospedagem

### 1. Railway (Recomendado - Mais Simples) ⭐

**Vantagens:**
- ✅ Gratuito para começar ($5/mês após créditos)
- ✅ Deploy automático via GitHub
- ✅ Suporta frontend e backend
- ✅ Configuração muito simples
- ✅ SSL automático (HTTPS)

#### Passo a Passo:

1. **Criar conta no Railway:**
   - Acesse: https://railway.app
   - Faça login com GitHub

2. **Deploy do Backend:**
   - Clique em "New Project"
   - Selecione "Deploy from GitHub repo"
   - Escolha seu repositório `CentralContabil/DCTF`
   - Railway detecta automaticamente o backend
   - Configure as variáveis de ambiente:
     ```
     PORT=3000
     NODE_ENV=production
     SUPABASE_URL=sua_url_do_supabase
     SUPABASE_ANON_KEY=sua_chave_do_supabase
     FRONTEND_URL=https://seu-frontend.railway.app
     ```
   - Railway faz o build automaticamente com `npm run build`
   - O backend estará disponível em: `https://seu-backend.railway.app`

3. **Deploy do Frontend:**
   - Crie outro projeto no Railway
   - Selecione "Deploy from GitHub repo"
   - Escolha o mesmo repositório
   - Configure:
     - **Root Directory**: `frontend`
     - **Build Command**: `npm run build`
     - **Start Command**: `npx vite preview --port $PORT --host`
   - Configure variáveis de ambiente:
     ```
     VITE_API_BASE_URL=https://seu-backend.railway.app/api
     ```
   - O frontend estará disponível em: `https://seu-frontend.railway.app`

**Custo:** Gratuito inicialmente, depois ~$5-10/mês

---

### 2. Render ⭐

**Vantagens:**
- ✅ Plano gratuito disponível
- ✅ Deploy automático via GitHub
- ✅ SSL automático
- ✅ Configuração simples

#### Passo a Passo:

1. **Criar conta:**
   - Acesse: https://render.com
   - Faça login com GitHub

2. **Deploy do Backend:**
   - Clique em "New +" → "Web Service"
   - Conecte seu repositório GitHub
   - Configure:
     - **Name**: `dctf-backend`
     - **Root Directory**: `.` (raiz)
     - **Environment**: `Node`
     - **Build Command**: `npm ci && npm run build`
     - **Start Command**: `npm start`
     - **Instance Type**: Free (ou pago se preferir)
   - Adicione variáveis de ambiente (como no Railway)
   - Clique em "Create Web Service"

3. **Deploy do Frontend:**
   - Clique em "New +" → "Static Site"
   - Conecte seu repositório GitHub
   - Configure:
     - **Name**: `dctf-frontend`
     - **Root Directory**: `frontend`
     - **Build Command**: `npm ci && npm run build`
     - **Publish Directory**: `dist`
   - Configure variável de ambiente:
     ```
     VITE_API_BASE_URL=https://seu-backend.onrender.com/api
     ```
   - Clique em "Create Static Site"

**Custo:** Gratuito (com limitações), ou $7/mês por serviço

---

### 3. Fly.io (Boa Opção)

**Vantagens:**
- ✅ Plano gratuito generoso
- ✅ Deploy rápido
- ✅ Suporta Docker
- ✅ Global edge network

#### Passo a Passo:

1. **Instalar Fly CLI:**
   ```bash
   # Windows
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   
   # Mac/Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Deploy do Backend:**
   - Crie um `Dockerfile` (já existe no projeto!)
   - Execute:
     ```bash
     fly launch
     # Siga as instruções interativas
     # Configure as variáveis de ambiente
     ```

4. **Deploy do Frontend:**
   - Opção 1: Usar Vercel/Netlify (ver abaixo)
   - Opção 2: Buildar estático e usar Fly também

**Custo:** Gratuito para começar, depois pay-as-you-go

---

### 4. Vercel (Frontend) + Render/Railway (Backend) ⭐ Recomendado

**Vantagens:**
- ✅ Vercel é excelente para frontend React
- ✅ Deploy automático
- ✅ CDN global
- ✅ SSL automático

#### Passo a Passo:

**Frontend no Vercel:**

1. **Criar conta:**
   - Acesse: https://vercel.com
   - Faça login com GitHub

2. **Deploy:**
   - Clique em "Add New Project"
   - Importe seu repositório GitHub
   - Configure:
     - **Framework Preset**: Vite
     - **Root Directory**: `frontend`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`
   - Configure variável de ambiente:
     ```
     VITE_API_BASE_URL=https://seu-backend.railway.app/api
     ```
   - Clique em "Deploy"
   - Frontend estará em: `https://seu-app.vercel.app`

**Backend no Railway/Render:**
- Siga os passos do backend na opção 1 ou 2

**Custo:** Gratuito para ambos (com limitações)

---

### 5. Netlify (Frontend) + Railway/Render (Backend)

**Similar ao Vercel:**

1. Acesse: https://netlify.com
2. "Add new site" → "Import an existing project"
3. Conecte GitHub
4. Configure:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
5. Adicione variável de ambiente: `VITE_API_BASE_URL`

**Custo:** Gratuito

---

## 🔧 Configuração de Variáveis de Ambiente

### Backend (todas as opções):
```env
PORT=3000
NODE_ENV=production
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_do_supabase
FRONTEND_URL=https://seu-frontend.vercel.app
```

### Frontend:
```env
VITE_API_BASE_URL=https://seu-backend.railway.app/api
```

## 🎯 Recomendação Final

**Para começar rápido:**
1. **Backend**: Railway (mais simples, deploy automático)
2. **Frontend**: Vercel (excelente para React, CDN global)

**Ou tudo no Railway:**
- Deploy completo na mesma plataforma
- Mais fácil de gerenciar

## 📝 Checklist de Deploy

- [ ] Backend buildado e rodando em produção
- [ ] Frontend buildado e acessível
- [ ] Variáveis de ambiente configuradas
- [ ] CORS configurado no backend para aceitar requisições do frontend
- [ ] Banco de dados Supabase configurado e acessível
- [ ] Testado endpoints da API
- [ ] Testado funcionalidades do frontend

## 🔍 Troubleshooting

### Backend não inicia:
- Verifique se todas as variáveis de ambiente estão configuradas
- Verifique os logs no painel da hospedagem
- Certifique-se que `npm run build` está gerando `dist/`

### Frontend não conecta ao backend:
- Verifique se `VITE_API_BASE_URL` está correto
- Verifique se o CORS no backend permite requisições do domínio do frontend
- Teste a URL do backend diretamente no navegador

### Erro 404 no frontend:
- Verifique se o `dist/` está sendo gerado corretamente
- Verifique se a pasta de publicação está correta (`dist`)

## 💡 Dicas

1. **Use variáveis de ambiente** para diferentes ambientes (dev, prod)
2. **Configure CORS** no backend para aceitar apenas seu domínio de produção
3. **Monitore os logs** regularmente
4. **Configure alertas** na plataforma de hospedagem
5. **Faça backup** do banco de dados regularmente (Supabase já faz automaticamente)

---

**Precisa de ajuda?** Consulte a documentação de cada plataforma ou abra uma issue no repositório.

