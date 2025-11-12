# Guia de Deploy

Este documento descreve como executar a aplicação DCTF MPC em ambiente de produção, incluindo os requisitos de infraestrutura, execução dos testes automatizados e opções de entrega utilizando Node.js puro ou Docker.

## 1. Pré-requisitos

- Node.js 20.x e npm 10.x (mesmo baseline usado em desenvolvimento)
- Banco de dados Supabase configurado (ver `docs/SUPABASE_SETUP.md`)
- Variáveis de ambiente obrigatórias:
  - `PORT` – porta HTTP do backend (padrão: `3000`)
  - `NODE_ENV` – defina como `production` em produção
  - `SUPABASE_URL` – URL do projeto no Supabase
  - `SUPABASE_ANON_KEY` – chave anônima do Supabase para chamadas server-side
  - `FRONTEND_URL` – origem autorizada para o aplicativo web (usada no CORS e WebSockets)

Crie um arquivo `.env` baseado nos exemplos acima ou configure essas variáveis diretamente no provedor de hospedagem.

## 2. Checklist de CI/CD

### Testes e qualidade

```bash
# Backend
npm ci
npm run lint
npm run type-check
npm test

# Frontend
cd frontend
npm ci
npm run lint
npm test
npm run build
```

### Build de produção

```bash
# Backend transpila para dist/
npm run build

# Frontend gera artefatos estáticos em frontend/dist
cd frontend
npm run build
```

Os artefatos do frontend podem ser servidos por qualquer CDN ou serviço de hosting estático (Cloudflare Pages, Netlify, Vercel, S3 + CloudFront, etc.). O backend exposto em Node.js pode residir em serviços como Render, Railway, Fly.io ou infra própria.

## 3. Deploy com Docker

O repositório inclui um `Dockerfile` multi-stage que compila o backend e gera uma imagem enxuta com dependências de produção.

```bash
# Build da imagem
docker build -t dctf-mpc-api .

# Execução local
docker run --rm -it \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e SUPABASE_URL=<url> \
  -e SUPABASE_ANON_KEY=<chave> \
  -e FRONTEND_URL=https://app.seudominio.com \
  dctf-mpc-api
```

A imagem expõe apenas a API. Hospede o frontend estático separadamente ou utilize um reverse proxy (NGINX/Caddy) configurado com duas rotas:

- `/` apontando para os arquivos de `frontend/dist`
- `/api` e `/ws` apontando para o container Node

## 4. Pipeline GitHub Actions (CI)

O arquivo `.github/workflows/ci.yml` executa:

1. `npm run lint`, `npm run type-check`, `npm test` e `npm run build` no backend.
2. `npm run lint`, `npm run test` e `npm run build` no frontend.

Configure o branch de produção para exigir a aprovação desse workflow antes do merge.

## 5. Processo de Deploy recomendado

1. Abrir PR para o branch principal.
2. Validar que o workflow `CI` passou com sucesso.
3. Gerar tag ou release conforme estratégia do time.
4. Disparar deploy automatizado (ex.: GitHub Actions, ArgoCD, Railway) ou seguir os passos manuais:
   - Construir a imagem Docker (`docker build ...`).
   - Publicar no registro container (GHCR, Docker Hub, ECR).
   - Atualizar o serviço de produção (kubectl, docker service, ECS, etc.).
   - Fazer upload do build estático do frontend ao serviço escolhido.
5. Executar checagem de saúde: `GET /health` e `GET /ws/health`.
6. Monitorar logs via plataforma de observabilidade (ou `docker logs` em ambientes menores).

## 6. Rollback

Mantenha a última imagem/tarball estável versionada. Para reverter:

```bash
docker run --rm -it \
  -p 3000:3000 \
  dctf-mpc-api:<tag-anterior>
```

Republique a versão anterior do frontend estático e invalide caches CDN quando necessário.

---

> Dica: utilize o Taskmaster para registrar ajustes específicos ao fluxo de CI/CD (por exemplo, adicionar secrets novos ou atualizar o ambiente Docker) e manter a lista de tarefas sempre sincronizada.

