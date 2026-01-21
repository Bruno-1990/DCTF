# Atualização de Regimes Tributários em Massa

Este script permite atualizar o campo `regime_tributario` de múltiplos clientes de uma vez, a partir de um arquivo de texto.

## Pré-requisitos

1. **Backend rodando**: O servidor deve estar ativo em `http://localhost:3000`
2. **Arquivo de tributação**: Deve estar em `C:\Users\bruno\Desktop\tribução.txt`

## Formato do Arquivo

O arquivo deve ter o seguinte formato (separado por TAB):

```
00.212.745/0001-14	SIMPLES NACIONAL
00.956.216/0001-25	SIMPLES NACIONAL
02.611.161/0001-47	LUCRO REAL
27.226.935/0001-47	LUCRO PRESUMIDO
```

Cada linha contém:
- **CNPJ** (com ou sem formatação)
- **TAB** (tecla Tab)
- **Regime Tributário** (SIMPLES NACIONAL, LUCRO REAL, ou LUCRO PRESUMIDO)

## Como Usar

### 1. Certifique-se que o backend está rodando

```bash
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
npm run dev
```

### 2. Execute o script (em outro terminal)

```bash
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
npx ts-node --transpile-only scripts/atualizar-regimes.ts
```

### 3. Aguarde a conclusão

O script irá:
1. Ler o arquivo de tributação
2. Aguardar 3 segundos para confirmaçãoprocessar cada CNPJ
4. Atualizar o banco de dados
5. Exibir um relatório com o resultado

## Resultado

Após a execução, você verá:

```
✅ Atualização concluída!

📊 Resumo:
   • Total de registros: 160
   • ✅ Atualizados: 145
   • ❓ Não encontrados: 12
   • ❌ Erros: 3
```

Um relatório completo será salvo em `logs/relatorio-regimes-[timestamp].json`

## O que o script faz

- **Limpa o CNPJ**: Remove pontos, barras e traços automaticamente
- **Valida**: Verifica se o CNPJ tem 14 dígitos
- **Busca no banco**: Procura o cliente pelo CNPJ limpo
- **Atualiza**: Modifica apenas o campo `regime_tributario`
- **Relata**: Informa o resultado de cada operação

## Estados Possíveis

- **✅ Atualizado**: Cliente encontrado e atualizado com sucesso
- **❓ Não encontrado**: Cliente não existe no banco de dados
- **❌ Erro**: CNPJ inválido ou erro ao atualizar

## Observações

- ⚠️ **Clientes não encontrados não serão criados automaticamente**
- ✅ **Clientes existentes terão o regime atualizado**
- 🔄 **O script pode ser executado múltiplas vezes**
- 📝 **Um backup dos dados é recomendado antes da execução**

## Logs

Os logs detalhados são salvos em:
- `logs/relatorio-regimes-[timestamp].json` - Relatório completo com todos os detalhes








