# 🚀 Deploy: Frontend no GitHub Pages + Backend Local

Este guia explica como fazer deploy do frontend no GitHub Pages enquanto o backend roda localmente.

## 📋 Configuração

### ✅ Vantagens desta abordagem:
- **Gratuito** - GitHub Pages é gratuito
- **Rápido** - Deploy automático do frontend
- **Simples** - Backend continua local, sem necessidade de configurar serviços externos
- **Flexível** - Pode migrar o backend para um serviço hospedado depois

### ⚠️ Limitações:
- O backend precisa estar rodando localmente para o frontend funcionar
- Para acesso remoto, você precisará usar um túnel (ngrok, Cloudflare Tunnel, etc.)
- CORS precisa estar configurado corretamente

## 🔧 Passo 1: Configurar o Backend

### 1.1. Ajustar CORS no Backend

O backend já está configurado para aceitar requisições do GitHub Pages:

```typescript
// src/server.ts já está configurado para aceitar:
// - http://localhost:5173 (desenvolvimento)
// - https://centralcontabil.github.io (GitHub Pages)
```

### 1.2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_do_supabase
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://localhost:5173,https://centralcontabil.github.io
```

### 1.3. Iniciar o Backend Localmente

```bash
npm install
npm run build
npm start
```

O backend estará rodando em: `http://localhost:3000`

## 🌐 Passo 2: Deploy do Frontend no GitHub Pages

### 2.1. Configurar GitHub Pages

1. No repositório GitHub, vá em **Settings > Pages**
2. Em **Source**, selecione **"GitHub Actions"** (não "Deploy from a branch")
3. Salve

### 2.2. Configurar Variável de Ambiente no GitHub

1. Vá em **Settings > Secrets and variables > Actions**
2. Clique em **"New repository secret"**
3. Adicione:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `http://localhost:3000/api` (ou a URL do seu túnel, veja abaixo)
4. Salve

**⚠️ Importante**: Para o frontend no GitHub Pages acessar o backend local, você precisará usar um túnel (veja opção 3 abaixo).

### 2.3. Fazer Deploy

1. Faça commit e push para a branch `master`:
   ```bash
   git add .
   git commit -m "feat: configura deploy no GitHub Pages"
   git push origin master
   ```

2. O workflow `.github/workflows/deploy-pages.yml` irá:
   - Buildar o frontend
   - Fazer deploy no GitHub Pages
   - O site ficará disponível em: `https://centralcontabil.github.io/DCTF/`

## 🔗 Passo 3: Tornar o Backend Acessível Remotamente (Opcional)

Se você quer que o frontend no GitHub Pages acesse o backend rodando na sua máquina, você precisa criar um túnel.

### Opção A: ngrok (Mais Simples)

1. **Instale o ngrok**: [ngrok.com/download](https://ngrok.com/download)

2. **Crie uma conta** e obtenha seu token de autenticação

3. **Inicie o túnel**:
   ```bash
   ngrok http 3000
   ```

4. **Copie a URL** gerada (ex: `https://abc123.ngrok.io`)

5. **Atualize o GitHub Secret**:
   - Vá em Settings > Secrets and variables > Actions
   - Edite `VITE_API_BASE_URL`
   - Coloque: `https://abc123.ngrok.io/api`
   - Salve

6. **Atualize o CORS do backend** (adicione a URL do ngrok):
   ```env
   FRONTEND_URL=http://localhost:5173,https://centralcontabil.github.io,https://abc123.ngrok.io
   ```

⚠️ **Nota**: A URL do ngrok muda a cada vez que você reinicia o túnel. Para uma URL fixa, use o plano pago do ngrok.

### Opção B: Cloudflare Tunnel (Gratuito e Fixo)

1. **Instale o cloudflared**: [developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup)

2. **Crie um túnel**:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. **Use a URL gerada** no GitHub Secret (similar ao ngrok)

### Opção C: Localtunnel (Gratuito)

```bash
npx localtunnel --port 3000
```

## 🎯 Fluxo de Trabalho Recomendado

### Para Desenvolvimento:
- Backend: `npm run dev` (porta 3000)
- Frontend: `cd frontend && npm run dev` (porta 5173)
- Frontend usa proxy para `/api` → `http://localhost:3000`

### Para Produção (GitHub Pages):
- Backend: `npm start` na sua máquina ou servidor
- Frontend: deploy automático via GitHub Actions
- Frontend usa `VITE_API_BASE_URL` do GitHub Secrets

## 📝 Checklist de Deploy

- [ ] Backend configurado e rodando localmente
- [ ] Variáveis de ambiente do backend configuradas (`.env`)
- [ ] CORS configurado para aceitar requisições do GitHub Pages
- [ ] GitHub Pages configurado para usar "GitHub Actions"
- [ ] Secret `VITE_API_BASE_URL` configurado no GitHub
- [ ] Workflow de deploy criado (`.github/workflows/deploy-pages.yml`)
- [ ] Push feito para a branch `master`
- [ ] Deploy concluído (verificar em Actions do GitHub)

## 🔍 Verificando o Deploy

1. **Acesse**: `https://centralcontabil.github.io/DCTF/`
2. **Verifique o console do navegador** (F12) para erros de conexão
3. **Teste as funcionalidades** que dependem do backend

## 🚨 Troubleshooting

### Erro de CORS
- Verifique se o CORS no backend inclui a URL do GitHub Pages
- Verifique se o backend está rodando e acessível

### Frontend não conecta ao backend
- Verifique se `VITE_API_BASE_URL` está configurado corretamente no GitHub Secrets
- Se usar túnel, verifique se está ativo e a URL está correta

### Build do frontend falha
- Verifique os logs em Actions > Deploy Frontend to GitHub Pages
- Verifique se todas as dependências estão no `package.json`

## 💡 Próximos Passos

Quando quiser fazer deploy completo (frontend + backend):
- Veja `DEPLOY.md` para opções de hosting do backend
- Recomendamos Railway ou Render para backend Node.js


