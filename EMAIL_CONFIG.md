# 📧 Configuração de Email - Sistema DCTF

## 🎯 Objetivo

O sistema agora envia emails automatizados com todas as DCTFs em status "Em andamento" para `ti@central-rnc.com.br`.

## ⚙️ Configuração

### 1. Configurar Variáveis de Ambiente

Edite o arquivo `.env` na raiz do projeto:

```env
# ============================================================================
# CONFIGURAÇÃO DE EMAIL (Gmail SMTP)
# ============================================================================
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=sua-senha-app-aqui
```

### 2. Gerar Senha de Aplicativo do Gmail

**IMPORTANTE:** Não use a senha normal do Gmail! Use uma senha de aplicativo:

1. Acesse: https://myaccount.google.com/apppasswords
2. Entre na sua conta Google (o email que será o remetente)
3. Selecione "App" → "Outro (nome personalizado)"
4. Digite: "Sistema DCTF"
5. Clique em "Gerar"
6. Copie a senha de 16 caracteres gerada
7. Cole no `.env` em `EMAIL_PASSWORD`

**Exemplo de senha de aplicativo:**
```
abcd efgh ijkl mnop  (sem espaços no .env)
abcdefghijklmnop
```

### 3. Configurar Email Remetente

No `.env`, configure:
```env
EMAIL_USER=ti@central-rnc.com.br
EMAIL_PASSWORD=abcdefghijklmnop
```

**Observação:** Se `ti@central-rnc.com.br` for um domínio personalizado (não Gmail), você precisará configurar SMTP diferente em `src/services/EmailService.ts`.

## 🔧 Configuração para Domínio Personalizado

Se não for Gmail, edite `src/services/EmailService.ts`:

```typescript
this.transporter = nodemailer.createTransport({
  host: 'smtp.seudominio.com.br',  // Servidor SMTP
  port: 587,                         // Porta (587 ou 465)
  secure: false,                     // true para porta 465, false para outras
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

## 📧 Como Usar

### Frontend (Página Administração)

1. Acesse `http://localhost:5173/administracao`
2. Role até a seção "Enviar Email - DCTFs em Andamento" (card roxo)
3. Clique no botão **"Enviar Email para TI"**
4. Aguarde confirmação de sucesso

### Via API (Postman/curl)

```bash
POST http://localhost:3000/api/dctf/admin/send-email-pending

# Resposta de sucesso:
{
  "success": true,
  "message": "Email enviado com sucesso para ti@central-rnc.com.br",
  "data": {
    "total": 150,
    "destinatario": "ti@central-rnc.com.br"
  }
}
```

## 📊 Formato do Email

O email HTML gerado inclui:

### 📋 Cabeçalho
- Título: "DCTFs em Andamento"
- Subtítulo: "Relatório de Declarações Aguardando Processamento"

### 📈 Painel de Resumo (Cards)
1. **Total de Registros:** Quantidade total de DCTFs em andamento
2. **Débito Apurado Total:** Soma de todos os débitos
3. **Saldo a Pagar Total:** Soma de todos os saldos

### 📋 Tabela Detalhada
Colunas:
- Número de Identificação (CNPJ + Tipo NI)
- Período
- Data/Hora Transmissão
- Categoria
- Origem
- Tipo
- Situação (badge amarelo)
- Débito Apurado (vermelho)
- Saldo a Pagar (amarelo)

### 🎨 Design
- Layout responsivo e moderno
- Cores bem definidas para fácil leitura
- Badges coloridos para status
- Valores monetários em destaque
- Footer com timestamp de geração

## 🐛 Troubleshooting

### Erro: "Authentication failed"
**Solução:** Verifique se:
- Usou senha de aplicativo (não senha normal)
- Copiou a senha completa sem espaços
- Ativou acesso de apps menos seguros (se necessário)

### Erro: "Email not sent"
**Solução:**
- Verifique conexão com internet
- Confirme que o Gmail permite SMTP
- Tente desabilitar antivírus temporariamente

### Email não chega
**Solução:**
- Verifique pasta de SPAM/Lixo eletrônico
- Confirme que o email destinatário está correto
- Verifique logs do backend para mensagens de erro

## 📝 Logs

O backend registra no console:

```
[Email] Enviando email para: ti@central-rnc.com.br
[Email] ✅ Email enviado com sucesso: <message-id>
```

Ou em caso de erro:
```
[Email] ❌ Erro ao enviar email: [detalhes do erro]
```

## 🔐 Segurança

- ✅ Senha de aplicativo (não expõe senha real)
- ✅ Variáveis de ambiente (não commitadas no Git)
- ✅ Apenas administradores autenticados podem enviar
- ✅ Email destinatário fixo no código (não manipulável)

## 📚 Dependências

```json
{
  "nodemailer": "^6.9.x",
  "@types/nodemailer": "^6.4.x"
}
```

Instaladas via:
```bash
npm install nodemailer @types/nodemailer
```

## 🎯 Endpoints

### POST `/api/dctf/admin/send-email-pending`
Envia email com DCTFs em andamento.

**Response:**
```json
{
  "success": true,
  "message": "Email enviado com sucesso para ti@central-rnc.com.br",
  "data": {
    "total": 150,
    "destinatario": "ti@central-rnc.com.br"
  }
}
```

## ✨ Recursos

- ✅ HTML responsivo e bem formatado
- ✅ Totalizadores automáticos
- ✅ Design moderno com gradientes
- ✅ Badges coloridos para status
- ✅ Valores monetários destacados
- ✅ Timestamp de geração
- ✅ Tratamento de casos sem dados
- ✅ Hover effects nas linhas da tabela
- ✅ Alternância de cores nas linhas (zebra)
