# Relatório de Vulnerabilidades - DCTF MPC

**Data:** 2026-01-15  
**Total de Vulnerabilidades:** 25
- 5 low
- 17 moderate  
- 3 high

---

## 🔴 Vulnerabilidades Críticas (High Severity)

### 1. xlsx (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)
- **Severidade:** High
- **Status:** ⚠️ **NO FIX AVAILABLE**
- **Problemas:**
  - Prototype Pollution in sheetJS
  - Regular Expression Denial of Service (ReDoS)
- **Localização:** `src/services/DCTFSpreadsheetService.ts`
- **Solução Recomendada:** Substituir por `exceljs` (já instalado no projeto)

### 2. ts-node (múltiplas versões)
- **Severidade:** Moderate/High
- **Status:** ✅ Fix disponível (atualizado para 10.9.2)
- **Localização:** Dependência de `jest` e scripts de desenvolvimento

---

## 📋 Ações Recomendadas

### ✅ Ação Imediata: Substituir xlsx por exceljs

O projeto já possui `exceljs` instalado, que é uma alternativa mais segura e moderna.

**Arquivo afetado:** `src/services/DCTFSpreadsheetService.ts`

**Vantagens do exceljs:**
- ✅ Sem vulnerabilidades conhecidas
- ✅ Melhor performance
- ✅ API mais moderna
- ✅ Suporte a estilos e formatação avançada
- ✅ Já está instalado no projeto

### ⚠️ Dependências Atualizadas com Breaking Changes

O `npm audit fix --force` atualizou:
- `task-master-ai`: 0.31.2 → 0.18.0 (downgrade - verificar)
- `jest`: ^29.7.0 → 30.2.0 (major update)
- `ts-jest`: ^29.1.1 → 29.4.6 (minor update)

**Recomendação:** Testar a aplicação após essas atualizações.

---

## 🔧 Plano de Ação

### Fase 1: Substituir xlsx (URGENTE)
1. Refatorar `DCTFSpreadsheetService.ts` para usar `exceljs`
2. Remover dependência `xlsx` do `package.json`
3. Testar funcionalidades de exportação Excel

### Fase 2: Verificar Dependências Atualizadas
1. Executar testes: `npm test`
2. Verificar se `task-master-ai` funciona corretamente
3. Verificar se `jest` 30.x não quebrou nada

### Fase 3: Atualizar Dependências Restantes
1. Executar `npm audit fix` (sem --force)
2. Revisar vulnerabilidades moderadas
3. Atualizar manualmente se necessário

---

## 📊 Status Atual

| Dependência | Versão Atual | Vulnerabilidades | Status |
|------------|--------------|------------------|--------|
| xlsx | 0.18.5 | 2 high (no fix) | 🔴 **URGENTE** |
| ts-node | 1.7.1 / 10.9.2 | Moderate | ⚠️ Monitorar |
| task-master-ai | 0.18.0 | Moderate | ✅ Atualizado |
| jest | 30.2.0 | Moderate | ✅ Atualizado |
| ts-jest | 29.4.6 | Moderate | ✅ Atualizado |

---

## 🛡️ Mitigações Temporárias

Enquanto não substituir o `xlsx`:

1. **Validar inputs:** Garantir que apenas arquivos Excel confiáveis sejam processados
2. **Isolar processamento:** Executar operações com xlsx em contexto isolado
3. **Limitar tamanho:** Restringir tamanho máximo de arquivos processados
4. **Monitorar logs:** Acompanhar tentativas de exploração

---

## 📝 Notas

- O `exceljs` já está instalado e é usado em outras partes do projeto
- A substituição de `xlsx` por `exceljs` deve ser prioridade
- As vulnerabilidades em `ts-node` são principalmente em ambiente de desenvolvimento
- As atualizações forçadas podem ter introduzido breaking changes - testar cuidadosamente

---

**Última atualização:** 2026-01-15






