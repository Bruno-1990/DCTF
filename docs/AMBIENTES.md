# Guia de Ambientes - DCTF MPC

Este documento descreve como configurar e usar os ambientes de **desenvolvimento** e **produção** do projeto DCTF MPC.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
- [Ambiente de Produção](#ambiente-de-produção)
- [Scripts de Deploy](#scripts-de-deploy)
- [Docker Compose](#docker-compose)
- [Migração entre Ambientes](#migração-entre-ambientes)

---

## 🎯 Visão Geral

O projeto suporta dois ambientes principais:

1. **Desenvolvimento** (`development`): Ambiente local para desenvolvimento e testes
2. **Produção** (`production`): Ambiente otimizado para uso em produção

Cada ambiente possui suas próprias configurações de:
- Banco de dados MySQL
- URLs e portas
- Níveis de log
- Configurações de segurança

---

## 🛠️ Ambiente de Desenvolvimento

### Configuração Inicial

1. **Copiar arquivo de exemplo:**
   ```bash
   cp .env.development.example .env.development
   cp frontend/.env.development frontend/.env
   ```

2. **Ajustar configurações:**
   - Edite `.env.development` com suas configurações locais
   - Edite `frontend/.env` com a URL do backend (padrão: `http://localhost:3000`)

3. **Executar script de deploy:**
   ```bash
   # Linux/Mac
   bash scripts/deploy-development.sh
   
   # Windows (PowerShell)
   .\scripts\deploy-development.ps1
   ```

### Características

- ✅ Hot-reload ativado
- ✅ Logs detalhados (debug)
- ✅ Banco de dados local (MySQL)
- ✅ Portas padrão: Backend `3000`, Frontend `5173`
- ✅ Sem otimizações de build

### Iniciar Serviços

**Opção 1: Script Batch (Windows)**
```bash
.\1run.bat
```

**Opção 2: Manual**
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Opção 3: Docker Compose**
```bash
docker-compose -f docker-compose.development.yml up
```

---

## 🚀 Ambiente de Produção

### Configuração Inicial

1. **Copiar arquivo de exemplo:**
   ```bash
   cp .env.production.example .env.production
   cp frontend/.env.production.example frontend/.env.production
   ```

2. **⚠️ IMPORTANTE: Atualizar credenciais:**
   - Edite `.env.production` com credenciais reais de produção
   - Atualize `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`
   - Configure `FRONTEND_URL` com o domínio de produção
   - Configure `VITE_API_URL` em `frontend/.env.production`

3. **Executar script de deploy:**
   ```bash
   # Linux/Mac
   bash scripts/deploy-production.sh
   
   # Windows (PowerShell)
   .\scripts\deploy-production.ps1
   ```

### Características

- ✅ Build otimizado e minificado
- ✅ Logs apenas de nível `info` ou superior
- ✅ Banco de dados de produção
- ✅ Sem hot-reload
- ✅ Configurações de segurança otimizadas

### Build e Deploy

**Opção 1: Script de Deploy**
```bash
# Linux/Mac
bash scripts/deploy-production.sh

# Windows (PowerShell)
.\scripts\deploy-production.ps1
```

**Opção 2: Manual**
```bash
# Backend
npm ci --omit=dev
npm run build

# Frontend
cd frontend
npm ci
npm run build
```

**Opção 3: Docker Compose**
```bash
docker-compose -f docker-compose.production.yml up -d
```

### Iniciar em Produção

```bash
npm start:production
```

---

## 📜 Scripts de Deploy

### Desenvolvimento

| Script | Descrição |
|-------|-----------|
| `scripts/deploy-development.sh` | Deploy para Linux/Mac |
| `scripts/deploy-development.ps1` | Deploy para Windows |
| `npm run deploy:dev` | Executa o script apropriado para o sistema |

**O que faz:**
- Copia `.env.development` para `.env`
- Instala dependências
- Verifica conexão com banco de dados

### Produção

| Script | Descrição |
|-------|-----------|
| `scripts/deploy-production.sh` | Deploy para Linux/Mac |
| `scripts/deploy-production.ps1` | Deploy para Windows |
| `npm run deploy:prod` | Executa o script apropriado para o sistema |

**O que faz:**
- ⚠️ Sobrescreve `.env` com configurações de produção
- Instala apenas dependências de produção
- Compila backend e frontend
- Verifica se os builds foram criados

---

## 🐳 Docker Compose

### Desenvolvimento

```bash
docker-compose -f docker-compose.development.yml up
```

**Inclui:**
- Backend com hot-reload
- Frontend com Vite dev server
- MySQL local

### Produção

```bash
docker-compose -f docker-compose.production.yml up -d
```

**Inclui:**
- Backend compilado
- Frontend servido por Nginx
- MySQL de produção

---

## 🔄 Migração entre Ambientes

### De Desenvolvimento para Produção

1. **Atualizar configurações:**
   ```bash
   cp .env.production .env
   cp frontend/.env.production frontend/.env
   ```

2. **Fazer build:**
   ```bash
   npm run build:production
   cd frontend && npm run build && cd ..
   ```

3. **Iniciar:**
   ```bash
   npm start:production
   ```

### De Produção para Desenvolvimento

1. **Atualizar configurações:**
   ```bash
   cp .env.development .env
   cp frontend/.env.development frontend/.env
   ```

2. **Instalar dependências de desenvolvimento:**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

3. **Iniciar:**
   ```bash
   npm run dev
   ```

---

## 🔐 Segurança

### Desenvolvimento
- ✅ Logs detalhados para debug
- ✅ Hot-reload ativado
- ⚠️ Não usar em produção

### Produção
- ✅ Logs apenas essenciais
- ✅ Build otimizado
- ✅ Sem informações de debug
- ✅ Configurações de segurança otimizadas

---

## 📝 Checklist de Deploy em Produção

Antes de fazer deploy em produção, verifique:

- [ ] Arquivo `.env.production` configurado com credenciais reais
- [ ] Arquivo `frontend/.env.production` com URL correta do backend
- [ ] Banco de dados MySQL de produção acessível
- [ ] Build do backend executado (`npm run build`)
- [ ] Build do frontend executado (`cd frontend && npm run build`)
- [ ] Testes passando (`npm test`)
- [ ] Health check funcionando (`GET /health`)
- [ ] Backup do banco de dados realizado

---

## 🆘 Troubleshooting

### Erro: "Arquivo .env não encontrado"
**Solução:** Execute o script de deploy apropriado ou copie manualmente o arquivo `.env.development` ou `.env.production` para `.env`.

### Erro: "Cannot connect to MySQL"
**Solução:** Verifique as credenciais no arquivo `.env` e certifique-se de que o MySQL está rodando.

### Erro: "Build failed"
**Solução:** 
1. Limpe o cache: `npm run clean:cache`
2. Reinstale dependências: `rm -rf node_modules && npm install`
3. Tente novamente: `npm run build`

### Frontend não conecta ao backend
**Solução:** Verifique se `VITE_API_URL` em `frontend/.env` está correto e se o backend está rodando.

---

## 📚 Referências

- [Guia de Deploy](./DEPLOY.md)
- [Configuração do Banco de Dados](./ARQUITETURA_BANCO_DADOS.md)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

---

**Última atualização:** 2026-01-15






