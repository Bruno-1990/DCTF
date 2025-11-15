# Guia de Deploy - DCTF MPC

Este guia explica como fazer o deploy completo do sistema DCTF MPC, incluindo frontend e backend.

## 📋 Estrutura do Projeto

- **Frontend**: React + Vite (pode ser deployado no GitHub Pages)
- **Backend**: Node.js + Express (precisa de um serviço que suporte Node.js)
- **Banco de Dados**: Supabase (já está na nuvem)

## 🚀 Opção 1: Deploy Completo via GitHub Pages (Frontend) + Serviço de Backend

### Frontend no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` já está configurado para fazer deploy automático do frontend no GitHub Pages.

**Passos:**

1. **Configure o repositório no GitHub:**
   - Vá em Settings > Pages
   - Selecione "GitHub Actions" como fonte (não "Deploy from a branch")
   - Salve

2. **Configure a variável de ambiente:**
   - Vá em Settings > Secrets and variables > Actions
   - Adicione uma variável `VITE_API_BASE_URL` com a URL do seu backend
   - Exemplo: `https://seu-backend.railway.app/api` ou `https://seu-backend.render.com/api`

3. **Faça push para a branch master:**
   ```bash
   git push origin master
   ```

4. **O frontend será deployado automaticamente em:**
   - `https://centralcontabil.github.io/DCTF/` (baseado no nome do repositório)

### Backend em Serviço de Hosting

Você precisará fazer deploy do backend em um serviço que suporte Node.js. Opções recomendadas:

#### **Railway** (Recomendado - Grátis com limites)

1. Acesse [railway.app](https://railway.app)
2. Conecte seu repositório GitHub
3. Selecione o projeto
4. Configure as variáveis de ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `PORT` (opcional, Railway define automaticamente)
5. Railway detecta automaticamente o Node.js e faz o deploy

#### **Render** (Grátis com limites)

1. Acesse [render.com](https://render.com)
2. Conecte seu repositório GitHub
3. Crie um novo "Web Service"
4. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Root Directory**: `.` (raiz do projeto)
5. Configure as variáveis de ambiente (mesmas do Railway)

#### **Vercel** (Grátis para serverless)

1. Acesse [vercel.com](https://vercel.com)
2. Conecte seu repositório GitHub
3. Configure:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Configure as variáveis de ambiente

### Configuração do Frontend para Produção

Após fazer o deploy do backend, atualize a variável `VITE_API_BASE_URL` no GitHub:

1. Settings > Secrets and variables > Actions
2. Edite `VITE_API_BASE_URL` com a URL do seu backend em produção
3. Faça um novo commit para disparar o workflow novamente

## 🔧 Opção 2: Deploy Manual

### Frontend (GitHub Pages)

```bash
cd frontend
npm install
npm run build

# O diretório dist/ será gerado
# Faça upload manual do conteúdo de dist/ para GitHub Pages
```

### Backend

```bash
npm install
npm run build
npm start
```

## 📝 Variáveis de Ambiente Necessárias

### Backend (.env)
```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_KEY=sua_chave_do_supabase
PORT=3000
NODE_ENV=production
```

### Frontend (GitHub Secrets)
```
VITE_API_BASE_URL=https://seu-backend-url.com/api
```

## 🔗 Links Úteis

- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)

## ⚠️ Importante

- O frontend **não pode** rodar o backend (GitHub Pages só serve arquivos estáticos)
- Você **deve** fazer deploy do backend em um serviço separado
- Configure o **CORS** no backend para aceitar requisições do domínio do GitHub Pages
- Mantenha as **variáveis de ambiente** seguras (nunca commite-as no Git)

## 🎯 Próximos Passos

1. Escolha um serviço para o backend (Railway recomendado)
2. Configure as variáveis de ambiente no serviço escolhido
3. Faça o deploy do backend
4. Atualize `VITE_API_BASE_URL` no GitHub Secrets
5. Faça push para master e o frontend será deployado automaticamente


