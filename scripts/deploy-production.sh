#!/bin/bash

# ============================================
# Script de Deploy para Produção
# ============================================
# Este script prepara e faz o build do ambiente de produção

set -e

echo "🚀 Iniciando deploy para PRODUÇÃO..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se estamos no diretório raiz
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erro: Execute este script a partir do diretório raiz do projeto${NC}"
    exit 1
fi

# Verificar se o arquivo .env.production existe
if [ ! -f ".env.production" ]; then
    echo -e "${RED}❌ Erro: Arquivo .env.production não encontrado!${NC}"
    exit 1
fi

# Aviso sobre sobrescrever .env
echo -e "${YELLOW}⚠️  ATENÇÃO: Este script irá sobrescrever o arquivo .env atual com as configurações de produção!${NC}"
read -p "Deseja continuar? (s/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Deploy cancelado."
    exit 1
fi

# Copiar arquivo .env.production para .env
echo "📋 Copiando .env.production para .env..."
cp .env.production .env
echo -e "${GREEN}✅ Arquivo .env atualizado com configurações de produção${NC}"

# Copiar arquivo frontend/.env.production para frontend/.env
if [ ! -f "frontend/.env.production" ]; then
    echo -e "${YELLOW}⚠️  Arquivo frontend/.env.production não encontrado. Criando...${NC}"
    cp frontend/.env.development frontend/.env.production
    echo -e "${YELLOW}⚠️  ATENÇÃO: Atualize frontend/.env.production com a URL de produção do backend!${NC}"
fi

echo "📋 Copiando frontend/.env.production para frontend/.env..."
cp frontend/.env.production frontend/.env
echo -e "${GREEN}✅ Arquivo frontend/.env atualizado com configurações de produção${NC}"

# Instalar dependências do backend (apenas produção)
echo "📦 Instalando dependências de produção do backend..."
npm ci --omit=dev

# Build do backend
echo "🔨 Compilando backend..."
npm run build

# Instalar dependências do frontend
echo "📦 Instalando dependências do frontend..."
cd frontend
npm ci

# Build do frontend
echo "🔨 Compilando frontend..."
npm run build
cd ..

# Verificar se os builds foram criados
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Erro: Build do backend não foi criado!${NC}"
    exit 1
fi

if [ ! -d "frontend/dist" ]; then
    echo -e "${RED}❌ Erro: Build do frontend não foi criado!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Build de produção concluído com sucesso!${NC}"
echo ""
echo "Artefatos criados:"
echo "  - Backend: ./dist/"
echo "  - Frontend: ./frontend/dist/"
echo ""
echo "Para iniciar em produção:"
echo "  npm start"
echo ""
echo "Ou use Docker:"
echo "  docker build -t dctf-mpc:production ."
echo "  docker run -p 3000:3000 --env-file .env.production dctf-mpc:production"






