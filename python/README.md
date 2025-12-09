# Script Python - Banco de Horas SCI

Este diretório contém o script Python para geração de relatórios de banco de horas do sistema SCI.

## Estrutura

```
python/
├── banco_horas_sci.py    # Script principal
├── core/
│   ├── __init__.py
│   └── connection.py     # Classe de conexão com Firebird
├── config/
│   ├── __init__.py
│   └── database.py      # Configuração do banco de dados
├── requirements.txt      # Dependências Python
└── README.md            # Este arquivo
```

## Instalação

1. Certifique-se de ter Python 3.8+ instalado
2. Instale as dependências:

```bash
cd python
pip install -r requirements.txt
```

## Configuração

As configurações do banco de dados SCI são carregadas do arquivo `.env` na raiz do projeto DCTF_MPC:

```env
SCI_FB_HOST=192.168.0.2
SCI_FB_DATABASE=S:\SCI\banco\VSCI.SDB
SCI_FB_USER=INTEGRACOES
SCI_FB_PASSWORD=8t0Ry!W,
SCI_FB_DLL_PATH=C:\caminho\para\fbclient.dll  # Opcional
```

## Uso

O script é chamado automaticamente pelo serviço `BancoHorasService.ts` quando um relatório é solicitado através da interface web.

Para uso manual:

```python
from banco_horas_sci import gerar_ficha_horas
from datetime import date

# Gerar relatório para um período
df = gerar_ficha_horas(
    cnpj='09.471.676/0001-38',
    data_inicial=date(2023, 1, 1),
    data_final=date(2023, 12, 31)
)
```

## Funcionalidades

- **Busca colaboradores ativos**: Filtra apenas colaboradores com registros de folha no período
- **Horas trabalhadas**: Usa verba 5 (converte dias para horas: 30 dias = 220 horas)
- **Horas extras**: Usa verbas 603, 605, 608, 613, 615
- **Geração de planilhas**:
  - Planilha completa: Todas as colunas separadas (horas trabalhadas e extras por mês)
  - Planilha formatada: Colunas consolidadas (horas trabalhadas + extras por mês)

## Notas

- O script gera os arquivos Excel no mesmo diretório onde está sendo executado
- Os arquivos gerados têm o formato: `Banco_Horas_SCI_{codigo_empresa}_{periodo}_{timestamp}.xlsx`
- A planilha formatada tem sufixo `_FORMATADO.xlsx`




