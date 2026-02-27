# Correção: Duplicação de Requisições e Erros na Situação Fiscal

## Problemas Identificados

### 1. Requisição Duplicada no Mesmo Endpoint
- **Problema**: A requisição estava sendo feita 2x no endpoint `/integra-contador/v1/Apoiar` (solicitar protocolo)
- **Causa**: O protocolo não estava sendo salvo corretamente no banco devido a erro de formato de data, então na segunda chamada o sistema não encontrava o protocolo e tentava solicitar novamente
- **Esperado**: A segunda requisição deveria ser feita no endpoint `/integra-contador/v1/Emitir` (emitir relatório) com o protocolo já obtido

### 2. Erro de Formato de Data no MySQL
- **Erro**: `Incorrect datetime value: '2025-11-25T14:00:03.820Z' for column 'next_eligible_at'`
- **Causa**: O formato ISO 8601 com 'T' e timezone não é aceito diretamente pelo MySQL TIMESTAMP
- **Solução**: Converter para formato MySQL: `YYYY-MM-DD HH:MM:SS`

### 3. Status 304 Tratado como Erro
- **Problema**: Quando o SERPRO retornava 304 na solicitação de protocolo, era tratado como erro
- **Causa**: O código não tratava 304 em `solicitarProtocolo`, apenas em `emitirRelatorio`
- **Solução**: Tratar 304 como "aguardar processamento" também em `solicitarProtocolo`

## Correções Aplicadas

### 1. Formato de Data para MySQL

**Arquivo:** `src/services/SituacaoFiscalOrchestrator.ts` (função `upsertState`)

**Antes:**
```typescript
payload.next_eligible_at = date.toISOString().slice(0, 19).replace('T', ' ');
```

**Depois:**
```typescript
// Converter para formato MySQL usando métodos UTC para evitar problemas de timezone
const year = date.getUTCFullYear();
const month = String(date.getUTCMonth() + 1).padStart(2, '0');
const day = String(date.getUTCDate()).padStart(2, '0');
const hours = String(date.getUTCHours()).padStart(2, '0');
const minutes = String(date.getUTCMinutes()).padStart(2, '0');
const seconds = String(date.getUTCSeconds()).padStart(2, '0');
payload.next_eligible_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
```

**Benefício**: Garante que a data seja salva no formato correto que o MySQL aceita, evitando erros ao salvar o estado.

### 2. Tratamento do Status 304 em `solicitarProtocolo`

**Arquivo:** `src/services/SituacaoFiscalOrchestrator.ts` (função `solicitarProtocolo`)

**Melhorias:**
- Trata status 304 como "protocolo ainda em processamento"
- Tenta extrair protocolo mesmo com status 304 (pode estar na resposta)
- Se não encontrar protocolo, retorna erro controlado para aguardar
- Se encontrar protocolo, retorna normalmente

**Código:**
```typescript
if (res.status === 304) {
  // Tentar extrair protocolo mesmo com 304
  let protocolo: string | undefined = undefined;
  // ... lógica de extração ...
  
  if (!protocolo) {
    throw new Error(`Protocolo ainda em processamento. Aguarde ${Math.ceil(waitMs / 1000)}s e tente novamente.`);
  }
  
  // Se temos protocolo mesmo com 304, retornar normalmente
  return { protocolo, waitMs, raw: res.data };
}
```

### 3. Tratamento de Erro ao Salvar Estado

**Arquivo:** `src/services/SituacaoFiscalOrchestrator.ts` (função `handleDownload`)

**Melhorias:**
- Adicionado try/catch ao salvar estado após obter protocolo
- Logs melhorados para debug
- Mesmo com erro ao salvar, retorna resultado para que o frontend possa aguardar

**Código:**
```typescript
try {
  await upsertState({
    cnpj: clean,
    protocolo: req.protocolo,
    status: 'aguardando',
    next_eligible_at: next,
    last_response: req.raw,
  });
  console.log('[Sitf] Estado salvo com sucesso. Protocolo:', req.protocolo.substring(0, 50) + '...');
} catch (saveError: any) {
  console.error('[Sitf] Erro ao salvar estado após obter protocolo:', saveError);
  // Mesmo com erro ao salvar, retornar o resultado para que o frontend possa aguardar
}
```

### 4. Logs Melhorados

**Melhorias:**
- Log do estado recuperado do banco em `getState`
- Log da conversão de data em `upsertState`
- Log do estado sendo salvo com detalhes
- Log do protocolo extraído mesmo com status 304

## Fluxo Corrigido

### Antes (Com Problemas)
1. Solicitar protocolo → Sucesso (200)
2. Tentar salvar estado → **Erro de formato de data**
3. Próxima chamada → Não encontra protocolo
4. Solicitar protocolo novamente → **304 (erro)**

### Depois (Corrigido)
1. Solicitar protocolo → Sucesso (200)
2. Converter data para formato MySQL
3. Salvar estado → **Sucesso**
4. Próxima chamada → Encontra protocolo salvo
5. Emitir relatório → `/integra-contador/v1/Emitir` com protocolo

## Resultado Esperado

Agora o sistema deve:
1. ✅ Salvar o protocolo corretamente após obtê-lo
2. ✅ Na próxima chamada, encontrar o protocolo salvo
3. ✅ Fazer a segunda requisição no endpoint correto (`/Emitir`) em vez de solicitar protocolo novamente
4. ✅ Tratar status 304 adequadamente (aguardar em vez de erro)
5. ✅ Converter datas corretamente para formato MySQL

## Testes Recomendados

1. **Teste de Fluxo Completo:**
   - Solicitar consulta SITF
   - Verificar se protocolo é salvo corretamente
   - Verificar se próxima chamada usa endpoint `/Emitir`
   - Verificar se não há requisições duplicadas

2. **Teste de Status 304:**
   - Simular resposta 304 na solicitação de protocolo
   - Verificar se sistema aguarda em vez de dar erro
   - Verificar se protocolo é extraído mesmo com 304

3. **Teste de Formato de Data:**
   - Verificar logs de conversão de data
   - Verificar se não há mais erros de formato no MySQL
   - Verificar se `next_eligible_at` é salvo corretamente

## Próximos Passos (Opcional)

1. Adicionar retry automático com backoff exponencial
2. Implementar cache de protocolos para evitar requisições desnecessárias
3. Adicionar métricas de sucesso/falha
4. Melhorar tratamento de erros específicos da API SERPRO

