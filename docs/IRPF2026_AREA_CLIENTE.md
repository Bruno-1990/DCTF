# Área do Cliente IRPF 2026 (Central)

## Visão geral

- **Login:** `/irpf-2026/cliente/login` (público).
- **Área do cliente:** `/irpf-2026/cliente` (após login com usuário em `irpf2026_usuarios`).
- **Área admin (visão geral):** `/irpf-2026/admin` (após login com e-mail em `irpf2026_admin`).

## Backend

- Rotas em `/api/irpf2026`: auth/login, /me, documentos (list, upload, download), mensagens (list, PATCH lida), admin (visão-geral, usuarios, PUT status, POST mensagens).
- Variável de ambiente opcional: `IRPF2026_JWT_SECRET` (ou `JWT_SECRET`) para assinar o token. Se não existir, usa valor padrão (alterar em produção).
- Upload de arquivos em `uploads/irpf2026/<usuario_id>/`.

## Banco de dados

1. Executar a migration:
   ```bash
   npm run migrate:irpf2026
   ```
   Ou rodar manualmente o SQL: `docs/migrations/mysql/030_irpf2026_area_cliente.sql`.

2. Criar o primeiro administrador (e-mail com permissão para a visão geral):
   - Inserir em `irpf2026_admin` com `senha_hash` gerado por bcrypt (ex.: com `node -e "const bcrypt=require('bcrypt'); bcrypt.hash('SuaSenha', 10).then(h=>console.log(h))"`).
   - Ou usar um script de seed que você criar.

3. Criar usuários da área do cliente em `irpf2026_usuarios` (também com `senha_hash` em bcrypt).

## Frontend

- Context `Irpf2026AuthProvider` em `App.tsx`; token em `localStorage` (`irpf2026_token`).
- Dashboard do cliente: cards (questionário, documentos por categoria com barra de progresso, notificações/mensagens).
- Admin: visão geral (totais, usuários com status e envio de mensagem, tabela de documentos com download).

## Dependências adicionadas

- Backend: `bcrypt`, `jsonwebtoken` (e tipos em dev). Rodar `npm install` na raiz do projeto.
