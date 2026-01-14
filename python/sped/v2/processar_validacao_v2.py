"""
Script Python para processar validação SPED v2.0
Utiliza normalizadores e modelo canônico
"""

import sys
import json
import argparse
from pathlib import Path

# Adicionar caminho ao sys.path para imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sped.v2.normalization import XMLNormalizer, EFDNormalizer


def main():
    parser = argparse.ArgumentParser(description='Processar validação SPED v2.0')
    parser.add_argument('sped_path', type=str, help='Caminho do arquivo SPED')
    parser.add_argument('xml_dir', type=str, help='Caminho do diretório com XMLs')
    parser.add_argument('--validation-id', type=str, required=True, help='ID da validação')
    parser.add_argument('--output-dir', type=str, required=True, help='Diretório de saída')
    parser.add_argument('--segmento', type=str, help='Segmento do cliente')
    parser.add_argument('--regime', type=str, help='Regime tributário')
    parser.add_argument('--opera-st', action='store_true', help='Opera com ST')
    parser.add_argument('--regime-especial', action='store_true', help='Tem regime especial')
    parser.add_argument('--opera-interestadual-difal', action='store_true', help='Opera interestadual/DIFAL')
    
    args = parser.parse_args()
    
    sped_path = Path(args.sped_path)
    xml_dir = Path(args.xml_dir)
    output_dir = Path(args.output_dir)
    
    # Criar diretório de saída se não existir
    output_dir.mkdir(parents=True, exist_ok=True)
    
    resultado = {
        'validation_id': args.validation_id,
        'status': 'processing',
        'normalizacao': {},
        'validacoes': [],
        'erros': []
    }
    
    try:
        # Normalizar EFD
        print(f"[SPED v2] Normalizando EFD: {sped_path}")
        efd_normalizer = EFDNormalizer()
        documentos_efd = efd_normalizer.normalize_file(sped_path)
        
        resultado['normalizacao']['efd'] = {
            'total_documentos': len(documentos_efd),
            'documentos': [
                {
                    'chave_acesso': doc.chave_acesso,
                    'numero_documento': doc.numero_documento,
                    'serie': doc.serie,
                    'modelo': doc.modelo,
                    'cnpj_emitente': doc.cnpj_emitente,
                    'cnpj_destinatario': doc.cnpj_destinatario,
                    'valor_total': float(doc.valor_total),
                    'total_itens': len(doc.itens)
                }
                for doc in documentos_efd
            ]
        }
        
        # Normalizar XMLs
        print(f"[SPED v2] Normalizando XMLs: {xml_dir}")
        xml_normalizer = XMLNormalizer()
        documentos_xml = xml_normalizer.normalize_folder(xml_dir)
        
        resultado['normalizacao']['xml'] = {
            'total_documentos': len(documentos_xml),
            'documentos': [
                {
                    'chave_acesso': doc.chave_acesso,
                    'numero_documento': doc.numero_documento,
                    'serie': doc.serie,
                    'modelo': doc.modelo,
                    'cnpj_emitente': doc.cnpj_emitente,
                    'cnpj_destinatario': doc.cnpj_destinatario,
                    'valor_total': float(doc.valor_total),
                    'total_itens': len(doc.itens)
                }
                for doc in documentos_xml
            ]
        }
        
        # TODO: Implementar validações e matching
        # Por enquanto, apenas retornamos os dados normalizados
        
        resultado['status'] = 'completed'
        resultado['message'] = 'Validação concluída com sucesso'
        
    except Exception as e:
        resultado['status'] = 'error'
        resultado['erros'].append({
            'tipo': type(e).__name__,
            'mensagem': str(e)
        })
        print(f"[SPED v2] Erro: {e}", file=sys.stderr)
    
    # Salvar resultado
    resultado_path = output_dir / 'resultado.json'
    with open(resultado_path, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False, default=str)
    
    # Imprimir resultado JSON para stdout
    print(json.dumps(resultado, indent=2, ensure_ascii=False, default=str))
    
    sys.exit(0 if resultado['status'] == 'completed' else 1)


if __name__ == '__main__':
    main()


