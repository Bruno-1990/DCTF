#!/usr/bin/env python3
"""
Script para extrair dados de Capital Social do PDF "RELAÇÃO DE SÓCIOS E CAPITAL.pdf"
Busca pelos CNPJs específicos e extrai os valores de Capital Social
"""

import sys
import re
import os
from pathlib import Path

# CNPJs que precisam ser encontrados
CNPJS_BUSCAR = {
    "16632622000253": "BELL TEC TELECOMUNICACOES LTDA",
    "03597050000277": "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD",
    "03597050000510": "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD",
    "03597050000358": "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD",
    "03597050000439": "Centro de Ensino Cachoeirense Darwin Ltda",
    "03597050000196": "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA",
    "48401933000117": "CONSORCIO CONSERVA-VITORIA",
    "39811708000168": "CURTUME SILVESTRE LTDA.",
    "00956216000125": "ESTACIONE ESTACIONAMENTOS LTDA",
    "28397677000124": "SEBASTIAO PEDRO DE FREITAS",
    "30691293000595": "UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA",
}

def limpar_cnpj(cnpj: str) -> str:
    """Remove formatação do CNPJ"""
    return re.sub(r'\D', '', cnpj)

def converter_capital(valor: str) -> float:
    """Converte valor de capital social para float"""
    if not valor or valor.strip() == '':
        return 0.0
    # Remover R$ e espaços
    valor_limpo = valor.replace('R$', '').replace(' ', '').strip()
    # Remover pontos (milhares) e substituir vírgula por ponto
    valor_limpo = valor_limpo.replace('.', '').replace(',', '.')
    try:
        return float(valor_limpo)
    except:
        return 0.0

def buscar_no_pdf(caminho_pdf: str):
    """Busca os CNPJs no PDF e extrai os valores de Capital Social"""
    try:
        import pdfplumber
    except ImportError:
        print("❌ Biblioteca pdfplumber não instalada.")
        print("   Instale com: pip install pdfplumber")
        return {}
    
    resultados = {}
    
    print(f"📄 Lendo PDF: {caminho_pdf}")
    
    with pdfplumber.open(caminho_pdf) as pdf:
        # Extrair todas as tabelas
        todas_tabelas = []
        for page_num, page in enumerate(pdf.pages, 1):
            tabelas = page.extract_tables()
            if tabelas:
                todas_tabelas.extend(tabelas)
        
        # Procurar em tabelas primeiro
        for tabela in todas_tabelas:
            for linha in tabela:
                if not linha or len(linha) < 3:
                    continue
                
                linha_str = ' '.join([str(cell) if cell else '' for cell in linha])
                
                # Procurar por cada CNPJ
                for cnpj_limpo, nome_empresa in CNPJS_BUSCAR.items():
                    if cnpj_limpo in resultados:
                        continue
                    
                    # Buscar CNPJ formatado (com pontos e barra)
                    cnpj_formatado = f"{cnpj_limpo[:2]}.{cnpj_limpo[2:5]}.{cnpj_limpo[5:8]}/{cnpj_limpo[8:12]}-{cnpj_limpo[12:]}"
                    
                    # Verificar se o CNPJ está nesta linha
                    if cnpj_formatado in linha_str or cnpj_limpo in linha_str:
                        # Procurar Capital Social na mesma linha ou próxima
                        for cell in linha:
                            if cell and 'R$' in str(cell):
                                match = re.search(r'R\$\s*([\d.,]+)', str(cell))
                                if match:
                                    valor = converter_capital(match.group(0))
                                    if valor > 0:
                                        resultados[cnpj_limpo] = valor
                                        print(f"✅ {nome_empresa[:50]:<50} | CNPJ: {cnpj_limpo} | Capital: R$ {valor:,.2f}")
                                        break
        
        # Se não encontrou em tabelas, procurar no texto (busca mais ampla)
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            
            # Procurar por cada CNPJ que ainda não foi encontrado
            for cnpj_limpo, nome_empresa in CNPJS_BUSCAR.items():
                if cnpj_limpo in resultados:
                    continue
                
                # Buscar CNPJ formatado (com pontos e barra)
                cnpj_formatado = f"{cnpj_limpo[:2]}.{cnpj_limpo[2:5]}.{cnpj_limpo[5:8]}/{cnpj_limpo[8:12]}-{cnpj_limpo[12:]}"
                
                # Procurar também por parte do nome da empresa
                nome_busca = nome_empresa.split()[0] if nome_empresa else ""
                
                # Procurar CNPJ ou nome no texto
                if cnpj_formatado in text or cnpj_limpo in text or (nome_busca and nome_busca.upper() in text.upper()):
                    # Procurar linha com Capital Social
                    linhas = text.split('\n')
                    for i, linha in enumerate(linhas):
                        # Verificar se linha contém CNPJ ou nome da empresa
                        linha_upper = linha.upper()
                        tem_cnpj = cnpj_formatado in linha or cnpj_limpo in linha
                        tem_nome = nome_busca and nome_busca.upper() in linha_upper
                        
                        if tem_cnpj or tem_nome:
                            # Procurar Capital Social nas linhas próximas (ampliar busca)
                            for j in range(max(0, i-5), min(len(linhas), i+15)):
                                linha_capital = linhas[j]
                                # Procurar por padrões de Capital Social
                                if 'Capital Social' in linha_capital or 'R$' in linha_capital:
                                    # Extrair valor (pode ter múltiplos R$ na linha)
                                    matches = re.findall(r'R\$\s*([\d.,]+)', linha_capital)
                                    for match in matches:
                                        valor = converter_capital(f"R$ {match}")
                                        if valor > 0:
                                            resultados[cnpj_limpo] = valor
                                            print(f"✅ {nome_empresa[:50]:<50} | CNPJ: {cnpj_limpo} | Capital: R$ {valor:,.2f}")
                                            break
                                    if cnpj_limpo in resultados:
                                        break
                            if cnpj_limpo in resultados:
                                break
    
    return resultados

if __name__ == '__main__':
    # Tentar encontrar o PDF
    script_dir = Path(__file__).parent
    possiveis_caminhos = [
        script_dir.parent.parent / "RELAÇÃO DE SÓCIOS E CAPITAL.pdf",
        script_dir.parent.parent / "RELAÇÃO DE SÓCIOS E CAPITAL.PDF",
        Path.home() / "Desktop" / "RELAÇÃO DE SÓCIOS E CAPITAL.pdf",
    ]
    
    pdf_path = None
    for caminho in possiveis_caminhos:
        if caminho.exists():
            pdf_path = caminho
            break
    
    if not pdf_path:
        print("❌ PDF não encontrado. Procurando em:")
        for caminho in possiveis_caminhos:
            print(f"   - {caminho}")
        print("\n💡 Coloque o PDF em um dos locais acima ou forneça o caminho como argumento.")
        sys.exit(1)
    
    resultados = buscar_no_pdf(str(pdf_path))
    
    if resultados:
        print(f"\n📊 Encontrados {len(resultados)} valores:")
        print("\n// Adicionar ao script atualizar-capital-social.ts:")
        for cnpj, valor in resultados.items():
            nome = CNPJS_BUSCAR.get(cnpj, "N/A")
            print(f'  "{cnpj}": {valor:.2f},  // {nome}')
    else:
        print("\n⚠️  Nenhum valor encontrado no PDF.")
        print("   Verifique se o PDF está no formato correto ou forneça os valores manualmente.")

