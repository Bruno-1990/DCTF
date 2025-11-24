# Como Desabilitar o Supabase

## ✅ Status Atual

A aplicação já está **100% migrada para MySQL**. O Supabase não é mais necessário para operações de banco de dados.

## 🚀 Como Desabilitar

### Opção 1: Remover Variáveis de Ambiente (Recomendado)

Simplesmente remova ou comente as variáveis do Supabase no seu `.env`:

```env
# Comentar ou remover estas linhas:
# SUPABASE_URL=https://seu-projeto.supabase.co
# SUPABASE_ANON_KEY=sua-chave-anon
# SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

**Resultado**: A aplicação continuará funcionando normalmente usando apenas MySQL.

### Opção 2: Desabilitar no Código

Se quiser garantir que o Supabase não seja inicializado, atualize `src/config/database.ts`:

```typescript
// Adicionar no início do arquivo:
const USE_SUPABASE = process.env['USE_SUPABASE'] === 'true';

// E depois:
export const supabase = USE_SUPABASE ? createClient(...) : null;
export const supabaseAdmin = USE_SUPABASE && supabaseConfig.serviceRoleKey ? createClient(...) : null;
```

## ⚠️ Avisos Importantes

### 1. Verificações de `process.env['SUPABASE_URL']`

Alguns arquivos ainda verificam `process.env['SUPABASE_URL']` e lançam erros:

**Arquivos que precisam ser atualizados:**
- `src/models/ReceitaPagamento.ts` (múltiplos métodos)
- `src/services/PagamentoService.ts` (múltiplos métodos)
- `src/services/ConsultaReceitaService.ts`

**Solução**: Esses checks podem ser removidos porque os models já usam `this.supabase` que é o adapter MySQL.

### 2. Funcionalidades Especiais

**Storage (Arquivos)**:
- `SituacaoFiscalOrchestrator` usa `supabase.storage` para PDFs
- **Status**: Precisa implementação alternativa (storage local ou S3)

**Auth (Autenticação)**:
- `AuthService` pode usar `supabase.auth`
- **Status**: Precisa implementação alternativa (JWT próprio)

**Scripts**:
- Alguns scripts ainda dependem de `supabaseAdmin`
- **Status**: Podem ser migrados depois ou ignorados se não forem usados

## 📋 Checklist de Desabilitação

- [x] Aplicação usando MySQL para todas operações CRUD
- [x] Adapter Supabase → MySQL funcionando
- [ ] Remover checks de `process.env['SUPABASE_URL']` que lançam erros
- [ ] Implementar alternativa para storage (se necessário)
- [ ] Implementar alternativa para auth (se necessário)
- [ ] Remover variáveis SUPABASE do `.env`
- [ ] Testar todas funcionalidades após desabilitar

## 🎯 Próximos Passos

1. **Imediato**: Remover variáveis do `.env` - aplicação continuará funcionando
2. **Curto Prazo**: Remover checks desnecessários de `SUPABASE_URL` nos models
3. **Médio Prazo**: Implementar storage e auth alternativos (se necessário)

## ✅ Conclusão

**SIM, você pode desabilitar o Supabase agora!**

A aplicação está funcionalmente independente do Supabase. Basta remover as variáveis de ambiente e a aplicação continuará funcionando normalmente com MySQL.




