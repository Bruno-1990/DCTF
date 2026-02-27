# Sincronização de Declarações DCTF: Supabase → MySQL

## Visão Geral

Sistema de sincronização administrativa para transferir declarações DCTF do Supabase para MySQL. Esta funcionalidade permite que o administrador atualize os dados do MySQL com os dados mais recentes do Supabase, que são alimentados pelo agente N8N.

## Fluxo de Dados

```
N8N Agent → Supabase (dctf_declaracoes) → [Sincronização] → MySQL (dctf_declaracoes)
```

## Fluxo de Operação Administrativa

**IMPORTANTE:** Execute as operações nesta ordem:

1. **Limpar dados do MySQL** (botão vermelho)
   - Remove todos os dados da tabela `dctf_declaracoes` no **MySQL**
   - Remove todos os dados da tabela `dctf_dados` no **MySQL**
   - **NÃO afeta** os dados no Supabase

2. **Sincronizar do Supabase** (botão verde)
   - Busca todos os dados da tabela `dctf_declaracoes` no **Supabase**
   - Insere/atualiza os dados na tabela `dctf_declaracoes` no **MySQL**
   - **NÃO modifica** os dados no Supabase

## Funcionalidades Implementadas

### 1. Serviço de Sincronização (`DCTFSyncService`)

**Arquivo:** `src/services/DCTFSyncService.ts`

**Características:**
- ✅ Verifica se Supabase está disponível
- ✅ Busca dados em lotes de 100 registros (configurável)
- ✅ Processa registros sequencialmente para evitar sobrecarga
- ✅ Usa `upsert` para evitar duplicatas (insere novos, atualiza existentes)
- ✅ Reporta progresso em tempo real
- ✅ Mapeia campos do Supabase para formato MySQL

**Métodos Principais:**
- `isSupabaseAvailable()`: Verifica se Supabase está configurado
- `syncFromSupabase(onProgress?)`: Executa a sincronização completa

### 2. Endpoint de API

**Rota:** `POST /api/dctf/admin/sync`

**Controller:** `DCTFController.sincronizarDoSupabase()`

**Resposta:**
```json
{
  "success": true,
  "message": "Sincronização concluída: X inseridos, Y atualizados, Z erros",
  "data": {
    "total": 1000,
    "processed": 1000,
    "inserted": 500,
    "updated": 500,
    "errors": 0,
    "currentBatch": 10,
    "totalBatches": 10
  }
}
```

### 3. Interface Administrativa

**Localização:** `frontend/src/pages/Administracao.tsx`

**Seção:** "Sincronização de Declarações DCTF"

**Funcionalidades:**
- ✅ Botão "Sincronizar do Supabase para MySQL"
- ✅ Exibição de progresso em tempo real
- ✅ Estatísticas detalhadas (total, processados, inseridos, atualizados, erros)
- ✅ Barra de progresso visual
- ✅ Mensagens de sucesso/erro
- ✅ Recarregamento automático após conclusão

## Como Usar

### 1. Pré-requisitos

- Supabase configurado no `.env`:
  ```env
  SUPABASE_URL=https://seu-projeto.supabase.co
  SUPABASE_ANON_KEY=sua-chave-anon
  ```

- Acesso à área administrativa (usuário: `Admin`, senha: `Admin`)

### 2. Fluxo de Uso

1. **Acesse a área administrativa:**
   - Navegue para `/administracao`
   - Faça login com credenciais administrativas

2. **Localize a seção de sincronização:**
   - Encontre a seção verde "Sincronização de Declarações DCTF"
   - Leia as instruções e recomendações

3. **Execute a sincronização:**
   - Clique no botão "Sincronizar do Supabase para MySQL"
   - Aguarde o processamento (pode levar alguns minutos)
   - Acompanhe o progresso em tempo real

4. **Verifique os resultados:**
   - Veja as estatísticas de inseridos/atualizados
   - Verifique se há erros
   - A página será recarregada automaticamente após 3 segundos

## Mapeamento de Campos

O serviço mapeia automaticamente os campos do Supabase para o formato MySQL:

| Supabase | MySQL | Observações |
|----------|-------|------------|
| `id` | `id` | UUID |
| `cliente_id` | `cliente_id` | FK para clientes |
| `periodo_apuracao` ou `periodo` | `periodo_apuracao` | Período de apuração |
| `data_declaracao` ou `dataDeclaracao` | `data_declaracao` | Data da declaração |
| `data_transmissao` ou `dataTransmissao` | `data_transmissao` | Data de transmissão |
| `numero_recibo` ou `numeroRecibo` | `numero_recibo` | Número do recibo |
| `situacao` | `situacao` | Situação da declaração |
| `tipo` | `tipo` | Tipo da declaração |
| `cnpj` | `cnpj` | CNPJ do contribuinte |
| `created_at` | `created_at` | Data de criação |
| `updated_at` | `updated_at` | Data de atualização |

## Processamento em Lotes

O sistema processa os dados em lotes de **100 registros** por vez para:
- ✅ Evitar sobrecarga do banco de dados
- ✅ Permitir acompanhamento de progresso
- ✅ Facilitar tratamento de erros
- ✅ Reduzir uso de memória

## Tratamento de Erros

- **Erros individuais:** Registros com erro são contabilizados, mas não interrompem o processo
- **Erros de conexão:** Se Supabase não estiver disponível, retorna erro claro
- **Erros de validação:** Campos inválidos são logados, mas não bloqueiam outros registros

## Segurança

- ✅ Apenas usuários autenticados na área administrativa podem executar
- ✅ Operação é segura e pode ser executada múltiplas vezes
- ✅ Não duplica dados (usa upsert com `id` como chave)

## Performance

- **Tempo estimado:** ~1-2 segundos por lote de 100 registros
- **Exemplo:** 1000 registros ≈ 10-20 segundos
- **Otimizações:**
  - Processamento em lotes
  - Delay de 100ms entre lotes
  - Upsert eficiente (uma query por registro)

## Logs

O sistema gera logs detalhados no console do backend:

```
[DCTF Sync] Iniciando sincronização do Supabase para MySQL...
[DCTF Sync] Total de registros no Supabase: 1000
[DCTF Sync] Processando lote 1/10 (registros 1-100)
[DCTF Sync] Processando lote 2/10 (registros 101-200)
...
[DCTF Sync] Sincronização concluída: { total: 1000, processed: 1000, ... }
```

## Recomendações de Uso

1. **Frequência:** Execute após cada atualização do agente N8N
2. **Horário:** Preferencialmente em horários de baixo uso
3. **Backup:** Sempre faça backup antes de operações administrativas importantes
4. **Monitoramento:** Acompanhe os logs para identificar problemas

## Troubleshooting

### Erro: "Supabase não está configurado"
- **Solução:** Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env`

### Erro: "Erro ao contar registros no Supabase"
- **Causa:** Problema de conexão ou permissões
- **Solução:** Verifique as credenciais do Supabase

### Sincronização muito lenta
- **Causa:** Muitos registros ou conexão lenta
- **Solução:** Normal para grandes volumes. Aguarde a conclusão.

### Registros não aparecem após sincronização
- **Causa:** Possível erro de mapeamento de campos
- **Solução:** Verifique os logs do backend para erros específicos

## Próximas Melhorias (Opcional)

- [ ] Sincronização incremental (apenas registros novos/modificados)
- [ ] Sincronização agendada (cron job)
- [ ] Notificações por email ao concluir
- [ ] Histórico de sincronizações
- [ ] Rollback de sincronizações

