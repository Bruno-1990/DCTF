#!/bin/bash

# ============================================
# Script Helper para Configurar Ambientes
# ============================================

set -e

echo "🔧 Configurador de Ambientes - DCTF MPC"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Menu
echo "Selecione o ambiente que deseja configurar:"
echo "  1) Desenvolvimento"
echo "  2) Produção"
echo ""
read -p "Opção (1 ou 2): " option

case $option in
  1)
    echo -e "${BLUE}📋 Configurando ambiente de DESENVOLVIMENTO...${NC}"
    
    if [ -f ".env.development.example" ]; then
      if [ ! -f ".env.development" ]; then
        cp .env.development.example .env.development
        echo -e "${GREEN}✅ Arquivo .env.development criado${NC}"
      else
        echo -e "${YELLOW}⚠️  Arquivo .env.development já existe${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  Arquivo .env.development.example não encontrado${NC}"
    fi
    
    if [ ! -f ".env" ]; then
      if [ -f ".env.development" ]; then
        cp .env.development .env
        echo -e "${GREEN}✅ Arquivo .env criado a partir de .env.development${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  Arquivo .env já existe. Não será sobrescrito.${NC}"
    fi
    
    if [ ! -f "frontend/.env" ]; then
      if [ -f "frontend/.env.development" ]; then
        cp frontend/.env.development frontend/.env
        echo -e "${GREEN}✅ Arquivo frontend/.env criado${NC}"
      else
        echo "VITE_API_URL=http://localhost:3000" > frontend/.env
        echo -e "${GREEN}✅ Arquivo frontend/.env criado com valores padrão${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  Arquivo frontend/.env já existe${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ Ambiente de desenvolvimento configurado!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Edite .env.development com suas configurações locais"
    echo "  2. Execute: npm install"
    echo "  3. Execute: npm run dev"
    ;;
    
  2)
    echo -e "${BLUE}📋 Configurando ambiente de PRODUÇÃO...${NC}"
    
    if [ -f ".env.production.example" ]; then
      if [ ! -f ".env.production" ]; then
        cp .env.production.example .env.production
        echo -e "${GREEN}✅ Arquivo .env.production criado${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANTE: Edite .env.production com suas credenciais de produção!${NC}"
      else
        echo -e "${YELLOW}⚠️  Arquivo .env.production já existe${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  Arquivo .env.production.example não encontrado${NC}"
    fi
    
    if [ ! -f "frontend/.env.production" ]; then
      if [ -f "frontend/.env.production.example" ]; then
        cp frontend/.env.production.example frontend/.env.production
        echo -e "${GREEN}✅ Arquivo frontend/.env.production criado${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANTE: Edite frontend/.env.production com a URL de produção!${NC}"
      else
        echo "VITE_API_URL=https://api.seu-dominio.com" > frontend/.env.production
        echo -e "${GREEN}✅ Arquivo frontend/.env.production criado com valores padrão${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANTE: Edite frontend/.env.production com a URL de produção!${NC}"
      fi
    else
      echo -e "${YELLOW}⚠️  Arquivo frontend/.env.production já existe${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ Arquivos de produção criados!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Edite .env.production com suas credenciais de produção"
    echo "  2. Edite frontend/.env.production com a URL de produção"
    echo "  3. Execute: bash scripts/deploy-production.sh"
    ;;
    
  *)
    echo -e "${YELLOW}Opção inválida${NC}"
    exit 1
    ;;
esac






