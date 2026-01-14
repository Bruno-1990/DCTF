# Script de Atualização de Código SCI

Este script atualiza a tabela de clientes com o campo `codigo_sci` a partir de um arquivo de texto exportado do sistema SCI.

## Funcionalidades

- ✅ Lê arquivo de texto com código SCI e CNPJ dos clientes
- ✅ Normaliza CNPJ antes de fazer match (remove formatação)
- ✅ Cria a coluna `codigo_sci` automaticamente se não existir
- ✅ Atualiza clientes existentes fazendo match por CNPJ
- ✅ Gera log detalhado em JSON com todos os resultados
- ✅ Exibe resumo no console

## Como usar

### 1. Preparar o arquivo

Coloque o arquivo `Impressão de campos da consulta.txt` em um dos seguintes locais:
- Na pasta Desktop: `C:\Users\bruno\Desktop\`
- Na raiz do projeto

### 2. Executar o script

```bash
# Na raiz do projeto
npm run ts-node src/scripts/update-clientes-codigo-sci.ts

# Ou usando tsx
npx tsx src/scripts/update-clientes-codigo-sci.ts
```

### 3. Verificar resultados

O script irá:
- Exibir um resumo no console
- Salvar um arquivo de log JSON na mesma pasta do arquivo de entrada
- O log contém detalhes de todos os clientes processados

## Formato do arquivo esperado

O arquivo deve ter o seguinte formato:

```
      Código   Razão social
 CNPJ
           1   A.C RAUPP SERVICOS ADMINISTRATIVOS
  13.845.695/0001-54
           2   ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA
  11.318.082/0001-33
```

O script ignora automaticamente:
- Cabeçalhos e rodapés
- Linhas de página
- Linhas vazias
- Informações de data/hora

## Estrutura do Log

O arquivo de log JSON contém:

```json
{
  "totalLinhas": 100,
  "clientesProcessados": 100,
  "clientesAtualizados": 95,
  "clientesNaoEncontrados": 5,
  "erros": [],
  "detalhes": [
    {
      "codigo_sci": "1",
      "cnpj": "13.845.695/0001-54",
      "razao_social": "A.C RAUPP SERVICOS ADMINISTRATIVOS",
      "status": "atualizado",
      "mensagem": "Código SCI 1 atualizado com sucesso"
    }
  ]
}
```

## Tratamento de CNPJ

O script:
- Remove toda formatação do CNPJ (pontos, barras, hífens)
- Valida que o CNPJ tem exatamente 14 dígitos
- Faz match usando o CNPJ limpo (`cnpj_limpo`) na tabela

## Segurança

- O script usa transações do MySQL
- Em caso de erro, todas as alterações são revertidas (rollback)
- Não altera dados existentes se o match falhar

## Troubleshooting

### Arquivo não encontrado
- Verifique se o arquivo está em um dos locais esperados
- O script tentará múltiplos caminhos automaticamente

### Nenhum cliente encontrado
- Verifique o formato do arquivo
- O script pode não estar parseando corretamente o formato
- Verifique o console para mensagens de aviso

### Clientes não encontrados no banco
- Verifique se os CNPJs no arquivo correspondem aos CNPJs no banco
- O script normaliza CNPJs, mas pode haver diferenças
- Verifique o log JSON para ver quais clientes não foram encontrados


