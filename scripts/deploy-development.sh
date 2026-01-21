#!/bin/bash

# ============================================
# Script de Deploy para Desenvolvimento
# ============================================
# Este script prepara e inicia o ambiente de desenvolvimento

set -e

echo "🚀 Iniciando deploy para DESENVOLVIMENTO..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se estamos no diretório raiz
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script a partir do diretório raiz do projeto"
    exit 1
fi

# Copiar arquivo .env.development para .env se não existir
if [ ! -f ".env" ]; then
    echo "📋 Copiando .env.development para .env..."
    cp .env.development .env
    echo -e "${GREEN}✅ Arquivo .env criado${NC}"
else
    echo -e "${YELLOW}⚠️  Arquivo .env já existe. Não será sobrescrito.${NC}"
fi

# Copiar arquivo frontend/.env.development para frontend/.env se não existir
if [ ! -f "frontend/.env" ]; then
    echo "📋 Copiando frontend/.env.development para frontend/.env..."
    cp frontend/.env.development frontend/.env
    echo -e "${GREEN}✅ Arquivo frontend/.env criado${NC}"
else
    echo -e "${YELLOW}⚠️  Arquivo frontend/.env já existe. Não será sobrescrito.${NC}"
fi

# Instalar dependências do backend
echo "📦 Instalando dependências do backend..."
npm install

# Instalar dependências do frontend
echo "📦 Instalando dependências do frontend..."
cd frontend
npm install
cd ..

# Verificar conexão com banco de dados
echo "🔍 Verificando conexão com banco de dados..."
npm run test:mysql-connection || echo -e "${YELLOW}⚠️  Não foi possível conectar ao banco. Verifique as configurações.${NC}"

echo ""
echo -e "${GREEN}✅ Ambiente de desenvolvimento configurado!${NC}"
echo ""
echo "Para iniciar os serviços:"
echo "  Backend:  npm run dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "Ou use o script: ./1run.bat (Windows) ou ./scripts/start-dev.sh (Linux/Mac)"






