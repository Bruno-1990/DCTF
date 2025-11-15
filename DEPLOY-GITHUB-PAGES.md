# Guia de Deploy do Frontend no GitHub Pages

Este guia explica como fazer o deploy do frontend no GitHub Pages enquanto o backend roda localmente.

## Pré-requisitos

1. ✅ Repositório no GitHub (este projeto)
2. ✅ Backend rodando localmente na porta 3000
3. ✅ Túnel configurado (ngrok, Cloudflare Tunnel, etc.) para expor o backend local

## Passo 1: Habilitar GitHub Pages no Repositório

1. Acesse seu repositório no GitHub
2. Vá em **Settings** → **Pages**
3. Em **Source**, selecione **GitHub Actions**
4. Salve as alterações

## Passo 2: Configurar o Túnel do Backend

Como o backend está rodando localmente, você precisa expô-lo para a internet. Existem várias opções:

### Opção A: ngrok (Recomendado - Mais Simples)

1. Instale o ngrok: https://ngrok.com/download
2. Crie uma conta gratuita e obtenha seu authtoken
3. Configure o authtoken:
   ```bash
   ngrok config add-authtoken SEU_AUTH_TOKEN
   ```
4. Inicie o túnel apontando para a porta 3000:
   ```bash
   ngrok http 3000
   ```
5. Copie a URL HTTPS fornecida (ex: `https://abc123.ngrok.io`)

### Opção B: Cloudflare Tunnel (Cloudflared)

1. Instale o Cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
2. Execute:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Copie a URL HTTPS fornecida

### Opção C: Outros Serviços

- **Localtunnel**: `npx localtunnel --port 3000`
- **LocalXpose**: https://localxpose.io/
- **Serveo**: `ssh -R 80:localhost:3000 serveo.net`

## Passo 3: Configurar a URL da API no GitHub

1. No repositório do GitHub, vá em **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Crie um secret chamado `VITE_API_BASE_URL`
4. Cole o valor: `https://SUA-URL-DO-TUNNEL.ngrok.io/api` (ou sua URL do túnel)
5. Clique em **Add secret**

**⚠️ IMPORTANTE**: Use a URL HTTPS do túnel com `/api` no final!

## Passo 4: Verificar o Nome do Repositório

O workflow precisa saber o nome do repositório para configurar o base path corretamente.

1. Verifique o nome do seu repositório no GitHub
2. O nome do repositório é usado automaticamente pelo workflow através da variável `GITHUB_REPOSITORY`
3. Se precisar ajustar manualmente, edite `.github/workflows/deploy-pages.yml` na linha 15

## Passo 5: Fazer Commit e Push

1. Certifique-se de que todas as alterações foram commitadas:
   ```bash
   git add .
   git commit -m "feat: configura deploy para GitHub Pages"
   git push origin master
   ```
   (ou `main` se sua branch principal for `main`)

## Passo 6: Verificar o Deploy

1. Vá em **Actions** no seu repositório GitHub
2. Você verá o workflow "Deploy Frontend to GitHub Pages" rodando
3. Aguarde a conclusão (geralmente 2-3 minutos)
4. Se houver erros, clique no workflow para ver os logs

## Passo 7: Acessar o Site

Após o deploy concluir com sucesso:

1. Vá em **Settings** → **Pages** no GitHub
2. Você verá a URL do seu site (ex: `https://SEU-USUARIO.github.io/DCTF_MPC/`)
3. Acesse a URL no navegador

## Atualizações Futuras

Toda vez que você fizer `git push` para a branch `master` (ou `main`), o GitHub Actions fará o deploy automaticamente.

## Manter o Túnel Ativo

**⚠️ IMPORTANTE**: O túnel precisa estar rodando sempre que você quiser que o frontend funcione!

- O túnel ngrok gratuito gera uma nova URL a cada reinício (exceto com plano pago)
- Quando a URL mudar, atualize o secret `VITE_API_BASE_URL` no GitHub
- Depois, faça um novo push ou execute manualmente o workflow em **Actions** → **Deploy Frontend to GitHub Pages** → **Run workflow**

## Alternativa: Deploy Manual (Sem GitHub Actions)

Se preferir fazer o deploy manual:

1. No frontend, crie um arquivo `.env.production`:
   ```
   VITE_API_BASE_URL=https://SUA-URL-DO-TUNNEL.ngrok.io/api
   ```

2. Execute o build:
   ```bash
   cd frontend
   npm run build
   ```

3. Use a ferramenta [gh-pages](https://www.npmjs.com/package/gh-pages):
   ```bash
   npm install -g gh-pages
   gh-pages -d frontend/dist
   ```

## Troubleshooting

### Erro: "404 Not Found" ao acessar o site
- Verifique se o base path está correto no `vite.config.ts`
- O base path deve ser o nome do repositório (ex: `/DCTF_MPC/`)

### Erro: "Não foi possível conectar ao servidor"
- Verifique se o túnel está rodando
- Verifique se a URL no secret `VITE_API_BASE_URL` está correta
- Teste a URL do túnel diretamente no navegador: `https://SUA-URL.ngrok.io/api/health` (ou endpoint de teste)

### Erro: CORS
- Verifique se o backend está configurado para aceitar requisições do domínio do GitHub Pages
- O backend já está configurado para aceitar `https://*.github.io`, mas se seu repositório tiver outro nome, atualize `src/server.ts`

### O site não atualiza após o push
- Aguarde alguns minutos (o deploy pode levar 2-3 minutos)
- Limpe o cache do navegador (Ctrl+Shift+R)
- Verifique se o workflow foi executado em **Actions**

