"""
Script de Ingestão Inicial da Pasta DOCS
Processa todos os documentos da pasta SPED 2.0/DOCS e os indexa no sistema de conhecimento
"""

import os
import sys
import hashlib
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, date
import json

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from python.sped.v2.knowledge.document_parser import (
    PDFParser,
    DOCXParser,
    DocumentParser,
    ParsedDocument,
    DocumentMetadata,
)
from python.sped.v2.knowledge.chunking import IntelligentChunker, Chunk
from python.sped.v2.knowledge.rule_extractor import RuleExtractor, ExtractedRule

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ingest_docs.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class DocumentIngester:
    """Sistema de ingestão de documentos legais"""
    
    def __init__(
        self,
        docs_folder: str,
        db_config: Optional[Dict[str, Any]] = None,
        chunk_size: int = 1000,
        chunk_overlap: int = 200
    ):
        """
        Args:
            docs_folder: Caminho para a pasta DOCS
            db_config: Configuração do banco de dados (se None, usa padrão)
            chunk_size: Tamanho dos chunks
            chunk_overlap: Overlap entre chunks
        """
        self.docs_folder = Path(docs_folder)
        self.chunker = IntelligentChunker(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            preserve_sections=True,
            preserve_articles=True
        )
        self.rule_extractor = RuleExtractor()
        self.db_config = db_config or {}
        
        # Estatísticas
        self.stats = {
            'total_arquivos': 0,
            'processados': 0,
            'erros': 0,
            'duplicados': 0,
            'chunks_criados': 0,
            'regras_extraidas': 0,
            'inicio': datetime.now(),
        }
    
    def identify_document_type(self, filename: str) -> str:
        """
        Identifica o tipo de documento baseado no nome do arquivo
        
        Tipos: GUIA_PRATICO, ATO_COTEPE, CONVENIO, PORTARIA, NOTA_TECNICA
        """
        filename_lower = filename.lower()
        
        if 'guia' in filename_lower or 'guia pratico' in filename_lower:
            return 'GUIA_PRATICO'
        elif 'cotep' in filename_lower or 'ato cotep' in filename_lower:
            return 'ATO_COTEPE'
        elif 'convenio' in filename_lower or 'convênio' in filename_lower:
            return 'CONVENIO'
        elif 'portaria' in filename_lower:
            return 'PORTARIA'
        elif 'nota tecnica' in filename_lower or 'nt ' in filename_lower:
            return 'NOTA_TECNICA'
        else:
            return 'OUTRO'
    
    def extract_version_and_vigency(self, filename: str, metadata: DocumentMetadata) -> Tuple[Optional[str], Optional[date], Optional[date]]:
        """
        Extrai versão e vigência do nome do arquivo e metadados
        
        Retorna: (versao, vigencia_inicio, vigencia_fim)
        """
        versao = metadata.versao
        vigencia_inicio = metadata.vigencia_inicio
        vigencia_fim = metadata.vigencia_fim
        
        # Tentar extrair do nome do arquivo se não estiver nos metadados
        import re
        
        # Padrão para versão: v1.0, versão 2.3, v3, etc.
        if not versao:
            versao_match = re.search(r'[vV](?:ersão|ersao)?\s*(\d+(?:\.\d+)?)', filename)
            if versao_match:
                versao = versao_match.group(1)
        
        # Padrão para vigência: 2024, 2024-2025, vigente a partir de 01/01/2024, etc.
        if not vigencia_inicio:
            # Ano simples
            ano_match = re.search(r'\b(20\d{2})\b', filename)
            if ano_match:
                try:
                    vigencia_inicio = date(int(ano_match.group(1)), 1, 1)
                except:
                    pass
        
        return versao, vigencia_inicio, vigencia_fim
    
    def check_duplicate(self, file_hash: str) -> bool:
        """
        Verifica se o documento já foi ingerido (pelo hash)
        
        TODO: Implementar consulta ao banco de dados
        """
        # Por enquanto, retorna False (não é duplicado)
        # Em produção, consultar sped_v2_documents pelo hash_arquivo
        return False
    
    def save_document_to_db(self, parsed_doc: ParsedDocument, chunks: List[Chunk], rules: List[ExtractedRule]) -> Optional[int]:
        """
        Salva documento, chunks e regras no banco de dados
        
        Retorna: document_id ou None em caso de erro
        
        TODO: Implementar inserção no banco
        """
        # Por enquanto, apenas log
        logger.info(f"Salvando documento: {parsed_doc.metadata.documento_nome}")
        logger.info(f"  - Chunks: {len(chunks)}")
        logger.info(f"  - Regras: {len(rules)}")
        
        # Em produção:
        # 1. Inserir em sped_v2_documents
        # 2. Inserir chunks em sped_v2_document_chunks
        # 3. Inserir regras em sped_v2_legal_rules
        
        return 1  # Simulado
    
    def index_in_rag(self, document_id: int, chunks: List[Chunk]) -> bool:
        """
        Indexa chunks no sistema RAG (ChromaDB)
        
        TODO: Implementar indexação no ChromaDB
        """
        logger.info(f"Indexando {len(chunks)} chunks no RAG para documento {document_id}")
        
        # Em produção:
        # 1. Criar embeddings para cada chunk
        # 2. Adicionar ao ChromaDB com metadados
        
        return True
    
    def process_document(self, file_path: Path) -> Dict[str, Any]:
        """
        Processa um único documento
        
        Retorna: dict com resultado do processamento
        """
        resultado = {
            'arquivo': str(file_path),
            'sucesso': False,
            'erro': None,
            'document_id': None,
            'chunks': 0,
            'regras': 0,
        }
        
        try:
            logger.info(f"Processando: {file_path.name}")
            
            # 1. Identificar tipo de documento
            doc_type = self.identify_document_type(file_path.name)
            logger.info(f"  Tipo identificado: {doc_type}")
            
            # 2. Parsear documento
            parser = DocumentParser(str(file_path))
            parsed_doc = parser.parse()
            
            # 3. Extrair versão e vigência
            versao, vig_inicio, vig_fim = self.extract_version_and_vigency(
                file_path.name,
                parsed_doc.metadata
            )
            parsed_doc.metadata.versao = versao
            parsed_doc.metadata.vigencia_inicio = vig_inicio
            parsed_doc.metadata.vigencia_fim = vig_fim
            parsed_doc.metadata.documento_tipo = doc_type
            
            # 4. Verificar duplicata
            if self.check_duplicate(parsed_doc.metadata.hash_arquivo):
                logger.warning(f"  Documento duplicado (hash: {parsed_doc.metadata.hash_arquivo[:8]}...)")
                resultado['erro'] = 'Documento duplicado'
                self.stats['duplicados'] += 1
                return resultado
            
            # 5. Chunking
            logger.info(f"  Criando chunks...")
            chunks = self.chunker.chunk_document(parsed_doc)
            logger.info(f"  {len(chunks)} chunks criados")
            
            # 6. Extração de regras
            logger.info(f"  Extraindo regras...")
            rules = self.rule_extractor.extract_rules(parsed_doc, chunks)
            logger.info(f"  {len(rules)} regras extraídas")
            
            # 7. Salvar no banco
            document_id = self.save_document_to_db(parsed_doc, chunks, rules)
            if not document_id:
                raise Exception("Falha ao salvar no banco de dados")
            
            # 8. Indexar no RAG
            logger.info(f"  Indexando no RAG...")
            if not self.index_in_rag(document_id, chunks):
                logger.warning(f"  Falha ao indexar no RAG (continuando...)")
            
            # Sucesso
            resultado['sucesso'] = True
            resultado['document_id'] = document_id
            resultado['chunks'] = len(chunks)
            resultado['regras'] = len(rules)
            
            self.stats['processados'] += 1
            self.stats['chunks_criados'] += len(chunks)
            self.stats['regras_extraidas'] += len(rules)
            
            logger.info(f"  ✓ Processado com sucesso")
            
        except Exception as e:
            logger.error(f"  ✗ Erro ao processar: {str(e)}", exc_info=True)
            resultado['erro'] = str(e)
            self.stats['erros'] += 1
        
        return resultado
    
    def ingest_folder(self, folder_path: Optional[Path] = None) -> Dict[str, Any]:
        """
        Processa todos os documentos da pasta DOCS
        
        Retorna: relatório de ingestão
        """
        folder = folder_path or self.docs_folder
        
        if not folder.exists():
            raise FileNotFoundError(f"Pasta não encontrada: {folder}")
        
        logger.info(f"Iniciando ingestão da pasta: {folder}")
        logger.info("=" * 80)
        
        # Encontrar todos os arquivos suportados
        arquivos = []
        for ext in ['.pdf', '.docx', '.doc']:
            arquivos.extend(folder.rglob(f'*{ext}'))
        
        self.stats['total_arquivos'] = len(arquivos)
        logger.info(f"Encontrados {len(arquivos)} arquivos para processar")
        
        resultados = []
        
        # Processar cada arquivo
        for idx, arquivo in enumerate(arquivos, 1):
            logger.info(f"\n[{idx}/{len(arquivos)}] {arquivo.name}")
            resultado = self.process_document(arquivo)
            resultados.append(resultado)
        
        # Gerar relatório
        self.stats['fim'] = datetime.now()
        self.stats['duracao'] = (self.stats['fim'] - self.stats['inicio']).total_seconds()
        
        relatorio = self.generate_report(resultados)
        
        logger.info("\n" + "=" * 80)
        logger.info("INGESTÃO CONCLUÍDA")
        logger.info("=" * 80)
        logger.info(json.dumps(relatorio, indent=2, default=str))
        
        return relatorio
    
    def generate_report(self, resultados: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Gera relatório de ingestão"""
        
        sucessos = [r for r in resultados if r['sucesso']]
        erros = [r for r in resultados if not r['sucesso']]
        
        relatorio = {
            'estatisticas': {
                'total_arquivos': self.stats['total_arquivos'],
                'processados_com_sucesso': len(sucessos),
                'erros': len(erros),
                'duplicados': self.stats['duplicados'],
                'chunks_criados': self.stats['chunks_criados'],
                'regras_extraidas': self.stats['regras_extraidas'],
                'duracao_segundos': self.stats.get('duracao', 0),
            },
            'por_tipo': {},
            'erros_detalhados': [
                {
                    'arquivo': r['arquivo'],
                    'erro': r['erro']
                }
                for r in erros
            ],
            'sucessos': [
                {
                    'arquivo': r['arquivo'],
                    'document_id': r['document_id'],
                    'chunks': r['chunks'],
                    'regras': r['regras']
                }
                for r in sucessos
            ]
        }
        
        # Agrupar por tipo
        for resultado in sucessos:
            # Extrair tipo do caminho ou nome
            tipo = 'OUTRO'
            for tipo_doc in ['GUIA_PRATICO', 'ATO_COTEPE', 'CONVENIO', 'PORTARIA', 'NOTA_TECNICA']:
                if tipo_doc.lower() in resultado['arquivo'].lower():
                    tipo = tipo_doc
                    break
            
            if tipo not in relatorio['por_tipo']:
                relatorio['por_tipo'][tipo] = 0
            relatorio['por_tipo'][tipo] += 1
        
        return relatorio


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Ingerir documentos da pasta DOCS')
    parser.add_argument(
        '--docs-folder',
        type=str,
        default='SPED 2.0/DOCS',
        help='Caminho para a pasta DOCS (padrão: SPED 2.0/DOCS)'
    )
    parser.add_argument(
        '--chunk-size',
        type=int,
        default=1000,
        help='Tamanho dos chunks (padrão: 1000)'
    )
    parser.add_argument(
        '--chunk-overlap',
        type=int,
        default=200,
        help='Overlap entre chunks (padrão: 200)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='ingest_report.json',
        help='Arquivo de saída do relatório (padrão: ingest_report.json)'
    )
    
    args = parser.parse_args()
    
    # Criar ingester
    ingester = DocumentIngester(
        docs_folder=args.docs_folder,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap
    )
    
    # Executar ingestão
    try:
        relatorio = ingester.ingest_folder()
        
        # Salvar relatório
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(relatorio, f, indent=2, default=str, ensure_ascii=False)
        
        logger.info(f"\nRelatório salvo em: {args.output}")
        
        # Retornar código de saída baseado no resultado
        if relatorio['estatisticas']['erros'] > 0:
            sys.exit(1)
        else:
            sys.exit(0)
            
    except Exception as e:
        logger.error(f"Erro fatal na ingestão: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()

