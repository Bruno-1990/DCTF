#!/usr/bin/env python3
"""
Script para extrair valores de Capital Social do PDF
Busca pelos CNPJs específicos que estão sem capital_social no banco
"""

import sys
import re

# CNPJs que precisam ser encontrados no PDF
CNPJS_BUSCAR = [
    "16632622000253",  # BELL TEC TELECOMUNICACOES LTDA
    "03597050000277",  # CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
    "03597050000510",  # CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
    "03597050000358",  # CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD
    "03597050000439",  # Centro de Ensino Cachoeirense Darwin Ltda
    "03597050000196",  # CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA
    "48401933000117",  # CONSORCIO CONSERVA-VITORIA
    "39811708000168",  # CURTUME SILVESTRE LTDA.
    "00956216000125",  # ESTACIONE ESTACIONAMENTOS LTDA
    "28397677000124",  # SEBASTIAO PEDRO DE FREITAS
    "30691293000595",  # UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA
]

def limpar_cnpj(cnpj: str) -> str:
    """Remove formatação do CNPJ"""
    return re.sub(r'\D', '', cnpj)

def converter_capital(valor: str) -> float:
    """Converte valor de capital social para float"""
    if not valor or valor.strip() == '':
        return 0.0
    valor_limpo = valor.replace('R$', '').replace(' ', '').replace('.', '').replace(',', '.')
    try:
        return float(valor_limpo)
    except:
        return 0.0

# Dados do PDF (extrair manualmente ou via PDF parser)
# Por enquanto, vou criar uma estrutura para adicionar os valores
DADOS_EXTRAIDOS = {
    # Adicionar aqui os valores encontrados no PDF
}

if __name__ == '__main__':
    print("📄 Para extrair os valores do PDF, você pode:")
    print("1. Abrir o PDF e buscar pelos CNPJs listados")
    print("2. Usar uma biblioteca de PDF parsing (PyPDF2, pdfplumber)")
    print("3. Fornecer os valores manualmente")
    print("\nCNPJs a buscar:")
    for cnpj in CNPJS_BUSCAR:
        print(f"   - {cnpj}")

