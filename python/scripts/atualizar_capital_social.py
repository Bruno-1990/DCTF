#!/usr/bin/env python3
"""
Script para atualizar capital_social na tabela clientes
usando dados do PDF "RELAÇÃO DE SÓCIOS E CAPITAL.pdf"
Faz match por CNPJ e atualiza o campo capital_social

Uso:
    python atualizar_capital_social.py [--csv arquivo.csv] [--dry-run]
    
    --csv: Arquivo CSV com colunas CNPJ e Capital_Social (opcional)
    --dry-run: Apenas simula, não atualiza o banco
"""

import sys
import os
import re
import csv
import argparse
import mysql.connector
from mysql.connector import Error
from typing import Dict, List, Tuple
from pathlib import Path

# Adicionar o diretório raiz ao path para importar configurações
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

# Dados extraídos do PDF (fallback se CSV não for fornecido)
# Formato: {CNPJ_LIMPO: Capital Social}
DADOS_PDF = {
    "42081159000128": 1000.00,  # A G A P LTDA
    "13845695000154": 10000.00,  # A.C RAUPP SERVICOS ADMINISTRATIVOS
    "11318082000133": 80000.00,  # ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA
    "43340265000141": 1000.00,  # ACBL INFORMACOES LTDA
    "07799121000194": 850000.00,  # ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA
    "47306185000120": 20000.00,  # AI PORT CONSULTORIA LTDA
    "36578434000110": 20000.00,  # ARAME NOBRE INDUSTRIA E COMERCIO LTDA
    "42532281000173": 200000.00,  # ARAUCARIA SERVICOS LTDA
    "63231837000161": 1000.00,  # ARCANA DESIGN LTDA
    "31332375000182": 20000.00,  # ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA
    "59160869000146": 50000.00,  # AURORA INFORMATICA COMERCIO IMPORTACAO E EXPORTACAO LTDA
    "41004473000144": 100000.00,  # AYKO HOLDING E PARTICIPACOES LTDA
    "10338682000109": 681509.00,  # VITORIA ON-LINE SERVICOS DE INTERNET LTDA
    "61215139000147": 150000.00,  # VIX LONAS LTDA
    "37297680000167": 10000.00,  # VIXSELL COMERCIO E SERVICO LTDA
    "09104418000113": 100000.00,  # VLA TELECOMUNICACOES LTDA
    "22542368000114": 100000.00,  # VOE TELECOMUNICACOES LTDA
    "30393954000172": 1000000.00,  # WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA
    "34263516000140": 10000.00,  # ZAD COMUNICA LTDA
    "52945020000139": 10000.00,  # ZEGBOX INDUSTRIA E COMERCIO DE EMBALAGENS LTDA
    "59580750000122": 100000.00,  # ZENA LRF TRADING LTDA
    "59267356000139": 5000.00,  # ZENITH GESTAO EMPRESARIAL LTDA
    "24203997000145": 2500.00,  # ZORZAL GESTAO E TECNOLOGIA LTDA
    "07452963000175": 2500.00,  # ZORZAL TECNOLOGIA E GESTAO LTDA
}

def limpar_cnpj(cnpj: str) -> str:
    """Remove formatação do CNPJ, deixando apenas números"""
    return re.sub(r'\D', '', cnpj)

def converter_capital_social(valor: str) -> float:
    """
    Converte valor de capital social de string para float
    Aceita formatos: "R$ 1.000,00", "1000.00", "1.000,00", etc.
    """
    if not valor or valor.strip() == '':
        return 0.0
    
    # Remover "R$" e espaços
    valor_limpo = valor.replace('R$', '').replace(' ', '').strip()
    
    # Se já for um número, retornar
    try:
        return float(valor_limpo)
    except ValueError:
        pass
    
    # Remover pontos (separadores de milhar) e substituir vírgula por ponto
    valor_limpo = valor_limpo.replace('.', '').replace(',', '.')
    
    try:
        return float(valor_limpo)
    except ValueError:
        print(f"⚠️  Erro ao converter valor: {valor}")
        return 0.0

def obter_config_mysql() -> Dict:
    """Obtém configuração do MySQL das variáveis de ambiente"""
    return {
        'host': os.getenv('MYSQL_HOST', 'localhost'),
        'port': int(os.getenv('MYSQL_PORT', '3306')),
        'user': os.getenv('MYSQL_USER', 'root'),
        'password': os.getenv('MYSQL_PASSWORD', ''),
        'database': os.getenv('MYSQL_DATABASE', 'dctf_web'),
    }

def ler_csv(caminho_csv: str) -> Dict[str, float]:
    """Lê arquivo CSV e retorna dicionário {CNPJ_LIMPO: Capital_Social}"""
    dados = {}
    try:
        with open(caminho_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                cnpj = limpar_cnpj(row.get('CNPJ', ''))
                capital_str = row.get('Capital_Social', '0')
                capital = converter_capital_social(capital_str)
                if cnpj and len(cnpj) == 14:
                    dados[cnpj] = capital
        print(f"📄 Lidos {len(dados)} registros do CSV: {caminho_csv}")
    except FileNotFoundError:
        print(f"⚠️  Arquivo CSV não encontrado: {caminho_csv}")
    except Exception as e:
        print(f"❌ Erro ao ler CSV: {e}")
    return dados

def atualizar_capital_social(dados: Dict[str, float], dry_run: bool = False):
    """Atualiza capital_social na tabela clientes usando dados fornecidos"""
    
    config = obter_config_mysql()
    
    if dry_run:
        print("🔍 MODO DRY-RUN: Nenhuma alteração será feita no banco\n")
    
    try:
        # Conectar ao MySQL
        print(f"🔌 Conectando ao MySQL: {config['host']}:{config['port']}/{config['database']}")
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor()
        
        print(f"✅ Conectado com sucesso!")
        print(f"📊 Processando {len(dados)} registros...\n")
        
        atualizados = 0
        nao_encontrados = []
        erros = []
        ja_atualizados = []
        
        for cnpj_limpo, capital_social in dados.items():
            try:
                # Verificar se o cliente existe
                cursor.execute(
                    "SELECT id, razao_social, capital_social FROM clientes WHERE cnpj_limpo = %s",
                    (cnpj_limpo,)
                )
                cliente = cursor.fetchone()
                
                if not cliente:
                    nao_encontrados.append(cnpj_limpo)
                    print(f"⚠️  Cliente não encontrado: {cnpj_limpo}")
                    continue
                
                cliente_id, razao_social, capital_atual = cliente
                
                # Verificar se já está atualizado
                capital_atual_num = float(capital_atual) if capital_atual else 0.0
                if abs(capital_atual_num - capital_social) < 0.01:
                    ja_atualizados.append((cnpj_limpo, razao_social, capital_social))
                    continue
                
                # Atualizar capital_social
                if not dry_run:
                    cursor.execute(
                        "UPDATE clientes SET capital_social = %s WHERE id = %s",
                        (capital_social, cliente_id)
                    )
                
                atualizados += 1
                capital_formatado = f"R$ {capital_social:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
                status = "🔍 [DRY-RUN]" if dry_run else "✅"
                print(f"{status} [{atualizados}] {razao_social[:50]:<50} | CNPJ: {cnpj_limpo} | Capital: {capital_formatado}")
                
            except Error as e:
                erros.append((cnpj_limpo, str(e)))
                print(f"❌ Erro ao atualizar {cnpj_limpo}: {e}")
        
        # Commit das alterações (se não for dry-run)
        if not dry_run:
            connection.commit()
            print(f"\n💾 Alterações commitadas no banco de dados")
        else:
            print(f"\n🔍 DRY-RUN: Nenhuma alteração foi feita")
        
        # Relatório final
        print("\n" + "="*80)
        print("📊 RELATÓRIO DE ATUALIZAÇÃO")
        print("="*80)
        print(f"✅ {'Simulados' if dry_run else 'Atualizados'} com sucesso: {atualizados}")
        print(f"ℹ️  Já estavam atualizados: {len(ja_atualizados)}")
        print(f"⚠️  Não encontrados: {len(nao_encontrados)}")
        print(f"❌ Erros: {len(erros)}")
        
        if nao_encontrados:
            print(f"\n⚠️  CNPJs não encontrados no banco:")
            for cnpj in nao_encontrados[:10]:  # Mostrar apenas os 10 primeiros
                print(f"   - {cnpj}")
            if len(nao_encontrados) > 10:
                print(f"   ... e mais {len(nao_encontrados) - 10} CNPJs")
        
        if erros:
            print(f"\n❌ Erros encontrados:")
            for cnpj, erro in erros[:5]:  # Mostrar apenas os 5 primeiros
                print(f"   - {cnpj}: {erro}")
            if len(erros) > 5:
                print(f"   ... e mais {len(erros) - 5} erros")
        
        print("="*80)
        
    except Error as e:
        print(f"❌ Erro ao conectar ao MySQL: {e}")
        sys.exit(1)
    
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals() and connection.is_connected():
            connection.close()
            print("\n🔌 Conexão fechada")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Atualiza capital_social na tabela clientes')
    parser.add_argument('--csv', type=str, help='Caminho para arquivo CSV com dados (CNPJ, Capital_Social)')
    parser.add_argument('--dry-run', action='store_true', help='Apenas simula, não atualiza o banco')
    
    args = parser.parse_args()
    
    print("🚀 Iniciando atualização de Capital Social...")
    print("="*80)
    
    # Carregar dados
    if args.csv:
        dados = ler_csv(args.csv)
        if not dados:
            print("⚠️  Nenhum dado válido encontrado no CSV. Usando dados do PDF como fallback.")
            dados = DADOS_PDF
    else:
        # Usar dados do PDF
        script_dir = Path(__file__).parent
        csv_path = script_dir / 'dados_capital_social.csv'
        if csv_path.exists():
            print(f"📄 Tentando ler CSV padrão: {csv_path}")
            dados = ler_csv(str(csv_path))
            if not dados:
                dados = DADOS_PDF
        else:
            dados = DADOS_PDF
    
    if not dados:
        print("❌ Nenhum dado disponível para processar!")
        sys.exit(1)
    
    atualizar_capital_social(dados, dry_run=args.dry_run)
    print("\n✅ Processo concluído!")

